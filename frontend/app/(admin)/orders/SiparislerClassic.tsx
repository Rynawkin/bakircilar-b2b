'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useSiparisler } from './useSiparisler';

/**
 * Klasik (mevcut) Siparisler gorunumu.
 * JSX, eski page.tsx ile BIRE BIR aynidir; tum mantik useSiparisler hook'undan gelir.
 */
export default function SiparislerClassic() {
  const {
    router,
    activeTab,
    setActiveTab,
    sourceTab,
    setSourceTab,
    searchTerm,
    setSearchTerm,
    isLoading,
    isFetching,
    filteredOrders,
    counts,
    sourceCounts,
    emptyStateMessage,
    page,
    pagination,
    totalPages,
    canPrev,
    canNext,
    goPrev,
    goNext,
    expandedOrders,
    toggleExpanded,
    selectedOrderIds,
    isBulkProcessing,
    toggleOrderSelection,
    selectablePendingOrders,
    selectedCount,
    allPendingSelected,
    toggleSelectAllPending,
    setSelectedOrderIds,
    openEdit,
    handleApprove,
    handleReject,
    handleBulkApprove,
    handleBulkReject,
    handleOrderPdfExport,
    handleOrderExcelExport,
  } = useSiparisler();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">⏳ Bekliyor</Badge>;
      case 'APPROVED':
        return <Badge variant="success">✅ Onaylandı</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">❌ Reddedildi</Badge>;
      default:
        return null;
    }
  };

  const pageHeader = (
    <div className="container-custom py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Siparisler</h1>
          <p className="text-sm text-gray-600">Tum musteri siparisleri</p>
        </div>
        <Button variant="primary" onClick={() => router.push('/quotes/new?mode=order')}>
          Yeni Siparis
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {pageHeader}
        <div className="container-custom pb-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {pageHeader}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'PENDING'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏳ Bekleyen
              {counts.pending !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'PENDING' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'APPROVED'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✅ Onaylanan
              {counts.approved !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts.approved}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('REJECTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'REJECTED'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ❌ Reddedilen
              {counts.rejected !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts.rejected}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'ALL'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Tümü
              {counts.all !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'ALL' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts.all}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto py-3">
            <button
              onClick={() => setSourceTab('ALL')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'ALL'
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              Tum Siparisler
              {sourceCounts.all !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  sourceTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {sourceCounts.all}
                </span>
              )}
            </button>
            <button
              onClick={() => setSourceTab('CUSTOMER')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'CUSTOMER'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              Musteri Siparisleri
              {sourceCounts.customer !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  sourceTab === 'CUSTOMER' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {sourceCounts.customer}
                </span>
              )}
            </button>
            <button
              onClick={() => setSourceTab('B2B')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'B2B'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              B2B Siparisleri
              {sourceCounts.b2b !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  sourceTab === 'B2B' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {sourceCounts.b2b}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adi, siparis no, belge no, musteri kodu veya urun adi ara..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
          </div>
          {searchTerm && (
            <Button variant="secondary" onClick={() => setSearchTerm('')}>
              Temizle
            </Button>
          )}
        </div>

        {/* 3.9: Toplu islem cubugu - sadece listede bekleyen siparis varken gorunur */}
        {selectablePendingOrders.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={allPendingSelected}
                onChange={toggleSelectAllPending}
              />
              Bekleyenleri sec ({selectablePendingOrders.length})
              {selectedCount > 0 && (
                <span className="text-xs font-normal text-gray-500">- {selectedCount} secili</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={selectedCount === 0 || isBulkProcessing}
                onClick={handleBulkApprove}
              >
                {isBulkProcessing ? 'Isleniyor...' : 'Secilenleri Onayla'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={selectedCount === 0 || isBulkProcessing}
                onClick={handleBulkReject}
              >
                Secilenleri Reddet
              </Button>
              {selectedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isBulkProcessing}
                  onClick={() => setSelectedOrderIds(new Set())}
                >
                  Secimi Temizle
                </Button>
              )}
            </div>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              {emptyStateMessage}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const customerName =
                order.user?.displayName ||
                order.user?.mikroName ||
                order.user?.name ||
                '-';
              const creatorLabel = order.requestedBy?.name
                ? `${order.requestedBy.name} (B2B)`
                : order.customerRequest?.requestedBy?.name
                  ? `${order.customerRequest.requestedBy.name} (Talep)`
                  : `${customerName} (Musteri)`;

              return (

              <Card key={order.id} className="overflow-hidden">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {/* 3.9: Sadece bekleyen siparisler toplu islem icin secilebilir */}
                    {order.status === 'PENDING' && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        aria-label="Siparisi sec"
                      />
                    )}
                  <div>
                    <div className="text-xs text-gray-500">Cari</div>
                    <div className="font-semibold text-gray-900">{customerName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Kod: {order.user?.mikroCariCode || '-'} - Siparis #{order.orderNumber} - {formatDate(order.createdAt)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Olusturan: {creatorLabel}</div>
                    {order.customerOrderNumber && (
                      <div className="text-xs text-gray-500 mt-1">Belge No: {order.customerOrderNumber}</div>
                    )}
                    {order.deliveryLocation && (
                      <div className="text-xs text-gray-500 mt-1">Teslimat: {order.deliveryLocation}</div>
                    )}

                    {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.mikroOrderIds.map((mikroId, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                            <span className="text-xs font-medium text-blue-700">Mikro ID:</span>
                            <span className="text-xs font-mono font-bold text-blue-900">{mikroId}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {order.adminNote && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-gray-600">Admin Notu:</p>
                        <p className="text-sm text-gray-800 mt-1">{order.adminNote}</p>
                      </div>
                    )}

                    {order.sourceQuote && (
                      <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-emerald-700">Teklif Kaynagi</p>
                        <p className="text-xs text-emerald-700 mt-1">
                          Teklif No: {order.sourceQuote.quoteNumber}
                          {order.sourceQuote.createdAt ? ` - ${formatDate(order.sourceQuote.createdAt)}` : ''}
                        </p>
                        <div className="mt-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push(`/quotes?history=${order.sourceQuote?.id}`)}
                          >
                            Teklif Gecmisi
                          </Button>
                        </div>
                      </div>
                    )}

                    {order.customerRequest && (
                      <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-indigo-700">Talep Kaynagi</p>
                        <p className="text-xs text-indigo-700 mt-1">Talep ID: {order.customerRequest.id.slice(0, 8)}</p>
                        {order.customerRequest.requestedBy && (
                          <p className="text-xs text-indigo-700 mt-1">
                            Talep eden: {order.customerRequest.requestedBy.name}
                            {order.customerRequest.requestedBy.email ? ` (${order.customerRequest.requestedBy.email})` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {getStatusBadge(order.status)}
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Toplam</div>
                      <div className="text-lg font-bold text-primary-600">{formatCurrency(order.totalAmount)}</div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                      onClick={() => toggleExpanded(order.id)}
                    >
                      {isExpanded ? 'Detayi Gizle' : 'Detayi Goster'}
                      <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'>'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => handleOrderPdfExport(order)}>
                    Siparis Proforma PDF
                  </Button>
                  <Button variant="secondary" onClick={() => handleOrderExcelExport(order)}>
                    Siparis Proforma Excel
                  </Button>
                    {(order.status === 'PENDING' || order.status === 'APPROVED') && (
                      <Button variant="secondary" onClick={() => openEdit(order)}>
                        Duzenle
                      </Button>
                    )}
                  {order.status === 'PENDING' && (
                    <>
                      <Button variant="primary" onClick={() => handleApprove(order.id)}>
                        Onayla ve Mikro'ya Gonder
                      </Button>
                      <Button variant="danger" onClick={() => handleReject(order.id)}>
                        Reddet
                      </Button>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Musteri Bilgileri</h4>
                      <CustomerInfoCard customer={order.user} />
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Siparis Kalemleri ({order.items.length} urun)</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-gray-100">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.productName}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-xs text-gray-500">{item.mikroCode}</span>
                                <Badge variant={item.priceType === 'INVOICED' ? 'info' : 'default'} className="text-xs">
                                  {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                                </Badge>
                              </div>
                              {item.lineNote && (
                                <p className="text-xs text-gray-500 mt-1">Not: {item.lineNote}</p>
                              )}
                              {item.responsibilityCenter && (
                                <p className="text-xs text-gray-500 mt-1">Sorumluluk: {item.responsibilityCenter}</p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                              <p className="font-semibold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {order.status === 'APPROVED' && order.approvedAt && (
                      <div className="pt-4 border-t border-gray-200 text-center">
                        <p className="text-sm text-green-700">
                          Onaylandi: {formatDate(order.approvedAt)}
                        </p>
                      </div>
                    )}
                    {order.status === 'REJECTED' && order.rejectedAt && (
                      <div className="pt-4 border-t border-gray-200 text-center">
                        <p className="text-sm text-red-700">
                          Reddedildi: {formatDate(order.rejectedAt)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Card>
            );
            })}
          </div>
        )}

        {/* Sunucu-tarafli sayfalama kontrolu */}
        {pagination.total > 0 && (
          <div className="mt-6 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-gray-600">
              Sayfa <b className="text-gray-900">{page}</b> / {totalPages} · Toplam{' '}
              <b className="text-gray-900">{pagination.total}</b>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={!canPrev || isFetching} onClick={goPrev}>
                Onceki
              </Button>
              <Button variant="secondary" size="sm" disabled={!canNext || isFetching} onClick={goNext}>
                Sonraki
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
