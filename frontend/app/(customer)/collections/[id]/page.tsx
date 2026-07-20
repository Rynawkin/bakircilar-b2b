'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Product } from '@/types';
import customerApi, { CollectionDetail, CustomerCatalogSort } from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadErrorState } from '@/components/ui/LoadErrorState';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { ArrowDownUp, ChevronRight, LayoutGrid, Search } from 'lucide-react';

const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';
const PAGE_SIZE = 60;
type CollectionSort = 'default' | CustomerCatalogSort;

export default function CollectionDetailPage() {
  const params = useParams();
  const id = String((params as any)?.id || '');
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

  const [data, setData] = useState<CollectionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CollectionSort>('default');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCollection = useCallback(async (options: { reset: boolean; offset: number }) => {
    if (!id) return;
    const { reset, offset: nextOffset } = options;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (reset) {
      setIsLoading(true);
      setIsLoadingMore(false);
      setData(null);
      setTotal(null);
      setOffset(0);
      setHasMore(false);
      setNotFound(false);
      setLoadError(false);
      setLoadMoreError(null);
    } else {
      setIsLoadingMore(true);
      setLoadMoreError(null);
    }
    try {
      const response = await customerApi.getCollection(
        id,
        {
          search: debouncedSearch.trim() || undefined,
          sort: sort === 'default' ? undefined : sort,
          priceType: defaultFilterPriceType,
          limit: PAGE_SIZE,
          offset: nextOffset,
        },
        { signal: controller.signal }
      );
      if (requestRef.current !== controller) return;
      const nextProducts = Array.isArray(response.products) ? response.products : [];
      setData((previous) =>
        reset || !previous
          ? response
          : { ...response, products: [...previous.products, ...nextProducts] }
      );
      const nextTotal = typeof response.total === 'number' ? response.total : null;
      setTotal(nextTotal);
      setOffset(nextOffset + nextProducts.length);
      setHasMore(
        typeof response.hasMore === 'boolean'
          ? response.hasMore
          : nextTotal !== null
            ? nextOffset + nextProducts.length < nextTotal
            : nextProducts.length === PAGE_SIZE
      );
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
      if (requestRef.current !== controller) return;
      if (reset) {
        setData(null);
        setTotal(null);
        setOffset(0);
        setHasMore(false);
        if (error?.response?.status === 404) setNotFound(true);
        else setLoadError(true);
      } else {
        setLoadMoreError('Daha fazla koleksiyon ürünü yüklenemedi. Mevcut ürünler korunuyor; tekrar deneyebilirsiniz.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (reset) setIsLoading(false);
        else setIsLoadingMore(false);
      }
    }
  }, [id, debouncedSearch, sort, defaultFilterPriceType]);

  useEffect(() => {
    loadCollection({ reset: true, offset: 0 });
    return () => requestRef.current?.abort();
  }, [loadCollection]);

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => { await addToCart(args); }, [addToCart]);
  const handleLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    loadCollection({ reset: false, offset });
  };

  const products: Product[] = (data?.products as unknown as Product[]) || [];
  const title = data?.collection?.title || 'Koleksiyon';

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
          <span className="font-medium text-[var(--ink-2)]">{title}</span>
        </div>

        {/* Baslik */}
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b]">
            <LayoutGrid className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">{title}</h1>
            {data?.collection?.subtitle && (
              <p className="mt-1 text-[13px] text-[var(--ink-3)]">{data.collection.subtitle}</p>
            )}
          </div>
        </div>

        {!notFound && !loadError && (
          <div className="sticky top-[118px] z-20 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
            <span className="text-[13px] text-[#51607a]">
              <b className="font-semibold text-[#14223b]">{total ?? products.length}</b> ürün
            </span>
            <span className="h-[22px] w-px bg-[var(--line)]" />
            <label className="flex h-[38px] min-w-0 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3">
              <ArrowDownUp className="h-[15px] w-[15px] shrink-0 text-[#64748b]" />
              <span className="hidden text-[12px] text-[#8b97ac] sm:inline">Sırala</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as CollectionSort)}
                disabled={isLoading || isLoadingMore}
                aria-label="Koleksiyon ürünlerini sırala"
                className="min-w-0 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[#14223b] outline-none disabled:cursor-wait disabled:opacity-60"
              >
                <option value="default">Koleksiyon sırası</option>
                <option value="nameAsc">İsim (A-Z)</option>
                <option value="nameDesc">İsim (Z-A)</option>
                <option value="priceAsc">Fiyat (artan)</option>
                <option value="priceDesc">Fiyat (azalan)</option>
                <option value="stockDesc">Stok (çoktan aza)</option>
                <option value="stockAsc">Stok (azdan çoğa)</option>
              </select>
            </label>
            <div className="flex h-[38px] min-w-[210px] flex-1 items-center gap-2 rounded-[9px] border border-[#e3e8f0] bg-white px-3 sm:ml-auto sm:max-w-[300px]">
              <Search className="h-[15px] w-[15px] shrink-0 text-[#9aa6b8]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Koleksiyonda ara..."
                aria-label="Koleksiyonda ara"
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#14223b] outline-none"
              />
            </div>
          </div>
        )}

        {/* Liste */}
        {isLoading ? (
          <div className={GRID}>{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : loadError ? (
          <LoadErrorState
            title="Koleksiyon yüklenemedi"
            description="Koleksiyona şu anda ulaşılamıyor. Koleksiyon veya ürünleriniz silinmiş olmayabilir."
            onRetry={() => { loadCollection({ reset: true, offset: 0 }); }}
          />
        ) : notFound ? (
          <Card>
            <EmptyState
              icon="products"
              title="Koleksiyon bulunamadı"
              description="Bu koleksiyon artık mevcut değil veya erişiminiz yok."
              actionLabel="Ana sayfaya dön"
              onAction={() => { window.location.href = '/home'; }}
            />
          </Card>
        ) : products.length === 0 ? (
          <Card>
            <EmptyState
              icon="products"
              title="Ürün bulunamadı"
              description={search ? 'Aramanızla eşleşen koleksiyon ürünü bulunamadı.' : 'Bu koleksiyonda şu an gösterilecek ürün yok.'}
            />
          </Card>
        ) : (
          <div>
            <div className={GRID}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  allowedPriceTypes={allowedPriceTypes}
                  defaultPriceType={defaultPriceType}
                  vatDisplayPreference={vatDisplayPreference}
                  variant="default"
                  onAdd={handleAdd}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex flex-col items-center gap-2.5">
                {loadMoreError && (
                  <p role="alert" className="text-center text-sm font-medium text-amber-700">
                    {loadMoreError}
                  </p>
                )}
                <Button
                  className="rounded-lg border border-[var(--line-strong)] bg-white px-6 font-semibold text-primary-600 hover:bg-[var(--surface-0)]"
                  onClick={handleLoadMore}
                  isLoading={isLoadingMore}
                  disabled={isLoadingMore}
                >
                  {loadMoreError ? 'Tekrar dene' : 'Daha fazla yükle'}
                </Button>
                {total !== null && (
                  <span className="text-xs text-[var(--ink-3)]">{products.length} / {total} ürün gösteriliyor</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
