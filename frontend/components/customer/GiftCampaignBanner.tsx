'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, ArrowRight } from 'lucide-react';
import { customerApi, GiftCampaignActive } from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Anasayfa hediyeli kampanya (GWP) banner'i. /gift-campaign/active'ten beslenir.
 * Aktif kampanya yoksa (veya hedef disi) HICBIR SEY render etmez. Salt gosterim +
 * ilerleme cubugu; hediye SECIMI sepette yapilir.
 */
export function GiftCampaignBanner() {
  const router = useRouter();
  const [campaign, setCampaign] = useState<GiftCampaignActive | null>(null);

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

  if (!campaign || !campaign.active) return null;

  const threshold = campaign.threshold || 0;
  const total = campaign.qualifyingTotal || 0;
  const pct = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 0;
  const qualified = !!campaign.qualified;
  const remaining = campaign.remaining || 0;
  const gifts = campaign.gifts || [];

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-[#0f2a57] to-[#15356b] p-4 sm:p-5 text-white overflow-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
            onClick={() => router.push('/products')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 transition-colors"
          >
            {campaign.buttonText || 'Kampanya ürünlerini gör'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

export default GiftCampaignBanner;
