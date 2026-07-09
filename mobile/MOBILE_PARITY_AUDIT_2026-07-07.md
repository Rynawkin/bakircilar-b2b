# Mobile Parity Audit - 2026-07-07

Kapsam: `mobile/b2b` musteri uygulamasi ve `mobile/portal` admin/personel uygulamasi. Hedef, webdeki admin ve musteri deneyimini mobilde Android/iOS telefon + tablet icin eksiksiz tasimak.

Bu dosya canli kod incelemesine gore yazildi; eski `mobile/FEATURE_PARITY.md` artik guncel kabul edilmemeli.

## Bu turda kapatilan net parite aciklari

1. Portal raporlarina `Aksiyon Radari` eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getActionRadar()`
   - UI: `mobile/portal/src/screens/ReportsScreen.tsx`
   - Mobilde gosterilen sinyaller: teklif sagligi, terk sepet, eksik gorsel/katalog ornekleri, katalog kategori/birim/KDV kontrolleri, tamamlayici urun kapsami, saha ziyaret adaylari, paket satis performansi, paket onerileri ve anomali KPI/satirlari.
   - Aksiyonlar: teklif detaya git, sepet raporuna filtreyle gec, katalog/gorsel satirindan direkt `Urunler` ekranina kalite filtresiyle git, saha ziyaret satirindan `Saha Satis` ac, tamamlayici motoru yonet, siparis takip/paketler ekranina gec.

2. Musteri uygulamasina `Faturalarim` eklendi.
   - API: `mobile/b2b/src/api/customer.ts`
   - UI: `mobile/b2b/src/screens/InvoicesScreen.tsx`
   - Navigasyon: `mobile/b2b/src/navigation/AppNavigator.tsx`, `mobile/b2b/src/screens/MoreScreen.tsx`
   - Ozellikler: fatura no/tarih filtresi, sayfalama, tutar/tarih/dosya bilgisi, yetkili PDF indirme ve paylasma.
   - Ek dependency: `mobile/b2b/package.json` -> `expo-file-system`.

3. Portal uygulamasina `Cari Aktivite` eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getCustomerEngagement`, `addCustomerEngagementContact`, `getCustomerEngagementContacts`
   - UI: `mobile/portal/src/screens/CustomerEngagementScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: KPI kartlari, cari arama, durum filtresi, bugun aranacak filtresi, saglik skoru, oneri/aksiyon nedeni, siparis/giris/temas ozeti, hizli "hatirlatildi", temas/not modalı ve gecmis temas listesi.

4. Portal uygulamasina `Cari 360` eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `searchCustomer360`, `getCustomer360`
   - UI: `mobile/portal/src/screens/Customer360Screen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Baglantilar: Cari Aktivite kartlarindan ve Aksiyon Radari cari aksiyonlarindan Cari 360'a gecis eklendi.
   - Ozellikler: cari arama/secim, cari kimligi, bakiye/siparis/teklif/sepet/aksiyon/fatura KPI'lari, fiyat guven karti, aktif sepet kalemleri, son siparisler, son teklifler, vade/temas ozeti, temas gecmisi, vade notlari, aktivite ve son faturalar.

5. Portal `Musteri Sepetleri` raporu aksiyonlu hale getirildi.
   - API: `mobile/portal/src/api/admin.ts` -> `clearCustomerCart`
   - UI: `mobile/portal/src/screens/ReportsScreen.tsx`
   - Ozellikler: sepet kartinda kalem detaylarini ac/kapat, urun kodu/ad/miktar/birim fiyat/toplam fiyat goruntuleme, yetkili personel icin onayli sepet temizleme.
   - Not: backend endpoint satis temsilcisi sektor kapsam kontrolu ve audit log kaydi yapiyor.

6. Portal uygulamasina `Saha Satis` ilk mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `searchFieldSalesCustomers`, `getFieldSalesCustomer`, `searchFieldSalesProducts`, `getFieldSalesProduct`, `createFieldSalesVisitNote`
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: cari arama/secim, cari bakiye/acik siparis/acik teklif/sepet ozeti, mobilde tam genislikli urun kartlari, uzun urun adlarini sarmalayan layout, stok/depo/fiyat/son satis bilgisi, safe-mode maliyet gizleme, firsat kartlari ve ziyaret notu/talep/rakip bilgisi kaydi.

7. Musteri mobil urun detayina galeri ve paket icerigi eklendi.
   - Tip: `mobile/b2b/src/types.ts` -> `Product.images`, `isBundle`, `bundleDiscountPercent`, `bundleContents`
   - UI: `mobile/b2b/src/screens/ProductDetailScreen.tsx`
   - Ozellikler: backend detayindan gelen coklu gorsel galerisi, thumbnail secimi, paket/set urunlerde bilesen listesi ve paket indirim bilgisi.

8. Musteri mobil uygulamasina `Koleksiyonlar` eklendi.
   - API: `mobile/b2b/src/api/customer.ts` -> `getActiveCollections`, `getCollection`
   - Tip: `mobile/b2b/src/types.ts` -> `CollectionCard`, `CollectionDetail`
   - UI: `mobile/b2b/src/screens/CollectionsScreen.tsx`, `mobile/b2b/src/screens/CollectionDetailScreen.tsx`
   - Navigasyon: `mobile/b2b/src/navigation/AppNavigator.tsx`, `mobile/b2b/src/screens/MoreScreen.tsx`, `mobile/b2b/src/screens/HomeScreen.tsx`
   - Ozellikler: aktif koleksiyon listesi, koleksiyon detay urunleri, urun detayina gecis ve hizli sepete ekleme.

9. Portal vade panel/analiz/yonetim ekranlari mobilde baglandi.
   - API: `mobile/portal/src/api/admin.ts` -> `getVadeDashboard`, `getVadeAnalytics`, `getVadeManagement`
   - Tip: `mobile/portal/src/types.ts` -> `VadeDashboard`, `VadeAnalytics`, `VadeManagement`
   - UI: `mobile/portal/src/screens/VadeDashboardScreen.tsx`, `VadeAnalyticsScreen.tsx`, `VadeManagementScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`, `mobile/portal/src/screens/VadeScreen.tsx`
   - Ozellikler: vade KPI, yaslandirma, yogunlasma, sektor/grup dagilimi, once aranacak cariler, musteri davranisi, personel not performansi, yonetim ozeti, sorun tespiti, gunluk aktivite trendi.

10. Musteri mobil ana sayfa kucuk ekranlarda scrollable ve daha islevsel hale getirildi.
   - UI: `mobile/b2b/src/screens/HomeScreen.tsx`
   - Ozellikler: tum urunler, indirimli urunler, daha once aldiklarim, koleksiyonlar, anlasmali fiyatlar, bekleyen siparisler, faturalar ve talepler icin ana sayfadan hizli giris.
   - Kalite: sabit yukseklikte kalan ana ekran yerine telefon/tablet boyutlarinda tasma yapmayan kaydirilabilir layout.

11. Portal `Urun Olcu ve Raf` operasyonu mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> product-dimensions arama, eksik liste, raf arama, detay ve kaydetme metotlari.
   - UI: `mobile/portal/src/screens/ProductDimensionsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: eksik olcu/raf listesi, stok arama, urun detay secimi, raf/reyon secimi, 1-4 birim icin ad/katsayi/kg/en-boy-yukseklik/desi girisi, buyuk/kucuk birim katsayi yonu, degisen alan ozeti, onayli Mikro kaydi ve son degisiklik gecmisi.

12. Portal `Banner Yonetimi` mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> banner liste, istatistik, gorsel upload, create/update/delete metotlari.
   - UI: `mobile/portal/src/screens/BannersScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: HERO/STRIP/SIDE/GRID gruplu liste, son 30 gun tik sayisi, aktif-pasif toggle, yeni/duzenle formu, desktop ve mobil gorsel upload, link/urun kodu/CTA/sira/tarih alani, silme onayi.

13. Musteri mobil sepetine GWP / hediyeli kampanya secimi eklendi.
   - API: `mobile/b2b/src/api/customer.ts` -> `getActiveGiftCampaign`, `setGiftCampaignSelection`
   - Tip: `mobile/b2b/src/types.ts` -> `ActiveGiftCampaign`, `GiftCampaignGift`
   - UI: `mobile/b2b/src/screens/CartScreen.tsx`
   - Ozellikler: aktif kampanya karti, baraj/kapsam tutari/kalan tutar, mobil banner gorseli, baraj gecilince hediye secimi, `giftPickCount` limiti, secimin sepete kaydi. Backend siparis olustururken secili hediyeyi tekrar dogrulayip kampanya hediyesi satirina tasiyor.

14. Portal `Hediyeli Kampanyalar` yonetimi mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> gift-campaign CRUD metotlari.
   - UI: `mobile/portal/src/screens/GiftCampaignsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: kampanya listeleme, aktif/pasif toggle, yeni/duzenle/sil, sepet baraji, hediye secim adedi, kapsam tipi, hedef tipi, tarih penceresi, hediye urun arama/secme ve miktar girisi.

15. Portal `Koleksiyonlar` yonetimi mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> collection CRUD metotlari.
   - UI: `mobile/portal/src/screens/CollectionsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: aktif/pasif liste, yeni/duzenle/sil, RULE koleksiyonlarda kategori/cok satan/indirimli/yeni kurali, MANUAL koleksiyonlarda urun arama/secme, hedefleme, tarih penceresi, gorsel URL ve renk presetleri.

16. Portal `Kategori Gorselleri` yonetimi mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `setCategoryImage()`
   - Tip: `mobile/portal/src/types.ts` -> `CategoryWithPriceRules.mikroCode`, `imageUrl`
   - UI: `mobile/portal/src/screens/CategoryImagesScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: kategori arama, kare gorsel onizleme, cihazdan gorsel sec/yukle, 5MB kontrolu, kategori gorselini kaldirma ve kart bazli islem durumu.

17. Portal `Paketler` yonetimi mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> bundle liste/create/update/delete multipart metotlari.
   - UI: `mobile/portal/src/screens/BundlesScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: paket listeleme, yeni/duzenle/sil, yeni pakette zorunlu gorsel secimi, ikinci kategori, paket iskontosu, aktif/pasif, bilesen urun arama/secme, bilesen adetleri ve bilesen bazli indirimli fiyat secimi.
   - Paket sagligi: toplam/aktif/eksik-riskli/ortalama bilesen KPI'lari, paket kartinda bilesen-eksik-indirimli ozetleri, eksik/pasif/bos paket uyarisi, `Icerik/Saglik` acilimi, gorselli bilesen listesi ve tablet genisliginde iki kolonlu kart duzeni eklendi.

18. Portal `Urunler` ekranina coklu gorsel galerisi eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> product gallery liste/ekle/ana yap/sil metotlari.
   - UI: `mobile/portal/src/screens/ProductsScreen.tsx`
   - Ozellikler: urun kartindan galeri ac/kapat, galeri gorsellerini yatay listeleme, cihazdan yeni gorsel ekleme, ana gorsel yapma, galeriden gorsel silme ve mevcut ana gorsel upload alan adinin backend ile uyumlu hale getirilmesi (`image`).

19. Portal `Pasif Stoklar` arama/listesi mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `listPassiveStocks()`, `getStockCreateMetadata()`, `getStockCreateStock()`, `previewStockCreate()`, `createStock()`, `activateStock()`
   - UI: `mobile/portal/src/screens/PassiveStocksScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: debounce pasif stok arama, kategori/saglayici/maliyet kartlari, pasif stoktan aktiflestirme formu acma, yeni stok formu, zorunlu alanlar, min-max secimi, marj/maliyet/olcu alanlari, gorsel secimi, on kontrol ve onayli Mikro create/activate gonderimi.
   - Not: stok/fiyat ailesi secimi, lookup secicileri ve ek birim editoru sonradan mobil forma eklendi; canli cihaz/tablet QA ayrica kalir.

20. Portal `Operasyon Komuta Merkezi` mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getOperationsCommandCenter()`
   - UI: `mobile/portal/src/screens/OperationsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: seri filtresi, yenile, acil ATP/kritik risk/sicak musteri/ikame KPI kartlari, ATP tahsis listesi, depo orkestrasyonu, musteri niyeti, risk/ikame ve veri kalite kartlari.
   - Detay: ATP satirlari, dalga siparisleri, musteri intent aksiyonu, risk gerekceleri, ikame adaylari ve veri kalite ornekleri webdeki modal deneyimine karsilik mobilde kart ici ac/kapat panel olarak gosterilir.

21. Portal `Resim Hata Talepleri` mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getWarehouseImageIssues()`, `updateWarehouseImageIssue()`
   - UI: `mobile/portal/src/screens/ImageIssuesScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: acik/incelendi/duzeltildi filtreleri, arama, ozet kartlari, mevcut/bildirilen gorsel onizleme, durum degistirme, urun gorseli yukleyip talebi `FIXED` yapma.

22. Portal `Geri Kazanim Aksiyonlari` mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getAssignedCustomerRecoveryActions()`, `updateCustomerRecoveryAction()`
   - UI: `mobile/portal/src/screens/RecoveryActionsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: bana atanan aksiyonlar, durum/arama/vadesi gelen filtreleri, takip tarihi gecmis/bugun kart vurgusu, sonuc notu sablonlari, sonraki takip tarihi kisayollari, kaydetme, tek tusla tamamlama ve tablet genisliginde iki kolon kart duzeni.

23. Musteri mobil uygulamasina `Yeni Kategoriler` eklendi.
   - API: `mobile/b2b/src/api/customer.ts` -> `getUnboughtCategories()`, `getUnboughtCategoryProducts()`
   - Tip: `mobile/b2b/src/types.ts` -> `UnboughtCategory`
   - UI: `mobile/b2b/src/screens/NewCategoriesScreen.tsx`
   - Navigasyon: `mobile/b2b/src/navigation/AppNavigator.tsx`, `mobile/b2b/src/screens/HomeScreen.tsx`, `mobile/b2b/src/screens/MoreScreen.tsx`
   - Ozellikler: musteri hic almadigi kategori listesi, kategori chip filtresi, cok-satan/A-Z siralama, urun adi/kodu arama, fiyat tipi secimi, stok/anlasma/indirim rozetleri, miktar arttir/azalt ve sepete ekleme.

24. Musteri mobil `Tercihler` ekranina kategori bazli bildirim tercihleri eklendi.
   - API: `mobile/b2b/src/api/customer.ts` -> `getNotificationPreferences()`, `updateNotificationPreferences()`
   - Tip: `mobile/b2b/src/types.ts` -> `NotificationPreference`
   - UI: `mobile/b2b/src/screens/PreferencesScreen.tsx`
   - Ozellikler: webdeki bildirim kategorileri mobilde listelenir, her kategori switch ile acilip kapatilabilir, optimistik kayit ve hata durumunda geri alma vardir.

25. Musteri mobil ana sayfaya aktif vitrin/banner seridi eklendi.
   - API: `mobile/b2b/src/api/customer.ts` -> `getBanners()`
   - Tip: `mobile/b2b/src/types.ts` -> `Banner`, `BannerPosition`
   - UI: `mobile/b2b/src/screens/HomeScreen.tsx`
   - Ozellikler: HERO/STRIP bannerlari yatay kaydirilabilir kart olarak gosterilir, mobil gorsel varsa onu kullanir, banner tiklamasi musteri aktivitesine `CLICK` olarak yazilir, `productCode` bagli banner urun detayina yonlendirir.

26. Portal uygulamasina `Sicak Satis` mobil operasyon ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> hot-sales dashboard, arac, cari/urun arama, oturum, yukleme, satis, siparis teslim, gun sonu, rapor ve mutabakat metotlari.
   - Tip: `mobile/portal/src/types.ts` -> `HotSaleVehicle`, `HotSaleSession`, `HotSaleProduct`, `HotSaleCartItem`, `HotSaleOpenOrder`, `HotSaleDailyReport` ve ilgili enum/string union tipleri.
   - UI: `mobile/portal/src/screens/HotSalesScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: acik oturum paneli, arac oturumu acma, kaynak depo secimi, arac/merkez/topca/depo11 stoklu urun arama, uzun urun adlarini sarmalayan mobil urun kartlari, fiyat listesi secimi, faturasiz/irsaliye/siparis satis sepeti, yeni SICAK cari acma, araca yukleme sepeti, SICAK siparis teslim miktari girisi, gun sonu sayim/kasa kapanisi, gunluk rapor ve arac kaydi.
   - Guvenlik: Mikro yazan islemlerde mobil onay penceresi kullanildi; bos sepet, cari zorunlulugu ve sayim eksigi gibi temel guard'lar mobilde de var.

27. Portal uygulamasina `Tedarik Maliyetleri` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> supplier-costs urun/tedarikci arama, urun maliyet detayi, maliyet liste/create/update/apply, maliyet risk raporu, fiyat teyit talepleri ve ihale maliyet talepleri metotlari.
   - UI: `mobile/portal/src/screens/SupplierCostsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: urun bazli maliyet havuzu, tedarikci arama/secim, maliyet T/P girisi, normalize maliyet onizleme, kayit duzenleme, onayli Mikro maliyet uygulama, maliyet risk rapor bolumleri, fiyat teyit talepleri icin guncel/tamamla/iptal aksiyonlari, ihale talepleri icin tamamla/iptal aksiyonlari.
   - Not: dosya ekleri, teklif/ihale fiyat girisi, secili fiyat karari, talep notlari ve stok karti payloadli fiyat teyit tamamlama sonradan mobilde operasyonel hale getirildi; webdeki kanban/masaustu modal yogunlugu ve canli Mikro yazma QA ayrica kalir.

28. Portal uygulamasina `Depo Kiosk` mobil operasyon ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> warehouse overview, Mikro senkron, dispatch catalog, siparis detayi, toplama baslatma, satir guncelleme, gorsel hata bildirimi, yuklendi isareti, irsaliye/sevk ve perakende satis metotlari.
   - UI: `mobile/portal/src/screens/WarehouseScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: siparis arama/durum filtresi, siparis kartlari, detay satirlarinda uzun urun adlarini saran mobil layout, urun kodu/isim/raf/satir no ile hizli okutma-satir bulma, vurgulanan satirda kalani forma doldurma, toplanan/ek/raf girisi, satiri tamamen toplama, gorsel hata talebi acma, yuklendi isaretleme, sofor/arac/irsaliye serisi ile sevk, depo ve perakende fiyat seviyesi secimli perakende satis sepeti.
   - Guvenlik: Mikro yazan senkron, yukleme, irsaliye ve perakende satis islemlerinde mobil onay penceresi var.
   - Tablet: 840px ve ustunde siparis, toplama satiri ve perakende urun kartlari iki kolonlu yerlesir; telefonlarda tek kolon korunur.
   - Not: webdeki cok sekmeli masaustu kiosk deneyiminin tam dispatcher modal derinligi, canli depo cihaz QA ve Mikro irsaliye/perakende yazma QA henuz ayrica tamamlanmadi.

29. Portal `Vade Takip` ana mobil ekrani not/hatirlatma/atama operasyonlari icin guclendirildi.
   - UI: `mobile/portal/src/screens/VadeScreen.tsx`
   - Ozellikler: bakiye arama ve KPI kartlari, cari kartindan direkt not ekleme, etiket/soz tarihi/hatirlatma tarihli not olusturma, not raporu filtreleri, hatirlatma takvimi ve mobil tamamla aksiyonu, personel secimli vade atamasi, atama kaldirma, Mikro vade Excel import ve tek cari manuel import formu.
   - Not: Ilk turda toplu Excel import webde kalacak sekilde sinirlanmisti; sonraki mobil parite turunda ayni backend import endpoint'i ve webdeki kolon esleme mantigiyla mobil dosya sec/import akisi eklendi.

30. Portal uygulamasina `Ucarer Depo` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> Ucarer depo karar raporu, islem gecmisi, MinMax job baslat/durum, MinMax haric urun raporu ve MinMax haric/hesaba al metotlari.
   - UI: `mobile/portal/src/screens/UcarerDepotScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: Merkez/Topca depo secimi, stok kodu/ad arama, dinamik kolonlu rapor satirlarini mobil kartlara cevirme, oneri/stok/min/max/alinan/verilen miktar metrikleri, MinMax job baslatma ve durum izleme, hesaplama disi urun raporu, islem gecmisi arama.
   - Guvenlik: MinMax job ve MinMax haric/sifirla gibi Mikro etkili islemler mobil onay penceresi ile calisir.
   - Not: Webdeki tedarikci siparis taslaginin, karsi-depo stok/min kontroluyle DSV onerisi + manuel DSV transfer setinin, son seri kolayliginin, maliyet guncellemenin, ana saglayici degistirmenin, koliye tamamlama kolayliginin, temel aile kapsama panelinin, sekme bazli PDF/Excel paylasiminin ve olusan siparisler icin tedarikci/yonetici PDF ciktisinin temel mobil karsiligi sonradan eklendi; webdeki ileri aile dagitim/edit paneli derinligi henuz mobilde birebir yok.

31. Portal uygulamasina `Denetim Raporlari` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> staff activity report, TOPLU audit report ve TOPLU grup isaretini kaldirma metotlari.
   - UI: `mobile/portal/src/screens/AuditReportsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: personel aktivite tarih/rol/route filtresi, aktivite kartlari, TOPLU ritmik grup raporu, ay/tekrar ay/search filtresi, ritmik/tum gorunumu ve onayli TOPLU isareti kaldirma.
   - Guvenlik: TOPLU isareti kaldirma Mikro yazma oldugu icin mobil onay penceresi ile calisir.

32. Portal uygulamasina `Karar Destek` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> barter-radar, sticky-discounts, discount-below-entry-cost, demand-pattern, category-churn, category-opportunity ve demand-pattern siparise getir metotlari.
   - UI: `mobile/portal/src/screens/DecisionSupportScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: borc-mal takasi radar kartlari, yapiskan iskonto filtresi, indirimli fiyati giris maliyeti alti riskleri, Merkez/Topca talep deseni, kategori churn filtresi, kategori firsat onerileri, satirdan `Cari 360` / `Urunler` aksiyonlari, tablet genisliginde iki kolon kart duzeni ve talep deseninde onayli "siparise getir" aksiyonu.
   - Guvenlik: Demand pattern "siparise getir" Mikro/min-max etkili oldugu icin mobil onay penceresi ile calisir.

33. Portal uygulamasina `Aile Raporlari` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> family-management suggestions/clusters/outliers, family-unit-mismatch, aileden urun cikarma ve aile item unit factor metotlari.
   - UI: `mobile/portal/src/screens/FamilyReportsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: aile onerileri, kume kartlari, aile aykiri urunleri, birim katsayi uyumsuzluklari, arama/limit filtresi, onayli aileden urun cikarma ve item katsayisi kaydetme.
   - Not: Webdeki tam aile CRUD, fiyat ailesi maliyet karsilastirmasi, export ve genis tablo derinligi henuz mobilde birebir yok.

34. Portal uygulamasina `Geri Kazanim Raporu` mobil ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> customer-recovery ana rapor, historical-value raporu, tekil aksiyon acma ve toplu atama metotlari.
   - UI: `mobile/portal/src/screens/CustomerRecoveryReportScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: guncel risk ve tarihsel deger sekmeleri, arama/sektor/risk/yil/aktivite filtreleri, KPI kartlari, cari secimi, personel secimi, tekil aksiyon acma ve secili carileri toplu atama.
   - Not: Webdeki genis tablo kolonlari, Excel export, detay drill-down ve grafik/kirilim derinligi henuz mobilde birebir yok.

35. Portal uygulamasina `Saha Ziyaretleri` mobil rapor ekrani eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> field-sales visits rapor metodu.
   - UI: `mobile/portal/src/screens/FieldSalesVisitsScreen.tsx`
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/screens/MoreScreen.tsx`
   - Ozellikler: tarih/search/ziyaret-carisi filtresi, toplam not/cari/ziyaret carisi/fotograf KPI kartlari, cari bazli ozet, sayfali ziyaret notlari, telefon arama, harita, fotograf acma ve ilgili cariyle saha satis ekranina gecis.
   - Not: Webdeki masaustu tablo yogunlugu, fotograf modal kalitesi, Excel export ve tablet yatay QA henuz mobilde birebir yok.

36. Portal `Aile Raporlari` ekrani stok/fiyat aile yonetimi ve fiyat maliyet kontrolu icin genisletildi.
   - API: `mobile/portal/src/api/admin.ts` -> product-families CRUD, price-families CRUD, price-family-costs raporu ve update-cost metotlari.
   - UI: `mobile/portal/src/screens/FamilyReportsScreen.tsx`
   - Ozellikler: mevcut oneriler/kumeler/aykirilar/birim sekmelerine ek olarak Stok Aileleri, Fiyat Aileleri ve Fiyat Maliyet sekmeleri; aile olusturma/duzenleme/silme; kod listesiyle veya urun arama-sec-ekle secicisiyle urun baglama; sorunlu/guncel/tum fiyat maliyet filtresi; pasifleri dahil etme; satir bazli maliyet P/T guncelleme ve fiyat listelerini guncelle switch'i.
   - Guvenlik: Maliyet ve fiyat listesi etkili update-cost aksiyonu mobil onay penceresiyle calisir.
   - Not: Urun secici ve Excel export sonradan eklendi; webdeki kolon genisligi ayarlari, toplu dirty satir guncelleme ve tablet tablo derinligi henuz mobilde birebir yok.

37. Portal `Cari Aktivite` mobil ekrani web raporuna yaklastirildi.
   - UI: `mobile/portal/src/screens/CustomerEngagementScreen.tsx`
   - Ozellikler: mevcut KPI, durum filtresi, bugun aranacaklar, temas/not ve hatirlatildi aksiyonlarina ek olarak webdeki siralama secenekleri mobil segmente tasindi; backend payload'indaki `repBreakdown` satisci kirilimi yatay kartlarla gosterildi.
   - Not: Excel export ve masaustu genis tablo kolonlarinin tamami mobilde bilincli olarak yok; mobilde kart tabanli ozet tercih edildi.

38. Musteri mobil `Urun Detay` ekranina fiyat guven karti eklendi.
   - UI: `mobile/b2b/src/screens/ProductDetailScreen.tsx`
   - Ozellikler: fiyat kaynagi (paket, anlasma, fazla stok indirimi veya cari fiyat listesi), fiyat tipi, KDV gosterimi, stok kontrolu, liste fiyatina gore avantaj, anlasma minimum miktari ve fazla stok siniri bilgileri musterinin urun detayinda gorunur.
   - Not: Backend ek veri gerektirmeden mevcut urun payload'i kullanildi; webdeki tum fiyat vurgulari icin gercek cihaz QA henuz ayrica gerekir.

39. Musteri mobil `Sepet` ekranina fiyat guven ozeti eklendi.
   - UI: `mobile/b2b/src/screens/CartScreen.tsx`
   - Ozellikler: sepet kalem sayisi, KDV tercihi, fiyat tipi kapsami, hediye kampanyasi durumu ve satir bazinda Faturali/Beyaz fiyat rozeti gosterilir.
   - Not: Sepette GWP/hediye secimi ve tamamlayici oneriler zaten vardi; bu faz fiyat baglamini daha net hale getirdi.

40. Portal `Saha Satis` mobil ekranina yeni ziyaret carisi acma akisi eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `createFieldSalesVisitCustomer`.
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`
   - Ozellikler: cari aramada bulunamayan saha ziyaret carisi mobil formdan unvan/telefon/not/talep/rakip bilgisiyle acilir; olusan cari snapshot'i otomatik yuklenir.
   - Not: Fotograf yukleme ve native konum alma mobil forma eklendi; gercek cihaz izin/konum teslim QA akislari henuz ayrica tamamlanmadi.

41. Portal `Saha Satis` -> `Yeni Teklif` mobil koprusu eklendi.
   - Navigasyon: `mobile/portal/src/navigation/AppNavigator.tsx` -> `QuoteCreate` artik `customerIdOrCode` ve miktar/fiyat tasiyan `productPrefills` parametresini alir.
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`, `mobile/portal/src/screens/QuoteCreateScreen.tsx`
   - Ozellikler: secili cari kartindan direkt teklif acma, urun kartindan teklife gecme, teklif ekraninda cari prefill, urun prefill ve stok kodu birebir eslesirse otomatik teklif kalemi ekleme.
   - Kalite: saha satis urun kartlarinda uzun urun adlari kirpilmadan kart icinde satir sarar; stok kodu, kategori rozetleri, fiyat kutulari ve teklif aksiyonlari dar telefonlarda tasma yapmayacak sekilde esner.
   - Not: Webdeki coklu kalem havuzu derinligi, fotograf-konum izin/cihaz QA ve tablet yatay akislari henuz ayrica dogrulanmadi.

42. Portal `Saha Satis` mobil ziyaret notlarina fotograf ve koordinat payload'i eklendi.
   - Backend: `backend/src/controllers/admin.controller.ts`, `backend/src/routes/admin.routes.ts`
   - API: `mobile/portal/src/api/admin.ts` -> `uploadFieldSalesVisitPhoto()`
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`, `mobile/portal/src/screens/FieldSalesVisitsScreen.tsx`
   - Ozellikler: `admin:field-sales` yetkisiyle calisan `/admin/field-sales/visit-photo` endpoint'i eklendi; mevcut cari ziyaret notu ve yeni ziyaret carisi formundan fotograf sec/yukle/kaldir, enlem-boylam gir ve kayitta `photoUrl`, `latitude`, `longitude` olarak gonder.
   - Rapor uyumu: Saha ziyaret raporunda `/uploads/...` gibi goreli fotograf URL'leri public domain'e tamamlanarak mobil tarayicida acilir ve ziyaret kartinda fotograf onizlemesi gosterilir.
   - Not: `expo-location` ile `Mevcut Konumu Al` aksiyonu eklendi; elle koordinat girisi korunur. Gercek cihaz konum izni/teslim QA ayrica gerekir.

43. Portal `Saha Satis` mobil urun kartlari gorselli hale getirildi.
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`
   - Ozellikler: urun kartlarinda sabit 72x72 gorsel alani, goreli `/uploads/...` URL cozumleme, gorsel yoksa kompakt placeholder ve esneyen 3 satirlik urun adi blogu eklendi.
   - Kalite: uzun urun adlari artik fiyat/stok butonlarini itmeden kart icinde sarar; kucuk telefonlarda gorsel alani kompaktlasir, fiyat kutulari alt alta iner ve `Havuza Ekle` / `Teklife Ekle` butonlari daha rahat dokunulan tam genislikli aksiyonlara doner.

44. Portal `Urunler` ekranina mobil katalog kalite karti eklendi.
   - UI: `mobile/portal/src/screens/ProductsScreen.tsx`
   - Ozellikler: urun kartinda 0-100 katalog kalite skoru, ana gorsel, galeri derinligi, birim, liste 1, liste 6, maliyet ve stok verisi kontrolleri gosterilir.
   - Aksiyonlar: kalite detayindan direkt ana gorsel yukleme ve galeri acma; eksik maddeler icin personelin ne yapacagini soyleyen kisa aksiyon metinleri.
   - Kalite: urun ve galeri gorsellerinde goreli `/uploads/...` URL'leri mobilde public domain'e cozulur.

45. Musteri mobil uygulamasinda yerel arama/siralama normalizasyonu baslatildi.
   - Yardimci: `mobile/b2b/src/utils/search.ts`
   - UI: `mobile/b2b/src/screens/ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `AgreementsScreen.tsx`, `PurchasedProductsScreen.tsx`, `NewCategoriesScreen.tsx`, `QuotesScreen.tsx`
   - Ozellikler: Turkce karakter, buyuk/kucuk harf ve aksan farklarini normalize eden ortak helper eklendi; musteri urun listelerindeki A-Z/Z-A siralama ve yerel filtreler bu helper'i kullanir.
   - Not: Backend kaynakli urun/cari arama hassasiyeti icin sunucu tarafinda ayrica ortak normalize arama katmani gerekir; bu madde mobildeki lokal filtre/siralama gerilemesini kapatir.

46. Backend admin urun/cari aramalarinda Turkce karakter toleransi genisletildi.
   - Backend: `backend/src/controllers/admin.controller.ts`
   - Ozellikler: admin urun listesi aramasi `Product.searchText` normalize alanini da kullanir; admin musteri listesi arama varken yetki/aktiflik kapsamindaki carileri normalize haystack ile filtreleyip dogru pagination total'i dondurur.
   - Kapsam: admin musteri sayfasi, mobil portal musteri secimleri ve admin urun/galeri/katalog kalite operasyonlarinda Turkce/Ing karakter farkindan kaynakli bulunamama riski azalir.
   - Not: Mikro F10 stok/cari aramalari zaten `Turkish_CI_AI` collation kullaniyor; bu madde B2B PostgreSQL tarafindaki admin aramalarini tamamlar.

47. Portal `Cari Aktivite` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/CustomerEngagementScreen.tsx`
   - Ozellikler: aktif arama, durum, siralama ve bugun aranacaklar filtreleri korunarak tum yetkili cari listesi 500'luk sayfalarla cekilir; XLSX dosyasi cihazda olusturulup native paylasim menusuyle acilir.
   - Kapsam: webdeki cari aktivite raporu export paritesi mobilde operasyonel hale geldi; sales rep kapsam filtresi backend raporda aynen korundugu icin temsilci sadece yetkili cari export eder.

48. Portal `Saha Ziyaretleri` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/FieldSalesVisitsScreen.tsx`
   - Ozellikler: aktif arama, tarih araligi ve ziyaret-carisi filtresi korunarak tum ziyaretler 500'luk sayfalarla cekilir; tarih, cari, personel, telefon, il/ilce, not, talep, rakip, koordinat ve fotograf URL kolonlariyla XLSX olusturulur.
   - Kapsam: webdeki saha ziyaret raporu export/kanit paylasimi mobilde operasyonel hale geldi; fotograf URL'leri mobilde public domain'e cozulur.

49. Portal `Geri Kazanim Raporu` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/CustomerRecoveryReportScreen.tsx`
   - Ozellikler: guncel risk ve tarihsel deger sekmelerinde aktif filtreler korunarak rapor 500'luk sayfalarla cekilir; kayip potansiyel, risk, dusus, son satis ve onerilen aksiyon kolonlariyla XLSX olusturulup native paylasim menusune verilir.
   - Kapsam: geri kazanma aksiyon merkezi mobilde artik sadece aksiyon acma/toplu atama degil, sahada filtreli raporu paylasma isini de karsilar.

50. Portal genel `Raporlar` ekranina ortak Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/ReportsScreen.tsx`
   - Ozellikler: maliyet, kar, fiyat, top urun, top cari, urun-cari, tamamlayici eksik, musteri aktivitesi, musteri sepetleri ve aksiyon radari sekmelerinde ekranda yuklu olan rapor satirlari tipine uygun kolonlarla XLSX'e aktarilir.
   - Detay: musteri sepetlerinde export sepet bazinda kalmayip kalem satirlarina iner; aksiyon radari export'u grup, baslik, detay ve aksiyon etiketini tasir.
   - Not: Bu faz mobilde sahada hizli paylasimi kapatir; webdeki tum raporlarda "tum sayfalari serverdan tekrar cekerek export" derinligi her rapor tipi icin ayrica gelistirilebilir.

51. Portal `Karar Destek` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/DecisionSupportScreen.tsx`
   - Ozellikler: takas radari, yapiskan iskonto, maliyet alti indirim, talep deseni, kategori churn ve kategori firsat sekmelerinde yuklu rapor satirlari kendi is kolonlariyla XLSX'e aktarilir.
   - Detay: talep deseninde sinif/CV2/ADI/stok, firsat ekraninda ilk onerilen urun, takas ekraninda potansiyel ve maliyet alti ekranda gap/zarar kolonlari disari verilir.

52. Portal `Denetim Raporlari` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/AuditReportsScreen.tsx`
   - Ozellikler: personel aktivite raporu ve TOPLU denetim raporu yuklu/filtreli satirlari XLSX olarak native paylasim menusune verir.
   - Detay: TOPLU export'u ritmik filtreyi ve arama sonucunu kullanir; cari, urun, ritmik durum, ay sayisi, miktar, tutar ve son satis kolonlarini tasir.

53. Musteri mobil ana sayfasina GWP / hediyeli kampanya vitrini eklendi.
   - UI: `mobile/b2b/src/screens/HomeScreen.tsx`
   - Ozellikler: aktif hediyeli kampanya mobil ana ekranda banner gorseli, baslik/aciklama, sepet toplami, baraj ilerleme cubugu, kalan tutar veya hediye secimine hazir durumu ve ilk hediye urunleriyle gosterilir.
   - Aksiyonlar: kampanya karti baraj gecildiyse sepete, gecilmediyse urunlere yollar; hediye kartlari ilgili urun detayina gider ve musteri aktivite takibine kampanya/hediye tiklamasi yazilir.
   - Kapsam: sepet tarafindaki mevcut GWP secim akisi korunarak web ana sayfadaki kampanya farkindaligi mobile tasindi.

54. Portal `Aile Raporlari` mobil ekranina Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/FamilyReportsScreen.tsx`
   - Ozellikler: oneriler, kumeler, aykiri urunler, birim uyumsuzlugu, stok aileleri, fiyat aileleri ve fiyat-maliyet sekmelerinde aktif filtre/arama sonucundaki satirlar XLSX olarak disari aktarilir.
   - Detay: fiyat-maliyet export'u aile satirinda kalmaz; aile urun kalemlerine iner ve maliyet, son giris, fark gun, maliyet tarihi gibi operasyon kolonlarini tasir.
   - Kapsam: webdeki aile/fiyat ailesi raporlarinin mobil sahada paylasilabilir Excel ihtiyaci kapatildi; stok/fiyat ailesi formunda urun arama-sec-ekle secicisi sonradan eklendi. Tablet tablo derinligi ve genis kolon deneyimi ayrica kalir.

55. Portal `Ucarer Depo` mobil ekranina sekme bazli Excel ve PDF paylasimi eklendi.
   - UI: `mobile/portal/src/screens/UcarerDepotScreen.tsx`
   - Ozellikler: depo karar raporu, tedarikci siparis taslagi, MinMax job sonucu, MinMax haric urun raporu ve islem gecmisi sekmeleri XLSX ve PDF olarak disari aktarilir.
   - Detay: depo karar export'u urun, aile/model, oneri, stok, min/max, alinan/verilen siparis ve maliyet kolonlarini tasir; haric urun export'u 1/2/3 ay cari sayilarini, log export'u islem/tarih/kullanici/siparis detaylarini verir.
   - Kapsam: Ucarer depo karar ve denetim verileri mobilde sahadan Excel/PDF olarak paylasilabilir hale geldi; tedarikci siparis taslagi, temel aile kapsama paneli, karsi-depo DSV onerisi, son seri chip'i, koliye tamamlama, maliyet, ana saglayici aksiyonlari ve olusan siparisler icin tedarikci/yonetici PDF ciktisi sonradan eklendi. Webdeki ileri aile dagitim/edit paneli ve tablet QA ayrica kalir.

