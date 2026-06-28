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
import { CustomerCategorySidebar } from '@/components/customer/CustomerCategorySidebar';
import { CustomerCartSidebar } from '@/components/customer/CustomerCartSidebar';
import { ProductNameTooltip } from '@/components/customer/ProductNameTooltip';
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
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { ImageOff, Tag, X } from 'lucide-react';

const PAGE_SIZE = 60;
const CUSTOMER_PRODUCTS_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const CUSTOMER_PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';
const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

export default function DiscountedProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  // 1.2: Sunucudaki toplam urun sayisi (sadece ekrandaki degil).
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isStaticDataLoaded, setIsStaticDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const productsRequestRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
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
    return () => {
      const controller = productsRequestRef.current;
      productsRequestRef.current = null;
      controller?.abort();
    };
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
        productsRequestRef.current?.abort();
        const controller = new AbortController();
        productsRequestRef.current = controller;
        setIsSearching(true);
        try {
          const productsData = await customerApi.getProducts({
            categoryId: selectedCategory || undefined,
            categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
            search: debouncedSearch || undefined,
            warehouse: selectedWarehouse || undefined,
            mode: 'discounted',
            sort: 'bestsellerValue',
            limit: PAGE_SIZE,
            offset: nextOffset,
          }, { signal: controller.signal });

          const nextProducts = productsData.products;
          setProducts(nextProducts);
          setOffset(nextOffset + nextProducts.length);
          setHasMore(nextProducts.length === PAGE_SIZE);
          // 1.2: Toplam urun sayisini sunucudan al (warehouse filtresi varsa backend total gondermez).
          setTotalCount(typeof productsData.total === 'number' ? productsData.total : null);
        } catch (error) {
          if (!isCanceledRequest(error)) {
            console.error('Product fetch error:', error);
          }
        } finally {
          if (productsRequestRef.current === controller) {
            productsRequestRef.current = null;
            setIsSearching(false);
            setIsLoading(false);
          }
        }
        return;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const productsData = await customerApi.getProducts({
          categoryId: selectedCategory || undefined,
          categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
          search: debouncedSearch || undefined,
          warehouse: selectedWarehouse || undefined,
          mode: 'discounted',
          sort: 'bestsellerValue',
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        const nextProducts = productsData.products;
        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setOffset(nextOffset + nextProducts.length);
        setHasMore(nextProducts.length === PAGE_SIZE);
        // 1.2: Toplam urun sayisini sunucudan al (warehouse filtresi varsa backend total gondermez).
        if (typeof productsData.total === 'number') {
          setTotalCount(productsData.total);
        }
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
    [selectedCategory, selectedCategoryIds, debouncedSearch, selectedWarehouse]
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
      const maxQty = Math.max(getDisplayStock(product), Number(product.excessStock) || 0);
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
    <div className="min-h-screen bg-gray-50">
      <div className={CUSTOMER_PRODUCTS_CONTAINER_CLASS}>
        <div className="flex gap-4 2xl:gap-6">
          <CustomerCategorySidebar
            categories={categories}
            selectedCategoryId={selectedCategory}
            onSelect={setSelectedCategory}
            className="hidden w-64 flex-shrink-0 lg:block 2xl:w-72"
          />

          <div className="min-w-0 flex-1">
            <div className="card card-pad mb-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
                  <Tag className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h1 className="page-title">İndirimli Ürünler</h1>
                  <p className="page-subtitle">
                    Fazla stoktan tanımlanan avantajlı fiyatları inceleyip hızlı siparişe dönüştürün.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="chip">
                  {/* 1.2: Toplam urun sayisi varsa "Toplam N urunden ilk M" goster. */}
                  {totalCount !== null && totalCount > filteredProducts.length
                    ? `Toplam ${totalCount} üründen ilk ${filteredProducts.length}`
                    : `${filteredProducts.length} ürün`}
                </span>
                {activeFilterCount > 0 && (
                  <span className="chip">{activeFilterCount} aktif filtre</span>
                )}
              </div>
            </div>

            <div className="mb-4 lg:hidden">
              <CategoryMegaMenu
                categories={categories}
                selectedCategoryId={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>

            <Card className="card-pad mb-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Ürün Ara</label>
                  <Input
                    placeholder="Ürün adı veya kodu"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Depo</label>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Tüm Depolar</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse} value={warehouse}>
                        {warehouse}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(search || selectedWarehouse || selectedCategory) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                  <span className="text-xs font-medium text-gray-500">Aktif filtreler:</span>
                  {search && <span className="chip">Arama: {search}</span>}
                  {selectedWarehouse && <span className="chip">Depo: {selectedWarehouse}</span>}
                  {selectedCategory && (
                    <span className="chip">
                      Kategori: {categories.find((cat) => cat.id === selectedCategory)?.name}
                    </span>
                  )}
                  <button onClick={clearBaseFilters} className="btn-ghost ml-auto h-8 px-3 text-xs text-red-600 hover:bg-red-50">
                    <X className="h-3.5 w-3.5" />
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
                  title={search || selectedCategory || selectedWarehouse ? 'Ürün bulunamadı' : 'İndirimli ürün bulunamadı'}
                  description={
                    search || selectedCategory || selectedWarehouse
                      ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                      : 'Uygun fiyatlı fazla stok ürünleri olduğunda burada listelenecektir.'
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
                      Aranıyor…
                    </div>
                  </div>
                )}

                <div className={CUSTOMER_PRODUCTS_GRID_CLASS}>
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

                    const displayStock = Number(getDisplayStock(product));
                    const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);

                    return (
                      <Card key={product.id} className="group card-hover flex h-full flex-col overflow-hidden p-0">
                        {/* Gorsel */}
                        <button
                          onClick={() => openProductModal(product)}
                          className="relative block w-full aspect-square overflow-hidden bg-gray-50"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageOff className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
                            </div>
                          )}

                          {/* Stok rozeti */}
                          {displayStock > 0 ? (
                            <span className="absolute right-2 top-2 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-emerald-700 shadow-sm ring-1 ring-emerald-200 backdrop-blur">
                              Stok {displayStock} {product.unit}
                            </span>
                          ) : (
                            <span className="absolute right-2 top-2 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-amber-700 shadow-sm ring-1 ring-amber-200 backdrop-blur">
                              Tedarikle
                            </span>
                          )}

                          {/* Indirim yuzdesi serisi */}
                          {effectiveDiscountPercent ? (
                            <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-white shadow">
                              -%{effectiveDiscountPercent}
                            </span>
                          ) : null}

                          {/* Indirimli stok rozeti */}
                          <span className="absolute bottom-2 left-2 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white">
                            İndirimli · {excessStock} {product.unit}
                          </span>
                        </button>

                        {/* Bilgi */}
                        <div className="flex flex-1 flex-col gap-1 px-3 pb-1 pt-3">
                          <button
                            className="text-left text-sm font-semibold leading-snug text-gray-900 transition-colors hover:text-primary-600"
                            onClick={() => openProductModal(product)}
                          >
                            <ProductNameTooltip name={product.name} />
                          </button>

                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-gray-400">{product.mikroCode}</span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {product.category.name}
                            </span>
                          </div>

                          {unitLabel && <span className="text-[11px] text-gray-500">{unitLabel}</span>}

                          <span className="text-[10px] text-gray-400">KDV: %{vatPercent}</span>
                        </div>

                        {/* Fiyat tipi secimi */}
                        <div className="px-3 py-2">
                          {showPriceTypeSelector ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              {allowedPriceTypes.includes('INVOICED') && (
                                <button
                                  className={`rounded-lg border px-2 py-2 text-left transition-all ${
                                    selectedPriceType === 'INVOICED'
                                      ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                                  }`}
                                  onClick={() =>
                                    setQuickAddPriceTypes((prev) => ({
                                      ...prev,
                                      [product.id]: 'INVOICED',
                                    }))
                                  }
                                >
                                  <div className={`mb-0.5 text-[10px] font-medium ${selectedPriceType === 'INVOICED' ? 'opacity-80' : 'text-gray-500'}`}>
                                    Faturalı
                                  </div>
                                  <div className={`text-xs font-bold ${selectedPriceType === 'INVOICED' ? 'text-emerald-200' : 'text-emerald-600'}`}>
                                    {formatCurrency(displayInvoicedPrice)}
                                    {invoicedDiscountPercent && (
                                      <span className="ml-1 text-[10px]">-%{invoicedDiscountPercent}</span>
                                    )}
                                  </div>
                                  {displayBaseInvoiced !== undefined && (
                                    <div className={`text-[10px] line-through ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>
                                      {formatCurrency(displayBaseInvoiced)}
                                    </div>
                                  )}
                                  <div className={`mt-0.5 text-[10px] ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>
                                    {invoicedVatLabel}
                                  </div>
                                </button>
                              )}
                              {allowedPriceTypes.includes('WHITE') && (
                                <button
                                  className={`rounded-lg border px-2 py-2 text-left transition-all ${
                                    selectedPriceType === 'WHITE'
                                      ? 'border-gray-800 bg-gray-800 text-white shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                                  }`}
                                  onClick={() =>
                                    setQuickAddPriceTypes((prev) => ({
                                      ...prev,
                                      [product.id]: 'WHITE',
                                    }))
                                  }
                                >
                                  <div className={`mb-0.5 text-[10px] font-medium ${selectedPriceType === 'WHITE' ? 'opacity-80' : 'text-gray-500'}`}>
                                    Beyaz
                                  </div>
                                  <div className={`text-xs font-bold ${selectedPriceType === 'WHITE' ? 'text-emerald-200' : 'text-emerald-600'}`}>
                                    {formatCurrency(displayWhitePrice)}
                                    {whiteDiscountPercent && <span className="ml-1 text-[10px]">-%{whiteDiscountPercent}</span>}
                                  </div>
                                  {displayBaseWhite !== undefined && (
                                    <div className={`text-[10px] line-through ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>
                                      {formatCurrency(displayBaseWhite)}
                                    </div>
                                  )}
                                  <div className={`mt-0.5 text-[10px] ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>
                                    {getVatLabel('WHITE', vatDisplayPreference)}
                                  </div>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                              <div className="mb-0.5 text-[10px] font-medium text-gray-500">
                                {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                              </div>
                              <div className="text-sm font-bold text-emerald-600">
                                {formatCurrency(displaySelectedPrice)}
                                {selectedDiscountPercent && <span className="ml-1 text-[10px]">-%{selectedDiscountPercent}</span>}
                              </div>
                              {displaySelectedBasePrice !== undefined && (
                                <div className="text-[10px] text-gray-400 line-through">{formatCurrency(displaySelectedBasePrice)}</div>
                              )}
                              <div className="mt-0.5 text-[10px] text-gray-400">{selectedVatLabel}</div>
                            </div>
                          )}
                        </div>

                        {/* Indirim vurgusu - ne kadardan kaca dustu + avantaj */}
                        {displaySelectedBasePrice !== undefined && (
                          <div className="px-3 pb-1.5">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
                              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                                <span className="text-emerald-600/50 line-through">{formatCurrency(displaySelectedBasePrice)}</span>
                                <span className="text-emerald-400">→</span>
                                <span className="text-sm font-bold">{formatCurrency(displaySelectedPrice)}</span>
                              </span>
                              {selectedDiscountPercent && <span className="badge-success">%{selectedDiscountPercent} avantaj</span>}
                            </div>
                          </div>
                        )}

                        {/* Stok yetersiz - tedarik bilgisi (yanlis anlasilmasin: getirtilebilir ama gecikebilir) */}
                        {displayStock <= 0 && (
                          <div className="px-3 pb-1">
                            <div className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5">
                              <span className="text-[10px] leading-snug text-amber-700">
                                Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Miktar & Sepete Ekle */}
                        <div className="flex items-center gap-2 px-3 pb-3">
                          <input
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
                            className="h-9 w-14 rounded-lg border border-gray-200 bg-white text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <span className="w-8 flex-shrink-0 text-xs font-medium text-gray-500">{product.unit}</span>
                          <Button
                            size="sm"
                            className="btn-primary h-9 flex-1 text-xs"
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
                      Daha Fazla Ürün Yükle
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="hidden w-72 flex-shrink-0 xl:block 2xl:w-80">
            <CustomerCartSidebar items={cartItems} onRemoveItem={removeItem} onGoToCart={() => router.push('/cart')} />
          </aside>
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
