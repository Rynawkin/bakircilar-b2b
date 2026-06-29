<!-- AUTO: roottaki sirket brieflerinden damitildi (2026-06-29). Sir/PII/anlik sayi YOK. Guncel sayilar araclardan gelir. -->

Bu doküman asistanın KALICI şirket bilgisidir. Güncel sayılar (stok/fiyat/maliyet/cari/vade) ARAÇLARDAN gelir; buradaki bilgiler yapısal/operasyoneldir.

---

# Bakırcılar B2B — Şirket Profili (Kalıcı Bilgi)

## Şirket & İş Modeli

- Bakırcılar (Sakarya merkezli), **üretici değildir**; temizlik, kağıt, ambalaj, kimyasal ve gıda-sarf malzemeleri alanında geniş ürün gamlı **toptan/B2B satış ve tedarik şirketidir**. Gücü üretimden değil, satınalma/tedarikçi yönetimi ve stok bulundurmadan gelir.
- Ana iş modeli: kurumsal son kullanıcıların düzenli sarf ihtiyacını geniş **"sepet"** mantığıyla karşılamak. Değer tek ürün karında değil, müşterinin düzenli sarf sepetine hakim olmaktadır.
- Müşteri kitlesi tek tip değildir; her biri ayrı fiyat/risk/kanal mantığı gerektirir:
  - **Kurumsal son kullanıcı** (ana kanal — düzenli sarf alan işletmeler)
  - **Meslektaş / küçük satıcı / toptan** (bizden alıp satan)
  - **Saha ziyaret carileri**
  - **Sıcak satış küçük işletmeleri**
- Klasik üretici-bayi/distribütör modeli **uygulanmaz**. Meslektaş kanalı için uygun yapı: özel toptan fiyat seviyesi, minimum paket/palet alım, seçili üründe ön sipariş, fırsat stok paylaşımı, kısa vade, "stok kadar satış".
- B2B platformu başlangıçta firmanın **fazla (atıl) stoklarını** seçili müşterilere özel fiyatlarla online satmak için kuruldu; zamanla teklif/sipariş, saha satış, sıcak satış, depo kiosk, e-fatura, cari 360, vade takip, tedarikçi maliyetleri, stok kartı açma, ürün ölçüleri ve karar destek raporlarını kapsayan geniş bir operasyon platformuna dönüştü.

### Ana Ürün Aileleri (Kategori Rolleriyle)
- **Kapı açıcı / hacim:** Kağıt Havlu, Tuvalet Kağıdı, Karton Bardak, Çay/Kahve/Gıda, Ambalaj Sarf, Çöp Poşeti, Eldiven/Kullan-at, Atlet/Market Poşeti. (Yüksek müşteri teması, düşük/nötr marj; müşteriyi getiren ürünler.)
- **Karlılık:** Dezenfektanlar, Temizlik Bezi/Süngerleri, El Sabunları, hırdavat, etiket. (Düşük hacim, yüksek marj.)
- **Sepet:** Koli bandı, fırçalar, ofis, mop. (Orta hacim, sepeti tamamlayan kategoriler.)

---

## Mimari (B2B + Mikro)

- **Tek doğru kaynak (single source of truth): Mikro ERP V16 (MSSQL).** Stok kartları, cari kartlar, satış/sipariş/fatura hareketleri, fiyat listeleri, maliyetler ve depo miktarlarının "doğru" hali Mikro'dadır.
- **B2B = Mikro ile çift yönlü çalışan operasyon/web katmanıdır.** Mikro'yu okur ve belirli akışlarda Mikro'ya yazar (sipariş, fiyat, maliyet, stok kartı, cari kartı, irsaliye, sıcak satış fişi, depolar arası sevk).
- **B2B PostgreSQL (Prisma)**, Mikro'da olmayan modern uygulama verisini (yetki/rol, sepet, teklif, rapor notları, fiyat teyit, saha/sıcak satış, aktivite sinyalleri) ve performans için cache'lenmiş rapor/ürün özetlerini tutar.
- **Mikro'nun API'si yoktur**; tüm entegrasyon doğrudan MSSQL sorgularıyla yapılır. Mikro tarafı ilke olarak okuma ağırlıklıdır; yazma yüksek risklidir.
- **Katman akışı:** Frontend (Next.js / React / Tailwind / Zustand) → Backend (Node / Express / TypeScript) → B2B DB (PostgreSQL + Prisma) **+** Mikro (MSSQL).