56. Portal `Denetim Raporlari` TOPLU aday tarama ve isaretleme mobile eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getTopluCandidates()`, `markTopluCandidateLines()`
   - UI: `mobile/portal/src/screens/AuditReportsScreen.tsx`
   - Ozellikler: Personel ve TOPLU sekmelerine ek olarak `Adaylar` sekmesi geldi; ay sayisi, sicrama katsayisi, minimum miktar ve arama filtresiyle TOPLU olmayan ani-sicrama satis gruplari listelenir.
   - Aksiyonlar: aday kartinda sicrama evraklari, tipik/sicrama miktari ve tutar gorulur; onayla `Bu Adayi TOPLUya Al` aksiyonu ilgili Mikro satis satirlarini TOPLU isaretler ve sonuc sayisini kartta gosterir.
   - Export: TOPLU adaylari da Excel paylasimina dahil edildi; cari, urun, evrak sayisi, tipik miktar, sicrama miktari/tutari ve evrak listesi disari verilir.

57. Portal `Vade Takip` ana mobil ekranina sekme bazli Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/VadeScreen.tsx`
   - Ozellikler: Bakiyeler, Notlar, Hatirlatma Takvimi ve Atamalar sekmelerinde aktif filtre/kapsam korunarak XLSX olusturulur ve native paylasim menusune verilir.
   - Detay: Bakiye export'u yalniz ekranda yuklu 80 kayitla kalmaz; aktif arama filtresiyle yetkili tum sonuc sayfalari 500'luk API istekleriyle toplanir. Not, takvim ve atama export'lari ilgili sekmenin mevcut filtrelerini tekrar sorgular.
   - Kapsam: Webdeki vade not/hatirlatma/atama operasyonunun mobil sahada paylasilabilir rapor ihtiyaci kapatildi. Toplu Excel import sonraki parite turunda mobilde de tamamlandi; tek cari manuel duzeltme formu ayrica korunur.

58. Portal `Cari 360` mobil ekranina cok sayfali Excel paylasimi eklendi.
   - UI: `mobile/portal/src/screens/Customer360Screen.tsx`
   - Ozellikler: Secili cari icin Ozet, Satis-Teklif, Sepet, Fiyat Guven, Vade-Temas, Aktivite ve Faturalar sayfalarindan olusan XLSX dosyasi olusturulur ve native paylasim menusune verilir.
   - Detay: Export mevcut `getCustomer360` payload'indaki siparis, teklif, sepet kalemleri, fiyat guven karti, vade notlari, temas gecmisi, aktivite sayfalari ve fatura satirlarini is kolonlarina ayirir.
   - Aksiyon: Sepet bolumunde mobilde `Sepet Raporu` gecisi ve onayli `Sepeti Temizle` aksiyonu vardir; mevcut backend yetki/sektor kontrolu korunur ve temizlik sonrasi Cari 360 yeniden yuklenir.
   - Kapsam: Mobil Cari 360 artik sadece ekranda okuma degil, sahada cari ozetini paylasma/arsivleme ve gerekli durumda musteri sepetini temizleme isini de karsilar. Webdeki tum sekmeli tablo yogunlugu ve tablet QA ayrica kalir.

59. Portal `Pasif Stoklar / Stok Acma` mobil formuna stok ve fiyat ailesi secimi eklendi.
   - UI: `mobile/portal/src/screens/PassiveStocksScreen.tsx`
   - Ozellikler: Stok acma ve pasif stok aktiflestirme formunda stok ailesi coklu secim, fiyat ailesi tekli secim, aile adi/kodu/icindeki urunle arama, secili aile temizleme ve aile uyelerinden kisa onizleme var.
   - Backend uyumu: Mobil payload artik `stockFamilyIds` ve `priceFamilyId` alanlarini dolu gonderir; mevcut backend stok olustuktan/aktiflestikten sonra urunu secilen stok ailelerine ve fiyat ailesine non-fatal olarak ekler.
   - Kapsam: Web stok acma ekranindaki aile atama operasyonu mobilde temel seviyede pariteye geldi. Ek birim derinligi ayrica kalir.

60. Portal `Pasif Stoklar / Stok Acma` mobil formuna lookup/autocomplete secicileri eklendi.
   - UI: `mobile/portal/src/screens/PassiveStocksScreen.tsx`
   - API: `mobile/portal/src/api/admin.ts` -> `getStockCreateLookups()`
   - Ozellikler: Sablon, ana saglayici, marka, kategori ve ambalaj alanlari icin mobil arama paneli, limitli sonuc listesi, secimle manuel inputlari doldurma, secimi temizleme ve hata/boş sonuc geri bildirimi var.
   - Kapsam: Mobil stok acma formu webdeki referans secici akisini sahada kullanilabilir hale getirdi; manuel inputlar korunarak hizli lookup katmani eklendi.

61. Portal `Pasif Stoklar / Stok Acma` mobil formuna ek birim editoru eklendi.
   - UI: `mobile/portal/src/screens/PassiveStocksScreen.tsx`
   - Ozellikler: 2-4. birimler icin en fazla 3 ek birim satiri, birim adi, katsayi, katsayi yonu, kg, en/boy/yukseklik alanlari, satir ekleme/kaldirma ve islem notu alani mobil forma tasindi.
   - Backend uyumu: Mobil payload `extraUnits` dizisini weble ayni alan adlariyla gonderir; backend bos ek birimleri filtreleyip dolu satirlari Mikro birim 2-4 alanlarina yazar.
   - Kapsam: Web stok acma ekranindaki ek birim derinligi mobilde temel operasyon seviyesinde tamamlandi.

62. Musteri mobil uygulamasinda ortak arama normalizasyonu sertlestirildi.
   - UI/Util: `mobile/b2b/src/utils/search.ts`
   - Ozellikler: Urun, anlasmali urun, indirimli urun, daha once aldiklarim, teklif ve yeni kategori aramalarinda kullanilan ortak normalizasyon gercek Turkce karakterleri, buyuk/kucuk harfi ve eski mojibake karakter kalintilarini ayni arama anahtarina indirger.
   - API fallback: `mobile/b2b/src/api/customer.ts` -> `getProducts()` artik ilk arama zayif/bos donerse Turkce karakterli varyantlarla sinirli tekrar arama yapar ve sonuclari tekillestirir. Ornek: `pecete` aramasi bos kalirsa `pecete`nin Turkce karakterli varyantlari denenir.
   - Kapsam: Mobil musteri urun, anlasmali, indirimli ve daha once aldiklarim aramalari webde istenen buyuk/kucuk harf ve Turkce/Ingilizce karakter duyarsizligi standardina yaklastirildi; sunucu ortak arama katmani yine ayrica guclendirilebilir.

63. Portal `Urunler` mobil katalog kalite workflow'u aksiyon listesine cevrildi.
   - UI: `mobile/portal/src/screens/ProductsScreen.tsx`
   - Ozellikler: Urun listesi artik kalite KPI kartlari, `Kritik`, `Orta`, `Gorselsiz` ve `Galeri eksik` filtreleriyle calisir; personel dusuk kaliteli katalog kalemlerini tek tek aramak yerine aksiyon listesine indirger.
   - Aksiyonlar: kalite detayindan ana gorsel yukleme ve galeri acma korunur; filtrelenmis listede bos sonuc mesaji vardir.
   - Detay: Kart icindeki `Detayli Kunye` paneli web urun detay modalina karsilik kategori, birimler, KDV, musteri gorunumu, kalite skoru, maliyetler, 10 fiyat listesi, depo stoklari, bekleyen siparis/fazla stok dagilimi ve gorsel senkron metadata sekmelerini gosterir.
   - Tablet: 920px ve ustunde urun kartlari iki kolonlu grid olarak yerlesir, telefonlarda tek kolon korunur.
   - Kapsam: Aksiyon Radari'nda gorulen katalog/gorsel kalite problemlerinin mobil `Urunler` ekraninda bulunup gorsel/galeri aksiyonuna donmesi kolaylasti; webdeki urun detay okuma derinligi mobilde buyuk oranda kapandi. Katalog zenginlestirme toplu aksiyonlari ve gercek cihaz gorsel QA yine ayrica kalir.

64. Portal `Tedarik Maliyetleri` mobil fiyat teyit ve ihale ekranlari aksiyon alinabilir hale getirildi.
   - UI: `mobile/portal/src/screens/SupplierCostsScreen.tsx`
   - API: `mobile/portal/src/api/admin.ts` icindeki mevcut `addPriceVerificationOffer`, `submitPriceVerificationToSales` ve `addTenderCostOffer` endpointleri kullanildi; backend kontrati degistirilmedi.
   - Fiyat teyit: Talep kartinda mevcut alternatif fiyatlar gorunur; mobilde tedarikci arama/secme, tedarikci urun kodu, Maliyet T/P, para birimi, kur, birim, katsayi, KDV, min siparis, termin, gecerlilik, ek dosya linki ve not ile fiyat alternatifi girilebilir.
   - Sistem uygulama: Fiyat alternatifi eklerken `Mikro maliyetine uygula` ve `fiyat listelerini de guncelle` secimleri mobilde acilip kapatilabilir; Mikro uygulama secilirse ikinci onay sorulur.
   - Ihale: Ihale karti genisletilince kalemler, hedef fiyat, mevcut teklifler, ek linkleri ve en iyi teklif bilgisi gorunur; her kaleme tedarikci/nakliye/termin/kur/KDV/not/ek link alanlariyla fiyat girilebilir.
   - Dosya: Supplier cost ana maliyet formu, fiyat teyit teklif formu ve ihale kalem teklif formu mobil dosya sec/yukle, dosyayi ac ve link temizle aksiyonlarini destekler; mevcut manuel URL alani korunur.
   - Karar/not: fiyat teyit detayinda alternatif fiyat secme, secili fiyati onaylama, talebi reddetme, talep notu ekleme ve mevcut not gecmisini okuma eklendi.
   - Yeni stok: `NEW_STOCK` fiyat teyitlerinde stok karti taslagi mobilde duzenlenebilir hale geldi; sablon, ad, tedarikci urun kodu, birim, KDV, ana saglayici, marka, kategori, ambalaj, raf, 5 marj ve olcu/kg alanlari tamamlama payload'ina dahil ediliyor.
   - Kapsam: Mobil satin alma artik fiyat teyit ve ihale taleplerini sadece izlemek yerine sahadan fiyat girebilir, teklif dosyasi yukleyebilir, satis onayina gonderebilir, secili fiyati onaylayabilir/reddedebilir, not gecmisi tutabilir ve yeni stok karti payload'iyla tamamlayabilir. Webdeki kanban/masaustu modal yogunlugu ve canli Mikro uygulama QA yine ayrica kalir.

65. Portal `Saha Satis` mobil ekranina teklif havuzu eklendi ve uzun urun adlari kirpilmadan sarar hale getirildi.
   - UI: `mobile/portal/src/screens/FieldSalesScreen.tsx`
   - UI/Route: `mobile/portal/src/screens/QuoteCreateScreen.tsx`, `mobile/portal/src/navigation/AppNavigator.tsx`
   - Ozellikler: Urun kartlarinda `Havuza Ekle` aksiyonu geldi; saha personeli arama sonucundan birden fazla urunu ayni ekranda toplar, miktari +/- ve manuel input ile duzenler, `Havuzu Teklife Aktar` ile tek seferde teklif ekranina gecer.
   - Teklif entegrasyonu: `QuoteCreate` artik `productPrefills` route parametresini okur, stok kodlarini mevcut `getProductsByCodes` endpointiyle urune cevirir ve miktar/fiyat/fiyat tipiyle teklif satirlarina ekler.
   - Fiyat/marj: Saha satis havuzunda satir bazinda faturalı/beyaz/son satis fiyat chip'leri, manuel birim fiyat, satir toplami ve safe-mode kapaliyken maliyet/marj ozeti gosterilir; aktarilan fiyat QuoteCreate tarafinda manuel fiyat olarak korunur.
   - Ergonomi: Urun adi alaninda satir siniri kaldirildi; kart aksiyonlari dar ekranda sarar, tek urun icin eski `Teklife Ekle` aksiyonu korunur.
   - Kapsam: Saha satisin mobilde tek tek urun tiklayip teklif ekranina gidip gelme yorgunlugu azaldi; temel coklu kalem, fiyat/marj ve teklif aktarimi mobilde var. Gercek cihaz/tablet QA ve webdeki masaustu tablo yogunlugu ayrica kalir.

66. Portal `Geri Kazanim Aksiyonlari` mobil ekraninda aksiyon-state workflow guclendirildi.
   - UI: `mobile/portal/src/screens/RecoveryActionsScreen.tsx`
   - Ozellikler: Takip tarihi gecmis veya bugun olan aksiyonlar kart seviyesinde renkle vurgulanir; her kartta gecikti/bugun/future takip rozeti gorunur.
   - Hizli aksiyon: Sonuc notu icin `Arandi, ulasilamadi`, `Tekrar aranacak`, `Siparis sozu alindi`, `Ihtiyac yok`, `Rakipten aliyor` sablonlari; takip tarihi icin `Bugun`, `Yarin`, `3 gun`, `1 hafta`, `Tarih yok` kisayollari eklendi.
   - Tablet: 860px ve ustunde aksiyon kartlari iki kolonlu grid olarak yerlesir; sahada telefon tek kolon korunur.
   - Kapsam: Mobil aksiyon ekrani sadece serbest metin kaydetme degil, sahada hizli durum guncelleme ve takip planlama akisi sunar. Webdeki genis tablo/detay modal ve otomatik aksiyon kapanis kurallari yine ayrica kalir.

67. Portal mobil admin aramalari Turkce/Ing karakter fallback'iyle guclendirildi.
   - Util: `mobile/portal/src/utils/search.ts`
   - API: `mobile/portal/src/api/admin.ts`
   - Kapsam: `getProducts`, `searchCustomer360`, `searchFieldSalesCustomers`, `searchFieldSalesProducts`, `searchSupplierCostProducts`, `searchSupplierCostSuppliers` ilk arama zayif/bos donerse sinirli Turkce karakter varyantlariyla tekrar arar ve sonuclari tekillestirir.
   - Etki: Saha satis, Cari 360, tedarik maliyetleri ve portal urun aramalarinda buyuk/kucuk harf ve Turkce/Ingilizce karakter duyarliligi kaynakli bos sonuc riski azaldi; mevcut filtre/siralama/kategori kolayliklari korunur.

68. Portal `Ucarer Depo` mobil ekranina tedarikci siparis taslagi, karsi-depo DSV onerisi, DSV transfer seti ve satir operasyonlari eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `createSupplierOrdersFromFamilyAllocations()`, `createDepotTransferOrder()`, `getUcarerDepotMinMax()`, `updateUcarerProductCost()`, `updateUcarerMainSupplier()`.
   - UI: `mobile/portal/src/screens/UcarerDepotScreen.tsx`
   - Ozellikler: Ucarer karar raporundaki onerili satirlar tek tek veya toplu olarak `Siparis Taslagi` sekmesine alinabilir; personel mobilde tedarikci bazinda seri, vergili/vergisiz, teslim tipi/tarihi, satir miktari, birim fiyat ve tedarikci cari kodunu duzenleyebilir. Basarili siparislerden sonra supplier bazli son seriler cihazda tutulur ve sonraki taslakta tek dokunuslu seri chip'i olarak gelir.
   - DSV transfer: Taslak satiri karsi depo stok/min kontrolu uygun oldugunda `Karsi depodan DSV onerisi` paneliyle otomatik onerilen miktar kadar transfer setine alinabilir; uygun degilse `DSV'ye Al` ile manuel olarak tedarikci siparisinden ayrilip depolar arasi transfer setine tasinir. Kismi DSV'de kalan miktar tedarikci taslaginda kalir, `Geri Al` ile tekrar tedarikci taslagina eklenir. `DSV Transfer Olustur` aksiyonu DSV serisiyle depolar arasi siparis uretir.
   - Koli tamamlama: Taslaktaki urunler icin `getProductsByCodes` ile ikinci birim katsayisi getirilir; katsayi varsa satirda `Koli bilgisi` paneli gorunur ve `Koliye Tamamla` miktari bir sonraki koli katina yukseltir. Katsayi yoksa satir sessizce eski davranisi korur.
   - Aile paneli: `Aile` sekmesi rapor satirlarini aile/model bazinda toplar; aile bazinda kalem, onerili kalem, oneri miktari, stok/min/max ozetini gosterir. Aile detayi acilinca ilk urunler gorulur ve onerili kalemler tek dokunusla siparis taslagina alinabilir.
   - Satir operasyonlari: Karar raporu kartlarinda `Maliyet/Saglayici` paneli acilir; Maliyet P/T girisi, fiyat listelerini de guncelle switch'i ve ana saglayici cari kodu kaydi mobilde yapilabilir.
   - Guvenlik: `Siparisleri Olustur`, `DSV Transfer Olustur`, `Maliyeti Kaydet` ve `Saglayici Kaydet` aksiyonlari Mikro'ya yazmadan once ikinci onay ister; seri ve birim fiyat zorunlu kontrolu vardir. Kismi basarida olusan tedarikciler taslaktan dusurulur, hatali kalanlar tekrar denenebilir.
   - PDF: Basarili tedarikci siparisi sonrasi `Tedarikci PDF` ve `Yonetici PDF` aksiyonlari son islem kartinda gorunur; mobil paylasim akisi icin her tedarikciyi tek paylasilabilir PDF icinde ayri bolum olarak verir, yonetici PDF'i cari/siparis/tutar ozetini ve kalem detaylarini tasir.
   - Kapsam: Webdeki Ucarer tedarikci siparis modalinin, temel aile kapsama panelinin, karsi-depo DSV onerisinin, manuel DSV transfer setinin, son seri secim kolayliginin, koliye tamamlama kolayliginin, maliyet guncellemenin, ana saglayici degistirmenin, sekme bazli PDF/Excel paylasiminin ve olusan siparis PDF ciktisinin mobildeki temel operasyon karsiligi artik var. Webdeki ileri aile dagitim/edit paneli derinligi henuz ayrica kalir.

69. Musteri mobil siparis/teklif/talep listeleri ve detaylari tablet/parite seviyesine yaklastirildi.
   - UI: `mobile/b2b/src/screens/OrdersScreen.tsx`, `QuotesScreen.tsx`, `RequestsScreen.tsx`, `OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`, `RequestDetailScreen.tsx`
   - Ozellikler: Siparis, teklif ve talep listelerinde arama, durum filtresi, ozet KPI kartlari, bos durum metinleri ve tablet genisliginde iki kolon kart duzeni eklendi.
   - Detay: Siparis/teklif/talep detay kalemleri tablet genisliginde iki kolonlu kartlara alindi; teklif/siparis kalemlerinde fiyat tipi, talep kalemlerinde birim bilgisi gorunur hale geldi.
   - Kapsam: Musteri mobil uygulamasinda eski "duz liste" deneyimi webdeki filtrelenebilir takip mantigina yaklasti; gercek cihaz gorsel QA yine ayrica kalir.

70. Musteri mobil bekleyen siparis, talep ve bildirim ekranlari operasyonel liste standardina yaklastirildi.
   - UI: `mobile/b2b/src/screens/PendingOrdersScreen.tsx`, `CustomerTasksScreen.tsx`, `NotificationsScreen.tsx`
   - Tip: `mobile/b2b/src/types.ts` -> `Notification.category`
   - Bekleyen siparisler: siparis no/urun/kod aramasi, geciken/bugun/gelecek filtreleri, siparis-satir-kalan miktar-toplam KPI kartlari, geciken teslim uyarisi, teslim durum rozetleri, bos durum metni ve tablet genisliginde iki kolon kart duzeni eklendi.
   - Talepler: mevcut talep olusturma ve Kanban/List tercih mantigi korunarak arama, durum chip filtreleri, toplam/filtre/acik/yuksek oncelik KPI kartlari, durum/oncelik rozetleri, atanan kisi/tip bilgisi ve listede tablet iki kolon duzeni eklendi; Kanban kolonlari tablet genisliginde yan yana sarar.
   - Bildirimler: baslik/icerik/kategori aramasi, okundu/okunmadi filtresi, kategori chip'leri, toplam/yeni/filtre KPI kartlari, bildirim kategori/tarih rozetleri, link bilgisi, yenile aksiyonu, bos durum metni ve tablet iki kolon duzeni eklendi.
   - Kapsam: Musteri mobil uygulamasinda webdeki takip/bildirim operasyonlarina denk dusen ekranlar sadece tek kolon eski liste olmaktan cikti; gercek cihaz push teslimi ve iOS/Android gorsel QA yine ayrica kalir.

71. Musteri mobil fatura listesi filtrelenebilir ve tablet uyumlu hale getirildi.
   - UI: `mobile/b2b/src/screens/InvoicesScreen.tsx`
   - Ozellikler: Mevcut fatura no/tarih araligi sunucu filtreleri ve PDF ac/paylas aksiyonu korunarak eslesmis/eksik/bulunamadi durum chip'leri, toplam/bu sayfa/filtre/tutar KPI kartlari, sayfa bilgisi, yerel arama normalizasyonu ve bos durum metni eklendi.
   - Tablet: 820px ve ustunde fatura kartlari iki kolonlu grid olarak yerlesir; telefonlarda tek kolon korunur.
   - Kapsam: Musteri mobil e-fatura deneyimi webdeki filtreli takip standardina yaklasti; web admin fatura ekranindaki VKN gorunurlugu ayrica admin/mobile portal tarafinda izlenmelidir.

72. Musteri mobil talep detayi takip baglami ve tablet duzeniyle guclendirildi.
   - UI: `mobile/b2b/src/screens/CustomerTaskDetailScreen.tsx`
   - Ozellikler: Talep detayina durum/oncelik rozetleri, cari/atanan/olusturma/guncelleme bilgi kutulari, yorum tarihleri, bos yorum/ek/link durumlari ve link satirlari eklendi.
   - Aksiyonlar: Mevcut yorum gonderme ve dosya yukleme aksiyonlari korundu; kayit/yukleme sirasinda buton metni durum bildirir.
   - Tablet: 820px ve ustunde yorumlar ile ekler/linkler iki kolonlu detay duzenine ayrilir.
   - Kapsam: Musteri talep listesi ile detay ekrani ayni operasyon standardina yaklasti; gercek cihaz dosya yukleme/acma QA ayrica kalir.

73. Musteri mobil sepet ve ana urun gridleri telefon/tablet responsive standardina yaklastirildi.
   - UI: `mobile/b2b/src/screens/CartScreen.tsx`, `ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `PurchasedProductsScreen.tsx`, `AgreementsScreen.tsx`
   - Sepet: mevcut satir notu, miktar guncelleme, hediye kampanya secimi, tamamlayici oneriler, siparis/talep olusturma ve fiyat guven ozeti korunarak tablet genisliginde sepet kalemleri iki kolonlu kart duzenine alindi.
   - Sepet ergonomisi: sepet guven ozetine toplam miktar ve fiyat tipi satir sayilari eklendi; bos sepette acik mesaj ve `Urunlere Git` aksiyonu geldi.
   - Urun gridleri: tum urunler, indirimli urunler, daha once aldiklarim ve anlasmali urunler artik ekran genisligine gore kolon sayisini ayarlar: kucuk telefon tek kolon, genis telefon iki kolon, tablet uc kolon. Sabit iki kolon kaynakli dar ekran sikismasi azalir.
   - Kapsam: Musteri mobilindeki en yogun alisveris akislari farkli telefon/tablet ebatlarina daha uygun hale geldi; gercek cihazda uzun urun adi, gorsel oranlari ve checkout QA yine ayrica kalir.

74. Musteri mobil ana sayfa ve yeni kategori kesfi tablet/telefon responsive standardina yaklastirildi.
   - UI: `mobile/b2b/src/screens/HomeScreen.tsx`, `mobile/b2b/src/screens/NewCategoriesScreen.tsx`
   - Ana sayfa: mevcut ozet kartlari, banner vitrini, GWP/hediye kampanyasi vitrini, koleksiyon/kategori/anlasmali fiyat/bekleyen siparis/fatura/talep hizli girisleri korunarak genis telefon ve tabletlerde kartlar kolonlu yerlesime alindi; vitrin ve hediye urun kart genislikleri ekran boyutuna gore ayarlanir.
   - Yeni kategoriler: hic alinmayan kategori kesfi ekraninda mevcut arama, kategori chip'i, siralama, faturali/beyaz fiyat secimi, stok/rozet/fiyat guven bilgisi ve sepete ekleme korunarak tablet genisliginde urun kartlari iki kolonlu listeye alindi.
   - Kapsam: Musteri mobil ana ekran artik tabletlerde bos/uzayan tek kolon hissi vermiyor; kategori kesfi de urun kartlarini daha profesyonel ve taranabilir kullaniyor. Gercek cihaz gorsel QA ve canli kampanya/banner verisiyle karsilastirma yine ayrica gerekir.

75. Musteri mobil urun detayi ve hesap/yardimci ekranlari tablet ergonomisine yaklastirildi.
   - UI: `mobile/b2b/src/screens/ProductDetailScreen.tsx`, `MoreScreen.tsx`, `PreferencesScreen.tsx`, `ProfileScreen.tsx`
   - Urun detayi: mevcut coklu galeri, stok rozeti, paket icerigi, anlasma/fazla stok bilgisi, fiyat guven karti, miktar secimi, sepete ekleme ve tamamlayici oneriler korunarak tablet genisliginde sol galeri + sag fiyat/aksiyon paneli duzeni eklendi; onerilen urun kartlari tabletlerde daha genis kullanilir.
   - Daha Fazla: webdeki musteri hesap alanlarina giden hizli menu kartlari genis telefon/tabletlerde iki/uc kolonlu grid olarak yerlesir; `Yeni Kategoriler`, bekleyen siparis, fatura, teklif, bildirim ve tercih girisleri korunur.
   - Tercihler/Profil: KDV tercihi, bildirim kategori switch'leri, push kayit/test aksiyonu ve profil bilgileri korunarak tabletlerde merkezi/genislik kontrollu yerlesim saglandi; profil ekrani kucuk telefonlarda scroll eder.
   - Kapsam: Musteri mobilinde urun inceleme ve hesap ayarlari artik tabletlerde profesyonel iki bolumlu/kolonlu calisir. Native push teslimi, gercek cihaz gorsel QA ve iOS/Android izin akisi ayrica dogrulanmalidir.

76. Portal mobil `Daha Fazla` modulu admin yuzeyine uygun navigasyon merkezine cevrildi.
   - UI: `mobile/portal/src/screens/MoreScreen.tsx`
   - Katalog: `mobile/portal/src/navigation/portalModules.ts`
   - Erişim katmani: `mobile/portal/src/context/PortalAccessContext.tsx`, `mobile/portal/src/navigation/PortalAccessGuard.tsx`, `mobile/portal/src/navigation/AppNavigator.tsx`, `mobile/portal/src/navigation/PortalTabs.tsx`
   - Kapsam: Mevcut tum portal/admin linkleri korunarak moduller `Satis ve Cari`, `Operasyon`, `Katalog`, `Tedarik`, `Vitrin`, `Rapor`, `Vade`, `Sistem` bolumlerine ayrildi.
   - Kullanım: Modul/rapor/operasyon aramasi eklendi; arama `normalizeSearchText` ile Turkce/Ing karakter ve buyuk/kucuk harf toleransli calisir. Bolum chip'leriyle uzun liste filtrelenebilir.
   - Yetki: Portal `Daha Fazla` artik `getMyPermissions` sonucunu kullanarak web admin navigasyonundaki permission anahtarlarina gore linkleri gizler; izin endpoint'i gelene kadar geriye uyum icin linkler gecici gorunur, izin `false` geldiginde modul karti listeden duser. Rol bazli kritik linkler de katalog seviyesinde sinirlanir; `Rol Yetkileri` sadece `HEAD_ADMIN` icin gorunur.
   - Route guvencesi: Stack ekranlari da ayni katalogdan gelen permission/rol guard'ina baglandi; detay ekranlari parent modulu miras alir (`QuoteDetail` -> `admin:quotes`, `VadeCustomer` -> `admin:vade`, `TaskDetail` -> `admin:requests`). Alt tablarda `Teklifler`, `Siparisler`, `Talepler` permission'a gore gizlenir ve tab icerigi de guard'dan gecer; permission yuklenirken opsiyonel tablar kisa sureli gorunmez, `Daha Fazla` her zaman kalir.
   - Tablet: Genis telefon ve tabletlerde kartlar iki/uc kolonlu grid olarak yerlesir; telefonlarda tek kolon korunur.
   - Kapsam disi: Canli rol hesaplariyla cihaz uzerinde navigasyon QA henuz ayrica dogrulanmalidir; bu tur mevcut modulleri daha taranabilir, yetki uyumlu ve profesyonel bir portal merkezine tasidi.

77. Portal mobil `Rol Yetkileri` ekrani webdeki yonetim kalitesine yaklastirildi.
   - UI: `mobile/portal/src/screens/RolePermissionsScreen.tsx`
   - Tip: `mobile/portal/src/types.ts` -> `UserRole` artik backenddeki `DEPOCU` rolunu da kapsar.
   - Ozellikler: HEAD_ADMIN disindakilere ekran ici erisim engeli, yukleniyor durumu, rol ozet kartlari, rol chip'leri, yetki aramasi, dashboard/rapor/admin kategori filtresi, kategori bazli gruplama, aninda kayit durum metni ve reset onayi eklendi.
   - Tablet: 1080px ve ustunde yetki kartlari iki kolonlu grid olarak yerlesir; telefonlarda tek kolon korunur.
   - Kapsam: Mobil portalda hassas rol/izin yonetimi artik uzun duz liste degil, arama ve kategoriyle taranabilir bir HEAD_ADMIN operasyon ekranidir. Canli rol hesaplariyla cihaz QA henuz ayrica kalir.

78. Mobil bildirim/deep-link yonlendirme kapsami yeni web route'lariyla genisletildi.
   - Musteri app: `mobile/b2b/src/navigation/notificationLinking.ts`
   - Portal app: `mobile/portal/src/navigation/notificationLinking.ts`
   - Musteri kapsami: bildirim linkleri artik koleksiyon detay/listesi, sepet, indirimli urunler, daha once aldiklarim, anlasmalar, bekleyen siparisler, faturalar, yeni kategoriler, tercihler ve profil ekranlarina da gider; query/hash bulunan linkler once temizlenir.
   - Portal kapsami: bildirim linkleri artik cari 360, saha satis/ziyaret, sicak satis, depo, resim hata, siparis takip, vade panel/analiz/yonetim, urunler/paketler, urun olcu, pasif stok, cari aktivite, geri kazanim, Ucarer, aile raporlari, karar destek, denetim raporlari, operasyon, tedarik maliyetleri/listeleri, ayarlar ve personel ekranlarina mobil karsilikla gider.
   - Etki: Webden gelen bildirim linkleri mobilde bos/default ekrana dusme riskini azaltir; yeni route guard sayesinde portalda yetkisiz linkler yine erisim engeli ekraninda kalir.

79. Portal mobil dashboard ortak yetki katmanina ve kart bazli permission duzenine yaklastirildi.
   - UI: `mobile/portal/src/screens/DashboardScreen.tsx`
   - Yetki: Dashboard artik kendi icinde ikinci kez permission cekmek yerine `PortalAccessContext` kullanir. Widget ve rapor tercihleri bu ortak permission sonucuna gore uygulanir.
   - Kart kapsami: `dashboard:orders`, `dashboard:customers`, `dashboard:excess-stock`, `admin:quotes`, `admin:notifications`, `dashboard:stok-ara`, `dashboard:cari-ara` gibi izinler kart/widget/quick action seviyesinde ayrisir; kapali yetkiye ait kart tercih panelinde de pasif kalir.
   - Tablet: Ozet/metrik/hizli aksiyon kartlari genis ekranda iki kolonlu responsive grid'e alindi; telefonlarda tek kolon korunur.
   - Etki: Mobil panel webdeki dashboard permission mantigina daha yakin calisir ve genis tabletlerde uzun tek kolon hissi azalir. Canli rol hesaplariyla cihaz QA henuz ayrica kalir.

80. Portal mobil `Arama` ekrani web F10 stok/cari arama davranisina yaklastirildi.
   - UI: `mobile/portal/src/screens/SearchScreen.tsx`
   - Yetki: Stok ve cari modlari artik `dashboard:stok-ara` / `dashboard:cari-ara` izinlerine gore ayri ayri gorunur; kullanicinin yetkisi olmayan mod secilmez, ikisi de kapaliysa ekran icinde erisim engeli mesaji gosterilir.
   - Kolonlar: Webdeki kullanici bazli kolon secimi korunur; varsayilan kolonlar Turkce/Ing karakter farklarinda normalize edilerek secilir, `Koli Ici` sanal kolonu mobilde de hesaplanir ve `msg_*` kolonlari okunur adlarla gosterilir.
   - Arama: Sonucsuz kalan stok/cari aramalarda Turkce/Ing karakter varyantlari denenir; stok tarafinda webdeki `Tum stoklar` kolayligi mobilde de vardir. Hata durumunda obje render etmeyen net metin mesaji gosterilir.
   - UI: Uzun urun/cari adlari ve alan degerleri kart icinde satir sarar; tabletlerde sonuc kartlari iki kolonlu grid'e gecerek tek kolon uzamasini azaltir. Stok detay modalinda GUID gizlenir ve alan adlari okunur hale gelir.
   - Kapsam: Web F10 arama pratikleri mobil portala daha yaklasti; canli Mikro kesintisi/timeout ve gercek cihaz uzun kolon QA yine ayrica dogrulanmalidir.

81. Portal mobil `Aksiyon Radari` daha aksiyon-merkezi gibi calisir hale getirildi.
   - UI: `mobile/portal/src/screens/ReportsScreen.tsx`
   - Filtre: Radar satirlari `Teklif Saglik`, `Terk Sepet`, `Gorsel Kalite`, `Katalog Skoru`, `Saha Ziyaret`, `Paket Performans`, `Paket Onerici`, `Tamamlayici Motor`, `Anomali Radar` gibi grup chip'leriyle filtrelenebilir; ekranda gosterilen/toplam satir sayisi ayrica gorunur.
   - Aksiyon: `Suresi gecen acik teklifler` gibi daha once pasif kalan anomali satirlari artik teklifler tabina yonlenir. Aksiyonsuz satirlar sessiz kalmaz, `Bilgi` rozetiyle ayrilir.
   - Etki: Mobil radar personelin hangi sinyal grubuna bakacagini daha hizli secmesini saglar; katalog/gorsel, sepet, teklif, saha ve paket aksiyonlarina mevcut route'lar uzerinden gecis korunur. Webdeki tam modal/drill-down derinligi ve canli cihaz QA henuz ayrica kalir.

82. Portal mobil `Teklifler` ekrani web teklif listesinin temel operasyon yogunluguna yaklastirildi.
   - UI: `mobile/portal/src/screens/QuotesScreen.tsx`
   - Filtre: Teklif listesine `Tumu`, `Onay`, `Mikroda`, `Siparis`, `Red` durum chip'leri ve filtre bazli gosterilen/toplam/tutar/Mikro-no ozet kartlari eklendi.
   - Arama: Teklif no, cari ad/kod, durum, evrak no ve Mikro no aramasi Turkce/Ing karakter duyarsiz normalize edildi; Mikro/502 gibi hata cevaplari obje render etmeden metne cevrilir.
   - UI: Uzun cari/teklif metinleri kart icinde sarar, teklif tutari/Mikro no/tarih/gecerlilik/kalem bilgileri ayrildi, aksiyon butonlari dokunmatik ve saran duzene alindi; tablet genisliginde liste iki kolonlu karta gecer.
   - Aksiyon: Mevcut `Onayla`, `Reddet`, `Detay`, `Duzenle`, `Siparise Cevir`, `PDF`, `Onerili PDF` akislari korunur; ayrica `Teklif Kalemleri` ekranina hizli gecis eklendi. Webdeki tum masaustu kolon yogunlugu ve canli cihaz QA henuz ayrica kalir.

83. Portal mobil `Siparisler` ekrani web siparis listesinin temel takip davranisina yaklastirildi.
   - UI: `mobile/portal/src/screens/OrdersScreen.tsx`
   - Filtre: Listeye `Bekleyen`, `Onaylanan`, `Reddedilen`, `Tumu` durum chip'leri eklendi; ekran varsayilan olarak operasyonel oncelikli `Bekleyen` siparisleri gosterir.
   - Arama: Siparis no, cari ad/kod, durum ve urun/kalem bilgileri Turkce/Ing karakter duyarsiz aranir. Mikro/502 gibi hata cevaplari obje render etmeden okunur metne cevrilir.
   - UI: Gosterilen/toplam/tutar/bekleyen kalem ozet kartlari, status rozeti, cari kodu, kalem durum sayilari ve tablet iki kolonlu kart duzeni eklendi; uzun cari/urun metinleri kart icinde sarar.
   - Aksiyon: Mevcut `Manuel Siparis`, `Yenile`, `Onayla`, `Reddet`, `Detay` akislari korunur. Webdeki toplu onay/red, kaynak filtresi ve sayfali sunucu sorgusu mobilde henuz birebir yok; canli cihaz QA ayrica kalir.

84. Portal mobil `Manuel Siparis` formu Mikro kesintisi ve mobil kullanim risklerine karsi guclendirildi.
   - UI: `mobile/portal/src/screens/OrderCreateScreen.tsx`
   - Arama: Cari secimi artik Turkce/Ing karakter ve buyuk/kucuk harf duyarsiz normalize arar; urun arama hatalari sessiz bos liste yerine okunur hata mesaji gosterir.
   - Kaydetme: `Siparis Olustur` cift tik/tekrar gonderim kilidiyle calisir; 502/Mikro/axios hata objeleri React'e obje olarak dusmeden metne cevrilir ve formdaki secimler korunur.
   - UI: Cari ve urun secimi tablet genisliginde iki kolonlu yerlesir; uzun cari/urun adlari sarar, satir alanlari dar telefonlarda alt satira iner, faturali/beyaz/toplam ozet kartlari eklendi.
   - Kapsam: Seri, beyaz/faturali, rezerve, satir aciklamasi ve sorumluluk merkezi alanlari korunur. Webdeki tum masaustu manuel siparis kontrol derinligi ve canli Mikro yazma QA henuz ayrica kalir.

85. Portal mobil `Yeni Teklif / Teklif Duzenle` formunda arama ve hata dayanimi guclendirildi.
   - UI: `mobile/portal/src/screens/QuoteCreateScreen.tsx`
   - Arama: Cari, daha once alinan urun ve tum urun aramalari ortak normalize arama helper'iyle Turkce/Ing karakter ve buyuk/kucuk harf duyarsiz hale getirildi.
   - Hata: Cari yukleme, teklif yukleme, daha once alinan urunler, tum urun arama, gorunus kaydi ve teklif kaydi hatalari obje render etmeden okunur metne cevrilir; urun arama/yukleme hatalari ekran icinde de gorunur.
   - Kaydetme: `Teklif Olustur/Guncelle` cift tik/tekrar gonderime karsi korunur ve pasif durumda gorsel olarak soluklasir.
   - UI: Uzun cari/urun adlari havuz kartlarinda daha guvenli sarar; dar telefonlarda fiyat/miktar/segment satirlari alt satira iner. Webdeki tum masaustu teklif havuzu yogunlugu ve canli cihaz QA henuz ayrica kalir.

86. Musteri mobil `Urunler` ekrani web katalog sinyallerine ve sepet aksiyon dayanima yaklastirildi.
   - UI: `mobile/b2b/src/screens/ProductsScreen.tsx`
   - Hata: Urun yukleme ve sepete ekleme hatalari obje render etmeden okunur metne cevrilir; arama sonuc sayisi ve aktif arama ozeti ekranda gorunur.
   - Kart sinyalleri: Urun kartlarinda `Anlasmali` rozetine ek olarak `Paket` ve `Fazla Stok` rozetleri de gosterilir; uzun urun adlari daha fazla satira sarar.
   - Sepet: `Sepete Ekle` urun bazli islem kilidiyle calisir; islem surerken `Ekleniyor...`, stok yokken `Stok Yok` gosterilir ve tekrar tiklama engellenir.
   - Bos durum: Sonuc bulunamadiginda musteriye filtre/arama degistirme mesaji ve tek dokunusla filtre temizleme aksiyonu sunulur. Canli cihaz sepet QA ve webdeki tum katalog tablo/filtre derinligi henuz ayrica kalir.

87. Musteri mobil `Sepet` ekrani tekrar islem ve hata dayanimi acisindan guclendirildi.
   - UI: `mobile/b2b/src/screens/CartScreen.tsx`
   - Hata: Sepet yukleme, miktar guncelleme, urun silme, satir notu, siparis/talep olusturma, onerilen urun ekleme ve hediye secimi hatalari obje render etmeden okunur metne cevrilir.
   - Islem kilidi: Miktar +/-, silme, tamamlayici oneriyi sepete ekleme ve hediye secme aksiyonlari islem sirasinda pasiflesir; tekrar tiklama/cift istek riski azalir.
   - UI: Miktar guncellenirken ilgili satir `...`, onerilen urun eklenirken `Ekleniyor...` gosterir; hediye secimi kaydedilirken hediye kartlari soluklasir.
   - Kapsam: GWP/hediye, tamamlayici oneriler, fiyat guven ozeti, satir notu ve sub-user talep akisi korunur. Gercek cihaz checkout QA ve backend kaynakli stok/fiyat edge-case testleri henuz ayrica kalir.

88. Musteri mobil siparis/teklif/talep gecmis ekranlari daha okunur ve hata dayanikli hale getirildi.
   - UI: `mobile/b2b/src/screens/OrdersScreen.tsx`, `mobile/b2b/src/screens/QuotesScreen.tsx`, `mobile/b2b/src/screens/RequestsScreen.tsx`
   - Hata: Siparis, teklif ve talep yukleme/PDF hatalari obje render etmeden okunur metne cevrilir.
   - Arama: Siparis gecmisi aramasi artik kalem urun adi/kodu/fiyat tipini de kapsar; teklif gecmisi aramasi teklif kalem adlari ve fiyat tiplerini de kapsar.
   - UI: Durum rozetleri tek renk yerine bekleyen/onaylanan/siparise donen/reddedilen ayrimina gore renklenir; kart basliklari uzun metinlerde sarar ve status rozetiyle ayni satirda dengeli kalir.
   - Bos durum: Uc ekranda da sonuc bulunamadiginda filtreleri temizleme aksiyonu ve aciklama metni gosterilir. Canli cihazda hesap gecmisi/PDF paylasim QA henuz ayrica kalir.

89. Musteri mobil ayri katalog rotalari ana urun ekranindaki guvenli satin alma standardina yaklastirildi.
   - UI: `mobile/b2b/src/screens/DiscountedProductsScreen.tsx`, `mobile/b2b/src/screens/PurchasedProductsScreen.tsx`, `mobile/b2b/src/screens/AgreementsScreen.tsx`
   - Hata: Indirimli urunler, daha once aldiklarim ve anlasmali fiyatlar ekranlarinda yukleme/sepete ekleme hatalari obje render etmeden okunur metne cevrilir.
   - Arama/filtre: Sonuc sayisi ve aktif arama ozeti eklendi; temizle aksiyonu artik arama metnini de sifirlar; siralama Turkce/ingilizce karakter normalize eden ortak karsilastirmayi kullanir.
   - Kart sinyalleri: Uzun urun adlari uc satira kadar sarar; `Anlasmali`, `Paket` ve `Fazla Stok` rozetleri ayni kartta gorunur.
   - Sepet: Urun bazli `Sepete Ekle` kilidi eklendi; islem surerken `Ekleniyor...`, stok yokken `Stok Yok` gosterilir ve tekrar tiklama engellenir.
   - Bos durum: Uc ekranda da sonuc yokken aciklama ve tek dokunusla filtre temizleme aksiyonu gosterilir. Gercek cihaz checkout/gorsel QA henuz ayrica kalir.

90. Musteri mobil urun detay/koleksiyon/yeni kategori satin alma yuzeyleri kesinti ve tekrar tiklamaya karsi sertlestirildi.
   - UI: `mobile/b2b/src/screens/ProductDetailScreen.tsx`, `mobile/b2b/src/screens/CollectionDetailScreen.tsx`, `mobile/b2b/src/screens/NewCategoriesScreen.tsx`
   - Hata: Urun detay, koleksiyon detay ve yeni kategori kesfi yukleme/sepete ekleme hatalari obje render etmeden okunur metne cevrilir.
   - Sepet: Ana urun, tamamlayici oneriler, koleksiyon urunleri ve yeni kategori urunleri urun bazli islem kilidiyle calisir; islem surerken `Ekleniyor...`, stok yokken `Stok Yok` gosterilir.
   - Stok: Koleksiyon detayinda stok kontrolu sadece tek alan yerine depo stoklari, mevcut stok ve fazla stok toplam mantigiyla hesaplanir; yanlis `Stok Yok` riski azaltildi.
   - UI kalite: Yeni kategori fiyat etiketi icindeki bozuk karakter temizlenip ASCII ayiraca alindi. Gercek cihaz gorsel QA ve canli sepet/stok edge-case testi henuz ayrica kalir.

91. Portal mobil Dashboard ve Vade rapor/operasyon ekranlari Mikro/502 kesintilerine karsi daha okunur hale getirildi.
   - UI/API: `mobile/portal/src/utils/errors.ts`, `mobile/portal/src/screens/DashboardScreen.tsx`, `mobile/portal/src/screens/VadeScreen.tsx`, `mobile/portal/src/screens/VadeDashboardScreen.tsx`, `mobile/portal/src/screens/VadeAnalyticsScreen.tsx`, `mobile/portal/src/screens/VadeManagementScreen.tsx`
   - Hata: Portal icin ortak `getApiErrorMessage` helper'i eklendi; dashboard, vade liste/not/takvim/atama/import ve vade panel/analiz/yonetim hatalari ham obje render etmeden okunur metne cevrilir.
   - UI: Dashboard ve vade panel/analiz/yonetim ekranlarinda hata sadece kirmizi metin olarak kalmaz; dokunulabilir hata karti ve `Tekrar dene` aksiyonu gosterilir.
   - Islem kilidi: Vade not ekleme, hatirlatma tamamlama, atama, atama kaldirma ve manuel import aksiyonlarinda mevcut `actionLoading` sirasinda tekrar tetikleme engellenir.
   - Kapsam: Dış Mikro/internet kesintileri tamamen cozulmez, ancak mobil portal kullanicisi bu durumda okunur hata ve tekrar deneme yolu gorur. Gercek cihazda kesinti simulasyonu ve tum portal ekranlarina ayni helper'in yayilmasi henuz devam etmeli.

92. Portal mobil Cari 360 ve Cari Aktivite ekranlari dis Mikro/internet kesintilerinde ham hata objesi gostermeyecek hale getirildi.
   - UI/API: `mobile/portal/src/screens/Customer360Screen.tsx`, `mobile/portal/src/screens/CustomerEngagementScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Cari arama, Cari 360 detay, Cari Aktivite raporu, hatirlatildi tiki, temas kaydi, sepet temizleme ve Excel paylasim hatalari artik `getApiErrorMessage` ile string mesaja cevrilir; React'in obje render hatasi riski azaltildi.
   - UI: Cari 360 ve Cari Aktivite hata durumlarinda dokunulabilir hata karti + `Tekrar dene` aksiyonu gosterir.
   - Islem kilidi: Cari 360 sepet temizleme, Cari Aktivite hatirlatildi ve temas kaydet aksiyonlarinda mevcut islem devam ederken tekrar tetikleme engellenir.
   - Kapsam: Bu madde dis baglanti kaynakli 502'yi ortadan kaldirmaz; mobil personelin sonsuz donme/kirilma yerine kontrollu hata ve tekrar deneme yolu gormesini saglar. Gercek cihazda canli kesinti simulasyonu henuz ayrica kalir.

