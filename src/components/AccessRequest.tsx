import { LogOut, ShieldCheck } from 'lucide-react';
import { signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useI18n } from '../i18n';
import LanguageSelect from '../i18n/LanguageSelect';

export default function AccessRequest({ user }: { user: User }) {
  const { t } = useI18n();
  return <div className="access-denied"><div className="access-card request-card">
    <ShieldCheck size={42}/><div className="auth-language"><LanguageSelect compact/></div>
    <h1>{t("Yönetici onayı bekleniyor")}</h1>
    <p><strong>{user.email}</strong> {t("hesabın oluşturuldu ancak StockFlow erişimin henüz aktif değil.")}</p>
    <p>{t("Yönetici, ")}<strong>{t("Yönetim → Kullanıcılar")}</strong> {t("bölümünden erişimini açtığında sayfa otomatik olarak açılacak. Şimdilik stok ve siparişleri göremezsin.")}</p>
    <button className="btn btn-secondary" onClick={() => auth && signOut(auth)}><LogOut size={16}/> {t("Başka hesapla giriş yap")}</button>
  </div></div>;
}
