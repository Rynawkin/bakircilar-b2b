'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Product, Category } from '@/types';
import customerApi, { Banner, CustomerFinancials, CollectionCard } from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { ProductCard, ProductCardAddArgs } from '@/components/customer/ProductCard';
import { GiftCampaignBanner } from '@/components/customer/GiftCampaignBanner';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { formatCurrency } from '@/lib/utils/format';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import {
  Percent,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  Wallet,
  Headphones,
} from 'lucide-react';

// Banner gorseli yoksa veya hatali yuklenirse kart kirik gorunmesin diye placeholder.
// Dar (<=640px) ekranlarda mobileSrc varsa o kullanilir; yoksa src'ye duser (ve tersi).
function BannerImage({ src, mobileSrc, alt }: { src?: string | null; mobileSrc?: string | null; alt: string }) {
  const [error, setError] = useState(false);
  // Geniş ve mobil görsellerin ikisinden en az biri olmalı; ana <img> için ikisinden dolu olanı seç.
  const desktopSrc = src || mobileSrc;
  const narrowSrc = mobileSrc || src;
  if (!desktopSrc || error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#12305c] to-[#163a72]">
        <Sparkles className="h-16 w-16 text-white/20" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <picture className="block h-full w-full">
      <source media="(max-width: 640px)" srcSet={narrowSrc ?? undefined} />
      <img src={desktopSrc} alt={alt} className="h-full w-full object-cover" onError={() => setError(true)} />
    </picture>
  );
}

