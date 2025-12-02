# 🗄️ MİKRO ERP VERİTABANI ANALİZİ VE RAPOR ÖNERİLERİ

> **Tarih**: 2 Aralık 2025
> **Veritabanı**: MikroDB_V16_BKRC2020
> **Toplam Tablo Sayısı**: 2,618
> **Bağlantı Bilgileri**: backend/.env dosyasında mevcuttur

---

## 📊 VERİTABANI GENEL BİLGİLERİ

### Bağlantı Detayları
- **Server**: 185.123.54.61
- **Port**: 16022
- **Database**: MikroDB_V16_BKRC2020
- **Kullanıcı**: BkrcWebL1RgcVc4YexP3LRfWZ6W

### Veritabanı Yapısı
- **MSSQL Server** tabanlı
- **2,618 tablo** içeriyor
- Her tabloda standart kolonlar:
  - `_Guid`: uniqueidentifier (Primary Key)
  - `_DBCno`: smallint
  - `_iptal`: bit (silindi mi?)
  - `_create_date`: datetime
  - `_lastup_date`: datetime

---

## 🎯 TEMEL TABLOLAR (Şu Anda Kullanılanlar)

### 1. STOKLAR (Ürünler)
**Kullanım**: Ürün bilgileri, fiyatlar, maliyetler
**Satır Sayısı**: ~4,000+
**Backend Mapping**: `backend/src/config/mikro-tables.ts`

#### Önemli Kolonlar:
```
sto_kod              nvarchar(25)      # Ürün kodu (örn: "B108195")
sto_isim             nvarchar(127)     # Ürün adı
sto_kategori_kodu    nvarchar(25)      # Kategori kodu
sto_birim1_ad        nvarchar(10)      # Birim (Adet, KG, vb.)
sto_standartmaliyet  float             # Standart maliyet (güncel maliyet)
sto_toptan_Vergi     tinyint           # KDV kodu (0-7)
sto_pasif_fl         bit               # Pasif mi? (false=aktif)
sto_maliyet_tarih    datetime          # Maliyet güncellenme tarihi
sto_min_stok         float             # Minimum stok seviyesi
sto_max_stok         float             # Maksimum stok seviyesi
```

#### Rapor Kullanımları:
- ✅ Zarar edilen ürünler (satış fiyatı < maliyet)
- ✅ Maliyet güncellenmemiş ürünler
- ✅ Pasif ürünler
- ✅ Kategori bazlı analiz

---

### 2. STOK_KATEGORILERI
**Kullanım**: Ürün kategorileri
**Satır Sayısı**: ~100+

#### Önemli Kolonlar:
```
ktg_kod              nvarchar(25)      # Kategori kodu
ktg_isim             nvarchar(50)      # Kategori adı
```

---

### 3. STOK_HAREKETLERI (Stok Giriş/Çıkış)
**Kullanım**: Stok hareketleri, satış geçmişi
**Satır Sayısı**: 100,000+

#### Önemli Kolonlar:
```
sth_stok_kod         nvarchar(25)      # Ürün kodu
sth_miktar           float             # Miktar
sth_tip              tinyint           # Hareket tipi (0=Giriş, 1=Çıkış, vb.)
sth_tarih            datetime          # Hareket tarihi
sth_depo_no          smallint          # Depo numarası (1, 2, 6, 7)
sth_fiyat            float             # İşlem fiyatı
sth_masraf_merk      nvarchar(25)      # Masraf merkezi
```

#### Rapor Kullanımları:
- ✅ Hareketsiz stoklar (son X gün hareket yok)
- ✅ En çok satan ürünler
- ✅ Stok devir hızı
- ✅ Depo bazlı stok dağılımı

---

### 4. CARI_HESAPLAR (Müşteriler/Cariler)
**Kullanım**: Müşteri bilgileri
**Satır Sayısı**: ~1,000+