### Veri Kaynağı Eşleşmesi (Mikro tabloları)
| Veri | Mikro kaynağı | B2B'deki rol |
|---|---|---|
| Stok kartları | `STOKLAR` | Product cache; fiyat/maliyet/stok görünümü |
| Stok hareketleri / satış geçmişi | `STOK_HAREKETLERI` | Raporlar, min-max, karlılık, top-products |
| Cari kartları | `CARI_HESAPLAR` | Müşteri listesi, sektör/grup/temsilci, bakiye/vade |
| Siparişler | `SIPARISLER` + B2B `Order` | Siteden/tekliften sipariş, açık sipariş takip |
| Teklifler | B2B `Quote` + Mikro teklif/sipariş referansları | Teklif girme, siparişe çevirme |
| Fiyat listeleri | Mikro fiyat listeleri + B2B kuralları | Müşteri fiyat görünümü |

### Senkronizasyon (cron mantığı — saatler ortam ayarına bağlı)
- **Ürün sync:** Mikro'dan stok, kategori, fiyat, miktar, maliyet, görsel çekilir; PostgreSQL `Product`/`Category`/`Settings` ve cache alanları **UPSERT** ile güncellenir (`mikroCode` varsa update, yoksa insert). Fiyat ve fazla-stok hesapları bu sync sırasında yeniden üretilir.
- **Fiyat sync:** Mikro fiyat/maliyet değişimleri takip edilir.
- **Diğer cron'lar:** stok / cari / vade / teklif / marj / cari geri kazanım / tamamlayıcı / çok satan / sipariş takip / e-fatura; kiosk pending-order cache; product popularity cache.

### Mikro Kolon/Versiyon Uyarısı (kalıcı kural)
- Mikro tablo/kolon adları **versiyona ve firmaya göre değişir**. Örn: canlı ortamda `cari_sektor` **yok**, `cari_sektor_kodu` **var** (lookup join gerekebilir).
- Her yeni Mikro sorgusunda kolon varlığı `INFORMATION_SCHEMA.COLUMNS` ile doğrulanır.
- Tablo dump'ı alınmaz; **TOP/LIMIT + tarih aralığı + aggregate** kullanılır.

### Mikro Yazma Riski (kalıcı kural)
- Mikro'da INSERT/UPDATE/DELETE yüksek risklidir; tek satır hatası muhasebe/stok/sipariş verisini bozabilir.
- Evrak/satır güncellemelerinde **seri, sıra, satır no, GUID, depo, evrak tip/cins ve cari kod** filtreleri netleştirilmelidir.
- Mikro'ya her yazma (INSERT/UPDATE/DELETE) öncesi açık kullanıcı onayı şarttır; okuma serbesttir.

---

## Depolar & Kodlar

| Depo | Kod |
|---|---|
| Merkez | **1** |
| Topça | **6** |
| Sıcak / araç stok deposu | **11** |

- Başka depo kodları (örn. eski/şube depoları) Mikro'da bulunabilir; kullanılmadan önce canlı veriyle **doğrulanmalıdır**.
- **Toplam stok** genelde depo **1 + 6 + 11** toplamı olarak okunur (dahil edilecek depolar admin tarafından ayarlanabilir).
- Sıcak satış ve gün sonu nakit/sayım raporları depo **11** mantığına göre çalışır.

### Stok / Cari Kod Ayrımı
- Stok kodları ağırlıklı **"B"** ile başlar.
- **"120" ile başlayan kodlar STOK DEĞİL, CARİ kodudur.**

---

## Fiyat Listeleri & Faturalı / Beyaz / KDV

### Fiyat Listeleri (1–10)
- Liste **1–5 = Perakende** grubu, Liste **6–10 = Toptan / Faturalı** grubu (kodda görülen etiketleme; ticari isimler şirketçe doğrulanmalı).
- Müşteri bazlı `invoicedPriceListNo` ve `whitePriceListNo` alanları vardır; müşteride `priceVisibility` = faturalı / beyaz / ikisini de görme olabilir.

