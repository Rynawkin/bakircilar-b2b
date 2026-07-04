'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/lib/store/authStore';
import { ChevronRight, Compass, LayoutGrid } from 'lucide-react';

const CONTAINER = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';

// Backend: GET /customer/unbought-categories -> { categories: [{ id, name, mikroCode, imageUrl }] }
type UnboughtCategory = {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
};

export default function NewCategoriesPage() {
  const { user, loadUserFromStorage } = useAuthStore();

  const [categories, setCategories] = useState<UnboughtCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
    let cancelled = false;
    (async () => {
      try {
        const data = await customerApi.getUnboughtCategories();
        if (cancelled) return;
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      } catch (e) {
        if (cancelled) return;
        console.error('Denenmemis kategoriler yuklenemedi:', e);
        setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [categories]
  );

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
          <span className="font-medium text-[var(--ink-2)]">Henüz Denemediğiniz Kategoriler</span>
        </div>

        {/* Baslik */}
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Compass className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">
              Henüz Denemediğiniz Kategoriler
            </h1>
            <p className="mt-1 text-[13px] text-[var(--ink-3)]">
              Bugüne kadar hiç almadığınız ürün kategorileri — keşfedin, işletmeniz için yeni fırsatlar bulun.
            </p>
          </div>
        </div>

        {/* Icerik */}
        {isLoading ? (
          <div className={GRID}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="min-w-0 overflow-hidden rounded-2xl border border-[#e7ebf2] bg-white">
                <Skeleton variant="rectangular" height={104} className="rounded-none" />
                <div className="px-3 py-3">
                  <Skeleton variant="text" height={16} width="80%" />
                </div>
              </div>
            ))}
          </div>
        ) : hasError ? (
          <Card>
            <EmptyState
              icon="categories"
              title="Kategoriler yüklenemedi"
              description="Denenmemiş kategoriler şu anda getirilemedi. Lütfen daha sonra tekrar deneyin."
            />
          </Card>
        ) : sortedCategories.length === 0 ? (
          <Card>
            <EmptyState
              icon="categories"
              title="Tüm kategorilerden alışveriş yapmışsınız 🎉"
              description="Sizin için denenmemiş bir kategori kalmamış. Tüm ürünler sayfasından alışverişe devam edebilirsiniz."
            />
          </Card>
        ) : (
          <div className={GRID}>
            {sortedCategories.map((category) => (
              <Link
                key={category.id}
                href={`/products?categoryId=${encodeURIComponent(category.id)}`}
                className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7ebf2] bg-white transition-transform hover:-translate-y-0.5"
              >
                {category.imageUrl ? (
                  // Kategori gorseli urun gorselinden turemis (portre) olabilir -> contain ile kirpmadan goster.
                  <div className="flex h-[104px] w-full items-center justify-center overflow-hidden bg-white p-2">
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-[104px] items-center justify-center bg-gradient-to-br from-[#f4f6fa] to-[#eef2f8] text-[#c3ccd9]">
                    <LayoutGrid className="h-8 w-8" strokeWidth={1.5} />
                  </div>
                )}
                <span className="truncate px-3 py-3 text-[13px] font-semibold text-[#14223b]" title={category.name}>
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
