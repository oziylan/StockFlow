import {
  collection, doc, addDoc, getDocs, onSnapshot, runTransaction, writeBatch,
  setDoc, updateDoc, type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { INITIAL_PRODUCTS } from './seed';
import { matchesExisting } from './importExcel';
import { orderTotals, validQty } from './calc';
import type { AppData, NewOrder, NewProduct, Order, Product, StockRepository, DataListener, Adjustment } from './types';

const defaults: AppData = { products: [], orders: [], adjustments: [], settings: { cartonUnitCostCents: 50, seeded: false } };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const assertMoney = (n: number) => { if (!validQty(n) || n > 100_000_000_00) throw new Error('Fiyat geçersiz.'); };
function validateProduct(p: NewProduct) {
  if (!p.name.trim()) throw new Error('Ürün adı zorunludur.');
  if (!validQty(p.initialQuantity)) throw new Error('Stok adedi geçersiz.');
  assertMoney(p.unitCostCents); assertMoney(p.salePriceCents);
}
function cleanRef(value: string) { return value.trim().toLocaleLowerCase('tr-TR'); }
async function hashRef(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(cleanRef(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function verifyOrder(order: NewOrder) {
  if (!validQty(order.cartonCount)) throw new Error('Karton sayısı geçersiz.');
  if (!order.items.length) throw new Error('Sipariş için en az bir ürün seç.');
  const ids = new Set<string>();
  for (const item of order.items) {
    if (ids.has(item.productId)) throw new Error('Bir ürün siparişte iki kez eklenemez.');
    ids.add(item.productId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('Sipariş adedi en az 1 olmalı.');
    assertMoney(item.unitSalePriceCents);
  }
}
const newProductData = (input: NewProduct): Product => ({
  id: '', name: input.name.trim(), brand: input.brand.trim(), sku: input.sku.trim(),
  quantity: input.initialQuantity, totalQuantity: input.initialQuantity, sold: 0,
  unitCostCents: input.unitCostCents, salePriceCents: input.salePriceCents,
  archived: false, createdAt: Date.now(), updatedAt: Date.now()
});
function makeOrder(order: NewOrder, products: Product[], costCents: number, by: string, id: string): Order {
  const totals = orderTotals(order.items, products, order.cartonCount, costCents);
  return {
    id, reference: order.reference.trim(),
    items: order.items.map(l => {
      const p = products.find(p => p.id === l.productId);
      if (!p) throw new Error('Ürün bulunamadı.');
      if (p.archived) throw new Error(`${p.name} arşivlenmiş.`);
      if (p.quantity < l.quantity) throw new Error(`${p.name} için stok yetersiz. Kalan: ${p.quantity}`);
      return { productId: p.id, productName: p.name, quantity: l.quantity, unitCostCents: p.unitCostCents, unitSalePriceCents: l.unitSalePriceCents };
    }),
    cartonCount: order.cartonCount, cartonUnitCostCents: costCents,
    revenueCents: totals.revenueCents, grossProfitCents: totals.grossProfitCents,
    status: 'active', createdAt: Date.now(), createdBy: by
  };
}

class DemoRepository implements StockRepository {
  private value: AppData;
  private listeners = new Set<DataListener>();
  constructor() {
    let state: AppData | null = null;
    try { const text = localStorage.getItem('stockflow-demo-v1'); if (text) state = JSON.parse(text) as AppData; } catch { /* corrupted local data */ }
    this.value = state && Array.isArray(state.products) ? state : { ...defaults, products: INITIAL_PRODUCTS.map((p, index) => ({ ...newProductData(p), id: `demo-${index+1}` })), settings: { ...defaults.settings, seeded: true } };
  }
  subscribe(listener: DataListener): () => void { this.listeners.add(listener); listener(structuredClone(this.value)); return () => this.listeners.delete(listener); }
  private commit() { localStorage.setItem('stockflow-demo-v1', JSON.stringify(this.value)); this.listeners.forEach(l => l(structuredClone(this.value))); }
  async saveProduct(input: NewProduct, id?: string) {
    validateProduct(input);
    if (id) {
      const p = this.value.products.find(p => p.id === id); if (!p) throw new Error('Ürün bulunamadı.');
      Object.assign(p, { name: input.name.trim(), brand: input.brand.trim(), sku: input.sku.trim(), unitCostCents: input.unitCostCents, salePriceCents: input.salePriceCents, updatedAt: Date.now() });
    } else this.value.products.push({ ...newProductData(input), id: crypto.randomUUID() });
    this.commit();
  }
  async toggleArchive(id: string, archived: boolean) {
    const p = this.value.products.find(p => p.id === id); if (!p) throw new Error('Ürün bulunamadı.');
    p.archived = archived; p.updatedAt = Date.now(); this.commit();
  }
  async adjustStock(id: string, delta: number, note: string) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Geçerli bir stok miktarı gir.');
    const p = this.value.products.find(p => p.id === id); if (!p) throw new Error('Ürün bulunamadı.');
    if (p.quantity + delta < 0) throw new Error('Stok eksiye düşemez.');
    p.quantity += delta; p.totalQuantity += delta; p.updatedAt = Date.now();
    this.value.adjustments.unshift({ id: crypto.randomUUID(), productId: p.id, productName: p.name, delta, note, createdAt: Date.now(), createdBy: 'Demo kullanıcı' });
    this.commit();
  }
  async saveOrder(input: NewOrder) {
    verifyOrder(input);
    if (input.reference.trim() && this.value.orders.some(o => o.status === 'active' && cleanRef(o.reference) === cleanRef(input.reference))) throw new Error('Bu sipariş referansı zaten kullanılmış.');
    const order = makeOrder(input, this.value.products, this.value.settings.cartonUnitCostCents, 'Demo kullanıcı', crypto.randomUUID());
    for (const l of order.items) { const p = this.value.products.find(p => p.id === l.productId)!; p.quantity -= l.quantity; p.sold += l.quantity; }
    this.value.orders.unshift(order); this.commit();
  }
  async cancelOrder(id: string) {
    const o = this.value.orders.find(o => o.id === id); if (!o || o.status !== 'active') throw new Error('Aktif sipariş bulunamadı.');
    for (const l of o.items) { const p = this.value.products.find(p => p.id === l.productId); if (!p) throw new Error('Ürün kaydı bulunamadı.'); p.quantity += l.quantity; p.sold -= l.quantity; }
    o.status = 'canceled'; o.canceledAt = Date.now(); this.commit();
  }
  async updateCartonCost(price: number) { assertMoney(price); this.value.settings.cartonUnitCostCents = price; this.commit(); }
  async importProducts(items: NewProduct[]) {
    if (!items.length || items.length > 250) throw new Error('Aktarılacak ürün sayısı 1–250 arasında olmalı.');
    let added = 0;
    let skipped = 0;
    for (const item of items) {
      validateProduct(item);
      if (this.value.products.some(p => matchesExisting(p, item))) { skipped++; continue; }
      this.value.products.push({ ...newProductData(item), id: crypto.randomUUID() });
      added++;
    }
    if (added) this.commit();
    return { added, skipped };
  }
  async seedProducts() { if (this.value.products.length) throw new Error('Önce mevcut ürünleri kontrol et; liste boş değil.'); this.value.products = INITIAL_PRODUCTS.map(p => ({ ...newProductData(p), id: crypto.randomUUID() })); this.commit(); }
}

class FirestoreRepository implements StockRepository {
  private get database() { if (!db) throw new Error('Firebase yapılandırılmamış.'); return db; }
  constructor(private email: string) {}
  subscribe(listener: DataListener, onError: (e: Error) => void): Unsubscribe {
    const current: AppData = structuredClone(defaults);
    const notify = () => listener(structuredClone(current));
    const fail = (e: Error) => onError(e);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(this.database, 'products'), s => { current.products = s.docs.map(d => ({ ...d.data(), id: d.id } as Product)); notify(); }, fail),
      onSnapshot(collection(this.database, 'orders'), s => { current.orders = s.docs.map(d => ({ ...d.data(), id: d.id } as Order)).sort((a, b) => b.createdAt - a.createdAt); notify(); }, fail),
      onSnapshot(collection(this.database, 'adjustments'), s => { current.adjustments = s.docs.map(d => ({ ...d.data(), id: d.id } as Adjustment)).sort((a, b) => b.createdAt - a.createdAt); notify(); }, fail),
      onSnapshot(doc(this.database, 'settings', 'global'), s => { if (s.exists()) current.settings = { ...defaults.settings, ...s.data() }; notify(); }, fail)
    ];
    return () => unsubs.forEach(f => f());
  }
  async saveProduct(input: NewProduct, id?: string) {
    validateProduct(input);
    if (id) {
      const ref = doc(this.database, 'products', id);
      await updateDoc(ref, { name: input.name.trim(), brand: input.brand.trim(), sku: input.sku.trim(), unitCostCents: input.unitCostCents, salePriceCents: input.salePriceCents, updatedAt: Date.now() });
    } else {
      const { id: _unusedId, ...fields } = newProductData(input);
      void _unusedId;
      await addDoc(collection(this.database, 'products'), fields);
    }
  }
  async toggleArchive(id: string, archived: boolean) {
    await updateDoc(doc(this.database, 'products', id), { archived, updatedAt: Date.now() });
  }
  async adjustStock(id: string, delta: number, note: string) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Geçerli bir stok miktarı gir.');
    const pRef = doc(this.database, 'products', id);
    const aRef = doc(collection(this.database, 'adjustments'));
    await runTransaction(this.database, async tx => {
      const snapshot = await tx.get(pRef); if (!snapshot.exists()) throw new Error('Ürün bulunamadı.');
      const p = snapshot.data() as Product;
      if (p.quantity + delta < 0) throw new Error('Stok eksiye düşemez.');
      tx.update(pRef, { quantity: p.quantity + delta, totalQuantity: p.totalQuantity + delta, updatedAt: Date.now() });
      tx.set(aRef, { productId: id, productName: p.name, delta, note, createdBy: this.email, createdAt: Date.now() });
    });
  }
  async saveOrder(input: NewOrder) {
    verifyOrder(input);
    const refs = input.items.map(l => doc(this.database, 'products', l.productId));
    const orderRef = doc(collection(this.database, 'orders'));
    const refHash = input.reference.trim() ? await hashRef(input.reference) : null;
    const uniqueRef = refHash ? doc(this.database, 'orderRefs', refHash) : null;
    const settingsRef = doc(this.database, 'settings', 'global');
    await runTransaction(this.database, async tx => {
      // Firestore transaction kuralı: önce BÜTÜN okumalar, sonra yazmalar.
      const [settingsSnapshot, ...snapshots] = await Promise.all([tx.get(settingsRef), ...refs.map(r => tx.get(r))]);
      const existingRef = uniqueRef ? await tx.get(uniqueRef) : null;
      if (existingRef?.exists()) throw new Error('Bu sipariş referansı daha önce kaydedilmiş.');
      const products = snapshots.map((s, i) => {
        if (!s.exists()) throw new Error('Ürün artık mevcut değil.');
        return { ...s.data(), id: refs[i].id } as Product;
      });
      const cartonCostCents = settingsSnapshot.exists() ? Number(settingsSnapshot.data().cartonUnitCostCents ?? 50) : 50;
      const order = makeOrder(input, products, cartonCostCents, this.email, orderRef.id);
      order.items.forEach((l, i) => {
        const p = products[i];
        tx.update(refs[i], { quantity: p.quantity - l.quantity, sold: p.sold + l.quantity, updatedAt: Date.now() });
      });
      const { id: _unusedId, ...orderFields } = order; void _unusedId;
      tx.set(orderRef, orderFields);
      if (uniqueRef) tx.set(uniqueRef, { orderId: orderRef.id, reference: input.reference.trim() });
    });
  }
  async cancelOrder(id: string) {
    const orderRef = doc(this.database, 'orders', id);
    await runTransaction(this.database, async tx => {
      const os = await tx.get(orderRef);
      if (!os.exists() || os.data().status !== 'active') throw new Error('Sipariş zaten iptal edilmiş veya bulunamıyor.');
      const o = os.data() as Order;
      const refs = o.items.map(l => doc(this.database, 'products', l.productId));
      const ps = await Promise.all(refs.map(r => tx.get(r)));
      const uniqueRef = o.reference ? doc(this.database, 'orderRefs', await hashRef(o.reference)) : null;
      // uniqueRef kaldırma için okumaya gerek yok (delete).
      o.items.forEach((l, i) => {
        if (!ps[i].exists()) throw new Error('Ürün kaydı bulunamadı, işlem tamamlanamadı.');
        const p = ps[i].data() as Product;
        tx.update(refs[i], { quantity: p.quantity + l.quantity, sold: p.sold - l.quantity, updatedAt: Date.now() });
      });
      tx.update(orderRef, { status: 'canceled', canceledAt: Date.now() });
      if (uniqueRef) tx.delete(uniqueRef);
    });
  }
  async updateCartonCost(cents: number) { assertMoney(cents); await setDoc(doc(this.database, 'settings', 'global'), { cartonUnitCostCents: cents }, { merge: true }); }
  async importProducts(items: NewProduct[]) {
    if (!items.length || items.length > 250) throw new Error('Aktarılacak ürün sayısı 1–250 arasında olmalı.');
    for (const item of items) validateProduct(item);
    // Read live products again: the preview might be stale on another device.
    const existingDocs = await getDocs(collection(this.database, 'products'));
    const existing = existingDocs.docs.map(d => d.data() as Product);
    const unique: NewProduct[] = [];
    let skipped = 0;
    for (const item of items) {
      if ([...existing, ...unique].some(p => matchesExisting(p, item))) { skipped++; continue; }
      unique.push(item);
    }
    if (!unique.length) return { added: 0, skipped };
    // One atomic batch: no half-imported catalogue if a write fails.
    const batch = writeBatch(this.database);
    for (const item of unique) {
      const stableId = `excel_${await hashRef('product:' + item.name)}`;
      const ref = doc(this.database, 'products', stableId);
      const { id: _unusedId, ...fields } = newProductData(item); void _unusedId;
      batch.set(ref, fields);
    }
    await batch.commit();
    return { added: unique.length, skipped };
  }
  async seedProducts() {
    const settingsRef = doc(this.database, 'settings', 'global');
    const refs = INITIAL_PRODUCTS.map(() => doc(collection(this.database, 'products')));
    await runTransaction(this.database, async tx => {
      const s = await tx.get(settingsRef);
      if (s.exists() && s.data().seeded) throw new Error('Örnek ürünler daha önce yüklenmiş.');
      for (let i = 0; i < refs.length; i++) {
        const { id: _id, ...fields } = newProductData(INITIAL_PRODUCTS[i]); void _id;
        tx.set(refs[i], fields);
      }
      tx.set(settingsRef, { seeded: true, cartonUnitCostCents: s.exists() ? (s.data().cartonUnitCostCents ?? 50) : 50 }, { merge: true });
    });
  }
}
let demoRepository: DemoRepository | null = null;
export function getRepository(email?: string): StockRepository {
  if (email) return new FirestoreRepository(email);
  if (!demoRepository) demoRepository = new DemoRepository();
  return demoRepository;
}
export function friendlyError(error: unknown): string {
  const raw = message(error);
  if (raw.includes('permission-denied')) return 'Firebase izin hatası: kullanıcı üyeliğini ve Firestore güvenlik kurallarını kontrol et.';
  if (raw.includes('unavailable')) return 'İnternet bağlantısı yok veya Firebase şu anda erişilemiyor.';
  return raw;
}
