'use client';

import { Fragment } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { Modal } from '@/components/ui/Modal';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { StockFamilySuggestion } from '@/components/admin/StockFamilySuggestion';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  convertPriceFromBaseUnit,
  convertQuantityFromBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
} from '@/lib/utils/unit';
import type { LastOrder, LastQuote, PoolSortOption, PoolColorRule } from './useTeklifOlustur';
import {
  POOL_SORT_OPTIONS,
  LINE_DESCRIPTION_KEY,
  PRICE_LIST_LABELS,
  getColumnDisplayName,
  formatStockValue,
  getStockColumnValue,
  formatManualPriceInput,
  formatQuantityInput,
  getMikroListPrice,
  getPoolPriceLabel,
  getMatchingPriceListLabel,
  formatPercent,
  formatQuotePriceType,
  getCategoryLastPurchaseInfo,
  getQuoteDocumentLabel,
  getOrderDocumentLabel,
  roundUp2,
  roundUnitValue,
  getSelectedUnit,
  getDisplayQuantity,
  getDisplayUnitPrice,
  getPercentTone,
  resolveWarehouseValue,
  CategoryLastPurchaseBadge,
  useTeklifOlustur,
} from './useTeklifOlustur';

export default function TeklifOlusturClassic() {
  const {
    addManualLine,
    addPoolColorRule,
    addProductToQuote,
    addProductsToQuote,
    addSelectedPurchasedToQuote,
    addSelectedSearchToQuote,
    aiAnalyzing,
    aiError,
    aiImage,
    aiModel,
    aiModels,
    aiRequestText,
    aiResult,
    applyFamilySplit,
    applyFamilySwap,
    applyLastSaleToAll,
    applyPriceListToAll,
    applyResponsibilityCenterToAll,
    autoScrollForDrag,
    availableColumns,
    buildAiQuotePayload,
    buildOrderNumberPayload,
    buildQuoteItem,
    buildQuoteItemFromExisting,
    bulkPriceListNo,
    bulkResponsibilityCenter,
    cardShell,
    categoryLastPurchaseMap,
    clearAllColumns,
    clearPurchasedSelection,
    clearSearchSelection,
    columnWidths,
    columnsCount,
    contactsLoading,
    customerContacts,
    customerOptions,
    customers,
    draggingColumn,
    draggingItemId,
    editInitializedRef,
    editOrderId,
    editOrderInitializedRef,
    editQuoteId,
    editingOrderCustomerCode,
    editingQuote,
    expandedQuoteHistory,
    fetchCustomerContacts,
    fetchPurchasedProducts,
    fetchSearchResults,
    filteredPurchasedProducts,
    filteredSearchResults,
    getColumnWidth,
    getMarginInfo,
    getPoolColorClass,
    getPoolQuantityInputValue,
    getPoolQuantityValue,
    handleColumnDragEnd,
    handleColumnDragOver,
    handleColumnDragStart,
    handleColumnDrop,
    handleGlobalVatZeroChange,
    handleLastSaleChange,
    handleLastSalesCountChange,
    handleManualImageFileChange,
    handleManualImageUpload,
    handleManualMarginChange,
    handleManualPriceChange,
    handleManualVatChange,
    handleOrderSeriesChange,
    handlePriceListChange,
    handlePriceSourceChange,
    handleQuantityChange,
    handleRecommendationAdd,
    handleReserveQuantityChange,
    handleRowDragEnd,
    handleRowDragOver,
    handleRowDragStart,
    handleRowDrop,
    handleScrollBarScroll,
    handleSelectedUnitChange,
    handleSubmit,
    handleTableDragOver,
    handleTableScroll,
    hasBlockedPreview,
    hasManualCustomerChange,
    includedWarehouses,
    isEditMode,
    isOrderEditMode,
    isOrderMode,
    isQuoteTableFullscreen,
    isResizing,
    lastOrderMap,
    lastQuoteMap,
    lastSalesCount,
    lineDescriptionIndex,
    loadInitialData,
    loadOrderForEdit,
    loadQuoteForEdit,
    loadingOrder,
    loadingQuote,
    manualImageUploading,
    normalizePoolQuantityInputValue,
    note,
    onAiImageChange,
    onAiModelChange,
    openAiAnalysis,
    openPriceRequestModal,
    orderCustomerOrderNumber,
    orderDocumentDescription,
    orderHasInvoiced,
    orderHasWhite,
    orderInvoicedSeries,
    orderInvoicedSira,
    orderWarehouse,
    orderWhiteSeries,
    orderWhiteSira,
    originalOrderInvoicedNumber,
    originalOrderWhiteNumber,
    poolColorRules,
    poolPriceListNo,
    poolQuantityInputs,
    poolSort,
    prefillInitializedRef,
    priceRequestNote,
    priceRequestPriority,
    priceRequestSaving,
    priceRequestStockPayload,
    priceRequestTarget,
    productTab,
    profitTotals,
    purchasedProducts,
    purchasedSearch,
    quoteItems,
    quoteProductCodeSet,
    quoteProductCodes,
    recommendations,
    recommendationsLoading,
    removeItem,
    removeManualImage,
    removePoolColorRule,
    renderResizeHandle,
    reorderableColumns,
    resizeRef,
    resolvedLineDescriptionIndex,
    responsibles,
    router,
    runAiAnalysis,
    saveColumnPreferences,
    savePoolPreferences,
    saveQuotePreferences,
    savingColumns,
    savingPoolPreferences,
    scrollBarWrapperClass,
    scrollSyncRef,
    searchLoading,
    searchParams,
    searchResults,
    searchTerm,
    selectAllColumns,
    selectAllPurchased,
    selectAllSearch,
    selectPoolQuantityInput,
    selectedColumns,
    selectedContactId,
    selectedCustomer,
    selectedPurchasedCodes,
    selectedPurchasedCount,
    selectedResponsibleCode,
    selectedSearchCodes,
    selectedSearchCount,
    setAiAnalyzing,
    setAiError,
    setAiImage,
    setAiModel,
    setAiModels,
    setAiRequestText,
    setAiResult,
    setAvailableColumns,
    setBulkPriceListNo,
    setBulkResponsibilityCenter,
    setCategoryLastPurchaseMap,
    setColumnWidths,
    setContactsLoading,
    setCustomerContacts,
    setCustomers,
    setDraggingColumn,
    setDraggingItemId,
    setEditingOrderCustomerCode,
    setEditingQuote,
    setExpandedQuoteHistory,
    setHasManualCustomerChange,
    setIncludedWarehouses,
    setIsQuoteTableFullscreen,
    setIsResizing,
    setLastOrderMap,
    setLastQuoteMap,
    setLastSalesCount,
    setLineDescriptionIndex,
    setLoadingOrder,
    setLoadingQuote,
    setManualImageUploading,
    setNote,
    setOrderCustomerOrderNumber,
    setOrderDocumentDescription,
    setOrderInvoicedSeries,
    setOrderInvoicedSira,
    setOrderWarehouse,
    setOrderWhiteSeries,
    setOrderWhiteSira,
    setOriginalOrderInvoicedNumber,
    setOriginalOrderWhiteNumber,
    setPoolColorRules,
    setPoolPriceListNo,
    setPoolQuantityInputValue,
    setPoolQuantityInputs,
    setPoolSort,
    setPriceRequestNote,
    setPriceRequestPriority,
    setPriceRequestSaving,
    setPriceRequestStockPayload,
    setPriceRequestTarget,
    setProductTab,
    setPurchasedProducts,
    setPurchasedSearch,
    setQuoteItems,
    setRecommendations,
    setRecommendationsLoading,
    setResponsibles,
    setSavingColumns,
    setSavingPoolPreferences,
    setSearchLoading,
    setSearchResults,
    setSearchTerm,
    setSelectedColumns,
    setSelectedContactId,
    setSelectedCustomer,
    setSelectedPurchasedCodes,
    setSelectedResponsibleCode,
    setSelectedSearchCodes,
    setShowAiModal,
    setShowCariModal,
    setShowColumnSelector,
    setShowLastOrderInfo,
    setShowLastQuoteInfo,
    setShowLeftPanel,
    setShowPoolColorOptions,
    setShowProductPoolModal,
    setStockDataMap,
    setStockUnits,
    setSubmitting,
    setTableScrollMetrics,
    setValidityDate,
    setVatZeroed,
    setWhatsappTemplate,
    showAiModal,
    showCariModal,
    showColumnSelector,
    showLastOrderInfo,
    showLastQuoteInfo,
    showLeftPanel,
    showOrderInvoicedFields,
    showOrderWhiteFields,
    showPoolColorOptions,
    showProductPoolModal,
    showTableScrollBar,
    sortPoolProducts,
    sortedPurchasedProducts,
    sortedSearchResults,
    startColumnResize,
    stockDataMap,
    stockUnits,
    submitPriceVerificationRequest,
    submitting,
    tableCardClass,
    tableColumnKeys,
    tableContainerClass,
    tableScrollBarRef,
    tableScrollMetrics,
    tableScrollRef,
    togglePurchasedSelection,
    toggleQuoteHistory,
    toggleSearchSelection,
    totals,
    trailingColumnKeys,
    updateItem,
    updatePoolColorRule,
    updatePriceRequestMargin,
    updatePriceRequestStockPayload,
    validateQuote,
    validityDate,
    vatZeroed,
    whatsappTemplate,
  } = useTeklifOlustur();

  if ((isEditMode && loadingQuote) || (isOrderEditMode && loadingOrder)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          {isOrderEditMode ? 'Siparis yukleniyor...' : 'Teklif yukleniyor...'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden overflow-y-visible">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-140px] h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
      </div>

      <div className="relative z-10 container-custom max-w-[1600px] py-8 2xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isOrderMode
                ? (isOrderEditMode ? 'Siparis Duzenle' : 'Siparis Olustur')
                : isEditMode
                  ? 'Teklif Duzenle'
                  : 'Teklif Olustur'}
            </h1>
            <p className="text-sm text-gray-600">
              {isOrderMode
                ? (isOrderEditMode ? 'Mevcut siparis kalemleri guncellenir' : 'Mikro satis siparisi yazilir')
                : isEditMode
                  ? 'Mikro teklif guncellenir'
                  : 'Mikro teklif fisine aktarilir'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push(isOrderMode ? '/orders' : '/quotes')}>
            {isOrderMode ? 'Siparisler' : 'Teklifler'}
          </Button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {showLeftPanel && (
          <div className="xl:col-span-5 space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-gray-900">Sol Panel</p>
            <p className="text-xs text-gray-500">Musteri ve urun secimi.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeftPanel(false)}
            className="rounded-full border-slate-200 bg-white text-gray-700 hover:bg-slate-50"
          >
            Sol Paneli Gizle
          </Button>
        </div>
        <Card className={cardShell}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Musteri</h2>
              <p className="text-xs text-gray-500">{isOrderMode ? 'Siparis icin cari secin.' : 'Teklif icin cari secin.'}</p>
            </div>
            <Button variant="secondary" onClick={() => setShowCariModal(true)}>
              {isEditMode ? 'Musteri Degistir' : 'Musteri Sec'}
            </Button>
          </div>
          {selectedCustomer ? (
            <CustomerInfoCard customer={selectedCustomer} />
          ) : (
            <div className="text-sm text-gray-500">{isOrderMode ? 'Siparis icin musteri secin.' : 'Teklif icin musteri secin.'}</div>
          )}
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Teklif Ayarlari</h2>
                <p className="text-xs text-gray-500">Son satis ve mesaj tercihleriniz.</p>
              </div>
              <Button variant="secondary" onClick={saveQuotePreferences}>
                Tercihleri Kaydet
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'\u0130lgili Ki\u015fi'}</label>
                <select
                  value={lastSalesCount}
                  onChange={(e) => handleLastSalesCountChange(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">{'Bu m\u00fc\u015fteri i\u00e7in kay\u0131tl\u0131 ki\u015fi yok.'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Sablonu</label>
                <textarea
                  value={whatsappTemplate}
                  onChange={(e) => setWhatsappTemplate(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  placeholder="{{customerName}} {{quoteNumber}}"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Sorumlu</label>
                <select
                  value={selectedResponsibleCode}
                  onChange={(e) => setSelectedResponsibleCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">{'\u0130lgili se\u00e7in'}</option>
                  {responsibles.map((person) => (
                    <option key={person.code} value={person.code}>
                      {person.code} - {person.name} {person.surname}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Secilen sorumlu Mikro teklifinde kullanilir. Kaydetmek icin "Tercihleri Kaydet" deyin.
                </p>
              </div>
            </div>
          </div>
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Urun Havuzu</h2>
              <p className="text-xs text-gray-500">Son {lastSalesCount} satis gosteriliyor.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setShowProductPoolModal(true)}
                size="sm"
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>Secili urun: {selectedPurchasedCount}</span>
            <span>Toplam urun: {purchasedProducts.length}</span>
            <span>Mod: {productTab === 'purchased' ? 'Daha Once Alinanlar' : 'Tum Urunler'}</span>
          </div>
        </Card>
          </div>
          )}
          <div className={`${showLeftPanel ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-6`}>
            {!showLeftPanel && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm">
                <span className="text-gray-500">Sol panel gizli.</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowLeftPanel(true)}
                  className="rounded-full px-4"
                >
                  Sol Paneli Goster
                </Button>
              </div>
            )}
            <Card className={cardShell}>
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{isOrderMode ? 'Siparis Bilgileri' : 'Teklif Bilgileri'}</h2>
                  <p className="text-xs text-gray-500">
                    {isOrderMode
                      ? (isOrderEditMode ? 'Belge, aciklama ve satir bilgileri.' : 'Depo ve evrak bilgileri.')
                      : 'Gecerlilik, not ve KDV ayarlari.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isOrderMode && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gecerlilik Tarihi</label>
                        <input
                          type="date"
                          value={validityDate}
                          onChange={(e) => setValidityDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">İlgili Kişi</label>
                        <select
                          value={selectedContactId}
                          onChange={(e) => setSelectedContactId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                          disabled={!selectedCustomer || contactsLoading}
                        >
                          <option value="">İlgili seçin</option>
                          {customerContacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.phone ? ` - ${contact.phone}` : ""}
                              {contact.email ? ` (${contact.email})` : ""}
                            </option>
                          ))}
                        </select>
                        {!contactsLoading && selectedCustomer && customerContacts.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">Bu müşteri için kayıtlı kişi yok.</p>
                        )}
                      </div>                    </>
                  )}
                  {isOrderMode && (
                    <>
                      {!isOrderEditMode && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Depo</label>
                          {includedWarehouses.length > 0 ? (
                            <select
                              value={orderWarehouse}
                              onChange={(e) => setOrderWarehouse(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                            >
                              {includedWarehouses.map((warehouse) => (
                                <option key={warehouse} value={resolveWarehouseValue(warehouse)}>
                                  {warehouse}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={orderWarehouse}
                              onChange={(e) => setOrderWarehouse(e.target.value)}
                              placeholder="Depo"
                            />
                          )}
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Belge No (Musteri Siparis No)</label>
                        <Input
                          value={orderCustomerOrderNumber}
                          onChange={(e) => setOrderCustomerOrderNumber(e.target.value)}
                          placeholder="Orn: HENDEK-8915"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ctrl+Q Aciklama 1</label>
                        <Input
                          value={orderDocumentDescription}
                          onChange={(e) => setOrderDocumentDescription(e.target.value)}
                          placeholder="Orn: test"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {showOrderInvoicedFields && (
                          <div className={isOrderEditMode ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Faturali Seri</label>
                              <Input
                                value={orderInvoicedSeries}
                                onChange={(e) => handleOrderSeriesChange('INVOICED', e.target.value)}
                                placeholder="Orn: HENDEK"
                              />
                              {!orderHasInvoiced && (
                                <p className="mt-1 text-[11px] text-gray-500">Faturali satir eklenirse kullanilir.</p>
                              )}
                            </div>
                            {isOrderEditMode && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Faturali Sira</label>
                                <Input
                                  value={orderInvoicedSira}
                                  onChange={(e) => setOrderInvoicedSira(e.target.value)}
                                  placeholder="Bos birakilirsa otomatik"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {showOrderWhiteFields && (
                          <div className={isOrderEditMode ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Beyaz Seri</label>
                              <Input
                                value={orderWhiteSeries}
                                onChange={(e) => handleOrderSeriesChange('WHITE', e.target.value)}
                                placeholder="Orn: HENDEK"
                              />
                              {!orderHasWhite && (
                                <p className="mt-1 text-[11px] text-gray-500">Beyaz satir eklenirse kullanilir.</p>
                              )}
                            </div>
                            {isOrderEditMode && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Beyaz Sira</label>
                                <Input
                                  value={orderWhiteSira}
                                  onChange={(e) => setOrderWhiteSira(e.target.value)}
                                  placeholder="Bos birakilirsa otomatik"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={vatZeroed}
                      onChange={(e) => handleGlobalVatZeroChange(e.target.checked)}
                      className="h-4 w-4 accent-primary-600"
                    />
                    <span className="text-gray-700">Tum satirlarda KDV sifirla</span>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      placeholder="Teklif notu"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {isOrderMode
                        ? "Not, Mikro'da aciklama alanina yazilir."
                        : "Not, Mikro'da belge no alanina da yazilir."}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
        {isQuoteTableFullscreen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setIsQuoteTableFullscreen(false)}
          />
        )}
        <Card
          className={tableCardClass}
          onClick={(event) => {
            if (isQuoteTableFullscreen) {
              event.stopPropagation();
            }
          }}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{isOrderMode ? 'Siparis Kalemleri' : 'Teklif Kalemleri'} ({quoteItems.length})</h2>
              <p className="text-xs text-gray-500">{isOrderMode ? 'Siparis satirlarini duzenleyin.' : 'Fiyat kaynagini secip satirlari duzenleyin.'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <select
                value={bulkPriceListNo}
                onChange={(e) => setBulkPriceListNo(e.target.value ? Number(e.target.value) : '')}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
              >
                <option value="">Liste Sec</option>
                {Object.keys(PRICE_LIST_LABELS).map((key) => (
                  <option key={key} value={key}>
                    {PRICE_LIST_LABELS[Number(key)]}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyPriceListToAll} className="rounded-full">
                Tum Satirlara Uygula
              </Button>
              <Button variant="secondary" size="sm" onClick={applyLastSaleToAll} className="rounded-full">
                Son Satisi Uygula
              </Button>
              <Button
                variant={isOrderMode ? (showLastOrderInfo ? 'primary' : 'secondary') : (showLastQuoteInfo ? 'primary' : 'secondary')}
                size="sm"
                onClick={() => {
                  if (isOrderMode) {
                    setShowLastOrderInfo((prev) => !prev);
                  } else {
                    setShowLastQuoteInfo((prev) => !prev);
                  }
                }}
                className="rounded-full"
              >
                {isOrderMode
                  ? (showLastOrderInfo ? 'Son Siparisleri Gizle' : 'Son Siparisleri Goster')
                  : (showLastQuoteInfo ? 'Son Teklifi Gizle' : 'Son Teklifi Goster')}
              </Button>
              {isOrderMode && (
                <>
                  <input
                    value={bulkResponsibilityCenter}
                    onChange={(e) => setBulkResponsibilityCenter(e.target.value)}
                    placeholder="Sorumluluk merkezi"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
                  />
                  <Button variant="secondary" size="sm" onClick={applyResponsibilityCenterToAll} className="rounded-full">
                    Sorumluluk Uygula
                  </Button>
                </>
              )}

              <Button variant="secondary" size="sm" onClick={() => setShowColumnSelector(true)} className="rounded-full">
                Kolonlari Sec
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={saveColumnPreferences}
                disabled={savingColumns}
                className="rounded-full"
              >
                {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
              <Button variant="secondary" size="sm" onClick={addManualLine} className="rounded-full">
                Manuel Satir Ekle
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsQuoteTableFullscreen((prev) => !prev)}
                className="rounded-full"
              >
                {isQuoteTableFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowProductPoolModal(true)}
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>

          {hasBlockedPreview && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Bazi satirlarda giris maliyetine gore kar %5 altinda. Bu teklif admin onayina gidecek.
            </div>
          )}

          {quoteItems.length === 0 ? (
            <div className="text-sm text-gray-500">Teklife urun eklenmedi.</div>
          ) : (
            <div
              ref={tableScrollRef}
              className={tableContainerClass}
              onDragOver={handleTableDragOver}
              onScroll={handleTableScroll}
            >
              <table className="w-full min-w-[1100px] table-fixed text-sm">
                <colgroup>
                  {tableColumnKeys.map((key) => (
                    <col key={key} style={{ width: `${getColumnWidth(key)}px` }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      #
                      {renderResizeHandle('rowNumber')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Urun
                      {renderResizeHandle('product')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Miktar
                      {renderResizeHandle('quantity')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      {isOrderMode ? 'Fiyat Tipi / Kaynagi' : 'Fiyat Kaynagi'}
                      {renderResizeHandle('priceSource')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Secim
                      {renderResizeHandle('selection')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-right bg-slate-50">
                      Birim Fiyat
                      {renderResizeHandle('unitPrice')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-right bg-slate-50">
                      Toplam
                      {renderResizeHandle('lineTotal')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      KDV
                      {renderResizeHandle('vat')}
                    </th>
                    {trailingColumnKeys.map((columnKey) => {
                      if (columnKey === 'lineDescription') {
                        return (
                          <th key={columnKey} className="relative select-none px-3 py-2 text-left bg-slate-50">
                            Aciklama
                            {renderResizeHandle('lineDescription')}
                          </th>
                        );
                      }
                      const column = columnKey.replace('stock:', '');
                      return (
                        <th
                          key={columnKey}
                          className="relative select-none px-3 py-2 text-left whitespace-nowrap bg-slate-50"
                        >
                          {getColumnDisplayName(column)}
                          {renderResizeHandle(columnKey)}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 bg-slate-50"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quoteItems.map((item, index) => {
                    const marginInfo = getMarginInfo(item);
                    const showHistory = isOrderMode ? showLastOrderInfo : showLastQuoteInfo;
                    const itemHistory = !item.isManualLine
                      ? (isOrderMode
                        ? (lastOrderMap[item.productCode] || item.lastOrders || [])
                        : (lastQuoteMap[item.productCode] || item.lastQuotes || []))
                      : [];
                    const categoryLastPurchase = getCategoryLastPurchaseInfo(
                      categoryLastPurchaseMap[item.productCode] || item
                    );
                    const hasItemHistory = showHistory && itemHistory.length > 0;
                    const canToggleHistory = showHistory && itemHistory.length > 1;
                    const isQuoteHistoryExpanded = Boolean(expandedQuoteHistory[item.id]);
                    const roundedUnitPrice = roundUp2(item.unitPrice || 0);
                    const lineTotal = roundedUnitPrice * (item.quantity || 0);
                    const selectedUnit = getSelectedUnit(item);
                    const availableUnits = item.isManualLine
                      ? (stockUnits.length > 0 ? stockUnits : ['ADET'])
                      : getAvailableUnits(item.unit, item.unit2, item.unit2Factor);
                    const displayQuantity = getDisplayQuantity(item);
                    const displayUnitPrice = roundUp2(getDisplayUnitPrice(item));
                    const displayReserveQty = roundUnitValue(
                      convertQuantityFromBaseUnit(
                        item.reserveQty || 0,
                        selectedUnit,
                        item.unit,
                        item.unit2,
                        item.unit2Factor
                      )
                    );

                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={`bg-white ${draggingItemId === item.id ? 'opacity-70' : ''}`}
                          onDragOver={handleRowDragOver}
                          onDrop={handleRowDrop(item.id)}
                        >
                          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                draggable
                                onDragStart={handleRowDragStart(item.id)}
                                onDragEnd={handleRowDragEnd}
                                className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
                                aria-label="Satiri tasimak icin surukle"
                                title="Satiri tasimak icin surukle"
                              >
                                ::
                              </button>
                              <div className="min-w-0 flex-1">
                                {item.isManualLine ? (
                                  <div className="space-y-1">
                                    <Input
                                      placeholder="Manuel urun adi"
                                      value={item.productName}
                                      onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                                      lang="tr"
                                      autoCorrect="off"
                                      spellCheck={false}
                                      className="w-full min-w-[220px]"
                                    />
                                    <div className="text-xs text-gray-500">Kod: {item.productCode}</div>
                                    <Badge variant="warning" className="text-xs">Manuel</Badge>
                                    <button
                                      type="button"
                                      onClick={() => openPriceRequestModal(item)}
                                      className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                                    >
                                      Fiyat teyidi iste
                                    </button>
                                    <div className="flex items-center gap-2 pt-1">
                                      {item.manualImageUrl ? (
                                        <img
                                          src={item.manualImageUrl}
                                          alt="Manuel gorsel"
                                          className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                                        />
                                      ) : null}
                                      <label className={`inline-flex items-center gap-1 text-xs font-medium ${manualImageUploading[item.id] ? 'text-gray-400' : 'text-primary-600 hover:text-primary-700'}`}>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(event) => handleManualImageFileChange(item, event)}
                                          disabled={manualImageUploading[item.id]}
                                          className="hidden"
                                        />
                                        {manualImageUploading[item.id]
                                          ? 'Yukleniyor...'
                                          : item.manualImageUrl
                                            ? 'Gorsel Degistir'
                                            : 'Gorsel Yukle'}
                                      </label>
                                      {item.manualImageUrl && !manualImageUploading[item.id] ? (
                                        <button
                                          type="button"
                                          onClick={() => removeManualImage(item.id)}
                                          className="text-xs text-red-600 hover:text-red-700 underline"
                                        >
                                          Kaldir
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-medium text-gray-900">{item.productName}</div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                      <span>{item.productCode}</span>
                                      <button
                                        type="button"
                                        onClick={() => openPriceRequestModal(item)}
                                        className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                                      >
                                        Fiyat teyidi iste
                                      </button>
                                    </div>
                                    {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor) && (
                                      <div className="text-xs text-gray-500">
                                        {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor)}
                                      </div>
                                    )}
                                    <CategoryLastPurchaseBadge info={categoryLastPurchase} />
                                    {marginInfo?.blocked && (
                                      <Badge variant="danger" className="text-xs mt-1">Blok</Badge>
                                    )}
                                    {showHistory && (
                                      <div className="mt-2 text-[11px] text-gray-500">
                                        {hasItemHistory ? (
                                          <div className="space-y-1">
                                            <div
                                              className={`flex flex-wrap items-center gap-2${canToggleHistory ? ' cursor-pointer' : ''}`}
                                              onClick={canToggleHistory ? () => toggleQuoteHistory(item.id) : undefined}
                                              role={canToggleHistory ? 'button' : undefined}
                                              tabIndex={canToggleHistory ? 0 : undefined}
                                              title={canToggleHistory ? (isOrderMode ? 'Gecmis siparisleri goster' : 'Gecmis teklifleri goster') : undefined}
                                              onKeyDown={
                                                canToggleHistory
                                                  ? (event) => {
                                                      if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        toggleQuoteHistory(item.id);
                                                      }
                                                    }
                                                  : undefined
                                              }
                                            >
                                              <span className="font-semibold text-gray-700">{isOrderMode ? 'Son Siparis:' : 'Son Teklif:'}</span>
                                              <span>{formatDateShort(isOrderMode ? (itemHistory[0] as LastOrder).orderDate : (itemHistory[0] as LastQuote).quoteDate)}</span>
                                              <span className="font-semibold text-gray-900">{formatCurrency(itemHistory[0].unitPrice)}</span>
                                              <span className="text-gray-500">
                                                Belge: {isOrderMode ? getOrderDocumentLabel(itemHistory[0] as LastOrder) : getQuoteDocumentLabel(itemHistory[0] as LastQuote)}
                                              </span>
                                              {isOrderMode && (
                                                <span className="text-gray-500">Siparis: {(itemHistory[0] as LastOrder).orderNumber || '-'}</span>
                                              )}
                                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                                {formatQuotePriceType(itemHistory[0].priceType)}
                                              </span>
                                              {itemHistory.length > 1 && (
                                                <button
                                                  type="button"
                                                  onClick={() => toggleQuoteHistory(item.id)}
                                                  className="text-primary-600 hover:text-primary-700 underline"
                                                >
                                                  {isQuoteHistoryExpanded ? 'Gecmisi Gizle' : `Gecmis (${itemHistory.length - 1})`}
                                                </button>
                                              )}
                                            </div>
                                            {isQuoteHistoryExpanded && itemHistory.length > 1 && (
                                              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                                                {itemHistory.slice(1).map((historyRow, idx) => (
                                                  <div key={`${item.id}-quote-${idx}`} className="flex flex-wrap items-center gap-2 py-0.5 text-[11px] text-gray-600">
                                                    <span className="font-medium text-gray-700">
                                                      {formatDateShort(isOrderMode ? (historyRow as LastOrder).orderDate : (historyRow as LastQuote).quoteDate)}
                                                    </span>
                                                    <span className="font-semibold text-gray-900">{formatCurrency(historyRow.unitPrice)}</span>
                                                    <span className="text-gray-500">
                                                      Belge: {isOrderMode ? getOrderDocumentLabel(historyRow as LastOrder) : getQuoteDocumentLabel(historyRow as LastQuote)}
                                                    </span>
                                                    {isOrderMode && (
                                                      <span className="text-gray-500">Siparis: {(historyRow as LastOrder).orderNumber || '-'}</span>
                                                    )}
                                                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                                                      {formatQuotePriceType(historyRow.priceType)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-gray-400">{isOrderMode ? 'Son siparis yok' : 'Son teklif yok'}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={displayQuantity === 0 ? '' : formatQuantityInput(displayQuantity)}
                                onChange={(e) => handleQuantityChange(item, e.target.value)}
                                className="w-24 rounded-lg border border-gray-300 px-2 py-1"
                              />
                              {availableUnits.length > 1 || item.isManualLine ? (
                                <select
                                  value={selectedUnit}
                                  onChange={(e) => {
                                    if (item.isManualLine) {
                                      updateItem(item.id, {
                                        unit: e.target.value,
                                        selectedUnit: e.target.value,
                                        manualPriceInput: undefined,
                                      });
                                    } else {
                                      handleSelectedUnitChange(item, e.target.value);
                                    }
                                  }}
                                  className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                                >
                                  {availableUnits.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              ) : item.unit ? (
                                <span className="text-[11px] text-gray-500">{selectedUnit}</span>
                              ) : null}
                              {selectedUnit !== item.unit && (
                                <span className="text-[11px] text-sky-700">
                                  Mikro: {formatQuantityInput(item.quantity)} {item.unit}
                                </span>
                              )}
                              {isOrderMode && (
                                <div className="mt-1">
                                  <label className="block text-[11px] text-gray-500 mb-0.5">Rezerve</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={displayReserveQty ? formatQuantityInput(displayReserveQty) : ''}
                                    onChange={(e) => handleReserveQuantityChange(item, e.target.value)}
                                    className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {isOrderMode && (
                              <select
                                value={item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED'}
                                onChange={(e) => updateItem(item.id, { priceType: e.target.value === 'WHITE' ? 'WHITE' : 'INVOICED' })}
                                className="mb-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                              >
                                <option value="INVOICED">Fatural?</option>
                                <option value="WHITE">Beyaz</option>
                              </select>
                            )}
                            {item.isManualLine ? (
                              <span className="text-xs text-gray-600">Manuel</span>
                            ) : (
                              <select
                                value={item.priceSource || ''}
                                onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                              >
                                <option value="">Secin</option>
                                <option value="LAST_SALE">Son Satis</option>
                                <option value="PRICE_LIST">Fiyat Listesi</option>
                                <option value="MANUAL">Manuel</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <Input
                                placeholder="Birim fiyat"
                                value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                inputMode="decimal"
                                type="text"
                                className="w-full"
                              />
                            ) : item.priceSource === 'PRICE_LIST' ? (
                              <select
                                value={item.priceListNo || ''}
                                onChange={(e) => handlePriceListChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                              >
                                <option value="">Liste sec</option>
                                {Object.keys(PRICE_LIST_LABELS).map((key) => {
                                  const listNo = Number(key);
                                  const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
                                  const displayListPrice = convertPriceFromBaseUnit(
                                    listPrice,
                                    getSelectedUnit(item),
                                    item.unit,
                                    item.unit2,
                                    item.unit2Factor
                                  );
                                  return (
                                    <option key={key} value={key}>
                                      {PRICE_LIST_LABELS[listNo]} ({listPrice ? formatCurrency(displayListPrice) : 'Fiyat yok'})
                                    </option>
                                  );
                                })}
                              </select>
                            ) : item.priceSource === 'LAST_SALE' ? (
                              item.lastSales?.length ? (
                                <div className="space-y-1">
                                  <select
                                    value={item.selectedSaleIndex ?? ''}
                                    onChange={(e) => handleLastSaleChange(item, e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                                  >
                                    <option value="">Satis sec</option>
                                    {item.lastSales.map((sale, idx) => {
                                      const listLabel = getMatchingPriceListLabel(item.mikroPriceLists, sale.unitPrice);
                                      const displaySalePrice = convertPriceFromBaseUnit(
                                        sale.unitPrice,
                                        getSelectedUnit(item),
                                        item.unit,
                                        item.unit2,
                                        item.unit2Factor
                                      );
                                      const displaySaleQuantity = convertQuantityFromBaseUnit(
                                        sale.quantity,
                                        getSelectedUnit(item),
                                        item.unit,
                                        item.unit2,
                                        item.unit2Factor
                                      );
                                      return (
                                        <option key={idx} value={idx}>
                                          {formatDateShort(sale.saleDate)} - {formatCurrency(displaySalePrice)} ({formatQuantityInput(displaySaleQuantity)})
                                          {listLabel ? ` (${listLabel})` : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {item.selectedSaleIndex !== undefined && item.lastSales[item.selectedSaleIndex] && (
                                    (() => {
                                      const selectedSale = item.lastSales?.[item.selectedSaleIndex];
                                      const listLabel = getMatchingPriceListLabel(item.mikroPriceLists, selectedSale?.unitPrice);
                                      return listLabel ? (
                                        <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                          {listLabel}
                                        </span>
                                      ) : null;
                                    })()
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">Satis yok</span>
                              )
                            ) : item.priceSource === 'MANUAL' ? (
                              <div className="space-y-2">
                                <Input
                                  placeholder="Birim fiyat"
                                  value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                                  onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                  inputMode="decimal"
                                  type="text"
                                  className="min-w-[180px]"
                                />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Son giris kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginEntry ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'entry', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 5"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Guncel maliyet kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginCost ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'cost', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 8"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Secim bekleniyor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {displayUnitPrice ? `${formatCurrency(displayUnitPrice)} / ${selectedUnit}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {roundedUnitPrice ? formatCurrency(lineTotal) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {item.isManualLine ? (
                                <select
                                  value={item.manualVatRate === 0.01 ? '0.01' : item.manualVatRate === 0.1 ? '0.1' : '0.2'}
                                  onChange={(e) => handleManualVatChange(item, e.target.value)}
                                  className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                                >
                                  <option value="0.01">%1</option>
                                  <option value="0.1">%10</option>
                                  <option value="0.2">%20</option>
                                </select>
                              ) : (
                                <span className="text-xs text-gray-600">%{Math.round(item.vatRate * 100)}</span>
                              )}
                              {!vatZeroed && (
                                <label className="flex items-center gap-1 text-xs text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={item.vatZeroed || false}
                                    onChange={(e) => updateItem(item.id, { vatZeroed: e.target.checked })}
                                  />
                                  KDV 0
                                </label>
                              )}
                              {vatZeroed && <span className="text-xs text-green-600">KDV 0</span>}
                            </div>
                          </td>
                          {trailingColumnKeys.map((columnKey) => {
                            if (columnKey === 'lineDescription') {
                              return (
                                <td key={columnKey} className="px-3 py-2">
                                  <Input
                                    placeholder="Satir aciklama"
                                    value={item.lineDescription || ''}
                                    onChange={(e) => updateItem(item.id, { lineDescription: e.target.value })}
                                    maxLength={40}
                                    className="w-full"
                                  />
                                  {isOrderMode && (
                                    <div className="grid grid-cols-1 mt-1">
                                      <Input
                                        placeholder="Sorumluluk merkezi"
                                        value={item.responsibilityCenter || ''}
                                        onChange={(e) => updateItem(item.id, { responsibilityCenter: e.target.value })}
                                        maxLength={25}
                                        className="w-full"
                                      />
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            const column = columnKey.replace('stock:', '');
                            return (
                              <td key={columnKey} className="px-3 py-2 whitespace-nowrap">
                                {item.isManualLine ? '-' : getStockColumnValue(column, stockDataMap[item.productCode])}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right">
                            <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                              Sil
                            </Button>
                          </td>
                        </tr>
                        {marginInfo && (
                          <tr
                            className="bg-yellow-50"
                            onDragOver={handleRowDragOver}
                            onDrop={handleRowDrop(item.id)}
                          >
                            <td colSpan={columnsCount} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-yellow-200/70 px-2 py-1 font-semibold text-yellow-900">
                                  Fiyat analizi
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Son giris (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.lastEntry)}</span>
                                  {item.lastEntryDate && (
                                    <span className="ml-1 text-[11px] text-gray-500">({formatDateShort(item.lastEntryDate)})</span>
                                  )}
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.lastEntryDiff)}`}>
                                    Kar {formatPercent(marginInfo.lastEntryDiff)}
                                  </span>
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Guncel maliyet (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.currentCost)}</span>
                                  {item.currentCostDate && (
                                    <span className="ml-1 text-[11px] text-gray-500">({formatDateShort(item.currentCostDate)})</span>
                                  )}
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.currentCostDiff)}`}>
                                    Kar {formatPercent(marginInfo.currentCostDiff)}
                                  </span>
                                </span>
                                {marginInfo.openPurchase && (
                                  <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                                    Acik alis (KDV dahil = haric)
                                  </span>
                                )}
                                {marginInfo.blocked && (
                                  <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                                    Blok: %5 altinda
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {!item.isManualLine && item.productCode && (
                          <tr onDragOver={handleRowDragOver} onDrop={handleRowDrop(item.id)}>
                            <td colSpan={columnsCount} className="px-3">
                              <StockFamilySuggestion
                                productCode={item.productCode}
                                baseQuantity={item.quantity}
                                onSwap={(rec) => applyFamilySwap(item, rec)}
                                onSplit={(rec) => applyFamilySplit(item, rec)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {showTableScrollBar && (
            <div className={`mt-3 rounded-full border border-slate-200 px-2 py-1 ${scrollBarWrapperClass}`}>
              <div
                ref={tableScrollBarRef}
                className="h-3 overflow-x-auto overflow-y-hidden"
                onScroll={handleScrollBarScroll}
              >
                <div style={{ width: `${tableScrollMetrics.scrollWidth}px` }} className="h-3" />
              </div>
            </div>
          )}
        </Card>

        <Card className={cardShell}>
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold">Tamamlayici Oneriler</h2>
              <p className="text-xs text-gray-500">Sepetteki urunlere gore otomatik oneriler.</p>
            </div>
            {quoteProductCodes.length === 0 ? (
              <div className="text-sm text-gray-500">Oneri icin once urun ekleyin.</div>
            ) : recommendationsLoading ? (
              <div className="text-sm text-gray-500">Oneriler yukleniyor...</div>
            ) : recommendations.length === 0 ? (
              <div className="text-sm text-gray-500">Uygun tamamlayici urun bulunamadi.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendations.map((product) => {
                  const isAdded = quoteProductCodeSet.has(product.mikroCode);
                  return (
                    <div key={product.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border border-dashed border-slate-200 bg-slate-50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">{product.name}</div>
                        <div className="text-xs text-gray-500">{product.mikroCode}</div>
                        {product.recommendationNote && (
                          <div className="text-[11px] text-gray-500">{product.recommendationNote}</div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRecommendationAdd(product)}
                        disabled={isAdded}
                      >
                        {isAdded ? 'Eklendi' : 'Ekle'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className={`${cardShell} border-primary-100 bg-gradient-to-br from-white via-white to-primary-50/60 lg:sticky lg:top-6`}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Ara Toplam</p>
                <p className="text-xl font-semibold">{formatCurrency(totals.totalAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">KDV</p>
                <p className="text-xl font-semibold">{formatCurrency(totals.totalVat)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Genel Toplam</p>
                <p className="text-2xl font-bold text-primary-600">{formatCurrency(totals.grandTotal)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">KDV Haric Karlilik Ozeti</p>
                <p className="text-xs text-gray-500">Toplam maliyet ve kar satir miktarlariyla hesaplanir.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                  <p className="text-xs font-medium text-amber-800">Giris maliyetine gore</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Toplam maliyet: <span className="font-semibold text-gray-900">{formatCurrency(profitTotals.entryCostTotal)}</span>
                  </p>
                  <p className={`text-sm font-semibold ${getPercentTone(profitTotals.entryProfitPercent)}`}>
                    Kar: {formatCurrency(profitTotals.entryProfit)} ({formatPercent(profitTotals.entryProfitPercent)})
                  </p>
                  {profitTotals.entryMissingLines > 0 && (
                    <p className="mt-1 text-[11px] text-amber-700">{profitTotals.entryMissingLines} satirda giris maliyeti yok.</p>
                  )}
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-xs font-medium text-emerald-800">Guncel maliyete gore</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Toplam maliyet: <span className="font-semibold text-gray-900">{formatCurrency(profitTotals.currentCostTotal)}</span>
                  </p>
                  <p className={`text-sm font-semibold ${getPercentTone(profitTotals.currentProfitPercent)}`}>
                    Kar: {formatCurrency(profitTotals.currentProfit)} ({formatPercent(profitTotals.currentProfitPercent)})
                  </p>
                  {profitTotals.currentMissingLines > 0 && (
                    <p className="mt-1 text-[11px] text-amber-700">{profitTotals.currentMissingLines} satirda guncel maliyet yok.</p>
                  )}
                </div>
              </div>
              {(profitTotals.entryMissingLines > 0 || profitTotals.currentMissingLines > 0 || profitTotals.manualLines > 0) && (
                <p className="mt-3 text-xs text-gray-500">
                  Maliyeti olmayan veya manuel girilen satirlar kar hesabina dahil edilmez.
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">{quoteItems.length} kalem secili</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={openAiAnalysis}
                  disabled={submitting || quoteItems.length === 0}
                  title="Teklifi musteri talebine ve sistem verisine gore analiz et"
                >
                  <Sparkles className="w-4 h-4 mr-1.5" /> AI ile analiz et
                </Button>
                <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting
                    ? 'Gonderiliyor...'
                    : isOrderMode
                      ? (isOrderEditMode ? 'Siparisi Guncelle' : 'Siparis Olustur')
                      : isEditMode
                        ? 'Teklifi Guncelle'
                        : 'Teklif Olustur'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        title="AI ile Teklif Analizi"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAiModal(false)}>Kapat</Button>
            <Button variant="primary" onClick={runAiAnalysis} isLoading={aiAnalyzing}>
              {aiResult ? 'Tekrar Analiz Et' : 'Analiz Et'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-[13px] text-primary-900">
            Teklif, asagidaki <b>musteri talebine</b> ve sistemdeki maliyet/marj/gecmis verisine gore analiz edilir.
            Talep metnini (varsa gorselini) eklerseniz analiz daha isabetli olur. AI <b>sadece okur</b>, teklifi degistirmez.
          </div>
          {aiModels.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">AI Modeli</label>
              <select
                value={aiModel}
                onChange={(e) => onAiModelChange(e.target.value)}
                className="rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                {aiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Musteri talebi (opsiyonel) — musterinin bizden istedigi teklif metni
            </label>
            <textarea
              value={aiRequestText}
              onChange={(e) => setAiRequestText(e.target.value)}
              rows={4}
              placeholder={'Orn: "10 koli Z havlu, 5 koli pecete..." — yaprak sayisi, gramaj, ebat gibi detaylar varsa yazin.'}
              className="w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="file" accept="image/*" onChange={onAiImageChange} className="hidden" />
              <span className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 font-medium text-primary-700 hover:bg-primary-50">
                Talep gorseli ekle
              </span>
            </label>
            {aiImage && (
              <span className="inline-flex items-center gap-2 text-xs text-gray-600">
                {aiImage.name} eklendi
                <button type="button" className="text-red-600 hover:underline" onClick={() => setAiImage(null)}>kaldir</button>
              </span>
            )}
          </div>

          {aiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{aiError}</div>
          )}

          {aiAnalyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Teklif analiz ediliyor...
            </div>
          )}

          {aiResult && !aiAnalyzing && (
            <div className="space-y-3">
              {(() => {
                const verdict = aiResult?.overall?.verdict || 'dikkat';
                const win = aiResult?.overall?.winProbability || 'orta';
                const tone =
                  verdict === 'iyi'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : verdict === 'riskli'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800';
                return (
                  <div className={`rounded-xl border p-3 ${tone}`}>
                    <div className="text-sm font-semibold">
                      Genel: {String(verdict).toUpperCase()} · Kazanma olasiligi: {String(win).toUpperCase()}
                    </div>
                    {aiResult?.overall?.summary && (
                      <div className="mt-1 text-[13px]">{aiResult.overall.summary}</div>
                    )}
                  </div>
                );
              })()}

              {Array.isArray(aiResult?.findings) && aiResult.findings.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Belirgin bir sorun bulunamadi.
                </div>
              ) : (
                (aiResult?.findings || []).map((f: any, i: number) => {
                  const sev = f?.severity || 'info';
                  const sevTone =
                    sev === 'critical'
                      ? 'border-red-200 bg-red-50'
                      : sev === 'warning'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-[var(--line)] bg-white';
                  return (
                    <div key={i} className={`rounded-xl border p-3 ${sevTone}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900">{f?.title || 'Bulgu'}</span>
                        {f?.category && (
                          <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {String(f.category).replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {f?.detail && <p className="mt-1 text-[13px] text-gray-700">{f.detail}</p>}
                      {f?.suggestion && (
                        <p className="mt-1.5 text-[13px] text-gray-800">
                          <span className="font-semibold">Oneri:</span> {f.suggestion}
                        </p>
                      )}
                      {f?.lineRef && <p className="mt-1 text-[11px] text-gray-500">Ilgili: {f.lineRef}</p>}
                    </div>
                  );
                })
              )}
              <p className="text-[11px] text-gray-400">
                AI onerisidir; nihai karar sizindir. Sayilar canli sistemden alinir.
              </p>
            </div>
          )}

          {!aiResult && !aiAnalyzing && !aiError && (
            <p className="text-center text-sm text-gray-400 py-4">
              "Analiz Et" butonuna basinca teklif degerlendirilecek.
            </p>
          )}
        </div>
      </Modal>

      <CariSelectModal
        isOpen={showCariModal}
        onClose={() => setShowCariModal(false)}
        cariList={customerOptions}
        onSelect={(cari) => {
          const match = customers.find((customer) => customer.id === cari.userId);
          if (match) {
            setSelectedCustomer(match);
            setHasManualCustomerChange(true);
          }
        }}
      />

      <Modal
        isOpen={Boolean(priceRequestTarget)}
        onClose={() => setPriceRequestTarget(null)}
        title="Fiyat Guncellik Teyidi"
        size={priceRequestTarget?.isManualLine ? 'xl' : 'lg'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPriceRequestTarget(null)}>Vazgec</Button>
            <Button variant="primary" onClick={submitPriceVerificationRequest} disabled={priceRequestSaving}>
              {priceRequestSaving ? 'Gonderiliyor...' : 'Satin almaya gonder'}
            </Button>
          </div>
        }
      >
        {priceRequestTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                {priceRequestTarget.isManualLine ? 'Stokta olmayan / manuel urun' : `${priceRequestTarget.productCode} - ${priceRequestTarget.productName}`}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Miktar: {formatQuantityInput(getDisplayQuantity(priceRequestTarget))} {getSelectedUnit(priceRequestTarget)}
                {getDisplayUnitPrice(priceRequestTarget) ? ` | Satirdaki fiyat: ${formatCurrency(getDisplayUnitPrice(priceRequestTarget))}` : ''}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Oncelik</label>
                <select
                  value={priceRequestPriority}
                  onChange={(e) => setPriceRequestPriority(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="LOW">Dusuk</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Yuksek</option>
                  <option value="URGENT">Acil</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cari</label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-gray-700">
                  {selectedCustomer?.mikroCariCode || editingOrderCustomerCode || '-'} {selectedCustomer?.name ? `- ${selectedCustomer.name}` : ''}
                </div>
              </div>
            </div>

            {priceRequestTarget.isManualLine && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Yeni stok icin zorunlu kart bilgileri</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input label="Sablon stok" value={priceRequestStockPayload.templateCode} onChange={(e) => updatePriceRequestStockPayload({ templateCode: e.target.value })} />
                  <Input label="Stok adi" value={priceRequestStockPayload.name} onChange={(e) => updatePriceRequestStockPayload({ name: e.target.value })} />
                  <Input label="Tedarikci urun kodu" value={priceRequestStockPayload.foreignName} onChange={(e) => updatePriceRequestStockPayload({ foreignName: e.target.value })} />
                  <Input label="Ana birim" value={priceRequestStockPayload.mainUnit} onChange={(e) => updatePriceRequestStockPayload({ mainUnit: e.target.value })} />
                  <Input label="KDV %" value={priceRequestStockPayload.vatRatePercent} onChange={(e) => updatePriceRequestStockPayload({ vatRatePercent: e.target.value })} />
                  <Input label="Ana saglayici kodu" value={priceRequestStockPayload.supplierCode} onChange={(e) => updatePriceRequestStockPayload({ supplierCode: e.target.value })} />
                  <Input label="Marka kodu" value={priceRequestStockPayload.brandCode} onChange={(e) => updatePriceRequestStockPayload({ brandCode: e.target.value })} />
                  <Input label="Marka adi (yeni ise)" value={priceRequestStockPayload.brandName} onChange={(e) => updatePriceRequestStockPayload({ brandName: e.target.value })} />
                  <Input label="Kategori kodu" value={priceRequestStockPayload.categoryCode} onChange={(e) => updatePriceRequestStockPayload({ categoryCode: e.target.value })} placeholder="1.09.04" />
                  <Input label="Ambalaj kodu" value={priceRequestStockPayload.packageCode} onChange={(e) => updatePriceRequestStockPayload({ packageCode: e.target.value })} />
                  <Input label="Ambalaj adi (yeni ise)" value={priceRequestStockPayload.packageName} onChange={(e) => updatePriceRequestStockPayload({ packageName: e.target.value })} />
                  <Input label="Raf / reyon kodu" value={priceRequestStockPayload.shelfCode} onChange={(e) => updatePriceRequestStockPayload({ shelfCode: e.target.value })} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Input
                      key={index}
                      label={`Marj ${index + 1}`}
                      value={priceRequestStockPayload.margins?.[index] || ''}
                      onChange={(e) => updatePriceRequestMargin(index, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Talep notu</label>
              <textarea
                value={priceRequestNote}
                onChange={(e) => setPriceRequestNote(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Musteri hedef fiyati, rakip fiyat, talep sebebi..."
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showProductPoolModal}
        onClose={() => setShowProductPoolModal(false)}
        title="Urun Havuzu"
        size="full"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full bg-slate-100 p-1">
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('purchased')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'purchased' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Daha Once Alinanlar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('search')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Tum Urunler
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>Son {lastSalesCount} satis gosteriliyor.</span>
              <select
                value={poolSort}
                onChange={(e) => setPoolSort(e.target.value as PoolSortOption)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              >
                {POOL_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={poolPriceListNo}
                onChange={(e) => {
                  const value = e.target.value;
                  setPoolPriceListNo(value ? Number(value) : '');
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              >
                <option value="">Liste fiyati secin</option>
                {Object.entries(PRICE_LIST_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                variant={showPoolColorOptions ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowPoolColorOptions((prev) => !prev)}
                className="rounded-full"
              >
                Renklendirme
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={savePoolPreferences}
                disabled={savingPoolPreferences}
                className="rounded-full"
              >
                {savingPoolPreferences ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
            </div>
          </div>
          {showPoolColorOptions && (
            <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-gray-600 space-y-3">
              {poolColorRules.length === 0 ? (
                <div className="text-xs text-slate-400">Renklendirme kurali yok.</div>
              ) : (
                <div className="space-y-3">
                  {poolColorRules.map((rule, index) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                        Kural {index + 1}
                      </span>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updatePoolColorRule(rule.id, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-primary-600"
                        />
                        Aktif
                      </label>
                      <select
                        value={rule.warehouse}
                        onChange={(e) => updatePoolColorRule(rule.id, { warehouse: e.target.value as '1' | '6' })}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value="1">Merkez</option>
                        <option value="6">Topca</option>
                      </select>
                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, { operator: e.target.value as PoolColorRule['operator'] })
                        }
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value=">">Buyuk</option>
                        <option value=">=">Buyuk Esit</option>
                        <option value="<">Kucuk</option>
                        <option value="<=">Kucuk Esit</option>
                        <option value="=">Esit</option>
                      </select>
                      <input
                        type="number"
                        value={rule.threshold}
                        onChange={(e) => updatePoolColorRule(rule.id, { threshold: Number(e.target.value) })}
                        className="w-20 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      />
                      <select
                        value={rule.color}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, { color: e.target.value as PoolColorRule['color'] })
                        }
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value="green">Yesil</option>
                        <option value="yellow">Sari</option>
                        <option value="blue">Mavi</option>
                        <option value="red">Kirmizi</option>
                        <option value="slate">Gri</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePoolColorRule(rule.id)}
                        className="rounded-full text-red-600"
                      >
                        Sil
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" onClick={addPoolColorRule} className="rounded-full">
                  Kural Ekle
                </Button>
                <span className="text-[11px] text-slate-400">
                  Ornek: Merkez buyuk 0 = yesil
                </span>
              </div>
            </div>
          )}

          {productTab === 'purchased' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  placeholder="Urun ara..."
                  value={purchasedSearch}
                  onChange={(e) => setPurchasedSearch(e.target.value)}
                  className="lg:max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {selectedPurchasedCount} secili / {filteredPurchasedProducts.length} urun
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearPurchasedSelection}>
                    Secimi Temizle
                  </Button>
                  <Button variant="secondary" size="sm" onClick={selectAllPurchased} className="rounded-full">
                    Tumunu Sec
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addSelectedPurchasedToQuote}
                    disabled={selectedPurchasedCount === 0}
                    className="rounded-full"
                  >
                    Secilileri Ekle
                  </Button>
                </div>
              </div>
              {sortedPurchasedProducts.length === 0 ? (
                <div className="text-sm text-gray-500">Urun bulunamadi.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {sortedPurchasedProducts.map((product) => {
                    const isSelected = selectedPurchasedCodes.has(product.mikroCode);
                    const colorClass = getPoolColorClass(product);
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const poolPriceListValue = poolPriceListNo
                      ? getMikroListPrice(product.mikroPriceLists, Number(poolPriceListNo))
                      : 0;
                    const poolPriceLabel = poolPriceListNo ? getPoolPriceLabel(Number(poolPriceListNo)) : null;
                    const poolPriceDisplay = poolPriceLabel
                      ? poolPriceListValue > 0
                        ? formatCurrency(poolPriceListValue)
                        : '-'
                      : null;
                    return (
                      <div
                        key={product.mikroCode}
                        role="button"
                        tabIndex={0}
                        onClick={() => togglePurchasedSelection(product.mikroCode)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            togglePurchasedSelection(product.mikroCode);
                          }
                        }}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-primary-200 bg-primary-50/70'
                            : colorClass
                              ? `${colorClass} hover:border-primary-200`
                              : 'border-gray-200 bg-white/90 hover:border-primary-200'
                        } cursor-pointer`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePurchasedSelection(product.mikroCode)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 accent-primary-600"
                            />
                            <div className="text-left">
                              <p className="font-semibold text-gray-900">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                {product.mikroCode}
                                {product.unit ? ` - ${product.unit}` : ''}
                              </p>
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Merkez</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="font-medium text-slate-600">Topca</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                              {unitLabel && (
                                <div className="mt-1 text-xs text-slate-500">{unitLabel}</div>
                              )}
                              <CategoryLastPurchaseBadge info={getCategoryLastPurchaseInfo(product)} />
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                addProductToQuote(product, getPoolQuantityValue(product.mikroCode));
                              }}
                            >
                              {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                            </Button>
                            <div className="mt-2 w-20" onClick={(event) => event.stopPropagation()}>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={getPoolQuantityInputValue(product.mikroCode)}
                                onChange={(event) => setPoolQuantityInputValue(product.mikroCode, event.target.value)}
                                onBlur={() => normalizePoolQuantityInputValue(product.mikroCode)}
                                onFocus={selectPoolQuantityInput}
                                onClick={selectPoolQuantityInput}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="h-8 px-2 py-1 text-center text-sm"
                                aria-label={`${product.name} miktar`}
                              />
                            </div>
                            {poolPriceLabel && (
                              <div className="mt-2 text-[11px] font-semibold text-slate-700">
                                {poolPriceLabel}:{' '}
                                <span className="font-bold text-slate-900">{poolPriceDisplay}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {product.lastSales?.length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {product.lastSales.map((sale, idx) => {
                              const listLabel = getMatchingPriceListLabel(product.mikroPriceLists, sale.unitPrice);
                              return (
                              <div
                                key={idx}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-700">{formatDateShort(sale.saleDate)}</span>
                                  <span className="text-gray-500">{sale.quantity} adet</span>
                                  <span className="font-semibold text-gray-900">{formatCurrency(sale.unitPrice)}</span>
                                </div>
                                {sale.documentNo && (
                                  <div className="mt-0.5 text-[11px] text-gray-500">
                                    Belge No: <span className="font-medium text-gray-700">{sale.documentNo}</span>
                                  </div>
                                )}
                                {listLabel && (
                                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                    {listLabel}
                                  </span>
                                )}
                                {sale.vatZeroed && <Badge variant="info" className="text-[10px]">KDV 0</Badge>}
                              </div>
                            );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-gray-400">Satis yok</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {productTab === 'search' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  placeholder="Urun adi veya kodu"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="lg:max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {selectedSearchCount} secili / {sortedSearchResults.length} urun
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearSearchSelection}>
                    Secimi Temizle
                  </Button>
                  <Button variant="secondary" size="sm" onClick={selectAllSearch} className="rounded-full">
                    Tumunu Sec
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addSelectedSearchToQuote}
                    disabled={selectedSearchCount === 0}
                    className="rounded-full"
                  >
                    Secilileri Ekle
                  </Button>
                </div>
              </div>
              {searchLoading ? (
                <div className="text-sm text-gray-500">Araniyor...</div>
              ) : sortedSearchResults.length === 0 ? (
                <div className="text-sm text-gray-500">Arama sonucu yok.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {sortedSearchResults.map((product) => {
                    const colorClass = getPoolColorClass(product);
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const isSelected = selectedSearchCodes.has(product.mikroCode);
                    const poolPriceListValue = poolPriceListNo
                      ? getMikroListPrice(product.mikroPriceLists, Number(poolPriceListNo))
                      : 0;
                    const poolPriceLabel = poolPriceListNo ? getPoolPriceLabel(Number(poolPriceListNo)) : null;
                    const poolPriceDisplay = poolPriceLabel
                      ? poolPriceListValue > 0
                        ? formatCurrency(poolPriceListValue)
                        : '-'
                      : null;
                    return (
                    <div
                      key={product.mikroCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleSearchSelection(product.mikroCode)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleSearchSelection(product.mikroCode);
                        }
                      }}
                      className={`rounded-xl border p-4 transition ${
                        isSelected
                          ? 'border-primary-200 bg-primary-50/70'
                          : colorClass
                            ? `${colorClass} hover:border-primary-200`
                            : 'border-gray-200 bg-white/90 hover:border-primary-200'
                      } cursor-pointer`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSearchSelection(product.mikroCode)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 accent-primary-600"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">{product.name}</p>
                              <p className="text-xs text-gray-500">{product.mikroCode}</p>
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Merkez</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="font-medium text-slate-600">Topca</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                              {unitLabel && (
                                <div className="mt-1 text-xs text-slate-500">{unitLabel}</div>
                              )}
                              <CategoryLastPurchaseBadge info={getCategoryLastPurchaseInfo(product)} />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-start sm:items-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              addProductToQuote(product, getPoolQuantityValue(product.mikroCode));
                            }}
                          >
                            {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                          </Button>
                          <div className="mt-2 w-20" onClick={(event) => event.stopPropagation()}>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={getPoolQuantityInputValue(product.mikroCode)}
                              onChange={(event) => setPoolQuantityInputValue(product.mikroCode, event.target.value)}
                              onBlur={() => normalizePoolQuantityInputValue(product.mikroCode)}
                              onFocus={selectPoolQuantityInput}
                              onClick={selectPoolQuantityInput}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="h-8 px-2 py-1 text-center text-sm"
                              aria-label={`${product.name} miktar`}
                            />
                          </div>
                          {poolPriceLabel && (
                            <div className="mt-2 text-[11px] font-semibold text-slate-700">
                              {poolPriceLabel}:{' '}
                              <span className="font-bold text-slate-900">{poolPriceDisplay}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {showColumnSelector && (
        <Modal
          isOpen={showColumnSelector}
          onClose={() => setShowColumnSelector(false)}
          title="Goruntulenecek Kolonlar"
          size="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowColumnSelector(false)}>
                Iptal
              </Button>
              <Button variant="primary" onClick={saveColumnPreferences} disabled={savingColumns}>
                {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-xs text-gray-500">Kolonlari secin ve siralamayi surukleyin.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={selectAllColumns} className="rounded-full">
                  Tumunu Sec
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAllColumns} className="rounded-full">
                  Tumunu Kaldir
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Secili Kolonlar (surukle birak)</div>
              <div className="flex flex-wrap gap-2">
                {reorderableColumns.map((column) => {
                  const isLineDescription = column === LINE_DESCRIPTION_KEY;
                  const label = isLineDescription ? 'Aciklama' : getColumnDisplayName(column);
                  return (
                    <div
                      key={column}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={handleColumnDragStart(column)}
                      onDragOver={handleColumnDragOver}
                      onDrop={handleColumnDrop(column)}
                      onDragEnd={handleColumnDragEnd}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                        draggingColumn === column
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                      title="Surukleyerek sirala"
                    >
                      <span className="text-gray-400">::</span>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableColumns.map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column)}
                    onChange={() => {
                      setSelectedColumns((prev) =>
                        prev.includes(column)
                          ? prev.filter((item) => item !== column)
                          : [...prev, column]
                      );
                    }}
                  />
                  {getColumnDisplayName(column)}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