### Faturalı / Beyaz (KDV mantığı)
- **Faturalı (INVOICED):** Normal/tam KDV'li resmi satış. Faturalı fiyat, KDV **hariç** satış fiyatı olarak ele alınır.
- **Beyaz / faturasız (WHITE):** KDV **sıfırlanır**; beyaz fiyat maliyet üzerinden **"yarım KDV"** formülüyle hesaplanır (kavramsal: maliyet × (1 + ürün KDV'si / 2)).
- **Kritik evrak kuralı:** Bir sepette hem faturalı hem beyaz ürün varsa Mikro'ya **2 AYRI sipariş/evrak** yazılır — faturalı ürünler kendi KDV oranlarıyla, beyaz ürünler KDV=0 ile. Tek tür varsa tek evrak.

### Maliyet Eksenleri
- İki ayrı maliyet: **Güncel/stok maliyeti** (`currentCost` / `currentCostDate`) ve **Son giriş maliyeti** (`lastEntryCost` / `lastEntryPrice` / tarihi).
- **Maliyet T** = toptan/güncel (genelde KDV hariç); **Maliyet P** = perakende/beyaz (yarım-KDV ekleme kuralı olabilir).
- KDV dahil/hariç belirsizse satış evrakının vergi durumuna göre normalize edilir.
- Maliyet yöntemi admin tarafından seçilebilir: son giriş fiyatı, güncel maliyet veya dinamik/ağırlıklı ortalama.
- **Risk:** Eski/boş maliyet tarihi veya sıfır/boş maliyet, fiyat/marj önerisini güvenilmez yapar; ayrı risk sınıfıdır.

### Fiyatlandırma Önceliği (katman mantığı)
Birden fazla kaynak vardır; öncelik sıralaması:
1. Manuel teklif/sipariş fiyatı
2. Müşteri anlaşmalı fiyatı (ürün + müşteri + min miktar + geçerlilik tarihi)
3. Müşteri bazlı fiyat listesi (marka/kategoriye göre)
4. Ürün bazlı marj override
5. Kategori bazlı marj kuralı
6. Varsayılan marj / Mikro fiyat listesi
- Ek katmanlar: kampanya, fazla/indirimli stok fiyatı, son satış fiyatı.
- **Son satış fiyatı koruması:** "Güncel maliyetin üzerine X eklenmiş halinin altına düşmediği sürece son satış fiyatını kullan."
- **İndirimli/fazla stok kuralı:** İndirimli fiyat **yalnızca fazla miktara kadar** uygulanır; fazlayı aşan miktar normal fiyattan hesaplanır. Bu kural **"tüm ürünler" sayfasından sepete eklerken de** geçerli olmalıdır.

### Teklif "Blok" Kuralı (marj guard — %5)
- "Blok" bir indirim DEĞİLDİR; bir **marj uyarısıdır**. Teklif/sipariş kaleminde birim fiyat, **maliyetin %5 üstünün altına** düşerse (yani giriş maliyetine göre kâr ~%5'in altındaysa) o satır **"Blok"** olarak işaretlenir.
- Blok satır içeren teklif **admin onayına** gider (otomatik geçmez). Amaç maliyet altı / çok düşük marjlı satışı yakalamaktır.
- Marj/kâr hesabı **KDV hariç** ve **faturalı/beyaz** ayrımına duyarlı yapılır; satır içi analizde hem "giriş maliyetine göre" hem "güncel maliyete göre" kâr yüzdesi gösterilir.

### Birim / Katsayı Mantığı (kritik)
- `unit` (ana birim, zorunlu), `unit2` + `unit2Factor` (ikinci birim, opsiyonel).
- Koli/paket/adet dönüşümünde **fiyat ve miktar birlikte convert edilir**; Mikro'ya doğru miktar ve fiyatla gitmelidir.

---

## Müşteri Segmentleri

### Yapısal Segmentler (`User.customerType`)
- **BAYI / PERAKENDE / VIP / OZEL** → sırasıyla **A / B / C / D**. Her tip için farklı kar marjı; müşteri fiyat görünümü segmente göre değişir.

### Roller (`User.role`)
`HEAD_ADMIN`, `ADMIN`, `MANAGER`, `CUSTOMER`, `SALES_REP`, `DIVERSEY`, `DEPOCU`.
- Yetkiler `RolePermission` modeli ve `requirePermission` / `requireAnyPermission` middleware ile kontrol edilir. `HEAD_ADMIN` genelde tüm yetkilere sahiptir.
- Satış personeli müşteri **sektör kodu** (`sectorCode` / `assignedSectorCodes`) bazlı portföy görür. **Admin veya başkası işlem girse bile, portföy sahibi satıcı o müşterinin teklif/siparişini görebilmelidir.**

### Müşteri Kaydı
- Müşteriler **kendileri kayıt olamaz**. Her müşteri bir Mikro cari koduyla eşleşmek zorundadır; kaydı **admin açar** (müşteri tipi + Mikro cari kodu atanır). Böylece sipariş doğru cariye yazılır.

### Davranışsal Segmentler (kural bazlı; saha ile doğrulanmalı)
- **Yaşam döngüsü:** Aktif (30/90/180/365 günde satışı olan), Yeni (ilk satış tarihi dönem içinde), Tekrar sipariş veren (>1 sipariş), Tek sipariş/fırsat (dönemde 1 alım), Pasifleşen (geçmişte alıp son dönemde duran), Kaybedilen/düşen (belirgin ciro düşüşü — "Düşüş %X"), Geri kazanım adayı.
- **Davranış kovaları:** `FREQUENT` (sık), `PERIODIC` (dönemsel), `SPORADIC` (seyrek).
- **Ticari segmentler:** Meslektaş/küçük satıcı/toptan, Büyük sepet müşterisi, Kurumsal düzenli alıcı, B2B aktif müşteri, Tek kategori müşterisi, Yüksek ciro-düşük marj, Sıcak satış müşterisi.

### Meslektaş / Toptan Kanal Mantığı
- **Meslektaş aday skoru:** Müşterinin son kullanıcı değil, ürünü tekrar satan meslektaş/toptancı olma olasılığını gösteren heuristik skor (kesin değil). Yükselten sinyaller: yüksek **"tekrar satılabilir ürün payı"**, uygun kategori dağılımı, düşük/negatif marj, "Var" tekrar-alım sinyali.
- **"Tekrar satılabilir ürün payı":** Aldığı ürünlerin yeniden satılabilir standart sarf olma oranı; meslektaş/toptan ayrımında ana sinyal. Meslektaşa uygun: çöp poşeti, rulo/atlet poşet, palet streç, koli bandı, karton bardak, seçili kağıt, standart ambalaj sarfı. Uygun değil: düşük stoklu, maliyeti eski, müşteri-özel fiyatlı, yüksek hizmet/sunum gerektiren, kurumsal müşteriyle çakışan ürünler.
- **Kanal çakışma riski:** Bir müşteri hem meslektaş adayı hem kurumsal olabilir; "Kurumsal müşteriyle çakışma olabilir / Kontrollü" işaretiyle fiyat/indirim politikasının yanlış kanala sızması engellenir.
- **Sektör/grup notu:** Meslektaş/toptan ayrımı `cari_sektor_kodu` / grup kodlarından standardize edilmeli (henüz net değil).

---

## Teklif / Sipariş Akışı

### Teklif Akışı
- Admin/satışçı ürün havuzundan ürün ekler; **son satış fiyatları, son teklifler, karlılık ve kategori son alım** bilgileri kullanılır.
- Birim seçimi ve katsayı mantığı vardır (ana birim / ikinci birim Mikro'ya doğru miktar ve fiyatla gitmelidir).
- Bir kalemde kâr giriş maliyetine göre **%5'in altındaysa** satır "Blok" işaretlenir ve teklif **admin onayına** gider (bkz. Teklif "Blok" Kuralı).
- Teklif Mikro'ya yazılır ve sonradan siparişe çevrilebilir.

### Sipariş Akışı
- Müşteri veya admin/satışçı oluşturabilir; sipariş öncesi Mikro'dan anlık stok kontrolü yapılır.
- Faturalı/beyaz seri mantığı uygulanır; B2B siparişleri Mikro'ya `SIPARISLER` olarak yazılır.
- **Hassas alanlar:** seri no, sipariş satır no, teklif bağlantısı, CTRL+Q (evrak) açıklaması.

### Müşteri Paneli
- Müşteri login olur; **tüm ürünler, indirimli ürünler, anlaşmalı ürünler, daha önce aldıkları, sepet, siparişler, faturalar** ekranlarını görür.
- `hiddenFromCustomers` ile ürün gizleme uygulanır.
- **Arama, sadece mevcut sayfada değil tüm veri setinde** çalışmalıdır; performans için pagination/cache kullanılır.

### Stok Görünürlüğü (kalıcı kural)
- Stok görünürlüğü "eldeki stok" değildir:
  **net = depo stoku (`warehouseStocks`) + bekleyen satınalma (`pendingPurchaseOrders`) − bekleyen müşteri siparişi (`pendingCustomerOrdersByWarehouse`)**.
- **Fazla stok** = (dahil edilen depolardaki toplam stok) − (seçili periyottaki ortalama/toplam satış) + (bekleyen satınalma) − (bekleyen müşteri siparişi). Periyot (1/3/6 ay), dahil edilecek depolar ve minimum eşik admin tarafından ayarlanır.

---

## Vade / Tahsilat

- Vade bilgisi Mikro'dan sync edilir; **vade hatırlatma/bildirim (reminder) cron'ları** vardır.
- Alacak/vade/not/atama ve risk takibi yapılır.
- Sıcak satışta **açık hesap (vadeli) izni müşteri bazlıdır**.
- **E-fatura:** Dokümanlar yüklenir veya otomatik import edilebilir; müşteri kendi e-faturalarını/ekstrelerini panelden indirebilir.

---

## Stok / Fiyat Aileleri & Min-Max

- **Stok ailesi** ile **fiyat ailesi AYRI kavramlardır:**
  - **Stok ailesi:** Uçarer depoda benzer/ikame ürünlerin birbirinin satış/sipariş yönlendirme alternatifi olarak yönetilmesi.
  - **Fiyat ailesi:** Maliyet tarihi uyumu açısından birlikte izlenen ürün grubu. Aile içinde maliyet tarihleri uyumsuzsa aile **"sorunlu"** sayılır; zorunlu/standart maliyet-fiyat tutarlılığı için kullanılır.
- **Min-max / Uçarer depo karar mantığı:** Karar **satır bazlı değil, aile TOPLAMI** üzerinden verilir:
  **aile toplam stok + bekleyen satınalma − alınmış müşteri siparişi**, minimum toplam mantığıyla değerlendirilir.
- Aile içi ve aile dışı öneriler **aynı stok/sipariş mantığıyla tutarlı** olmalıdır.
- **TOPLU hariç tutma:** `TOPLU` sorumluluk merkezi min-max/aile hesaplarından **hariç tutulur** (yanlış girilen satırı "TOPLU yap" aksiyonu vardır).
- Bir **"min-max hariç" SKU havuzu** vardır (hariç tutulan ürünler).
- **Uçarer depo modülü** Mikro'ya maliyet/fiyat güncelleme ve tedarikçi siparişi oluşturma gibi hassas işlemler yapabilir.

### Stok Günü (devir) Kavramı
- Stok günü = mevcut stok / ortalama satış hızı. Yüksek stok günü = yatan/nakit bağlayan stok; düşük = stok yetersiz/satış kaçırma riski. "A sınıfı stok yetersiz" = yüksek hacimli ürünün stoksuz kalması.

### Tedarikçi Maliyetleri / Fiyat Teyit / İhale
- **Çoklu tedarikçi maliyet havuzu:** Aynı ürün için farklı tedarikçi maliyeti, termin, MOQ, döviz, geçerlilik (`SupplierProductCost.validUntil`), not ve dosya tutulur; ana tedarikçi + alternatif tedarikçi sayısı + alternatif maliyet izlenir.
- **Fiyat teyit talebi (satış → satınalma):** Durum yaşam döngüsü `REQUESTED → IN_REVIEW → SENT_TO_SALES → SALES_APPROVED → COMPLETED` (+ `CANCELLED`).
- **Kritik kural:** Fiyat teyidinde **"zaten güncel" (mark-current)** yanıtı Mikro maliyet tarihini **otomatik güncellemez**; yalnızca satışa bilgi gider.
- **İhale maliyet talepleri:** Dosya/kalem/termin/nakliye maliyeti detaylarıyla ayrı `REQUESTED` akışıyla yönetilir.
- **İş akışı bütünü:** Maliyet temizliği → fiyat güncelleme → satınalma talebi tek akış olarak ele alınmalıdır.
- **Stok açma:** B2B'den Mikro stok kartı açma (ana birim zorunlu, ambalaj/paket kodu zorunlu **değil**).

### Ölçü / Birim Standardı
- Streç/poşet gibi gruplarda mikron, ölçü (cm/mt), net kg/gr ürün adından parse edilir ama **yapısal alan standardı eksiktir**; koli/palet/tır kapasite bilgisi henüz tutulmaz.
- Eksik ürün ölçü/raf verisi depo ve **Yolpilot (lojistik)** verisini bozar.

---

## Saha / Sıcak Satış

### Saha Satış
- Telefon/web uyumlu, mobil odaklı modül. Satışçı müşteri yanında: ürün arama, fiyat/stok/maliyet görünümü, cari bakiye, son alım, ziyaret notları, fırsatlar, teklif motoru ve **yeni ziyaret carisi** açabilir.
- Satış personeli müşterinin sektör kodu bazında filtrelenir.

### Sıcak Satış
- **Araç stoğu + depo 11** mantığıyla yürür.
- Akışlar: faturasız sıcak satış, faturalı irsaliye, siparişten çekerek teslim, gün sonu nakit/sayım mutabakatı, araç stok kapanışı.
- **Nakit farkı (sayım − beklenen)** izlenir; araç sayım/nakit farkı ve Mikro evrak doğruluğu kritiktir.

### Depo Kiosk / Sipariş Takip
- `/order-tracking` ve `/warehouse` modülleri açık siparişleri takip eder.
- Akışlar: depo toplama, araç/şoför atama, irsaliye kesme, raf/reyon kodu, görsel hata talebi, toplama statüleri.
- **Şoför/araç bilgisi Mikro'da doğru alana yazılmalıdır.** Pending-order cache cron ile beslenir.

---

## Raporlar

### Karar Destek Raporları (önem sırasıyla yüksek olanlar)
- **Uçarer depo** (min-max / aile / depo yönlendirme) — çok yüksek
- **Cari geri kazanım** (pasif/düşen müşteri + tarihsel değer) — çok yüksek
- **Marj uyumluluk** (zarar/düşük marj alarmı) — çok yüksek
- **Maliyet güncelleme uyarıları** (eski maliyet riski) — çok yüksek
- **Tedarikçi maliyet havuzu** — çok yüksek
- Diğer: Top products, Top customers, Kategori alım kaybı (churn), Kategori fırsat, Tamamlayıcı ürün eksikleri (complement missing), Fiyat ailesi maliyet kontrolü (price-family-costs), Cari 360, müşteri sepetleri, personel/müşteri aktivite raporları, çok satan (top-products).

### Endpoint Anlamları (veri sözlüğü)
- `top-products`: `STOK_HAREKETLERI`'nden ürün bazlı miktar/ciro/maliyet agregasyonu.
- `products`: B2B `Product` cache (stok, maliyet, kategori, görsel, `hiddenFromCustomers`).
- `customer-activity`: B2B davranış olayları (arama, görüntüleme, sepete ekleme, aktif süre).
- `customer-recovery`: Hareketi düşen/duran cariler + aksiyon bilgisi.
- `historical-value`: 2020 sonrası satışları bugünkü değere çeviren geri kazanım raporu.
- `supplier-costs`: Çoklu tedarikçi maliyet havuzu, fırsat/risk bölümleri.
- `hot-sales`: Araç stoğu, sıcak satış işlemi, gün sonu nakit/stok raporu.
- `order-tracking`: Bekleyen müşteri/tedarikçi sipariş özetleri.
- `ucarer-depo`: Depo / min-max / aile karar-destek raporu.

### Brüt Kar Metriği (kalıcı tanım)
- **Brüt kar = Mikro satış tutarı − (güncel standart stok maliyeti × miktar).** Bu bir **yönetim analiz metriğidir, muhasebe kesin karı değildir** ve güncel stok maliyetine dayanır.
- Negatif marjlar çoğunlukla güncel maliyetin eski satış fiyatından yüksek olmasından veya meslektaş/toptan "stok bedeli" satışından kaynaklanır; tek başına "zarar" olarak yorumlanmamalıdır.

### Marj / Risk Sınıfları (kalıcı kategoriler)
"Negatif marj", "Çok düşük marj", "Eski/boş maliyet tarihi", "Sıfır/boş maliyet", "Stok yetersiz", "Yatan stok", "Satış var stok yok", "B2B görünürlük kontrolü".
**Önerilen hamle tipleri:** "Maliyet temizlenince saldırılacak", "Stok tamamlanınca saldırılacak", "Satıştan önce kontrol şart", "Veri temizliği şart", "Stok eritilecek".

### Müşteri Konsantrasyonu (kalıcı içgörü)
- Cironun ilk 10/20/50/100 müşteride toplanma payı izlenir.
- **Yapısal gerçek: Ciro liderliği ≠ kar liderliği.** Üst müşteriler düşük/negatif marjlı olabildiği için brüt kar genelde daha alt sıralardaki müşterilerden gelir.

### Çapraz Satış (cross-sell) Mantığı
- Müşterinin mevcut kategori seti, benzer müşterilerin tipik kategori setiyle karşılaştırılır; eksikler **"Eksik Olası Kategoriler"** olarak önerilir. Öneriler **kategori seviyesinde** (SKU değil), satıcı görüşmesiyle netleşir.
- **Birliktelik kuralları:** kağıt → dispenser/aparat; ambalaj sarf → koli bandı + palet streç; çöp poşeti → temizlik kimyasalı + kağıt; bardak/tabak/çatal → çay/kahve/gıda + ofis/gıda sarfı; kimyasal → eldiven; içecek → bardak/şeker. Fiyat kırmadan sepetle büyütülecek kategoriler: kağıt, temizlik, dispenser, ofis/gıda sarfı.

### Kayıp / Geri-Kazanım Aksiyon Terminolojisi
- Her kayıp cariye: "Kayıp Potansiyel" (geri kazanılabilir ciro), "Geçmiş Ciro", "Son Dönem Ciro", "Düşüş %", "Son Sipariş", "Kaybedilen Ana Kategori", "Açık Teklif/Sipariş Var mı", öncelik.
- **Öncelik kademeleri:** "Bugün aranacak" (son alım kesilmiş / yüksek potansiyel), "Bu hafta ziyaret", "Stok/fiyat kontrolünden sonra ara".
- **Risk → Aksiyon eşleşmeleri:** "Düşük marj" → marj kontrolü; "Düşüş %X" / "Son 90 gün alım yok" → geri kazanım araması/ziyareti; "Sepet darlığı" → sepet genişletme görüşmesi; "Müşteri kaybı yüksek" → satıcıya "ilk 20 kayıp cari + 20 çapraz satış fırsatı" hedefi.

### B2B Davranış Sinyali (kalıcı kullanım)
- Olay tipleri: `pageViews`, `productViews`, `cartAdds`, `cartRemoves`, `cartUpdates`, `searchCount`, `clickCount`, `activeSeconds`.
- En çok aranan/sepete eklenen ürünler satıcıya görev olur; arama karşılığı bulunamayan kelimeler **ürün adı temizliği** sinyalidir; açık sepetler/sepet terk müşteri temsilcisine takip listesidir.
- **Çok satan sıralaması canlı hesaplanmaz**; backend cache alanından gelir (`popularSalesValue` / product-popularity cache).

### Rapor Yorum Kuralları (kalıcı)
- Aynı kategoriden alım devam ediyorsa eski ürünü "fırsat" gösterme.
- Sezonluk/ihale müşterisini "kaybedilen müşteri" sanma.
- Stok miktarını sadece eldeki stok sanma (bekleyen sipariş ve satınalma dahil).
- Cari geri kazanım, ardışık ay çalışıp duran müşteriyi ayrı yakalamalı.
- Karlılık raporları faturalı/beyaz ve KDV ayrımlarına duyarlıdır.
- **Özel/sahte ürün satırları** ("Fiyat Farkı %X", "Ciro Primi", "Hizmet/Nakliye/Kargo Bedeli", "Teminat Mektubu Bedeli", "Avans", "DBS Hesabı", "Muhtelif Ambalaj ve Temizlik" vb.) **gerçek ürün değildir**; ürün/satış stratejisi analizinden hariç tutulur ("temiz ciro").
- Genel ilke: üretici varsayma; fiyatı tek liste fiyatı sanma; faturalı/beyaz ayrımını atlama; stok = eldeki sanma; rapor önerisini canlı veri kalite kontrolü olmadan otomatik karar sayma.

### Bilinen Veri Sınırları (kalıcı uyarı)
- `top-customers` endpoint'i Mikro alan hatasıyla (örn. `cari_sektor` vs `cari_sektor_kodu`) **500 verebiliyor**; müşteri ciro konsantrasyonu ve satıcı ciro/marj doğrudan alınamayabilir.
- Kategori "müşteri sayısı" benzersiz müşteri değil, **ürün-bazlı temas toplamıdır**; benzersiz kategori-müşteri penetrasyonu için ayrı distinct sorgu gerekir.

### Veri Kalitesi Riskleri (kalıcı)
- Eski/yanlış-KDV-yorumlu maliyet → zarar satış.
- TOPLU işaretlenmemiş toplu satış → yanlış min-max.
- Eksik sektör kodu → yetki/fiyat hatası.
- Eksik ürün ölçü/raf → depo ve Yolpilot verisi bozulur.
- Aynı ürünün farklı kartları → satış/stok bölünmesi.
- Türkçe karakter / PDF encoding sorunları.

---

## Gizlilik / KVKK (kalıcı kural)
- Müşteri/satış verileri ticari gizlilik ve KVKK kapsamındadır.
- Raporlarda **müşteri/satıcı/tedarikçi adları maskelenir** (Müşteri-XXX / Satıcı-XXX).
- **PII asla dışa yazılmaz:** telefon, e-posta, açık adres, vergi no, TC, IBAN, özel notlar.
- Altyapı sırları (sunucu IP/hostname, SSH anahtarı, şifre, connection string, API key, `.env` içeriği, Mikro/DB kullanıcı bilgisi) hiçbir yanıta veya dış dosyaya yazılmaz.

---

## Terminoloji Sözlüğü

| Terim | Anlamı |
|---|---|
| **Mikro** | Şirketin ana ERP'si (MSSQL); tek doğru ticari veri kaynağı |
| **B2B** | Mikro üstüne kurulu web/operasyon katmanı (PostgreSQL + Prisma) |
| **Faturalı (INVOICED)** | Normal/tam KDV'li resmi satış |
| **Beyaz (WHITE)** | KDV sıfırlanan faturasız satış; maliyette "yarım KDV" mantığı |
| **Yarım KDV** | Beyaz fiyat/maliyet hesabında ürün KDV'sinin yarısının eklenmesi |
| **Güncel maliyet** | `currentCost` — stok/standart maliyet, marj hesabının tabanı |
| **Son giriş maliyeti** | `lastEntryCost` — en son alış maliyeti |
| **Fazla stok** | Stok − satış + bekleyen satınalma − bekleyen müşteri siparişi |
| **Stok ailesi** | İkame/benzer ürünlerin satış/sipariş yönlendirme grubu |
| **Fiyat ailesi** | Maliyet tarihi uyumu için birlikte izlenen ürün grubu |
| **Min-max** | Aile toplamı üzerinden stok alt/üst eşik kararı |
| **TOPLU** | Min-max'tan hariç tutulan sorumluluk merkezi |
| **Blok (marj)** | Teklif kaleminde kâr maliyetin %5 altına düşerse satır bloke olur ve teklif admin onayına gider (indirim değil, marj uyarısı) |
| **Fiyat listesi 1–5 / 6–10** | 1–5 perakende, 6–10 toptan/faturalı fiyat listesi grupları |
| **Müşteri tipi A/B/C/D** | BAYI/PERAKENDE/VIP/OZEL segmentleri; her birinde farklı marj |
| **Kapı açıcı** | Müşteriyi getiren, düşük/nötr marjlı hacim kategorisi |
| **Karlılık ürünü** | Düşük hacim, yüksek marjlı kategori |
| **Sepet (omurgası)** | Sepeti tamamlayan, geniş tabanlı orta-marj kategori |
| **Tekrar satılabilir ürün payı** | Müşterinin yeniden satabileceği standart sarf oranı (meslektaş sinyali) |
| **Meslektaş aday skoru** | Müşterinin toptancı/yeniden satıcı olma olasılığı (heuristik) |
| **Brüt kar** | Satış tutarı − (güncel maliyet × miktar); yönetim metriği |
| **Sıcak satış** | Araç stoğu (depo 11) üzerinden saha nakit/irsaliye satışı |
| **Saha satış** | Plasiyerin müşteri yanında mobil teklif/sipariş modülü |
| **Depo kiosk** | Açık sipariş toplama/irsaliye/araç-şoför ekranları |
| **Depo kodları** | Merkez=1, Topça=6, Sıcak/araç=11 |
| **Sektör kodu** | `cari_sektor_kodu` — satıcı portföy/yetki ve segment filtresi |
| **Plasiyer / temsilci** | Müşteriye atanmış satıcı (`sth_plasiyer_kodu` / `cari_temsilci_kodu`) |
| **`priceVisibility`** | Müşterinin faturalı/beyaz/ikisini görme ayarı |
| **`hiddenFromCustomers`** | Ürünü müşteri panelinden gizleme bayrağı |
| **Yolpilot** | Lojistik/rota sistemi; ürün ölçü/raf verisine bağımlı |
| **Mark-current** | Fiyat teyidinde "zaten güncel" yanıtı; Mikro maliyet tarihini otomatik güncellemez |
| **120'li kod** | Stok değil, CARİ kodu |
| **B'li kod** | Stok kartı kodu |
