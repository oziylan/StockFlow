import { LogOut, ShieldCheck } from 'lucide-react';
import { signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function AccessRequest({ user }: { user: User }) {
  return <div className="access-denied"><div className="access-card request-card">
    <ShieldCheck size={42}/>
    <h1>Yönetici onayı bekleniyor</h1>
    <p><strong>{user.email}</strong> hesabın oluşturuldu ancak StockFlow erişimin henüz aktif değil.</p>
    <p>Yönetici, <strong>Yönetim → Kullanıcılar</strong> bölümünden erişimini açtığında sayfa otomatik olarak açılacak. Şimdilik stok ve siparişleri göremezsin.</p>
    <button className="btn btn-secondary" onClick={() => auth && signOut(auth)}><LogOut size={16}/> Başka hesapla giriş yap</button>
  </div></div>;
}
