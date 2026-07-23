'use client';

import {
  Plus,
  Search,
  X,
  ChevronDown,
  Download,
  FileSpreadsheet,
  PackageSearch,
  Sparkles,
  MessageCircle,
  Send,
  History,
  Pencil,
  ArrowRightLeft,
  RefreshCw,
  Check,
  Ban,
  FileText,
  Info,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { getPriceListDisplayLabel } from '@/lib/utils/priceLists';
import {
  useTeklifler,
  completeQuoteProfitSummary,
  calculateQuoteProfitSummary,
  formatProfitPercent,
  getProfitTone,
  type Quote,
  type QuoteStatus,
  type QuoteStatusFilter,
} from './useTeklifler';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Statu rozeti (yeni gorsel) — Klasik getStatusBadge ile AYNI etiket/anlam, token stilli.
function StatusPill({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, { label: string; cls: string } | null> = {
    PENDING_APPROVAL: {
      label: '⏳ Onay Bekliyor',
      cls: 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]',
    },
    SENT_TO_MIKRO: {
      label: "✅ Mikro'ya Gönderildi",
      cls: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]',
    },
    REJECTED: {
      label: '❌ Reddedildi',
      cls: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
    },
    CUSTOMER_ACCEPTED: {
      label: '🤝 Müşteri Kabul',
      cls: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]',
    },
    CUSTOMER_REJECTED: {
      label: '🚫 Müşteri Red',
      cls: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
    },
  } as Record<QuoteStatus, { label: string; cls: string } | null>;
  const conf = map[status];
  if (!conf) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-[3px] rounded-full border ${conf.cls}`}
    >
      {conf.label}
    </span>
  );
}

// Ikincil (outline) buton — yeni gorsel
const secBtn =
  'inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Yeni gorunum Teklifler. TUM mantik useTeklifler'den gelir; yalnizca gorsel yeni.
 * Klasik ekrandaki HER oge (filtre/sekme/sayac/kolon/satir-aksiyon/modal/izin) korunmustur.
 */
export default function TekliflerNew() {
  const {
    router,
    isAdmin,
    loading,
    initialLoading,
    filteredQuotes,
    counts,
    page,
    pagination,
    goPrev,
    goNext,
    activeTab,
    handleTabChange,
    searchTerm,
    setSearchTerm,
    expandedQuotes,
    toggleExpanded,
    syncingQuoteId,
    markingCustomerPdfSentId,
    stockPdfLoadingId,
    recommendedPdfLoadingId,
    handleApprove,
    handleReject,
    handleWhatsappShare,
    handlePdfExport,
    handleStockPdfExport,
    handleRecommendedPdfExport,
    handleExcelExport,
    handleSync,
    handleMarkCustomerPdfSent,
    handleOpenHistory,
    downloadPromptQuote,
    downloadPromptOpen,
    downloadPromptLoading,
    downloadPromptRecommendedLoading,
    handleDownloadPromptClose,
    handleDownloadPromptConfirm,
    handleDownloadPromptRecommended,
    historyOpen,
    historyLoading,
    historyQuote,
    historyItems,
    expandedHistoryEntries,
    handleHistoryClose,
    toggleHistoryEntry,
    resolveHistoryLabel,
    buildHistoryDetails,
    getConversionBadge,
  } = useTeklifler();

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#15356b]" />
      </div>
    );
  }

  // Sekme tanimlari — sayac yalnizca AKTIF sekme icin sunucudan gelir (pagination.total).
  // Diger sekmelerde sahte sayi gostermemek icin count=null (rozet gizlenir).
  const tabs: Array<{ key: QuoteStatusFilter; label: string; count: number | null; active: string }> = [
    { key: 'PENDING_APPROVAL', label: '⏳ Onay Bekleyen', count: counts.pending, active: '#15356b' },
    { key: 'SENT_TO_MIKRO', label: '✅ Gönderilen', count: counts.sent, active: '#047857' },
    { key: 'REJECTED', label: '❌ Reddedilen', count: counts.rejected, active: '#b91c1c' },
    { key: 'CUSTOMER_ACCEPTED', label: '🤝 Müşteri Kabul', count: counts.accepted, active: '#047857' },
    { key: 'ALL', label: '📋 Tümü', count: counts.all, active: '#14223b' },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Baslik + Yeni Teklif */}
        <div className="flex items-end justify-between gap-4 mb-[18px] flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Teklifler</h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">
              Teklif onay/gönderim kuyruğu ve müşteri yanıtları
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/quotes/new')}
            className="flex items-center gap-1.5 bg-[#15356b] text-white border-none rounded-[9px] px-[17px] py-[11px] text-[13.5px] font-semibold cursor-pointer hover:bg-[#1c4585]"
          >
            <Plus width={16} height={16} stroke="currentColor" strokeWidth={2.2} />
            Yeni Teklif
          </button>
        </div>

        {/* Sekmeler (sayac rozetli) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
          {tabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTabChange(t.key)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] text-[13px] font-semibold cursor-pointer border transition-colors"
                style={
                  isActive
                    ? { background: t.active, color: '#fff', borderColor: t.active }
                    : { background: '#fff', color: '#51607a', borderColor: '#e7ebf2' }
                }
              >
                {t.label}
                {t.count !== null && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold"
                    style={
                      isActive
                        ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                        : { background: '#eef2fa', color: '#1c4585' }
                    }
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Arama + Temizle */}
        <div className={`${CARD} flex items-center gap-2.5 flex-wrap px-3.5 py-[11px] mb-4`}>
          <div className="flex-1 min-w-[240px] flex items-center gap-2 h-[38px] border border-[#e3e8f0] rounded-lg px-3">
            <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adı, teklif no, belge no, müşteri kodu veya ürün adı ara…"
              className="flex-1 border-none bg-transparent outline-none text-[13px] text-[#14223b]"
            />
          </div>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="bg-white border border-[#d8e0ec] rounded-lg px-3.5 h-[38px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
            >
              Temizle
            </button>
          )}
        </div>

        {/* Liste / bos durum / liste-ici loading */}
        {loading ? (
          <div className={`${CARD} p-10 flex items-center justify-center`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#15356b]" />
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className={`${CARD} p-10 text-center text-[13px] text-[#8b97ac]`}>
            Seçili filtrede teklif bulunamadı.
          </div>
        ) : (
          <div className="flex flex-col gap-[13px]">
            {filteredQuotes.map((quote: Quote) => {
              const isExpanded = expandedQuotes.has(quote.id);
              const customerName =
                quote.customer?.displayName ||
                quote.customer?.mikroName ||
                quote.customer?.name ||
                '-';
              const customerCode = quote.customer?.mikroCariCode || '-';
              const canEdit = quote.status === 'PENDING_APPROVAL' || quote.status === 'SENT_TO_MIKRO';
              const createdAtText = quote.createdAt ? formatDate(quote.createdAt) : '-';
              const updatedAtText = quote.updatedAt ? formatDate(quote.updatedAt) : '-';
              const createdByName = quote.createdBy?.name || '-';
              const updatedByName = quote.updatedBy?.name || createdByName || '-';
              const profitSummary = completeQuoteProfitSummary(calculateQuoteProfitSummary(quote));

              return (
                <div key={quote.id} className={`${CARD} overflow-hidden`}>
                  {/* Ust: sol bilgi + sag statu/toplam */}
                  <div className="flex items-start gap-3.5 px-[17px] py-[15px] flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[11px] text-[#8b97ac]">Cari</span>
                        <span className="text-[15px] font-semibold text-[#14223b]">{customerName}</span>
                        {quote.customerPdfSentAt && (
                          <span className="inline-flex items-center gap-1 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[10.5px] font-semibold px-2 py-0.5 rounded-full">
                            <Check width={11} height={11} stroke="currentColor" strokeWidth={2.4} />
                            PDF müşteriye gönderildi: {formatDate(quote.customerPdfSentAt)} - {quote.customerPdfSentBy?.name || '-'}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#8b97ac] mt-1 font-mono">
                        Kod: {customerCode} · Teklif #{quote.quoteNumber} · {createdAtText}
                      </div>
                      <div className="flex items-center gap-3.5 flex-wrap mt-2 text-[12px] text-[#51607a]">
                        <span>
                          Oluşturan: <b className="text-[#14223b] font-semibold">{createdByName}</b>
                        </span>
                        <span>
                          Güncelleme: <b className="text-[#14223b] font-semibold">{updatedAtText} - {updatedByName}</b>
                        </span>
                        <span>
                          Geçerlilik: <b className="text-[#14223b] font-semibold">{formatDateShort(quote.validityDate)}</b>
                        </span>
                      </div>
                      {quote.mikroNumber && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#d6e0f1] bg-[#eef2fa] px-2 py-1">
                          <span className="text-[11px] font-medium text-[#1c4585]">Mikro No:</span>
                          <span className="text-[11px] font-mono font-bold text-[#15356b]">{quote.mikroNumber}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2.5 flex-none">
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <StatusPill status={quote.status} />
                        {getConversionBadge(quote)}
                      </div>
                      <div className="text-right">
                        <div className="text-[10.5px] text-[#8b97ac]">Toplam</div>
                        <div className="text-[21px] font-semibold text-[#14223b] tracking-tight">
                          {formatCurrency(quote.grandTotal)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(quote.id)}
                        className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[12px] font-medium text-[#15356b]"
                      >
                        {isExpanded ? 'Detayı Gizle' : 'Detayı Göster'}
                        <ChevronDown
                          width={13}
                          height={13}
                          stroke="currentColor"
                          strokeWidth={2}
                          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Genisletilmis detay */}
                  {isExpanded && (
                    <div className="border-t border-[#eef1f6] bg-[#fafbfd] px-[17px] py-3.5">
                      {quote.adminNote && (
                        <div className="mb-3 rounded-[9px] border border-[#e7ebf2] bg-white px-3 py-2">
                          <p className="text-[11px] font-medium text-[#8b97ac] m-0">Admin Notu</p>
                          <p className="text-[13px] text-[#14223b] mt-1 m-0">{quote.adminNote}</p>
                        </div>
                      )}
                      {quote.createdBy && (
                        <div className="mb-3 text-[11.5px] text-[#8b97ac]">Oluşturan: {quote.createdBy.name}</div>
                      )}

                      {quote.customer && (
                        <div className="mb-3.5">
                          <div className="text-[11px] font-semibold tracking-wide text-[#8b97ac] uppercase mb-2.5">
                            Müşteri Bilgileri
                          </div>
                          <CustomerInfoCard customer={quote.customer} />
                        </div>
                      )}

                      <div className="text-[11px] font-semibold tracking-wide text-[#8b97ac] uppercase mb-2.5">
                        Teklif Kalemleri ({quote.items.length} ürün)
                      </div>
                      <div className="flex flex-col gap-2 mb-3.5">
                        {quote.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 bg-white border border-[#eef1f6] rounded-[9px] px-3 py-2.5"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-medium text-[#14223b]">{item.productName}</span>
                                <span className="bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                                  {item.priceSource === 'PRICE_LIST'
                                    ? `${getPriceListDisplayLabel(item.priceListNo)} (Liste ${item.priceListNo})`
                                    : item.priceSource === 'LAST_SALE'
                                      ? 'Son Satış'
                                      : 'Manuel'}
                                </span>
                                {item.isBlocked && (
                                  <span className="bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                                    Blok
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#8b97ac] font-mono mt-0.5">{item.productCode}</div>
                            </div>
                            <span className="text-[12.5px] text-[#51607a] whitespace-nowrap">
                              {item.quantity} × {formatCurrency(item.unitPrice)}
                            </span>
                            <span className="text-[14px] font-semibold text-[#14223b] min-w-[96px] text-right">
                              {formatCurrency(item.totalPrice)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Dip Toplam Karlilik Ozeti */}
                      <div className="rounded-xl border border-[#e7ebf2] bg-white p-3.5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-[#14223b] m-0">Dip Toplam Karlılık Özeti</p>
                          <p className="text-[11px] text-[#8b97ac] m-0">
                            Hesap KDV hariç satış tutarı üzerinden yapılır.
                          </p>
                        </div>
                        <div className="grid gap-2.5 lg:grid-cols-3">
                          <div className="rounded-[9px] bg-[#fafbfd] border border-[#eef1f6] p-3">
                            <p className="text-[10.5px] font-medium text-[#8b97ac] m-0">KDV Hariç Satış Toplamı</p>
                            <p className="mt-1 text-[16px] font-semibold text-[#14223b] m-0">
                              {formatCurrency(profitSummary.salesTotal)}
                            </p>
                          </div>
                          <div className="rounded-[9px] bg-[#fafbfd] border border-[#eef1f6] p-3">
                            <p className="text-[10.5px] font-medium text-[#8b97ac] m-0">Giriş Maliyetine Göre</p>
                            <p className="mt-1 text-[12px] text-[#51607a] m-0">
                              Toplam maliyet:{' '}
                              <span className="font-semibold text-[#14223b]">
                                {formatCurrency(profitSummary.entryCostTotal)}
                              </span>
                            </p>
                            <p className={`text-[12.5px] font-semibold mt-0.5 ${getProfitTone(profitSummary.entryProfitPercent)}`}>
                              Kâr: {formatCurrency(profitSummary.entryProfit)} ({formatProfitPercent(profitSummary.entryProfitPercent)})
                            </p>
                            {profitSummary.entryMissingLines > 0 && (
                              <p className="mt-1 text-[10.5px] text-[#b45309] m-0">
                                {profitSummary.entryMissingLines} satırda giriş maliyeti yok.
                              </p>
                            )}
                          </div>
                          <div className="rounded-[9px] bg-[#fafbfd] border border-[#eef1f6] p-3">
                            <p className="text-[10.5px] font-medium text-[#8b97ac] m-0">Güncel Maliyete Göre</p>
                            <p className="mt-1 text-[12px] text-[#51607a] m-0">
                              Toplam maliyet:{' '}
                              <span className="font-semibold text-[#14223b]">
                                {formatCurrency(profitSummary.currentCostTotal)}
                              </span>
                            </p>
                            <p className={`text-[12.5px] font-semibold mt-0.5 ${getProfitTone(profitSummary.currentProfitPercent)}`}>
                              Kâr: {formatCurrency(profitSummary.currentProfit)} ({formatProfitPercent(profitSummary.currentProfitPercent)})
                            </p>
                            {profitSummary.currentMissingLines > 0 && (
                              <p className="mt-1 text-[10.5px] text-[#b45309] m-0">
                                {profitSummary.currentMissingLines} satırda güncel maliyet yok.
                              </p>
                            )}
                          </div>
                        </div>
                        {(profitSummary.entryMissingLines > 0 ||
                          profitSummary.currentMissingLines > 0 ||
                          profitSummary.manualLines > 0) && (
                          <p className="mt-3 text-[11px] text-[#8b97ac] m-0">
                            Maliyeti olmayan veya manuel girilen satırlar kâr hesabına dahil edilmez.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Kart aksiyonlari */}
                  <div className="flex items-center gap-1.5 flex-wrap border-t border-[#eef1f6] px-[17px] py-[11px]">
                    <button type="button" onClick={() => handlePdfExport(quote)} className={secBtn}>
                      <Download width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      PDF İndir
                    </button>
                    <button type="button" onClick={() => handleExcelExport(quote)} className={secBtn}>
                      <FileSpreadsheet width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      Excel İndir
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStockPdfExport(quote)}
                      disabled={stockPdfLoadingId === quote.id}
                      className={secBtn}
                    >
                      <PackageSearch width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      {stockPdfLoadingId === quote.id ? 'Hazırlanıyor...' : 'Stoklu PDF İndir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecommendedPdfExport(quote)}
                      disabled={recommendedPdfLoadingId === quote.id}
                      className={secBtn}
                    >
                      <Sparkles width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      {recommendedPdfLoadingId === quote.id ? 'Hazırlanıyor...' : 'Önerili PDF İndir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWhatsappShare(quote)}
                      className="inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#047857] cursor-pointer hover:bg-[#ecfdf5]"
                    >
                      <MessageCircle width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      WhatsApp Paylaş
                    </button>
                    {quote.status === 'SENT_TO_MIKRO' &&
                      (quote.customerPdfSentAt ? (
                        <button
                          type="button"
                          onClick={() => handleMarkCustomerPdfSent(quote.id)}
                          disabled={markingCustomerPdfSentId === quote.id}
                          className={secBtn}
                        >
                          <Send width={13} height={13} stroke="currentColor" strokeWidth={2} />
                          {markingCustomerPdfSentId === quote.id ? 'Kaydediliyor...' : 'PDF Tekrar Gönderdim'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkCustomerPdfSent(quote.id)}
                          disabled={markingCustomerPdfSentId === quote.id}
                          className="inline-flex items-center gap-1.5 bg-[#15356b] border-none rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white cursor-pointer hover:bg-[#1c4585] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Send width={13} height={13} stroke="currentColor" strokeWidth={2} />
                          {markingCustomerPdfSentId === quote.id ? 'Kaydediliyor...' : 'PDF Müşteriye Gönderdim'}
                        </button>
                      ))}
                    <button type="button" onClick={() => handleOpenHistory(quote)} className={secBtn}>
                      <History width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      Geçmiş
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => router.push(`/quotes/new?edit=${quote.id}`)}
                        className={secBtn}
                      >
                        <Pencil width={13} height={13} stroke="currentColor" strokeWidth={2} />
                        Düzenle
                      </button>
                    )}
                    {quote.mikroNumber && quote.status !== 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => router.push(`/quotes/convert/${quote.id}`)}
                        className="inline-flex items-center gap-1.5 bg-white border border-[#d6e0f1] rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#eef2fa]"
                      >
                        <ArrowRightLeft width={13} height={13} stroke="currentColor" strokeWidth={2} />
                        Siparişe Çevir
                      </button>
                    )}
                    {quote.mikroNumber && (
                      <button
                        type="button"
                        onClick={() => handleSync(quote.id)}
                        disabled={syncingQuoteId === quote.id}
                        className={secBtn}
                      >
                        <RefreshCw
                          width={13}
                          height={13}
                          stroke="currentColor"
                          strokeWidth={2}
                          className={syncingQuoteId === quote.id ? 'animate-spin' : ''}
                        />
                        {syncingQuoteId === quote.id ? 'Güncelleniyor...' : 'Mikrodan Güncelle'}
                      </button>
                    )}
                    {quote.status === 'PENDING_APPROVAL' && isAdmin && (
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReject(quote.id)}
                          className="inline-flex items-center gap-1.5 bg-white border border-[#fecaca] rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#b91c1c] cursor-pointer hover:bg-[#fef2f2]"
                        >
                          <Ban width={13} height={13} stroke="currentColor" strokeWidth={2} />
                          Reddet
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(quote.id)}
                          className="inline-flex items-center gap-1.5 bg-[#047857] border-none rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white cursor-pointer hover:bg-[#065f46]"
                        >
                          <Check width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                          Onayla ve Mikro'ya Gönder
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sunucu-tarafli sayfalama kontrolu */}
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
          <div className="text-[12.5px] text-[#51607a]">
            Sayfa {pagination.totalPages > 0 ? page : 0} / {pagination.totalPages} · Toplam {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={loading || page <= 1}
              className="inline-flex items-center gap-1.5 bg-white border border-[#e7ebf2] rounded-lg px-3.5 h-[38px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={loading || page >= pagination.totalPages}
              className="inline-flex items-center gap-1.5 bg-[#15356b] border-none rounded-lg px-3.5 h-[38px] text-[12.5px] font-semibold text-white cursor-pointer hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>

      {/* PDF Indir prompt modal — paylasilan Modal bilesenini kullanir */}
      <Modal
        isOpen={downloadPromptOpen}
        onClose={handleDownloadPromptClose}
        title="PDF İndir"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleDownloadPromptClose}
              disabled={downloadPromptLoading || downloadPromptRecommendedLoading}
            >
              Hayır
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPromptConfirm}
              isLoading={downloadPromptLoading}
              disabled={downloadPromptRecommendedLoading}
            >
              PDF İndir
            </Button>
            <Button
              variant="primary"
              onClick={handleDownloadPromptRecommended}
              isLoading={downloadPromptRecommendedLoading}
              disabled={downloadPromptLoading}
            >
              Önerili PDF İndir
            </Button>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-[#eef2fa]">
            <Info width={24} height={24} stroke="#15356b" strokeWidth={2} />
          </div>
          <p className="mt-4 text-[#51607a]">
            {downloadPromptQuote
              ? `${downloadPromptQuote.quoteNumber} numaralı teklifin PDF'ini indirmek ister misiniz?`
              : "Teklifin PDF'ini indirmek ister misiniz?"}
          </p>
        </div>
      </Modal>

      {/* Teklif Gecmisi modal */}
      <Modal
        isOpen={historyOpen}
        onClose={handleHistoryClose}
        title={historyQuote ? `Teklif Geçmişi - ${historyQuote.quoteNumber}` : 'Teklif Geçmişi'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={handleHistoryClose}>
            Kapat
          </Button>
        }
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#15356b] border-t-transparent" />
          </div>
        ) : historyItems.length === 0 ? (
          <p className="text-[13px] text-[#8b97ac]">Kayıt bulunamadı.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {historyItems.map((entry) => {
              const { summaryLines, changeLines } = buildHistoryDetails(entry);
              const actorName = entry.actor?.name || 'Sistem';
              const isExpanded = expandedHistoryEntries.has(entry.id);
              return (
                <div key={entry.id} className="rounded-lg border border-[#e7ebf2] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#14223b]">
                      <FileText width={14} height={14} stroke="#8b97ac" strokeWidth={2} />
                      {entry.summary || resolveHistoryLabel(entry.action)}
                    </div>
                    <Badge variant="outline">{resolveHistoryLabel(entry.action)}</Badge>
                  </div>
                  <div className="text-[11px] text-[#8b97ac] mt-1">
                    {formatDate(entry.createdAt)} - {actorName}
                  </div>
                  {summaryLines.length > 0 && (
                    <div className="text-[11.5px] text-[#51607a] mt-2">{summaryLines.join(' - ')}</div>
                  )}
                  {changeLines.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-[11.5px] font-semibold text-[#15356b] hover:text-[#1c4585]"
                        onClick={() => toggleHistoryEntry(entry.id)}
                      >
                        {isExpanded ? 'Detayı Gizle' : 'Detayı Göster'}
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1 text-[11.5px] text-[#51607a]">
                          {changeLines.map((line, index) => (
                            <li key={`${entry.id}-change-${index}`}>- {line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
