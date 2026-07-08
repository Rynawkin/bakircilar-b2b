'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSiparisTakip } from './useSiparisTakip';

/**
 * Klasik gorunum Siparis Takip ekrani. Mevcut TUM mantik useSiparisTakip'tan gelir.
 * Bu JSX, eski page.tsx'in `return (` sonrasi cikisinin BIRE BIR korunmus halidir.
 * Hicbir handler/izin/kosul/modal/kolon/sekme/rozet/durum dusurulmemistir.
 */
export default function SiparisTakipClassic() {
  const {
    settings,
    customerWarehouseFilter,
    setCustomerWarehouseFilter,
    customerFulfillmentFilter,
    setCustomerFulfillmentFilter,
    supplierCityFilter,
    setSupplierCityFilter,
    supplierCitySort,
    setSupplierCitySort,
    activeTab,
    setActiveTab,
    isLoading,
    isSyncing,
    isSendingEmails,
    sendingToCustomer,
    downloadingSupplier,
    downloadingCustomerStatementPdf,
    downloadingCustomerPdf,
    downloadingSupplierExcel,
    downloadingSelectedCustomerStatements,
    downloadingSelectedCustomers,
    downloadingSelectedSuppliers,
    selectedCustomerCodes,
    selectedSupplierCodes,
    markingSupplierTransmission,
    closingOrderTarget,
    expandedCustomers,
    emailOverrides,
    setEmailOverrides,
    showSettingsModal,
    setShowSettingsModal,
    settingsForm,
    setSettingsForm,
    confirmDialog,
    setConfirmDialog,
    user,
    customerSummary,
    supplierSummary,
    handleSaveSettings,
    handleSync,
    handleSendCustomerEmails,
    handleSendSupplierEmails,
    handleSyncAndSend,
    handleSendToCustomer,
    toggleCustomerExpanded,
    toggleCustomerSelection,
    setVisibleCustomerSelection,
    toggleSupplierSelection,
    setVisibleSupplierSelection,
    handleDownloadCustomerPdf,
    handleDownloadCustomerStatementPdf,
    handleDownloadSelectedCustomersPdf,
    handleDownloadSelectedCustomerStatementsPdf,
    handleDownloadSelectedSuppliersApprovalPdf,
    handleDownloadSupplierPdf,
    handleDownloadSupplierExcel,
    handleMarkSupplierTransmitted,
    handleCloseRemaining,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatWarehouseName,
    getOrderWarehouseLabel,
    getItemStock,
    itemCanFulfill,
    getFulfillmentBadgeClass,
    getFulfillmentText,
    getWarehouseBreakdown,
    formatSchedule,
    customerAmount,
    supplierAmount,
    totalAmount,
    isSupplierTab,
    supplierCities,
    filteredCustomerSummary,
    filteredSupplierSummary,
    currentSummary,
    currentAmount,
    visibleSelectableCustomers,
    selectedVisibleCustomerCount,
    visibleSelectableSuppliers,
    selectedVisibleSupplierCount,
  } = useSiparisTakip();

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Sipariş Takip</h1>
          <p className="text-gray-600">Bekleyen müşteri ve tedarikçi siparişlerini takip edin ve mail gönderin</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">👥 Müşteri Siparişleri</p>
            <p className="text-3xl font-bold text-blue-600">{customerSummary.length}</p>
            <p className="text-lg font-semibold text-blue-700 mt-1">{formatCurrency(customerAmount)}</p>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <p className="text-sm font-medium text-orange-800 mb-2">🏭 Tedarikçi Siparişleri</p>
            <p className="text-3xl font-bold text-orange-600">{supplierSummary.length}</p>
            <p className="text-lg font-semibold text-orange-700 mt-1">{formatCurrency(supplierAmount)}</p>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm font-medium text-green-800 mb-2">💰 Genel Toplam</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-green-700 mt-1">{customerSummary.length + supplierSummary.length} sipariş</p>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm font-medium text-purple-800 mb-2">📧 Son Maillar</p>
            <div className="text-xs text-purple-700">
              <div>Müşteri: {settings?.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : '-'}</div>
              <div className="mt-1">Tedarikçi: {settings?.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : '-'}</div>
            </div>
            <p className="text-xs text-purple-600 mt-2">
              Son sync: {settings?.lastSyncAt ? formatDate(settings.lastSyncAt) : '-'}
            </p>
          </Card>
        </div>

        {/* Actions */}
        <Card className="mb-8">
          <h2 className="text-xl font-bold mb-4">⚡ Hızlı İşlemler</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Button
                onClick={handleSync}
                isLoading={isSyncing}
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              >
                🔄 Siparişleri Sync Et
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Mikro ERP'den bekleyen siparişleri çeker ve veritabanına kaydeder
              </p>
            </div>

            <div>
              <Button
                onClick={activeTab === 'customers' ? handleSendCustomerEmails : handleSendSupplierEmails}
                isLoading={isSendingEmails}
                disabled={isSendingEmails}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
              >
                📧 {activeTab === 'customers' ? 'Müşterilere' : 'Tedarikçilere'} Mail Gönder
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Seçili sekmedeki tüm {activeTab === 'customers' ? 'müşterilere' : 'tedarikçilere'} sipariş bilgilerini mail ile gönderir
              </p>
            </div>

            <div>
              <Button
                onClick={handleSyncAndSend}
                isLoading={isSyncing || isSendingEmails}
                disabled={isSyncing || isSendingEmails}
                className="bg-purple-600 hover:bg-purple-700 text-white w-full"
              >
                ⚡ Sync + Tüm Mailleri Gönder
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Önce sync yapar, ardından hem müşterilere hem tedarikçilere mail gönderir
              </p>
            </div>
          </div>
        </Card>

        {/* Settings */}
        {settings && (
          <Card className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">⚙️ Otomatik Mail Ayarları</h2>
              <Button
                onClick={() => setShowSettingsModal(true)}
                className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-4 py-2"
              >
                ✏️ Düzenle
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Müşteri Ayarları */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-bold text-blue-700 mb-3">👥 Müşteri Mail Ayarları</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Otomatik Mail:</span>{' '}
                    <span className={settings.customerEmailEnabled ? 'text-green-600' : 'text-red-600'}>
                      {settings.customerEmailEnabled ? '✅ Aktif' : '❌ Pasif'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Zamanlama:</span>{' '}
                    <span className="text-gray-900">{formatSchedule(settings.customerSyncSchedule)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email Konusu:</span>{' '}
                    <span className="text-gray-900">{settings.customerEmailSubject}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Son Gönderim:</span>{' '}
                    <span className="text-gray-900">
                      {settings.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : 'Henüz gönderilmedi'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tedarikçi Ayarları */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-bold text-orange-700 mb-3">🏭 Tedarikçi Mail Ayarları</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Otomatik Mail:</span>{' '}
                    <span className={settings.supplierEmailEnabled ? 'text-green-600' : 'text-red-600'}>
                      {settings.supplierEmailEnabled ? '✅ Aktif' : '❌ Pasif'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Zamanlama:</span>{' '}
                    <span className="text-gray-900">{formatSchedule(settings.supplierSyncSchedule)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email Konusu:</span>{' '}
                    <span className="text-gray-900">{settings.supplierEmailSubject}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Son Gönderim:</span>{' '}
                    <span className="text-gray-900">
                      {settings.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : 'Henüz gönderilmedi'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">⚙️ Otomatik Mail Ayarlarını Düzenle</h2>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Müşteri Ayarları */}
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <h3 className="font-bold text-blue-700 mb-4 text-lg">👥 Müşteri Mail Ayarları</h3>

                    <div className="space-y-4">
                      {/* Aktif/Pasif */}
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsForm.customerEmailEnabled}
                            onChange={(e) =>
                              setSettingsForm((prev) => ({ ...prev, customerEmailEnabled: e.target.checked }))
                            }
                            className="w-5 h-5 text-blue-600"
                          />
                          <span className="font-medium">Otomatik mail gönderimi aktif</span>
                        </label>
                      </div>

                      {/* Email Konusu */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Konusu</label>
                        <input
                          type="text"
                          value={settingsForm.customerEmailSubject}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, customerEmailSubject: e.target.value }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Gün Seçimi */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Gönderim Günleri</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 1, label: 'Pazartesi' },
                            { value: 2, label: 'Salı' },
                            { value: 3, label: 'Çarşamba' },
                            { value: 4, label: 'Perşembe' },
                            { value: 5, label: 'Cuma' },
                            { value: 6, label: 'Cumartesi' },
                            { value: 0, label: 'Pazar' },
                          ].map((day) => (
                            <label key={day.value} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={settingsForm.customerDays.includes(day.value)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSettingsForm((prev) => ({
                                      ...prev,
                                      customerDays: [...prev.customerDays, day.value].sort(),
                                    }));
                                  } else {
                                    setSettingsForm((prev) => ({
                                      ...prev,
                                      customerDays: prev.customerDays.filter((d) => d !== day.value),
                                    }));
                                  }
                                }}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span className="text-sm">{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Saat Seçimi */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gönderim Saati</label>
                        <select
                          value={settingsForm.customerHour}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, customerHour: parseInt(e.target.value) }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {i.toString().padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tedarikçi Ayarları */}
                  <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                    <h3 className="font-bold text-orange-700 mb-4 text-lg">🏭 Tedarikçi Mail Ayarları</h3>

                    <div className="space-y-4">
                      {/* Aktif/Pasif */}
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsForm.supplierEmailEnabled}
                            onChange={(e) =>
                              setSettingsForm((prev) => ({ ...prev, supplierEmailEnabled: e.target.checked }))
                            }
                            className="w-5 h-5 text-orange-600"
                          />
                          <span className="font-medium">Otomatik mail gönderimi aktif</span>
                        </label>
                      </div>

                      {/* Email Konusu */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Konusu</label>
                        <input
                          type="text"
                          value={settingsForm.supplierEmailSubject}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, supplierEmailSubject: e.target.value }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      {/* Gün Seçimi */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Gönderim Günleri</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 1, label: 'Pazartesi' },
                            { value: 2, label: 'Salı' },
                            { value: 3, label: 'Çarşamba' },
                            { value: 4, label: 'Perşembe' },
                            { value: 5, label: 'Cuma' },
                            { value: 6, label: 'Cumartesi' },
                            { value: 0, label: 'Pazar' },
                          ].map((day) => (
                            <label key={day.value} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={settingsForm.supplierDays.includes(day.value)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSettingsForm((prev) => ({
                                      ...prev,
                                      supplierDays: [...prev.supplierDays, day.value].sort(),
                                    }));
                                  } else {
                                    setSettingsForm((prev) => ({
                                      ...prev,
                                      supplierDays: prev.supplierDays.filter((d) => d !== day.value),
                                    }));
                                  }
                                }}
                                className="w-4 h-4 text-orange-600"
                              />
                              <span className="text-sm">{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Saat Seçimi */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gönderim Saati</label>
                        <select
                          value={settingsForm.supplierHour}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, supplierHour: parseInt(e.target.value) }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {i.toString().padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-end mt-6 pt-4 border-t">
                  <Button
                    onClick={() => setShowSettingsModal(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700"
                  >
                    İptal
                  </Button>
                  <Button onClick={handleSaveSettings} className="bg-green-600 hover:bg-green-700 text-white">
                    💾 Kaydet
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Card className="mb-8">
          <div className="flex gap-2 border-b pb-4">
            <Button
              onClick={() => setActiveTab('customers')}
              className={
                activeTab === 'customers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }
            >
              👥 Müşteriler ({customerSummary.length})
            </Button>
            <Button
              onClick={() => setActiveTab('suppliers')}
              className={
                activeTab === 'suppliers'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }
            >
              🏭 Tedarikçiler ({supplierSummary.length})
            </Button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">
                {activeTab === 'customers' ? '👥 Müşteriler' : '🏭 Tedarikçiler'} ({currentSummary.length})
              </h2>
              <div className="text-right">
                <div className="text-sm text-gray-600">Toplam Tutar</div>
                <div className="text-2xl font-bold text-primary-600">{formatCurrency(currentAmount)}</div>
              </div>
            </div>

            {!isSupplierTab && (
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depo Filtre</label>
                  <select
                    value={customerWarehouseFilter}
                    onChange={(e) => setCustomerWarehouseFilter(e.target.value as 'ALL' | '1' | '6')}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Tum Depolar</option>
                    <option value="1">Sadece Merkez</option>
                    <option value="6">Sadece Topca</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Karsilanabilirlik</label>
                  <select
                    value={customerFulfillmentFilter}
                    onChange={(e) =>
                      setCustomerFulfillmentFilter(
                        e.target.value as 'ALL' | 'ANY_UNFULFILLED' | 'MERKEZ_UNFULFILLED' | 'TOPCA_UNFULFILLED'
                      )
                    }
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Tum Siparisler</option>
                    <option value="ANY_UNFULFILLED">Sadece Karsilanamayanlar</option>
                    <option value="MERKEZ_UNFULFILLED">Merkezden Karsilanamayanlar</option>
                    <option value="TOPCA_UNFULFILLED">Topcadan Karsilanamayanlar</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setVisibleCustomerSelection(filteredCustomerSummary, true)}
                    disabled={visibleSelectableCustomers.length === 0}
                    className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 text-sm"
                  >
                    Tumunu Sec
                  </Button>
                  <Button
                    onClick={() => setVisibleCustomerSelection(filteredCustomerSummary, false)}
                    disabled={selectedVisibleCustomerCount === 0}
                    className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 text-sm"
                  >
                    Secimi Temizle
                  </Button>
                  <Button
                    onClick={() => handleDownloadSelectedCustomerStatementsPdf(filteredCustomerSummary)}
                    isLoading={downloadingSelectedCustomerStatements}
                    disabled={selectedVisibleCustomerCount === 0 || downloadingSelectedCustomerStatements}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    Secili Musteri PDF ({selectedVisibleCustomerCount})
                  </Button>
                  <Button
                    onClick={() => handleDownloadSelectedCustomersPdf(filteredCustomerSummary)}
                    isLoading={downloadingSelectedCustomers}
                    disabled={selectedVisibleCustomerCount === 0 || downloadingSelectedCustomers}
                    className="bg-slate-700 hover:bg-slate-800 text-white text-sm"
                  >
                    Secili Stok PDF ({selectedVisibleCustomerCount})
                  </Button>
                </div>
              </div>
            )}

            {isSupplierTab && (
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sehir Filtre</label>
                  <select
                    value={supplierCityFilter}
                    onChange={(e) => setSupplierCityFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Tum Sehirler</option>
                    {supplierCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sehire Gore Sirala</label>
                  <select
                    value={supplierCitySort}
                    onChange={(e) => setSupplierCitySort(e.target.value as 'none' | 'asc' | 'desc')}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="none">Varsayilan</option>
                    <option value="asc">A-Z</option>
                    <option value="desc">Z-A</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setVisibleSupplierSelection(filteredSupplierSummary, true)}
                    disabled={visibleSelectableSuppliers.length === 0}
                    className="bg-white text-orange-700 border border-orange-200 hover:bg-orange-50 text-sm"
                  >
                    Tumunu Sec
                  </Button>
                  <Button
                    onClick={() => setVisibleSupplierSelection(filteredSupplierSummary, false)}
                    disabled={selectedVisibleSupplierCount === 0}
                    className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 text-sm"
                  >
                    Secimi Temizle
                  </Button>
                  <Button
                    onClick={() => handleDownloadSelectedSuppliersApprovalPdf(filteredSupplierSummary)}
                    isLoading={downloadingSelectedSuppliers}
                    disabled={selectedVisibleSupplierCount === 0 || downloadingSelectedSuppliers}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-sm"
                  >
                    Secilileri Indir ({selectedVisibleSupplierCount})
                  </Button>
                </div>
              </div>
            )}

            {currentSummary.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                <p className="text-lg mb-2">✅ Bekleyen sipariş yok</p>
                <p className="text-sm">Yeni siparişler sync edildiğinde burada görünecek.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentSummary.map((customer) => {
                  const isExpanded = expandedCustomers.has(customer.customerCode);
                  const hasPendingItems = customer.orders.some((order) =>
                    order.items.some((item) => item.remainingQty > 0)
                  );
                  const warehouseBreakdown = isSupplierTab ? getWarehouseBreakdown(customer.orders) : null;
                  return (
                    <div key={customer.customerCode} className="border rounded-lg overflow-hidden">
                      {/* Customer Header */}
                      <div className={`p-4 border-b ${activeTab === 'customers' ? 'bg-gradient-to-r from-blue-50 to-blue-100' : 'bg-gradient-to-r from-orange-50 to-orange-100'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-1 items-start gap-3">
                            {!isSupplierTab && (
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={selectedCustomerCodes.has(customer.customerCode)}
                                disabled={!hasPendingItems}
                                onChange={(e) => toggleCustomerSelection(customer.customerCode, e.target.checked)}
                                title="Toplu PDF secimi"
                              />
                            )}
                            {isSupplierTab && (
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={selectedSupplierCodes.has(customer.customerCode)}
                                disabled={!hasPendingItems}
                                onChange={(e) => toggleSupplierSelection(customer.customerCode, e.target.checked)}
                                title="Toplu yonetici onayi PDF secimi"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-bold text-gray-900 mb-1">{customer.customerName}</h3>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              <span>📋 Kod: {customer.customerCode}</span>
                              <span>
                                📧 Email:{' '}
                                {customer.customerEmail ? (
                                  <span className="font-medium text-blue-600">{customer.customerEmail}</span>
                                ) : (
                                  <span className="text-red-600">Kayıtlı değil</span>
                                )}
                              </span>
                              {customer.sectorCode && (
                                <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                                  {customer.sectorCode}
                                </span>
                              )}
                              {isSupplierTab && (
                                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                                  Sehir: {customer.city || '-'}
                                </span>
                              )}
                              {isSupplierTab && (
                                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                  Son Iletim: {formatDateTime(customer.lastTransmittedAt || null)}
                                  {customer.lastTransmittedByName ? ` (${customer.lastTransmittedByName})` : ''}
                                </span>
                              )}
                              {isSupplierTab && warehouseBreakdown && warehouseBreakdown.merkezItems > 0 && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  Merkez: {warehouseBreakdown.merkezOrders} siparis / {warehouseBreakdown.merkezItems} satir
                                </span>
                              )}
                              {isSupplierTab && warehouseBreakdown && warehouseBreakdown.topcaItems > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                  Topca: {warehouseBreakdown.topcaOrders} siparis / {warehouseBreakdown.topcaItems} satir
                                </span>
                              )}
                              {isSupplierTab && warehouseBreakdown && warehouseBreakdown.otherItems > 0 && (
                                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">
                                  Diger depo: {warehouseBreakdown.otherOrders} siparis / {warehouseBreakdown.otherItems} satir
                                </span>
                              )}
                              <span>📦 {customer.ordersCount} sipariş</span>
                              <span className="font-semibold text-primary-600">
                                💰 {formatCurrency(customer.totalAmount)}
                              </span>
                            </div>
                          </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isSupplierTab && (
                              <>
                                <Button
                                  onClick={() => handleDownloadCustomerStatementPdf(customer)}
                                  isLoading={downloadingCustomerStatementPdf === customer.customerCode}
                                  disabled={
                                    !hasPendingItems ||
                                    downloadingCustomerStatementPdf === customer.customerCode
                                  }
                                  className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 text-sm py-1 px-3"
                                >
                                  Musteri PDF
                                </Button>
                                <Button
                                  onClick={() => handleDownloadCustomerPdf(customer)}
                                  isLoading={downloadingCustomerPdf === customer.customerCode}
                                  disabled={!hasPendingItems || downloadingCustomerPdf === customer.customerCode}
                                  className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-sm py-1 px-3"
                                >
                                  Stok PDF
                                </Button>
                              </>
                            )}
                            {isSupplierTab && (
                              <Button
                                onClick={() => handleMarkSupplierTransmitted(customer)}
                                isLoading={markingSupplierTransmission === customer.customerCode}
                                disabled={markingSupplierTransmission === customer.customerCode}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-1 px-3"
                              >
                                Iletildi
                              </Button>
                            )}
                            {isSupplierTab && (
                              <Button
                                onClick={() => handleDownloadSupplierPdf(customer)}
                                isLoading={downloadingSupplier === customer.customerCode}
                                disabled={
                                  !hasPendingItems ||
                                  downloadingSupplier === customer.customerCode ||
                                  downloadingSupplierExcel === customer.customerCode
                                }
                                className="bg-white text-orange-700 border border-orange-200 hover:bg-orange-50 text-sm py-1 px-3"
                              >
                                PDF Indir
                              </Button>
                            )}
                            {isSupplierTab && (
                              <Button
                                onClick={() => handleDownloadSupplierExcel(customer)}
                                isLoading={downloadingSupplierExcel === customer.customerCode}
                                disabled={
                                  !hasPendingItems ||
                                  downloadingSupplierExcel === customer.customerCode ||
                                  downloadingSupplier === customer.customerCode
                                }
                                className="bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-sm py-1 px-3"
                              >
                                Excel Indir
                              </Button>
                            )}
                            {customer.emailSent ? (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✅ Gönderildi
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⏳ Bekliyor
                              </span>
                            )}
                            <Button
                              onClick={() => toggleCustomerExpanded(customer.customerCode)}
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm py-1 px-3"
                            >
                              {isExpanded ? '▲ Gizle' : '▼ Detay'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Email Override & Send */}
                      <div className="p-4 bg-gray-50 border-b">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              📧 Email Override (opsiyonel - tek seferlik)
                            </label>
                            <input
                              type="email"
                              placeholder={customer.customerEmail || 'email@example.com'}
                              value={emailOverrides[customer.customerCode] || ''}
                              onChange={(e) =>
                                setEmailOverrides((prev) => ({
                                  ...prev,
                                  [customer.customerCode]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {emailOverrides[customer.customerCode]
                                ? `Mail ${emailOverrides[customer.customerCode]} adresine gönderilecek`
                                : `Varsayılan: ${customer.customerEmail || 'Email bulunamadı'}`}
                            </p>
                          </div>
                          <div className="flex items-end">
                            <Button
                              onClick={() => handleSendToCustomer(customer.customerCode)}
                              isLoading={sendingToCustomer === customer.customerCode}
                              disabled={sendingToCustomer === customer.customerCode}
                              className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap px-6"
                            >
                              📧 Mail Gönder
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Order Details (Expandable) */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <h4 className="font-bold text-gray-900 mb-3">📋 Siparişler ({customer.orders.length})</h4>
                          <div className="space-y-4">
                            {customer.orders.map((order) => (
                              <div key={order.id} className="border rounded-lg p-4 bg-gray-50">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <h5 className="font-bold text-primary-600">
                                      Sipariş No: {order.mikroOrderNumber}
                                      {!isSupplierTab && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                          Depo: {getOrderWarehouseLabel(order)}
                                        </span>
                                      )}
                                    </h5>
                                    <div className="text-sm text-gray-600 mt-1">
                                      <span>📅 Tarih: {formatDate(order.orderDate)}</span>
                                      <span className="ml-4">🚚 Teslimat: {formatDate(order.deliveryDate)}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm text-gray-600">{order.itemCount} kalem</div>
                                    <div className="text-lg font-bold text-primary-600">
                                      {formatCurrency(order.grandTotal)}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCloseRemaining(order, isSupplierTab ? 'supplier' : 'customer')}
                                      disabled={
                                        closingOrderTarget === `${order.mikroOrderNumber}:ORDER` ||
                                        !order.items.some((item) => item.remainingQty > 0)
                                      }
                                      className="mt-2 inline-flex items-center justify-center rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {closingOrderTarget === `${order.mikroOrderNumber}:ORDER`
                                        ? 'Kapatiliyor'
                                        : 'Tum kalanlari kapat'}
                                    </button>
                                  </div>
                                </div>

                                {/* Order Items */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-white">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Ürün</th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                          Miktar (Sipariş/Teslim/Kalan)
                                        </th>
                                        {!isSupplierTab && (
                                          <>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                              Merkez Stok
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                              Topca Stok
                                            </th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                              Merkez
                                            </th>
                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                              Topca
                                            </th>
                                          </>
                                        )}
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                          Birim Fiyat
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                          Kalan Tutar
                                        </th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                          Islem
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {order.items.map((item, idx) => {
                                        const isFullyDelivered = item.remainingQty === 0;
                                        const preferredWarehouseCode = String(item.warehouseCode || '').trim();
                                        const merkezCanFulfill = itemCanFulfill(item, '1');
                                        const topcaCanFulfill = itemCanFulfill(item, '6');
                                        return (
                                          <tr key={idx} className={isFullyDelivered ? 'bg-gray-100 opacity-60' : ''}>
                                            <td className="px-3 py-2">
                                              <div className={`font-medium ${isFullyDelivered ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                                {item.productName}
                                                {isFullyDelivered && (
                                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                    ✓ Teslim Edildi
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-xs text-gray-500">
                                                {item.productCode} / Depo: {formatWarehouseName(item.warehouseCode)}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <div className="flex flex-col items-center gap-0.5">
                                                <div className={isFullyDelivered ? 'text-gray-500' : 'text-gray-700'}>
                                                  <span className="font-medium">{item.quantity}</span> {item.unit}
                                                </div>
                                                {item.deliveredQty > 0 && (
                                                  <div className="text-xs text-gray-400 line-through">
                                                    Teslim: {item.deliveredQty}
                                                  </div>
                                                )}
                                                <div className={`text-xs font-semibold ${isFullyDelivered ? 'text-green-600' : 'text-orange-600'}`}>
                                                  Kalan: {item.remainingQty}
                                                </div>
                                                {!isSupplierTab && item.fulfillment?.hasAggregateRisk && (
                                                  <div className="text-[11px] font-semibold text-red-600">
                                                    Toplam talep riski
                                                  </div>
                                                )}
                                              </div>
                                            </td>
                                            {!isSupplierTab && (
                                              <>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                                  {formatNumber(getItemStock(item, '1'))}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                                  {formatNumber(getItemStock(item, '6'))}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <span
                                                    className={`inline-flex min-w-[72px] justify-center rounded-full border px-2 py-1 text-xs font-semibold ${getFulfillmentBadgeClass(
                                                      merkezCanFulfill,
                                                      preferredWarehouseCode === '1'
                                                    )}`}
                                                    title={`Merkez toplam acik talep: ${formatNumber(item.fulfillment?.merkezTotalDemand || 0)}`}
                                                  >
                                                    {getFulfillmentText(merkezCanFulfill)}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <span
                                                    className={`inline-flex min-w-[72px] justify-center rounded-full border px-2 py-1 text-xs font-semibold ${getFulfillmentBadgeClass(
                                                      topcaCanFulfill,
                                                      preferredWarehouseCode === '6'
                                                    )}`}
                                                    title={`Topca toplam acik talep: ${formatNumber(item.fulfillment?.topcaTotalDemand || 0)}`}
                                                  >
                                                    {getFulfillmentText(topcaCanFulfill)}
                                                  </span>
                                                </td>
                                              </>
                                            )}
                                            <td className={`px-3 py-2 text-right ${isFullyDelivered ? 'text-gray-500' : 'text-gray-700'}`}>
                                              {formatCurrency(item.unitPrice)}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-semibold ${isFullyDelivered ? 'text-gray-500' : 'text-gray-900'}`}>
                                              {formatCurrency(item.lineTotal)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleCloseRemaining(order, isSupplierTab ? 'supplier' : 'customer', item)
                                                }
                                                disabled={
                                                  isFullyDelivered ||
                                                  closingOrderTarget === `${order.mikroOrderNumber}:${item.rowNumber}`
                                                }
                                                className="inline-flex items-center justify-center rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                {closingOrderTarget === `${order.mikroOrderNumber}:${item.rowNumber}`
                                                  ? 'Kapatiliyor'
                                                  : 'Kapat'}
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="İptal"
      />
    </div>
  );
}