#### Önemli Kolonlar:
```
cari_kod             nvarchar(25)      # Cari kodu (örn: "120.05.125")
cari_unvan1          nvarchar(127)     # Firma adı
cari_unvan2          nvarchar(127)     # Firma adı devamı
cari_EMail           nvarchar(80)      # E-posta
cari_sektor_kodu     nvarchar(25)      # Sektör (örn: "satıcı" = tedarikçi)
cari_vdaire_adi      nvarchar(30)      # Vergi dairesi
cari_vdaire_no       nvarchar(15)      # Vergi numarası
cari_il              nvarchar(15)      # İl
cari_ilce            nvarchar(15)      # İlçe
cari_bakiye          float             # Cari bakiye (alacak/borç)
cari_kredilimiti     float             # Kredi limiti
```

#### Rapor Kullanımları:
- ✅ Yüksek riskli cariler (limit aşımı)
- ✅ Vade aşımı olan cariler
- ✅ İl/ilçe bazlı müşteri dağılımı
- ✅ En çok alışveriş yapan müşteriler
- ✅ Kayıp müşteriler (uzun süre alışveriş yapmayan)

---

### 5. SIPARISLER (Siparişler)
**Kullanım**: Müşteri siparişleri
**Satır Sayısı**: ~150,000+ (her satır bir sipariş kalemi)

#### Önemli Kolonlar:
```
sip_evrakno_seri     nvarchar(20)      # Seri (örn: "HENDEK", "ADAPAZARI")
sip_evrakno_sira     int               # Sıra numarası (örn: 8162)
sip_satirno          smallint          # Satır no (0, 1, 2...)
sip_tarih            datetime          # Sipariş tarihi
sip_teslim_tarih     datetime          # Planlanan teslimat
sip_musteri_kod      nvarchar(25)      # Müşteri kodu
sip_stok_kod         nvarchar(25)      # Ürün kodu
sip_miktar           float             # Sipariş miktarı
sip_teslim_miktar    float             # Teslim edilen miktar
sip_b_fiyat          float             # Birim fiyat
sip_tutar            float             # Satır toplamı (KDV hariç)
sip_vergi            float             # KDV tutarı
sip_iptal            bit               # İptal edildi mi?
sip_kapat_fl         bit               # Kapatıldı mı?
sip_tip              tinyint           # Sipariş tipi
sip_cins             tinyint           # Sipariş cinsi
```

#### Rapor Kullanımları:
- ✅ Vade geçmiş siparişler
- ✅ Kısmi teslim edilmiş siparişler
- ✅ Bekleyen siparişler
- ✅ Aylık sipariş trendi
- ✅ Müşteri bazlı sipariş analizi

---

## 💡 DİĞER ÖNEMLİ TABLOLAR (Raporlarda Kullanılabilir)

### 6. STOK_FIYAT_LISTELERI
**Kullanım**: Farklı fiyat listelerini tutar
**İçerik**: Toptan, perakende, kampanya fiyatları

```
fiy_stokkod          nvarchar(25)      # Ürün kodu
fiy_listesirano      smallint          # Liste no (1, 2, 3...)
fiy_fiyati           float             # Fiyat
fiy_doviz            tinyint           # Döviz cinsi
```

---

### 7. CARI_HESAP_HAREKETLERI
**Kullanım**: Cari hesap hareketleri (borç/alacak)
**Satır Sayısı**: 100,000+

```
cha_kod              nvarchar(25)      # Cari kodu
cha_evrak_tip        tinyint           # Evrak tipi
cha_tarihi           datetime          # İşlem tarihi
cha_vade_tarihi      datetime          # Vade tarihi
cha_meblag           float             # Tutar
cha_d_c              tinyint           # Borç/Alacak (0=Borç, 1=Alacak)
```

#### Rapor Kullanımları:
- ✅ Vade aşımı uyarısı
- ✅ Tahsilat tahmini
- ✅ Cari yaşlandırma raporu

