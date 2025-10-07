# MIKRO B2B SİPARİŞ SİSTEMİ - DETAYLI PROJE TANIMI

## İÇİNDEKİLER
1. Genel Bakış ve Proje Amacı
2. Şirket Altyapısı ve Kısıtlamalar
3. İş Gereksinimleri (Business Requirements)
4. Teknik Mimari ve Stack
5. Mikro ERP Entegrasyonu Detayları
6. Veritabanı Yapısı
7. Backend API Detayları
8. Frontend Sayfa Detayları
9. İş Akışları ve Senaryolar
10. Güvenlik ve Performans
11. Deployment Planı
12. Bora Abi'ye Sorulacak Sorular

---

## 1. GENEL BAKIŞ VE PROJE AMACI

### Proje Nedir?
Mikro ERP kullanan bir şirket için B2B sipariş platformu. Müşteriler sisteme giriş yapıp fazla stok ürünlerini görüp sipariş verebilecek. Siparişler otomatik olarak Mikro ERP'ye yazılacak.

### Neden Bu Proje Gerekli?
- Şirket fazla stoklarını müşterilere satmak istiyor
- Manuel sipariş alma süreci yavaş ve hataya açık
- Müşteri bazlı farklı fiyatlandırma gerekiyor
- Mikro ERP'de manuel sipariş girişi zaman alıyor

### Temel Özellikler
1. **Fazla Stok Yönetimi**: Otomatik hesaplama ve gösterim
2. **Dinamik Fiyatlandırma**: 4 müşteri tipi × 2 fiyat tipi = 8 farklı fiyat
3. **Otomatik Senkronizasyon**: Saatlik Mikro ERP senkronizasyonu
4. **Sipariş Otomasyonu**: Onaylanan siparişler otomatik Mikro'ya yazılır
5. **🔴 KRİTİK: 2 AYRI SİPARİŞ SİSTEMİ**: Bir sepette hem faturalı hem beyaz ürün varsa, Mikro'ya 2 AYRI sipariş olarak yazılır (Faturalı ürünler → KDV'li sipariş, Beyaz ürünler → KDV=0 sipariş)
6. **Stok Kontrolü**: Sipariş öncesi anlık stok kontrolü

---

## 2. ŞİRKET ALTYAPISI VE KISITLAMALAR