93. Musteri mobil uygulamasinda kalan temel hesap ekranlari ham API hata objesi ve tekrar istek riskine karsi guclendirildi.
   - UI/API: `mobile/b2b/src/utils/errors.ts`, `InvoicesScreen`, `PendingOrdersScreen`, `NotificationsScreen`, `PreferencesScreen`, `CollectionsScreen`, `HomeScreen`, `OrderDetailScreen`, `QuoteDetailScreen`, `RequestDetailScreen`, `CustomerTasksScreen`, `CustomerTaskDetailScreen`
   - Hata: Fatura, bekleyen siparis, bildirim, tercih, koleksiyon, ana sayfa banner urun gecisi, siparis detayi, teklif detayi, talep detayi ve musteri talepleri hatalari ortak `getApiErrorMessage` ile okunur string mesaja cevrildi.
   - Sonsuz bekleme: Musteri talep detayi yuklenemezse artik yalnizca bos/loading ekranda kalmaz; hata metni ve `Tekrar dene` aksiyonu gosterir.
   - Islem kilidi: Teklif kabul/red, talep siparise cevir/red, talep olusturma, yorum ve dosya yukleme aksiyonlari islem surerken tekrar tetiklenmeye karsi pasiflesir.
   - Kapsam: Bu batch backend/dis baglanti problemini cozmez; musteri uygulamasinda hata govdesi obje geldiginde React render kirilmasini ve cift istek riskini azaltir. Kalan eski ekran ici helper'lar islevsel ama ileride ortak helper'a tasinabilir.

94. Portal mobil karar/denetim/geri kazanim rapor ekranlari API kesintisi ve cift tetiklemeye karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/AuditReportsScreen.tsx`, `CustomerRecoveryReportScreen.tsx`, `DecisionSupportScreen.tsx`, `RecoveryActionsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Personel aktivite, TOPLU denetim, TOPLU adaylari, geri kazanim, tarihsel deger, karar destek, siparise getir, aksiyon guncelleme ve Excel paylasim hatalari ortak helper ile okunur mesaja cevrildi.
   - Islem kilidi: Rapor yenile/filtrele butonlari loading sirasinda pasiflesir; geri kazanim aksiyonlari ve karar destek islemlerinde cift tetikleme riski azalir.
   - Kapsam: Mikro veya internet kaynakli kesintiyi cozmez; mobil portal kullanicisinin ham hata objesi veya ust uste istek yerine kontrollu uyari ve pasif islem durumu gormesini saglar. Webdeki tam tablo/modal derinligi ve gercek cihaz QA yine ayrica kalir.

95. Portal mobil vitrin ve katalog yonetimi ekranlari API kesintisi ve cift islem riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/BannersScreen.tsx`, `CollectionsScreen.tsx`, `GiftCampaignsScreen.tsx`, `CategoryImagesScreen.tsx`, `BundlesScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Banner, koleksiyon, hediyeli kampanya, kategori gorseli ve paket yukleme/kaydetme/durum/silme hatalari artik `getApiErrorMessage` ile okunur string mesaja cevrilir.
   - Islem kilidi: Yenile, yeni kayit, gorsel yukleme, kaydetme, durum degistirme, gorsel kaldirma ve silme aksiyonlari ilgili loading/saving/mutating durumlarinda pasiflesir; ayni satir icin ust uste ikinci istek riski azalir.
   - Kapsam: Bu madde dis Mikro/internet kesintisini veya backend 502'yi cozmez; vitrin/katalog yonetimi ekranlarinin ham API hata objesiyle kirilmasini ve kullanicinin ayni islemi tekrar tekrar tetiklemesini engeller. Gercek cihaz gorsel yukleme QA henuz ayrica kalir.

96. Ilk kullanim hazirligi icin portal mobil katalog/gorsel/tamamlayici operasyonlarinda kritik hata dayanıklılığı kapatildi.
   - UI/API: `mobile/portal/src/screens/ProductsScreen.tsx`, `ImageIssuesScreen.tsx`, `ComplementManagementScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Urun listesi, ana gorsel yukleme/silme/senkron, urun galerisi yukleme/ekleme/ana yapma/silme, resim hata talebi durum/gorsel kapatma ve tamamlayici urun liste/kayit/senkron hatalari artik ortak helper ile okunur mesaja cevrilir.
   - Islem kilidi: Urun gorsel/galeri aksiyonlari, resim hata talebi aksiyonlari ve tamamlayici urun detay/kayit/senkron akislari islem surerken tekrar tetiklenmeye karsi pasiflesir.
   - Kapsam: Bu madde ilk kullanimda ekran kirilmasini ve cift istek riskini azaltir. Tam katalog zenginlestirme dashboard'u, toplu gorsel kalite workflow'u, derin aksiyon radari drill-down'lari ve gercek cihaz gorsel QA sonraya birakildi.

97. Ilk acilis icin Expo SDK 54 native paket uyumu ve Android/iOS bundle kontrolu yapildi.
   - Paket: `mobile/portal/package.json`, `mobile/portal/package-lock.json`, `mobile/b2b/package.json`, `mobile/b2b/package-lock.json`
   - Duzeltme: `expo-document-picker`, `expo-file-system`, `expo-print` ve `expo-sharing` surumleri Expo SDK 54'un `bundledNativeModules` tablosuyla hizalandi; portal export/PDF/Excel kullanan ekranlar `expo-file-system/legacy` import'una tasindi.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili. Her iki uygulama icin `npm.cmd exec -- expo export --platform all` Android ve iOS Hermes bundle uretti.
   - Not: `expo install --check` komutu dis metadata fetch asamasinda internet hatasina dustu; bu yuzden surum uyumu yerel Expo SDK tablosu, kurulu paket versiyonlari, TypeScript ve Expo export ile dogrulandi.

98. Ilk kullanim onceligi icin portal saha/siparis/teklif operasyon ekranlarinda kritik kilit ve hata dayanikliligi kapatildi.
   - UI/API: `mobile/portal/src/screens/FieldSalesScreen.tsx`, `OrderTrackingScreen.tsx`, `OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`, `QuoteConvertScreen.tsx`, `QuoteLinesScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Saha satis cari/urun arama, fotograf yukleme, konum alma, ziyaret notu, ziyaret carisi; siparis takip sync/mail/test mail; siparis onay/red; teklif onay/red/Mikrodan guncelle/PDF/onerili PDF/siparise cevir; teklif kalemi kapatma/acma/toplu kapatma hatalari ortak helper ile okunur string mesaja cevrildi.
   - Islem kilidi: Mobilde hizli cift dokunma ile ayni onay, red, mail, sync, siparise cevirme, kalem kapatma, fotograf, konum ve not kaydi aksiyonlarinin tekrar tetiklenmesi engellendi; butonlar islem sirasinda pasif gorunur.
   - Kapsam: Bu batch dis Mikro/internet 502 sorununu cozmez ve depo/Mikro yazan tum ekranlarda tam parity refaktoru yapmaz; ilk kullanimi bozabilecek ham hata objesi, React render kirilmasi ve cift istek riskini azaltir. Depo/perakende/Mikro yazan ekranlarda daha derin QA sonraya birakildi.

99. Depo, sicak satis ve tedarikci maliyet ekranlarinda ilk kullanim kirilma riski azaltildi.
   - UI/API: `mobile/portal/src/screens/WarehouseScreen.tsx`, `HotSalesScreen.tsx`, `SupplierCostsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Depo siparisleri/detay/senkron/toplama/satir/gorsel hata/yukleme/irsaliye/perakende, sicak satis panel/oturum/cari/urun/oturum acma/yukleme/satis/siparis teslim/gun sonu/rapor/arac ve tedarikci maliyet urun/tedarikci/rapor/fiyat teyit/ihale hatalari ham obje basmadan okunur mesaja cevrildi.
   - Islem kilidi: Depo ana aksiyonlarinda mevcut `actionLoading`, sicak satis ana aksiyonlarinda mevcut `submitting/loading` durumlari fonksiyon basinda kontrol ediliyor; hizli cift dokunmayla Mikro yazan islemlerin tekrar tetiklenme riski azaltildi.
   - Kapsam: Mikro yazan operasyonlarda is mantigi degistirilmedi. Canli depo/sicak satis cihaz QA, barkod/perakende akisi ve tedarikci maliyet Mikro uygulama dogrulamasi ilk kullanim sonrasi ayrica yapilacak.

100. Ilk giris, musteri, talep ve senkron temel ekranlari ilk kullanim icin sertlestirildi.
   - UI/API: `mobile/portal/src/screens/LoginScreen.tsx`, `CustomersScreen.tsx`, `CustomerDetailScreen.tsx`, `SyncScreen.tsx`, `TaskCreateScreen.tsx`, `TasksScreen.tsx`, `TaskDetailScreen.tsx`, `VadeCustomerScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Giris, musteri listesi/olusturma/detay, kontak/alt kullanici/anlasma, senkron baslatma/durum yenileme, talep olusturma/liste/detay/yorum/dosya ve vade cari not/siniflama hatalari ham obje basmadan okunur mesaja cevrildi.
   - Islem kilidi: Musteri detay alt islemleri, sync baslatma, talep olusturma/detay yorum-dosya ve vade not/siniflama aksiyonlari islem sirasinda ikinci tetiklemeye karsi korunur.
   - Ek: Mobil musteri olusturmada Mikro cari secilince bos ise kullanici adi `mikro cari kod`, sifre `mikro cari kod + 123` olarak otomatik doldurulur; cari/musteri aramalari mobilde Turkce/ingilizce karakter ve buyuk-kucuk harf farkina daha toleransli hale getirildi.

101. Rapor, e-fatura, ekstre ve musteri anlasmalari ekranlari ilk kullanim hatalarina karsi sertlestirildi.
   - UI/API: `mobile/portal/src/screens/ReportsScreen.tsx`, `EInvoicesScreen.tsx`, `EkstreScreen.tsx`, `CustomerAgreementsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Aksiyon Radari, musteri sepetleri, tamamlayici eksikler, top urun/cari, fiyat/maliyet/marj raporlari, e-fatura liste/yukleme/tekli-toplu indirme, ekstre cari arama/foy/PDF/Excel ve musteri anlasmasi kayit/sil/import hatalari ham obje basmadan okunur mesaja cevrildi.
   - Islem kilidi: E-fatura yukleme/toplu indirme ve musteri anlasmasi kayit/sil/import islemlerinde mevcut islem devam ederken tekrar tetikleme riski azaltildi.
   - Kapsam: Rapor veri derinligi, Aksiyon Radari satir sayisi/drill-down kalitesi ve canli PDF/Excel cihaz paylasim QA sonraya birakildi; bu madde ilk kullanimda ekran kirilmasini ve sessiz hata deneyimini azaltir.

102. Temel admin ayar ekranlari ilk kullanim hata standardina alindi.
   - UI/API: `mobile/portal/src/screens/CampaignsScreen.tsx`, `CategoriesScreen.tsx`, `ExclusionsScreen.tsx`, `RolePermissionsScreen.tsx`, `SettingsScreen.tsx`, `StaffScreen.tsx`, `ProductOverridesScreen.tsx`, `SupplierPriceListSettingsScreen.tsx`, `SupplierPriceListsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Kampanya, kategori fiyat kurali, dislama listesi, rol yetkileri, sistem ayarlari, personel, urun override, tedarikci fiyat listesi ayarlari ve fiyat listesi yukleme/onizleme hatalari ham obje basmadan okunur mesaja cevrildi.
   - Islem kilidi: Kayit/sil/import/onizleme/yukleme gibi kritik islemlerde mevcut `saving/loading` durumlari fonksiyon basinda kontrol ediliyor; tekrar tetikleme riski azaltildi.
   - Kapsam: Bu ekranlarda webdeki tum masaustu tablo/modal derinligi degil, ilk kullanimda kirilmayan mobil operasyon hedeflendi.

103. Ilk kullanima hazirlik icin kalan yuksek etkili portal operasyon ekranlari sertlestirildi.
   - UI/API: `mobile/portal/src/screens/ProductDimensionsScreen.tsx`, `PassiveStocksScreen.tsx`, `OperationsScreen.tsx`, `PortfolioScreen.tsx`, `SearchScreen.tsx`, `FamilyReportsScreen.tsx`, `UcarerDepotScreen.tsx`, `SupplierCostsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Urun olcu/raf, pasif stok aktiflestirme-yeni stok acma, operasyon komuta merkezi, portfoy, genel stok/cari arama, aile raporlari, Ucarer depo ve tedarikci dosya yukleme hatalari ham obje basmadan okunur mesaja cevrildi.
   - Islem kilidi: Urun olcu Mikro kaydi, pasif stok on kontrol/stok acma/aktiflestirme, Ucarer DSV transfer, tedarikci siparisi, MinMax, maliyet ve ana saglayici gibi islem etkisi yuksek aksiyonlarda hizli cift dokunma ile tekrar tetikleme riski azaltildi.
   - Arama: Mobil portfoy aramasi ortak `normalizeSearchText` ile Turkce/ingilizce karakter ve buyuk-kucuk harf farkina toleransli hale getirildi; mevcut arama kolaylastirici alanlar korunarak sadece eslestirme standardize edildi.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili. Portal screen taramasinda kalan `err?.response` eslesmeleri yalnizca ozel 403 kontrolu veya ekran ici hata formatter fonksiyonlarinda kaldi.
   - Kapsam: Bu batch ilk kullanimda kirilma, React obje render hatasi ve cift istek risklerini azaltir. Canli Mikro yazma QA, gercek cihaz/tablet gorsel QA, rapor drill-down derinligi ve web masaustu tablo paritesi sonraya birakildi.

104. Saha satis mobil urun arama ve kart okunabilirligi ilk kullanim icin iyilestirildi.
   - UI/API: `mobile/portal/src/screens/FieldSalesScreen.tsx`, ortak `mobile/portal/src/utils/search.ts`
   - Arama: Saha satis urun aramasinda ilk sorgu az sonuc donerse Turkce/ASCII karakter varyantlariyla ek sorgu yapilir; boylece `s/s`, `i/ı`, `o/ö`, buyuk-kucuk harf ve benzeri karakter farklari yuzunden urun kacirma riski azalir.
   - UI: Urun karti basligi dar telefonda 2 satir, digerlerinde 3 satirla sinirlandi; stok/birim/kategori ve depo rozetleri tek satirda kalacak sekilde ayarlandi. Son satis satirlari ve teklif havuzu urun adlari da karti asagi sonsuz uzatmayacak hale getirildi.
   - Kapsam: Urun kartindan dogrudan `Havuza Ekle` ve `Teklife Ekle` aksiyonlari korunur; tek tek detaya girme zorunlulugu artirilmaz. Gercek saha cihazi gorsel QA ve tablet yatay polish sonraya birakildi.

105. Musteri mobil sepet ve urun detay ilk kullanim icin cift-islem ve uzun-metin risklerine karsi sertlestirildi.
   - UI/API: `mobile/b2b/src/screens/CartScreen.tsx`, `mobile/b2b/src/screens/ProductDetailScreen.tsx`
   - Islem kilidi: Sepette `Siparis Olustur` ve alt kullanici `Talep Gonder` fonksiyonlari buton disabled durumuna ek olarak fonksiyon basinda da `submittingOrder` guard'i kullanir; zayif baglantida cift tikla cift siparis/talep riski azalir.
   - UI: Sepet urun adlari, stok kodlari, tamamlayici grup basliklari, urun detay basligi, kategori/birim metni ve paket icerigi satirlari kontrollu satir sayisina alindi; uzun stok adi/kategori/paket bileseni mobil kartlari asagi veya yanlara bozmaz.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.
   - Kapsam: Gercek checkout QA, odeme/onay akislarinin canli backend ile uçtan uca testi ve iOS/Android gorsel QA sonraya birakildi.

106. Musteri mobil siparis, teklif ve talep detaylari ilk kullanim icin aksiyon ve metin kiriklarina karsi sertlestirildi.
   - UI/API: `mobile/b2b/src/screens/QuoteDetailScreen.tsx`, `RequestDetailScreen.tsx`, `OrderDetailScreen.tsx`, `RequestsScreen.tsx`
   - Islem kilidi: Teklif reddetme ve talep reddetme onay pencereleri tekil hale getirildi; hizli cift dokunmada birden fazla red onayi veya cift red istegi riski azalir. Teklif PDF aksiyonu yuklenirken tekrar tetiklenmez.
   - UI: Siparis/teklif/talep detaylarinda urun adlari, stok kodlari, teklif/siparis no, durum, talep kullanicisi ve talep notlari kontrollu satir sayisina alindi; uzun metinler kartlari bozmaz.
   - Kullanim: Talep detay not alani multiline hale getirildi; mobilde red/convert notu yazmak daha rahat.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.
   - Kapsam: Canli kabul/red/convert akisi, PDF paylasim cihazi QA ve backend yetki regresyonu sonraya birakildi.

107. Portal mobil siparis ve teklif olusturma ekranlari ilk kullanim icin arama ve metin tasmasina karsi iyilestirildi.
   - UI/API: `mobile/portal/src/screens/OrderCreateScreen.tsx`, `QuoteCreateScreen.tsx`, ortak `mobile/portal/src/api/admin.ts`, `mobile/portal/src/utils/search.ts`
   - Arama: Manuel siparis ve teklif urun aramasi artik merkezi `adminApi.getProducts` fallback standardindan yararlanir; ilk sorgu az sonuc donerse Turkce/ASCII karakter varyantlari tek ortak API katmaninda kontrollu ek sorgulanir. Mevcut cari aramasi, daha once alinanlar, urun havuzu, havuz siralama, son satis ve toplu secim akislari korunur.
   - UI: Cari adlari, stok kodlari, urun havuzu kartlari, siparis/teklif kalemi basliklari, depo/stok satirlari ve tamamlayici urun kodlari kontrollu satir sayisina alindi; dar mobil ekranda uzun urun adlari listeyi kullanilamaz hale getirmez.
   - Islem kilidi: Siparis ve teklif kaydetme fonksiyonlari hizli cift dokunmaya karsi fonksiyon basinda `saving` guard'i kullanir; teklif ekraninda yuklenme/cari secimi sirasinda ana kayit butonu pasif kalir.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili; bu iki dosyada trailing whitespace yok.
   - Kapsam: Canli Mikro/internet 502 durumunu cozmez. Gercek saha cihazinda uzun urun listesi performansi, tablet yatay gorsel QA ve teklif-siparis Mikro yazma uctan uca testi ilk kullanim sonrasi yapilacak.

108. Portal saha ziyaret raporunda kalan ham hata mesaji riski kapatildi.
   - UI/API: `mobile/portal/src/screens/FieldSalesVisitsScreen.tsx`, ortak `mobile/portal/src/utils/errors.ts`
   - Hata: Saha ziyaret raporu ve Excel paylasimi hatalari artik dogrudan `error.response` alanindan Alert'e verilmez; obje hata govdesi gelirse ortak `getApiErrorMessage` ile okunur string'e cevrilir.
   - Kapsam: Rapor filtresi, Excel satir yapisi ve saha ziyaret verisi degistirilmedi; sadece ilk kullanimda hata penceresinin kirilma riski azaltildi.

109. Mobil urun arama fallback katmani gereksiz tekrar ve zayif varyant riskine karsi duzeltildi.
   - UI/API: `mobile/portal/src/api/admin.ts`, `mobile/b2b/src/api/customer.ts`, `mobile/b2b/src/utils/search.ts`
   - Portal: `adminApi.getProducts` zaten merkezi varyant fallback yaptigi icin siparis/teklif ekranlarindaki ekran-ici ikinci fallback sadelestirildi; fazla API cagrisi ve dis baglanti zayifken gereksiz yuk riski azalir.
   - Musteri uygulamasi: `buildSearchVariants` icindeki ASCII -> Turkce karakter tablosu dogru Unicode karakterlere yonlendirildi. `cikolata` / Turkce-c'li karsiligi, `sampuan` / Turkce-s'li karsiligi ve `kagit` / Turkce-g'li karsiligi gibi arama farklarinda urun kacirma riski azalir.
   - Dayaniklilik: Portal ve musteri urun aramalarinda fallback varyant istegi basarisiz olursa ilk basarili sonuc korunur; tek varyant retry hatasi tum arama sonucunu bos/hata yapmaz.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

110. Musteri mobil alisveris akisi hizli cift dokunma ve zayif baglanti yarismalarina karsi guclendirildi.
   - UI/API: `mobile/b2b/src/screens/ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `PurchasedProductsScreen.tsx`, `AgreementsScreen.tsx`, `NewCategoriesScreen.tsx`, `CollectionDetailScreen.tsx`, `ProductDetailScreen.tsx`, `CartScreen.tsx`
   - Sepete ekleme: Urun listeleri, koleksiyon detayi, yeni kategori kesfi, urun detayi, urun onerileri ve sepet tamamlayici onerileri artik state'e ek olarak senkron `useRef` kilidi kullanir. React state henuz ekrana yansimadan gelen hizli ikinci dokunus ikinci sepet istegi baslatamaz.
   - Sepet islemleri: Sepette miktar arttirma/azaltma, satir silme, satir notu kaydetme, siparis olusturma ve talep gonderme akislari da ref kilidiyle korunur; zayif baglantida cift siparis/talep veya cift cart update riski azalir.
   - UI: Bir sepet ekleme veya sepet guncelleme islemi surerken ilgili liste/onerilerde diger butonlar gecici olarak pasif gorunur ve `Bekleyin` metniyle kullaniciya islem devam ettigi anlatilir.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili; dokunulan ekranlarda trailing whitespace yok.

111. Musteri mobil katalog aramalarinda eski cevap yeni filtre sonucunu ezemez hale getirildi.
   - UI/API: `mobile/b2b/src/screens/ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `PurchasedProductsScreen.tsx`, `AgreementsScreen.tsx`, `NewCategoriesScreen.tsx`
   - Arama/filtre: Urunler, indirimli urunler, daha once aldiklarim ve anlasmali fiyatlar ekranlarinda her fetch bir request sequence numarasi alir. Kullanici hizli yazarken veya kategori/depo degistirirken eski API cevabi gec gelirse listeyi, hata mesajini veya loading durumunu artik guncelleyemez.
   - Sayfalama: Yeni kategoriler kesfinde reset edilen filtre/siralama sonrasi eski `load more` cevabi yeni listeye eklenemez; sayfali akista offset ve hasMore sadece aktif istekten guncellenir.
   - Etki: Musteri arama yaparken onceki sorgunun sonucunu gormez; "aradim ama baska urunler geldi" veya "urun yok gorundu sonra degisti" hissi azalir.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili; dokunulan ekranlarda trailing whitespace yok.

112. Portal mobil siparis/teklif operasyonlari ilk kullanim icin eski cevap ve cift aksiyon riskine karsi kilitlendi.
   - UI/API: `mobile/portal/src/screens/OrdersScreen.tsx`, `QuotesScreen.tsx`, `OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`
   - Liste yenileme: Siparis ve teklif listeleri her fetch icin request sequence kullanir. Eski API cevabi gec gelirse listeyi, hata mesajini veya loading durumunu yeni istegin uzerine yazamaz.
   - Islem kilidi: Siparis ve teklif liste kartlarinda onay/red butonlari senkron `useRef` kilidi kullanir; React state ekrana yansimadan yapilan hizli ikinci dokunus ikinci onay/red istegi baslatamaz.
   - Detay kilidi: Siparis detayinda tumunu/secili onay-red, teklif detayinda onay-red, Mikrodan guncelleme ve PDF/onerili PDF aksiyonlari ref kilidiyle korunur. Zayif internet veya gec cevap durumunda cift evrak/tekrar operasyon riski azalir.
   - UI: Devam eden islemde ilgili butonlar pasif gorunur ve `Onaylaniyor...`, `Reddediliyor...`, `Bekleyin` gibi metinlerle kullaniciya islem surdugu anlatilir.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

113. Portal mobil teklif cevirme, teklif kalemleri ve musteri sepeti operasyonlari ilk kullanim icin yarismalara karsi sertlestirildi.
   - UI/API: `mobile/portal/src/screens/QuoteConvertScreen.tsx`, `QuoteLinesScreen.tsx`, `Customer360Screen.tsx`, `ReportsScreen.tsx`
   - Teklif cevirme: Tekliften siparise cevirme akisi `converting` state'ine ek olarak senkron ref kilidi kullanir; zayif baglantida hizli ikinci dokunus ikinci siparis cevirme istegi baslatamaz. Teklif detayi yuklemesi de eski cevap yeni ekrani ezmeyecek sekilde request sequence ile korunur.
   - Teklif kalemleri: Acik/kapali teklif satiri listesinde arama/filtre cevaplari request sequence ile korunur; tekli kapat/ac ve toplu kapat islemleri ortak operasyon kilidiyle cift calisamaz.
   - Cari 360: Cari arama ve cari 360 yukleme cevaplari eskiyse ekrana yazamaz. Sepet temizleme ve Cari 360 Excel cikarma aksiyonlari ref kilidiyle cift tetiklenemez.
   - Raporlar: Musteri sepetleri raporu ve aksiyon radari yuklemeleri eski cevaplardan korunur; rapor icinden sepet temizleme aksiyonu ayni anda ikinci kez baslatilamaz.
   - UI: Teklif cevirme ve teklif kalemi kartlarinda uzun urun adi/kod/kapanis nedeni satirlari sinirlandi; dar telefonda kartlar asagi kontrolsuz uzamaz.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

114. Portal mobil Sicak Satis operasyonlari ilk kullanim icin cift Mikro islemi ve eski cevap riskine karsi korundu.
   - UI/API: `mobile/portal/src/screens/HotSalesScreen.tsx`
   - Islem kilidi: Yeni SICAK cari acma, arac oturumu acma, araca yukleme, sicak satis/siparis kaydetme, acik siparis teslimi, gun sonu kapatma ve arac kaydetme akislari `submitting` state'ine ek olarak senkron `useRef` kilidi kullanir. Alert onayi acikken veya state henuz ekrana yansimadan yapilan hizli ikinci dokunus ikinci Mikro etkili istegi baslatamaz.
   - Eski cevap korumasi: Sicak satis paneli, oturum detayi, cari arama, urun arama, acik siparis arama ve gunluk rapor yuklemeleri request sequence ile korunur. Gec gelen eski cevap yeni secimi/listeyi/hata durumunu ezemez.
   - UI: Oturum, cari, urun, sepet, siparis, sayim ve arac kartlarinda uzun unvan/urun/kod/metin alanlari satir sinirina alindi; saha telefonunda kartlar kontrolsuz uzayip aksiyonlari asagi itmez.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

115. Portal mobil Depo Kiosk ve perakende satis akislari ilk kullanim icin cift islem ve eski cevap riskine karsi korundu.
   - UI/API: `mobile/portal/src/screens/WarehouseScreen.tsx`
   - Islem kilidi: Mikro senkron, toplama baslatma, siparis satiri kaydetme/tamamla, gorsel hata talebi, yuklendi isareti, irsaliye/sevk ve perakende satis olusturma akislari ortak `useRef` operasyon kilidi kullanir. Alert onayi acikken veya React state henuz ekrana yansimadan yapilan hizli ikinci dokunus ikinci operasyonu baslatamaz.
   - Eski cevap korumasi: Depo siparis listesi, dispatch katalogu, aktif siparis detayi ve perakende urun arama cevaplari request sequence ile korunur. Gec gelen eski cevap yeni secimi, listeyi, detay ekranini veya perakende sonucunu ezemez.
   - UI: Depo siparis, aktif siparis detayi, toplama satirlari, perakende urun ve perakende sepet kartlarinda uzun cari/urun/kod/metin alanlari satir sinirina alindi; islem sirasinda aksiyon butonlari gorunur sekilde pasiflesir.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

116. Portal mobil tedarik maliyeti ve Ucarer depo operasyonlari ilk kullanim icin cift kayit/cift Mikro islemi riskine karsi korundu.
   - UI/API: `mobile/portal/src/screens/SupplierCostsScreen.tsx`, `mobile/portal/src/screens/UcarerDepotScreen.tsx`
   - Tedarik maliyeti: Urun/tedarikci arama, urun detayi, rapor, fiyat teyit ve ihale listeleri request sequence ile korunur; gec gelen eski cevap yeni listeyi veya secimi ezemez. Maliyet kaydetme, Mikroya uygulama, fiyat teyit fiyati ekleme/tamamla/iptal/karar/not ve ihale fiyat/tamamla/iptal aksiyonlari ortak `useRef` kilidi kullanir.
   - Dosya yukleme: Maliyet, fiyat teyit ve ihale teklif dosyasi yuklemeleri tek aktif yukleme kilidine alindi; state gec yansisa bile ayni anda iki farkli yukleme formu birbirini ezemez.
   - Ucarer depo: Tedarikci siparisi olusturma, DSV transfer olusturma, MinMax job baslatma/durum yenileme, MinMax haric tutma/geri alma, maliyet guncelleme, ana saglayici guncelleme ve islem gecmisi yukleme senkron `useRef` kilitleriyle korunur. Tedarikci siparisi ve DSV transferi devam ederken ikinci Mikro etkili islem baslatilamaz.
   - Eski cevap korumasi: Ucarer depo raporu, MinMax durum cevabi, haric urun raporu ve islem gecmisi cevaplari request sequence ile korunur. Depo degisimi veya yeni arama sonrasi eski cevap yeni ekrani ezemez.
   - Disa aktarim: Ucarer Excel/PDF ve olusan siparis PDF paylasimlari ref tabanli export kilidine alindi; hizli cift dokunus iki dosya olusturma/paylasma baslatamaz.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

117. Portal mobil Siparis Takip toplu mail/sync aksiyonlari ilk kullanim icin cift islem riskine karsi korundu.
   - UI/API: `mobile/portal/src/screens/OrderTrackingScreen.tsx`
   - Islem kilidi: Sync, Mail Gonder, Sync + Mail, test mail ve tek cari mail gonderme aksiyonlari senkron `useRef` kilidi kullanir. State ekrana yansimadan hizli ikinci dokunus ikinci mail/sync islemi baslatamaz.
   - Eski cevap korumasi: Siparis takip ozetleri, tedarikci ozeti, bekleyen siparisler ve mail gecmisi tek `fetchAll` request sequence ile korunur. Islem sonrasi yenileme devam ederken eski ilk yukleme cevabi yeni listeyi ezemez.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

118. Portal mobil Vade ana operasyonlari ilk kullanim icin cift islem ve eski cevap riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/VadeScreen.tsx`
   - Islem kilidi: Vade notu ekleme, hatirlatma tamamlama, cari-personel atama, atama kaldirma ve tek cari manuel import akislari `actionLoading` state'ine ek olarak senkron `useRef` kilidi kullanir. Alert onayi acikken veya state henuz ekrana yansimadan yapilan hizli ikinci dokunus ikinci kayit/islem baslatamaz.
   - Eski cevap korumasi: Bakiye, not, takvim ve atama yuklemeleri request sequence ile korunur. Eski arama/filtre/personel cevabi yeni listeyi ezemez.
   - Atama kullanimi: Atamalar sekmesinde secili personel degistiginde liste otomatik yenilenir; eski personelin atama listesi ekranda kalmaz.
   - Disa aktarim: Vade Excel paylasimi ref tabanli export kilidine alindi; hizli cift dokunus iki dosya olusturma/paylasma baslatamaz.
   - Musteri mobil dogrulamasi: Urunler, indirimli urunler, anlasmali urunler, daha once alinanlar, koleksiyon detayi, yeni kategori, urun detayi ve sepet onerileri ekranlarinda sepete ekleme/siparis gonderme akislari mevcut `useRef` kilitleriyle korunuyor; bu turda yeniden yazilmadi.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