---

### 8. BANKA_ONLINE_HAREKETLER
**Kullanım**: Banka hareketleri
**Satır Sayısı**: 55,512

```
boh_ban_kod          nvarchar(25)      # Banka kodu
boh_tx_date          datetime          # İşlem tarihi
boh_tx_amount        float             # Tutar
boh_tx_type          nvarchar(127)     # İşlem tipi
```

---

### 9. ALINAN_TEKLIFLER
**Kullanım**: Tedarikçilerden alınan teklifler
**Satır Sayısı**: 54,348

```
altkl_teklif_kodu    nvarchar(25)      # Teklif kodu
altkl_sira_no        int               # Sıra no
altkl_tarih          datetime          # Teklif tarihi
altkl_cari_kodu      nvarchar(25)      # Tedarikçi kodu
altkl_tutar          float             # Teklif tutarı
```

---

### 10. BARKOD_TANIMLARI
**Kullanım**: Ürün barkodları
**Satır Sayısı**: 4,602

```
bar_kodu             nvarchar(50)      # Barkod
bar_stokkodu         nvarchar(25)      # Ürün kodu
```

---

### 11. BUTCE_DETAY & BUTCE_MASTER
**Kullanım**: Bütçe planlaması
**Detay Satır**: 61,248
**Master Satır**: 9

```
bd_butcekodu         nvarchar(25)      # Bütçe kodu
bd_sh_detay_kodu     nvarchar(25)      # Stok/hizmet kodu
bd_miktar            float             # Planlanan miktar
bd_tutar             float             # Planlanan tutar
```

---

## 🚀 ÖNERİLEN RAPORLAR VE HANGİ TABLOLAR KULLANILACAK

### 📦 STOK/ÜRÜN RAPORLARI

#### 1. **Zarar Edilen Ürünler Raporu**
**Tablolar**: `STOKLAR`, `STOK_FIYAT_LISTELERI`
```sql
SELECT sto_kod, sto_isim, sto_standartmaliyet, fiy_fiyati,
       (fiy_fiyati - sto_standartmaliyet) AS zarar
FROM STOKLAR S
JOIN STOK_FIYAT_LISTELERI F ON S.sto_kod = F.fiy_stokkod
WHERE fiy_fiyati < sto_standartmaliyet
  AND sto_pasif_fl = 0
ORDER BY zarar ASC
```

---

#### 2. **Maliyet Güncellenmemiş Ürünler**
**Tablolar**: `STOKLAR`, `STOK_HAREKETLERI`
```sql
SELECT sto_kod, sto_isim,
       sto_maliyet_tarih AS maliyet_tarihi,
       MAX(sth_tarih) AS son_giris_tarihi,
       DATEDIFF(day, sto_maliyet_tarih, MAX(sth_tarih)) AS gun_farki
FROM STOKLAR S
JOIN STOK_HAREKETLERI H ON S.sto_kod = H.sth_stok_kod
WHERE sth_tip = 0  -- Giriş hareketleri
  AND sto_maliyet_tarih < MAX(sth_tarih)
GROUP BY sto_kod, sto_isim, sto_maliyet_tarih
ORDER BY gun_farki DESC
```

---

#### 3. **Kritik Stok Seviyesi**
**Tablolar**: `STOKLAR`, `STOK_HAREKETLERI`
```sql
SELECT s.sto_kod, s.sto_isim,
       SUM(CASE WHEN sth_tip = 0 THEN sth_miktar ELSE -sth_miktar END) AS mevcut_stok,
       s.sto_min_stok,
       (SUM(...) - s.sto_min_stok) AS fark
FROM STOKLAR s
LEFT JOIN STOK_HAREKETLERI h ON s.sto_kod = h.sth_stok_kod
WHERE s.sto_min_stok > 0
GROUP BY s.sto_kod, s.sto_isim, s.sto_min_stok
HAVING SUM(...) < s.sto_min_stok
```

