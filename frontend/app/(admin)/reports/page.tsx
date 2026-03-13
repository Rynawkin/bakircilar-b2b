'use client';

import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Users,
  Clock,
  DollarSign,
  FileText,
  Search,
  ShoppingCart,
  History,
  Warehouse,
  Sigma
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  category: 'cost' | 'stock' | 'customer' | 'order';
  badge?: string;
  permission?: string | string[];
}

const reports: ReportCard[] = [
  // Fiyat & Maliyet Raporları
  {
    id: 'cost-update-alerts',
    title: 'Maliyet Güncelleme Uyarıları',
    description: 'Son giriş maliyeti güncel maliyetten yüksek olan ürünler - fiyat güncelleme gerekebilir',
    icon: <AlertTriangle className="h-5 w-5" />,
    href: '/reports/cost-update-alerts',
    category: 'cost',
    badge: 'Aktif',
    permission: 'reports:cost-update-alerts',
  },
  {
    id: 'cost-update-all-products',
    title: 'Tum Urunler Maliyet/Fiyat Guncelleme',
    description: 'Tum urunlerde kolon secimi, kolon bazli siralama ve maliyet + 10 liste guncelleme ekrani',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/cost-update-all-products',
    category: 'cost',
    badge: 'Yeni',
    permission: 'reports:cost-update-alerts',
  },
  {
    id: 'margin-compliance',
    title: 'Marj Uyumsuzluğu Raporu',
    description: 'Tanımlı marj oranlarına uymayan fiyatlar - F1/F2/F3/F4/F5 kontrolü',
    icon: <TrendingDown className="h-5 w-5" />,
    href: '/reports/margin-compliance',
    category: 'cost',
    badge: 'Önerilen',
  },
  {
    id: 'profit-analysis',
    title: 'Kar Marjı Analizi (Çok Boyutlu)',
    description: 'Ürün, kategori, marka ve müşteri tipi bazında kar marjı analizi',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/profit-analysis',
    category: 'cost',
    badge: 'Önerilen',
  },
  {
    id: 'price-history',
    title: 'Fiyat Değişim Geçmişi',
    description: 'Ürün fiyatlarının zaman içindeki değişimi ve güncellenmeye ihtiyaç duyan ürünler',
    icon: <TrendingUp className="h-5 w-5" />,
    href: '/reports/price-history',
    category: 'cost',
    permission: 'reports:price-history',
  },

  // Stok Raporları
  {
    id: 'critical-stock',
    title: 'Kritik Stok Seviyeleri (Akıllı)',
    description: 'Günlük satış ortalamasına göre stok tükenmek üzere olan ürünler - blok satış filtreli',
    icon: <Package className="h-5 w-5" />,
    href: '/reports/critical-stock',
    category: 'stock',
    badge: 'Önerilen',
  },

  {
    id: 'ucarer-depo',
    title: 'Ucarer Depo Karar Raporu',
    description: 'Merkez/Topca depo icin siparis, dsv ve min-max bazli urun karar ekrani',
    icon: <Warehouse className="h-5 w-5" />,
    href: '/reports/ucarer-depo',
    category: 'stock',
    badge: 'Yeni',
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'ucarer-minmax',
    title: 'Ucarer MinMax Dinamik',
    description: 'Min-max degerlerini dinamik hesaplayan prosedur sonucunu gosterir',
    icon: <Sigma className="h-5 w-5" />,
    href: '/reports/ucarer-depo',
    category: 'stock',
    badge: 'Yeni',
    permission: 'reports:ucarer-minmax',
  },
  {
    id: 'ucarer-minmax-exclusions',
    title: 'MinMax Hesaplanmayacaklar',
    description: 'HAYIR isaretli stoklari gor, son 1/2/3 ay farkli cari satislarini izle ve tekrar hesaplamaya al',
    icon: <Sigma className="h-5 w-5" />,
    href: '/reports/ucarer-minmax-exclusions',
    category: 'stock',
    badge: 'Yeni',
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'product-families',
    title: 'Stok Aile Yonetimi',
    description: 'Urun havuzundan secerek stok ailesi olustur ve duzenle',
    icon: <Warehouse className="h-5 w-5" />,
    href: '/reports/product-families',
    category: 'stock',
    badge: 'Yeni',
    permission: 'reports:ucarer-depo',
  },
  // Satış & Müşteri Raporları
  {
    id: 'top-products',
    title: 'En Çok Satan Ürünler',
    description: 'Yüksek cirolu ürünler ve satış trendleri',
    icon: <TrendingUp className="h-5 w-5" />,
    href: '/reports/top-products',
    category: 'customer',
    badge: 'Önerilen',
  },
  {
    id: 'top-customers',
    title: 'En Çok Satan Müşteriler',
    description: 'Sadık müşteriler ve en yüksek alım yapan cariler',
    icon: <Users className="h-5 w-5" />,
    href: '/reports/top-customers',
    category: 'customer',
    badge: 'Önerilen',
  },
  {
    id: 'complement-missing',
    title: 'Tamamlayici Urun Eksikleri',
    description: 'Secilen urun veya cari icin tamamlayici urunleri almayanlari listeler',
    icon: <Package className="h-5 w-5" />,
    href: '/reports/complement-missing',
    category: 'customer',
    badge: 'Yeni',
    permission: 'reports:complement-missing',
  },
  {
    id: 'customer-activity',
    title: 'Musteri Aktivite Takibi',
    description: 'Sayfa, urun, sepet ve aktiflik verilerini loglar',
    icon: <Clock className="h-5 w-5" />,
    href: '/reports/customer-activity',
    category: 'customer',
    badge: 'Yeni',
    permission: 'reports:customer-activity',
  },
  {
    id: 'staff-activity',
    title: 'Personel Aktivite Takibi',
    description: 'Sales rep, manager, depocu vb. personelin yaptigi API islemlerini izler',
    icon: <History className="h-5 w-5" />,
    href: '/reports/staff-activity',
    category: 'customer',
    badge: 'Yeni',
    permission: 'reports:staff-activity',
  },
  {
    id: 'customer-carts',
    title: 'Musteri Sepetleri',
    description: 'Musterilerin guncel sepetleri ve kalem detaylari',
    icon: <ShoppingCart className="h-5 w-5" />,
    href: '/reports/customer-carts',
    category: 'customer',
    badge: 'Yeni',
    permission: 'reports:customer-carts',
  },
  {
    id: 'overdue-payments',
    title: 'Vade & Alacak Takip Raporu',
    description: 'Vadesi geçmiş alacaklar, aranması gerekenler ve satış durdurma önerileri',
    icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
    href: '/vade',
    category: 'customer',
    badge: 'Önerilen',
  },

  // Tedarik Zinciri
  {
    id: 'supplier-performance',
    title: 'Tedarikçi Performans Raporu',
    description: 'Tedarikçi bazında alım hacmi, teslimat süresi, kalite ve fiyat analizi',
    icon: <FileText className="h-5 w-5" />,
    href: '/reports/supplier-performance',
    category: 'order',
    permission: 'reports:supplier-price-lists',
  },
  {
    id: 'supplier-price-lists',
    title: 'Tedarikci Fiyat Karsilastirma',
    description: 'Excel/PDF listelerini yukleyip eslesen ve esmeyen urunleri hizli gorun',
    icon: <FileText className="h-5 w-5" />,
    href: '/reports/supplier-price-lists',
    category: 'order',
    badge: 'Yeni',
    permission: 'reports:supplier-price-lists',
  },
];