119. Musteri mobil teklif/talep karar ve destek detay akislari ilk kullanim icin cift islem riskine karsi guclendirildi.
   - UI/API: `mobile/b2b/src/screens/QuoteDetailScreen.tsx`, `mobile/b2b/src/screens/RequestDetailScreen.tsx`, `mobile/b2b/src/screens/CustomerTaskDetailScreen.tsx`
   - Teklif karari: Teklif kabul, teklif red ve PDF paylasimi state'e ek olarak senkron `useRef` kilidi kullanir. Alert onayi acikken ikinci kabul/red veya ikinci PDF paylasimi baslatilamaz.
   - Talep karari: Alt kullanici siparis talebi onay/convert ve red aksiyonlari senkron `useRef` kilidiyle korunur; secili kalemler ve fiyat tipi kararinda hizli ikinci dokunus ikinci convert/red istegi baslatamaz.
   - Destek/talep detayi: Musteri talep yorum ve dosya yukleme akislari tek saving ref kilidine alindi. Dosya secme/yukleme veya yorum ekleme sirasinda ikinci kayit baslatilamaz.
   - Eski cevap korumasi: Teklif detayi, talep detayi ve musteri talep detayi yuklemelerinde request sequence var; gec gelen eski cevap yeni durum/karar sonrasi ekrani ezemez.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

120. Portal mobil Sync ekrani agir backend tetiklerinde cift islem riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/SyncScreen.tsx`
   - Islem kilidi: Urun sync, gorsel sync, cari sync, fiyat sync ve durum yenileme butonlari `loading` state'ine ek olarak senkron `useRef` kilidi kullanir. State ekrana yansimadan hizli ikinci dokunus ikinci agir sync job'i baslatamaz.
   - Eski cevap korumasi: Sync baslatma ve durum yenileme cevaplari request sequence ile korunur; gec gelen eski durum cevabi yeni sonucu ezemez.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

121. Portal mobil katalog/gorsel operasyonlari ilk kullanim icin cift upload/silme/sync riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/ProductsScreen.tsx`, `mobile/portal/src/screens/ImageIssuesScreen.tsx`, `mobile/portal/src/screens/CategoryImagesScreen.tsx`
   - Urun katalog gorselleri: Ana urun gorseli yukleme, silme, secili gorsel senkronu, galeri gorseli ekleme, ana gorsel yapma ve galeri gorseli silme akislari state'e ek olarak senkron `useRef` kilidi kullanir. Alert onayi acikken veya state henuz ekrana yansimadan ikinci upload/silme/sync baslatilamaz.
   - Eski cevap korumasi: Urun listesi, urun galerisi, resim hata talepleri ve kategori listesi yuklemeleri request sequence ile korunur; gec gelen eski arama/filtre cevabi yeni listeyi ezemez.
   - Resim hata talepleri: Talep durum guncelleme ve gorsel yukleyip talebi kapatma tek aktif islem kilidine alindi; ayni talep icin hizli ikinci durum/yukleme baslatilamaz.
   - Kategori gorselleri: Kategori gorseli yukleme ve kaldirma tek aktif islem kilidine alindi; iki kategori gorseli islemi birbirinin sonucunu ezemez.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

122. Portal mobil personel/ayar/yetki yonetimi ilk kullanim icin cift kayit ve eski cevap riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/StaffScreen.tsx`, `mobile/portal/src/screens/SettingsScreen.tsx`, `mobile/portal/src/screens/RolePermissionsScreen.tsx`
   - Personel: Yeni personel olusturma `saving` state'ine ek olarak senkron `useRef` kilidi kullanir; state ekrana yansimadan ikinci personel olusturma istegi baslatilamaz. Personel listesi gec cevap korumasi ile yuklenir.
   - Ayarlar: Sistem ayari kaydetme senkron `useRef` kilidine alindi; hizli ikinci kaydetme baslatilamaz. Ayar yukleme cevabi request sequence ile korunur.
   - Rol yetkileri: Tek yetki ac/kapat ve rolu varsayilana sifirlama tek aktif islem kilidine alindi. Alert acikken aktif rol degisse bile islem baslatildigi rolu kullanir; gec gelen yetki listesi cevabi yeni listeyi ezemez.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

123. Musteri mobil bildirim/profil/talep tercihleri ilk kullanim icin cift kayit ve eski cevap riskine karsi guclendirildi.
   - UI/API: `mobile/b2b/src/screens/PreferencesScreen.tsx`, `mobile/b2b/src/screens/ProfileScreen.tsx`, `mobile/b2b/src/screens/CustomerTasksScreen.tsx`
   - Bildirim tercihleri: KDV gorunumu, kategori bazli bildirim tercihi, push bildirim acma ve test bildirimi gonderme aksiyonlari state'e ek olarak senkron `useRef` kilitleri kullanir. Hizli ikinci dokunus ikinci tercih/token/test istegi baslatamaz.
   - Eski cevap korumasi: Bildirim tercihleri yukleme ve push izin durumu request sequence ile korunur; gec gelen eski cevap yeni tercih/push durumunu ezemez.
   - Profil: Profildeki KDV gorunumu guncelleme ref kilidine alindi; tercih kaydi iki kez gonderilemez.
   - Musteri talepleri: Yeni musteri talebi olusturma ref kilidine alindi, talep listesi yukleme request sequence ile korunur; eski liste cevabi yeni talep sonrasi ekrani ezemez.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

124. Portal mobil vitrin/kampanya yonetimi ilk kullanim icin cift kayit, cift silme ve eski arama cevabi riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/BannersScreen.tsx`, `mobile/portal/src/screens/CampaignsScreen.tsx`, `mobile/portal/src/screens/GiftCampaignsScreen.tsx`, `mobile/portal/src/screens/CollectionsScreen.tsx`
   - Bannerlar: liste yenileme request sequence ile korunur; gorsel yukleme, kaydetme, aktif/pasif ve silme islemleri state'e ek olarak senkron `useRef` kilidi kullanir.
   - Kampanyalar: klasik indirim kampanyasi kaydet/sil akislarina ref kilidi, buton disable durumu ve ortak API hata mesaji eklendi; liste yenilemede gec cevap korumasi var.
   - Hediyeli kampanyalar: kaydet, aktif/pasif ve silme islemleri ref kilidine alindi; urun arama cevaplari hizli yazma/silmede eski sonucu ekrana basmayacak sekilde siralandi.
   - Koleksiyonlar: kaydet, aktif/pasif ve silme islemleri ref kilidine alindi; koleksiyon/kategori listesi ve urun arama cevaplari sira korumali hale getirildi.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

125. Musteri mobil sepet/siparis ekrani ilk kullanim icin hediye secimi ve gec cevap riskine karsi guclendirildi.
   - UI/API: `mobile/b2b/src/screens/CartScreen.tsx`
   - Hediye kampanyasi secimi state'e ek olarak senkron `useRef` kilidine alindi; hizli ikinci dokunus ikinci hediye secimi istegi baslatamaz.
   - Sepet, aktif hediye kampanyasi ve tamamlayici oneriler yenilemeleri request sequence ile korunur; yavas agda gec gelen eski cevap yeni sepet/hediye/onerileri ezemez.
   - Mevcut miktar guncelleme, satir notu, tamamlayici urun ekleme ve siparis/talep gonderme kilitleri korunarak degistirilmedi.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

126. Portal mobil siparis/teklif olusturma ilk kullanim icin cift kayit riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/OrderCreateScreen.tsx`, `mobile/portal/src/screens/QuoteCreateScreen.tsx`
   - Manuel siparis olusturma state'e ek olarak senkron `useRef` kilidi kullanir; hizli ikinci kaydetme ikinci `/manual order` istegi baslatamaz.
   - Teklif olusturma/guncelleme state'e ek olarak senkron `useRef` kilidi kullanir; hizli ikinci kaydetme ikinci teklif istegi baslatamaz.
   - Teklif havuzu gorunum tercihi kaydi da ref kilidine alindi; arka arkaya hizli kaydetme tercih istegini cogaltamaz.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

127. Portal mobil musteri, vade cari ve gorev detay yazma aksiyonlari ilk kullanim icin cift islem riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/CustomerDetailScreen.tsx`, `mobile/portal/src/screens/VadeCustomerScreen.tsx`, `mobile/portal/src/screens/TaskCreateScreen.tsx`, `mobile/portal/src/screens/TaskDetailScreen.tsx`
   - Musteri detayi: musteri guncelleme, kontak ekleme, alt kullanici ekleme, anlasma ekleme ve anlasma silme aksiyonlari ortak ref kilidine alindi.
   - Vade cari detayi: not ekleme ve siniflandirma kaydi ref kilidiyle cift kayit riskinden korundu.
   - Gorevler: yeni gorev olusturma, gorev guncelleme, yorum ekleme ve dosya yukleme aksiyonlari senkron ref kilidi kullanir; dosya secici acikken ikinci yukleme baslatilamaz.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

128. Portal mobil paket, musteri olusturma ve musteri anlasmalari ilk kullanim icin cift yazma riskine karsi guclendirildi.
   - UI/API: `mobile/portal/src/screens/BundlesScreen.tsx`, `mobile/portal/src/screens/CustomersScreen.tsx`, `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`
   - Paketler: paket kaydetme ve paket silme aksiyonlari ref kilidine alindi; hizli ikinci dokunus ikinci paket kaydi/silme istegi baslatamaz.
   - Musteriler: Mikro cari seciminden sonra musteri olusturma senkron `useRef` kilidiyle cift kayit riskinden korundu.
   - Musteri anlasmalari: anlasma kaydetme, silme ve Excel import aksiyonlari ref kilidi kullanir; import devam ederken ikinci import baslatilamaz.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

129. Mobil portal ve musteri uygulamasinda kalan state-only yazma/upload/paylasim aksiyonlari ilk kullanim icin ref kilidine alindi.
   - UI/API: `mobile/portal/src/screens/CategoriesScreen.tsx`, `mobile/portal/src/screens/ComplementManagementScreen.tsx`, `mobile/portal/src/screens/ExclusionsScreen.tsx`, `mobile/portal/src/screens/EInvoicesScreen.tsx`, `mobile/portal/src/screens/SupplierPriceListsScreen.tsx`, `mobile/portal/src/screens/SupplierPriceListSettingsScreen.tsx`, `mobile/b2b/src/screens/InvoicesScreen.tsx`, `mobile/portal/src/screens/CustomerEngagementScreen.tsx`, `mobile/portal/src/screens/ProductDimensionsScreen.tsx`, `mobile/portal/src/screens/ProductOverridesScreen.tsx`
   - Kategori kural kaydi, tamamlayici urun kaydi/senkronu, exclusion ekle/sil/aktif-pasif/hizli dislama, e-fatura PDF upload/tekil-toplu indirme, supplier fiyat listesi uploadu, supplier iskonto ayari, musteri fatura paylasimi, cari aktivite temas kaydi, urun olcu Mikro guncellemesi ve urun override kaydi senkron `useRef` kilitleriyle korundu.
   - Tamamlayici urun, exclusion, e-fatura/musteri fatura ve kategori/product listesi yuklemelerinde gec gelen eski cevaplarin yeni ekrani ezmesini onleyen request sequence korumalari eklendi veya mevcut aktif-flag korumasi korundu.
   - Tarama: `setSaving(true)`, `setUploading(true)`, `setSubmitting(true)`, `setDownloadingId(` iceren ancak `useRef` kullanmayan mobil screen dosyasi kalmadi.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

130. Ilk kullanima hazirlik onceligiyle dar ekranlarda kart tasmasi yaratan yuksek riskli mobil alanlar sinirlandi.
   - UI: `mobile/portal/src/screens/CustomerEngagementScreen.tsx`, `mobile/b2b/src/screens/HomeScreen.tsx`, `mobile/b2b/src/screens/CollectionsScreen.tsx`
   - Cari aktivite kartlarinda uzun cari adi, cari kodu/sektor, onerilen aksiyon, neden, son giris/siparis/bakiye ve takip satirlari kontrollu satir sayisina alindi; saglik rozeti ve aksiyon butonlari dar ekranda basligi ezmeyecek sekilde sabitlendi.
   - Musteri mobil ana sayfa hizli giris kartlarinda baslik/govde metinleri satir sinirina alindi ve kartlara minimum yukseklik verildi; uzun koleksiyon listesi ana sayfayi asagi dogru kontrolsuz uzatamaz.
   - Musteri koleksiyon kartlarinda uzun koleksiyon basligi ve alt metni iki satirla sinirlandi; kart metin line-height degerleri sabitlendi.
   - Kapsam karari: bu turda sadece ilk kullanimi etkileyen dar ekran tasmalari kapatildi. Tum ekranlarda piksel seviyesinde gorsel QA, tablet polish ve web tablo/modal yogunlugu asagidaki yapilacaklar listesinde tutuluyor.
   - Dogrulama: `mobile/portal` ve `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

131. Saha satis ve portal mobil arama ilk kullanim icin daha toleransli ve dar ekran dostu hale getirildi.
   - UI/API: `mobile/portal/src/screens/FieldSalesScreen.tsx`, `mobile/portal/src/utils/search.ts`
   - Saha satis cari arama sonucunda uzun cari unvani iki satirla, cari kodu/sektor/sehir satiri tek satir ve middle ellipsis ile sinirlandi; uzun unvanlar urun arama ve teklif havuzu alanini asagi itmez.
   - Portal mobil ortak arama normalizasyonu musteri mobilindeki daha dayanikli davranisla esitlendi: Turkce karakterler, buyuk/kucuk harf, aksan ve bozuk-encoding/mojibake varyantlari ayni arama anahtarina indirgenir.
   - `includesSearch` ve `compareSearchText` yardimcilari portal tarafinda da hazir hale getirildi; bundan sonraki lokal filtre/siralama ekranlari ham `toLowerCase` yerine bu ortak katmani kullanabilir.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

132. Portal mobil dashboard ilk acilis deneyimi dar ekran metin tasmasina karsi sertlestirildi.
   - UI: `mobile/portal/src/screens/DashboardScreen.tsx`
   - Kullanici adi, aciklama, donem/sektor kapsami, KPI tutarlari, hizli aksiyon etiketleri, bildirim basligi/govdesi ve arama yardim metinleri kontrollu satir sayisina alindi.
   - Dashboard kart basliklari ve sagdaki aksiyon linkleri ayni satirda birbirini ezmeyecek sekilde `minWidth`, `flexShrink` ve wrap davranisi ile duzenlendi.
   - Stok/cari arama satirlari dar telefonda input ve `Detayli Ara` butonu birbirini bozmayacak sekilde wrap destekli hale getirildi.
   - Dogrulama: `mobile/portal` icin `npm.cmd exec tsc -- --noEmit` basarili.

133. Musteri mobil ana urun listeleri dar ekranda uzun arama, kod ve rozet metinlerine karsi guclendirildi.
   - UI: `mobile/b2b/src/screens/ProductsScreen.tsx`, `mobile/b2b/src/screens/DiscountedProductsScreen.tsx`, `mobile/b2b/src/screens/AgreementsScreen.tsx`, `mobile/b2b/src/screens/PurchasedProductsScreen.tsx`
   - Urunler, indirimli urunler, anlasmali fiyatlar ve daha once aldiklarim ekranlarinda uzun arama ozeti tek satir + ellipsis ile sinirlandi.
   - Urun kodu, stok/fazla stok/minimum miktar satirlari tek satirla sinirlandi; uzun Mikro kodlari middle ellipsis ile gosterilir.
   - Anlasmali/paket/fazla stok rozetleri tek satirda kalir; rozetler uzun urun adlariyla kart basligini ezmez.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

134. Musteri mobil sepet ekrani son adim kullaniminda uzun metin ve kampanya tasmasina karsi guclendirildi.
   - UI: `mobile/b2b/src/screens/CartScreen.tsx`
   - Sepet basligi, guven ozeti, KDV/fiyat tipi ozeti, toplam miktar ozeti ve kampanya durumu kontrollu satir sayisina alindi; hata metni uc satirla sinirlandi.
   - Sepet kaleminde fiyat tipi rozeti, birim fiyat/KDV satiri ve satir toplam tutari dar ekranda karti bozmayacak sekilde sinirlandi.
   - Hediyeli kampanya kartinda kampanya basligi, durum, alt metin, baraj/kapsam tutari, hediye secim aciklamasi, hediye urun kodu/degeri ve secim etiketi satir limitleriyle guclendirildi.
   - Dogrulama: `mobile/b2b` icin `npm.cmd exec tsc -- --noEmit` basarili.

## Ilk kullanim sonrasi yapilacaklar

Bu noktadan sonra hedef tam parite/polish degil, ilk kullanima hazirliktir. Kullanimi dogrudan bozmayacak maddeler sonraya birakildi; "yapilacaklari yap" denildiginde bu liste uzerinden devam edilecek:

- Kalan helper-ici hata formatterlarini ve backend/API genel hata zarfini ortak standarda indirme; portal ekranlarinda kullaniciya sizan ham hata objesi taramasi ilk kullanim icin temizlendi.
- Rapor/Aksiyon Radari mobilinde satir sayisi, gruplama, filtre ve ilgili operasyon ekranina donus aksiyonlarini web seviyesine tamamlamak.
- E-fatura/ekstre/musteri anlasmalari PDF-Excel paylasimini gercek iOS/Android cihazlarda test etmek.
- Webdeki genis tablo/modal derinligini mobilde birebir yakalama.
- Aksiyon Radari icin daha derin drill-down, tum kolonlarda daha fazla satir, satirdan ilgili operasyon ekranina tek dokunus aksiyonlari ve otomatik kapanis kurallari.
- Katalog zenginlestirme skoru icin toplu aksiyon listesi, filtrelenebilir kalite merkezi ve gorsel workflow raporu.
- Paket performans raporu, paket onerici ve kampanya etkisi metrikleri.
- Tamamlayici urun motoru icin aile/gramaj/spekt karisimlarini ayiran daha kontrollu onerici UI ve backend kalite kurallari.
- Android/iOS/tablet gercek cihaz gorsel QA ve ekran ekran spacing/polish.
- Mobil bildirimlerin gercek cihaz push teslim testi ve rol/kapsam bazli bildirim regresyon testi.
- Mobil permission/role guard'lari icin otomatik test senaryolari.
- Expo/React Native ortak form, kart, liste, hata ve loading primitive'lerinin cikartilmasi.
- Ilk kullanim hattinda kritik siparis/sepet/teklif/musteri/paket/gorev aksiyonlari ve kalan state-only yazma/upload/paylasim aksiyonlari ref kilidine alindi; sonraki sertlestirme ihtiyaci artik daha cok gercek cihaz QA, otomatik test ve backend ortak hata zarfi standardi tarafinda.

## Hala eksik olan yuksek oncelikli portal/admin modulleri

Webde var, mobil portalda ekran/API paritesi henuz yok veya cok sinirli:

- Portal ana navigasyon: `MoreScreen` arama/kategori/tablet grid standardina alindi, moduller ortak katalog dosyasina tasindi ve web permission/rol anahtarlarina gore link, tab ve direkt stack route guard eklendi; canli rol hesaplariyla gercek cihaz QA henuz ayrica dogrulanmadi.
- Portal `Arama`: F10 stok/cari arama, kolon tercihi, `Koli Ici`, yetkili mod gizleme ve tablet grid mobile eklendi; canli Mikro kesintisi, uzun kolon setleri ve gercek cihaz QA henuz ayrica dogrulanmadi.
- `admin-products`: urun listesi, tek gorsel, coklu galeri, mobil katalog kalite karti ve detayli urun kunye sekmeleri eklendi; katalog zenginlestirme toplu aksiyonlari ve tablet/gercek cihaz QA henuz tamamlanmadi.
- `bundles`: paket olusturma/duzenleme, paket saglik KPI'lari, eksik bilesen/indirimli bilesen/aktif-pasif uyarilari, kart ici icerik-saglik acilimi ve tablet iki kolonlu kart duzeni mobile eklendi; gercek satis performans raporu, paket onerici/kampanya etkisi metrikleri ve canli tablet/cihaz QA henuz tamamlanmadi.
- `customer-360`: temel mobil ekran, cok sayfali Excel paylasimi, sepet temizleme aksiyonu, siparis/teklif kalem detaylari, gorev/geri kazanma/talep kartlari, aktif anlasmalar, iletisim/alt kullanici listeleri, davranis/top urun/fatura kartlari ve tablet iki kolonlu bolum duzeni eklendi; webdeki tum masaustu tablo yogunlugu, ileri tablo aksiyonlari ve canli tablet gorsel QA henuz tamamlanmadi.
- `field-sales`: mobil saha satis ekrani, cari/urun arama, fiyat/stok, ziyaret notu, fotograf/koordinat payload'i, native konum alma, yeni ziyaret carisi acma, teklif olusturma prefill koprusu ve fiyat/marj destekli mobil teklif havuzu eklendi; gercek cihaz konum/fotograf QA, tablet yatay akislari ve webdeki masaustu tablo yogunlugu henuz birebir yok.
- `hot-sales`: mobil operasyon ekrani eklendi; canli cihazda gercek arac oturumu ile Mikro yazma QA, barkod/urun arama hiz testi ve tablet yatay kullanimi henuz ayrica dogrulanmadi.
- `warehouse`, `warehouse/image-issues`, `warehouse/retail`: resim hata talepleri, depo kiosk ana akis, barkod/hizli okutma ile satir bulma, tablet iki kolonlu kart ergonomisi ve perakende satis mobil portala eklendi; canli Mikro irsaliye/perakende QA, canli depo cihaz QA ve webdeki tum dispatcher modal derinligi henuz tamamlanmadi.
- `stock-create`, `passive-stocks`: pasif stok aktiflestirme, yeni stok acma, stok/fiyat ailesi secimleri, lookup secicileri ve ek birim editoru mobil formda var; canli cihaz/tablet QA henuz tamamlanmadi.
- `supplier-costs`: tedarikci maliyet/fiyat teyit/ihale akislari mobilde operasyon ekranina tasindi; fiyat teyit alternatifi, ihale kalem teklifi, dosya upload, secili fiyat onay/red, talep notlari ve yeni stok karti payload editoru eklendi. Webdeki kanban/masaustu modal yogunlugu, toplu fiyat listesi uygulama QA ve canli Mikro yazma dogrulamasi henuz tamamlanmadi.
- `operations`: komuta merkezi mobile eklendi; webdeki modal/drill-down detaylar mobil kart ici ac/kapat panellere tasindi ve tablet genisliginde ATP/Depo ile Musteri/Risk bolumleri iki kolonlu konsol duzenine alindi. Canli tablet/cihaz QA henuz tamamlanmadi.
- Vitrin yonetimi tarafinda `banners`, `gift-campaigns`, admin `collections` ve `category-images` mobile eklendi; gercek cihaz gorsel QA henuz yapilmadi.

## Hala eksik olan rapor paritesi

Portal `ReportsScreen` bazi raporlari tek ekranda tasiyor ama web rapor merkezi daha genis. Mobilde eksik veya eksik derinlikte olanlar:

- `customer-engagement`: rapor, temas aksiyonlari, siralama, temsilci kirilimi, Excel paylasimi ve tablet iki kolonlu cari kart duzeni mobil portala eklendi; webdeki genis tablo kolonlarinin tam masaustu yogunlugu ve canli tablet QA henuz mobilde birebir yok.
- `customer-recovery` ve `customer-recovery/actions`: bana atanan aksiyon merkezi, ana geri kazanma raporu, Excel paylasimi, sonuc/takip kisayollari ve tablet iki kolonlu aksiyon kartlari mobile eklendi; webdeki detay kirilimi, grafikler, genis tablo kolonlari ve canli tablet QA henuz mobilde birebir yok.
- `field-sales-visits`: saha ziyaret raporu, fotograf/konum aksiyonlari ve Excel paylasimi mobile eklendi; webdeki masaustu tablo yogunlugu, fotograf modal kalitesi ve tablet yatay QA henuz eksik.
- `family-management`: Aile Raporlari ekrani ile oneriler/kumeler/aykirilar/birim uyumu, `price-family-costs`, `price-families`, `product-families`, urun arama-sec-ekle aile secicisi, sekme bazli Excel paylasimi ve fiyat-maliyet taslaklarini tek onayla sirali toplu uygulama mobilde var; webdeki kolon genisligi ayarlari, masaustu tablo derinligi ve canli Mikro yazma QA henuz mobilde yok.
- `ucarer-depo`, `ucarer-minmax-exclusions`: Ucarer depo karar raporu, MinMax job, haric urunler, islem gecmisi, temel aile kapsama paneli, sekme bazli Excel/PDF paylasimi, tedarikci siparis taslagi, karsi-depo DSV onerisi + manuel DSV transfer seti, supplier bazli son seri chip'leri, koliye tamamlama, maliyet guncelleme, ana saglayici degistirme ve olusan siparisler icin tedarikci/yonetici PDF ciktisi mobile eklendi; webdeki ileri aile dagitim/edit paneli ve tablet QA henuz mobilde yok.
- `demand-pattern`, `barter-radar`, `sticky-discounts`, `discount-below-entry-cost`, `category-churn`, `category-opportunity`: Karar Destek ekrani, Excel paylasimi, satirdan Cari 360/Urunler gecisleri ve tablet iki kolon kart duzeni mobilde var; webdeki genis tablo, detay modal ve toplu uygulama derinligi henuz mobilde yok.
- `toplu-audit`, `staff-activity`: Denetim Raporlari ekrani ile personel aktivite, TOPLU ritmik grup denetimi, TOPLU aday tarama/isaretleme ve Excel paylasimi mobilde var; webdeki genis tablo derinligi ve tablet QA henuz mobilde yok.

## Hala eksik olan vade paritesi

Mobil portalda `VadeScreen`, `VadeDashboardScreen`, `VadeAnalyticsScreen`, `VadeManagementScreen` ve `VadeCustomerScreen` var, ancak webdeki vade operasyonunun bazi derin aksiyonlari hala eksik:

- `/vade/calendar`, `/vade/notes`, `/vade/assignments`, `/vade/import` mobilde ana vade ekranina operasyonel olarak gomuldu, sekme bazli Excel paylasimi ve tablet iki kolonlu bakiye/not/atama kart duzeni eklendi; webdeki buyuk tablo kolon yogunlugu, ayri sayfa filtre derinligi ve canli tablet QA henuz birebir degil.
- Vade Excel import mobilde tamamlandi: Excel dosya secici, kolon esleme, satir onizleme/ozet, backend import cagrisi ve import sonrasi bakiye yenileme var. Kalan risk yalniz gercek Android/iOS dosya secici QA'si ve buyuk Excel performans testidir.

## Hala eksik olan musteri uygulamasi modulleri

Bu turda fatura eklendi; kalan musteri web parite aciklari:

- `collections/[id]`: aktif koleksiyon listesi ve detay deneyimi mobilde eklendi; koleksiyon listesi ve detay urunleri tablet genisliginde iki kolonlu grid'e alindi, detay kartlarina anlasmali/fazla stok/paket rozetleri, maksimum adet ve fiyat guven ipuclari eklendi. Gercek cihaz gorsel QA ayrica yapilmali.
- `new-categories`: hic alinmayan/yeni kategori kesfi mobilde eklendi ve tablet genisliginde iki kolonlu kart duzenine alindi; webdeki genis filtre rayi ve gercek cihaz gorsel QA ayrica dogrulanmali.
- Ana sayfa vitrin zenginligi artirildi: banner seridi, koleksiyon, kategori kesfi, hizli girisler ve GWP/hediyeli kampanya vitrini mobilde var; ozet/hizli giris/vitrin kartlari tablet genisliginde kolonlu calisir. Web ile birebir yerlesim ve gercek cihaz gorsel QA ayrica dogrulanmali.
- Ana sayfa hizli girisleri genisletildi; banner, GWP, kategori kesfi ve kampanya bloklari icin canli kampanya verisiyle gercek cihaz karsilastirmasi yapilmali.
- Urun detayinda coklu galeri, paket icerigi ve fiyat guven karti mobilde eklendi; tablet genisliginde sol galeri + sag fiyat/aksiyon paneli duzeni var. Hediye/GWP ve webdeki tum fiyat vurgulari icin gercek cihaz QA ayrica gerekir.
- Sepette GWP/hediye secimi, tamamlayici oneriler ve fiyat guven ozeti mobilde var; gercek cihaz uzerinde sepet QA henuz birebir tamamlanmadi.
- Bekleyen siparisler, talepler, bildirimler, fatura listesi, sepet ve ana urun gridleri musteri mobilinde arama/filtre/KPI/responsive grid seviyesine tasindi; bildirim tercihleri kategori bazli switch listesine ve native push izin/test akisina sahip. Gercek cihaz push teslimi, PDF paylasim QA, checkout QA ve iOS/Android gorsel QA henuz ayrica dogrulanmali.
- Yerel mobil arama/siralama normalize edildi; musteri urun aramasi ve temel portal admin mobil aramalarinda Turkce karakter varyant fallback'i var. Tum backend arama endpointleri icin sunucu ortak arama katmani hala ayrica ele alinmali.

## Teknik kalite / dogrulama eksikleri

- Android/iOS/tablet gorsel QA henuz yapilmadi. En az uc viewport gerekir: kucuk telefon, buyuk telefon, tablet.
- Mobilde webdeki yeni role/scope kurallari icin ortak permission/rol guard var; ancak otomatik test ve canli rol hesaplariyla cihaz QA henuz yok.
- Portal ve b2b uygulamalarinda ortak tasarim primitive'leri sinirli; yeni ekranlar ayni Sora ve renk sistemini kullansa da tekrar eden kart/filter/action pattern'leri ortaklastirilmeli.
- Offline/timeout/error states tum yeni ekranlarda standart hale getirilmeli.
- Aksiyon Radari / geri kazanim mobilde direkt islem butonlari, Excel paylasimi, katalog/gorsel satirindan aksiyon ekranina gecis, grup filtreleri, takip tarihi vurgusu, tablet kart grid'i ve hizli sonuc/takip kisayollari var; web tarafindaki tam action-state modal/drill-down derinligi, canli cihaz QA ve otomatik aksiyon kapanis kurallari henuz yok.

## 135. Android ilk test hazirligi: uzun metin ve dinamik kolon tasmalari

Ilk Android testine gecmeden once son riskli mobil tasma turu kapatildi:

- Musteri uygulamasi `OrdersScreen`, `QuotesScreen`, `RequestsScreen` liste kartlarinda arama, durum segmenti, ozet KPI kutulari, durum rozetleri, siparis/teklif/talep numaralari, tarih/tutar/kalem satirlari ve bos durumlar dar ekranlarda satir limitli hale getirildi.
- Musteri uygulamasi `OrderDetailScreen`, `QuoteDetailScreen`, `RequestDetailScreen` kalem kartlari tablet genisliginde iki kolonlu, telefon genisliginde tek kolonlu calisacak sekilde guclendirildi; uzun urun adlari, kodlar, fiyat tipi, not ve hata metinleri sinirlandi.
- Portal `SearchScreen` icin F10 stok/cari arama sonuc kartlarinda baslik, kod, VKN, dinamik Mikro kolon adlari, dinamik kolon degerleri, alan secimi chip'leri ve stok detay modal alanlari satir limitli hale getirildi.
- Bu tur is mantigina dokunmadi; yalnizca Android ilk kullanimda ekran disina tasan metin, rozet ve dinamik kolon kaynakli UI bozulmalarini azaltir.

## 136. Android debug APK preflight

Android testine gecmeden once native build preflight tamamlandi:

- Uzun workspace yolu React Native C++ build'inde Windows 260 karakter sinirina takildi. `subst` surucu kokunde Expo autolinking `package.json` aramasini hatali yaptigi icin kisa NTFS junction yollari kullanildi:
  - `C:\b2bp` -> `mobile/portal`
  - `C:\b2bb` -> `mobile/b2b`
- Portal Android build komutu `C:\b2bp\android` altinda calistirildi: `$env:NODE_ENV='development'; .\gradlew.bat :app:clean :app:assembleDebug -x lint -x test`
- Musteri B2B Android build komutu `C:\b2bb\android` altinda calistirildi: `$env:NODE_ENV='development'; .\gradlew.bat :app:clean :app:assembleDebug -x lint -x test`
- Iki debug APK de uretildi:
  - Portal APK: `C:\b2bp\android\app\build\outputs\apk\debug\app-debug.apk` (~99.5 MB)
  - B2B APK: `C:\b2bb\android\app\build\outputs\apk\debug\app-debug.apk` (~99.2 MB)
- `adb devices` calisti ancak bagli cihaz/emulator listesi bos geldi; bu nedenle kurulum ve gercek cihaz smoke test henuz yapilmadi.

## 137. Android test scriptleri

Android testini tekrar edilebilir hale getirmek icin `mobile/scripts` altina iki yardimci script eklendi:

- `mobile/scripts/build-android-test-apk.ps1`
  - Parametreler: `-App portal|b2b|all`, opsiyonel `-NoClean`.
  - Metro/dev server gerektirmeyen standalone test APK uretir (`assembleRelease`, debug keystore ile imzali).
  - Windows uzun yol limitine takilmamak icin uygulamayi kisa fiziksel staging klasorune kopyalar:
    - `C:\b2bapk\portal`
    - `C:\b2bapk\b2b`
  - APK'yi test icin sabit cikti yoluna kopyalar:
    - `mobile/builds/portal-test.apk`
    - `mobile/builds/b2b-test.apk`
- `mobile/scripts/build-android-debug.ps1`
  - Parametreler: `-App portal|b2b|all`, opsiyonel `-NoClean`.
  - Gelistirme/debug APK uretir; normal kullanici testi icin oncelikli dosya degildir, cunku debug varyantlari Metro/dev server davranisina bagli olabilir.
  - Windows uzun yol limitine takilmamak icin kisa junction yollari olusturur/kullanir:
    - `C:\b2bp` -> `mobile/portal`
    - `C:\b2bb` -> `mobile/b2b`
  - Gradle exit code'u artik acikca kontrol edilir; build basarisizsa eski APK'yi basarili sanmaz.
  - APK'yi test icin sabit cikti yoluna kopyalar:
    - `mobile/builds/portal-debug.apk`
    - `mobile/builds/b2b-debug.apk`
- `mobile/scripts/install-android-debug.ps1`
  - Parametreler: `-App portal|b2b|all`, `-Variant test|debug`, opsiyonel `-DeviceId`.
  - Varsayilan `-Variant test` oldugu icin standalone test APK'larini kurar.
  - `adb devices` ile bagli cihaz/emulator kontrol eder.
  - Cihaz yoksa acik hata verir; birden fazla cihaz varsa `-DeviceId` ister.
- `mobile/scripts/install-android-test-apk.ps1`
  - `install-android-debug.ps1 -Variant test` icin kisa wrapper.

Script dogrulamasi:

- `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/build-android-test-apk.ps1 -App portal -NoClean` basarili; standalone Portal APK uretildi.
- `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/build-android-test-apk.ps1 -App b2b -NoClean` basarili; standalone B2B APK uretildi.
- `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/build-android-debug.ps1 -App portal -NoClean` basarili.
- `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/build-android-debug.ps1 -App b2b -NoClean` basarili.
- `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/install-android-test-apk.ps1 -App all` cihaz yokken beklenen sekilde "Bagli Android cihaz/emulator yok" hatasi verdi.

## Son dogrulama

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/b2b/src/screens/OrdersScreen.tsx mobile/b2b/src/screens/QuotesScreen.tsx mobile/b2b/src/screens/RequestsScreen.tsx mobile/b2b/src/screens/OrderDetailScreen.tsx mobile/b2b/src/screens/QuoteDetailScreen.tsx mobile/b2b/src/screens/RequestDetailScreen.tsx mobile/portal/src/screens/SearchScreen.tsx` basarili; sadece mevcut LF/CRLF uyarilari gorundu.
- Portal Android debug APK build basarili.
- Musteri B2B Android debug APK build basarili.
- `mobile/scripts/build-android-debug.ps1 -App portal -NoClean` basarili; `mobile/builds/portal-debug.apk` uretildi.
- `mobile/scripts/build-android-debug.ps1 -App b2b -NoClean` basarili; `mobile/builds/b2b-debug.apk` uretildi.
- `mobile/scripts/build-android-test-apk.ps1 -App portal -NoClean` basarili; `mobile/builds/portal-test.apk` uretildi.
- `mobile/scripts/build-android-test-apk.ps1 -App b2b -NoClean` basarili; `mobile/builds/b2b-test.apk` uretildi.
- `adb devices` cihaz/emulator bagli gostermedi; Android kurulum/smoke test icin cihaz baglanmasi gerekiyor.

## 138. Mobil marka/UI kabugu sertlestirme

APK parse/signing konusu kullanici talimatiyla ikinci plana alindi; uyku boyunca oncelik mobilin ilk kullanim kalitesi ve web tarzi ile uyumlu hale getirilmesine verildi.

- Ortak mobil tema tokenlari iki uygulamada genisletildi:
  - `mobile/portal/src/theme.ts`
  - `mobile/b2b/src/theme.ts`
  - `primaryDark`, `primaryMuted`, `surfaceMuted`, `successSoft`, `dangerSoft`, `warningSoft` gibi webdeki lacivert-beyaz-operasyon diliyle uyumlu renkler eklendi.
- Portal ve musteri login ekranlari duz form gorunumunden cikartildi:
  - `mobile/portal/src/screens/LoginScreen.tsx`
  - `mobile/b2b/src/screens/LoginScreen.tsx`
  - Koyu lacivert marka hero, logo kutusu, Sora tipografi, ikonlu input shell, hata kutusu, ileri ikonlu ana CTA ve role/akissa uygun kisa fayda pilleri eklendi.
  - KeyboardAvoidingView + ScrollView ile dar telefonlarda klavye acikken formun ezilme riski azaltildi.
- Alt navigasyon kabugu web tarziyla uyumlu hale getirildi:
  - `mobile/portal/src/navigation/PortalTabs.tsx`
  - `mobile/b2b/src/navigation/CustomerTabs.tsx`
  - Aktif sekmeye soft lacivert ikon zemini, Sora label fontu, daha dengeli yukseklik, golge/elevation ve guvenli alan uyumu eklendi.
- Portal dashboard ilk ekrani profesyonel yonetim paneli hissine yaklastirildi:
  - `mobile/portal/src/screens/DashboardScreen.tsx`
  - Ust kisim koyu lacivert hero karta alindi; bildirim aksiyonu, bekleyen siparis, okunmamis bildirim ve donem ozeti eklendi.
- Musteri mobil ana sayfa hero zenginlestirildi:
  - `mobile/b2b/src/screens/HomeScreen.tsx`
  - Musteri adi, storefront ikonu, sepet/siparis/vitrin metrikleri ve daha net B2B fayda metni eklendi.
