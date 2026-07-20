'use client';

import { useEffect, useState } from 'react';
import { Gift, Check, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { customerApi, GiftCampaignActive } from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Sepet hediye secici (GWP). /gift-campaign/active'ten beslenir.
 * - Aktif kampanya yoksa HICBIR SEY render etmez.
 * - Baraj altindaysa: ilerleme + "₺X daha ekleyin", secici kilitli.
 * - Baraj gecildiyse: hediye kartlari (max giftPickCount secilir), secim sepete kaydedilir
 *   (B2B DB — Mikro degil), ₺0,00 · Bedelsiz olarak isaretlenir.
 * refreshKey degisince (sepet degisince) yeniden yuklenir.
 */
export function CartGiftPicker({ refreshKey }: { refreshKey?: number }) {
  const [campaign, setCampaign] = useState<GiftCampaignActive | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    customerApi
      .getActiveGiftCampaign()
      .then((data) => {
        if (!mounted) return;
        setCampaign(data);
        setSelected(data.selectedGiftProductIds || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (!campaign || !campaign.active) return null;

  const threshold = campaign.threshold || 0;
  const total = campaign.qualifyingTotal || 0;
  const pct = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 0;
  const qualified = !!campaign.qualified;
  const remaining = campaign.remaining || 0;
  const pickCount = campaign.giftPickCount || 1;
  const gifts = campaign.gifts || [];

  const toggle = async (productId: string) => {
    if (!qualified || saving) return;
    const previous = selected;
    let next: string[];
    if (selected.includes(productId)) {
      next = selected.filter((x) => x !== productId);
    } else if (pickCount === 1) {
      next = [productId];
    } else if (selected.length < pickCount) {
      next = [...selected, productId];
    } else {
      return; // limit dolu
    }
    setSelected(next);
    setSaving(true);
    try {
      const result = await customerApi.setGiftCartSelection(campaign.id || null, next);
      if (!result.success) {
        throw new Error(result.error || 'Hediye seçimi kaydedilemedi.');
      }
    } catch (error: any) {
      setSelected(previous);
      toast.error(error?.response?.data?.error || error?.message || 'Hediye seçimi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#0f2a57]">{campaign.title || 'Hediyeli kampanya'}</h3>
          {campaign.subtitle && <p className="text-[12px] text-[#51607a]">{campaign.subtitle}</p>}
        </div>
      </div>

      {/* Ilerleme */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[12px] text-[#51607a]">
          <span>
            Uygun tutar: <b className="tabular-nums text-[#0f2a57]">{formatCurrency(total)}</b>
          </span>
          <span className="tabular-nums">/ {formatCurrency(threshold)}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {!qualified && (
          <p className="mt-1.5 text-[12.5px] font-medium text-[#b45309]">
            Kampanya kapsamındaki ürünlerden <b>{formatCurrency(remaining)}</b> daha ekleyin, hediyenizi seçin.
          </p>
        )}
        {qualified && (
          <p className="mt-1.5 text-[12.5px] font-medium text-emerald-700">
            Hediye hakkı kazandınız — {pickCount > 1 ? `${pickCount} hediye` : '1 hediye'} seçin.
          </p>
        )}
      </div>

      {/* Hediye kartlari */}
      {gifts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {gifts.map((gift) => {
            const isSelected = selected.includes(gift.productId);
            const disabled = !qualified;
            return (
              <button
                type="button"
                key={gift.id}
                onClick={() => toggle(gift.productId)}
                disabled={disabled || saving}
                className={`relative flex flex-col rounded-xl border bg-white p-2 text-left transition-all ${
                  isSelected ? 'border-emerald-500 ring-2 ring-emerald-500' : 'border-[#e7ebf2]'
                } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-emerald-400'}`}
              >
                {isSelected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                {disabled && (
                  <span className="absolute right-1.5 top-1.5 text-[#9aa6b8]">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                )}
                <div className="mx-auto h-16 w-16 overflow-hidden rounded-lg bg-white">
                  {gift.imageUrl ? (
                    <img src={gift.imageUrl} alt={gift.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-emerald-600">
                      <Gift className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="mt-1.5 line-clamp-2 min-h-[32px] text-[11.5px] font-medium leading-tight text-[#14223b]">
                  {gift.name}
                </div>
                {(() => {
                  const qty = gift.giftQuantity && gift.giftQuantity > 0 ? gift.giftQuantity : 1;
                  const strikeTotal =
                    gift.normalPrice != null && gift.normalPrice > 0
                      ? gift.normalPrice
                      : gift.value && gift.value > 0
                      ? gift.value * qty
                      : 0;
                  return (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {qty > 1 && (
                        <span className="text-[11px] font-semibold text-[#0f2a57] tabular-nums">×{qty} adet</span>
                      )}
                      {strikeTotal > 0 && (
                        <span className="text-[13px] text-gray-400 line-through tabular-nums">
                          {formatCurrency(strikeTotal)}
                        </span>
                      )}
                      <span className="text-[11.5px] font-bold text-emerald-700">₺0,00 · Bedelsiz</span>
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CartGiftPicker;
