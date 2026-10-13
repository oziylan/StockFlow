import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight,
  BarChart3, Box, Check, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Cloud, Download, Edit3, FileSpreadsheet,
  Home, Info, LoaderCircle, LockKeyhole, LogOut, Menu, Minus,
  Package, PackageCheck, PackagePlus, Plus, RotateCcw, Search, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Trash2, Truck, Sun, Moon, Monitor,
  TrendingUp, UserRound, Wallet, X, type LucideIcon
} from 'lucide-react';
import { browserLocalPersistence, createUserWithEmailAndPassword, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, configured, db } from './lib/firebase';
import { getRepository, friendlyError } from './lib/repository';
import { byProduct, dateTime, eur, moneyInput, num, orderTotals, parseMoney, stats, validQty } from './lib/calc';
import { exportExcel } from './lib/exportExcel';
import type { AppData, NewOrderLine, Order, Product, StockRepository } from './lib/types';
import AdminPanel from './components/AdminPanel';
import AccessRequest from './components/AccessRequest';
import ExcelImport from './components/ExcelImport';
import { useI18n } from './i18n';
import LanguageSelect from './i18n/LanguageSelect';
import { useTheme } from './theme/ThemeProvider';
import './shipping.css';

type Page = 'dashboard' | 'products' | 'orders' | 'settings' | 'admin';
type Toast = { id: number; message: string; error?: boolean };
const nav: { key: Page; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Ana Sayfa', icon: Home },
  { key: 'products', label: 'Ürünler', icon: Package },
  { key: 'orders', label: 'Siparişler', icon: ShoppingBag },
  { key: 'settings', label: 'Ayarlar', icon: Settings }
];
const emptyData: AppData = { products: [], orders: [], adjustments: [], settings: { cartonUnitCostCents: 50, shippingUnitCostCents: 360, seeded: false } };