- Saha satis urun arama kartlari dar telefonda daha kompakt hale getirildi:
  - `mobile/portal/src/screens/FieldSalesScreen.tsx`
  - Arama satiri wrap destekli oldu; input/button birbirini ezmez.
  - Urun karti kompakt telefonda daha dusuk padding, daha kucuk gorsel, kontrollu baslik/kod/metapill ve tam genislik aksiyon davranisi kullanir.
- Musteri "Daha Fazla" ekrani ilk kullanim icin yeniden ele alindi:
  - `mobile/b2b/src/screens/MoreScreen.tsx`
  - Koyu marka hero, modul aramasi, sonuc sayaci, ikonlu kartlar, bolum etiketi ve bos sonuc karti eklendi.
- Portal "Daha Fazla" hero rengi yeni koyu marka sistemiyle esitlendi:
  - `mobile/portal/src/screens/MoreScreen.tsx`
- Musteri urun listesi kartlari daha stabil hale getirildi:
  - `mobile/b2b/src/screens/ProductsScreen.tsx`
  - Urun kartlarina hafif web uyumlu golge/elevation eklendi; kart basligi, rozet alani, kod satiri ve gorsel kapsayicisi minWidth/flexShrink/line-height kontroluyle dar ekran tasmasina karsi guclendirildi.
  - Gorsel alani sabit piksel yerine oranli calisir; sepet CTA minimum dokunma yuksekligini korur.
- Satici ilk kullanim operasyon ekranlari marka hero ile guclendirildi:
  - `mobile/portal/src/screens/OrderCreateScreen.tsx`
  - `mobile/portal/src/screens/QuoteCreateScreen.tsx`
  - Manuel siparis ve teklif olusturma ekranlari duz basliktan cikartilip koyu lacivert operasyon hero'suna alindi.
  - Siparis ekraninda kalem sayisi/toplam tutar, teklif ekraninda kalem sayisi/secili cari gibi hizli durum pilleri eklendi.
- Splash sonrasi yukleme kabugu markalandi:
  - `mobile/portal/App.tsx`
  - `mobile/b2b/App.tsx`
  - Duz spinner yerine logo, beyaz yukleme karti, Sora metin ve web uyumlu golge/elevation kullanildi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` once Windows `hermesc.exe permission denied` verdi; sandbox disi tekrar calistirinca Android ve iOS Hermes bundle basarili uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` once Windows `hermesc.exe permission denied` verdi; sandbox disi tekrar calistirinca Android ve iOS Hermes bundle basarili uretildi.

Kalan risk:

- Gercek Android/iOS cihaz gorsel QA hala tamamlanmadi. APK parse/signing konusu kullanici talimatiyla simdilik bekletildi.
- Webdeki tum ekranlarin piksel/akiskalite paritesi henuz garanti degil; ancak ilk acilis, ana navigasyon, dashboard, musteri ana sayfa, musteri menu ve saha satis urun karti gibi ilk kullanim hissini en cok etkileyen alanlar bu turda guclendirildi.

## 139. Vade Excel import mobil paritesi

Kullanici APK parse/imza konusunu ikinci plana aldiktan sonra mobil web-parite aciklarina devam edildi. Vade tarafinda webdeki en net eksik, `/vade/import` ekraninin mobilde yalniz "tek cari manuel duzeltme" olarak kalmasiydi.

- `mobile/portal/src/screens/VadeScreen.tsx` icine gercek Mikro vade Excel import akisi eklendi.
- Mobil import, web ekranindaki mevcut backend sozlesmesini kullanir:
  - `adminApi.importVadeBalances(rows)`
  - Backend endpoint: `POST /admin/vade/import`
- Yeni mobil akis:
  - `expo-document-picker` ile `.xlsx/.xls` dosyasi secilir.
  - `expo-file-system` ile dosya base64 okunur.
  - `xlsx` ile ilk sayfa parse edilir.
  - Turkce/ingilizce karakter farkina dayanikli header normalize edilir.
  - Su kolonlar web mantigiyla eslenir: cari hesap kodu, vadesi gecen bakiye, vadesi gecen bakiye vadesi, vadesi gecmemis bakiye, vadesi gecmemis bakiye vadesi, toplam bakiye, valor, cari odeme vadesi, bakiyeye konu ilk evrak.
  - Import oncesi satir sayisi ve ornek cari kodlari mobil ekranda gosterilir.
  - Import tamamlaninca okunan/aktarilan/atlanan ozet kartlari gosterilir ve bakiye listesi yenilenir.
- Tek cari manuel duzeltme formu kaldirilmadi; acil tek cari duzeltme icin ikinci kart olarak korundu.
- Import/export gibi pahali aksiyonlar mevcut `actionLoadingRef`/`exportingRef` kilitleriyle cift dokunusa karsi korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal/src/screens/VadeScreen.tsx mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.

Kalan risk:

- Gercek Android/iOS cihazda dosya secici ve buyuk Mikro Excel dosyasi performansi henuz denenmedi.

## 140. Kritik sepet/urun/takip ekranlari marka ve kullanis polish

APK parse/imza problemi kullanici talimatiyla oncelik disina alindigi icin mobilin web tarzi ve ilk kullanim kalitesi uzerinde devam edildi. Bu turda musteri alisveris hattinin son adimlari ve personel satis listeleri guclendirildi.

- `mobile/b2b/src/screens/CartScreen.tsx`
  - Sepet ustune koyu lacivert marka hero eklendi.
  - Hero icinde kalem, miktar ve toplam metrikleri gosterilir.
  - Sepet satirlarina urun gorseli/placeholder eklendi; uzun urun adlari yan panelde sarar, gorsel alan sabit kalir.
  - Tek tek miktari sifira dusurmeden kullanilabilecek acik `Sepetten Sil` aksiyonu eklendi.
- `mobile/b2b/src/screens/ProductDetailScreen.tsx`
  - Ana fiyat paneli koyu lacivert web tarzi fiyat kutusuna alindi.
  - Tamamlayici oneriler kartlarinda gorsel, ad, kod, fiyat, not ve aksiyon bloklari ayrildi; kartlara hafif golge/elevation eklendi.
- `mobile/b2b/src/screens/OrdersScreen.tsx`
  - Siparis listesi koyu marka hero ile baslar; musteri takip ekranlari ana mobil tarza yaklasti.
- `mobile/b2b/src/screens/QuotesScreen.tsx`
  - Teklif listesi koyu marka hero ile baslar; PDF/durum takibi daha kurumsal bir kabuga alindi.
- `mobile/b2b/src/screens/RequestsScreen.tsx`
  - Alt kullanici talep listesi koyu marka hero ile baslar.
- `mobile/portal/src/screens/OrdersScreen.tsx`
  - Personel siparis listesine `Satis Operasyonu` hero kabugu eklendi; mevcut onay/red/detay davranisi korunur.
- `mobile/portal/src/screens/QuotesScreen.tsx`
  - Personel teklif listesine `Teklif Operasyonu` hero kabugu eklendi; mevcut onay/red/PDF/cevirme davranisi korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check` ilgili dosyalarda basarili; yalniz mevcut LF/CRLF uyarilari gorundu.

Kalan risk:

- Gercek cihazda uzun urun adlari, cok kalemli sepet, PDF paylasimi ve teklif/siparis onay aksiyonlari uctan uca denenmedi.

## 141. Mobil Aksiyon Radari veri ve aksiyon kapsami

Webde daha once kullanicinin isaret ettigi "Aksiyon Radari az veri gosteriyor ve aksiyon alamiyorum" riskine karsi mobil flatten katmani tekrar kontrol edildi.

- `mobile/portal/src/screens/ReportsScreen.tsx`
  - Aksiyon Radari artik eksik gorselli urunleri yalniz `imageQuality.missingImageProducts` altindan degil, `catalogScore.samples.missingImages` altindan da okur.
  - Ayni urun iki kaynakta gelirse id/mikro kod/urun kodu bazinda tek satira dusurulur.
  - Backend toplam sayisi, mobilde listelenen ornek satirdan fazlaysa ek toplu aksiyon satirlari uretilir:
    - Ek eksik gorsel -> `Urunler` ekranina `NO_IMAGE` kalite filtresiyle gider.
    - Ek kategori eksigi -> `Urunler` ekranina `BAD` kalite filtresiyle gider.
    - Ek birim kontrolu -> `Urunler` ekranina `BAD` kalite filtresiyle gider.
    - Ek KDV kontrolu -> `Urunler` ekranina `BAD` kalite filtresiyle gider.
  - Boylece radar sadece birkac ornek kart gosterip durmaz; toplam sorun sayisi ornekten buyukse kullanici filtreli aksiyon ekranina gecis alir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal/src/screens/ReportsScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarisi gorundu.

Kalan risk:

- Canli backend snapshot verisiyle toplam/ornek sayi davranisi cihazda gorsel olarak test edilmedi.

## 142. Musteri detay ve hesap ekranlari marka butunlugu

Musteri uygulamasinda liste ekranlari marka hero'ya yaklastiktan sonra, takip detaylari ve hesap ekranlari da ayni web tarziyla guclendirildi.

- `mobile/b2b/src/screens/OrderDetailScreen.tsx`
  - Siparis detayina koyu lacivert ozet hero eklendi.
  - Durum, kalem ve toplam metrikleri hero icinde gosterilir.
- `mobile/b2b/src/screens/QuoteDetailScreen.tsx`
  - Teklif detayina koyu ozet hero eklendi.
  - Durum, kalem, toplam ve gecerlilik metrikleri hero icinde gosterilir.
- `mobile/b2b/src/screens/RequestDetailScreen.tsx`
  - Talep detayina koyu ozet hero eklendi.
  - Durum, toplam kalem, secili kalem ve parent hesaplarda secili toplam hero icinde gosterilir.
- `mobile/b2b/src/screens/ProfileScreen.tsx`
  - Profil ekranina hesap hero'su eklendi; duz baslik/form hissi azaltildi.
- `mobile/b2b/src/screens/PreferencesScreen.tsx`
  - Tercihler ekranina hesap ayarlari hero'su eklendi.
  - KDV gorunumu ve push izin durumu hero metriklerinde gosterilir.
- `mobile/b2b/src/screens/NotificationsScreen.tsx`
  - Bildirim listesine marka hero'su eklendi; arama, kategori ve okunma filtreleri korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check` ilgili dosyalarda basarili; yalniz mevcut LF/CRLF uyarilari gorundu.

Kalan risk:

- Gercek cihazda PDF paylasimi, push izin/test bildirimi ve uzun bildirim metni gorsel QA henuz yapilmadi.

## 143. Personel teklif/siparis urun secim kartlari mobil ergonomisi

Saha personelinin mobilde teklif veya manuel siparis girerken urun adlarinin, gramaj/ambalaj varyantlarinin ve benzer kodlarin birbirine karismasi riski icin urun secim kartlari tekrar ele alindi.

- `mobile/portal/src/screens/QuoteCreateScreen.tsx`
  - Daha once satin alinmis urun havuzu ve genel arama sonuc kartlarina sabit urun gorseli/placeholder alani eklendi.
  - Urun adi, kod, depo stoklari, birim/koli bilgisi ve fiyat ayni kartta korunur.
  - `Teklife Ekle` butonu kart metin blogunun altina alindi; dar ekranda buton urun adini sikistirmiyor.
  - Kart basligi artik checkbox + gorsel + esneyen metin blogu olarak calisir; uzun urun adlari 2 satira kadar okunur.
- `mobile/portal/src/screens/OrderCreateScreen.tsx`
  - Manuel siparis urun arama sonuc kartlarina gorsel/placeholder, merkez/topca stok ve liste fiyati eklendi.
  - Urun adi 3 satira kadar gorunur; fiyat ve stok metni ayri satirlara ayrildigi icin benzer urunleri secmek daha kolaylasir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` ilk denemede Hermes `permission denied` verdi; sandbox disi/yukseltilmis izinle tekrar calistirilinca Android ve iOS Hermes bundle basariyla uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle Android ve iOS Hermes bundle basariyla uretildi.

Kalan risk:

- Gercek Android cihazda cok uzun urun adlari ve kotu/eksik gorsel URL'leriyle gorsel QA henuz yapilmadi.
- APK parse/imza problemi kullanici talimatiyla bu turda oncelik disinda birakildi; bundle dogrulamasi uygulama kodunun Hermes seviyesinde paketlenebildigini gosterir, kurulum paketinin cihazda imza/installer davranisini garanti etmez.

## 144. Arama Yonetimi mobil paritesi

Webde `/admin/search-management` altinda bulunan arama kalite yonetimi mobil portalda eksikti. Bu ekran, ozellikle buyuk/kucuk harf ve Turkce/Ing karakter duyarsizligi duzeltmelerinden sonra operasyonun "hangi aramalar hala sonuc vermiyor" ve "hangi urune hangi es-anlamli kelime eklenecek" takibini mobilde yapabilmesi icin kritik.

- `mobile/portal/src/api/admin.ts`
  - `getSearchMisses`, `updateSearchMiss`, `getProductAliases`, `updateProductAliases` metotlari eklendi.
  - `SearchMissItem`, `ProductAliasItem`, `SearchMissStatus`, `MobilePaginationMeta` tipleri eklendi.
- `mobile/portal/src/screens/SearchManagementScreen.tsx`
  - Yeni mobil ekran eklendi.
  - Webdeki iki sekme korundu:
    - `Sonucsuz`: durum filtresi (`Acik`, `Cozuldu`, `Tumu`), arama, tekrar sayisi, son arama tarihi ve `Cozuldu/Acik olarak isaretle` aksiyonu.
    - `Es-anlam`: urun arama, urun kodu/kategori bilgisi, cok satirli alias girisi ve satir bazli kaydetme.
  - Telefon/tablet uyumlu lacivert hero, kart tabanli liste ve sayfalama eklendi.
- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `SearchManagement` stack route'u eklendi ve portal permission guard'a baglandi.
- `mobile/portal/src/navigation/portalModules.ts`
  - `Arama Yonetimi` modul linki `Sistem` bolumune eklendi (`admin:search-management`).
  - `Pasif Stoklar` link etiketi `Stok Acma / Pasif Stok` olarak duzeltildi; cunku mevcut mobil ekran yeni stok acma + pasif stok aktiflestirme formunu zaten iceriyor.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli rol hesabiyla `admin:search-management` izninin mobil menude dogru gorunup gizlendigi ve endpointlerin production verisiyle calistigi cihazda henuz denenmedi.

## 145. Diversey Stok mobil paritesi

Webde `DIVERSEY` kullanicisi login sonrasi `/diversey/stok` ekranina yonleniyor; admin panelde de `dashboard:diversey-stok` izniyle bu stok listesine erisim var. Mobil portalda bu is akisi ayrica gorunmuyordu. Sifirdan basit bir tablo eklemek yerine mevcut profesyonel `ProductsScreen` kullanildi; boylece stok/fiyat, katalog kalite skoru, galeri, gorsel yukleme ve detayli kunye aksiyonlari kaybedilmedi.

- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `Products` route parametrelerine `scope: 'DIVERSEY'` eklendi.
- `mobile/portal/src/navigation/portalModules.ts`
  - `Diversey Stok` modul linki `Katalog` bolumune eklendi.
  - Link `Products` ekranini `{ scope: 'DIVERSEY' }` parametresiyle acar.
  - `Products` rota yetkisi `admin:products` veya `dashboard:diversey-stok` olarak genisletildi; aksi halde webde yetkili Diversey kullanicisi mobilde urun ekranina takilabilirdi.
  - Modul linklerine route parametresi tasiyabilmek icin `params` destegi eklendi.
- `mobile/portal/src/screens/MoreScreen.tsx`
  - Modul kartlari artik route parametresiyle navigasyon yapabiliyor.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - `scope: 'DIVERSEY'` geldiginde serverdan `diversey` aramasi ile temel set yuklenir.
  - Arama kutusu bu set icinde lokal daraltma yapar; kullanici yeni arama yazinca webdeki Diversey kapsami disina cikmaz.
  - Baslik ve alt metin `Diversey Stok` baglamina gore degisir.
  - Mevcut katalog kalite, gorsel/galeri ve detay aksiyonlari aynen korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli `DIVERSEY` rolu veya `dashboard:diversey-stok` izni olan hesapla mobil menude gorunurluk ve urun seti cihazda henuz denenmedi.

## 146. Mobil parite kapanis checkpoint'i

APK parse/imza problemi kullanici talimatiyla bu turda oncelik disina alindi. Bu checkpoint, kod ve bundle seviyesinde mobil parite calismasinin mevcut durumunu ayirmak icindir.

Bu tur sonunda yeni kapanan kod bosluklari:

- Webdeki `/admin/search-management` icin mobil `Arama Yonetimi` ekrani, API metotlari, menu linki ve stack route'u eklendi.
- Webdeki `/diversey/stok` akisi icin mobil `Diversey Stok` girisi eklendi.
- `Diversey Stok`, mevcut `ProductsScreen` uzerinden calisir; katalog kalite, stok/fiyat, galeri, gorsel yukleme ve detay aksiyonlari korunur.
- `Products` rota yetkisi `admin:products` veya `dashboard:diversey-stok` kabul edecek sekilde genisletildi.
- `MoreScreen` artik route parametresi tasiyabildigi icin tek ekranin farkli operasyon baglamlariyla acilmasi mumkun.

Son dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kod eksiği olarak degil, sonraki test/sertlestirme isi olarak kalanlar:

- Android APK parse/imza/installer problemi.
- Gercek Android/iOS cihaz ve tabletlerde gorsel QA.
- Canli rol hesaplariyla permission/menu gorunurluk testi.
- Push teslimi, PDF/Excel paylasimi, kamera/konum/dosya secici gibi native izin akislari.
- Mikro yazan operasyonlarda canli uctan uca kabul testi.

## 147. Rapor merkezi direkt mobil girisleri

Webde cok sayida rapor ayri URL olarak gorunuyor. Mobilde bu raporlar operasyonel olarak `ReportsScreen`, `DecisionSupport`, `FamilyReports` ve `AuditReports` gibi birlesik ekranlarda tasiniyor. Kod paritesi olsa bile kullanici mobil menude raporu direkt bulamazsa "mobilde yok" algisi olusur. Bu turda en kritik raporlar icin `ReportsScreen` route parametresi eklendi.

- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `Reports` route'u `initialReport` parametresi alacak sekilde genisletildi.
  - Desteklenen baslangic sekmeleri: `cost`, `margin`, `profit`, `price`, `priceNew`, `topProducts`, `topCustomers`, `productCustomers`, `complementMissing`, `customerActivity`, `customerCarts`, `actionRadar`.
- `mobile/portal/src/screens/ReportsScreen.tsx`
  - Ekran acilirken `route.params.initialReport` varsa ilgili rapor sekmesiyle baslar.
  - Ayni ekran acikken baska rapor linkine gidilirse aktif sekme yeni parametreye gore guncellenir.
  - Rapor ekraninin ustu koyu lacivert marka hero'suna alindi; aktif rapor adi, satir sayisi, kolon davranisi ve Excel hazir/hazirlaniyor durumu ilk bakista gorunur.
- `mobile/portal/src/navigation/portalModules.ts`
  - `Rapor` bolumune direkt girisler eklendi:
    - `Aksiyon Radari` -> `Reports` / `actionRadar`
    - `Musteri Sepetleri` -> `Reports` / `customerCarts`
    - `Tamamlayici Eksikler` -> `Reports` / `complementMissing`
    - `Musteri Aktivitesi` -> `Reports` / `customerActivity`
    - `Top Urunler` -> `Reports` / `topProducts`
    - `Top Cariler` -> `Reports` / `topCustomers`
  - Her link webdeki rapor permission anahtarini kullanir; yetkisi olmayan kullanicinin mobil menusu sismez.
  - `Reports` route guard'i direkt rapor linklerindeki izinlerle uyumlu hale getirildi. Aksi halde ornegin yalniz `reports:customer-activity` veya `admin:quotes` yetkisiyle link gorunup ekranda `Erisim Engellendi` riski olusurdu.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli rol hesaplariyla yeni rapor kisa yollarinin mobil menude dogru gorunup gizlendigi cihazda henuz denenmedi.

## 148. Musteri menu arama bulunabilirligi

Musteri mobil uygulamasinda ana sekmeler (`Urunler`, `Indirimli`, `Daha Once`, `Sepet`) alt navigasyonda gorunuyordu; ancak `Daha Fazla` ekranindaki menu aramasinda bu web akislari cikmiyordu. Mobilde kullanici islem arayarak ilerlerse temel katalog/sepet ozellikleri yokmus gibi algilanabilirdi.

- `mobile/b2b/src/screens/MoreScreen.tsx`
  - Menu linklerine route parametresi destegi eklendi.
  - `Daha Fazla` aramasina ana sekme kisa yollari eklendi:
    - `Tum Urunler` -> `Tabs / Products`
    - `Indirimli Urunler` -> `Tabs / DiscountedProducts`
    - `Daha Once Aldiklarim` -> `Tabs / PurchasedProducts`
    - `Sepet` -> `Tabs / Cart`
  - Bu linkler yeni ekran eklemez; mevcut profesyonel sekme ekranlarini acarak webdeki ana alisveris akisini mobil menu aramasindan da bulunabilir yapar.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda alt tab icindeki sekme degisimi ve `Daha Fazla` arama ergonomisi gorsel olarak henuz denenmedi.

## 149. Musteri ana katalog ekranlari marka hero paritesi

Musteri uygulamasinda `Urunler`, `Indirimli Urunler` ve `Daha Once Aldiklarim` ekranlari webdeki en kritik alisveris yuzeyleri. Kartlar ve arama/filtre akislari guclendirilmis olsa da ust kisim halen duz baslik + arama hissindeydi. Bu turda bu uc ana katalog ekrani web tarzi koyu lacivert marka hero'suna alindi.

- `mobile/b2b/src/screens/ProductsScreen.tsx`
  - `Katalog / Urunler` hero'su eklendi.
  - Hero icinde gorunen urun sayisi, aktif fiyat tipi ve depo kapsami gosterilir.
- `mobile/b2b/src/screens/DiscountedProductsScreen.tsx`
  - `Firsatlar / Indirimli Urunler` hero'su eklendi.
  - Fazla stok/kampanya baglami, urun sayisi, fiyat tipi ve depo bilgisi ustte gorunur.
- `mobile/b2b/src/screens/PurchasedProductsScreen.tsx`
  - `Tekrar Siparis / Daha Once Aldiklarim` hero'su eklendi.
  - Gecmis alimdan tekrar siparis baglami ve aktif liste metrikleri ustte gorunur.

Korunanlar:

- Arama, kategori/depo/siralama filtreleri, fiyat tipi segmenti, stok kontrollu miktar artirma, sepete ekleme ve aktivite takibi degismedi.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Gercek cihazda uzun kategori/depo metinleri ve cok dar telefonlarda hero metriklerinin gorsel sarma davranisi henuz denenmedi.

## 150. Musteri mobil genel UI standardizasyonu

APK imza/kurulum sorunu bu turda bilerek onceliklendirilmedi; kullanici mobil kod ve UI paritesine devam edilmesini istedi. Bu turda musteri uygulamasinda ilk kullanimda en cok acilacak ekranlar ayni koyu lacivert marka dili, Sora font ritmi ve metrikli hero yapisina cekildi.

- `mobile/b2b/src/screens/MoreScreen.tsx`
  - `Daha Fazla` menusu bolum filtresi kazandi: `Tumu`, `Siparis`, `Katalog`, `Hesap`.
  - Her bolum chip'inde adet gosterilir; arama ve bolum filtresi birlikte calisir.
  - Menu aramasi ile ana katalog/sepet/siparis/h hesap ekranlari daha hizli bulunur hale geldi.
- `mobile/b2b/src/screens/AgreementsScreen.tsx`
  - `Anlasmali Fiyatlar` ekrani fiyat anlasmalari hero'suna alindi.
  - Ustte gorunen urun sayisi, aktif fiyat tipi ve depo kapsami gosterilir.
  - Arama, kategori/depo/siralama filtresi, fiyat tipi segmenti, stok kontrollu miktar ve sepete ekleme korunur.
- `mobile/b2b/src/screens/InvoicesScreen.tsx`
  - `Faturalarim` ekrani e-fatura arsivi hero'suna alindi.
  - Toplam fatura, filtre sonucu ve sayfa bilgisi ustte gorunur.
  - PDF ac/paylas akisi degismedi.
- `mobile/b2b/src/screens/CollectionsScreen.tsx`
  - `Koleksiyonlar` ekrani katalog secimleri hero'suna alindi.
  - Aktif koleksiyon sayisi ve mobil/tablet gorunum baglami ustte gorunur.
- `mobile/b2b/src/screens/PendingOrdersScreen.tsx`
  - `Bekleyen Siparisler` ekrani teslimat takibi hero'suna alindi.
  - Siparis sayisi, kalan miktar ve geciken siparis sayisi ustte gorunur.
  - Arama, teslim durum filtresi, kart icindeki detay ac/kapa ve satir gorunumu korunur.
- `mobile/b2b/src/screens/CustomerTasksScreen.tsx`
  - `Taleplerim` ekrani musteri destek hero'suna alindi.
  - Toplam, acik ve yuksek oncelikli talep metrikleri ustte gorunur.
  - Liste/kanban tercihi, yeni talep formu, durum filtresi ve yenileme aksiyonu korunur.
- `mobile/b2b/src/screens/NewCategoriesScreen.tsx`
  - `Yeni Kategoriler` hero'su koyu lacivert marka standardina cekildi.
  - Kategori, urun ve fiyat tipi metrikleri ustte gorunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Bu tur UI ve bundle dogrulamasi kod seviyesinde yapildi; gercek Android cihazda dar ekran sarma, PDF paylasma ve dokunma hedefleri henuz denenmedi.

## 151. Portal mobil ana operasyon ekranlari marka hero paritesi

Personel portalinda cok sayida ekran web paritesine tasindi; ancak bazi kritik operasyon ekranlari hala eski duz baslikla aciliyordu. Bu turda ilk kullanima hazirlik icin en sik is akisi olan urun/katalog, siparis takip, saha satis ve vade ana ekrani ayni metrikli hero standardina alindi.

- `mobile/portal/src/screens/ProductsScreen.tsx`
  - `Urunler` ve `Diversey Stok` kapsamlari koyu lacivert katalog hero'suna alindi.
  - Liste adedi, kritik kalite, gorselsiz urun ve galeri eksigi metrikleri ustte gorunur.
  - Gorsel yukleme, galeri yonetimi, kalite aksiyon listesi, arama ve filtreler korunur.
- `mobile/portal/src/screens/OrderTrackingScreen.tsx`
  - `Siparis Takip` ekrani operasyon hero'suna alindi.
  - Musteri ozeti, tedarikci ozeti, bekleyen siparis ve mail log adedi ustte gorunur.
  - Sync, mail gonder, sync+mail, test mail ve cari bazli mail aksiyonlari korunur.
- `mobile/portal/src/screens/FieldSalesScreen.tsx`
  - `Saha Satis` ekrani saha operasyonu hero'suna alindi.
  - Secili cari durumu, urun arama sonucu adedi ve teklif havuzu adedi ustte gorunur.
  - Cari arama, urun arama, ziyaret notu, fotograf/konum ve teklif havuzu akislari korunur.
- `mobile/portal/src/screens/VadeScreen.tsx`
  - `Vade Takip` ana ekrani Excel kaynakli vade operasyonu hero'suna alindi.
  - Cari, not, atama ve aktif Excel/export adedi ustte gorunur.
  - Panel/Analiz/Yonetim kisa yollari, Excel export, bakiyeler/not/takvim/atama/import sekmeleri korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk / sonraki backlog:

- Portalda daha az kullanilan ayar, rol, audit, banner, kategori, kampanya, tedarikci ayarlari gibi ekranlarda hala duz baslik kullanan yerler var. Bunlar ilk kullanim bloklayici degil; sonraki "mobil UI cilasi" turunda ayni hero standardina alinmali.
- APK parse/imza/cihaz kurulum problemi bu turda bilerek ertelendi; kod export'u temiz ama gercek cihaz kurulum paketi ayrica cozulmeli.

## 152. Musteri detay ekranlari hero tamamlama

Musteri uygulamasinda liste ekranlari profesyonel hero standardina alindiktan sonra iki detay yuzeyi eski kart diliyle kalmisti. Bu turda detay ekranlari da ayni marka diline cekildi.

- `mobile/b2b/src/screens/CollectionDetailScreen.tsx`
  - Koleksiyon detay ust alani koyu lacivert hero'ya alindi.
  - Urun sayisi, fiyat tipi ve mobil/tablet gorunum bilgisi ustte gorunur.
  - Urun kartlari, detay navigasyonu ve sepete ekleme akisi korunur.
- `mobile/b2b/src/screens/CustomerTaskDetailScreen.tsx`
  - Talep detay ust alani koyu lacivert hero'ya alindi.
  - Talep basligi, durum/oncelik rozetleri, cari/atanan/tarih bilgileri ve aciklama ayni ust ozet alaninda gorunur.
  - Yorum ekleme, dosya yukleme, link/ek acma akislari korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda detay hero metin sarmasi ve uzun talep basliklari henuz gorsel olarak denenmedi.

## 153. Portal mobil genel hero cilasi ve cari operasyon tamamlama

APK imza/parse sorunu bilerek ertelendi; bu turda oncelik kullanimi etkileyen mobil UI/parite eksiklerine verildi. Portal tarafinda kalan eski duz basliklar tarandi ve ana is ekranlari webdeki mavi operasyon standardina cekildi.

- `mobile/portal/src/screens/Customer360Screen.tsx`
  - Cari 360 ust alani `Cari Komuta Merkezi` hero'suna alindi.
  - Arama sonucu/secili cari, sepet kalemi, acik aksiyon ve fiyat guveni metrikleri ustte gorunur.
  - Arama, cari secimi, sepet raporu, sepet temizleme, Excel export, fiyat guven karti, vade/temas, siparis/teklif, aksiyon, anlasma, aktivite ve fatura bolumleri korunur.
- `mobile/portal/src/screens/CustomerDetailScreen.tsx`
  - Musteri detayi koyu mavi cari yonetimi hero'suna alindi.
  - Aktif/pasif durum, cari kodu, kontak, alt kullanici, anlasma ve fiyat listesi metrikleri ustte gorunur.
  - Musteri ayarlari, kontak ekleme, alt kullanici ekleme ve anlasmali fiyat ekleme/silme akislari korunur.
- `mobile/portal/src/screens/CustomersScreen.tsx`
  - Musteriler ekrani cari yonetimi hero'suna alindi.
  - Toplam, filtreli, Mikro kodlu ve giris bilgisi olan cari metrikleri ustte gorunur.
  - Mikrodan secilen caride varsayilan kullanici adi `mikro cari kod`, sifre `mikro cari kod + 123` dolumu korunur.
- `mobile/portal/src/screens/PortfolioScreen.tsx`
  - Satis portfoyu hero'suna alindi.
  - Toplam, filtreli, aktif ve pasif cari metrikleri ustte gorunur.
- `mobile/portal/src/screens/CustomerEngagementScreen.tsx`
  - Cari aktivite ekrani `Aksiyon Merkezi` hero'suna alindi.
  - Cari sayisi ve ana durum ozetleri ustte gorunur.
  - KPI seridi, arama, temas modal'i ve aksiyon akislari korunur.
- `mobile/portal/src/screens/OperationsScreen.tsx`
  - Operasyon komuta merkezi hero'suna acik siparis, kritik risk, sicak cari ve veri blok metrikleri eklendi.
  - ATP, depo orkestrasyonu, musteri niyeti, risk, ikame ve veri kalite detaylari korunur.
- `mobile/portal/src/screens/WarehouseScreen.tsx`
  - Depo Kiosk hero'suna siparis, seri, detay satiri ve perakende sepet metrikleri eklendi.
  - Siparis, detay, sevk ve perakende sekmeleri korunur.
- `mobile/portal/src/screens/HotSalesScreen.tsx`
  - Sicak Satis hero'suna acik oturum, arac, son islem ve Mikro risk metrikleri eklendi.
  - Arac stogu, anlik satis, siparis teslimi, gun sonu ve arac yonetimi akislari korunur.
- Duz basliktan mavi marka hero standardina cekilen ek portal ekranlari:
  - `AuditReportsScreen.tsx`
  - `CustomerRecoveryReportScreen.tsx`
  - `DecisionSupportScreen.tsx`
  - `FamilyReportsScreen.tsx`
  - `FieldSalesVisitsScreen.tsx`
  - `UcarerDepotScreen.tsx`
  - `ComplementManagementScreen.tsx`
  - `EkstreScreen.tsx`
  - `QuoteLinesScreen.tsx`
  - `SearchScreen.tsx`
  - `SupplierPriceListSettingsScreen.tsx`
  - `SupplierPriceListsScreen.tsx`
  - `TasksScreen.tsx`

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- Portal ekranlarinda `styles.header` kullanip mavi hero stiline gecmemis eski header kalibi kalmadigi script ile tarandi.
- Musteri uygulamasinda eski duz `header` kalibi kalmadigi script ile tarandi.

Kalan risk / sonraki backlog:

- APK parse/imza/kurulum problemi bu turda bilerek oncelik disi birakildi.
- Gercek Android cihazda dar ekran, uzun urun/cari isimleri, buton dokunma hedefleri ve dosya paylasma akislari hala gorsel olarak denenmeli.
- Bazi detay/alt kartlarda basliklar dogal olarak `title`/`subtitle` stillerini kullaniyor; bu tarama sadece ekran ustu ana header standardini kapatir.

## 154. Portal detay/form ekranlari ve musteri urun detayi hero kapanisi

Portal ve musteri uygulamalarinda ana ekranlar mavi hero standardina alindiktan sonra kalan duz basliklar tekrar tarandi. Bu turda ozellikle form, detay ve operasyon onayi ekranlari ele alindi; amac ilk acilista kullanicinin is baglamini, durumunu ve ana sayilari gormesi, ama mevcut aksiyonlardan hicbirinin kaybolmamasiydi.

- `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`
  - Anlasmali fiyat ekrani `Cari Fiyat Kontrolu` hero'suna alindi.
  - Toplam cari, filtrelenen cari ve secili carinin anlasma adedi ustte gorunur.
  - Musteri secimi, anlasma listesi, urun arama, fiyat girisi, Excel sablon paylasma ve Excel aktarim akislari korunur.
- `mobile/portal/src/screens/ProductOverridesScreen.tsx`
  - Urun override ekrani `Fiyat Kurali` hero'suna alindi.
  - Arama sonucu, secili musteri tipi ve urun secim durumu ustte gorunur.
  - Urun arama, musteri tipi segmentleri ve kar marji kaydetme akisi korunur.
- `mobile/portal/src/screens/SyncScreen.tsx`
  - Senkronizasyon ekrani `Mikro Operasyonlari` hero'suna alindi.
  - Urun, cari ve fiyat senkron durumlari ustte gorunur.
  - Urun, gorsel, cari, fiyat senkron baslatma ve durum yenileme aksiyonlari korunur.
- `mobile/portal/src/screens/TaskCreateScreen.tsx`
  - Yeni talep formu `Talep Merkezi` hero'suna alindi.
  - Durum, oncelik ve tur secimi ustte gorunur.
  - Baslik, aciklama, durum, oncelik, tur ve kaydetme akislari korunur.
- `mobile/portal/src/screens/TaskDetailScreen.tsx`
  - Talep detay ekrani `Talep Merkezi` hero'suna alindi.
  - Talep basligi, durum, oncelik ve yorum adedi ustte gorunur.
  - Talep guncelleme, yorum ekleme ve dosya yukleme akislari korunur.
- `mobile/portal/src/screens/OrderDetailScreen.tsx`
  - Siparis detay ekrani `Siparis Operasyonu` hero'suna alindi.
  - Siparis numarasi, cari, durum, toplam ve bekleyen kalem adedi ustte gorunur.
  - Kalem secimi, tumunu/secili onaylama ve red aksiyonlari korunur.
- `mobile/portal/src/screens/QuoteDetailScreen.tsx`
  - Teklif detay ekrani `Teklif Operasyonu` hero'suna alindi.
  - Teklif numarasi, cari, durum, kalem ve toplam ustte gorunur.
  - Onay/red, Mikrodan guncelle, duzenle, siparise cevir, PDF ve onerili PDF aksiyonlari korunur.
- `mobile/portal/src/screens/QuoteConvertScreen.tsx`
  - Tekliften siparise cevirme ekrani `Tekliften Siparis` hero'suna alindi.
  - Secili kalem, secili toplam ve depo bilgisi ustte gorunur.
  - Kalem secme, miktar/rezerve/sorumluluk merkezi, seri ve belge bilgisi girme akislari korunur.
- `mobile/portal/src/screens/VadeCustomerScreen.tsx`
  - Vade cari detay ekrani `Tahsilat Takibi` hero'suna alindi.
  - Cari adi, toplam bakiye, not adedi ve atama adedi ustte gorunur.
  - Not ekleme, soz tarihi, atamalar ve siniflama kaydetme akislari korunur.
- `mobile/b2b/src/screens/ProductDetailScreen.tsx`
  - Musteri urun detayi icinde urun adi/kod/kategori/fiyat/stok alani mavi urun hero'suna alindi.
  - Fiyat, stok ve maksimum siparis miktari ustte gorunur.
  - Galeri, paket icerigi, fiyat tipi secimi, fiyat guven karti, miktar secimi, sepete ekleme ve tamamlayici oneriler korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk / sonraki backlog:

- APK parse/imza/kurulum problemi hala bilerek ertelenmis durumda; kod bundle'i temiz ama kurulum paketi ayrica cozulmeli.
- Gercek Android cihazda uzun urun/cari/teklif adlari, kalem secme dokunma hedefleri, PDF/dosya paylasma ve Excel dosya secme akislari gorsel olarak denenmeli.
- Portal ve musteri uygulamalarinda webdeki her derin rapor tablosunun birebir kolon paritesi gorsel olarak tek tek ispatlanmadi; bu kisim icin sonraki turda ekran ekran veri/kullanici akisi testi yapilmali.

## 155. Portal mobil bildirim merkezi ve tercih paritesi

Mobil portalda bildirim altyapisi dashboard widget'i ve arka plan context'i olarak vardi; ancak webdeki bildirim/tercih mantigini yonetebilecek tam ekran bir merkez yoktu. Bu turda personel uygulamasina musteri uygulamasindaki bildirim merkezi kalitesinde, portal rollerine uygun bir ekran eklendi.

- `mobile/portal/src/screens/NotificationsScreen.tsx`
  - Yeni tam ekran `Bildirim Merkezi` eklendi.
  - Bildirim listesi toplam/yeni/push ozetli koyu mavi hero ile acilir.
  - Baslik, icerik, kategori ve link uzerinden arama yapar.
  - Okunmus/okunmamis ve kategori filtreleri vardir.
  - Bildirim kartina dokununca okunmamis ise okundu yapar ve varsa link navigasyonunu calistirir.
  - `Tumunu Oku` ve `Yenile` aksiyonlari vardir.
  - Push durumu gorunur; `Bildirimleri Ac`, `Tekrar Kaydet` ve `Test Gonder` aksiyonlari eklendi.
  - Kategori bazli bildirim tercihleri listelenir ve switch ile acilip kapatilabilir.
  - Tablet genisliginde bildirim kartlari iki kolonlu, telefonda tek kolonlu calisir.
- `mobile/portal/src/api/admin.ts`
  - Admin notification preference endpointleri mobil API client'a eklendi:
    - `getNotificationPreferences`
    - `updateNotificationPreferences`
  - Mevcut push register/test ve read endpointleriyle ayni admin notification API ailesini kullanir.
- `mobile/portal/src/types.ts`
  - Portal `Notification` tipine `category` eklendi.
  - `NotificationPreference` tipi eklendi.
- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `Notifications` stack rotasi eklendi.
- `mobile/portal/src/navigation/portalModules.ts`
  - `Daha Fazla > Sistem` altina `Bildirim Merkezi` modulu eklendi.
  - Yetki `admin:notifications` ile sinirlandi.
- `mobile/portal/src/screens/DashboardScreen.tsx`
  - Dashboard bildirim widget'ina `Merkez` kisa yolu eklendi.
  - Bildirim kartina dokununca tam Bildirim Merkezi acilir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/portal mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda push izin diyalogu, test bildirimi ve bildirime tiklayinca deep-link davranisi henuz fiziksel cihazda denenmedi.
- Web push/tarayici bildirimi ile Expo push token davranisi ayni backend notification modelini kullaniyor; mobil cihaz kurulum/imza problemi cozulmeden uctan uca cihaz testi tamamlanamaz.

## 156. Musteri mobil bildirim davranisi ve deep-link duzeltmesi

Musteri uygulamasinda bildirim ekrani vardi; ancak ekran acilinca tum okunmamis bildirimleri otomatik okundu yapiyordu ve bildirime dokununca ilgili siparis/teklif/sepet/urun ekranina gitmiyordu. Bu turda bildirim merkezi kullanici kontrollu hale getirildi.

- `mobile/b2b/src/screens/NotificationsScreen.tsx`
  - Ekran acilisinda otomatik `tumunu okundu yap` davranisi kaldirildi.
  - `Tumunu Oku` butonu eklendi; kullanici isterse tum bildirimleri okundu yapar.
  - Bildirim kartina dokununca okunmamis bildirim tekil okundu yapilir.
  - Bildirimde `linkUrl` varsa mevcut mobil deep-link cozumleyiciyle ilgili ekrana gidilir.
  - Arama, kategori filtresi, okunmus/okunmamis filtresi ve tablet/telefon kolon yapisi korunur.
- `mobile/b2b/src/api/customer.ts`
  - Tekil/coklu bildirim okuma icin `markNotificationsRead(ids)` eklendi.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile/b2b/src/screens/NotificationsScreen.tsx mobile/b2b/src/api/customer.ts` basarili; yalniz mevcut LF/CRLF uyarilari gorundu.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda push bildirimi geldikten sonra kart/deep-link davranisi uctan uca denenmedi.

