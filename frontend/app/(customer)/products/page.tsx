'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Button } from '@/components/ui/Button';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { FilterRail, RailFilters, RailCategory } from '@/components/customer/FilterRail';
import { InGridBanner } from '@/components/customer/InGridBanner';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { ChevronRight, Search, ArrowDownUp, X, SlidersHorizontal, Warehouse, LayoutGrid } from 'lucide-react';

// Aile disi rail client-side filtreleri: stok durumu + sadece indirimli/anlasmali.
// ProductCard'daki indirim/anlasma mantigiyla tutarli — veri/fiyat mantigina dokunmaz.
const railMatches = (product: Product, filters: RailFilters): boolean => {
  const hasAgreement = Boolean(product.agreement);
  const stock = product.availableStock ?? product.excessStock ?? 0;

  if (filters.stockStatus === 'in' && !(stock > 0)) return false;
  if (filters.stockStatus === 'supply' && stock > 0) return false;

  if (filters.onlyAgreement && !hasAgreement) return false;

  if (filters.onlyDiscount) {
    // Indirim: anlasma yok + fazla stok var + excessPrices temel fiyatin altinda
    const base = product.prices?.invoiced ?? 0;
    const disc = product.excessPrices?.invoiced;
    const isDiscounted = !hasAgreement && (product.excessStock ?? 0) > 0 && typeof disc === 'number' && disc > 0 && disc < base;
    if (!isDiscounted) return false;
  }

  return true;
};

const PRODUCTS_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';
const PAGE_SIZE = 60;

