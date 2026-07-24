'use client';

import {
  Plus,
  Search,
  X,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Pencil,
  Check,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { CommercialListFilters } from '@/components/admin/CommercialListFilters';
import { useSiparisler, OrderStatus, OrderSource } from './useSiparisler';
import { SiparisDetayModal } from './SiparisDetayModal';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Siparisler ekrani. Mevcut TUM mantik useSiparisler'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/durum dusurulmemistir; brief 4.3.1'deki her oge mevcut.
 */
export default function SiparislerNew() {
  const {
    router,
    activeTab,
    setActiveTab,
    sourceTab,
    setSourceTab,
    searchTerm,
    setSearchTerm,
    filters,
    updateFilter,
    clearFilters,
    filterOptions,
    filterOptionsLoading,
    isLoading,
    isFetching,
    loadError,
    retryFetch,
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
  const selectedDetailOrder =
    filteredOrders.find((order) => expandedOrders.has(order.id)) || null;

  // Durum sekmeleri — sunucu sayfalamada yalnizca AKTIF sekmenin toplami bilinir (digerleri null).
  const statusTabs: Array<{ key: OrderStatus; label: string; count: number | null; active: string }> = [
    { key: 'PENDING', label: 'Bekleyen', count: counts.pending, active: '#b45309' },
    { key: 'APPROVED', label: 'Onaylanan', count: counts.approved, active: '#047857' },
    { key: 'REJECTED', label: 'Reddedilen', count: counts.rejected, active: '#b91c1c' },
    { key: 'ALL', label: 'Tümü', count: counts.all, active: '#15356b' },
  ];

  // Kaynak filtresi — yalnizca AKTIF kaynagin toplami bilinir (digerleri null).
  const sourceTabs: Array<{ key: OrderSource; label: string; count: number | null }> = [
    { key: 'ALL', label: 'Tüm Kaynaklar', count: sourceCounts.all },
    { key: 'CUSTOMER', label: 'Müşteri', count: sourceCounts.customer },
    { key: 'B2B', label: 'B2B', count: sourceCounts.b2b },
  ];

  // Statu rozeti (yeni stil) — PENDING amber / APPROVED emerald / REJECTED red
  const renderStatusBadge = (status: string) => {
    if (status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1.5 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px] font-semibold px-2.5 py-1 rounded-full">
          <Clock width={12} height={12} stroke="currentColor" strokeWidth={2.2} />
          Bekliyor
        </span>
      );
    }
    if (status === 'APPROVED') {
      return (
        <span className="inline-flex items-center gap-1.5 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[11px] font-semibold px-2.5 py-1 rounded-full">
          <Check width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
          Onaylandı
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[11px] font-semibold px-2.5 py-1 rounded-full">
          <X width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
          Reddedildi
        </span>
      );
    }
    return null;
  };

  // Kaynak rozeti (B2B / Talep / Musteri)
  const renderSourceBadge = (creatorKind: 'B2B' | 'Talep' | 'Musteri') => {
    if (creatorKind === 'B2B') {
      return (
        <span className="inline-flex items-center bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[10px] font-semibold px-2 py-0.5 rounded-md">
          B2B
        </span>
      );
    }
    if (creatorKind === 'Talep') {
      return (
        <span className="inline-flex items-center bg-[#eef2fb] border border-[#c7d2fe] text-[#4338ca] text-[10px] font-semibold px-2 py-0.5 rounded-md">
          Talep
        </span>
      );
    }
    return (
      <span className="inline-flex items-center bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[10px] font-semibold px-2 py-0.5 rounded-md">
        Müşteri
      </span>
    );
  };

  const pageHeader = (
    <div className="flex items-end justify-between gap-4 mb-[18px] flex-wrap">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Siparişler</h1>
        <div className="text-[13px] text-[#8b97ac] mt-1.5">
          B2B onay kuyruğu · onayla, Mikro&apos;ya gönder, reddet, proforma çıkar
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push('/quotes/new?mode=order')}
        className="flex items-center gap-2 bg-[#15356b] text-white border-none rounded-[9px] px-[17px] py-[11px] text-[13.5px] font-semibold cursor-pointer hover:bg-[#1c4585]"
      >
        <Plus width={16} height={16} stroke="currentColor" strokeWidth={2.2} />
        Yeni Sipariş Oluştur
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {pageHeader}
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {pageHeader}

        {/* Durum sekmeleri (sayacli) + Kaynak filtresi (pill, sayacli) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
          {statusTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold cursor-pointer border ${
                  isActive
                    ? 'bg-white border-[#d3deef] shadow-[0_1px_2px_rgba(20,34,59,.06)]'
                    : 'bg-transparent border-transparent hover:bg-white/60'
                }`}
                style={{ color: isActive ? tab.active : '#8b97ac' }}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold"
                    style={{
                      background: isActive ? '#eef2fa' : '#f1f4f9',
                      color: isActive ? tab.active : '#8b97ac',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}

          <span className="w-px h-6 bg-[#e7ebf2] mx-1.5" />

          <span className="inline-flex bg-[#f1f4f9] rounded-lg p-[3px]">
            {sourceTabs.map((tab) => {
              const isActive = sourceTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSourceTab(tab.key)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-md cursor-pointer border-none bg-transparent"
                  style={
                    isActive
                      ? {
                          background: '#fff',
                          color: '#15356b',
                          fontWeight: 600,
                          border: '1px solid #d3deef',
                          boxShadow: '0 1px 2px rgba(20,34,59,.06)',
                        }
                      : { color: '#8b97ac', fontWeight: 500 }
                  }
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-semibold"
                      style={{
                        background: isActive ? '#eef2fa' : '#e7ebf2',
                        color: isActive ? '#15356b' : '#8b97ac',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </span>
        </div>

        {/* Arama + gelismis filtreler */}
        <div className={`${CARD} px-3.5 py-[11px] mb-4`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex-1 min-w-[240px] flex items-center gap-2 h-[38px] border border-[#e3e8f0] rounded-lg px-3">
              <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari, sipariş, belge, sektör, oluşturan, ürün, kategori veya marka ara…"
                className="flex-1 border-none bg-transparent outline-none text-[13px] text-[#14223b]"
              />
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="bg-white border border-[#d8e0ec] rounded-lg px-3.5 h-[38px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
              >
                Aramayı temizle
              </button>
            )}
          </div>
          <CommercialListFilters
            idPrefix="orders"
            values={filters}
            options={filterOptions}
            optionsLoading={filterOptionsLoading}
            onChange={updateFilter}
            onClear={clearFilters}
          />
        </div>

        {loadError && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#991b1b]">
            <span className="font-semibold">Sipariş listesi güncellenemedi.</span>
            <span className="text-[#b45353]">{loadError}</span>
            <button
              type="button"
              onClick={retryFetch}
              className="ml-auto rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 font-semibold hover:bg-[#fff7f7]"
            >
              Tekrar dene
            </button>
          </div>
        )}

        {/* Toplu islem bari — sadece listede bekleyen siparis varken gorunur */}
        {selectablePendingOrders.length > 0 && (
          <div className="flex items-center gap-3 bg-[#fffbeb] border border-[#fde68a] rounded-[10px] px-3.5 py-2.5 mb-4 flex-wrap">
            <label className="flex items-center gap-2 text-[13px] font-medium text-[#92500a] cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#15356b]"
                checked={allPendingSelected}
                onChange={toggleSelectAllPending}
              />
              Bekleyenleri seç ({selectablePendingOrders.length})
              {selectedCount > 0 && (
                <span className="text-[12px] font-normal text-[#b45309]">- {selectedCount} seçili</span>
              )}
            </label>
            <div className="ml-auto flex gap-2 flex-wrap">
              <button
                type="button"
                disabled={selectedCount === 0 || isBulkProcessing}
                onClick={handleBulkApprove}
                className="bg-[#047857] border-none rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white cursor-pointer hover:bg-[#065f46] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isBulkProcessing ? 'İşleniyor...' : 'Seçilenleri Onayla'}
              </button>
              <button
                type="button"
                disabled={selectedCount === 0 || isBulkProcessing}
                onClick={handleBulkReject}
                className="bg-white border border-[#fecaca] rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[#b91c1c] cursor-pointer hover:bg-[#fef2f2] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Seçilenleri Reddet
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  disabled={isBulkProcessing}
                  onClick={() => setSelectedOrderIds(new Set())}
                  className="bg-white border border-[#d8e0ec] rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Seçimi Temizle
                </button>
              )}
            </div>
          </div>
        )}

        {/* Liste / bos durum */}
        {filteredOrders.length === 0 ? (
          <div className={`${CARD} p-10 text-center`}>
            <p className="text-[13.5px] text-[#8b97ac] m-0">{emptyStateMessage}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const customerName =
                order.user?.displayName ||
                order.user?.mikroName ||
                order.user?.name ||
                '-';
              const creatorKind: 'B2B' | 'Talep' | 'Musteri' = order.customerRequest?.requestedBy?.name
                ? 'Talep'
                : order.requestedBy?.name || order.sourceQuote
                  ? 'B2B'
                  : 'Musteri';
              const creatorLabel = order.customerRequest?.requestedBy?.name
                ? `${order.customerRequest.requestedBy.name} (Talep)`
                : order.requestedBy?.name
                  ? `${order.requestedBy.name} (B2B)`
                  : order.sourceQuote
                    ? `${order.sourceQuote.createdBy?.name || 'Tekliften'} (B2B)`
                  : `${customerName} (Müşteri)`;

              return (
                <div key={order.id} className={`${CARD} overflow-hidden`}>
                  {/* Ust satir: sol bilgiler + sag statu/toplam/detay */}
                  <div className="flex items-start gap-3.5 px-[17px] py-[15px]">
                    {/* Sadece bekleyen siparisler toplu islem icin secilebilir */}
                    {order.status === 'PENDING' && (
                      <input
                        type="checkbox"
                        className="w-4 h-4 mt-[3px] accent-[#15356b] flex-none"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        aria-label="Siparişi seç"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[11px] text-[#8b97ac]">Cari</span>
                        <span className="text-[15px] font-semibold text-[#14223b]">{customerName}</span>
                        {renderSourceBadge(creatorKind)}
                      </div>

                      <div className="text-[12px] text-[#8b97ac] mt-1 font-mono">
                        Kod: {order.user?.mikroCariCode || '-'} · Sipariş #{order.orderNumber} · {formatDate(order.createdAt)}
                      </div>

                      <div className="text-[12px] text-[#51607a] mt-1.5">
                        Oluşturan: <b className="text-[#14223b] font-semibold">{creatorLabel}</b>
                      </div>

                      {/* Belge No / Teslimat */}
                      {(order.customerOrderNumber || order.deliveryLocation) && (
                        <div className="flex items-center gap-3.5 flex-wrap mt-2 text-[12px] text-[#51607a]">
                          {order.customerOrderNumber && (
                            <span>
                              Belge No: <b className="text-[#14223b] font-semibold">{order.customerOrderNumber}</b>
                            </span>
                          )}
                          {order.deliveryLocation && (
                            <span>
                              Teslimat: <b className="text-[#14223b] font-semibold">{order.deliveryLocation}</b>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Mikro ID cipleri */}
                      {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {order.mikroOrderIds.map((mikroId, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 bg-[#eef2fa] border border-[#d6e0f1] rounded-md px-2 py-1"
                            >
                              <span className="text-[10px] font-semibold text-[#1c4585]">Mikro ID</span>
                              <span className="text-[11px] font-mono font-bold text-[#1c4585]">{mikroId}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Admin Notu */}
                      {order.adminNote && (
                        <div className="flex items-start gap-2 bg-[#f6f8fc] border border-[#e7ebf2] rounded-lg px-2.5 py-2 mt-2.5 text-[12px] text-[#51607a]">
                          <MessageSquare
                            width={13}
                            height={13}
                            stroke="#9aa6b8"
                            strokeWidth={2}
                            className="flex-none mt-[2px]"
                          />
                          <span>
                            <b className="text-[#14223b] font-semibold">Admin Notu:</b> {order.adminNote}
                          </span>
                        </div>
                      )}

                      {/* Teklif Kaynagi kutusu */}
                      {order.sourceQuote && (
                        <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-lg px-3 py-2.5 mt-2.5">
                          <p className="text-[11px] font-semibold text-[#1c4585] m-0">Teklif Kaynağı</p>
                          <p className="text-[12px] text-[#1c4585] mt-1 m-0">
                            Teklif No:{' '}
                            <b className="font-semibold font-mono">{order.sourceQuote.quoteNumber}</b>
                            {order.sourceQuote.createdAt ? ` · ${formatDate(order.sourceQuote.createdAt)}` : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => router.push(`/quotes?history=${order.sourceQuote?.id}`)}
                            className="mt-2 bg-white border border-[#d6e0f1] rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#15356b] hover:text-white"
                          >
                            Teklif Geçmişi
                          </button>
                        </div>
                      )}

                      {/* Talep Kaynagi kutusu */}
                      {order.customerRequest && (
                        <div className="bg-[#eef2fb] border border-[#c7d2fe] rounded-lg px-3 py-2.5 mt-2.5">
                          <p className="text-[11px] font-semibold text-[#4338ca] m-0">Talep Kaynağı</p>
                          <p className="text-[12px] text-[#4338ca] mt-1 m-0">
                            Talep ID: <span className="font-mono">{order.customerRequest.id.slice(0, 8)}</span>
                          </p>
                          {order.customerRequest.requestedBy && (
                            <p className="text-[12px] text-[#4338ca] mt-1 m-0">
                              Talep eden: {order.customerRequest.requestedBy.name}
                              {order.customerRequest.requestedBy.email
                                ? ` (${order.customerRequest.requestedBy.email})`
                                : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sag: statu + toplam + detay */}
                    <div className="flex flex-col items-end gap-2.5 flex-none">
                      {renderStatusBadge(order.status)}
                      <div className="text-right">
                        <div className="text-[10.5px] text-[#8b97ac]">Toplam</div>
                        <div className="text-[21px] font-semibold text-[#14223b] tracking-tight">
                          {formatCurrency(order.totalAmount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(order.id)}
                        className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[12px] font-medium text-[#15356b]"
                      >
                        {isExpanded ? 'Detayı Kapat' : 'Detayı Aç'}
                        <ChevronDown
                          width={13}
                          height={13}
                          stroke="currentColor"
                          strokeWidth={2}
                          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Kart aksiyonlari: Proforma PDF · Excel · Duzenle · Onayla · Reddet */}
                  <div className="flex items-center gap-2 flex-wrap border-t border-[#eef1f6] px-[17px] py-[11px]">
                    <button
                      type="button"
                      onClick={() => handleOrderPdfExport(order)}
                      className="flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-[7px] text-[12px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                    >
                      <FileText width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      Sipariş Proforma PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOrderExcelExport(order)}
                      className="flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-[7px] text-[12px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                    >
                      <FileSpreadsheet width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      Sipariş Proforma Excel
                    </button>
                    {(order.status === 'PENDING' || order.status === 'APPROVED') && (
                      <button
                        type="button"
                        onClick={() => openEdit(order)}
                        className="flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-[7px] text-[12px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                      >
                        <Pencil width={13} height={13} stroke="currentColor" strokeWidth={2} />
                        Düzenle
                      </button>
                    )}
                    {order.status === 'PENDING' && (
                      <div className="flex gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => handleReject(order.id)}
                          className="bg-white border border-[#fecaca] rounded-lg px-3.5 py-[7px] text-[12px] font-semibold text-[#b91c1c] cursor-pointer hover:bg-[#fef2f2]"
                        >
                          Reddet
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(order.id)}
                          className="flex items-center gap-1.5 bg-[#047857] border-none rounded-lg px-3.5 py-[7px] text-[12px] font-semibold text-white cursor-pointer hover:bg-[#065f46]"
                        >
                          <Check width={14} height={14} stroke="currentColor" strokeWidth={2.4} />
                          Onayla ve Mikro&apos;ya Gönder
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sunucu-tarafli sayfalama kontrolu */}
        {pagination.total > 0 && (
          <div className={`${CARD} flex items-center justify-between gap-3 flex-wrap px-3.5 py-2.5 mt-4`}>
            <span className="text-[12.5px] text-[#51607a]">
              Sayfa <b className="text-[#15356b] font-semibold">{page}</b> / {totalPages} ·
              {' '}Toplam <b className="text-[#15356b] font-semibold">{pagination.total}</b>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev || isFetching}
                className="bg-white border border-[#e7ebf2] rounded-lg px-3.5 h-[36px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext || isFetching}
                className="bg-white border border-[#e7ebf2] rounded-lg px-3.5 h-[36px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}

        <SiparisDetayModal
          order={selectedDetailOrder}
          onClose={() => {
            if (selectedDetailOrder) toggleExpanded(selectedDetailOrder.id);
          }}
          onEdit={openEdit}
          onApprove={handleApprove}
          onReject={handleReject}
          onPdf={handleOrderPdfExport}
          onExcel={handleOrderExcelExport}
        />
      </div>
    </div>
  );
}