### Mevcut Sistem
- **ERP**: Mikro ERP (Türkiye'de yaygın kullanılan muhasebe/ERP yazılımı)
- **Kurulum**: Remote desktop sunucusunda çalışıyor
- **Erişim**: Sadece MSSQL veritabanına bağlantı mümkün
- **ÖNEMLI**: Mikro'nun bir API'si YOK. Sadece SQL sorguları ile veri çekip yazabiliyoruz.

### Mikro Bayi Desteği
- Mikro bayisi: Bora Abi
- Bora abi SQL bağlantı bilgilerini verecek
- Tablo isimlerini ve yapısını Bora abi ile doğrulamak gerekli

### Teknik Kısıtlamalar
1. Mikro ERP'nin API'si olmadığı için tüm entegrasyon SQL sorguları ile yapılacak
2. Mikro veritabanına sadece READ yetkisi olabilir (INSERT için prosedür kullanma gerekebilir)
3. Mikro'nun tablo yapısı standart değil, her firma farklı olabilir

---

## 3. İŞ GEREKSİNİMLERİ (BUSINESS REQUIREMENTS)

### 3.1 Fazla Stok Hesaplama

#### Amaç
Hangi ürünlerden fazla stok olduğunu belirlemek ve sadece o ürünleri müşterilere göstermek.

#### Hesaplama Formülü
```
Fazla Stok = (Depo Stoku) - (X aylık satış) + (Beklenen Satınalma Siparişleri) - (Beklenen Müşteri Siparişleri)
```

#### Ayarlanabilir Parametreler (Admin tarafından)
1. **Hesaplama Periyodu**: 1 ay, 3 ay, veya 6 aylık satış ortalaması
2. **Dahil Edilecek Depolar**: Hangi depoların stoku hesaba katılacak
3. **Minimum Fazla Stok Eşiği**: Örneğin 10 adetten az fazla stok varsa gösterme

#### Veri Kaynakları (Mikro'dan Çekilecek)
- `sto_miktar` tablosu: Depo bazlı stok miktarları
- `hareketler` tablosu: Geçmiş satış hareketleri (son 6 ay)
- `siparis_hareketleri` tablosu: Bekleyen satınalma ve satış siparişleri

#### Örnek Senaryo
```
Ürün: Laptop HP 15
Depo1 Stok: 100 adet
Depo2 Stok: 50 adet
3 aylık ortalama satış: 40 adet/ay × 3 = 120 adet
Bekleyen satınalma: 20 adet gelecek
Bekleyen müşteri siparişi: 10 adet

Fazla Stok = (100 + 50) - 120 + 20 - 10 = 40 adet

Sonuç: Bu üründen 40 adet fazla var, B2B sitede gösterilecek.
```

### 3.2 Dinamik Fiyatlandırma Sistemi

#### 4 Müşteri Tipi
1. **BAYI**: Bayilik yapan firmalar
2. **PERAKENDE**: Normal perakende müşteriler
3. **VIP**: Özel anlaşmalı büyük müşteriler
4. **OZEL**: Diğer özel durumlar

#### 2 Fiyat Tipi
1. **Faturalı (INVOICED)**: Normal faturalı satış, KDV hariç fiyat gösterilir
2. **Beyaz (WHITE)**: Faturasız/yarı fatura satış, "beyaz eşya" mantığı

#### Toplam 8 Farklı Fiyat
Her ürün için:
- Bayi Faturalı
- Bayi Beyaz
- Perakende Faturalı
- Perakende Beyaz
- VIP Faturalı
- VIP Beyaz
- Özel Faturalı
- Özel Beyaz

#### Fiyatlandırma Formülleri

**Faturalı Fiyat:**
```
Faturalı Fiyat = Maliyet × (1 + Kar Marjı)
```
Örnek: Maliyet 100 TL, Kar Marjı %25 → Faturalı Fiyat = 100 × 1.25 = 125 TL

**Beyaz Fiyat:**
```
Beyaz Fiyat = Maliyet × (1 + KDV/2)
```
Örnek: Maliyet 100 TL, KDV %20 → Beyaz Fiyat = 100 × 1.10 = 110 TL

#### Kar Marjı Belirleme
1. **Kategori Bazlı**: Her kategori için 4 müşteri tipinin kar marjı belirlenir
2. **Ürün Bazlı Override**: Belirli ürünler için özel kar marjı tanımlanabilir

Öncelik sırası: Ürün Override > Kategori Marjı

#### Maliyet Belirleme (3 Yöntem)
Admin ayarlardan seçer:

1. **Son Giriş Fiyatı (lastEntryPrice)**: Mikro'dan son alış fiyatı
2. **Güncel Maliyet (currentCost)**: Mikro'nun hesapladığı güncel maliyet
3. **Ortalama Maliyet**: Belirli periyotta alınan ürünlerin ortalama maliyeti

#### Örnek Fiyatlandırma Senaryosu
```
Ürün: Mouse Logitech
Kategori: Bilgisayar Aksesuarları
Maliyet: 100 TL
KDV: %20

Kategori Kar Marjları:
- BAYI: %15
- PERAKENDE: %25
- VIP: %10
- OZEL: %20

Hesaplanan Fiyatlar:
1. Bayi Faturalı: 100 × 1.15 = 115 TL
2. Bayi Beyaz: 100 × 1.10 = 110 TL
3. Perakende Faturalı: 100 × 1.25 = 125 TL
4. Perakende Beyaz: 100 × 1.10 = 110 TL
5. VIP Faturalı: 100 × 1.10 = 110 TL
6. VIP Beyaz: 100 × 1.10 = 110 TL
7. Özel Faturalı: 100 × 1.20 = 120 TL
8. Özel Beyaz: 100 × 1.10 = 110 TL

NOT: Beyaz fiyat sadece KDV'ye bağlı olduğu için tüm müşteri tiplerinde aynı olabilir.
```

### 3.3 Kullanıcı Yönetimi

#### Roller
1. **Admin (Süper Admin)**: Tüm yetkilere sahip
2. **Müşteri (Customer)**: Sadece ürün görüntüleme ve sipariş verme

#### Müşteri Kaydı NASIL OLACAK?
**ÖNEMLI**: Müşteriler kendileri kayıt olamaz!

**Neden?** Her müşterinin Mikro ERP'deki bir "cari kodu" ile eşleşmesi gerekiyor. Sipariş verdiğinde Mikro'da hangi cariye yazılacağını bilmemiz lazım.

**Doğru Akış:**
1. Admin yeni müşteri oluşturur
2. Müşteri bilgilerini girer (ad, email, şifre)
3. Müşteri tipini seçer (BAYI, PERAKENDE, VIP, OZEL)
4. **Mikro Cari Kodunu** girer (ÖRNEĞİN: "CAR-001")
5. Müşteri kaydedilir
6. Müşteri artık login olup sipariş verebilir

#### Güvenlik
- Şifreler bcrypt ile hashlenir
- JWT token ile kimlik doğrulama
- Her müşteri sadece kendi siparişlerini görebilir

### 3.4 Sipariş Akışı

#### Adım Adım Akış

**1. Müşteri Ürünleri Görüntüler**
- Sadece fazla stoklu ürünler gösterilir
- Müşteri tipine göre fiyatlar gösterilir
- Her ürün için hem Faturalı hem Beyaz fiyat gösterilir

**2. Müşteri Sepete Ekler**
- Ürünü seçer
- Fiyat tipini seçer (Faturalı veya Beyaz)
- Miktarı belirler
- Sepete ekler

**3. Müşteri Sipariş Oluşturur**
- Sepeti görüntüler
- "Siparişi Onayla" butonuna basar
- **KRITIK**: Sistem Mikro'ya bağlanıp ANLIK stok kontrolü yapar
  - Eğer stok yetmiyorsa: Uyarı verir, sipariş edilebilecek max miktarı gösterir
  - Stok varsa: Sipariş oluşturulur, durumu "PENDING" olur

**4. Admin Siparişi Görür**
- Admin panelinde "Bekleyen Siparişler" sayfasında görür
- Sipariş detaylarını inceler
- "Onayla ve Mikro'ya Gönder" butonuna basar

**5. Sistem Mikro'ya Sipariş Yazar**
**ÇOK ÖNEMLİ**: Sipariş 2 AYRI sipariş olarak Mikro'ya yazılır!

**Neden 2 ayrı sipariş?**
Çünkü faturalı ve beyaz ürünler farklı KDV oranlarıyla faturalanacak.

**Sipariş 1 (Faturalı Ürünler)**
```sql
-- Mikro'nun sipariş tablosuna INSERT
INSERT INTO siparisler (...)
VALUES (
  cari_kod: "CAR-001",
  kdv_orani: 0.20,  -- Normal KDV
  ...
)

-- Her faturalı ürün için detay
INSERT INTO siparis_detaylari (...)
```

**Sipariş 2 (Beyaz Ürünler)**
```sql
-- Ayrı bir sipariş olarak
INSERT INTO siparisler (...)
VALUES (
  cari_kod: "CAR-001",
  kdv_orani: 0,  -- KDV = 0
  ...
)

-- Her beyaz ürün için detay
INSERT INTO siparis_detaylari (...)
```

**6. Sipariş Tamamlandı**
- Sistem sipariş durumunu "APPROVED" yapar
- Müşteriye bildirim (opsiyonel)
- Müşteri "Siparişlerim" sayfasından takip edebilir

### 3.5 Senkronizasyon

#### Otomatik Senkronizasyon (Cron Job)
- **Sıklık**: Her saat başı
- **Ne Yapar**:
  1. Mikro'dan tüm kategorileri çeker
  2. Mikro'dan tüm ürünleri çeker (kod, isim, maliyet, KDV, vs.)
  3. Her ürün için depo stoklarını çeker
  4. Geçmiş satışları çeker (son 6 ay)
  5. Fazla stok hesaplar
  6. Tüm fiyatları hesaplar (8 fiyat × tüm ürünler)
  7. PostgreSQL veritabanına kaydeder

#### Manuel Senkronizasyon
- Admin panelinde "Şimdi Senkronize Et" butonu
- Acil güncellemeler için kullanılır

---

## 4. TEKNİK MİMARİ VE STACK

### Genel Mimari
```
┌─────────────┐
│   Müşteri   │
│   Browser   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────┐
│   Next.js App   │
│   (Frontend)    │
│   Port: 3000    │
└──────┬──────────┘
       │ REST API
       ▼
┌─────────────────┐        ┌──────────────┐
│   Express API   │───────▶│  PostgreSQL  │
│   (Backend)     │        │  (Kendi DB)  │
│   Port: 5000    │        └──────────────┘
└──────┬──────────┘
       │ SQL Queries
       ▼
┌─────────────────┐
│   Mikro ERP     │
│   MSSQL DB      │
│   (Remote)      │
└─────────────────┘
```

### Backend Stack

#### Node.js + TypeScript + Express
- **Neden Node.js?**: Hızlı geliştirme, büyük ekosistem
- **Neden TypeScript?**: Tip güvenliği, daha az hata
- **Neden Express?**: En popüler, basit, esnek

#### Veritabanları
1. **PostgreSQL**: Kendi verilerimiz (kullanıcılar, siparişler, sepet)
   - **ORM**: Prisma (tip güvenli, kolay kullanım)
2. **MSSQL**: Mikro ERP bağlantısı (sadece okuma)
   - **Library**: node-mssql

#### Önemli Kütüphaneler
```json
{
  "express": "^4.18.2",
  "typescript": "^5.3.3",
  "@prisma/client": "^5.7.1",
  "mssql": "^10.0.1",
  "bcrypt": "^5.1.1",
  "jsonwebtoken": "^9.0.2",
  "node-cron": "^3.0.3",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5"
}
```

### Frontend Stack

#### Next.js 15 + React
- **Neden Next.js?**: SEO, server components, modern
- **Neden React?**: En popüler, büyük ekosistem

#### State Management
- **Zustand**: Basit, performanslı, Redux'tan çok daha kolay

#### Styling
- **TailwindCSS**: Hızlı styling, utility-first

#### API İletişimi
- **Axios**: Interceptor desteği (JWT token otomatik ekleme)

#### Önemli Kütüphaneler
```json
{
  "next": "15.0.3",
  "react": "^19.0.0",
  "typescript": "^5.3.3",
  "tailwindcss": "^3.4.1",
  "axios": "^1.6.5",
  "zustand": "^4.4.7"
}
```

### Deployment

#### Sunucu
- **Platform**: DigitalOcean Droplet
- **OS**: Ubuntu 22.04
- **RAM**: En az 2GB (4GB önerilir)

#### Servisler
- **Backend**: PM2 ile çalıştırılacak
- **Frontend**: PM2 ile çalıştırılacak (next start)
- **PostgreSQL**: Sunucuda kurulu olacak
- **Nginx**: Reverse proxy
- **SSL**: Let's Encrypt (ücretsiz)

---

## 5. MIKRO ERP ENTEGRASYONU DETAYLARI

### 5.1 Bağlantı Bilgileri (Bora Abi'den Alınacak)

```typescript
// src/config/mikro.ts
const mikroConfig = {
  server: '???',    // Bora abi verecek
  database: '???',  // Bora abi verecek
  user: '???',      // Bora abi verecek
  password: '???',  // Bora abi verecek
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};
```

### 5.2 Çekilecek Veriler ve SQL Sorguları

**NOT**: Aşağıdaki tablo isimleri ve kolon isimleri **VARSAYIM**dır. Gerçek isimler Bora Abi'ye sorulacak!

#### Kategoriler
```sql
-- Mikro'dan kategori listesi çekmek
SELECT
  kategori_id,
  kategori_adi,
  kategori_kodu
FROM kategori_tablosu
WHERE aktif = 1
```

#### Ürünler (Temel Bilgiler)
```sql
-- Ürün master datası
SELECT
  urun_id,
  urun_kodu,        -- Mikro'daki ürün kodu
  urun_adi,
  kategori_id,
  birim,
  kdv_orani,
  son_alis_fiyati,  -- lastEntryPrice
  guncel_maliyet,   -- currentCost
  aktif
FROM urunler
WHERE aktif = 1
```

#### Stok Miktarları (Depo Bazlı)
```sql
-- Her ürünün her depodaki stok miktarı
SELECT
  urun_kodu,
  depo_kodu,
  miktar
FROM stok_tablosu
WHERE miktar > 0
```

Sonuç JSON formatında saklanacak:
```json
{
  "DEPO1": 100,
  "DEPO2": 50,
  "MERKEZ": 75
}
```

#### Satış Hareketleri (Son 6 Ay)
```sql
-- Geçmiş satışlar (fazla stok hesabı için)
SELECT
  urun_kodu,
  YEAR(tarih) AS yil,
  MONTH(tarih) AS ay,
  SUM(miktar) AS toplam_satis
FROM satis_hareketleri
WHERE tarih >= DATEADD(MONTH, -6, GETDATE())
  AND hareket_tipi = 'SATIS'
GROUP BY urun_kodu, YEAR(tarih), MONTH(tarih)
```

#### Bekleyen Siparişler
```sql
-- Müşteri siparişleri (henüz tamamlanmamış)
SELECT
  urun_kodu,
  SUM(miktar) AS bekleyen_miktar
FROM siparis_detaylari sd
JOIN siparisler s ON sd.siparis_id = s.siparis_id
WHERE s.durum IN ('BEKLEMEDE', 'ONAYLANDI')
  AND s.siparis_tipi = 'SATIS'
GROUP BY urun_kodu

-- Satınalma siparişleri (gelecek stoklar)
SELECT
  urun_kodu,
  SUM(miktar) AS gelecek_miktar
FROM siparis_detaylari sd
JOIN siparisler s ON sd.siparis_id = s.siparis_id
WHERE s.durum IN ('BEKLEMEDE', 'ONAYLANDI')
  AND s.siparis_tipi = 'SATIN_ALMA'
GROUP BY urun_kodu
```

#### Cari Bilgileri
```sql
-- Müşteri cari kodları (manuel eşleştirme için)
SELECT
  cari_kod,
  cari_unvan,
  cari_tipi,
  aktif
FROM cariler
WHERE aktif = 1
  AND cari_tipi = 'MUSTERI'
```

### 5.3 Mikro'ya Sipariş Yazma

#### Sipariş Başlığı (Master)
```sql
-- Ana sipariş kaydı
INSERT INTO siparisler (
  siparis_no,
  cari_kod,
  tarih,
  durum,
  siparis_tipi,
  kdv_toplam,
  genel_toplam,
  aciklama
) VALUES (
  'WEB-2024-00001',  -- Otomatik generate
  'CAR-001',          -- Müşterinin Mikro cari kodu
  GETDATE(),
  'ONAYLANDI',
  'SATIS',
  @kdv_toplam,
  @genel_toplam,
  'B2B Websitesinden sipariş'
)

-- Yeni oluşan sipariş ID'sini al
SELECT SCOPE_IDENTITY() AS siparis_id
```

#### Sipariş Detayları
```sql
-- Her ürün için detay satırı
INSERT INTO siparis_detaylari (
  siparis_id,
  urun_kodu,
  miktar,
  birim_fiyat,
  kdv_orani,
  satir_toplam
) VALUES (
  @siparis_id,
  'URN-001',
  10,
  100.00,
  0.20,  -- Faturalı için 0.20, Beyaz için 0
  1000.00
)
```

#### 🔴 2 Ayrı Sipariş Mantığı - ÇOK ÖNEMLİ!

**Kritik Kural:** Bir sepette hem faturalı hem beyaz ürün varsa, Mikro'ya 2 AYRI sipariş yazılır!

**Neden?** Faturalı ve beyaz ürünler farklı KDV oranlarıyla faturalanacak. Mikro'da ayrı faturalar kesilmesi gerekiyor.

**3 Senaryo:**
1. **Sepette SADECE faturalı ürünler var** → Mikro'ya 1 sipariş (KDV'li)
2. **Sepette SADECE beyaz ürünler var** → Mikro'ya 1 sipariş (KDV=0)
3. **Sepette HEM faturalı HEM beyaz var** → Mikro'ya 2 AYRI sipariş

