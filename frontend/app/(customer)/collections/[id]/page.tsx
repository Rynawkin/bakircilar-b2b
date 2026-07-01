'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Product } from '@/types';
import customerApi, { CollectionDetail } from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { ChevronRight, LayoutGrid } from 'lucide-react';

const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5';

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

  const [data, setData] = useState<CollectionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setIsLoading(true);
    setNotFound(false);
    customerApi
      .getCollection(id)
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => { await addToCart(args); }, [addToCart]);

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

        {/* Liste */}
        {isLoading ? (
          <div className={GRID}>{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
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
              description="Bu koleksiyonda şu an gösterilecek ürün yok."
            />
          </Card>
        ) : (
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
        )}
      </div>
    </div>
  );
}
