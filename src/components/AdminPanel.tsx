import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

type Member = { id: string; email?: string; active: boolean; role?: string };

export default function AdminPanel({ myUid, notify }: {
  myUid: string;
  notify: (message: string, error?: boolean) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'members'), snapshot => {
      setMembers(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Member)));
      setLoading(false);
      setError('');
    }, err => {
      setError('Üyeler okunamadı: ' + err.message + '. Firestore kurallarını yayınladığından emin ol.');
      setLoading(false);
    });
  }, []);

  const sorted = useMemo(() => [...members].sort((a, b) =>
    (a.email || a.id).localeCompare(b.email || b.id, 'tr')), [members]);
  const activeCount = members.filter(m => m.active).length;
  const inactiveCount = members.length - activeCount;

  async function toggle(member: Member) {
    if (!db || member.id === myUid || member.role === 'admin') return;
    const next = !member.active;
    if (!window.confirm(`${member.email || member.id} için erişimi ${next ? 'açmak' : 'kapatmak'} istiyor musun?`)) return;
    setBusyId(member.id);
    try {
      await updateDoc(doc(db, 'members', member.id), {
        active: next,
        updatedAt: serverTimestamp(),
        updatedBy: myUid,
      });
      notify(next ? 'Kullanıcı erişimi açıldı.' : 'Kullanıcı erişimi kapatıldı.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erişim güncellenemedi.', true);
    } finally {
      setBusyId('');
    }
  }

  return <div className="admin-panel">
    <div className="admin-overview">
      <div className="admin-overview-item"><ShieldCheck size={21}/><div><strong>{members.length}</strong><small>Toplam kayıt</small></div></div>
      <div className="admin-overview-item"><UserCheck size={21}/><div><strong>{activeCount}</strong><small>Aktif kullanıcı</small></div></div>
      <div className="admin-overview-item"><UserX size={21}/><div><strong>{inactiveCount}</strong><small>İzin bekleyen / kapalı</small></div></div>
    </div>
    <section className="surface admin-section">
      <div className="section-heading"><div><h2>Kullanıcılar</h2><p>Yeni kayıtlar otomatik olarak kapalı gelir. Yalnızca onayladığın kişiler stok ve siparişlere erişir.</p></div></div>
      {loading && <div className="admin-empty"><LoaderCircle size={20} className="spin"/> Kullanıcılar yükleniyor...</div>}
      {error && <div className="error-banner">{error}</div>}
      {!loading && !error && !members.length && <div className="admin-empty">Henüz üye kaydı bulunmuyor.</div>}
      {!loading && !error && sorted.map(member => <div className="admin-row" key={member.id}>
        <div className="admin-person"><span className="admin-person-icon"><UserCheck size={18}/></span><div>
          <strong>{member.email || (member.id === myUid ? 'Benim hesabım' : 'E-posta henüz kaydedilmemiş')}</strong>
          <small>{member.id === myUid ? 'Sen · ' : ''}{member.role === 'admin' ? 'Yönetici · ' : 'Kullanıcı · '}UID: {member.id}</small>
        </div></div>
        <div className="admin-actions">
          <span className={`admin-status ${member.active ? 'enabled' : 'disabled'}`}>{member.active ? 'Aktif' : 'Kapalı'}</span>
          {(member.role === 'admin' || member.id === myUid)
            ? <span className="admin-fixed"><ShieldCheck size={15}/> Yönetici</span>
            : <button className={member.active ? 'btn btn-soft-danger' : 'btn btn-secondary'}
                disabled={Boolean(busyId)} onClick={() => toggle(member)}>
                {busyId === member.id ? <LoaderCircle size={16} className="spin"/> : member.active ? <UserX size={16}/> : <CheckCircle2 size={16}/>}
                {member.active ? 'Erişimi kapat' : 'Erişimi aç'}
              </button>}
        </div>
      </div>)}
    </section>
    <p className="admin-footnote">Bu liste Firestore'daki <code>members</code> kayıtlarını gösterir. E-posta/şifre hesapları Firebase Authentication'da tutulur. Erişimi kapatmak Authentication hesabını silmez. Eski kayıtlardaki eksik e-posta, kullanıcı bir sonraki giriş yaptığında otomatik tamamlanır.</p>
  </div>;
}