---

#### 4. **Hareketsiz Stoklar (Son 90 Gün)**
**Tablolar**: `STOKLAR`, `STOK_HAREKETLERI`
```sql
SELECT s.sto_kod, s.sto_isim,
       MAX(h.sth_tarih) AS son_hareket,
       DATEDIFF(day, MAX(h.sth_tarih), GETDATE()) AS gun_farki,
       SUM(...) AS stok_miktari
FROM STOKLAR s
LEFT JOIN STOK_HAREKETLERI h ON s.sto_kod = h.sth_stok_kod
GROUP BY s.sto_kod, s.sto_isim
HAVING MAX(h.sth_tarih) < DATEADD(day, -90, GETDATE())
  OR MAX(h.sth_tarih) IS NULL
```

---

#### 5. **Depo Bazlı Stok Dağılımı**
**Tablolar**: `STOK_HAREKETLERI`
```sql
SELECT sth_stok_kod,
       SUM(CASE WHEN sth_depo_no = 1 THEN miktar ELSE 0 END) AS Depo1,
       SUM(CASE WHEN sth_depo_no = 2 THEN miktar ELSE 0 END) AS Depo2,
       SUM(CASE WHEN sth_depo_no = 6 THEN miktar ELSE 0 END) AS Depo6,
       SUM(CASE WHEN sth_depo_no = 7 THEN miktar ELSE 0 END) AS Depo7,
       SUM(miktar) AS Toplam
FROM STOK_HAREKETLERI
GROUP BY sth_stok_kod
```

---

#### 6. **En Çok Satan Ürünler (Son 6 Ay)**
**Tablolar**: `STOK_HAREKETLERI`, `STOKLAR`
```sql
SELECT h.sth_stok_kod, s.sto_isim,
       SUM(h.sth_miktar) AS toplam_satis,
       COUNT(DISTINCT h.sth_tarih) AS satis_gun_sayisi
FROM STOK_HAREKETLERI h
JOIN STOKLAR s ON h.sth_stok_kod = s.sto_kod
WHERE h.sth_tip = 1  -- Çıkış
  AND h.sth_tarih >= DATEADD(month, -6, GETDATE())
GROUP BY h.sth_stok_kod, s.sto_isim
ORDER BY toplam_satis DESC
```

---

### 👥 CARİ/MÜŞTERİ RAPORLARI

#### 7. **Vade Aşımı Uyarısı**
**Tablolar**: `CARI_HESAP_HAREKETLERI`, `CARI_HESAPLAR`
```sql
SELECT c.cari_kod, c.cari_unvan1,
       SUM(h.cha_meblag) AS toplam_borc,
       MIN(h.cha_vade_tarihi) AS en_eski_vade,
       DATEDIFF(day, MIN(h.cha_vade_tarihi), GETDATE()) AS gecikme_gun
FROM CARI_HESAP_HAREKETLERI h
JOIN CARI_HESAPLAR c ON h.cha_kod = c.cari_kod
WHERE h.cha_vade_tarihi < GETDATE()
  AND h.cha_d_c = 0  -- Borç
GROUP BY c.cari_kod, c.cari_unvan1
HAVING SUM(h.cha_meblag) > 0
ORDER BY gecikme_gun DESC
```

---

#### 8. **Kredili Satış Limiti Dolmuş Cariler**
**Tablolar**: `CARI_HESAPLAR`
```sql
SELECT cari_kod, cari_unvan1,
       cari_bakiye,
       cari_kredilimiti,
       (cari_bakiye / cari_kredilimiti * 100) AS doluluk_orani
FROM CARI_HESAPLAR
WHERE cari_kredilimiti > 0
  AND cari_bakiye >= cari_kredilimiti * 0.9  -- %90 dolu
ORDER BY doluluk_orani DESC
```

---

