'use client';

import { Gift } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { GiftCampaignGift } from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Hediyeli kampanya (GWP) — hediye onizleme modalı.
 * Kampanyada kazanilabilecek hediye urunlerini; her biri icin adet ve
 * musterinin normal fiyatini (ustu cizili, ProductCard kalitesinde) + "Hediye"
 * rozeti ile listeler. Salt gosterim; secim sepette yapilir.
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bu kampanyada kazanabileceğiniz hediyeler"
      size="lg"
    >
      {gifts.length === 0 ? (
        <p className="text-center text-[13px] text-gray-500">Bu kampanya için hediye ürün tanımlı değil.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {gifts.map((gift) => {
            const qty = gift.giftQuantity && gift.giftQuantity > 0 ? gift.giftQuantity : 1;
            const strikeTotal =
              gift.normalPrice != null && gift.normalPrice > 0
                ? gift.normalPrice
                : gift.value && gift.value > 0
                ? gift.value * qty
                : 0;
            return (
              <li
                key={gift.id}
                className="flex items-center gap-3 rounded-xl border border-[#e7ebf2] bg-white p-2.5"
              >
                {/* Gorsel */}
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-[#eef1f6] bg-white">
                  {gift.imageUrl ? (
                    <img src={gift.imageUrl} alt={gift.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-emerald-600">
                      <Gift className="h-6 w-6" />
                    </div>
                  )}
                </div>

                {/* Ad + fiyat */}
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[13px] font-medium leading-tight text-[#14223b]">
                    {gift.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12px] font-semibold text-[#0f2a57] tabular-nums">×{qty} adet</span>
                    {strikeTotal > 0 && (
                      <span className="text-[13px] text-gray-400 line-through tabular-nums">
                        {formatCurrency(strikeTotal)}
                      </span>
                    )}
                    <span className="text-[13px] font-bold text-emerald-700">₺0,00</span>
                  </div>
                </div>

                {/* Hediye rozeti */}
                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <Gift className="h-3.5 w-3.5" />
                  Hediye
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default GiftPreviewModal;