// Aktif-filtre chip'i (design: navy pill, hover'da danger'a doner)
const FILTER_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-[11px] py-[5px] text-[12px] font-medium text-[#15356b] transition-colors hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#b91c1c]';

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
  const router = useRouter();
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
  const [isStaticLoaded, setIsStaticLoaded] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);
  const [fallbackSuggestions, setFallbackSuggestions] = useState<FallbackSuggestion[]>([]);
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const fallbackRequestRef = useRef<AbortController | null>(null);
  const productsRequestRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // Banner "birden fazla marka" tiklamasi: /products?brands=A,B,C -> bu markalarin urunleri
  const [brandCodes, setBrandCodes] = useState<string[]>([]);
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  // Kategori rayi = FACET: sadece mevcut arama/marka/depo sonuclarinda gecen kok kategoriler.
  const [facetCategories, setFacetCategories] = useState<RailCategory[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });
  // Rail'in stok durumu + sadece indirimli/anlasmali (client-side). minPrice/maxPrice
  // advancedFilters'ta tutulur; rail bu iki alani da onlar uzerinden gunceller.
  const [railFilters, setRailFilters] = useState<Omit<RailFilters, 'minPrice' | 'maxPrice'>>({
    stockStatus: 'all',
    onlyDiscount: false,
    onlyAgreement: false,
  });

  // URL parametreleri degisince kategori/aramayi senkronize et — header kategori
  // linkleri ([/products?categoryId=...]) ayni sayfadayken de calissin + filtre sifirlansin:
  // kategoriye gidince arama, aramaya gidince kategori temizlenir.
  useEffect(() => {
    setSelectedCategory(searchParams?.get('categoryId') || '');
    setSearch(searchParams?.get('search') || '');
    const rawBrands = searchParams?.get('brands') || searchParams?.get('brand') || '';
    setBrandCodes(
      rawBrands
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
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

  const combinedRailFilters = useMemo<RailFilters>(
    () => ({
      minPrice: advancedFilters.minPrice,
      maxPrice: advancedFilters.maxPrice,
      ...railFilters,
    }),
    [advancedFilters.minPrice, advancedFilters.maxPrice, railFilters]
  );

  const filteredProducts = useMemo(() => {
    const base = applyProductFilters(products, advancedFilters);
    const railActive = railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement;
    return railActive ? base.filter((p) => railMatches(p, combinedRailFilters)) : base;
  }, [products, advancedFilters, railFilters, combinedRailFilters]);

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
    // Kategori/depo hatasi urun yuklemesini engellemesin: hata yutulur,
    // bos listeyle devam edilir ve urunler bagimsiz yuklenir.
    const [categoriesData, warehousesData] = await Promise.all([
      customerApi.getCategories().catch((error) => {
        console.error('Kategori yükleme hatası:', error);
        return { categories: [] as Category[] };
      }),
      customerApi.getWarehouses().catch(() => ({ warehouses: [] as string[] })),
    ]);
    setCategories(categoriesData.categories);
    setWarehouses(warehousesData.warehouses || []);
    setIsStaticLoaded(true);
    // Anlasma erisimi (rail'de "Sadece anlasmali" satiri sadece bu true iken gorunur — nav ile tutarli)
    customerApi
      .getAgreementsAvailability()
      .then(({ available }) => setAgreementsAvailable(Boolean(available)))
      .catch(() => {});
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
          brands: brandCodes.length ? brandCodes.join(',') : undefined,
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
    [selectedCategory, selectedCategoryIds, brandCodes, debouncedSearch, warehouse]
  );

  useEffect(() => {
    if (!isStaticLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, brandCodes, debouncedSearch, warehouse, isStaticLoaded, fetchProducts]);

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

  const clearBrandFilter = useCallback(() => {
    setBrandCodes([]);
    // brands URL parametreliyse temizle (banner tiklamasi sonrasi)
    if (searchParams?.get('brands') || searchParams?.get('brand')) {
      router.push('/products');
    }
  }, [router, searchParams]);

  // Rail'den marka toggle: cok-secim. Sadece state guncellenir; URL'e DOKUNULMAZ.
  // Banner'dan gelen ?brands= parametresi ilk yuklemede state'i doldurur (URL-sync effect);
  // burada navigasyon yapmadigimiz icin o effect tekrar tetiklenmez ve secim korunur.
  // Boylece banner senkronu bozulmaz, kullanici secimi state'te yasar.
  const handleBrandToggle = useCallback((code: string) => {
    setBrandCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  const updateRailFilters = useCallback((patch: Partial<RailFilters>) => {
    // minPrice/maxPrice advancedFilters'a; digerleri railFilters'a gider.
    const { minPrice, maxPrice, ...rest } = patch;
    if (minPrice !== undefined || maxPrice !== undefined || 'minPrice' in patch || 'maxPrice' in patch) {
      setAdvancedFilters((prev) => ({
        ...prev,
        ...('minPrice' in patch ? { minPrice } : {}),
        ...('maxPrice' in patch ? { maxPrice } : {}),
      }));
    }
    if (Object.keys(rest).length > 0) {
      setRailFilters((prev) => ({ ...prev, ...rest }));
    }
  }, []);

  // Kategori facet'lerini arama/marka/depo baglamiyla cek (kategori secimi rail'i daraltmaz —
  // backend categoryId'yi bilerek uygulamaz). debouncedSearch zaten var; onunla senkron kalir.
  useEffect(() => {
    let cancelled = false;
    customerApi
      .getCategoryFacets({
        search: debouncedSearch || undefined,
        brands: brandCodes.length ? brandCodes.join(',') : undefined,
        warehouse: warehouse || undefined,
      })
      .then((data) => {
        if (cancelled) return;
        setFacetCategories((data.categories || []).map((c) => ({ id: c.id, name: c.name, count: c.count })));
      })
      .catch(() => {
        if (!cancelled) setFacetCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, brandCodes, warehouse]);

  // Toolbar urun sayisi: client-side filtre (fiyat/stok araligi veya rail) aktifken
  // gercek gorunen sayi; degilse sunucu toplami.
  const clientFilterActive =
    railFilters.stockStatus !== 'all' ||
    railFilters.onlyDiscount ||
    railFilters.onlyAgreement ||
    typeof advancedFilters.minPrice === 'number' ||
    typeof advancedFilters.maxPrice === 'number' ||
    typeof advancedFilters.minStock === 'number' ||
    typeof advancedFilters.maxStock === 'number';
  const displayCount = clientFilterActive ? filteredProducts.length : totalCount ?? filteredProducts.length;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (brandCodes.length > 0) count += 1;
    if (warehouse) count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    if (railFilters.stockStatus !== 'all') count += 1;
    if (railFilters.onlyDiscount) count += 1;
    if (railFilters.onlyAgreement) count += 1;
    return count;
  }, [search, selectedCategory, brandCodes, warehouse, advancedFilters, railFilters]);

  const clearAllFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setWarehouse('');
    setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType });
    setRailFilters({ stockStatus: 'all', onlyDiscount: false, onlyAgreement: false });
    clearBrandFilter();
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
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b] sm:flex">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink-1)] sm:text-2xl">
                {brandCodes.length === 1 ? brandCodes[0] : brandCodes.length > 1 ? 'Seçili Markalar' : 'Tüm Ürünler'}
              </h1>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
                {brandCodes.length > 0
                  ? `${brandCodes.join(', ')} · ${totalCount ?? filteredProducts.length} ürün`
                  : !isInitialLoad && totalCount !== null && totalCount > filteredProducts.length
                    ? `Tüm katalog · ${totalCount} ürün`
                    : `Tüm katalog · ${filteredProducts.length} sonuç`}
              </p>
            </div>
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

        {/* Mobil: filtre rayini ac/kapa (varsayilan kapali -> urunler hemen gorunur) */}
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white text-[13px] font-semibold text-[#14223b]"
          >
            <SlidersHorizontal className="h-4 w-4 text-[var(--ink-3)]" />
            Filtrele
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#eef2fa] px-2 py-0.5 text-[11px] font-semibold text-[#15356b]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[262px_minmax(0,1fr)]">
          {/* Mobil drawer overlay */}
          {mobileFiltersOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFiltersOpen(false)} />
              <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col bg-[#f4f6fa]">
                <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-3">
                  <span className="text-[14px] font-semibold text-[#14223b]">Filtrele</span>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-2)] hover:bg-[#f1f4f9]"
                    aria-label="Kapat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <FilterRail
                    categories={facetCategories}
                    selectedCategoryId={selectedCategory}
                    onSelectCategory={(id) => { setSelectedCategory(id); setOffset(0); }}
                    brandCodes={brandCodes}
                    onBrandToggle={handleBrandToggle}
                    brandContextCategoryId={selectedCategory || undefined}
                    filters={combinedRailFilters}
                    onFiltersChange={updateRailFilters}
                    showAgreementRow={agreementsAvailable}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Masaustu rail */}
          <div className="hidden lg:block">
            <FilterRail
              categories={facetCategories}
              selectedCategoryId={selectedCategory}
              onSelectCategory={(id) => { setSelectedCategory(id); setOffset(0); }}
              brandCodes={brandCodes}
              onBrandToggle={handleBrandToggle}
              brandContextCategoryId={selectedCategory || undefined}
              filters={combinedRailFilters}
              onFiltersChange={updateRailFilters}
              showAgreementRow={agreementsAvailable}
            />
          </div>

          <div className="min-w-0">
        {/* Toolbar: urun sayisi · Sirala · Depo · Listede ara · Temizle */}
        <div className="sticky top-[118px] z-20 mb-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
          <span className="text-[13px] text-[#51607a]">
            <b className="font-semibold text-[#14223b]">{displayCount}</b> ürün
          </span>
          <span className="h-[22px] w-px bg-[var(--line)]" />

          {/* Sirala */}
          <label className="flex h-[38px] min-w-0 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3">
            <ArrowDownUp className="h-[15px] w-[15px] shrink-0 text-[#64748b]" />
            <span className="hidden text-[12px] text-[#8b97ac] sm:inline">Sırala</span>
            <select
              value={advancedFilters.sortBy}
              onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, sortBy: e.target.value as FilterState['sortBy'] }))}
              className="min-w-0 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[#14223b] outline-none"
            >
              <option value="none">Önerilen</option>
              <option value="price-asc">Fiyat (artan)</option>
              <option value="price-desc">Fiyat (azalan)</option>
              <option value="name-asc">İsim (A-Z)</option>
              <option value="name-desc">İsim (Z-A)</option>
              <option value="stock-desc">Stok (çoktan aza)</option>
              <option value="stock-asc">Stok (azdan çoğa)</option>
            </select>
          </label>

          {/* Depo */}
          <label className="flex h-[38px] min-w-0 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3">
            <Warehouse className="h-[15px] w-[15px] shrink-0 text-[#64748b]" />
            <span className="hidden text-[12px] text-[#8b97ac] sm:inline">Depo</span>
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="min-w-0 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[#14223b] outline-none"
            >
              <option value="">Tüm Depolar</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>

          {/* Listede ara */}
          <div className="flex h-[38px] min-w-[190px] flex-1 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3 sm:ml-auto sm:flex-none">
            <Search className="h-[15px] w-[15px] shrink-0 text-[#9aa6b8]" />
            <input
              placeholder="Listede ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#14223b] outline-none"
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2]"
            >
              <X className="h-3.5 w-3.5" />
              Temizle
            </button>
          )}
        </div>

        {/* Aktif filtre chip'leri (kaldirilabilir) */}
        {(search || selectedCategory || warehouse || brandCodes.length > 0 || railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement || typeof advancedFilters.minPrice === 'number' || typeof advancedFilters.maxPrice === 'number') && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="self-center text-[12px] font-medium text-[#9aa6b8]">Aktif filtreler:</span>
            {search && (
              <button type="button" onClick={() => setSearch('')} className={FILTER_CHIP_CLASS}>
                Arama: {search}
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {selectedCategory && (
              <button type="button" onClick={() => { setSelectedCategory(''); setOffset(0); }} className={FILTER_CHIP_CLASS}>
                <span className="max-w-[140px] truncate">Kategori: {categories.find((c) => c.id === selectedCategory)?.name}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {brandCodes.length > 0 && (
              <button type="button" onClick={clearBrandFilter} className={FILTER_CHIP_CLASS} title="Marka filtresini kaldır">
                {brandCodes.length === 1 ? `Marka: ${brandCodes[0]}` : `${brandCodes.length} marka`}
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {warehouse && (
              <button type="button" onClick={() => setWarehouse('')} className={FILTER_CHIP_CLASS}>
                Depo: {warehouse}
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {railFilters.stockStatus !== 'all' && (
              <button type="button" onClick={() => setRailFilters((p) => ({ ...p, stockStatus: 'all' }))} className={FILTER_CHIP_CLASS}>
                {railFilters.stockStatus === 'in' ? 'Stokta' : 'Tedarik'}
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {railFilters.onlyDiscount && (
              <button type="button" onClick={() => setRailFilters((p) => ({ ...p, onlyDiscount: false }))} className={FILTER_CHIP_CLASS}>
                Sadece indirimli
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {railFilters.onlyAgreement && (
              <button type="button" onClick={() => setRailFilters((p) => ({ ...p, onlyAgreement: false }))} className={FILTER_CHIP_CLASS}>
                Sadece anlaşmalı
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {(typeof advancedFilters.minPrice === 'number' || typeof advancedFilters.maxPrice === 'number') && (
              <button
                type="button"
                onClick={() => setAdvancedFilters((prev) => ({ ...prev, minPrice: undefined, maxPrice: undefined }))}
                className={FILTER_CHIP_CLASS}
              >
                Fiyat: {advancedFilters.minPrice ?? 0}–{advancedFilters.maxPrice ?? '∞'}
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* Urun listesi */}
        {isInitialLoad ? (
          <div className={PRODUCTS_GRID_CLASS}>
            {Array.from({ length: 12 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-5 py-14 text-center">
              <span className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#eef2fa] text-[#15356b]">
                <Search className="h-[26px] w-[26px]" strokeWidth={1.7} />
              </span>
              <h2 className="mb-1.5 text-[17px] font-semibold text-[#14223b]">
                {search || selectedCategory ? 'Ürün bulunamadı' : 'Henüz ürün yok'}
              </h2>
              <p className="mb-4 max-w-[360px] text-[13px] leading-relaxed text-[#8b97ac]">
                {search || selectedCategory
                  ? 'Seçtiğiniz kategori, marka ve filtre kombinasyonunda ürün yok. Filtreleri gevşetip tekrar deneyin.'
                  : 'Ürünler senkronize edildiğinde burada listelenecektir.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-[9px] bg-[#15356b] px-[18px] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1c4585]"
                >
                  Filtreleri temizle
                </button>
              )}
            </div>

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
              {!search && !selectedCategory && brandCodes.length === 0 && offset === 0 && <InGridBanner />}
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  allowedPriceTypes={allowedPriceTypes}
                  defaultPriceType={defaultPriceType}
                  vatDisplayPreference={vatDisplayPreference}
                  selectedWarehouse={warehouse || undefined}
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
      </div>
    </div>
  );
}