#### 9. **En Çok Alışveriş Yapan Müşteriler**
**Tablolar**: `SIPARISLER`, `CARI_HESAPLAR`
```sql
SELECT s.sip_musteri_kod, c.cari_unvan1,
       COUNT(DISTINCT CONCAT(sip_evrakno_seri, '-', sip_evrakno_sira)) AS siparis_sayisi,
       SUM(sip_tutar + sip_vergi) AS toplam_ciro,
       AVG(sip_tutar + sip_vergi) AS ortalama_siparis
FROM SIPARISLER s
JOIN CARI_HESAPLAR c ON s.sip_musteri_kod = c.cari_kod
WHERE sip_tarih >= DATEADD(month, -12, GETDATE())
  AND sip_iptal = 0
GROUP BY s.sip_musteri_kod, c.cari_unvan1
ORDER BY toplam_ciro DESC
```

---

#### 10. **Kayıp Müşteriler (6 Ay+ Alışveriş Yok)**
**Tablolar**: `SIPARISLER`, `CARI_HESAPLAR`
```sql
SELECT c.cari_kod, c.cari_unvan1,
       MAX(s.sip_tarih) AS son_siparis,
       DATEDIFF(day, MAX(s.sip_tarih), GETDATE()) AS gun_farki,
       SUM(sip_tutar + sip_vergi) AS eski_ciro
FROM CARI_HESAPLAR c
LEFT JOIN SIPARISLER s ON c.cari_kod = s.sip_musteri_kod
GROUP BY c.cari_kod, c.cari_unvan1
HAVING MAX(s.sip_tarih) < DATEADD(month, -6, GETDATE())
  AND SUM(sip_tutar + sip_vergi) > 0
ORDER BY gun_farki DESC
```

---

#### 11. **İl Bazlı Satış Raporu**
**Tablolar**: `CARI_HESAPLAR`, `SIPARISLER`
```sql
SELECT c.cari_il,
       COUNT(DISTINCT c.cari_kod) AS musteri_sayisi,
       SUM(s.sip_tutar + s.sip_vergi) AS toplam_satis,
       AVG(s.sip_tutar + s.sip_vergi) AS ortalama_siparis
FROM CARI_HESAPLAR c
LEFT JOIN SIPARISLER s ON c.cari_kod = s.sip_musteri_kod
WHERE s.sip_tarih >= DATEADD(year, -1, GETDATE())
GROUP BY c.cari_il
ORDER BY toplam_satis DESC
```

---

### 📋 SİPARİŞ RAPORLARI

#### 12. **Vade Geçmiş Siparişler**
**Tablolar**: `SIPARISLER`, `STOKLAR`
```sql
SELECT
       CONCAT(sip_evrakno_seri, '-', sip_evrakno_sira) AS siparis_no,
       sip_musteri_kod,
       sip_stok_kod,
       s.sto_isim,
       sip_tarih,
       sip_teslim_tarih,
       DATEDIFF(day, sip_teslim_tarih, GETDATE()) AS gecikme_gun,
       sip_miktar,
       sip_teslim_miktar,
       (sip_miktar - sip_teslim_miktar) AS kalan_miktar
FROM SIPARISLER sp
JOIN STOKLAR s ON sp.sip_stok_kod = s.sto_kod
WHERE sip_teslim_tarih < GETDATE()
  AND sip_miktar > sip_teslim_miktar
  AND sip_iptal = 0
  AND sip_kapat_fl = 0
ORDER BY gecikme_gun DESC
```

---

#### 13. **Kısmi Teslim Edilmiş Siparişler**
**Tablolar**: `SIPARISLER`
```sql
SELECT
       CONCAT(sip_evrakno_seri, '-', sip_evrakno_sira) AS siparis_no,
       sip_stok_kod,
       sip_miktar,
       sip_teslim_miktar,
       (sip_miktar - sip_teslim_miktar) AS kalan,
       (sip_teslim_miktar / sip_miktar * 100) AS teslim_orani
FROM SIPARISLER
WHERE sip_teslim_miktar > 0
  AND sip_teslim_miktar < sip_miktar
  AND sip_iptal = 0
ORDER BY sip_tarih DESC
```

