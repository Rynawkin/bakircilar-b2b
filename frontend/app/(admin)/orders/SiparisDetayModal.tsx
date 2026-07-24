'use client';

import {
  BarChart3,
  Check,
  FileSpreadsheet,
  FileText,
  Pencil,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { PendingOrderForAdmin } from '@/types';

interface Props {
  order: PendingOrderForAdmin | null;
  onClose: () => void;
  onEdit: (order: PendingOrderForAdmin) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPdf: (order: PendingOrderForAdmin) => void;
  onExcel: (order: PendingOrderForAdmin) => void;
}

const metricClass = 'rounded-xl border border-[#e7ebf2] bg-white p-3.5';

const orderStatusLabel = (status: PendingOrderForAdmin['status']) => {
  if (status === 'APPROVED') return 'Onaylandı';
  if (status === 'REJECTED') return 'Reddedildi';
  return 'Onay bekliyor';
};

export function SiparisDetayModal({
  order,
  onClose,
  onEdit,
  onApprove,
  onReject,
  onPdf,
  onExcel,
}: Props) {
  if (!order) return null;

  const customerName =
    order.user?.displayName ||
    order.user?.mikroName ||
    order.user?.name ||
    '-';
  const creatorName =
    order.customerRequest?.requestedBy?.name ||
    order.requestedBy?.name ||
    order.sourceQuote?.createdBy?.name ||
    customerName;
  const creatorSource = order.customerRequest
    ? 'Müşteri talebi'
    : order.requestedBy
      ? 'B2B personeli'
      : order.sourceQuote
        ? 'Tekliften oluşturuldu'
        : 'Müşterinin kendisi';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Sipariş ${order.orderNumber}`}
      size="full"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPdf(order)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <FileText width={13} height={13} />
            Proforma PDF
          </button>
          <button
            type="button"
            onClick={() => onExcel(order)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <FileSpreadsheet width={13} height={13} />
            Proforma Excel
          </button>
          {(order.status === 'PENDING' || order.status === 'APPROVED') && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
            >
              <Pencil width={13} height={13} />
              Düzenle
            </button>
          )}
          {order.status === 'PENDING' && (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => onReject(order.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
              >
                <X width={13} height={13} />
                Reddet
              </button>
              <button
                type="button"
                onClick={() => onApprove(order.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#047857] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#065f46]"
              >
                <Check width={13} height={13} />
                Onayla ve Mikro&apos;ya gönder
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-[#dbe4f1] bg-[#f7f9fc] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b97ac]">
                Müşteri
              </p>
              <h3 className="mt-1 text-xl font-semibold text-[#14223b]">{customerName}</h3>
              <p className="mt-1 font-mono text-[12px] text-[#51607a]">
                {order.user?.mikroCariCode || '-'}
                {order.user?.sectorCode ? ` · Sektör ${order.user.sectorCode}` : ''}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex rounded-full border border-[#d6e0f1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#15356b]">
                {orderStatusLabel(order.status)}
              </span>
              <p className="mb-0 mt-2 text-2xl font-semibold tracking-tight text-[#14223b]">
                {formatCurrency(order.totalAmount)}
              </p>
              <p className="mt-1 text-[11px] text-[#8b97ac]">{order.items.length} kalem</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={metricClass}>
            <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac]">Sipariş tarihi</p>
            <p className="mb-0 mt-1.5 text-[13px] font-semibold text-[#14223b]">{formatDate(order.createdAt)}</p>
          </div>
          <div className={metricClass}>
            <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac]">Oluşturan</p>
            <p className="mb-0 mt-1.5 text-[13px] font-semibold text-[#14223b]">{creatorName}</p>
            <p className="mb-0 mt-0.5 text-[10.5px] text-[#8b97ac]">{creatorSource}</p>
          </div>
          <div className={metricClass}>
            <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac]">Belge / teslimat</p>
            <p className="mb-0 mt-1.5 text-[13px] font-semibold text-[#14223b]">
              {order.customerOrderNumber || '-'}
            </p>
            <p className="mb-0 mt-0.5 text-[10.5px] text-[#8b97ac]">{order.deliveryLocation || 'Teslimat bilgisi yok'}</p>
          </div>
          <div className={metricClass}>
            <p className="m-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac]">Mikro siparişleri</p>
            <p className="mb-0 mt-1.5 break-words font-mono text-[12px] font-semibold text-[#14223b]">
              {order.mikroOrderIds?.length ? order.mikroOrderIds.join(', ') : 'Henüz oluşmadı'}
            </p>
          </div>
        </section>

        {(order.adminNote || order.sourceQuote || order.customerRequest) && (
          <section className="grid gap-3 lg:grid-cols-3">
            {order.adminNote && (
              <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5 lg:col-span-1">
                <p className="m-0 text-[10.5px] font-semibold uppercase text-[#b45309]">Admin notu</p>
                <p className="mb-0 mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#6b4b13]">{order.adminNote}</p>
              </div>
            )}
            {order.sourceQuote && (
              <div className="rounded-xl border border-[#d6e0f1] bg-[#eef2fa] p-3.5">
                <p className="m-0 text-[10.5px] font-semibold uppercase text-[#1c4585]">Teklif kaynağı</p>
                <p className="mb-0 mt-1.5 font-mono text-[12.5px] font-semibold text-[#15356b]">{order.sourceQuote.quoteNumber}</p>
                <p className="mb-0 mt-1 text-[10.5px] text-[#51607a]">{formatDate(order.sourceQuote.createdAt)}</p>
              </div>
            )}
            {order.customerRequest && (
              <div className="rounded-xl border border-[#c7d2fe] bg-[#eef2fb] p-3.5">
                <p className="m-0 text-[10.5px] font-semibold uppercase text-[#4338ca]">Talep kaynağı</p>
                <p className="mb-0 mt-1.5 font-mono text-[12.5px] font-semibold text-[#3730a3]">{order.customerRequest.id.slice(0, 8)}</p>
                <p className="mb-0 mt-1 text-[10.5px] text-[#6366a8]">{order.customerRequest.requestedBy?.name || '-'}</p>
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-[#14223b]">Sipariş kalemleri</h3>
              <p className="mb-0 mt-0.5 text-[11px] text-[#8b97ac]">Ürün, sınıflandırma, fiyat tipi ve satır tutarı tek bakışta.</p>
            </div>
            {(order.items || []).some((item) => item.responsibilityCenter) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-2.5 py-1 text-[10.5px] font-semibold text-[#1c4585]">
                <BarChart3 width={11} height={11} />
                Sorumluluk merkezi bilgisi var
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e7ebf2] bg-white">
            <div className="hidden grid-cols-[minmax(280px,1.8fr)_minmax(170px,1fr)_110px_110px_125px] gap-3 border-b border-[#e7ebf2] bg-[#f6f8fc] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac] md:grid">
              <span>Ürün</span>
              <span>Kategori / marka</span>
              <span>Tip</span>
              <span className="text-right">Miktar × fiyat</span>
              <span className="text-right">Satır toplamı</span>
            </div>
            <div className="divide-y divide-[#eef1f6]">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(280px,1.8fr)_minmax(170px,1fr)_110px_110px_125px] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <p className="m-0 text-[12.5px] font-semibold text-[#14223b]">{item.productName}</p>
                    <p className="mb-0 mt-0.5 font-mono text-[10.5px] text-[#8b97ac]">{item.mikroCode}</p>
                    {(item.lineNote || item.responsibilityCenter) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.responsibilityCenter && (
                          <span className="rounded-md bg-[#f1f4f9] px-1.5 py-0.5 text-[9.5px] font-medium text-[#51607a]">
                            {item.responsibilityCenter}
                          </span>
                        )}
                        {item.lineNote && (
                          <span className="rounded-md bg-[#fffbeb] px-1.5 py-0.5 text-[9.5px] font-medium text-[#92500a]">
                            Not: {item.lineNote}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="m-0 text-[11.5px] font-medium text-[#51607a]">
                      {item.product?.category?.name || 'Kategori bilgisi yok'}
                    </p>
                    <p className="mb-0 mt-0.5 text-[10.5px] text-[#8b97ac]">
                      {item.product?.brandCode || 'Marka bilgisi yok'}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    item.priceType === 'INVOICED'
                      ? 'border-[#d6e0f1] bg-[#eef2fa] text-[#1c4585]'
                      : 'border-[#e3e8f0] bg-[#f4f6fa] text-[#51607a]'
                  }`}>
                    {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                  </span>
                  <p className="m-0 text-[11.5px] text-[#51607a] md:text-right">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </p>
                  <p className="m-0 text-[13px] font-semibold text-[#14223b] md:text-right">
                    {formatCurrency(item.totalPrice)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <details className="rounded-xl border border-[#e7ebf2] bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-[12.5px] font-semibold text-[#15356b]">
            Tüm müşteri bilgilerini göster
          </summary>
          <div className="border-t border-[#eef1f6] p-4">
            <CustomerInfoCard customer={order.user} />
          </div>
        </details>

        {(order.approvedAt || order.rejectedAt) && (
          <p className={`m-0 text-center text-[11.5px] ${
            order.approvedAt ? 'text-[#047857]' : 'text-[#b91c1c]'
          }`}>
            {order.approvedAt
              ? `Onaylandı: ${formatDate(order.approvedAt)}`
              : `Reddedildi: ${formatDate(order.rejectedAt!)}`}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default SiparisDetayModal;
