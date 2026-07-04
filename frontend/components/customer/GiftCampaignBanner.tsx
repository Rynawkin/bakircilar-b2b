'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gift, ArrowRight } from 'lucide-react';
import { customerApi, GiftCampaignActive } from '@/lib/api/customer';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

// Kapsam PRODUCT_IDS iken banner altinda mini serit gosterilecek azami urun sayisi
const MAX_SCOPE_STRIP_PRODUCTS = 8;

/**
 * Anasayfa hediyeli kampanya (GWP) banner'i. /gift-campaign/active'ten beslenir.
 * Aktif kampanya yoksa (veya hedef disi) HICBIR SEY render etmez. Salt gosterim +
 * ilerleme cubugu; hediye SECIMI sepette yapilir. CTA kapsam turune gore hedeflenir:
 * CATEGORY_IDS -> ilk kategorinin urun listesi, PRODUCT_IDS -> mini urun seridi.
 */
export function GiftCampaignBanner() {
  const router = useRouter();
  const [campaign, setCampaign] = useState<GiftCampaignActive | null>(null);
  const [scopeProducts, setScopeProducts] = useState<Product[]>([]);

  useEffect(() => {
    let mounted = true;
    customerApi
      .getActiveGiftCampaign()
      .then((data) => {
        if (mounted) setCampaign(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Kapsam PRODUCT_IDS ve urun sayisi makulse mini serit icin urunleri getir
  useEffect(() => {
    setScopeProducts([]);
    if (!campaign?.active || campaign.qualifyingScope?.type !== 'PRODUCT_IDS') return;
    const ids = campaign.qualifyingScope.productIds || [];
    if (ids.length === 0 || ids.length > MAX_SCOPE_STRIP_PRODUCTS) return;
    let mounted = true;
    Promise.all(ids.map((id) => customerApi.getProductById(id).catch(() => null))).then((list) => {
      if (mounted) setScopeProducts(list.filter(Boolean) as Product[]);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  if (!campaign || !campaign.active) return null;

  const threshold = campaign.threshold || 0;
  const total = campaign.qualifyingTotal || 0;
  const pct = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 0;
  const qualified = !!campaign.qualified;
  const remaining = campaign.remaining || 0;
  const gifts = campaign.gifts || [];

  // CTA hedefi: kapsam turune gore
  const scopeType = campaign.qualifyingScope?.type || 'ALL';
  const firstCategoryId = campaign.qualifyingScope?.categoryIds?.[0];
  const ctaHref =
    scopeType === 'CATEGORY_IDS' && firstCategoryId
      ? `/products?categoryId=${encodeURIComponent(firstCategoryId)}`
      : '/products';
  const ctaText = campaign.buttonText || 'Kampanya ürünlerini gör';

  // Banner tik olcumu (best-effort; hata yutulur)
  const logBannerClick = () => {
    if (!campaign.id) return;
    trackCustomerActivity({ type: 'CLICK', meta: { bannerId: campaign.id, position: 'GWP' } });
  };

  const handleCtaClick = () => {
    logBannerClick();
    router.push(ctaHref);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-[#0f2a57] to-[#15356b] p-4 sm:p-5 text-white">
      {campaign.bannerImageUrl && (
        <>
          {/* GWP kampanya banner'inin ayri mobil gorseli yok; tek gorsel <picture> ile sarilir (yapisal tutarlilik) */}
          <picture>
            <img src={campaign.bannerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f2a57]/95 via-[#0f2a57]/80 to-[#15356b]/55" />
        </>
      )}
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Sol: rozet + baslik + mekanik + ilerleme */}
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200">
            <Gift className="h-3.5 w-3.5" />
            SİZE ÖZEL · HEDİYELİ KAMPANYA
          </span>
          <h2 className="mt-2 text-lg font-bold leading-tight sm:text-xl">{campaign.title}</h2>
          {campaign.subtitle && (
            <p className="mt-1 text-[13px] text-white/70">{campaign.subtitle}</p>
          )}

          {/* Ilerleme cubugu */}
          <div className="mt-3 max-w-md">
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="text-white/70">
                Uygun tutar: <b className="text-white tabular-nums">{formatCurrency(total)}</b>
              </span>
              <span className="text-white/70 tabular-nums">/ {formatCurrency(threshold)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium">
              {qualified ? (
                <span className="text-emerald-300">Tebrikler, hediye hakkı kazandınız! Sepette hediyenizi seçin.</span>
              ) : (
                <span className="text-white/80">
                  Kampanya kapsamındaki ürünlerden <b className="text-emerald-300">{formatCurrency(remaining)}</b> daha
                  ekleyin, hediyenizi kazanın.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Sag: hediye onizleme + CTA */}
        <div className="flex flex-col items-start gap-3 lg:items-end">
          {gifts.length > 0 && (
            <div className="flex items-center gap-2">
              {gifts.slice(0, 4).map((gift) => (
                <div
                  key={gift.id}
                  title={gift.name}
                  className="h-12 w-12 overflow-hidden rounded-lg border border-white/20 bg-white/95"
                >
                  {gift.imageUrl ? (
                    <img src={gift.imageUrl} alt={gift.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#15356b]">
                      <Gift className="h-5 w-5" />
                    </div>
                  )}
                </div>
              ))}
              {gifts.length > 4 && (
                <span className="text-[12px] text-white/70">+{gifts.length - 4}</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleCtaClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 transition-colors"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Kapsam PRODUCT_IDS: kampanya urunleri mini seridi */}
      {scopeProducts.length > 0 && (
        <div className="relative z-10 mt-4 border-t border-white/15 pt-3">
          <div className="mb-2 text-[11.5px] font-semibold tracking-wide text-white/70">
            KAMPANYA KAPSAMINDAKİ ÜRÜNLER
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {scopeProducts.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                onClick={logBannerClick}
                className="flex w-[168px] flex-none items-center gap-2 rounded-lg bg-white/95 p-2 transition-colors hover:bg-white"
              >
                <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-md bg-white">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#15356b]">
                      <Gift className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <span className="line-clamp-2 text-[11px] font-medium leading-snug text-[#14223b]">
                  {p.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default GiftCampaignBanner;