## 157. Mobil bildirim/deep-link rota paritesi

Bildirim merkezi eklendikten sonra kritik nokta, bildirim kartina dokununca webdeki hedef ekranin mobilde dogru karsiliga acilmasiydi. Bu turda hem portal hem musteri uygulamasinda web rota adlariyla mobil stack adlari arasindaki farklar kapatildi.

- `mobile/portal/src/navigation/notificationLinking.ts`
  - `/admin/...` prefix'i merkezi olarak normalize edilir; `/admin/dashboard` gibi web linkleri mobilde artik bos/yedek davranisa dusmez.
  - Tam URL bicimindeki linklerde de (`https://.../admin/...`) ayni prefix temizleme uygulanir.
  - Teklif ozel rotalari detaydan once yakalanir:
    - `/quotes/new` -> `QuoteCreate`
    - `/quotes/convert/:id` -> `QuoteConvert`
    - `/quotes/lines` -> `QuoteLines`
  - Siparis ozel rotalari detaydan once yakalanir:
    - `/orders/new`, `/orders/manual` -> `OrderCreate`
    - `/orders/pending` -> siparis sekmesi
  - Admin direkt moduller mobil karsiliklarina baglandi:
    - `customer-agreements`, `portfolio`, `product-overrides`, `supplier-price-list-settings`, `sync`
    - `banners`, `gift-campaigns`, `collections`, `category-images`, `categories`, `campaigns`, `exclusions`
    - `role-permissions`, `search-management`, `search/stocks`, `search/customers`, `notifications`
  - Rapor alt rotalari dogrudan dogru mobil rapor sekmesine acilir:
    - `reports/action-radar` -> `Reports` / `actionRadar`
    - `reports/customer-carts` -> `Reports` / `customerCarts`
    - `reports/customer-activity` -> `Reports` / `customerActivity`
    - `reports/complement-missing` -> `Reports` / `complementMissing`
    - `reports/top-products` -> `Reports` / `topProducts`
    - `reports/top-customers` -> `Reports` / `topCustomers`
    - `reports/product-customers/:productCode` -> `Reports` / `productCustomers`
    - `reports/cost-update-alerts`, `reports/cost-update-all-products` -> `Reports` / `cost`
    - `reports/margin-compliance` -> `Reports` / `margin`
    - `reports/profit-analysis` -> `Reports` / `profit`
    - `reports/price-history` -> `Reports` / `price`
  - Karar destek alt raporlari dogrudan ilgili sekmeyle acilir:
    - `barter-radar`, `sticky-discounts`, `discount-below-entry-cost`, `demand-pattern`, `category-churn`, `category-opportunity`
  - Aile raporu alt rotalari dogrudan ilgili sekmeyle acilir:
    - `family-management`, `product-families`, `price-families`, `price-family-costs`
  - Vade alt rotalari (`notes`, `calendar`, `assignments`, `import`) mobilde mevcut birlesik `Vade` ekranina yonlenir.
- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `DecisionSupport` ve `FamilyReports` stack rotalarina `initialView` parametresi eklendi.
- `mobile/portal/src/screens/DecisionSupportScreen.tsx`
  - Disaridan gelen `initialView` ile ilgili karar destek sekmesi acilir.
- `mobile/portal/src/screens/FamilyReportsScreen.tsx`
  - Disaridan gelen `initialView` ile ilgili aile raporu sekmesi acilir.
- `mobile/b2b/src/navigation/notificationLinking.ts`
  - Musteri web rotalari mobil karsiliklarina eklendi:
    - `/home` -> ana sayfa
    - `/my-orders`, `/my-orders/:id` -> siparis listesi/detayi
    - `/my-quotes`, `/my-quotes/:id` -> teklif listesi/detayi
    - `/my-requests`, `/my-requests/:id` -> talep listesi/detayi
  - Olası `/customer/...` prefix'i normalize edilir.
  - Tam URL bicimindeki linklerde de (`https://.../customer/...`) ayni prefix temizleme uygulanir.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - Portal urun kart basligi 3 satira sabitlendi, kod satiri ortadan kisaltilir hale getirildi; uzun urun adlari kart aksiyonlarini asagi itmez.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Deep-link davranisi fiziksel cihazda push bildirimiyle uctan uca denenmedi.
- Vade `notes/calendar/import/assignments` webde ayri ekran, mobilde bilincli olarak tek `Vade` ekranina dusuyor; ileride mobilde ayrik vade alt ekranlari istenirse yeni ekranla bolunebilir.

## 158. Portal talep merkezi mobil kalite iyilestirmesi

Portal `Talepler` ekrani onceki mobil surumde islevsel olsa da diger yeni ekranlara gore daha sade kaliyordu: tek renkli baslik, metrik yok, arama sonucu sayaci yok ve tablet genisliginde kanban kolonlari yeterince panel hissi vermiyordu.

- `mobile/portal/src/screens/TasksScreen.tsx`
  - Baslik alani koyu mavi `Talep Merkezi` hero'suna tasindi.
  - Ust metrikler eklendi:
    - gorunen talep
    - yeni
    - devam eden
    - biten
  - Arama/segment/aksiyonlar ayri beyaz kontrol kartina alindi.
  - Arama artik yuklu talep setinde anlik filtreleme yapar; enter ile backend aramasi davranisi korunur.
  - `Yeni Talep` ve `Yenile` butonlari telefon genisliginde dengeli yayilir.
  - Liste ve kanban kart basliklari 2 satira sabitlendi; uzun cari/talep adlari kart olcusunu bozmaz.
  - Tablet genisliginde kanban kolonlari iki kolonlu, telefonlarda tek kolonlu akar.
  - Her kanban kolonuna sayac rozeti eklendi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Talep ekraninin fiziksel cihazda uzun talep basliklari ve cok sayida kartla scroll performansi ayrica denenmeli.

## 159. Musteri talep formu mobil secim kontrolleri

Musteri uygulamasindaki `Taleplerim` ekrani gorsel olarak yeni stile yakindi; ancak yeni talep formunda `Tip (OTHER, ORDER...)` ve `Oncelik (NONE, LOW...)` alanlari elle yazilan teknik kod inputlariydi. Mobil kullanici icin bu hem hata uretir hem de web kalitesindeki kontrol hissini dusurur.

- `mobile/b2b/src/screens/CustomerTasksScreen.tsx`
  - Talep tipi text input'u chip secimlerine cevrildi.
  - Oncelik text input'u chip secimlerine cevrildi.
  - Mevcut backend payload degerleri korunur (`OTHER`, `ORDER`, `HIGH`, `URGENT` vb.); sadece kullaniciya Turkce etiketler gosterilir.
  - Yuksek/acil oncelikler secili degilken de hafif kirmizi sinirla ayirt edilir.
  - Formun diger baslik/aciklama ve kaydetme akislari korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Gercek cihazda chip satirlarinin dar ekranlarda satir kirilimi ve dokunma hedefleri gorsel olarak denenmeli.

## 160. Portal manuel siparis fiyat tipi segmenti

Manuel siparis mobil formunda satir fiyat tipi tek toggle butondu. Satir `INVOICED` iken buton pasif gorunup `Faturali` yaziyor, `WHITE` iken aktif gorunup `Beyaz` yaziyordu; bu mobil personel icin hangi modun secili oldugunu yanlis okutabilecek bir UI idi.

- `mobile/portal/src/screens/OrderCreateScreen.tsx`
  - Satir fiyat tipi tek toggle yerine iki secenekli segment kontrolune cevrildi.
  - `Faturali` ve `Beyaz` secenekleri yan yana gorunur.
  - Secili fiyat tipi aktif mavi arka planla net ayrilir.
  - Mevcut payload degerleri korunur (`INVOICED` / `WHITE`).

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Gercek cihazda dar ekranda `Rezerve + fiyat tipi segmenti` satir kirilimi gorsel olarak denenmeli.

## 161. Portal rapor aksiyonlari: tamamlayici ve katalog akisi

Mobil rapor merkezinde webde daha once sikayet edilen "gordum ama aksiyon alamiyorum" riski icin iki ek akis kapatildi.

- `mobile/portal/src/screens/ReportsScreen.tsx`
  - Aksiyon Radari'ndaki eksik gorsel satirlari artik `Urunler` ekraninda ilgili urunu otomatik acar, kalite detayini gosterir ve gorsel sekmesine/galeri paneline indirir.
  - Kategori, birim ve KDV kaynakli katalog skoru satirlari urun aramasi ile acildiginda ilgili urun karti otomatik acilir; birim kontrolu stok/depo sekmesine dusurulur.
  - `Tamamlayici Eksikler` rapor kartlari pasif listeden aksiyon kartina cevrildi:
    - Cari varsa `Cari 360` acilir.
    - Eksik tamamlayici urunler varsa ilgili cari icin `Teklif Taslagi` acilir.
    - Urun bazli satirlarda `Tamamlayici` yonetim ekrani ilgili urun koduyla acilir.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - `autoOpenFirst` ve `detailTab` rota parametreleri eklendi; rapordan gelen urun aramalarinda ilk eslesen kart otomatik acilir.
- `mobile/portal/src/screens/ComplementManagementScreen.tsx`
  - `initialSearch` ve `autoSelect` rota parametreleri eklendi; rapordan gelen urun kodu ile tamamlayici yonetimi dogrudan ilgili urune iner.
- `mobile/portal/src/navigation/AppNavigator.tsx`
  - `Products` ve `ComplementManagement` rota parametreleri bu aksiyonlar icin genisletildi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Bu akislar gercek cihazda canli veriyle dokunma/geri donus testi gerektirir; APK parse/imza problemi kullanici talimatiyla halen oncelik disidir.

## 162. Musteri sepeti tamamlayici onerilerinin sadelestirilmesi

Musteri mobil sepetinde tamamlayici oneriler daha once baz urune gore alt alta gruplar halinde akiyordu. Cok kalemli sepette ayni urun farkli bazlardan tekrar onerilebildigi icin gramaj/detay/spekt benzerligi olan urunlerde karar vermek zorlasiyordu.

- `mobile/b2b/src/screens/CartScreen.tsx`
  - Sepet tamamlayici onerileri once tek bir `Sepetteki urunlerden gelen oneriler` listesinde birlestirilir.
  - Ayni urun birden fazla baz urunden gelirse mobilde bir kez gosterilir.
  - Oneri kartinda urun gorseli, ad, fiyatlar, not ve hangi baz urunle iliskili oldugu gorunur.
  - `Baz urun kirilimini goster` aksiyonu eklendi; isteyen kullanici eski mantiktaki kaynak urun kirilimini kompakt chip listesi olarak acar.
  - Sepete ekleme ve urun detayina gitme aksiyonlari korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli sepette cok sayida benzer gramaj/spekt urunu varken gercek cihaz gorsel QA henuz yapilmadi.

## 163. Portal paket ve tamamlayici yonetimi marka/polish turu

APK parse/imza konusu kullanici talimatiyla beklerken portal tarafinda katalog operasyonunun iki aktif ekrani web kalitesine daha yaklastirildi.

- `mobile/portal/src/screens/ComplementManagementScreen.tsx`
  - Duz mavi baslik yerine koyu lacivert `Katalog Motoru` hero'su eklendi.
  - Hero icinde arama sonucu, otomatik tamamlayici, manuel tamamlayici ve aktif mod metrikleri gorunur.
  - Urun arama ve `Oto Senkron Calistir` aksiyonu ayri beyaz kontrol kartina alindi.
  - Tablet genisliginde urun adaylari iki kolonlu gosterilir.
  - Raporlardan gelen `initialSearch + autoSelect` akisi korunur; ilgili urun otomatik acilmaya devam eder.
  - Uzun urun adlari/kodlari kart icinde kontrollu satir sayisina alindi.
- `mobile/portal/src/screens/BundlesScreen.tsx`
  - Paket ekrani da koyu lacivert `Katalog Operasyonu` hero standardina alindi.
  - Toplam, aktif, riskli ve ortalama bilesen metrikleri hero icine tasindi; alt alta yinelenen ozet kartlari kaldirildi.
  - Uzun paket, bilesen ve arama sonucu urun adlari dar ekranda aksiyonlari itmeyecek sekilde satir limitine alindi.
  - Mevcut paket olusturma/duzenleme, gorsel yukleme, bilesen arama, indirim secimi, saglik paneli ve silme aksiyonlari korundu.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek tablet/telefon cihazinda paket formu, gorsel secici ve tamamlayici senkron akislarinin dokunma hedefi/gorsel QA'si henuz yapilmadi.

## 164. Portal vitrin yonetimi marka/polish turu

Musteri ana sayfasini dogrudan etkileyen banner, koleksiyon ve kategori gorseli ekranlari web panelindeki lacivert operasyon diliyle hizalandi. Bu turda veri modeli veya aksiyon mantigi degistirilmedi; mobilde gorev basinda durum okuma, uzun metin tasmalari ve tablet yogunlugu iyilestirildi.

- `mobile/portal/src/screens/BannersScreen.tsx`
  - Baslik alani koyu lacivert `Vitrin Operasyonu` hero standardina alindi.
  - Toplam banner, aktif banner, mobil gorseli hazir banner ve son 30 gun tik metrikleri ilk ekrana tasindi.
  - Tablet genisliginde banner kartlari iki kolonlu akar.
  - Uzun banner basligi, alt metni, link/urun kodu ve meta satirlari kart aksiyonlarini itmeyecek sekilde satir limitine alindi.
  - Genis/mobil gorsel yukleme formunda dar ekran tasmasi riskini azaltmak icin form satirlari kirilabilir hale getirildi.
- `mobile/portal/src/screens/CollectionsScreen.tsx`
  - Duz baslik ve tekrar eden ozet kartlari yerine koyu lacivert `Katalog Vitrini` hero'su eklendi.
  - Toplam, aktif, elle secim ve secili urun metrikleri hero icinde gorunur.
  - Tablet genisliginde koleksiyon kartlari iki kolonlu gosterilir.
  - Koleksiyon basligi, alt metni, hedef/kural bilgisi, kategori sonuc adlari ve urun arama sonuclari satir limitine alindi.
  - Mevcut kural bazli/manuel koleksiyon, hedefleme, renk secimi, tarih ve aktif/pasif aksiyonlari korundu.
- `mobile/portal/src/screens/CategoryImagesScreen.tsx`
  - Baslik koyu lacivert `Kategori Vitrini` hero standardina cekildi.
  - Toplam kategori, gorselli kategori, eksik gorsel ve filtrede gorunen kategori sayilari ilk bakista gorunur.
  - Tablet genisliginde kategori kartlari iki kolonlu akar.
  - Kategori adi ve Mikro kodu dar ekranda butonlari itmeyecek sekilde satir limitine alindi.
  - Gorsel yukleme/kaldirma akislari korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda kategori gorseli secici, banner gorseli secici ve koleksiyon formunun dokunma/geri donus QA'si henuz yapilmadi. APK parse/imza problemi kullanici talimatiyla bu turda oncelik disi birakildi.

## 165. Portal kampanya ekranlari marka/polish turu

Banner/koleksiyon/kategori gorseli turunden sonra kampanya yonetimi ekranlari da ayni mobil kalite standardina cekildi. Bu turda kampanya is kurallari degistirilmedi; liste okunurlugu, mobil kart yogunlugu, uzun metin tasmalari ve ilk bakista durum okuma iyilestirildi.

- `mobile/portal/src/screens/CampaignsScreen.tsx`
  - Indirim kampanyalari ekrani koyu lacivert `Vitrin ve Fiyat` hero standardina alindi.
  - Toplam, aktif, pasif ve fiyat tipi kampanya metrikleri ilk ekrana tasindi.
  - Kampanya kartlari aktif/pasif rozeti, tarih araligi, tip etiketi ve satir limitli basliklarla yeniden duzenlendi.
  - Tablet genisliginde kampanya kartlari iki kolonlu akar.
  - Teknik kampanya tipi metinleri mobilde daha okunur Turkce etiketlerle gosterilir; kayit payload mantigi korunur.
  - Form aksiyonlari, duzenleme, silme ve kaydetme akislarina dokunulmadi.
- `mobile/portal/src/screens/GiftCampaignsScreen.tsx`
  - Hediyeli kampanya ekrani koyu lacivert `Sepet Tesviki` hero standardina alindi.
  - Toplam kampanya, aktif kampanya, tanimli hediye urun ve hedefli kampanya metrikleri hero icine tasindi.
  - Eski tekrar eden ozet kartlari kaldirildi.
  - Tablet genisliginde hediyeli kampanya kartlari iki kolonlu gosterilir.
  - Uzun kampanya basligi, alt metni, baraj/kapsam bilgisi, secili hediye urun ve urun arama sonucu adlari satir limitine alindi.
  - Hediye urun secimi, kapsam urunu secimi, hedefleme, baraj, tarih ve aktif/pasif aksiyonlari korundu.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili; yalniz LF/CRLF uyarisi var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda hediyeli kampanya urun secimi ve uzun form akisi henuz dokunarak test edilmedi. APK parse/imza problemi kullanici talimatiyla bu turda oncelik disi birakildi.

## 166. Portal gorsel kalite ve stok karti kalite ekranlari polish turu

Gorsel kalite workflow'u ve stok karti kalite duzeltmeleri webde aksiyon alinabilir ekranlar olarak onemli oldugu icin mobilde de operasyonel okunurluk standardina cekildi. Mikro'ya yazma veya gorsel yukleme is mantigi degistirilmedi.

- `mobile/portal/src/screens/ImageIssuesScreen.tsx`
  - `Resim Hata Talepleri` ekrani koyu lacivert `Gorsel Kalite` hero standardina alindi.
  - Toplam, acik, incelendi ve duzeltildi metrikleri hero icine tasindi.
  - Eski ozet kartlari kaldirildi; ilk ekran daha az kalabalik oldu.
  - Tablet genisliginde talep kartlari iki kolonlu gosterilir.
  - Urun adi, urun kodu/siparis no, cari adi, not ve bildiren satirlari satir limitine alindi.
  - `Incelendi`, `Gorsel Yukle + Duzelt`, `Duzeltildi` aksiyonlari korunur.
- `mobile/portal/src/screens/ProductDimensionsScreen.tsx`
  - `Urun Olcu ve Raf` ekrani koyu lacivert `Stok Karti Kalitesi` hero standardina alindi.
  - Eksik veri, arama sonucu, secili urun ve degisen alan metrikleri ilk ekrana tasindi.
  - Eksik veri listesi ve urun arama sonuclari tablet genisliginde iki kolonlu akar.
  - Uzun urun adlari, urun kodlari ve eksik alan metinleri kart icinde sinirlandi.
  - Birim/kg/olcu/raf kaydetme ve Mikro'ya yazma onay akisi korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda gorsel secici, urun olcu formu ve Mikro kayit onay modali dokunarak test edilmedi. APK parse/imza problemi kullanici talimatiyla bu turda oncelik disi birakildi.

## 167. Portal karar destek ve aile raporlari polish turu

Karar destek ve aile raporlari mobilde veri/export olarak zaten islevseldi; bu turda ekranlarin operasyonel okunurlugu ve web paneliyle gorsel tutarliligi iyilestirildi. Rapor sorgulari, Excel export ve maliyet guncelleme is mantigina dokunulmadi.

- `mobile/portal/src/screens/DecisionSupportScreen.tsx`
  - `Karar Destek` ekrani koyu lacivert `Aksiyon Analitigi` hero standardina alindi.
  - Aktif gorunum, satir sayisi ve Excel hazir durumu ilk ekrana tasindi.
  - Rapor metric kutularinda uzun degerlerin kartlari tasirmamasi icin satir limitleri eklendi.
  - Takas ve maliyet alti kartlarinda uzun unvan/urun/kod satirlari sinirlandi.
  - Mevcut sekmeler, filtreler, `Raporu Yenile`, `Excel Paylas`, `Cari 360`, `Urun karti` ve siparise aktar aksiyonlari korundu.
- `mobile/portal/src/screens/FamilyReportsScreen.tsx`
  - `Aile Raporlari` ekrani koyu lacivert `Aile ve Katalog Kalitesi` hero standardina alindi.
  - Aktif gorunum, gorunen satir, toplam satir ve fiyat maliyet taslak sayisi ilk ekranda gorunur.
  - Tablet genisliginde aile raporu satirlari iki kolonlu akar.
  - Mevcut aile onerisi, kume, aykiri urun, birim uyumu, stok aileleri, fiyat aileleri ve fiyat maliyet akislari korunur.
  - Fiyat aile maliyet taslaklari ve toplu guncelleme mantigina dokunulmadi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli veriyle tum karar destek sekmelerinde kart satir limitleri ve aile raporu iki kolon akisi gercek cihazda gorsel QA gerektirir.

## 168. Portal saha ziyaret ve geri kazanim ekranlari polish turu

Satiscilarin mobilde kullanacagi saha ziyaretleri ve geri kazanim aksiyonlari web paneliyle daha tutarli hale getirildi. Bu turda rapor sorgulari, Excel export, aksiyon kaydetme veya saha notu is mantigi degistirilmedi.

- `mobile/portal/src/screens/FieldSalesVisitsScreen.tsx`
  - `Saha Ziyaretleri` ekrani koyu lacivert `Saha CRM` hero standardina alindi.
  - Toplam not, cari, ziyaret carisi ve fotograf metrikleri hero icine tasindi.
  - Eski ayrik metrik satiri kaldirildi; ilk ekran daha toplu hale geldi.
  - Cari bazli ozet ve ziyaret notu kartlarinda uzun unvan/kod/not/talep/rakip satirlari sinirlandi.
  - Tablet genisliginde ziyaret notlari iki kolonlu akar.
  - `Saha Ac`, `Ara`, `Konum`, `Fotograf` aksiyonlari ve Excel paylasimi korunur.
- `mobile/portal/src/screens/RecoveryActionsScreen.tsx`
  - `Geri Kazanim Aksiyonlari` ekrani koyu lacivert `Aksiyon Takibi` hero standardina alindi.
  - Gorunen aksiyon, geciken/bugun takip sayisi ve sayfa metriği ilk ekranda gorunur.
  - Uzun cari adlari, kod/aksiyon tipi, not ve durum meta satirlari sinirlandi.
  - Filtreler, vadesi gelen takip toggle'i, sonuc sablonlari, takip tarihi kisayollari, kaydet ve tamamla aksiyonlari korunur.
- `mobile/portal/src/screens/CustomerRecoveryReportScreen.tsx`
  - `Geri Kazanim Raporu` ekrani koyu lacivert `Cari Kurtarma` hero standardina alindi.
  - Aktif gorunum, satir sayisi ve secili cari sayisi ilk ekrana tasindi.
  - Tablet genisliginde rapor kartlari iki kolonlu akar.
  - Guncel risk/tarihsel deger sekmeleri, filtreler, personel secimi, Excel export ve aksiyon acma mantigi korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Canli saha verisiyle fotograf acma, harita/telefon deep-link ve geri kazanim aksiyon kaydetme akislari gercek cihazda test edilmedi.

## 169. Portal operasyon/depo/denetim ekranlari hero standardi

Saha ve geri kazanim turunden sonra operasyonel ana ekranlarda kalan eski mavi baslik dili de lacivert web standardina yaklastirildi. Bu turda operasyon komuta merkezi, depo kiosk ve denetim raporlari is mantigina dokunulmadi.

- `mobile/portal/src/screens/OperationsScreen.tsx`
  - `Operasyon Komuta Merkezi` hero rengi koyu lacivert standarda cekildi.
  - Hero metrik kartlari daha genis padding ve web paneliyle uyumlu yarı saydam kart diline alindi.
  - ATP, depo orkestrasyonu, musteri niyeti, risk/ikame ve veri kalitesi akislarina dokunulmadi.
- `mobile/portal/src/screens/WarehouseScreen.tsx`
  - `Depo Kiosk` hero rengi koyu lacivert standarda cekildi.
  - Siparis, seri, detay satiri ve perakende sepet metrikleri yeni hero kart stiline alindi.
  - Siparisler, detay, sevk ve perakende satis sekmeleri korunur.
- `mobile/portal/src/screens/AuditReportsScreen.tsx`
  - `Denetim Raporlari` basligina `Operasyon Denetimi` kicker'i eklendi.
  - Header koyu lacivert standarda alindi.
  - Personel aktivite, TOPLU kontrol ve aday isaretleme akislari korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Depo kiosk, perakende satis ve TOPLU isaretleme gibi production etkili aksiyonlar gercek cihaz/canli yetkiyle test edilmedi.

## 170. Portal satin alma ve stok operasyon ekranlari hero standardi

Stok karti acma/aktiflestirme, tedarikci maliyetleri ve Ucarer depo ekranlarinda kalan eski tek ton mavi baslik dili koyu lacivert web standardina cekildi. Bu turda Mikro'ya yazan stok acma, maliyet uygulama, tedarikci siparisi, MinMax ve haric tutma handler'larina dokunulmadi.

- `mobile/portal/src/screens/PassiveStocksScreen.tsx`
  - `Pasif Stoklar` ekrani koyu lacivert `Stok Karti Operasyonu` hero standardina alindi.
  - Sonuc, stok ailesi ve fiyat ailesi metrikleri ilk ekranda gorunur hale getirildi.
  - Pasif stok kartlari tablet genisliginde iki kolonlu akar.
  - Uzun stok adi, kod, kategori ve saglayici metinlerine satir siniri eklendi.
  - Yeni stok acma, pasif stok aktiflestirme, on kontrol, gorsel secme ve aile baglama akislari korunur.
- `mobile/portal/src/screens/SupplierCostsScreen.tsx`
  - `Tedarik Maliyetleri` ekrani koyu lacivert `Satin Alma Operasyonu` hero standardina alindi.
  - Aktif sekme, urun arama sonucu, risk satiri ve fiyat teyit/ihale sayilari hero icine tasindi.
  - Urun, tedarikci ve maliyet kartlarinda uzun isim/metin tasmalari sinirlandi.
  - Urun maliyeti kaydetme, Mikro'ya uygulama, fiyat teyit, ihale kalemi fiyatlama ve dosya ekleme akislari korunur.
- `mobile/portal/src/screens/UcarerDepotScreen.tsx`
  - `Ucarer Depo` ekrani koyu lacivert `Satin Alma Karar Destegi` hero standardina alindi.
  - Aktif gorunum, filtrelenmis/toplam satir, onerili satir ve siparis taslagi sayisi ilk ekrana tasindi.
  - Rapor satirlari tablet genisliginde iki kolonlu akar.
  - Rapor kartlarinda urun adi, maliyet ve ana saglayici satirlari tasma riskine karsi sinirlandi.
  - Rapor, aile paneli, tedarikci siparis taslagi, MinMax, haricler, Excel/PDF ve islem gecmisi akislari korunur.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Stok acma/aktiflestirme, Mikro maliyet uygulama ve tedarikci siparisi gibi production etkili aksiyonlar gercek cihaz ve canli yetkili kullanici ile test edilmedi.

## 171. Mobil route yuzeyi ve ilk kullanim parite kontrolu

Bu turda web admin ve musteri route klasorleri, mobil portal stack'i, portal `Daha Fazla` menusu ve musteri `Daha Fazla` menusu karsilastirildi. Amac, webde bulunan ana modullerin mobilde en azindan ulasilabilir bir entry point'e sahip olup olmadigini kontrol etmekti.

Bulgular:

- Admin web ana klasorleri mobil portalda karsilanir:
  - `dashboard` -> alt tab `Panel`.
  - `quotes`, `orders`, `requests` -> alt tablar ve detay/olusturma stack ekranlari.
  - `customers`, `customer-360`, `customer-agreements`, `portfolio`, `field-sales`, `hot-sales`, `warehouse`, `order-tracking`, `operations`, `einvoices` -> portal module linkleri ve stack route'lari.
  - `reports`, `vade`, `supplier-costs`, `supplier-price-list-settings`, `passive-stocks`, `stock-create`, `product-dimensions`, `product-overrides`, `category-images`, `banners`, `collections`, `campaigns`, `gift-campaigns`, `bundles`, `role-permissions`, `search`, `search-management`, `settings`, `staff`, `sync` -> `Daha Fazla` menusu veya stack route'u uzerinden ulasilabilir.
  - `stock-create` webde ayri route iken mobilde `Stok Acma / Pasif Stok` akisinda `PassiveStocks` route'una birlestirildi; yeni stok acma ve pasif stok aktiflestirme ayni ekrandan korunur.
  - `admin-products` web klasoru mobilde `Products` route'u ile karsilanir.
- Musteri web ana klasorleri mobil musteri uygulamasinda karsilanir:
  - `home`, `products`, `discounted-products`, `previously-purchased`, `cart` -> alt tablar.
  - `my-orders`, `my-quotes`, `my-requests`, `order-requests`, `pending-orders`, `invoices`, `agreements`, `collections`, `new-categories`, `preferences`, `profile` -> stack route'lari ve musteri `Daha Fazla` menusu.
- Dar risk taramasinda `TODO`, `FIXME`, `not implemented`, `coming soon`, `yakinda`, `mock data`, `dummy`, `stub` kalibi mobil kaynakta bulunmadi.
- Portal ve musteri uygulamalarinda eski duz mavi `header: { backgroundColor: colors.primary }` kalibi kalmadi; ana baslik dili koyu lacivert web standardina tasindi.
- Saha satis urun kartlarinda onceki mobil tasma riskine karsi urun adlari, kodlar, kategori, depo ve son satis satirlari satir limitleriyle korunur; kucuk telefonda aksiyon butonlari tam genislikli akar.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili.
- `git diff --check -- mobile/portal mobile/b2b mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz Windows LF/CRLF uyari satirlari var.

Kalan risk:

- Bu kontrol route ve bundle seviyesindedir; her production etkili aksiyon icin gercek kullanici, gercek yetki ve gercek cihaz QA'si hala gereklidir.
- APK kurulum/parsing problemi bu turda bilincli olarak oncelik disi birakildi; kullanici bu konuda onceligi dusurdu.

## 172. Musteri mobil urun detay ve siparis/talep ekranlari polish turu

Bu turda APK imza/parsing problemi bilincli olarak oncelik disi birakildi; kullanici uyku boyunca mobil uygulama ozellik/parite ve UI kalitesi tarafinda devam edilmesini istedi. Odak, musteri uygulamasinda gercek urun/fatura/siparis/talep verisiyle kucuk Android ekranlarda tasan veya eski tek ton mavi kalan alanlari toparlamakti. Is mantigi, fiyat, stok, sepet, talep ve fatura endpoint'lerine dokunulmadi.

- `mobile/b2b/src/screens/ProductDetailScreen.tsx`
  - Urun detay hero'su koyu lacivert web standardina alindi.
  - Hero metrikleri ve kart sinirlari uzun urun adlarinda ekran disina tasmayacak sekilde guclendirildi.
  - Galeri, fiyat guven karti, paket icerigi, miktar ve sepete ekleme akislarina dokunulmadi.
- `mobile/b2b/src/screens/InvoicesScreen.tsx`
  - Hero baslik, aciklama ve metrik satirlari satir limitleriyle sabitlendi.
  - Fatura no ve dosya adi gibi uzun alanlar kart tasirmadan orta/kuyruk kirpma ile okunur tutuldu.
  - PDF ac/paylas akisi korunur.
- `mobile/b2b/src/screens/PendingOrdersScreen.tsx`
  - Bekleyen siparis hero metrikleri ve siparis kart basliklari satir limitine alindi.
  - Acilan satir detaylarinda uzun urun adi ve Mikro kodu sag tutar/miktar kolonunu itmeyecek hale getirildi.
  - Ac/kapat detay davranisi, filtreler ve kalan miktar hesaplari korunur.
- `mobile/b2b/src/screens/CustomerTaskDetailScreen.tsx`
  - Talep detay basligi, cari/atanan kisi meta kutulari, aciklama, yorum ust satiri ve ek/link adlari mobil tasma riskine karsi sinirlandi.
  - Yorum ekleme, dosya yukleme ve talep detayini yenileme akislari korunur.
- `mobile/b2b/src/screens/CollectionDetailScreen.tsx`
  - Koleksiyon hero baslik/aciklama ve metrikleri satir limitleriyle guclendirildi.
  - Koleksiyon urun kartlarinda urun adi, kod, stok, maksimum miktar, fiyat ve fiyat ipucu alanlari tasma riskine karsi sinirlandi.
  - Tablet genisliginde iki kolonlu akis korunur; sepete ekleme/stok yok davranislari korunur.
- `mobile/b2b/src/screens/NotificationsScreen.tsx`
  - Bildirim hero'su, kategori rozeti, tarih, baslik, icerik ve link satirlari mobil ekranlarda karti patlatmayacak sekilde sinirlandi.
  - Okundu/okunmadi, kategori filtresi, tumunu oku ve bildirim link navigasyonu korunur.
- `mobile/b2b/src/screens/ProductsScreen.tsx`, `mobile/b2b/src/screens/DiscountedProductsScreen.tsx`, `mobile/b2b/src/screens/PurchasedProductsScreen.tsx`
  - Depo metrik degeri tek satira alindi; uzun depo adlarinda hero karti tasmaz.
  - Urun arama, kategori/depo/price-type filtreleri ve sepet aksiyonlari korunur.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Gercek cihazda farkli Android/iOS ekran olculerinde gorsel QA hala yapilmali.
- APK kurulum/parsing ve imza kaynagi bu turda bilincli olarak ertelendi.

## 173. Iki uygulama son genis mobil dogrulama turu

Bu turda kullanicinin "APK imza/parsing isini simdilik oncelik yapma, mobil uygulamayi kusursuz hale getirmeye devam et" yonlendirmesiyle portal ve musteri mobil uygulamalari birlikte tekrar tarandi. Amac, ilk kullanimda kullanimi bozan placeholder, eksik ekran, eski tek ton mavi baslik veya paketlenemeyen bundle riski kalip kalmadigini kontrol etmekti.

Taramalar:

- `TODO`, `FIXME`, `coming soon`, `not implemented`, `yakinda`, `mock data`, `dummy`, `stub` kaliplari `mobile/portal` ve `mobile/b2b` kaynaklarinda bulunmadi.
- Eski `header/hero` seviyesinde `backgroundColor: colors.primary` kalibi bulunmadi; ana baslik dili koyu lacivert `colors.primaryDark` standardinda.
- Musteri uygulamasinda son turda duzeltilen urun detay, fatura, bekleyen siparis, talep detay, koleksiyon, bildirim ve urun liste ekranlari TypeScript ve bundle seviyesinde dogrulandi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Bu dogrulama statik kaynak, TypeScript ve Expo export seviyesindedir; APK kurulumu, imza/parsing problemi ve gercek cihaz/tablet gorsel QA'si hala ayri ele alinmalidir.
- Production etkili admin aksiyonlari icin gercek yetkiyle canli QA yapilmadi.

## 174. Portal cari/fatura/saha satis son UI kalinti temizligi

Bu turda mobil route/API yuzeyi tekrar okundu, portal `Daha Fazla` modullerinin stack route'lariyla bagli oldugu kontrol edildi ve eski tek ton mavi kalan yuksek kullanim ekranlari arandi. Ekran is mantigina, Mikro yazan admin aksiyonlarina, PDF indirme/yukleme ve teklif/siparis handler'larina dokunulmadi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/EInvoicesScreen.tsx`
  - `E-Faturalar` hero'su eski `colors.primary` duz mavi yuzeyden koyu lacivert web standardina tasindi.
  - Hero metrikleri, fatura no, cari adi/kodu, tarih, tutar ve dosya durumu satir limitleriyle guclendirildi.
  - Arama ve toplu indirme aksiyon satirlari dar ekranda kirilabilir hale getirildi.
- `mobile/portal/src/screens/CustomersScreen.tsx`
  - Cari kartlarinda uzun unvan, Mikro kodu, sehir/ilce satirlari kart tasirmayacak sekilde sinirlandi.
  - Mikro cari secim modalinda kod ve unvan satirlari dar ekrana uygun hale getirildi.
- `mobile/portal/src/screens/CustomerDetailScreen.tsx`
  - Cari detay hero alt bilgisi, metrikler, cari adi ve Mikro kodu satir limitleriyle guclendirildi.
- `mobile/portal/src/screens/PortfolioScreen.tsx`
  - Portfoy cari kartlarinda uzun unvan, e-posta, kod, sektor/grup gibi satirlar tek/iki satir limitleriyle sabitlendi.
- `mobile/portal/src/screens/MoreScreen.tsx`
  - Portal modul kartlarinda uzun modul adlari ve aciklamalar sabit kart davranisina alindi.
