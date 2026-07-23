'use client';

import { Fragment, useState } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Plus,
  Columns3,
  Save,
  ListPlus,
  Sparkles,
  Loader2,
  Trash2,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  User,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { StockFamilySuggestion } from '@/components/admin/StockFamilySuggestion';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  convertPriceFromBaseUnit,
  convertQuantityFromBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
} from '@/lib/utils/unit';
import type { LastOrder, LastQuote } from './useTeklifOlustur';
import {
  POOL_SORT_OPTIONS,
  PRICE_LIST_LABELS,
  getQuotePriceLists,
  buildPriceListSuggestionDisplay,
  getFamilyMarginToneClass,
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

/* ---- Yeni gorunum tasarim tokenlari ---- */
const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INK = '#14223b';
const INK2 = '#51607a';
const INK3 = '#8b97ac';
const PRIMARY = '#15356b';
const LINE = '#e7ebf2';
const LINE_STRONG = '#d8e0ec';

const inputBase =
  'w-full rounded-[9px] border border-[#d8e0ec] bg-white px-3 py-2 text-[13px] text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15';
const labelBase = 'block text-[12px] font-medium text-[#51607a] mb-1';

/* Klasik ile birebir ayni mantik; sadece gorsel yeni. AI butonu + StockFamilySuggestion +
 * birim/katsayi + faturali/beyaz seri + Mikro yazan handleSubmit AYNEN hook'tan gelir. */
export default function TeklifOlusturNew() {
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
    applyLastSaleToAll,
    applyMinPriceToBlockedItems,
    applyMinPriceToItem,
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
    cancelFamilyAction,
    cardShell,
    categoryLastPurchaseMap,
    clearAllColumns,
    clearPurchasedSelection,
    clearSearchSelection,
    columnWidths,
    columnsCount,
    confirmFamilyAction,
    contactsLoading,
    customerContacts,
    customerOptions,
    customers,
    searchCustomersServer,
    handlePickCustomer,
    draggingColumn,
    draggingItemId,
    editInitializedRef,
    editOrderId,
    editOrderInitializedRef,
    editQuoteId,
    editingOrderCustomerCode,
    editingQuote,
    expandedQuoteHistory,
    familyActionConfirmInfo,
    familyExcludeCodesByLine,
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
    getRecommendationCustomerBadge,
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
    handlePriceTypeChange,
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
    isFamilySuggestionSuppressed,
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
    requestFamilySplit,
    requestFamilySwap,
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
    sortedRecommendations,
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

  /* Sadece mobil kart listesindeki "Detay" acilimlari icin gorsel-yalniz state.
   * Hicbir is mantigini etkilemez; masaustu tablosu bundan bagimsizdir. */
  const [mobileDetailOpen, setMobileDetailOpen] = useState<Record<string, boolean>>({});
  const toggleMobileDetail = (id: string) =>
    setMobileDetailOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  /* moda gore baslik/altmetin/buton (klasik ile ayni mantik) */
  const pageTitle = isOrderMode
    ? isOrderEditMode
      ? 'Siparis Duzenle'
      : 'Siparis Olustur'
    : isEditMode
      ? 'Teklif Duzenle'
      : 'Teklif Olustur';
  const pageSubtitle = isOrderMode
    ? isOrderEditMode
      ? 'Mevcut siparis kalemleri guncellenir'
      : 'Mikro satis siparisi yazilir'
    : isEditMode
      ? 'Mikro teklif guncellenir'
      : 'Mikro teklif fisine aktarilir';
  const submitLabel = submitting
    ? 'Gonderiliyor...'
    : isOrderMode
      ? isOrderEditMode
        ? 'Siparisi Guncelle'
        : 'Siparis Olustur'
      : isEditMode
        ? 'Teklifi Guncelle'
        : 'Teklif Olustur';

  /* Yeni gorunumde ortak buton stilleri */
  const btnPrimary =
    'inline-flex items-center justify-center gap-1.5 rounded-[9px] bg-[#15356b] text-white border-none px-[15px] py-[9px] text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGhost =
    'inline-flex items-center justify-center gap-1.5 rounded-[9px] bg-white text-[#51607a] border border-[#d8e0ec] px-[13px] py-[8px] text-[12.5px] font-medium cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed';
  const btnDanger =
    'inline-flex items-center justify-center gap-1.5 rounded-[9px] bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca] px-3 py-1.5 text-[12px] font-semibold cursor-pointer hover:bg-[#fee2e2]';
  const chip =
    'rounded-full bg-[#f1f4f9] px-3 py-1 text-[12px] font-medium text-[#51607a]';

  /* Cari fiyat listesi onerisi rozeti (hook'taki pure helper; iki tema ayni mantigi kullanir) */
  const priceListSuggestion = buildPriceListSuggestionDisplay(selectedCustomer);

  /* Degistir/Bol onay modali marj satiri: negatif kirmizi, %5 alti amber, digerleri yesil */
  const renderFamilyMargin = (label: string, side: { margin: number | null; costMissing: boolean }) => (
    <span className="text-[#51607a]">
      {label}:{' '}
      {side.costMissing ? (
        <span className="font-semibold text-[#8b97ac]">maliyet yok</span>
      ) : (
        <span className={`font-semibold ${getFamilyMarginToneClass(side.margin)}`}>
          {formatPercent(side.margin)}
        </span>
      )}
    </span>
  );

  /* Yukleme guard'i — klasik ile birebir (mod metni korunur) */
  if ((isEditMode && loadingQuote) || (isOrderEditMode && loadingOrder)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f4f6fa]">
        <div className="flex flex-col items-center gap-3 text-[13px] text-[#51607a]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#15356b] border-t-transparent" />
          {isOrderEditMode ? 'Siparis yukleniyor...' : 'Teklif yukleniyor...'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {/* Ust bar: moda gore baslik/altmetin + mod cipi + geri butonu */}
        <div className="flex items-end justify-between gap-4 mb-[18px] flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">{pageTitle}</h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">{pageSubtitle}</div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
              style={
                isOrderMode
                  ? { background: '#eef2fa', borderColor: '#d3deef', color: PRIMARY }
                  : { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }
              }
            >
              {isOrderMode ? 'Siparis Modu' : 'Teklif Modu'}
            </span>
            <button type="button" onClick={() => router.push(isOrderMode ? '/orders' : '/quotes')} className={btnGhost}>
              <ChevronLeft width={15} height={15} stroke="currentColor" strokeWidth={2} />
              {isOrderMode ? 'Siparisler' : 'Teklifler'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* ====================== SOL PANEL ====================== */}
          {showLeftPanel && (
            <div className="xl:col-span-5 space-y-5">
              <div className={`${CARD} flex items-center justify-between px-4 py-3`}>
                <div>
                  <p className="text-[13px] font-semibold text-[#14223b] m-0">Sol Panel</p>
                  <p className="text-[12px] text-[#8b97ac] mt-0.5">Musteri ve urun secimi.</p>
                </div>
                <button type="button" onClick={() => setShowLeftPanel(false)} className={btnGhost}>
                  <PanelLeftClose width={15} height={15} stroke="currentColor" strokeWidth={2} />
                  Sol Paneli Gizle
                </button>
              </div>

              {/* Musteri karti */}
              <div className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#14223b] m-0">Musteri</h2>
                    <p className="text-[12px] text-[#8b97ac] mt-0.5">
                      {isOrderMode ? 'Siparis icin cari secin.' : 'Teklif icin cari secin.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowCariModal(true)} className={btnPrimary}>
                    <User width={15} height={15} stroke="currentColor" strokeWidth={2} />
                    {isEditMode ? 'Musteri Degistir' : 'Musteri Sec'}
                  </button>
                </div>
                {selectedCustomer ? (
                  <>
                    <CustomerInfoCard customer={selectedCustomer} />
                    {priceListSuggestion && (
                      <div className="mt-2">
                        <span
                          title={priceListSuggestion.tooltip}
                          className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                            priceListSuggestion.source === 'manual'
                              ? 'border-blue-200 bg-blue-50 text-blue-800'
                              : 'border-[#e7ebf2] bg-[#f1f4f9] text-[#51607a]'
                          }`}
                        >
                          {priceListSuggestion.text}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[13px] text-[#8b97ac]">
                    {isOrderMode ? 'Siparis icin musteri secin.' : 'Teklif icin musteri secin.'}
                  </div>
                )}
              </div>

              {/* Teklif Ayarlari karti */}
              <div className={`${CARD} p-4`}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-[15px] font-semibold text-[#14223b] m-0">Teklif Ayarlari</h2>
                      <p className="text-[12px] text-[#8b97ac] mt-0.5">Son satis ve mesaj tercihleriniz.</p>
                    </div>
                    <button type="button" onClick={saveQuotePreferences} className={btnGhost}>
                      <Save width={14} height={14} stroke="currentColor" strokeWidth={2} />
                      Tercihleri Kaydet
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelBase}>{'İlgili Kişi'}</label>
                      <select
                        value={lastSalesCount}
                        onChange={(e) => handleLastSalesCountChange(Number(e.target.value))}
                        className={inputBase}
                      >
                        {Array.from({ length: 10 }).map((_, idx) => (
                          <option key={idx + 1} value={idx + 1}>
                            {idx + 1}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[12px] text-[#8b97ac]">
                        {'Bu müşteri için kayıtlı kişi yok.'}
                      </p>
                    </div>
                    <div>
                      <label className={labelBase}>WhatsApp Sablonu</label>
                      <textarea
                        value={whatsappTemplate}
                        onChange={(e) => setWhatsappTemplate(e.target.value)}
                        rows={2}
                        className={inputBase}
                        placeholder="{{customerName}} {{quoteNumber}}"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelBase}>Sorumlu</label>
                      <select
                        value={selectedResponsibleCode}
                        onChange={(e) => setSelectedResponsibleCode(e.target.value)}
                        className={inputBase}
                      >
                        <option value="">{'İlgili seçin'}</option>
                        {responsibles.map((person) => (
                          <option key={person.code} value={person.code}>
                            {person.code} - {person.name} {person.surname}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[12px] text-[#8b97ac]">
                        Secilen sorumlu Mikro teklifinde kullanilir. Kaydetmek icin &quot;Tercihleri Kaydet&quot; deyin.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Urun Havuzu karti */}
              <div className={`${CARD} p-4`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#14223b] m-0">Urun Havuzu</h2>
                    <p className="text-[12px] text-[#8b97ac] mt-0.5">Son {lastSalesCount} satis gosteriliyor.</p>
                  </div>
                  <button type="button" onClick={() => setShowProductPoolModal(true)} className={btnPrimary}>
                    <Package width={15} height={15} stroke="currentColor" strokeWidth={2} />
                    Urun Havuzunu Ac
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#8b97ac]">
                  <span className={chip}>Secili urun: {selectedPurchasedCount}</span>
                  <span className={chip}>Toplam urun: {purchasedProducts.length}</span>
                  <span className={chip}>Mod: {productTab === 'purchased' ? 'Daha Once Alinanlar' : 'Tum Urunler'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ====================== SAG PANEL ====================== */}
          <div className={`${showLeftPanel ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-5`}>
            {!showLeftPanel && (
              <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]`}>
                <span className="text-[#8b97ac]">Sol panel gizli.</span>
                <button type="button" onClick={() => setShowLeftPanel(true)} className={btnPrimary}>
                  <PanelLeftOpen width={15} height={15} stroke="currentColor" strokeWidth={2} />
                  Sol Paneli Goster
                </button>
              </div>
            )}

            {/* Teklif/Siparis Bilgileri karti */}
            <div className={`${CARD} p-4`}>
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#14223b] m-0">
                    {isOrderMode ? 'Siparis Bilgileri' : 'Teklif Bilgileri'}
                  </h2>
                  <p className="text-[12px] text-[#8b97ac] mt-0.5">
                    {isOrderMode
                      ? isOrderEditMode
                        ? 'Belge, aciklama ve satir bilgileri.'
                        : 'Depo ve evrak bilgileri.'
                      : 'Gecerlilik, not ve KDV ayarlari.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isOrderMode && (
                    <>
                      <div>
                        <label className={labelBase}>Gecerlilik Tarihi</label>
                        <input
                          type="date"
                          value={validityDate}
                          onChange={(e) => setValidityDate(e.target.value)}
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className={labelBase}>İlgili Kişi</label>
                        <select
                          value={selectedContactId}
                          onChange={(e) => setSelectedContactId(e.target.value)}
                          className={inputBase}
                          disabled={!selectedCustomer || contactsLoading}
                        >
                          <option value="">İlgili seçin</option>
                          {customerContacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.phone ? ` - ${contact.phone}` : ''}
                              {contact.email ? ` (${contact.email})` : ''}
                            </option>
                          ))}
                        </select>
                        {!contactsLoading && selectedCustomer && customerContacts.length === 0 && (
                          <p className="mt-1 text-[12px] text-[#8b97ac]">Bu müşteri için kayıtlı kişi yok.</p>
                        )}
                      </div>
                    </>
                  )}
                  {isOrderMode && (
                    <>
                      {!isOrderEditMode && (
                        <div>
                          <label className={labelBase}>Depo</label>
                          {includedWarehouses.length > 0 ? (
                            <select
                              value={orderWarehouse}
                              onChange={(e) => setOrderWarehouse(e.target.value)}
                              className={inputBase}
                            >
                              {includedWarehouses.map((warehouse) => (
                                <option key={warehouse} value={resolveWarehouseValue(warehouse)}>
                                  {warehouse}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={orderWarehouse}
                              onChange={(e) => setOrderWarehouse(e.target.value)}
                              placeholder="Depo"
                              className={inputBase}
                            />
                          )}
                        </div>
                      )}
                      <div>
                        <label className={labelBase}>Belge No (Musteri Siparis No)</label>
                        <input
                          value={orderCustomerOrderNumber}
                          onChange={(e) => setOrderCustomerOrderNumber(e.target.value)}
                          placeholder="Orn: HENDEK-8915"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className={labelBase}>Ctrl+Q Aciklama 1</label>
                        <input
                          value={orderDocumentDescription}
                          onChange={(e) => setOrderDocumentDescription(e.target.value)}
                          placeholder="Orn: test"
                          className={inputBase}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:col-span-2">
                        {showOrderInvoicedFields && (
                          <div className={isOrderEditMode ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                            <div>
                              <label className={labelBase}>Faturali Seri</label>
                              <input
                                value={orderInvoicedSeries}
                                onChange={(e) => handleOrderSeriesChange('INVOICED', e.target.value)}
                                placeholder="Orn: HENDEK"
                                className={inputBase}
                              />
                              {!orderHasInvoiced && (
                                <p className="mt-1 text-[11px] text-[#8b97ac]">Faturali satir eklenirse kullanilir.</p>
                              )}
                            </div>
                            {isOrderEditMode && (
                              <div>
                                <label className={labelBase}>Faturali Sira</label>
                                <input
                                  value={orderInvoicedSira}
                                  onChange={(e) => setOrderInvoicedSira(e.target.value)}
                                  placeholder="Bos birakilirsa otomatik"
                                  className={inputBase}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {showOrderWhiteFields && (
                          <div className={isOrderEditMode ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                            <div>
                              <label className={labelBase}>Beyaz Seri</label>
                              <input
                                value={orderWhiteSeries}
                                onChange={(e) => handleOrderSeriesChange('WHITE', e.target.value)}
                                placeholder="Orn: HENDEK"
                                className={inputBase}
                              />
                              {!orderHasWhite && (
                                <p className="mt-1 text-[11px] text-[#8b97ac]">Beyaz satir eklenirse kullanilir.</p>
                              )}
                            </div>
                            {isOrderEditMode && (
                              <div>
                                <label className={labelBase}>Beyaz Sira</label>
                                <input
                                  value={orderWhiteSira}
                                  onChange={(e) => setOrderWhiteSira(e.target.value)}
                                  placeholder="Bos birakilirsa otomatik"
                                  className={inputBase}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2 flex items-center gap-2 rounded-[9px] border border-[#e7ebf2] bg-[#f8fafc] px-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={vatZeroed}
                      onChange={(e) => handleGlobalVatZeroChange(e.target.checked)}
                      className="h-4 w-4 accent-[#15356b]"
                    />
                    <span className="text-[#51607a]">Tum satirlarda KDV sifirla</span>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelBase}>Not</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className={inputBase}
                      placeholder="Teklif notu"
                    />
                    <p className="mt-1 text-[12px] text-[#8b97ac]">
                      {isOrderMode
                        ? "Not, Mikro'da aciklama alanina yazilir."
                        : "Not, Mikro'da belge no alanina da yazilir."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ====================== KALEM TABLOSU ====================== */}
            {isQuoteTableFullscreen && (
              <div
                className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
                onClick={() => setIsQuoteTableFullscreen(false)}
              />
            )}
            <div
              className={`${CARD} p-4 ${isQuoteTableFullscreen ? 'fixed inset-4 z-50 flex flex-col overflow-hidden' : ''}`}
              onClick={(event) => {
                if (isQuoteTableFullscreen) {
                  event.stopPropagation();
                }
              }}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between mb-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#14223b] m-0">
                    {isOrderMode ? 'Siparis Kalemleri' : 'Teklif Kalemleri'} ({quoteItems.length})
                  </h2>
                  <p className="text-[12px] text-[#8b97ac] mt-0.5">
                    {isOrderMode ? 'Siparis satirlarini duzenleyin.' : 'Fiyat kaynagini secip satirlari duzenleyin.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e7ebf2] bg-[#f8fafc] px-3 py-2">
                  <select
                    value={bulkPriceListNo}
                    onChange={(e) => setBulkPriceListNo(e.target.value ? Number(e.target.value) : '')}
                    className="rounded-[9px] border border-[#d8e0ec] bg-white px-3 py-1.5 text-[12.5px] text-[#14223b]"
                  >
                    <option value="">Liste Sec</option>
                    {Object.keys(PRICE_LIST_LABELS).map((key) => (
                      <option key={key} value={key}>
                        {PRICE_LIST_LABELS[Number(key)]}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={applyPriceListToAll} className={btnGhost}>
                    Tum Satirlara Uygula
                  </button>
                  <button type="button" onClick={applyLastSaleToAll} className={btnGhost}>
                    Son Satisi Uygula
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isOrderMode) {
                        setShowLastOrderInfo((prev) => !prev);
                      } else {
                        setShowLastQuoteInfo((prev) => !prev);
                      }
                    }}
                    className={(isOrderMode ? showLastOrderInfo : showLastQuoteInfo) ? btnPrimary : btnGhost}
                  >
                    {isOrderMode
                      ? showLastOrderInfo
                        ? 'Son Siparisleri Gizle'
                        : 'Son Siparisleri Goster'
                      : showLastQuoteInfo
                        ? 'Son Teklifi Gizle'
                        : 'Son Teklifi Goster'}
                  </button>
                  {isOrderMode && (
                    <>
                      <input
                        value={bulkResponsibilityCenter}
                        onChange={(e) => setBulkResponsibilityCenter(e.target.value)}
                        placeholder="Sorumluluk merkezi"
                        className="rounded-[9px] border border-[#d8e0ec] bg-white px-3 py-1.5 text-[12.5px]"
                      />
                      <button type="button" onClick={applyResponsibilityCenterToAll} className={btnGhost}>
                        Sorumluluk Uygula
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setShowColumnSelector(true)} className={btnGhost}>
                    <Columns3 width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    Kolonlari Sec
                  </button>
                  <button type="button" onClick={saveColumnPreferences} disabled={savingColumns} className={btnGhost}>
                    <Save width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
                  </button>
                  <button type="button" onClick={addManualLine} className={btnGhost}>
                    <ListPlus width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    Manuel Satir Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQuoteTableFullscreen((prev) => !prev)}
                    className={btnGhost}
                  >
                    {isQuoteTableFullscreen ? (
                      <>
                        <Minimize2 width={14} height={14} stroke="currentColor" strokeWidth={2} />
                        Tam Ekrandan Cik
                      </>
                    ) : (
                      <>
                        <Maximize2 width={14} height={14} stroke="currentColor" strokeWidth={2} />
                        Tam Ekran
                      </>
                    )}
                  </button>
                  <button type="button" onClick={() => setShowProductPoolModal(true)} className={btnPrimary}>
                    <Package width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    Urun Havuzunu Ac
                  </button>
                </div>
              </div>

              {hasBlockedPreview && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#b45309]">
                  <AlertTriangle width={16} height={16} stroke="currentColor" strokeWidth={2} className="mt-0.5 shrink-0" />
                  <span>Bazi satirlarda giris maliyetine gore kar %5 altinda. Bu teklif admin onayina gidecek.</span>
                </div>
              )}

              {quoteItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8e0ec] bg-[#f8fafc] py-10 text-center text-[13px] text-[#8b97ac]">
                  Teklife urun eklenmedi.
                </div>
              ) : (
                <>
                {/* Masaustu (md+): tam ozellikli tablo. Sayfa govdesi asla yatay kaymaz;
                    yatay kayma bu kapsayicinin icinde kalir. Mobilde gizli. */}
                <div
                  ref={tableScrollRef}
                  className={`hidden md:block rounded-xl border border-[#e7ebf2] bg-white ${
                    isQuoteTableFullscreen ? 'flex-1 min-h-0 overflow-auto' : 'max-h-[70vh] overflow-auto'
                  }`}
                  onDragOver={handleTableDragOver}
                  onScroll={handleTableScroll}
                >
                  <table className="w-full min-w-[1100px] table-fixed text-[13px]">
                    <colgroup>
                      {tableColumnKeys.map((key) => (
                        <col key={key} style={{ width: `${getColumnWidth(key)}px` }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#f8fafc] text-[11px] uppercase tracking-wide text-[#51607a]">
                      <tr>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          #{renderResizeHandle('rowNumber')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          Urun{renderResizeHandle('product')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          Miktar{renderResizeHandle('quantity')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          {isOrderMode ? 'Fiyat Tipi / Kaynagi' : 'Fiyat Kaynagi'}
                          {renderResizeHandle('priceSource')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          Secim{renderResizeHandle('selection')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-right bg-[#f8fafc] font-semibold">
                          Birim Fiyat{renderResizeHandle('unitPrice')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-right bg-[#f8fafc] font-semibold">
                          Toplam{renderResizeHandle('lineTotal')}
                        </th>
                        <th className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold">
                          KDV{renderResizeHandle('vat')}
                        </th>
                        {trailingColumnKeys.map((columnKey) => {
                          if (columnKey === 'lineDescription') {
                            return (
                              <th
                                key={columnKey}
                                className="relative select-none px-3 py-2.5 text-left bg-[#f8fafc] font-semibold"
                              >
                                Aciklama{renderResizeHandle('lineDescription')}
                              </th>
                            );
                          }
                          const column = columnKey.replace('stock:', '');
                          return (
                            <th
                              key={columnKey}
                              className="relative select-none px-3 py-2.5 text-left whitespace-nowrap bg-[#f8fafc] font-semibold"
                            >
                              {getColumnDisplayName(column)}
                              {renderResizeHandle(columnKey)}
                            </th>
                          );
                        })}
                        <th className="px-3 py-2.5 bg-[#f8fafc]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef1f6]">
                      {quoteItems.map((item, index) => {
                        const marginInfo = getMarginInfo(item);
                        const showHistory = isOrderMode ? showLastOrderInfo : showLastQuoteInfo;
                        const itemHistory = !item.isManualLine
                          ? isOrderMode
                            ? lastOrderMap[item.productCode] || item.lastOrders || []
                            : lastQuoteMap[item.productCode] || item.lastQuotes || []
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
                          ? stockUnits.length > 0
                            ? stockUnits
                            : ['ADET']
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
                              <td className="px-3 py-2 text-right text-[11px] font-semibold text-[#8b97ac]">
                                {index + 1}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={handleRowDragStart(item.id)}
                                    onDragEnd={handleRowDragEnd}
                                    className="mt-1 cursor-grab text-[#aab4c4] hover:text-[#51607a]"
                                    aria-label="Satiri tasimak icin surukle"
                                    title="Satiri tasimak icin surukle"
                                  >
                                    ::
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    {item.isManualLine ? (
                                      <div className="space-y-1">
                                        <input
                                          placeholder="Manuel urun adi"
                                          value={item.productName}
                                          onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                                          lang="tr"
                                          autoCorrect="off"
                                          spellCheck={false}
                                          className={`${inputBase} min-w-[220px]`}
                                        />
                                        <div className="text-[12px] text-[#8b97ac]">Kod: {item.productCode}</div>
                                        <span className="inline-flex rounded-full bg-[#fffbeb] border border-[#fde68a] px-2 py-0.5 text-[10px] font-semibold text-[#b45309]">
                                          Manuel
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openPriceRequestModal(item)}
                                          className="ml-2 inline-flex rounded-full bg-[#fffbeb] px-2 py-1 text-[11px] font-semibold text-[#b45309] hover:bg-[#fef3c7]"
                                        >
                                          Fiyat teyidi iste
                                        </button>
                                        <div className="flex items-center gap-2 pt-1">
                                          {item.manualImageUrl ? (
                                            <img
                                              src={item.manualImageUrl}
                                              alt="Manuel gorsel"
                                              className="h-10 w-10 rounded-md border border-[#e7ebf2] object-cover"
                                            />
                                          ) : null}
                                          <label
                                            className={`inline-flex items-center gap-1 text-[12px] font-medium ${
                                              manualImageUploading[item.id]
                                                ? 'text-[#aab4c4]'
                                                : 'text-[#15356b] hover:text-[#1c4585]'
                                            }`}
                                          >
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
                                              className="text-[12px] text-[#b91c1c] hover:text-[#991b1b] underline"
                                            >
                                              Kaldir
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="font-medium text-[#14223b]">{item.productName}</div>
                                        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8b97ac]">
                                          <span>{item.productCode}</span>
                                          <button
                                            type="button"
                                            onClick={() => openPriceRequestModal(item)}
                                            className="rounded-full bg-[#fffbeb] px-2 py-0.5 text-[11px] font-semibold text-[#b45309] hover:bg-[#fef3c7]"
                                          >
                                            Fiyat teyidi iste
                                          </button>
                                        </div>
                                        {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor) && (
                                          <div className="text-[12px] text-[#8b97ac]">
                                            {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor)}
                                          </div>
                                        )}
                                        <CategoryLastPurchaseBadge info={categoryLastPurchase} />
                                        {marginInfo?.blocked && (
                                          <span className="mt-1 inline-flex rounded-full bg-[#fef2f2] border border-[#fecaca] px-2 py-0.5 text-[10px] font-semibold text-[#b91c1c]">
                                            Blok
                                          </span>
                                        )}
                                        {showHistory && (
                                          <div className="mt-2 text-[11px] text-[#8b97ac]">
                                            {hasItemHistory ? (
                                              <div className="space-y-1">
                                                <div
                                                  className={`flex flex-wrap items-center gap-2${
                                                    canToggleHistory ? ' cursor-pointer' : ''
                                                  }`}
                                                  onClick={canToggleHistory ? () => toggleQuoteHistory(item.id) : undefined}
                                                  role={canToggleHistory ? 'button' : undefined}
                                                  tabIndex={canToggleHistory ? 0 : undefined}
                                                  title={
                                                    canToggleHistory
                                                      ? isOrderMode
                                                        ? 'Gecmis siparisleri goster'
                                                        : 'Gecmis teklifleri goster'
                                                      : undefined
                                                  }
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
                                                  <span className="font-semibold text-[#51607a]">
                                                    {isOrderMode ? 'Son Siparis:' : 'Son Teklif:'}
                                                  </span>
                                                  <span>
                                                    {formatDateShort(
                                                      isOrderMode
                                                        ? (itemHistory[0] as LastOrder).orderDate
                                                        : (itemHistory[0] as LastQuote).quoteDate
                                                    )}
                                                  </span>
                                                  <span className="font-semibold text-[#14223b]">
                                                    {formatCurrency(itemHistory[0].unitPrice)}
                                                  </span>
                                                  <span className="text-[#8b97ac]">
                                                    Belge:{' '}
                                                    {isOrderMode
                                                      ? getOrderDocumentLabel(itemHistory[0] as LastOrder)
                                                      : getQuoteDocumentLabel(itemHistory[0] as LastQuote)}
                                                  </span>
                                                  {isOrderMode && (
                                                    <span className="text-[#8b97ac]">
                                                      Siparis: {(itemHistory[0] as LastOrder).orderNumber || '-'}
                                                    </span>
                                                  )}
                                                  <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[10px] font-medium text-[#51607a]">
                                                    {formatQuotePriceType(itemHistory[0].priceType)}
                                                  </span>
                                                  {itemHistory.length > 1 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleQuoteHistory(item.id)}
                                                      className="text-[#15356b] hover:text-[#1c4585] underline"
                                                    >
                                                      {isQuoteHistoryExpanded
                                                        ? 'Gecmisi Gizle'
                                                        : `Gecmis (${itemHistory.length - 1})`}
                                                    </button>
                                                  )}
                                                </div>
                                                {isQuoteHistoryExpanded && itemHistory.length > 1 && (
                                                  <div className="rounded-md border border-[#e7ebf2] bg-[#f8fafc] px-2 py-1">
                                                    {itemHistory.slice(1).map((historyRow, idx) => (
                                                      <div
                                                        key={`${item.id}-quote-${idx}`}
                                                        className="flex flex-wrap items-center gap-2 py-0.5 text-[11px] text-[#51607a]"
                                                      >
                                                        <span className="font-medium text-[#51607a]">
                                                          {formatDateShort(
                                                            isOrderMode
                                                              ? (historyRow as LastOrder).orderDate
                                                              : (historyRow as LastQuote).quoteDate
                                                          )}
                                                        </span>
                                                        <span className="font-semibold text-[#14223b]">
                                                          {formatCurrency(historyRow.unitPrice)}
                                                        </span>
                                                        <span className="text-[#8b97ac]">
                                                          Belge:{' '}
                                                          {isOrderMode
                                                            ? getOrderDocumentLabel(historyRow as LastOrder)
                                                            : getQuoteDocumentLabel(historyRow as LastQuote)}
                                                        </span>
                                                        {isOrderMode && (
                                                          <span className="text-[#8b97ac]">
                                                            Siparis: {(historyRow as LastOrder).orderNumber || '-'}
                                                          </span>
                                                        )}
                                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#51607a] border border-[#e7ebf2]">
                                                          {formatQuotePriceType(historyRow.priceType)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-[#aab4c4]">
                                                {isOrderMode ? 'Son siparis yok' : 'Son teklif yok'}
                                              </span>
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
                                    className="w-24 rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-[13px]"
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
                                      className="w-24 rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[11px]"
                                    >
                                      {availableUnits.map((unit) => (
                                        <option key={unit} value={unit}>
                                          {unit}
                                        </option>
                                      ))}
                                    </select>
                                  ) : item.unit ? (
                                    <span className="text-[11px] text-[#8b97ac]">{selectedUnit}</span>
                                  ) : null}
                                  {selectedUnit !== item.unit && (
                                    <span className="text-[11px] text-[#0369a1]">
                                      Mikro: {formatQuantityInput(item.quantity)} {item.unit}
                                    </span>
                                  )}
                                  {isOrderMode && (
                                    <div className="mt-1">
                                      <label className="block text-[11px] text-[#8b97ac] mb-0.5">Rezerve</label>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={displayReserveQty ? formatQuantityInput(displayReserveQty) : ''}
                                        onChange={(e) => handleReserveQuantityChange(item, e.target.value)}
                                        className="w-20 rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-[11px]"
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED'}
                                  onChange={(e) =>
                                    handlePriceTypeChange(item, e.target.value === 'WHITE' ? 'WHITE' : 'INVOICED')
                                  }
                                  className="mb-1 w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[11px]"
                                >
                                  <option value="INVOICED">Fatural?</option>
                                  <option value="WHITE">Beyaz</option>
                                </select>
                                {item.isManualLine ? (
                                  <span className="text-[12px] text-[#51607a]">Manuel</span>
                                ) : (
                                  <select
                                    value={item.priceSource || ''}
                                    onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                                    className="rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[12.5px]"
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
                                  <input
                                    placeholder="Birim fiyat"
                                    value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                                    onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                    inputMode="decimal"
                                    type="text"
                                    className={inputBase}
                                  />
                                ) : item.priceSource === 'PRICE_LIST' ? (
                                  <select
                                    value={item.priceListNo || ''}
                                    onChange={(e) => handlePriceListChange(item, e.target.value)}
                                    className="rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[12.5px]"
                                  >
                                    <option value="">Liste sec</option>
                                    {getQuotePriceLists(item.priceType).map((definition) => {
                                      const listNo = definition.listNo;
                                      const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
                                      const displayListPrice = convertPriceFromBaseUnit(
                                        listPrice,
                                        getSelectedUnit(item),
                                        item.unit,
                                        item.unit2,
                                        item.unit2Factor
                                      );
                                      return (
                                        <option key={listNo} value={listNo}>
                                          {PRICE_LIST_LABELS[listNo]} (
                                          {listPrice ? formatCurrency(displayListPrice) : 'Fiyat yok'})
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
                                        className="rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[12.5px]"
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
                                              {formatDateShort(sale.saleDate)} - {formatCurrency(displaySalePrice)} (
                                              {formatQuantityInput(displaySaleQuantity)})
                                              {listLabel ? ` (${listLabel})` : ''}
                                            </option>
                                          );
                                        })}
                                      </select>
                                      {item.selectedSaleIndex !== undefined &&
                                        item.lastSales[item.selectedSaleIndex] &&
                                        (() => {
                                          const selectedSale = item.lastSales?.[item.selectedSaleIndex];
                                          const listLabel = getMatchingPriceListLabel(
                                            item.mikroPriceLists,
                                            selectedSale?.unitPrice
                                          );
                                          return listLabel ? (
                                            <span className="inline-flex rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[10px] font-semibold text-[#0369a1]">
                                              {listLabel}
                                            </span>
                                          ) : null;
                                        })()}
                                    </div>
                                  ) : (
                                    <span className="text-[12px] text-[#8b97ac]">Satis yok</span>
                                  )
                                ) : item.priceSource === 'MANUAL' ? (
                                  <div className="space-y-2">
                                    <input
                                      placeholder="Birim fiyat"
                                      value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                                      onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                      inputMode="decimal"
                                      type="text"
                                      className={`${inputBase} min-w-[180px]`}
                                    />
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <div>
                                        <label className="block text-[11px] font-medium text-[#8b97ac] leading-tight">
                                          Son giris kar (%)
                                        </label>
                                        <input
                                          type="number"
                                          value={item.manualMarginEntry ?? ''}
                                          onChange={(e) => handleManualMarginChange(item, 'entry', e.target.value)}
                                          className="mt-1 w-full min-w-[150px] rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-[11px]"
                                          placeholder="Orn: 5"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-[#8b97ac] leading-tight">
                                          Guncel maliyet kar (%)
                                        </label>
                                        <input
                                          type="number"
                                          value={item.manualMarginCost ?? ''}
                                          onChange={(e) => handleManualMarginChange(item, 'cost', e.target.value)}
                                          className="mt-1 w-full min-w-[150px] rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-[11px]"
                                          placeholder="Orn: 8"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[12px] text-[#aab4c4]">Secim bekleniyor</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {displayUnitPrice ? `${formatCurrency(displayUnitPrice)} / ${selectedUnit}` : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-[#14223b]">
                                {roundedUnitPrice ? formatCurrency(lineTotal) : '-'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1">
                                  {item.isManualLine ? (
                                    <select
                                      value={
                                        item.manualVatRate === 0.01 ? '0.01' : item.manualVatRate === 0.1 ? '0.1' : '0.2'
                                      }
                                      onChange={(e) => handleManualVatChange(item, e.target.value)}
                                      className="rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-1 text-[12.5px]"
                                    >
                                      <option value="0.01">%1</option>
                                      <option value="0.1">%10</option>
                                      <option value="0.2">%20</option>
                                    </select>
                                  ) : (
                                    <span className="text-[12px] text-[#51607a]">%{Math.round(item.vatRate * 100)}</span>
                                  )}
                                  {!vatZeroed && (
                                    <label className="flex items-center gap-1 text-[12px] text-[#51607a]">
                                      <input
                                        type="checkbox"
                                        checked={item.vatZeroed || false}
                                        onChange={(e) => updateItem(item.id, { vatZeroed: e.target.checked })}
                                      />
                                      KDV 0
                                    </label>
                                  )}
                                  {vatZeroed && <span className="text-[12px] text-[#047857]">KDV 0</span>}
                                </div>
                              </td>
                              {trailingColumnKeys.map((columnKey) => {
                                if (columnKey === 'lineDescription') {
                                  return (
                                    <td key={columnKey} className="px-3 py-2">
                                      <input
                                        placeholder="Satir aciklama"
                                        value={item.lineDescription || ''}
                                        onChange={(e) => updateItem(item.id, { lineDescription: e.target.value })}
                                        maxLength={40}
                                        className={inputBase}
                                      />
                                      {isOrderMode && (
                                        <div className="grid grid-cols-1 mt-1">
                                          <input
                                            placeholder="Sorumluluk merkezi"
                                            value={item.responsibilityCenter || ''}
                                            onChange={(e) =>
                                              updateItem(item.id, { responsibilityCenter: e.target.value })
                                            }
                                            maxLength={25}
                                            className={inputBase}
                                          />
                                        </div>
                                      )}
                                    </td>
                                  );
                                }
                                const column = columnKey.replace('stock:', '');
                                return (
                                  <td key={columnKey} className="px-3 py-2 whitespace-nowrap text-[#51607a]">
                                    {item.isManualLine ? '-' : getStockColumnValue(column, stockDataMap[item.productCode])}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right">
                                <button type="button" onClick={() => removeItem(item.id)} className={btnDanger}>
                                  <Trash2 width={13} height={13} stroke="currentColor" strokeWidth={2} />
                                  Sil
                                </button>
                              </td>
                            </tr>
                            {marginInfo && (
                              <tr
                                className="bg-[#fffbeb]"
                                onDragOver={handleRowDragOver}
                                onDrop={handleRowDrop(item.id)}
                              >
                                <td colSpan={columnsCount} className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="rounded-full bg-[#fde68a] px-2 py-1 font-semibold text-[#92400e]">
                                      Fiyat analizi
                                    </span>
                                    <span className="rounded-full border border-[#fde68a] bg-white px-2 py-1 text-[#51607a]">
                                      Son giris (KDV haric):{' '}
                                      <span className="font-semibold text-[#14223b]">
                                        {formatCurrency(marginInfo.lastEntry)}
                                      </span>
                                      {item.lastEntryDate && (
                                        <span className="ml-1 text-[11px] text-[#8b97ac]">
                                          ({formatDateShort(item.lastEntryDate)})
                                        </span>
                                      )}
                                      <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.lastEntryDiff)}`}>
                                        Kar {formatPercent(marginInfo.lastEntryDiff)}
                                      </span>
                                    </span>
                                    <span className="rounded-full border border-[#fde68a] bg-white px-2 py-1 text-[#51607a]">
                                      Guncel maliyet (KDV haric):{' '}
                                      <span className="font-semibold text-[#14223b]">
                                        {formatCurrency(marginInfo.currentCost)}
                                      </span>
                                      {item.currentCostDate && (
                                        <span className="ml-1 text-[11px] text-[#8b97ac]">
                                          ({formatDateShort(item.currentCostDate)})
                                        </span>
                                      )}
                                      <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.currentCostDiff)}`}>
                                        Kar {formatPercent(marginInfo.currentCostDiff)}
                                      </span>
                                    </span>
                                    {marginInfo.blocked && (
                                      <>
                                        <span className="rounded-full bg-[#fee2e2] px-2 py-1 font-semibold text-[#b91c1c]">
                                          Blok: %5 altinda
                                        </span>
                                        {marginInfo.minPrice > 0 && (
                                          <span className="rounded-full border border-[#fecaca] bg-white px-2 py-1 text-[#b91c1c]">
                                            Min satis: <span className="font-semibold">{formatCurrency(marginInfo.minPrice)}</span>
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => applyMinPriceToItem(item.id)}
                                          className="rounded-full border border-[#b91c1c] bg-white px-2 py-1 font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                                        >
                                          Tabana cek
                                        </button>
                                      </>
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
                                    excludeCodes={familyExcludeCodesByLine[item.id]}
                                    suppressed={isFamilySuggestionSuppressed(item)}
                                    onSwap={(rec) => requestFamilySwap(item, rec)}
                                    onSplit={(rec) => requestFamilySplit(item, rec)}
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

                {/* ============ MOBIL (md alti): satirlarin yigilmis kart listesi ============ */}
                {/* Tablo yerine; ayni veri + ayni hook handler'lari. Ek/kuyruk kolonlar
                    kart basina "Detay" acilimi altinda. Hicbir ozellik kaldirilmadi. */}
                <div className="md:hidden space-y-3">
                  {quoteItems.map((item, index) => {
                    const marginInfo = getMarginInfo(item);
                    const selectedUnit = getSelectedUnit(item);
                    const availableUnits = item.isManualLine
                      ? stockUnits.length > 0
                        ? stockUnits
                        : ['ADET']
                      : getAvailableUnits(item.unit, item.unit2, item.unit2Factor);
                    const displayQuantity = getDisplayQuantity(item);
                    const displayUnitPrice = roundUp2(getDisplayUnitPrice(item));
                    const roundedUnitPrice = roundUp2(item.unitPrice || 0);
                    const lineTotal = roundedUnitPrice * (item.quantity || 0);
                    const displayReserveQty = roundUnitValue(
                      convertQuantityFromBaseUnit(
                        item.reserveQty || 0,
                        selectedUnit,
                        item.unit,
                        item.unit2,
                        item.unit2Factor
                      )
                    );
                    const categoryLastPurchase = getCategoryLastPurchaseInfo(
                      categoryLastPurchaseMap[item.productCode] || item
                    );
                    // Son teklif / son siparis gecmisi — masaustu tablosuyla ayni degiskenler/handler'lar.
                    const showHistory = isOrderMode ? showLastOrderInfo : showLastQuoteInfo;
                    const itemHistory = !item.isManualLine
                      ? isOrderMode
                        ? lastOrderMap[item.productCode] || item.lastOrders || []
                        : lastQuoteMap[item.productCode] || item.lastQuotes || []
                      : [];
                    const hasItemHistory = showHistory && itemHistory.length > 0;
                    const canToggleHistory = showHistory && itemHistory.length > 1;
                    const isQuoteHistoryExpanded = Boolean(expandedQuoteHistory[item.id]);
                    const detailOpen = Boolean(mobileDetailOpen[item.id]);
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-[#e7ebf2] bg-white p-3"
                        onDragOver={handleRowDragOver}
                        onDrop={handleRowDrop(item.id)}
                      >
                        {/* Baslik: sira + urun adi/kodu + sil */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f1f4f9] px-1.5 text-[11px] font-semibold text-[#8b97ac]">
                                {index + 1}
                              </span>
                              {item.isManualLine && (
                                <span className="inline-flex rounded-full bg-[#fffbeb] border border-[#fde68a] px-2 py-0.5 text-[10px] font-semibold text-[#b45309]">
                                  Manuel
                                </span>
                              )}
                              {marginInfo?.blocked && (
                                <span className="inline-flex rounded-full bg-[#fef2f2] border border-[#fecaca] px-2 py-0.5 text-[10px] font-semibold text-[#b91c1c]">
                                  Blok
                                </span>
                              )}
                            </div>
                            {item.isManualLine ? (
                              <div className="mt-1.5 space-y-1">
                                <input
                                  placeholder="Manuel urun adi"
                                  value={item.productName}
                                  onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                                  lang="tr"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  className={inputBase}
                                />
                                <div className="text-[12px] text-[#8b97ac]">Kod: {item.productCode}</div>
                              </div>
                            ) : (
                              <div className="mt-1">
                                <div className="text-[14px] font-semibold text-[#14223b] leading-snug">
                                  {item.productName}
                                </div>
                                <div className="text-[12px] text-[#8b97ac]">{item.productCode}</div>
                                {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor) && (
                                  <div className="text-[11px] text-[#8b97ac]">
                                    {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor)}
                                  </div>
                                )}
                                <CategoryLastPurchaseBadge info={categoryLastPurchase} />
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="flex-none rounded-[9px] bg-[#fef2f2] border border-[#fecaca] p-2 text-[#b91c1c] hover:bg-[#fee2e2]"
                            aria-label="Satiri sil"
                          >
                            <Trash2 width={15} height={15} stroke="currentColor" strokeWidth={2} />
                          </button>
                        </div>

                        {/* Fiyat teyidi iste */}
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => openPriceRequestModal(item)}
                            className="inline-flex rounded-full bg-[#fffbeb] px-2.5 py-1 text-[11px] font-semibold text-[#b45309] hover:bg-[#fef3c7]"
                          >
                            Fiyat teyidi iste
                          </button>
                        </div>

                        {/* Manuel gorsel yukleme */}
                        {item.isManualLine && (
                          <div className="mt-2 flex items-center gap-2">
                            {item.manualImageUrl ? (
                              <img
                                src={item.manualImageUrl}
                                alt="Manuel gorsel"
                                className="h-10 w-10 rounded-md border border-[#e7ebf2] object-cover"
                              />
                            ) : null}
                            <label
                              className={`inline-flex items-center gap-1 text-[12px] font-medium ${
                                manualImageUploading[item.id]
                                  ? 'text-[#aab4c4]'
                                  : 'text-[#15356b] hover:text-[#1c4585]'
                              }`}
                            >
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
                                className="text-[12px] text-[#b91c1c] hover:text-[#991b1b] underline"
                              >
                                Kaldir
                              </button>
                            ) : null}
                          </div>
                        )}

                        {/* Miktar + birim */}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-[#8b97ac] mb-0.5">Miktar</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={displayQuantity === 0 ? '' : formatQuantityInput(displayQuantity)}
                              onChange={(e) => handleQuantityChange(item, e.target.value)}
                              className="w-full rounded-[9px] border border-[#d8e0ec] px-2 py-2 text-[13px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#8b97ac] mb-0.5">Birim</label>
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
                                className="w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-2 text-[12px]"
                              >
                                {availableUnits.map((unit) => (
                                  <option key={unit} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex h-[38px] items-center rounded-[9px] border border-[#e7ebf2] bg-[#f8fafc] px-2 text-[12px] text-[#51607a]">
                                {selectedUnit || '-'}
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedUnit !== item.unit && (
                          <div className="mt-1 text-[11px] text-[#0369a1]">
                            Mikro: {formatQuantityInput(item.quantity)} {item.unit}
                          </div>
                        )}
                        {isOrderMode && (
                          <div className="mt-2">
                            <label className="block text-[11px] text-[#8b97ac] mb-0.5">Rezerve</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={displayReserveQty ? formatQuantityInput(displayReserveQty) : ''}
                              onChange={(e) => handleReserveQuantityChange(item, e.target.value)}
                              className="w-28 rounded-[9px] border border-[#d8e0ec] px-2 py-1.5 text-[12px]"
                            />
                          </div>
                        )}

                        <div className="mt-3">
                          <label className="block text-[11px] text-[#8b97ac] mb-0.5">Fiyat Tipi</label>
                          <select
                            value={item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED'}
                            onChange={(e) =>
                              handlePriceTypeChange(item, e.target.value === 'WHITE' ? 'WHITE' : 'INVOICED')
                            }
                            className="w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-2 text-[12.5px]"
                          >
                            <option value="INVOICED">Faturali</option>
                            <option value="WHITE">Beyaz</option>
                          </select>
                        </div>

                        {/* Fiyat kaynagi */}
                        <div className="mt-3">
                          <label className="block text-[11px] text-[#8b97ac] mb-0.5">
                            {isOrderMode ? 'Fiyat Kaynagi' : 'Fiyat Kaynagi'}
                          </label>
                          {item.isManualLine ? (
                            <input
                              placeholder="Birim fiyat"
                              value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                              onChange={(e) => handleManualPriceChange(item, e.target.value)}
                              inputMode="decimal"
                              type="text"
                              className={inputBase}
                            />
                          ) : (
                            <select
                              value={item.priceSource || ''}
                              onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                              className="w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-2 text-[12.5px]"
                            >
                              <option value="">Secin</option>
                              <option value="LAST_SALE">Son Satis</option>
                              <option value="PRICE_LIST">Fiyat Listesi</option>
                              <option value="MANUAL">Manuel</option>
                            </select>
                          )}
                        </div>

                        {/* Secim: fiyat listesi / son satis / manuel fiyat+marj */}
                        {!item.isManualLine && item.priceSource === 'PRICE_LIST' && (
                          <div className="mt-2">
                            <label className="block text-[11px] text-[#8b97ac] mb-0.5">Liste</label>
                            <select
                              value={item.priceListNo || ''}
                              onChange={(e) => handlePriceListChange(item, e.target.value)}
                              className="w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-2 text-[12.5px]"
                            >
                              <option value="">Liste sec</option>
                              {getQuotePriceLists(item.priceType).map((definition) => {
                                const listNo = definition.listNo;
                                const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
                                const displayListPrice = convertPriceFromBaseUnit(
                                  listPrice,
                                  getSelectedUnit(item),
                                  item.unit,
                                  item.unit2,
                                  item.unit2Factor
                                );
                                return (
                                  <option key={listNo} value={listNo}>
                                    {PRICE_LIST_LABELS[listNo]} (
                                    {listPrice ? formatCurrency(displayListPrice) : 'Fiyat yok'})
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                        {!item.isManualLine && item.priceSource === 'LAST_SALE' && (
                          <div className="mt-2">
                            <label className="block text-[11px] text-[#8b97ac] mb-0.5">Satis Sec</label>
                            {item.lastSales?.length ? (
                              <select
                                value={item.selectedSaleIndex ?? ''}
                                onChange={(e) => handleLastSaleChange(item, e.target.value)}
                                className="w-full rounded-[9px] border border-[#d8e0ec] bg-white px-2 py-2 text-[12.5px]"
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
                                      {formatDateShort(sale.saleDate)} - {formatCurrency(displaySalePrice)} (
                                      {formatQuantityInput(displaySaleQuantity)})
                                      {listLabel ? ` (${listLabel})` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <span className="text-[12px] text-[#8b97ac]">Satis yok</span>
                            )}
                          </div>
                        )}
                        {!item.isManualLine && item.priceSource === 'MANUAL' && (
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="block text-[11px] text-[#8b97ac] mb-0.5">Birim fiyat</label>
                              <input
                                placeholder="Birim fiyat"
                                value={item.manualPriceInput ?? formatManualPriceInput(getDisplayUnitPrice(item))}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                inputMode="decimal"
                                type="text"
                                className={inputBase}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[#8b97ac] leading-tight">
                                  Son giris kar (%)
                                </label>
                                <input
                                  type="number"
                                  value={item.manualMarginEntry ?? ''}
                                  onChange={(e) => handleManualMarginChange(item, 'entry', e.target.value)}
                                  className="mt-1 w-full rounded-[9px] border border-[#d8e0ec] px-2 py-1.5 text-[12px]"
                                  placeholder="Orn: 5"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[#8b97ac] leading-tight">
                                  Guncel maliyet kar (%)
                                </label>
                                <input
                                  type="number"
                                  value={item.manualMarginCost ?? ''}
                                  onChange={(e) => handleManualMarginChange(item, 'cost', e.target.value)}
                                  className="mt-1 w-full rounded-[9px] border border-[#d8e0ec] px-2 py-1.5 text-[12px]"
                                  placeholder="Orn: 8"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Birim fiyat + satir toplami + KDV */}
                        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-[#eef1f6] bg-[#f8fafc] p-2.5">
                          <div>
                            <div className="text-[10.5px] text-[#8b97ac]">Birim Fiyat</div>
                            <div className="text-[12.5px] font-semibold text-[#14223b]">
                              {displayUnitPrice ? `${formatCurrency(displayUnitPrice)}` : '-'}
                            </div>
                            <div className="text-[10px] text-[#aab4c4]">/ {selectedUnit}</div>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-[#8b97ac]">Satir Toplam</div>
                            <div className="text-[12.5px] font-semibold text-[#14223b]">
                              {roundedUnitPrice ? formatCurrency(lineTotal) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-[#8b97ac]">KDV</div>
                            {item.isManualLine ? (
                              <select
                                value={item.manualVatRate === 0.01 ? '0.01' : item.manualVatRate === 0.1 ? '0.1' : '0.2'}
                                onChange={(e) => handleManualVatChange(item, e.target.value)}
                                className="mt-0.5 w-full rounded-[7px] border border-[#d8e0ec] bg-white px-1.5 py-1 text-[11px]"
                              >
                                <option value="0.01">%1</option>
                                <option value="0.1">%10</option>
                                <option value="0.2">%20</option>
                              </select>
                            ) : (
                              <div className="text-[12.5px] font-semibold text-[#51607a]">
                                %{Math.round(item.vatRate * 100)}
                              </div>
                            )}
                            {!vatZeroed ? (
                              <label className="mt-1 flex items-center gap-1 text-[10.5px] text-[#51607a]">
                                <input
                                  type="checkbox"
                                  checked={item.vatZeroed || false}
                                  onChange={(e) => updateItem(item.id, { vatZeroed: e.target.checked })}
                                />
                                KDV 0
                              </label>
                            ) : (
                              <div className="mt-1 text-[10.5px] text-[#047857]">KDV 0</div>
                            )}
                          </div>
                        </div>

                        {/* Fiyat analizi (marj) — masaustundeki sari satirin mobil karsiligi */}
                        {marginInfo && (
                          <div className="mt-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="rounded-full bg-[#fde68a] px-2 py-0.5 font-semibold text-[#92400e]">
                                Fiyat analizi
                              </span>
                              <span className="text-[#51607a]">
                                Son giris:{' '}
                                <span className="font-semibold text-[#14223b]">
                                  {formatCurrency(marginInfo.lastEntry)}
                                </span>
                                <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.lastEntryDiff)}`}>
                                  {formatPercent(marginInfo.lastEntryDiff)}
                                </span>
                              </span>
                              <span className="text-[#51607a]">
                                Guncel:{' '}
                                <span className="font-semibold text-[#14223b]">
                                  {formatCurrency(marginInfo.currentCost)}
                                </span>
                                <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.currentCostDiff)}`}>
                                  {formatPercent(marginInfo.currentCostDiff)}
                                </span>
                              </span>
                            </div>
                            {marginInfo.blocked && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 font-semibold text-[#b91c1c]">
                                  Blok: %5 altinda
                                </span>
                                {marginInfo.minPrice > 0 && (
                                  <span className="rounded-full border border-[#fecaca] bg-white px-2 py-0.5 text-[#b91c1c]">
                                    Min: <span className="font-semibold">{formatCurrency(marginInfo.minPrice)}</span>
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => applyMinPriceToItem(item.id)}
                                  className="rounded-full border border-[#b91c1c] bg-white px-2 py-0.5 font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                                >
                                  Tabana cek
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Detay acilimi: aciklama, sorumluluk merkezi, stok kolonlari, gecmis, aile onerisi */}
                        {(trailingColumnKeys.length > 0 ||
                          isOrderMode ||
                          (!item.isManualLine && item.productCode)) && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => toggleMobileDetail(item.id)}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#15356b]"
                            >
                              {detailOpen ? (
                                <ChevronDown width={14} height={14} stroke="currentColor" strokeWidth={2} />
                              ) : (
                                <ChevronRight width={14} height={14} stroke="currentColor" strokeWidth={2} />
                              )}
                              {detailOpen ? 'Detayi Gizle' : 'Detay'}
                            </button>
                          </div>
                        )}

                        {detailOpen && (
                          <div className="mt-2 space-y-3 border-t border-[#eef1f6] pt-3">
                            {/* Aciklama (lineDescription) + siparis sorumluluk merkezi */}
                            {trailingColumnKeys.includes('lineDescription') && (
                              <div>
                                <label className="block text-[11px] text-[#8b97ac] mb-0.5">Aciklama</label>
                                <input
                                  placeholder="Satir aciklama"
                                  value={item.lineDescription || ''}
                                  onChange={(e) => updateItem(item.id, { lineDescription: e.target.value })}
                                  maxLength={40}
                                  className={inputBase}
                                />
                                {isOrderMode && (
                                  <input
                                    placeholder="Sorumluluk merkezi"
                                    value={item.responsibilityCenter || ''}
                                    onChange={(e) => updateItem(item.id, { responsibilityCenter: e.target.value })}
                                    maxLength={25}
                                    className={`${inputBase} mt-2`}
                                  />
                                )}
                              </div>
                            )}

                            {/* Stok / ek kolonlar */}
                            {trailingColumnKeys.filter((k) => k !== 'lineDescription').length > 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                {trailingColumnKeys
                                  .filter((k) => k !== 'lineDescription')
                                  .map((columnKey) => {
                                    const column = columnKey.replace('stock:', '');
                                    return (
                                      <div
                                        key={columnKey}
                                        className="rounded-lg border border-[#eef1f6] bg-[#f8fafc] px-2 py-1.5"
                                      >
                                        <div className="text-[10.5px] text-[#8b97ac]">
                                          {getColumnDisplayName(column)}
                                        </div>
                                        <div className="text-[12px] text-[#51607a]">
                                          {item.isManualLine
                                            ? '-'
                                            : getStockColumnValue(column, stockDataMap[item.productCode])}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}

                            {/* Son teklif / son siparis gecmisi — masaustu tablosuyla ayni icerik */}
                            {showHistory && (
                              <div className="text-[11px] text-[#8b97ac]">
                                {hasItemHistory ? (
                                  <div className="space-y-1">
                                    <div
                                      className={`flex flex-wrap items-center gap-2${
                                        canToggleHistory ? ' cursor-pointer' : ''
                                      }`}
                                      onClick={canToggleHistory ? () => toggleQuoteHistory(item.id) : undefined}
                                      role={canToggleHistory ? 'button' : undefined}
                                      tabIndex={canToggleHistory ? 0 : undefined}
                                      title={
                                        canToggleHistory
                                          ? isOrderMode
                                            ? 'Gecmis siparisleri goster'
                                            : 'Gecmis teklifleri goster'
                                          : undefined
                                      }
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
                                      <span className="font-semibold text-[#51607a]">
                                        {isOrderMode ? 'Son Siparis:' : 'Son Teklif:'}
                                      </span>
                                      <span>
                                        {formatDateShort(
                                          isOrderMode
                                            ? (itemHistory[0] as LastOrder).orderDate
                                            : (itemHistory[0] as LastQuote).quoteDate
                                        )}
                                      </span>
                                      <span className="font-semibold text-[#14223b]">
                                        {formatCurrency(itemHistory[0].unitPrice)}
                                      </span>
                                      <span className="text-[#8b97ac]">
                                        Belge:{' '}
                                        {isOrderMode
                                          ? getOrderDocumentLabel(itemHistory[0] as LastOrder)
                                          : getQuoteDocumentLabel(itemHistory[0] as LastQuote)}
                                      </span>
                                      {isOrderMode && (
                                        <span className="text-[#8b97ac]">
                                          Siparis: {(itemHistory[0] as LastOrder).orderNumber || '-'}
                                        </span>
                                      )}
                                      <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[10px] font-medium text-[#51607a]">
                                        {formatQuotePriceType(itemHistory[0].priceType)}
                                      </span>
                                      {itemHistory.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => toggleQuoteHistory(item.id)}
                                          className="text-[#15356b] hover:text-[#1c4585] underline"
                                        >
                                          {isQuoteHistoryExpanded
                                            ? 'Gecmisi Gizle'
                                            : `Gecmis (${itemHistory.length - 1})`}
                                        </button>
                                      )}
                                    </div>
                                    {isQuoteHistoryExpanded && itemHistory.length > 1 && (
                                      <div className="rounded-md border border-[#e7ebf2] bg-[#f8fafc] px-2 py-1">
                                        {itemHistory.slice(1).map((historyRow, idx) => (
                                          <div
                                            key={`${item.id}-quote-mobile-${idx}`}
                                            className="flex flex-wrap items-center gap-2 py-0.5 text-[11px] text-[#51607a]"
                                          >
                                            <span className="font-medium text-[#51607a]">
                                              {formatDateShort(
                                                isOrderMode
                                                  ? (historyRow as LastOrder).orderDate
                                                  : (historyRow as LastQuote).quoteDate
                                              )}
                                            </span>
                                            <span className="font-semibold text-[#14223b]">
                                              {formatCurrency(historyRow.unitPrice)}
                                            </span>
                                            <span className="text-[#8b97ac]">
                                              Belge:{' '}
                                              {isOrderMode
                                                ? getOrderDocumentLabel(historyRow as LastOrder)
                                                : getQuoteDocumentLabel(historyRow as LastQuote)}
                                            </span>
                                            {isOrderMode && (
                                              <span className="text-[#8b97ac]">
                                                Siparis: {(historyRow as LastOrder).orderNumber || '-'}
                                              </span>
                                            )}
                                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#51607a] border border-[#e7ebf2]">
                                              {formatQuotePriceType(historyRow.priceType)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[#aab4c4]">
                                    {isOrderMode ? 'Son siparis yok' : 'Son teklif yok'}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Aile onerisi (Degistir/Bol) */}
                            {!item.isManualLine && item.productCode && (
                              <StockFamilySuggestion
                                productCode={item.productCode}
                                baseQuantity={item.quantity}
                                excludeCodes={familyExcludeCodesByLine[item.id]}
                                suppressed={isFamilySuggestionSuppressed(item)}
                                onSwap={(rec) => requestFamilySwap(item, rec)}
                                onSplit={(rec) => requestFamilySplit(item, rec)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              )}
              {showTableScrollBar && (
                <div className={`mt-3 hidden md:block rounded-full border border-[#e7ebf2] px-2 py-1 ${scrollBarWrapperClass}`}>
                  <div
                    ref={tableScrollBarRef}
                    className="h-3 overflow-x-auto overflow-y-hidden"
                    onScroll={handleScrollBarScroll}
                  >
                    <div style={{ width: `${tableScrollMetrics.scrollWidth}px` }} className="h-3" />
                  </div>
                </div>
              )}
            </div>

            {/* ====================== TAMAMLAYICI ONERILER ====================== */}
            <div className={`${CARD} p-4`}>
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#14223b] m-0">Tamamlayici Oneriler</h2>
                  <p className="text-[12px] text-[#8b97ac] mt-0.5">Sepetteki urunlere gore otomatik oneriler.</p>
                </div>
                {quoteProductCodes.length === 0 ? (
                  <div className="text-[13px] text-[#8b97ac]">Oneri icin once urun ekleyin.</div>
                ) : recommendationsLoading ? (
                  <div className="text-[13px] text-[#8b97ac]">Oneriler yukleniyor...</div>
                ) : recommendations.length === 0 ? (
                  <div className="text-[13px] text-[#8b97ac]">Uygun tamamlayici urun bulunamadi.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sortedRecommendations.map((product) => {
                      const isAdded = quoteProductCodeSet.has(product.mikroCode);
                      const customerBadge = getRecommendationCustomerBadge(product);
                      const hasExcessStock = Number(product.excessStock) > 0;
                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-[#e7ebf2] bg-white px-3 py-2"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-12 w-12 rounded-lg border border-[#e7ebf2] object-cover"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg border border-dashed border-[#d8e0ec] bg-[#f8fafc]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-[#14223b] truncate">{product.name}</div>
                            <div className="text-[12px] text-[#8b97ac]">{product.mikroCode}</div>
                            {product.recommendationNote && (
                              <div className="text-[11px] text-[#8b97ac]">{product.recommendationNote}</div>
                            )}
                            {(hasExcessStock || customerBadge) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {hasExcessStock && (
                                  <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#92400e]">
                                    Yatan stok
                                  </span>
                                )}
                                {customerBadge && (
                                  <span className="rounded-full bg-[#e0e7ff] px-2 py-0.5 text-[10px] font-semibold text-[#3730a3]">
                                    {customerBadge}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRecommendationAdd(product)}
                            disabled={isAdded}
                            className={btnGhost}
                          >
                            {isAdded ? 'Eklendi' : 'Ekle'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ====================== OZET / SUBMIT (sticky) ====================== */}
            <div
              className={`${CARD} p-4 border-[#d3deef] bg-gradient-to-br from-white via-white to-[#eef2fa] lg:sticky lg:top-6`}
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[13px] text-[#8b97ac]">Ara Toplam</p>
                    <p className="text-xl font-semibold text-[#14223b]">{formatCurrency(totals.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-[#8b97ac]">KDV</p>
                    <p className="text-xl font-semibold text-[#14223b]">{formatCurrency(totals.totalVat)}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-[#8b97ac]">Genel Toplam</p>
                    <p className="text-2xl font-bold text-[#15356b]">{formatCurrency(totals.grandTotal)}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-[#e7ebf2] bg-white/80 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#14223b]">KDV Haric Karlilik Ozeti</p>
                    <p className="text-[12px] text-[#8b97ac]">Toplam maliyet ve kar satir miktarlariyla hesaplanir.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3">
                      <p className="text-[12px] font-medium text-[#92400e]">Giris maliyetine gore</p>
                      <p className="mt-1 text-[13px] text-[#51607a]">
                        Toplam maliyet:{' '}
                        <span className="font-semibold text-[#14223b]">
                          {formatCurrency(profitTotals.entryCostTotal)}
                        </span>
                      </p>
                      <p className={`text-[13px] font-semibold ${getPercentTone(profitTotals.entryProfitPercent)}`}>
                        Kar: {formatCurrency(profitTotals.entryProfit)} ({formatPercent(profitTotals.entryProfitPercent)})
                      </p>
                      {profitTotals.entryMissingLines > 0 && (
                        <p className="mt-1 text-[11px] text-[#b45309]">
                          {profitTotals.entryMissingLines} satirda giris maliyeti yok.
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] p-3">
                      <p className="text-[12px] font-medium text-[#047857]">Guncel maliyete gore</p>
                      <p className="mt-1 text-[13px] text-[#51607a]">
                        Toplam maliyet:{' '}
                        <span className="font-semibold text-[#14223b]">
                          {formatCurrency(profitTotals.currentCostTotal)}
                        </span>
                      </p>
                      <p className={`text-[13px] font-semibold ${getPercentTone(profitTotals.currentProfitPercent)}`}>
                        Kar: {formatCurrency(profitTotals.currentProfit)} (
                        {formatPercent(profitTotals.currentProfitPercent)})
                      </p>
                      {profitTotals.currentMissingLines > 0 && (
                        <p className="mt-1 text-[11px] text-[#b45309]">
                          {profitTotals.currentMissingLines} satirda guncel maliyet yok.
                        </p>
                      )}
                    </div>
                  </div>
                  {(profitTotals.entryMissingLines > 0 ||
                    profitTotals.currentMissingLines > 0 ||
                    profitTotals.manualLines > 0) && (
                    <p className="mt-3 text-[12px] text-[#8b97ac]">
                      Maliyeti olmayan veya manuel girilen satirlar kar hesabina dahil edilmez.
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-[12px] text-[#8b97ac]">{quoteItems.length} kalem secili</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasBlockedPreview && (
                      <button
                        type="button"
                        onClick={applyMinPriceToBlockedItems}
                        disabled={submitting}
                        title="Blok'lu satirlarin fiyatini minimum satilabilir fiyata (taban x 1,05) ceker"
                        className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] font-semibold text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
                      >
                        Tum blok satirlari tabana cek
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openAiAnalysis}
                      disabled={submitting || quoteItems.length === 0}
                      title="Teklifi musteri talebine ve sistem verisine gore analiz et"
                      className={btnGhost}
                    >
                      <Sparkles width={15} height={15} stroke="currentColor" strokeWidth={2} />
                      AI ile analiz et
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting} className={btnPrimary}>
                      {submitLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====================== MOBIL SABIT ALT AKSIYON CUBUGU ====================== */}
      {/* Sadece md alti; genel toplam + birincil kaydet/olustur. Mevcut handler'lar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#d3deef] bg-white/95 backdrop-blur px-4 py-2.5 shadow-[0_-6px_20px_rgba(20,34,59,0.08)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] text-[#8b97ac] leading-none">Genel Toplam</div>
            <div className="text-[17px] font-bold text-[#15356b] leading-tight truncate">
              {formatCurrency(totals.grandTotal)}
            </div>
            <div className="text-[10.5px] text-[#8b97ac] leading-none">{quoteItems.length} kalem</div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {hasBlockedPreview && (
              <button
                type="button"
                onClick={applyMinPriceToBlockedItems}
                disabled={submitting}
                title="Blok'lu satirlarin fiyatini minimum satilabilir fiyata ceker"
                className="inline-flex items-center rounded-[9px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-[12px] font-semibold text-[#b91c1c] disabled:opacity-50"
              >
                Tabana Cek
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || quoteItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#15356b] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 width={15} height={15} className="animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ====================== AI MODALI ====================== */}
      <Modal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        title="AI ile Teklif Analizi"
        size="xl"
        footer={
          <>
            <button type="button" onClick={() => setShowAiModal(false)} className={btnGhost}>
              Kapat
            </button>
            <button type="button" onClick={runAiAnalysis} disabled={aiAnalyzing} className={btnPrimary}>
              {aiAnalyzing && <Loader2 width={15} height={15} className="animate-spin" />}
              {aiResult ? 'Tekrar Analiz Et' : 'Analiz Et'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[#d3deef] bg-[#eef2fa] p-3 text-[13px] text-[#15356b]">
            Teklif, asagidaki <b>musteri talebine</b> ve sistemdeki maliyet/marj/gecmis verisine gore analiz edilir. Talep
            metnini (varsa gorselini) eklerseniz analiz daha isabetli olur. AI <b>sadece okur</b>, teklifi degistirmez.
          </div>
          {aiModels.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-medium text-[#8b97ac]">AI Modeli</label>
              <select
                value={aiModel}
                onChange={(e) => onAiModelChange(e.target.value)}
                className="rounded-[9px] border border-[#d8e0ec] px-2.5 py-1.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#15356b]/30"
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
            <label className="block text-[12px] font-medium text-[#8b97ac] mb-1.5">
              Musteri talebi (opsiyonel) — musterinin bizden istedigi teklif metni
            </label>
            <textarea
              value={aiRequestText}
              onChange={(e) => setAiRequestText(e.target.value)}
              rows={4}
              placeholder={'Orn: "10 koli Z havlu, 5 koli pecete..." — yaprak sayisi, gramaj, ebat gibi detaylar varsa yazin.'}
              className="w-full rounded-[9px] border border-[#d8e0ec] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#15356b]/30 focus:border-[#15356b]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="file" accept="image/*" onChange={onAiImageChange} className="hidden" />
              <span className="rounded-[9px] border border-[#d8e0ec] px-3 py-1.5 font-medium text-[#15356b] hover:bg-[#eef2fa]">
                Talep gorseli ekle
              </span>
            </label>
            {aiImage && (
              <span className="inline-flex items-center gap-2 text-[12px] text-[#51607a]">
                {aiImage.name} eklendi
                <button type="button" className="text-[#b91c1c] hover:underline" onClick={() => setAiImage(null)}>
                  kaldir
                </button>
              </span>
            )}
          </div>

          {aiError && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-[13px] text-[#b91c1c]">{aiError}</div>
          )}

          {aiAnalyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-[#8b97ac]">
              <Loader2 width={20} height={20} className="animate-spin" /> Teklif analiz ediliyor...
            </div>
          )}

          {aiResult && !aiAnalyzing && (
            <div className="space-y-3">
              {(() => {
                const verdict = aiResult?.overall?.verdict || 'dikkat';
                const win = aiResult?.overall?.winProbability || 'orta';
                const tone =
                  verdict === 'iyi'
                    ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
                    : verdict === 'riskli'
                      ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
                      : 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]';
                return (
                  <div className={`rounded-xl border p-3 ${tone}`}>
                    <div className="text-[13px] font-semibold">
                      Genel: {String(verdict).toUpperCase()} · Kazanma olasiligi: {String(win).toUpperCase()}
                    </div>
                    {aiResult?.overall?.summary && <div className="mt-1 text-[13px]">{aiResult.overall.summary}</div>}
                  </div>
                );
              })()}

              {Array.isArray(aiResult?.findings) && aiResult.findings.length === 0 ? (
                <div className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] p-3 text-[13px] text-[#047857]">
                  Belirgin bir sorun bulunamadi.
                </div>
              ) : (
                (aiResult?.findings || []).map((f: any, i: number) => {
                  const sev = f?.severity || 'info';
                  const sevTone =
                    sev === 'critical'
                      ? 'border-[#fecaca] bg-[#fef2f2]'
                      : sev === 'warning'
                        ? 'border-[#fde68a] bg-[#fffbeb]'
                        : 'border-[#e7ebf2] bg-white';
                  return (
                    <div key={i} className={`rounded-xl border p-3 ${sevTone}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#14223b]">{f?.title || 'Bulgu'}</span>
                        {f?.category && (
                          <span className="shrink-0 rounded-md bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-medium text-[#51607a]">
                            {String(f.category).replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {f?.detail && <p className="mt-1 text-[13px] text-[#51607a]">{f.detail}</p>}
                      {f?.suggestion && (
                        <p className="mt-1.5 text-[13px] text-[#14223b]">
                          <span className="font-semibold">Oneri:</span> {f.suggestion}
                        </p>
                      )}
                      {f?.lineRef && <p className="mt-1 text-[11px] text-[#8b97ac]">Ilgili: {f.lineRef}</p>}
                    </div>
                  );
                })
              )}
              <p className="text-[11px] text-[#aab4c4]">AI onerisidir; nihai karar sizindir. Sayilar canli sistemden alinir.</p>
            </div>
          )}

          {!aiResult && !aiAnalyzing && !aiError && (
            <p className="text-center text-[13px] text-[#aab4c4] py-4">
              &quot;Analiz Et&quot; butonuna basinca teklif degerlendirilecek.
            </p>
          )}
        </div>
      </Modal>

      {/* ====================== CARI SECME MODALI ====================== */}
      <CariSelectModal
        isOpen={showCariModal}
        onClose={() => setShowCariModal(false)}
        serverSearch={searchCustomersServer}
        onSelect={handlePickCustomer}
      />

      {/* ====================== DEGISTIR/BOL ONAY MODALI ====================== */}
      <Modal
        isOpen={Boolean(familyActionConfirmInfo)}
        onClose={cancelFamilyAction}
        title={familyActionConfirmInfo?.title || 'Onay'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelFamilyAction} className={btnGhost}>
              Vazgeç
            </button>
            <button type="button" onClick={confirmFamilyAction} className={btnPrimary}>
              Onayla ve Uygula
            </button>
          </div>
        }
      >
        {familyActionConfirmInfo && (
          <div className="space-y-3">
            {/* Mevcut satir */}
            <div className="rounded-2xl border border-[#e7ebf2] bg-[#f8fafc] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                Mevcut Satır
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#14223b]">
                {familyActionConfirmInfo.current.name}{' '}
                <span className="font-normal text-[#8b97ac]">
                  ({familyActionConfirmInfo.current.code})
                </span>
              </p>
              <p className="mt-0.5 text-[12px] text-[#51607a]">
                Miktar: {familyActionConfirmInfo.current.quantityText}
                {familyActionConfirmInfo.current.priceText
                  ? ` | Birim fiyat: ${familyActionConfirmInfo.current.priceText}`
                  : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {renderFamilyMargin('Marj (Güncel)', familyActionConfirmInfo.current.current)}
                {renderFamilyMargin('Marj (Son Giriş)', familyActionConfirmInfo.current.entry)}
              </div>
            </div>

            {/* Yeni durum */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                {familyActionConfirmInfo.mode === 'swap' ? 'Taşınacak Yeni Satır' : 'Bölünecek Yeni Satır'}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#14223b]">
                {familyActionConfirmInfo.target.name}{' '}
                <span className="font-normal text-[#8b97ac]">
                  ({familyActionConfirmInfo.target.code})
                </span>
              </p>
              <p className="mt-0.5 text-[12px] text-[#51607a]">
                Taşınacak miktar: {familyActionConfirmInfo.target.movedQuantityText}
                {familyActionConfirmInfo.target.keptQuantityText
                  ? ` | Mevcut satırda kalan: ${familyActionConfirmInfo.target.keptQuantityText}`
                  : ''}
                {familyActionConfirmInfo.target.priceText
                  ? ` | Taşınacak fiyat: ${familyActionConfirmInfo.target.priceText}`
                  : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {renderFamilyMargin('Marj (Güncel)', familyActionConfirmInfo.target.current)}
                {renderFamilyMargin('Marj (Son Giriş)', familyActionConfirmInfo.target.entry)}
              </div>
            </div>

            {!familyActionConfirmInfo.hasPrice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
                Fiyat taşınamayacak — yeni satırda fiyat seçmeniz gerekir.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ====================== FIYAT TEYIT MODALI ====================== */}
      <Modal
        isOpen={Boolean(priceRequestTarget)}
        onClose={() => setPriceRequestTarget(null)}
        title="Fiyat Guncellik Teyidi"
        size={priceRequestTarget?.isManualLine ? 'xl' : 'lg'}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPriceRequestTarget(null)} className={btnGhost}>
              Vazgec
            </button>
            <button
              type="button"
              onClick={submitPriceVerificationRequest}
              disabled={priceRequestSaving}
              className={btnPrimary}
            >
              {priceRequestSaving ? 'Gonderiliyor...' : 'Satin almaya gonder'}
            </button>
          </div>
        }
      >
        {priceRequestTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
              <p className="text-[13px] font-semibold text-[#92400e]">
                {priceRequestTarget.isManualLine
                  ? 'Stokta olmayan / manuel urun'
                  : `${priceRequestTarget.productCode} - ${priceRequestTarget.productName}`}
              </p>
              <p className="mt-1 text-[12px] text-[#b45309]">
                Miktar: {formatQuantityInput(getDisplayQuantity(priceRequestTarget))}{' '}
                {getSelectedUnit(priceRequestTarget)}
                {getDisplayUnitPrice(priceRequestTarget)
                  ? ` | Satirdaki fiyat: ${formatCurrency(getDisplayUnitPrice(priceRequestTarget))}`
                  : ''}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelBase}>Oncelik</label>
                <select
                  value={priceRequestPriority}
                  onChange={(e) => setPriceRequestPriority(e.target.value)}
                  className={inputBase}
                >
                  <option value="LOW">Dusuk</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Yuksek</option>
                  <option value="URGENT">Acil</option>
                </select>
              </div>
              <div>
                <label className={labelBase}>Cari</label>
                <div className="rounded-[9px] border border-[#e7ebf2] bg-[#f8fafc] px-3 py-2 text-[13px] text-[#51607a]">
                  {selectedCustomer?.mikroCariCode || editingOrderCustomerCode || '-'}{' '}
                  {selectedCustomer?.name ? `- ${selectedCustomer.name}` : ''}
                </div>
              </div>
            </div>

            {priceRequestTarget.isManualLine && (
              <div className="rounded-2xl border border-[#e7ebf2] bg-[#f8fafc] p-4">
                <h3 className="mb-3 text-[13px] font-bold text-[#14223b]">Yeni stok icin zorunlu kart bilgileri</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelBase}>Sablon stok</label>
                    <input
                      value={priceRequestStockPayload.templateCode}
                      onChange={(e) => updatePriceRequestStockPayload({ templateCode: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Stok adi</label>
                    <input
                      value={priceRequestStockPayload.name}
                      onChange={(e) => updatePriceRequestStockPayload({ name: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Tedarikci urun kodu</label>
                    <input
                      value={priceRequestStockPayload.foreignName}
                      onChange={(e) => updatePriceRequestStockPayload({ foreignName: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Ana birim</label>
                    <input
                      value={priceRequestStockPayload.mainUnit}
                      onChange={(e) => updatePriceRequestStockPayload({ mainUnit: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>KDV %</label>
                    <input
                      value={priceRequestStockPayload.vatRatePercent}
                      onChange={(e) => updatePriceRequestStockPayload({ vatRatePercent: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Ana saglayici kodu</label>
                    <input
                      value={priceRequestStockPayload.supplierCode}
                      onChange={(e) => updatePriceRequestStockPayload({ supplierCode: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Marka kodu</label>
                    <input
                      value={priceRequestStockPayload.brandCode}
                      onChange={(e) => updatePriceRequestStockPayload({ brandCode: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Marka adi (yeni ise)</label>
                    <input
                      value={priceRequestStockPayload.brandName}
                      onChange={(e) => updatePriceRequestStockPayload({ brandName: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Kategori kodu</label>
                    <input
                      value={priceRequestStockPayload.categoryCode}
                      onChange={(e) => updatePriceRequestStockPayload({ categoryCode: e.target.value })}
                      placeholder="1.09.04"
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Ambalaj kodu</label>
                    <input
                      value={priceRequestStockPayload.packageCode}
                      onChange={(e) => updatePriceRequestStockPayload({ packageCode: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Ambalaj adi (yeni ise)</label>
                    <input
                      value={priceRequestStockPayload.packageName}
                      onChange={(e) => updatePriceRequestStockPayload({ packageName: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelBase}>Raf / reyon kodu</label>
                    <input
                      value={priceRequestStockPayload.shelfCode}
                      onChange={(e) => updatePriceRequestStockPayload({ shelfCode: e.target.value })}
                      className={inputBase}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <div key={index}>
                      <label className={labelBase}>{`Marj ${index + 1}`}</label>
                      <input
                        value={priceRequestStockPayload.margins?.[index] || ''}
                        onChange={(e) => updatePriceRequestMargin(index, e.target.value)}
                        className={inputBase}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={labelBase}>Talep notu</label>
              <textarea
                value={priceRequestNote}
                onChange={(e) => setPriceRequestNote(e.target.value)}
                rows={4}
                className="w-full rounded-[9px] border border-[#d8e0ec] px-3 py-2 outline-none focus:ring-2 focus:ring-[#15356b]/30"
                placeholder="Musteri hedef fiyati, rakip fiyat, talep sebebi..."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ====================== URUN HAVUZU MODALI ====================== */}
      <Modal isOpen={showProductPoolModal} onClose={() => setShowProductPoolModal(false)} title="Urun Havuzu" size="full">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full bg-[#f1f4f9] p-1">
                <button
                  type="button"
                  onClick={() => setProductTab('purchased')}
                  className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium ${
                    productTab === 'purchased'
                      ? 'bg-white text-[#14223b] shadow-sm'
                      : 'text-[#8b97ac] hover:text-[#14223b]'
                  }`}
                >
                  Daha Once Alinanlar
                </button>
                <button
                  type="button"
                  onClick={() => setProductTab('search')}
                  className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium ${
                    productTab === 'search' ? 'bg-white text-[#14223b] shadow-sm' : 'text-[#8b97ac] hover:text-[#14223b]'
                  }`}
                >
                  Tum Urunler
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8b97ac]">
              <span>Son {lastSalesCount} satis gosteriliyor.</span>
              <select
                value={poolSort}
                onChange={(e) => setPoolSort(e.target.value as (typeof POOL_SORT_OPTIONS)[number]['value'])}
                className="rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px] text-[#51607a]"
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
                className="rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px] text-[#51607a]"
              >
                <option value="">Liste fiyati secin</option>
                {Object.entries(PRICE_LIST_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowPoolColorOptions((prev) => !prev)}
                className={showPoolColorOptions ? btnPrimary : btnGhost}
              >
                Renklendirme
              </button>
              <button type="button" onClick={savePoolPreferences} disabled={savingPoolPreferences} className={btnGhost}>
                {savingPoolPreferences ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </button>
            </div>
          </div>
          {showPoolColorOptions && (
            <div className="rounded-xl border border-[#e7ebf2] bg-white px-4 py-3 text-[12px] text-[#51607a] space-y-3">
              {poolColorRules.length === 0 ? (
                <div className="text-[12px] text-[#aab4c4]">Renklendirme kurali yok.</div>
              ) : (
                <div className="space-y-3">
                  {poolColorRules.map((rule, index) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-[#f1f4f9] px-2 py-1 text-[11px] text-[#8b97ac]">
                        Kural {index + 1}
                      </span>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updatePoolColorRule(rule.id, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[#15356b]"
                        />
                        Aktif
                      </label>
                      <select
                        value={rule.warehouse}
                        onChange={(e) => updatePoolColorRule(rule.id, { warehouse: e.target.value as '1' | '6' })}
                        className="rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px]"
                      >
                        <option value="1">Merkez</option>
                        <option value="6">Topca</option>
                      </select>
                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, {
                            operator: e.target.value as (typeof poolColorRules)[number]['operator'],
                          })
                        }
                        className="rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px]"
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
                        className="w-20 rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px]"
                      />
                      <select
                        value={rule.color}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, {
                            color: e.target.value as (typeof poolColorRules)[number]['color'],
                          })
                        }
                        className="rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[12px]"
                      >
                        <option value="green">Yesil</option>
                        <option value="yellow">Sari</option>
                        <option value="blue">Mavi</option>
                        <option value="red">Kirmizi</option>
                        <option value="slate">Gri</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removePoolColorRule(rule.id)}
                        className="rounded-full px-2 py-1 text-[12px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={addPoolColorRule} className={btnGhost}>
                  <Plus width={13} height={13} stroke="currentColor" strokeWidth={2} />
                  Kural Ekle
                </button>
                <span className="text-[11px] text-[#aab4c4]">Ornek: Merkez buyuk 0 = yesil</span>
              </div>
            </div>
          )}

          {productTab === 'purchased' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  placeholder="Urun ara..."
                  value={purchasedSearch}
                  onChange={(e) => setPurchasedSearch(e.target.value)}
                  className={`${inputBase} lg:max-w-xs`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-[#8b97ac]">
                    {selectedPurchasedCount} secili / {filteredPurchasedProducts.length} urun
                  </span>
                  <button type="button" onClick={clearPurchasedSelection} className={btnGhost}>
                    Secimi Temizle
                  </button>
                  <button type="button" onClick={selectAllPurchased} className={btnGhost}>
                    Tumunu Sec
                  </button>
                  <button
                    type="button"
                    onClick={addSelectedPurchasedToQuote}
                    disabled={selectedPurchasedCount === 0}
                    className={btnPrimary}
                  >
                    Secilileri Ekle
                  </button>
                </div>
              </div>
              {sortedPurchasedProducts.length === 0 ? (
                <div className="text-[13px] text-[#8b97ac]">Urun bulunamadi.</div>
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
                            ? 'border-[#d3deef] bg-[#eef2fa]'
                            : colorClass
                              ? `${colorClass} hover:border-[#d3deef]`
                              : 'border-[#e7ebf2] bg-white hover:border-[#d3deef]'
                        } cursor-pointer`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePurchasedSelection(product.mikroCode)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 accent-[#15356b]"
                            />
                            <div className="text-left">
                              <p className="font-semibold text-[#14223b]">{product.name}</p>
                              <p className="text-[12px] text-[#8b97ac]">
                                {product.mikroCode}
                                {product.unit ? ` - ${product.unit}` : ''}
                              </p>
                              <div className="mt-1 text-[12px] text-[#8b97ac]">
                                <span className="font-medium text-[#51607a]">Merkez</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-[#d8e0ec]">|</span>
                                <span className="font-medium text-[#51607a]">Topca</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                              {unitLabel && <div className="mt-1 text-[12px] text-[#8b97ac]">{unitLabel}</div>}
                              <CategoryLastPurchaseBadge info={getCategoryLastPurchaseInfo(product)} />
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                addProductToQuote(product, getPoolQuantityValue(product.mikroCode));
                              }}
                              className={btnGhost}
                            >
                              {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                            </button>
                            <div className="mt-2 w-20" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={getPoolQuantityInputValue(product.mikroCode)}
                                onChange={(event) => setPoolQuantityInputValue(product.mikroCode, event.target.value)}
                                onBlur={() => normalizePoolQuantityInputValue(product.mikroCode)}
                                onFocus={selectPoolQuantityInput}
                                onClick={selectPoolQuantityInput}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="h-8 w-full rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-center text-[13px]"
                                aria-label={`${product.name} miktar`}
                              />
                            </div>
                            {poolPriceLabel && (
                              <div className="mt-2 text-[11px] font-semibold text-[#51607a]">
                                {poolPriceLabel}: <span className="font-bold text-[#14223b]">{poolPriceDisplay}</span>
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
                                  className="rounded-lg border border-[#e7ebf2] bg-white px-2 py-1 text-[12px]"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-[#51607a]">{formatDateShort(sale.saleDate)}</span>
                                    <span className="text-[#8b97ac]">{sale.quantity} adet</span>
                                    <span className="font-semibold text-[#14223b]">{formatCurrency(sale.unitPrice)}</span>
                                  </div>
                                  {sale.documentNo && (
                                    <div className="mt-0.5 text-[11px] text-[#8b97ac]">
                                      Belge No: <span className="font-medium text-[#51607a]">{sale.documentNo}</span>
                                    </div>
                                  )}
                                  {listLabel && (
                                    <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[10px] font-semibold text-[#0369a1]">
                                      {listLabel}
                                    </span>
                                  )}
                                  {sale.vatZeroed && (
                                    <span className="ml-1 inline-flex rounded-full bg-[#eef2fa] px-2 py-0.5 text-[10px] font-semibold text-[#1c4585]">
                                      KDV 0
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-[#aab4c4]">Satis yok</p>
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
                <input
                  placeholder="Urun adi veya kodu"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${inputBase} lg:max-w-xs`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-[#8b97ac]">
                    {selectedSearchCount} secili / {sortedSearchResults.length} urun
                  </span>
                  <button type="button" onClick={clearSearchSelection} className={btnGhost}>
                    Secimi Temizle
                  </button>
                  <button type="button" onClick={selectAllSearch} className={btnGhost}>
                    Tumunu Sec
                  </button>
                  <button
                    type="button"
                    onClick={addSelectedSearchToQuote}
                    disabled={selectedSearchCount === 0}
                    className={btnPrimary}
                  >
                    Secilileri Ekle
                  </button>
                </div>
              </div>
              {searchLoading ? (
                <div className="text-[13px] text-[#8b97ac]">Araniyor...</div>
              ) : sortedSearchResults.length === 0 ? (
                <div className="text-[13px] text-[#8b97ac]">Arama sonucu yok.</div>
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
                            ? 'border-[#d3deef] bg-[#eef2fa]'
                            : colorClass
                              ? `${colorClass} hover:border-[#d3deef]`
                              : 'border-[#e7ebf2] bg-white hover:border-[#d3deef]'
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
                                className="mt-1 h-4 w-4 accent-[#15356b]"
                              />
                              <div>
                                <p className="font-semibold text-[#14223b]">{product.name}</p>
                                <p className="text-[12px] text-[#8b97ac]">{product.mikroCode}</p>
                                <div className="mt-1 text-[12px] text-[#8b97ac]">
                                  <span className="font-medium text-[#51607a]">Merkez</span>{' '}
                                  {formatStockValue(product.warehouseStocks?.['1'])}
                                  <span className="mx-2 text-[#d8e0ec]">|</span>
                                  <span className="font-medium text-[#51607a]">Topca</span>{' '}
                                  {formatStockValue(product.warehouseStocks?.['6'])}
                                </div>
                                {unitLabel && <div className="mt-1 text-[12px] text-[#8b97ac]">{unitLabel}</div>}
                                <CategoryLastPurchaseBadge info={getCategoryLastPurchaseInfo(product)} />
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                addProductToQuote(product, getPoolQuantityValue(product.mikroCode));
                              }}
                              className={btnGhost}
                            >
                              {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                            </button>
                            <div className="mt-2 w-20" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={getPoolQuantityInputValue(product.mikroCode)}
                                onChange={(event) => setPoolQuantityInputValue(product.mikroCode, event.target.value)}
                                onBlur={() => normalizePoolQuantityInputValue(product.mikroCode)}
                                onFocus={selectPoolQuantityInput}
                                onClick={selectPoolQuantityInput}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="h-8 w-full rounded-[9px] border border-[#d8e0ec] px-2 py-1 text-center text-[13px]"
                                aria-label={`${product.name} miktar`}
                              />
                            </div>
                            {poolPriceLabel && (
                              <div className="mt-2 text-[11px] font-semibold text-[#51607a]">
                                {poolPriceLabel}: <span className="font-bold text-[#14223b]">{poolPriceDisplay}</span>
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

      {/* ====================== KOLON SECICI MODALI ====================== */}
      {showColumnSelector && (
        <Modal
          isOpen={showColumnSelector}
          onClose={() => setShowColumnSelector(false)}
          title="Goruntulenecek Kolonlar"
          size="xl"
          footer={
            <>
              <button type="button" onClick={() => setShowColumnSelector(false)} className={btnGhost}>
                Iptal
              </button>
              <button type="button" onClick={saveColumnPreferences} disabled={savingColumns} className={btnPrimary}>
                {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e7ebf2] bg-[#f8fafc] px-3 py-2">
              <p className="text-[12px] text-[#8b97ac]">Kolonlari secin ve siralamayi surukleyin.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={selectAllColumns} className={btnGhost}>
                  Tumunu Sec
                </button>
                <button type="button" onClick={clearAllColumns} className={btnGhost}>
                  Tumunu Kaldir
                </button>
              </div>
            </div>

            <div>
              <div className="text-[13px] font-semibold text-[#51607a] mb-2">Secili Kolonlar (surukle birak)</div>
              <div className="flex flex-wrap gap-2">
                {reorderableColumns.map((column) => {
                  const isLineDescription = column === '__line_description__';
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
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] ${
                        draggingColumn === column
                          ? 'border-[#d3deef] bg-[#eef2fa] text-[#15356b]'
                          : 'border-[#e7ebf2] bg-white text-[#51607a]'
                      }`}
                      title="Surukleyerek sirala"
                    >
                      <span className="text-[#aab4c4]">::</span>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableColumns.map((column) => (
                <label key={column} className="flex items-center gap-2 text-[13px] text-[#51607a]">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column)}
                    onChange={() => {
                      setSelectedColumns((prev) =>
                        prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]
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