```typescript
// Pseudocode
async function writeMikroOrder(order: Order) {
  // Sepeti faturalı ve beyaz olarak ayır
  const invoicedItems = order.items.filter(i => i.priceType === 'INVOICED');
  const whiteItems = order.items.filter(i => i.priceType === 'WHITE');

  const mikroOrderIds: string[] = [];

  // 1. Faturalı sipariş (eğer varsa)
  if (invoicedItems.length > 0) {
    const invoicedOrderId = await insertMikroOrder({
      cariCode: order.user.mikroCariCode,
      items: invoicedItems,
      applyVAT: true,  // Her ürün kendi KDV oranıyla
      description: `B2B Sipariş ${order.orderNumber} - Faturalı`
    });
    mikroOrderIds.push(invoicedOrderId);
  }

  // 2. Beyaz sipariş (eğer varsa)
  if (whiteItems.length > 0) {
    const whiteOrderId = await insertMikroOrder({
      cariCode: order.user.mikroCariCode,
      items: whiteItems,
      applyVAT: false,  // Tüm ürünler için KDV = 0
      description: `B2B Sipariş ${order.orderNumber} - Beyaz`
    });
    mikroOrderIds.push(whiteOrderId);
  }

  return mikroOrderIds;  // [invoiced_id] veya [white_id] veya [invoiced_id, white_id]
}
```

