'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EkstreModal } from '@/components/admin/EkstreModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDashboard, DashboardFilterPeriod } from './useDashboard';
import { OrderChangeStockComparison } from './OrderChangeStockComparison';

/**
 * Klasik (mevcut) dashboard gorunumu. JSX birebir korunmustur; tum mantik useDashboard'tan gelir.
 */
export default function DashboardClassic() {
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
    orderProductChangeRefreshError,
    orderProductChangeLiveValidationAvailable,
    approveOrderProductChange,
    rejectOrderProductChange,
    formatPercent,
    getMarginTone,
  } = useDashboard();

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}

      {/* Main Content */}
      <div className="container-custom py-8">
        <Card className="mb-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Donem</label>
              <select
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value as DashboardFilterPeriod)}
                className="px-3 py-2 border rounded-lg bg-white text-sm"
              >
                <option value="daily">Gunluk</option>
                <option value="weekly">Haftalik</option>
                <option value="monthly">Ay basindan beri</option>
                <option value="custom">Tarih araligi</option>
              </select>
            </div>

            {selectedPeriod === 'custom' && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Baslangic</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    className="px-3 py-2 border rounded-lg bg-white text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Bitis</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    className="px-3 py-2 border rounded-lg bg-white text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Stats Cards */}
        {stats && (
          <>
            {stats.summary && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-emerald-800">Satis Ozeti</p>
                      {summaryPeriodLabel && (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded">
                          {summaryPeriodLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-4xl font-bold text-emerald-700">{stats.summary.sales.count}</p>
                    <p className="text-sm font-semibold text-emerald-800 bg-emerald-200 px-2 py-1 rounded">
                      {formatCurrency(stats.summary.sales.amount)}
                    </p>
                  </div>
                </Card>

                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-800">Teklif Ozeti</p>
                      {summaryPeriodLabel && (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-200 px-2 py-1 rounded">
                          {summaryPeriodLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-4xl font-bold text-indigo-700">{stats.summary.quotes.count}</p>
                    <p className="text-sm font-semibold text-indigo-800 bg-indigo-200 px-2 py-1 rounded">
                      {formatCurrency(stats.summary.quotes.amount)}
                    </p>
                  </div>
                </Card>

                <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-orange-800">Siparis Ozeti</p>
                      {summaryPeriodLabel && (
                        <span className="text-xs font-semibold text-orange-700 bg-orange-200 px-2 py-1 rounded">
                          {summaryPeriodLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-4xl font-bold text-orange-700">{stats.summary.orders.count}</p>
                    <p className="text-sm font-semibold text-orange-800 bg-orange-200 px-2 py-1 rounded">
                      {formatCurrency(stats.summary.orders.amount)}
                    </p>
                  </div>
                </Card>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {hasPermission('dashboard:orders') && (
              <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-yellow-800">⏳ Bekleyen Siparişler</p>
                    <div className="bg-yellow-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                      📋
                    </div>
                  </div>
                  <p className="text-4xl font-bold text-yellow-600">{stats.orders.pendingCount}</p>
                  <Button
                    size="sm"
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold"
                    onClick={() => router.push('/orders')}
                  >
                    Siparişleri Gör →
                  </Button>
                </div>
              </Card>
            )}

            {hasPermission('dashboard:orders') && (
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-green-800">✅ Bugün Onaylanan</p>
                    <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                      📦
                    </div>
                  </div>
                  <p className="text-4xl font-bold text-green-600">{stats.orders.approvedToday}</p>
                  <p className="text-sm font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">
                    💰 {formatCurrency(stats.orders.totalAmount)}
                  </p>
                </div>
              </Card>
            )}

            {hasPermission('dashboard:customers') && (
              <Card className="bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-primary-800">👥 Aktif Müşteriler</p>
                    <div className="bg-primary-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                      🎯
                    </div>
                  </div>
                  <p className="text-4xl font-bold text-primary-600">{stats.customerCount}</p>
                  <Button
                    size="sm"
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold"
                    onClick={() => router.push('/customers')}
                  >
                    Müşteri Ekle →
                  </Button>
                </div>
              </Card>
            )}

            {hasPermission('dashboard:excess-stock') && (
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-blue-800">📊 Fazla Stoklu Ürün</p>
                    <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                      📦
                    </div>
                  </div>
                  <p className="text-4xl font-bold text-blue-600">{stats.excessProductCount}</p>
                  <p className="text-xs text-blue-700 bg-blue-200 px-2 py-1 rounded">
                    {stats.lastSyncAt ? `🔄 Son sync: ${formatDate(stats.lastSyncAt)}` : '⚠️ Henüz sync yapılmadı'}
                  </p>
                </div>
              </Card>
            )}
            </div>
          </>
        )}

        {(orderProductChangePendingCount > 0 ||
          orderProductChangeLoading ||
          Boolean(orderProductChangeRefreshError)) && (
          <Card className="mb-8 border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-lg">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Onaylanacak Urun Siparis Degisimleri</h2>
                  <p className="text-sm text-slate-600">
                    Ucarer depo siparis yonlendirme onerilerinden gelen satir bazli degisim onaylari.
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
                  Bekleyen: {orderProductChangePendingCount.toLocaleString('tr-TR')}
                </div>
              </div>

              {orderProductChangeRefreshError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                  {orderProductChangeRefreshError}
                </p>
              )}
              {!orderProductChangeLiveValidationAvailable && (
                <p className="rounded-xl border border-amber-200 bg-white p-3 text-xs text-amber-800">
                  Canli Mikro satir dogrulamasi gecici olarak kullanilamiyor; yalnizca son basarili kontrolde gecerli bulunan oneriler gosteriliyor.
                </p>
              )}

              {orderProductChangeLoading ? (
                <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-500">Yukleniyor...</p>
              ) : orderProductChangeRequests.length === 0 ? (
                <p className="rounded-xl bg-white p-4 text-sm text-slate-600">
                  Gosterilecek guncel oneri bulunmuyor.
                </p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {orderProductChangeRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {request.orderNumber} / Satir {request.orderLineNo}
                          </p>
                          <p className="text-xs text-slate-500">
                            {request.customerCode || '-'} - {request.customerName || '-'}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Oneri: {formatDate(request.createdAt)} · Siparis:{' '}
                            {request.orderDate ? formatDate(request.orderDate) : '-'} · Atanan:{' '}
                            {request.assignedTo?.displayName || request.assignedTo?.name || '-'}
                          </p>
                        </div>
                        <p className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {Number(request.remainingQuantity || request.quantity || 0).toLocaleString('tr-TR')} adet
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">Mevcut urun</p>
                          <p className="mt-1 font-bold text-slate-900">{request.sourceProductCode}</p>
                          <p className="line-clamp-2 text-xs text-slate-600">{request.sourceProductName || '-'}</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <span className={getMarginTone(request.sourceCurrentMarginPercent)}>
                              Guncel: {formatPercent(request.sourceCurrentMarginPercent)}
                            </span>
                            <span className={getMarginTone(request.sourceLastEntryMarginPercent)}>
                              Giris: {formatPercent(request.sourceLastEntryMarginPercent)}
                            </span>
                          </div>
                          <OrderChangeStockComparison
                            created={request.sourceStockAtCreation}
                            current={request.sourceCurrentStock}
                            currentAsOf={request.currentStockAsOf}
                          />
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs font-bold uppercase text-emerald-700">Onerilen urun</p>
                          <p className="mt-1 font-bold text-emerald-950">{request.targetProductCode}</p>
                          <p className="line-clamp-2 text-xs text-emerald-800">{request.targetProductName || '-'}</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <span className={getMarginTone(request.targetCurrentMarginPercent)}>
                              Guncel: {formatPercent(request.targetCurrentMarginPercent)}
                            </span>
                            <span className={getMarginTone(request.targetLastEntryMarginPercent)}>
                              Giris: {formatPercent(request.targetLastEntryMarginPercent)}
                            </span>
                          </div>
                          <OrderChangeStockComparison
                            created={request.targetStockAtCreation}
                            current={request.targetCurrentStock}
                            currentAsOf={request.currentStockAsOf}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                          Birim fiyat ayni kalir: <strong>{formatCurrency(Number(request.unitPrice || 0))}</strong>
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={orderProductChangeActingId === request.id}
                            onClick={() => rejectOrderProductChange(request.id)}
                          >
                            Reddet
                          </Button>
                          <Button
                            size="sm"
                            disabled={orderProductChangeActingId === request.id}
                            onClick={() => approveOrderProductChange(request.id)}
                          >
                            {orderProductChangeActingId === request.id ? 'Isleniyor...' : 'Onayla'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Hızlı Arama Widgetları */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {/* Stok Arama Widget */}
          {hasPermission('dashboard:stok-ara') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    📦
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Stok Arama</h3>
                    <p className="text-sm text-gray-600">Mikro F10 entegrasyonu ile detaylı stok bilgileri</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  onClick={() => router.push('/search/stocks')}
                >
                  Stok Ara →
                </Button>
              </div>
            </Card>
          )}

          {/* Cari Arama Widget */}
          {hasPermission('dashboard:cari-ara') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    👥
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Cari Arama</h3>
                    <p className="text-sm text-gray-600">Mikro F10 entegrasyonu ile detaylı cari bilgileri</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  onClick={() => router.push('/search/customers')}
                >
                  Cari Ara →
                </Button>
              </div>
            </Card>
          )}

          {/* Cari Ekstre Widget */}
          {hasPermission('dashboard:ekstre') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    📄
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Ekstre Al</h3>
                    <p className="text-sm text-gray-600">Cari hareket föyü Excel/PDF export</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
                  onClick={() => setShowEkstreModal(true)}
                >
                  Ekstre Al →
                </Button>
              </div>
            </Card>
          )}

          {/* Diversey Stok Widget */}
          {hasPermission('dashboard:diversey-stok') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    🏢
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Diversey Stok</h3>
                    <p className="text-sm text-gray-600">Diversey markası ürün stokları</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                  onClick={() => router.push('/diversey/stok')}
                >
                  Diversey Stok →
                </Button>
              </div>
            </Card>
          )}

          {/* Rol İzinleri Widget - Sadece HEAD_ADMIN için */}
          {user?.role === 'HEAD_ADMIN' && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    🔐
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Rol İzinleri</h3>
                    <p className="text-sm text-gray-600">Kullanıcı rol izinlerini yönet</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  onClick={() => router.push('/role-permissions')}
                >
                  İzinleri Yönet →
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Sync Warnings */}
        {syncWarnings && syncWarnings.length > 0 && (
          <Card className="mb-6 shadow-lg border-yellow-300 bg-gradient-to-br from-yellow-50 to-orange-50">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-yellow-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl flex-shrink-0">
                ⚠️
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-yellow-900">Senkronizasyon Uyarıları</h3>
                    <p className="text-sm text-yellow-700">
                      {syncWarnings.length} uyarı bulundu
                    </p>
                  </div>
                  <button
                    onClick={() => setSyncWarnings(null)}
                    className="text-yellow-700 hover:text-yellow-900 font-medium text-sm underline"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {syncWarnings.map((warning, index) => (
                <div
                  key={index}
                  className="bg-white border border-yellow-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-600 flex-shrink-0 mt-0.5">
                      {warning.type === 'IMAGE_TOO_LARGE' ? '📏' : '❌'}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">
                        {warning.productName}
                        <span className="text-gray-500 font-normal ml-2">({warning.productCode})</span>
                      </div>
                      <div className="text-gray-700">{warning.message}</div>
                      {warning.size && (
                        <div className="text-xs text-gray-500 mt-1">
                          Boyut: {(warning.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-yellow-200">
              <p className="text-xs text-yellow-800">
                💡 <strong>Not:</strong> Bu uyarılar bilgilendirme amaçlıdır. Senkronizasyon başarıyla tamamlanmıştır.
                Resim boyutu çok büyük olan ürünler için resimleri manuel olarak küçültüp tekrar yükleyebilirsiniz.
              </p>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                🔄
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Senkronizasyon</h3>
                <p className="text-xs text-gray-600">Mikro ERP ile senkronize et</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
              💡 Ürün, stok ve fiyat bilgilerini Mikro ERP'den güncelleyin. (Resimler hariç)
            </p>
            {stats?.lastSyncAt && (
              <div className="bg-gray-100 border border-gray-200 px-3 py-2 rounded mb-4 text-sm">
                <span className="text-gray-600">Son senkronizasyon:</span>{' '}
                <span className="font-semibold text-gray-900">{formatDate(stats.lastSyncAt)}</span>
              </div>
            )}
            {syncProgress && (
              <div className={`${isSyncing ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'} border px-3 py-2 rounded mb-3 text-sm`}>
                <div className="flex items-center gap-2 mb-2">
                  {isSyncing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>}
                  {!isSyncing && <span className="text-green-600 text-lg">✅</span>}
                  <span className={`font-semibold ${isSyncing ? 'text-blue-900' : 'text-green-900'}`}>
                    {isSyncing ? 'Senkronizasyon devam ediyor...' : 'Son senkronizasyon:'}
                  </span>
                </div>
                {syncProgress.categoriesCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    📁 Kategoriler: <strong>{syncProgress.categoriesCount}</strong>
                  </div>
                )}
                {syncProgress.productsCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    📦 Ürünler: <strong>{syncProgress.productsCount}</strong>
                  </div>
                )}
                {syncProgress.details?.stocksCalculated !== undefined && (
                  <div className="text-xs text-gray-700">
                    📊 Fazla stok: <strong>{syncProgress.details.stocksCalculated}</strong>
                    {isSyncing && syncProgress.details.totalStocksToCalculate && ` / ${syncProgress.details.totalStocksToCalculate}`}
                  </div>
                )}
                {syncProgress.details?.pricesCalculated !== undefined && (
                  <div className="text-xs text-gray-700">
                    💰 Fiyat hesaplama: <strong>{syncProgress.details.pricesCalculated}</strong>
                    {isSyncing && syncProgress.details.totalPricesToCalculate && ` / ${syncProgress.details.totalPricesToCalculate}`}
                  </div>
                )}
                {(syncProgress.imagesDownloaded !== undefined ||
                  syncProgress.imagesSkipped !== undefined ||
                  syncProgress.imagesFailed !== undefined) && (
                  <div className="text-xs text-gray-700 mt-1 pt-1 border-t border-gray-300">
                    <div className="font-semibold mb-1">📸 Resimler:</div>
                    <div className="pl-4 space-y-0.5">
                      <div>✅ İndirilen: <strong className="text-green-700">{syncProgress.imagesDownloaded || 0}</strong></div>
                      <div>⏭️ Atlanan: <strong className="text-yellow-700">{syncProgress.imagesSkipped || 0}</strong></div>
                      <div>❌ Hatalı: <strong className="text-red-700">{syncProgress.imagesFailed || 0}</strong></div>
                      {syncProgress.details?.totalImages && (
                        <div className="pt-1 border-t border-gray-200 mt-1">
                          📊 Toplam: <strong>{syncProgress.details.totalImages}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Button
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isSyncing}
              className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSyncing ? '🔄 Senkronize Ediliyor...' : '🔄 Şimdi Senkronize Et'}
            </Button>
          </Card>

          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                👥
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Cari Senkronizasyonu</h3>
                <p className="text-xs text-gray-600">Müşteri bilgilerini güncelle</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-orange-50 border-l-4 border-orange-500 p-3 rounded">
              💡 Mikro ERP'deki cari bilgilerini müşteri kayıtlarına aktarın.
            </p>
            <Button
              onClick={handleCariSync}
              isLoading={isCariSyncing}
              disabled={isCariSyncing}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isCariSyncing ? '👥 Cari Sync Ediliyor...' : '👥 Cari Sync Et'}
            </Button>
          </Card>

          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                📸
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Resim Senkronizasyonu</h3>
                <p className="text-xs text-gray-600">Ürün resimlerini indir</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-purple-50 border-l-4 border-purple-500 p-3 rounded">
              💡 Mikro ERP'den resmi olmayan ürünler için resimleri indirin.
            </p>
            {imageSyncProgress && (
              <div className={`${isImageSyncing ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'} border px-3 py-2 rounded mb-3 text-sm`}>
                <div className="flex items-center gap-2 mb-2">
                  {isImageSyncing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>}
                  {!isImageSyncing && <span className="text-green-600 text-lg">✅</span>}
                  <span className={`font-semibold ${isImageSyncing ? 'text-purple-900' : 'text-green-900'}`}>
                    {isImageSyncing ? 'İndiriliyor...' : 'Son senkronizasyon:'}
                  </span>
                </div>
                <div className="space-y-0.5 text-xs">
                  <div>✅ İndirilen: <strong className="text-green-700">{imageSyncProgress.imagesDownloaded || 0}</strong></div>
                  <div>⏭️ Atlanan: <strong className="text-yellow-700">{imageSyncProgress.imagesSkipped || 0}</strong></div>
                  <div>❌ Hatalı: <strong className="text-red-700">{imageSyncProgress.imagesFailed || 0}</strong></div>
                </div>
              </div>
            )}
            <Button
              onClick={handleImageSync}
              isLoading={isImageSyncing}
              disabled={isImageSyncing}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isImageSyncing ? '📸 İndiriliyor...' : '📸 Resim Sync Et'}
            </Button>
          </Card>

          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Hızlı İşlemler</h3>
                <p className="text-xs text-gray-600">Sık kullanılan işlemler</p>
              </div>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 font-semibold"
                onClick={() => router.push('/customers')}
              >
                👥 Yeni Müşteri Ekle
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 font-semibold"
                onClick={() => router.push('/orders')}
              >
                📋 Bekleyen Siparişler ({stats?.orders.pendingCount || 0})
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-semibold"
                onClick={() => router.push('/categories')}
              >
                💰 Fiyatlandırma Ayarları
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 font-semibold"
                onClick={() => router.push('/settings')}
              >
                ⚙️ Sistem Ayarları
              </Button>
            </div>
          </Card>
        </div>

        {/* Ekstre Modal */}
        <EkstreModal
          isOpen={showEkstreModal}
          onClose={() => setShowEkstreModal(false)}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
}
