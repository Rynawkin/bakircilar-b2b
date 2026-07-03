'use client';

import {
  AlertTriangle,
  BarChart3,
  CircleDot,
  Clock,
  DollarSign,
  FileText,
  HandCoins,
  History,
  MapPin,
  Package,
  ShoppingCart,
  Sigma,
  Sparkles,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Rapor Merkezi ekraninin TUM mantigi (state/turetilmis deger) + statik veri (rapor listesi,
 * kategoriler, rozet/stil haritalari) bu hook'ta toplanir.
 *
 * Klasik ve yeni gorunum AYNI hook'u kullanir; gorsel disindaki hicbir mantik/veri degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export type ReportCategory = 'cost' | 'stock' | 'customer' | 'order';

export interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  category: ReportCategory;
  badge?: string;
  tags: string[];
  highImpact?: boolean;
  permission?: string | string[];
}

export const reports: ReportCard[] = [
  {
    id: 'cost-update-alerts',
    title: 'Maliyet Guncelleme Uyarilari',
    description: 'Son giris maliyeti guncel maliyetten yuksek olan urunleri takip edin',
    icon: <AlertTriangle className="h-5 w-5" />,
    href: '/reports/cost-update-alerts',
    category: 'cost',
    badge: 'Aktif',
    tags: ['Aksiyon', 'Fiyat'],
    highImpact: true,
    permission: 'reports:cost-update-alerts',
  },
  {
    id: 'cost-update-all-products',
    title: 'Tum Urunler Maliyet/Fiyat Guncelleme',
    description: 'Tum urunleri kolon bazli inceleyip maliyet ve liste fiyatlarini guncelleyin',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/cost-update-all-products',
    category: 'cost',
    badge: 'Yeni',
    tags: ['Toplu Islem', 'Maliyet'],
    permission: 'reports:cost-update-all-products',
  },
  {
    id: 'profit-analysis',
    title: 'Kar Marji Analizi',
    description: 'Urun, kategori, marka ve musteri tipi bazinda kar marji dagilimini inceleyin',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/profit-analysis',
    category: 'cost',
    badge: 'Onerilen',
    tags: ['Analiz', 'Marj'],
  },
  {
    id: 'ucarer-depo',
    title: 'Ucarer Depo Karar Raporu',
    description: 'Merkez ve topca depo icin siparis, dsv ve min-max kararlarini yonetin',
    icon: <Warehouse className="h-5 w-5" />,
    href: '/reports/ucarer-depo',
    category: 'stock',
    badge: 'Yeni',
    tags: ['Karar Destek', 'Depo'],
    highImpact: true,
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'ucarer-minmax',
    title: 'Ucarer MinMax Dinamik',
    description: 'Min-max degerlerini dinamik hesaplayan prosedur sonucunu izleyin',
    icon: <Sigma className="h-5 w-5" />,
    href: '/reports/ucarer-depo',
    category: 'stock',
    badge: 'Yeni',
    tags: ['Planlama', 'MinMax'],
    permission: 'reports:ucarer-minmax',
  },
  {
    id: 'ucarer-minmax-exclusions',
    title: 'MinMax Hesaplanmayacaklar',
    description: 'Haric tutulan stoklari yonetip tekrar hesaplamaya dahil edin',
    icon: <Sigma className="h-5 w-5" />,
    href: '/reports/ucarer-minmax-exclusions',
    category: 'stock',
    badge: 'Yeni',
    tags: ['Kontrol', 'Haric Liste'],
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'toplu-audit',
    title: 'TOPLU Denetim',
    description: 'Ritmik TOPLU alimlari yakalayin ve grubu topludan cikarip min-max hesabina dahil edin',
    icon: <History className="h-5 w-5" />,
    href: '/reports/toplu-audit',
    category: 'stock',
    badge: 'Yeni',
    tags: ['TOPLU', 'MinMax', 'Denetim'],
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'barter-radar',
    title: 'Borc-Mal Takasi',
    description: 'Vadesi gecmis carilerin tedarik edebilecegi ihtiyac urunlerini eslestirir (salt rapor)',
    icon: <HandCoins className="h-5 w-5" />,
    href: '/reports/barter-radar',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Tahsilat', 'Takas', 'Ihtiyac'],
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'sticky-discounts',
    title: 'Yapiskan Iskonto',
    description: 'Son-satis fiyati mekanizmasinin kalicilastirdigi eriyen iskontolari ve aylik kaybi gosterir',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/sticky-discounts',
    category: 'cost',
    badge: 'Yeni',
    tags: ['Fiyat', 'Iskonto', 'Kayip'],
    permission: 'reports:margin-compliance',
  },
  {
    id: 'product-families',
    title: 'Stok Aile Yonetimi',
    description: 'Urun havuzundan secerek stok ailesi olusturun ve duzenleyin',
    icon: <Warehouse className="h-5 w-5" />,
    href: '/reports/product-families',
    category: 'stock',
    badge: 'Yeni',
    tags: ['Urun Yapisi', 'Stok'],
    permission: 'reports:ucarer-depo',
  },
  {
    id: 'price-family-costs',
    title: 'Fiyat Ailesi Maliyet Kontrolu',
    description: 'Fiyat ailelerinde eski kalan guncel maliyet tarihlerini yakalayip ayni ekrandan duzeltin',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/price-family-costs',
    category: 'cost',
    badge: 'Yeni',
    tags: ['Fiyat Ailesi', 'Maliyet'],
    highImpact: true,
    permission: 'reports:price-family-costs',
  },
  {
    id: 'supplier-costs',
    title: 'Tedarikci Maliyet Havuzu',
    description: 'Ayni urun icin farkli tedarikci maliyetlerini tutun, risk/firsat raporlarini izleyin ve secileni Mikroya uygulayin',
    icon: <HandCoins className="h-5 w-5" />,
    href: '/supplier-costs',
    category: 'cost',
    badge: 'Yeni',
    tags: ['Tedarik', 'Maliyet', 'Rapor'],
    highImpact: true,
    permission: 'admin:supplier-costs',
  },
  {
    id: 'top-products',
    title: 'En Cok Satan Urunler',
    description: 'Yuksek cirolu urunleri ve satis trendlerini analiz edin',
    icon: <TrendingUp className="h-5 w-5" />,
    href: '/reports/top-products',
    category: 'customer',
    badge: 'Onerilen',
    tags: ['Satis', 'Trend'],
    highImpact: true,
  },
  {
    id: 'complement-missing',
    title: 'Tamamlayici Urun Eksikleri',
    description: 'Secilen urun veya cari icin tamamlayici urun eksiklerini listeler',
    icon: <Package className="h-5 w-5" />,
    href: '/reports/complement-missing',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Firsat', 'Capraz Satis'],
    permission: 'reports:complement-missing',
  },
  {
    id: 'category-churn',
    title: 'Kategori Alim Kaybi',
    description: 'Musterinin daha once alip son X ayda almadigi kategorileri bulur',
    icon: <CircleDot className="h-5 w-5" />,
    href: '/reports/category-churn',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Kayip', 'Geri Kazanim'],
    permission: 'reports:complement-missing',
  },
  {
    id: 'customer-recovery',
    title: 'Cari Geri Kazanim',
    description: 'Hareketi duran veya ortalamasinin altina dusen carileri not, takip ve gelisme durumuyla yonetin',
    icon: <AlertTriangle className="h-5 w-5" />,
    href: '/reports/customer-recovery',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Kayip', 'Takip', 'Geri Kazanim'],
    highImpact: true,
    permission: 'reports:customer-recovery',
  },
  {
    id: 'category-opportunity',
    title: 'Kategori Firsat Onerileri',
    description: 'Cariye hic alinmamis kategori icin davranis tabanli urun onerileri uretir',
    icon: <Sparkles className="h-5 w-5" />,
    href: '/reports/category-opportunity',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Capraz Satis', 'Firsat'],
    permission: 'reports:complement-missing',
  },
  {
    id: 'customer-activity',
    title: 'Musteri Aktivite Takibi',
    description: 'Sayfa, urun ve sepet hareketlerini detayli olarak izleyin',
    icon: <Clock className="h-5 w-5" />,
    href: '/reports/customer-activity',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Takip', 'Musteri Davranisi'],
    permission: 'reports:customer-activity',
  },
  {
    id: 'field-sales-visits',
    title: 'Saha Ziyaretleri',
    description: 'Saha satis ziyaret carilerini ve cari notlarini fotograf, konum ve personel bazinda takip edin',
    icon: <MapPin className="h-5 w-5" />,
    href: '/reports/field-sales-visits',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Saha', 'Ziyaret', 'Not'],
    highImpact: true,
    permission: 'admin:field-sales',
  },
  {
    id: 'staff-activity',
    title: 'Personel Aktivite Takibi',
    description: 'Personelin yaptigi API islemleri ve operasyon adimlarini kaydeder',
    icon: <History className="h-5 w-5" />,
    href: '/reports/staff-activity',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Takip', 'Personel'],
    permission: 'reports:staff-activity',
  },
  {
    id: 'customer-carts',
    title: 'Musteri Sepetleri',
    description: 'Musterilerin guncel sepetlerini ve kalem detaylarini gosteren gorunum',
    icon: <ShoppingCart className="h-5 w-5" />,
    href: '/reports/customer-carts',
    category: 'customer',
    badge: 'Yeni',
    tags: ['Sepet', 'Donusum'],
    permission: 'reports:customer-carts',
  },
  {
    id: 'overdue-payments',
    title: 'Vade & Alacak Takip Raporu',
    description: 'Vadesi gecmis alacaklari takip edip aksiyon listesi olusturun',
    icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
    href: '/vade',
    category: 'customer',
    badge: 'Onerilen',
    tags: ['Tahsilat', 'Risk'],
  },
  {
    id: 'supplier-price-lists',
    title: 'Tedarikci Fiyat Karsilastirma',
    description: 'Excel ve PDF listelerini yukleyip eslesen-eslesmeyen urunleri gorun',
    icon: <FileText className="h-5 w-5" />,
    href: '/reports/supplier-price-lists',
    category: 'order',
    badge: 'Yeni',
    tags: ['Tedarik', 'Karsilastirma'],
    highImpact: true,
    permission: 'reports:supplier-price-lists',
  },
];