**ÖNEMLİ NOTLAR:**
- Faturalı siparişteki her ürün **kendi KDV oranını** kullanır (ürün %18 ise %18, %20 ise %20)
- Beyaz siparişteki tüm ürünlerin KDV'si **0** olarak yazılır
- Mikro'ya yazılan fiyatlar **KDV HARİÇ** fiyatlardır (birim_fiyat)
- Mikro kendi KDV hesabını yapar

### 5.4 Anlık Stok Kontrolü

Müşteri sipariş verirken, siparişi kaydetmeden önce Mikro'ya bağlanıp o anki stoku kontrol etmeliyiz.

```typescript
async function checkMikroStockRealtime(productCode: string): Promise<number> {
  const result = await mikroPool.query(`
    SELECT SUM(miktar) as total_stock
    FROM stok_tablosu
    WHERE urun_kodu = @productCode
      AND depo_kodu IN (${includedWarehouses})
  `);

  return result.recordset[0].total_stock || 0;
}
```

---

## 6. VERİTABANI YAPISI

### PostgreSQL Veritabanı (Kendi Sistemimiz)

#### Prisma Schema Özeti

```prisma
// Users - Kullanıcılar
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  password        String    // bcrypt hash
  name            String
  role            UserRole  @default(CUSTOMER)  // ADMIN | CUSTOMER
  customerType    String?   // "BAYI" | "PERAKENDE" | "VIP" | "OZEL"
  mikroCariCode   String?   @unique
  createdAt       DateTime  @default(now())
  orders          Order[]
  carts           Cart[]
}

// Settings - Sistem ayarları
model Settings {
  id                      String   @id @default(uuid())
  calculationPeriod       Int      @default(3)  // 1, 3, veya 6 ay
  includedWarehouses      String[] // ["DEPO1", "MERKEZ"]
  minimumExcessThreshold  Int      @default(10)
  costMethod              String   @default("lastEntry")
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

// Category - Kategoriler (Mikro'dan sync)
model Category {
  id            String    @id @default(uuid())
  mikroCode     String    @unique
  name          String
  products      Product[]
  priceRules    CategoryPriceRule[]
}

// Product - Ürünler (Mikro'dan sync + hesaplamalar)
model Product {
  id                      String    @id @default(uuid())
  mikroCode               String    @unique
  name                    String
  categoryId              String
  category                Category  @relation(fields: [categoryId])

  // Maliyet bilgileri (Mikro'dan)
  lastEntryPrice          Float?
  currentCost             Float?
  vatRate                 Float     @default(0.18)

  // Stok bilgileri
  warehouseStocks         Json      // {"DEPO1": 100, "DEPO2": 50}
  salesData               Json      // {month: amount} satış geçmişi
  pendingCustomerOrders   Int       @default(0)
  pendingPurchaseOrders   Int       @default(0)
  excessStock             Int       @default(0)  // Hesaplanan

  // Fiyatlar (hesaplanan)
  prices                  Json      // 8 fiyat

  // Image
  imageUrl                String?

  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  cartItems               CartItem[]
  orderItems              OrderItem[]
  priceOverrides          ProductPriceOverride[]
}

// CategoryPriceRule - Kategori kar marjları
model CategoryPriceRule {
  id              String   @id @default(uuid())
  categoryId      String
  category        Category @relation(fields: [categoryId])
  customerType    String   // "BAYI" | "PERAKENDE" | "VIP" | "OZEL"
  profitMargin    Float    // 0.15 = %15

  @@unique([categoryId, customerType])
}

// ProductPriceOverride - Ürün bazlı özel fiyat
model ProductPriceOverride {
  id              String   @id @default(uuid())
  productId       String
  product         Product  @relation(fields: [productId])
  customerType    String
  profitMargin    Float

  @@unique([productId, customerType])
}

// Cart - Sepet
model Cart {
  id              String     @id @default(uuid())
  userId          String
  user            User       @relation(fields: [userId])
  items           CartItem[]
  createdAt       DateTime   @default(now())
}

// CartItem - Sepet ürünleri
model CartItem {
  id              String   @id @default(uuid())
  cartId          String
  cart            Cart     @relation(fields: [cartId])
  productId       String
  product         Product  @relation(fields: [productId])
  quantity        Int
  priceType       String   // "INVOICED" | "WHITE"
  unitPrice       Float
  createdAt       DateTime @default(now())
}

// Order - Siparişler
model Order {
  id              String      @id @default(uuid())
  orderNumber     String      @unique  // "ORD-2024-00001"
  userId          String
  user            User        @relation(fields: [userId])
  status          OrderStatus @default(PENDING)
  totalAmount     Float
  items           OrderItem[]
  mikroOrderIds   String[]    // [invoiced_id, white_id]
  createdAt       DateTime    @default(now())
  approvedAt      DateTime?
}

// OrderItem - Sipariş detayları
model OrderItem {
  id              String   @id @default(uuid())
  orderId         String
  order           Order    @relation(fields: [orderId])
  productId       String
  product         Product  @relation(fields: [productId])
  productName     String   // Snapshot
  mikroCode       String   // Snapshot
  quantity        Int
  priceType       String   // "INVOICED" | "WHITE"
  unitPrice       Float
  totalPrice      Float
}
```

---

## 7. BACKEND API DETAYLARI

