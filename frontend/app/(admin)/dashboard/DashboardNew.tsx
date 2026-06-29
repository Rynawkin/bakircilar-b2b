'use client';

import {
  Calendar,
  TrendingUp,
  FileText,
  ShoppingCart,
  Clock,
  CheckCircle2,
  Users,
  BarChart3,
  AlertTriangle,
  ArrowRight,
  Check,
  Play,
  RefreshCw,
  Image as ImageIcon,
  Zap,
  ChevronRight,
  Package,
  FileSpreadsheet,
  Building2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EkstreModal } from '@/components/admin/EkstreModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDashboard, DashboardFilterPeriod } from './useDashboard';

const CARD =
  'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum dashboard. Mevcut TUM mantik useDashboard'tan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal dusurulmemistir.
 */
export default function DashboardNew() {
  const {
    router,
    user,
    hasPermission,
    selectedPeriod,
    setSelectedPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    stats,
    isLoading,
    summaryPeriodLabel,
    isSyncing,
    syncProgress,
    handleSync,
    isCariSyncing,
    handleCariSync,
    isImageSyncing,
    imageSyncProgress,
    handleImageSync,
    syncWarnings,
    setSyncWarnings,
    showEkstreModal,
    setShowEkstreModal,
    orderProductChangeRequests,
    orderProductChangePendingCount,
    orderProductChangeLoading,
    orderProductChangeActingId,
    approveOrderProductChange,
    rejectOrderProductChange,
    formatPercent,
    getMarginTone,
  } = useDashboard();

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#15356b]"></div>
      </div>
    );
  }

  // Hizli Erisim widget tanimlari (izne bagli) — mevcut router/modal mantigi korunur
  const quickWidgets: Array<{
    key: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    cta: string;
    onClick: () => void;
  }> = [];

  if (hasPermission('dashboard:stok-ara')) {
    quickWidgets.push({
      key: 'stok-ara',
      icon: <Package width={18} height={18} stroke="#15356b" strokeWidth={2} />,
      title: 'Stok Arama',
      desc: 'Mikro F10 entegrasyonu ile detaylı stok bilgileri',
      cta: 'Stok Ara →',
      onClick: () => router.push('/search/stocks'),
    });
  }
  if (hasPermission('dashboard:cari-ara')) {
    quickWidgets.push({
      key: 'cari-ara',
      icon: <Users width={18} height={18} stroke="#15356b" strokeWidth={2} />,
      title: 'Cari Arama',
      desc: 'Mikro F10 entegrasyonu ile detaylı cari bilgileri',
      cta: 'Cari Ara →',
      onClick: () => router.push('/search/customers'),
    });
  }
  if (hasPermission('dashboard:ekstre')) {
    quickWidgets.push({
      key: 'ekstre',
      icon: <FileSpreadsheet width={18} height={18} stroke="#15356b" strokeWidth={2} />,
      title: 'Ekstre Al',
      desc: 'Cari hareket föyü Excel/PDF export',
      cta: 'Ekstre Al →',
      onClick: () => setShowEkstreModal(true),
    });
  }
  if (hasPermission('dashboard:diversey-stok')) {
    quickWidgets.push({
      key: 'diversey-stok',
      icon: <Building2 width={18} height={18} stroke="#15356b" strokeWidth={2} />,
      title: 'Diversey Stok',
      desc: 'Diversey markası ürün stokları',
      cta: 'Diversey Stok →',
      onClick: () => router.push('/diversey/stok'),
    });
  }
  if (user?.role === 'HEAD_ADMIN') {
    quickWidgets.push({
      key: 'rol-izinleri',
      icon: <ShieldCheck width={18} height={18} stroke="#15356b" strokeWidth={2} />,
      title: 'Rol İzinleri',
      desc: 'Kullanıcı rol izinlerini yönet',
      cta: 'İzinleri Yönet →',
      onClick: () => router.push('/role-permissions'),
    });
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Baslik + Donem filtresi */}
          <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Dashboard</h1>
              <div className="text-[13px] text-[#8b97ac] mt-1.5">
                Günlük operasyon nabzı · satış, teklif ve sipariş özeti
              </div>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <label className="flex items-center gap-2 h-10 border border-[#d8e0ec] rounded-lg bg-white px-3">
                <Calendar width={15} height={15} stroke="#8b97ac" strokeWidth={2} />
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value as DashboardFilterPeriod)}
                  className="border-none bg-transparent outline-none text-[13px] font-medium text-[#14223b] cursor-pointer"
                >
                  <option value="daily">Gunluk</option>
                  <option value="weekly">Haftalik</option>
                  <option value="monthly">Ay basindan beri</option>
                  <option value="custom">Tarih araligi</option>
                </select>
              </label>

              {selectedPeriod === 'custom' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-[#8b97ac]">Baslangic</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(event) => setCustomStartDate(event.target.value)}
                      className="h-10 px-3 border border-[#d8e0ec] rounded-lg bg-white text-[13px] text-[#14223b]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-[#8b97ac]">Bitis</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(event) => setCustomEndDate(event.target.value)}
                      className="h-10 px-3 border border-[#d8e0ec] rounded-lg bg-white text-[13px] text-[#14223b]"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <>
              {/* 3 ozet kart (donem rozetli) */}
              {stats.summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {/* Satis Ozeti */}
                  <div className={`${CARD} p-[18px]`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] text-[#51607a] font-medium">Satış Özeti</span>
                      {summaryPeriodLabel && (
                        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#047857] bg-[#ecfdf5] border border-[#d1fae5] px-2 py-0.5 rounded-full">
                          <TrendingUp width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
                          {summaryPeriodLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[26px] font-semibold text-[#14223b] tracking-tight mt-2.5">
                      {formatCurrency(stats.summary.sales.amount)}
                    </div>
                    <div className="text-[12px] text-[#8b97ac] mt-0.5">
                      {stats.summary.sales.count} satış belgesi
                    </div>
                  </div>

                  {/* Teklif Ozeti */}
                  <div className={`${CARD} p-[18px]`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] text-[#51607a] font-medium">Teklif Özeti</span>
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#eef2fa] flex items-center justify-center">
                        <FileText width={15} height={15} stroke="#15356b" strokeWidth={2} />
                      </span>
                    </div>
                    <div className="text-[26px] font-semibold text-[#14223b] tracking-tight mt-2.5">
                      {formatCurrency(stats.summary.quotes.amount)}
                    </div>
                    <div className="text-[12px] text-[#8b97ac] mt-0.5">
                      {stats.summary.quotes.count} teklif
                    </div>
                  </div>

                  {/* Siparis Ozeti */}
                  <div className={`${CARD} p-[18px]`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] text-[#51607a] font-medium">Sipariş Özeti</span>
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#fff7ed] flex items-center justify-center">
                        <ShoppingCart width={15} height={15} stroke="#c2410c" strokeWidth={2} />
                      </span>
                    </div>
                    <div className="text-[26px] font-semibold text-[#14223b] tracking-tight mt-2.5">
                      {formatCurrency(stats.summary.orders.amount)}
                    </div>
                    <div className="text-[12px] text-[#8b97ac] mt-0.5">
                      {stats.summary.orders.count} sipariş
                    </div>
                  </div>
                </div>
              )}

              {/* 4 metrik kart (izne bagli) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-[26px]">
                {hasPermission('dashboard:orders') && (
                  <div className={`${CARD} p-4`}>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#fffbeb] flex items-center justify-center">
                        <Clock width={15} height={15} stroke="#b45309" strokeWidth={2} />
                      </span>
                      <span className="text-[12px] text-[#51607a] font-medium">Bekleyen Siparişler</span>
                    </div>
                    <div className="text-[23px] font-semibold text-[#14223b]">{stats.orders.pendingCount}</div>
                    <button
                      type="button"
                      onClick={() => router.push('/orders')}
                      className="bg-transparent border-none cursor-pointer text-[11.5px] text-[#15356b] font-medium pt-1"
                    >
                      Siparişleri Gör →
                    </button>
                  </div>
                )}

                {hasPermission('dashboard:orders') && (
                  <div className={`${CARD} p-4`}>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#ecfdf5] flex items-center justify-center">
                        <CheckCircle2 width={15} height={15} stroke="#047857" strokeWidth={2} />
                      </span>
                      <span className="text-[12px] text-[#51607a] font-medium">Bugün Onaylanan</span>
                    </div>
                    <div className="text-[23px] font-semibold text-[#14223b]">{stats.orders.approvedToday}</div>
                    <div className="text-[11.5px] text-[#047857] font-semibold mt-1">
                      {formatCurrency(stats.orders.totalAmount)}
                    </div>
                  </div>
                )}

                {hasPermission('dashboard:customers') && (
                  <div className={`${CARD} p-4`}>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#eef2fa] flex items-center justify-center">
                        <Users width={15} height={15} stroke="#15356b" strokeWidth={2} />
                      </span>
                      <span className="text-[12px] text-[#51607a] font-medium">Aktif Müşteriler</span>
                    </div>
                    <div className="text-[23px] font-semibold text-[#14223b]">{stats.customerCount}</div>
                    <button
                      type="button"
                      onClick={() => router.push('/customers')}
                      className="bg-transparent border-none cursor-pointer text-[11.5px] text-[#15356b] font-medium pt-1"
                    >
                      Müşteri Ekle →
                    </button>
                  </div>
                )}

                {hasPermission('dashboard:excess-stock') && (
                  <div className={`${CARD} p-4`}>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-[30px] h-[30px] rounded-lg bg-[#f5f3ff] flex items-center justify-center">
                        <BarChart3 width={15} height={15} stroke="#6d28d9" strokeWidth={2} />
                      </span>
                      <span className="text-[12px] text-[#51607a] font-medium">Fazla Stoklu Ürün</span>
                    </div>
                    <div className="text-[23px] font-semibold text-[#14223b]">{stats.excessProductCount}</div>
                    <div className="text-[11px] text-[#8b97ac] mt-1">
                      {stats.lastSyncAt ? `Son sync ${formatDate(stats.lastSyncAt)}` : 'Henüz sync yapılmadı'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Onay paneli — Onaylanacak Urun Siparis Degisimleri (amber, kosullu) */}
          {(orderProductChangePendingCount > 0 || orderProductChangeLoading) && (
            <div className="bg-[#fffdf5] border border-[#fde68a] rounded-[14px] p-[18px] mb-[26px]">
              <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle width={18} height={18} stroke="#b45309" strokeWidth={2} />
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#14223b] m-0">
                      Onaylanacak Ürün Sipariş Değişimleri
                    </h2>
                    <p className="text-[12px] text-[#8b97ac] m-0 mt-0.5">
                      Ucarer depo sipariş yönlendirme önerilerinden gelen satır bazlı değişim onayları.
                    </p>
                  </div>
                </div>
                <span className="bg-white border border-[#fde68a] text-[#b45309] text-[11.5px] font-semibold px-2.5 py-[3px] rounded-full">
                  Bekleyen: {orderProductChangePendingCount.toLocaleString('tr-TR')}
                </span>
              </div>

              {orderProductChangeLoading ? (
                <p className="rounded-xl bg-white p-4 text-[13px] font-semibold text-[#51607a] m-0">Yükleniyor...</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                  {orderProductChangeRequests.map((request) => (
                    <div key={request.id} className="bg-white border border-[#f0e3c0] rounded-xl p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                        <span className="font-mono text-[12px] font-semibold text-[#14223b]">
                          {request.orderNumber} / Satır {request.orderLineNo}
                        </span>
                        <span className="text-[11.5px] text-[#51607a]">
                          {request.customerCode || '-'} - {request.customerName || '-'}
                        </span>
                        <span className="bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[11px] font-semibold px-2 py-0.5 rounded-md">
                          {Number(request.remainingQuantity || request.quantity || 0).toLocaleString('tr-TR')} adet
                        </span>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] gap-2.5 items-center">
                        {/* Mevcut urun */}
                        <div className="bg-[#f4f6fa] border border-[#e7ebf2] rounded-[9px] p-2.5">
                          <div className="text-[9.5px] font-semibold tracking-wide text-[#8b97ac] uppercase mb-1.5">
                            Mevcut Ürün
                          </div>
                          <div className="font-mono text-[11px] text-[#51607a]">{request.sourceProductCode}</div>
                          <div className="text-[12px] font-medium text-[#14223b] my-0.5 line-clamp-2">
                            {request.sourceProductName || '-'}
                          </div>
                          <div className="text-[10.5px] text-[#51607a]">
                            Güncel marj{' '}
                            <b className={`font-semibold ${getMarginTone(request.sourceCurrentMarginPercent)}`}>
                              {formatPercent(request.sourceCurrentMarginPercent)}
                            </b>
                          </div>
                          <div className="text-[10.5px] text-[#51607a]">
                            Giriş marj{' '}
                            <b className={`font-semibold ${getMarginTone(request.sourceLastEntryMarginPercent)}`}>
                              {formatPercent(request.sourceLastEntryMarginPercent)}
                            </b>
                          </div>
                        </div>

                        <ArrowRight width={18} height={18} stroke="#9aa6b8" strokeWidth={2} />

                        {/* Onerilen urun */}
                        <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-[9px] p-2.5">
                          <div className="text-[9.5px] font-semibold tracking-wide text-[#047857] uppercase mb-1.5">
                            Önerilen Ürün
                          </div>
                          <div className="font-mono text-[11px] text-[#047857]">{request.targetProductCode}</div>
                          <div className="text-[12px] font-medium text-[#14223b] my-0.5 line-clamp-2">
                            {request.targetProductName || '-'}
                          </div>
                          <div className="text-[10.5px] text-[#51607a]">
                            Güncel marj{' '}
                            <b className={`font-semibold ${getMarginTone(request.targetCurrentMarginPercent)}`}>
                              {formatPercent(request.targetCurrentMarginPercent)}
                            </b>
                          </div>
                          <div className="text-[10.5px] text-[#51607a]">
                            Giriş marj{' '}
                            <b className={`font-semibold ${getMarginTone(request.targetLastEntryMarginPercent)}`}>
                              {formatPercent(request.targetLastEntryMarginPercent)}
                            </b>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                        <span className="text-[11.5px] text-[#51607a]">
                          Birim fiyat aynı:{' '}
                          <b className="text-[#14223b] font-semibold">
                            {formatCurrency(Number(request.unitPrice || 0))}
                          </b>
                        </span>
                        <div className="ml-auto flex gap-2">
                          <button
                            type="button"
                            disabled={orderProductChangeActingId === request.id}
                            onClick={() => rejectOrderProductChange(request.id)}
                            className="bg-white border border-[#fecaca] rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-[#b91c1c] cursor-pointer hover:bg-[#fef2f2] disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Reddet
                          </button>
                          <button
                            type="button"
                            disabled={orderProductChangeActingId === request.id}
                            onClick={() => approveOrderProductChange(request.id)}
                            className="bg-[#047857] border-none rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white cursor-pointer hover:bg-[#065f46] disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {orderProductChangeActingId === request.id ? 'İşleniyor...' : 'Onayla'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Senkronizasyon Uyarilari (kosullu) */}
          {syncWarnings && syncWarnings.length > 0 && (
            <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-[18px] mb-[26px]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle width={18} height={18} stroke="#b45309" strokeWidth={2} />
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#14223b] m-0">Senkronizasyon Uyarıları</h3>
                    <p className="text-[12px] text-[#8b97ac] m-0 mt-0.5">{syncWarnings.length} uyarı bulundu</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncWarnings(null)}
                  className="flex items-center gap-1 text-[12px] font-medium text-[#b45309] bg-transparent border-none cursor-pointer"
                >
                  <X width={14} height={14} stroke="currentColor" strokeWidth={2} />
                  Kapat
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                {syncWarnings.map((warning, index) => (
                  <div key={index} className="bg-white border border-[#fde68a] rounded-lg p-3 text-[12px]">
                    <div className="font-semibold text-[#14223b] mb-1">
                      {warning.productName}
                      <span className="text-[#8b97ac] font-normal ml-2">({warning.productCode})</span>
                    </div>
                    <div className="text-[#51607a]">{warning.message}</div>
                    {warning.size && (
                      <div className="text-[11px] text-[#8b97ac] mt-1">
                        Boyut: {(warning.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3.5 pt-3.5 border-t border-[#fde68a]">
                <p className="text-[11px] text-[#92500a] m-0">
                  <strong>Not:</strong> Bu uyarılar bilgilendirme amaçlıdır. Senkronizasyon başarıyla
                  tamamlanmıştır. Resim boyutu çok büyük olan ürünler için resimleri manuel olarak küçültüp
                  tekrar yükleyebilirsiniz.
                </p>
              </div>
            </div>
          )}

          {/* Hizli Erisim widget grid (izne bagli) */}
          {quickWidgets.length > 0 && (
            <>
              <h2 className="text-[15px] font-semibold text-[#14223b] m-0 mb-3">Hızlı Erişim</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5 mb-[26px]">
                {quickWidgets.map((w) => (
                  <div key={w.key} className={`${CARD} p-4 flex flex-col gap-2.5`}>
                    <span className="w-9 h-9 rounded-[9px] bg-[#eef2fa] flex items-center justify-center">
                      {w.icon}
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold text-[#14223b]">{w.title}</div>
                      <div className="text-[11.5px] text-[#8b97ac] mt-0.5 leading-snug">{w.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={w.onClick}
                      className="mt-auto self-start bg-white border border-[#d8e0ec] rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-[#15356b] cursor-pointer hover:bg-[#f4f6fa]"
                    >
                      {w.cta}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 4 aksiyon karti */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {/* Senkronizasyon */}
            <div className={`${CARD} p-[18px] flex flex-col`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <RefreshCw width={17} height={17} stroke="#15356b" strokeWidth={2} />
                <h3 className="text-[14px] font-semibold m-0 text-[#14223b]">Senkronizasyon</h3>
              </div>
              <div className="text-[11.5px] text-[#8b97ac] mb-3">
                {stats?.lastSyncAt ? `Son sync: ${formatDate(stats.lastSyncAt)}` : 'Henüz sync yapılmadı'}
              </div>

              {syncProgress && (
                <div className="flex flex-col gap-1.5 mb-3 text-[12px]">
                  {syncProgress.categoriesCount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#51607a]">Kategoriler</span>
                      <span className="text-[#047857] font-semibold inline-flex items-center gap-1">
                        <Check width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                        {syncProgress.categoriesCount}
                      </span>
                    </div>
                  )}
                  {syncProgress.productsCount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#51607a]">Ürünler</span>
                      <span className="text-[#047857] font-semibold inline-flex items-center gap-1">
                        <Check width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                        {syncProgress.productsCount}
                      </span>
                    </div>
                  )}
                  {syncProgress.details?.stocksCalculated !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#51607a]">Fazla stok</span>
                      <span className="text-[#047857] font-semibold inline-flex items-center gap-1">
                        <Check width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                        {syncProgress.details.stocksCalculated}
                        {isSyncing && syncProgress.details.totalStocksToCalculate
                          ? ` / ${syncProgress.details.totalStocksToCalculate}`
                          : ''}
                      </span>
                    </div>
                  )}
                  {syncProgress.details?.pricesCalculated !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#51607a]">Fiyatlar</span>
                      <span className="text-[#b45309] font-semibold inline-flex items-center gap-1">
                        <Play width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                        {syncProgress.details.pricesCalculated}
                        {isSyncing && syncProgress.details.totalPricesToCalculate
                          ? ` / ${syncProgress.details.totalPricesToCalculate}`
                          : ''}
                      </span>
                    </div>
                  )}
                  {(syncProgress.imagesDownloaded !== undefined ||
                    syncProgress.imagesSkipped !== undefined ||
                    syncProgress.imagesFailed !== undefined) && (
                    <div className="pt-1.5 mt-1.5 border-t border-[#eef1f6] flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[#51607a]">Resim · İndirilen</span>
                        <span className="text-[#047857] font-semibold">{syncProgress.imagesDownloaded || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#51607a]">Resim · Atlanan</span>
                        <span className="text-[#b45309] font-semibold">{syncProgress.imagesSkipped || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#51607a]">Resim · Hatalı</span>
                        <span className="text-[#b91c1c] font-semibold">{syncProgress.imagesFailed || 0}</span>
                      </div>
                      {syncProgress.details?.totalImages && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#51607a]">Resim · Toplam</span>
                          <span className="text-[#14223b] font-semibold">{syncProgress.details.totalImages}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="mt-auto w-full bg-[#15356b] border-none rounded-lg py-2.5 text-[13px] font-semibold text-white cursor-pointer hover:bg-[#1c4585] disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isSyncing && (
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                )}
                {isSyncing ? 'Senkronize Ediliyor...' : 'Şimdi Senkronize Et'}
              </button>
            </div>

            {/* Cari Senkronizasyonu */}
            <div className={`${CARD} p-[18px] flex flex-col`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <Users width={17} height={17} stroke="#15356b" strokeWidth={2} />
                <h3 className="text-[14px] font-semibold m-0 text-[#14223b]">Cari Senkronizasyonu</h3>
              </div>
              <div className="text-[11.5px] text-[#8b97ac] mb-3">Mikro cari kartlarını eşitle.</div>
              <button
                type="button"
                onClick={handleCariSync}
                disabled={isCariSyncing}
                className="mt-auto w-full bg-white border border-[#d8e0ec] rounded-lg py-2.5 text-[13px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isCariSyncing && (
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#15356b]" />
                )}
                {isCariSyncing ? 'Cari Sync Ediliyor...' : 'Cari Sync Et'}
              </button>
            </div>

            {/* Resim Senkronizasyonu */}
            <div className={`${CARD} p-[18px] flex flex-col`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <ImageIcon width={17} height={17} stroke="#15356b" strokeWidth={2} />
                <h3 className="text-[14px] font-semibold m-0 text-[#14223b]">Resim Senkronizasyonu</h3>
              </div>
              <div className="text-[11.5px] text-[#8b97ac] mb-2">
                Mikro ERP'den resmi olmayan ürünler için resimleri indirin.
              </div>

              {imageSyncProgress && (
                <div className="mb-3 text-[12px] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#51607a]">{isImageSyncing ? 'İndiriliyor · İndirilen' : 'İndirilen'}</span>
                    <span className="text-[#047857] font-semibold">{imageSyncProgress.imagesDownloaded || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#51607a]">Atlanan</span>
                    <span className="text-[#b45309] font-semibold">{imageSyncProgress.imagesSkipped || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#51607a]">Hatalı</span>
                    <span className="text-[#b91c1c] font-semibold">{imageSyncProgress.imagesFailed || 0}</span>
                  </div>
                  {/* ilerleme bari */}
                  {(() => {
                    const dl = imageSyncProgress.imagesDownloaded || 0;
                    const sk = imageSyncProgress.imagesSkipped || 0;
                    const fa = imageSyncProgress.imagesFailed || 0;
                    const total = dl + sk + fa;
                    const pct = total > 0 ? Math.round(((dl + sk) / total) * 100) : 0;
                    return (
                      <div className="h-[7px] bg-[#eef1f6] rounded-full overflow-hidden mt-1">
                        <span
                          className="block h-full bg-[#15356b] rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}

              <button
                type="button"
                onClick={handleImageSync}
                disabled={isImageSyncing}
                className="mt-auto w-full bg-white border border-[#d8e0ec] rounded-lg py-2.5 text-[13px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isImageSyncing && (
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#15356b]" />
                )}
                {isImageSyncing ? 'İndiriliyor...' : 'Resim Sync Et'}
              </button>
            </div>

            {/* Hizli Islemler */}
            <div className={`${CARD} p-[18px]`}>
              <div className="flex items-center gap-2.5 mb-3">
                <Zap width={17} height={17} stroke="#15356b" strokeWidth={2} />
                <h3 className="text-[14px] font-semibold m-0 text-[#14223b]">Hızlı İşlemler</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => router.push('/customers')}
                  className="flex items-center justify-between bg-[#f4f6fa] border-none rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-[#14223b] cursor-pointer hover:bg-[#eef2fa]"
                >
                  Yeni Müşteri
                  <ChevronRight width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/orders')}
                  className="flex items-center justify-between bg-[#f4f6fa] border-none rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-[#14223b] cursor-pointer hover:bg-[#eef2fa]"
                >
                  Bekleyen Siparişler ({stats?.orders.pendingCount || 0})
                  <ChevronRight width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/categories')}
                  className="flex items-center justify-between bg-[#f4f6fa] border-none rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-[#14223b] cursor-pointer hover:bg-[#eef2fa]"
                >
                  Fiyatlandırma Ayarları
                  <ChevronRight width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/settings')}
                  className="flex items-center justify-between bg-[#f4f6fa] border-none rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-[#14223b] cursor-pointer hover:bg-[#eef2fa]"
                >
                  Sistem Ayarları
                  <ChevronRight width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          {/* Ekstre Modal */}
          <EkstreModal isOpen={showEkstreModal} onClose={() => setShowEkstreModal(false)} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
