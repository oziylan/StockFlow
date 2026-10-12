'use strict';

// StockFlow: all privileged Firebase Authentication operations run ONLY here.
// Never ship service account keys, Admin SDK, or credentials to the React app.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const firestore = getFirestore();
const auth = getAuth();
const REGION = 'europe-west1';
const options = { region: REGION, maxInstances: 4, memory: '256MiB' };
const MEMBERS = 'members';
const REQUESTS = 'accessRequests';
const ROLE_LOCK = firestore.doc('_system/adminRoleLock');

function fail(code, message) { throw new HttpsError(code, message); }
function string(input, field, min, max) {
  if (typeof input !== 'string') fail('invalid-argument', `${field} metin olmalı.`);
  const value = input.trim();
  if (value.length < min || value.length > max) fail('invalid-argument', `${field} uzunluğu geçersiz.`);
  return value;
}
function email(input) {
  const value = string(input, 'E-posta', 3, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('invalid-argument', 'Geçerli bir e-posta adresi gir.');
  return value;
}
function password(input) {
  const value = string(input, 'Şifre', 10, 128);
  if (/\s/.test(value)) fail('invalid-argument', 'Şifrede boşluk olmamalı.');
  return value;
}
function role(input) {
  if (input !== 'admin' && input !== 'member') fail('invalid-argument', 'Rol geçersiz.');
  return input;
}
function uid(input) { return string(input, 'UID', 8, 128); }
function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-argument', 'İstek geçersiz.');
  return value;
}
async function assertAdmin(request) {
  const caller = request.auth;
  if (!caller?.uid || caller.token?.firebase?.sign_in_provider !== 'password') {
    fail('unauthenticated', 'E-posta/şifre hesabıyla giriş yapmalısın.');
  }
  // Never trust client claims or a client-provided role.
  const [member, user] = await Promise.all([
    firestore.doc(`${MEMBERS}/${caller.uid}`).get(),
    auth.getUser(caller.uid).catch(() => null),
  ]);
  if (!user || user.disabled || !member.exists || member.get('active') !== true || member.get('role') !== 'admin') {
    fail('permission-denied', 'Bu işlemi yalnızca aktif yöneticiler yapabilir.');
  }
  return caller.uid;
}
function readableError(error) {
  if (error instanceof HttpsError) throw error;
  const code = String(error?.code || '');
  if (code.includes('email-already-exists')) fail('already-exists', 'Bu e-posta zaten kayıtlı.');
  if (code.includes('user-not-found')) fail('not-found', 'Firebase Authentication hesabı bulunamadı.');
  if (code.includes('invalid-email')) fail('invalid-argument', 'E-posta adresi geçersiz.');
  if (code.includes('invalid-password')) fail('invalid-argument', 'Şifre geçersiz.');
  // Do not leak backend internals to the client.
  console.error('StockFlow yönetim işlemi hata verdi:', error);
  fail('internal', 'İşlem gerçekleştirilemedi. Functions günlüklerini kontrol et.');
}

// Include both authenticated users AND old Firestore-only member docs.
// The latter appear as "authMissing" so the admin can remove obsolete records.
exports.adminListUsers = onCall(options, async (request) => {
  await assertAdmin(request);
  try {
    const records = [];
    let nextPageToken;
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      records.push(...page.users);
      nextPageToken = page.pageToken;
      if (records.length >= 5000) break;
    } while (nextPageToken);
    const members = await firestore.collection(MEMBERS).limit(5000).get();
    const memberMap = new Map(members.docs.map(doc => [doc.id, doc.data()]));
    const authMap = new Map(records.map(user => [user.uid, user]));
    const users = records.map(user => {
      const data = memberMap.get(user.uid) || {};
      return {
        uid: user.uid, email: user.email || data.email || '',
        displayName: user.displayName || '',
        active: data.active === true && !user.disabled,
        role: data.role === 'admin' ? 'admin' : 'member',
        emailVerified: Boolean(user.emailVerified),
        authDisabled: Boolean(user.disabled),
        hasMembership: memberMap.has(user.uid),
        authMissing: false,
        provider: user.providerData.some(p => p.providerId === 'password') || user.passwordHash ? 'password' : (user.email ? 'email' : 'anonymous'),
      };
    });
    for (const [id, data] of memberMap.entries()) {
      if (!authMap.has(id)) users.push({
        uid: id, email: data.email || '', displayName: '', active: false,
        role: data.role === 'admin' ? 'admin' : 'member',
        emailVerified: false, authDisabled: true,
        hasMembership: true, authMissing: true, provider: 'missing',
      });
    }
    users.sort((a,b) => (a.email || a.uid).localeCompare(b.email || b.uid, 'tr'));
    return { users, truncated: Boolean(nextPageToken || members.size === 5000) };
  } catch (error) { readableError(error); }
});

