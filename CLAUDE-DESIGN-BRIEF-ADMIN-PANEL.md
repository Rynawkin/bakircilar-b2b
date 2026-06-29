# Bakırcılar B2B — Yönetim (Admin) Paneli Tasarım Brief'i

> **Bu brief kimin için:** claude.ai/design'a verilecek. Amaç: şirket-içi (personel) panelinin TÜM ekranlarını, mevcut müşteri paneliyle **birebir aynı tasarım dilinde** yeniden tasarlamak. Müşteri paneli zaten bu tasarım sistemine geçirildi; admin paneli de aynı derin-lacivert, premium, sakin/kurumsal dile gelecek.
>
> **Hazırlanma:** 2026-06-29. Kaynak: panelin gerçek kodu satır satır envanterlendi; aşağıdaki her alan/kolon/buton/modal koddan birebir çıkarıldı.

---

## 0. ALTIN KURALLAR (önce bunu oku)

1. **HİÇBİR VERİ/BUTON/KOLON DÜŞMEYECEK.** Bu panel 10 yıllık operasyonun beyni. Aşağıda bir ekranda sayılan her alan/kolon/buton/filtre/rozet/modal, yeni tasarımda **mutlaka** karşılığını bulmalı. Bir şeyi "sadeleştirmek/atmak" istiyorsan tasarımın üstüne **kırmızı not** düş ("ATLANDI: …, onay bekliyor"), kendiliğinden silme.
2. **Para/maliyet/marj/KDV/faturalı-beyaz/seri-no/birim-katsayı kutsaldır.** Bunların hiçbirinin görünürlüğü, ayrımı veya yan-yana karşılaştırması bozulmayacak. Bu alanlar ekranlarda ⚠️ ile işaretli.
3. **Tasarım dili müşteri paneliyle aynı** olacak (Bölüm 1–3'teki tokenlar/komponentler). Renk, köşe, gölge, tipografi, buton/badge/input desenleri birebir.
4. **Yoğun-veri ekranı bir SaaS değil, bir ERP konsolu.** Çok kolonlu tablolar, çok filtre, çok modal var; bunları "havalı ama boş" hale getirmeyeceğiz — **bilgi yoğunluğunu koruyup** sadece görsel kaliteyi/hiyerarşiyi yükselteceğiz. Beyaz alan uğruna kolon/satır silmek YASAK.
5. **Türkçe.** Tüm etiketler Türkçe. (Mevcut kodda bazı ekranlarda bozuk karakter/mojibake var — bunları DÜZGÜN Türkçe'ye çevir; Bölüm 5'e bak.)

### Çıktı formatı ve teslim
- Önceki müşteri paneli işinde kullandığımız `.dc.html` formatında, **ekran başına bir tasarım** üret (ProductCard gibi tekrar eden parçalar paylaşılan komponent olsun).
- Bu brief çok büyük; claude.ai context'ine sığması için **bölüm bölüm besle.** Önerilen sıra Bölüm 6'da.
- Her ekranda: masaüstü (1440px+) ana hedef; ayrıca dar (≈1024px) ve mümkünse tablet davranışı. (Telefon tasarımı bu briefin kapsamı DIŞINDA — en sona bırakıldı.)

---

## 1. TASARIM SİSTEMİ (müşteri panelinden birebir)

### 1.1 Renk paleti

**Primary (derin lacivert — marka):**
| Ton | Hex | Kullanım |
|---|---|---|
| 50 | `#eef2fa` | hover zemini, ikon/avatar arkası, info-badge bg |
| 100 | `#d6e0f1` | hover hat, ring-inset |
| 200 | `#b9caea` | hover kart kenarı |
| 300 | `#8ba8d7` | — |
| 400 | `#577fbb` | input focus border |
| 500 | `#2f5a98` | focus ring (opacity'li) |
| **600** | **`#15356b`** | **MARKA TEMEL** — primary buton, logo kutusu, vurgu |
| 700 | `#1c4585` | link / hover vurgu |
| 800 | `#102c54` | koyu yüzey, buton active |
| 900 | `#0c2247` | en koyu hero / koyu paneller |
| 950 | `#081a3a` | en koyu |

**Yüzey / çizgi / mürekkep (CSS değişkenleri — sayfa zemini hep `--surface-0`):**
| Token | Hex | Anlam |
|---|---|---|
| `--surface-0` | `#f4f6fa` | sayfa zemini, input/segment zemini |
| `--surface-1` | `#fbfcfd` | hafif kart-içi (başlık satırı, alt kutu) |
| `--surface-2` | `#ffffff` | kart (beyaz) |
| `--line` | `#e7ebf2` | standart ince hairline kenarlık (1px) |
| `--line-strong` | `#d8e0ec` | belirgin kenarlık (input, secondary buton, stepper) |
| `--ink-1` | `#14223b` | ana metin |
| `--ink-2` | `#51607a` | ikincil metin |
| `--ink-3` | `#8b97ac` | soluk/meta metin |

**Anlamsal renkler (Tailwind varsayılan tonları):**
- **Emerald** = başarı / olumlu / indirim / "açık-görünür" / aktif / kâr+. `emerald-50/100/600/700`. (Stok noktası `emerald-500`.)
- **Amber** = uyarı / tedarik / vade / "eski" / sarı-risk / sorumluluk. `amber-50/100/200/600/700`.
- **Red** = tehlike / hata / kilitli / gizli / zarar / yüksek-risk / sil. `red-50/100/500/600/700`.
- **Sky/blue** = bilgi / UPDATED / beyaz-fiyat ipucu. **Slate/gray** = nötr.
- **Pink/rose** = "fiyatı olmayan satır" özel uyarısı (Üçarer).

### 1.2 Tipografi
- Font: **Inter** (next/font, global). Hafif negatif tracking (`letter-spacing:-0.005em`), `font-feature-settings:"cv05","ss01"`.
- `h1` = `text-2xl font-semibold tracking-tight` (#14223b). `h2` = `text-xl font-semibold`. `h3` = `text-base font-semibold`.
- Sayfa başlığı kalıbı: başlık `text-2xl font-semibold tracking-tight text-[var(--ink-1)]`, alt başlık `text-[13px] text-[var(--ink-3)]`.
- Kod/cari-kodu/Mikro kod alanları **`font-mono`** (her zaman mono). Para sağa hizalı, sayısal.
- Ağırlık: gövde `font-medium`, başlık/fiyat/etiket `font-semibold`, sadece hero/sayaç `font-bold`.

### 1.3 Köşe / gölge / kenarlık
- Kart: `rounded-xl` (12px); büyük panel/özet `rounded-2xl` (16px). Buton/input/select/segment: `rounded-lg` (8px). Badge/chip: `rounded-md` (6px). Pill rozet: `rounded-full`.
- **Gölge felsefesi "border-first":** kartlar durağanda **gölgesiz**, sadece `border border-[var(--line)]`. Gölge yalnız hover + floating katmanda (dropdown/mega-menü/modal). Gölge rengi laciverde kaçık: `rgba(20,34,59,…)`, nötr siyah değil.
  - Kart hover: `0 1px 3px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.14)`.
  - Dropdown: `shadow-lg ring-1 ring-[var(--line)]`. Modal: daha güçlü.
- Kenarlık: standart `--line`; interaktif (input/secondary buton/stepper) `--line-strong`. Rozetlerde border yerine `ring-1 ring-inset ring-<renk>-100`.

### 1.4 Komponent desenleri (kanonik — bunları admin'de standart al)
- **Butonlar:**
  - `.btn` taban: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary-500/40`.
  - `.btn-primary`: `bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm shadow-primary-600/20`.
  - `.btn-secondary`: `bg-white text-gray-800 border border-[var(--line-strong)] hover:bg-gray-50`.
  - `.btn-ghost`: `text-gray-600 hover:bg-gray-100`. `.btn-danger`: `bg-red-600 text-white hover:bg-red-700`.
- **Input:** `w-full px-3 py-2 text-sm bg-white border border-[var(--line-strong)] rounded-lg placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400`. Label: `text-xs font-medium text-gray-500 mb-1.5`.
- **Select (inline):** çerçeve `flex h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5` + içte border'sız select + sol lucide ikon `text-[var(--ink-3)]`.
- **Segmented / sekme-toggle:** kapsayıcı `flex rounded-lg bg-[var(--surface-0)] p-0.5`; aktif `bg-white text-primary-600 shadow-sm ring-1 ring-[var(--line-strong)]`, pasif `text-[var(--ink-2)]`. Buton `rounded-md px-3 py-1.5 text-xs font-medium`.
- **Miktar stepper:** `flex items-center rounded-lg border border-[var(--line-strong)]`; −/+ `h-9 w-8 hover:bg-[var(--surface-0)]`; orta input `border-x border-[var(--line)] text-center text-sm font-semibold`.
- **Badge:** taban `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium`. Variantlar: success `bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100`; warning `bg-amber-50 text-amber-700 ring-amber-100`; danger `bg-red-50 text-red-700 ring-red-100`; info `bg-primary-50 text-primary-700 ring-primary-100`; neutral `bg-gray-100 text-gray-600`.
- **Chip (kod/filtre):** `px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-50 text-gray-600 border border-[var(--line)]`.
- **Kart:** `.card = bg-white rounded-xl border border-[var(--line)]`, padding `p-5` (yoğun tablo kartlarında `p-4`).
- İkon kütüphanesi: **lucide-react** (ince stroke, `h-3.5`–`h-5`). Emoji ikonlar (mevcut kodda 📦💰✏️ vb.) **lucide'a çevrilecek** — Bölüm 5.

---

## 2. ADMIN SHELL (üst çerçeve — TÜM admin ekranlarında ortak)

> Müşteri header'ı beyaz/iki satırlıydı. Admin'de mevcut header **derin lacivert gradient** (`from-primary-700 to-primary-600`). **Karar:** Admin shell'i de müşteri paneliyle aynı **premium beyaz + ince hairline** dile çek, AMA admin kimliğini koru (yoğun menü, rol göstergesi). Aşağıdaki yapı KORUNACAK; sadece görsel dili yenilenecek.

### 2.1 Üst bar (sticky, z-50, yükseklik ~56–64px)
Soldan sağa:
1. **Logo** (lacivert kutu içinde `/logo.png`) → tıklayınca rol'e göre ana sayfa (`DEPOCU` ise `/warehouse`, diğer `/dashboard`).
2. Logo yanında ayraç + **"Yönetim Paneli"** + altında giriş yapan kullanıcının adı (`user.name`).
3. **Birincil menü (yatay):** ilk 6 ana modül doğrudan (ikon + ad), gerisi **"Diğerleri"** dropdown'ında (geniş, 2–3 kolonlu, ikon+ad+açıklama kompakt liste). Aktif sayfa beyaz dolgulu/vurgulu.
4. **"Ayarlar" dropdown:** Kategoriler, Ürün Override, Tedarikçi İskonto, Hariç Tutma, Personel, Ayarlar (ikon+ad+açıklama).
5. **Bildirim zili:** okunmamış sayısı kırmızı rozet; dropdown (`w-80`): başlık + "Tümünü okundu yap" + bildirim listesi (başlık, gövde 2 satır clamp, tarih; okunmamış mavi vurgulu). 15 sn'de bir yenilenir.
6. **Kullanıcı menüsü:** avatar (baş harf) + dropdown (ad, email, "Admin" rozeti, "Çıkış Yap").
7. Dar ekranda **hamburger** → tüm menü + ayarlar + çıkış dikey liste.

**Menüdeki tam modül listesi (görünürlük role/izne bağlı):** Dashboard, Siparişler, Teklifler, Teklif Kalemleri, Sipariş Takip, Operasyon Merkezi, Saha Satış, Sıcak Satış, Depo Kiosk, Perakende Satış, Ürün Ölçüleri, Resim Hata Talepleri, Müşteriler, Cari 360, Müşteri Portföyüm, Anlaşmalı Fiyatlar, Vade Takip, Faturalar, Ürünler, Stok Açma, Tedarik Maliyetleri, Talepler, Kampanyalar, Bannerlar, Raporlar. (Her birinin kısa açıklaması mevcut; menü tooltip/alt-metin olarak kullan.)

### 2.2 Sayfa kabuğu
- Zemin `bg-[var(--surface-0)]`, içerik `container` (geniş ekranlarda `max-w-[1400px]`–`1900px`, yoğun tablolarda tam genişlik) + `px-4 sm:px-6 lg:px-8`.
- **Standart sayfa başlığı bloğu** (her ekranın tepesinde): solda başlık + alt açıklama (+ gerekirse "← Geri/Raporlara Dön" linki, breadcrumb); sağda o ekrana ait birincil aksiyon butonları. Bu blok TÜM ekranlarda tutarlı olacak.
- **Footer:** müşteri panelindeki minimal footer ile aynı (telif + birkaç link). (Admin'de zorunlu değil ama tutarlılık için ekle.)

---

## 3. ORTAK DESENLER (her ekranda tekrar eden parçalar — bir kez tasarla, her yerde kullan)

Bu desenleri **paylaşılan komponent** olarak tasarla; ekran spesifikasyonlarında "standart tablo / standart filtre barı / metrik kartı" dediğimde bunları kastediyorum.

1. **Metrik/özet kartı:** `rounded-xl border bg-white p-4/5`; üstte küçük etiket + lucide ikon (renkli, anlamsal); büyük sayı (`text-2xl font-semibold`); altında ikincil değer/trend. Çoğu ekranda 3–6'lı grid. Renk: nötr zemin + ikon rengi anlamsal (yeşil ciro, mor kâr, turuncu marj, sarı bekleyen, kırmızı risk).
2. **Filtre barı:** kart içinde grid (genelde 3–6 kolon). Her kontrol: küçük label + input/select/date/checkbox/segment. Sağda/altta "Filtrele", "Temizle", "Yenile" (RefreshCw), "Excel İndir" (Download), "Excel Şablonu". Aktif filtre çiplerini göster.
3. **Standart veri tablosu:**
   - Başlık satırı `bg-[var(--surface-1)]`, sticky; sıralanabilir kolonlarda başlık tıklanır + ▲/▼ göstergesi.
   - Kod/Mikro kolonları **mono**; para **sağa hizalı**; tarih kısa format; sayılar `tr-TR`.
   - Çok geniş tablolarda **ilk 1–3 kolon sticky** + yatay scroll (alt sticky scrollbar). Satır hover vurgusu. Tıklanabilir satırlarda cursor-pointer.
   - Negatif/risk değerleri kırmızı, olumlu yeşil; eşik-bazlı renk (ör. marj ≥%20 yeşil / ≥%10 turuncu / <%10 kırmızı — bu kural TÜM kâr-marjı kolonlarında aynı).
4. **Durum rozetleri (anlamsal renk haritası — her yerde aynı):** Onaylandı/Tamamlandı/Aktif/Açık-stok → emerald; Bekliyor/Uyarı/Eski → amber; Reddedildi/Zarar/Kilitli/Gizli → red; Bilgi/Mikro'ya gönderildi-info → primary/sky; Pasif/nötr → gray.
5. **Modal/drawer:** ortalı modal (sm/lg/xl/full boy); başlık + kapat (X); gövde; footer (İptal solda secondary / asıl aksiyon sağda primary; tehlikeli aksiyon danger). Onaylar için ConfirmDialog (ikon + başlık + mesaj + Onayla/İptal). Mevcut kodda bazı onaylar "toast içi inline form" — yeni tasarımda **gerçek modal/dialog** kullan.
6. **Boş / yükleniyor / hata / yetki durumları:** her listede dört durum tasarla — yükleniyor (spinner/skeleton), boş (ikon + "… bulunamadı" + varsa CTA), hata (kırmızı ikon + mesaj + "Tekrar Dene"), yetkisiz (ilgili modül izinsizse ya gizli ya "Yetki yok").
7. **Sayfalama:** "Toplam N kayıt" + "Sayfa X / Y" + Önceki/Sonraki. (Bazı ekranlar büyük; sayfalama standart.)
8. **Para/tarih:** Para `₺` + `tr-TR` 2 ondalık, sağa hizalı. Tarih `formatDateShort`. KDV oranı `%20` biçiminde.
9. **⚠️ Kritik-alan vurgusu:** maliyet/fiyat/marj/KDV/faturalı-beyaz/seri/birim-katsayı alanları görsel olarak **net ayrışsın** (renk/etiket/gruplama). Bunlar asla küçük gri detaya gömülmesin.

---

# 4. EKRAN EKRAN SPESİFİKASYONLAR

> Her ekranda yapı: **Amaç → Üst bar/aksiyonlar → Filtre/sekme → Özet kartları → Ana içerik (tablo/kart/form, HER kolon/alan) → Satır aksiyonları → Modallar → Rozetler → Durumlar → ⚠️ kritik alanlar.** Kolon/alan adları koddan birebir.

---

## 4.1 — DASHBOARD & OPERASYON MERKEZİ

### 4.1.1 Dashboard — `/dashboard`
**Amaç:** Yöneticinin günlük nabzı: dönemsel satış/teklif/sipariş özeti, bekleyen iş metrikleri, ürün değişim onayları, hızlı aramalar, Mikro senkron aksiyonları. (ADMIN/MANAGER/HEAD_ADMIN/SALES_REP; kart bazında izin filtresi.)

- **Üst filtre kartı:** Dönem select (Günlük / Haftalık / Ay başından beri / Tarih aralığı). "Tarih aralığı" seçilince Başlangıç + Bitiş date inputları.
- **Üst özet (3 kart, dönem rozetli):** Satış Özeti (adet + tutar, emerald), Teklif Özeti (adet + tutar, indigo), Sipariş Özeti (adet + tutar, turuncu).
- **Alt metrik (4 kart, izne bağlı):** ⏳ Bekleyen Siparişler (sayı + "Siparişleri Gör →"), ✅ Bugün Onaylanan (sayı + 💰 tutar), 👥 Aktif Müşteriler (sayı + "Müşteri Ekle →"), 📊 Fazla Stoklu Ürün (sayı + son sync tarihi).
- **Onay bölümü — "Onaylanacak Ürün Sipariş Değişimleri"** (amber, koşullu, sağ üst "Bekleyen: N" rozeti): 2 kolonlu kart grid (max 12). Her kart: `{orderNumber}/Satır {lineNo}` + `{customerCode}-{customerName}` + adet rozeti; iki kolon karşılaştırma — **Mevcut ürün** (gri: kod, ad, ⚠️ Güncel marj + Giriş marjı) vs **Önerilen ürün** (yeşil: kod, ad, ⚠️ Güncel/Giriş marj). Alt: "Birim fiyat aynı: {fiyat}" + **Reddet** (red nedeni sorar) + **Onayla**.
- **Hızlı arama widget'ları (4–5, izne bağlı):** Stok Arama (→ `/search/stocks`), Cari Arama (→ `/search/customers`), Ekstre Al (EkstreModal açar), Diversey Stok, (HEAD_ADMIN) Rol İzinleri. Her biri ikon+başlık+açıklama+buton kartı.
- **Senkronizasyon uyarıları** (sarı, koşullu): liste — ikon, ürün adı+kod, mesaj, varsa boyut; "Kapat".
- **Aksiyon kartları (4):** Senkronizasyon (son sync tarihi + ilerleme kutusu: Kategoriler/Ürünler/Fazla stok x/y/Fiyat x/y/Resimler ✅⏭️❌📊 + "🔄 Şimdi Senkronize Et"), Cari Senkronizasyonu ("👥 Cari Sync Et"), Resim Senkronizasyonu (ilerleme + "📸 Resim Sync Et"), Hızlı İşlemler (Yeni Müşteri / Bekleyen Siparişler(N) / Fiyatlandırma Ayarları / Sistem Ayarları).
- **Modal:** EkstreModal (cari ekstre Excel/PDF export — cari seçimi + tarih aralığı + export butonları).
- ⚠️ Onay bölümündeki güncel/giriş **marj** değerleri (renk tonlu) ve "birim fiyat aynı kalır" notu korunacak.
- **Durumlar:** yetkisiz rol → login'e; stats yoksa kartlar gizli; sync sırasında ilerleme + buton "…Ediliyor"; sync başlatma confirm.

### 4.1.2 Operasyon Komuta Merkezi — `/operations`
**Amaç:** Açık siparişlerin stok gerçeği (ATP/tahsis), depo iş yükü, müşteri intent, risk/vade, ikame ve master-data kalitesini tek konsolda toplayan karar-destek ekranı.

- **Üst bar:** başlık + açıklama; sağda **Seri filtre** input (virgüllü, ör. HENDEK,ADAPAZARI) + **Yenile** (RefreshCw).
- **4 metrik kart:** Acil ATP (`N sipariş` + toplam açık sipariş), Kritik Risk (`N sipariş` + toplam shortage adet), Sıcak Müşteri (`N müşteri` + aktif picker), İkame İhtiyacı (`N satır` + data block).
- **6 bölüm (kart, satır/kart tıklanınca ilgili modal):**
  1. **A2 ATP/Tahsis** tablo: Sipariş | Müşteri | Kalan | Shortage | Kapsama (rozet `%X - durum`). İlk 24.
  2. **A3 Depo Orkestrasyonu:** dalga kartları (waveId, "N sipariş | M satır", "Tahmini süre dk | Önerilen picker") + Aktif pickerler (ad + "N sipariş / M satır").
  3. **A5 Müşteri Intent** tablo: Müşteri (+ nextBestAction) | Skor | Segment (rozet) | Sepet (₺). İlk 12.
  4. **A7 Risk/Vade** tablo: Sipariş (+ müşteri) | Tutar | Skor | Karar (rozet). İlk 12.
  5. **İkame Motoru:** öneri kartları (sipariş-kaynak ürün, "Eksik/Gerekli", ilk 3 aday + skor). İlk 8.
  6. **Master Data Quality Firewall:** check kartları (başlık, açıklama, severity, büyük count, BLOCK/OK).
- **Alt bilgi:** "Son güncelleme: …" + "Health Score: …".
- **Modallar (6):** ATP Detay (full; satır tablosu: Satır|Ürün|Kalan|Stok|Own Rez|Diğer Rez|ATP|Cover|Shortage|Durum + "Tüm/Sadece eksikler/Rezerve" filtreleri + ürün arama), Dalga Detay (xl; Hacim/Süre/Shortage kutuları + sipariş tablosu → tıkla ATP'ye), Müşteri Intent Detay (lg; skor/segment/sepet/aktivite/sipariş kutuları + "Aktivite raporuna git"), Risk Detay (lg; müşteri/sipariş/karar + 3 bakiye kutusu + gerekçeler), İkame Detay (xl; aday tablosu Aday|Stok|Skor|Neden + "ATP detayını aç"), Data Quality Detay (xl; örnek kayıt tablosu + koşullu "Resim hatalarına git"/"Depo ekranına git").
- **Rozetler:** Kapsama FULL emerald / PARTIAL amber / NONE rose; Karar AUTO_APPROVE emerald / MANUAL_REVIEW amber / REJECT rose; Intent HOT emerald / WARM amber / COLD slate; Data BLOCK kırmızı / OK yeşil.

---

## 4.2 — TEKLİFLER  ⭐ (panelin en kritik grubu — EN DETAYLI tasarım buraya)

### 4.2.1 Teklif Oluştur / Düzenle (+ Sipariş Oluştur/Düzenle) — `/quotes/new` ⭐⭐⭐
> **Tek ekran, 4 mod:** Teklif Oluştur (default) · Teklif Düzenle (`?edit=id`) · Sipariş Oluştur (`?mode=order`) · Sipariş Düzenle (`?mode=order&orderId=id`). Prefill: `?customerCode=` + `?productCodes=`. Başlık/alt-metin/buton metinleri moda göre değişir. **Bu ekran panelin kalbidir; kalem tablosundaki HER alan iş için gereklidir.**

- **Üst bar:** Başlık moda göre ("Teklif Oluştur"/"Teklif Düzenle"/"Sipariş Oluştur"/"Sipariş Düzenle") + alt-metin; sağda "Teklifler"/"Siparişler" geri butonu.

**Sol panel (gizlenebilir — "Sol Paneli Gizle/Göster"):**
- **Müşteri kartı:** "Müşteri Seç/Değiştir" (CariSelectModal açar) + seçiliyse CustomerInfoCard (tam mod). Boşsa "Müşteri seçin."
- **Teklif Ayarları kartı** (teklif modu): "İlgili Kişi/son satış adedi" select (1–10), WhatsApp Şablonu textarea (`{{customerName}} {{quoteNumber}}`), Sorumlu select (kod-ad) + "Tercihleri Kaydet".
- **Ürün Havuzu kartı:** "Son N satış" + "Ürün Havuzunu Aç" + çip satırı (Seçili ürün / Toplam ürün / Mod: Daha Önce Alınanlar | Tüm Ürünler).

**Sağ panel — Teklif/Sipariş Bilgileri kartı (alanlar moda göre):**
- Teklif: Geçerlilik Tarihi (date), İlgili Kişi select (customerContacts: ad-tel-email).
- Sipariş (yeni): ⚠️ Depo select, Belge No (Müşteri Sipariş No), Ctrl+Q Açıklama 1, ⚠️ **Faturalı Seri**, ⚠️ **Beyaz Seri**. Sipariş düzenleme: ek ⚠️ Faturalı Sıra + Beyaz Sıra.
- ⚠️ "Tüm satırlarda KDV sıfırla" checkbox (global). Not textarea.

**TEKLİF KALEMLERİ TABLOSU (ekranın kalbi — tam ekran açılabilir, kolonlar seçilebilir/sürüklenebilir/yeniden boyutlanabilir):**
- **Tablo üstü araç çubuğu:** başlık "Teklif/Sipariş Kalemleri (N)" · ⚠️ Liste Seç select (PRICE_LIST 1–10) + "Tüm Satırlara Uygula" · "Son Satışı Uygula" · "Son Teklifi/Siparişleri Göster/Gizle" toggle · (sipariş) Sorumluluk merkezi + "Sorumluluk Uygula" · "Kolonları Seç" · "Görünüşü Kaydet" · "Manuel Satır Ekle" · "Tam Ekran" · "Ürün Havuzunu Aç". **Blok uyarısı** (sarı): "Bazı satırlarda giriş maliyetine göre kâr %5 altında. Bu teklif admin onayına gidecek."
- **Sabit kolonlar (sıra, her biri resize):**
  1. **#** (sürükle-sırala)
  2. **Ürün** (sürükle tutamacı): ad, kod, ⚠️ "Fiyat teyidi iste" çipi, ⚠️ birim dönüşüm etiketi (koli içi), ⚠️ Kategori son alım rozeti (amber "X ay önce"), ⚠️ Blok rozeti; "Son Teklifi/Siparişi Göster" açıkken geçmiş satırı (tarih + birim fiyat + Belge No + Sipariş No + Beyaz/Faturalı çipi; çoksa "Geçmiş (n)" aç/kapa). **Manuel satır:** "Manuel ürün adı" input + Kod + Manuel rozeti + "Fiyat teyidi iste" + görsel yükle/değiştir/kaldır (5MB, önizleme).
  3. **Miktar:** ⚠️ miktar input (decimal) + ⚠️ birim select (ana/ikinci/`stockUnits`); seçili birim ana birimden farklıysa "Mikro: {miktar} {ana birim}". (Sipariş modunda ek "Rezerve" input.)
  4. **Fiyat Kaynağı** (sipariş: "Fiyat Tipi/Kaynağı"): sipariş modunda üstte ⚠️ **Faturalı/Beyaz** select; sonra Seçin/Son Satış/Fiyat Listesi/Manuel.
  5. **Seçim** (kaynağa göre): Manuel→birim fiyat input; Fiyat Listesi→liste select ("{ad} ({fiyat|yok})", seçili birime dönüşmüş); Son Satış→satış select ("{tarih}-{fiyat} ({miktar}) ({liste})") + eşleşen liste çipi; Manuel→birim fiyat + ⚠️ "Son giriş kâr %" + ⚠️ "Güncel maliyet kâr %".
  6. ⚠️ **Birim Fiyat** (`{fiyat}/{birim}`, sağa).
  7. ⚠️ **Toplam** (satır, sağa).
  8. ⚠️ **KDV:** manuelse %1/%10/%20 select; değilse "%{oran}". Global KDV-0 kapalıysa satır "KDV 0" checkbox; açıksa yeşil "KDV 0".
- **Dinamik/seçilebilir kolonlar:** ⚠️ **Açıklama** (satır açıklama, max 40; sipariş modunda altında Sorumluluk merkezi max 25); **stok kolonları** (GUID/Ürün Adı/Stok Kodu/ham kolonlar/Koli İçi).
  9. **Aksiyon:** Sil.
- **Fiyat analizi alt satırı** (marginInfo, sarı): ⚠️ "Son giriş (KDV hariç): {fiyat} ({tarih}) Kâr {%}" + ⚠️ "Güncel maliyet (KDV hariç): {fiyat} ({tarih}) Kâr {%}" + opsiyonel "Açık alış" çipi + "Blok: %5 altında".
- **Tablo altı:** **Tamamlayıcı Öneriler kartı** (görsel+ad+kod+not+Ekle/Eklendi) · **Özet/Submit kartı (sticky):** ⚠️ Ara Toplam / KDV / Genel Toplam (büyük) + ⚠️ **KDV Hariç Karlılık Özeti** (2 kutu: "Giriş maliyetine göre" ve "Güncel maliyete göre" — toplam maliyet + Kâr tutar/%, renk tonlu, eksik satır uyarısı) + "{n} kalem seçili" + submit (moda göre metin).
- **Modallar:** **Ürün Havuzu** (full; sekmeler Daha Önce Alınanlar/Tüm Ürünler; sıralama, liste-fiyat göster, renklendirme kuralları [Aktif/depo/operatör/eşik/renk/Sil + Kural Ekle], ürün kartları: checkbox+ad+kod+⚠️Merkez/Topca stok+birim dönüşüm+kategori son alım+Ekle+miktar+liste fiyatı+son satışlar), **Fiyat Teyidi** (öncelik + manuelse yeni-stok zorunlu kart alanları [Şablon/Stok adı/Tedarikçi ürün kodu/Ana birim/KDV/Ana sağlayıcı/Marka/Kategori/Ambalaj/Raf + ⚠️Marj 1–5] + not), **Kolon Seçici** (seçili kolonlar sürükle-bırak + checkbox listesi), **CariSelectModal** (Bölüm 4.6 ortak).
- ⚠️ **ATLANMAYACAK kritik kalem alanları (özet):** ürün kodu/adı, ana birim, ikinci birim+katsayı (dönüşüm etiketi + "Mikro: …"), seçili birim, miktar, rezerve, fiyat kaynağı, fiyat listesi no (1–10), son satış (tarih/fiyat/adet/belge/liste), manuel fiyat, son giriş kâr %, güncel maliyet kâr %, birim fiyat/birim, satır toplamı, KDV (%1/10/20 + KDV-0 satır/global), Faturalı/Beyaz, satır açıklaması (Ctrl+Q), sorumluluk merkezi, son giriş maliyeti+tarih, güncel maliyet+tarih, kâr %'leri, açık alış uyarısı, **Blok (%5 altı→onay)**, kategori son alım, manuel görsel, stok kolonları.

### 4.2.2 Teklif Listesi — `/quotes`
- **Üst bar:** "Teklifler" + "+ Yeni Teklif".
- **Sekmeler (sayaç rozetli):** ⏳ Onay Bekleyen / ✅ Gönderilen / ❌ Reddedilen / 🤝 Müşteri Kabul / 📋 Tümü.
- **Arama:** "Cari adı, teklif no, belge no, müşteri kodu veya ürün adı ara…" + "Temizle".
- **Teklif kartı:** Sol — "Cari" + cari adı + "Kod: … - Teklif #… - {tarih}" + Oluşturan/Güncelleme/Geçerlilik + Mikro No rozeti + "PDF müşteriye gönderildi" rozeti. Sağ — statü rozeti + dönüşüm rozeti (Sipariş Mikro/B2B) + ⚠️ Toplam (büyük) + "Detayı Göster/Gizle".
- **Kart aksiyonları:** PDF İndir · Excel İndir · Stoklu PDF · Önerili PDF · WhatsApp Paylaş · "PDF Müşteriye Gönderdim/Tekrar" · Geçmiş · Düzenle (PENDING/SENT) · Siparişe Çevir (mikroNumber var & REJECTED değil) · Mikrodan Güncelle · (PENDING & yetki) Onayla ve Mikro'ya Gönder + Reddet.
- **Genişletilmiş detay:** Admin Notu + Oluşturan + CustomerInfoCard + **Teklif Kalemleri** mini liste (ad, kod, fiyat kaynağı rozeti [Liste N/Son Satış/Manuel], Blok rozeti, "miktar × fiyat" + toplam) + ⚠️ **Dip Toplam Karlılık Özeti** (3 kutu: KDV Hariç Satış / Giriş Maliyetine Göre / Güncel Maliyete Göre — kâr tutar/%).
- **Modallar:** Onay (not + Onayla/İptal), Red (zorunlu sebep), PDF İndir (Hayır/PDF/Önerili PDF), Teklif Geçmişi (her giriş: aksiyon rozeti + tarih-actor + özet satırları + "Detayı Göster" değişiklikler).
- **Statü rozetleri:** PENDING_APPROVAL amber "⏳ Onay Bekliyor"; SENT_TO_MIKRO emerald "✅ Mikro'ya Gönderildi"; REJECTED red; CUSTOMER_ACCEPTED emerald; CUSTOMER_REJECTED red.

### 4.2.3 Teklifi Siparişe Çevir — `/quotes/convert/[id]`
- 2 kolon. **Kalemler kartı:** "Tümünü Seç/Temizle" + toplu Sorumluluk merkezi. Tablo: Seç | Ürün | Durum (OPEN emerald "Açık"/CLOSED red/CONVERTED info) | Miktar (stepper, seçiliyse) | Birim (=birim fiyat) | Toplam | ⚠️ Tip (Beyaz/Faturalı) | Rezerve (stepper) | Sorumluluk | Kapatma Nedeni. **Sipariş Bilgileri kartı:** Belge No, Ctrl+Q Açıklama, ⚠️ Depo, ⚠️ Faturalı Seri (faturalı varsa), ⚠️ Beyaz Seri, "Seçilmeyen açık kalemleri kapat" + özet. **Toplam kartı:** Toplam + "Siparişe Çevir". Kapatma nedenleri: Stok yok/Fiyat kabul edilmedi/Müşteri vazgeçti/Süre doldu/Hata/Diğer.

### 4.2.4 Teklif Kalemleri — `/quotes/lines`
- **Filtre (6):** Durum (Açık/Kapalı/Çevrildi/Tüm), Arama, Kapatma Nedeni, Min Gün, Max Gün, Sıralama. **Toplu:** "Seçili: N" + toplu kapatma nedeni + Seçilileri Kapat + Temizle.
- **Tablo:** [seç] | Durum | Bekleme (gün) | Teklif (no+belge+tarih) | Müşteri (ad+kod) | Ürün (ad+kod) | Adet | ⚠️ Birim (fiyat) | ⚠️ Toplam | İşlem (OPEN→kapatma nedeni+Kapat / CLOSED→neden+Aç). Sayfalama (50).

---

## 4.3 — SİPARİŞLER & SİPARİŞ TAKİP

### 4.3.1 Siparişler — `/orders`
**Amaç:** B2B onay kuyruğu — bekleyen/onaylı/reddedilen siparişleri onayla→Mikro'ya gönder, reddet, düzenle, proforma çıkar.
- **Sekmeler (sayaçlı):** ⏳ Bekleyen / ✅ Onaylanan / ❌ Reddedilen / 📋 Tümü. **Kaynak filtresi (pill, sayaçlı):** Tüm / Müşteri Siparişleri / B2B Siparişleri.
- **Arama:** "Cari adı, sipariş no, belge no, müşteri kodu veya ürün adı ara…" + Temizle.
- **Toplu işlem barı** (bekleyen varsa): "Bekleyenleri seç (N)" + Seçilenleri Onayla / Reddet / Temizle.
- **Sipariş kartı:** Sol — seçim checkbox (PENDING) + "Cari" + ad + "Kod: … - Sipariş #… - {tarih}" + Oluşturan (B2B/Talep/Müşteri rozeti) + Belge No + Teslimat + Mikro ID çipleri + Admin Notu + Teklif Kaynağı kutusu ("Teklif No: …" + "Teklif Geçmişi") + Talep Kaynağı kutusu. Sağ — statü rozeti + ⚠️ Toplam (büyük) + "Detayı Göster".
- **Kart aksiyonları:** Sipariş Proforma PDF · Excel · Düzenle (PENDING/APPROVED; APPROVED'da uyarı) · Onayla ve Mikro'ya Gönder (PENDING) · Reddet (PENDING).
- **Detay:** CustomerInfoCard + **Sipariş Kalemleri** (ad, kod, ⚠️ Faturalı/Beyaz rozeti, Not, Sorumluluk, "miktar × fiyat" + toplam) + Onaylandı/Reddedildi tarihi.
- **Statü:** PENDING amber "⏳ Bekliyor" / APPROVED emerald / REJECTED red.
- **Modallar (gerçek dialog'a çevir):** Onay (not + ⚠️ Faturalı evrak seri + ⚠️ Beyaz evrak seri — sadece o tip kalem varsa; varsayılan B2BF/B2BB), Toplu Onay, Reddet (zorunlu sebep), Toplu Reddet, Onaylı sipariş düzenleme uyarısı.
- ⚠️ Proforma'da KDV yalnız INVOICED kalemlere; çıktıda KDV Hariç/KDV Tutarı/KDV Dahil dip toplam.

### 4.3.2 Sipariş Takip — `/order-tracking`
**Amaç:** Mikro'daki açık müşteri + tedarikçi siparişlerini sync edip cari bazında takip, mail, PDF/Excel, depo karşılanabilirlik. (`admin:order-tracking`.)
- **4 özet kart:** 👥 Müşteri Siparişleri (adet+tutar), 🏭 Tedarikçi Siparişleri, 💰 Genel Toplam, 📧 Son Maillar (müşteri/tedarikçi/son sync tarihleri).
- **Hızlı İşlemler kartı:** 🔄 Siparişleri Sync Et · 📧 Müşterilere/Tedarikçilere Mail Gönder · ⚡ Sync + Tüm Mailleri Gönder.
- **Otomatik Mail Ayarları kartı:** Müşteri/Tedarikçi kolonları (Otomatik Mail aktif/pasif, Zamanlama gün+saat, Email Konusu, Son Gönderim) + "✏️ Düzenle" (modal).
- **Sekmeler:** 👥 Müşteriler (N) / 🏭 Tedarikçiler (N) + "Toplam Tutar".
- **Filtreler (sekmeye göre):** Müşteri → ⚠️ Depo Filtre (Tüm/Merkez(1)/Topca(6)), Karşılanabilirlik (Tüm/Karşılanamayanlar/Merkez/Topca) + Tümünü Seç/Temizle + "Seçili Müşteri PDF (N)" + "Seçili Stok PDF (N)". Tedarikçi → Şehir Filtre, Şehire Göre Sırala + Seç/Temizle + "Seçilileri İndir (N)".
- **Cari kartı:** seçim checkbox + cari adı + çipler (Kod/Email/sektör; tedarikçide Şehir/Son İletim/depo dağılımı) + "📦 N sipariş" + "💰 tutar" + sağ aksiyonlar (Müşteri: Müşteri PDF/Stok PDF; Tedarikçi: İletildi/PDF/Excel) + mail durum rozeti (✅ Gönderildi/⏳ Bekliyor) + "▼ Detay". Email Override input + "📧 Mail Gönder".
- **Detay → her sipariş kutusu:** "Sipariş No: …" + ⚠️ Depo rozeti (Merkez/Topca/Karma) + Tarih/Teslimat + "N kalem" + grandTotal. **Kalem tablosu (müşteri 8 kolon):** Ürün (ad + kod/depo; teslimse üstü çizili + "✓ Teslim Edildi") | Miktar (Sipariş/Teslim/Kalan; kalan yeşil=0/turuncu>0) | ⚠️ Merkez Stok | ⚠️ Topca Stok | ⚠️ Merkez (Karşılar/Yetmez) | ⚠️ Topca | Birim Fiyat | Kalan Tutar. (Tedarikçide stok/karşılanabilirlik 4 kolonu yok.)
- **Modallar:** Otomatik Mail Ayarları (overlay; Müşteri/Tedarikçi: aktif checkbox + Email Konusu + 7 gün checkbox + Saat select + Kaydet), ConfirmDialog'lar (mail/sync onayları).

---

## 4.4 — SAHA SATIŞ & SICAK SATIŞ

### 4.4.1 Saha Satış Masası — `/field-sales`
**Amaç:** Telefon/web uyumlu saha konsolu: cari seç, bakiye/stok/fiyat/maliyet, fırsat, ziyaret notu, yeni ziyaret carisi, taslak teklif/sipariş. Çevrimdışı destekli (localStorage).
- **Header (koyu):** "MOBİL SAHA SATIŞ" + çevrimiçi/çevrimdışı rozeti; başlık + açıklama. Sağda 3 toggle: ⚠️ **Faturalı/Beyaz** (priceType), ⚠️ **Müşteri modu/İç görünüm** (safeMode — maliyet gizli/açık), **Taslak** ("N kalem - tutar").
- **Alt sekmeler (mobil):** Cari / Ürün / Taslak / Geçmiş.
- **CustomerStrip:** seçili cari + ⚠️ Bakiye (amber) + Son satış + "Ürün ara".
- **Cari sekmesi panelleri:** "Cari ara" (+ "Yeni müşteri ziyareti" formu: ad*/telefon/not/talep/rakip + Foto + Konum + benzer-cari uyarısı [aday liste + "Yine de yeni cari oluştur"]) · "Cari özet" (Vade/Açık sipariş/Açık teklif/Sepet + kilitli uyarısı) · "Fırsatlar" (stalePurchased/agreementNoRecent/similarSector + kategori son alım) · "Ziyaret notu" (not/talep/rakip + foto/konum) · "Geçmiş notlar".
- **Ürün sekmesi:** mod sekmeleri (Tüm/Aldıkları/Stokta/Fırsatlar, sayaçlı) + arama + "Okut" (barkod). Ürün kartları: resim, ad, kod-birim, kategori son alım, ⚠️ "Merkez+Topca: {toplam}" stok, ⚠️ Fiyat, ⚠️ Kaynak (liste/anlaşma), ⚠️ Merkez/Topca; miktar stepper + WhatsApp + Ekle.
- **Taslak sekmesi:** Cari/Kalem/Toplam + "Yeni kalem tipi" (Faturalı/Beyaz). Her satır: resim, ad, kod-birim, birim dönüşüm, kategori son alım, ⚠️ satır Faturalı/Beyaz toggle (Beyaz=KDV0), sil + Miktar (+ hızlı −1/+1/+5) + ⚠️ Birim select + ⚠️ Fiyat kaynağı (Son Satış/Liste/Manuel) + fiyat seçimi + satır tutarı + rozetler ("Mikro: …", "Son satış belge", "Son teklif", iç görünümde ⚠️ Maliyet/Kâr). Alt: **Teklif oluştur** (geçerlilik+not + Paylaş + Teklif) / **Sipariş oluştur** (⚠️ Depo [Merkez1/Topca6] + ⚠️ Seri no + Temizle + Sipariş).
- **ProductDrawer (ürün detay):** üst metrikler (Cari fiyat/Kaynak/M+T stok/Son teklif/Son satış) + büyük resim + KDV% + **Depolar** (her depo: sellable + Eldeki/Bekleyen/Satın alma) + **Fiyat listeleri** (10 buton) + (iç görünüm) ⚠️ İç maliyet (Güncel maliyet/KDV dahil/tarih/son giriş/kâr) + hızlı ekleme + son satışlar + son teklifler + "Fiyat teyidi ekranını aç".
- ⚠️ Depo: sadece Merkez(1)+Topca(6); maliyet sadece iç görünümde; fiyat listeleri 1–5 Perakende / 6–10 Toptan.

### 4.4.2 Sıcak Satış Operasyon Paneli — `/hot-sales`
**Amaç:** Araç stok (depo 11) bazlı sıcak satış: yükleme, faturasız anlık satış, faturalı irsaliye, siparişten teslim, gün sonu sayım/nakit, rapor, yönetim. (`admin:hot-sales`.)
- **Header (koyu):** "Depo 11 Sıcak Depo" + 4 metrik (Aktif Araç/Araç/Son İşlem/Aktif Seri=SICAK).
- **Sol sabit sütun:** Oturum kartı (açıksa araç/plaka + ⚠️ Kaynak depo + oturum seçici; yoksa araç+depo+başlangıç nakit+"Oturumu Aç") + Araç Stoğu kartı (resim/ad/kod/miktar).
- **6 sekme:** Satış / Yükleme / Sipariş Teslim / Gün Sonu / Rapor / Yönetim.
  - **Satış:** ⚠️ Satış tipi (Faturasız Anlık/Faturalı İrsaliye/Araçta Yoksa Sipariş), ⚠️ Ödeme tipi (Nakit/Kart/Havale/Açık Hesap), ⚠️ Fiyat listesi (Perakende1–5/Toptan1–5) + CustomerPicker (+ "Yeni SICAK Cari" paneli: unvan*/cep*/vergi dairesi*/vergi no*/email/il/ilçe/adres) + ProductSearch (ürün kartı: ⚠️ Araç/Sıcak Depo/Merkez/Topca miktarları + 10 fiyat listesi butonu + Sepete Ekle) + CartPanel (satır: miktar + liste select + ⚠️ birim fiyat + ⚠️ stok/maliyet uyarıları + ⚠️ alt limit kutusu; Toplam + submit).
  - **Yükleme:** ⚠️ Kaynak depo + "Hedef: Sıcak Depo (11)" + ProductSearch (fiyatsız) + "Araca Yükle/Yükleyerek Oturum Aç".
  - **Sipariş Teslim:** açık SICAK sipariş ara + sipariş kartları (kalem: ⚠️ Kalan/Araç stok + ⚠️ Kesilecek miktar + "İrsaliye Kes").
  - **Gün Sonu:** her araç stok satırı: ⚠️ sayılan miktar + aksiyon (Araçta Bırak/Depoya İndir) + ⚠️ Fark kutusu; "Gün Sonunu Kapat".
  - **Rapor:** filtre (tarih/araç/personel + Getir + Excel CSV) + 4 metrik (Ciro/Nakit/Beklenen Kasa/Kasa Farkı) + Ödeme&İşlem kırılımı + Uyarı paneli + ⚠️ Oturum Bazlı Kasa Mutabakatı tablosu (Araç/Personel|Durum|Açılış|Nakit Satış|Beklenen|Kapanış|Fark|Ciro|Evrak) + İşlem Dökümü + En Çok Satan + Stok Hareket Özeti.
  - **Yönetim:** Araç Tanımla (ad/plaka/⚠️varsayılan kaynak depo/not) + Mikro-B2B Mutabakat (problemli işlemler + orphan Mikro evrakları + Yerel İptal) + Son İşlemler.
- ⚠️ Depo: Merkez=1, Topca=6, Sıcak/araç=11. Alt limit: CASH_INVOICE→max(KDV dahil maliyet, maliyet); diğer→maliyet×1.05. currentCost yoksa satışa eklenemez.

---

## 4.5 — DEPO / KİOSK / ÖLÇÜ

### 4.5.1 Depo Kiosk — `/warehouse`
**Amaç:** Açık siparişleri toplama/yükleme/irsaliye kiosk akışı (dokunmatik). En karmaşık kiosk ekranı.
- Sipariş listesi (sipariş/müşteri grup görünümü) + çoklu sekme detay paneli. Satır bazlı ⚠️ toplanan/ek miktar girişi (optimistic + debounce + 15sn oto-yenileme), rezerve görüntüleme, ⚠️ raf güncelleme, resim hatası bildir, şoför/araç katalog yönetimi, "kapat + irsaliyeleştir" dispatch modalı. Ekran klavyesi + numpad modalları (dokunmatik). Toplama statüleri rozetli.

### 4.5.2 Perakende Satış — `/warehouse/retail`
**Amaç:** FTR seri vergisiz hızlı satış. ⚠️ Depo (Merkez/Topca/Tüm) + ⚠️ Ödeme (Nakit/Kart) + ⚠️ P1–P5 fiyat seviyesi + barkod odak + sepet + hızlı miktar numpad.

### 4.5.3 Resim Hata Talepleri — `/warehouse/image-issues`
**Amaç:** Depodan gelen ürün resmi hatalarını yönet. Kart-liste + durum (Açık/İncelendi/Düzeltildi) + doğru resmi yükleyince otomatik FIXED + sayfalama. Kolonlar/kartlar: ürün, hata tipi/açıklama, durum rozeti, aksiyonlar.

### 4.5.4 Ürün Ölçüleri — `/product-dimensions`
**Amaç:** Yolpilot için ölçü/desi/kg/raf. ⚠️ Ölçü (cm girilir→Mikro'ya mm), kg, ⚠️ birim katsayısı (UI↔Mikro yön çevrimi), raf seçimi, eksik veri raporu + CSV export, değişiklik geçmişi; kaydetmeden önce onay.

---

## 4.6 — MÜŞTERİ / CARİ

### 4.6.1 Müşteriler — `/customers`
- **Üst bar:** "Müşteri Yönetimi" + "Toplu Kullanıcı Oluştur" (admin:staff) + "+ Yeni Müşteri".
- **Arama** + 3 sekme (Tümü/Aktif/Pasif). Başlıkta "Müşteriler (filtre/toplam)".
- **Tablo (15 kolon):** Ad | Kullanıcı | Tip (segment rozeti) | Mikro Cari (mono) | Şehir | İlçe | Telefon (mono) | Grup Kodu | Sektör Kodu | Vade Planı | E-Fatura (Evet/Hayır) | ⚠️ Bakiye (sağ, ≥0 yeşil/<0 kırmızı) | Durum (Kilitli/Aktif/Pasif) | Kayıt | İşlem (Düzenle/Kişiler).
- **Yeni müşteri formu (inline):** ⚠️ Mikro Cari Seç* (CariSelectModal) + Ad Soyad + ⚠️ Müşteri Segmenti* (A/B/C/D) + ⚠️ Fiyat Görünürlüğü (Sadece faturalı/Sadece beyaz/İkisi) + "Mikro ERP Bilgileri" (readonly: Şehir/İlçe/Telefon/Grup/Sektör/Vade/⚠️Bakiye/Durum) + "Hesap Bilgileri" (Kullanıcı Adı/Email + Şifre).
- **Modallar:** CariSelectModal, CustomerEditModal, BulkCreateUsersModal (aşağıda).

### CustomerEditModal (Düzenle)
- "Düzenlenebilir Alanlar": Kullanıcı/Email, ⚠️ Segment, ⚠️ **Fiyat Listesi Override** (Faturalı=Toptan 6–10 / Beyaz=Perakende 1–5), ⚠️ **"Son fiyatları kullan"** (Kontrol Tipi: Maliyete göre %/Liste fiyatından düşük olmasın; COST→Maliyet Baz+min kâr%; PRICE_LIST→referans listeler), ⚠️ **Fiyat Listesi Kuralları** (Marka+Kategori öncelikli: Marka/Kategori/Faturalı/Beyaz + Kural Ekle/Sil), Fiyat Görünürlüğü, Hesap Durumu (Aktif/Pasif).
- "İletişim Kişileri" (Ad/Telefon/Email + ekle/güncelle/sil). "Alt Kullanıcılar" (Ad/Kullanıcı/Şifre/Durum + otomatik kimlik + Şifre Yenile). "Mikro ERP Bilgileri" readonly (+⚠️Bakiye).

### BulkCreateUsersModal
- Bilgi (kullanıcı=cari kodu, şifre=cari kodu+"123") + "Tümünü Seç" + arama + tablo (checkbox|Cari Kodu|İsim|Şehir|Grup|⚠️Bakiye) + "N Kullanıcı Oluştur" + sonuç (Oluşturulan/Atlandı/Hatalar).

### 4.6.2 Cari 360 — `/customer-360`
- Sol: **Cari Ara** (kod/unvan/şehir/sektör + sonuç kartları: unvan, kod/sektör, Aktif/Pasif, şehir/ilçe + ⚠️ bakiye). Sağ: seçilince cari başlık kartı (koyu gradient: kod, unvan, şehir/ilçe/sektör + ⚠️ "Cari Bakiye" kutusu).
- **4 özet kutu:** Sipariş (adet+tutar+bekleyen), Teklif, Sepet (kalem+toplam), Aksiyon (açık görev+geciken/geri kazanma).
- **5 modül sekmesi:** Satış Akışı (Son Siparişler/Teklifler[+Detay]/Aktif Sepet/⚠️Anlaşmalar [faturalı/beyaz fiyat]), Finans & Belgeler (⚠️Vade bakiyesi/sınıf/notlar, Faturalar[+İndir], Sipariş Talepleri), Aksiyonlar (Görevler, Geri Kazanma), Aktivite (özet + en çok bakılan sayfa/ürün), Kişiler (Kontaklar + Alt Kullanıcılar).
- **QuoteDetailModal:** 4 metrik (Durum/Geçerlilik/Kalem/⚠️Genel Toplam) + cari/oluşturan/⚠️Mikro (KDV sıfırlı/dahil) + kalem tablosu (Stok/Ürün/Miktar/⚠️Birim fiyat/⚠️Tutar/⚠️Tip/Durum) + "Düzenle"/"Siparişe Çevir".

### 4.6.3 Müşteri Portföyüm — `/portfolio`
- Arama + 3 pill (Hepsi/Aktif/Pasif) + 3 çip (Toplam/Aktif/Pasif). Kart listesi: CustomerInfoCard (compact) + Aktif/Pasif rozeti. (⚠️ tam kartta Bakiye renkli.)

### 4.6.4 Anlaşmalı Fiyatlar — `/customer-agreements`
- Üst kart 3 sütun: **Müşteri Seç** (arama+liste) · **Ürün Seç** (arama+liste) · **Anlaşma Bilgileri** form (⚠️ Faturalı Fiyat* + ⚠️ Beyaz Fiyat + Müşteri Ürün Kodu + ⚠️ Min Miktar + Başlangıç + Bitiş + Kaydet/Temizle).
- **Excel ile Toplu Aktarım** (Örnek Excel İndir + dosya + Aktar + sonuç). **Anlaşmalar listesi:** Tümünü seç + Seçilenleri Sil/Tümünü Sil + arama; satır: checkbox + ürün/kod/Min + ⚠️ "Faturalı: ₺ / Beyaz: ₺" + tarihler + Düzenle/Sil.

### 4.6.5 Cari Arama (F10) — `/search/customers`
- "Cari F10" ham Mikro araması. Arama + "Ara" + ⚠️ "Kolonları Seç" (kullanıcı kolon tercihi). Tablo: kolonlar **dinamik** (Mikro kod anahtarları; varsayılan Cari Kodu/Ünvan/İl/İlçe/Telefon/Sektör/⚠️Bakiye); ilk 2 sticky. Satır → Cari Detay Modal (tüm kolonlar key/value). Kolon Seçici Modal (checkbox grid + Kaydet).

### Ortak: CariSelectModal & CustomerInfoCard
- **CariSelectModal** ("Mikro ERP'den Cari Seç"): arama + "N cari bulundu" + seçili önizleme (Kilitli/E-Fatura rozet + Cari Kodu/İsim/Şehir/İlçe/Telefon/Grup/Sektör/Vade/⚠️Bakiye) + tablo (Cari Kodu|İsim|Şehir/İlçe|Telefon|Grup|Sektör|Vade|⚠️Bakiye|Durum) + İptal/Seçili Cariyi Onayla.
- **CustomerInfoCard** (tam/compact): ad + email + rozetler (segment BAYI/PERAKENDE/VIP/OZEL, E-Fatura, Kilitli) + kutular: Mikro Cari Kodu, Şehir/İlçe, Telefon, Vade (plan kodu-adı veya "N gün"), ⚠️ Güncel Bakiye (renkli), Grup Kodu, Sektör Kodu.

---

## 4.7 — VADE TAKİP

> **Tüm alt sayfalara ortak bir sekme/breadcrumb barı tasarla** (şu an sadece ana `/vade`'de navigasyon var). Renk semantiği: kırmızı=vadesi geçen, mavi=vadesi gelmemiş, amber=bekleyen hatırlatma, yeşil=tamamlanmış.

### 4.7.1 Vade Takip (Liste) — `/vade`
- **Üst bar aksiyonları:** Excel Import (→import) · Excel İndir · Not Raporu (→notes) · Hatırlatma (→calendar) · Atamalar (→assignments) · Senkronize Et.
- **4 özet:** Toplam Cari · ⚠️ Vadesi Geçen (kırmızı) · ⚠️ Vadesi Gelmemiş (mavi) · ⚠️ Toplam Bakiye.
- **Filtre:** Arama (kod/unvan/sektör) + toggle (Vadesi Geçen/Gelmemiş/Notu Olan/Filtreler/Temizle) + genişletilebilir panel (Sektör, Grup, Sıralama, Yön, Min/Max Bakiye, Not İçeriği).
- **Tablo (sıralanabilir):** Cari (ad+kod) | Sektör (+grup) | ⚠️ Vadesi Geçen (kırmızı) | Vade Tarihi | ⚠️ Vadesi Gelmemiş (mavi) | Vade Tarihi | ⚠️ Toplam | Valör (rozet "N gün") | Son Not (tarih + "N gün önce") | Plan | Güncel. Satır → `/vade/customers/{id}`. Sayfalama 25.

### 4.7.2 Vade Müşteri Detay — `/vade/customers/[id]`
- Başlık = cari adı + kod; "Geri Dön". **3 metrik:** ⚠️ Vadesi Geçen (kırmızı+tarih), ⚠️ Vadesi Gelmemiş (mavi+tarih), ⚠️ Toplam/Valör. Künye (Sektör/Grup, Vade Planı, Lokasyon).
- **Sınıflandırma kartı:** Seviye select (Yeşil/Sarı/Kırmızı/Siyah/Özel/Özel Etiket) + Risk Skoru (0–100) + (custom) Özel Etiket + Kaydet.
- **Not Ekle:** not textarea + Etiketler + Söz tarihi (date) + Hatırlatma tarihi (date) + Hatırlatma notu + Not Ekle.
- **Geçmiş Notlar:** her not (yazar·tarih, hatırlatma rozeti [Tamamlandı/Hatırlatma] + Tamamla, gövde, etiket rozetleri, söz/hatırlatma/bakiye rozetleri). **Atanan Personeller** listesi.

### 4.7.3 Vade Atamaları — `/vade/assignments`
- Personel select + Sektör select + Arama. Toplu: Seçilenleri Ata/Tümünü Seç/Temizle. Cari seçim listesi (checkbox grid). Mevcut Atamalar (cari + Kaldır).

### 4.7.4 Hatırlatma Takvimi — `/vade/calendar`
- **Şu an tarihe göre gruplu liste — GERÇEK takvim ızgarasına çevir (fırsat).** Tarih aralığı (Başlangıç/Bitiş + Yenile). Her hatırlatma kartı: cari + not + amber tarih rozeti + Tamamla.

### 4.7.5 Not Raporu — `/vade/notes`
- Filtre (Başlangıç/Bitiş/Etiket/Personel + Hatırlatma toggle + durum [Tüm/Bekleyen/Tamamlanan]). 3 metrik (Toplam Not/En Aktif personel/Filtre). Tablo: Cari | Personel | Tarih | Etiketler | Hatırlatma (success/warning) | Not.

### 4.7.6 Vade Excel Import — `/vade/import`
- Dosya yükleme (.xlsx) + Import Et/Temizle. Otomatik kolon eşleme (Cari kodu* + vadesi geçen/gelmemiş bakiye+vade + toplam + valör + ödeme vadesi). Sonuç: Aktarılan/Atlanan.

---

## 4.8 — ÜRÜN / FATURA / STOK

### 4.8.1 Ürün Yönetimi — `/admin-products`
- **Filtre kartı:** Ürün Ara (300ms) · Fotoğraf Durumu · Resim Hata Tipi · Kategori · Marka · Stok Durumu · ⚠️ Mikro Satış Fiyatı · Müşteri Görünümü · Sıralama+yön. + 3 sayaç pill (Toplam/Fotoğraflı/Fotoğrafsız).
- **Tablo:** [seç] | Fotoğraf | Resim Durumu (Var+SHA / Eksik+hata tipi) | Ürün Adı (+birim+koli içi) | Mikro Kod | Kategori | ⚠️ Fazla Stok | ⚠️ Toplam Stok | ⚠️ Hesaplanan Maliyet (+KDV%) | ⚠️ Son Giriş (tarih+fiyat) | Müşteri Görünümü (Gizli/Açık + toggle) | İşlem (Detay). Başlıkta "Seçili: N" + "Seçili ürünlerin resmini güncelle".
- **ProductDetailModal:** üst (görsel/ad/kod/birim/⚠️KDV%/koli içi) + ürün resmi (yükle/sil) + ⚠️ **Stok** (Fazla/Toplam + Depo Dağılımı) + ⚠️ **Maliyet** (Son Giriş/Güncel/Hesaplanan) + ⚠️ **Mikro Liste Fiyatları** (Perakende 1–5 / Toptan 1–5) + ⚠️ **Satış Fiyatları (segment)** (BAYI/PERAKENDE/VIP/OZEL × Faturalı/Beyaz + ⚠️ Kâr Marjı %) + **Tamamlayıcı Ürünler** (Otomatik/Manuel + grup kodu + öneri/arama + Kaydet).

### 4.8.2 Faturalar (E-Fatura) — `/einvoices`
- **PDF Yükleme kartı:** çoklu PDF + "PDF Yükle" + sonuç (Yeni/Güncel/Hata). **Filtre:** Arama + Fatura Prefix + Başlangıç/Bitiş + Cari Seç (CariSelectModal) + Filtre Temizle/Listele.
- **Tablo:** [seç] | Fatura No (mono) | Cari (ad+kod) | Tarih | ⚠️ Ara Toplam | ⚠️ Genel Toplam | Durum (Eşleşmiş/Eksik/Bulunamadı) | PDF (indir). Toplu: "Seçilileri İndir" (zip) + Temizle.

### 4.8.3 Yeni Stok Açma — `/stock-create`
- **Hero:** "Sıradaki kod: …" + "Varsayılan şablon: …" + Güvenli Yazım kartı. **2 sekme:** Tekli Stok Aç / Toplu Excel + Yenile/Excel Şablonu/Excel Yükle.
- **Tekli form (HER alan):** ⚠️ Stok Adı* · Şablon Stok (lookup) · Tedarikçi Ürün Kodu · Kısa İsim · ⚠️ KDV%* (20/10/1/0) · Ana Sağlayıcı* · Marka* (+yeni marka adı) · Kategori* (en alt) · Ambalaj (+yeni adı) · ⚠️ Ana Birim* · ⚠️ Maliyet T (KDV hariç) · ⚠️ Maliyet P (yarım KDV otomatik) · Raf/Reyon · Kg/En/Boy/Yükseklik (cm→mm) · ⚠️ **Marj 1–5*** · Barkod · Not. **Ek Birimler** (max 3): ⚠️ Birim Adı + ⚠️ Katsayı + ⚠️ Katsayı Yönü (Mikro negatif/pozitif) + ölçüler.
- **Ön Kontrol Sonuçları:** "Ön Kontrol" + "Mikroya Yaz" + satır sonuçları (valid/warning/error + referans isimleri). **Toplu Excel:** dropzone + önizleme tablosu (#/Stok Adı/Tedarikçi/Marka/Kategori/Ambalaj/Ana Birim/Marjlar; limit 200). Sağ: Son Açılan/Düzenlenen + Excel Kolonları referansı.

### 4.8.4 Stok Arama (F10) — `/search/stocks`
- Arama + "Ara" + "Tüm stokları göster" + ⚠️ "Kolonları Seç". Tablo: **dinamik kolonlar** (varsayılan Stok Kodu/Ürün Adı/⚠️KDV/⚠️Güncel Maliyet KDV Dahil/⚠️Merkez Depo/⚠️Toplam Satılabilir/Koli İçi); ilk 2 sticky. Satır → Stok Detay Modal. Kolon Seçici Modal.

---

## 4.9 — TEDARİK MALİYETLERİ & FİYAT

### 4.9.1 Tedarikçi Maliyet Havuzu — `/supplier-costs`
**Amaç:** Aynı ürün için çoklu tedarikçi maliyetlerini sakla/karşılaştır/raporla, seçileni Mikro fiyat motoruna uygula; fiyat teyit + ihale taleplerini yönet. (Çok sekmeli, yetki bağımlı.)
- **Header (koyu):** "Raporlara dön" + başlık + 4 HeroMetric (Maliyet kaydı / Riskli ürün / Fırsat / Tek tedarikçi).
- **Sekmeler:** Özet · Maliyet gir/uygula (admin:supplier-costs) · Raporlar · Geçmiş · Fiyat teyit talepleri · İhale maliyet talepleri.
- **Özet:** koyu hero + 4 MiniMetric + "Yeni sade akış" 3 kutu.
- **Maliyet gir/uygula:** Sol ürün arama (kart: thumb+ad+kod+⚠️"Maliyet: X | Son giriş: Y"). Sağ ProductSummary (8 MiniMetric: ⚠️Güncel maliyet/tarih/⚠️En iyi tedarik/tedarikçi sayısı/⚠️Son giriş/tarih/Ana sağlayıcı/Stok M:T) + **maliyet formu** (Tedarikçi kod/ad/ürün kodu, Kaynak, ⚠️ Maliyet T (KDV hariç), ⚠️ Maliyet P (yarım KDV), Para/Kur, Birim/katsayı, KDV%, "KDV dahil" checkbox, Min sipariş, Teslim gün, Geçerlilik/Teklif tarihi, Not, Teklif dosyası + ⚠️ Normalize önizleme [T/P/Mikro] + ⚠️ "Kaydederken Mikro maliyetini güncelle" + "10 listeyi güncelle" + Kaydet/Uygula). + **CostTable** + **ApplicationHistory**.
- **CostTable kolonları:** Ürün | Tedarikçi | ⚠️ Giriş T/P | ⚠️ Normalize T/P | ⚠️ Mikro fark (renk + %) | Koşullar (Min/Teslim/Geçerlilik/Dosya) | Durum (APPLIED/EXPIRED) | İşlem (Düzenle/Uygula/Arşiv).
- **Raporlar:** filtreler + 8 ReportSection (Mikro maliyeti en iyi tedarikçiden yüksek / düşük-zarar riski / uzun süre güncellenmeyen / tek tedarikçi / yüksek fiyat farkı / geçerliliği dolan / sonradan daha iyi fiyat / ana sağlayıcı piyasa üstü) — her satır ürün+reason+⚠️maliyetler+rozetler.
- **Modallar:** "Maliyeti Mikroya uygula" (3 MiniMetric + CostChangeSummary + ⚠️ "10 liste" + ⚠️ **%30 üstü değişimde kırmızı ek-onay** + not), "Mikro maliyetini güncellemeyi onayla".
- **Fiyat Teyit Talepleri (panel):** Kanban (Yeni Talep/İncelemede/Satış Onayı/Kapanan) + Liste; PriceRequestListCard (requestNo, Yeni stok/Stoklu, öncelik, ürün, cari/talep eden, ⚠️ Miktar/Mevcut maliyet/En iyi teklif). Detay: 10 MiniMetric + **Fiyat alternatifleri** tablosu (Seç radio | Tedarikçi | ⚠️ Giriş T/P | ⚠️ Normalize T/P | Koşullar | Tarih) + satın alma fiyat girişi + Aksiyonlar (⚠️ "Fiyat güncel, satışı bilgilendir" [markCurrent], Satış onayına gönder, Onayla/Reddet, Mikroya uygula ve tamamla, İptal) + notlar. StatusPill renkleri.
- **İhale Maliyet Talepleri (panel):** Kanban + Liste; TenderRequestListCard (deadline rozeti + ⚠️ Kalem/Fiyatsız/En iyi toplam). Detay: kalem kartları (her kalem teklif tablosu: Tedarikçi | ⚠️ Maliyet T/P | ⚠️ Nakliye | ⚠️ Toplam | Termin) + satın alma fiyat girişi + Aksiyonlar.

### 4.9.2 Tedarikçi İskonto Ayarları — `/supplier-price-list-settings`
- Liste (tedarikçi + "İskonto: X+Y+Z | Durum | Özel Kural: N" + Düzenle) + "Yeni Tedarikçi". **Modal:** Ad + Durum + ⚠️ İskonto 1–5 + Özel İskonto Kuralları (anahtar kelimeler + İskonto 1–5) + Fiyat Tipi (Liste/Net, KDV, Renkli/Siyah ayrımı, varsayılan KDV) + Excel Eşleştirme (sheet/başlık/kolonlar) + PDF Eşleştirme (fiyat sıra/regex).

### 4.9.3 Tedarikçi Fiyat Karşılaştırma — `/reports/supplier-price-lists`
- "Yeni Liste Yükle" (Tedarikçi + dosyalar + Önizleme + Yükle) + önizleme (Excel: sheet/başlık satırı/kolon-rol; PDF: kod regex/kolon-rol). Alt: Geçmiş Yüklemeler (sol) + Rapor Detayı (sağ: 4 özet [Toplam/Eşleşen/Eşmeyen/Çoklu] + sekmeler [Eşleşenler/Eşmeyenler/Çoklu/Şüpheli] + tablo [Tedarikçi Kod|Ürün Adı|⚠️Liste Fiyat|⚠️Net Fiyat; matched ek: Ürün Kodu/Ürün Adı/⚠️Güncel Maliyet/⚠️Yeni Maliyet/⚠️Fark/⚠️Fark%]).

### 4.9.4 Maliyet Güncelleme Uyarıları — `/reports/cost-update-alerts`
- Üst: "Tekrar Senkronize Et" + Yenile + Excel İndir. **4 özet** (Toplam Uyarı/Risk Tutarı/Etkilenen Stok Değeri/Ortalama Fark%). Filtre (Arama/Min Gün Farkı/Min % Fark). **Tablo (sticky kod+ad):** ⚠️ Risk (rozet) | Ürün Kodu | Ürün Adı | Ana Sağlayıcı | G.Mal.Tarihi | ⚠️ Güncel Maliyet | S.Giriş Tarihi | ⚠️ S.Giriş Maliyeti (kırmızı) | ⚠️ Fark (TL) | ⚠️ Fark% | Gün Farkı | Eldeki Stok | ⚠️ Risk Tutarı | **Maliyet Güncelle** (T input→P otomatik + "10 liste" + Güncelle). Risk: ≥20 Kritik kırmızı / ≥10 Yüksek turuncu / ≥5 Orta sarı / <5 Düşük yeşil.

### 4.9.5 Tüm Ürünler Maliyet/Fiyat Güncelleme — `/reports/cost-update-all-products`
- Filtre + ⚠️ kolon seçim grid (productCode/Name kilitli; Ana Sağlayıcı/Kategori/Toplam Stok/⚠️Güncel Maliyet/⚠️Son Giriş Maliyeti/Son Giriş Tarihi/⚠️Liste 1–10). Tablo (sticky kod+ad) + son kolon **Maliyet Güncelle** (T→P + "10 liste" + Güncelle). **Modal:** "Maliyet Artış Onayı" (Eski/Yeni/⚠️Artış% + "10 liste güncellenecek"). Sayfalama 200.

### 4.9.6 Fiyat Geçmişi — `/reports/price-history`
- Üst: Yenile + Excel. **4 özet** (Toplam Değişiklik/⚠️Tutarlılık Oranı%/Ortalama Artış%/Ortalama Azalış%). Filtre (Ürün/Kategori/Tutarlılık/Yön/Tarih). **Akordeon satırlar:** yön ikonu + ürün + tarih/kategori + ortalama %, yön rozeti, ⚠️ tutarlılık rozeti (Tutarlı/X-10 Liste). Açılınca: her liste için eski→yeni TL + değişim%; tutarsızsa eksik listeler. (Listeler 1–5 Perakende, 6–10 Faturalı.)

---

## 4.10 — TALEP / KAMPANYA / BANNER / OVERRIDE

### 4.10.1 Talepler — `/requests` (dahili görev panosu)
- Üst: "Yeni Talep" + "Şablonlar" (admin:requests) + Yenile. **Filtre:** Arama/Durum/Tür/Öncelik/Atanan + görünüm (Kanban/Liste).
- **Kanban:** durum kolonları (sayaçlı) + talep kartı (başlık, öncelik, tür, müşteri, atanan, yorum/dosya sayısı, son tarih [geç=kırmızı]; **yaş renklendirme** arka plan). **Liste tablo:** Başlık|Durum|Tür|Öncelik|Atanan|Müşteri|Son Tarih|Son Aktivite.
- **Modallar:** Yeni Talep (Başlık/Açıklama/Tür/Öncelik/Durum/Son Tarih/Atanan/Müşteri arama/Şablon), Şablon Yönetici, **Talep Detay (full):** sol (düzenleme + renklendirme kuralları + Yorumlar [iç/herkese açık] + Dosyalar) + sağ (Bilgiler + İlişkiler [PRODUCT/QUOTE/ORDER/CUSTOMER/PAGE/OTHER] + Durum Geçmişi).
- (Etiket/renk/durum sabitleri `lib/utils/tasks.ts`'ten alınacak.)

### 4.10.2 Kampanyalar — `/campaigns`
- "+ Yeni Kampanya". Kart grid: durum rozeti (Aktif yeşil/Pasif gri) + ad + açıklama + Tip/⚠️İndirim/Min Tutar/Maks İndirim/Başlangıç/Bitiş + Düzenle/Sil.
- **Modal:** Ad* + Açıklama + ⚠️ Tip (Yüzde/Sabit/X Al Y Öde) + ⚠️ İndirim Değeri* + Min Sipariş + Maks İndirim + Başlangıç/Bitiş + Aktif. ⚠️ **EKSİK (eklenecek):** hedef ürün/kategori/müşteri tipi seçimi (model'de var, UI'da yok).

### 4.10.3 Bannerlar — `/banners`
- "Yeni Banner". Kart grid: önizleme (16/7) + ⚠️ Pozisyon rozeti (HERO/STRIP/SIDE) + sıra + Aktif/Pasif + başlık/alt başlık + Link/Ürün/tarih + CTA + Pasife Al/Düzenle/Sil.
- **Modal:** Başlık* + Alt Başlık + **Görsel** (dosyadan yükle, max 5MB + ⚠️ önerilen ölçü [HERO 1920×640 / STRIP 1200×140 / SIDE 600×500] + URL yapıştır + önizleme) + Link URL + Ürün Kodu + CTA + Pozisyon + Sıra + Başlangıç/Bitiş + Aktif toggle.

### 4.10.4 Ürün Override (Vitrin Kontrolleri) — `/product-overrides`
- 2/3+1/3. Sol: Ürün arama + liste (ad/kod/kategori + ⚠️ fazla stok rozeti; seçiliyse ⚠️ Mevcut Fiyatlar [segment×INVOICED]). Sağ: seçili ürün paneli — **Ürün Fotoğrafı** (yükle/değiştir/sil) + **Vitrin Kontrolleri** (⚠️ "Ana sayfada öne çıkar" toggle + featuredOrder + ⚠️ "İndirime sokma" toggle [amber]) + ⚠️ **Özel fiyat (override marjı)** (CUSTOMER_TYPES × Kâr marjı % + Kaydet — kategori marjını override eder).
- (⚠️ impl notu: görsel önizlemede hardcoded `localhost:5000` — düzeltilecek.)

---

## 4.11 — RAPORLAR

### 4.11.1 Rapor Merkezi (İndeks) — `/reports`
- Hero (gradient): "Karar Destek Paneli" + "Rapor Merkezi" + 3 metrik (Toplam rapor/Görünen/Aktif kategori). Arama + kategori pill (Tümü/Fiyat & Maliyet/Stok/Satış & Müşteri/Tedarik Zinciri).
- Kategori panelleri (pastel gradient) → her panelde 1 FeaturedCard (highImpact) + CompactReportCard'lar. **Listelenen ~20 rapor** (id/başlık/açıklama/ikon/kategori/badge): cost-update-alerts, cost-update-all-products, profit-analysis, ucarer-depo, ucarer-minmax, ucarer-minmax-exclusions, product-families, price-family-costs, supplier-costs, top-products, complement-missing, category-churn, customer-recovery, category-opportunity, customer-activity, field-sales-visits, staff-activity, customer-carts, overdue-payments(→/vade), supplier-price-lists. Badge: Aktif yeşil / Yeni mavi / Önerilen amber / Kritik kırmızı / Önemli turuncu. Yetkisiz kart render edilmez.

### 4.11.2 En Çok Satan Ürünler — `/reports/top-products`
- Üst: Yenile + Excel İndir (Tümü). Filtre (Başlangıç/Bitiş/Marka/Kategori/Sıralama [Ciro/Kâr/Marj/Miktar ±]). **4 özet** (Toplam Ürün/⚠️Ciro/⚠️Kâr/⚠️Ort. Marj). **Tablo:** Sıra|Ürün Kodu|Ürün Adı|Marka|Miktar|⚠️Ciro|⚠️Maliyet|⚠️Kâr|⚠️Kâr Marjı (renk eşik)|⚠️Ort.Fiyat|Müşteri (→product-customers). Sayfalama 50.

### 4.11.3 En İyi Müşteriler — `/reports/top-customers`
- Filtre (tarih/Sektör/Sıralama). **4 özet.** **Tablo:** Sıra|Müşteri Kodu|Müşteri Adı|Sektör|Sipariş|⚠️Ciro|⚠️Maliyet|⚠️Kâr|⚠️Kâr Marjı|⚠️Ort.Sipariş|En Çok Aldığı|Son Sipariş.

### 4.11.4 Kâr Marjı Analizi (019703) — `/reports/margin-compliance` (= /reports/profit-analysis, aynı içerik — Bölüm 5)
> En karmaşık rapor. ⚠️ Tüm özetler **KDV hariç**. (Kodda ağır mojibake — düzgün Türkçe yaz.)
- Üst: Excel İndir + Yenile. **Filtre:** Başlangıç/Bitiş (default dün) + ⚠️ Kâr Durumu (Tümü/Yüksek>30%/Normal 10-30%/Düşük<10%/Zarar<0%) + Sıralama + Ara + serbest arama + "Seçili Günü Yeniden Çek" + "Mail Gönder" + `<details>` ⚠️ "Hesaplamaya Dahil Sektör Kodları" (checkbox + Kaydet) + `<details>` "Kolonlar" (göster/gizle + Kaydet).
- **Özet:** 6 kart (Toplam Satır/Evrak/⚠️Satış Cirosu/⚠️Toplam Kâr Güncel/⚠️Toplam Kâr Son Giriş/⚠️Kâr% Güncel [Yüksek/Düşük/Zarar]) + ⚠️ Sipariş Özeti + Satış Özeti bucket'ları + ⚠️ **Satış Personeli Özeti** (iki seviyeli tablo: Sipariş grubu / Satış grubu × Ciro/Kâr/Kâr%/Zararlı Evrak/Zararlı Satır).
- **Detay tablosu (dinamik kolon):** Evrak No|Tip (Bekleyen Sipariş/Fatura)|Evrak Tarihi|Cari|Stok Kodu|Ürün Adı|Miktar|⚠️Birim Satış (KDV'li)|⚠️Tutar (KDV)|⚠️Güncel Maliyet|⚠️Birim Kâr|⚠️Toplam Kâr|⚠️Kâr% (renkli) + dinamik kolonlar. Marj rozeti: <0 Zarar / <10 Düşük / 10-30 Normal / >30 Yüksek.

### 4.11.5 Ürün Müşteri Detayı — `/reports/product-customers/[productCode]`
- "Geri Dön" + ürün kodu. **5 özet.** **Tablo:** Sıra|Müşteri Kodu|Müşteri Adı|Sektör|Sipariş|Miktar|⚠️Ciro|⚠️Kâr|⚠️Kâr Marjı|Son Sipariş.

### 4.11.6 Tamamlayıcı Ürün Eksikleri — `/reports/complement-missing`
- Filtre (Rapor Modu [Ürün/Cari] + Eşleşme Tipi + Ürün/Cari Ara + Tarih + Sektör + Temsilci + Min Evrak). 2 metrik. **Tablo:** Cari/Ürün (moda göre) | Evrak | Eksik Tamamlayıcılar (liste + miktar×fiyat) | ⚠️ Potansiyel Aylık Gelir | Adet | Aksiyon (Not Ekle/Kampanya Öner/Teklif Oluştur). Modal (Not/Kampanya).

### 4.11.7 Cari Geri Kazanım — `/reports/customer-recovery` (en karmaşık geri-kazanım)
- Hero (koyu gradient) + 5 HeroMetric (Riskli cari/Kayıp potansiyel/Aksiyon yok/Geciken takip/Dönemsel). **2 sekme:** Kayıp cari analizi / 2020 bugünkü değer analizi.
- **Senaryolar kartı:** 6 preset + Bana atananlar/Excel/Çalıştır. Filtre (Sektör/Temsilci/Min kayıp/Dönemsel/Alım ritmi/Sırala) + 3 checkbox + manuel ayarlar. **Tablo (sticky):** [seç] | Cari | Risk (rozet+skor) | Geçmiş ort. | Son ort. | Düşme% | Kayıp | Kayıp kategori | Son alım | Önerilen aksiyon | Takip (gelişme rozeti) | Detay. Sağ kolon: Risk dağılımı / Dönemsel ayrım / Toplu takip / Temsilci özeti.
- **Detay modal (full):** sol (4 DetailMetric + InsightBlock + aylık satış grafiği + kategori kaybı + son evraklar) + sağ (yeni aksiyon/not formu + aksiyon geçmişi inline durum güncelleme). **Historical sekmesi:** USD/TL değerleme tablosu.
- Risk rozetleri: NO_RECENT_SALES kırmızı / INSIGNIFICANT turuncu / DECLINING amber / WATCH mavi. Gelişme: RECOVERED/IMPROVED/UNCHANGED/WORSENED/NO_ACTION.

### 4.11.8 Bana Atanan Geri Kazanım — `/reports/customer-recovery/actions`
- Hero + "Toplam aksiyon". Filtre (Durum/Ara/geçen takip). **Tablo:** Cari | Aksiyon (rozetler+not) | Takip (Durum select+tarih) | Durum notu | Kaydet/Kapat.

### 4.11.9 Müşteri Sepetleri — `/reports/customer-carts`
- Filtre (Arama + "Boş sepetleri göster"). **Tablo:** Cari | Kullanıcı (+Alt Kullanıcı) | Kalem (Boş rozeti) | Miktar | ⚠️ Tutar | Son Güncelleme | genişlet. Genişleyen: Ürün Kodu/Ürün/Miktar/⚠️Birim Fiyat/⚠️Toplam/⚠️Fiyat Tipi (Beyaz/Faturalı + priceMode)/Güncelleme.

### 4.11.10 Müşteri Aktivite Takibi — `/reports/customer-activity`
- Filtre (Başlangıç/Bitiş/Cari Ara/Kullanıcı ID + Getir). **10 özet** (Toplam Olay/Tekil Kullanıcı/Sayfa/Ürün Görüntüleme/Sepet +/−/Güncelleme/Aktif Süre/Tıklama/Arama). 3 tablo (Sayfalar/Tıklanan/Ürünler) + En Aktif Kullanıcı + **Detaylı Olay Listesi** (Zaman/Tip[rozet]/Kullanıcı/Cari/Sayfa-Ürün/Adet/Süre/Tıklama + tip filtresi).

### 4.11.11 Personel Aktivite Takibi — `/reports/staff-activity`
- Filtre (Başlangıç/Bitiş/Rol/Route/User ID + Çalıştır). **4 özet** + Method Dağılımı (GET/POST/PUT/PATCH/DELETE). 2 tablo (Rotalar/Personeller) + **Event Detayı** (Tarih/Personel/Rol/Adım-Aksiyon[method rozeti]/Detay/Durum[status rozeti]/Süre).

### 4.11.12 Saha Ziyaretleri — `/reports/field-sales-visits`
- Hero (koyu radial) + filtre (Arama/Başlangıç/Bitiş/"Sadece ziyaret carileri"). **4 özet** (Toplam Not/Cari/Ziyaret Carisi Notu/Fotoğraflı). 2 kolon: Cari Bazlı Özet (kartlar) + Ziyaret Detayları (kartlar: cari/kod/şehir/tarih/personel/not/Talep/Rakip + Fotoğraf modal + Konum [Google Maps] + telefon).

### 4.11.13 Kategori Alım Kaybı — `/reports/category-churn`
- Filtre (Rapor Modu [Kategori/Cari] + Ara + Alım Yok Süresi [2/3/4/6/12 Ay] + Aktif Cari Filtresi). 3+3 metrik. **Tablo (sıralanabilir):** Cari/Kategori (moda göre) + Sektör + Son Alım Tarihi + Cari Son Satış + Geçmiş Evrak/Miktar/Tutar + Detay (genişler: ürün kırılımı).

### 4.11.14 Kategori Fırsat Önerileri — `/reports/category-opportunity`
- Filtre (Kategori* + Cari + Bakış süresi/Min ortak evrak/Cari limiti + Çalıştır). 4 özet. **Tablo:** Cari | Sektör | Toplam fırsat skoru | Öneri sayısı | Öne çıkan öneriler (+`<details>` kategori detayları).

---

## 4.12 — ÜÇARER DEPO & AİLE RAPORLARI

### 4.12.1 Üçarer Depo ve MinMax Modülü — `/reports/ucarer-depo` ⭐ (ağır operasyon ekranı)
**Amaç:** Mikro "Üçarer depo" karar raporunu çalıştırıp aile/aile-dışı önerilerden tedarikçi siparişi + depolar-arası transfer üret, MinMax hesaplat, maliyet/ana sağlayıcı/MinMax-dışlama Mikro yazma operasyonlarını yönet.
- **Kart 1 — Karar Raporu:** ⚠️ Depo (Merkez/Topca) + Satır limiti + "Raporu Getir" + "Excel'e Aktar" + "MinMax Hesaplanmayacaklar" linki + ⚠️ yeşil MinMax kutusu ("MinMax Çalıştır" + Excel + Toplam + job durumu) + ⚠️ Öneri Modu (MinMax Dahil 4.Sorun / Hariç 3.Sorun) + "Toplam: … / Mod'a Göre Önerilen: …".
- **Kart 2 — Aile Operasyon Paneli:** 3 sekme (Operasyon / Oluşturulan Siparişler (N) / İşlem Geçmişi).
  - **Operasyon:** "Aile Yönetimine Git" + 4'lü (Aile Sayısı + Toplu Sipariş Oluştur + Toplu Depolar Arası Sipariş + Aileleri Yenile) + ⚠️ fiyatsız stok uyarısı (pembe) + son oluşturulan siparişler (emerald + PDF).
  - **Aileler listesi:** arama + önerili aile kartları (ad/kod + "Öneri:N | Kalem:N" + Düzenle + Detay) + "Önerisiz Aileler (N)".
  - **Aktif Aile Paneli (Üçarer'in kalbi):** 3 metrik (⚠️İhtiyaç/Dağıtım/Kalan) + ⚠️ Yönlendirme Önerileri (ORDER emerald "Satışa Gönder" / DEPOT amber) + ⚠️ 11 operasyon kolonu aç/kapat + hızlı (Öneriye Göre Doldur/Eşit Dağıt/Sıfırla) + Dağıtım Modu (Tek/İki/Manuel) + **dağıtım tablosu** (sticky ilk 3, min 2200px, sıralanabilir): Seç | Stok Kodu (+ "Satış MinMax" / "Son Alınan Cariler" rozet-buton) | Ürün Adı | ⚠️ Sağlayıcı Kodu | Sağlayıcı Adı | ⚠️ Ana Sağlayıcı (+Güncelle) | Kalıcı Değiştir | ⚠️ MinMax Hesaplanmasın | Depo Miktarı | Topca | Alınan Sipariş (modal) | Verilen Sipariş | Reel Miktar | ⚠️Min | ⚠️Max | Koli İçi | ⚠️Maliyet KDV Hariç | ⚠️Maliyet KDV Dahil | ⚠️**Maliyet P/T** (T+P+KDV%+"10 liste"+Güncelle) | Aile Öneri | Dağıtım (input) | Fark.
- **Aile Dışı Öneriler** (ayrı kart): arama + ⚠️ Renk filtresi + Renk sırala + aynı kolonlar (Öneri+Dağıtım, Fark yok).
- **Alt sticky bar:** Toplu Sipariş Oluştur + Toplu Depolar Arası.
- ⚠️ **Aile/min-max mantığı:** net miktar = depo + verilen sipariş(bekleyen) − alınan sipariş(bekleyen); aile minimumu karşılanıyorsa öneri 0. Satır renkleri: diğer depo<ihtiyaç→kırmızı; transfer sonrası kalan≥min→yeşil; kalan<min→amber; fiyatsız→pembe; alınan siparişli→kalın. **TOPLU** sorumluluk merkezi min-max'a dahil DEĞİL.
- **Modallar:** Aileyi Düzenle, Sipariş PDF İndirme, Alınan Sipariş Detayı (Cari/Sipariş No/Miktar/Teslim/Kalan/Birim Fiyat/Tarih), ⚠️ Satış (MinMax)/Son Alınan Cariler (Cari/Evrak/Tarih/Miktar/Birim Fiyat/Tutar/Srm[TOPLU] + "Toplu yap"), ⚠️ Cari Bazında Sipariş Ayarları (Cari/Kalem/Miktar/Seri/Vergi/Teslim Türü/Tarih + ürün satırları fiyat override + Siparişleri Oluştur).
- "Oluşturulan Siparişler" + "İşlem Geçmişi" (audit) sekmeleri.

### 4.12.2 MinMax Hesaplanmayacaklar — `/reports/ucarer-minmax-exclusions`
- "Listeyi Yenile" + "Toplam: N". **Tablo:** Stok Kodu | Stok Adı | Model Kodu | Son 1/2/3 Ay Farklı Cari | İşlem (Hesaplamaya Al). Son 2 ayda >1 cariye satılan satır amber vurgulu.

### 4.12.3 Stok Aile Yönetimi — `/reports/product-families`
- "Yeni Aile". 2 kolon: sol Tanımlı Aileler (arama + kartlar [ad/kod + "N ürün" + Sil]) + sağ form (Aile Adı*/Kod/Not + Ürün Havuzu [arama + Ekle; başka ailede ise amber] + Seçilen Ürünler + Kaydet). (Min-max/stok kolonu yok — tanım ekranı.)

### 4.12.4 Fiyat Aile Yönetimi — `/reports/price-families`
- product-families ile aynı + ⚠️ "Aktif fiyat ailesi" checkbox + silme confirm. (Aynı maliyet tarihiyle takip edilecek stoklar.)

### 4.12.5 Fiyat Ailesi Maliyet Kontrolü — `/reports/price-family-costs`
- Üst: Fiyat Aileleri + Excel + Yenile. Filtre (Arama + Durum [Sadece sorunlular/Tüm/Kapalı] + "Pasif aileleri dahil"). **4 özet** (⚠️Sorunlu aile/Kapalı/⚠️Eski-eksik stok/⚠️Tarih yok). **Tablo:** Aile | Durum | Stok | ⚠️Sorunlu | ⚠️Tarih Dağılımı | En Eski/En Yeni | Aile detayı aç.
- **Aile Detayı modal:** hedef tarih + filtreler + **detay tablosu (resize):** Stok | Durum (Güncel/Tarih yok/Eski) | ⚠️Güncel Maliyet (tıkla→P'ye) | Güncel Maliyet Tarihi | Son Giriş | Son Giriş Tarihi | ⚠️Gün Farkı | ⚠️**Yeni Maliyet** (P+T+KDV%+"10 liste") | Güncelle + Son Maliyet Güncellemeleri audit. (⚠️ T = P×(1+KDV%/200).)

---

## 4.13 — AYARLAR

### 4.13.1 Kategori Fiyatlandırma — `/categories`
- Başlık + "N Kategori" + "Toplu Güncelleme". Arama. Her kategori kartı: başlık + kod rozeti + ⚠️ **CUSTOMER_TYPES (BAYI/PERAKENDE/VIP/OZEL) × kâr marjı %** (görüntü/düzenle + onay; değer /100 oranına çevrilir) + "⚡ Toplu Güncelle" (kategori). Üst "Toplu Güncelleme" paneli (tüm kategoriler × 4 segment + Uygula). Footer 4 metrik. (Onaylar gerçek dialog'a çevrilecek.)

### 4.13.2 Dışlama Kuralları — `/exclusions`
- "Yeni Kural". **Hızlı Ürün Dışlama** kartı (ürün arama + Dışla/Geri Al + "Aktif dışlanan: N"). **Kurallar tablosu:** Tip (Ürün/Cari Kodu/Cari/Ürün Adı/Sektör Kodu) | Değer (kod kutusu) | Açıklama | Durum (Aktif/Pasif toggle) | Tarih | İşlemler (Düzenle/Sil). **Modal:** Kural Tipi + Değer + Açıklama + (düzenle) Aktif. ConfirmDialog (Sil).

### 4.13.3 Personel Yönetimi — `/staff`
- "+ Yeni Kullanıcı". Personel kartları: ad + rol rozeti + Pasif + email + (SALES_REP) ⚠️ Sektörler rozetleri + oluşturulma + Düzenle. **Create modal:** İsim/Email/Şifre/Rol (SALES_REP/MANAGER/DEPOCU) + (SALES_REP) ⚠️ Sektör Kodları (select+Ekle+rozet). **Edit modal:** İsim/Email/Aktif + Sektör (rol+şifre yok). Rol rozetleri: ADMIN success/MANAGER info/SALES_REP warning/DEPOCU info; Pasif danger.

### 4.13.4 Rol İzin Yönetimi — `/role-permissions` (sadece HEAD_ADMIN)
- Rol sekmeleri (ADMIN/MANAGER/SALES_REP/DEPOCU/CUSTOMER/DIVERSEY). İzinler kategori gruplarına ayrılır (Dashboard Widget'ları / Raporlar / Admin Sayfaları). Her izin satırı: görünen ad + ham anahtar + açıklama + **toggle** (anında kaydeder). "Varsayılana Sıfırla" (ConfirmDialog). Bilgi kutusu (anında uygulanır / HEAD_ADMIN tam yetkili).

### 4.13.5 Sistem Ayarları — `/settings`
- **Kart 1 — Fazla Stok Hesaplama:** ⚠️ Hesaplama Periyodu (1/3/6 Ay) + ⚠️ Minimum Fazla Stok Eşiği + ⚠️ Maliyet Hesaplama Yöntemi (Son Giriş/Güncel/Dinamik); DYNAMIC→Gün Eşiği + ⚠️ Son Giriş Fiyatı Ağırlığı slider (+ örnek hesaplama).
- **Kart 2 — Fiyat Listesi Eşleşmesi:** her segment × ⚠️ Faturalı (Toptan 6–10) + Beyaz (Perakende 1–5).
- **Kart 3 — Rapor Mail Bildirimleri:** Kâr Marjı günlük mail (checkbox) + Alıcı Email'ler + Mail Konusu.
- Tek "Ayarları Kaydet". (Not: sync cron/dahil depolar bu ekranda YOK — backend env.)

---

# 5. TUTARSIZLIK & TEMİZLİK NOTLARI (tasarımda düzeltilecek / dikkat)

Bu noktalar mevcut kodda tespit edildi; yeni tasarımda düzeltilmeli veya en azından işaretlenmeli:

1. **İki rakip tasarım sistemi var.** CSS-değişken + utility (`--line`, `.btn-*`, `.badge-*`) **kanonik**; eski `components/ui/{Button,Input,Card}.tsx` `gray-200`/`shadow-sm` kullanıyor. Admin'de **CSS-değişken sistemini standart al**.
2. **Emoji ikonlar lucide'a çevrilecek.** Birçok admin ekranı 📦💰✏️📷🗑️✅⚠️🔄 emoji kullanıyor (özellikle Dashboard, Kategoriler, Override, Stok Açma). Hepsi **lucide-react** ikonlara dönüştürülecek (müşteri paneliyle tutarlı).
3. **Mojibake (bozuk Türkçe karakter):** `margin-compliance` / `profit-analysis` ekranında ağır ("Ä±", "ÅŸ", "₺" bozuk). Yeni tasarımda **tüm etiketler düzgün Türkçe**.
4. **`profit-analysis` ile `margin-compliance` birebir aynı ekran** (iki route, aynı içerik). Tasarımda ya tek ekran kabul et ya da ayrışmayı netleştir (kullanıcıya sor).
5. **Kampanya formunda hedefleme UI'ı yok** (customerTypes/categoryIds/productIds model'de var). Yeni tasarımda hedef ürün/kategori/müşteri tipi seçimi **eklenecek**.
6. **Ürün Override'da hardcoded `http://localhost:5000`** görsel önizleme — impl'de düzeltilecek (tasarımı etkilemez ama not).
7. **product-dimensions'ta `toast` import eksik** (runtime hata riski) — ayrı görev olarak işaretlendi; tasarımı etkilemez.
8. **Tasarım dili tutarsızlığı:** `field-sales-visits`, `customer-recovery`, `stock-create` farklı görsel diller (radial gradient, `rounded-[2rem]`, font-black) kullanıyor; diğerleri sade. **Hepsi tek tasarım diline** çekilecek.
9. **Vade alt sayfaları** ortak sekme/breadcrumb istiyor; **`/vade/calendar` gerçek takvim** ızgarasına dönüştürülebilir.
10. **Onay/diyaloglar:** Siparişler/Teklifler/Kategoriler'de onaylar "toast içi inline form" — gerçek modal/dialog'a çevir.

---

# 6. TESLİM SIRASI & ÖNCELİK (claude.ai'ye besleme planı)

Brief çok büyük; claude.ai context'ine sığması için **şu sırayla, parça parça** besle. Her batch'te Bölüm 1–3'ü (tasarım sistemi + shell + ortak desenler) referans olarak ekle.

**Batch 0 (önce bu):** Bölüm 1 (tasarım sistemi) + Bölüm 2 (shell) + Bölüm 3 (ortak desenler) → paylaşılan komponentler (header, sayfa başlığı, metrik kartı, standart tablo, filtre barı, badge, modal, boş/yükleniyor/hata).

**Batch 1 — En kritik & en sık kullanılan:**
1. Teklif Oluştur/Düzenle (`/quotes/new`) ⭐⭐⭐ — kalem tablosu en önemli ekran.
2. Teklif Listesi (`/quotes`), Siparişe Çevir, Teklif Kalemleri.
3. Siparişler (`/orders`), Sipariş Takip.
4. Dashboard.

**Batch 2 — Operasyon:**
5. Operasyon Merkezi, Saha Satış, Sıcak Satış.
6. Depo Kiosk, Perakende, Resim Hata, Ürün Ölçüleri.

**Batch 3 — Müşteri & Vade & Ürün:**
7. Müşteriler + Cari 360 + Portföy + Anlaşmalı + Cari Arama (+ CariSelectModal/CustomerInfoCard ortak).
8. Vade Takip (tüm alt sayfalar).
9. Ürün Yönetimi + Faturalar + Stok Açma + Stok Arama.

**Batch 4 — Maliyet & Raporlar:**
10. Tedarik Maliyetleri (+ iskonto + fiyat listeleri + cost-update'ler + fiyat geçmişi).
11. Rapor Merkezi + tüm raporlar.
12. Üçarer Depo + aile raporları.

**Batch 5 — Yönetim & ayarlar:**
13. Talepler + Kampanyalar + Bannerlar + Ürün Override.
14. Kategoriler + Dışlama + Personel + Rol İzinleri + Ayarlar.

**Her batch çıktısından sonra:** kullanıcı (Erdem) tasarımı görecek, "atlanan bir şey var mı / mantık bozulmuş mu" kontrolü yapacak; onaylanınca koda uygulanacak (müşteri panelinde yaptığımız gibi). Mobil tasarım EN SONA bırakıldı.
