'use client';

import {
  Search,
  X,
  Image as ImageIcon,
  Trash2,
  Upload,
  Star,
  Tag,
  Save,
  Info,
  Package,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { useUrunOverride } from './useUrunOverride';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Urun Override (Vitrin Kontrolleri) ekrani.
 * Mevcut TUM mantik useUrunOverride'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/alan/durum dusurulmemistir; brief 4.10.4'teki her oge mevcut.
 */
export default function UrunOverrideNew() {
  const {
    isLoading,
    selectedProduct,
    setSelectedProduct,
    overrideMargins,
    setOverrideMargins,
    searchInput,
    setSearchInput,
    isSaving,
    uploadingImage,
    featuredOrderInput,
    setFeaturedOrderInput,
    handleToggleFlag,
    handleSaveFeaturedOrder,
    handleSetOverride,
    handleImageUpload,
    handleDeleteImage,
    filteredProducts,
    CUSTOMER_TYPES,
  } = useUrunOverride();

  const pageHeader = (
    <div className="my-[18px] mt-0">
      <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">
        Ürün Override (Vitrin Kontrolleri)
      </h1>
      <div className="text-[13px] text-[#8b97ac] mt-1.5">
        Öne çıkarma, indirime sokmama ve segment bazlı özel fiyat
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {pageHeader}
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#15356b]"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {pageHeader}

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
          {/* ===== SOL: Urun arama + liste ===== */}
          <div className={`${CARD} p-[15px]`}>
            {/* Arama */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2 h-[38px] flex-1 border border-[#e3e8f0] rounded-lg px-[11px]">
                <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                <input
                  placeholder="Ürün ara (isim veya kod)…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
                />
              </div>
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="flex items-center gap-1.5 h-[38px] px-3 border border-[#e3e8f0] rounded-lg text-[12px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  <X width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
                  Temizle
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold text-[#8b97ac] uppercase tracking-[.04em]">
              <Package width={13} height={13} stroke="currentColor" strokeWidth={2} />
              Ürün Listesi ({filteredProducts.length})
            </div>

            {/* Liste */}
            <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 bg-[#fafbfd] border border-[#eef1f6] rounded-lg">
                  <p className="text-[#8b97ac] text-[13px]">Ürün bulunamadı</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                  const isSelected = selectedProduct?.id === product.id;
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setSelectedProduct(product);
                        setFeaturedOrderInput(String(product.featuredOrder ?? 0));
                      }}
                      className={`rounded-[9px] p-[10px] cursor-pointer transition-all ${
                        isSelected
                          ? 'border border-[#15356b] bg-[#eef2fa]'
                          : 'border border-[#eef1f6] hover:bg-[#fafbfd]'
                      }`}
                    >
                      <div className="flex items-center gap-[11px]">
                        <span className="w-9 h-9 rounded-[7px] bg-[#f4f6fa] border border-[#eef1f6] flex-none" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-[#14223b] truncate">
                            {product.name}
                          </div>
                          <div className="text-[10.5px] text-[#8b97ac] font-mono mt-0.5">
                            {product.mikroCode} · {product.category.name}
                          </div>
                        </div>
                        {/* Fazla stok rozeti (amber) */}
                        <span className="bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[10px] font-semibold px-[7px] py-0.5 rounded-md flex-none whitespace-nowrap">
                          Fazla {product.excessStock} {product.unit}
                        </span>
                      </div>

                      {unitLabel && (
                        <div className="mt-2 text-[10.5px] text-[#8b97ac]">{unitLabel}</div>
                      )}

                      {/* Secili: Mevcut Fiyatlar (segment x INVOICED) */}
                      {isSelected && (
                        <div className="mt-2.5 pt-2.5 border-t border-[#d6e0f1]">
                          <p className="text-[11px] font-semibold text-[#15356b] uppercase tracking-[.04em] mb-2">
                            Mevcut Fiyatlar
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {CUSTOMER_TYPES.map((type) => (
                              <div
                                key={type.value}
                                className="bg-white border border-[#eef1f6] rounded-lg p-2"
                              >
                                <div className="text-[10.5px] text-[#8b97ac]">{type.label}</div>
                                <div className="text-[13px] font-semibold text-[#14223b] mt-0.5">
                                  {product.prices && product.prices[type.value]
                                    ? formatCurrency(product.prices[type.value].INVOICED)
                                    : 'N/A'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ===== SAG: Secili urun paneli ===== */}
          <div className="lg:sticky lg:top-24">
            {selectedProduct ? (
              <div className={`${CARD} p-4`}>
                {/* Baslik */}
                <div className="text-[13px] font-semibold text-[#14223b] mb-1">
                  {selectedProduct.name}
                </div>
                <div className="text-[10.5px] text-[#8b97ac] font-mono mb-3">
                  Kod: {selectedProduct.mikroCode}
                </div>

                {/* ===== Urun Fotografi ===== */}
                <div className="text-[11px] font-semibold text-[#8b97ac] uppercase tracking-[.04em] mb-2 flex items-center gap-1.5">
                  <ImageIcon width={13} height={13} stroke="currentColor" strokeWidth={2} />
                  Ürün Fotoğrafı
                </div>
                <div className="bg-[#fafbfd] border border-[#eef1f6] rounded-[9px] p-3 mb-4">
                  {selectedProduct.imageUrl ? (
                    <div className="space-y-3">
                      <div className="relative group bg-white rounded-lg border border-[#e3e8f0] overflow-hidden aspect-square">
                        <img
                          src={`http://localhost:5000${selectedProduct.imageUrl}`}
                          alt={selectedProduct.name}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                          <button
                            type="button"
                            onClick={handleDeleteImage}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 bg-[#b91c1c] text-white px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-[#991b1b] transition-all"
                          >
                            <Trash2 width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
                            Sil
                          </button>
                        </div>
                      </div>
                      <label className="block">
                        <span className="text-[10.5px] text-[#8b97ac]">Fotoğrafı değiştir:</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                          className="block w-full text-[12px] text-[#51607a] file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-[12px] file:font-semibold file:bg-[#eef2fa] file:text-[#15356b] hover:file:bg-[#dfe7f6] mt-1"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-full aspect-square bg-white rounded-lg flex items-center justify-center border border-dashed border-[#d6e0f1]">
                        <div className="text-center text-[#9aa6b8]">
                          <ImageIcon
                            width={40}
                            height={40}
                            stroke="currentColor"
                            strokeWidth={1.5}
                            className="mx-auto mb-2"
                          />
                          <p className="text-[12px]">Fotoğraf yok</p>
                        </div>
                      </div>
                      <label className="block">
                        <span className="text-[10.5px] text-[#8b97ac]">Fotoğraf yükle:</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                          className="block w-full text-[12px] text-[#51607a] file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-[12px] file:font-semibold file:bg-[#eef2fa] file:text-[#15356b] hover:file:bg-[#dfe7f6] mt-1"
                        />
                      </label>
                      {uploadingImage && (
                        <div className="text-[11px] text-[#51607a] flex items-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#15356b]"></div>
                          Yükleniyor...
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[10.5px] text-[#9aa6b8] mt-2 flex items-center gap-1.5">
                    <Upload width={12} height={12} stroke="currentColor" strokeWidth={2} />
                    Max 5MB, JPG, PNG, GIF, WebP
                  </p>
                </div>

                {/* ===== Vitrin Kontrolleri ===== */}
                <div className="text-[11px] font-semibold text-[#8b97ac] uppercase tracking-[.04em] mb-2">
                  Vitrin Kontrolleri
                </div>
                <div className="flex flex-col gap-2.5 mb-4">
                  {/* One cikar */}
                  <div className="flex items-center justify-between bg-[#fafbfd] border border-[#eef1f6] rounded-[9px] px-3 py-2.5">
                    <div className="pr-3">
                      <p className="text-[12.5px] font-medium text-[#14223b] flex items-center gap-1.5">
                        <Star width={13} height={13} stroke="#15356b" strokeWidth={2} />
                        Ana sayfada öne çıkar
                      </p>
                      <p className="text-[10.5px] text-[#8b97ac] mt-0.5">
                        &quot;Öne Çıkan&quot; bölümünde gösterilir
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!selectedProduct.isFeatured}
                      onClick={() => handleToggleFlag('isFeatured', !selectedProduct.isFeatured)}
                      className={`relative inline-flex h-[23px] w-10 shrink-0 items-center rounded-full transition-colors ${
                        selectedProduct.isFeatured ? 'bg-[#15356b]' : 'bg-[#d8e0ec]'
                      }`}
                    >
                      <span
                        className={`inline-block h-[17px] w-[17px] transform rounded-full bg-white transition-transform ${
                          selectedProduct.isFeatured ? 'translate-x-5' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* One cikan sira (featuredOrder) */}
                  {selectedProduct.isFeatured && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-[11px] text-[#51607a]">Sıra (küçük önce):</span>
                      <input
                        type="number"
                        value={featuredOrderInput}
                        onChange={(e) => setFeaturedOrderInput(e.target.value)}
                        className="w-20 h-[34px] text-center border border-[#e3e8f0] rounded-lg text-[12px] text-[#14223b] outline-none px-2"
                      />
                      <button
                        type="button"
                        onClick={handleSaveFeaturedOrder}
                        disabled={isSaving === 'featuredOrder'}
                        className="bg-[#15356b] text-white border-none rounded-lg px-3 h-[34px] text-[12px] font-semibold cursor-pointer hover:bg-[#1c4585] disabled:opacity-60"
                      >
                        {isSaving === 'featuredOrder' ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                    </div>
                  )}

                  {/* Indirime sokma (amber) */}
                  <div className="flex items-center justify-between bg-[#fffbeb] border border-[#fde68a] rounded-[9px] px-3 py-2.5">
                    <div className="pr-3">
                      <p className="text-[12.5px] font-medium text-[#92500a] flex items-center gap-1.5">
                        <Tag width={13} height={13} stroke="#b45309" strokeWidth={2} />
                        İndirime sokma
                      </p>
                      <p className="text-[10.5px] text-[#b45309] mt-0.5">
                        Fazla stok olsa bile indirimli gösterilmez (normal fiyat)
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!selectedProduct.excludeFromDiscount}
                      onClick={() =>
                        handleToggleFlag('excludeFromDiscount', !selectedProduct.excludeFromDiscount)
                      }
                      className={`relative inline-flex h-[23px] w-10 shrink-0 items-center rounded-full transition-colors ${
                        selectedProduct.excludeFromDiscount ? 'bg-[#d97706]' : 'bg-[#d8e0ec]'
                      }`}
                    >
                      <span
                        className={`inline-block h-[17px] w-[17px] transform rounded-full bg-white transition-transform ${
                          selectedProduct.excludeFromDiscount ? 'translate-x-5' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Not kutusu */}
                <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-[9px] p-3 mb-4 flex items-start gap-2">
                  <Info width={14} height={14} stroke="#15356b" strokeWidth={2} className="mt-0.5 flex-none" />
                  <p className="text-[11px] text-[#14223b] leading-relaxed">
                    Burada belirlediğiniz kâr marjı, kategori bazlı kâr marjını{' '}
                    <strong className="font-semibold">geçersiz kılar</strong>. Sadece bu ürün için özel
                    fiyatlandırma uygulanır.
                  </p>
                </div>

                {/* ===== Ozel Fiyat (Override Marji) ===== */}
                <div className="text-[11px] font-semibold text-[#8b97ac] uppercase tracking-[.04em] mb-2">
                  Özel Fiyat (Override Marjı)
                </div>
                <div className="flex flex-col gap-2.5">
                  {CUSTOMER_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className="bg-[#fafbfd] border border-[#eef1f6] rounded-[9px] p-3"
                    >
                      <label className="block text-[11px] font-semibold text-[#51607a] mb-2">
                        {type.label}
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            step="0.1"
                            value={overrideMargins[type.value]}
                            onChange={(e) =>
                              setOverrideMargins({ ...overrideMargins, [type.value]: e.target.value })
                            }
                            placeholder="Kâr marjı %"
                            className="w-full h-[34px] text-center font-semibold border border-[#e3e8f0] rounded-lg text-[12px] text-[#14223b] outline-none px-2"
                          />
                          <p className="text-[10px] text-[#9aa6b8] mt-1 text-center">Örnek: 15 = %15</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSetOverride(type.value)}
                          disabled={!overrideMargins[type.value] || isSaving === type.value}
                          className="flex items-center gap-1.5 self-start h-[34px] bg-[#047857] text-white border-none rounded-lg px-3 text-[12px] font-semibold cursor-pointer hover:bg-[#036247] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
                          {isSaving === type.value ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Secimi Temizle */}
                <div className="mt-4 pt-4 border-t border-[#eef1f6]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setOverrideMargins({ BAYI: '', PERAKENDE: '', VIP: '', OZEL: '' });
                    }}
                    className="w-full flex items-center justify-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg py-2.5 text-[12.5px] font-semibold text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                  >
                    <X width={14} height={14} stroke="currentColor" strokeWidth={2.2} />
                    Seçimi Temizle
                  </button>
                </div>
              </div>
            ) : (
              <div className={`${CARD} p-4`}>
                <div className="text-center py-12">
                  <Package
                    width={56}
                    height={56}
                    stroke="#d6e0f1"
                    strokeWidth={1.5}
                    className="mx-auto mb-4"
                  />
                  <p className="text-[#51607a] font-medium text-[13px] mb-2">Ürün Seçilmedi</p>
                  <p className="text-[12px] text-[#8b97ac]">Soldaki listeden bir ürün seçin</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