export default function CustomerHomePage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const { addToCart } = useCartStore();

  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [sideBanners, setSideBanners] = useState<Banner[]>([]);
  const [stripBanners, setStripBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [featuredMode, setFeaturedMode] = useState<'discounted' | 'all'>('discounted');
  const [purchased, setPurchased] = useState<Product[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroIntervalMs, setHeroIntervalMs] = useState(6000);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);
  const [adminCollections, setAdminCollections] = useState<CollectionCard[]>([]);

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
    customerApi.getFinancials().then(({ financials: data }) => {
      if (active) setFinancials(data);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Admin-yonetimli koleksiyonlar (varsa sabit 3 kartin yerine gecer)
  useEffect(() => {
    let active = true;
    customerApi.getActiveCollections().then(({ collections }) => {
      if (active) setAdminCollections(collections || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Bannerlar (hero + dikey + slim strip)
  useEffect(() => {
    let active = true;
    setBannersLoading(true);
    Promise.all([
      customerApi.getBanners('HERO').catch(() => ({ banners: [] as Banner[], heroIntervalMs: undefined as number | undefined })),
      customerApi.getBanners('SIDE').catch(() => ({ banners: [] as Banner[] })),
      customerApi.getBanners('STRIP').catch(() => ({ banners: [] as Banner[] })),
    ]).then(([hero, side, strip]) => {
      if (!active) return;
      const sortFn = (a: Banner, b: Banner) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      setHeroBanners((hero.banners || []).slice().sort(sortFn));
      setSideBanners((side.banners || []).slice().sort(sortFn));
      setStripBanners((strip.banners || []).slice().sort(sortFn));
      if (typeof hero.heroIntervalMs === 'number' && hero.heroIntervalMs >= 2000) {
        setHeroIntervalMs(hero.heroIntervalMs);
      }
    }).finally(() => {
      if (active) setBannersLoading(false);
    });
    return () => { active = false; };
  }, []);

  // Kategoriler
  useEffect(() => {
    let active = true;
    customerApi.getCategories().then(({ categories: data }) => {
      if (active) setCategories(data || []);
    }).catch((error) => console.error('Kategoriler yuklenemedi:', error));
    return () => { active = false; };
  }, []);

  // One cikan urunler: once isaretli, yoksa indirimli, yoksa cok satanlar
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const featuredRes = await customerApi.getProducts({ mode: 'all', featured: true, limit: 8 });
        if (!active) return;
        if (featuredRes.products?.length) { setFeatured(featuredRes.products); setFeaturedMode('all'); return; }
        const discounted = await customerApi.getProducts({ mode: 'discounted', limit: 8 });
        if (!active) return;
        if (discounted.products?.length) { setFeatured(discounted.products); setFeaturedMode('discounted'); return; }
        const all = await customerApi.getProducts({ mode: 'all', sort: 'bestsellerValue', limit: 8 });
        if (!active) return;
        setFeatured(all.products || []); setFeaturedMode('all');
      } catch (error) {
        console.error('One cikan urunler yuklenemedi:', error);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  // Sik aldiklariniz (daha once alinan urunler serit)
  useEffect(() => {
    let active = true;
    customerApi.getProducts({ mode: 'purchased', limit: 12 }).then((res) => {
      if (active) setPurchased(res.products || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Hero carousel otomatik kaydirma (gecis suresi admin ayarindan gelir)
  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroBanners.length);
    }, Math.max(2000, heroIntervalMs));
    return () => clearInterval(interval);
  }, [heroBanners.length, heroIntervalMs]);

  const goPrev = useCallback(() => {
    setHeroIndex((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
  }, [heroBanners.length]);
  const goNext = useCallback(() => {
    setHeroIndex((prev) => (prev + 1) % heroBanners.length);
  }, [heroBanners.length]);

  // Kategori kesfi: her yuklenişte RASTGELE kategoriler (alfabetik degil), kayan serit icin en fazla 12
  const topCategories = useMemo(() => {
    const arr = [...categories];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 12);
  }, [categories]);
  const firstName = user?.name?.split(' ')[0] || '';

  const handleAdd = useCallback(async (args: ProductCardAddArgs) => {
    await addToCart(args);
  }, [addToCart]);

  const bannerHref = (banner: Banner) =>
    banner.linkUrl
      ? banner.linkUrl
      : banner.productCode
        ? `/products?search=${encodeURIComponent(banner.productCode)}`
        : null;

  // Banner tik olcumu: mevcut musteri aktivite olay altyapisi (best-effort, hata yutulur)
  const logBannerClick = (banner: Banner) => {
    trackCustomerActivity({ type: 'CLICK', meta: { bannerId: banner.id, position: banner.position } });
  };

  // "Sizin icin koleksiyonlar" — gercek hedeflere bagli (admin kuralli koleksiyon backend'i sonra)
  const collections = [
    { t: 'İndirimli Fırsatlar', d: 'Net fiyat avantajları', href: '/discounted-products', g: 'linear-gradient(150deg,#047857,#0a9d6b)', fg: '#c7f1de' },
    { t: 'Çok Satanlar', d: 'En çok tercih edilenler', href: '/products', g: 'linear-gradient(150deg,#15356b,#1c4a8f)', fg: '#c2d4f0' },
    { t: 'Daha Önce Aldıklarınız', d: 'Hızlı yeniden sipariş', href: '/previously-purchased', g: 'linear-gradient(150deg,#7c3aed,#9560f0)', fg: '#e2d4fb' },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f6fa]">
      <div className="mx-auto w-full max-w-[1900px]">
        <div className="space-y-7 px-3 py-5 sm:px-6 sm:py-6 lg:px-8">

          {/* ── BAKIYE KUTUSU ─────────────────────────────────────── */}
          {financials && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[#e7ebf2] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
              <div>
                <div className="text-[12px] font-medium text-[#8b97ac]">Cari bakiye</div>
                <div className="text-[22px] font-semibold tabular-nums tracking-tight text-[#14223b]">{formatCurrency(financials.totalBalance)}</div>
              </div>
              {financials.pastDueBalance > 0 && (
                <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-1.5">
                  <div className="text-[11.5px] font-semibold text-[#b45309]">Vadesi geçen</div>
                  <div className="text-[16px] font-semibold tabular-nums text-[#b45309]">{formatCurrency(financials.pastDueBalance)}</div>
                </div>
              )}
              <Link
                href="/invoices"
                className="inline-flex items-center gap-2 rounded-[10px] bg-[#b45309] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#96450a]"
              >
                <Wallet className="h-4 w-4" />
                Ödeme / Ekstre
              </Link>
              {financials.notDueBalance > 0 && (
                <div className="ml-auto text-right">
                  <div className="text-[12px] font-medium text-[#8b97ac]">Vadesi gelmemiş</div>
                  <div className="text-[15px] font-semibold tabular-nums text-[#51607a]">{formatCurrency(financials.notDueBalance)}</div>
                </div>
              )}
            </div>
          )}

          {/* ── HERO + DIKEY BANNER ─────────────────────────────────── */}
          {/* Grid 3.5fr:1fr + items-start; HERO 2.8:1 ile SIDE 4:5 ayni yukseklige gelir -> HERO altinda bosluk yok, kirpma yok */}
          <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3.5fr_1fr]">
            {/* Hero (carousel) */}
            {/* Kutu orani = yukleme orani: mobil 768x600, masaustu 2.8:1 (1680x600) -> gorsel tam gorunur, ekstra kirpma yok */}
            <div className="relative aspect-[768/600] overflow-hidden rounded-2xl border border-[var(--line)] bg-[#12305c] lg:aspect-[2.8/1]">
              {bannersLoading ? (
                <div className="h-full w-full animate-pulse bg-gray-100" />
              ) : heroBanners.length > 0 ? (
                <>
                  {heroBanners.map((banner, index) => {
                    const href = bannerHref(banner);
                    const inner = (
                      <>
                        <BannerImage src={banner.imageUrl} mobileSrc={banner.mobileImageUrl} alt={banner.title} />
                        {/* Metin altta -> soldan degil ALTTAN karart (sol taraf artik karanlik degil) */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 sm:p-9 md:max-w-[70%]">
                          <h2 className="text-xl font-bold leading-tight text-white drop-shadow-sm sm:text-3xl lg:text-[38px]">
                            {banner.title}
                          </h2>
                          {banner.subtitle && (
                            <p className="text-sm text-white/90 sm:text-base md:max-w-md">{banner.subtitle}</p>
                          )}
                          {href && (
                            <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#15356b] shadow-md">
                              {banner.buttonText || 'Keşfet'}
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </>
                    );
                    const cls = `absolute inset-0 transition-opacity duration-700 ${index === heroIndex ? 'opacity-100' : 'pointer-events-none opacity-0'}`;
                    return href ? (
                      <Link
                        key={banner.id}
                        href={href}
                        className={cls}
                        aria-hidden={index !== heroIndex}
                        onClick={() => logBannerClick(banner)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={banner.id} className={cls} aria-hidden={index !== heroIndex}>{inner}</div>
                    );
                  })}
                  {heroBanners.length > 1 && (
                    <>
                      <button type="button" onClick={goPrev} aria-label="Önceki" className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow-md backdrop-blur transition hover:bg-white">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={goNext} aria-label="Sonraki" className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow-md backdrop-blur transition hover:bg-white">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
                        {heroBanners.map((banner, index) => (
                          <button key={banner.id} type="button" onClick={() => setHeroIndex(index)} aria-label={`Banner ${index + 1}`} className={`h-2 rounded-full transition-all ${index === heroIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                // Fallback editoryal hero
                <Link href="/products" className="absolute inset-0 block">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#12305c] to-[#163a72]" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#081630]/85 via-[#081630]/45 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 sm:p-9">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90">
                      <Sparkles className="h-3.5 w-3.5" /> Bakırcılar B2B
                    </span>
                    <h2 className="text-xl font-bold leading-tight text-white sm:text-3xl lg:text-[38px]">
                      {firstName ? `Hoş geldiniz, ${firstName}` : 'Tüm kataloğa hızlı erişim'}
                    </h2>
                    <p className="max-w-md text-sm text-white/85 sm:text-base">
                      Binlerce ürün, anlaşmalı fiyatlar ve indirimli fırsatlar tek ekranda.
                    </p>
                    <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#15356b] shadow-md">
                      Ürünlere göz at <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              )}
            </div>

            {/* Dikey banner (SIDE) veya fallback promo */}
            {(() => {
              const side = sideBanners[0];
              const href = side ? bannerHref(side) : '/discounted-products';
              const inner = side ? (
                <>
                  <BannerImage src={side.imageUrl} mobileSrc={side.mobileImageUrl} alt={side.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end gap-1.5 p-5">
                    <h3 className="text-lg font-bold leading-tight text-white">{side.title}</h3>
                    {side.subtitle && <p className="text-sm text-white/85">{side.subtitle}</p>}
                    {bannerHref(side) && (
                      <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-white">
                        {side.buttonText || 'Gör'} <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#047857] to-[#0a9d6b]" />
                  <div className="absolute inset-0 flex flex-col justify-end gap-1.5 p-5 text-white">
                    <Percent className="h-7 w-7 text-white/80" />
                    <h3 className="text-lg font-bold leading-tight">İndirimli Fırsatlar</h3>
                    <p className="text-sm text-white/85">Net fiyat avantajlı ürünleri keşfedin.</p>
                    <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold">
                      Keşfet <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </>
              );
              return (
                <Link
                  href={href || '/products'}
                  onClick={side ? () => logBannerClick(side) : undefined}
                  className="relative hidden aspect-[4/5] overflow-hidden rounded-2xl border border-[var(--line)] bg-[#12305c] lg:block"
                >
                  {inner}
                </Link>
              );
            })()}
          </section>

          {/* ── SLIM STRIP (admin banner) ───────────────────────────── */}
          {stripBanners.length > 0 && stripBanners.map((banner) => {
            const href = bannerHref(banner);
            const content = (banner.imageUrl || banner.mobileImageUrl) ? (
              // Kutu orani = yukleme orani: mobil 375x160, masaustu 1200x140 + min-h-[92px] -> gorsel tam gorunur
              <div className="relative aspect-[375/160] min-h-[92px] overflow-hidden rounded-[14px] border border-[#d9e2f2] sm:aspect-[1200/140]">
                <picture>
                  {/* Dar ekranda (<=640px) mobil görsel varsa onu kullan, yoksa geniş görsele düş */}
                  <source media="(max-width: 640px)" srcSet={(banner.mobileImageUrl || banner.imageUrl) ?? undefined} />
                  <img src={(banner.imageUrl || banner.mobileImageUrl) ?? undefined} alt={banner.title} className="absolute inset-0 h-full w-full object-cover" />
                </picture>
                {(banner.title || banner.subtitle) && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
                    <div className="absolute inset-0 flex flex-col justify-center gap-0.5 px-5 text-white">
                      {banner.title && <p className="text-[14px] font-semibold drop-shadow-sm sm:text-[15px]">{banner.title}</p>}
                      {banner.subtitle && <p className="text-[12.5px] text-white/85">{banner.subtitle}</p>}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-[92px] items-center gap-3 overflow-hidden rounded-[14px] border border-[#d9e2f2] bg-gradient-to-r from-[#eef2fa] to-[#f5f8fd] px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#14223b]">{banner.title}</p>
                  {banner.subtitle && <p className="truncate text-[12.5px] text-[#51607a]">{banner.subtitle}</p>}
                </div>
                {href && (
                  <span className="flex flex-shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#15356b]">
                    {banner.buttonText || 'Gör'} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            );
            return href ? (
              <Link key={banner.id} href={href} onClick={() => logBannerClick(banner)}>
                {content}
              </Link>
            ) : (
              <div key={banner.id}>{content}</div>
            );
          })}

          {/* ── SIZIN ICIN KOLEKSIYONLAR ────────────────────────────── */}
          <section>
            <div className="mb-3.5">
              <h3 className="text-[18px] font-semibold tracking-tight text-[#14223b]">Sizin için koleksiyonlar</h3>
              <p className="mt-0.5 text-[13px] text-[#8b97ac]">Alışverişinizi hızlandıracak seçkiler</p>
            </div>
            {adminCollections.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {adminCollections.map((c) => (
                  <Link
                    key={c.id}
                    href={c.href}
                    className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl px-[22px] py-5 text-white transition-transform hover:-translate-y-0.5"
                    style={
                      c.imageUrl
                        ? undefined
                        : { background: c.color || 'linear-gradient(150deg,#15356b,#1c4a8f)' }
                    }
                  >
                    {c.imageUrl && (
                      <>
                        <img src={c.imageUrl} alt={c.title} className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/10" />
                      </>
                    )}
                    <div className="relative">
                      <div className="text-[19px] font-semibold tracking-tight drop-shadow-sm">{c.title}</div>
                      {c.subtitle && <div className="mt-1 text-[13px] text-white/85">{c.subtitle}</div>}
                    </div>
                    <span className="relative mt-3.5 flex items-center gap-1.5 text-[13px] font-semibold">
                      Keşfet <ArrowRight className="h-[15px] w-[15px]" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {collections.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl px-[22px] py-5 text-white transition-transform hover:-translate-y-0.5"
                    style={{ background: c.g }}
                  >
                    <div>
                      <div className="text-[19px] font-semibold tracking-tight">{c.t}</div>
                      <div className="mt-1 text-[13px]" style={{ color: c.fg }}>{c.d}</div>
                    </div>
                    <span className="mt-3.5 flex items-center gap-1.5 text-[13px] font-semibold">
                      Keşfet <ArrowRight className="h-[15px] w-[15px]" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ── KATEGORI KESFI (kayan serit + gercek gorseller) ──────── */}
          {topCategories.length > 0 && (
            <section>
              <div className="mb-3.5 flex items-baseline justify-between">
                <h3 className="text-[18px] font-semibold tracking-tight text-[#14223b]">Kategori keşfi</h3>
                <Link href="/products" className="flex items-center gap-1 text-[13px] font-medium text-[#15356b]">
                  Tüm kategoriler <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {/* Kenarlar maskelenir; ic serit x2 kopyalanir -> kesintisiz dongu. Hover'da animasyon durur. */}
              <div
                className="group relative overflow-hidden"
                style={{
                  WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)',
                  maskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)',
                }}
              >
                <div className="flex w-max gap-3.5 animate-[bkr-marquee_46s_linear_infinite] group-hover:[animation-play-state:paused]">
                  {[...topCategories, ...topCategories].map((category, idx) => {
                    const isClone = idx >= topCategories.length;
                    return (
                      <Link
                        key={`${category.id}-${idx}`}
                        href={`/products?categoryId=${category.id}`}
                        aria-hidden={isClone}
                        tabIndex={isClone ? -1 : undefined}
                        className="group/card flex w-[206px] flex-none flex-col overflow-hidden rounded-xl border border-[#e7ebf2] bg-white shadow-[0_1px_2px_rgba(20,34,59,.04)] transition-all hover:-translate-y-0.5 hover:border-[#d3deef] hover:shadow-[0_6px_16px_rgba(20,34,59,.07)]"
                      >
                        {category.imageUrl ? (
                          // Otomatik (urun) gorseli genelde portre -> contain ile TAMAMI gorunsun (kirpma yok).
                          // Admin yukledigi gorsel ise kutuyu doldursun (cover).
                          <div className={`flex h-[104px] w-full items-center justify-center overflow-hidden ${category.autoImage ? 'bg-white p-2' : ''}`}>
                            <img
                              src={category.imageUrl}
                              alt={category.name}
                              className={`h-full w-full ${category.autoImage ? 'object-contain' : 'object-cover'}`}
                            />
                          </div>
                        ) : (
                          <div className="flex h-[104px] items-center justify-center bg-gradient-to-br from-[#f4f6fa] to-[#eef2f8] text-[#c3ccd9]">
                            <LayoutGrid className="h-8 w-8" strokeWidth={1.5} />
                          </div>
                        )}
                        <span className="truncate px-4 py-3 text-[13px] font-semibold text-[#14223b]">{category.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── SIK ALDIKLARINIZ (serit) ────────────────────────────── */}
          {purchased.length > 0 && (
            <section>
              <div className="mb-3.5 flex items-end justify-between">
                <div>
                  <h3 className="text-[18px] font-semibold tracking-tight text-[#14223b]">Sık aldıklarınız</h3>
                  <p className="mt-0.5 text-[13px] text-[#8b97ac]">Bir bakışta yeniden sipariş</p>
                </div>
                <Link href="/previously-purchased" className="flex items-center gap-1 text-[13px] font-medium text-[#15356b]">
                  Tümü <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1.5">
                {purchased.map((product) => (
                  <div key={product.id} className="w-[236px] flex-none">
                    <ProductCard
                      product={product}
                      allowedPriceTypes={allowedPriceTypes}
                      defaultPriceType={defaultPriceType}
                      vatDisplayPreference={vatDisplayPreference}
                      variant="default"
                      onAdd={handleAdd}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── HEDIYELI KAMPANYA (GWP) ─────────────────────────────── */}
          <GiftCampaignBanner />

          {/* ── DESTEK BLOGU ────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-[#e7ebf2] bg-white shadow-[0_1px_2px_rgba(20,34,59,.04)]">
            <div className="flex flex-col gap-3.5 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b]">
                  <Headphones className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[16px] font-semibold tracking-tight text-[#14223b]">Bir sorunuz mu var?</div>
                  <div className="mt-0.5 text-[13px] text-[#8b97ac]">
                    Sipariş, teslimat ve fatura konularında yanınızdayız — talep oluşturun, ekibimiz dönsün.
                  </div>
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2.5">
                <Link href="/my-requests" className="inline-flex items-center gap-2 rounded-[10px] bg-[#15356b] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1c4585]">
                  <Package className="h-4 w-4" /> Talep oluştur
                </Link>
                <Link href="/my-requests" className="inline-flex items-center gap-2 rounded-[10px] border border-[#d8e0ec] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#15356b] hover:bg-[#f6f8fc]">
                  Taleplerim
                </Link>
              </div>
            </div>
          </section>

          {/* ── HAFTANIN ONE CIKANLARI ──────────────────────────────── */}
          {featured.length > 0 && (
            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  {featuredMode === 'discounted' ? (
                    <Percent className="h-[18px] w-[18px] text-emerald-600" />
                  ) : (
                    <Sparkles className="h-[18px] w-[18px] text-[#15356b]" />
                  )}
                  <h3 className="text-[18px] font-semibold tracking-tight text-[#14223b]">
                    {featuredMode === 'discounted' ? 'Öne çıkan indirimli ürünler' : 'Haftanın öne çıkanları'}
                  </h3>
                </div>
                <Link
                  href={featuredMode === 'discounted' ? '/discounted-products' : '/products'}
                  className="flex items-center gap-1 text-[13px] font-medium text-[#15356b]"
                >
                  Tümünü gör <ArrowRight className="h-4 w-4" />
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
    </div>
  );
}
