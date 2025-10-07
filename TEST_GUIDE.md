# Docker ile Test Etme Rehberi

## 1. PostgreSQL'i Docker ile Başlat

```bash
cd C:\b2b
docker-compose up -d
```

Veritabanının hazır olduğunu kontrol edin:
```bash
docker ps
```

`mikrob2b-postgres` container'ının çalıştığını görmelisiniz.

## 2. Backend Kurulumu

```bash
cd C:\b2b\backend
npm install
npx prisma generate
npx prisma migrate dev --name init
```

Admin kullanıcısı oluşturun:
```bash
npx ts-node scripts/createAdmin.ts
```

**Admin bilgileri:**
- Email: admin@firma.com
- Şifre: admin123

Backend'i başlatın:
```bash
npm run dev
```

Backend: http://localhost:5000

## 3. Frontend Kurulumu

Yeni bir terminal açın:

```bash
cd C:\b2b\frontend
npm install
npm run dev
```

Frontend: http://localhost:3000

## 4. İlk Test

1. Tarayıcıda http://localhost:3000 açın
2. Login sayfası açılacak
3. Admin ile giriş yapın:
   - Email: admin@firma.com
   - Şifre: admin123
4. Dashboard'da "Şimdi Senkronize Et" butonuna tıklayın
5. Mock Mikro'dan 14 ürün + 5 kategori yüklenecek

## 5. Müşteri Testi

### Müşteri Oluşturma (Admin)
1. Dashboard → "Müşteriler"
2. "+ Yeni Müşteri" butonuna tıklayın
3. Bilgileri girin:
   - Email: musteri@test.com
   - Şifre: 123456
   - Ad: Test Müşteri
   - Tip: BAYI
   - Mikro Cari Kodu: CARI001
4. "Müşteri Oluştur"

### Müşteri ile Sipariş Verme
1. Çıkış yapın
2. Müşteri ile giriş yapın:
   - Email: musteri@test.com
   - Şifre: 123456
3. Ürünler sayfası açılır
4. Bir ürün seçin
5. Faturalı/Beyaz seçin
6. Miktar girin
7. "Sepete Ekle"
8. Sepet → "Siparişi Oluştur"
9. Sipariş PENDING durumuna düşer

### Sipariş Onaylama (Admin)
1. Çıkış yapın
2. Admin ile giriş yapın
3. Dashboard → "Bekleyen Siparişler"
4. "Onayla ve Mikro'ya Gönder"
5. Sipariş APPROVED olur (Mock Mikro'ya yazıldı)

## 6. Docker Komutları

### Container'ı durdurmak
```bash
docker-compose down
```

### Container'ı silmek (veritabanı dahil)
```bash
docker-compose down -v
```

### Container loglarını görmek
```bash
docker logs mikrob2b-postgres
```

### PostgreSQL'e bağlanmak (isteğe bağlı)
```bash
docker exec -it mikrob2b-postgres psql -U postgres -d mikrob2b
```

## 7. Sorun Giderme

### Port 5432 kullanımda hatası
```bash
# Windows'ta çalışan PostgreSQL servisini durdurun veya
# docker-compose.yml'de port'u değiştirin: "5433:5432"
# Sonra .env'de DATABASE_URL'i güncelleyin: localhost:5433
```

### Migration hatası
```bash
# Prisma client'ı yeniden oluşturun
npx prisma generate
npx prisma migrate reset
```

### Backend bağlanamıyor
```bash
# Container'ın çalıştığını kontrol edin
docker ps

# Restart deneyin
docker-compose restart
```

## 8. Önemli Notlar

- Docker container dursa bile volume'deki veri kalır
- Tamamen sıfırlamak için: `docker-compose down -v`
- Backend USE_MOCK_MIKRO=true olduğu için gerçek Mikro bağlantısı gerekmiyor
- Mock Mikro 14 ürün + 5 kategori içerir
- Beyaz fiyat formülü: `cost × (1 + vat/2)`
- Sepette hem faturalı hem beyaz varsa 2 AYRI sipariş yazılır

## ✅ Test Checklist

- [ ] Docker PostgreSQL başladı
- [ ] Backend çalışıyor (http://localhost:5000)
- [ ] Frontend çalışıyor (http://localhost:3000)
- [ ] Admin login çalışıyor
- [ ] Sync butonu çalışıyor, ürünler geldi
- [ ] Müşteri oluşturuldu
- [ ] Müşteri login oldu
- [ ] Ürün detay açıldı
- [ ] Sepete ekleme çalıştı
- [ ] Sipariş oluşturuldu
- [ ] Admin sipariş onayladı

**Başarılı test!** 🎉
