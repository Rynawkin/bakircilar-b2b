'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductDetailModal } from '@/components/customer/ProductDetailModal';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

const PAGE_SIZE = 60;

export default function AgreementProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => type === 'INVOICED' ? 'invoiced' : 'white');
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  useEffect(() => {
    setAdvancedFilters((prev) => {
      if (!allowedFilterPriceTypes.includes(prev.priceType)) {
        return { ...prev, priceType: defaultFilterPriceType };
      }
      return prev;
    });
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

  useEffect(() => {
    setQuickAddPriceTypes((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(next).forEach(([productId, priceType]) => {
        if (!allowedPriceTypes.includes(priceType)) {
          next[productId] = defaultPriceType;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    loadStaticData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      lastSearchRef.current = '';
      return;
    }
    if (term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { query: term, source: 'agreements' },
    });
  }, [debouncedSearch]);

  const loadStaticData = useCallback(async () => {
    try {
      const [categoriesData, warehousesData] = await Promise.all([
        customerApi.getCategories(),
        customerApi.getWarehouses(),
      ]);
      setCategories(categoriesData.categories);
      setWarehouses(warehousesData.warehouses);
    } catch (error) {
      console.error('Static data error:', error);
    }
  }, []);

  const fetchProducts = useCallback(async (options?: { reset?: boolean; offset?: number }) => {
    const reset = options?.reset ?? false;
    const nextOffset = options?.offset ?? 0;

    if (reset) {
      setIsSearching(true);
    } else {
      setIsLoadingMore(true);
    }
    try {
      const searchParams = {
        categoryId: selectedCategory || undefined,
        search: debouncedSearch || undefined,
        warehouse: selectedWarehouse || undefined,
        mode: 'agreements' as const,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };

      const productsData = await customerApi.getProducts(searchParams);
      const nextProducts = productsData.products;
      setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
      setOffset(nextOffset + nextProducts.length);
      setHasMore(nextProducts.length === PAGE_SIZE);
    } catch (error) {
      console.error('Product fetch error:', error);
    } finally {
      if (reset) {
        setIsSearching(false);
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [selectedCategory, debouncedSearch, selectedWarehouse]);

  useEffect(() => {
    if (categories.length > 0 && warehouses.length > 0) {
      setOffset(0);
      setHasMore(true);
      fetchProducts({ reset: true, offset: 0 });
    }
  }, [selectedCategory, debouncedSearch, selectedWarehouse, categories, warehouses, fetchProducts]);

  const filteredProducts = useMemo(() => {
    return applyProductFilters(products, advancedFilters);
  }, [products, advancedFilters]);

  const getDiscountPercent = (listPrice?: number, salePrice?: number) => {
    if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
    const discount = Math.round(((listPrice - salePrice) / listPrice) * 100);
    return discount > 0 ? discount : null;
  };

  const resolveValidExcessPrice = (basePrice?: number, excessPrice?: number) => {
    if (typeof basePrice !== 'number' || typeof excessPrice !== 'number') return undefined;
    if (!Number.isFinite(basePrice) || !Number.isFinite(excessPrice)) return undefined;
    if (excessPrice >= basePrice) return undefined;
    return excessPrice;
  };

  const handleQuickAdd = async (product: Product) => {
    const productId = product.id;
    const quantity = quickAddQuantities[productId] || 1;
    const requestedPriceType = quickAddPriceTypes[productId] || defaultPriceType;
    const priceType = allowedPriceTypes.includes(requestedPriceType)
      ? requestedPriceType
      : defaultPriceType;

    setAddingToCart({ ...addingToCart, [productId]: true });
    try {
      const maxQty = getMaxOrderQuantity(product, 'LIST');
      if (quantity > maxQty) {
        const confirmed = await confirmBackorder({
          requestedQty: quantity,
          availableQty: maxQty,
          unit: product.unit,
        });
        if (!confirmed) {
          return;
        }
      }
      await addToCart({
        productId,
        quantity,
        priceType,
        priceMode: 'LIST',
      });
      setQuickAddQuantities({ ...quickAddQuantities, [productId]: 1 });
      toast.success('Urun sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart({ ...addingToCart, [productId]: false });
    }
  };

  const handleModalAddToCart = async (
    productId: string,
    quantity: number,
    priceType: 'INVOICED' | 'WHITE',
    priceMode: 'LIST' | 'EXCESS' = 'LIST'
  ) => {
    try {
      const safePriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
      await addToCart({
        productId,
        quantity,
        priceType: safePriceType,
        priceMode,
      });
      toast.success('Urun sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
      throw error;
    }
  };

  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleLoadMore = () => {
    if (isSearching || isLoadingMore || !hasMore) return;
    fetchProducts({ offset, reset: false });
  };

  const invoicedTotal = (cartItems || [])
    .filter((item) => item.priceType === 'INVOICED')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const whiteTotal = (cartItems || [])
    .filter((item) => item.priceType === 'WHITE')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const totalItems = (cartItems || []).reduce((sum, item) => sum + item.quantity, 0);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <div className="container-custom py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Anlasmali Urunler</h1>
        <p className="text-sm text-gray-600">Sadece anlasma kapsamindaki urunleri goruntulersiniz.</p>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Urun Ara</label>
            <Input
              placeholder="Urun adi veya kodu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Depo</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="input w-full"
            >
              <option value="">Tum Depolar</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>{warehouse}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input w-full"
            >
              <option value="">Tum Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="mb-6">
        <AdvancedFilters
          onFilterChange={(filters) => setAdvancedFilters(filters)}
          onReset={() => setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType })}
          allowedPriceTypes={allowedFilterPriceTypes}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-sm text-gray-600">
            Anlasmali urun bulunamadi.
          </div>
        </Card>
      ) : (
        <div className="relative">
          {isSearching && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 rounded-lg flex items-start justify-center pt-4">
              <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="font-medium text-sm">Araniyor...</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                            const selectedPriceType = allowedPriceTypes.includes(quickAddPriceTypes[product.id])
                ? quickAddPriceTypes[product.id]
                : defaultPriceType;
              const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
              const hasAgreement = Boolean(product.agreement);
              const excessInvoiced = resolveValidExcessPrice(
                product.prices.invoiced,
                product.excessPrices?.invoiced
              );
              const excessWhite = resolveValidExcessPrice(
                product.prices.white,
                product.excessPrices?.white
              );
              const showExcessPricing =
                !hasAgreement &&
                product.excessStock > 0 &&
                (excessInvoiced !== undefined || excessWhite !== undefined);
              const selectedExcessPrice = showExcessPricing
                ? (selectedPriceType === 'INVOICED' ? excessInvoiced : excessWhite)
                : undefined;
                  const selectedExcessDiscount = showExcessPricing && selectedExcessPrice
                    ? getDiscountPercent(
                        selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white,
                        selectedExcessPrice
                      )
                    : null;
                  const displaySelectedPrice = getDisplayPrice(
                    selectedPrice,
                    product.vatRate,
                    selectedPriceType,
                    vatDisplayPreference
                  );
                  const displaySelectedExcessPrice = selectedExcessPrice !== undefined
                    ? getDisplayPrice(selectedExcessPrice, product.vatRate, selectedPriceType, vatDisplayPreference)
                    : undefined;
                  const displayInvoicedPrice = getDisplayPrice(
                    product.prices.invoiced,
                    product.vatRate,
                    'INVOICED',
                    vatDisplayPreference
                  );
                  const displayWhitePrice = getDisplayPrice(
                    product.prices.white,
                    product.vatRate,
                    'WHITE',
                    vatDisplayPreference
                  );
                  const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                  const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);
  return (
                <Card key={product.id} className="p-4 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-lg bg-white border border-gray-200 overflow-hidden flex-shrink-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Gorsel yok</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <button
                        className="text-left font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                        onClick={() => openProductModal(product)}
                      >
                        {product.name}
                      </button>
                      <div className="text-xs text-gray-500 font-mono mt-1">Kod: {product.mikroCode}</div>
                      <div className="text-xs text-gray-500 mt-1">Kategori: {product.category.name}</div>
                      {unitLabel && <div className="text-xs text-gray-400 mt-1">{unitLabel}</div>}
                      <div className="text-xs text-gray-500 mt-1">
                        Stok: {getDisplayStock(product)} {product.unit}
                      </div>
                      {product.agreement && (
                        <div className="mt-2 text-[11px] bg-blue-50 text-blue-800 inline-flex px-2 py-1 rounded">
                          Anlasma: min {product.agreement.minQuantity} {product.unit}
                        </div>
                      )}
                      {product.agreement?.customerProductCode && (
                        <div className="mt-1 text-[11px] text-blue-700">
                          Ozel urun kodu: {product.agreement.customerProductCode}
                        </div>
                      )}
                    </div>
                  </div>

                  {showPriceTypeSelector ? (
                    <div className="grid grid-cols-2 gap-2">
                      {allowedPriceTypes.includes('INVOICED') && (
                        <button
                          className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold ${selectedPriceType === 'INVOICED'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-700 hover:border-primary-300'}`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'INVOICED' })}
                        >
                          <div>Faturali</div>
                          <div className="font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                          <div className="text-[10px] opacity-70 mt-1">{invoicedVatLabel}</div>
                        </button>
                      )}
                      {allowedPriceTypes.includes('WHITE') && (
                        <button
                          className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold ${selectedPriceType === 'WHITE'
                            ? 'border-gray-700 bg-gray-100 text-gray-800'
                            : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'WHITE' })}
                        >
                          <div>Beyaz</div>
                          <div className="font-bold">{formatCurrency(displayWhitePrice)}</div>
                          <div className="text-[10px] opacity-70 mt-1">{getVatLabel('WHITE', vatDisplayPreference)}</div>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                      <div>{selectedPriceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}</div>
                      <div className="font-bold">{formatCurrency(displaySelectedPrice)}</div>
                      {showExcessPricing && displaySelectedExcessPrice !== undefined && (
                        <div className="text-[10px] text-green-700 font-semibold">
                          Fazla: {formatCurrency(displaySelectedExcessPrice)}
                          {selectedExcessDiscount && <span> (-%{selectedExcessDiscount})</span>}
                        </div>
                      )}
                      <div className="text-[10px] opacity-70 mt-1">{selectedVatLabel}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quickAddQuantities[product.id] || 1}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        if (value === '' || parseInt(value) === 0) return;
                        const numericValue = parseInt(value);
                        const numValue = Math.max(1, numericValue);
                        setQuickAddQuantities({ ...quickAddQuantities, [product.id]: numValue });
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseInt(e.target.value) === 0) {
                          setQuickAddQuantities({ ...quickAddQuantities, [product.id]: 1 });
                        }
                      }}
                      className="w-16 text-center font-bold text-sm h-10 px-2 border-2 border-gray-200 rounded-lg"
                    />
                    <span className="text-xs text-gray-500">{product.unit}</span>
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs h-10"
                      onClick={() => handleQuickAdd(product)}
                      isLoading={addingToCart[product.id]}
                    >
                      Sepete Ekle
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                className="px-6"
                onClick={handleLoadMore}
                isLoading={isLoadingMore}
              >
                Daha fazla yukle
              </Button>
            </div>
          )}
        </div>
      )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-24 shadow-2xl bg-gradient-to-br from-white via-gray-50 to-white border-2 border-primary-100 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col lg:overflow-hidden">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-100">
                <h3 className="font-bold text-xl text-gray-900">Sepet Ozeti</h3>
                {totalItems > 0 && (
                  <span className="bg-gradient-to-br from-primary-600 to-primary-700 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-md animate-pulse">
                    {totalItems} Urun
                  </span>
                )}
              </div>

              {!cartItems || cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-300 mb-3">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Sepetiniz bos</p>
                  <p className="text-xs text-gray-400 mt-1">Urun ekleyerek baslayin</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 min-h-0 lg:flex-1">
                  <button
                    onClick={async () => {
                      const confirmed = await new Promise((resolve) => {
                        toast((t) => (
                          <div className="flex flex-col gap-3">
                            <p className="font-medium">Tum urunleri sepetten cikarmak istediginizden emin misiniz?</p>
                            <div className="flex gap-2 justify-end">
                              <button
                                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                onClick={() => { toast.dismiss(t.id); resolve(false); }}
                              >
                                Iptal
                              </button>
                              <button
                                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                onClick={() => { toast.dismiss(t.id); resolve(true); }}
                              >
                                Sepeti Temizle
                              </button>
                            </div>
                          </div>
                        ), { duration: Infinity });
                      });

                      if (confirmed) {
                        for (const item of cartItems) {
                          await removeItem(item.id);
                        }
                        toast.success('Sepet temizlendi');
                      }
                    }}
                    className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50 py-2 rounded transition-colors"
                  >
                    Sepeti Temizle
                  </button>

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-2 min-h-0 lg:max-h-none lg:flex-1">
                    {(cartItems || []).map((item) => (
                      <div key={item.id} className="text-sm bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-semibold text-gray-900 flex-1">{item.product.name}</div>
                          <button
                            onClick={async () => {
                              const confirmed = await new Promise((resolve) => {
                                toast((t) => (
                                  <div className="flex flex-col gap-3">
                                    <p className="font-medium">Bu urunu sepetten cikarmak istediginizden emin misiniz?</p>
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                        onClick={() => { toast.dismiss(t.id); resolve(false); }}
                                      >
                                        Iptal
                                      </button>
                                      <button
                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                        onClick={() => { toast.dismiss(t.id); resolve(true); }}
                                      >
                                        Sil
                                      </button>
                                    </div>
                                  </div>
                                ), { duration: Infinity });
                              });

                              if (confirmed) {
                                await removeItem(item.id);
                                toast.success('Urun sepetten cikarildi');
                              }
                            }}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                          <span className={`px-2 py-1 rounded font-medium ${
                            item.priceType === 'INVOICED'
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-200 text-gray-800'
                          }`}>
                            {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                          </span>
                        </div>
                        <div className="text-right mt-1 font-bold text-primary-700">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t-2 border-gray-200 pt-4 space-y-3">
                    {invoicedTotal > 0 && (
                      <div className="flex justify-between text-sm bg-primary-50 px-3 py-2 rounded-lg">
                        <span className="text-primary-800 font-medium">Faturali Toplam:</span>
                        <span className="font-bold text-primary-700">{formatCurrency(invoicedTotal)}</span>
                      </div>
                    )}
                    {whiteTotal > 0 && (
                      <div className="flex justify-between text-sm bg-gray-100 px-3 py-2 rounded-lg">
                        <span className="text-gray-800 font-medium">Beyaz Toplam:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(whiteTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-3 rounded-lg shadow-lg">
                      <span>Genel Toplam:</span>
                      <span>{formatCurrency(invoicedTotal + whiteTotal)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 shadow-lg"
                    onClick={() => router.push('/cart')}
                  >
                    Sepete Git ({totalItems} Urun)
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToCart={handleModalAddToCart}
        allowedPriceTypes={allowedPriceTypes}
        vatDisplayPreference={vatDisplayPreference}
      />
    </div>
  );
}
