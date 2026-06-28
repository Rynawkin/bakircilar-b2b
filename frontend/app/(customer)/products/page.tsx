'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { CategoryMegaMenu } from '@/components/customer/CategoryMegaMenu';
import { CustomerCategorySidebar } from '@/components/customer/CustomerCategorySidebar';
import { CustomerCartSidebar } from '@/components/customer/CustomerCartSidebar';
import { ProductNameTooltip } from '@/components/customer/ProductNameTooltip';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { Package, X } from 'lucide-react';

const PRODUCTS_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';
const PAGE_SIZE = 60;

const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

export default function ProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];
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

  const [products, setProducts] = useState<Product[]>([]);
  // 1.2: Sunucudaki toplam urun sayisi (sadece ekrandaki degil).
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const productsRequestRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });

  useEffect(() => {
    setAdvancedFilters((prev) => {
      if (!allowedFilterPriceTypes.includes(prev.priceType)) {
        return { ...prev, priceType: defaultFilterPriceType };
      }
      return prev;
    });
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

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
      meta: { query: term, source: 'products' },
    });
  }, [debouncedSearch]);

  // Quick add states
  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

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

  // Apply advanced filters to products
  const filteredProducts = useMemo(() => {
    return applyProductFilters(products, advancedFilters);
  }, [products, advancedFilters]);

  // Load static data (categories) only once on mount
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

  const loadStaticData = useCallback(async () => {
    try {
      const categoriesData = await customerApi.getCategories();
      setCategories(categoriesData.categories);
    } catch (error) {
      console.error('Statik veri yükleme hatası:', error);
    }
  }, []);

  const fetchProducts = useCallback(async (options?: { reset?: boolean; offset?: number }) => {
    const reset = options?.reset ?? false;
    const nextOffset = options?.offset ?? 0;
    productsRequestRef.current?.abort();
    const controller = new AbortController();
    productsRequestRef.current = controller;

    if (reset) {
      setIsSearching(true);
    } else {
      setIsLoadingMore(true);
    }
    try {
      const searchParams = {
        categoryId: selectedCategory || undefined,
        categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
        search: debouncedSearch || undefined,
        mode: 'all' as const,
        sort: 'bestsellerValue' as const,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };

      const productsData = await customerApi.getProducts(searchParams, { signal: controller.signal });
      const nextProducts = productsData.products;
      setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
      setOffset(nextOffset + nextProducts.length);
      setHasMore(nextProducts.length === PAGE_SIZE);
      // 1.2: Toplam urun sayisini sunucudan al (mevcut ise).
      if (typeof productsData.total === 'number') {
        setTotalCount(productsData.total);
      }
    } catch (error) {
      if (isCanceledRequest(error)) return;
      console.error('Ürün yükleme hatası:', error);
    } finally {
      if (productsRequestRef.current === controller) {
        productsRequestRef.current = null;
        if (reset) {
          setIsSearching(false);
          setIsInitialLoad(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    }
  }, [selectedCategory, selectedCategoryIds, debouncedSearch]);

  // Load products whenever filters change
  useEffect(() => {
    if (categories.length > 0) {
      setOffset(0);
      setHasMore(true);
      fetchProducts({ reset: true, offset: 0 });
    }
  }, [selectedCategory, debouncedSearch, categories, fetchProducts]);

  const handleLoadMore = () => {
    if (isSearching || isLoadingMore || !hasMore) return;
    fetchProducts({ reset: false, offset });
  };

  const handleQuickAdd = async (product: Product) => {
    const productId = product.id;
    const quantity = quickAddQuantities[productId] || 1;
    const requestedPriceType = quickAddPriceTypes[productId] || defaultPriceType;
    const priceType = allowedPriceTypes.includes(requestedPriceType)
      ? requestedPriceType
      : defaultPriceType;
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
    const hasSelectedExcessPrice = showExcessPricing
      ? (priceType === 'INVOICED' ? excessInvoiced !== undefined : excessWhite !== undefined)
      : false;
    const effectivePriceMode: 'LIST' | 'EXCESS' = hasSelectedExcessPrice ? 'EXCESS' : 'LIST';

    setAddingToCart({ ...addingToCart, [productId]: true });

    try {
      const maxQty = effectivePriceMode === 'EXCESS'
        ? Math.max(getMaxOrderQuantity(product, 'LIST'), Number(product.excessStock) || 0)
        : getMaxOrderQuantity(product, 'LIST');
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
        priceMode: effectivePriceMode,
      });

      // Reset quantity after adding
      setQuickAddQuantities({ ...quickAddQuantities, [productId]: 1 });

      toast.success('Ürün sepete eklendi', {
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Cart error:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart({ ...addingToCart, [productId]: false });
    }
  };

  // Aktif temel filtre sayisi (arama + kategori) — basliktaki rozet icin.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    return count;
  }, [search, selectedCategory, advancedFilters]);

  const clearBaseFilters = () => {
    setSearch('');
    setSelectedCategory('');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={PRODUCTS_PAGE_CONTAINER_CLASS}>
        <div className="flex gap-4 2xl:gap-6">

          {/* ── SOL: Kategori kenar cubugu ─────────────────────────── */}
          <CustomerCategorySidebar
            categories={categories}
            selectedCategoryId={selectedCategory}
            onSelect={setSelectedCategory}
            className="hidden w-64 flex-shrink-0 lg:block 2xl:w-72"
          />

          {/* ── ORTA: Urunler ──────────────────────────────────────── */}
          <div className="min-w-0 flex-1">

            {/* Baslik */}
            <div className="card card-pad mb-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <Package className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h1 className="page-title">Tüm Ürünler</h1>
                  <p className="page-subtitle">
                    Tüm ürün kataloğunu inceleyin, fiyatları görüntüleyip hızlıca sepete ekleyin.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="chip">
                  {/* 1.2: Toplam urun sayisi varsa "Toplam N urunden ilk M" goster. */}
                  {!isInitialLoad && totalCount !== null && totalCount > filteredProducts.length
                    ? `Toplam ${totalCount} üründen ilk ${filteredProducts.length}`
                    : `${filteredProducts.length} ürün`}
                </span>
                {activeFilterCount > 0 && (
                  <span className="chip">{activeFilterCount} aktif filtre</span>
                )}
              </div>
            </div>

            {/* Mobil kategori seridi */}
            <div className="mb-4 lg:hidden">
              <CategoryMegaMenu
                categories={categories}
                selectedCategoryId={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>

            {/* Arama */}
            <Card className="card-pad mb-6">
              <div>
                <label className="field-label">Ürün Ara</label>
                <Input
                  placeholder="Ürün adı veya kodu"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                />
              </div>

              {(search || selectedCategory) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                  <span className="text-xs font-medium text-gray-500">Aktif filtreler:</span>
                  {search && <span className="chip">Arama: {search}</span>}
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

            {/* Gelismis filtreler */}
            <div className="mb-6">
              <AdvancedFilters
                onFilterChange={(filters) => setAdvancedFilters(filters)}
                onReset={() => {
                  setAdvancedFilters({
                    sortBy: 'none',
                    priceType: defaultFilterPriceType,
                  });
                }}
                allowedPriceTypes={allowedFilterPriceTypes}
              />
            </div>

            {/* Urun listesi */}
            {isInitialLoad ? (
              <div className={PRODUCTS_GRID_CLASS}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={search || selectedCategory ? 'search' : 'products'}
                  title={search || selectedCategory ? 'Ürün bulunamadı' : 'Henüz ürün yok'}
                  description={
                    search || selectedCategory
                      ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                      : 'Ürünler senkronize edildiğinde burada listelenecektir.'
                  }
                  actionLabel={search || selectedCategory ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory ? clearBaseFilters : undefined}
                />
              </Card>
            ) : (
              <div className="relative">
                {/* Arama overlay */}
                {isSearching && (
                  <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-white/60 pt-4 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Aranıyor…
                    </div>
                  </div>
                )}

                <div className={PRODUCTS_GRID_CLASS}>
                  {filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
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
                    const displayExcessInvoiced = excessInvoiced !== undefined
                      ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
                      : undefined;
                    const displayExcessWhite = excessWhite !== undefined
                      ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
                      : undefined;
                    const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                    const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);

                    return (
                      <div
                        key={product.id}
                        className="group bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col hover:border-primary-300 hover:shadow-md transition-all duration-200"
                      >
                        {/* Image */}
                        <Link
                          href={`/products/${product.id}`}
                          className="relative block bg-gray-50 aspect-square overflow-hidden"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}

                          {/* Stock badge */}
                          {Number(getDisplayStock(product)) > 0 ? (
                            <span className="absolute top-2 right-2 bg-white/95 backdrop-blur text-emerald-700 ring-1 ring-emerald-200 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight shadow-sm">
                              Stok {getDisplayStock(product)} {product.unit}
                            </span>
                          ) : (
                            <span className="absolute top-2 right-2 bg-white/95 backdrop-blur text-amber-700 ring-1 ring-amber-200 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight shadow-sm">
                              Tedarikle
                            </span>
                          )}

                          {/* Excess stock badge */}
                          {product.excessStock > 0 && (
                            <span className="absolute bottom-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                              İndirimli · {product.excessStock} {product.unit}
                            </span>
                          )}

                        </Link>

                        {/* Info */}
                        <div className="px-3 pt-3 pb-1 flex-1 flex flex-col gap-1">
                          <Link
                            href={`/products/${product.id}`}
                            className="text-sm font-semibold text-gray-900 leading-snug hover:text-primary-600 transition-colors"
                          >
                            <ProductNameTooltip name={product.name} />
                          </Link>

                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-gray-400 font-mono">{product.mikroCode}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{product.category.name}</span>
                          </div>

                          {unitLabel && (
                            <span className="text-[11px] text-gray-500">{unitLabel}</span>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">KDV: %{vatPercent}</span>
                            {hasAgreement && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                                Anlaşma: min {product.agreement?.minQuantity ?? 1} {product.unit}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price Type Selector */}
                        <div className="px-3 py-2">
                          {showPriceTypeSelector ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              {allowedPriceTypes.includes('INVOICED') && (
                                <button
                                  onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'INVOICED' })}
                                  className={`rounded-lg px-2 py-2 text-left transition-all border ${
                                    selectedPriceType === 'INVOICED'
                                      ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                                      : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                                  }`}
                                >
                                  <div className={`text-[10px] font-medium mb-0.5 ${selectedPriceType === 'INVOICED' ? 'opacity-80' : 'text-gray-500'}`}>Faturalı</div>
                                  {showExcessPricing && displayExcessInvoiced !== undefined ? (
                                    <>
                                      <div className={`text-xs font-bold ${selectedPriceType === 'INVOICED' ? 'text-green-200' : 'text-green-600'}`}>
                                        {formatCurrency(displayExcessInvoiced)}
                                        {getDiscountPercent(product.prices.invoiced, excessInvoiced) && (
                                          <span className="ml-1 text-[10px]">-%{getDiscountPercent(product.prices.invoiced, excessInvoiced)}</span>
                                        )}
                                      </div>
                                      <div className={`text-[10px] line-through ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>
                                        {formatCurrency(displayInvoicedPrice)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                                  )}
                                  <div className={`text-[10px] mt-0.5 ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>{invoicedVatLabel}</div>
                                </button>
                              )}
                              {allowedPriceTypes.includes('WHITE') && (
                                <button
                                  onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'WHITE' })}
                                  className={`rounded-lg px-2 py-2 text-left transition-all border ${
                                    selectedPriceType === 'WHITE'
                                      ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className={`text-[10px] font-medium mb-0.5 ${selectedPriceType === 'WHITE' ? 'opacity-80' : 'text-gray-500'}`}>Beyaz</div>
                                  {showExcessPricing && displayExcessWhite !== undefined ? (
                                    <>
                                      <div className={`text-xs font-bold ${selectedPriceType === 'WHITE' ? 'text-green-200' : 'text-green-600'}`}>
                                        {formatCurrency(displayExcessWhite)}
                                        {getDiscountPercent(product.prices.white, excessWhite) && (
                                          <span className="ml-1 text-[10px]">-%{getDiscountPercent(product.prices.white, excessWhite)}</span>
                                        )}
                                      </div>
                                      <div className={`text-[10px] line-through ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>
                                        {formatCurrency(displayWhitePrice)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-bold">{formatCurrency(displayWhitePrice)}</div>
                                  )}
                                  <div className={`text-[10px] mt-0.5 ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>{getVatLabel('WHITE', vatDisplayPreference)}</div>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                              <div className="text-[10px] text-gray-500 font-medium mb-0.5">
                                {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                              </div>
                              {showExcessPricing && displaySelectedExcessPrice !== undefined ? (
                                <>
                                  <div className="text-xs font-bold text-green-600">
                                    {formatCurrency(displaySelectedExcessPrice)}
                                    {selectedExcessDiscount && <span className="ml-1">-%{selectedExcessDiscount}</span>}
                                  </div>
                                  <div className="text-[10px] text-gray-400 line-through">{formatCurrency(displaySelectedPrice)}</div>
                                </>
                              ) : (
                                <div className="text-sm font-bold text-gray-900">{formatCurrency(displaySelectedPrice)}</div>
                              )}
                              <div className="text-[10px] text-gray-400 mt-0.5">{selectedVatLabel}</div>
                            </div>
                          )}
                        </div>

                        {/* Indirim vurgusu - ne kadardan kaca dustu + avantaj */}
                        {showExcessPricing && displaySelectedExcessPrice !== undefined && (
                          <div className="px-3 pb-1.5">
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
                              <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1.5">
                                <span className="line-through text-emerald-600/50">{formatCurrency(displaySelectedPrice)}</span>
                                <span className="text-emerald-400">→</span>
                                <span className="text-sm font-bold">{formatCurrency(displaySelectedExcessPrice)}</span>
                              </span>
                              {selectedExcessDiscount && (
                                <span className="badge-success">%{selectedExcessDiscount} avantaj</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Stok yetersiz - tedarik bilgisi (yanlis anlasilmasin: getirtilebilir ama gecikebilir) */}
                        {Number(getDisplayStock(product)) <= 0 && (
                          <div className="px-3 pb-1">
                            <div className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5">
                              <span className="text-[10px] leading-snug text-amber-700">Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.</span>
                            </div>
                          </div>
                        )}

                        {/* Quantity & Add to Cart */}
                        <div className="px-3 pb-3 flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={quickAddQuantities[product.id] || 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              if (value === '' || parseInt(value) === 0) return;
                              const numValue = Math.max(1, parseInt(value));
                              setQuickAddQuantities({ ...quickAddQuantities, [product.id]: numValue });
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || parseInt(e.target.value) === 0) {
                                setQuickAddQuantities({ ...quickAddQuantities, [product.id]: 1 });
                              }
                            }}
                            className="w-14 text-center font-semibold text-sm h-9 border border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                          />
                          <span className="text-xs text-gray-500 font-medium w-8 flex-shrink-0">{product.unit}</span>
                          <Button
                            size="sm"
                            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs h-9 rounded-lg transition-colors"
                            onClick={() => handleQuickAdd(product)}
                            isLoading={addingToCart[product.id]}
                          >
                            Sepete Ekle
                          </Button>
                        </div>
                      </div>
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

          {/* ── SAG: Sepet ozeti ───────────────────────────────────── */}
          <aside className="hidden w-72 flex-shrink-0 xl:block 2xl:w-80">
            <CustomerCartSidebar items={cartItems} onRemoveItem={removeItem} onGoToCart={() => router.push('/cart')} />
          </aside>

        </div>
      </div>
    </div>
  );
}
