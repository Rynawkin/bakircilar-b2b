# Bakırcılar Grup B2B Frontend

Next.js 15 + React 19 + TailwindCSS + Zustand

## 🚀 Kurulum

### 1. Bağımlılıkları Yükle

```bash
cd C:\b2b\frontend
npm install
```

### 2. Environment Variables

`.env.local` dosyası zaten hazır:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3. Development Server'ı Başlat

```bash
npm run dev
```

Frontend: `http://localhost:3000`

## 📁 Klasör Yapısı

```
C:\b2b\frontend\
├── app/
│   ├── (auth)/
│   │   └── login/          # Login sayfası
│   ├── (customer)/
│   │   ├── products/       # Ürün listesi
│   │   ├── cart/           # Sepet
│   │   └── orders/         # Siparişlerim
│   ├── (admin)/
│   │   ├── dashboard/      # Admin dashboard
│   │   ├── settings/       # Ayarlar
│   │   ├── customers/      # Müşteri yönetimi
│   │   ├── orders/         # Sipariş onaylama
│   │   └── categories/     # Fiyatlandırma
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Ana sayfa (redirect)
│   └── globals.css         # Global styles
├── components/
│   └── ui/                 # UI components
├── lib/
│   ├── api/                # API client
│   ├── store/              # Zustand stores
│   └── utils/              # Utilities
└── types/                  # TypeScript types
```

## ✅ Tamamlanan

- ✅ Next.js 15 setup
- ✅ TailwindCSS configuration
- ✅ API client (Axios + interceptors)
- ✅ Zustand stores (Auth, Cart)
- ✅ TypeScript types
- ✅ UI components (Button, Input, Card, Badge)
- ✅ Login sayfası
- ✅ Root layout ve page

## ⏳ Yapılacaklar

Kalan sayfalar template'leri eklenmeli:
- [ ] Customer sayfaları (products, cart, orders)
- [ ] Admin sayfaları (dashboard, settings, customers, orders, categories)

## 🎨 UI Components

### Button
```tsx
<Button variant="primary" size="md" isLoading={false}>
  Tıkla
</Button>
```

### Input
```tsx
<Input
  label="Email"
  type="email"
  value={value}
  onChange={handleChange}
  error="Hata mesajı"
/>
```

### Card
```tsx
<Card title="Başlık" subtitle="Alt başlık">
  İçerik
</Card>
```

### Badge
```tsx
<Badge variant="success">Onaylandı</Badge>
```

## 🔐 Authentication Flow

1. Login sayfası (`/login`)
2. Token localStorage'a kaydedilir
3. Axios interceptor token'ı otomatik ekler
4. Root page rol'e göre yönlendirir:
   - Admin → `/dashboard`
   - Customer → `/products`

## 📦 State Management

### Auth Store
```tsx
import { useAuthStore } from '@/lib/store/authStore';

const { user, login, logout } = useAuthStore();
```

### Cart Store
```tsx
import { useCartStore } from '@/lib/store/cartStore';

const { cart, addToCart, fetchCart } = useCartStore();
```

## 🎯 API Kullanımı

```tsx
import customerApi from '@/lib/api/customer';
import adminApi from '@/lib/api/admin';
import authApi from '@/lib/api/auth';

// Örnek
const { products } = await customerApi.getProducts();
```

## 🔧 Development

```bash
# Dev server
npm run dev

# Build
npm run build

# Production
npm start

# Lint
npm run lint
```

## 📝 Notlar

- Backend'in çalıştığından emin olun (`http://localhost:5000`)
- İlk login için admin hesabı oluşturun (backend'de)
- Mock Mikro kullanıyorsanız, sync çalıştırın

## 🆘 Sorun Giderme

### "API_URL undefined" Hatası
`.env.local` dosyasının doğru olduğundan emin olun.

### "Network Error"
Backend'in çalıştığını kontrol edin.

### "401 Unauthorized"
Token expire olmuş olabilir, yeniden login olun.