### API Base URL
```
http://localhost:5000/api
```

### Authentication
Tüm korumalı endpoint'ler için header:
```
Authorization: Bearer <JWT_TOKEN>
```

### 7.1 Auth Endpoints

#### POST /api/auth/login
```typescript
Request:
{
  email: string,
  password: string
}

Response:
{
  token: string,
  user: {
    id: string,
    email: string,
    name: string,
    role: "ADMIN" | "CUSTOMER",
    customerType?: string,
    mikroCariCode?: string
  }
}
```

#### GET /api/auth/me
```typescript
Headers:
  Authorization: Bearer <token>

Response:
{
  id: string,
  email: string,
  name: string,
  role: string,
  customerType?: string,
  mikroCariCode?: string
}
```

### 7.2 Admin Endpoints

#### GET /api/admin/settings
```typescript
Response:
{
  calculationPeriod: 1 | 3 | 6,
  includedWarehouses: string[],
  minimumExcessThreshold: number,
  costMethod: "lastEntry" | "current" | "average"
}
```

#### PUT /api/admin/settings
```typescript
Request:
{
  calculationPeriod?: number,
  includedWarehouses?: string[],
  minimumExcessThreshold?: number,
  costMethod?: string
}

Response:
{
  message: "Settings updated"
}
```

#### POST /api/admin/sync
Manuel senkronizasyon tetikler
```typescript
Response:
{
  message: "Sync completed",
  stats: {
    categoriesUpdated: number,
    productsUpdated: number,
    pricesCalculated: number
  }
}
```

#### GET /api/admin/customers
```typescript
Response:
{
  customers: [
    {
      id: string,
      email: string,
      name: string,
      customerType: string,
      mikroCariCode: string,
      createdAt: string
    }
  ]
}
```

#### POST /api/admin/customers
```typescript
Request:
{
  email: string,
  password: string,
  name: string,
  customerType: "BAYI" | "PERAKENDE" | "VIP" | "OZEL",
  mikroCariCode: string
}

Response:
{
  id: string,
  message: "Customer created"
}
```

#### GET /api/admin/orders/pending
```typescript
Response:
{
  orders: [
    {
      id: string,
      orderNumber: string,
      user: {
        name: string,
        email: string,
        mikroCariCode: string
      },
      items: [
        {
          productName: string,
          quantity: number,
          priceType: string,
          totalPrice: number
        }
      ],
      totalAmount: number,
      createdAt: string
    }
  ]
}
```

#### POST /api/admin/orders/:id/approve
```typescript
Response:
{
  message: "Order approved and sent to Mikro",
  mikroOrderIds: [string, string]  // [invoiced, white]
}
```

#### GET /api/admin/categories
```typescript
Response:
{
  categories: [
    {
      id: string,
      name: string,
      mikroCode: string
    }
  ]
}
```

#### POST /api/admin/categories/price-rule
```typescript
Request:
{
  categoryId: string,
  customerType: string,
  profitMargin: number  // 0.15 = %15
}

Response:
{
  message: "Price rule saved"
}
```

#### POST /api/admin/products/price-override
```typescript
Request:
{
  productId: string,
  customerType: string,
  profitMargin: number
}

Response:
{
  message: "Price override saved"
}
```

### 7.3 Customer Endpoints

#### GET /api/products
```typescript
Query params:
  ?categoryId=xxx
  ?search=xxx

Response:
{
  products: [
    {
      id: string,
      name: string,
      mikroCode: string,
      excessStock: number,
      prices: {
        invoiced: number,  // Müşteri tipine göre
        white: number
      },
      imageUrl?: string
    }
  ]
}
```

#### GET /api/products/:id
```typescript
Response:
{
  id: string,
  name: string,
  mikroCode: string,
  category: { name: string },
  excessStock: number,
  prices: {
    invoiced: number,
    white: number
  },
  imageUrl?: string
}
```

#### GET /api/categories
```typescript
Response:
{
  categories: [
    {
      id: string,
      name: string,
      mikroCode: string
    }
  ]
}
```

#### GET /api/cart
```typescript
Response:
{
  id: string,
  items: [
    {
      id: string,
      product: {
        id: string,
        name: string,
        mikroCode: string
      },
      quantity: number,
      priceType: "INVOICED" | "WHITE",
      unitPrice: number
    }
  ],
  total: number
}
```

#### POST /api/cart
```typescript
Request:
{
  productId: string,
  quantity: number,
  priceType: "INVOICED" | "WHITE"
}

Response:
{
  message: "Added to cart",
  cartItem: { id: string }
}
```

#### DELETE /api/cart/:itemId
```typescript
Response:
{
  message: "Item removed"
}
```

#### POST /api/orders
Sipariş oluşturma (stok kontrolü ile)
```typescript
Response:
{
  message: "Order created",
  orderId: string,
  orderNumber: string
}

// Hata durumu (stok yetersiz):
{
  error: "Insufficient stock",
  details: [
    "Product XYZ: requested 50, available 30"
  ]
}
```

#### GET /api/orders
```typescript
Response:
{
  orders: [
    {
      id: string,
      orderNumber: string,
      status: "PENDING" | "APPROVED" | "REJECTED",
      totalAmount: number,
      items: [...],
      createdAt: string
    }
  ]
}
```

---

## 8. FRONTEND SAYFA DETAYLARI

### Dosya Yapısı
```
D:\mikro-b2b-frontend\
├── app\
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Ana sayfa (redirect)
│   ├── login\
│   │   └── page.tsx            # Login sayfası
│   ├── products\
│   │   ├── page.tsx            # Ürün listesi
│   │   └── [id]\
│   │       └── page.tsx        # Ürün detay
│   ├── cart\
│   │   └── page.tsx            # Sepet
│   ├── orders\
│   │   └── page.tsx            # Siparişlerim
│   └── admin\
│       ├── page.tsx            # Admin dashboard
│       ├── settings\
│       │   └── page.tsx        # Sistem ayarları
│       ├── customers\
│       │   └── page.tsx        # Müşteri yönetimi
│       ├── orders\
│       │   └── page.tsx        # Sipariş onaylama
│       └── categories\
│           └── page.tsx        # Fiyatlandırma
├── components\
│   ├── ui\
│   │   ├── Button.tsx          # Buton komponenti
│   │   ├── Input.tsx           # Input komponenti
│   │   ├── Card.tsx            # Card komponenti
│   │   └── Header.tsx          # Navbar
│   └── AuthGuard.tsx           # Route koruma
├── lib\
│   ├── api\
│   │   ├── client.ts           # Axios instance
│   │   ├── admin.ts            # Admin API çağrıları
│   │   └── customer.ts         # Müşteri API çağrıları
│   └── store\
│       └── authStore.ts        # Zustand auth store
└── types\
    └── index.ts                # TypeScript types
```

