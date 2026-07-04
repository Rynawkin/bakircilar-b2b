'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Product } from '@/types';
import customerApi from '@/lib/api/customer';
import { Button } from '@/components/ui/Button';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { FilterRail, RailFilters, RailCategory } from '@/components/customer/FilterRail';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { ChevronRight, Search, ArrowDownUp, X, SlidersHorizontal, Compass } from 'lucide-react';

// Aile disi rail client-side filtreleri: stok durumu + sadece indirimli/anlasmali.
// ProductCard'daki indirim/anlasma mantigiyla tutarli — veri/fiyat mantigina dokunmaz.
const railMatches = (product: Product, filters: RailFilters): boolean => {
  const hasAgreement = Boolean(product.agreement);
  const stock = product.availableStock ?? product.excessStock ?? 0;

  if (filters.stockStatus === 'in' && !(stock > 0)) return false;
  if (filters.stockStatus === 'supply' && stock > 0) return false;

  if (filters.onlyAgreement && !hasAgreement) return false;

  if (filters.onlyDiscount) {
    const base = product.prices?.invoiced ?? 0;
    const disc = product.excessPrices?.invoiced;
    const isDiscounted = !hasAgreement && (product.excessStock ?? 0) > 0 && typeof disc === 'number' && disc > 0 && disc < base;
    if (!isDiscounted) return false;
  }

  return true;
};

const CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID_CLASS = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';
const PAGE_SIZE = 60;