---

#### 14. **Aylık Sipariş Trendi**
**Tablolar**: `SIPARISLER`
```sql
SELECT
       YEAR(sip_tarih) AS yil,
       MONTH(sip_tarih) AS ay,
       COUNT(DISTINCT CONCAT(sip_evrakno_seri, '-', sip_evrakno_sira)) AS siparis_sayisi,
       SUM(sip_tutar + sip_vergi) AS toplam_tutar
FROM SIPARISLER
WHERE sip_iptal = 0
  AND sip_tarih >= DATEADD(year, -2, GETDATE())
GROUP BY YEAR(sip_tarih), MONTH(sip_tarih)
ORDER BY yil DESC, ay DESC
```

---

## 🛠️ BACKEND ENTEGRASYON

### Şu Anki Mapping
Dosya: `backend/src/config/mikro-tables.ts`

```typescript
export const MIKRO_TABLES = {
  // Kategoriler
  CATEGORIES: 'STOK_KATEGORILERI',
  CATEGORIES_COLUMNS: { CODE: 'ktg_kod', NAME: 'ktg_isim' },

  // Ürünler
  PRODUCTS: 'STOKLAR',
  PRODUCTS_COLUMNS: {
    CODE: 'sto_kod',
    NAME: 'sto_isim',
    CATEGORY_CODE: 'sto_kategori_kodu',
    UNIT: 'sto_birim1_ad',
    VAT_RATE: 'sto_toptan_Vergi',
    CURRENT_COST: 'sto_standartmaliyet',
    PASSIVE: 'sto_pasif_fl',
  },

  // Stok Hareketleri
  STOCK_MOVEMENTS: 'STOK_HAREKETLERI',
  STOCK_MOVEMENTS_COLUMNS: {
    PRODUCT_CODE: 'sth_stok_kod',
    QUANTITY: 'sth_miktar',
    MOVEMENT_TYPE: 'sth_tip',
    DATE: 'sth_tarih',
    WAREHOUSE_NO: 'sth_depo_no',
  },

  // Siparişler
  ORDERS: 'SIPARISLER',
  ORDERS_COLUMNS: {
    ORDER_SERIES: 'sip_evrakno_seri',
    ORDER_SEQUENCE: 'sip_evrakno_sira',
    LINE_NO: 'sip_satirno',
    DATE: 'sip_tarih',
    DELIVERY_DATE: 'sip_teslim_tarih',
    CUSTOMER_CODE: 'sip_musteri_kod',
    PRODUCT_CODE: 'sip_stok_kod',
    QUANTITY: 'sip_miktar',
    DELIVERED_QUANTITY: 'sip_teslim_miktar',
    UNIT_PRICE: 'sip_b_fiyat',
    LINE_TOTAL: 'sip_tutar',
    VAT: 'sip_vergi',
    CANCELLED: 'sip_iptal',
    CLOSED: 'sip_kapat_fl',
  },

  // Cariler
  CARI: 'CARI_HESAPLAR',
  CARI_COLUMNS: {
    CODE: 'cari_kod',
    NAME: 'cari_unvan1',
    EMAIL: 'cari_EMail',
    SECTOR_CODE: 'cari_sektor_kodu',
  },
};
```

---

## 📝 YENİ RAPOR EKLEMEKıçın ADIMLAR

### 1. Backend'e Yeni Service Ekle
```typescript
// backend/src/services/mikro-reports.service.ts

import * as sql from 'mssql';
import { config } from '../config';

export async function getZararEdilenUrunler() {
  const pool = await sql.connect(config.mikro);

  const query = `
    SELECT
      sto_kod AS productCode,
      sto_isim AS productName,
      sto_standartmaliyet AS currentCost,
      -- fiyat listesi join gerekli
      -- ...
    FROM STOKLAR
    WHERE sto_pasif_fl = 0
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}
```

### 2. Controller Oluştur
```typescript
// backend/src/controllers/reports.controller.ts