### 8.1 Müşteri Sayfaları

#### /login
- Email ve şifre girişi
- Login başarılıysa:
  - Admin ise → /admin
  - Müşteri ise → /products

#### /products
- Tüm ürünleri listele (sadece fazla stoklu)
- Kategoriye göre filtreleme
- Arama (ürün adı veya Mikro kodu)
- Her ürün kartında:
  - Ürün resmi (varsa)
  - Ürün adı
  - Mikro kodu
  - Stok miktarı
  - Faturalı fiyat
  - Beyaz fiyat
  - "Detay" butonu

#### /products/[id]
- Ürün detayları
- 2 buton:
  - "Faturalı Sepete Ekle"
  - "Beyaz Sepete Ekle"
- Miktar seçimi
- Sepete ekleme

#### /cart
- Sepetteki ürünleri göster
- Her ürün için:
  - Ürün bilgileri
  - Miktar
  - Fiyat tipi (Faturalı/Beyaz)
  - Birim fiyat
  - Satır toplamı
  - "Sil" butonu
- Genel toplam
- "Siparişi Onayla" butonu
  - Tıklandığında: POST /api/orders
  - Stok yetersizse: Hata mesajı göster
  - Başarılıysa: /orders sayfasına yönlendir

#### /orders
- Müşterinin tüm siparişlerini listele
- Her sipariş için:
  - Sipariş numarası
  - Tarih
  - Durum (Beklemede/Onaylandı)
  - Toplam tutar
  - Ürün detayları

### 8.2 Admin Sayfaları

#### /admin
- Genel dashboard
- İstatistikler:
  - Bekleyen sipariş sayısı
  - Toplam müşteri sayısı
  - Son senkronizasyon zamanı
- "Şimdi Senkronize Et" butonu

#### /admin/settings
- Sistem ayarları formu:
  - Hesaplama periyodu (1/3/6 ay)
  - Dahil edilecek depolar (checkboxlar)
  - Minimum fazla stok eşiği
  - Maliyet yöntemi (lastEntry/current/average)
- "Kaydet" butonu

#### /admin/customers
- Müşteri listesi tablosu
- "Yeni Müşteri" butonu
- Form alanları:
  - Email
  - Şifre
  - Ad Soyad
  - Müşteri Tipi (select: BAYI/PERAKENDE/VIP/OZEL)
  - Mikro Cari Kodu (text input)
- Kaydet

#### /admin/orders
- Bekleyen siparişler listesi (status = PENDING)
- Her sipariş için:
  - Sipariş numarası
  - Müşteri adı, email
  - Mikro cari kodu
  - Ürün detayları (tablo)
    - Ürün adı
    - Miktar
    - Fiyat tipi
    - Fiyat
  - Toplam tutar
  - "Onayla ve Mikro'ya Gönder" butonu
    - Tıklandığında: POST /admin/orders/:id/approve
    - Başarılı: Sipariş listesinden kaybolur
    - Hata: Hata mesajı göster

#### /admin/categories
- Kategori listesi
- Her kategori için:
  - Kategori adı
  - Mikro kodu
  - "Kar Marjlarını Düzenle" butonu
  - Açılır form:
    - BAYI kar marjı (%)
    - PERAKENDE kar marjı (%)
    - VIP kar marjı (%)
    - OZEL kar marjı (%)
  - "Kaydet" butonu
    - 4 ayrı POST /admin/categories/price-rule çağrısı yapar

---

## 9. İŞ AKIŞLARI VE SENARYOLAR

### Senaryo 1: İlk Kurulum ve Senkronizasyon