exports.adminCreateUser = onCall(options, async (request) => {
  const actor = await assertAdmin(request);
  const data = assertObject(request.data);
  const mail = email(data.email);
  const pass = password(data.password);
  const userRole = role(data.role);
  let created;
  try {
    created = await auth.createUser({ email: mail, password: pass, emailVerified: false, disabled: false });
    await firestore.doc(`${MEMBERS}/${created.uid}`).set({
      email: mail, active: true, role: userRole,
      addedAt: FieldValue.serverTimestamp(), addedBy: actor,
    });
    return { uid: created.uid };
  } catch (error) {
    // If adding the membership failed, do not leave an unintended login account.
    if (created) await auth.deleteUser(created.uid).catch(err => console.error('Rollback:',err));
    readableError(error);
  }
});

// Serialize role mutations with a transaction on a shared guard document.
// Two admins cannot simultaneously remove each other's last admin status.
async function saveMembershipRole(targetUid, userRole, actor, extras = {}) {
  await firestore.runTransaction(async tx => {
    const target = firestore.doc(`${MEMBERS}/${targetUid}`);
    const admins = firestore.collection(MEMBERS).where('role', '==', 'admin');
    const [lockSnap, adminSnap, memberSnap] = await Promise.all([
      tx.get(ROLE_LOCK), tx.get(admins), tx.get(target),
    ]);
    const oldRole = memberSnap.exists ? memberSnap.get('role') : null;
    const oldActive = memberSnap.exists && memberSnap.get('active') === true;
    const newActive = Object.prototype.hasOwnProperty.call(extras, 'active') ? extras.active : oldActive;
    const activeAdminCount = adminSnap.docs.filter(d => d.get('active') === true).length;
    if (oldRole === 'admin' && oldActive && (userRole !== 'admin' || !newActive) && activeAdminCount <= 1) {
      fail('failed-precondition', 'Son aktif yönetici kapatılamaz veya rolü düşürülemez.');
    }
    if (targetUid === actor && oldRole === 'admin' && (userRole !== 'admin' || !newActive)) {
      fail('failed-precondition', 'Kendi yönetici erişimini kapatamazsın.');
    }
    tx.set(ROLE_LOCK, { revision: (lockSnap.get('revision') || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(target, { ...extras, role: userRole, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor }, { merge: true });
  });
}

exports.adminUpdateUser = onCall(options, async (request) => {
  const actor = await assertAdmin(request);
  const data = assertObject(request.data);
  const targetUid = uid(data.uid);
  const changes = assertObject(data.changes);
  const allowedKeys = ['email', 'password', 'role', 'active'];
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !allowedKeys.includes(key))) fail('invalid-argument', 'Değişiklik alanları geçersiz.');
  if (targetUid === actor && ('active' in changes || 'email' in changes || 'password' in changes)) {
    fail('failed-precondition', 'Bu panelden kendi hesabının güvenlik bilgilerini değiştiremezsin.');
  }
  let user;
  try { user = await auth.getUser(targetUid); } catch (error) { readableError(error); }
  const existing = await firestore.doc(`${MEMBERS}/${targetUid}`).get();
  const nextRole = 'role' in changes ? role(changes.role) : (existing.get('role') === 'admin' ? 'admin' : 'member');
  const updateAuth = {};
  const updateMember = {};
  if ('email' in changes) {
    updateAuth.email = email(changes.email);
    updateAuth.emailVerified = false;
    updateMember.email = updateAuth.email;
  }
  if ('password' in changes) updateAuth.password = password(changes.password);
  if ('active' in changes) {
    if (typeof changes.active !== 'boolean') fail('invalid-argument', 'Erişim durumu geçersiz.');
    if (targetUid === actor && !changes.active) fail('failed-precondition', 'Kendi erişimini kapatamazsın.');
    updateAuth.disabled = !changes.active;
    updateMember.active = changes.active;
  }
  if (nextRole === 'admin' && user.providerData.length === 0 && !user.email) fail('failed-precondition', 'E-postasız hesap yönetici yapılamaz.');
  try {
    // Deny stock access in Firestore before disabling Authentication.
    // A failed Auth update can be retried by the admin from this panel.
    if (changes.active === false) {
      await saveMembershipRole(targetUid, nextRole, actor, updateMember);
      if (Object.keys(updateAuth).length) await auth.updateUser(targetUid, updateAuth);
    } else {
      if (Object.keys(updateAuth).length) await auth.updateUser(targetUid, updateAuth);
      await saveMembershipRole(targetUid, nextRole, actor, updateMember);
    }
    if ('password' in changes || 'active' in changes) await auth.revokeRefreshTokens(targetUid);
    return { ok: true };
  } catch (error) { readableError(error); }
});

exports.adminDeleteUser = onCall(options, async (request) => {
  const actor = await assertAdmin(request);
  const data = assertObject(request.data);
  const targetUid = uid(data.uid);
  if (targetUid === actor) fail('failed-precondition', 'Kendi hesabını silemezsin.');
  const targetRef = firestore.doc(`${MEMBERS}/${targetUid}`);
  let member;
  try {
    member = await targetRef.get();
    // An active admin may only be deleted if another active admin will remain.
    if (member.exists && member.get('role') === 'admin' && member.get('active') === true) {
      fail('failed-precondition', 'Yönetici hesabını silmeden önce rolünü Kullanıcı yap.');
    }
    // Remove stock access first: existing ID tokens cannot read data during Auth deletion.
    await Promise.all([
      targetRef.delete(),
      firestore.doc(`${REQUESTS}/${targetUid}`).delete(),
    ]);
    await auth.deleteUser(targetUid).catch(error => {
      if (error?.code !== 'auth/user-not-found') throw error;
    });
    return { ok: true };
  } catch (error) { readableError(error); }
});

exports.adminDecideRequest = onCall(options, async (request) => {
  const actor = await assertAdmin(request);
  const data = assertObject(request.data);
  const targetUid = uid(data.uid);
  const approve = data.approve;
  if (typeof approve !== 'boolean') fail('invalid-argument', 'Karar geçersiz.');
  try {
    const targetAuth = await auth.getUser(targetUid);
    if (approve && (!targetAuth.email || !targetAuth.emailVerified)) {
      fail('failed-precondition', 'Kullanıcının e-postası henüz doğrulanmamış.');
    }
    await firestore.runTransaction(async tx => {
      const requestRef = firestore.doc(`${REQUESTS}/${targetUid}`);
      const memberRef = firestore.doc(`${MEMBERS}/${targetUid}`);
      const [req, member] = await Promise.all([tx.get(requestRef), tx.get(memberRef)]);
      if (!req.exists || !['pending','rejected'].includes(req.get('status'))) fail('failed-precondition', 'İstek sonuçlandırılmış.');
      if (!approve && req.get('status') !== 'pending') fail('failed-precondition', 'İstek zaten reddedilmiş.');
      if (member.exists && member.get('role') === 'admin') fail('failed-precondition', 'Yönetici hesabı değiştirilemez.');
      if (approve && req.get('email') !== targetAuth.email) fail('failed-precondition', 'Başvuru e-postası değişmiş; önce doğrula.');
      if (approve) tx.set(memberRef, {
        active: true, role: 'member', email: targetAuth.email,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: actor,
      }, { merge: true });
      tx.update(requestRef, { status: approve ? 'approved' : 'rejected',
        resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actor });
    });
    return { ok: true };
  } catch (error) { readableError(error); }
});
