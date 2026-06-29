'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ProductDetailModal } from '@/components/admin/ProductDetailModal';
import { useUrunYonetimi } from './useUrunYonetimi';

/**
 * Klasik (mevcut) Urun Yonetimi gorunumu. JSX birebir korunmustur; tum mantik useUrunYonetimi'den gelir.
 */
export default function UrunYonetimiClassic() {
  const {
    user,
    isInitialLoad,
    isSearching,
    pagination,
    stats,
    search,
    setSearch,
    debouncedSearch,
    brand,
    setBrand,
    hasImage,
    setHasImage,
    hasStock,
    setHasStock,
    imageSyncErrorType,
    setImageSyncErrorType,
    categories,
    categoryId,
    setCategoryId,
    priceListStatus,
    setPriceListStatus,
    customerVisibility,
    setCustomerVisibility,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    selectedProduct,
    setSelectedProduct,
    isModalOpen,
    setIsModalOpen,
    selectedProductIds,
    isBulkSyncing,
    isImageUploading,
    isImageDeleting,
    visibilityUpdatingId,
    setCurrentPage,
    fetchProducts,
    handleSort,
    currentProducts,
    allSelectedOnPage,
    toggleSelectAll,
    toggleProductSelection,
    handleBulkImageSync,
    handleCustomerVisibilityToggle,
    handleImageUpload,
    handleImageDelete,
    getImageSyncErrorLabel,
    getUnitConversionLabel,
  } = useUrunYonetimi();

  if (!user || isInitialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Urun Yonetimi</h1>
            <p className="text-sm text-gray-600">Tum urunleri goruntule ve yonet</p>
          </div>
        </div>
        {/* Filters */}
        <Card className="mb-6 shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-10 h-10 flex items-center justify-center text-xl">
                🔍
              </div>
              <h2 className="text-lg font-bold text-gray-900">Filtreleme ve Arama</h2>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ürün Ara (İsim veya Kod)
                {search !== debouncedSearch && (
                  <span className="ml-2 text-xs text-primary-600 font-normal">
                    (yazıyorsunuz...)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı veya mikro kodu..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
              {/* Image Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fotoğraf Durumu
                </label>
                <select
                  value={hasImage}
                  onChange={(e) => setHasImage(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tümü</option>
                  <option value="true">Fotoğrafı Olanlar</option>
                  <option value="false">Fotoğrafı Olmayanlar</option>
                </select>
              </div>

              {/* Image Error Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resim Hata Tipi
                </label>
                <select
                  value={imageSyncErrorType}
                  onChange={(e) => setImageSyncErrorType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tumu</option>
                  <option value="NO_IMAGE">NO_IMAGE</option>
                  <option value="NO_GUID">NO_GUID</option>
                  <option value="IMAGE_TOO_LARGE">IMAGE_TOO_LARGE</option>
                  <option value="IMAGE_DOWNLOAD_ERROR">IMAGE_DOWNLOAD_ERROR</option>
                  <option value="IMAGE_PROCESS_ERROR">IMAGE_PROCESS_ERROR</option>
                  <option value="NO_SERVICE">MOCK_MODE / NO_SERVICE</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Tüm Kategoriler</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marka
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Marka kodu veya adi..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Stock Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stok Durumu
                </label>
                <select
                  value={hasStock}
                  onChange={(e) => setHasStock(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tumu</option>
                  <option value="true">Stokta Olanlar</option>
                  <option value="false">Stokta Olmayanlar</option>
                </select>
              </div>

              {/* Price List Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mikro Satış Fiyatı
                </label>
                <select
                  value={priceListStatus}
                  onChange={(e) => setPriceListStatus(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tümü</option>
                  <option value="available">Fiyatı Olanlar</option>
                  <option value="missing">Fiyatı Olmayanlar</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Musteri Gorunumu
                </label>
                <select
                  value={customerVisibility}
                  onChange={(e) => setCustomerVisibility(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tumu</option>
                  <option value="visible">Musteriye acik</option>
                  <option value="hidden">Musteriye gizli</option>
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sıralama
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="name">İsim</option>
                    <option value="mikroCode">Mikro Kod</option>
                    <option value="excessStock">Fazla Stok</option>
                    <option value="totalStock">Toplam Stok</option>
                    <option value="lastEntryDate">Son Giriş Tarihi</option>
                    <option value="currentCost">Güncel Maliyet</option>
                    <option value="imageSyncErrorType">Resim Hata</option>
                    <option value="imageSyncUpdatedAt">Resim Guncelleme</option>
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-4"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 pt-3 border-t border-gray-200 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Toplam:</span>
                <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full font-bold">
                  {stats.total} ürün
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Fotoğraflı:</span>
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">
                  {stats.withImage}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Fotoğrafsız:</span>
                <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-bold">
                  {stats.withoutImage}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Products Table */}
        <Card className="shadow-lg overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 bg-white">
            <div className="text-sm text-gray-600">
              Secili urun: <span className="font-semibold text-gray-900">{selectedProductIds.length}</span>
            </div>
            <Button
              variant="primary"
              onClick={handleBulkImageSync}
              disabled={isBulkSyncing || selectedProductIds.length === 0}
            >
              {isBulkSyncing ? 'Resim senkronu baslatiliyor...' : 'Secili urunlerin resmini guncelle'}
            </Button>
          </div>
          <div className="relative">
            {/* Loading Overlay */}
            {isSearching && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 rounded-lg flex items-start justify-center pt-8">
                <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-sm">Aranıyor...</span>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      aria-label="Tumunu sec"
                      checked={allSelectedOnPage}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Fotoğraf
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Resim Durumu
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Ürün Adı
                      {sortBy === 'name' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('mikroCode')}
                  >
                    <div className="flex items-center gap-1">
                      Mikro Kod
                      {sortBy === 'mikroCode' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('excessStock')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Fazla Stok
                      {sortBy === 'excessStock' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Toplam Stok
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('currentCost')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Hesaplanan Maliyet
                      {sortBy === 'currentCost' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('lastEntryDate')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Son Giriş
                      {sortBy === 'lastEntryDate' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Musteri Gorunumu
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentProducts.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      Ürün bulunamadı
                    </td>
                  </tr>
                ) : (
                  currentProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    return (
                    <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${product.hiddenFromCustomers ? 'bg-rose-50/60' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Sec ${product.name}`}
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {product.imageUrl ? (
                          <div className="relative w-16 h-16 bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-2xl">
                            📦
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {product.imageUrl ? (
                          <div>
                            <div className="text-xs font-semibold text-green-700">Var</div>
                            {product.imageChecksum && (
                              <div className="text-[10px] text-gray-500">
                                SHA: {product.imageChecksum.slice(0, 12)}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs font-semibold text-yellow-700">Eksik</div>
                            {product.imageSyncErrorType && (
                              <div className="text-xs text-gray-600">
                                {getImageSyncErrorLabel(product.imageSyncErrorType) || product.imageSyncErrorType}
                              </div>
                            )}
                            {product.imageSyncErrorMessage && (
                              <div className="text-[10px] text-gray-500">
                                {product.imageSyncErrorMessage}
                              </div>
                            )}
                            {product.imageChecksum && (
                              <div className="text-[10px] text-gray-500">
                                SHA: {product.imageChecksum.slice(0, 12)}...
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-500">{product.unit}</div>
                        {unitLabel && <div className="text-xs text-gray-500">{unitLabel}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-gray-700">{product.mikroCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{product.category.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.excessStock > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                            {product.excessStock}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-700">{product.totalStock}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.calculatedCost ? (
                          <div>
                            <div className="font-semibold text-gray-900">
                              {formatCurrency(product.calculatedCost)}
                            </div>
                            <div className="text-xs text-gray-500">
                              KDV: %{(product.vatRate * 100).toFixed(0)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.lastEntryDate ? (
                          <div>
                            <div className="text-sm text-gray-700">
                              {formatDate(product.lastEntryDate)}
                            </div>
                            {product.lastEntryPrice && (
                              <div className="text-xs text-gray-500">
                                {formatCurrency(product.lastEntryPrice)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              product.hiddenFromCustomers
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {product.hiddenFromCustomers ? 'Gizli' : 'Acik'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCustomerVisibilityToggle(product)}
                            disabled={visibilityUpdatingId === product.id}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
                              product.hiddenFromCustomers ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            title={product.hiddenFromCustomers ? 'Musteriye goster' : 'Musteriye gizle'}
                          >
                            <span
                              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                product.hiddenFromCustomers ? 'translate-x-1' : 'translate-x-5'
                              }`}
                            />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          📋 Detay
                        </Button>
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="text-sm text-gray-600">
                Sayfa {pagination.page} / {pagination.totalPages} ({pagination.total} toplam ürün)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const newPage = Math.max(1, pagination.page - 1);
                    setCurrentPage(newPage);
                    fetchProducts(newPage);
                  }}
                  disabled={pagination.page === 1}
                  size="sm"
                >
                  ← Önceki
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const newPage = Math.min(pagination.totalPages, pagination.page + 1);
                    setCurrentPage(newPage);
                    fetchProducts(newPage);
                  }}
                  disabled={pagination.page === pagination.totalPages}
                  size="sm"
                >
                  Sonraki →
                </Button>
              </div>
            </div>
          )}
          </div>
        </Card>
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={selectedProduct}
        onUploadImage={handleImageUpload}
        onDeleteImage={handleImageDelete}
        imageUploading={isImageUploading}
        imageDeleting={isImageDeleting}
      />
    </div>
  );
}
