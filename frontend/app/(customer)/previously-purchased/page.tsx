'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Button } from '@/components/ui/Button';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { FilterRail, RailFilters, RailCategory } from '@/components/customer/FilterRail';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ChevronRight, History, Search, ArrowDownUp, Warehouse, X, SlidersHorizontal, FileText } from 'lucide-react';

const PAGE_SIZE = 60;
const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';
const isCanceled = (e: any) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

// Aktif-filtre chip'i (design: navy pill, hover'da danger'a doner) — products/page.tsx ile ayni
const FILTER_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-[11px] py-[5px] text-[12px] font-medium text-[#15356b] transition-colors hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#b91c1c]';

// Rail client-side filtreleri: stok durumu + sadece indirimli/anlasmali — products/page.tsx ile ayni.
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

type LastPurchaseSort = 'none' | 'date-desc' | 'date-asc';

export default function PreviouslyPurchasedPage() {
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
  const allowedFilterPriceTypes = allowedPriceTypes.map((t) => (t === 'INVOICED' ? 'invoiced' : 'white'));
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState('');
  const [isStaticLoaded, setIsStaticLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [documentNoFilter, setDocumentNoFilter] = useState('');
  const [lastPurchaseSort, setLastPurchaseSort] = useState<LastPurchaseSort>('date-desc');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [agreementsAvailable, setAgreementsAvailable] = useState(false);
  const debouncedSearch = useDebounce(documentNoFilter, 300);
  // Urun adi/kodu aramasi: backend getProducts search parametresini destekler
  const debouncedNameSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const lastNameSearchRef = useRef('');
  const reqRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  // Banner "birden fazla marka" tiklamasi ile ayni rail marka cok-secimi
  const [brandCodes, setBrandCodes] = useState<string[]>([]);
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({ sortBy: 'none', priceType: 'invoiced' });
  // Rail'in stok durumu + sadece indirimli/anlasmali (client-side). minPrice/maxPrice advancedFilters'ta tutulur.
  const [railFilters, setRailFilters] = useState<Omit<RailFilters, 'minPrice' | 'maxPrice'>>({
    stockStatus: 'all',
    onlyDiscount: false,
    onlyAgreement: false,
  });

  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  useEffect(() => {
    setAdvancedFilters((prev) =>
      allowedFilterPriceTypes.includes(prev.priceType) ? prev : { ...prev, priceType: defaultFilterPriceType }
    );
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term || term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({ type: 'SEARCH', meta: { query: term, source: 'previously-purchased' } });
  }, [debouncedSearch]);

  useEffect(() => {
    const term = debouncedNameSearch.trim();
    if (!term || term === lastNameSearchRef.current) return;
    lastNameSearchRef.current = term;
    trackCustomerActivity({ type: 'SEARCH', meta: { query: term, source: 'previously-purchased-name' } });
  }, [debouncedNameSearch]);

  const loadStatic = useCallback(async () => {
    try {
      const [cats, whs] = await Promise.all([
        customerApi.getCategories(),
        customerApi.getWarehouses().catch(() => ({ warehouses: [] as string[] })),
      ]);
      setCategories(cats.categories);
      setWarehouses(whs.warehouses || []);
    } catch (e) {
      console.error('Statik veri:', e);
    } finally {
      setIsStaticLoaded(true);
    }
    // Anlasma erisimi (rail'de "Sadece anlasmali" satiri sadece bu true iken gorunur — nav ile tutarli)
    customerApi
      .getAgreementsAvailability()
      .then(({ available }) => setAgreementsAvailable(Boolean(available)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    loadStatic();
    return () => reqRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProducts = useCallback(
    async (opts?: { reset?: boolean; offset?: number }) => {
      const reset = opts?.reset ?? false;
      const nextOffset = opts?.offset ?? 0;
      reqRef.current?.abort();
      const controller = new AbortController();
      reqRef.current = controller;
      if (reset) setIsSearching(true);
      else setIsLoadingMore(true);
      try {
        const data = await customerApi.getProducts(
          {
            categoryId: selectedCategory || undefined,
            categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
            brands: brandCodes.length ? brandCodes.join(',') : undefined,
            warehouse: warehouse || undefined,
            search: debouncedNameSearch.trim() || undefined,
            mode: 'purchased',
            sort: 'lastPurchasedDesc',
            limit: PAGE_SIZE,
            offset: nextOffset,
          },
          { signal: controller.signal }
        );
        const next = Array.isArray(data?.products) ? data.products : [];
        setProducts((prev) => (reset ? next : [...prev, ...next]));
        setOffset(nextOffset + next.length);
        setHasMore(next.length === PAGE_SIZE);
        setTotalCount(typeof data?.total === 'number' ? data.total : null);
      } catch (e) {
        if (!isCanceled(e)) console.error('Urun yukleme:', e);
      } finally {
        if (reqRef.current === controller) {
          reqRef.current = null;
          if (reset) {
            setIsSearching(false);
            setIsLoading(false);
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    },
    [selectedCategory, selectedCategoryIds, brandCodes, warehouse, debouncedNameSearch]
  );

  useEffect(() => {
    if (!isStaticLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, brandCodes, warehouse, debouncedNameSearch, isStaticLoaded, fetchProducts]);

  const combinedRailFilters = useMemo<RailFilters>(
    () => ({
      minPrice: advancedFilters.minPrice,
      maxPrice: advancedFilters.maxPrice,
      ...railFilters,
    }),
    [advancedFilters.minPrice, advancedFilters.maxPrice, railFilters]
  );

  const filteredProducts = useMemo(() => {
    let next = applyProductFilters(products, advancedFilters);

    // Rail client-side filtre (stok durumu + sadece indirimli/anlasmali)
    const railActive = railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement;
    if (railActive) next = next.filter((p) => railMatches(p, combinedRailFilters));

    // Belge no ile client-side filtre (bu sayfaya ozel)
    const normalizedDoc = documentNoFilter.trim().toLowerCase();
    if (normalizedDoc) {
      next = next.filter((product) =>
        (product.lastSales || []).some((sale) => {
          const documentValue = String(sale.documentNo || sale.orderNumber || '').toLowerCase();
          return documentValue.includes(normalizedDoc);
        })
      );
    }

    // Son alis sıralaması (ayri state — advancedFilters.sortBy'dan bagimsiz)
    if (lastPurchaseSort !== 'none') {
      next = [...next].sort((a, b) => {
        const aTs = a.lastSales?.[0]?.saleDate ? new Date(a.lastSales[0].saleDate).getTime() : 0;
        const bTs = b.lastSales?.[0]?.saleDate ? new Date(b.lastSales[0].saleDate).getTime() : 0;
        return lastPurchaseSort === 'date-desc' ? bTs - aTs : aTs - bTs;
      });
    }

    return next;
  }, [products, advancedFilters, railFilters, combinedRailFilters, documentNoFilter, lastPurchaseSort]);

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => { await addToCart(args); }, [addToCart]);

  // Rail'den marka toggle: cok-secim. Sadece state guncellenir.
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

  const rootRailCategories = useMemo<RailCategory[]>(() => {
    const roots = categories.filter((c) => !String((c as any).mikroCode || '').includes('.'));
    return (roots.length > 0 ? roots : categories).slice(0, 14).map((c) => ({ id: c.id, name: c.name }));
  }, [categories]);

  const clientFilterActive =
    railFilters.stockStatus !== 'all' ||
    railFilters.onlyDiscount ||
    railFilters.onlyAgreement ||
    typeof advancedFilters.minPrice === 'number' ||
    typeof advancedFilters.maxPrice === 'number' ||
    Boolean(documentNoFilter.trim());
  const displayCount = clientFilterActive ? filteredProducts.length : totalCount ?? filteredProducts.length;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (documentNoFilter.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (brandCodes.length > 0) count += 1;
    if (warehouse) count += 1;
    if (lastPurchaseSort !== 'date-desc') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (railFilters.stockStatus !== 'all') count += 1;
    if (railFilters.onlyDiscount) count += 1;
    if (railFilters.onlyAgreement) count += 1;
    return count;
  }, [search, documentNoFilter, selectedCategory, brandCodes, warehouse, lastPurchaseSort, advancedFilters, railFilters]);

  const clearFilters = () => {
    setSearch('');
    setDocumentNoFilter('');
    setSelectedCategory('');
    setWarehouse('');
    setBrandCodes([]);
    setLastPurchaseSort('date-desc');
    setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType });
    setRailFilters({ stockStatus: 'all', onlyDiscount: false, onlyAgreement: false });
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
      <div className={CONTAINER}>
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Daha Önce Aldıklarım</span>
        </div>

        {/* Baslik */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b] sm:flex">
              <History className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink-1)] sm:text-2xl">Daha Önce Aldıklarım</h1>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
                Aynı ürün kartı + son alış bilgisi · "Son 5 Alış" ile detay, tek tıkla tekrar al
              </p>
            </div>
          </div>
          {showPriceTypeSelector && (
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-[var(--ink-3)]">Fiyat türü</span>
              <div className="inline-flex rounded-lg bg-[var(--surface-0)] p-0.5 ring-1 ring-inset ring-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setAdvancedFilters((p) => ({ ...p, priceType: 'invoiced' }))}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${advancedFilters.priceType === 'invoiced' ? 'bg-white text-primary-600 shadow-sm ring-1 ring-[var(--line-strong)]' : 'text-[var(--ink-2)]'}`}
                >
                  Faturalı
                </button>
                <button
                  type="button"
                  onClick={() => setAdvancedFilters((p) => ({ ...p, priceType: 'white' }))}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${advancedFilters.priceType === 'white' ? 'bg-white text-[var(--ink-1)] shadow-sm ring-1 ring-[var(--line-strong)]' : 'text-[var(--ink-2)]'}`}
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
                    categories={rootRailCategories}
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
              categories={rootRailCategories}
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
            {/* Toolbar: urun sayisi · Sirala (son alis) · Depo · Belge no · Listede ara · Temizle */}
            <div className="sticky top-[118px] z-20 mb-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
              <span className="text-[13px] text-[#51607a]">
                <b className="font-semibold text-[#14223b]">{displayCount}</b> ürün
              </span>
              <span className="h-[22px] w-px bg-[var(--line)]" />

              {/* Sirala — son alis sıralaması (ayri state) */}
              <label className="flex h-[38px] min-w-0 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3">
                <ArrowDownUp className="h-[15px] w-[15px] shrink-0 text-[#64748b]" />
                <span className="hidden text-[12px] text-[#8b97ac] sm:inline">Sırala</span>
                <select
                  value={lastPurchaseSort}
                  onChange={(e) => setLastPurchaseSort(e.target.value as LastPurchaseSort)}
                  className="min-w-0 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[#14223b] outline-none"
                >
                  <option value="date-desc">Son alış (en yeni)</option>
                  <option value="date-asc">Son alış (en eski)</option>
                  <option value="none">İsim A-Z</option>
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
                  {warehouses.map((w) => (<option key={w} value={w}>{w}</option>))}
                </select>
              </label>

              {/* Belge no ile filtrele (bu sayfaya ozel) */}
              <div className="flex h-[38px] min-w-[160px] flex-1 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3 sm:ml-auto sm:flex-none">
                <FileText className="h-[15px] w-[15px] shrink-0 text-[#9aa6b8]" />
                <input
                  placeholder="Belge no…"
                  value={documentNoFilter}
                  onChange={(e) => setDocumentNoFilter(e.target.value)}
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#14223b] outline-none"
                />
              </div>

              {/* Listede ara (urun adi/kodu) */}
              <div className="flex h-[38px] min-w-[190px] flex-1 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3 sm:flex-none">
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
                  onClick={clearFilters}
                  className="flex h-[38px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2]"
                >
                  <X className="h-3.5 w-3.5" />
                  Temizle
                </button>
              )}
            </div>

            {/* Aktif filtre chip'leri (kaldirilabilir) */}
            {(search || documentNoFilter || selectedCategory || warehouse || brandCodes.length > 0 || railFilters.stockStatus !== 'all' || railFilters.onlyDiscount || railFilters.onlyAgreement || typeof advancedFilters.minPrice === 'number' || typeof advancedFilters.maxPrice === 'number') && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="self-center text-[12px] font-medium text-[#9aa6b8]">Aktif filtreler:</span>
                {search && (
                  <button type="button" onClick={() => setSearch('')} className={FILTER_CHIP_CLASS}>
                    Arama: {search}
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                )}
                {documentNoFilter && (
                  <button type="button" onClick={() => setDocumentNoFilter('')} className={FILTER_CHIP_CLASS}>
                    Belge: {documentNoFilter}
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
                  <button type="button" onClick={() => setBrandCodes([])} className={FILTER_CHIP_CLASS} title="Marka filtresini kaldır">
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

            {/* Liste */}
            {isLoading ? (
              <div className={GRID}>{Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-5 py-14 text-center">
                <span className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#eef2fa] text-[#15356b]">
                  {activeFilterCount > 0 ? (
                    <Search className="h-[26px] w-[26px]" strokeWidth={1.7} />
                  ) : (
                    <History className="h-[26px] w-[26px]" strokeWidth={1.7} />
                  )}
                </span>
                <h2 className="mb-1.5 text-[17px] font-semibold text-[#14223b]">
                  {activeFilterCount > 0 ? 'Ürün bulunamadı' : 'Daha önce aldığınız ürün bulunamadı'}
                </h2>
                <p className="mb-4 max-w-[360px] text-[13px] leading-relaxed text-[#8b97ac]">
                  {activeFilterCount > 0
                    ? 'Seçtiğiniz kategori, marka ve filtre kombinasyonunda ürün yok. Filtreleri gevşetip tekrar deneyin.'
                    : 'Bu cari hesap için daha önce satın alınan ürün kaydı bulunamadı.'}
                </p>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
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
                      Aranıyor…
                    </div>
                  </div>
                )}
                <div className={GRID}>
                  {filteredProducts.map((product) => {
                    const firstSale = product.lastSales?.[0];
                    const lastBuy = firstSale
                      ? { date: formatDate(firstSale.saleDate), belge: firstSale.documentNo || undefined }
                      : null;
                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        allowedPriceTypes={allowedPriceTypes}
                        defaultPriceType={defaultPriceType}
                        vatDisplayPreference={vatDisplayPreference}
                        variant="default"
                        selectedWarehouse={warehouse || undefined}
                        lastBuy={lastBuy}
                        onHistory={() => setHistoryProduct(product)}
                        onAdd={handleAdd}
                      />
                    );
                  })}
                </div>
                {hasMore && (
                  <div className="mt-8 flex flex-col items-center gap-2.5">
                    <Button
                      className="rounded-lg border border-[var(--line-strong)] bg-white px-6 font-semibold text-primary-600 hover:bg-[var(--surface-0)]"
                      onClick={() => { if (!isSearching && !isLoadingMore && hasMore) fetchProducts({ reset: false, offset }); }}
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

      {/* ── "Son 5 Alış" modal ──────────────────────────────────── */}
      {historyProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setHistoryProduct(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">Son 5 Alış</div>
                <h3 className="mt-0.5 truncate text-base font-semibold text-[var(--ink-1)]" title={historyProduct.name}>
                  {historyProduct.name}
                </h3>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-3)]">{historyProduct.mikroCode}</div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryProduct(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-auto p-3 sm:p-5">
              {Array.isArray(historyProduct.lastSales) && historyProduct.lastSales.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                  <table className="w-full min-w-[520px] text-left text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[var(--line)] bg-[var(--surface-0)] text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
                        <th className="px-3 py-2 font-semibold">Tarih</th>
                        <th className="px-3 py-2 font-semibold">Belge No</th>
                        <th className="px-3 py-2 font-semibold">Sipariş No</th>
                        <th className="px-3 py-2 text-right font-semibold">Miktar</th>
                        <th className="px-3 py-2 text-right font-semibold">Birim Fiyat</th>
                        <th className="px-3 py-2 text-right font-semibold">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyProduct.lastSales.slice(0, 5).map((sale, index) => {
                        const qty = Number(sale.quantity || 0);
                        const unitPrice = Number(sale.unitPrice || 0);
                        const lineTotal = Number(sale.lineTotal ?? qty * unitPrice);
                        return (
                          <tr
                            key={`${sale.saleDate}-${sale.documentNo || sale.orderNumber || index}`}
                            className="border-b border-[var(--line)] last:border-b-0 text-[var(--ink-1)]"
                          >
                            <td className="px-3 py-2.5 text-[var(--ink-2)]">{formatDate(sale.saleDate)}</td>
                            <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--ink-2)]">{sale.documentNo || '-'}</td>
                            <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--ink-2)]">{sale.orderNumber || '-'}</td>
                            <td className="px-3 py-2.5 text-right">{qty} {historyProduct.unit}</td>
                            <td className="px-3 py-2.5 text-right">{formatCurrency(unitPrice)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(lineTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-0)] p-4 text-sm text-[var(--ink-2)]">
                  Son alış detayı bulunamadı.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-[var(--line)] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setHistoryProduct(null)}
                className="rounded-lg border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--surface-0)]"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