- `mobile/portal/src/screens/FieldSalesScreen.tsx`
  - Secili cari ozet karti eski duz mavi yuzeyden koyu lacivert web standardina tasindi.
  - Cari adi ve kod/sektor satiri saha satis mobil ekraninda tasma riskine karsi sinirlandi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- APK parsing/imza kurulumu bu turda bilincli olarak oncelik disi tutuldu.
- Gercek Android/iOS telefon ve tabletlerde kaydirma, keyboard, PDF share ve production yetki akislari hala cihaz uzerinde kanitlanmali.

## 175. Route parite kontrolu ve musteri bildirim rozet turu

Bu turda web admin ve musteri route klasorleri tekrar listelendi ve mobil stack/`Daha Fazla` menu yuzeyiyle karsilastirildi. Admin tarafinda `admin-products`, `banners`, `bundles`, `campaigns`, `categories`, `category-images`, `collections`, `customer-360`, `customer-agreements`, `customers`, `dashboard`, `einvoices`, `field-sales`, `gift-campaigns`, `hot-sales`, `operations`, `orders`, `order-tracking`, `passive-stocks`, `portfolio`, `product-dimensions`, `product-overrides`, `quotes`, `reports`, `requests`, `role-permissions`, `search`, `search-management`, `settings`, `staff`, `stock-create`, `supplier-costs`, `supplier-price-list-settings`, `vade`, `warehouse` yuzeyi mobil portal stack veya portal modul menusu ile karsilanir. Musteri tarafinda `agreements`, `cart`, `collections`, `discounted-products`, `home`, `invoices`, `my-orders`, `my-quotes`, `my-requests`, `new-categories`, `order-requests`, `pending-orders`, `preferences`, `previously-purchased`, `products`, `profile` yuzeyi musteri tab/stack/menusu ile karsilanir.

Uygulanan duzeltmeler:

- `mobile/b2b/src/context/NotificationContext.tsx`
  - Musteri uygulamasina portal uygulamasindaki bildirim mimarisine paralel global bildirim context'i eklendi.
  - Musteri API'sindeki `/notifications`, okundu yapma, tumunu okundu yapma ve push token kaydi akislari bu context uzerinden yonetilir.
  - Push bildirimi gelince okunmamis liste yenilenir; bildirime tiklaninca mevcut deep-link yonlendirmesi korunur.
- `mobile/b2b/App.tsx`
  - Musteri uygulamasi `NotificationProvider` ile sarildi.
  - Eski tek amacli push bridge yerine bildirim listesi + push davranisini birlikte tasiyan provider kullanilir.
- `mobile/b2b/src/navigation/CustomerTabs.tsx`
  - Okunmamis bildirim sayisi `Daha Fazla` tab'ina rozet olarak baglandi.
  - Portal uygulamasindaki tab badge davranisiyla musteri uygulamasi esitlendi.
- `mobile/b2b/src/screens/NotificationsScreen.tsx`
  - Bildirim ekrani yerel state yerine global bildirim context'ini kullanir.
  - Okundu yapma ve tumunu okundu yapma islemleri tab rozetini de gunceller.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Bildirim rozetinin gercek push alimi, izin akisi ve deep-link acilisi fiziksel cihazda test edilmelidir.
- APK parsing/imza kurulumu hala ayrica cozulmelidir.

## 176. Tekrarlanabilir mobil parite audit scripti

Bu turda onceki route/menu parite kontrolleri elle yapilan bir not olmaktan cikarilip tekrarlanabilir script haline getirildi. Script web route klasorlerini mobil stack/menu route'lariyla karsilastirir, kritik placeholder/eksik ekran kaliplarini arar ve eski duz mavi header/hero kalibini yakalamaya calisir.

Eklenen dosya:

- `mobile/scripts/audit-mobile-parity.mjs`
  - `frontend/app/(admin)` ve `frontend/app/(customer)` altindaki route klasorlerini okur.
  - `mobile/portal/src/navigation/AppNavigator.tsx`, `PortalTabs.tsx` ve `portalModules.ts` icindeki stack/tab/menu route'larini toplar.
  - `mobile/b2b/src/navigation/AppNavigator.tsx`, `CustomerTabs.tsx` ve musteri `MoreScreen` route'larini toplar.
  - Admin ve musteri route mapping'iyle eksik mobil karsiliklari fail eder.
  - `TODO`, `FIXME`, `coming soon`, `not implemented`, `yakinda`, `mock data`, `dummy`, `stub` kaliplarini fail eder.
  - Eski duz mavi header/hero kalibi riskini fail eder.
- `mobile/portal/package.json`
  - `npm run audit:parity` script'i eklendi.
- `mobile/b2b/package.json`
  - `npm run audit:parity` script'i eklendi.

Script sonucu:

```json
{
  "adminWebRoutes": 35,
  "customerWebRoutes": 16,
  "portalReachableRoutes": 64,
  "customerReachableRoutes": 25,
  "warnings": [],
  "failures": []
}
```

Dogrulama:

- `node mobile/scripts/audit-mobile-parity.mjs` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.

Kalan risk:

- Script route/menu/parite kaliplarini yakalar; gercek cihazda dokunma, kaydirma, klavye, push izinleri, PDF paylasimi, kamera/dosya secimi ve APK imza/parsing testinin yerini tutmaz.

## 177. Mobil uzun metin ve operasyon karti tasma sertlestirmesi

Bu turda APK parsing/imza konusu bilerek oncelik disi tutuldu; odak, uygulama ilk kullanima yaklastiginda personelin veya musterinin uzun cari/urun/tedarikci/not verisiyle karsilasinca ekranin bozulmamasiydi. Portal ve musteri mobil ekranlarinda `cardTitle`, `rowTitle`, `lineTitle`, `customerName`, `fileTitle` gibi dinamik baslik kullanimlari statik olarak tarandi. Gercek veriyle uzayabilecek tum kalan basliklar `numberOfLines` ile sinirlandi; yogun kartlarda `minWidth: 0` ve satir yuksekligi eklendi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/ReportsScreen.tsx`
  - Maliyet, marj, fiyat, en cok urun/cari, tamamlayici eksik, musteri aktivitesi, musteri sepetleri ve aksiyon radar kartlarinda uzun basliklar sinirlandi.
  - Sepet kalem urun adlari, aksiyon radar subtitle/meta pill'leri ve tamamlayici eksik chip'leri dar ekrana uygun hale getirildi.
  - Kart title/meta stillerine `minWidth` ve satir yuksekligi eklendi.
- `mobile/portal/src/screens/VadeScreen.tsx`
  - Bakiye, not, atama ve import dosyasi satirlarinda uzun cari/not/dosya adi tasma riski azaltildi.
  - Kart title/meta stilleri standart satir yuksekligi ve `minWidth` ile guclendirildi.
- `mobile/portal/src/screens/Customer360Screen.tsx`
  - Cari adi, sepet/teklif/siparis/vade/aktivite/fatura satirlari ve 360 icindeki urun/cari basliklari uzun veriye karsi sinirlandi.
- `mobile/portal/src/screens/SupplierCostsScreen.tsx`
  - Maliyet risk raporu, fiyat teyit talepleri, tedarikci teklifleri, ihale kalemleri ve tedarikci arama sonuc basliklari sinirlandi.
  - Tedarikci fiyat/not satirlari dar ekranda aksiyon butonlarini itmeyecek sekilde duzenlendi.
- `mobile/portal/src/screens/UcarerDepotScreen.tsx`
  - Aile/model ozeti, aile detayi, tedarikci siparis taslagi, DSV transfer seti, MinMax durum, haric raporu ve islem gecmisi kartlarinda uzun urun/aile/tedarikci basliklari sinirlandi.
- `mobile/portal/src/screens/OperationsScreen.tsx`
  - ATP/tahsis, depo dalgasi, musteri niyeti, risk/ikame ve veri kalitesi kartlarinda row/detail basliklari ve uzun aksiyon gerekceleri sinirlandi.
- `mobile/portal/src/screens/AuditReportsScreen.tsx`, `DecisionSupportScreen.tsx`, `FamilyReportsScreen.tsx`, `NotificationsScreen.tsx`
  - Audit, karar destek, aile/fiyat ailesi ve portal bildirim kartlarinda uzun isim/aciklama/metinler standart mobil kart olcusune alindi.
- `mobile/portal/src/screens/CampaignsScreen.tsx`, `CategoriesScreen.tsx`, `CustomerRecoveryReportScreen.tsx`, `EkstreScreen.tsx`, `ExclusionsScreen.tsx`, `OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`, `RolePermissionsScreen.tsx`, `StaffScreen.tsx`, `SupplierPriceListSettingsScreen.tsx`, `VadeAnalyticsScreen.tsx`, `VadeCustomerScreen.tsx`
  - Kalan dinamik basliklar tek/iki satir limitiyle kapatildi.

Statik kontrol sonucu:

- Aşağıdaki tarama bos dondu; dinamik `cardTitle/rowTitle/productTitle/fileTitle/customerName/lineTitle` basliklarinda satir limitisiz kalan ornek yok:

```powershell
rg -n "<Text style=\{styles\.(cardTitle|rowTitle|productTitle|fileTitle|customerName|lineTitle)\}>\{[^}]+\}" mobile/portal/src/screens mobile/b2b/src/screens -g "*.tsx"
```

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.

Kalan risk:

- Bu tur gorsel/layout sertlestirmesi statik kaynak ve bundle seviyesinde kanitlandi; fiziksel Android/iOS cihazlarda farkli ekran ebatlari, dokunma ergonomisi, keyboard, kamera/dosya secimi, push izinleri, PDF/Excel share ve APK imza/parsing akislari hala gercek cihaz QA'si ister.
- APK kurulumunda gorulen "paketin ayrıştırılmasında sorun oluştu" hatasi bu turda bilerek cozulmedi; kullanici uyurken sorunsuz kod/UI ilerlemesi onceliklendirildi.

## 178. Eski duz mavi mobil hero/header temizligi

Bu turda uzun metin sertlestirmesinden sonra mobil uygulamada hala eski `colors.primary` ile duran ust yuzeyler tarandi. Standart butonlar, aktif chip'ler ve form aksiyonlari korunarak sadece ekran kimligini tasiyan `hero`, `header`, `customerCard` ve benzeri ust ozet yuzeyleri webdeki koyu lacivert kalite standardina alindi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/Customer360Screen.tsx`
  - Ana `Cari 360` hero ve secili cari ozet karti `colors.primaryDark`, lacivert border ve golge standardina tasindi.
- `mobile/portal/src/screens/CategoriesScreen.tsx`
  - Kategori yonetim hero'su duz mavi yuzeyden koyu lacivert/golgeli yuzeye tasindi.
- `mobile/portal/src/screens/HotSalesScreen.tsx`
  - Sicak satis header'i saha kullaniminda daha profesyonel gorunecek koyu hero standardina tasindi.
- `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`, `CustomerDetailScreen.tsx`, `EkstreScreen.tsx`, `ExclusionsScreen.tsx`
  - Cari/anlasma/ekstre/haric ekranlarindaki eski duz mavi ust yuzeyler koyu lacivert, border ve golge standardina alindi.
- `mobile/portal/src/screens/OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`, `QuoteConvertScreen.tsx`, `ProductOverridesScreen.tsx`
  - Siparis/teklif detay, teklif donusturme ve urun override ekranlarindaki hero yuzeyleri web kalitesine yaklastirildi.
- `mobile/portal/src/screens/SearchScreen.tsx`, `StaffScreen.tsx`, `RolePermissionsScreen.tsx`, `SettingsScreen.tsx`, `TaskCreateScreen.tsx`, `TaskDetailScreen.tsx`
  - Arama, personel, yetki, ayar ve gorev ekranlarinda eski hero/header yuzeyleri tek standarda cekildi.
- `mobile/portal/src/screens/SupplierPriceListsScreen.tsx`, `SupplierPriceListSettingsScreen.tsx`, `QuoteLinesScreen.tsx`, `SyncScreen.tsx`
  - Tedarikci fiyat listesi, liste ayarlari, teklif satirlari ve sync ekranlari koyu header standardina alindi.
- `mobile/portal/src/screens/VadeCustomerScreen.tsx`, `VadeAnalyticsScreen.tsx`, `VadeDashboardScreen.tsx`, `VadeManagementScreen.tsx`
  - Vade alt ekranlarindaki eski duz mavi header/hero yuzeyleri temizlendi.

Statik kontrol sonucu:

- Aşağıdaki net cok satirli tarama bos dondu; mobil ekranlarda `hero/header/customerCard/productHero` bloklarinin ilk `backgroundColor` satirinda eski `colors.primary` kalmadi:

```powershell
rg -n --pcre2 "(?s)(hero|header|customerCard|productHero): \{\s*\r?\n\s*backgroundColor: colors\.primary," mobile/portal/src/screens mobile/b2b/src/screens -g "*.tsx"
```

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` yukseltilmis izinle basarili; Android ve iOS Hermes bundle uretildi.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.

Kalan risk:

- Bu tur portal UI kalitesini kaynak/bundle seviyesinde guclendirdi; fiziksel cihazlarda gercek ekran goruntusu, APK imza/parsing, dokunma, klavye, PDF/Excel share ve push izin testi hala ayridir.

## 179. Mobil parite audit scripti regresyon sertlestirmesi

Bu turda sadece ekranlari duzeltmekle kalinmadi; ayni hatalarin tekrar girmemesi icin `mobile/scripts/audit-mobile-parity.mjs` scriptine iki yeni kaynak kontrolu eklendi.

Eklenen kontroller:

- Dinamik mobil kart/header basliklari icin satir limiti zorunlu hale getirildi.
  - Script su kalibi yakalarsa build/audit failure uretir: `cardTitle`, `rowTitle`, `productTitle`, `fileTitle`, `customerName`, `lineTitle` stilleriyle dogrudan dinamik metin basan ve `numberOfLines` kullanmayan `Text` elemanlari.
  - Failure mesaji: `satir limitsiz dinamik kart/header basligi bulundu: <dosya>`.
- Eski duz mavi ust yuzey kalibi yakalanir hale getirildi.
  - `header`, `hero`, `customerCard`, `productHero` bloklarinin ilk `backgroundColor` satirinda `colors.primary` kalirsa audit failure uretir.
  - Buton/chip/aksiyon yuzeyleri bu kontrole dahil edilmedi; sadece ekran kimligi tasiyan ust yuzeyler hedeflendi.
  - Failure mesaji: `eski duz mavi header/hero kalibi olabilir: <dosya>`.

Amaç:

- Mobil UI'a yeni ekran eklenirken uzun urun/cari/tedarikci/metin adlari tekrar ekrani bozmasin.
- Webdeki koyu lacivert/profesyonel ust yuzey standardi yerine eski tek-duz-mavi hero tasarimi geri gelmesin.
- Bu iki konu manuel gorsel kontrole kalmadan parity audit seviyesinde yakalansin.

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` onceki mobil sertlestirme turunda basarili.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyari satirlari var.

Kalan risk:

- Bu audit kaynak kodu ve bundle seviyesinde regresyon yakalar; gercek cihazda dokunma ergonomisi, klavye acilinca alan daralmasi, dosya/kamera izinleri, push izinleri, PDF/Excel paylasimi ve APK imza/parsing hatalari ayri QA ister.

## 180. Ilk kullanim mobil UI tasma sertlestirmesi

Kullanici APK imza/parsing konusunun bu gece oncelik olmamasini, asil onceligin mobil uygulamayi web renk/tarz/ozelliklerine sadik ve kullanilabilir hale getirmek oldugunu belirtti. Bu nedenle bu turda imza/kurulum uzerinde durulmadan, ilk testte kullanimi bozacak dar ekran tasma riskleri kapatildi.

Odak:

- Saha satis ve sicak satis urun arama/urun kartlari.
- Admin siparis/teklif olusturma ve detay ekranlari.
- Admin urun/gorsel kalite workflow'u.
- Musteri urun listeleri, urun detay, sepet, anlasmalar, talepler, gorevler, faturalar ve bildirim/tercih ekranlari.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/FieldSalesScreen.tsx`
  - Urun adlari dar telefonda 2 satira dusup bilgi kaybettigi icin saha satis urun kartinda baslik limiti compact telefonda 4, genis ekranda 5 satira cikarildi.
  - Mevcut `productHeaderRow`, `productTitleBlock`, meta grid ve aksiyon row yapisi korunarak sadece okunabilirlik artirildi.
- `mobile/portal/src/screens/HotSalesScreen.tsx`
  - Sicak satis urun arama kartinda urun adi 5 satira kadar gorunur hale getirildi.
  - Urun kodu, stok rozetleri, fiyat satiri ve sepet satirlari `numberOfLines`, `ellipsizeMode`, `minWidth` ve `flexWrap` ile guclendirildi.
  - Arama satiri, fiyat + `Satis/Yukle` aksiyonlari, sepet aksiyonlari, toplam bar ve siparisten cekme satirlari dar ekranda alt satira kirilabilir hale getirildi.
- `mobile/portal/src/screens/OrderCreateScreen.tsx`
  - Siparis olusturma grid, satir basligi ve fiyat tipi secimi dar ekranda sikismayacak sekilde `flexWrap`, `minWidth` ve `minWidth: 0` ile guclendirildi.
- `mobile/portal/src/screens/QuoteCreateScreen.tsx`
  - Teklif olusturma item header, pool ayar header'i, inline input satirlari, toggle satirlari, margin bilgi satirlari ve item basliklari dar ekranda tasma yapmayacak sekilde duzenlendi.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - Admin urun/gorsel kalite ekraninda arama satiri, kalite satirlari, detay liste satirlari, fiyat satirlari, gorsel satiri ve galeri header'i wrap destekli hale getirildi.
- `mobile/portal/src/screens/OrderDetailScreen.tsx`, `QuoteDetailScreen.tsx`, `OrdersScreen.tsx`, `QuotesScreen.tsx`
  - Toplam, satir header, kart header, tutar kutulari ve aksiyon satirlari dar ekranda tasma yerine kirilacak sekilde duzenlendi.
- `mobile/portal/src/screens/NotificationsScreen.tsx`
  - Push izin header'i, bildirim tercih satirlari ve bildirim kart ust satiri wrap destekli hale getirildi.
- `mobile/b2b/src/screens/ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `PurchasedProductsScreen.tsx`
  - Urun filtreleri, segmentler ve kart header'lari ayni mobil standarda alindi.
- `mobile/b2b/src/screens/ProductDetailScreen.tsx`
  - Tablet/detail grid, bilgi satirlari, paket icerigi, fiyat tipi segmentleri, tasarruf satiri, adet kontrolu ve toplam satirlari dar ekranda guvenli hale getirildi.
- `mobile/b2b/src/screens/CartScreen.tsx`
  - Sepet urun header'i, hediye kampanya header'i, kart title/flex alanlari ve toplam satirlari wrap/min-width guvenligine alindi.
- `mobile/b2b/src/screens/AgreementsScreen.tsx`
  - Anlasmali urun filtreleri, segmentler, kart header'i ve adet kontrolu guclendirildi.
- `mobile/b2b/src/screens/OrdersScreen.tsx`, `PendingOrdersScreen.tsx`, `QuotesScreen.tsx`, `RequestsScreen.tsx`, `RequestDetailScreen.tsx`
  - Siparis/teklif/talep kartlarindaki statü + baslik satirlari ve talep detay toplam/segment satirlari dar ekrana uygun hale getirildi.
- `mobile/b2b/src/screens/CustomerTasksScreen.tsx`, `PreferencesScreen.tsx`, `InvoicesScreen.tsx`, `HomeScreen.tsx`, `NewCategoriesScreen.tsx`, `ProfileScreen.tsx`
  - Gorev filtreleri, bildirim/tercih kontrolleri, fatura kartlari/sayfalama, ana sayfa hero metrikleri, kategori ozetleri ve profil segmentleri wrap destekli hale getirildi.

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili; Android bundle `index-51e6ff1a91b076aeaaa953465b8f2d3b.hbc`, iOS bundle `index-c499d71c24df8614eafd2dcc9ad59981.hbc`.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili; Android bundle `index-a15ee4be5fdf2b64992c69e89086b66f.hbc`, iOS bundle `index-b85a1249694d2ae6097b2a19f261bc6f.hbc`.

Kalan risk:

- Bu tur kullanimi etkileyen dar ekran tasma risklerini kaynak/bundle seviyesinde azaltti; yine de fiziksel Android/iOS cihazda farkli ekran genislikleri, klavye acilinca gorunen alan, kamera/dosya izinleri, push izinleri, PDF/Excel paylasimi ve APK imza/parsing akislari gercek cihaz QA'si ister.
- APK kurulumundaki `paketin ayristirilmasinda sorun olustu` hatasi bu turda bilincli olarak onceliklendirilmedi.

## 181. Mobil production log temizligi ve opsiyonel filtre fallback'i

Mobil UI sertlestirmesinden sonra kaynakta production icin gereksiz `console.warn` / `console.error` izleri tarandi. Kullaniciya zaten ekran ustunden hata veya fallback verildigi yerlerde konsol loglari kaldirildi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/CustomerDetailScreen.tsx`
  - Cari detay alt veri yuklemesi basarisiz olursa konsola hata basmak yerine kontak/sub-user/anlasma listeleri bos fallback'e alindi.
- `mobile/portal/src/screens/QuoteCreateScreen.tsx`
  - Cari listesi yuklenemediginde zaten ekranda hata state'i kullanildigi icin ekstra console error kaldirildi.
  - Teklif tercihleri opsiyonel oldugu icin yuklenemezse varsayilan ayarlarla devam edilir; console error kaldirildi.
- `mobile/b2b/src/screens/ProductsScreen.tsx`, `DiscountedProductsScreen.tsx`, `PurchasedProductsScreen.tsx`, `AgreementsScreen.tsx`
  - Kategori/depo filtreleri yuklenemezse urun/anlasma listesi kullanilabilir kalir; filtre listeleri bos fallback'e alindi ve console warn kaldirildi.

Statik kontrol:

- `rg -n "console\\.log|console\\.warn|console\\.error" mobile/portal/src mobile/b2b/src -g "*.tsx" -g "*.ts"` bos dondu.

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Bu sadece mobil istemci loglarini temizler. Backend/API hatalari yine kullaniciya toast/Alert ya da ekran state'i olarak donmelidir; production backend loglari ayri izlenmelidir.

## 182. Mobil arama normalizasyonu genisletmesi

Web tarafinda daha once cari/urun aramalarinda buyuk-kucuk harf ve Turkce/Ing karakter duyarliligi kullanimi bozdugu icin mobilde de ayni risk tarandi. Mobilde ortak `normalizeSearchText` helper'i zaten vardi; bu turda eski lokal `toLocaleLowerCase`/manuel replace tabanli arama filtreleri ortak helper'a tasindi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/AuditReportsScreen.tsx`
  - Toplu alim ve aday musteri/urun aramalari ortak normalize helper ile calisir hale getirildi.
- `mobile/portal/src/screens/CategoryImagesScreen.tsx`
  - Kategori adi/kodu aramasi Turkce karakter ve kod farklarina daha toleransli hale getirildi.
- `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`
  - Cari anlasma ekranindaki musteri aramasi `normalizeSearchText` ile yapiliyor.
- `mobile/portal/src/screens/FamilyReportsScreen.tsx`
  - Aile/fiyat ailesi raporlarinda urun kodu, urun adi, aile adi ve cluster adi aramasi ortak normalize helper'a tasindi.
- `mobile/portal/src/screens/PassiveStocksScreen.tsx`
  - Eski yerel normalize fonksiyonu kaldirildi; pasif stok aile aramasi ortak helper ile yapiliyor.
- `mobile/portal/src/screens/UcarerDepotScreen.tsx`
  - Ucarer depo urun kodu/adi aramasi ortak normalize helper'a tasindi.
- `mobile/portal/src/screens/CollectionsScreen.tsx`
  - Koleksiyon formundaki kategori aramasi kategori adi + Mikro kodu ile normalize edilir hale getirildi.
- `mobile/portal/src/screens/BundlesScreen.tsx`
  - `Paketler` kategori ayirma kontrolu ortak normalize helper'a baglandi.

Statik kontrol:

- Arama filtresi niteligindeki eski lowercase kullanimlari temizlendi.
- Kalan `toLocaleLowerCase`/`toLowerCase` kullanımlari arama degil; Excel/header/key parse, hareket tipi cozme veya dosya adi olusturma gibi alanlarda bilincli olarak birakildi.

Dogrulama:

- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.

Kalan risk:

- Bu tur mobil lokal filtreleri guclendirdi. Sunucu tarafli aramalarin tam karakter toleransi backend/API tarafindaki arama implementasyonuna baglidir; mobilde kritik yerlerde `buildSearchVariants` ile tekrarli arama destegi olan ekranlar korunmustur.

## 183. Mobil kritik aksiyonlarda cift tiklama/kayit guard sertlestirmesi

Mobil ekranlar uzun isteklerde veya yavas internet/Mikro baglantisi sirasinda ayni butona tekrar tekrar basmaya daha acik oldugu icin kritik kayit/aksiyon butonlari tekrar tarandi. Zaten `submittingRef`, `actionLoadingRef`, `creatingOrders` veya benzeri guard'i olan ekranlar korunarak sadece zayif kalan noktalara gorsel ve mantiksal kilit eklendi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/FamilyReportsScreen.tsx`
  - Stok/fiyat ailesi olusturma-duzenleme aksiyonu `familySavingRef` + `familySaving` ile kilitlendi.
  - Birim katsayisi kaydi `unitSavingRef` + `unitSavingId` ile satir bazli kilitlendi.
  - Buton metinleri islem sirasinda `Kaydediliyor` durumuna gecer; tekrar basma engellenir.
- `mobile/portal/src/screens/CustomerRecoveryReportScreen.tsx`
  - Geri kazanim satirindaki `Aksiyon Ac` butonu `actionCodeRef` ile kilitlendi.
  - Aksiyon acilirken ilgili satir pasif gorunur ve metin `Aciliyor` olur.
  - Aksiyon acma kodu `customerCode` yaninda `cariCode` fallback'i de kullanir hale getirildi.
- `mobile/portal/src/screens/DecisionSupportScreen.tsx`
  - Talep deseni raporundaki `Siparise Getir` aksiyonu `orderActionRef` ile kilitlendi.
  - Islem sirasinda ilgili urun satirinda `Uygulaniyor` metni gosterilir.
- `mobile/portal/src/screens/SupplierCostsScreen.tsx`
  - Fiyat teyit ve ihale kartlarindaki hizli `Guncel`, `Satis`, `Tamamla`, `Iptal` aksiyonlari global `submitting` sirasinda gorsel olarak da pasif hale getirildi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` ilk denemede Hermes `permission denied` verdi; sandbox disi/yukseltilmis izinle tekrar calistirilinca Android bundle `index-51e6ff1a91b076aeaaa953465b8f2d3b.hbc`, iOS bundle `index-c499d71c24df8614eafd2dcc9ad59981.hbc` uretildi.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` ilk denemede Hermes `permission denied` verdi; sandbox disi/yukseltilmis izinle tekrar calistirilinca Android bundle `index-a15ee4be5fdf2b64992c69e89086b66f.hbc`, iOS bundle `index-b85a1249694d2ae6097b2a19f261bc6f.hbc` uretildi.

Kalan risk:

- Bu tur mobil istemcide tekrar basma kaynakli cift istek riskini azaltti. Backend tarafinda idempotency key olmayan Mikro yazma islemleri icin nihai garanti yine backend seviyesinde saglanmalidir.

## 184. Mobil siparis listesi sunucu filtre/sayfalama ve toplu islem paritesi

Web admin siparis listesi backend'deki `/admin/orders` endpointini `status`, `source`, `search`, `page` ve `pageSize` parametreleriyle kullanirken mobil portal siparis listesi eski halde tum siparisleri cekip cihazda filtreliyordu. Bu, hem buyuk listede performans riski yaratiyordu hem de webdeki `Musteri / B2B` kaynak ayrimi ve sayfali is akisi mobilde eksik kaliyordu.

Uygulanan duzeltmeler:

- `mobile/portal/src/api/admin.ts`
  - `getOrders` geriye uyumlu kalacak sekilde parametreli hale getirildi.
  - `status=ALL` ve `source=ALL` backend'e gereksiz parametre olarak gonderilmiyor.
  - `OrdersPagination`, `AdminOrderStatusFilter`, `AdminOrderSourceFilter` ve `GetOrdersParams` tipleri eklendi.
- `mobile/portal/src/types.ts`
  - `Order` ve `OrderItem` tipi backend'in web siparis listesine dondurdugu alanlarla genisletildi.
  - `requestedBy`, `customerRequest`, `sourceQuote`, `customerOrderNumber`, `deliveryLocation`, `mikroOrderIds`, `displayName`, `mikroName`, `sectorCode`, urun birim/not/sorumluluk merkezi alanlari mobilde kaybolmayacak hale getirildi.
- `mobile/portal/src/screens/OrdersScreen.tsx`
  - Varsayilan liste web ile ayni sekilde `Tumu` durum filtresiyle acilir hale getirildi.
  - Durum filtreleri `Tumu / Bekleyen / Onaylanan / Reddedilen` olarak sunucu sorgusuna baglandi.
  - Kaynak filtreleri `Tum Kaynaklar / Musteri / B2B` olarak eklendi.
  - Arama 350 ms debounce ile sunucu tarafli aramaya tasindi.
  - Liste `25` kayitlik sayfalarla calisir hale getirildi; alt kisimda `Onceki / Sonraki` ve `Sayfa X / Y` kontrolu eklendi.
  - Kartlarda kaynak rozeti eklendi: `Musteri`, `Talep`, `B2B`.
  - Bekleyen siparislerde satir secimi, sayfadaki bekleyenleri secme, toplu onay ve toplu red aksiyonlari eklendi.
  - Toplu aksiyonlar Alert onayi alir; islem sirasinda tekrar basma engellenir.
  - Ozet kartlari sayfa ve filtre toplamlarini ayiracak sekilde guncellendi.
  - Liste guncellenirken kullaniciya `Liste guncelleniyor...` ara durumu gosterilir.
  - Tablet/genis ekranda iki kolonlu kart duzeni korunur; telefonda tek kolonla tasma riski azaltilir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-7e3311d768d258660ce0c546c23494a1.hbc`; iOS bundle: `index-01929b3d41af2688892d98d6f480ba39.hbc`.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-a15ee4be5fdf2b64992c69e89086b66f.hbc`; iOS bundle: `index-b85a1249694d2ae6097b2a19f261bc6f.hbc`.

Kalan risk:

- Toplu onay/red mevcut backend aksiyonlarini sirayla cagirir. Mobil istemci tekrar basmayi engeller; Mikro yazma tarafinda nihai idempotency garantisi backend seviyesinde ayri ele alinmalidir.
- Fiziksel cihazda gercek siparis onay/red, APK kurulum/imza ve kamera/PDF/paylasim QA'si bu turda bilincli olarak ertelendi. Kullanici APK parsing sorununu simdilik oncelik disi birakti.

## 185. Mobil teklif listesi ve dashboard fallback yuk hafifletmesi

Siparis listesi sunucu sayfalamasina tasindiktan sonra ayni risk teklif listesinde ve dashboard'un nadir fallback yolunda da kontrol edildi. Mobil teklif listesi de tum teklifleri cihaza indirip lokal arama/durum filtresi yapiyordu. Backend tarafinda web icin zaten `status`, `search`, `page`, `pageSize` desteklendigi icin mobil istemci ayni sozlesmeye tasindi.

Uygulanan duzeltmeler:

- `mobile/portal/src/api/admin.ts`
  - `getQuotes` geriye uyumlu kalacak sekilde hem eski `getQuotes(status)` hem yeni `getQuotes({ status, search, page, pageSize })` formunu destekler hale getirildi.
  - `GetQuotesParams` ve `QuotesPagination` tipleri eklendi.
- `mobile/portal/src/screens/QuotesScreen.tsx`
  - Teklif listesi `25` kayitlik sunucu sayfalarina tasindi.
  - Durum filtresi ve arama backend sorgusuna baglandi.
  - Arama 350 ms debounce ile calisir; her harfte istek atmaz.
  - Ozet kartlari sayfa toplami ve filtre toplamlarini ayirir hale getirildi.
  - Liste guncellenirken `Liste guncelleniyor...` ara durumu eklendi.
  - Alt kisimda `Onceki / Sonraki` ve `Sayfa X / Y` kontrolu eklendi.
  - Onay/red/PDF/onerili PDF/duzenle/siparise cevir aksiyonlari korunur.
- `mobile/portal/src/screens/DashboardScreen.tsx`
  - Normal ana veri kaynagi yine `/admin/dashboard/stats` olarak korundu.
  - Backend stats cevabi beklenen summary alanlarini vermezse devreye giren fallback, artik tum siparis/teklif listesini cekmez; ilk `200` kayitlik sayfali istekle sinirlanir.
  - Bu yol yalniz yedek davranistir; dogru dashboard metrikleri backend stats endpointinden gelmeye devam etmelidir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `git diff --check -- mobile` basarili; yalniz Windows LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-128616d7a88d40b2dea405c370f3972a.hbc`; iOS bundle: `index-0e1881e2b0afc5b21f0b8443f66e6c95.hbc`.

Kalan risk:

- Dashboard fallback artik yuku sinirlar ancak fallback oldugu icin tam donem toplami yerine sinirli bir kurtarma ozeti verebilir. Normal production davranisi backend dashboard stats endpointinin summary dondurmesidir.
- Teklif listesinde canli onay/red/siparise cevir ve PDF paylasim akislarinin fiziksel Android/iOS cihazda uctan uca QA'si hala ayrica yapilmalidir.

## 186. Musteri mobil siparis/teklif listeleri sayfali backend paritesi

Portal siparis/teklif listeleri sayfali hale getirildikten sonra musteri mobil uygulamasinda ayni agir liste riski kontrol edildi. Musteri `/orders` ve `/quotes` endpointleri daha once parametresiz tum kullanici gecmisini donduruyordu. Bu turda backend geriye uyumlu genisletildi: parametre verilmezse eski cevap formu korunur, mobil parametre verirse sunucu tarafli `status`, `search`, `page`, `pageSize` kullanilir.

Uygulanan duzeltmeler:

- `backend/src/services/order.service.ts`
  - `getUserOrders(userId, options?)` desteklendi.
  - Opsiyonel durum filtresi, cok-token arama ve sayfalama eklendi.
  - Arama alanlari: siparis no, musteri siparis no, admin notu, teslim lokasyonu, kalem urun adi, Mikro kodu ve satir notu.
  - `pageSize` verilmezse eski dizi cevabi aynen korunur.
- `backend/src/controllers/customer.controller.ts`
  - `/api/orders` query parametreleri okunur hale getirildi.
  - Sayfali cagrida `{ orders, pagination }`, eski cagrida `{ orders }` doner.
- `backend/src/services/quote.service.ts`
  - `getQuotesForCustomer(customerId, options?)` desteklendi.
  - Opsiyonel durum filtresi, cok-token arama ve sayfalama eklendi.
  - Arama alanlari: teklif no, evrak no, Mikro no, not, kalem urun adi/kodu ve satir aciklamasi.
  - `pageSize` verilmezse eski dizi cevabi aynen korunur.
- `backend/src/controllers/quote.controller.ts`
  - `/api/quotes` query parametreleri okunur hale getirildi.
  - Sayfali cagrida `{ quotes, pagination }`, eski cagrida `{ quotes }` doner.
- `mobile/b2b/src/api/customer.ts`
  - `getOrders` ve `getQuotes` parametreli hale getirildi.
  - `CustomerListPagination`, `CustomerOrderListParams`, `CustomerQuoteListParams` tipleri eklendi.
- `mobile/b2b/src/screens/OrdersScreen.tsx`
  - Siparis listesi `20` kayitlik sayfalarla sunucu tarafli filtre/arama kullanir.
  - Arama 350 ms debounce ile calisir.
  - Durum filtresi backend parametresine baglandi.
  - Ozet kartlari backend filtre toplamiyla sayfa toplamlarini ayirir.
  - `Onceki / Sonraki` ve `Sayfa X / Y` kontrolu eklendi.
- `mobile/b2b/src/screens/QuotesScreen.tsx`
  - Teklif listesi `20` kayitlik sayfalarla sunucu tarafli filtre/arama kullanir.
  - Durum secenekleri sadece mevcut sayfadan turetilmez; sabit teklif durumlariyla calisir.
  - PDF ve detay aksiyonlari korunur.
  - `Onceki / Sonraki` ve `Sayfa X / Y` kontrolu eklendi.

Dogrulama:

- `backend`: `npm.cmd run build` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `git diff --check -- backend/src/services/order.service.ts backend/src/controllers/customer.controller.ts backend/src/services/quote.service.ts backend/src/controllers/quote.controller.ts mobile` basarili; yalniz Windows LF/CRLF uyarilari var.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-53ffdddce5c5f1a5d88e69f13ce57a52.hbc`; iOS bundle: `index-a6df82c3feca891e230cb28d49da3f0d.hbc`.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-128616d7a88d40b2dea405c370f3972a.hbc`; iOS bundle: `index-0e1881e2b0afc5b21f0b8443f66e6c95.hbc`.

Kalan risk:

- Backend endpointleri geriye uyumlu oldugu icin web/musteri mevcut parametresiz kullanimi bozulmamalidir; canli ortamda eski ve yeni parametreli cagri ayrica smoke test edilmelidir.
- Android/iOS fiziksel cihazda uzun musteri gecmisiyle sayfa ileri/geri, arama ve durum filtresi QA'si hala ayrica yapilmalidir.

## 187. Mobil ilk-kullanim kalite turu: dar ekran tasma ve son parite taramasi

Kullanici APK imza/kurulum problemini bu tur icin oncelik disi biraktigi icin calisma kod/parite ve ilk kullanim kalitesine odaklandi. Amac, portal ve musteri uygulamalarinda webin koyu mavi kurumsal tarzi korunurken dar Android ekranda urun/cari adlari, aksiyon butonlari ve katalog kalite kartlari sikismasin.

Uygulanan duzeltmeler:

- `mobile/b2b/src/screens/ProductsScreen.tsx`
  - Dar telefonda urun karti basligi ve rozetler ayni satirda birbirini sikistirmeyecek hale getirildi.
  - `Anlasmali`, `Paket`, `Fazla Stok` rozetleri 420px altinda alt satira inip sola hizalanir.
  - Urun adi dar ekranda 5 satira kadar gorunur; uzun gramaj/spec/metraj bilgileri karti bozmadan okunabilir.
- `mobile/portal/src/screens/FieldSalesScreen.tsx`
  - Cari ve urun arama butonlari dar telefonda tam genislige iner.
  - Saha satis arama butonlari ve `Havuza Ekle` / `Teklife Ekle` aksiyonlari icin temas alani buyutuldu.
  - Kompakt urun karti yapisi korunarak uzun urun adlari 4 satira kadar sarilir; tek satira zorlanmaz.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - Katalog/gorsel kalite aksiyon ekraninda `Ara` butonu dar telefonda tam genislik olur.
  - Katalog kalite metrikleri (`Kritik kalite`, `Gorselsiz`, `Galeri eksik`) kucuk ekranda alt satira sarabilir; uc kart tek satira zorlanmaz.
  - Gorsel yukleme/galeri aksiyonlarina giden ekran, aksiyon radarindan gelen kalite problemlerini mobilde de kullanilabilir sekilde tasir.

Son statik tarama:

- Mobil kaynaklarda acik `TODO`, `FIXME`, `coming soon`, `not implemented`, `yakinda`, `mock data`, `dummy`, `stub` kalibi bulunmadi.
- Mobil kaynaklarda parametresiz `getOrders()` / `getQuotes()` tam liste cagrisi bulunmadi.
- `PendingOrdersScreen` icindeki lokal filtreleme bilincli olarak ayrik tutuldu; o ekran zaten bekleyen/acik siparis amacli backend datasini filtreliyor.

Dogrulama:

- `backend`: `npm.cmd run build` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `git diff --check -- backend/src/services/order.service.ts backend/src/controllers/customer.controller.ts backend/src/services/quote.service.ts backend/src/controllers/quote.controller.ts mobile` basarili; yalniz Windows LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-16ef86cac4887be45221c285e2d2dc4f.hbc`; iOS bundle: `index-ea8608dae53b645ef8a2f4ca45deeca2.hbc`.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-10212e3dbd66a94c8f02b8fbbbf08ca2.hbc`; iOS bundle: `index-fd70e2d41dbf097c5b9993d954a654f2.hbc`.

Bilincli ertelenenler:

- APK parsing / imza / cihaz kurulumu bu turda oncelik disi birakildi.
- Fiziksel Android cihazda kamera, belge secici, PDF paylasim, push permission ve gercek login-smoke QA'si hala ayrica yapilmalidir.
- Canli Mikro yazan akislar icin mobil butonlar derlenir durumda; gercek onay/red/siparise cevir gibi Mikro etkili islemler ayrica kontrollu test ister.

## 188. Musteri mobil urun ekranlari sayfali yukleme performansi

Siparis/teklif listeleri sayfali hale geldikten sonra musteri tarafindaki urun ekranlari da performans acisindan tekrar kontrol edildi. `Tum Urunler`, `Indirimli Urunler`, `Daha Once Aldiklarim` ve `Anlasmali Fiyatlar` ekranlari backend'in zaten destekledigi `limit/offset` parametrelerini kullanmadan tum eslesen listeyi tek seferde alabiliyordu. Bu Android ilk kullanimda gereksiz veri, resim karti ve siralama maliyeti yaratabilir.

Uygulanan duzeltmeler:

- `mobile/b2b/src/api/customer.ts`
  - `getProducts` cevabi `total?: number` okuyabilecek sekilde genisletildi.
- `mobile/b2b/src/screens/ProductsScreen.tsx`
  - Ilk liste `40` urunle sinirlandi.
  - `Daha Fazla Yukle` footer aksiyonu eklendi.
  - Yüklenen/toplam ozet metni desteklendi.
  - Dar ekranda uzun urun adlari ve rozetler birbirini sikistirmayacak sekilde korunur.
- `mobile/b2b/src/screens/DiscountedProductsScreen.tsx`
  - Ilk liste `40` urunle sinirlandi.
  - Devam yukleme ve liste sonu durumlari eklendi.
- `mobile/b2b/src/screens/PurchasedProductsScreen.tsx`
  - Tekrar siparis akisi icin ilk liste `40` urunle sinirlandi.
  - Devam yukleme ve liste sonu durumlari eklendi.
- `mobile/b2b/src/screens/AgreementsScreen.tsx`
  - Anlasmali urunler ilk liste `40` urunle sinirlandi.
  - Devam yukleme ve liste sonu durumlari eklendi.

Teknik not:

- Backend `warehouse` veya `discounted` gibi bazi post-filter durumlarinda gercek toplam bilgisini bilerek gondermez. Bu durumlarda mobil sadece yuklenen adet bilgisini gosterir ve `Daha Fazla Yukle` butonu son sayfada kapanir.
- `onSubmitEditing` dogrudan sayfalama fonksiyonuna baglanmadi; aksi halde React Native event objesi yanlislikla `append=true` gibi yorumlanabilirdi.

Dogrulama:

- `backend`: `npm.cmd run build` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-3fc1a80cf7cb84cb1303dd09175b1970.hbc`; iOS bundle: `index-437dcf842f17106db2279ad719cd69cf.hbc`.

