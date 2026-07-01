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
import { PersonalRecommendations } from '@/components/customer/PersonalRecommendations';
import { CategorySidebar } from '@/components/customer/CategorySidebar';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { ChevronRight, History, Search, ArrowDownUp, Warehouse, X } from 'lucide-react';

const PAGE_SIZE = 60;
const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';
const isCanceled = (e: any) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

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
  const debouncedSearch = useDebounce(documentNoFilter, 300);
  const lastSearchRef = useRef('');
  const reqRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({ sortBy: 'none', priceType: 'invoiced' });

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
            warehouse: warehouse || undefined,
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
    [selectedCategory, selectedCategoryIds, warehouse]
  );

  useEffect(() => {
    if (!isStaticLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, warehouse, isStaticLoaded, fetchProducts]);

  const filteredProducts = useMemo(() => {
    let next = applyProductFilters(products, advancedFilters);

    const normalizedDoc = documentNoFilter.trim().toLowerCase();
    if (normalizedDoc) {
      next = next.filter((product) =>
        (product.lastSales || []).some((sale) => {
          const documentValue = String(sale.documentNo || sale.orderNumber || '').toLowerCase();
          return documentValue.includes(normalizedDoc);
        })
      );
    }

    if (lastPurchaseSort !== 'none') {
      next = [...next].sort((a, b) => {
        const aTs = a.lastSales?.[0]?.saleDate ? new Date(a.lastSales[0].saleDate).getTime() : 0;
        const bTs = b.lastSales?.[0]?.saleDate ? new Date(b.lastSales[0].saleDate).getTime() : 0;
        return lastPurchaseSort === 'date-desc' ? bTs - aTs : aTs - bTs;
      });
    }

    return next;
  }, [products, advancedFilters, documentNoFilter, lastPurchaseSort]);

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => { await addToCart(args); }, [addToCart]);

  const clearFilters = () => {
    setSearch('');
    setDocumentNoFilter('');
    setSelectedCategory('');
    setWarehouse('');
    setLastPurchaseSort('date-desc');
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
      <div className={CONTAINER}>
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Daha Önce Aldıklarım</span>
        </div>

        {/* Baslik */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <History className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">Daha Önce Aldıklarım</h1>
              <p className="mt-1 text-[13px] text-[var(--ink-3)]">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
          <CategorySidebar
            categories={categories}
            selectedCategoryId={selectedCategory}
            onSelect={(id) => { setSelectedCategory(id); setOffset(0); }}
          />
          <div className="min-w-0">
        {/* Filtre bari */}
        <div className="card mb-5 flex flex-wrap items-center gap-2.5 px-3.5 py-3">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-2.5">
            <ArrowDownUp className="h-4 w-4 text-[var(--ink-3)]" />
            <select
              value={lastPurchaseSort}
              onChange={(e) => setLastPurchaseSort(e.target.value as LastPurchaseSort)}
              className="cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none"
            >
              <option value="date-desc">Son alış (en yeni)</option>
              <option value="date-asc">Son alış (en eski)</option>
              <option value="none">İsim A-Z</option>
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-[12px] font-semibold text-primary-700">
            {totalCount !== null && totalCount > filteredProducts.length
              ? `Toplam ${totalCount} üründen ${filteredProducts.length}`
              : `${filteredProducts.length} ürün`}
          </span>
          <div className="relative w-full sm:ml-auto sm:w-auto sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
            <Input placeholder="Belge no ile filtrele…" value={documentNoFilter} onChange={(e) => setDocumentNoFilter(e.target.value)} className="h-9 w-full pl-9" />
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className={GRID}>{Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : filteredProducts.length === 0 ? (
          <Card>
            <EmptyState
              icon={documentNoFilter || selectedCategory || warehouse ? 'search' : 'products'}
              title={documentNoFilter || selectedCategory || warehouse ? 'Ürün bulunamadı' : 'Daha önce aldığınız ürün bulunamadı'}
              description={
                documentNoFilter || selectedCategory || warehouse
                  ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                  : 'Bu cari hesap için daha önce satın alınan ürün kaydı bulunamadı.'
              }
              actionLabel={documentNoFilter || selectedCategory || warehouse ? 'Filtreleri Temizle' : undefined}
              onAction={documentNoFilter || selectedCategory || warehouse ? clearFilters : undefined}
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
                    lastBuy={lastBuy}
                    onHistory={() => setHistoryProduct(product)}
                    onAdd={handleAdd}
                  />
                );
              })}
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

        <PersonalRecommendations
          allowedPriceTypes={allowedPriceTypes}
          vatDisplayPreference={vatDisplayPreference}
          flatTitle="Sizin icin onerilenler"
          showMissingCategories={false}
        />
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
