# Round 4 Test Planı (2026-07-04)

Bu tur SADECE yeni görünümde (Vitrin/yeni tema) uygulandı; klasik tema değiştirilmedi.
Migration: `backend/tmp_round4.sql` (MinMaxExclusion tablosu + ProductFamilyItem.unitFactorOverride +
Settings.cronOverrides + CartItem.quantity→float/selectedUnit). Deploy'da uygulanmalı.
Sıra: zararsızlar önce, Mikro'ya YAZAN testler ⚠️. Vercel'i alınca **Ctrl+F5**.

## A. Raporlar / Dışlamalar (marj raporu)
1. Raporlar Merkezi → **"Kar Marjı Analizi"** kartı artık **/reports/margin-compliance** açıyor (eskiden profit-analysis açıyordu). Ayrı **"Ürün Kar Dağılımı"** kartı profit-analysis'i hâlâ açıyor. Yeni **"Aile Yönetimi"** kartı var.
2. Marj raporu → **🚫 Dışlamalar** → her iki sekmede (Marj / Genel) input'a ürün adı yazınca **DB'den öneri listesi** düşüyor (marka için marka+ürün sayısı, ürün için kod+ad, cari için kod+isim). Serbest metin de yazılabiliyor.
3. **Genel Dışlamalar** listesinde artık kodların yanında **isim** görünüyor (ürün adı / cari ismi = resolvedLabel).

