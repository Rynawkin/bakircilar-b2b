'use client';

import {
  Search,
  ArrowDownUp,
  Package,
  RefreshCw,
  FileText,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ProductDetailModal } from '@/components/admin/ProductDetailModal';
import { useUrunYonetimi } from './useUrunYonetimi';

/**
 * Yeni gorunum Urun Yonetimi. Mevcut TUM mantik useUrunYonetimi'den gelir; sadece gorsel yeni.
 * Hicbir filtre/kolon/buton/rozet/toggle/sayac/modal/durum dusurulmemistir.
 *
 * Palet: kart #fff / border #e7ebf2 / radius 12px · primary #15356b ·
 * ink #14223b / #51607a / #8b97ac · emerald / amber / red · lucide ikon · EMOJI YOK.
 */
export default function UrunYonetimiNew() {
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#15356b]"></div>
      </div>
    );
  }

  const selectCls =
    'h-[38px] border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] bg-white outline-none cursor-pointer';
  const sortArrow = sortOrder === 'asc' ? '↑' : '↓';

  // Grid sablonu basligi ve satirlarda birebir kullanilir (kolon dusurme yok)
  const GRID =
    'grid items-center gap-2.5 grid-cols-[40px_64px_minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_84px_84px_minmax(0,1.2fr)_minmax(0,1.3fr)_104px_84px]';

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Baslik */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Urun Yonetimi</h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">
              Urun, fiyat, maliyet, fotograf ve musteri gorunurlugu yonetimi
            </div>
          </div>
        </div>

        {/* Filtre karti */}
        <div className="bg-white border border-[#e7ebf2] rounded-xl p-3.5 mb-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Arama */}
            <div className="flex-1 min-w-[200px] flex items-center gap-2 h-[38px] border border-[#e3e8f0] rounded-lg px-3">
              <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Urun ara (isim veya mikro kod)..."
                className="flex-1 border-none bg-transparent outline-none text-[13px] text-[#14223b]"
              />
              {search !== debouncedSearch && (
                <span className="text-[11px] text-[#15356b] whitespace-nowrap">yaziliyor...</span>
              )}
            </div>

            {/* Fotograf Durumu */}
            <select value={hasImage} onChange={(e) => setHasImage(e.target.value as any)} className={selectCls} aria-label="Fotograf Durumu">
              <option value="all">Fotograf: Tumu</option>
              <option value="true">Fotografi Olanlar</option>
              <option value="false">Fotografi Olmayanlar</option>
            </select>

            {/* Resim Hata Tipi */}
            <select value={imageSyncErrorType} onChange={(e) => setImageSyncErrorType(e.target.value as any)} className={selectCls} aria-label="Resim Hata Tipi">
              <option value="all">Resim Hata: Tumu</option>
              <option value="NO_IMAGE">NO_IMAGE</option>
              <option value="NO_GUID">NO_GUID</option>
              <option value="IMAGE_TOO_LARGE">IMAGE_TOO_LARGE</option>
              <option value="IMAGE_DOWNLOAD_ERROR">IMAGE_DOWNLOAD_ERROR</option>
              <option value="IMAGE_PROCESS_ERROR">IMAGE_PROCESS_ERROR</option>
              <option value="NO_SERVICE">MOCK_MODE / NO_SERVICE</option>
            </select>

            {/* Kategori */}
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls} aria-label="Kategori">
              <option value="">Kategori: Tumu</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            {/* Marka */}
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Marka..."
              className="h-[38px] border border-[#e3e8f0] rounded-lg px-3 text-[12.5px] text-[#14223b] bg-white outline-none w-[150px]"
              aria-label="Marka"
            />

            {/* Stok Durumu */}
            <select value={hasStock} onChange={(e) => setHasStock(e.target.value as any)} className={selectCls} aria-label="Stok Durumu">
              <option value="all">Stok: Tumu</option>
              <option value="true">Stokta Olanlar</option>
              <option value="false">Stokta Olmayanlar</option>
            </select>

            {/* Mikro Satis Fiyati */}
            <select value={priceListStatus} onChange={(e) => setPriceListStatus(e.target.value as any)} className={selectCls} aria-label="Mikro Satis Fiyati">
              <option value="all">Mikro Fiyat: Tumu</option>
              <option value="available">Fiyati Olanlar</option>
              <option value="missing">Fiyati Olmayanlar</option>
            </select>

            {/* Musteri Gorunumu */}
            <select value={customerVisibility} onChange={(e) => setCustomerVisibility(e.target.value as any)} className={selectCls} aria-label="Musteri Gorunumu">
              <option value="all">Gorunum: Tumu</option>
              <option value="visible">Musteriye acik</option>
              <option value="hidden">Musteriye gizli</option>
            </select>

            {/* Siralama + yon */}
            <span className="flex items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-[38px] border border-[#e3e8f0] border-r-0 rounded-l-lg px-2.5 text-[12.5px] text-[#14223b] bg-white outline-none cursor-pointer"
                aria-label="Siralama"
              >
                <option value="name">Sirala: Isim</option>
                <option value="mikroCode">Mikro Kod</option>
                <option value="excessStock">Fazla Stok</option>
                <option value="totalStock">Toplam Stok</option>
                <option value="lastEntryDate">Son Giris Tarihi</option>
                <option value="currentCost">Guncel Maliyet</option>
                <option value="imageSyncErrorType">Resim Hata</option>
                <option value="imageSyncUpdatedAt">Resim Guncelleme</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="h-[38px] w-[38px] border border-[#e3e8f0] rounded-r-lg bg-white text-[#51607a] cursor-pointer flex items-center justify-center hover:bg-[#f4f6fa]"
                title={sortOrder === 'asc' ? 'Artan' : 'Azalan'}
                aria-label="Siralama yonu"
              >
                <ArrowDownUp width={14} height={14} stroke="currentColor" strokeWidth={2} />
              </button>
            </span>

            {/* Sayac pill'leri */}
            <span className="text-[11.5px] font-semibold text-[#15356b] bg-[#eef2fa] border border-[#d6e0f1] px-2.5 py-[5px] rounded-full">
              Toplam {stats.total}
            </span>
            <span className="text-[11.5px] font-semibold text-[#047857] bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-[5px] rounded-full">
              Fotografli {stats.withImage}
            </span>
            <span className="text-[11.5px] font-semibold text-[#b45309] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-[5px] rounded-full">
              Fotografsiz {stats.withoutImage}
            </span>
          </div>
        </div>

        {/* Tablo karti */}
        <div className="bg-white border border-[#e7ebf2] rounded-xl overflow-hidden">
          {/* Toplu islem cubugu */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#eef1f6]">
            <div className="text-[12.5px] text-[#51607a]">
              Secili urun: <span className="font-semibold text-[#14223b]">{selectedProductIds.length}</span>
            </div>
            <button
              type="button"
              onClick={handleBulkImageSync}
              disabled={isBulkSyncing || selectedProductIds.length === 0}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#15356b] text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0f2750]"
            >
              <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} className={isBulkSyncing ? 'animate-spin' : ''} />
              {isBulkSyncing ? 'Resim senkronu baslatiliyor...' : 'Secili urunlerin resmini guncelle'}
            </button>
          </div>

          <div className="relative">
            {/* Yukleniyor overlay */}
            {isSearching && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-start justify-center pt-8">
                <div className="flex items-center gap-2 bg-[#15356b] text-white px-4 py-2 rounded-full shadow-lg">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-[13px]">Araniyor...</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="min-w-[1100px]">
                {/* Baslik satiri */}
                <div className={`${GRID} px-4 py-[11px] bg-[#fafbfd] border-b border-[#eef1f6] text-[10px] font-semibold text-[#8b97ac] uppercase tracking-wide`}>
                  <input
                    type="checkbox"
                    aria-label="Tumunu sec"
                    checked={allSelectedOnPage}
                    onChange={toggleSelectAll}
                    className="w-[15px] h-[15px] accent-[#15356b]"
                  />
                  <span>Foto</span>
                  <span>Resim Durumu</span>
                  <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-1 uppercase text-[10px] font-semibold text-[#8b97ac] text-left cursor-pointer hover:text-[#51607a]">
                    Urun Adi{sortBy === 'name' && <span>{sortArrow}</span>}
                  </button>
                  <button type="button" onClick={() => handleSort('mikroCode')} className="flex items-center gap-1 uppercase text-[10px] font-semibold text-[#8b97ac] text-left cursor-pointer hover:text-[#51607a]">
                    Mikro Kod{sortBy === 'mikroCode' && <span>{sortArrow}</span>}
                  </button>
                  <span>Kategori</span>
                  <button type="button" onClick={() => handleSort('excessStock')} className="flex items-center justify-end gap-1 uppercase text-[10px] font-semibold text-[#8b97ac] cursor-pointer hover:text-[#51607a]">
                    Fazla{sortBy === 'excessStock' && <span>{sortArrow}</span>}
                  </button>
                  <span className="text-right">Toplam</span>
                  <button type="button" onClick={() => handleSort('currentCost')} className="flex items-center justify-end gap-1 uppercase text-[10px] font-semibold text-[#8b97ac] cursor-pointer hover:text-[#51607a]">
                    Maliyet{sortBy === 'currentCost' && <span>{sortArrow}</span>}
                  </button>
                  <button type="button" onClick={() => handleSort('lastEntryDate')} className="flex items-center justify-end gap-1 uppercase text-[10px] font-semibold text-[#8b97ac] cursor-pointer hover:text-[#51607a]">
                    Son Giris{sortBy === 'lastEntryDate' && <span>{sortArrow}</span>}
                  </button>
                  <span className="text-center">Gorunum</span>
                  <span className="text-center">Islem</span>
                </div>

                {/* Satirlar */}
                {currentProducts.length === 0 ? (
                  <div className="px-4 py-12 text-center text-[#8b97ac] text-[13px]">Urun bulunamadi</div>
                ) : (
                  currentProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    return (
                      <div
                        key={product.id}
                        className={`${GRID} px-4 py-3 border-t border-[#f1f4f9] text-[12px] text-[#14223b] transition-colors hover:bg-[#fafbfd] ${product.hiddenFromCustomers ? 'bg-rose-50/60' : ''}`}
                      >
                        {/* Sec */}
                        <input
                          type="checkbox"
                          aria-label={`Sec ${product.name}`}
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="w-[15px] h-[15px] accent-[#15356b]"
                        />

                        {/* Foto */}
                        {product.imageUrl ? (
                          <span className="w-12 h-12 rounded-lg overflow-hidden border border-[#eef1f6] bg-white flex items-center justify-center">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                          </span>
                        ) : (
                          <span className="w-12 h-12 rounded-lg border border-[#eef1f6] bg-[#f4f6fa] flex items-center justify-center text-[#9aa6b8]">
                            <Package width={18} height={18} stroke="currentColor" strokeWidth={2} />
                          </span>
                        )}

                        {/* Resim Durumu */}
                        <div className="min-w-0">
                          {product.imageUrl ? (
                            <div>
                              <div className="text-[11px] font-semibold text-[#047857]">Var</div>
                              {product.imageChecksum && (
                                <div className="text-[10px] text-[#8b97ac]">SHA: {product.imageChecksum.slice(0, 12)}...</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="text-[11px] font-semibold text-[#b45309]">Eksik</div>
                              {product.imageSyncErrorType && (
                                <div className="text-[10.5px] text-[#51607a]">
                                  {getImageSyncErrorLabel(product.imageSyncErrorType) || product.imageSyncErrorType}
                                </div>
                              )}
                              {product.imageSyncErrorMessage && (
                                <div className="text-[10px] text-[#8b97ac]">{product.imageSyncErrorMessage}</div>
                              )}
                              {product.imageChecksum && (
                                <div className="text-[10px] text-[#8b97ac]">SHA: {product.imageChecksum.slice(0, 12)}...</div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Urun Adi (+birim+koli) */}
                        <div className="min-w-0">
                          <div className="font-medium text-[#14223b] truncate">{product.name}</div>
                          <div className="text-[10.5px] text-[#8b97ac]">
                            {product.unit}
                            {unitLabel ? ` · ${unitLabel}` : ''} · KDV%{(product.vatRate * 100).toFixed(0)}
                          </div>
                        </div>

                        {/* Mikro Kod */}
                        <span className="font-mono text-[11px] text-[#51607a] truncate">{product.mikroCode}</span>

                        {/* Kategori */}
                        <span className="text-[11.5px] text-[#51607a] truncate">{product.category.name}</span>

                        {/* Fazla Stok */}
                        <span className="text-right">
                          {product.excessStock > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]">
                              {product.excessStock}
                            </span>
                          ) : (
                            <span className="text-[#c4ccda]">-</span>
                          )}
                        </span>

                        {/* Toplam Stok */}
                        <span className="text-right font-semibold text-[#51607a]">{product.totalStock}</span>

                        {/* Hesaplanan Maliyet (+KDV%) */}
                        <span className="text-right">
                          {product.calculatedCost ? (
                            <span className="inline-block">
                              <span className="block font-semibold text-[#14223b]">{formatCurrency(product.calculatedCost)}</span>
                              <span className="block text-[10px] text-[#8b97ac]">KDV: %{(product.vatRate * 100).toFixed(0)}</span>
                            </span>
                          ) : (
                            <span className="text-[#c4ccda]">-</span>
                          )}
                        </span>

                        {/* Son Giris (tarih+fiyat) */}
                        <span className="text-right text-[11px]">
                          {product.lastEntryDate ? (
                            <span className="inline-block">
                              <span className="block text-[#51607a]">{formatDate(product.lastEntryDate)}</span>
                              {product.lastEntryPrice && (
                                <span className="block text-[10px] text-[#8b97ac]">{formatCurrency(product.lastEntryPrice)}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[#c4ccda]">-</span>
                          )}
                        </span>

                        {/* Musteri Gorunumu (rozet + toggle) */}
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
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
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60 ${
                              product.hiddenFromCustomers ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            title={product.hiddenFromCustomers ? 'Musteriye goster' : 'Musteriye gizle'}
                          >
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform ${
                                product.hiddenFromCustomers ? 'translate-x-0.5' : 'translate-x-4'
                              }`}
                            >
                              {product.hiddenFromCustomers ? (
                                <EyeOff width={9} height={9} stroke="#e11d48" strokeWidth={2.5} />
                              ) : (
                                <Eye width={9} height={9} stroke="#10b981" strokeWidth={2.5} />
                              )}
                            </span>
                          </button>
                        </div>

                        {/* Islem (Detay) */}
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(product);
                              setIsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 bg-white border border-[#d8e0ec] rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#eef2fa]"
                          >
                            <FileText width={12} height={12} stroke="currentColor" strokeWidth={2} />
                            Detay
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Sayfalama */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#eef1f6]">
                <span className="text-[12px] text-[#8b97ac]">
                  Sayfa {pagination.page} / {pagination.totalPages} · {pagination.total} toplam urun
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const newPage = Math.max(1, pagination.page - 1);
                      setCurrentPage(newPage);
                      fetchProducts(newPage);
                    }}
                    disabled={pagination.page === 1}
                    className="inline-flex items-center gap-1 h-8 px-3 border border-[#d8e0ec] rounded-lg bg-white cursor-pointer text-[#51607a] text-[12px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f6fa]"
                  >
                    <ChevronLeft width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    Onceki
                  </button>
                  <span className="inline-flex items-center justify-center w-8 h-8 border border-[#15356b] rounded-lg bg-[#15356b] text-white text-[12px] font-semibold">
                    {pagination.page}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newPage = Math.min(pagination.totalPages, pagination.page + 1);
                      setCurrentPage(newPage);
                      fetchProducts(newPage);
                    }}
                    disabled={pagination.page === pagination.totalPages}
                    className="inline-flex items-center gap-1 h-8 px-3 border border-[#d8e0ec] rounded-lg bg-white cursor-pointer text-[#51607a] text-[12px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f4f6fa]"
                  >
                    Sonraki
                    <ChevronRight width={14} height={14} stroke="currentColor" strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Detail Modal (paylasilan; New de de kullanilir) */}
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
