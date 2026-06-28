'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { ChevronRight, Tag, Search, ArrowDownUp, Warehouse } from 'lucide-react';

const PAGE_SIZE = 60;
const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';
const isCanceled = (e: any) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

export default function DiscountedProductsPage() {
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
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const reqRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({ sortBy: 'none', priceType: 'invoiced' });

  useEffect(() => {
    setAdvancedFilters((prev) =>
      allowedFilterPriceTypes.includes(prev.priceType) ? prev : { ...prev, priceType: defaultFilterPriceType }
    );
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term || term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({ type: 'SEARCH', meta: { query: term, source: 'discounted-products' } });
  }, [debouncedSearch]);

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
            search: debouncedSearch || undefined,
            warehouse: warehouse || undefined,
            mode: 'discounted',
            sort: 'bestsellerValue',
            limit: PAGE_SIZE,
            offset: nextOffset,
          },
          { signal: controller.signal }
        );
        const next = data.products;
        setProducts((prev) => (reset ? next : [...prev, ...next]));
        setOffset(nextOffset + next.length);
        setHasMore(next.length === PAGE_SIZE);
        setTotalCount(typeof data.total === 'number' ? data.total : null);
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
    [selectedCategory, selectedCategoryIds, debouncedSearch, warehouse]
  );

  useEffect(() => {
    if (!isStaticLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, debouncedSearch, warehouse, isStaticLoaded, fetchProducts]);

  const filteredProducts = useMemo(() => applyProductFilters(products, advancedFilters), [products, advancedFilters]);

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => { await addToCart(args); }, [addToCart]);

  const clearFilters = () => {
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
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className={CONTAINER}>
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">İndirimli Ürünler</span>
        </div>

        {/* Baslik */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Tag className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-1)]">İndirimli Ürünler</h1>
              <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                Yalnızca gerçekten indirimli kalemler · eski → yeni fiyat ve %avantaj kart üzerinde
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

        {/* Filtre bari */}
        <div className="card mb-5 flex flex-wrap items-center gap-2.5 px-3.5 py-3">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5">
            <ArrowDownUp className="h-4 w-4 text-[var(--ink-3)]" />
            <select
              value={advancedFilters.sortBy}
              onChange={(e) => setAdvancedFilters((p) => ({ ...p, sortBy: e.target.value as FilterState['sortBy'] }))}
              className="cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none"
            >
              <option value="none">Önerilen</option>
              <option value="price-asc">Fiyat (artan)</option>
              <option value="price-desc">Fiyat (azalan)</option>
              <option value="name-asc">İsim (A-Z)</option>
              <option value="name-desc">İsim (Z-A)</option>
              <option value="stock-desc">Stok (çoktan aza)</option>
            </select>
          </label>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5">
            <Warehouse className="h-4 w-4 text-[var(--ink-3)]" />
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none"
            >
              <option value="">Tüm Depolar</option>
              {warehouses.map((w) => (<option key={w} value={w}>{w}</option>))}
            </select>
          </label>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
            {totalCount !== null ? `${totalCount} kalem indirimde` : 'İndirimli kalemler'}
          </span>
          <div className="relative ml-auto min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
            <Input placeholder="Listede ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-full pl-9" />
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className={GRID}>{Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : filteredProducts.length === 0 ? (
          <Card>
            <EmptyState
              icon={search || selectedCategory || warehouse ? 'search' : 'products'}
              title={search || selectedCategory || warehouse ? 'Ürün bulunamadı' : 'İndirimli ürün bulunamadı'}
              description={
                search || selectedCategory || warehouse
                  ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                  : 'Uygun fiyatlı fazla stok ürünleri olduğunda burada listelenecektir.'
              }
              actionLabel={search || selectedCategory || warehouse ? 'Filtreleri Temizle' : undefined}
              onAction={search || selectedCategory || warehouse ? clearFilters : undefined}
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
            <div className={GRID}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  allowedPriceTypes={allowedPriceTypes}
                  defaultPriceType={defaultPriceType}
                  vatDisplayPreference={vatDisplayPreference}
                  variant="discounted"
                  onAdd={handleAdd}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  className="rounded-lg border border-[var(--line-strong)] bg-white px-6 font-semibold text-primary-600 hover:bg-[var(--surface-0)]"
                  onClick={() => { if (!isSearching && !isLoadingMore && hasMore) fetchProducts({ reset: false, offset }); }}
                  isLoading={isLoadingMore}
                >
                  Daha fazla yükle
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
