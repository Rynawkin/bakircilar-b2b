'use client';

import Link from 'next/link';
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
import {
  useMusteriAktivite,
  formatDuration,
  formatDateTime,
  typeLabels,
  type ActivityType,
  type ActivityEventRow,
} from './useMusteriAktivite';

/**
 * Klasik gorunum: Musteri Aktivite Takibi raporu.
 * Mevcut JSX birebir korunmustur; tum mantik useMusteriAktivite hook'undan gelir.
 */
export default function MusteriAktiviteClassic() {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    userId,
    setUserId,
    submitted,
    summary,
    topPages,
    topClickPages,
    topProducts,
    topUsers,
    events,
    eventTypeFilter,
    setEventTypeFilter,
    showActivePings,
    setShowActivePings,
    eventSearch,
    setEventSearch,
    metadata,
    page,
    setPage,
    totalPages,
    loading,
    error,
    filteredEvents,
    parseCustomerOption,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
  } = useMusteriAktivite();

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
