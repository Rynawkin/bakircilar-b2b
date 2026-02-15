'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Eye,
  MousePointerClick,
  RefreshCw,
  Search,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type ActivityType =
  | 'PAGE_VIEW'
  | 'PRODUCT_VIEW'
  | 'CART_ADD'
  | 'CART_REMOVE'
  | 'CART_UPDATE'
  | 'ACTIVE_PING'
  | 'CLICK'
  | 'SEARCH';

interface ActivitySummary {
  totalEvents: number;
  uniqueUsers: number;
  pageViews: number;
  productViews: number;
  cartAdds: number;
  cartRemoves: number;
  cartUpdates: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
}

interface TopPage {
  pagePath: string;
  count: number;
}

interface TopClickPage {
  pagePath: string;
  clickCount: number;
  eventCount: number;
}

interface TopProduct {
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  count: number;
}

interface TopUser {
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  eventCount: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
}

interface ActivityEventRow {
  id: string;
  type: ActivityType;
  createdAt: string;
  pagePath?: string | null;
  pageTitle?: string | null;
  productCode?: string | null;
  productName?: string | null;
  quantity?: number | null;
  durationSeconds?: number | null;
  clickCount?: number | null;
  meta?: any;
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
}

interface ActivityMetadata {
  startDate: string;
  endDate: string;
  customer?: {
    id: string;
    code: string;
    name: string | null;
  } | null;
  userId?: string | null;
}

interface ActivityResponse {
  summary: ActivitySummary;
  topPages: TopPage[];
  topClickPages: TopClickPage[];
  topProducts: TopProduct[];
  topUsers: TopUser[];
  events: ActivityEventRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: ActivityMetadata;
}

interface ActivityParams {
  startDate: string;
  endDate: string;
  customerCode?: string;
  userId?: string;
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const buildDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: toDateInput(start),
    end: toDateInput(end),
  };
};

