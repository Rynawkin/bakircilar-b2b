# Bakırcılar B2B Projesi - Kapsamlı Brief

**Son Güncelleme:** 10 Ekim 2025
**Durum:** Production'da Çalışıyor ✅

---

## 📋 İÇİNDEKİLER

1. [Proje Özeti](#proje-özeti)
2. [Teknoloji Stack](#teknoloji-stack)
3. [Sunucu ve Altyapı](#sunucu-ve-altyapı)
4. [Mikro ERP Entegrasyonu](#mikro-erp-entegrasyonu)
5. [Veritabanı Yapısı](#veritabanı-yapısı)
6. [İş Mantığı ve Kurallar](#iş-mantığı-ve-kurallar)
7. [Deployment Prosedürü](#deployment-prosedürü)
8. [Önemli Notlar ve Dikkat Edilmesi Gerekenler](#önemli-notlar)
9. [Yapılan Önemli Değişiklikler](#yapılan-önemli-değişiklikler)
10. [Bilinen Sorunlar ve Çözümleri](#bilinen-sorunlar)

---

## 🎯 PROJE ÖZETİ

### Amaç
Bakırcılar firmasının **fazla stoklarını B2B müşterilere özel fiyatlarla satmak** için geliştirilen web uygulaması.

### Temel Akış
1. **Mikro ERP'den** stok, satış geçmişi ve fiyat bilgileri çekilir
2. **Fazla stoklar** otomatik hesaplanır (Toplam Stok - Ortalama Satış × Periyot)
3. **Müşteri tiplerine göre** (BAYI, PERAKENDE, VIP, OZEL) farklı kar marjları uygulanır
4. Müşteriler **online sipariş** verir
5. Admin **onaylar** ve sipariş **Mikro'ya** yazılır

### Kritik Özellikler
- ✅ Gerçek zamanlı stok kontrolü
- ✅ Otomatik fiyatlandırma (maliyet + kar marjı + KDV)
- ✅ İki fiyat tipi: **Faturalı (KDV dahil)** ve **Beyaz (KDV/2)**
- ✅ Mikro ERP ile **tam entegrasyon**
- ✅ Ürün resimleri otomatik senkronizasyon

---

## 🛠 TEKNOLOJİ STACK

### Backend
- **Framework:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Prisma ORM)
- **ERP Connection:** MSSQL (Mikro ERP V16)
- **Image Processing:** Sharp
- **Process Manager:** PM2
- **Server:** Ubuntu on DigitalOcean

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Hosting:** Vercel
- **UI Library:** Custom components + react-hot-toast

### Veritabanı
- **Production DB:** PostgreSQL @ DigitalOcean (127.0.0.1:5432)
- **Mikro ERP DB:** MSSQL Server @ 185.123.54.61:16022

---

## 🌐 SUNUCU VE ALTYAPI

### DigitalOcean Droplet
```
IP: 139.59.133.81 (NOT: 165.227.167.114 DEĞİL!)
User: root
SSH Key: ~/.ssh/claude_digitalocean
SSH Config: Host digitalocean-b2b

Backend Path: /var/www/b2b/backend
PM2 Process: b2b-backend
Port: 5000 (internal)
```

### SSH Bağlantısı
```bash
# Config kullanarak
ssh digitalocean-b2b

# Veya direkt
ssh -i ~/.ssh/claude_digitalocean root@139.59.133.81
```

### Vercel (Frontend)
- **URL:** https://bakircilar-b2b.vercel.app
- **Repo:** GitHub auto-deploy (main branch)
- **Proxy:** `/api/*` requests → DigitalOcean backend

### GitHub Repository
```
Repo: https://github.com/Rynawkin/bakircilar-b2b.git
Branch: main
```

---

## 🔗 MİKRO ERP ENTEGRASYONU

### Bağlantı Bilgileri
```env
MIKRO_SERVER=185.123.54.61
MIKRO_PORT=16022
MIKRO_DATABASE=MikroDB_V16_BKRC2020
MIKRO_USER=BkrcWebL1RgcVc4YexP3LRfWZ6W
MIKRO_PASSWORD="uq0#_iZ0FTlvHwF=sPKL"
```

### **ÇOK ÖNEMLİ:** Mikro'ya SADECE OKUMA!
```sql
-- ✅ İZİN VERİLEN
SELECT * FROM STOKLAR
SELECT * FROM STOK_HAREKETLERI
SELECT dbo.fn_DepodakiMiktar(...)

-- ❌ ASLA YAPMA
INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE
```

**NOT:** Sipariş yazma özelliği henüz implement edilmedi. `writeOrder()` fonksiyonu TODO durumunda.

### Kullanılan Tablolar ve Fonksiyonlar

#### 1. STOKLAR (Ürünler)
```sql
Tablo: STOKLAR
Kolonlar:
  - sto_kod: Ürün kodu
  - sto_isim: Ürün adı
  - sto_Guid: GUID (resim çekmek için)
  - sto_kategori_kodu: Kategori
  - sto_birim1_ad: Birim (ADET, KG, vb)
  - sto_toptan_Vergi: KDV kodu (0-7 arası)
  - sto_standartmaliyet: Maliyet
  - sto_pasif_fl: 0=Aktif, 1=Pasif
  - sto_fileid: Dosya ID (kullanılmıyor şu an)
  - sto_resim_url: TARİH içeriyor (resim URL'i değil!)
```

#### 2. STOK_KATEGORILERI
```sql
Tablo: STOK_KATEGORILERI
Kolonlar:
  - ktg_kod: Kategori kodu
  - ktg_isim: Kategori adı
```

#### 3. STOK_HAREKETLERI (Satış Geçmişi)
```sql
Tablo: STOK_HAREKETLERI
Kolonlar:
  - sth_stok_kod: Ürün kodu
  - sth_tarih: Hareket tarihi
  - sth_miktar: Miktar
  - sth_tip: 0=Giriş, 1=Çıkış (Satış)
```

#### 4. CARI_HESAPLAR
```sql
Tablo: CARI_HESAPLAR
Kolonlar:
  - cari_kod: Cari kodu
  - cari_unvan1: Firma adı
```

#### 5. SQL Fonksiyonları
```sql
-- Depo bazlı stok hesaplama
dbo.fn_DepodakiMiktar(sto_kod, depo_no, parametre)

Depolar:
  1 = Merkez
  2 = Ereğli
  6 = Topça
  7 = Dükkan
```

#### 6. mye_ImageData (Ürün Resimleri)
```sql
Tablo: mye_ImageData
Kolonlar:
  - Record_uid: GUID (sto_Guid ile eşleşir)
  - TableID: 13 (STOKLAR tablosu)
  - ImageID: 0 (genellikle)
  - Data: Binary image data (JPEG/PNG)

Kullanım:
  SELECT Data FROM mye_ImageData
  WHERE Record_uid = '...' AND TableID = 13
```

### KDV Kod Dönüşümleri
```javascript
const vatMap = {
  0: 0.00,  // İstisna
  1: 0.00,  // İstisna
  2: 0.01,  // %1
  3: 0.00,  // Kullanılmıyor
  4: 0.18,  // %18
  5: 0.20,  // %20
  6: 0.00,  // Kullanılmıyor
  7: 0.10,  // %10
};
```

---

## 💾 VERİTABANI YAPISI

### PostgreSQL (Production)
```
Host: 127.0.0.1 (localhost - NOT "localhost" kelimesi!)
Port: 5432
Database: b2b_production
User: postgres
Password: postgres
```

### Ana Tablolar

#### Users (Kullanıcılar)
```typescript
- id: UUID
- email: string (unique)
- password: bcrypt hash
- name: string
- role: ADMIN | CUSTOMER
- customerType: BAYI | PERAKENDE | VIP | OZEL
- mikroCariCode: string (unique)
- active: boolean
```

#### Products (Ürünler)
```typescript
- id: UUID
- mikroCode: string (unique)
- name: string
- unit: string
- categoryId: UUID
- lastEntryPrice: float
- currentCost: float
- vatRate: float (0.18 = %18)
- calculatedCost: float
- warehouseStocks: JSON {"1": 100, "2": 50, ...}
- salesHistory: JSON {"2024-01": 45, ...}
- excessStock: int (hesaplanan fazla stok)
- prices: JSON {BAYI: {INVOICED: 115, WHITE: 110}, ...}
- imageUrl: string (/uploads/products/B101823.jpg)
- active: boolean
```

#### Categories
```typescript
- id: UUID
- mikroCode: string (unique)
- name: string
- active: boolean
```

#### Settings (Sistem Ayarları)
```typescript
- calculationPeriodMonths: 1, 3, 6
- includedWarehouses: string[] (["1", "2", "6", "7"])
- minimumExcessThreshold: int (default: 10)
- costCalculationMethod: LAST_ENTRY | CURRENT_COST | DYNAMIC
- dynamicCostParams: JSON (optional)
- whiteVatFormula: string (default: "cost * (1 + vat/2)")
- lastSyncAt: datetime
```

#### SyncLog (Senkronizasyon Logları)
```typescript
- id: UUID
- syncType: AUTO | MANUAL
- status: RUNNING | SUCCESS | FAILED
- categoriesCount: int
- productsCount: int
- imagesDownloaded: int
- imagesSkipped: int
- imagesFailed: int
- warnings: JSON[] (uyarılar)
- startedAt: datetime
- completedAt: datetime
```

#### Orders (Siparişler)
```typescript
- id: UUID
- orderNumber: string (ORD-2024-00001)
- userId: UUID
- status: PENDING | APPROVED | REJECTED
- items: OrderItem[]
- totalAmount: float
- mikroOrderIds: string[] (Mikro'ya yazıldıktan sonra)
- adminNote: string
```

### Prisma Komutları
```bash
# Schema değişikliği sonrası
npx prisma migrate dev --name migration_name

# Production'a uygula
npx prisma migrate deploy

# Client generate
npx prisma generate

# Database studio (GUI)
npx prisma studio
```

---

## 📐 İŞ MANTIĞI VE KURALLAR

### 1. Fazla Stok Hesaplama
```
Fazla Stok = Toplam Stok - (Ortalama Satış × Periyot) - Bekleyen Siparişler

Örnek:
  Toplam Stok: 100 adet
  Aylık Ortalama Satış: 20 adet
  Periyot: 3 ay
  Bekleyen Siparişler: 0

  Fazla Stok = 100 - (20 × 3) - 0 = 40 adet
```

### 2. Fiyat Hesaplama

#### Faturalı Fiyat (INVOICED)
```
Faturalı = Maliyet × (1 + Kar Marjı) × (1 + KDV)

Örnek:
  Maliyet: 100 TL
  Kar Marjı: 0.15 (%15)
  KDV: 0.20 (%20)

  Faturalı = 100 × 1.15 × 1.20 = 138 TL
```

#### Beyaz Fiyat (WHITE)
```
Beyaz = Maliyet × (1 + Kar Marjı) × (1 + KDV/2)

Örnek:
  Maliyet: 100 TL
  Kar Marjı: 0.15 (%15)
  KDV: 0.20 (%20)

  Beyaz = 100 × 1.15 × 1.10 = 126.5 TL
```

### 3. Müşteri Tipleri ve Kar Marjları

**Varsayılan Kar Marjları** (kategori bazlı override edilebilir):
- **BAYI:** %10-15
- **PERAKENDE:** %20-25
- **VIP:** %5-10
- **OZEL:** %15-20

**Öncelik Sırası:**
1. ProductPriceOverride (ürün bazlı)
2. CategoryPriceRule (kategori bazlı)
3. Varsayılan marj (yoksa)

### 4. Senkronizasyon Akışı

```
1. Kategorileri Sync (UPSERT)
2. Ürünleri Sync (UPSERT + warehouse stocks + sales history)
3. Fazla Stokları Hesapla
4. Fiyatları Hesapla
5. Resimleri İndir (sadece imageUrl = null olanlar)
6. Settings'e lastSyncAt yaz
7. SyncLog güncelle (stats + warnings)
```

**UPSERT Mantığı:**
- Eğer mikroCode varsa → UPDATE
- Yoksa → INSERT
- Bu sayede **hem yeni ürünler eklenir** hem **mevcut ürünler güncellenir**

### 5. Resim Senkronizasyonu

**Akıllı Sync:**
```sql
-- Sadece resmi olmayan ürünler çekilir
WHERE active = true AND imageUrl IS NULL
```

**İlk Sync:** ~1684 resim (5-10 dakika)
**Sonraki Sync'ler:** ~5-10 resim (10 saniye)

**Boyut Kontrolü:**
- Max 10 MB
- Aşanlar atlanır ve `warnings` alanına yazılır

**Optimize:**
- Resize: 1200x1200px (fit inside, without enlargement)
- Format: JPEG
- Quality: 85%
- Progressive: true

**Kayıt:**
```
Path: /var/www/b2b/backend/uploads/products/{sto_kod}.jpg
URL: /uploads/products/{sto_kod}.jpg
```

### 6. Sipariş Akışı

1. **Müşteri:** Sepete ürün ekler (priceType: INVOICED/WHITE)
2. **Müşteri:** Sipariş oluşturur
3. **Sistem:** Anlık stok kontrolü yapar (Mikro'dan)
4. **Sistem:** Order oluşturur (status: PENDING)
5. **Admin:** Siparişi görür ve onaylar/reddeder
6. **Sistem:** (TODO) Mikro'ya sipariş yazar
7. **Müşteri:** Sipariş durumunu görür

---

## 🚀 DEPLOYMENT PROSEDÜRÜ

### Backend Deployment

```bash
# 1. Local'de commit ve push
git add -A
git commit -m "Mesaj"
git push origin main

# 2. Sunucuya bağlan
ssh digitalocean-b2b

# 3. Pull ve build
cd /var/www/b2b/backend
git pull origin main

# 4. Dependencies install (gerekirse)
npm install

# 5. Migration (gerekirse)
npx prisma migrate deploy
npx prisma generate

# 6. Build
npm run build

# 7. PM2 restart
pm2 restart b2b-backend

# 8. Log kontrolü
pm2 logs b2b-backend --lines 20
```

### Frontend Deployment

```bash
# Vercel otomatik deploy eder
git push origin main

# Manuel deploy gerekirse
cd frontend
vercel --prod
```

### .env Dosyası (Sunucu)

**ASLA GIT'E EKLEME!**

```env
# /var/www/b2b/backend/.env
NODE_ENV=production
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/b2b_production?schema=public"
JWT_SECRET=mikro-b2b-super-secret-jwt-key-change-in-production-2024
USE_MOCK_MIKRO=false
MIKRO_SERVER=185.123.54.61
MIKRO_DATABASE=MikroDB_V16_BKRC2020
MIKRO_USER=BkrcWebL1RgcVc4YexP3LRfWZ6W
MIKRO_PASSWORD="uq0#_iZ0FTlvHwF=sPKL"
MIKRO_PORT=16022
FRONTEND_URL=https://bakircilar-b2b.vercel.app
ENABLE_CRON=false
SYNC_CRON_SCHEDULE="0 * * * *"
```

### PM2 Ecosystem Config

```javascript
// /var/www/b2b/backend/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'b2b-backend',
    script: './dist/index.js',
    cwd: '/var/www/b2b/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      // ... diğer env varları
    }
  }]
};
```

### Nginx Config (Sunucuda)

```nginx
# Eğer reverse proxy varsa
location /api {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Static files (resimler)
location /uploads {
    alias /var/www/b2b/backend/uploads;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

---

## ⚠️ ÖNEMLİ NOTLAR VE DİKKAT EDİLMESİ GEREKENLER

### 1. DATABASE_URL Problemi
```
❌ YANLIŞ: DATABASE_URL="postgresql://...@localhost:5432/..."
✅ DOĞRU: DATABASE_URL="postgresql://...@127.0.0.1:5432/..."
```
**SEBEP:** PostgreSQL `peer` authentication localhost kelimesinde çalışıyor ama TCP'de çalışmıyor.

### 2. .env Dosyası GIT'te OLMAMALI
```bash
# .env git tracking'den çıkarıldı
git rm --cached .env
echo ".env" >> .gitignore
```

### 3. IP Adresi Karışıklığı
```
❌ 165.227.167.114 (ESKİ - KULLANILMIYOR)
✅ 139.59.133.81 (DOĞRU)
```

### 4. Mikro'ya ASLA Yazma İşlemi Yapma
- SELECT, READ işlemleri OK ✅
- INSERT, UPDATE, DELETE, DROP → ❌ YASAK
- Sipariş yazma özelliği implement edilmeden Mikro'ya yazma!

### 5. Prisma Client Generate
```bash
# Schema değişince MUTLAKA generate et
npx prisma generate

# Yoksa TypeScript hataları alırsın
```

### 6. Mock vs Real Mikro
```env
# Local development
USE_MOCK_MIKRO=true

# Production
USE_MOCK_MIKRO=false
```

### 7. Resim Yükleme Klasörü
```bash
# uploads/ klasörü .gitignore'da
# Sunucuda manuel oluşturulur
mkdir -p /var/www/b2b/backend/uploads/products
```

### 8. PM2 Environment Variables
```bash
# .env dosyası varsa PM2 otomatik yükler
# VEYA ecosystem.config.js'te tanımla

# Env değişkenlerini görmek için
pm2 env 0
```

### 9. TypeScript Build Hataları
```bash
# Node modules silip yeniden install
rm -rf node_modules package-lock.json
npm install

# Prisma client temizle
rm -rf node_modules/.prisma node_modules/@prisma/client
npx prisma generate
```

### 10. CORS ve Rate Limit
```javascript
// Frontend Vercel'de, Backend DigitalOcean'da
// CORS açık olmalı
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Rate limit uyarısı normaldir (X-Forwarded-For header)
// trust proxy ayarı eklenebilir
```

---

## 📝 YAPILAN ÖNEMLİ DEĞİŞİKLİKLER

### 1. Async Sync + Progress Tracking (10 Ekim 2025)
- Sync artık arka planda çalışıyor
- Frontend polling ile status kontrol ediyor
- Gerçek zamanlı progress göstergesi

### 2. Resim Senkronizasyonu (10 Ekim 2025)
- Mikro'dan mye_ImageData tablosundan resim çekme
- Sharp ile optimize (1200x1200, %85)
- Akıllı sync (sadece eksik olanlar)
- Warning sistemi (10 MB limit)

### 3. SyncLog Warnings (10 Ekim 2025)
- Sync sırasında oluşan uyarılar loglanıyor
- Image stats (downloaded, skipped, failed)
- Detaylı hata raporlama

### 4. PostgreSQL Authentication Fix (9 Ekim 2025)
- localhost → 127.0.0.1 değişikliği
- .env dosyası git tracking'den çıkarıldı

### 5. Mikro Warehouse Stocks Fix (9 Ekim 2025)
- `sth_depo_no` kolonu yok → `dbo.fn_DepodakiMiktar()` kullanıldı
- Depo bazlı stok hesaplama düzeltildi

### 6. GUID Eklenmesi (10 Ekim 2025)
- STOKLAR.sto_Guid çekiliyor
- mye_ImageData için GUID eşleştirmesi

---

## 🐛 BİLİNEN SORUNLAR VE ÇÖZÜMLERİ

### 1. "localhost" Authentication Failed
**Sorun:** `Authentication failed against database server at localhost`

**Çözüm:**
```env
# localhost yerine 127.0.0.1 kullan
DATABASE_URL="postgresql://...@127.0.0.1:5432/..."
```

### 2. Prisma Generate Sonrası Build Hatası
**Sorun:** `Property 'xyz' does not exist on type ...`

**Çözüm:**
```bash
npx prisma generate
npm run build
pm2 restart b2b-backend
```

### 3. Mikro Bağlantı Zaman Aşımı
**Sorun:** `Failed to connect to Mikro in 15000ms`

**Çözüm:**
```javascript
// Timeout süresini artır
options: {
  connectTimeout: 30000,
  requestTimeout: 30000
}
```

### 4. Rate Limit X-Forwarded-For Warning
**Sorun:** `ValidationError: The 'X-Forwarded-For' header is set...`

**Çözüm:**
```javascript
// Express'te trust proxy ekle
app.set('trust proxy', 1);
```
**NOT:** Bu sadece warning, sistem çalışıyor.

### 5. PM2 .env Yüklenmiyor
**Sorun:** Environment variables boş

**Çözüm:**
```bash
# ecosystem.config.js kullan veya
pm2 restart b2b-backend --update-env

# .env dosyasını kontrol et
ls -la /var/www/b2b/backend/.env
```

### 6. Git Rebase Conflict
**Sorun:** `error: cannot pull with rebase: You have unstaged changes`

**Çözüm:**
```bash
cd /var/www/b2b/backend
git stash
git pull origin main
# VEYA
git reset --hard origin/main
```

### 7. Image Download Mock Mode
**Sorun:** Mock mode'da resim indirilemiyor

**Çözüm:**
```env
# Production'da false olmalı
USE_MOCK_MIKRO=false
```

### 8. Sharp Installation Error
**Sorun:** `Error: Could not load the "sharp" module`

**Çözüm:**
```bash
npm install --platform=linux --arch=x64 sharp
# veya
npm rebuild sharp
```

### 9. Mobile APK Build - Java 17 yok
**Sorun:** Gradle derleme `Java 17` bulunamadığı için başlatılamıyor.

**Çözüm:**
```powershell
# JDK 17 kurulu olmalı (örnek):
# C:\Program Files\Eclipse Adoptium\jdk-17.x

$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
java -version
```

### 10. Mobile APK Build - Android SDK yolu tanımsız
**Sorun:** `SDK location not found` hatası.

**Çözüm:**
```powershell
$env:ANDROID_HOME="C:\Android\Sdk"
$env:ANDROID_SDK_ROOT="C:\Android\Sdk"
$env:PATH="$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"
```

### 11. Mobile APK Build - Türkçe karakterli path problemi
**Sorun:** `Masaüstü` gibi Türkçe karakter içeren klasörlerde Gradle/Node plugin yolu bozulabiliyor (`MasaÃ¼stÃ¼` gibi).

**Çözüm:**
```text
APK build'i ASCII path'te al:
C:\bakircilar-b2b-build-YYYYMMDD
```
Gerekirse repo bu klasöre klonlanıp build oradan çalıştırılır.

### 12. Mobile APK Build - Geçici DNS/Maven hataları
**Sorun:** `dl.google.com` veya `repo.maven.apache.org` çözümlenemiyor.

**Çözüm:**
```powershell
$env:GRADLE_OPTS="-Djava.net.preferIPv4Stack=true -Dsun.net.inetaddr.ttl=0"
./gradlew.bat assembleDebug
```
Not: Bu hata çoğunlukla ağ/DNS kaynaklı geçici durumdur, tekrar denemede düzelebilir.

### 13. Mobile APK Build - İlk build'in uzun sürmesi
**Sorun:** İlk derleme çok uzun sürer.

**Sebep:** NDK/CMake/native bağımlılıkları ve Gradle cache ilk kez indirilir.

**Çözüm:** İlk build sonrası aynı makinede sonraki build'ler belirgin şekilde hızlanır.

### 14. Mobile APK Build - Stabil runbook (Portal + B2B)
```powershell
# 1) ASCII path kullan (örn: C:\bakircilar-b2b-build-YYYYMMDD)
# 2) Mobile app klasörlerinde dependency kur:
#    npm ci
# 3) Gerekirse android klasörü üret:
#    npx expo prebuild --platform android
# 4) Env set et:
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Android\Sdk"
$env:ANDROID_SDK_ROOT="C:\Android\Sdk"
$env:GRADLE_OPTS="-Djava.net.preferIPv4Stack=true -Dsun.net.inetaddr.ttl=0"
$env:PATH="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

# 5) APK build:
cd mobile\portal\android; .\gradlew.bat assembleRelease
cd mobile\b2b\android; .\gradlew.bat assembleRelease
```
Output:
- (release) `mobile\portal\android\app\build\outputs\apk\release\app-release.apk`
- (release) `mobile\b2b\android\app\build\outputs\apk\release\app-release.apk`

Not:
- Debug APK (assembleDebug) Metro ister; Metro calismiyorsa uygulama acilirken `Unable to load script` gorursun.

---

## 🔐 GÜVENLİK

### Şifreler ve Anahtarlar
- **PostgreSQL:** `postgres/postgres` (güçlü şifre kullan!)
- **JWT Secret:** Uzun ve güvenli olmalı
- **Mikro Password:** .env'de saklanıyor

### .gitignore Kontrol
```gitignore
.env
.env.local
.env.production
uploads/
node_modules/
dist/
```

### CORS Ayarları
```javascript
// Sadece kendi frontend'imize izin ver
cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
})
```

---

## 📊 KALİTE KONTROL

### Build Kontrolü
```bash
npm run build
# Hata varsa düzelt
```

### Lint (Eğer varsa)
```bash
npm run lint
```

### Test (Eğer varsa)
```bash
npm test
```

### PM2 Health Check
```bash
pm2 status
pm2 logs b2b-backend --lines 50
```

### Database Health
```bash
# PostgreSQL bağlantı testi
psql -h 127.0.0.1 -U postgres -d b2b_production -c "SELECT COUNT(*) FROM \"Product\";"
```

---

## 📞 DESTEK VE İLETİŞİM

### Önemli Kişiler
- **Proje Sahibi:** Bakırcılar Firma
- **Bora Abi:** Mikro ERP sorumlusu

### Faydalı Linkler
- **GitHub:** https://github.com/Rynawkin/bakircilar-b2b
- **Vercel:** https://bakircilar-b2b.vercel.app
- **DigitalOcean:** Dashboard'dan kontrol

---

## 🎯 GELECEK PLANLARI (TODO)

### Kritik
- [ ] Mikro'ya sipariş yazma implement et (`writeOrder()`)
- [ ] Frontend'e sync warnings gösterme

### Orta Öncelikli
- [ ] Cron job ile otomatik sync (şu an disabled)
- [ ] Email notifications
- [ ] Sipariş geçmişi sayfası

### Düşük Öncelikli
- [ ] Dashboard analytics
- [ ] Excel export
- [ ] Loglama sistemi (Winston)

---

## 📚 DOSYA YAPISI

```
C:\b2b\
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   └── admin.controller.ts
│   │   ├── services/
│   │   │   ├── mikro.service.ts (REAL)
│   │   │   ├── mikroMock.service.ts
│   │   │   ├── mikroFactory.service.ts
│   │   │   ├── sync.service.ts
│   │   │   ├── stock.service.ts
│   │   │   ├── pricing.service.ts
│   │   │   ├── image.service.ts ⭐ YENİ
│   │   │   └── order.service.ts
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── config/
│   │   │   ├── index.ts
│   │   │   └── mikro-tables.ts
│   │   └── index.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── uploads/ (gitignore)
│   │   └── products/
│   ├── .env (gitignore)
│   ├── .gitignore
│   ├── package.json
│   ├── tsconfig.json
│   └── ecosystem.config.js
├── frontend/
│   ├── app/
│   │   ├── (admin)/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── customers/
│   │   │   ├── orders/
│   │   │   ├── settings/
│   │   │   ├── categories/
│   │   │   └── product-overrides/
│   │   ├── (auth)/
│   │   ├── (customer)/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   ├── lib/
│   │   ├── api/
│   │   │   └── admin.ts
│   │   └── store/
│   ├── types/
│   ├── package.json
│   └── next.config.js
├── .claude/ (Claude Code settings)
│   └── settings.local.json
├── .git/
├── .gitignore
└── PROJECT_BRIEF.md ⭐ BU DOSYA
```

---

## 🔄 HIZLI REFERANS KOMUTLARI

### SSH Bağlantısı
```bash
ssh digitalocean-b2b
```

### Backend Deployment
```bash
ssh digitalocean-b2b "cd /var/www/b2b/backend && git pull && npm run build && pm2 restart b2b-backend"
```

### Log Kontrolü
```bash
ssh digitalocean-b2b "pm2 logs b2b-backend --lines 50"
```

### Database Migration
```bash
ssh digitalocean-b2b "cd /var/www/b2b/backend && npx prisma migrate deploy"
```

### Prisma Studio (DB GUI)
```bash
ssh digitalocean-b2b "cd /var/www/b2b/backend && npx prisma studio"
# Sonra http://139.59.133.81:5555 adresini aç
```

### PM2 Komutları
```bash
pm2 list                    # Tüm processler
pm2 restart b2b-backend    # Restart
pm2 stop b2b-backend       # Durdur
pm2 start b2b-backend      # Başlat
pm2 delete b2b-backend     # Sil
pm2 logs b2b-backend       # Loglar
pm2 monit                  # Monitor
```

---

## 🎉 SONUÇ

Bu brief ile:
- ✅ Proje yapısını anlayabilirsin
- ✅ Mikro entegrasyonunu yönetebilirsin
- ✅ Deploy işlemlerini yapabilirsin
- ✅ Sorunları çözebilirsin
- ✅ Yeni özellikler ekleyebilirsin

**Elektrikler gitse bile, bu dosyayı oku ve devam et!** 💪

---

**Son Güncelleme:** 10 Ekim 2025
**Hazırlayan:** Claude (Anthropic)
**Versiyon:** 1.0