const categories = [
  { id: 'all', label: 'Tümü', icon: <FileText className="h-4 w-4" /> },
  { id: 'cost', label: 'Fiyat & Maliyet', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'stock', label: 'Stok', icon: <Package className="h-4 w-4" /> },
  { id: 'customer', label: 'Satış & Müşteri', icon: <Users className="h-4 w-4" /> },
  { id: 'order', label: 'Tedarik Zinciri', icon: <FileText className="h-4 w-4" /> },
];

export default function ReportsPage() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const canAccessReport = (permission?: string | string[]) => {
    if (!permission) return true;
    if (permissionsLoading) return true;
    if (Array.isArray(permission)) {
      return permission.some((perm) => hasPermission(perm));
    }
    return hasPermission(permission);
  };

  const visibleReports = reports.filter((report) => canAccessReport(report.permission));

  const filteredReports = visibleReports.filter((report) => {
    const tokens = buildSearchTokens(searchQuery);
    const haystack = normalizeSearchText(`${report.title} ${report.description}`);
    const matchesSearch = tokens.length === 0 || matchesSearchTokens(haystack, tokens);
    const matchesCategory = selectedCategory === 'all' || report.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryGroups = categories.filter(c => c.id !== 'all').map((category) => ({
    ...category,
    reports: filteredReports.filter((r) => r.category === category.id),
  }));

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">📊 Raporlar ve Analizler</h1>
          <p className="text-muted-foreground">
            İşletmenizin performansını izleyin ve analiz edin
          </p>
        </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rapor ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className="gap-2"
            >
              {category.icon}
              <span className="hidden sm:inline">{category.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Reports by Category */}
      {selectedCategory === 'all' ? (
        categoryGroups.map((category) => (
          category.reports.length > 0 && (
            <div key={category.id} className="space-y-4">
              <div className="flex items-center gap-2">
                {category.icon}
                <h2 className="text-xl font-semibold">{category.label} Raporları</h2>
                <span className="text-sm text-muted-foreground">({category.reports.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.reports.map((report) => (
                  <ReportCardComponent key={report.id} report={report} />
                ))}
              </div>
            </div>
          )
        ))
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => (
            <ReportCardComponent key={report.id} report={report} />
          ))}
        </div>
      )}

      {/* No Results */}
      {filteredReports.length === 0 && (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Rapor bulunamadı</h3>
          <p className="text-muted-foreground">
            Arama kriterlerinizi değiştirip tekrar deneyin
          </p>
        </Card>
      )}
      </div>
    </>
  );
}

function ReportCardComponent({ report }: { report: ReportCard }) {
  return (
    <Link href={report.href}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="p-2 bg-primary/10 rounded-lg">
              {report.icon}
            </div>
            {report.badge && (
              <span className={`
                px-2 py-1 text-xs font-medium rounded-full
                ${report.badge === 'Kritik' ? 'bg-red-100 text-red-700' : ''}
                ${report.badge === 'Önemli' ? 'bg-orange-100 text-orange-700' : ''}
              `}>
                {report.badge}
              </span>
            )}
          </div>
          <CardTitle className="text-lg mt-4">{report.title}</CardTitle>
          <CardDescription className="line-clamp-2">
            {report.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" size="sm" className="w-full group">
            Rapora Git
            <TrendingUp className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
