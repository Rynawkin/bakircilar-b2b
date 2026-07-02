'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import customerApi, { Banner } from '@/lib/api/customer';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

/**
 * Ürün ızgarası içi (GRID) banner — Tüm Ürünler'de span-2 kart. Admin 'GRID' banner'ından
 * beslenir; yoksa statik indirimli-fırsatlar promosu gösterir.
 */
export function InGridBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let mounted = true;
    customerApi
      .getBanners('GRID')
      .then(({ banners }) => {
        if (mounted && banners && banners.length > 0) setBanner(banners[0]);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const href = banner
    ? banner.linkUrl || (banner.productCode ? `/products?search=${encodeURIComponent(banner.productCode)}` : '/discounted-products')
    : '/discounted-products';

  // Banner tik olcumu (best-effort; hata trackCustomerActivity icinde yutulur)
  const handleClick = () => {
    if (!banner) return;
    trackCustomerActivity({ type: 'CLICK', meta: { bannerId: banner.id, position: banner.position || 'GRID' } });
  };

  return (
    <Link href={href} onClick={handleClick} className="relative col-span-2 flex min-h-[150px] flex-col justify-center overflow-hidden rounded-2xl p-5 text-white">
      {banner?.imageUrl ? (
        <>
          <img src={banner.imageUrl} alt={banner.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#081630]/85 to-[#081630]/25" />
          <div className="relative">
            <div className="text-[20px] font-bold leading-tight sm:text-[22px]">{banner.title}</div>
            {banner.subtitle && <p className="mt-1 max-w-[85%] text-[13px] text-white/85">{banner.subtitle}</p>}
            <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold">
              {banner.buttonText || 'Gör'} <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-[#12305c] to-[#1c4a8f]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#081630]/70 to-transparent" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold tracking-wide">KAMPANYA</span>
            <div className="mt-2 text-[20px] font-bold leading-tight sm:text-[22px]">İndirimli fırsatları kaçırmayın</div>
            <p className="mt-1 max-w-[85%] text-[13px] text-white/80">Net fiyat avantajlı ürünlerde sınırlı stok.</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold">
              Fırsatları gör <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </>
      )}
    </Link>
  );
}

export default InGridBanner;
