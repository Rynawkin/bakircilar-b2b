'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Product, Category } from '@/types';
import customerApi, { Banner, CustomerFinancials } from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  Percent,
  Tag,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  Wallet,
  CalendarClock,
} from 'lucide-react';

// Banner gorseli yoksa veya hatali yuklenirse kart kirik gorunmesin diye placeholder.
function BannerImage({ src, alt }: { src?: string | null; alt: string }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800">
        <Sparkles className="h-16 w-16 text-white/30" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      onError={() => setError(true)}
    />
  );
}

export default function CustomerHomePage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const { addToCart } = useCartStore();

  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [stripBanners, setStripBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [featuredMode, setFeaturedMode] = useState<'discounted' | 'all'>('discounted');
  const [heroIndex, setHeroIndex] = useState(0);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);

  // Fiyat gorunurlugu (urunler sayfasiyla ayni mantik, sadece goruntuleme)
  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cari bakiye / vadesi gecen ozeti
  useEffect(() => {
    let active = true;
    customerApi
      .getFinancials()
      .then(({ financials: data }) => {
        if (active) setFinancials(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Bannerlar
  useEffect(() => {
    let active = true;
    setBannersLoading(true);
    Promise.all([
      customerApi.getBanners('HERO').catch(() => ({ banners: [] as Banner[] })),
      customerApi.getBanners('STRIP').catch(() => ({ banners: [] as Banner[] })),
    ])
      .then(([hero, strip]) => {
        if (!active) return;
        const sortFn = (a: Banner, b: Banner) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        setHeroBanners((hero.banners || []).slice().sort(sortFn));
        setStripBanners((strip.banners || []).slice().sort(sortFn));
      })
      .finally(() => {
        if (active) setBannersLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Kategoriler
  useEffect(() => {
    let active = true;
    customerApi
      .getCategories()
      .then(({ categories: data }) => {
        if (active) setCategories(data || []);
      })
      .catch((error) => console.error('Kategoriler yuklenemedi:', error));
    return () => {
      active = false;
    };
  }, []);

  // One cikan urunler: once indirimli, yoksa tum urunlerden
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        // 1) Yonetici tarafindan "one cikar" isaretli urunler
        const featuredRes = await customerApi.getProducts({ mode: 'all', featured: true, limit: 8 });
        if (!active) return;
        if (featuredRes.products?.length) {
          setFeatured(featuredRes.products);
          setFeaturedMode('all');
          return;
        }
        // 2) Yoksa indirimli urunler
        const discounted = await customerApi.getProducts({ mode: 'discounted', limit: 8 });
        if (!active) return;
        if (discounted.products?.length) {
          setFeatured(discounted.products);
          setFeaturedMode('discounted');
          return;
        }
        // 3) Yoksa cok satanlar
        const all = await customerApi.getProducts({ mode: 'all', sort: 'bestsellerValue', limit: 8 });
        if (!active) return;
        setFeatured(all.products || []);
        setFeaturedMode('all');
      } catch (error) {
        console.error('One cikan urunler yuklenemedi:', error);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  // Hero carousel otomatik kaydirma
  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [heroBanners.length]);

  const goPrev = useCallback(() => {
    setHeroIndex((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
  }, [heroBanners.length]);

  const goNext = useCallback(() => {
    setHeroIndex((prev) => (prev + 1) % heroBanners.length);
  }, [heroBanners.length]);

  // Ana kategoriler (kok seviye) - kategori agacinda parent yoksa kok kabul edilir.
  const topCategories = useMemo(() => categories.slice(0, 12), [categories]);

  const firstName = user?.name?.split(' ')[0] || '';

  const quickLinks = [
    { name: 'Indirimli Urunler', href: '/discounted-products', icon: Percent, accent: 'emerald' as const },
    { name: 'Anlasmali Urunler', href: '/agreements', icon: Tag, accent: 'primary' as const },
    { name: 'Daha Once Aldiklarim', href: '/previously-purchased', icon: Clock, accent: 'primary' as const },
    { name: 'Siparislerim', href: '/my-orders', icon: Package, accent: 'primary' as const },
  ];

  const accentClasses: Record<'emerald' | 'primary', { ring: string; bg: string; text: string }> = {
    emerald: { ring: 'ring-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    primary: { ring: 'ring-primary-100', bg: 'bg-primary-50', text: 'text-primary-600' },
  };

  const handleAdd = useCallback(
    async (args: ProductCardAddArgs) => {
      await addToCart(args);
    },
    [addToCart]
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1900px] space-y-6 px-3 py-5 sm:space-y-7 sm:px-6 sm:py-6 lg:px-8">

        {/* ── HERO BANNER CAROUSEL ─────────────────────────────────── */}
        <section>
          {bannersLoading ? (
            <div className="relative aspect-[21/9] w-full animate-pulse overflow-hidden rounded-2xl border border-[var(--line)] bg-gray-100 sm:aspect-[3/1]" />
          ) : heroBanners.length > 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm">
              <div className="relative aspect-[21/9] w-full sm:aspect-[3/1]">
                {heroBanners.map((banner, index) => {
                  const inner = (
                    <>
                      <BannerImage src={banner.imageUrl} alt={banner.title} />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-center gap-2 p-4 sm:gap-3 sm:p-10 md:max-w-[60%]">
                        <h2 className="text-base font-bold leading-tight text-white drop-shadow-sm sm:text-2xl md:text-3xl">
                          {banner.title}
                        </h2>
                        {banner.subtitle && (
                          <p className="text-sm text-white/90 sm:text-base md:max-w-md">{banner.subtitle}</p>
                        )}
                        {(banner.linkUrl || banner.productCode) && (
                          <span className="btn-primary mt-1 w-fit shadow-md">
                            {banner.buttonText || 'Kesfet'}
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </>
                  );
                  const slideClass = `absolute inset-0 transition-opacity duration-700 ${
                    index === heroIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`;
                  const linkHref = banner.linkUrl
                    ? banner.linkUrl
                    : banner.productCode
                      ? `/products?search=${encodeURIComponent(banner.productCode)}`
                      : null;
                  return linkHref ? (
                    <Link key={banner.id} href={linkHref} className={slideClass} aria-hidden={index !== heroIndex}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={banner.id} className={slideClass} aria-hidden={index !== heroIndex}>
                      {inner}
                    </div>
                  );
                })}
              </div>

              {heroBanners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Onceki banner"
                    className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow-md backdrop-blur transition hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Sonraki banner"
                    className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow-md backdrop-blur transition hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
                    {heroBanners.map((banner, index) => (
                      <button
                        key={banner.id}
                        type="button"
                        onClick={() => setHeroIndex(index)}
                        aria-label={`Banner ${index + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          index === heroIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            // Banner yoksa zarif varsayilan hos-geldin karti
            <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 px-6 py-10 shadow-sm sm:px-12 sm:py-14">
              <div className="relative z-10 max-w-xl">
                <span className="badge bg-white/15 text-white ring-1 ring-inset ring-white/25">
                  <Sparkles className="h-3.5 w-3.5" />
                  Bakircilar B2B
                </span>
                <h2 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl">
                  {firstName ? `Hos geldiniz, ${firstName}` : 'Tum kataloga hizli erisim'}
                </h2>
                <p className="mt-2 text-sm text-white/85 sm:text-base">
                  Binlerce urun, anlasmali fiyatlar ve indirimli firsatlar tek ekranda. Hemen kesfetmeye baslayin.
                </p>
                <Link href="/products" className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-md transition hover:bg-primary-50">
                  Urunlere Goz At
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <Sparkles className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/10" strokeWidth={1} />
            </div>
          )}
        </section>

        {/* ── STRIP BANNERLAR ──────────────────────────────────────── */}
        {stripBanners.length > 0 && (
          <section className="space-y-2">
            {stripBanners.map((banner) => {
              const linkHref = banner.linkUrl
                ? banner.linkUrl
                : banner.productCode
                  ? `/products?search=${encodeURIComponent(banner.productCode)}`
                  : null;
              const content = (
                <div className="flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-2.5 transition hover:border-primary-200 hover:bg-primary-50">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary-800">{banner.title}</p>
                    {banner.subtitle && (
                      <p className="truncate text-xs text-primary-700/80">{banner.subtitle}</p>
                    )}
                  </div>
                  {linkHref && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary-700">
                      {banner.buttonText || 'Goruntule'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              );
              return linkHref ? (
                <Link key={banner.id} href={linkHref}>
                  {content}
                </Link>
              ) : (
                <div key={banner.id}>{content}</div>
              );
            })}
          </section>
        )}

        {/* ── CARI OZET KUTULARI ───────────────────────────────────── */}
        {financials && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {financials && (
              <div className="flex items-center gap-3.5 rounded-xl border border-[var(--line)] bg-white p-4">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Wallet className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-[var(--ink-3)]">Cari Bakiye</div>
                  <div className="text-[21px] font-semibold tracking-tight text-[var(--ink-1)]">{formatCurrency(financials.totalBalance)}</div>
                  {financials.notDueBalance > 0 && (
                    <div className="text-[11.5px] text-[var(--ink-3)]">Vadesi gelmemiş {formatCurrency(financials.notDueBalance)}</div>
                  )}
                </div>
              </div>
            )}
            {financials && (
              <div className="flex items-center gap-3.5 rounded-xl border border-[var(--line)] bg-white p-4">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <CalendarClock className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-[var(--ink-3)]">Vadesi Geçen</div>
                  <div className="text-[21px] font-semibold tracking-tight text-amber-700">{formatCurrency(financials.pastDueBalance)}</div>
                  {financials.pastDueDate && (
                    <div className="text-[11.5px] text-[var(--ink-3)]">Son ödeme {formatDateShort(financials.pastDueDate)}</div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── HIZLI LINKLER ────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickLinks.map((link) => {
            const accent = accentClasses[link.accent];
            return (
              <Link
                key={link.href}
                href={link.href}
                className="card card-hover flex items-center gap-3 p-4"
              >
                <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${accent.bg} ${accent.text} ${accent.ring}`}>
                  <link.icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 text-sm font-semibold text-gray-800">{link.name}</span>
              </Link>
            );
          })}
        </section>

        {/* ── KATEGORILER ──────────────────────────────────────────── */}
        {topCategories.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-primary-600" />
                <h2 className="text-base font-semibold text-gray-900">Kategoriler</h2>
              </div>
              <Link href="/products" className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
                Tumunu gor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {topCategories.map((category) => (
                <Link
                  key={category.id}
                  href={`/products?categoryId=${category.id}`}
                  className="card card-hover flex items-center gap-2.5 p-3.5"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-inset ring-[var(--line)]">
                    <Package className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-gray-700">{category.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── ONE CIKAN URUNLER ────────────────────────────────────── */}
        {featured.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {featuredMode === 'discounted' ? (
                  <Percent className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Sparkles className="h-5 w-5 text-primary-600" />
                )}
                <h2 className="text-base font-semibold text-gray-900">
                  {featuredMode === 'discounted' ? 'One Cikan Indirimli Urunler' : 'One Cikan Urunler'}
                </h2>
              </div>
              <Link
                href={featuredMode === 'discounted' ? '/discounted-products' : '/products'}
                className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Tumunu gor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {featured.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  allowedPriceTypes={allowedPriceTypes}
                  defaultPriceType={defaultPriceType}
                  vatDisplayPreference={vatDisplayPreference}
                  variant={featuredMode === 'discounted' ? 'discounted' : 'default'}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