1. Sistem kuruldu, backend ve frontend ayakta
2. Admin login olur (ilk admin manuel DB'ye eklenmeli)
3. Admin /admin/settings'e gider
4. Ayarları yapar:
   - Hesaplama periyodu: 3 ay
   - Depolar: DEPO1, MERKEZ
   - Minimum eşik: 10 adet
   - Maliyet: Son giriş fiyatı
5. Admin "Şimdi Senkronize Et" butonuna basar
6. Backend:
   - Mikro'ya bağlanır
   - Kategorileri çeker → PostgreSQL'e kaydeder
   - Ürünleri çeker → PostgreSQL'e kaydeder
   - Her ürün için stok bilgileri → JSON olarak saklar
   - Satış geçmişi → JSON olarak saklar
   - Fazla stok hesaplar
   - 8 fiyatı hesaplar (henüz kar marjı yoksa default kullanılır)
7. Senkronizasyon biter → Admin'e mesaj gösterilir

### Senaryo 2: Kategori Fiyatlandırma

1. Admin /admin/categories'e gider
2. "Bilgisayar" kategorisini görür
3. "Kar Marjlarını Düzenle" butonuna basar
4. Kar marjlarını girer:
   - BAYI: 15%
   - PERAKENDE: 25%
   - VIP: 10%
   - OZEL: 20%
5. "Kaydet" butonuna basar
6. Backend:
   - 4 ayrı CategoryPriceRule kaydı yapar
   - Bu kategorideki TÜM ürünlerin fiyatlarını yeniden hesaplar
   - PostgreSQL'i günceller
7. Artık bu kategorideki ürünler yeni fiyatlarla gösterilir

### Senaryo 3: Müşteri Kaydı

1. Admin /admin/customers'e gider
2. "Yeni Müşteri" butonuna basar
3. Formu doldurur:
   - Email: ahmet@firma.com
   - Şifre: 123456
   - Ad: Ahmet Yılmaz
   - Müşteri Tipi: BAYI
   - Mikro Cari Kodu: CAR-001
4. "Kaydet" butonuna basar
5. Backend:
   - Şifreyi hash'ler (bcrypt)
   - User kaydını oluşturur
   - Başarı mesajı döner
6. Ahmet artık login olabilir

### Senaryo 4: Müşteri Sipariş Verme

1. Ahmet login olur (BAYI)
2. /products sayfasına yönlendirilir
3. Ürünleri görür (sadece fazla stoklu):
   - Mouse Logitech - Faturalı: 115 TL, Beyaz: 110 TL, Stok: 40
   - Klavye HP - Faturalı: 230 TL, Beyaz: 220 TL, Stok: 25
4. Mouse'a tıklar → /products/xxx
5. Miktar: 10 adet seçer
6. "Faturalı Sepete Ekle" butonuna basar
7. Sepete eklendi mesajı
8. Geri döner, Klavye için de:
   - Miktar: 5
   - "Beyaz Sepete Ekle"
9. Sepet ikonuna tıklar → /cart
10. Sepeti görür:
    - Mouse x 10 - Faturalı - 1150 TL
    - Klavye x 5 - Beyaz - 1100 TL
    - **Toplam: 2250 TL**
11. "Siparişi Onayla" butonuna basar
12. Backend:
    - Mikro'ya bağlanır
    - Mouse için stok kontrolü: 40 adet var ✓
    - Klavye için stok kontrolü: 25 adet var ✓
    - Sipariş oluşturur (status: PENDING)
    - Sepeti temizler
13. Müşteri /orders'a yönlendirilir
14. Siparişini görür: "ORD-2024-00001 - Beklemede - 2250 TL"

### Senaryo 5: Admin Sipariş Onaylama

1. Admin /admin/orders'e gider
2. Ahmet'in siparişini görür:
   - ORD-2024-00001
   - Ahmet Yılmaz (CAR-001)
   - Mouse x 10 - Faturalı
   - Klavye x 5 - Beyaz
   - Toplam: 2250 TL
3. "Onayla ve Mikro'ya Gönder" butonuna basar
4. Backend:
   - Sipariş 2'ye bölünür:

     **Sipariş 1 (Faturalı):**
     - Mikro'ya INSERT
     - Cari: CAR-001
     - KDV: %20
     - Ürünler: Mouse x 10

     **Sipariş 2 (Beyaz):**
     - Mikro'ya INSERT
     - Cari: CAR-001
     - KDV: 0%
     - Ürünler: Klavye x 5

   - PostgreSQL'de sipariş durumu: APPROVED
   - mikroOrderIds: ["MKR-1234", "MKR-1235"]
5. Admin'e mesaj: "Sipariş onaylandı ve Mikro'ya gönderildi"
6. Sipariş listesinden kaybolur (artık PENDING değil)

### Senaryo 6: Stok Yetersiz Durumu

1. Zeynep (müşteri) sepete 100 adet Mouse ekler
2. Ama gerçekte Mikro'da 40 adet var
3. "Siparişi Onayla" butonuna basar
4. Backend:
   - Mikro'ya bağlanır
   - Anlık stok kontrolü: 40 adet
   - İstenilen: 100 adet
   - ❌ Yetersiz!
5. Hata mesajı döner:
   ```
   "Insufficient stock"
   details: ["Mouse Logitech: requested 100, available 40"]
   ```
6. Frontend hata gösterir:
   ```
   Stok yetersiz!
   Mouse Logitech: 100 adet istediniz, 40 adet mevcut
   ```
7. Zeynep miktarı 40'a düşürür
8. Tekrar dener → Bu sefer başarılı

### Senaryo 7: Otomatik Senkronizasyon

1. Cron job her saat başı tetiklenir
2. Backend:
   - Mikro'ya bağlanır
   - Tüm ürünlerin güncel stok bilgilerini çeker
   - Yeni ürünler varsa ekler
   - Silinen ürünler varsa pasif yapar
   - Fazla stok yeniden hesaplanır
   - Fiyatlar yeniden hesaplanır
   - PostgreSQL güncellenir
3. Log'a yazılır: "Sync completed at 14:00 - 1250 products updated"
4. Müşteriler artık güncel stok ve fiyatları görür

---

## 10. GÜVENLİK VE PERFORMANS

### Güvenlik

#### 1. Authentication & Authorization
- JWT token (15 günlük expiry)
- Şifreler bcrypt ile hash (salt rounds: 10)
- Role-based access (ADMIN vs CUSTOMER)
- Her endpoint'te token kontrolü
- Müşteriler sadece kendi verilerini görebilir

#### 2. SQL Injection Koruması
- Prisma ORM kullanımı (parameterized queries)
- Mikro sorguları için mssql library (prepared statements)
- Kullanıcı inputları validate edilir

#### 3. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // IP başına max 100 request
});

app.use('/api/', limiter);
```

#### 4. CORS
```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

#### 5. Helmet.js
```typescript
import helmet from 'helmet';
app.use(helmet());
```

#### 6. Environment Variables
```
# .env
DATABASE_URL=postgresql://...
MIKRO_SERVER=...
MIKRO_USER=...
MIKRO_PASSWORD=...
JWT_SECRET=random_string_min_32_chars
```

### Performans

#### 1. Database Indexing
```prisma
model Product {
  mikroCode String @unique  // Index otomatik
  excessStock Int

  @@index([excessStock])  // Filtreleme için
}

model User {
  email String @unique
  mikroCariCode String? @unique

  @@index([role])
}
```

#### 2. Caching (İleride Eklenebilir)
- Redis cache için hazır yapı
- Ürün fiyatları cache'lenebilir (1 saat TTL)
- Mikro sorguları cache'lenebilir

#### 3. Connection Pooling
```typescript
// Mikro connection pool
const pool = new mssql.ConnectionPool(config);
pool.connect();

// PostgreSQL (Prisma otomatik halleder)
```

#### 4. Pagination (İleride)
- Ürün listesi için sayfalama
- Sipariş listesi için sayfalama

---

## 11. DEPLOYMENT PLANI

### Hazırlık

#### 1. Sunucu Seç
- DigitalOcean Droplet (önerilir)
- 2 GB RAM, 1 CPU, 50 GB Disk
- Ubuntu 22.04 LTS

#### 2. Domain & SSL
- Domain al (örnek: b2b.firma.com)
- DNS A kaydı sunucu IP'ye yönlendir
- SSL: Let's Encrypt (ücretsiz)

### Sunucu Kurulumu

#### 1. SSH Bağlantı
```bash
ssh root@sunucu_ip
```

#### 2. Gerekli Yazılımlar
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# PostgreSQL
apt install postgresql postgresql-contrib

# Nginx
apt install nginx

# PM2 (process manager)
npm install -g pm2

# Git
apt install git
```

#### 3. PostgreSQL Kurulum
```bash
sudo -u postgres psql

CREATE DATABASE mikrob2b;
CREATE USER mikrob2b_user WITH PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE mikrob2b TO mikrob2b_user;
\q
```

### Backend Deployment

```bash
# Kodu çek
cd /var/www
git clone <backend_repo>
cd mikro-b2b

# Environment ayarla
nano .env
# DATABASE_URL, MIKRO_*, JWT_SECRET gir

# Bağımlılıkları yükle
npm install

# Prisma migrate
npx prisma migrate deploy
npx prisma generate

# Build
npm run build

# PM2 ile başlat
pm2 start dist/index.js --name mikro-b2b-api
pm2 save
pm2 startup
```

### Frontend Deployment

```bash
# Kodu çek
cd /var/www
git clone <frontend_repo>
cd mikro-b2b-frontend

# Environment ayarla
nano .env.local
# NEXT_PUBLIC_API_URL=https://api.b2b.firma.com

# Bağımlılıkları yükle
npm install

# Build
npm run build