const FILTER_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-[11px] py-[5px] text-[12px] font-medium text-[#15356b] transition-colors hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#b91c1c]';

type UnboughtCategory = { id: string; name: string; mikroCode?: string; imageUrl?: string; count?: number };

const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

export default function NewCategoriesPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const { fetchCart, addToCart } = useCartStore();

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<UnboughtCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [warehouse] = useState<string>('');

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [noUnbought, setNoUnbought] = useState(false);

  const [search, setSearch] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const productsRequestRef = useRef<AbortController | null>(null);
  const didInitRef = useRef(false);

  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });
  const [railFilters, setRailFilters] = useState<Omit<RailFilters, 'minPrice' | 'maxPrice'>>({
    stockStatus: 'all',
    onlyDiscount: false,
    onlyAgreement: false,
  });

  const combinedRailFilters = useMemo<RailFilters>(
    () => ({
      minPrice: advancedFilters.minPrice,
      maxPrice: advancedFilters.maxPrice,
      ...railFilters,
    }),
    [advancedFilters.minPrice, advancedFilters.maxPrice, railFilters]
  );

  // Sunucudan gelen urunler uzerinde client-side: arama + sirala + fiyat/stok araligi + rail filtreleri.
  const filteredProducts = useMemo(() => {
    let base = products;
    const term = debouncedSearch.trim().toLocaleLowerCase('tr');
    if (term) {
      base = base.filter((p) => {
        const name = (p.name || '').toLocaleLowerCase('tr');
        const code = (p.mikroCode || '').toLocaleLowerCase('tr');
        return name.includes(term) || code.includes(term);
      });
    }
    base = applyProductFilters(base, advancedFilters);
    const railActive = railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement;
    return railActive ? base.filter((p) => railMatches(p, combinedRailFilters)) : base;
  }, [products, debouncedSearch, advancedFilters, railFilters, combinedRailFilters]);

  const railCategories = useMemo<RailCategory[]>(
    () => categories.map((c) => ({ id: c.id, name: c.name, count: c.count })),
    [categories]
  );

  const fetchProducts = useCallback(
    async (options: { categoryId: string; reset: boolean; offset: number }) => {
      const { categoryId, reset, offset: nextOffset } = options;
      productsRequestRef.current?.abort();
      const controller = new AbortController();
      productsRequestRef.current = controller;

      if (reset) setIsSearching(true);
      else setIsLoadingMore(true);
      try {
        const data = await customerApi.getUnboughtCategoryProducts({
          categoryId: categoryId || undefined,
          sort: 'bestseller',
          offset: nextOffset,
          limit: PAGE_SIZE,
        });
        if (productsRequestRef.current !== controller) return;

        const nextProducts = Array.isArray(data?.products) ? data.products : [];
        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setOffset(nextOffset + nextProducts.length);
        setHasMore(nextProducts.length === PAGE_SIZE);
        if (typeof data?.totalCount === 'number') setTotalCount(data.totalCount);

        // Denenmemis kategori listesi (rail icin) — ilk yuklemede / kategori degisiminde tazele.
        const cats = Array.isArray(data?.categories) ? data.categories : [];
        if (reset) {
          setCategories(cats);
          setNoUnbought(cats.length === 0);
        }
        setHasError(false);
      } catch (error) {
        if (isCanceledRequest(error)) return;
        console.error('Denenmemis kategori urunleri yuklenemedi:', error);
        setHasError(true);
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
    []
  );

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    customerApi
      .getAgreementsAvailability()
      .then(({ available }) => setAgreementsAvailable(Boolean(available)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ilk yukleme (Tumu = tum denenmemis kategoriler)
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchProducts({ categoryId: '', reset: true, offset: 0 });
  }, [fetchProducts]);

  useEffect(() => {
    return () => {
      const controller = productsRequestRef.current;
      productsRequestRef.current = null;
      controller?.abort();
    };
  }, []);

  const handleSelectCategory = useCallback(
    (id: string) => {
      setSelectedCategory(id);
      setOffset(0);
      setHasMore(true);
      fetchProducts({ categoryId: id, reset: true, offset: 0 });
    },
    [fetchProducts]
  );

  const handleLoadMore = () => {
    if (isSearching || isLoadingMore || !hasMore) return;
    fetchProducts({ categoryId: selectedCategory, reset: false, offset });
  };

  const handleAdd = useCallback(
    async (args: ProductCardAddArgs) => {
      await addToCart(args);
    },
    [addToCart]
  );

  const updateRailFilters = useCallback((patch: Partial<RailFilters>) => {
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

  const clientFilterActive =
    Boolean(debouncedSearch.trim()) ||
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
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (railFilters.stockStatus !== 'all') count += 1;
    if (railFilters.onlyDiscount) count += 1;
    if (railFilters.onlyAgreement) count += 1;
    return count;
  }, [search, selectedCategory, advancedFilters, railFilters]);

  const clearAllFilters = () => {
    setSearch('');
    setAdvancedFilters({ sortBy: 'none', priceType: 'invoiced' });
    setRailFilters({ stockStatus: 'all', onlyDiscount: false, onlyAgreement: false });
    if (selectedCategory) {
      setSelectedCategory('');
      setOffset(0);
      setHasMore(true);
      fetchProducts({ categoryId: '', reset: true, offset: 0 });
    }
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
      <div className={CONTAINER_CLASS}>
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Henüz Denemediğiniz Kategoriler</span>
        </div>

        {/* Baslik */}
        <div className="mb-4 flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b]">
            <Compass className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink-1)] sm:text-2xl">
              Henüz Denemediğiniz Kategoriler
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
              Bugüne kadar hiç almadığınız kategorilerdeki çok satan ürünler — keşfedin, işletmeniz için yeni fırsatlar bulun.
            </p>
          </div>
        </div>

        {/* Denenmemis kategori kalmadi: dostane bos durum (rail/grid gostermeden) */}
        {noUnbought && !isInitialLoad ? (
          <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-5 py-14 text-center">
            <span className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#ecfdf5] text-[#047857]">
              <Compass className="h-[26px] w-[26px]" strokeWidth={1.7} />
            </span>
            <h2 className="mb-1.5 text-[17px] font-semibold text-[#14223b]">
              Tüm kategorilerden alışveriş yapmışsınız 🎉
            </h2>
            <p className="mb-4 max-w-[380px] text-[13px] leading-relaxed text-[#8b97ac]">
              Sizin için denenmemiş bir kategori kalmamış. Tüm ürünler sayfasından alışverişe devam edebilirsiniz.
            </p>
            <Link
              href="/products"
              className="rounded-[9px] bg-[#15356b] px-[18px] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1c4585]"
            >
              Tüm ürünlere git
            </Link>
          </div>
        ) : (
          <>
            {/* Mobil: filtre rayini ac/kapa */}
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
                        categories={railCategories}
                        selectedCategoryId={selectedCategory}
                        onSelectCategory={handleSelectCategory}
                        showUnboughtPill
                        brandCodes={[]}
                        onBrandToggle={() => {}}
                        showBrandCard={false}
                        brandContextCategoryId={selectedCategory || undefined}
                        filters={combinedRailFilters}
                        onFiltersChange={updateRailFilters}
                        showAgreementRow={agreementsAvailable}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Masaustu rail — SADECE denenmemis kategoriler + DENENMEMIS pill */}
              <div className="hidden lg:block">
                <FilterRail
                  categories={railCategories}
                  selectedCategoryId={selectedCategory}
                  onSelectCategory={handleSelectCategory}
                  showUnboughtPill
                  brandCodes={[]}
                  onBrandToggle={() => {}}
                  showBrandCard={false}
                  brandContextCategoryId={selectedCategory || undefined}
                  filters={combinedRailFilters}
                  onFiltersChange={updateRailFilters}
                  showAgreementRow={agreementsAvailable}
                />
              </div>

              <div className="min-w-0">
                {/* Toolbar: urun sayisi · Sirala · Listede ara · Temizle */}
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
                      <option value="none">Çok satan</option>
                      <option value="price-asc">Fiyat (artan)</option>
                      <option value="price-desc">Fiyat (azalan)</option>
                      <option value="name-asc">İsim (A-Z)</option>
                      <option value="name-desc">İsim (Z-A)</option>
                      <option value="stock-desc">Stok (çoktan aza)</option>
                      <option value="stock-asc">Stok (azdan çoğa)</option>
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

                {/* Aktif filtre chip'leri */}
                {(search || selectedCategory || railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement || typeof advancedFilters.minPrice === 'number' || typeof advancedFilters.maxPrice === 'number') && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="self-center text-[12px] font-medium text-[#9aa6b8]">Aktif filtreler:</span>
                    {search && (
                      <button type="button" onClick={() => setSearch('')} className={FILTER_CHIP_CLASS}>
                        Arama: {search}
                        <X className="h-3 w-3 shrink-0" />
                      </button>
                    )}
                    {selectedCategory && (
                      <button type="button" onClick={() => handleSelectCategory('')} className={FILTER_CHIP_CLASS}>
                        <span className="max-w-[140px] truncate">Kategori: {categories.find((c) => c.id === selectedCategory)?.name}</span>
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
                  <div className={GRID_CLASS}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                ) : hasError ? (
                  <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-5 py-14 text-center">
                    <span className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#fef2f2] text-[#b91c1c]">
                      <Compass className="h-[26px] w-[26px]" strokeWidth={1.7} />
                    </span>
                    <h2 className="mb-1.5 text-[17px] font-semibold text-[#14223b]">Ürünler yüklenemedi</h2>
                    <p className="mb-4 max-w-[360px] text-[13px] leading-relaxed text-[#8b97ac]">
                      Denenmemiş kategorilerdeki ürünler şu anda getirilemedi. Lütfen daha sonra tekrar deneyin.
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchProducts({ categoryId: selectedCategory, reset: true, offset: 0 })}
                      className="rounded-[9px] bg-[#15356b] px-[18px] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1c4585]"
                    >
                      Tekrar dene
                    </button>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-5 py-14 text-center">
                    <span className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#eef2fa] text-[#15356b]">
                      <Search className="h-[26px] w-[26px]" strokeWidth={1.7} />
                    </span>
                    <h2 className="mb-1.5 text-[17px] font-semibold text-[#14223b]">Ürün bulunamadı</h2>
                    <p className="mb-4 max-w-[360px] text-[13px] leading-relaxed text-[#8b97ac]">
                      Seçtiğiniz kategori ve filtre kombinasyonunda ürün yok. Filtreleri gevşetip tekrar deneyin.
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
                ) : (
                  <div className="relative">
                    {isSearching && (
                      <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-white/60 pt-4 backdrop-blur-[2px]">
                        <div className="flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Yükleniyor…
                        </div>
                      </div>
                    )}

                    <div className={GRID_CLASS}>
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
          </>
        )}
      </div>
    </div>
  );
}