export const categories: Array<{ id: 'all' | ReportCategory; label: string; icon: ReactNode }> = [
  { id: 'all', label: 'Tumu', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'cost', label: 'Fiyat & Maliyet', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'stock', label: 'Stok', icon: <Package className="h-4 w-4" /> },
  { id: 'customer', label: 'Satis & Musteri', icon: <Users className="h-4 w-4" /> },
  { id: 'order', label: 'Tedarik Zinciri', icon: <FileText className="h-4 w-4" /> },
];

export function useRaporMerkezi() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ReportCategory>('all');

  const canAccessReport = (permission?: string | string[]) => {
    if (!permission) return true;
    if (permissionsLoading) return true;
    if (Array.isArray(permission)) {
      return permission.some((perm) => hasPermission(perm));
    }
    return hasPermission(permission);
  };

  const visibleReports = useMemo(
    () => reports.filter((report) => canAccessReport(report.permission)),
    [hasPermission, permissionsLoading]
  );

  const categoryCounts = useMemo(
    () =>
      visibleReports.reduce<Record<ReportCategory, number>>(
        (acc, report) => {
          acc[report.category] += 1;
          return acc;
        },
        { cost: 0, stock: 0, customer: 0, order: 0 }
      ),
    [visibleReports]
  );

  const activeCategoryCount = useMemo(
    () => Object.values(categoryCounts).filter((count) => count > 0).length,
    [categoryCounts]
  );

  const searchTokens = useMemo(() => buildSearchTokens(searchQuery), [searchQuery]);

  const filteredReports = useMemo(
    () =>
      visibleReports.filter((report) => {
        const haystack = normalizeSearchText(`${report.title} ${report.description}`);
        const matchesSearch = searchTokens.length === 0 || matchesSearchTokens(haystack, searchTokens);
        const matchesCategory = selectedCategory === 'all' || report.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [searchTokens, selectedCategory, visibleReports]
  );

  const categoryGroups = categories
    .filter((category): category is { id: ReportCategory; label: string; icon: ReactNode } => category.id !== 'all')
    .map((category) => ({
      ...category,
      reports: filteredReports.filter((report) => report.category === category.id),
    }));

  return {
    // statik veri (gorunumler icin)
    reports,
    categories,
    // state
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    // turetilmis degerler
    visibleReports,
    categoryCounts,
    activeCategoryCount,
    filteredReports,
    categoryGroups,
  };
}
