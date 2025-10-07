# 🚀 Mikro B2B Sipariş Sistemi

Mikro ERP entegrasyonlu B2B sipariş yönetim platformu - **Sıfırdan Full-Stack**

## 📋 Proje Özeti

Fazla stoklu ürünlerin müşterilere online sipariş sistemi ile satışı. Dinamik fiyatlandırma, anlık stok kontrolü ve otomatik Mikro ERP entegrasyonu.

---

## 🏗️ Teknoloji Stack'i

### Backend
- **Node.js** + TypeScript + Express
- **PostgreSQL** (Prisma ORM)
- **MSSQL** (Mikro ERP bağlantısı)
- JWT Authentication
- Cron Jobs (otomatik sync)

### Frontend
- **Next.js 15** + React 19
- **TailwindCSS**
- **Zustand** (state management)
- **Axios** (API client)
- TypeScript

---

## ⚡ Hızlı Başlangıç

### 1. Backend Kurulumu

```bash
cd C:\b2b\backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx ts-node scripts/createAdmin.ts
npm run dev
```

**Backend:** http://localhost:5000

### 2. Frontend Kurulumu

```bash
cd C:\b2b\frontend
npm install
npm run dev
```

**Frontend:** http://localhost:3000

### 3. İlk Giriş

**Admin:**
- Email: admin@firma.com
- Şifre: admin123

**İlk Sync:**
1. Admin dashboard
2. "Şimdi Senkronize Et"
3. Mock Mikro 14 ürün + 5 kategori yükler

---

## 🎯 Temel Özellikler

### ✅ Fazla Stok Yönetimi
- Otomatik hesaplama: `Depo Stoku - X aylık satış + Bekleyen Alım - Bekleyen Satış`
- Admin ayarlanabilir parametreler
- Sadece fazla stoklu ürünler gösterilir

