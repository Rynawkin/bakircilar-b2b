'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { useAnlasmaliFiyatlar } from './useAnlasmaliFiyatlar';

/**
 * Klasik (mevcut) gorunum. Tum mantik useAnlasmaliFiyatlar'tan gelir; JSX birebir korunmustur.
 */
export default function AnlasmaliFiyatlarClassic() {
  const {
    router,
    isLoading,
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    filteredCustomers,
    productSearch,
    setProductSearch,
    productResults,
    selectedProduct,
    setSelectedProduct,
    agreements,
    agreementSearch,
    setAgreementSearch,
    formData,
    setFormData,
    saving,
    deletingId,
    bulkDeleting,
    selectedAgreementIds,
    allAgreementsSelected,
    importFile,
    setImportFile,
    importing,
    importSummary,
    setImportSummary,
    resetForm,
    handleSelectAgreement,
    handleSave,
    handleDelete,
    toggleAgreementSelection,
    toggleSelectAllAgreements,
    handleBulkDelete,
    handleDownloadTemplate,
    handleImport,
  } = useAnlasmaliFiyatlar();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Anlasmali Fiyatlar</h1>
            <p className="text-sm text-gray-600">Musteri bazli anlasma fiyatlari</p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/customers')}>
            Musterilere Don
          </Button>
        </div>
        <Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Musteri Sec</label>
              <Input
                placeholder="Musteri ara"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      resetForm();
                    }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${
                      selectedCustomer?.id === customer.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500">{customer.mikroCariCode}</div>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500">Musteri bulunamadi.</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Urun Sec</label>
              <Input
                placeholder="Urun ara"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${
                      selectedProduct?.id === product.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.mikroCode}</div>
                  </button>
                ))}
                {productSearch.trim() && productResults.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500">Urun bulunamadi.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Anlasma Bilgileri</label>
              <Input
                label="Faturali Fiyat"
                type="number"
                value={formData.priceInvoiced}
                onChange={(e) => setFormData({ ...formData, priceInvoiced: e.target.value })}
              />
              <Input
                label="Beyaz Fiyat (opsiyonel)"
                type="number"
                value={formData.priceWhite}
                onChange={(e) => setFormData({ ...formData, priceWhite: e.target.value })}
              />
              <Input
                label="Musteri Urun Kodu (opsiyonel)"
                value={formData.customerProductCode}
                onChange={(e) => setFormData({ ...formData, customerProductCode: e.target.value })}
              />
              <Input
                label="Min Miktar"
                type="number"
                value={formData.minQuantity}
                onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
              />
              <Input
                label="Baslangic"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
              />
              <Input
                label="Bitis (opsiyonel)"
                type="date"
                value={formData.validTo}
                onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleSave}
                  isLoading={saving}
                >
                  Kaydet
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Temizle
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Excel ile Toplu Aktarim</h2>
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              Ornek Excel Indir
            </Button>
          </div>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Excel kolonlari: Mikro Kod, Faturali Fiyat, Beyaz Fiyat (opsiyonel), Musteri Urun Kodu (opsiyonel), Min Miktar, Baslangic, Bitis.</p>
            <p>Aktarim, secili musteri icin uygulanir.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
            <Button
              className="bg-primary-600 hover:bg-primary-700 text-white"
              onClick={handleImport}
              isLoading={importing}
              disabled={importing || !importFile}
            >
              {importing ? 'Aktariliyor...' : 'Excel Aktar'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setImportFile(null);
                setImportSummary(null);
              }}
              disabled={importing}
            >
              Temizle
            </Button>
          </div>
          {importSummary && (
            <div className="mt-4 text-sm">
              <div>Aktarilan: {importSummary.imported}</div>
              <div>Basarisiz: {importSummary.failed}</div>
              {importSummary.results?.filter((item) => item.status !== 'IMPORTED').length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  {importSummary.results.filter((item) => item.status !== 'IMPORTED').slice(0, 8).map((item, idx) => (
                    <div key={`${item.mikroCode}-${idx}`}>
                      {item.mikroCode || '-'}: {item.reason || 'Hata'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">Anlasmalar</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allAgreementsSelected}
                  onChange={toggleSelectAllAgreements}
                  disabled={!selectedCustomer || agreements.length === 0 || bulkDeleting}
                />
                Tumunu sec
              </label>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleBulkDelete('selected')}
                disabled={!selectedCustomer || selectedAgreementIds.length === 0 || bulkDeleting}
                isLoading={bulkDeleting}
              >
                Secilenleri Sil{selectedAgreementIds.length > 0 ? ` (${selectedAgreementIds.length})` : ''}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleBulkDelete('all')}
                disabled={!selectedCustomer || agreements.length === 0 || bulkDeleting}
                isLoading={bulkDeleting}
              >
                Tumunu Sil
              </Button>
              <Input
                placeholder="Anlasma ara"
                value={agreementSearch}
                onChange={(e) => setAgreementSearch(e.target.value)}
                className="w-60"
              />
            </div>
          </div>

          {!selectedCustomer ? (
            <div className="text-sm text-gray-500">Anlasma gormek icin musteri secin.</div>
          ) : agreements.length === 0 ? (
            <div className="text-sm text-gray-500">Anlasma bulunamadi.</div>
          ) : (
            <div className="space-y-3">
              {agreements.map((agreement) => (
                <div key={agreement.id} className="border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label="Sec"
                      checked={selectedAgreementIds.includes(agreement.id)}
                      onChange={() => toggleAgreementSelection(agreement.id)}
                      disabled={bulkDeleting}
                    />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold text-gray-900">{agreement.product.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{agreement.product.mikroCode}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Min: {agreement.minQuantity} {agreement.product.unit || ''}
                    </div>
                    {agreement.customerProductCode && (
                      <div className="text-xs text-gray-500 mt-1">
                        Ozel urun kodu: {agreement.customerProductCode}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 min-w-[160px]">
                    <div>Faturali: {formatCurrency(agreement.priceInvoiced)}</div>
                    <div>Beyaz: {agreement.priceWhite !== null && agreement.priceWhite !== undefined ? formatCurrency(agreement.priceWhite) : '-'}</div>
                  </div>
                  <div className="text-xs text-gray-500 min-w-[160px]">
                    <div>Baslangic: {formatDateShort(agreement.validFrom)}</div>
                    <div>Bitis: {agreement.validTo ? formatDateShort(agreement.validTo) : '-'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleSelectAgreement(agreement)}>
                      Duzenle
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(agreement.id)}
                      isLoading={deletingId === agreement.id}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
