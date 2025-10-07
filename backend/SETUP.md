# Backend Kurulum Rehberi

## 📋 Ön Gereksinimler

- Node.js 18+
- PostgreSQL 14+
- npm veya yarn

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükle

```bash
cd C:\b2b\backend
npm install
```

### 2. PostgreSQL Veritabanı Oluştur

**Windows (psql ile):**
```bash
# PostgreSQL'e bağlan
psql -U postgres

# Database oluştur
CREATE DATABASE mikrob2b;

# Çıkış
\q
```

**Alternatif (pgAdmin kullanarak):**
- pgAdmin'i aç
- Sağ tık > Create > Database
- Name: `mikrob2b`
- Save

### 3. Environment Variables Ayarla

`.env` dosyasını düzenle:

```env
# PostgreSQL bağlantı string'ini güncelle
DATABASE_URL="postgresql://postgres:SIFRENIZ@localhost:5432/mikrob2b?schema=public"

# JWT secret (production'da değiştir!)
JWT_SECRET=mikro-b2b-super-secret-jwt-key-change-in-production-2024

# Mock Mikro kullan (development için)
USE_MOCK_MIKRO=true

# Cron'u kapat (development için)
ENABLE_CRON=false
```

### 4. Prisma Migration Çalıştır

```bash
# Prisma client oluştur
npx prisma generate

# Database migration'ları çalıştır
npx prisma migrate dev --name init
```

### 5. İlk Admin Kullanıcı Oluştur

```bash
npx ts-node scripts/createAdmin.ts
```

Bilgileri gir:
- Email: `admin@firma.com`
- Şifre: `admin123` (veya istediğiniz)
- Ad Soyad: `Admin User`

### 6. Development Server'ı Başlat

```bash
npm run dev
```

Server `http://localhost:5000` adresinde çalışacak.

## ✅ Kurulumu Test Et

### Health Check

```bash
curl http://localhost:5000/api/health
```

Yanıt:
```json
{
  "status": "OK",
  "timestamp": "2024-10-06T12:00:00.000Z",
  "uptime": 5.123
}
```

### Admin Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@firma.com",
    "password": "admin123"
  }'
```

Yanıt:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@firma.com",
    "name": "Admin User",
    "role": "ADMIN"
  }
}
```

### İlk Senkronizasyonu Çalıştır

Token'ı kopyala ve:

```bash
curl -X POST http://localhost:5000/api/admin/sync \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Mock data ile 5 kategori ve 14 ürün sync edilecek.

## 🗄️ Veritabanı Yönetimi

### Prisma Studio (GUI)

```bash
npx prisma studio
```

Browser'da `http://localhost:5555` açılır.

### Migration Oluşturma

```bash
npx prisma migrate dev --name migration_adi
```

### Database Reset (TEHLİKELİ!)

```bash
npx prisma migrate reset
```

## 🐛 Sorun Giderme

### "Database does not exist" Hatası

PostgreSQL'de database'i elle oluşturun:
```sql
CREATE DATABASE mikrob2b;
```

### "Port 5000 already in use" Hatası

`.env` dosyasında farklı port kullanın:
```env
PORT=5001
```

### Prisma Migration Hataları

```bash
# Migration'ları sıfırla
npx prisma migrate reset

# Yeniden migrate et
npx prisma migrate dev
```

### "Invalid token" Hatası

JWT_SECRET'in aynı olduğundan emin olun. Değiştirdiyseniz yeni token alın (re-login).

## 📚 Yararlı Komutlar

```bash
# Development
npm run dev              # Dev server (hot reload)

# Build
npm run build            # TypeScript build

# Production
npm start                # Production mode (önce build gerekli)

# Prisma
npx prisma generate      # Client oluştur
npx prisma migrate dev   # Migration çalıştır
npx prisma studio        # GUI aç
npx prisma db seed       # Seed data (varsa)

# Database
npx ts-node scripts/createAdmin.ts  # Admin oluştur
```

## 🎯 Sonraki Adımlar

1. ✅ Backend çalışıyor
2. ⏭️ Frontend kurulumu yap
3. 🧪 API endpoint'lerini test et (Postman/Insomnia)
4. 📊 Prisma Studio'da verileri incele

## 🔗 API Dokümantasyonu

Tüm endpoint'ler için `README.md` dosyasına bakın.

## 🆘 Yardım

Sorun yaşarsanız:
1. Server loglarına bakın
2. PostgreSQL'in çalıştığını kontrol edin
3. `.env` dosyasının doğru olduğundan emin olun