### ✅ Dinamik Fiyatlandırma (8 Fiyat)
- **4 Müşteri Tipi:** BAYI, PERAKENDE, VIP, OZEL
- **2 Fiyat Tipi:** Faturalı (KDV'li), Beyaz (KDV=0)
- **Dinamik Maliyet:** 3 hesaplama yöntemi (Son Giriş, Güncel, Dinamik)
- **Beyaz Formül:** `maliyet × (1 + kdv/2)` ✨

### ✅ Kritik: 2 Ayrı Sipariş Mantığı
Bir sepette hem faturalı hem beyaz ürün varsa, Mikro'ya **2 AYRI** sipariş yazılır!
- Sipariş 1: Faturalı ürünler (normal KDV)
- Sipariş 2: Beyaz ürünler (KDV=0)

### ✅ Anlık Stok Kontrolü
Sipariş oluşturulmadan önce Mikro'dan anlık stok sorgulanır.

### ✅ Mock Mikro Service
Development için gerçekçi test verisi:
- 5 Kategori
- 14 Ürün
- Depo stokları
- 6 aylık satış geçmişi

---

## 📂 Proje Yapısı

```
C:\b2b\
├── backend/
│   ├── src/
│   │   ├── config/         # Yapılandırma
│   │   ├── prisma/         # Database schema
│   │   ├── services/       # İş mantığı (7 servis)
│   │   ├── controllers/    # API controllers
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth, validation, error
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Yardımcı fonksiyonlar
│   ├── scripts/            # Admin oluşturma vs.
│   └── README.md
│
└── frontend/
    ├── app/
    │   ├── (auth)/         # Login
    │   ├── (customer)/     # Products, Cart, Orders
    │   └── (admin)/        # Dashboard, Settings, Customers, Orders, Categories
    ├── components/ui/      # UI components
    ├── lib/
    │   ├── api/            # API client
    │   ├── store/          # Zustand stores
    │   └── utils/          # Utilities
    ├── types/              # TypeScript types
    └── README.md
```

---

## 🔑 API Endpoints

### Auth
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Kullanıcı bilgileri

### Admin (11 endpoint)
- Settings (GET, PUT)
- Sync (POST)
- Customers (GET, POST)
- Orders (GET, POST approve, POST reject)
- Categories (GET, POST price-rule)
- Dashboard stats (GET)

### Customer (11 endpoint)
- Products (GET, GET/:id)
- Categories (GET)
- Cart (GET, POST, PUT, DELETE)
- Orders (GET, POST, GET/:id)

**Toplam: 24 endpoint**

---

## 📊 Veritabanı

### PostgreSQL (Kendi Sistemimiz)
- Users (admin + customers)
- Products (sync + hesaplamalar)
- Categories
- Orders + OrderItems
- Cart + CartItems
- Settings
- CategoryPriceRule
- ProductPriceOverride
- SyncLog

### MSSQL (Mikro ERP)
- Read-only erişim
- SQL sorguları ile veri çekme
- Sipariş yazma (INSERT)

---

## 🎨 Sayfalar

### Customer (4 sayfa)
1. **Products** - Ürün listesi, filtreleme, arama
2. **Product Detail** - Detay, faturalı/beyaz seçimi, sepete ekleme
3. **Cart** - Sepet yönetimi, miktar güncelleme, sipariş oluşturma
4. **Orders** - Sipariş geçmişi ve durumu

### Admin (6 sayfa)
1. **Dashboard** - İstatistikler, sync, hızlı işlemler
2. **Settings** - Sistem ayarları
3. **Customers** - Müşteri CRUD
4. **Orders** - Bekleyen siparişleri onaylama/reddetme
5. **Categories** - Kar marjı belirleme
6. **Login** - Ortak login sayfası

---

## 🔐 Güvenlik

- JWT token authentication
- bcrypt password hashing
- Role-based access control
- SQL injection koruması (Prisma)
- Rate limiting
- CORS yapılandırması
- Helmet.js security headers

---

## 📈 İş Akışları

### Müşteri Sipariş Akışı
1. Login (customer)
2. Ürünleri incele
3. Ürün detay → Faturalı/Beyaz seç
4. Sepete ekle
5. Sepet → Sipariş oluştur (stok kontrolü)
6. Sipariş PENDING durumuna düşer
7. Admin onayını bekle

### Admin Onay Akışı
1. Login (admin)
2. Dashboard → Bekleyen siparişler
3. Detayları incele
4. Onayla → Backend 2 sipariş yazar (Faturalı/Beyaz)
5. Mikro ERP'ye yazılır
6. Sipariş APPROVED olur

---

## 🔄 Senkronizasyon

### Otomatik (Cron)
- Her saat başı
- Kategoriler + Ürünler + Stoklar
- Fazla stok hesaplama
- Fiyat hesaplama

### Manuel (Admin)
- Dashboard → "Şimdi Senkronize Et"
- Acil güncellemeler için

---

## 🌟 Öne Çıkan Özellikler

### 1. Dinamik Maliyet Hesaplama
Admin 3 yöntem arasından seçer:
- **Son Giriş Fiyatı:** En son alış fiyatı
- **Güncel Maliyet:** Sistemde tanımlı güncel maliyet
- **Dinamik:** Tarih farklarına göre ağırlıklı ortalama

### 2. Beyaz Fiyat Formülü
```
Beyaz Fiyat = KDV Hariç Maliyet × (1 + Ürünün KDV'si / 2)
```

### 3. 2 Ayrı Sipariş Yazma
Sepette faturalı + beyaz varsa:
- Mikro'ya 2 ayrı INSERT
- Farklı KDV oranları
- Ayrı faturalar

### 4. Mock Mikro Service
Development'ta gerçek Mikro olmadan çalışma:
- Gerçekçi test verisi
- 14 ürün, 5 kategori
- Stok ve satış geçmişi

---

## 📝 Dokümantasyon

- **Backend:** `C:\b2b\backend\README.md`
- **Backend Setup:** `C:\b2b\backend\SETUP.md`
- **Frontend:** `C:\b2b\frontend\README.md`
- **Frontend Setup:** `C:\b2b\frontend\SETUP_GUIDE.md`
- **API Examples:** `C:\b2b\backend\API_EXAMPLES.http`

---

## ✅ Tamamlanma Durumu

### Backend (100%)
- ✅ Config & Environment
- ✅ Prisma Schema
- ✅ 7 Service (Mock/Real Mikro, Pricing, Stock, Sync, Order)
- ✅ 3 Controller (Auth, Admin, Customer)
- ✅ 24 API Endpoint
- ✅ Middleware (Auth, Validation, Error)
- ✅ JWT + bcrypt
- ✅ Cron Jobs

### Frontend (100%)
- ✅ Next.js 15 + React 19
- ✅ TailwindCSS + UI Components
- ✅ Zustand Stores (Auth, Cart)
- ✅ API Client (Axios)
- ✅ 10 Sayfa (Login + 4 Customer + 5 Admin)
- ✅ Responsive design
- ✅ TypeScript types

---

## 🚀 Production Hazırlığı

### Yapılması Gerekenler

1. **Statik IP Alın**
   - Mikro ERP bağlantısı için

2. **Bora Abi'den Bilgileri Alın**
   - Mikro server, database, user, password
   - **Gerçek tablo isimleri** (çok önemli!)

3. **Backend .env Güncelleyin**
   ```env
   USE_MOCK_MIKRO=false
   MIKRO_SERVER=...
   MIKRO_DATABASE=...
   MIKRO_USER=...
   MIKRO_PASSWORD=...
   ```

4. **Tablo İsimlerini Güncelleyin**
   - `backend/src/config/mikro-tables.ts`
   - Bora Abi'den aldığınız gerçek isimlerle değiştirin

5. **Test Edin**
   - Bağlantı testi
   - Sync testi
   - Sipariş yazma testi

6. **Deploy Edin**
   - DigitalOcean / AWS / Hetzner
   - PM2 ile process management
   - Nginx reverse proxy
   - SSL Certificate

---

## 🎯 Sonuç

**Tamamlanan:**
- ✅ Full-Stack B2B Sipariş Sistemi
- ✅ Dinamik fiyatlandırma motoru
- ✅ Mock Mikro ile test edilebilir
- ✅ Production-ready architecture
- ✅ 100% TypeScript
- ✅ Modern stack

**Hazır Olan:**
- Backend API (%100)
- Frontend UI (%100)
- Mock Mikro test ortamı
- Detaylı dokümantasyon

**Bekleyen:**
- Statik IP + Gerçek Mikro bağlantısı
- Tablo isimlerinin güncellenmesi
- Production test ve deployment

---

## 📞 Destek

Sorularınız için:
- Backend: `backend/README.md`
- Frontend: `frontend/README.md`
- Setup: İlgili SETUP dosyaları

**Başarılar!** 🎉
