# Claude Sonrasi Buyuk Degisiklikler - Eksik/Risk Kontrol Raporu

Tarih: 2026-07-07

Bu rapor, son buyuk degisiklik dalgasinda eklenen vade, cari aktivite, aksiyon radari, bildirim, audit, paket, gorsel, sepet ve mobil parite isleri uzerinden yapilan kod taramasina gore hazirlandi. Kod tabaninda tamamlanmis gorunen alanlar ile, operasyonel olarak hala takip edilmesi gereken bosluklar ayrilmistir.

## Bu turda kapatilan somut problemler

1. Cari Aktivite / Temas Takibi tablosunda uzun alanlar satir yuksekligini bozuyordu.
   - Tablo artik sabit yukseklikte scroll alaninda kaliyor.
   - Uzun cari, oneri, neden, temsilci ve son hatirlatma alanlari hucre icinde kaydirilabiliyor.
   - Aksiyon kolonunun iki butonu ayni satirda kalacak sekilde genisligi artirildi.

2. Tarayici bildirimi acma akisi env eksiginde calismayabiliyordu.
   - Backend, `WEB_PUSH_VAPID_*` env anahtarlari yoksa VAPID anahtarini ilk kullanimda uretip `Settings` tablosunda saklayacak.
   - Eski/yanlis public key ile kalmis tarayici aboneligi varsa frontend eski aboneligi iptal edip yeni key ile tekrar abone oluyor.
   - Service worker payload gelirse onu kullanacak, yoksa genel bildirim gosterecek.

3. Musteri Sepetleri raporu satis temsilcileri icin kapaliydi.
   - `SALES_REP` rolune `reports:customer-carts` izni eklendi.
   - Backend servis zaten satis temsilcilerini kendi sektor/musteri kapsaminda filtreliyor.
   - Sepet detayini acma ve sepeti temizleme aksiyonu ayni kapsam kontrolunden geciyor.

## P0 - Canliya almadan once zorunlu kontrol

1. Web push migration uygulanmali.
   - `Settings` tablosuna `webPushVapidPublicKey`, `webPushVapidPrivateKey`, `webPushVapidSubject` kolonlari eklenmezse production backend yeni kodda public key endpointinde hata verir.
   - Idempotent SQL: `backend/tmp_20260707_web_push_vapid_settings.sql`.

2. Production'da push testi yapilmali.
   - Bir admin kullanicida "Tarayici bildirimlerini ac" tiklanmali.
   - Backend'de `WebPushSubscription` satiri olustugu dogrulanmali.
   - Test bildirimi veya gercek bildirim ile tarayici notification event'i dogrulanmali.
   - Not: Mevcut server tarafli web push gonderimi payload sifrelemesi yapmiyor; tarayici genel "Yeni bildiriminiz var" bildirimi alir. Baslik/govdeyi OS bildiriminde birebir gostermek icin sonraki fazda standart `web-push` kutuphanesi veya Web Push encryption uygulamasi gerekir.

3. Dashboard donma problemi icin canli log izleme surmeli.
   - Onceki cozumler: dashboard cache, Mikro pool artisi, quoteSync Invalid Date fix'i ve log temizligi.
   - Vade endpointleri Postgres agirlikli oldugu icin dashboard donmasinin birincil sebebi Mikro pool doygunlugu olarak gorunmustu.
   - Yine de production deploy sonrasi `/dashboard` 15-20 eszamanli istek ve PM2 log kontrolu tekrar yapilmali.

## P1 - Islevsel olarak tamamlanmis ama derinlestirilmesi gerekenler

1. Aksiyon Radari aksiyon merkezine donustu ama inline operasyonlar sinirli.
   - Mevcut sayfa ilgili ekrana link veriyor: teklif, sepet, urun/gorsel, saha satis.
   - Eksik: satir icinden direkt "gorsel yukle", "sepete not dus", "temsilciye gorev ata", "aksiyonu kapat" gibi stateful workflow yok.
   - Backend list limitleri 50; rapor cok veri uretiyor ama UI her kolonun aksiyon derinligi ayni degil.

2. Cari Aktivite aksiyon merkezi temel seviyede.
   - Temas/not, hatirlatildi, takip tarihi var.
   - Eksik: arama sonucu standardi, sonuc tipleri icin KPI, otomatik gorev olusturma, musteri 360 ile ayni sayfada tam timeline birlesimi.

3. Musteri sepetleri raporu temsilciye acildi ama aksiyon seti sadece "detay/temizle".
   - Eksik: kalem bazli silme, temsilci notu, "teklife cevir", "musteriye bildirim gonder", "sonraki takip tarihi" aksiyonlari.
   - Temizleme aksiyonu guclu bir islem; audit var ama kullaniciya sebep/not alani yok.

4. Bildirim tercihleri kategori bazli.
   - Kullanici kategori ac/kapat yapabiliyor.
   - Eksik: "sadece kendi sektor/musterim" kuralinin her bildirim ureten servis icin merkezi test matrisi.
   - Eksik: per-event granularity (ornegin sadece sepet terk acik, paket kapali gibi kategori alti tercih).

