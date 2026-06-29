'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  ShoppingCart,
  Calendar,
  DollarSign,
  TrendingUp,
  Package,
  PackageSearch,
  TriangleAlert,
} from 'lucide-react';
import { useUrunMusteriDetay } from './useUrunMusteriDetay';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Kar-marji renk esigi (Classic ile birebir: >=20 yesil, >=10 turuncu, <10 kirmizi)
const marginColor = (m: number) =>
  m >= 20 ? 'text-[#047857]' : m >= 10 ? 'text-[#b45309]' : 'text-[#b91c1c]';

export default function UrunMusteriDetayNew() {
  const {
    productCode,
    data,
    summary,
    loading,
    error,
    fetchData,
    formatCurrency,
    formatDate,
  } = useUrunMusteriDetay();

  const metrics = summary
    ? [
        { label: 'Toplam Müşteri', value: String(summary.totalCustomers), icon: Users, tone: 'text-[#15356b]' },
        { label: 'Toplam Miktar', value: summary.totalQuantity.toFixed(2), icon: ShoppingCart, tone: 'text-[#7c3aed]' },
        { label: 'Toplam Ciro', value: formatCurrency(summary.totalRevenue), icon: DollarSign, tone: 'text-[#047857]' },
        { label: 'Toplam Kar', value: formatCurrency(summary.totalProfit), icon: TrendingUp, tone: 'text-[#7c3aed]' },
        { label: 'Ortalama Kar Marjı', value: `%${summary.avgProfitMargin.toFixed(2)}`, icon: TrendingUp, tone: 'text-[#b45309]' },
      ]
    : [];

  return (
    <div className="container mx-auto p-6 text-[#14223b]">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] text-[#8b97ac]">
        <Link
          href="/reports/top-products"
          className="flex items-center gap-1.5 font-semibold text-[#15356b] hover:underline"
        >
          <ChevronLeft size={14} />
          En Çok Satan
        </Link>
        <ChevronRight size={13} />
        <span className="font-medium text-[#51607a]">Ürün Müşteri Detayı</span>
      </div>

      {/* Baslik: urun kodu + Geri Don / Yenile */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em]">
            <Package size={22} className="text-[#15356b]" />
            Ürün Müşteri Detayı
          </h1>
          <div className="mt-1 text-[13px] text-[#8b97ac]">
            Ürün Kodu: <span className="font-mono font-semibold text-[#51607a]">{productCode}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/reports/top-products"
            className="flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <ChevronLeft size={14} />
            Geri Dön
          </Link>
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
            Yenile
          </button>
        </div>
      </div>

      {/* Ozet metrik kartlari */}
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <div key={m.label} className={`${CARD} p-[15px]`}>
              <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
                <m.icon size={14} className={m.tone} />
                {m.label}
              </div>
              <div className="mt-1.5 text-[20px] font-semibold tracking-[-0.01em] text-[#14223b]">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tablo / durumlar */}
      {loading ? (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center gap-2.5 border-b border-[#eef1f6] px-4 py-3.5">
            <RefreshCw size={16} className="animate-spin text-[#15356b]" />
            <span className="text-[12px] text-[#8b97ac]">Yükleniyor...</span>
          </div>
          <div className="px-4 pb-4 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2.5 border-b border-[#f4f6fa] py-3">
                <span className="h-[13px] flex-[2] rounded bg-[#eef1f6]" />
                <span className="h-[13px] flex-1 rounded bg-[#eef1f6]" />
                <span className="h-[13px] flex-1 rounded bg-[#f4f6fa]" />
                <span className="h-[13px] flex-1 rounded bg-[#eef1f6]" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[#fecaca] bg-white px-6 py-11 text-center">
          <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[#fef2f2]">
            <TriangleAlert size={24} className="text-[#dc2626]" />
          </span>
          <div className="text-[14px] font-semibold text-[#14223b]">Rapor yüklenemedi</div>
          <div className="mt-1.5 text-[12px] text-[#8b97ac]">{error}</div>
          <button
            type="button"
            onClick={fetchData}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#1c4585]"
          >
            <RefreshCw size={13} />
            Tekrar Dene
          </button>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              {/* Baslik satiri */}
              <div className="grid grid-cols-[44px_140px_minmax(180px,1fr)_90px_90px_90px_130px_130px_110px_110px] items-center gap-2.5 border-b border-[#eef1f6] bg-[#fafbfd] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-[#8b97ac]">
                <span>Sıra</span>
                <span>Müşteri Kodu</span>
                <span>Müşteri Adı</span>
                <span>Sektör</span>
                <span className="text-right">Sipariş</span>
                <span className="text-right">Miktar</span>
                <span className="text-right">Ciro</span>
                <span className="text-right">Kar</span>
                <span className="text-right">Kar Marjı</span>
                <span className="text-right">Son Sipariş</span>
              </div>

              {/* Satirlar */}
              {data.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <span className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[#f4f6fa]">
                    <PackageSearch size={24} className="text-[#9aa6b8]" />
                  </span>
                  <div className="text-[14px] font-semibold text-[#14223b]">Müşteri bulunamadı</div>
                  <div className="mt-1 text-[12px] text-[#8b97ac]">
                    Bu ürün için satış yapılan müşteri kaydı bulunmuyor.
                  </div>
                </div>
              ) : (
                data.map((item, index) => (
                  <div
                    key={item.customerCode}
                    className="grid grid-cols-[44px_140px_minmax(180px,1fr)_90px_90px_90px_130px_130px_110px_110px] items-center gap-2.5 border-t border-[#f1f4f9] px-4 py-3 text-[12px] text-[#14223b] hover:bg-[#fafbfd]"
                  >
                    <span className="font-medium">{index + 1}</span>
                    <span className="truncate font-mono text-[11.5px] text-[#51607a]">
                      {item.customerCode}
                    </span>
                    <span className="truncate font-semibold" title={item.customerName}>
                      {item.customerName}
                    </span>
                    <span className="truncate text-[11.5px] text-[#51607a]">
                      {item.sectorCode || '-'}
                    </span>
                    <span className="flex items-center justify-end gap-1 font-medium">
                      <ShoppingCart size={13} className="text-[#9aa6b8]" />
                      {item.orderCount}
                    </span>
                    <span className="text-right font-medium">{item.totalQuantity.toFixed(2)}</span>
                    <span className="text-right font-medium text-[#047857]">
                      {formatCurrency(item.totalRevenue)}
                    </span>
                    <span className="text-right font-bold text-[#7c3aed]">
                      {formatCurrency(item.totalProfit)}
                    </span>
                    <span className={`text-right font-bold ${marginColor(item.profitMargin)}`}>
                      %{item.profitMargin.toFixed(2)}
                    </span>
                    <span className="flex items-center justify-end gap-1 text-right text-[11.5px] text-[#51607a]">
                      <Calendar size={13} className="text-[#9aa6b8]" />
                      {formatDate(item.lastOrderDate)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alt satir: kayit sayisi */}
          {data.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#eef1f6] px-4 py-3">
              <span className="text-[12px] text-[#8b97ac]">
                Toplam {data.length} müşteri
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