const formatDuration = (value?: number | null) => {
  if (!Number.isFinite(value)) return '-';
  const totalSeconds = Math.max(0, Math.round(value as number));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}s ${minutes}dk`;
  if (minutes > 0) return `${minutes}dk ${seconds}sn`;
  return `${seconds}sn`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
};

const typeLabels: Record<ActivityType, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  PAGE_VIEW: { label: 'Sayfa', variant: 'info' },
  PRODUCT_VIEW: { label: 'Urun', variant: 'success' },
  CART_ADD: { label: 'Sepet +', variant: 'success' },
  CART_REMOVE: { label: 'Sepet -', variant: 'danger' },
  CART_UPDATE: { label: 'Sepet Guncel', variant: 'warning' },
  ACTIVE_PING: { label: 'Aktiflik', variant: 'default' },
  CLICK: { label: 'Tiklama', variant: 'default' },
  SEARCH: { label: 'Arama', variant: 'info' },
};

function CustomerActivityReportPageInner() {
  const searchParams = useSearchParams();
  const appliedQueryRef = useRef(false);
  const defaults = useMemo(buildDefaultDates, []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [userId, setUserId] = useState('');
  const [submitted, setSubmitted] = useState<ActivityParams | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [topClickPages, setTopClickPages] = useState<TopClickPage[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<ActivityType | 'ALL'>('ALL');
  const [showActivePings, setShowActivePings] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [metadata, setMetadata] = useState<ActivityMetadata | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  useEffect(() => {
    if (appliedQueryRef.current) return;
    const queryCustomerCode = String(searchParams.get('customerCode') || '').trim();
    if (!queryCustomerCode) return;

    appliedQueryRef.current = true;
    setCustomerCode(queryCustomerCode);
    setCustomerName('');
    setCustomerSearch(queryCustomerCode);
    setCustomerOptions([]);
    setPage(1);
    setSubmitted({
      startDate,
      endDate,
      customerCode: queryCustomerCode,
      userId: undefined,
    });
  }, [searchParams, startDate, endDate]);

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2 || customerCode) {
      setCustomerOptions([]);
      return;
    }

    const handle = window.setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const result = await adminApi.searchCustomers({ searchTerm: term, limit: 12, offset: 0 });
        setCustomerOptions(result.data || []);
      } catch {
        setCustomerOptions([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [customerSearch, customerCode]);

  const handleRunReport = () => {
    if (!startDate || !endDate) {
      toast.error('Tarih araligi secin');
      return;
    }

    const normalizedCustomerCode = (customerCode || customerSearch).trim();
    const normalizedUserId = userId.trim();

    setPage(1);
    setSubmitted({
      startDate,
      endDate,
      customerCode: normalizedCustomerCode || undefined,
      userId: normalizedUserId || undefined,
    });
  };

  const fetchReport = async (params: ActivityParams, currentPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getCustomerActivityReport({
        ...params,
        page: currentPage,
        limit: 50,
      });

      if (!result?.success) {
        throw new Error('Rapor yuklenemedi');
      }

      const data = result.data as ActivityResponse;
      setSummary(data.summary);
      setTopPages(data.topPages || []);
      setTopClickPages(data.topClickPages || []);
      setTopProducts(data.topProducts || []);
      setTopUsers(data.topUsers || []);
      setEvents(data.events || []);
      setMetadata(data.metadata || null);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted, page);
  }, [submitted, page]);

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (eventTypeFilter !== 'ALL' && event.type !== eventTypeFilter) return false;
      if (eventTypeFilter === 'ALL' && !showActivePings && event.type === 'ACTIVE_PING') return false;
      if (!term) return true;
      const metaQuery = typeof event.meta === 'object' && event.meta ? (event.meta as any).query : '';
      const haystack = [
        event.pagePath,
        event.pageTitle,
        event.productCode,
        event.productName,
        event.userName,
        event.customerName,
        event.customerCode,
        metaQuery,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [events, eventSearch, eventTypeFilter]);

  const summaryCards = summary
    ? [
        { label: 'Toplam Olay', value: summary.totalEvents, icon: Activity },
        { label: 'Tekil Kullanici', value: summary.uniqueUsers, icon: Users },
        { label: 'Sayfa Goruntuleme', value: summary.pageViews, icon: Eye },
        { label: 'Urun Goruntuleme', value: summary.productViews, icon: Eye },
        { label: 'Sepet Ekleme', value: summary.cartAdds, icon: ShoppingCart },
        { label: 'Sepet Silme', value: summary.cartRemoves, icon: ShoppingCart },
        { label: 'Sepet Guncelleme', value: summary.cartUpdates, icon: ShoppingCart },
        { label: 'Aktif Sure', value: formatDuration(summary.activeSeconds), icon: Activity },
        { label: 'Tiklama', value: summary.clickCount, icon: MousePointerClick },
        { label: 'Arama', value: summary.searchCount, icon: Search },
      ]
    : [];

  const renderEventTarget = (event: ActivityEventRow) => {
    if (event.productCode) {
      return (
        <div>
          <div className="font-mono text-xs">{event.productCode}</div>
          <div className="text-xs text-gray-600">{event.productName || '-'}</div>
        </div>
      );
    }

    if (event.type === 'SEARCH') {
      const query = typeof event.meta === 'object' && event.meta ? (event.meta as any).query : '';
      return (
        <div className="text-xs space-y-1">
          <div className="font-semibold">Arama: {query || '-'}</div>
          <div className="font-mono text-[10px] text-gray-500">{event.pagePath || '-'}</div>
        </div>
      );
    }

    return (
      <div className="text-xs">
        <div className="font-mono">{event.pagePath || '-'}</div>
        {event.pageTitle && <div className="text-gray-600">{event.pageTitle}</div>}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Raporlara Don
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary-600" />
            Musteri Aktivite Takibi
          </h1>
          <p className="text-sm text-muted-foreground">
            Sayfa, urun ve sepet davranislarini takip eder.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted, page)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>Rapor icin tarih ve cari secin.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="Baslangic Tarihi"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="Bitis Tarihi"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <div className="space-y-2">
              <div className="relative">
                <Input
                  label="Cari Ara"
                  placeholder="Kod veya isim"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerCode('');
                    setCustomerName('');
                  }}
                />
                {customerSearching && (
                  <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                )}
                {!customerCode && customerOptions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {customerOptions.map((item, index) => {
                      const parsed = parseCustomerOption(item);
                      if (!parsed.code) return null;
                      return (
                        <button
                          type="button"
                          key={`${parsed.code}-${index}`}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onClick={() => handleSelectCustomer(item)}
                        >
                          <div className="text-sm font-semibold">{parsed.code}</div>
                          <div className="text-xs text-gray-500">{parsed.name || '-'}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {customerName && (
                <div className="text-xs text-gray-500">Secilen cari: {customerName}</div>
              )}
            </div>
            <Input
              label="Kullanici ID"
              placeholder="Opsiyonel"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <Button onClick={handleRunReport}>Raporu Getir</Button>
          </div>
        </CardContent>
      </Card>

      {metadata && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Secim Ozeti</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tarih: {metadata.startDate} - {metadata.endDate}
            {metadata.customer?.code && (
              <span className="ml-4">
                Cari: {metadata.customer.code} {metadata.customer.name ? `- ${metadata.customer.name}` : ''}
              </span>
            )}
            {metadata.userId && <span className="ml-4">Kullanici: {metadata.userId}</span>}
          </CardContent>
        </Card>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <card.icon className="h-5 w-5 text-primary-600" />
                  <span className="text-xl font-bold">{card.value}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">En Cok Ziyaret Edilen Sayfalar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sayfa</TableHead>
                  <TableHead className="text-right">Goruntuleme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Veri yok
                    </TableCell>
                  </TableRow>
                ) : (
                  topPages.map((item) => (
                    <TableRow key={item.pagePath}>
                      <TableCell className="font-mono text-xs">{item.pagePath}</TableCell>
                      <TableCell className="text-right font-semibold">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">En Cok Tiklanan Sayfalar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sayfa</TableHead>
                  <TableHead className="text-right">Tiklama</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topClickPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Veri yok
                    </TableCell>
                  </TableRow>
                ) : (
                  topClickPages.map((item) => (
                    <TableRow key={item.pagePath}>
                      <TableCell className="font-mono text-xs">{item.pagePath}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.clickCount}
                        <div className="text-[10px] text-gray-500">{item.eventCount} ping</div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">En Cok Goruntulenen Urunler</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Urun</TableHead>
                  <TableHead className="text-right">Goruntuleme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Veri yok
                    </TableCell>
                  </TableRow>
                ) : (
                  topProducts.map((item, index) => (
                    <TableRow key={`${item.productCode || item.productId || index}`}>
                      <TableCell>
                        <div className="text-xs font-mono">{item.productCode || '-'}</div>
                        <div className="text-xs text-gray-600">{item.productName || '-'}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">En Aktif Kullanici Listesi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kullanici</TableHead>
                <TableHead>Cari</TableHead>
                <TableHead className="text-right">Olay</TableHead>
                <TableHead className="text-right">Aktif Sure</TableHead>
                <TableHead className="text-right">Tiklama</TableHead>
                <TableHead className="text-right">Arama</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Veri yok
                  </TableCell>
                </TableRow>
              ) : (
                topUsers.map((item) => (
                  <TableRow key={item.userId}>
                    <TableCell>{item.userName || item.userId}</TableCell>
                    <TableCell>
                      {item.customerCode
                        ? `${item.customerCode}${item.customerName ? ` - ${item.customerName}` : ''}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">{item.eventCount}</TableCell>
                    <TableCell className="text-right">{formatDuration(item.activeSeconds)}</TableCell>
                    <TableCell className="text-right">{item.clickCount}</TableCell>
                    <TableCell className="text-right">{item.searchCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detayli Olay Listesi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Yukleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-red-600">{error}</div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Veri bulunamadi</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 p-4 border-b">
                <div className="min-w-[180px]">
                  <Select
                    label="Tip"
                    value={eventTypeFilter}
                    onChange={(e) => setEventTypeFilter(e.target.value as ActivityType | 'ALL')}
                  >
                    <option value="ALL">Tum Tipler</option>
                    {Object.entries(typeLabels).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <Input
                    label="Ara"
                    placeholder="Sayfa, urun, cari, arama..."
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showActivePings}
                      onChange={(e) => setShowActivePings(e.target.checked)}
                      className="h-4 w-4 accent-primary-600"
                    />
                    Aktiflik pinglerini goster
                  </label>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Kullanici</TableHead>
                    <TableHead>Cari</TableHead>
                    <TableHead>Sayfa / Urun</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Sure</TableHead>
                    <TableHead className="text-right">Tiklama</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Filtreye uygun veri yok
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEvents.map((event) => {
                      const badge = typeLabels[event.type];
                      const customerLabel = event.customerCode
                        ? `${event.customerCode}${event.customerName ? ` - ${event.customerName}` : ''}`
                        : '-';
                      return (
                        <TableRow key={event.id}>
                          <TableCell className="text-xs">{formatDateTime(event.createdAt)}</TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{event.userName || event.userId}</TableCell>
                          <TableCell className="text-xs">{customerLabel}</TableCell>
                          <TableCell>{renderEventTarget(event)}</TableCell>
                          <TableCell className="text-right">{event.quantity ?? '-'}</TableCell>
                          <TableCell className="text-right">{formatDuration(event.durationSeconds)}</TableCell>
                          <TableCell className="text-right">{event.clickCount ?? '-'}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                    >
                      Onceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CustomerActivityReportPage() {
  return (
    <Suspense
      fallback={(
        <div className="container mx-auto p-6">
          <div className="text-gray-500">Rapor yukleniyor...</div>
        </div>
      )}
    >
      <CustomerActivityReportPageInner />
    </Suspense>
  );
}