5. Vade modulu Excel-authoritative modda.
   - Bu bilincli karar: Mikro "Vade Farki Durum Raporu" 046750 birebir dogrulanana kadar Excel import dogru kaynak.
   - Eksik/deferred: Mikro 046750 rapor mantigini FIFO open-item vade eslestirmesiyle birebir reproduce edip gece otomatik cekmeye gecmek.
   - `vadeSync` cron su an bilerek pasif tutulmali.

6. Vade not migrasyonu tamamlandi ama eski notlarda yazar bilgisi eksik olabilir.
   - Supabase'ten gelen eski notlarin bir kisminda authorId null oldugu icin personel performans raporlarinda gecmis emek tam dagilmayabilir.
   - Yeni girilen notlar dogru author ile birikir.

7. Paket performansi ilk surum.
   - Siparis olusurken paketler component satirlarina patlatildigi icin Mikro ve B2B karlilik dogruya yaklasti.
   - Paket performans raporu `lineNote` icindeki `SET:` izine dayaniyor; eski veya manuel bozulan satirlarda paket adi yakalanmayabilir.

8. Gorsel kalite workflow'u parcali.
   - Urun galerisi, resim hata talepleri ve aksiyon radari linkleri var.
   - Eksik: gorsel kalite puani, boyut/blur/arka plan kalite kontrolu, toplu gorsel yukleme veya "bu urunu duzelttim" kapanis durumu.

9. Mobil parite hala tamamen bitmis degil.
   - `mobile/MOBILE_PARITY_AUDIT_2026-07-07.md` dosyasinda acik kalanlar yaziyor.
   - Temel Cari 360, Aksiyon Radari, Cari Aktivite, Saha Satis ve musteri koleksiyonlari eklenmis.
   - Eksik: webdeki tum tablo/export/aksiyon derinligi, tablet gorsel QA, Vade dashboard/analytics/management derin paritesi.

10. Audit log standardi basladi ama tum kritik islemlerde ayni seviyede degil.
   - Sepet temizleme gibi yeni aksiyonlarda audit var.
   - Eksik: butun Mikro yazan, fiyat/maliyet degistiren, yetki degistiren, bildirim tercihleri degistiren aksiyonlar icin zorunlu audit checklist.

11. Background job async mimarisi ertelendi.
   - Kullanici karariyla bekletildi.
   - Mikro agir isler, uzun raporlar, sync ve push fan-out icin kuyruk/worker mimarisi hala ana teknik borc.

## P2 - Kalite ve kullanis iyilestirme adaylari

1. Arama normalizasyonu ortak hale getirilmeli ama regresyon testi sart.
   - Turkce/ingilizce karakter ve buyuk/kucuk harf duyarsiz arama bircok yerde duzeltildi/duzeltiliyor.
   - Eksik: tum cari/urun picker'lari icin tek normalize helper + ekran bazli ozel kolaylastiricilarin kaybolmadigini test eden liste.

2. Faturalarda VKN alani kaynak veriye bagli kontrol edilmeli.
   - UI alani eklenmis olsa bile bos gorunuyorsa sorun genelde e-fatura/Mikro kaynak mapping veya import verisidir.
   - Canli Mikro/e-fatura kaynagindan vergi no kolonunun hangi alandan geldigi tekrar dogrulanmali.

3. Saha satis mobil/web urun karti tasmasi tekrar QA ister.
   - Uzun urun adlari icin line clamp/scroll/cozumleri var ama gercek cihazda kucuk ekran testi sart.
   - Personelin "tek tek tiklamak yoruyor" sikayeti icin liste yogunlugu ve hizli ekleme akisi ayrica test edilmeli.

4. Tamamlayici urun motoru daginik algilaniyor.
   - Musteri tarafinda farkli oneriler farkli sekmelerde/alanlarda gorunuyor.
   - Eksik: tek bir "neden onerildi" aciklamasi, urun gramaj/detay/spec karisikligini azaltan veri temizligi ve onerileri tek karar modelinde birlestirme.

5. Action Radar scope helper merkezi hale getirilmeli.
   - Mevcut servis SALES_REP icin sektor filtresi uyguluyor.
   - Yeni eklenecek her radar bolumunun ayni helper'i kullanmasi zorunlu olmali; aksi halde tekrar "alakasiz cari" riski dogar.

## Teknik hijyen notlari

1. `backend/src/prisma/schema.prisma` stale dosya olarak duruyor.
   - Aktif schema `backend/prisma/schema.prisma`.
   - Stale dosya hala modified gorunuyor; yeni gelistirmede yanlis dosyaya edit riski var.

2. Repo kokunde cok sayida untracked analiz/debug/zip dosyasi var.
   - Kod calismasina engel degil.
   - Commit yaparken sadece ilgili dosyalar secilmeli.

3. Next build uyari veriyor.
   - Birden fazla lockfile nedeniyle workspace root uyarisi var.
   - Build basarili ama `next.config.js` icinde `outputFileTracingRoot` ile susturulabilir.

4. Browserslist verisi eski.
   - Build basarili ama `caniuse-lite` 7 ay eski uyarisi var.
   - Kritik degil; planli dependency bakiminda guncellenebilir.