## B. Uçarer MinMax v2 önizleme
1. **SIPARIS/cold-start kaldırıldı**: satışı olmayan ama açık siparişi olan ürünler artık min-max önerisi almıyor (mor "Sipariş-bazlı" rozeti yok). Kullanıcı isteğiydi (geldi-geçti stok yanılgısı).
2. **Evrak** kolonu: pencerede kaç farklı satış evrağında geçtiği. Az evrak = geldi-geçti şüphesi. Kolon başlığından sıralanabiliyor.
3. **Kolon başlıklarından sıralama** (Stok/Ürün/Günlük Satış/Efektif Gün/Evrak/Min/Max/Fark). **Fark %** sıralaması artık **yönlü** (en çok artan ↔ en çok azalan), mutlak değere göre değil.
4. Hızlı filtreler: Artanlar / Azalanlar / Yeni tanımlananlar + mevcut Değişenler / Sadece sicilsiz.
5. **Sadece sicilsiz** artık gerçekten sicilsiz satırları getiriyor (önceden "Değişenler" filtresiyle AND'lenip çoğunu gizliyordu — düzeltildi).
6. **Satış detayı** butonu satırdan açılıyor (mevcut TOPLU işaretleme modalı; MinMax panelinin üstünde).
7. **Seçilenleri hesaplama dışı bırak**: satır(lar)ı seç → onayla → gri "Hariç (kullanıcı)" olur, Mikro yazmaya girmez. **Hariç tutulanlar (N)** butonundan liste + geri açma.

## C. Uçarer sipariş akışı
1. Tedarikçi sipariş onay modalı: cariler **açık geliyor**, modal **büyük**, her cari başlığında **TL toplam**.
2. **Siparişleri Oluştur**: DSV'ye çevrilebilir ama çevrilmemiş satır varsa **onay adımı** ("X satırda DSV önerisi var, çevirmeden devam edilsin mi?").
3. Modal içinde koliye yuvarla + koli içi tanımla mevcut.
4. ⚠️ **KOLİ YÖNÜ DÜZELTMESİ**: ana birimi zaten KOLİ olan (pozitif katsayı) üründe **artık yanlış yukarı yuvarlama YOK**; onun yerine "Ana birim koli — içi X" bilgi rozeti. Koli-içi bilgisi artık **her iki yönde** görünüyor.
5. ⚠️ **Koli içi düzenle (✎)**: "(koli içi X)" yanındaki kalem ikonu → mevcut değerle modal. **KRİTİK**: kaydederken mevcut katsayının **işareti korunuyor** (pozitif katsayılı üründe artık yanlışlıkla negatife çevirmiyor). Mikro'da katsayıyı kontrol et.
6. **Taslak devam**: modalı yarım bırakıp sayfadan çıkınca, geri dönünce "Devam eden sipariş taslağı var" banner'ı → kaldığın yerden devam / sil.

## D. Aile Yönetimi (YENİ rapor: /reports/family-management)
1. **Aile Önerileri** sekmesi: ailesiz+hareketli ürünlere en uygun aile önerisi. **KALİTE DÜZELTMESİ**: artık kategori aynı olmalı + gramaj/ölçü/oz/adet-içi/ürün-tipi uyumlu olmalı (400gr≠500gr, peçete≠havlu, dispenser≠z-havlu, 1500gr≠250gr artık önerilmiyor). Tek tuş "Aileye Ekle".
2. **Yeni Aile Adayları** sekmesi: adayı olmayan ürünleri aynı kategoride kümeleyip yeni aile önerir. Ad düzenlenebilir, üye seçilir, "Aile Oluştur".
3. **Şüpheli Üyeler** sekmesi: mevcut ailelerde yanlış görünen üyeler + neden. "Aileden Çıkar".

## E. Stok Aileleri → Birim Uyumsuz Üyeler (yeni sekme)
1. Aynı ailede farklı birimli üyeler listeleniyor; **KL vs KOLİ gibi eşanlamlılar artık uyumsuz sayılmıyor** (yanlış uyarı düzeltildi).
2. Gerçekten uyumsuz üyede **"Katsayı Eşle"**: "1 {ürün ana birimi} = X {baskın birim}" → kaydet. Katsayı aile toplamlarında ve önerilerde kullanılıyor.

## F. TOPLU Denetim
1. Varsayılan olarak **sadece "topludan çıkar önerili"** (ritmik) gruplar (filtre değiştirilebilir).
2. **TOPLU Adayları** sekmesi: TOPLU işaretlenmemiş ama ani sıçrama (spike) gösteren satışlar. ⚠️ Bir grubu **Topluya Al** → onay → Mikro'da işaretlenir (mevcut markUcarerSalesLineAsToplu). Spike mantığı: ürünün medyan evrak miktarının katı + eşik.

## G. Borç-Mal Takası (iki yönlü)
1. **Müşteriler (bize borçlu)** sekmesi + **Tedarikçiler (biz borçluyuz)** sekmesi.
2. **Bakiyeler** artık müşteri anasayfasının kullandığı **aynı kaynaktan** (VadeBalance/vade aging) — önceki yanlış bakiye + "sadece 3 cari" sorunu giderildi. Aday seti artık recency-sıralı + üst sınır 1500 + kesildiyse "truncated" uyarısı.
3. Rakamları anasayfadaki müşteri bakiyeleriyle 2-3 cari üzerinde karşılaştır.

## H. Yapışkan İskonto (yeniden yazıldı — prim erimesi)
1. Artık **listenin ÜZERİNDE** satılan ve son-satış kuralıyla müşterinin **gerçekten gördüğü** fiyatları listeliyor (cart-pricing useLastPrices + guard birebir replike; müşterinin görmediği satır listelenmez).
2. Kolonlar: satış anı liste fiyatı, güncel liste, Prim% (satış anı), Prim% (bugün), **Erime**, kritik rozeti (prim ≤%10 "erimek üzere"). Zam geldikçe primin nasıl eridiğini gösteriyor.
3. WHITE_ONLY müşteride beyaz liste, diğerlerinde faturalı liste baz alınıyor (cart ile tutarlı). 2-3 cari elle doğrula.

## I. Ayarlar → Tetiklenecek İşlemler
1. Tüm zamanlanmış işler listesi (13 iş): ad, zamanlama (cron), son çalışma (OK/HATA/**ATLANDI**), aksiyonlar.
2. **Şimdi Çalıştır** (fire-and-forget), **cron düzenle** (preset veya elle) + **Kaydet**, **Varsayılana Dön**. Değişiklik anında uygulanır (restart gerekmez).
3. NOT (regresyon önlendi): ENABLE_CRON kapalı olsa bile e-fatura otomatik import kendi flag'iyle çalışmaya devam eder. Zaten çalışan bir iş "Şimdi Çalıştır" ile tetiklenirse "ATLANDI" yazar (yanıltıcı "OK" değil).

## J. Müşteri mobil (tarayıcı) + çift yönlü birim
1. **Ürün kartı** telefonda: adet stepper + birim seçimi + Sepete Ekle artık tam kullanılabilir (170px kartta taşma yok).
2. **Sepet**: satırlar yatay kaymadan sığıyor; tamamlayıcı öneriler mobilde **açılır-kapanır** (Siparişi Tamamla'yı aşağı itmiyor); **sabit alt bar**da toplam + Siparişi Tamamla.
3. **Hamburger menü** (müşteri + admin) kendi içinde kayıyor; arka sayfa kilitleniyor. Admin menüsü artık 100dvh (URL çubuğu açıkken alttaki öğe gizlenmiyor).
4. ⚠️ **ÇİFT YÖNLÜ BİRİM** (kritik): ana birimi büyük olan üründe (ör. ana KOLİ, 2. birim PAKET, 1 KOLİ = f PAKET) müşteri artık **PAKET seçebiliyor**; birim fiyat = ana fiyat / f; girdiği PAKET adedi kesirli KOLİ'ye çevrilip sepete gidiyor. **KRİTİK DÜZELTME**: kesirli miktar artık cart-pricing'de tam sayıya kırpılmıyor (10 PAKET = 0,5 KOLİ sepetten silinmiyordu — düzeltildi). Küçük deneme siparişiyle: PAKET seç → sepette doğru fiyat/miktar → Mikro satır açıklamasında "10 PAKET" notu.
5. Mevcut ters yön (2. birim daha büyük, KOLİ) davranışı korundu.
6. **Admin viewport**: admin sayfaları mobilde artık zoom'lu açılmıyor (initialScale 1). Teklif ekranı mobilde kart-liste + sabit alt bar (masaüstü tablo md+); tüm kontroller (miktar, birim, fiyat kaynağı, manuel fiyat/marj, KDV, sil, aile Değiştir/Böl, son teklif/sipariş geçmişi) mobilde erişilebilir.

## Kontrol edilen inceleme bulguları
Bu tur 14 doğrulanmış bulgu düzeltildi (1 kritik kesirli-miktar kırpma dahil). 4 bulgu çürütüldü (gerçek değildi). Detay: iç inceleme.

## Geri dönüş
Henüz PUSH/DEPLOY yapılmadı. Sunucuda deploy edilirse geri dönüş: `git checkout --detach c078192` + build + restart. tmp_round4.sql additive (geri alma gerekmez). Endeksleme/INSERT/çift-birim özellikleri ayara/onaya/müşteri seçimine bağlı.