function Login({ onLoginError }: { onLoginError: (msg: string) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!auth) return;
    setBusy(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      if (register) {
        if (password.length < 6) throw new Error(t("Şifre en az 6 karakter olmalı."));
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        // Yeni kullanıcının Firestore üyelik kaydı oturum dinleyicisi tarafından
        // yalnızca active:false olarak açılır; admin onayı olmadan stok erişimi yoktur.
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      onLoginError(raw.includes('email-already-in-use') ? t("Bu e-posta zaten kayıtlı. Giriş yapabilirsin.")
        : raw.includes('weak-password') ? t("Daha güçlü bir şifre seç.")
        : raw.includes('operation-not-allowed') ? t("Firebase Authentication içinde E-posta/Şifre yöntemini aç.")
        : raw === t('Şifre en az 6 karakter olmalı.') ? raw
        : register ? t("Hesap oluşturulamadı. E-posta ve şifreyi kontrol et.") : t("E-posta veya şifre hatalı."));
    } finally { setBusy(false); }
  }
  return <div className="login-page"><ThemeToggle floating/><div className="login-card">
    <Logo dark={false} />
    <div className="auth-language"><LanguageSelect compact /></div>
    <div className="login-illustration"><div className="login-illustration-inner"><PackageCheck size={46}/></div></div>
    <h1>{register ? t("StockFlow hesabı oluştur") : t("Tekrar hoş geldin")}</h1>
    <p>{register ? t("E-posta/şifreyle kaydol. Yönetici onaylayana kadar stoklara erişemezsin.") : t("Stoklarını, siparişlerini ve kârını tek yerden yönet.")}</p>
    <form onSubmit={submit} className="form-stack">
      <label>{t("E-posta adresi")}<input type="email" autoComplete="email" required placeholder="ornek@firma.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>{t("Şifre")}<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 6 : undefined} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="btn btn-primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <LockKeyhole size={17}/>} {register ? t("Hesap oluştur") : t("Güvenli giriş yap")}</button>
    </form>
    <button className="auth-switch" type="button" onClick={() => { setRegister(v => !v); onLoginError(''); }}>
      {register ? t("Zaten hesabın var mı? Giriş yap") : t("Yeni misin? Hesap oluştur ve erişim iste")}
    </button>
    <small>{t("Yeni hesaplar yönetici onayı olmadan stok ve siparişlere erişemez.")}</small>
  </div></div>;
}
function Logo({ dark = true }: { dark?: boolean }) {
  return <div className={`brand ${dark ? 'brand-dark' : 'brand-light'}`}><span className="brand-symbol"><Box size={23} strokeWidth={2.5}/></span><span>Stock<span className="brand-lightweight">Flow</span></span></div>;
}
function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return <button type="button" className={`theme-toggle ${floating ? 'theme-toggle-floating' : ''}`}
    onClick={toggleTheme} aria-label={t(isDark ? 'Gündüz moduna geç' : 'Gece moduna geç')}
    title={t(isDark ? 'Gündüz moduna geç' : 'Gece moduna geç')}>
    {isDark ? <Sun size={20} aria-hidden="true"/> : <Moon size={20} aria-hidden="true"/>}
  </button>;
}
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return <div className="toast-stack" role="status">{toasts.map(t => <div className={`toast ${t.error ? 'toast-error' : ''}`} key={t.id}>{t.error ? <Info size={18}/> : <CheckCircle2 size={18}/>}<span>{t.message}</span></div>)}</div>;
}
function Card({ icon: Icon, label, value, subtitle, color = 'blue' }: { icon: LucideIcon; label: string; value: string; subtitle?: string; color?: string }) {
  return <div className="kpi"><div className={`kpi-icon ${color}`}><Icon size={23}/></div><div className="kpi-text"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{subtitle && <div className="kpi-subtitle">{subtitle}</div>}</div></div>;
}
function ProductVisual({ name, index = 0 }: { name: string; index?: number }) {
  const isTissue = /towel|havlu|kağıdı|paper|wipe|mendil/i.test(name);
  return <div className={`product-icon product-icon-${index % 4}`}>{isTissue ? <Package size={19} strokeWidth={1.8}/> : <Box size={19} strokeWidth={1.8}/>}</div>;
}
function Summary({ data }: { data: AppData }) {
  const { t } = useI18n();
  const s = stats(data);
  return <div className="kpi-grid">
    <Card icon={Box} label={t("Toplam stok")} value={num(s.total)} subtitle={t("Giriş ve düzeltmeler dahil")} color="blue"/>
    <Card icon={ShoppingCart} label={t("Satılan")} value={num(s.sold)} subtitle={t("Aktif siparişler")} color="mint"/>
    <Card icon={PackageCheck} label={t("Kalan")} value={num(s.remaining)} subtitle={t("Depodaki ürünler")} color="amber"/>
    <Card icon={TrendingUp} label={t("Brüt kâr")} value={eur(s.grossProfitCents)} subtitle={t("Karton ve kargo öncesi")} color="teal"/>
  </div>;
}
function ProductsTable({ data, onEdit, onStock, compact = false, query, onQueryChange }: { data: AppData; onEdit: (p: Product) => void; onStock: (p: Product) => void; compact?: boolean; query: string; onQueryChange: (q:string)=>void }) {
  const { t } = useI18n();
  const totals = useMemo(() => byProduct(data), [data]);
  const [showArchived, setShowArchived] = useState(false);
  const products = data.products.filter(p => (showArchived || !p.archived) && [p.name, p.brand, p.sku].join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))).sort((a,b) => a.name.localeCompare(b.name));
  return <>
    <div className="section-toolbar"><div className="table-search"><Search size={17}/><input aria-label={t("Ürün ara")} placeholder={t("Ürün ara...")} value={query} onChange={e => onQueryChange(e.target.value)}/></div>
    <label className="checkbox-line"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/> {t("Arşivdekiler")}</label></div>
    <div className="table-scroll"><table className="product-table"><thead><tr><th>{t("Ürün adı")}</th><th>{t("Toplam adet")}</th><th>{t("Ürün maliyeti (kargo hariç)")}</th><th>{t("Satış fiyatı")}</th><th>{t("Satılan")}</th><th>{t("Kalan")}</th><th>{t("Satış tutarı")}</th><th>{t("Brüt kâr")}</th><th></th></tr></thead>
      <tbody>{products.map((p, i) => { const productTotals = totals.get(p.id); return <tr key={p.id} className={p.archived ? 'archived-row' : ''}>
        <td><div className="product-cell"><ProductVisual name={p.name} index={i}/><div><strong>{p.name}</strong>{(p.brand || p.sku || p.archived) && <small>{[p.brand, p.sku, p.archived ? t("Arşiv") : ''].filter(Boolean).join(' · ')}</small>}</div></div></td>
        <td>{num(p.totalQuantity)}</td><td>{eur(p.unitCostCents)}</td><td>{eur(p.salePriceCents)}</td><td>{num(p.sold)}</td><td><span className={p.quantity < 5 ? 'low-stock' : ''}>{num(p.quantity)}</span></td><td>{eur(productTotals?.revenueCents || 0)}</td><td className="profit-cell">{eur(productTotals?.grossProfitCents || 0)}</td>
        <td><div className="row-actions"><button aria-label={`${p.name} düzenle`} title={t("Düzenle")} className="icon-button small" onClick={() => onEdit(p)}><Edit3 size={16}/></button><button aria-label={`${p.name} stok güncelle`} title={t("Stok değiştir")} className="icon-button small" onClick={() => onStock(p)}><PackagePlus size={17}/></button></div></td>
      </tr>; })}</tbody></table>{!products.length && <div className="empty-table"><Package size={24}/><p>{compact ? t("Henüz kayıt yok.") : t("Aramana uygun ürün bulunamadı.")}</p></div>}</div>
  </>;
}
function OrdersList({ data, onCancel, limit }: { data: AppData; onCancel: (o: Order) => void; limit?: number }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const orders = limit ? data.orders.slice(0, limit) : data.orders;
  return <div className="table-scroll"><table className="orders-table"><thead><tr><th>{t("Tarih")}</th><th>{t("Referans")}</th><th>{t("Ürün adedi")}</th><th>{t("Satış tutarı")}</th><th>{t("Karton")}</th><th>{t("Durum")}</th><th></th></tr></thead><tbody>
  {orders.map(o => <Fragment key={o.id}>
    <tr key={o.id} className={o.status === 'canceled' ? 'archived-row' : ''}><td className="muted-col">{dateTime(o.createdAt)}</td><td><strong>{o.reference || `#${o.id.slice(0, 8)}`}</strong></td><td>{num(o.items.reduce((n,l)=>n+l.quantity,0))}</td><td>{eur(o.revenueCents)}</td><td>{o.cartonCount}</td><td><span className={`status-pill ${o.status === 'active' ? 'status-done' : 'status-canceled'}`}>{o.status === 'active' ? t("Kaydedildi") : t("İptal")}</span></td><td><button className="icon-button small" aria-label={t("Detayları göster")} onClick={()=>setExpanded(expanded===o.id?null:o.id)}><ChevronDown size={16}/></button></td></tr>
    {expanded === o.id && <tr key={`${o.id}-details`}><td colSpan={7}><div className="order-detail"><div><strong>{t("Sipariş içeriği")}</strong>{o.items.map((l, i)=><div className="order-detail-line" key={i}><span>{l.productName} × {l.quantity}</span><span>{eur(l.unitSalePriceCents)} / {t("adet")}</span><strong>{eur(l.unitSalePriceCents*l.quantity)}</strong></div>)}<div className="order-detail-line"><span>{t("Karton gideri")}</span><span>{o.cartonCount} × {eur(o.cartonUnitCostCents)}</span><strong>{eur(o.cartonCount*o.cartonUnitCostCents)}</strong></div><div className="order-detail-line"><span>{t("Kargo gideri")}</span><span>{o.shippingParcelCount ?? 0} × {eur(o.shippingUnitCostCents ?? 0)}</span><strong>{eur((o.shippingParcelCount ?? 0)*(o.shippingUnitCostCents ?? 0))}</strong></div></div><div className="order-detail-side"><span>{t("Brüt kâr")} <strong>{eur(o.grossProfitCents)}</strong></span><span>{t("Karton ve kargo sonrası kâr")} <strong>{eur(o.grossProfitCents-o.cartonCount*o.cartonUnitCostCents-(o.shippingParcelCount ?? 0)*(o.shippingUnitCostCents ?? 0))}</strong></span><small>{t("Kaydeden:")} {o.createdBy}</small>{o.status==='active' && <button className="btn btn-soft-danger" onClick={()=>onCancel(o)}><RotateCcw size={15}/> {t("Siparişi iptal et")}</button>}</div></div></td></tr>}
  </Fragment>)}</tbody></table>{!orders.length && <div className="empty-table"><ClipboardList size={26}/><p>{t("Henüz sipariş kaydedilmedi.")}</p></div>}</div>;
}
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(()=>{ const cb=(e: KeyboardEvent)=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',cb); return()=>window.removeEventListener('keydown',cb); },[onClose]);
  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t("Kapat")}><X size={19}/></button></header><div className="dialog-body">{children}</div></div></div>;
}
function ProductEditor({ product, onClose, repo, notify }: { product: Product | null; onClose: ()=>void; repo: StockRepository; notify: (msg:string, error?:boolean)=>void }) {
  const { t } = useI18n();
  const [name, setName] = useState(product?.name || '');
  const [brand, setBrand] = useState(product?.brand || '');
  const [sku, setSku] = useState(product?.sku || '');
  const [qty, setQty] = useState(product?.quantity.toString() || '0');
  const [cost, setCost] = useState(moneyInput(product?.unitCostCents || 0));
  const [price, setPrice] = useState(moneyInput(product?.salePriceCents || 0));
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); const c=parseMoney(cost), p=parseMoney(price), q=Number(qty);
    if (!name.trim() || !validQty(c) || !validQty(p) || (!product && !validQty(q))) return notify(t("Ürün bilgilerini kontrol et."),true);
    setBusy(true);
    try { await repo.saveProduct({ name, brand, sku, initialQuantity: product ? product.quantity : q, unitCostCents: c, salePriceCents:p }, product?.id); notify(product?t("Ürün güncellendi."):t("Ürün eklendi.")); onClose(); }
    catch(err){notify(friendlyError(err), true);} finally {setBusy(false);}
  }
  return <Modal title={product?t("Ürünü düzenle"):t("Yeni ürün ekle")} onClose={onClose}><form className="form-stack" onSubmit={submit}>
    <label>{t("Ürün adı *")}<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder={t("Örn: Tuvalet kağıdı 32×3")} required/></label>
    <div className="two-cols"><label>{t("Marka (isteğe bağlı)")}<input value={brand} onChange={e=>setBrand(e.target.value)} placeholder={t("Marka adı")}/></label><label>{t("SKU / EAN (isteğe bağlı)")}<input value={sku} onChange={e=>setSku(e.target.value)} placeholder={t("Barkod veya stok kodu")}/></label></div>
    {!product && <label>{t("Başlangıç stok adedi *")}<input inputMode="numeric" type="number" min={0} step={1} value={qty} onChange={e=>setQty(e.target.value)} required/></label>}
    {product && <p className="field-note"><Info size={16}/> {t("Stok miktarı ayrı “Stok değiştir” işleminden güncellenir. Böylece hareketin kaydı tutulur.")}</p>}
    <div className="two-cols"><label>{t("Ürün maliyeti, kargo hariç (€) *")}<input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} required/></label><label>{t("Varsayılan satış (€) *")}<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} required/></label></div>
    <p className="field-note"><ShieldCheck size={16}/> {t("Fiyat değişikliği önceki siparişlerin cirosunu ve kârını değiştirmez.")}</p>
    <div className="form-actions">{product&&<button type="button" className="btn btn-soft-danger" disabled={busy} onClick={async()=>{setBusy(true);try{await repo.toggleArchive(product.id,!product.archived);notify(product.archived?t("Ürün yeniden aktif."):t("Ürün arşivlendi."));onClose();}catch(err){notify(friendlyError(err),true)}finally{setBusy(false)}}}>{product.archived?t("Aktifleştir"):t("Arşivle")}</button>}<button type="button" onClick={onClose} className="btn btn-secondary">{t("Vazgeç")}</button><button disabled={busy} className="btn btn-primary">{busy?<LoaderCircle className="spin" size={16}/>:<Check size={17}/>} {t("Kaydet")}</button></div>
  </form></Modal>;
}
function StockEditor({ product, onClose, repo, notify }: {product: Product; onClose: ()=>void; repo: StockRepository; notify: (msg:string, error?:boolean)=>void}) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<'add'|'remove'>('add'); const [count,setCount] = useState('1'); const [note,setNote]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e: FormEvent){e.preventDefault();const q=Number(count);if(!validQty(q)||!q)return notify(t("Pozitif tam sayı gir."),true);setBusy(true);try {await repo.adjustStock(product.id,direction==='add'?q:-q,note);notify(t("Stok başarıyla güncellendi."));onClose();}catch(err){notify(friendlyError(err),true);}finally{setBusy(false);}}
  return <Modal title={t("Stok değiştir")} onClose={onClose}><form onSubmit={submit} className="form-stack"><div className="stock-item"><ProductVisual name={product.name}/><div><strong>{product.name}</strong><small>{t("Güncel stok:")} {num(product.quantity)} {t("adet")}</small></div></div><div className="segmented"><button type="button" className={direction==='add'?'active':''} onClick={()=>setDirection('add')}><Plus size={16}/> {t("Stok ekle")}</button><button type="button" className={direction==='remove'?'active':''} onClick={()=>setDirection('remove')}><Minus size={16}/> {t("Stok çıkar")}</button></div><label>{t("Adet")}<input type="number" min={1} step={1} value={count} onChange={e=>setCount(e.target.value)} required/></label><label>{t("Not (isteğe bağlı)")}<input placeholder={t("Örn: Yeni sevkiyat, hasarlı ürün...")} value={note} onChange={e=>setNote(e.target.value)}/></label><p className="field-note"><Info size={16}/> {t("Sipariş satışlarını buradan girme. Sipariş kaydettiğinde stok zaten otomatik azalır.")}</p><button className="btn btn-primary full" disabled={busy}>{t("Stok hareketini kaydet")}</button></form></Modal>;
}
function OrderCreator({data,repo,onClose,notify}: {data: AppData;repo:StockRepository;onClose:()=>void;notify:(msg:string,error?:boolean)=>void}) {
  const { t } = useI18n();
  const [reference,setReference]=useState(''); const [cartons,setCartons]=useState(1); const [parcels,setParcels]=useState(1);
  const [items,setItems]=useState<NewOrderLine[]>([]); const [query,setQuery]=useState(''); const [busy,setBusy]=useState(false);
  const [showPicker,setShowPicker]=useState(true);
  const [priceDrafts,setPriceDrafts]=useState<Record<string,string>>({});
  const available = data.products.filter(p=>!p.archived && [p.name,p.brand,p.sku].join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')) && !items.some(l=>l.productId===p.id)).slice(0,20);
  const rows = items.map(l=>({item:l,product:data.products.find(p=>p.id===l.productId)})).filter((r): r is {item:NewOrderLine;product:Product} => Boolean(r.product));
  const totals = orderTotals(items,data.products,cartons,data.settings.cartonUnitCostCents,parcels,data.settings.shippingUnitCostCents ?? 360);
  const add=(p:Product)=>{setItems(prev=>[...prev,{productId:p.id,quantity:1,unitSalePriceCents:p.salePriceCents}]);setQuery('');setShowPicker(false);};
  const commitPrice=(id:string)=>{const v=priceDrafts[id];if(v===undefined)return;const cents=parseMoney(v);if(validQty(cents))update(id,{unitSalePriceCents:cents});else notify(t("Geçerli bir satış fiyatı gir."),true);setPriceDrafts(d=>{const next={...d};delete next[id];return next});};
  const update=(id:string,changes:Partial<NewOrderLine>)=>setItems(prev=>prev.map(l=>l.productId===id?{...l,...changes}:l));
  async function submit(){if(!items.length)return notify(t("En az bir ürün seç."),true);if(items.some(l=>l.quantity<1||!Number.isSafeInteger(l.quantity)||!validQty(l.unitSalePriceCents)))return notify(t("Adetleri ve fiyatları kontrol et."),true);if(!validQty(cartons))return notify(t("Karton sayısı geçersiz."),true);if(!validQty(parcels))return notify(t("Paket sayısı geçersiz."),true);setBusy(true);try{await repo.saveOrder({reference,items,cartonCount:cartons,shippingParcelCount:parcels});notify(t("Sipariş kaydedildi; stoklar güncellendi."));onClose();}catch(err){notify(friendlyError(err),true)}finally{setBusy(false)}}
  return <div className="order-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="order-sheet" role="dialog" aria-modal="true" aria-label={t("Yeni sipariş")}><header className="order-head"><button className="icon-button" onClick={onClose} aria-label={t("Geri")}><ArrowLeft size={20}/></button><h2>{t("Yeni Sipariş")}</h2><button className="icon-button" onClick={onClose} aria-label={t("Kapat")}><X size={20}/></button></header>
    <div className="order-content"><label className="order-reference">{t("Sipariş referansı")} <small>{t("(isteğe bağlı)")}</small><input value={reference} onChange={e=>setReference(e.target.value)} placeholder={t("Bol.com referansı veya sipariş no")}/></label>
    <div className="order-search"><Search size={18}/><input value={query} placeholder={t("Ürün ara...")} onFocus={()=>setShowPicker(true)} onChange={e=>{setQuery(e.target.value);setShowPicker(true)}} /></div>
    {showPicker && <div className="picker-list">{available.map(p=><button className="picker-product" key={p.id} onClick={()=>add(p)}><ProductVisual name={p.name}/><span><strong>{p.name}</strong><small>{t("Stok:")} {p.quantity} · {eur(p.salePriceCents)}</small></span><Plus size={18}/></button>)}{!available.length&&<div className="picker-empty">{t("Eklenebilecek ürün bulunamadı.")}</div>}</div>}
    {rows.length>0 && <div className="order-lines"><h3>{t("Seçilen ürünler")}</h3>{rows.map(({item:l,product:p},i)=><div className="order-line" key={p.id}><div className="order-line-top"><ProductVisual name={p.name} index={i}/><div className="order-line-title"><strong>{p.name}</strong><small>{t("Stok:")} {p.quantity} {t("adet")}</small></div><button className="icon-button small" title={t("Ürünü kaldır")} onClick={()=>setItems(prev=>prev.filter(x=>x.productId!==p.id))}><Trash2 size={17}/></button></div><div className="order-line-controls"><div className="qty-controls"><button aria-label={t("Azalt")} onClick={()=>update(p.id,{quantity:Math.max(1,l.quantity-1)})}><Minus size={15}/></button><input aria-label={t("Adet")} inputMode="numeric" type="number" min={1} step={1} value={l.quantity} onChange={e=>update(p.id,{quantity:Number(e.target.value)})}/><button aria-label={t("Artır")} onClick={()=>update(p.id,{quantity:l.quantity+1})}><Plus size={15}/></button></div><label className="price-field">{t("Fiyat (€)")}<input aria-label={t("Birim satış fiyatı")} inputMode="decimal" value={priceDrafts[p.id]??moneyInput(l.unitSalePriceCents)} onChange={e=>setPriceDrafts(v=>({...v,[p.id]:e.target.value}))} onBlur={()=>commitPrice(p.id)}/></label><strong className="line-total">{eur(l.unitSalePriceCents*l.quantity)}</strong></div>{l.quantity>p.quantity&&<small className="form-error">{t("Yetersiz stok:")} {p.quantity} {t("mevcut.")}</small>}</div>)}</div>}
    {!rows.length && !showPicker && <div className="empty-order"><ShoppingCart size={33}/><h3>{t("Sipariş henüz boş")}</h3><p>{t("Arama kutusundan ürün ekleyerek başla.")}</p></div>}
    {rows.length>0 && <button className="add-another" onClick={()=>setShowPicker(true)}><Plus size={17}/> {t("Başka ürün ekle")}</button>}
    <section className="order-extra-costs" role="group" aria-label={`${t("Karton gideri")} / ${t("Kargo gideri")}`}><div className="carton-row"><div className="carton-icon"><Box size={21}/></div><div className="carton-copy"><strong>{t("Kullanılan karton")}</strong><small>{eur(data.settings.cartonUnitCostCents)} {t("/ karton")}</small></div><div className="qty-controls"><button aria-label={t("Karton azalt")} onClick={()=>setCartons(v=>Math.max(0,v-1))}><Minus size={15}/></button><span>{cartons}</span><button aria-label={t("Karton artır")} onClick={()=>setCartons(v=>v+1)}><Plus size={15}/></button></div></div>
    <div className="carton-row shipping-row"><div className="carton-icon"><Truck size={21}/></div><div className="carton-copy"><strong>{t("Gönderilen kargo paketi")}</strong><small>{eur(data.settings.shippingUnitCostCents ?? 360)} / {t("paket")} · {t("Aynı pakette birden fazla ürün olabilir")}</small></div><div className="qty-controls"><button aria-label={t("Paket azalt")} onClick={()=>setParcels(v=>Math.max(0,v-1))}><Minus size={15}/></button><span>{parcels}</span><button aria-label={t("Paket artır")} onClick={()=>setParcels(v=>v+1)}><Plus size={15}/></button></div></div></section>
      <div className="order-total"><div><span>{t("Toplam satış tutarı")}</span><strong>{eur(totals.revenueCents)}</strong></div><div><span>{t("Brüt kâr")}</span><strong>{eur(totals.grossProfitCents)}</strong></div><div><span>{t("Karton gideri")}</span><strong>− {eur(totals.cartonCostCents)}</strong></div><div><span>{t("Kargo gideri")}</span><strong>− {eur(totals.shippingCostCents)}</strong></div><div className="grand-total"><span>{t("Karton ve kargo sonrası kâr")}</span><strong>{eur(totals.netProfitCents)}</strong></div></div>
    </div><footer className="order-footer"><button className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("Vazgeç")}</button><button className="btn btn-primary" onClick={submit} disabled={busy||!items.length||rows.some(({item:l,product:p})=>l.quantity>p.quantity||l.quantity<1)}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={18}/>} {t("Siparişi Kaydet")}</button></footer>
  </section></div>;
}
function ThemeSettings() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const choices = [
    { value: 'light' as const, label: t('Gündüz'), icon: Sun },
    { value: 'dark' as const, label: t('Gece'), icon: Moon },
    { value: 'system' as const, label: t('Otomatik'), icon: Monitor },
  ];
  return <div className="theme-options" role="group" aria-label={t('Görünüm')}>
    {choices.map(({ value, label, icon: Icon }) =>
      <button key={value} type="button" className={`theme-option ${preference === value ? 'selected' : ''}`}
        aria-pressed={preference === value} onClick={() => setPreference(value)}>
        <Icon size={19} aria-hidden="true"/><span>{label}</span>
      </button>
    )}
  </div>;
}
function SettingsPage({data,repo,notify,email,cloud,onExport}: {data:AppData;repo:StockRepository;notify:(msg:string,error?:boolean)=>void;email:string;cloud:boolean;onExport:()=>Promise<void>}){
  const { t } = useI18n();
  const [cartonPrice,setCartonPrice]=useState(moneyInput(data.settings.cartonUnitCostCents)); const [shippingPrice,setShippingPrice]=useState(moneyInput(data.settings.shippingUnitCostCents ?? 360)); const [busy,setBusy]=useState(false);
  useEffect(()=>setCartonPrice(moneyInput(data.settings.cartonUnitCostCents)),[data.settings.cartonUnitCostCents]);
  useEffect(()=>setShippingPrice(moneyInput(data.settings.shippingUnitCostCents ?? 360)),[data.settings.shippingUnitCostCents]);
  async function save(){const cents=parseMoney(cartonPrice);if(!validQty(cents))return notify(t("Geçerli karton bedeli gir."),true);setBusy(true);try{await repo.updateCartonCost(cents);notify(t("Karton bedeli güncellendi."));}catch(err){notify(friendlyError(err),true)}finally{setBusy(false)}}
  async function saveShipping(){const cents=parseMoney(shippingPrice);if(!validQty(cents))return notify(t("Geçerli kargo bedeli gir."),true);setBusy(true);try{await repo.updateShippingCost(cents);notify(t("Kargo bedeli güncellendi."));}catch(err){notify(friendlyError(err),true)}finally{setBusy(false)}}
  // Bu yardımcı kart sadece eski maliyetleri halen kullanan depolarda görünür.
  // Yeni Excel yüklemelerinde veya başka ürün kataloglarında hiç görünmez.
  const legacyCosts = new Map([
    ['Single Towel 500 gr', 1200],
    ['Kitchen Towel 6×4 (24 rulo)', 1200],
    ['Toilet Paper 32×3 – 2 kat (96 rulo)', 1700],
    ['Toilet Paper 32×3 – 3 kat (96 rulo)', 1900],
    ['Toilet Paper 24×3 – 2 kat (72 rulo)', 1500],
    ['Toilet Paper 16×3 – 3 kat (48 rulo)', 1100],
  ]);
  const needsLegacyShippingMigration = !data.settings.shippingSeparatedAt &&
    data.products.some(p => legacyCosts.get(p.name) === p.unitCostCents);
  async function migrateCosts(){if(!window.confirm(t("İlk 6 ürünün eski birim maliyetinden 3,60 € ayrılacak. Bu işlem geçmiş siparişleri değiştirmez. Devam edilsin mi?")))return;setBusy(true);try{const r=await repo.separateShippingFromExistingCosts();notify(`${t("Kargo maliyeti ürünlerden ayrıldı:")} ${r.updated} ${t("ürün")}. ${r.skipped ? `${r.skipped} ${t("ürün atlandı")}.`:""}`);}catch(err){notify(friendlyError(err),true)}finally{setBusy(false)}}
  return <div className="settings-grid"><section className="surface settings-card settings-language-card">
    <div className="settings-head"><div className="settings-icon blue"><ShieldCheck size={22}/></div><div><h2>{t("Uygulama dili")}</h2><p>{t("Tercihin bu cihazda saklanır.")}</p></div></div>
    <LanguageSelect/>
    </section><section className="surface settings-card settings-theme-card">
    <div className="settings-head"><div className="settings-icon blue"><Moon size={22}/></div><div><h2>{t("Görünüm")}</h2><p>{t("Göz konforun için tema seç. Tercihin bu cihazda saklanır.")}</p></div></div>
    <ThemeSettings/>
    </section><section className="surface settings-card"><div className="settings-head"><div className="settings-icon blue"><Box size={22}/></div><div><h2>{t("Karton maliyeti")}</h2><p>{t("Her siparişte kullanılan karton adedine göre düşülür.")}</p></div></div><label className="settings-label">{t("Birim karton maliyeti (€)")}<div className="settings-save"><input inputMode="decimal" value={cartonPrice} onChange={e=>setCartonPrice(e.target.value)}/><button className="btn btn-primary" onClick={save} disabled={busy}>{t("Kaydet")}</button></div></label><p className="field-note">{t("Eski siparişlerin karton bedeli değişmez.")}</p></section>
    <section className="surface settings-card"><div className="settings-head"><div className="settings-icon blue"><Truck size={22}/></div><div><h2>{t("Kargo maliyeti")}</h2><p>{t("Ürün başına değil, gönderilen paket sayısına göre hesaplanır.")}</p></div></div><label className="settings-label">{t("Paket başına kargo maliyeti (€)")}<div className="settings-save"><input inputMode="decimal" value={shippingPrice} onChange={e=>setShippingPrice(e.target.value)}/><button className="btn btn-primary" onClick={saveShipping} disabled={busy}>{t("Kaydet")}</button></div></label><p className="field-note">{t("Eski siparişlerin kargo bedeli değişmez.")}</p></section>
    {needsLegacyShippingMigration && <section className="surface settings-card"><div className="settings-head"><div className="settings-icon amber"><PackagePlus size={22}/></div><div><h2>{t("Eski ürün maliyetlerini düzelt")}</h2><p>{t("Başlangıçtaki 6 ürünün maliyetinden dahil edilmiş 3,60 € kargoyu bir kez ayırır. Mevcut stok adetlerini ve eski siparişleri değiştirmez.")}</p></div></div><button className="btn btn-secondary" onClick={migrateCosts} disabled={busy||Boolean(data.settings.shippingSeparatedAt)}>{t("6 ürünün maliyetinden kargoyu ayır")}</button>{data.settings.shippingSeparatedAt&&<small className="inline-success"><CheckCircle2 size={14}/>{t("Maliyet ayrıştırması tamamlandı.")}</small>}</section>}
    <section className="surface settings-card"><div className="settings-head"><div className="settings-icon mint"><FileSpreadsheet size={22}/></div><div><h2>{t("Excel raporu")}</h2><p>{t("Ürünler, siparişler ve geçmiş satış fiyatlarını XLSX olarak indir.")}</p></div></div><button className="btn btn-secondary" onClick={onExport}><Download size={16}/> {t("Excel indir (.xlsx)")}</button></section>
    <ExcelImport data={data} repo={repo} notify={notify}/>
    <section className="surface settings-card"><div className="settings-head"><div className="settings-icon blue"><ShieldCheck size={22}/></div><div><h2>{t("Erişim ve hesap")}</h2><p>{cloud ? t("Firebase üzerinden güvenli, eşit yetkili kullanıcı girişi.") : t("Şu anda yalnızca bu tarayıcıda çalışan demo modu.")}</p></div></div><div className="account-line"><UserRound size={17}/>{email}</div>{cloud&&<button className="btn btn-secondary" onClick={()=>auth&&signOut(auth)}><LogOut size={16}/> {t("Çıkış yap")}</button>}</section>
  </div>;
}
function AppContent({ repo, email, cloud, isAdmin, uid }: { repo: StockRepository; email: string; cloud: boolean; isAdmin: boolean; uid: string }) {
  const { t } = useI18n();
  const [data, setData]=useState<AppData>(emptyData); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [page,setPage]=useState<Page>('dashboard'); const [drawer,setDrawer]=useState(false);
  const [productEdit,setProductEdit]=useState<Product|null|undefined>(undefined);const [stockEdit,setStockEdit]=useState<Product|null>(null);
  const [toasts,setToasts]=useState<Toast[]>([]);const [search,setSearch]=useState('');const [mobileNav,setMobileNav]=useState(false);
  useEffect(()=>{setLoading(true); const unsub=repo.subscribe(v=>{setData(v);setLoading(false)},e=>{setError(friendlyError(e));setLoading(false)});return unsub;},[repo]);
  const notify=useCallback((message:string,error=false)=>{const id=Date.now()+Math.random();setToasts(t=>[...t.slice(-2),{id,message,error}]);window.setTimeout(()=>setToasts(t=>t.filter(v=>v.id!==id)),5500);},[]);
  const s=stats(data);
  const download=async()=>{try{await exportExcel(data);notify(t("Excel raporu indirildi."))}catch(err){notify(t("Excel hazırlanamadı: ")+friendlyError(err),true)}};
  const cancel=async(o:Order)=>{if(!window.confirm(`"${o.reference||o.id.slice(0,8)}" — ${t("Siparişi iptal et")}?`))return;try{await repo.cancelOrder(o.id);notify(t("Sipariş iptal edildi, stoklar geri eklendi."))}catch(err){notify(friendlyError(err),true)}};
  const changePage=(p:Page)=>{setPage(p);setMobileNav(false)};
  const activeProducts=data.products.filter(p=>!p.archived);
  const navItems: { key: Page; label: string; icon: LucideIcon }[] = isAdmin ? [...nav, { key: 'admin', label: 'Yönetim', icon: ShieldCheck }] : nav;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}><div className="sidebar-brand"><Logo/></div><div className="sidebar-tag">WORKSPACE</div><nav className="sidebar-nav">{navItems.map(({key,label,icon:Icon})=><button key={key} className={`nav-item ${page===key?'selected':''}`} onClick={()=>changePage(key)}><Icon size={19}/>{t(label)}{page===key&&<ChevronRight className="nav-arrow" size={17}/>}</button>)}</nav><div className="sidebar-foot"><span className="avatar">{email[0]?.toUpperCase() || 'S'}</span><span className="sidebar-user"><strong>{cloud?t("Yetkili kullanıcı"):t("Demo kullanıcı")}</strong><small>{email}</small></span></div></aside>
    {mobileNav && <div className="nav-scrim" onClick={()=>setMobileNav(false)}/>}
    <div className="main-wrap"><header className="topbar"><button className="icon-button mobile-menu" aria-label={t("Menüyü aç")} onClick={()=>setMobileNav(v=>!v)}><Menu size={22}/></button><div className="topbar-search"><Search size={18}/><input placeholder={t("Ürün, sipariş veya marka ara...")} value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value.trim())setPage('products')}}/></div><div className="topbar-right"><ThemeToggle/><span className={`cloud-state ${cloud?'cloud-live':'cloud-demo'}`}><Cloud size={15}/>{cloud?t("Firebase bağlı"):t("Demo modu")}</span><span className="top-avatar">{email[0]?.toUpperCase()||'D'}</span><span className="user-name">{email.split('@')[0]}</span></div></header>
    {!cloud&&<div className="demo-banner"><Info size={17}/><span><strong>{t("Demo sürümündesin.")}</strong> {t("Veriler bu tarayıcıda saklanır; başka telefonla paylaşılmaz. Firebase kurulumu için KURULUM-TR.md dosyasını izle.")}</span></div>}
    {error&&<div className="error-banner"><Info size={18}/>{error}</div>}
    <main className="main-content">
      <div className="page-head"><div><h1>{page==='dashboard'?t("Genel Bakış"):page==='products'?t("Ürün Yönetimi"):page==='orders'?t("Sipariş Geçmişi"):page==='settings'?t("Ayarlar"):t("Yönetim")}</h1><p>{page==='dashboard'?t("İşletmenin genel durumu bir bakışta."):page==='products'?t("Ürün, stok ve fiyat bilgilerini yönet."):page==='orders'?t("Tüm siparişler ve gerçek satış fiyatları."):page==='settings'?t("Uygulama ayarları ve dışa aktarma."):t("Kullanıcı listesi ve erişim izinleri.")}</p></div><div className="head-actions">{page==='products'&&<button className="btn btn-secondary" onClick={()=>setProductEdit(null)}><Plus size={17}/> {t("Yeni Ürün")}</button>}{page!=='settings'&&page!=='admin'&&<button className="btn btn-primary" onClick={()=>setDrawer(true)}><Plus size={18}/> {t("Yeni Sipariş")}</button>}</div></div>
      {loading?<div className="loading-card"><LoaderCircle className="spin" size={30}/> {t("Veriler yükleniyor...")}</div>:<>
        {page==='dashboard'&&<><Summary data={data}/><section className="surface table-section"><div className="section-heading"><div><h2>{t("Ürünler")}</h2><p>{t("Envanterin güncel durumu")}</p></div><button className="text-link" onClick={()=>changePage('products')}>{t("Tümünü gör")} <ArrowRight size={16}/></button></div><ProductsTable data={{...data,products:activeProducts.slice(0,8)}} onEdit={p=>setProductEdit(p)} onStock={p=>setStockEdit(p)} query={search} onQueryChange={setSearch} compact/></section><div className="dashboard-bottom"><section className="surface orders-section"><div className="section-heading"><div><h2>{t("Sipariş geçmişi")}</h2><p>{t("Son kaydedilen işlemler")}</p></div><button className="text-link" onClick={()=>changePage('orders')}>{t("Tümünü gör")} <ArrowRight size={16}/></button></div><OrdersList data={data} onCancel={cancel} limit={4}/></section><section className="surface finance-card"><div className="finance-header"><span className="finance-icon"><Wallet size={23}/></span><h2>{t("Kâr özeti")}</h2></div><div className="finance-row"><span>{t("Satış cirosu")}</span><strong>{eur(s.revenueCents)}</strong></div><div className="finance-row"><span>{t("Brüt kâr")}</span><strong>{eur(s.grossProfitCents)}</strong></div><div className="finance-row"><span>{t("Karton")} ({num(s.cartonCount)} {t("adet")})</span><strong className="negative">− {eur(s.cartonCostCents)}</strong></div><div className="finance-row"><span><Truck size={16} style={{verticalAlign:"middle", marginRight:6}}/> {t("Kargo")} ({num(s.shippingParcelCount)} {t("paket")})</span><strong className="negative">− {eur(s.shippingCostCents)}</strong></div><div className="finance-divider"/><div className="finance-row finance-total"><span>{t("Karton ve kargo sonrası kâr")}</span><strong>{eur(s.netProfitCents)}</strong></div><small>{t("Komisyon, KDV ve diğer giderler dahil değildir.")}</small></section></div></>}
        {page==='products'&&<><section className="surface table-section"><div className="section-heading"><div><h2>{t("Tüm ürünler")} <span className="count-tag">{data.products.length}</span></h2><p>{t("Fiyat değişiklikleri yalnızca yeni siparişleri etkiler.")}</p></div><button className="btn btn-light" onClick={download}><Download size={16}/> {t("Excel")}</button></div><ProductsTable data={data} onEdit={p=>setProductEdit(p)} onStock={p=>setStockEdit(p)} query={search} onQueryChange={setSearch}/></section><section className="surface activity-section"><div className="section-heading"><h2>{t("Son stok hareketleri")}</h2><Activity size={19}/></div>{data.adjustments.length?data.adjustments.slice(0,8).map(a=><div className="activity-row" key={a.id}><span className={`activity-circle ${a.delta>0?'pos':'neg'}`}>{a.delta>0?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><div><strong>{a.productName}</strong><small>{a.note||t("Manuel stok güncellemesi")} · {dateTime(a.createdAt)}</small></div><span className={a.delta>0?'profit-cell':'negative'}>{a.delta>0?'+':''}{a.delta}</span></div>):<p className="empty-hint">{t("Henüz manuel stok hareketi yapılmadı.")}</p>}</section></>}
        {page==='orders'&&<><div className="order-summary-grid"><Card label={t("Aktif sipariş")} value={num(s.activeOrders)} icon={ShoppingBag} color="blue"/><Card label={t("Toplam ciro")} value={eur(s.revenueCents)} icon={BarChart3} color="mint"/><Card label={t("Karton gideri")} value={eur(s.cartonCostCents)} icon={Box} color="amber"/><Card label={t("Karton ve kargo sonrası kâr")} value={eur(s.netProfitCents)} icon={Wallet} color="teal"/></div><section className="surface table-section"><div className="section-heading"><div><h2>{t("Tüm siparişler")}</h2><p>{t("İptal edilen işlemler geçmişte korunur, stokları geri yüklenir.")}</p></div><button className="btn btn-light" onClick={download}><Download size={16}/> {t("Excel")}</button></div><OrdersList data={data} onCancel={cancel}/></section></>}
        {page==='settings'&&<SettingsPage data={data} repo={repo} notify={notify} email={email} cloud={cloud} onExport={download}/>}
        {page==='admin'&&isAdmin&&<AdminPanel myUid={uid} notify={notify}/>}
      </>}
      <div className="footer-caption"><PackageCheck size={15}/> {t("StockFlow · Excel kadar basit, uygulama kadar pratik.")}</div>
    </main></div>
    <nav className="mobile-bottom-nav" style={{gridTemplateColumns:`repeat(${navItems.length}, minmax(0,1fr))`}}>{navItems.map(({key,label,icon:Icon})=><button key={key} className={page===key?'selected':''} onClick={()=>changePage(key)}><Icon size={22}/><span>{t(label)}</span></button>)}</nav>
    {drawer&&<OrderCreator data={data} repo={repo} onClose={()=>setDrawer(false)} notify={notify}/>}
    {productEdit!==undefined&&<ProductEditor key={productEdit?.id||'new'} product={productEdit} onClose={()=>setProductEdit(undefined)} repo={repo} notify={notify}/>}
    {stockEdit&&<StockEditor key={stockEdit.id} product={stockEdit} onClose={()=>setStockEdit(null)} repo={repo} notify={notify}/>}
    <ToastStack toasts={toasts}/>
  </div>;
}

