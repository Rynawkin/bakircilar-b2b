'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductDetailModal } from '@/components/customer/ProductDetailModal';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { CategoryMegaMenu } from '@/components/customer/CategoryMegaMenu';
import { CustomerCartSidebar } from '@/components/customer/CustomerCartSidebar';
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

export default function DiscountedProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isStaticDataLoaded, setIsStaticDataLoaded] = useState(false);
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
    ? user?.priceVisibility === 'WHITE_ONLY'
      ? 'WHITE_ONLY'
      : 'INVOICED_ONLY'
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => (type === 'INVOICED' ? 'invoiced' : 'white'));
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
      meta: { query: term, source: 'discounted-products' },
    });
  }, [debouncedSearch]);

  const loadStaticData = useCallback(async () => {
    try {
      const [categoriesData, warehousesData] = await Promise.all([customerApi.getCategories(), customerApi.getWarehouses()]);
      setCategories(categoriesData.categories);
      setWarehouses(warehousesData.warehouses);
    } catch (error) {
      console.error('Static data error:', error);
    } finally {
      setIsStaticDataLoaded(true);
    }
  }, []);

  const fetchProducts = useCallback(
    async (options?: { reset?: boolean; offset?: number }) => {
      const reset = options?.reset ?? false;
      const nextOffset = options?.offset ?? 0;

      if (reset) {
        setIsSearching(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const productsData = await customerApi.getProducts({
          categoryId: selectedCategory || undefined,
          search: debouncedSearch || undefined,
          warehouse: selectedWarehouse || undefined,
          mode: 'discounted',
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

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
    },
    [selectedCategory, debouncedSearch, selectedWarehouse]
  );

  useEffect(() => {
    if (!isStaticDataLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, debouncedSearch, selectedWarehouse, isStaticDataLoaded, fetchProducts]);

  const filteredProducts = useMemo(() => applyProductFilters(products, advancedFilters), [products, advancedFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (selectedWarehouse) count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    return count;
  }, [search, selectedCategory, selectedWarehouse, advancedFilters]);

  const clearBaseFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedWarehouse('');
  };

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
    const priceType = allowedPriceTypes.includes(requestedPriceType) ? requestedPriceType : defaultPriceType;

    setAddingToCart((prev) => ({ ...prev, [productId]: true }));

    try {
      const maxQty = getMaxOrderQuantity(product, 'EXCESS');
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
        priceMode: 'EXCESS',
      });

      setQuickAddQuantities((prev) => ({ ...prev, [productId]: 1 }));
      toast.success('Urun sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleModalAddToCart = async (
    productId: string,
    quantity: number,
    priceType: 'INVOICED' | 'WHITE',
    priceMode: 'LIST' | 'EXCESS' = 'EXCESS'
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

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <div className="container-custom py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            <div className="mb-6 rounded-2xl border border-primary-100 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-gray-900">Indirimli Urunler</h1>
              <p className="mt-1 text-sm text-gray-600">
                Fazla stoktan tanimlanan avantajli fiyatlari inceleyip hizli siparise donusturun.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-primary-50 px-3 py-1 font-semibold text-primary-700">
                  {filteredProducts.length} urun listeleniyor
                </span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
                    {activeFilterCount} aktif filtre
                  </span>
                )}
                {isSearching && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">Arama guncelleniyor</span>
                )}
              </div>
            </div>

            <div className="mb-6">
              <CategoryMegaMenu
                categories={categories}
                selectedCategoryId={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>

            <Card className="mb-6 border border-primary-100 p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">Urun Ara</label>
                  <Input
                    placeholder="Urun adi veya kodu"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">Depo</label>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Tum Depolar</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse} value={warehouse}>
                        {warehouse}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(search || selectedWarehouse || selectedCategory) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 text-xs">
                  <span className="font-semibold text-gray-600">Aktif filtreler:</span>
                  {search && <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700">Arama: {search}</span>}
                  {selectedWarehouse && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Depo: {selectedWarehouse}</span>
                  )}
                  {selectedCategory && (
                    <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">
                      Kategori: {categories.find((cat) => cat.id === selectedCategory)?.name}
                    </span>
                  )}
                  <button
                    onClick={clearBaseFilters}
                    className="ml-auto rounded-md border border-red-200 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50"
                  >
                    Filtreleri Temizle
                  </button>
                </div>
              )}
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
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={search || selectedCategory || selectedWarehouse ? 'search' : 'products'}
                  title={search || selectedCategory || selectedWarehouse ? 'Urun bulunamadi' : 'Indirimli urun bulunamadi'}
                  description={
                    search || selectedCategory || selectedWarehouse
                      ? 'Arama veya filtre kriterlerini degistirip tekrar deneyebilirsiniz.'
                      : 'Uygun fiyatli fazla stok urunleri oldugunda burada listelenecektir.'
                  }
                  actionLabel={search || selectedCategory || selectedWarehouse ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory || selectedWarehouse ? clearBaseFilters : undefined}
                />
              </Card>
            ) : (
              <div className="relative">
                {isSearching && (
                  <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-white/60 pt-4 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Araniyor...
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const selectedPriceType = allowedPriceTypes.includes(quickAddPriceTypes[product.id])
                      ? quickAddPriceTypes[product.id]
                      : defaultPriceType;
                    const baseInvoiced = product.listPrices?.invoiced ?? product.prices.invoiced;
                    const baseWhite = product.listPrices?.white ?? product.prices.white;
                    const discountInvoiced = resolveValidExcessPrice(
                      baseInvoiced,
                      product.excessPrices?.invoiced ?? product.prices.invoiced
                    );
                    const discountWhite = resolveValidExcessPrice(
                      baseWhite,
                      product.excessPrices?.white ?? product.prices.white
                    );
                    const selectedBasePrice = selectedPriceType === 'INVOICED' ? baseInvoiced : baseWhite;
                    const selectedDiscountPrice = selectedPriceType === 'INVOICED' ? discountInvoiced : discountWhite;
                    const selectedDiscountPercent =
                      selectedDiscountPrice !== undefined
                        ? getDiscountPercent(selectedBasePrice, selectedDiscountPrice)
                        : null;
                    const invoicedDiscountPercent =
                      discountInvoiced !== undefined ? getDiscountPercent(baseInvoiced, discountInvoiced) : null;
                    const whiteDiscountPercent =
                      discountWhite !== undefined ? getDiscountPercent(baseWhite, discountWhite) : null;
                    const displaySelectedPrice = getDisplayPrice(
                      selectedDiscountPrice ?? selectedBasePrice,
                      product.vatRate,
                      selectedPriceType,
                      vatDisplayPreference
                    );
                    const displaySelectedBasePrice =
                      selectedDiscountPrice !== undefined
                        ? getDisplayPrice(selectedBasePrice, product.vatRate, selectedPriceType, vatDisplayPreference)
                        : undefined;
                    const displayInvoicedPrice = getDisplayPrice(
                      discountInvoiced ?? baseInvoiced,
                      product.vatRate,
                      'INVOICED',
                      vatDisplayPreference
                    );
                    const displayWhitePrice = getDisplayPrice(
                      discountWhite ?? baseWhite,
                      product.vatRate,
                      'WHITE',
                      vatDisplayPreference
                    );
                    const displayBaseInvoiced =
                      discountInvoiced !== undefined
                        ? getDisplayPrice(baseInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
                        : undefined;
                    const displayBaseWhite =
                      discountWhite !== undefined
                        ? getDisplayPrice(baseWhite, product.vatRate, 'WHITE', vatDisplayPreference)
                        : undefined;
                    const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                    const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);
                    const excessStock = product.excessStock ?? getDisplayStock(product);
                    const effectiveDiscountPercent = selectedDiscountPercent ?? invoicedDiscountPercent ?? whiteDiscountPercent;

                    return (
                      <Card key={product.id} className="group overflow-hidden flex h-full flex-col rounded-xl border-2 border-gray-200 bg-white p-0">
                        <div className="flex h-full flex-col space-y-3">
                          <button
                            onClick={() => openProductModal(product)}
                            className="relative block w-full aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white"
                          >
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Gorsel yok</div>
                            )}
                            {effectiveDiscountPercent ? (
                              <div className="absolute left-2 top-2 rounded-md bg-green-600 px-2 py-1 text-[11px] font-semibold text-white shadow">
                                -%{effectiveDiscountPercent}
                              </div>
                            ) : null}
                            <div className="absolute bottom-2 right-2 rounded-md bg-orange-600 px-2 py-1 text-[11px] font-semibold text-white shadow">
                              Indirimli stok: {excessStock} {product.unit}
                            </div>
                          </button>

                          <div className="min-h-[60px] px-3">
                            <button
                              className="line-clamp-2 text-left text-sm font-semibold text-gray-900 hover:text-primary-700"
                              onClick={() => openProductModal(product)}
                            >
                              {product.name}
                            </button>
                            <div className="mt-1 text-xs text-gray-500">Kod: {product.mikroCode}</div>
                            <div className="mt-1 text-xs text-gray-500">Kategori: {product.category.name}</div>
                            {unitLabel && <div className="mt-1 text-xs text-gray-500">{unitLabel}</div>}
                            <div className="mt-1 text-[11px] font-medium text-green-700">Indirimli fiyat aktif</div>
                          </div>
                        </div>

                        <div className="flex-1" />

                        {showPriceTypeSelector ? (
                          <div className="grid grid-cols-2 gap-2 px-3">
                            {allowedPriceTypes.includes('INVOICED') && (
                              <button
                                className={`rounded-lg border-2 px-3 py-2 text-left text-xs font-semibold ${
                                  selectedPriceType === 'INVOICED'
                                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                                    : 'border-gray-200 text-gray-700 hover:border-primary-300'
                                }`}
                                onClick={() =>
                                  setQuickAddPriceTypes((prev) => ({
                                    ...prev,
                                    [product.id]: 'INVOICED',
                                  }))
                                }
                              >
                                <div>Faturali</div>
                                <div className="font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                                {displayBaseInvoiced !== undefined && (
                                  <div className="text-[10px] text-gray-500 line-through">{formatCurrency(displayBaseInvoiced)}</div>
                                )}
                                {invoicedDiscountPercent && (
                                  <div className="text-[10px] text-green-700">-%{invoicedDiscountPercent}</div>
                                )}
                                <div className="mt-1 text-[10px] opacity-70">{invoicedVatLabel}</div>
                              </button>
                            )}
                            {allowedPriceTypes.includes('WHITE') && (
                              <button
                                className={`rounded-lg border-2 px-3 py-2 text-left text-xs font-semibold ${
                                  selectedPriceType === 'WHITE'
                                    ? 'border-gray-700 bg-gray-100 text-gray-800'
                                    : 'border-gray-200 text-gray-700 hover:border-gray-400'
                                }`}
                                onClick={() =>
                                  setQuickAddPriceTypes((prev) => ({
                                    ...prev,
                                    [product.id]: 'WHITE',
                                  }))
                                }
                              >
                                <div>Beyaz</div>
                                <div className="font-bold">{formatCurrency(displayWhitePrice)}</div>
                                {displayBaseWhite !== undefined && (
                                  <div className="text-[10px] text-gray-500 line-through">{formatCurrency(displayBaseWhite)}</div>
                                )}
                                {whiteDiscountPercent && <div className="text-[10px] text-green-700">-%{whiteDiscountPercent}</div>}
                                <div className="mt-1 text-[10px] opacity-70">{getVatLabel('WHITE', vatDisplayPreference)}</div>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="px-3">
                            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                              <div>{selectedPriceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}</div>
                              <div className="font-bold">{formatCurrency(displaySelectedPrice)}</div>
                              {displaySelectedBasePrice !== undefined && (
                                <div className="text-[10px] text-gray-500 line-through">{formatCurrency(displaySelectedBasePrice)}</div>
                              )}
                              {selectedDiscountPercent && <div className="text-[10px] text-green-700">-%{selectedDiscountPercent}</div>}
                              <div className="mt-1 text-[10px] opacity-70">{selectedVatLabel}</div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 px-3 pb-3">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={quickAddQuantities[product.id] || 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              if (value === '' || parseInt(value, 10) === 0) return;
                              const numValue = Math.max(1, parseInt(value, 10));
                              setQuickAddQuantities((prev) => ({ ...prev, [product.id]: numValue }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || parseInt(e.target.value, 10) === 0) {
                                setQuickAddQuantities((prev) => ({ ...prev, [product.id]: 1 }));
                              }
                            }}
                            className="h-10 w-16 rounded-lg border-2 border-gray-200 px-2 text-center text-sm font-bold"
                          />
                          <span className="text-xs text-gray-500">{product.unit}</span>
                          <Button
                            size="sm"
                            className="h-10 flex-1 bg-green-600 text-xs font-semibold text-white hover:bg-green-700"
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
                    <Button className="px-6" onClick={handleLoadMore} isLoading={isLoadingMore}>
                      Daha Fazla Urun Yukle
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <CustomerCartSidebar items={cartItems} onRemoveItem={removeItem} onGoToCart={() => router.push('/cart')} />
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
