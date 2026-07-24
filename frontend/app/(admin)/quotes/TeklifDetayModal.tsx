'use client';

import { ArrowRightLeft, Ban, Check, Pencil } from 'lucide-react';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { getPriceListDisplayLabel } from '@/lib/utils/priceLists';
import {
  calculateQuoteProfitSummary,
  completeQuoteProfitSummary,
  formatProfitPercent,
  getProfitTone,
  type Quote,
  type QuoteStatus,
} from './useTeklifler';

interface TeklifDetayModalProps {
  quote: Quote | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (quote: Quote) => void;
  onConvert: (quote: Quote) => void;
  onApprove: (quoteId: string) => void;
  onReject: (quoteId: string) => void;
}

const statusLabels: Record<QuoteStatus, string> = {
  PENDING_APPROVAL: 'Onay bekliyor',
  SENT_TO_MIKRO: "Mikro'ya gönderildi",
  REJECTED: 'Reddedildi',
  CUSTOMER_ACCEPTED: 'Müşteri kabul etti',
  CUSTOMER_REJECTED: 'Müşteri reddetti',
};

const summaryCard = 'rounded-xl border border-[#e7ebf2] bg-[#fafbfd] px-4 py-3';

export function TeklifDetayModal({
  quote,
  isAdmin,
  onClose,
  onEdit,
  onConvert,
  onApprove,
  onReject,
}: TeklifDetayModalProps) {
  if (!quote) return null;

  const customerName =
    quote.customer?.displayName ||
    quote.customer?.mikroName ||
    quote.customer?.name ||
    '-';
  const profitSummary = completeQuoteProfitSummary(calculateQuoteProfitSummary(quote));
  const canEdit = quote.status === 'PENDING_APPROVAL' || quote.status === 'SENT_TO_MIKRO';
  const canConvert = Boolean(quote.mikroNumber && quote.status !== 'REJECTED');

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Teklif ${quote.quoteNumber}`}
      size="full"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d8e0ec] bg-white px-4 py-2 text-sm font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            Kapat
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(quote)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-4 py-2 text-sm font-medium text-[#15356b] hover:bg-[#eef2fa]"
            >
              <Pencil width={15} height={15} />
              Düzenle
            </button>
          )}
          {canConvert && (
            <button
              type="button"
              onClick={() => onConvert(quote)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6e0f1] bg-white px-4 py-2 text-sm font-semibold text-[#15356b] hover:bg-[#eef2fa]"
            >
              <ArrowRightLeft width={15} height={15} />
              Siparişe Çevir
            </button>
          )}
          {quote.status === 'PENDING_APPROVAL' && isAdmin && (
            <>
              <button
                type="button"
                onClick={() => onReject(quote.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-4 py-2 text-sm font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
              >
                <Ban width={15} height={15} />
                Reddet
              </button>
              <button
                type="button"
                onClick={() => onApprove(quote.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border-0 bg-[#047857] px-4 py-2 text-sm font-semibold text-white hover:bg-[#065f46]"
              >
                <Check width={15} height={15} />
                Onayla ve Mikro&apos;ya Gönder
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className={`${summaryCard} sm:col-span-2`}>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
              Müşteri
            </p>
            <p className="mb-0 mt-1 text-base font-semibold text-[#14223b]">{customerName}</p>
            <p className="mb-0 mt-1 text-xs text-[#51607a]">
              {quote.customer?.mikroCariCode || 'Cari kodu yok'}
              {quote.customer?.sectorCode ? ` · Sektör ${quote.customer.sectorCode}` : ''}
            </p>
          </div>
          <div className={summaryCard}>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
              Durum
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[#14223b]">
              {statusLabels[quote.status]}
            </p>
          </div>
          <div className={summaryCard}>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
              Geçerlilik
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[#14223b]">
              {formatDateShort(quote.validityDate)}
            </p>
          </div>
          <div className={summaryCard}>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
              Genel Toplam
            </p>
            <p className="mb-0 mt-1 text-lg font-semibold text-[#14223b]">
              {formatCurrency(quote.grandTotal)}
            </p>
          </div>
        </section>

        <section className="grid gap-3 rounded-xl border border-[#e7ebf2] bg-white p-4 text-sm text-[#51607a] md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className="block text-[11px] font-semibold uppercase text-[#8b97ac]">Oluşturan</span>
            <span className="mt-1 block font-medium text-[#14223b]">{quote.createdBy?.name || '-'}</span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase text-[#8b97ac]">Oluşturulma</span>
            <span className="mt-1 block font-medium text-[#14223b]">{formatDate(quote.createdAt)}</span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase text-[#8b97ac]">Belge / Mikro No</span>
            <span className="mt-1 block font-medium text-[#14223b]">
              {quote.documentNo || '-'} / {quote.mikroNumber || '-'}
            </span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase text-[#8b97ac]">Son Güncelleme</span>
            <span className="mt-1 block font-medium text-[#14223b]">
              {formatDate(quote.updatedAt)} · {quote.updatedBy?.name || quote.createdBy?.name || '-'}
            </span>
          </div>
        </section>

        {quote.adminNote && (
          <section className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#b45309]">Admin Notu</p>
            <p className="mb-0 mt-1 whitespace-pre-wrap text-sm text-[#78350f]">{quote.adminNote}</p>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-[#e7ebf2] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] px-4 py-3">
            <div>
              <h3 className="m-0 text-sm font-semibold text-[#14223b]">Teklif Kalemleri</h3>
              <p className="mb-0 mt-0.5 text-xs text-[#8b97ac]">{quote.items.length} ürün</p>
            </div>
            <p className="m-0 text-sm font-semibold text-[#14223b]">
              KDV hariç {formatCurrency(quote.totalAmount)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                <tr>
                  <th className="px-4 py-3">Ürün</th>
                  <th className="px-3 py-3">Kategori / Marka</th>
                  <th className="px-3 py-3">Fiyat Kaynağı</th>
                  <th className="px-3 py-3">Tip</th>
                  <th className="px-3 py-3 text-right">Miktar</th>
                  <th className="px-3 py-3 text-right">Birim Fiyat</th>
                  <th className="px-4 py-3 text-right">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f6]">
                {quote.items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-[#fafbfd]">
                    <td className="px-4 py-3">
                      <p className="m-0 text-sm font-medium text-[#14223b]">{item.productName}</p>
                      <p className="mb-0 mt-1 font-mono text-[11px] text-[#8b97ac]">{item.productCode}</p>
                      {item.lineDescription && (
                        <p className="mb-0 mt-1 max-w-[360px] text-xs text-[#51607a]">{item.lineDescription}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[#51607a]">
                      <span className="block">{item.product?.category?.name || '-'}</span>
                      <span className="mt-1 block text-[#8b97ac]">{item.product?.brandCode || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[#51607a]">
                      {item.priceSource === 'PRICE_LIST'
                        ? `${getPriceListDisplayLabel(item.priceListNo)} (Liste ${item.priceListNo})`
                        : item.priceSource === 'LAST_SALE'
                          ? 'Son satış'
                          : 'Manuel'}
                    </td>
                    <td className="px-3 py-3 text-xs font-medium text-[#51607a]">
                      {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                      {item.isBlocked ? <span className="mt-1 block text-[#b45309]">Bloklu</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-[#51607a]">
                      {item.quantity} {item.selectedUnit || item.unit || ''}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-[#51607a]">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#14223b]">
                      {formatCurrency(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[#e7ebf2] bg-white p-4">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-semibold text-[#14223b]">Dip Toplam Kârlılık Özeti</h3>
            <p className="mb-0 mt-1 text-xs text-[#8b97ac]">
              Hesap KDV hariç satış tutarı üzerinden yapılır.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className={summaryCard}>
              <p className="m-0 text-[11px] font-medium text-[#8b97ac]">KDV Hariç Satış</p>
              <p className="mb-0 mt-1 text-base font-semibold text-[#14223b]">
                {formatCurrency(profitSummary.salesTotal)}
              </p>
            </div>
            <div className={summaryCard}>
              <p className="m-0 text-[11px] font-medium text-[#8b97ac]">Giriş Maliyetine Göre</p>
              <p className="mb-0 mt-1 text-xs text-[#51607a]">
                Maliyet: <b>{formatCurrency(profitSummary.entryCostTotal)}</b>
              </p>
              <p className={`mb-0 mt-1 text-sm font-semibold ${getProfitTone(profitSummary.entryProfitPercent)}`}>
                Kâr: {formatCurrency(profitSummary.entryProfit)} ({formatProfitPercent(profitSummary.entryProfitPercent)})
              </p>
              {profitSummary.entryMissingLines > 0 && (
                <p className="mb-0 mt-1 text-[11px] text-[#b45309]">
                  {profitSummary.entryMissingLines} satırda giriş maliyeti yok.
                </p>
              )}
            </div>
            <div className={summaryCard}>
              <p className="m-0 text-[11px] font-medium text-[#8b97ac]">Güncel Maliyete Göre</p>
              <p className="mb-0 mt-1 text-xs text-[#51607a]">
                Maliyet: <b>{formatCurrency(profitSummary.currentCostTotal)}</b>
              </p>
              <p className={`mb-0 mt-1 text-sm font-semibold ${getProfitTone(profitSummary.currentProfitPercent)}`}>
                Kâr: {formatCurrency(profitSummary.currentProfit)} ({formatProfitPercent(profitSummary.currentProfitPercent)})
              </p>
              {profitSummary.currentMissingLines > 0 && (
                <p className="mb-0 mt-1 text-[11px] text-[#b45309]">
                  {profitSummary.currentMissingLines} satırda güncel maliyet yok.
                </p>
              )}
            </div>
          </div>
        </section>

        {quote.customer && (
          <details className="rounded-xl border border-[#e7ebf2] bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#15356b]">
              Tüm müşteri bilgilerini göster
            </summary>
            <div className="border-t border-[#eef1f6] p-4">
              <CustomerInfoCard customer={quote.customer} />
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}