export const getProductLossReport = async (req: Request, res: Response) => {
  try {
    const data = await getZararEdilenUrunler();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

### 3. Route Ekle
```typescript
// backend/src/routes/reports.routes.ts

router.get('/products/loss', getProductLossReport);
```

### 4. Frontend'de UI Oluştur
```typescript
// frontend/app/(dashboard)/admin/reports/products/loss/page.tsx

export default function ProductLossReportPage() {
  // API çağrısı, tablo, grafikler, export butonları
}
```

---

## ⚠️ ÖNEMLİ NOTLAR

### Performans
- Büyük tablolarda (100k+ satır) **pagination** kullan
- **Indexleme** için DBA ile görüş
- Karmaşık sorgularda **materialized view** değerlendir

### Güvenlik
- Mikro veritabanına **sadece okuma** yetkisi kullan
- SQL Injection'a karşı **parameterized queries** kullan
- Hassas bilgileri loglama

### Veri Güncelliği
- Mikro ERP'de yapılan değişiklikler **anında** yansımaz
- Raporlar için **cache** mekanizması kurulabilir
- Kritik raporlar için **real-time** sorgu yapılabilir

---

## 🎯 ÖNCELİKLİ RAPOR LİSTESİ (İlk 10)

1. ✅ **Zarar Edilen Ürünler** - STOKLAR + STOK_FIYAT_LISTELERI
2. ✅ **Maliyet Güncellenmemiş Ürünler** - STOKLAR + STOK_HAREKETLERI
3. ✅ **Kritik Stok Seviyesi** - STOKLAR + STOK_HAREKETLERI
4. ✅ **Hareketsiz Stoklar** - STOKLAR + STOK_HAREKETLERI
5. ✅ **Vade Aşımı Uyarısı** - CARI_HESAP_HAREKETLERI + CARI_HESAPLAR
6. ✅ **En Çok Satan Ürünler** - STOK_HAREKETLERI + STOKLAR
7. ✅ **Vade Geçmiş Siparişler** - SIPARISLER
8. ✅ **Kayıp Müşteriler** - SIPARISLER + CARI_HESAPLAR
9. ✅ **Ürün Karlılık Raporu** - SIPARISLER + STOKLAR + STOK_HAREKETLERI
10. ✅ **Stok Devir Hızı** - STOK_HAREKETLERI + STOKLAR

---

## 📚 EK BİLGİLER

### Tüm Tablo Listesi
Toplam 2,618 tablo mevcuttur. Önemli bazıları:

- **ALINAN_TEKLIFLER** (54,348 satır) - Tedarikçi teklifleri
- **BANKA_ONLINE_HAREKETLER** (55,512 satır) - Banka hareketleri
- **BARKOD_TANIMLARI** (4,602 satır) - Ürün barkodları
- **BUTCE_DETAY** (61,248 satır) - Bütçe detayları
- **CARI_HESAP_HAREKETLERI** (100k+) - Cari borç/alacak
- **SIPARISLER** (150k+) - Siparişler
- **STOK_HAREKETLERI** (100k+) - Stok giriş/çıkış
- **STOKLAR** (4k+) - Ürünler
- **CARI_HESAPLAR** (1k+) - Müşteriler

### Tam Veritabanı Dökümü
Tüm tabloların detaylı analizi şu dosyada bulunabilir:
- `mikro-complete-analysis.txt` (oluşturulma aşamasında)

---

**Son Güncelleme**: 2 Aralık 2025
**Hazırlayan**: Claude Code Assistant
**Proje**: Bakırcılar B2B Sipariş Sistemi