export default function App() {
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [member, setMember] = useState<{active: boolean; role: 'admin'|'member'} | null>(null);
  const [loginError, setLoginError] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!auth || !db) return;
    const currentAuth = auth;
    const database = db;
    let active = true;
    let stopMember: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(currentAuth, currentUser => {
      if (!active) return;
      stopMember?.(); stopMember = undefined;
      setAuthReady(false);
      setAuthError(''); setLoginError(''); setMember(null);
      if (currentUser?.isAnonymous) {
        void signOut(currentAuth).catch(error => {
          console.error('Eski anonim oturum kapatılamadı:', error);
          if (active) { setAuthError(t("Anonim oturum kapatılamadı. Sayfayı yenile.")); setAuthReady(true); }
        });
        return;
      }
      setUser(currentUser);
      if (!currentUser) { setAuthReady(true); return; }
      // Yeni hesaplar kendilerine yalnızca active:false üyelik kaydı açabilir.
      // Eski hesapların eksik e-postası, kullanıcının kendi Auth e-postasından tamamlanır.
      const memberRef = doc(database, 'members', currentUser.uid);
      let createInProgress = false;
      let emailUpdateInProgress = false;
      stopMember = onSnapshot(memberRef, snapshot => {
        if (!active) return;
        const info = snapshot.data();
        setMember(snapshot.exists() ? {active: info?.active === true, role: info?.role === 'admin' ? 'admin' : 'member'} : null);
        setAuthReady(true);
        if (!currentUser.email) return;
        if (!snapshot.exists() && !createInProgress) {
          createInProgress = true;
          void setDoc(memberRef, {
            email: currentUser.email,
            active: false,
            role: 'member',
            createdAt: serverTimestamp(),
          }).catch(error => {
            console.error('Üyelik kaydı oluşturulamadı:', error);
            if (active) setAuthError(t("Üyelik kaydı açılamadı. Firestore kurallarını kontrol et."));
          }).finally(() => { createInProgress = false; });
        } else if (snapshot.exists() && info?.email !== currentUser.email && !emailUpdateInProgress) {
          emailUpdateInProgress = true;
          void updateDoc(memberRef, { email: currentUser.email }).catch(error => {
            console.error('Üye e-postası güncellenemedi:', error);
          }).finally(() => { emailUpdateInProgress = false; });
        }
      }, error => {
        console.error('Üyelik doğrulaması başarısız:', error);
        if (active) { setAuthError(t("Üyelik kontrolü başarısız. Firestore kurallarını kontrol et.")); setAuthReady(true); }
      });
    }, error => {
      console.error('Firebase oturum hatası:', error);
      if (active) { setAuthError(t("Firebase oturumu kontrol edilemedi.")); setAuthReady(true); }
    });
    return () => { active = false; stopMember?.(); unsubscribe(); };
  }, []);

  const repo = useMemo(() => getRepository(user?.email || undefined), [user?.email]);

  if (!authReady) return <div className="center-loading"><LoaderCircle className="spin" size={32}/><p>{t("Güvenli oturum kontrol ediliyor...")}</p></div>;
  if (configured && authError) return <div className="access-denied"><div className="access-card"><Info size={40}/><h1>{t("Bağlantı hatası")}</h1><p>{authError}</p><button className="btn btn-secondary" onClick={() => window.location.reload()}>{t("Yeniden dene")}</button></div></div>;
  if (configured && !user) return <><Login onLoginError={setLoginError}/>{loginError && <div className="login-error" onClick={() => setLoginError('')}>{loginError} <X size={15}/></div>}</>;
  if (configured && user && !member?.active) return <><ThemeToggle floating/><AccessRequest user={user}/></>;
  return <AppContent repo={repo} email={user?.email || 'demo@stockflow.local'} cloud={configured} isAdmin={member?.role === 'admin'} uid={user?.uid || ''}/>;
}
