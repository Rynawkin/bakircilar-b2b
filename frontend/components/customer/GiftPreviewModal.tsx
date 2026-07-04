'use client';

import { useEffect } from 'react';
import { Gift, X } from 'lucide-react';
import { GiftCampaignGift } from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Hediyeli kampanya (GWP) — hediye onizleme modalı.
 * Kampanyada kazanilabilecek hediye urunlerini; her biri icin adet ve
 * musterinin normal fiyatini (ustu cizili) + "Hediye" rozeti ile listeler.
 * Salt gosterim; secim sepette yapilir.
 *
 * Not: Veri kaynagi (gifts) ve normalPrice/giftQuantity hesabi AYNEN korunur;
 * yalnizca gorsel kaplama design'a (navy-gradient baslik + 2 kolonlu ızgara)
 * uyarlanmistir.
 */
export function GiftPreviewModal({
  isOpen,
  onClose,
  gifts,
}: {
  isOpen: boolean;
  onClose: () => void;
  gifts: GiftCampaignGift[];
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(12,16,30,0.5)] p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_rgba(0,0,0,0.32)] animate-in fade-in zoom-in duration-150"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Navy gradient baslik ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 bg-[linear-gradient(120deg,#0f2a57,#15356b)] px-[22px] py-[18px]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.18)] px-[9px] py-[3px] text-[10.5px] font-semibold tracking-[0.05em] text-[#6ee7b7]">
              <Gift className="h-3 w-3" strokeWidth={2} />
              HEDİYELİ KAMPANYA
            </span>
            <div className="mt-[9px] text-[16px] font-semibold text-white">
              Bu kampanyada kazanabileceğiniz hediyeler
            </div>
            <div className="mt-[3px] text-[12px] text-[rgba(255,255,255,0.72)]">
              Baraj tutarını geçince hediyenizi sepette seçebilirsiniz.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.12)] text-white transition-colors hover:bg-[rgba(255,255,255,0.22)]"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* ── Hediye ızgarası ───────────────────────────────────── */}
        <div className="max-h-[60vh] overflow-auto p-4">
          {gifts.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[#8b97ac]">
              Bu kampanya için hediye ürün tanımlı değil.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {gifts.map((gift) => {
                const qty = gift.giftQuantity && gift.giftQuantity > 0 ? gift.giftQuantity : 1;
                const strikeTotal =
                  gift.normalPrice != null && gift.normalPrice > 0
                    ? gift.normalPrice
                    : gift.value && gift.value > 0
                    ? gift.value * qty
                    : 0;
                return (
                  <div
                    key={gift.id}
                    className="flex items-center gap-3 rounded-xl border border-[#eef1f6] px-3 py-[11px]"
                  >
                    {/* Gorsel */}
                    <span className="flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[#eef1f6] bg-[#f4f6fa]">
                      {gift.imageUrl ? (
                        <img src={gift.imageUrl} alt={gift.name} className="h-full w-full object-contain" />
                      ) : (
                        <Gift className="h-[22px] w-[22px] text-primary-600" strokeWidth={1.6} />
                      )}
                    </span>

                    {/* Ad + fiyat satiri */}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12.5px] font-medium leading-[1.35] text-[#14223b]">
                        {gift.name}
                      </div>
                      <div className="mt-[5px] flex flex-wrap items-center gap-x-2 gap-y-1">
                        {strikeTotal > 0 && (
                          <span className="text-[11.5px] text-[#9aa6b8] line-through tabular-nums">
                            {formatCurrency(strikeTotal)}
                          </span>
                        )}
                        <span className="rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-[7px] py-px text-[10.5px] font-semibold text-[#047857]">
                          Hediye
                        </span>
                        <span className="text-[10.5px] text-[#8b97ac]">×{qty}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Alt bilgi + Anladim ───────────────────────────────── */}
        <div className="flex items-center justify-between gap-2.5 border-t border-[#eef1f6] bg-[#fafbfd] px-5 py-3.5">
          <span className="text-[12px] text-[#8b97ac]">Hediye seçimi sepette yapılır.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] bg-primary-600 px-[18px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Anladım
          </button>
        </div>
      </div>
    </div>
  );
}

export default GiftPreviewModal;