## 189. Portal mobil katalog ekraninda sayfali yukleme ve gorselsiz aksiyon listesi

Musteri mobil urun ekranlarindan sonra portal/admin katalog ekraninda da ayni performans riski kontrol edildi. `ProductsScreen`, webdeki katalog kalite ve gorsel workflow'unu mobilde tasiyordu ancak urun listesini `page/limit` vermeden cagiriyordu. Bu, buyuk katalogda ilk acilista gereksiz veri transferi ve kart render maliyeti yaratabilir; ayrica aksiyon radarindan `Gorselsiz` filtresiyle gelindiginde ilk sayfada gorselsiz urun denk gelmezse personel aksiyon alamiyor gibi gorunebilirdi.

Uygulanan duzeltmeler:

- `mobile/portal/src/api/admin.ts`
  - `getProducts` parametre tipi `hasImage?: boolean` destekleyecek sekilde genisletildi.
- `mobile/portal/src/screens/ProductsScreen.tsx`
  - Ilk katalog listesi `40` urunle sinirlandi.
  - Backend `pagination` bilgisi mobil state'e alindi.
  - `Daha Fazla Yukle` footer aksiyonu eklendi.
  - Hero ve ozet satirinda yuklenen/toplam bilgisi gosterilir.
  - `Gorselsiz` kalite filtresi artik yalniz cihazda filtrelemek yerine backend'e `hasImage=false` gonderir; bu sayede aksiyon radarindan gorsel eksigiyle gelindiginde liste dogrudan ilgili urun havuzunu acar.
  - `Kritik`, `Orta` ve `Galeri eksik` filtreleri mevcut kart uzeri kalite hesaplamasiyla korunur; gorsel yukle/galeri ac/ana gorsel yap/sil aksiyonlari degismedi.

Kapsam notu:

- Bu tur katalog ekranini daha hizli ve aksiyonlanabilir yapar; webdeki tam tablo yogunlugu yerine mobilde kart + kalite paneli yaklasimi korunur.
- `BAD`, `WARN` ve `GALLERY_MISSING` kalite filtresi hala mobilde yuklenen sayfa uzerinden hesaplanir. Tam sunucu tarafli katalog kalite indeksleme sonraki iyilestirme olabilir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `git diff --check -- mobile/...` basarili; yalniz Windows LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-e8bc34517c78123b3a5045f026ac20f4.hbc`; iOS bundle: `index-c9dcbb1dd9c93b98d7c1819e7389d780.hbc`.

Kalan risk:

- APK parsing/imza/kurulum problemi bu turda kullanici talimatiyla bilincli olarak oncelik disi tutuldu.
- Fiziksel Android/iOS cihazda katalog kartlari, gorsel dosya secici, galeri aksiyonlari ve geri donus davranisi ayrica dokunarak test edilmelidir.

## 190. Portal mobil ana musteri listesinde sunucu sayfalama

Portal katalog ekranindan sonra cari/musteri listeleri de kontrol edildi. Ana `Musteriler` ekrani mobilde tum B2B musteri kayitlarini tek seferde cekip cihazda filtreliyordu. Bu, temsilci portfoyu buyudukce ilk acilis ve arama performansini bozabilir; ayrica sales rep sektor/musteri kapsami zaten backend'de uygulanirken mobilin tum listeyi beklemesi gereksizdi.

Uygulanan duzeltmeler:

- `mobile/portal/src/api/admin.ts`
  - `getCustomers` metodu webdeki backend sozlesmesine uygun olarak `search`, `page`, `pageSize` ve `active` parametreleriyle genisletildi.
  - Geriye uyumluluk korunur; paramsiz cagri yapan secici ekranlar eski cevabi almaya devam eder.
- `mobile/portal/src/screens/CustomersScreen.tsx`
  - Ana liste ilk acilista `50` cari ceker.
  - Arama backend'e gider; buyuk/kucuk harf ve Turkce/Ing karakter normalizasyonu backend'deki ortak arama mantigindan yararlanir.
  - `Daha Fazla Yukle` footer aksiyonu eklendi.
  - Hero metrikleri toplam ve yuklu cari ayrimini gosterir.
  - Yeni musteri olusturma, Mikro cari secimi, otomatik kullanici/sifre doldurma ve detay navigasyonu korunur.

Kapsam notu:

- Bu ara tur sadece ana `Musteriler` ekranini sayfali hale getirdi; siparis/teklif ve diger cari secicileri sonraki maddelerde ayrica kapatildi.
- Mikro cari secim modali hala `getCariList` listesini kullanir; yeni musteri acma akisi bozulmasin diye bu tur dokunulmadi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-0c2185e0e1d46d482be00012646473dc.hbc`; iOS bundle: `index-beaf418f1703658feca58236c8cfbdb0.hbc`.

Kalan risk:

- Siparis/teklif olusturma ekranlarindaki cari secicilerde cok buyuk portfoyle gercek cihaz QA'si yapilmali.
- APK parsing/imza/kurulum problemi bu turda kullanici talimatiyla bilincli olarak oncelik disi tutuldu.

## 191. Portal mobil siparis/teklif cari secimlerinde sunucu aramasi

Ana musteri listesinden sonra satiscinin en kritik akisi olan manuel siparis ve teklif olusturma ekranlari incelendi. Iki ekranda da cari secimi eski halde tum B2B musterilerini cekip cihazda filtreliyordu. Bu hem buyuk portfoyde yavaslama yaratir hem de ilk yuklenen/verilen liste disinda kalan cariler icin "bulunamadi" hissi olusturabilirdi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/OrderCreateScreen.tsx`
  - Cari aramasi backend'e `search/page/pageSize` ile gider.
  - Ilk sonuc seti `40` cariyle sinirlandi.
  - `Daha Fazla Yukle` ile sonraki sayfalar alinabilir.
  - Secilen cari, sonraki aramalarda yuklenen sayfadan dusse bile siparis hedefi olarak korunur.
  - Urun arama, fiyat, seri, aciklama ve siparis olusturma mantigina dokunulmadi.
- `mobile/portal/src/screens/QuoteCreateScreen.tsx`
  - Yeni teklif cari aramasi backend'e `search/page/pageSize` ile gider.
  - Ilk sonuc seti `40` cariyle sinirlandi ve devam yukleme eklendi.
  - Dis ekrandan `customerIdOrCode` ile gelindiginde ilk arama dogrudan bu degerle baslar.
  - Duzenleme modunda mevcut teklif carisi secili tutulur ve cari degistirme kilidi korunur.
  - Onceki alim havuzu, urun arama, tamamlayici oneriler, fiyat/marj ve teklif kayit mantigina dokunulmadi.

Kapsam notu:

- Bu degisiklik, sales rep sektor/musteri kapsaminda backend'in zaten uyguladigi yetki filtresinden yararlanir; mobil taraf tum cari evrenini indirmeyi birakmis olur.
- Musteri secimi modal degil kart ici liste olarak kaldi; webdeki masaustu secici yogunlugunu birebir kopyalamak yerine mobil kullanima uygun 40'lik sonuclar ve devam yukleme tercih edildi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-5b36555825116d354a73bd0634f26958.hbc`; iOS bundle: `index-de9ac02dd527d4f4af88c1c923b84775.hbc`.

Kalan risk:

- Gercek Android cihazda uzun cari adlari, zayif internet ve temsilci sektor yetkisiyle siparis/teklif olusturma smoke testi hala yapilmalidir.
- APK parsing/imza/kurulum problemi bu turda kullanici talimatiyla bilincli olarak oncelik disi tutuldu.

## 192. Portal mobil kalan cari listelerinde sayfali sunucu aramasi

Siparis ve teklif cari seciminden sonra kalan parametresiz `getCustomers()` kullanimlari tarandi. Ana liste, portfoy, musteri detay ve anlasmali fiyat ekranlari buyuk cari evreninde gereksiz tam liste cagrisi yapabiliyordu. Bu turda kalanlar da backend arama/sayfalama sozlesmesine tasindi.

Uygulanan duzeltmeler:

- `backend/src/controllers/admin.controller.ts`
  - `/admin/customers` arama haystack'ine `customer.id` eklendi.
  - Bu sayede mobil tekil musteri detay ekrani UUID ile tek kayit arayabilir.
  - Mevcut ad/kod/email/sehir/sektor arama davranisi korunur.
- `mobile/portal/src/screens/CustomerDetailScreen.tsx`
  - Müşteri detay acilista tum cari listesini cekmez.
  - `customerId` ile `pageSize=1` arama yapar ve sadece ilgili kaydi alir.
- `mobile/portal/src/screens/PortfolioScreen.tsx`
  - Portfoy listesi `50` kayitlik sayfalarla yuklenir.
  - Arama ve aktif/pasif filtresi backend'e gider.
  - Hero toplam/yuklu ayrimi ve `Daha Fazla Yukle` footer'i eklendi.
- `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`
  - Anlasmali fiyat musteri secimi `40` kayitlik backend sayfalama ile calisir.
  - Arama backend'e gider; secilen musteri nesnesi korunur.
  - Excel import, anlasma kaydetme/silme, urun arama ve anlasma arama mantigi korunur.

Kapsam notu:

- `getCustomers()` paramsiz cagri mobil ekranlarda kalmadi; tek istisna yok.
- Backend degisikligi sadece arama kapsaminda id alanini ekler; veri yetkisi ve sales rep sektor filtresi ayni `where` uzerinden calismaya devam eder.

Dogrulama:

- `backend`: `npm.cmd run build` basarili.
- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-0005fff41e1339068e2099cc2b7206af.hbc`; iOS bundle: `index-556542ec2f646d977f5d46f7c0e59a50.hbc`.

Kalan risk:

- Canli yetkili SALES_REP kullanicisiyla portfoy, siparis cari secimi, teklif cari secimi ve musteri detay acilisinin gercek cihazda smoke testi yapilmalidir.
- APK parsing/imza/kurulum problemi bu turda kullanici talimatiyla bilincli olarak oncelik disi tutuldu.

## 193. Portal genel F10 stok/cari aramada devam yukleme

Kalan buyuk liste riskleri taranirken portal genel `Arama` ekraninda stok/cari arama sonucunun ilk sayfada kaldigi, `Tum stoklar` aksiyonunun ise 1000 satiri tek seferde cekebildigi goruldu. Bu ekran personelin Mikro F10 pratiklerini mobilde kullanmasi icin merkezi oldugundan, tek seferde yuklenme yerine kontrollu sayfalama eklendi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/SearchScreen.tsx`
  - Stok ve cari arama sonucu `50` kayitlik sayfalarla yuklenir.
  - `Daha Fazla Yukle` footer aksiyonu eklendi.
  - Arama varyantlari korunur; ilk sonuc hangi Turkce/ASCII varyanttan geldiyse devam yukleme ayni varyant ve offset ile devam eder.
  - `Tum stoklar` artik 1000 kaydi tek seferde cekmez; ilk 50 sonuc gelir, devam butonuyla ilerler.
  - Cari aramada VKN zenginlestirme mevcut sayfa uzerinden korunur; gereksiz tum cari verisi cekilmez.
  - Alan secimi, kolon tercihi kaydi, tablet iki kolon kart duzeni, stok detay modal'i ve yetki bazli stok/cari mod gizleme davranisi korunur.

Kapsam notu:

- Backend arama endpointleri zaten `limit/offset` destekledigi icin backend sozlesmesi degistirilmedi.
- Bu tur webdeki F10 hizli arama pratiklerini mobilde daha kontrollu ve buyuk veriyle daha kullanilabilir hale getirir; canli Mikro kesintisi/timeout davranisi ayrica cihazda test edilmelidir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` basarili. Android bundle: `index-d59894ad633639653a1e5bea4191602e.hbc`; iOS bundle: `index-ea9f6c36c655285553c12b6760b45f46.hbc`.

Kalan risk:

- Gercek cihazda zayif Mikro baglantisi, uzun kolon secimi, cok sayida devam yukleme ve stok detay modal'i ile dokunma QA'si yapilmalidir.
- APK parsing/imza/kurulum problemi bu turda kullanici talimatiyla bilincli olarak oncelik disi tutuldu.

## 194. Portal teklif ve tedarik operasyon ekranlarinda mobil UI kalite turu

Kullanicinin APK/parsing sorununu simdilik oncelik disi birakip mobil uygulamanin web kalitesine yaklasmasini istemesi uzerine kalan operasyon ekranlari tekrar tarandi. `Tasks`, `ImageIssues`, `FieldSalesVisits` ve `AuditReports` ekranlarinda hero/metrik/aksiyon yapisinin zaten guclendigi goruldu. Bu turda daha zayif kalan teklif kalemleri ve tedarikci fiyat listesi ekranlari iyilestirildi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/QuoteLinesScreen.tsx`
  - Web admin panelindeki mavi operasyon diline uygun koyu hero alanina tasindi.
  - Gorunen/acik/kapali/tutar metrikleri eklendi.
  - Filtre, arama, kapatma nedeni ve toplu kapatma kontrolleri beyaz kontrol kartina ayrildi.
  - Secili acik kalem sayisi kullaniciya net gosterilir.
  - Teklif satiri kartlari fiyat/miktar/bekleme/toplam kutucuklariyla taranabilir hale getirildi.
  - Uzun urun ve cari adlarinda kart tasmasini azaltmak icin `numberOfLines` ve `minWidth: 0` kullanimlari eklendi.
  - Tekli/toplu islem sirasinda cift tiklama kaynakli eszamanli kapatma/acma riskini azaltan busy guard korunur.
- `mobile/portal/src/screens/SupplierPriceListsScreen.tsx`
  - Hero bolumune yukleme, gorunen satir, eslesen satir ve secili dosya metrikleri eklendi.
  - Tablet genisliginde icerik maksimum genislik ile ortalanir.
  - Excel/PDF override gridleri dar ekranda kirilabilir hale getirildi.
  - Tedarikci satir kartlari liste/net/fark kutucuklariyla daha okunur hale getirildi.
  - Fiyat farki yuzdesi dusuk/orta/yuksek sapmaya gore renklenir.
  - Uzun tedarikci, B2B urun ve eslesen kod metinlerinde tasma azaltildi.
- `mobile/portal/src/screens/SupplierPriceListSettingsScreen.tsx`
  - Tedarik ayarlari ekranina toplam/aktif/net/esleme hazir metrikleri eklendi.
  - Tedarikci kartlarinda fiyat tipi, KDV, Excel ve PDF esleme ozeti kart icinde gorunur hale getirildi.
  - Modal tablet ekranlarda asiri yayilmadan ortalanir; form gridleri ve buton satirlari dar ekranda kirilabilir hale getirildi.

Kapsam notu:

- Is mantigi, endpoint sozlesmeleri, fiyat hesaplama ve dosya parse davranisi degistirilmedi.
- APK imza/parsing/kurulum sorunu kullanici talimatiyla bu turda oncelik disi tutuldu.
- Bu tur sadece `mobile/portal` ekranlarina dokundu; `mobile/b2b` musteri uygulamasi bu turda yeniden degistirilmedi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `git diff --check -- ...` basarili; yalniz mevcut LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: Ilk `npm.cmd exec -- expo export --platform all` sandbox icinde Hermes `permission denied` ile durdu.
- `mobile/portal`: Ayni export sandbox disinda basarili. Android bundle: `index-850979797989b45659117263c6b5f57c.hbc`; iOS bundle: `index-2313fa1c0253d2c768c79a8052da7306.hbc`.

Kalan risk:

- Gercek cihazda dokunma hedefleri, uzun tedarikci/urun isimleri, dosya secme/yukleme ve teklif kalemi kapatma/acma akislari canli kullanici ile smoke test edilmelidir.
- Hermes export sandbox icinde Windows izin hatasi verebildigi icin bundle dogrulamasi gerekirse sandbox disi calistirilmelidir.

## 195. Musteri uygulamasinda rol uyumsuzlugu ekraninin web tarza alinmasi

Musteri mobil uygulamasi ekranlari tarandi. `primaryDark`/hero/metrik dili olmayan tek ekranin `RoleMismatchScreen` oldugu goruldu. Bu ekran nadir gorulse de yanlis uygulamaya giren personeli kilitleyen kritik bir hata ekranidir; bu nedenle musteri uygulamasinin genel mavi tasarim diline tasindi.

Uygulanan duzeltmeler:

- `mobile/b2b/src/screens/RoleMismatchScreen.tsx`
  - Duz beyaz hata metni yerine koyu mavi, cerceveli ve golgeli kart kullanildi.
  - Baslik, aciklama ve "Ne yapmaliyim?" bilgi kutusu eklendi.
  - Cikis aksiyonu beyaz birincil buton olarak daha belirgin hale getirildi.
  - Kart genisligi telefon ve tablet icin sinirlandi; ekran ortasinda daha profesyonel gorunur.

Kapsam notu:

- Giris/rol kontrolu is mantigi degistirilmedi.
- Musteri uygulamasinda ana ekran, urunler, indirimli urunler, daha once aldiklarim, anlasmalar, sepet, siparis/teklif/fatura/talep ekranlari zaten onceki turlarda yeni mobil tasarim diline alinmisti; bu tur kalan tek istisna kapatildi.

Dogrulama:

- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/b2b`: `git diff --check -- mobile/b2b/src/screens/RoleMismatchScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarisi var.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-9a76511ba05e9132bb43bec4fc09627d.hbc`; iOS bundle: `index-2b6134cb5c9b287779428c57ff125450.hbc`.

Kalan risk:

- Gercek Android/iOS cihazda personel hesabiyla musteri uygulamasina giris yapildiginda bu ekranin dogru gorunmesi ve cikis butonunun oturumu temizlemesi smoke test edilmelidir.
- APK parsing/imza/kurulum problemi kullanici talimatiyla hala oncelik disi tutulmustur.

## 196. Portal rol uyumsuzlugu ekrani ve son export temizligi

Musteri uygulamasinda kalan son eski hata ekrani kapatildiktan sonra portal tarafinda da ayni durum kontrol edildi. `mobile/portal/src/screens/RoleMismatchScreen.tsx` dosyasinin da duz beyaz hata metniyle kaldigi goruldu. Yanlis hesap tipiyle giren kullanici ilk burada takilacagi icin portal uygulamasinda da ayni kalite standardi uygulandi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/RoleMismatchScreen.tsx`
  - Duz metinli eski ekran yerine koyu mavi, cerceveli ve golgeli hata karti eklendi.
  - "Hesap Turu" kicker'i, net baslik, aciklama ve "Ne yapmaliyim?" bilgi kutusu eklendi.
  - Cikis aksiyonu beyaz birincil buton olarak belirginlestirildi.
  - Telefon ve tablet ekranlarinda kart genisligi sinirlandi.
- `mobile/b2b/src/screens/RoleMismatchScreen.tsx`
  - Onceki turdaki degisiklik yeni dogrulama ile tekrar kanitlandi.

Kapsam notu:

- Rol/yetki karar mantigi degistirilmedi; sadece yanlis uygulama/yanlis hesap tipi deneyimi web kalite standardina alindi.
- APK imza/parsing/kurulum sorunu hala kullanici talimatiyla oncelik disi.
- Bu tur sonunda dunden kalma tek eski `node.exe` / Metro sureci kontrol edildi ve kapatildi; yeni Node/Expo sureci kalmadi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `git diff --check -- mobile/portal/src/screens/RoleMismatchScreen.tsx mobile/b2b/src/screens/RoleMismatchScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-5a43e789cc55e89892045f09ec2f40c8.hbc`; iOS bundle: `index-4596d653da23d0b60f90b6939614a48b.hbc`.
- `mobile/b2b`: Ilk export denemesi uzun sure takildi ve zaman asimina dustu. `--clear` ile tekrar calistirildi ve basarili oldu. Android bundle: `index-22d2deebe7b20a4ca9009cdcb6ae91f2.hbc`; iOS bundle: `index-9991acdebcd8cb6f71469c4716e5680c.hbc`.

Kalan risk:

- Gercek cihazda yanlis hesap tipiyle iki uygulamada da cikis akisi test edilmelidir.
- APK parsing/imza kurulumu bu turun kapsami disinda birakildigi icin fiziksel kurulum kaniti hala yoktur.

## 197. Portal tablet sinirlari ve Excel sablon fallback duzeltmesi

Mobil parite hedefinde bu tur statik audit'in yakalamadigi pratik kullanim sorunlari tarandi. Ozellikle "dosya olusturuldu ama kullaniciya sadece cihaz path'i gosteriliyor" ve "tablet ekraninda form gereksiz yayiliyor" tipindeki sorunlar incelendi. Rapor/export ekranlarinin cogunda `expo-sharing` kullanildigi dogrulandi; iki kucuk ama operasyonel etkisi olan iyilestirme yapildi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/SettingsScreen.tsx`
  - Tabletlerde ayar formunun tum genislige yayilmasi engellendi.
  - `useWindowDimensions` ile 820px uzeri ekranlarda 920px maksimum icerik genisligi ve ortalama eklendi.
  - Ayar kaydetme, maliyet yontemi secimi ve mevcut hesaplama alanlari aynen korundu.
- `mobile/portal/src/screens/CustomerAgreementsScreen.tsx`
  - Anlasmali fiyat ekranina 820px uzeri cihazlarda 1180px maksimum genislik ve ortalama eklendi.
  - Tarih inputlari icin minimum genislik eklenerek dar/tablet kirilimlari daha tutarli hale getirildi.
  - Excel sablon paylasiminda `Sharing.isAvailableAsync()` false donerse artik cache path'i gostermek yerine dosya uygulama belgeleri altindaki `reports/` klasorune kopyalanir ve kullaniciya dosya adi soylenir.
  - Musteri arama/sayfalama, urun arama, anlasma kaydetme/silme, Excel import ve mevcut fiyat mantigi degistirilmedi.

Kapsam notu:

- Bu tur sadece portal uygulamasinda pratik kullanim ve tablet duzeni duzeltmesi yapti.
- Musteri uygulamasinda yeni kod degisikligi yapilmadi.
- APK imza/parsing/kurulum problemi hala kullanici talimatiyla oncelik disi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `git diff --check -- mobile/portal/src/screens/SettingsScreen.tsx mobile/portal/src/screens/CustomerAgreementsScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-8ea70f4182dcee75ff8aa1bb4e85b679.hbc`; iOS bundle: `index-a4965509c67f20c834c5e61d641c7f54.hbc`.

Kalan risk:

- Gercek tablette Ayarlar ve Anlasmali Fiyatlar ekranlarinin yatay/dikey gorunumde dokunma ve form akisi test edilmelidir.
- Anlasmali fiyat Excel sablonu icin paylasim desteklenmeyen cihaz/emulator varyanti gercek cihazda dogrulanmalidir.

## 198. Portal ve musteri login ekranlarinda tablet ilk izlenim duzeni

Mobil hedefte uygulamanin ilk temas noktasi olan giris ekranlari tekrar incelendi. Iki uygulamada da marka dili, logo, mavi hero ve form karti vardi; ancak tabletlerde tek kolon olarak kalip genis ekrani yeterince profesyonel kullanmiyordu. Android/iOS tablet hedefi nedeniyle iki login ekrani da tablet icin iki kolonlu ve sinirli genislikli hale getirildi.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/LoginScreen.tsx`
  - 820px uzeri ekranlarda login icerigi 1080px maksimum genislikte ortalanir.
  - Tabletlerde hero ve form karti yan yana iki kolon olur.
  - Hero karti minimum yukseklik ve merkezleme ile webdeki operasyon paneli kalitesine daha yakin durur.
  - Personel giris is mantigi, hata kutusu, iconlu inputlar ve loading davranisi korunur.
- `mobile/b2b/src/screens/LoginScreen.tsx`
  - Musteri girisi icin ayni tablet iki kolon duzeni eklendi.
  - Marka, ozel fiyat/onceki alim/fatura pill'leri, hata kutusu ve giris davranisi korunur.

Kapsam notu:

- Sadece layout/responsive kalite iyilestirmesi yapildi; auth is mantigi degistirilmedi.
- Telefon ekranlarinda mevcut tek kolon davranisi korunur.
- APK imza/parsing/kurulum problemi hala kullanici talimatiyla oncelik disi.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal` + `mobile/b2b`: `git diff --check -- mobile/portal/src/screens/LoginScreen.tsx mobile/b2b/src/screens/LoginScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-51c6c068ac2ec87169e506c964c1b1b4.hbc`; iOS bundle: `index-8479b814aee734512f832c2ab7931b92.hbc`.
- `mobile/b2b`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-c61a75b74065b8b418e70533cad5e653.hbc`; iOS bundle: `index-cfd3bc6a0599da6f30a6aea155bd8367.hbc`.

Kalan risk:

- Gercek tabletlerde portal ve musteri login ekranlari yatay/dikey, klavye acikken ve uzun hata mesajlariyla gorulmelidir.
- Fiziksel APK kurulum/imza testi bu turun disinda kalmistir.

## 199. Portal siparis ve teklif detay ekranlarinda tablet/uzun metin duzeni

Mobil hedefte operasyonun en kritik detay ekranlari olan siparis detay ve teklif detay tekrar incelendi. Bu ekranlarda webdeki islevler zaten mobile tasinmisti; ancak tabletlerde icerik cok genis yayiliyor, uzun cari/urun kodlari ve urun adlari detay kartlarini sikistirabiliyor, teklif aksiyonlari da dikey dizilimle gereksiz yer kapliyordu.

Uygulanan duzeltmeler:

- `mobile/portal/src/screens/OrderDetailScreen.tsx`
  - 820px uzeri cihazlarda 1120px maksimum icerik genisligi ve ortalama eklendi.
  - Siparis numarasi, cari adi, cari kodu, urun adi, urun kodu ve red nedeni uzun metinlerde kontrollu satir/ellipsis davranisina alindi.
  - Tabletlerde onay/red aksiyonlari satir icinde wrap edebilen buton grid'ine yakin davranir; telefonlarda mevcut akisi korur.
  - Tumunu onayla, secili onayla, secili reddet, tumunu reddet, not ve kalem secimi is mantigi degistirilmedi.
- `mobile/portal/src/screens/QuoteDetailScreen.tsx`
  - 820px uzeri cihazlarda 1120px maksimum icerik genisligi ve ortalama eklendi.
  - Teklif numarasi, cari adi/kodu, admin notu ve urun kalemleri uzun metinlerde kontrollu hale getirildi.
  - Mikrodan guncelle, duzenle, siparise cevir, PDF indir ve onerili PDF indir aksiyonlari wrap edebilen tek bir action grid altinda toplandi.
  - Teklif onay/red, Mikro sync, PDF ve siparise cevirme is mantigi korunur.

Kapsam notu:

- Bu tur sadece portal uygulamasinda siparis/teklif detay kalitesi ve tablet kullanimi duzeltildi.
- Musteri uygulamasinda yeni kod degisikligi yapilmadi.
- APK imza/parsing/kurulum problemi kullanici talimatiyla hala oncelik disidir.

Dogrulama:

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warnings/failures yok.
- `mobile/portal`: `git diff --check -- mobile/portal/src/screens/OrderDetailScreen.tsx mobile/portal/src/screens/QuoteDetailScreen.tsx` basarili; yalniz mevcut LF/CRLF uyarilari var.
- `mobile/portal`: `npm.cmd exec -- expo export --platform all` sandbox disinda basarili. Android bundle: `index-a33088675de17c7a6d5c8fe6c50bba6d.hbc`; iOS bundle: `index-c12169bd911842f2ceb0f31657e05b0c.hbc`.

Kalan risk:

- Gercek tablet ve telefonda siparis/teklif detaylarinda uzun urun adlari, uzun cari unvanlari ve cok kalemli teklifler elle smoke test edilmelidir.
- Fiziksel APK kurulum/imza testi bu turun disinda kalmistir.

## 200. Portal Mobil1 Signal tasariminin gercek uygulamaya alinmasi

Kaynak tasarim:

- Dosya: `C:\Users\ucare\Downloads\Portal Mobil1 - Tasarim (Codex Teslim).html`
- Boyut: `1.088.043` bayt
- SHA-256: `F18112D5BA9D4B20569F03EF4C60421FCE165C4EBCAFC83BA2092FC248212E70`
- Referans: 78 ekran, 11 bolum, `1b / Signal / koyu` tasarim dili.
- Tipografi: Hanken Grotesk + IBM Plex Mono.
- Temel palet: `#071127`, `#0A1C39`, `#2F6FE0`, `#7AB0FF`, `#34D399`, `#FBBF24`, `#F87171`, `#B794FF`.

Bu tur, onceki mavi/acik hero tabanli portal UI'ini Signal referansina gecirirken webdeki buton, modal, veri ve is akisi paritesini koruma amaciyla yapildi. Bu bolum, ozellikle 198. bolumdeki eski iki kolonlu login kararini portal uygulamasi icin gecersiz kilar; portal login artik yeni Signal mobil referansini kullanir.

### Tasarim sistemi ve shell

- `mobile/portal/src/theme.ts` Signal koyu palet, Hanken/IBM font aileleri, daha sikisik spacing, radius ve shadow tokenlariyla yeniden kuruldu.
- `mobile/portal/App.tsx`, `AppNavigator.tsx` ve `PortalTabs.tsx` koyu status/navigation yapisi, yeni font yukleme ve Signal tab ritmine gecirildi.
- `mobile/portal/app.json` ve mevcut native Android resource renkleri koyu splash, koyu adaptif ikon zemini, acik status/navigation bar ikonlari ve klavye `resize` davranisina alindi.
- Eski Sora dependency'si ve kullanilmayan `expo-linear-gradient` native dependency'si kaldirildi.
- Fontlar paket kokunden degil yalniz kullanilan sekiz agirliktan; ikonlar paket kokunden degil yalniz Ionicons alt yolundan import edilir. Android export varlik sayisi 69'dan 27'ye, Hermes bundle yaklasik 8 MB'den 7,65 MB'ye indi.
- 57 portal ekraninda eski dolu mavi header karti kalibi kaldirildi; basliklar kompakt, zemine oturan Signal baslik yapisina cekildi. Ana KPI gibi gercek anlamda cerceveli yuzeyler korundu.

### Giris ve web calisma zamani

- Portal login, tasarimdaki merkezlenmis logo, `Bakircilar Portal`, `Operasyon & Saha Yonetimi`, koyu form, ikonlu input, sifre goster/gizle, sifre yardimi, temsilci yardimi ve telif/version satiriyla yeniden yazildi.
- 390x844 web viewport'ta gorsel ekran goruntusu, tasma, footer gorunurlugu ve sifre goster/gizle erisilebilirligi kontrol edildi.
- `expo-secure-store` webde native metot bekledigi icin portal sonsuz `Portal hazirlaniyor` ekraninda kalabiliyordu. `storage/kv.ts` ile native SecureStore, web localStorage adaptoru kuruldu; auth, push, dashboard tercihleri ve Ucarer seri gecmisi bu ortak katmana alindi.
- Auth bootstrap hata alsa dahi `finally` ile loading durumundan cikar. Expo native push listener/token kaydi webde calistirilmaz; web bildirim listesi backend polling ile calismaya devam eder.

### Kritik ekran ve islev paritesi

- Dashboard, Daha Fazla, teklif/siparis listeleri, musteri kartlari, e-fatura ve siparis takip ekranlari Signal yogunluk ve renk diline cekildi.
- Teklif olusturma:
  - Kontak secimi, sorumlu secimi ve dahil depolar gorunur.
  - Fiyat listesi/son satis/manuel fiyat, KDV, aciklama, depo dagilimi, guncel ve son giris kari korunur.
  - Webde olup mobilde eksik kalan stok ailesi yonlendirmesi eklendi: canli aile onerisi, istek siniri/cache, diger kalemleri aday dislama, degistir, miktari bol, fiyat ve satir ayarlarini tasima, mevcut/hedef kar karsilastirmali onay modal'i.
  - Tamamlayici urun onerileri korunur.
- Manuel siparis:
  - Musteri siparis no, depo, faturali/beyaz seri, rezerv, sorumluluk merkezi ve satir ayarlari korunur.
  - Kalemde depo dagilimi, birim/katsayi, KDV, guncel/son giris maliyeti ve iki bazli kar gorunur.
- Siparis takip:
  - Mobil endpointler gercek `/order-tracking/admin/...` route'larina duzeltildi.
  - Musteri/tedarikci/mail log sekmeleri, sync/mail, tedarikci `Iletildi`, satir veya tum kalan miktari kapatma ve teslim edilenden asagi inemeyen miktar revizyonu eklendi/korundu.
- E-fatura:
  - VKN, cari bakiyesi, prefix/tarih/cari filtreleri, sayfalama, toplu secim/indirme, coklu PDF yukleme sonucu, eslesme hatasi ve tekli PDF indirme/paylasma korunur.
- Ucarer depo:
  - Rapor/aile/siparis/min-max/haric/log gorunumleri, tedarikci siparisi, DSV transferi, maliyet/ana tedarikci/haric tutma islemleri korunur.
  - Tedarikci ve DSV taslaklari Merkez/Topca bazinda cihaz dosya alanina; web onizlemede localStorage'a yazilir. Uygulama arka plana alinirken bekleyen yazma flush edilir. Basarili operasyon yalniz ilgili satirlari temizler, hata alan tedarikciler taslakta kalir.
- Depo, sicak satis, vade, tedarikci maliyetleri, saha satis, katalog/vitrin, rapor ve sistem ekranlari erisilebilir portal route'larinda korunur; ortak Signal tema uygulanir.

### Kalici regresyon denetimi

`mobile/scripts/audit-mobile-parity.mjs` yalniz route saymakla kalmaz; teklif, manuel siparis, siparis takip, e-fatura, Ucarer, depo, sicak satis, vade, tedarikci maliyeti ve bildirim ekranlarinda kritik ozellik marker'larini ve kritik API endpointlerini zorunlu tutar.

Son sonuc:

- Admin web route: 35
- Customer web route: 16
- Erisilebilir portal route: 64
- Erisilebilir customer route: 25
- Warning: 0
- Failure: 0

### Dogrulama

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/portal`: `npm.cmd run audit:parity` basarili; warning/failure yok.
- `mobile/portal`: `npm.cmd exec -- expo export --platform web` basarili; 1.308 modul, 21 asset, 3,85 MB web bundle.
- `mobile/portal`: `npm.cmd exec -- expo export --platform android` sandbox disinda basarili; 1.538 modul, 27 asset, `index-ee3eba6fe0062854d6fa0b86daf8f329.hbc` (7,65 MB).
- `git diff --check -- mobile/portal mobile/scripts mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` basarili; yalniz mevcut LF/CRLF uyarilari var.
- Tasarim QA icin acilan localhost sunucusu, tarayici sekmesi ve Metro/Node worker'lari test sonunda kapatildi.

### Bilincli olarak canlida tetiklenmeyenler

- Mikro'ya yazan teklif/siparis/irsaliye/tedarikci siparisi/maliyet operasyonlari bu turda canlida tetiklenmedi. Kaynak ve payload paritesi kontrol edildi; gercek yazma testi ayrica kontrollu test verisi ve kullanici onayi gerektirir.
- Dosya/kamera secimi, konum izni, native push izin penceresi, PDF/Excel paylasimi ve uzun formlarda klavye davranisi fiziksel Android cihazda smoke test ister.
- Hermes Android bundle kanitlandi; fiziksel telefondaki eski `paketin ayristirilmasinda sorun olustu` APK installer/imza problemi bu tasarim turunun disinda kalir ve yeni APK uretilirken ayrica ele alinmalidir.
