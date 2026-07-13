'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import customerApi, { Banner } from '@/lib/api/customer';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

const ROTATION_MS = 6500;

const getBannerHref = (banner: Banner) =>
  banner.linkUrl
    ? banner.linkUrl
    : banner.productCode
      ? `/products?search=${encodeURIComponent(banner.productCode)}`
      : null;

/**
 * Ürün listeleme ekranlarının başlık ve filtre alanı arasında gösterilen KATALOG carousel'i.
 * Veri/görsel hatası ürün listesini engellemez; aktif KATALOG bannerı yoksa hiç yer kaplamaz.
 */
export function CatalogBannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    customerApi
      .getBanners('CATALOG')
      .then(({ banners: data }) => {
        if (!mounted) return;
        setBanners((data || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      })
      .catch(() => {
        if (mounted) setBanners([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (banners.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % banners.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [banners.length, paused, reducedMotion]);

  useEffect(() => {
    if (activeIndex >= banners.length) setActiveIndex(0);
  }, [activeIndex, banners.length]);

  const goPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % banners.length);
  }, [banners.length]);

  const logClick = (banner: Banner) => {
    trackCustomerActivity({
      type: 'CLICK',
      meta: { bannerId: banner.id, position: 'CATALOG' },
    });
  };

  if (loading) {
    return (
      <div
        className="mb-4 aspect-[768/300] animate-pulse rounded-2xl border border-[var(--line)] bg-[#e9eef6] sm:aspect-[1600/280]"
        aria-hidden="true"
      />
    );
  }

  if (banners.length === 0) return null;

  return (
    <section
      className="relative mb-4 aspect-[768/300] overflow-hidden rounded-2xl border border-[#d8e2f0] bg-[#12305c] shadow-[0_5px_18px_rgba(20,34,59,.08)] sm:aspect-[1600/280]"
      aria-label="Katalog kampanyaları"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {banners.map((banner, index) => {
        const href = getBannerHref(banner);
        const desktopSrc = banner.imageUrl || banner.mobileImageUrl;
        const mobileSrc = banner.mobileImageUrl || banner.imageUrl;
        const hasImage = Boolean(desktopSrc) && !failedImages[banner.id];
        const content = (
          <>
            {hasImage ? (
              <picture className="absolute inset-0 block h-full w-full">
                <source media="(max-width: 640px)" srcSet={mobileSrc ?? undefined} />
                <img
                  src={desktopSrc ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setFailedImages((current) => ({ ...current, [banner.id]: true }))}
                />
              </picture>
            ) : (
              <div className="absolute inset-0 bg-[#15356b]">
                <ImageIcon className="absolute right-8 top-1/2 h-16 w-16 -translate-y-1/2 text-white/15" />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="absolute inset-0 flex max-w-[82%] flex-col justify-end gap-1.5 p-4 text-white sm:max-w-[68%] sm:gap-2 sm:p-6 lg:p-7">
              <h2 className="line-clamp-2 text-[18px] font-bold leading-tight drop-shadow-sm sm:text-[25px] lg:text-[28px]">
                {banner.title}
              </h2>
              {banner.subtitle && (
                <p className="line-clamp-2 text-[12.5px] leading-5 text-white/90 sm:max-w-2xl sm:text-[14px]">
                  {banner.subtitle}
                </p>
              )}
              {href && (
                <span className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#15356b] shadow-sm sm:px-3.5 sm:py-2 sm:text-[13px]">
                  {banner.buttonText || 'İncele'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </>
        );

        const slideClass = `absolute inset-0 transition-opacity duration-700 ${
          index === activeIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`;

        return href ? (
          <Link
            key={banner.id}
            href={href}
            className={slideClass}
            aria-hidden={index !== activeIndex}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => logClick(banner)}
          >
            {content}
          </Link>
        ) : (
          <div key={banner.id} className={slideClass} aria-hidden={index !== activeIndex}>
            {content}
          </div>
        );
      })}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrevious}
            aria-label="Önceki katalog bannerı"
            className="absolute left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#14223b] shadow-md transition hover:bg-white sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Sonraki katalog bannerı"
            className="absolute right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#14223b] shadow-md transition hover:bg-white sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`${index + 1}. katalog bannerını göster`}
                aria-current={index === activeIndex}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default CatalogBannerCarousel;
