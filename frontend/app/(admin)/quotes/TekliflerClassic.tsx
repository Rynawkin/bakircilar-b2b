'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import {
  useTeklifler,
  getStatusBadge,
  completeQuoteProfitSummary,
  calculateQuoteProfitSummary,
  formatProfitPercent,
  getProfitTone,
} from './useTeklifler';

/**
 * Klasik (mevcut) Teklifler gorunumu. JSX birebir korunmustur; tum mantik useTeklifler'den gelir.
 */
export default function TekliflerClassic() {
  const {
    router,
    isAdmin,
    loading,
    filteredQuotes,
    counts,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teklifler</h1>
            <p className="text-sm text-gray-600">Musteri teklif yonetimi</p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/quotes/new')}>
            + Yeni Teklif
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => handleTabChange('PENDING_APPROVAL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'PENDING_APPROVAL'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏳ Onay Bekleyen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'PENDING_APPROVAL' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.pending}</span>
            </button>
            <button
              onClick={() => handleTabChange('SENT_TO_MIKRO')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'SENT_TO_MIKRO'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✅ Gönderilen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'SENT_TO_MIKRO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.sent}</span>
            </button>
            <button
              onClick={() => handleTabChange('REJECTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'REJECTED'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ❌ Reddedilen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.rejected}</span>
            </button>
            <button
              onClick={() => handleTabChange('CUSTOMER_ACCEPTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'CUSTOMER_ACCEPTED'
                  ? 'text-green-700 border-b-2 border-green-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🤝 Müşteri Kabul
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'CUSTOMER_ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.accepted}</span>
            </button>
            <button
              onClick={() => handleTabChange('ALL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'ALL'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Tümü
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ALL' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
              }`}>{counts.all}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container-custom py-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adı, teklif no, belge no, müşteri kodu veya ürün adı ara..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
          </div>
          {searchTerm && (
            <Button variant="secondary" onClick={() => setSearchTerm('')}>
              Temizle
            </Button>
          )}
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              Seçili filtrede teklif bulunamadı.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredQuotes.map((quote) => {
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
                <Card key={quote.id} className="overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs text-gray-500">Cari</div>
                      <div className="font-semibold text-gray-900">{customerName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Kod: {customerCode} - Teklif #{quote.quoteNumber} - {createdAtText}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Olusturan: {createdByName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Guncelleme: {updatedAtText} - {updatedByName}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Geçerlilik: {formatDateShort(quote.validityDate)}
                      </div>
                      {quote.mikroNumber && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1">
                          <span className="text-xs font-medium text-blue-700">Mikro No:</span>
                          <span className="text-xs font-mono font-bold text-blue-900">{quote.mikroNumber}</span>
                        </div>
                      )}
                      {quote.customerPdfSentAt && (
                        <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          <span className="font-semibold">PDF musteriye gonderildi:</span>
                          <span>{formatDate(quote.customerPdfSentAt)}</span>
                          <span>-</span>
                          <span>{quote.customerPdfSentBy?.name || '-'}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      {getStatusBadge(quote.status)}
                      {getConversionBadge(quote)}
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Toplam</div>
                        <div className="text-lg font-bold text-primary-600">{formatCurrency(quote.grandTotal)}</div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                        onClick={() => toggleExpanded(quote.id)}
                      >
                        {isExpanded ? 'Detayı Gizle' : 'Detayı Göster'}
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handlePdfExport(quote)}>
                      PDF İndir
                    </Button>
                    <Button variant="secondary" onClick={() => handleExcelExport(quote)}>
                      Excel Indir
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleStockPdfExport(quote)}
                      isLoading={stockPdfLoadingId === quote.id}
                      disabled={stockPdfLoadingId === quote.id}
                    >
                      Stoklu PDF Indir
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleRecommendedPdfExport(quote)}
                      isLoading={recommendedPdfLoadingId === quote.id}
                      disabled={recommendedPdfLoadingId === quote.id}
                    >
                      Onerili PDF Indir
                    </Button>
                    <Button variant="secondary" onClick={() => handleWhatsappShare(quote)}>
                      WhatsApp Paylaş
                    </Button>
                    {quote.status === 'SENT_TO_MIKRO' && (
                      <Button
                        variant={quote.customerPdfSentAt ? 'secondary' : 'primary'}
                        onClick={() => handleMarkCustomerPdfSent(quote.id)}
                        isLoading={markingCustomerPdfSentId === quote.id}
                        disabled={markingCustomerPdfSentId === quote.id}
                      >
                        {quote.customerPdfSentAt ? 'PDF Tekrar Gonderdim' : 'PDF Musteriye Gonderdim'}
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => handleOpenHistory(quote)}>
                      Gecmis
                    </Button>
                    {canEdit && (
                      <Button variant="secondary" onClick={() => router.push(`/quotes/new?edit=${quote.id}`)}>
                        Duzenle
                      </Button>
                    )}
                    {quote.mikroNumber && quote.status !== 'REJECTED' && (
                      <Button variant="primary" onClick={() => router.push(`/quotes/convert/${quote.id}`)}>
                        Siparise Cevir
                      </Button>
                    )}
                    {quote.mikroNumber && (
                      <Button
                        variant="secondary"
                        onClick={() => handleSync(quote.id)}
                        disabled={syncingQuoteId === quote.id}
                      >
                        {syncingQuoteId === quote.id ? 'Guncelleniyor...' : 'Mikrodan Guncelle'}
                      </Button>
                    )}
                    {quote.status === 'PENDING_APPROVAL' && isAdmin && (
                      <>
                        <Button variant="primary" onClick={() => handleApprove(quote.id)}>
                          Onayla ve Mikro'ya Gönder
                        </Button>
                        <Button variant="danger" onClick={() => handleReject(quote.id)}>
                          Reddet
                        </Button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <>
                      {quote.adminNote && (
                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                          <p className="text-xs font-medium text-gray-600">Admin Notu:</p>
                          <p className="text-sm text-gray-800 mt-1">{quote.adminNote}</p>
                        </div>
                      )}
                      {quote.createdBy && (
                        <div className="mt-2 text-xs text-gray-500">
                          Oluşturan: {quote.createdBy.name}
                        </div>
                      )}

                      {quote.customer && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Müşteri Bilgileri</h4>
                          <CustomerInfoCard customer={quote.customer} />
                        </div>
                      )}

                      <div className="border-t pt-4 mt-4">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Teklif Kalemleri ({quote.items.length} ürün)</p>
                        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                          {quote.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-gray-100">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{item.productName}</p>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  <span className="text-xs text-gray-500">{item.productCode}</span>
                                  <Badge variant="default" className="text-xs">
                                    {item.priceSource === 'PRICE_LIST' ? `Liste ${item.priceListNo}` :
                                     item.priceSource === 'LAST_SALE' ? 'Son Satış' : 'Manuel'}
                                  </Badge>
                                  {item.isBlocked && <Badge variant="warning" className="text-xs">Blok</Badge>}
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                                <p className="font-semibold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800">Dip Toplam Karlilik Ozeti</p>
                          <p className="text-xs text-gray-500">Hesap KDV haric satis tutari uzerinden yapilir.</p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="rounded-lg bg-white p-3 shadow-sm">
                            <p className="text-xs font-medium text-gray-500">KDV Haric Satis Toplami</p>
                            <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrency(profitSummary.salesTotal)}</p>
                          </div>
                          <div className="rounded-lg bg-white p-3 shadow-sm">
                            <p className="text-xs font-medium text-gray-500">Giris Maliyetine Gore</p>
                            <p className="mt-1 text-sm text-gray-700">Toplam maliyet: <span className="font-semibold">{formatCurrency(profitSummary.entryCostTotal)}</span></p>
                            <p className={`text-sm font-semibold ${getProfitTone(profitSummary.entryProfitPercent)}`}>
                              Kar: {formatCurrency(profitSummary.entryProfit)} ({formatProfitPercent(profitSummary.entryProfitPercent)})
                            </p>
                            {profitSummary.entryMissingLines > 0 && (
                              <p className="mt-1 text-[11px] text-amber-700">{profitSummary.entryMissingLines} satirda giris maliyeti yok.</p>
                            )}
                          </div>
                          <div className="rounded-lg bg-white p-3 shadow-sm">
                            <p className="text-xs font-medium text-gray-500">Guncel Maliyete Gore</p>
                            <p className="mt-1 text-sm text-gray-700">Toplam maliyet: <span className="font-semibold">{formatCurrency(profitSummary.currentCostTotal)}</span></p>
                            <p className={`text-sm font-semibold ${getProfitTone(profitSummary.currentProfitPercent)}`}>
                              Kar: {formatCurrency(profitSummary.currentProfit)} ({formatProfitPercent(profitSummary.currentProfitPercent)})
                            </p>
                            {profitSummary.currentMissingLines > 0 && (
                              <p className="mt-1 text-[11px] text-amber-700">{profitSummary.currentMissingLines} satirda guncel maliyet yok.</p>
                            )}
                          </div>
                        </div>
                        {(profitSummary.entryMissingLines > 0 || profitSummary.currentMissingLines > 0 || profitSummary.manualLines > 0) && (
                          <p className="mt-3 text-xs text-gray-500">
                            Maliyeti olmayan veya manuel girilen satirlar kar hesabina dahil edilmez.
                          </p>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-200" />
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
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
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-4 text-gray-600">
            {downloadPromptQuote
              ? `${downloadPromptQuote.quoteNumber} numaralı teklifin PDF'ini indirmek ister misiniz?`
              : "Teklifin PDF'ini indirmek ister misiniz?"}
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={historyOpen}
        onClose={handleHistoryClose}
        title={historyQuote ? `Teklif Gecmisi - ${historyQuote.quoteNumber}` : 'Teklif Gecmisi'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={handleHistoryClose}>
            Kapat
          </Button>
        }
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : historyItems.length === 0 ? (
          <p className="text-sm text-gray-500">Kayit bulunamadi.</p>
        ) : (
          <div className="space-y-3">
            {historyItems.map((entry) => {
              const { summaryLines, changeLines } = buildHistoryDetails(entry);
              const actorName = entry.actor?.name || 'Sistem';
              const isExpanded = expandedHistoryEntries.has(entry.id);
              return (
                <div key={entry.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">
                      {entry.summary || resolveHistoryLabel(entry.action)}
                    </div>
                    <Badge variant="outline">{resolveHistoryLabel(entry.action)}</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDate(entry.createdAt)} - {actorName}
                  </div>
                  {summaryLines.length > 0 && (
                    <div className="text-xs text-gray-600 mt-2">{summaryLines.join(' - ')}</div>
                  )}
                  {changeLines.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                        onClick={() => toggleHistoryEntry(entry.id)}
                      >
                        {isExpanded ? 'Detayi Gizle' : 'Detayi Goster'}
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
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
