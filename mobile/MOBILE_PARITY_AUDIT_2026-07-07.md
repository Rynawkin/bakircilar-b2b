# Mobile Parity Audit - 2026-07-07

Kapsam: `mobile/b2b` musteri uygulamasi ve `mobile/portal` admin/personel uygulamasi. Hedef, webdeki admin ve musteri deneyimini mobilde Android/iOS telefon + tablet icin eksiksiz tasimak.

Bu dosya canli kod incelemesine gore yazildi; eski `mobile/FEATURE_PARITY.md` artik guncel kabul edilmemeli.

## Bu turda kapatilan net parite aciklari

1. Portal raporlarina `Aksiyon Radari` eklendi.
   - API: `mobile/portal/src/api/admin.ts` -> `getActionRadar()`
   - UI: `mobile/portal/src/screens/ReportsScreen.tsx`
   - Mobilde gosterilen sinyaller: teklif sagligi, terk sepet, eksik gorsel/katalog, saha ziyaret adaylari, paket onerileri, anomali KPI'lari.
   - Aksiyonlar: teklif detaya git, sepet raporuna filtreyle gec, urun aramaya git, cari detaya git.

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

## Hala eksik olan yuksek oncelikli portal/admin modulleri

Webde var, mobil portalda ekran/API paritesi henuz yok veya cok sinirli:

- `admin-products`: urun detay yonetimi, gorsel galeri, tamamlayici ayarlari, katalog kalitesi.
- `bundles`: paket olusturma/duzenleme, paket performans aksiyonlari.
- `customer-360`: temel mobil ekran eklendi; webdeki sekmeli desktop deneyimin birebir derinligi, tablo/export aksiyonlari ve tablet gorsel QA henuz tamamlanmadi.
- `field-sales`: temel mobil saha satis ekrani eklendi; webdeki teklif taslagi/kalem havuzu/yeni ziyaret carisi/fotograf-konum akislarinin tamamÄ± henuz mobilde birebir yok.
- `hot-sales`: sicak satis/arac stok/gun sonu akislarinin mobil paritesi yok.
- `warehouse`, `warehouse/image-issues`, `warehouse/retail`: depo kiosk, gorsel hata, perakende satis mobilde yok.
- `product-dimensions`: olcu/desi/kg/raf kodu mobilde yok.
- `stock-create`, `passive-stocks`: stok karti acma/pasif stok aktiflestirme mobilde yok.
- `supplier-costs`: tedarikci maliyet/fiyat teyit/ihale akislari mobilde yok.
- `operations`: operasyon paneli mobilde yok.
- `banners`, `category-images`, `collections`, `gift-campaigns`: vitrin yonetimi mobil portalda yok.

## Hala eksik olan rapor paritesi

Portal `ReportsScreen` bazi raporlari tek ekranda tasiyor ama web rapor merkezi daha genis. Mobilde eksik veya eksik derinlikte olanlar:

- `customer-engagement`: temel rapor ve temas aksiyonlari mobil portala eklendi; webdeki Excel export, temsilci kirilimi ve genis tablo kolonlarinin tamamı henuz mobilde birebir yok.
- `customer-recovery` ve `customer-recovery/actions`: geri kazanma ve aksiyon merkezi mobilde yok.
- `field-sales-visits`: saha ziyaret raporu mobilde yok.
- `price-family-costs`, `price-families`, `product-families`, `family-management`: aile/maliyet raporlari mobilde yok veya sadece tamamlayici kisim var.
- `ucarer-depo`, `ucarer-minmax-exclusions`: Ucarer depo/minmax operasyonlari mobilde yok.
- `demand-pattern`, `barter-radar`, `sticky-discounts`, `category-churn`, `category-opportunity`: yeni karar destek raporlari mobilde yok.
- `toplu-audit`, `staff-activity`: audit/personel performans derinligi mobilde yok.

## Hala eksik olan vade paritesi

Mobil portalda `VadeScreen` ve `VadeCustomerScreen` var, ancak webdeki yeni vade genislemesi daha buyuk:

- `/vade/dashboard` paneli mobilde ayri grafik/KPI paneli olarak yok.
- `/vade/analytics` ve `/vade/management` mobilde yok.
- `/vade/calendar`, `/vade/notes`, `/vade/assignments`, `/vade/import` mobilde yok veya ana vade ekranina gomulu degil.
- Vade Excel import mobilde gerekli olmayabilir, ama webdeki operasyonel islev olarak parite matrisinde karar verilmesi gerekir.

## Hala eksik olan musteri uygulamasi modulleri

Bu turda fatura eklendi; kalan musteri web parite aciklari:

- `collections/[id]`: aktif koleksiyon listesi ve detay deneyimi mobilde eklendi; webdeki grid yogunlugu ve gorsel QA ayrica yapilmali.
- `new-categories`: hic alinmayan/yeni kategori kesfi mobilde yok.
- Ana sayfa vitrin zenginligi web kadar genis degil: banner, koleksiyon, GWP, kategori kesfi ve kampanya bloklari tek tek karsilastirilmali.
- Urun detayinda coklu galeri ve paket icerigi mobilde eklendi; fiyat guven karti, hediye/GWP ve webdeki tum fiyat vurgulari birebir dogrulanmali.
- Sepette webdeki GWP/hediye secimi, tamamlayici oneriler ve fiyat guven kontrolleri mobilde birebir test edilmeli.
- Bildirim tercihleri mobilde native push temeli var; webdeki kategori bazli tercih UI'i musteri mobilinde sinirli.

## Teknik kalite / dogrulama eksikleri

- Android/iOS/tablet gorsel QA henuz yapilmadi. En az uc viewport gerekir: kucuk telefon, buyuk telefon, tablet.
- Mobilde webdeki yeni role/scope kurallari icin otomatik test yok.
- Portal ve b2b uygulamalarinda ortak tasarim primitive'leri sinirli; yeni ekranlar ayni Sora ve renk sistemini kullansa da tekrar eden kart/filter/action pattern'leri ortaklastirilmeli.
- Offline/timeout/error states tum yeni ekranlarda standart hale getirilmeli.
- Aksiyon Radari mobilde ilk surum: direkt islem butonlari var, ancak web tarafindaki gibi action-state workflow henuz yok.

## Son dogrulama

- `mobile/portal`: `npm.cmd exec tsc -- --noEmit` basarili.
- `mobile/b2b`: `npm.cmd exec tsc -- --noEmit` basarili.
