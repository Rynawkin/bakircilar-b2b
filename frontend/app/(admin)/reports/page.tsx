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
  Search
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  category: 'cost' | 'stock' | 'customer' | 'order';
  badge?: string;
}

const reports: ReportCard[] = [
  // Fiyat & Maliyet Raporları
  {
    id: 'cost-update-alerts',
    title: 'Maliyet Güncelleme Uyarıları',
    description: 'Son giriş maliyeti güncel maliyetten yüksek olan ürünler',
    icon: <AlertTriangle className="h-5 w-5" />,
    href: '/reports/cost-update-alerts',
    category: 'cost',
    badge: 'Önemli',
  },
  {
    id: 'loss-products',
    title: 'Zarar Edilen Ürünler',
    description: 'Satış fiyatı maliyetin altında olan ürünler',
    icon: <TrendingDown className="h-5 w-5" />,
    href: '/reports/loss-products',
    category: 'cost',
  },
  {
    id: 'profit-analysis',
    title: 'Kar/Zarar Analizi',
    description: 'Tüm ürünlerin kar marjı analizi',
    icon: <DollarSign className="h-5 w-5" />,
    href: '/reports/profit-analysis',
    category: 'cost',
  },

  // Stok Raporları
  {
    id: 'critical-stock',
    title: 'Kritik Stok Seviyeleri',
    description: 'Minimum stok seviyesinin altındaki ürünler',
    icon: <Package className="h-5 w-5" />,
    href: '/reports/critical-stock',
    category: 'stock',
  },
  {
    id: 'inactive-stock',
    title: 'Hareketsiz Stoklar',
    description: 'Uzun süredir hareket görmemiş ürünler',
    icon: <Clock className="h-5 w-5" />,
    href: '/reports/inactive-stock',
    category: 'stock',
  },

  // Müşteri Raporları
  {
    id: 'overdue-customers',
    title: 'Vade Aşımı Uyarıları',
    description: 'Vadesi geçmiş alacakları olan müşteriler',
    icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
    href: '/reports/overdue-customers',
    category: 'customer',
    badge: 'Kritik',
  },
  {
    id: 'top-customers',
    title: 'En Çok Alışveriş Yapan Müşteriler',
    description: 'Yüksek cirolu müşteri analizi',
    icon: <Users className="h-5 w-5" />,
    href: '/reports/top-customers',
    category: 'customer',
  },
];

const categories = [
  { id: 'all', label: 'Tümü', icon: <FileText className="h-4 w-4" /> },
  { id: 'cost', label: 'Fiyat & Maliyet', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'stock', label: 'Stok', icon: <Package className="h-4 w-4" /> },
  { id: 'customer', label: 'Müşteri', icon: <Users className="h-4 w-4" /> },
];

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredReports = reports.filter((report) => {
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || report.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryGroups = categories.filter(c => c.id !== 'all').map((category) => ({
    ...category,
    reports: filteredReports.filter((r) => r.category === category.id),
  }));

  return (
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
