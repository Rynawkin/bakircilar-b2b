'use client';

import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDot,
  Clock,
  DollarSign,
  FileText,
  Filter,
  History,
  Package,
  Search,
  ShoppingCart,
  Sigma,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils/cn';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

type ReportCategory = 'cost' | 'stock' | 'customer' | 'order';

interface ReportCard {
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

const reports: ReportCard[] = [
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
    permission: 'reports:cost-update-alerts',
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

const categories: Array<{ id: 'all' | ReportCategory; label: string; icon: ReactNode }> = [
  { id: 'all', label: 'Tumu', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'cost', label: 'Fiyat & Maliyet', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'stock', label: 'Stok', icon: <Package className="h-4 w-4" /> },
  { id: 'customer', label: 'Satis & Musteri', icon: <Users className="h-4 w-4" /> },
  { id: 'order', label: 'Tedarik Zinciri', icon: <FileText className="h-4 w-4" /> },
];

const categoryAccent: Record<ReportCategory, string> = {
  cost: 'from-amber-50 to-orange-100 text-orange-700',
  stock: 'from-emerald-50 to-lime-100 text-emerald-700',
  customer: 'from-sky-50 to-cyan-100 text-cyan-700',
  order: 'from-slate-100 to-gray-200 text-slate-700',
};

const categoryPanelStyles: Record<ReportCategory, string> = {
  cost: 'border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-white',
  stock: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-lime-50/40 to-white',
  customer: 'border-cyan-200/70 bg-gradient-to-br from-cyan-50/70 via-sky-50/40 to-white',
  order: 'border-slate-200/80 bg-gradient-to-br from-slate-50/80 via-gray-50/50 to-white',
};

const categoryTitleStyles: Record<ReportCategory, string> = {
  cost: 'text-orange-900',
  stock: 'text-emerald-900',
  customer: 'text-cyan-900',
  order: 'text-slate-900',
};

const categoryPillStyles: Record<ReportCategory, string> = {
  cost: 'bg-orange-100 text-orange-700 border border-orange-200',
  stock: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  customer: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
  order: 'bg-slate-100 text-slate-700 border border-slate-200',
};

const badgeStyles: Record<string, string> = {
  Aktif: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Yeni: 'bg-blue-100 text-blue-700 border border-blue-200',
  Onerilen: 'bg-amber-100 text-amber-700 border border-amber-200',
  Kritik: 'bg-red-100 text-red-700 border border-red-200',
  Onemli: 'bg-orange-100 text-orange-700 border border-orange-200',
};

export default function ReportsPage() {
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

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-primary-700 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-primary-300/25 blur-2xl" />

        <div className="relative space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/90">
            <CircleDot className="h-3.5 w-3.5" />
            Karar Destek Paneli
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Rapor Merkezi</h1>
          <p className="max-w-2xl text-sm text-slate-100/90 sm:text-base">
            Operasyon, satis ve stok kararlarinizi tek panelde hizli takip edin.
          </p>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 text-sm sm:w-fit sm:grid-cols-3">
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-white/75">Toplam rapor</p>
            <p className="mt-1 text-2xl font-semibold">{visibleReports.length}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-white/75">Gorunen</p>
            <p className="mt-1 text-2xl font-semibold">{filteredReports.length}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm sm:col-span-1">
            <p className="text-white/75">Aktif kategori</p>
            <p className="mt-1 text-2xl font-semibold">{selectedCategory === 'all' ? activeCategoryCount : '1'}</p>
          </div>
        </div>
      </div>

      <Card className="border-gray-200 bg-gradient-to-r from-white to-slate-50 shadow-md">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Rapor ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl border-gray-200 bg-white pl-10"
              />
            </div>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 text-sm text-gray-600">
              <Filter className="h-4 w-4" />
              Filtreler
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const count = category.id === 'all' ? visibleReports.length : categoryCounts[category.id];
              const isActive = selectedCategory === category.id;
              return (
                <Button
                  key={category.id}
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className={cn(
                    'h-10 rounded-full border px-4 text-sm transition-all',
                    isActive
                      ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                  )}
                >
                  {category.icon}
                  <span>{category.label}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedCategory === 'all' ? (
        categoryGroups.map(
          (category) =>
            category.reports.length > 0 && (
              <CategoryPanel
                key={category.id}
                category={category.id}
                title={category.label}
                icon={category.icon}
                reports={category.reports}
              />
            )
        )
      ) : (
        <CategoryPanel
          category={selectedCategory}
          title={categories.find((c) => c.id === selectedCategory)?.label ?? 'Raporlar'}
          icon={categories.find((c) => c.id === selectedCategory)?.icon ?? <FileText className="h-4 w-4" />}
          reports={filteredReports}
        />
      )}

      {filteredReports.length === 0 && (
        <Card className="border-dashed border-gray-300 bg-white/90 p-12 text-center shadow-sm">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Rapor bulunamadi</h3>
          <p className="mt-1 text-sm text-gray-500">Arama kelimesi veya kategori filtresini degistirin.</p>
        </Card>
      )}
    </div>
  );
}

function CategoryPanel({
  category,
  title,
  icon,
  reports,
}: {
  category: ReportCategory;
  title: string;
  icon: ReactNode;
  reports: ReportCard[];
}) {
  const featured = reports.find((report) => report.highImpact) ?? reports[0];
  const compactReports = reports.filter((report) => report.id !== featured?.id);

  if (!featured) return null;

  return (
    <section className={cn('space-y-4 rounded-3xl border p-4 shadow-sm sm:p-6', categoryPanelStyles[category])}>
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-white p-2 text-gray-700 shadow-sm">{icon}</div>
        <h2 className={cn('text-xl font-semibold', categoryTitleStyles[category])}>{title}</h2>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-600">{reports.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <FeaturedReportCard report={featured} category={category} expanded={compactReports.length === 0} />

        {compactReports.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:col-span-3">
            {compactReports.map((report) => (
              <CompactReportCard key={report.id} report={report} category={category} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturedReportCard({
  report,
  category,
  expanded,
}: {
  report: ReportCard;
  category: ReportCategory;
  expanded: boolean;
}) {
  return (
    <Link href={report.href} className={expanded ? 'xl:col-span-5' : 'xl:col-span-2'}>
      <Card className="group h-full border border-gray-200 bg-white/90 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', categoryPillStyles[category])}>
              One Cikan Rapor
            </span>
            {report.badge && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  badgeStyles[report.badge] ?? 'border border-gray-200 bg-gray-100 text-gray-600'
                )}
              >
                {report.badge}
              </span>
            )}
          </div>

          <div className="flex items-start gap-3">
            <div className={cn('rounded-xl bg-gradient-to-br p-2.5 shadow-sm', categoryAccent[report.category])}>
              {report.icon}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl leading-tight text-gray-900">{report.title}</CardTitle>
              <CardDescription className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">
                {report.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            {report.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                {tag}
              </span>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
            Raporu Ac
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompactReportCard({ report, category }: { report: ReportCard; category: ReportCategory }) {
  return (
    <Link href={report.href}>
      <Card className="group h-full border border-gray-200 bg-white/90 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg bg-gradient-to-br p-2 shadow-sm', categoryAccent[category])}>{report.icon}</div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="line-clamp-1 text-sm font-semibold text-gray-900">{report.title}</h3>
                {report.badge && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {report.badge}
                  </span>
                )}
              </div>

              <p className="line-clamp-2 text-xs leading-relaxed text-gray-600">{report.description}</p>

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {report.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {tag}
                    </span>
                  ))}
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-gray-700" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