# PM2 ile başlat
pm2 start npm --name mikro-b2b-frontend -- start
pm2 save
```

### Nginx Yapılandırması

```bash
nano /etc/nginx/sites-available/b2b.firma.com
```

```nginx
# Backend (API)
server {
    listen 80;
    server_name api.b2b.firma.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name b2b.firma.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Aktif et
ln -s /etc/nginx/sites-available/b2b.firma.com /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### SSL Kurulumu (Certbot)

```bash
apt install certbot python3-certbot-nginx

certbot --nginx -d b2b.firma.com -d api.b2b.firma.com

# Otomatik yenileme test
certbot renew --dry-run
```

### İlk Admin Oluşturma

```bash
cd /var/www/mikro-b2b

# Prisma Studio aç (güvenli bir şekilde)
npx prisma studio

# Veya direkt SQL ile
sudo -u postgres psql -d mikrob2b

INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@firma.com',
  '$2b$10$....',  -- bcrypt hash (ayrıca hash'le)
  'Admin',
  'ADMIN',
  NOW(),
  NOW()
);
```

Şifre hash'lemek için:
```javascript
const bcrypt = require('bcrypt');
bcrypt.hash('admin123', 10).then(console.log);
```

---

## 12. BORA ABİ'YE SORULACAK SORULAR

### Bağlantı Bilgileri
1. ✅ Mikro MSSQL sunucu adresi (IP veya hostname)?
2. ✅ Database adı?
3. ✅ Kullanıcı adı ve şifre?
4. ✅ Port? (varsayılan 1433)
5. ❓ Güvenlik: Sunucumuzdan Mikro'ya bağlantı için IP whitelisting gerekli mi?

### Tablo İsimleri ve Yapıları
**ÇOKÖNEMLI**: Aşağıdaki sorgularda kullandığımız tablo isimleri VARSAYIM. Gerçek isimleri Bora Abi'den almalıyız!

6. ❓ Kategori tablosunun adı ve kolonları?
   ```sql
   SELECT * FROM [gerçek_tablo_adı] WHERE 1=0
   ```
   İhtiyacımız olan kolonlar: kategori_id, kategori_adi, kategori_kodu

7. ❓ Ürün master tablosunun adı ve kolonları?
   İhtiyacımız olan: urun_id, urun_kodu, urun_adi, kategori_id, birim, kdv_orani, son_alis_fiyati, guncel_maliyet

8. ❓ Stok tablosunun adı ve kolonları?
   İhtiyacımız olan: urun_kodu, depo_kodu, miktar

9. ❓ Satış hareketleri tablosunun adı?
   İhtiyacımız olan: urun_kodu, tarih, miktar, hareket_tipi

10. ❓ Sipariş tablosunun adı ve kolonları?
    İhtiyacımız olan: siparis_id, siparis_no, cari_kod, tarih, durum, toplam_tutar

11. ❓ Sipariş detayları tablosunun adı?
    İhtiyacımız olan: siparis_id, urun_kodu, miktar, birim_fiyat, kdv_orani

12. ❓ Cari tablosunun adı?
    İhtiyacımız olan: cari_kod, cari_unvan, cari_tipi

### Yazma Yetkileri

13. ❓ Mikro'ya direkt INSERT yapabilir miyiz? Yoksa stored procedure üzerinden mi yazmamız gerekiyor?
14. ❓ Sipariş yazarken kullanmamız gereken prosedür/fonksiyon var mı?
15. ❓ Sipariş numarası otomatik mi generate ediliyor, yoksa biz mi vermeliyiz?

### İş Kuralları

16. ❓ KDV oranları ürün bazında mı, yoksa kategori bazında mı belirleniyor?
17. ❓ Beyaz sipariş için KDV=0 yazmamız yeterli mi?
18. ❓ Depo kodları neler? Hangi depolar dahil edilmeli?
19. ❓ Maliyet hesaplama: Mikro'nun kullandığı yöntem hangisi? (FIFO, LIFO, Weighted Average?)

### Test Ortamı

20. ❓ Test için ayrı bir database/ortam var mı?
21. ❓ Test carisi oluşturabilir miyiz?
22. ❓ Test siparişi yazıp Mikro'da görünmesini test edebilir miyiz?

### Ek Bilgiler

23. ❓ Mikro versiyonu? (Örn: Mikro 2024)
24. ❓ Şirketin Mikro'daki dönem bilgisi? (Mevcut dönem kodu)
25. ❓ Ürün resimleri Mikro'da saklanıyor mu? Yoksa dışarıdan mı yüklememiz gerekiyor?

---

## ÖZET VE HIZLI BAŞLANGIÇ

### Hemen Yapılabilecekler (Mikro Bağlantısı Olmadan)

1. ✅ Backend kurulumu
   ```bash
   cd D:\mikro-b2b
   npm install
   ```

2. ✅ PostgreSQL database oluştur
   ```bash
   npx prisma migrate dev
   ```

3. ✅ Backend'i başlat
   ```bash
   npm run dev
   ```

4. ✅ Frontend kurulumu
   ```bash
   cd D:\mikro-b2b-frontend
   npm install
   npm run dev
   ```

5. ✅ İlk admin kullanıcısı oluştur (Prisma Studio veya SQL)

6. ✅ Frontend'de login olup UI'ı test et

### Mikro Bağlantısı Gelince

1. Bora Abi'den bilgileri al (yukarıdaki 25 soru)
2. `.env` dosyasına Mikro bağlantı bilgilerini ekle
3. Tablo isimlerini doğrula
4. `src/services/mikroSync.service.ts` dosyasındaki SQL sorgularını güncelle
5. Manuel senkronizasyon tetikle
6. Hataları düzelt (muhtemelen tablo/kolon isimleri)
7. İlk başarılı senkronizasyonu yap
8. Test müşterisi oluştur
9. Test siparişi ver
10. Mikro'da siparişin göründüğünü doğrula

### Proje Durumu

#### Tamamlanan
- ✅ Backend %100 (kod yazılmış)
- ✅ Frontend %100 (kod yazılmış)
- ✅ Veritabanı tasarımı
- ✅ API endpoint'leri
- ✅ Authentication sistemi
- ✅ Fiyatlandırma motoru
- ✅ Stok hesaplama motoru

#### Bekleyen
- ⏳ Mikro bağlantı bilgileri (Bora Abi)
- ⏳ Gerçek tablo isimleri
- ⏳ Test ve debug
- ⏳ Production deployment

### İletişim

Sorular için:
- Mikro konular → Bora Abi
- Teknik konular → Geliştirici ekip

---

## SON NOTLAR

Bu döküman, yeni bir Claude Code sessionına projeyi sıfırdan anlatmak için hazırlandı. Tüm detaylar burada.

**Önemli:**
- Mikro'nun tablo isimleri varsayımdır, Bora Abi ile doğrulanmalı
- Backend ve Frontend kod dosyaları D:\mikro-b2b\ ve D:\mikro-b2b-frontend\ klasörlerinde mevcut
- İlk çalıştırma için Mikro bağlantısı zorunlu değil, UI test edilebilir

**Başarılar!** 🚀
