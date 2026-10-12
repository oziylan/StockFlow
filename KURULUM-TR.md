# StockFlow — Sade ve ücretsiz kullanıcı sistemi (Spark)

Bu paket, Cloud Functions gerektiren son yönetim panelini kaldırır. Yalnızca Firebase Authentication + Cloud Firestore kullanır. Mevcut ürünleri, siparişleri, karton hesaplarını, `.env.local` yapılandırmasını ve mobil CSS'i değiştirmez.

## Ne değişecek?

- Kullanıcı giriş ekranında **Hesap oluştur** diyerek e-posta ve şifresiyle Firebase Authentication hesabı açabilir.
- Uygulama kendi `members/{UID}` kaydını **active: false**, **role: member**, **email: kullanıcının e-postası** olarak açar.
- **active: true** olmadığı sürece ürünleri ve siparişleri göremez.
- Yönetim menüsünde kayıtlı üyelerin **e-postası ana başlık**, **UID küçük alt bilgi**, durumları ve aktif/kapalı sayıları görünür.
- Yönetici kullanıcıyı **Erişimi aç / Erişimi kapat** düğmesiyle web uygulamasından yönetir.
- Role değişimi, şifre düzenleme, Authentication hesabını silme **yoktur**; böylece ücretsiz Spark ile çalışır.
- Yalnızca `members` kayıtlarını listeler; Authentication'da oluşturulmuş ancak henüz StockFlow'a giriş yapmamış hesaplar listede yer almayabilir.

## Önce yedek

VS Code'daki StockFlow klasörünü veya en azından `src/App.tsx`, `src/components`, `firebase.json`, `firestore.rules` dosyalarını yedekle.

## 1. Dosyaları kopyala

ZIP'teki dosyaları mevcut StockFlow klasörüne **aynı yolları koruyarak** kopyala:

- `src/App.tsx`
- `src/components/AdminPanel.tsx`
- `src/components/AccessRequest.tsx`
- `firestore.rules`
- `firebase.json` (artık **functions** tanımı yok)

**`src/styles.css` dosyana dokunma.** Mevcut mobil düzenin korunur. `src/components/AdminPanel.css` kalmışsa istersen silebilirsin; artık kullanılmıyor. `functions` klasörünü de istersen silebilirsin, yeni sürüm onu çağırmaz.

## 2. Firebase Authentication

Firebase Console > Authentication > Sign-in method: **Email/Password** etkin olmalı.

İlk admin hesabın Firebase Firestore > Data > `members` > kendi e-posta/şifre hesabının UID belgesinde:

- `active`: boolean `true`
- `role`: string `admin`

olmalı. Bu, adminin güvenli başlangıcı için yalnızca bir defa gerekli. **Admin belgesini silme.**

## 3. Güvenlik kurallarını yayınla (zorunlu)

PowerShell'de StockFlow kök klasöründen:

```powershell
firebase.cmd deploy --only firestore:rules --project stockflow-dc6d4
```

Bu komut **Cloud Functions yayınlamaz, Blaze istemez**.

Alternatif: Firebase Console > Firestore Database > Rules > ZIP'teki `firestore.rules` içeriğini yapıştır > Publish.

Yeni kurallar, normal kullanıcıların kendi kendilerine `active:true` ya da `role:admin` yazmasını engeller. Ürün/sipariş verileri yalnızca aktif üyelere açıktır.

## 4. Uygulamayı çalıştır

```powershell
npm.cmd run dev
```

Eski Cloud Functions tabanlı Yönetim ekranı yerine yeni sade liste açılır.

## 5. İki tarayıcıyla test et

1. Normal tarayıcıda admin hesabınla **Yönetim** ekranını aç. Kendi e-postan bir kere giriş yaptıktan sonra görünmelidir.
2. Gizli sekmede veya farklı tarayıcıda **Hesap oluştur** düğmesine basarak bir deneme hesabı aç.
3. Yeni kişi **Yönetici onayı bekleniyor** ekranını görmeli; ürünlere erişememeli.
4. Admin ekranında yeni e-posta altında **Kapalı** ve **Erişimi aç** görünmeli.
5. **Erişimi aç** düğmesine bas. Kullanıcı sayfası otomatik stok ekranına geçmeli.
6. **Erişimi kapat** düğmesiyle tekrar kapatınca erişimi bitmeli.

## E-posta görünmüyorsa

Eski `members` belgelerinde yalnızca `active` ve `role` bulunabiliyor. Kullanıcı e-posta/şifreyle StockFlow'a giriş yaptığında yeni sürüm kendi e-postasını üyelik belgesine ekler. Bundan sonra admin listesinde UID yerine öncelikle e-posta görünür.

**Not:** Web istemcisi Firebase Authentication'daki tüm hesapları doğrudan listeleyemez. Listelenen sayı, Firestore `members` koleksiyonundaki kayıt sayısıdır. Authentication hesabı olup hiç StockFlow'a giriş yapmamış kişi otomatik üyelik kaydı oluşturmadıysa burada görünmez.

## Siteyi Firebase Hosting'de açıyorsan

Yerel kod değişikliklerini yayımlamak için:

```powershell
npm.cmd run build
firebase.cmd deploy --only hosting --project stockflow-dc6d4
```

Artık `firebase.cmd deploy --only functions...` komutunu kullanma. `firebase.json` içinde functions tanımı yoktur.

## Ücret

Firebase Spark ücretsiz planı üzerinde kullanılabilir; ücretsiz kullanım kotaları geçerlidir. Cloud Functions/Blaze gerektirmez. Veriler kamuya açık hale getirilmez.
