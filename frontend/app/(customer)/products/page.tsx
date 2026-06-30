'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { ChevronRight, ChevronDown, Search, ArrowDownUp, X, SlidersHorizontal, Warehouse } from 'lucide-react';

const PRODUCTS_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';
const PAGE_SIZE = 60;

const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

type FallbackSuggestion = {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const { user, loadUserFromStorage } = useAuthStore();
  const { fetchCart, addToCart } = useCartStore();

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => (type === 'INVOICED' ? 'invoiced' : 'white'));
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState<string>('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [fallbackSuggestions, setFallbackSuggestions] = useState<FallbackSuggestion[]>([]);
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const fallbackRequestRef = useRef<AbortController | null>(null);
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

  // URL parametreleri degisince kategori/aramayi senkronize et — header kategori
  // linkleri ([/products?categoryId=...]) ayni sayfadayken de calissin + filtre sifirlansin:
  // kategoriye gidince arama, aramaya gidince kategori temizlenir.
  useEffect(() => {
    setSelectedCategory(searchParams?.get('categoryId') || '');
    setSearch(searchParams?.get('search') || '');
  }, [searchParams]);

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

  const filteredProducts = useMemo(() => applyProductFilters(products, advancedFilters), [products, advancedFilters]);

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
      const [categoriesData, warehousesData] = await Promise.all([
        customerApi.getCategories(),
        customerApi.getWarehouses().catch(() => ({ warehouses: [] as string[] })),
      ]);
      setCategories(categoriesData.categories);
      setWarehouses(warehousesData.warehouses || []);
    } catch (error) {
      console.error('Statik veri yükleme hatası:', error);
    }
  }, []);

  const fetchProducts = useCallback(
    async (options?: { reset?: boolean; offset?: number }) => {
      const reset = options?.reset ?? false;
      const nextOffset = options?.offset ?? 0;
      productsRequestRef.current?.abort();
      const controller = new AbortController();
      productsRequestRef.current = controller;

      if (reset) setIsSearching(true);
      else setIsLoadingMore(true);
      try {
        const searchParamsObj = {
          categoryId: selectedCategory || undefined,
          categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
          search: debouncedSearch || undefined,
          warehouse: warehouse || undefined,
          mode: 'all' as const,
          sort: 'bestsellerValue' as const,
          limit: PAGE_SIZE,
          offset: nextOffset,
        };

        const productsData = await customerApi.getProducts(searchParamsObj, { signal: controller.signal });
        const nextProducts = productsData.products;
        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setOffset(nextOffset + nextProducts.length);
        setHasMore(nextProducts.length === PAGE_SIZE);
        if (typeof productsData.total === 'number') setTotalCount(productsData.total);
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
    },
    [selectedCategory, selectedCategoryIds, debouncedSearch, warehouse]
  );

  useEffect(() => {
    if (categories.length > 0) {
      setOffset(0);
      setHasMore(true);
      fetchProducts({ reset: true, offset: 0 });
    }
  }, [selectedCategory, debouncedSearch, warehouse, categories, fetchProducts]);

  const handleLoadMore = () => {
    if (isSearching || isLoadingMore || !hasMore) return;
    fetchProducts({ reset: false, offset });
  };

  // 0-sonuc kurtarma: arama var ama urun yoksa (yukleme bitti) "benzer urunler" cek.
  // Arama degisince oneriyi sifirla; urun bulununca gosterme. SearchMiss backend'de kaydedilir.
  useEffect(() => {
    const term = debouncedSearch.trim();
    const noResults = !isInitialLoad && !isSearching && filteredProducts.length === 0;

    if (!term || !noResults) {
      fallbackRequestRef.current?.abort();
      fallbackRequestRef.current = null;
      setFallbackSuggestions([]);
      return;
    }

    fallbackRequestRef.current?.abort();
    const controller = new AbortController();
    fallbackRequestRef.current = controller;

    customerApi
      .searchFallback(term, selectedCategory || undefined)
      .then((data) => {
        if (fallbackRequestRef.current !== controller) return;
        setFallbackSuggestions(data.suggestions || []);
      })
      .catch((error) => {
        if (isCanceledRequest(error)) return;
        if (fallbackRequestRef.current === controller) setFallbackSuggestions([]);
      })
      .finally(() => {
        if (fallbackRequestRef.current === controller) fallbackRequestRef.current = null;
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, isInitialLoad, isSearching, filteredProducts.length, selectedCategory]);

  useEffect(() => {
    return () => {
      fallbackRequestRef.current?.abort();
      fallbackRequestRef.current = null;
    };
  }, []);

  const handleAdd = useCallback(
    async (args: ProductCardAddArgs) => {
      await addToCart(args);
    },
    [addToCart]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (warehouse) count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    return count;
  }, [search, selectedCategory, warehouse, advancedFilters]);

  const clearAllFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setWarehouse('');
    setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType });
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-0)]">
      <div className={PRODUCTS_PAGE_CONTAINER_CLASS}>
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Tüm Ürünler</span>
        </div>

        {/* Baslik + fiyat turu */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">Tüm Ürünler</h1>
            <p className="mt-1 text-[13px] text-[var(--ink-3)]">
              {!isInitialLoad && totalCount !== null && totalCount > filteredProducts.length
                ? `Tüm katalog · ${totalCount} ürün`
                : `Tüm katalog · ${filteredProducts.length} sonuç`}
            </p>
          </div>
          {showPriceTypeSelector && (
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-[var(--ink-3)]">Fiyat türü</span>
              <div className="inline-flex rounded-lg bg-[var(--surface-0)] p-0.5 ring-1 ring-inset ring-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setAdvancedFilters((prev) => ({ ...prev, priceType: 'invoiced' }))}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    advancedFilters.priceType === 'invoiced' ? 'bg-white text-primary-600 shadow-sm ring-1 ring-[var(--line-strong)]' : 'text-[var(--ink-2)]'
                  }`}
                >
                  Faturalı
                </button>
                <button
                  type="button"
                  onClick={() => setAdvancedFilters((prev) => ({ ...prev, priceType: 'white' }))}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    advancedFilters.priceType === 'white' ? 'bg-white text-[var(--ink-1)] shadow-sm ring-1 ring-[var(--line-strong)]' : 'text-[var(--ink-2)]'
                  }`}
                >
                  Beyaz
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filtre / siralama bari */}
        <div className="card sticky top-[112px] z-20 mb-6 px-3 py-3 sm:px-4">
          {/* Mobil: filtreleri ac/kapa (varsayilan kapali -> urunler hemen gorunur, filtre ekrani kaplamaz) */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 text-[var(--ink-1)] lg:hidden"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[var(--ink-3)]" />
              <span className="text-[12.5px] font-semibold">Filtrele</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 text-[var(--ink-3)] transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className={`${mobileFiltersOpen ? 'mt-3 flex flex-col gap-3' : 'hidden'} lg:mt-0 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-3`}>
            <div className="hidden items-center gap-2 text-[var(--ink-1)] lg:flex">
              <SlidersHorizontal className="h-4 w-4 text-[var(--ink-3)]" />
              <span className="text-[12.5px] font-semibold">Filtrele</span>
            </div>
            <span className="hidden h-6 w-px bg-[var(--line)] lg:block" />

            {/* Siralama */}
            <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5">
              <ArrowDownUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              <select
                value={advancedFilters.sortBy}
                onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, sortBy: e.target.value as FilterState['sortBy'] }))}
                className="w-full min-w-0 cursor-pointer truncate border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none lg:w-auto"
              >
                <option value="none">Önerilen</option>
                <option value="name-asc">İsim (A-Z)</option>
                <option value="name-desc">İsim (Z-A)</option>
                <option value="price-asc">Fiyat (artan)</option>
                <option value="price-desc">Fiyat (azalan)</option>
                <option value="stock-asc">Stok (azdan çoğa)</option>
                <option value="stock-desc">Stok (çoktan aza)</option>
              </select>
            </label>

            {/* Depo */}
            <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5">
              <Warehouse className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full min-w-0 cursor-pointer truncate border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none lg:w-auto"
              >
                <option value="">Tüm Depolar</option>
                {warehouses.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>

            {/* Fiyat araligi */}
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[12px] text-[var(--ink-3)]">Fiyat</span>
              <Input
                type="number"
                placeholder="Min"
                value={advancedFilters.minPrice ?? ''}
                onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, minPrice: e.target.value ? Number(e.target.value) : undefined }))}
                className="h-9 w-full min-w-0 lg:w-20"
              />
              <span className="text-gray-300">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={advancedFilters.maxPrice ?? ''}
                onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, maxPrice: e.target.value ? Number(e.target.value) : undefined }))}
                className="h-9 w-full min-w-0 lg:w-20"
              />
            </div>

            {/* Stok araligi */}
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[12px] text-[var(--ink-3)]">Stok</span>
              <Input
                type="number"
                placeholder="Min"
                value={advancedFilters.minStock ?? ''}
                onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, minStock: e.target.value ? Number(e.target.value) : undefined }))}
                className="h-9 w-full min-w-0 lg:w-20"
              />
              <span className="text-gray-300">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={advancedFilters.maxStock ?? ''}
                onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, maxStock: e.target.value ? Number(e.target.value) : undefined }))}
                className="h-9 w-full min-w-0 lg:w-20"
              />
            </div>

            {/* Listede ara */}
            <div className="relative lg:ml-auto lg:min-w-[210px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                placeholder="Listede ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full pl-9"
              />
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
                Temizle
              </button>
            )}
          </div>

          {(search || selectedCategory || warehouse) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
              <span className="text-xs font-medium text-[var(--ink-3)]">Aktif:</span>
              {search && <span className="chip max-w-full truncate">Arama: {search}</span>}
              {selectedCategory && (
                <span className="chip max-w-full truncate">Kategori: {categories.find((c) => c.id === selectedCategory)?.name}</span>
              )}
              {warehouse && <span className="chip max-w-full truncate">Depo: {warehouse}</span>}
            </div>
          )}
        </div>

        {/* Urun listesi */}
        {isInitialLoad ? (
          <div className={PRODUCTS_GRID_CLASS}>
            {Array.from({ length: 12 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="space-y-5">
            <Card>
              <EmptyState
                icon={search || selectedCategory ? 'search' : 'products'}
                title={search || selectedCategory ? 'Ürün bulunamadı' : 'Henüz ürün yok'}
                description={
                  search || selectedCategory
                    ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                    : 'Ürünler senkronize edildiğinde burada listelenecektir.'
                }
                actionLabel={activeFilterCount > 0 ? 'Filtreleri Temizle' : undefined}
                onAction={activeFilterCount > 0 ? clearAllFilters : undefined}
              />
            </Card>

            {/* 0-sonuc kurtarma: tipo/es-anlam benzer urun onerileri */}
            {fallbackSuggestions.length > 0 && (
              <div>
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-[var(--ink-1)] sm:text-lg">
                    Tam eşleşme bulunamadı — bunları mı aradınız?
                  </h2>
                  <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                    Aramanıza yakın {fallbackSuggestions.length} ürün bulundu.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {fallbackSuggestions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/products/${s.id}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-0)]"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-0)]">
                        {s.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.imageUrl} alt={s.name} className="h-full w-full object-cover" />
                        ) : (
                          <Search className="h-5 w-5 text-[var(--ink-3)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-[var(--ink-1)]">{s.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--ink-3)]">
                          <span className="font-mono">{s.mikroCode}</span>
                          {s.categoryName && (
                            <>
                              <span className="text-[var(--line-strong)]">·</span>
                              <span className="truncate">{s.categoryName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
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

            <div className={PRODUCTS_GRID_CLASS}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  allowedPriceTypes={allowedPriceTypes}
                  defaultPriceType={defaultPriceType}
                  vatDisplayPreference={vatDisplayPreference}
                  onAdd={handleAdd}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 flex flex-col items-center gap-2.5">
                <Button
                  className="rounded-lg border border-[var(--line-strong)] bg-white px-6 font-semibold text-primary-600 hover:bg-[var(--surface-0)]"
                  onClick={handleLoadMore}
                  isLoading={isLoadingMore}
                >
                  Daha fazla yükle
                </Button>
                {totalCount !== null && (
                  <span className="text-xs text-[var(--ink-3)]">
                    {filteredProducts.length} / {totalCount} ürün gösteriliyor
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
