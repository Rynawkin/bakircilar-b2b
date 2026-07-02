'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Play,
  RefreshCw,
  Warehouse,
  Wand2,
  Search,
  Pencil,
  X,
  AlertCircle,
  CheckCircle2,
  Truck,
  FileText,
  ClipboardList,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import MinMaxV2Panel from './MinMaxV2Panel';
import {
  useUcarerDepo,
  normalizeValue,
  formatPdfMoney,
  formatOperationDate,
  OPERATION_TYPE_LABELS,
  SUGGESTION_MODE_HELP,
  TRIAGE_LABELS,
  TRIAGE_SOON_DAYS,
  type UcarerOperationLogRow,
  type AllocationMode,
  type NonFamilyColorFilter,
  type NonFamilyColorSort,
  type DepotType,
  type SuggestionMode,
  type SuggestionTriageClass,
  type SuggestionTriageFilter,
} from './useUcarerDepo';

/**
 * Yeni gorunum Ucarer Depo ve MinMax ekrani. Mevcut TUM mantik useUcarerDepo'dan gelir; sadece gorsel yeni.
 * Hicbir handler/buton/kolon/filtre/sekme/modal/satir-aksiyon/onay/yonlendirme-onerisi/stok-ailesi/Mikro-yazma
 * dusurulmemistir; brief 4.12.1'deki her oge mevcut ve mevcut handler'a baglidir.
 */

// Tasarim tokenleri (CSS-degisken sistemi yerine inline; brief: beyaz kart #fff border #e7ebf2 r12)
const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const INK = '#14223b';
const INK2 = '#51607a';
const INK3 = '#8b97ac';
const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const BORDER = '#e7ebf2';

const btnPrimary =
  'inline-flex items-center gap-1.5 bg-[#15356b] hover:bg-[#1c4585] text-white text-[12.5px] font-semibold rounded-lg px-3.5 h-9 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-1.5 bg-white hover:bg-[#f4f6fa] border border-[#d8e0ec] text-[#51607a] text-[12.5px] font-medium rounded-lg px-3.5 h-9 disabled:opacity-50';
const btnSmGhost =
  'inline-flex items-center gap-1 bg-white hover:bg-[#f4f6fa] border border-[#d8e0ec] text-[#51607a] text-[11px] font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-50';
const btnSmPrimary =
  'inline-flex items-center gap-1 bg-[#15356b] hover:bg-[#1c4585] text-white text-[11px] font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-50';
const btnSmTint =
  'inline-flex items-center gap-1 bg-[#eef2fa] hover:bg-[#e0e8f6] border border-[#d6e0f1] text-[#15356b] text-[11px] font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-50';

export default function UcarerDepoNew() {
  const h = useUcarerDepo();
  const {
    depot, setDepot,
    depotLimit, setDepotLimit,
    depotLoading,
    minMaxLoading,
    minMaxJobStatusText,
    depotRows,
    depotTotal,
    depotLimited,
    minMaxRows,
    minMaxTotal,
    families, familyLoading,
    allocationModeByFamily, setAllocationModeByFamily,
    singleCodeByFamily, setSingleCodeByFamily,
    splitAByFamily, setSplitAByFamily,
    splitBByFamily, setSplitBByFamily,
    splitRatioByFamily, setSplitRatioByFamily,
    setManualAllocations,
    nonFamilyAllocations, setNonFamilyAllocations,
    panelColumns, setPanelColumns,
    costPInputByCode, setCostPInputByCode,
    costTInputByCode, setCostTInputByCode,
    manualCostPOverrideByCode, setManualCostPOverrideByCode,
    vatRateByCode,
    updatingCostByCode,
    updatingSupplierByCode,
    supplierOverrideByCode, setSupplierOverrideByCode,
    persistSupplierOverrideByCode, setPersistSupplierOverrideByCode,
    cariOptions,
    seriesModalOpen, setSeriesModalOpen,
    familySort, setFamilySort,
    nonFamilySort, setNonFamilySort,
    nonFamilyColorFilter, setNonFamilyColorFilter,
    nonFamilyColorSort, setNonFamilyColorSort,
    nonFamilyTriageFilter, setNonFamilyTriageFilter,
    familyListSearch, setFamilyListSearch,
    familyDetailSearch, setFamilyDetailSearch,
    nonFamilySearch, setNonFamilySearch,
    showUnsuggestedFamilies, setShowUnsuggestedFamilies,
    expandedSupplierRows, setExpandedSupplierRows,
    supplierOrderConfigs, setSupplierOrderConfigs,
    supplierRecentSeriesByCode,
    pendingAllocations,
    sendingRedirectKey,
    activeFamilyId,
    orderPanelTab, setOrderPanelTab,
    panelHighlight,
    creatingOrders,
    creatingTransferOrder,
    selectedTransferByCode, setSelectedTransferByCode,
    exportingDepot,
    exportingMinMax,
    resetMinMaxToZeroByCode, setResetMinMaxToZeroByCode,
    updatingMinMaxExclusionByCode,
    missingPriceProducts, setMissingPriceProducts,
    createdOrderHistory, setCreatedOrderHistory,
    operationLogs,
    operationLogLoading,
    operationLogSearch, setOperationLogSearch,
    operationLogType, setOperationLogType,
    setOperationLogPage,
    operationLogPagination,
    lastCreatedOrders,
    downloadingOrderPdfs,
    downloadingOrderSummaryPdf,
    createdOrdersModalOpen, setCreatedOrdersModalOpen,
    incomingOrdersModalOpen, setIncomingOrdersModalOpen,
    incomingOrdersLoading,
    incomingOrdersProductCode,
    incomingOrdersDetailRows,
    salesHistoryModalOpen, setSalesHistoryModalOpen,
    salesHistoryLoading,
    salesHistoryProductCode,
    salesHistoryViewMode,
    salesHistoryLookbackMonths,
    salesHistoryRows,
    markingTopluLineKey,
    salesHistorySort, setSalesHistorySort,
    salesHistorySummary,
    familyEditModalOpen,
    familyEditName, setFamilyEditName,
    familyEditCode, setFamilyEditCode,
    familyEditNote, setFamilyEditNote,
    familyEditActive, setFamilyEditActive,
    familyEditProductCodes,
    familyEditSearch, setFamilyEditSearch,
    familyEditResults,
    familyEditSearching,
    familyEditSaving,
    pendingSupplierInputByProduct, setPendingSupplierInputByProduct,
    suggestionMode, setSuggestionMode,
    productNameColumn,
    minMaxExcludedCodeSet,
    totalSuggestedQty,
    salesHistoryRowsSorted,
    activeFamily,
    activeFamilySuggestion,
    activeFamilyItems,
    filteredActiveFamilyRows,
    filteredNonFamilyRows,
    familySuggestionsFiltered,
    suggestedFamilies,
    unsuggestedFamilies,
    activeFamilyNeedRaw,
    activeFamilyAllocated,
    activeFamilyRemaining,
    missingPriceCodeSet,
    pendingSupplierRows,
    pendingSupplierItemsByCode,
    nonFamilyTriageSummary,
    stickySelectionWidth,
    stickyCodeWidth,
    stickyNameWidth,
    stickyCodeLeft,
    stickyNameLeft,
    isIncomingOrderRow,
    getRowHighlightClass,
    updateSort,
    updateSalesHistorySort,
    sortIndicator,
    salesSortIndicator,
    getStickyCellBgClass,
    loadFamilies,
    openFamilyEditModal,
    closeFamilyEditModal,
    addProductCodeToFamilyEdit,
    removeProductCodeFromFamilyEdit,
    getFamilyEditProductLabel,
    saveFamilyEdit,
    loadUcarerOperationLogs,
    loadDepotReport,
    runMinMax,
    exportDepot,
    exportMinMax,
    applySingleAllocation,
    applySplitAllocation,
    setManualAllocation,
    getExtraColumnValue,
    getEffectiveSupplierCode,
    getEffectiveSupplierName,
    getDaysOfStock,
    getDailyAverageSales,
    updateProductCost,
    updateMainSupplier,
    setMinMaxExclusion,
    openIncomingOrdersModal,
    openSalesHistoryModal,
    markSalesHistoryLineAsToplu,
    reassignPendingSupplierForProduct,
    setPendingPersistOverrideForProduct,
    setPendingPriceOverrideForProduct,
    removePendingProductFromSupplierOrder,
    fillActiveBySuggestions,
    clearActiveAllocations,
    sendRedirectSuggestionToSales,
    splitActiveEvenly,
    createSupplierOrders,
    createDepotTransferOrder,
    submitCreateSupplierOrders,
    downloadCreatedOrderPdfs,
    downloadCreatedOrdersSummaryPdf,
    toggleFamilyDetail,
  } = h;

  // Sec-kutusu sinifi (yeni stil)
  const inputCls =
    'rounded-lg border border-[#e3e8f0] bg-white px-2.5 h-9 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]';
  const selCls =
    'rounded-lg border border-[#e3e8f0] bg-white px-2.5 h-9 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] cursor-pointer';

  // 'Kalan stok gunu' rozeti: 7 gun alti kirmizi, 14 gun alti sari.
  const renderStockDaysBadge = (row?: Record<string, any>) => {
    const days = getDaysOfStock(row);
    if (days === null) return <span className="text-[#9aa6b8]">-</span>;
    const dailyAvg = getDailyAverageSales(row);
    const cls =
      days < 7
        ? 'bg-red-100 text-red-700'
        : days < TRIAGE_SOON_DAYS
        ? 'bg-amber-100 text-amber-800'
        : 'bg-[#eef2fa] text-[#51607a]';
    return (
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
        title={dailyAvg !== null ? `Gunluk ort. satis (120g): ${dailyAvg.toLocaleString('tr-TR')}` : undefined}
      >
        {days.toLocaleString('tr-TR')} gun
      </span>
    );
  };

  // Triyaj rozeti: A = musteri bekliyor, B = yakinda bekleyecek, C = min-max tamamlama.
  const renderTriageBadge = (triage: SuggestionTriageClass, incomingQty: number) => {
    const cls =
      triage === 'A'
        ? 'bg-red-100 text-red-700'
        : triage === 'B'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-[#eef2fa] text-[#51607a]';
    return (
      <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
        {triage} · {TRIAGE_LABELS[triage]}
        {triage === 'A' && incomingQty > 0 ? ` (${incomingQty.toLocaleString('tr-TR')})` : ''}
      </span>
    );
  };

  // ---- Operasyon kolonlari toggle satiri (yeni; ayni panelColumns state'i) ----
  const renderOperationColumnsToggle = () => (
    <div className={`${CARD} p-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac] mb-2">Operasyon Kolonlari (ac/kapat)</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-[#51607a]">
        {([
          ['depotQty', 'Depo Miktari'],
          ['topcaDepotQty', 'Topca Depo'],
          ['incomingOrders', 'Alinan Siparis'],
          ['outgoingOrders', 'Verilen Siparis'],
          ['realQty', 'Reel Miktar'],
          ['minQty', 'Min'],
          ['maxQty', 'Max'],
          ['currentCost', 'Maliyet (P/T)'],
          ['packQty', 'Koli Ici'],
          ['costExVat', 'Maliyet KDV Haric'],
          ['costIncVat', 'Maliyet KDV Dahil'],
          ['stockDays', 'Stok Gunu'],
        ] as Array<[keyof typeof panelColumns, string]>).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-[#15356b]"
              checked={panelColumns[key]}
              onChange={(e) => setPanelColumns((p) => ({ ...p, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );

  // ---- Aktif aile dagitim tablosu (yeni stil; tum kolon/aksiyon korunur) ----
  const renderActiveFamilyPanel = () => {
    if (!activeFamily || !activeFamilySuggestion) return null;
    const mode: AllocationMode = allocationModeByFamily[activeFamily.id] || 'MANUAL';
    return (
      <div
        className={`rounded-xl border bg-white p-4 space-y-4 transition-all ${
          panelHighlight ? 'border-emerald-300 ring-2 ring-emerald-300/60 shadow-lg' : 'border-[#e7ebf2] shadow-sm'
        }`}
      >
        {/* Baslik + 3 metrik */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#14223b]">
              {activeFamily.name} {activeFamily.code ? <span className="text-[#8b97ac] font-mono text-xs">({activeFamily.code})</span> : ''}
            </p>
            <p className="text-[11.5px] text-[#8b97ac] mt-0.5">
              Mode gore ihtiyac ({suggestionMode === 'INCLUDE_MINMAX' ? '4. Sorun' : '3. Sorun'})
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className={`${CARD} px-4 py-2.5`}>
              <p className="text-[11px] text-[#8b97ac]">Ihtiyac</p>
              <p className={`text-lg font-semibold mt-0.5 ${activeFamilyNeedRaw < 0 ? 'text-[#b91c1c]' : 'text-[#b45309]'}`}>
                {activeFamilyNeedRaw.toLocaleString('tr-TR')}
              </p>
            </div>
            <div className={`${CARD} px-4 py-2.5`}>
              <p className="text-[11px] text-[#8b97ac]">Dagitim</p>
              <p className="text-lg font-semibold mt-0.5 text-[#14223b]">{activeFamilyAllocated.toLocaleString('tr-TR')}</p>
            </div>
            <div className={`${CARD} px-4 py-2.5`}>
              <p className="text-[11px] text-[#8b97ac]">Kalan</p>
              <p className={`text-lg font-semibold mt-0.5 ${activeFamilyRemaining === 0 ? 'text-[#047857]' : 'text-[#b45309]'}`}>
                {activeFamilyRemaining.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        </div>

        {/* Yonlendirme onerileri (ORDER emerald + Satisa Gonder / DEPOT amber) */}
        {Boolean(activeFamilySuggestion?.redirectSuggestions?.length) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 space-y-1.5">
            <strong className="text-[11px] font-semibold uppercase tracking-wide">Yonlendirme Onerileri</strong>
            {(activeFamilySuggestion?.redirectSuggestions || []).map((item, idx) => (
              <div
                key={`inline-redir-${idx}`}
                className={
                  item.type === 'ORDER'
                    ? 'flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-900'
                    : 'flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-100 px-2.5 py-1.5 text-amber-900'
                }
              >
                <span className="min-w-0 flex-1">{item.text}</span>
                {item.type === 'ORDER' && (
                  <button
                    type="button"
                    className={btnSmGhost}
                    onClick={() => sendRedirectSuggestionToSales(item)}
                    disabled={sendingRedirectKey === `${activeFamily.id}:${item.sourceCode}:${item.targetCode}`}
                  >
                    {sendingRedirectKey === `${activeFamily.id}:${item.sourceCode}:${item.targetCode}` ? 'Gonderiliyor...' : 'Satisa Gonder'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {renderOperationColumnsToggle()}

        {/* Hizli aksiyonlar + dagitim modu */}
        <div className={`${CARD} flex flex-wrap items-center gap-2 p-2.5`}>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">Hizli</span>
          <button type="button" className={btnSmTint} onClick={fillActiveBySuggestions}>
            <Wand2 width={13} height={13} /> Oneriye Gore Doldur
          </button>
          <button type="button" className={btnSmGhost} onClick={splitActiveEvenly}>Esit Dagit</button>
          <button type="button" className={btnSmGhost} onClick={clearActiveAllocations}>Sifirla</button>
          <span className="w-px h-5 bg-[#e7ebf2]" />
          <label className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
            Dagitim Modu
            <select
              className={selCls + ' h-8'}
              value={mode}
              onChange={(e) =>
                setAllocationModeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value as AllocationMode }))
              }
            >
              <option value="SINGLE">Tek Urun</option>
              <option value="TWO_SPLIT">Iki Urun</option>
              <option value="MANUAL">Manuel</option>
            </select>
          </label>

          {mode === 'SINGLE' && (
            <>
              <label className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
                Urun
                <select
                  className={selCls + ' h-8'}
                  value={singleCodeByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSingleCodeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode} - {item.productName || '-'}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={btnSmPrimary} onClick={() => applySingleAllocation(activeFamily)}>Uygula</button>
            </>
          )}

          {mode === 'TWO_SPLIT' && (
            <>
              <label className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
                A
                <select
                  className={selCls + ' h-8'}
                  value={splitAByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitAByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>{item.productCode}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
                B
                <select
                  className={selCls + ' h-8'}
                  value={splitBByFamily[activeFamily.id] || activeFamilyItems[1]?.productCode || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitBByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>{item.productCode}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11.5px] text-[#8b97ac]">
                A %{splitRatioByFamily[activeFamily.id] ?? 50}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={splitRatioByFamily[activeFamily.id] ?? 50}
                  onChange={(e) => setSplitRatioByFamily((prev) => ({ ...prev, [activeFamily.id]: Number(e.target.value) }))}
                  className="w-28 accent-[#15356b]"
                />
              </label>
              <button type="button" className={btnSmPrimary} onClick={() => applySplitAllocation(activeFamily)}>Uygula</button>
            </>
          )}
        </div>

        {/* Detay arama */}
        <div className="relative">
          <Search width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa6b8]" />
          <input
            type="text"
            value={familyDetailSearch}
            onChange={(e) => setFamilyDetailSearch(e.target.value)}
            className={inputCls + ' w-full pl-8'}
            placeholder="Aile detayinda ara (stok kodu/adi/saglayici)"
          />
        </div>

        {/* Dagitim tablosu */}
        <div className="overflow-x-auto overflow-y-auto rounded-lg border border-[#e7ebf2] bg-white max-h-[62vh]">
          <table className="w-max min-w-[2200px] text-[11px]">
            <thead className="bg-[#f8fafc] sticky top-0 z-20">
              <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                <th
                  className="px-2 py-2.5 text-center sticky left-0 top-0 z-30 bg-[#f8fafc] shadow-[2px_0_0_0_#eef1f6] cursor-pointer"
                  style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'color'))}
                >
                  Sec{sortIndicator(familySort, 'color')}
                </th>
                <th
                  className="px-2 py-2.5 text-left sticky top-0 z-30 bg-[#f8fafc] cursor-pointer"
                  style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'code'))}
                >
                  Stok Kodu{sortIndicator(familySort, 'code')}
                </th>
                <th
                  className="px-2 py-2.5 text-left sticky top-0 z-30 bg-[#f8fafc] shadow-[2px_0_0_0_#eef1f6] cursor-pointer"
                  style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'name'))}
                >
                  Urun Adi{sortIndicator(familySort, 'name')}
                </th>
                <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(familySort, 'supplierCode')}</th>
                <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(familySort, 'supplierName')}</th>
                <th className="px-2 py-2.5 text-center">Ana Saglayici</th>
                <th className="px-2 py-2.5 text-center">Kalici Degistir</th>
                <th className="px-2 py-2.5 text-center">MinMax Hesaplanmasin</th>
                {panelColumns.depotQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(familySort, 'depotQty')}</th>}
                {panelColumns.topcaDepotQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(familySort, 'topcaDepotQty')}</th>}
                {panelColumns.incomingOrders && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(familySort, 'incomingOrders')}</th>}
                {panelColumns.outgoingOrders && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(familySort, 'outgoingOrders')}</th>}
                {panelColumns.realQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(familySort, 'realQty')}</th>}
                {panelColumns.minQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(familySort, 'minQty')}</th>}
                {panelColumns.maxQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(familySort, 'maxQty')}</th>}
                {panelColumns.stockDays && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'stockDays'))} title="Depo miktari / son 120 gun gunluk ortalama satis">Stok Gunu{sortIndicator(familySort, 'stockDays')}</th>}
                {panelColumns.packQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(familySort, 'packQty')}</th>}
                {panelColumns.costExVat && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(familySort, 'costExVat')}</th>}
                {panelColumns.costIncVat && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(familySort, 'costIncVat')}</th>}
                {panelColumns.currentCost && <th className="px-2 py-2.5 text-right">Maliyet P/T</th>}
                <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'suggested'))}>Aile Oneri{sortIndicator(familySort, 'suggested')}</th>
                <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(familySort, 'allocation')}</th>
                <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'diff'))}>Fark{sortIndicator(familySort, 'diff')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredActiveFamilyRows.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-2 py-4 text-center text-[#8b97ac]">
                    Bu ailede Ucarer raporunda tum degerleri sifir olan urunler gizlendi. Gorunen urun yok.
                  </td>
                </tr>
              )}
              {filteredActiveFamilyRows.map((entry) => {
                const item = entry.item;
                const code = entry.code;
                const row = entry.row;
                const itemNeed = entry.suggested;
                const allocation = entry.allocation;
                const diff = entry.diff;
                const hasMissingPrice = missingPriceCodeSet.has(code);
                return (
                  <tr key={item.id} className={`border-t border-[#f1f4f9] text-[#14223b] ${hasMissingPrice ? 'bg-pink-200' : getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                    <td
                      className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_#eef1f6] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                    >
                      <input
                        type="checkbox"
                        className="accent-[#15356b]"
                        checked={Boolean(selectedTransferByCode[code])}
                        onChange={(e) => setSelectedTransferByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                      />
                    </td>
                    <td
                      className={`px-2 py-2 font-semibold sticky z-20 ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-mono">{item.productCode}</span>
                        <div className="flex flex-wrap items-center gap-1">
                          <button type="button" className={btnSmTint + ' !px-1.5 !py-0.5 !text-[9px]'} onClick={() => openSalesHistoryModal(code, 'minmax')} title="Satis MinMax detaylarini goster">
                            Satis (MinMax)
                          </button>
                          <button type="button" className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100" onClick={() => openSalesHistoryModal(code, 'recentCustomers')} title="Son alinan carileri ve alis detaylarini goster">
                            Son Alinan Cariler
                          </button>
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-2 py-2 text-[#51607a] sticky z-20 shadow-[2px_0_0_0_#eef1f6] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                    >
                      {item.productName || '-'}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        list="ucarer-supplier-cari-list"
                        value={getEffectiveSupplierCode(code)}
                        onChange={(e) => setSupplierOverrideByCode((prev) => ({ ...prev, [code]: String(e.target.value || '').trim().toUpperCase() }))}
                        className="w-32 rounded-md border border-[#d8e0ec] px-2 py-1 text-[11px] uppercase outline-none focus:border-[#15356b]"
                        placeholder="Cari kodu"
                      />
                    </td>
                    <td className="px-2 py-2 text-[#51607a]">{getEffectiveSupplierName(code)}</td>
                    <td className="px-2 py-2 text-center">
                      <button type="button" className={btnSmGhost} onClick={() => updateMainSupplier(code)} disabled={Boolean(updatingSupplierByCode[code])}>
                        {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="accent-[#15356b]"
                        checked={Boolean(persistSupplierOverrideByCode[code])}
                        onChange={(e) => setPersistSupplierOverrideByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        const isExcluded = minMaxExcludedCodeSet.has(code);
                        return (
                          <div className="flex items-center justify-center gap-2">
                            <label className="inline-flex items-center gap-1 text-[10px] text-[#8b97ac]">
                              <input
                                type="checkbox"
                                className="accent-[#15356b]"
                                checked={Boolean(resetMinMaxToZeroByCode[code])}
                                onChange={(e) => setResetMinMaxToZeroByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                                disabled={isExcluded}
                              />
                              0-0
                            </label>
                            <button type="button" className={btnSmGhost} onClick={() => setMinMaxExclusion(code, !isExcluded)} disabled={Boolean(updatingMinMaxExclusionByCode[code])}>
                              {updatingMinMaxExclusionByCode[code] ? '...' : isExcluded ? 'MinMax Hesaplansin' : 'MinMax Hesaplanmasin'}
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                    {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                    {panelColumns.incomingOrders && (
                      <td className="px-2 py-2 text-right cursor-pointer text-[#15356b] hover:underline" onClick={() => openIncomingOrdersModal(code)} title="Alinan siparis detaylarini goster">
                        {getExtraColumnValue(row || {}, code, 'incomingOrders')}
                      </td>
                    )}
                    {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right text-[#b45309] font-semibold">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                    {panelColumns.realQty && <td className="px-2 py-2 text-right font-semibold">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                    {panelColumns.minQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                    {panelColumns.maxQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                    {panelColumns.stockDays && <td className="px-2 py-2 text-right">{renderStockDaysBadge(row)}</td>}
                    {panelColumns.packQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                    {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                    {panelColumns.costIncVat && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
                    {panelColumns.currentCost && (
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={costPInputByCode[code] ?? ''}
                            onChange={(e) => {
                              const rawValue = e.target.value;
                              setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                              if (manualCostPOverrideByCode[code]) return;
                              const parsed = Number(String(rawValue || '').replace(',', '.'));
                              if (!Number.isFinite(parsed)) return;
                              const vatRate = Number(vatRateByCode[code] ?? 0);
                              const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                              const autoCostP = parsed * (1 + vatPercent / 200);
                              setCostTInputByCode((prev) => ({
                                ...prev,
                                [code]: Number.isFinite(autoCostP) ? autoCostP.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                              }));
                            }}
                            className="w-20 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b]"
                            title="Maliyet T"
                            placeholder="T"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={costTInputByCode[code] ?? ''}
                            onChange={(e) => {
                              setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                              setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                            }}
                            className="w-20 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b]"
                            title="Maliyet P"
                            placeholder="P"
                          />
                          <span className="text-[10px] text-[#8b97ac]">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                          <label className="inline-flex items-center gap-1 text-[10px] text-[#8b97ac]">
                            <input
                              type="checkbox"
                              className="accent-[#15356b]"
                              checked={h.isPriceListUpdateChecked(code)}
                              onChange={(e) => h.setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                            />
                            10 liste
                          </label>
                          <button type="button" className={btnSmGhost} onClick={() => updateProductCost(code)} disabled={Boolean(updatingCostByCode[code])}>
                            {updatingCostByCode[code] ? '...' : 'Guncelle'}
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2 text-right text-[#047857] font-semibold cursor-pointer" title="Dagitima kopyala" onClick={() => setManualAllocation(activeFamily.id, code, Math.max(0, Math.trunc(itemNeed)))}>{itemNeed.toLocaleString('tr-TR')}</td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={allocation}
                        onChange={(e) => setManualAllocation(activeFamily.id, code, Number(e.target.value))}
                        className="w-24 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b] disabled:bg-[#f4f6fa]"
                        disabled={mode !== 'MANUAL'}
                      />
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold ${diff === 0 ? 'text-[#047857]' : 'text-[#b45309]'}`}>
                      {diff.toLocaleString('tr-TR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ---- Olusturulan siparis gecmisi paneli (yeni stil) ----
  const renderCreatedOrderHistoryPanel = () => (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-[#14223b]">Olusturulan Siparis Gecmisi</p>
          <p className="text-[11.5px] text-[#8b97ac]">Bu tarayicida olusturulan son siparis setleri tarih/saat bazinda saklanir.</p>
        </div>
        {createdOrderHistory.length > 0 && (
          <button type="button" className={btnSmGhost} onClick={() => setCreatedOrderHistory([])}>Gecmisi Temizle</button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {createdOrderHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d8e0ec] p-6 text-center text-[12.5px] text-[#8b97ac]">
            Henuz kayitli olusturulan siparis yok.
          </div>
        ) : (
          createdOrderHistory.map((batch) => {
            const orderCount = batch.orders.length;
            const lineCount = batch.lines.length;
            const totalAmount = batch.lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
            return (
              <div key={batch.id} className="rounded-lg border border-[#e7ebf2] bg-[#fafbfd] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#ecfdf5]">
                      <CheckCircle2 width={17} height={17} className="text-[#047857]" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#14223b]">
                        {new Date(batch.createdAt).toLocaleString('tr-TR')} / {batch.depot}
                      </p>
                      <p className="text-[11.5px] text-[#8b97ac]">
                        Cari: {orderCount.toLocaleString('tr-TR')} / Kalem: {lineCount.toLocaleString('tr-TR')} / Tutar: {formatPdfMoney(totalAmount)}
                      </p>
                      <p className="mt-1 text-[10.5px] text-[#9aa6b8] font-mono">
                        {batch.orders.map((order) => `${order.supplierCode}: ${order.orderNumber}`).join(' | ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={btnSmGhost} onClick={() => downloadCreatedOrderPdfs(batch)} disabled={downloadingOrderPdfs}>Tek Tek PDF</button>
                    <button type="button" className={btnSmGhost} onClick={() => downloadCreatedOrdersSummaryPdf(batch)} disabled={downloadingOrderSummaryPdf}>Yonetici Onayi</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ---- Islem gecmisi (audit) paneli (yeni stil) ----
  const renderOperationHistoryPanel = () => {
    const summarizeLog = (log: UcarerOperationLogRow) => {
      const parts = [
        log.productCode ? `Stok: ${log.productCode}` : '',
        log.familyName ? `Aile: ${log.familyName}` : '',
        log.supplierCode ? `Cari: ${log.supplierCode}` : '',
        log.depot ? `Depo: ${log.depot}` : '',
        log.documentNo ? `Evrak: ${log.documentNo}` : '',
      ].filter(Boolean);
      const orderNumbers = Array.isArray(log.orderNumbers) ? log.orderNumbers.filter(Boolean) : [];
      if (orderNumbers.length > 0) parts.push(`Siparis: ${orderNumbers.join(', ')}`);
      return parts.join(' | ') || '-';
    };
    const renderJsonSummary = (value: any) => {
      if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) return '-';
      const text = JSON.stringify(value);
      return text.length > 220 ? `${text.slice(0, 220)}...` : text;
    };

    return (
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-[#14223b]">Ucarer Islem Gecmisi</p>
            <p className="text-[11.5px] text-[#8b97ac]">
              Maliyet, ana saglayici, aile, MinMax, TOPLU ve siparis olusturma islemleri kullanici ve tarih bazinda tutulur.
            </p>
          </div>
          <button type="button" className={btnSmGhost} onClick={() => loadUcarerOperationLogs(1)} disabled={operationLogLoading}>
            {operationLogLoading ? 'Yukleniyor...' : 'Yenile'}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa6b8]" />
            <Input
              value={operationLogSearch}
              onChange={(event) => setOperationLogSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void loadUcarerOperationLogs(1); }}
              placeholder="Stok, aile, evrak, kullanici ara"
              className="pl-8"
            />
          </div>
          <select className={selCls} value={operationLogType} onChange={(event) => setOperationLogType(event.target.value)}>
            <option value="">Tum islemler</option>
            {Object.entries(OPERATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="button" className={btnGhost + ' justify-center'} onClick={() => loadUcarerOperationLogs(1)} disabled={operationLogLoading}>
            Filtrele
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-[#e7ebf2]">
          <table className="min-w-full text-[11px]">
            <thead className="bg-[#f8fafc]">
              <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                <th className="px-3 py-2.5 text-left">Tarih</th>
                <th className="px-3 py-2.5 text-left">Islem</th>
                <th className="px-3 py-2.5 text-left">Detay</th>
                <th className="px-3 py-2.5 text-left">Kullanici</th>
                <th className="px-3 py-2.5 text-left">Deger</th>
              </tr>
            </thead>
            <tbody>
              {operationLogLoading && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[#8b97ac]">Islem gecmisi yukleniyor...</td></tr>
              )}
              {!operationLogLoading && operationLogs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[#8b97ac]">Kayit bulunamadi.</td></tr>
              )}
              {!operationLogLoading && operationLogs.map((log) => (
                <tr key={log.id} className="border-t border-[#f1f4f9] hover:bg-[#fafbfd]">
                  <td className="whitespace-nowrap px-3 py-2 text-[#51607a]">{formatOperationDate(log.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[#14223b]">{log.title}</div>
                    <div className="mt-1 inline-flex rounded-full bg-[#eef2fa] px-2 py-0.5 text-[10px] font-semibold text-[#15356b]">
                      {OPERATION_TYPE_LABELS[log.operationType] || log.operationType}
                    </div>
                  </td>
                  <td className="min-w-[260px] px-3 py-2 text-[#51607a]">
                    <div>{summarizeLog(log)}</div>
                    {log.productName && <div className="mt-1 text-[#9aa6b8]">{log.productName}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#51607a]">{log.userName || log.userId || '-'}</td>
                  <td className="max-w-[340px] px-3 py-2 font-mono text-[10.5px] text-[#8b97ac]">
                    {renderJsonSummary(log.newValues || log.metadata || log.previousValues)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#8b97ac]">
          <span>
            Toplam {operationLogPagination.totalRecords.toLocaleString('tr-TR')} kayit / Sayfa {operationLogPagination.page.toLocaleString('tr-TR')} - {operationLogPagination.totalPages.toLocaleString('tr-TR')}
          </span>
          <div className="flex gap-2">
            <button type="button" className={btnSmGhost} disabled={operationLogLoading || operationLogPagination.page <= 1} onClick={() => setOperationLogPage((prev) => Math.max(1, prev - 1))}>Onceki</button>
            <button type="button" className={btnSmGhost} disabled={operationLogLoading || operationLogPagination.page >= operationLogPagination.totalPages} onClick={() => setOperationLogPage((prev) => Math.min(operationLogPagination.totalPages, prev + 1))}>Sonraki</button>
          </div>
        </div>
      </div>
    );
  };

  // ---- Aile listesi karti (onerili / onerisiz) ----
  const renderFamilyCard = (family: typeof suggestedFamilies[number], hasOrderRedirect: boolean) => (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${
        activeFamilyId === family.id
          ? 'border-[#d6e0f1] bg-[#eef2fa]'
          : hasOrderRedirect
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-[#eef1f6] bg-white hover:bg-[#fafbfd]'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[#14223b]">
          {family.name} {family.code ? <span className="text-[#8b97ac]">({family.code})</span> : ''}
        </p>
        <p className="text-[10.5px] text-[#8b97ac] font-mono mt-0.5">
          Oneri: {family.suggestedRaw.toLocaleString('tr-TR')} · Kalem: {family.itemCount.toLocaleString('tr-TR')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15356b] hover:underline" onClick={() => openFamilyEditModal(family.id)}>
          <Pencil width={11} height={11} /> Duzenle
        </button>
        <button type="button" className={activeFamilyId === family.id ? btnSmPrimary : btnSmGhost} onClick={() => toggleFamilyDetail(family.id)}>
          {activeFamilyId === family.id ? 'Detayi Kapat' : 'Detayi Ac'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <div className="container mx-auto px-4 py-6 pb-28 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12.5px] text-[#8b97ac]">
          <Link href="/reports" className="hover:text-[#15356b]">Raporlar</Link>
          <ChevronRight width={13} height={13} />
          <span className="text-[#51607a] font-medium">Ucarer Depo & MinMax</span>
        </div>

        {/* Baslik */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/reports" className={btnGhost + ' !px-2.5'} aria-label="Geri">
              <ChevronLeft width={16} height={16} />
            </Link>
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight text-[#14223b] flex items-center gap-2">
                <Warehouse width={22} height={22} className="text-[#15356b]" />
                Ucarer Depo & MinMax
              </h1>
              <p className="text-[13px] text-[#8b97ac] mt-1">Aile bazli tedarikci siparisi + depolar-arasi transfer + MinMax</p>
            </div>
          </div>
        </div>

        {/* Kart 1 — Karar Raporu kontrolleri */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 h-9 rounded-lg border border-[#e3e8f0] px-3">
              <span className="text-[12px] text-[#8b97ac]">Depo</span>
              <select value={depot} onChange={(e) => setDepot(e.target.value as DepotType)} className="border-none bg-transparent text-[12.5px] font-medium text-[#14223b] outline-none cursor-pointer">
                <option value="MERKEZ">Merkez</option>
                <option value="TOPCA">Topca</option>
              </select>
            </label>
            <select value={depotLimit} onChange={(e) => setDepotLimit(e.target.value)} className={selCls + ' w-44'}>
              <option value="500">Ilk 500 satir</option>
              <option value="1000">Ilk 1000 satir</option>
              <option value="2000">Ilk 2000 satir</option>
              <option value="5000">Ilk 5000 satir</option>
              <option value="ALL">Tum satirlar</option>
            </select>
            <button type="button" className={btnPrimary} onClick={loadDepotReport} disabled={depotLoading}>
              <RefreshCw width={15} height={15} className={depotLoading ? 'animate-spin' : ''} />
              Raporu Getir
            </button>
            <button type="button" className={btnGhost} onClick={exportDepot} disabled={exportingDepot || depotRows.length === 0}>
              <Download width={15} height={15} />
              {exportingDepot ? 'Hazirlaniyor...' : "Excel'e Aktar"}
            </button>
            <Link href="/reports/ucarer-minmax-exclusions" className={btnGhost}>MinMax Hesaplanmayacaklar Raporu</Link>

            {/* MinMax yesil kutu */}
            <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2">
              <span className="text-[12px] font-semibold text-[#047857]">MinMax Hesaplama</span>
              <button type="button" className="inline-flex items-center gap-1.5 bg-[#047857] hover:bg-[#036848] text-white text-[11.5px] font-semibold rounded-md px-3 py-1.5 disabled:opacity-50" onClick={runMinMax} disabled={minMaxLoading}>
                <Play width={13} height={13} />
                {minMaxLoading ? 'Calisiyor...' : 'MinMax Calistir'}
              </button>
              <MinMaxV2Panel depot={depot} />
              <button type="button" className={btnSmGhost} onClick={exportMinMax} disabled={exportingMinMax || minMaxRows.length === 0}>
                <Download width={13} height={13} />
                {exportingMinMax ? 'Hazirlaniyor...' : "Excel'e Aktar"}
              </button>
              <span className="text-[11.5px] text-[#047857]">Toplam: <strong>{minMaxTotal.toLocaleString('tr-TR')}</strong></span>
              {minMaxJobStatusText && <span className="text-[11.5px] font-medium text-[#047857]">{minMaxJobStatusText}</span>}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]" title={SUGGESTION_MODE_HELP[suggestionMode]}>
              Oneri Modu
              <select value={suggestionMode} onChange={(e) => setSuggestionMode(e.target.value as SuggestionMode)} className={selCls + ' h-8 w-56'} title={SUGGESTION_MODE_HELP[suggestionMode]}>
                <option value="INCLUDE_MINMAX">MinMax Dahil (4. Sorun)</option>
                <option value="EXCLUDE_MINMAX">MinMax Haric (3. Sorun)</option>
              </select>
              <span
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-[#eef2fa] text-[10px] font-bold text-[#15356b]"
                title={SUGGESTION_MODE_HELP[suggestionMode]}
              >
                ?
              </span>
            </label>
            <p className="text-[12.5px] text-[#51607a]">
              Toplam: <strong className="text-[#14223b]">{depotTotal.toLocaleString('tr-TR')}</strong>
              {depotLimited ? ` (ilk ${depotLimit} satir gosteriliyor)` : ''}
            </p>
            <p className="text-[12.5px] text-[#51607a]">
              Mod'a Gore Onerilen Toplam: <strong className="text-[#14223b]">{totalSuggestedQty.toLocaleString('tr-TR')}</strong>
            </p>
          </div>
          {suggestionMode === 'EXCLUDE_MINMAX' && (
            <p className="rounded-lg border border-[#e7ebf2] bg-[#fafbfd] px-3 py-2 text-[11.5px] text-[#51607a]">
              {SUGGESTION_MODE_HELP.EXCLUDE_MINMAX}
            </p>
          )}
        </div>

        {/* Kart 2 — Aile Operasyon Paneli (sekmeler) */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ['work', 'Operasyon', null],
            ['history', `Olusturulan Siparisler (${createdOrderHistory.length.toLocaleString('tr-TR')})`, null],
            ['operationHistory', 'Islem Gecmisi', null],
          ] as Array<['work' | 'history' | 'operationHistory', string, null]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrderPanelTab(key)}
              className={
                orderPanelTab === key
                  ? 'rounded-lg bg-[#15356b] text-white text-[12.5px] font-semibold px-4 h-9'
                  : 'rounded-lg bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa] text-[12.5px] font-medium px-4 h-9'
              }
            >
              {label}
            </button>
          ))}
        </div>

        {orderPanelTab === 'history' ? (
          renderCreatedOrderHistoryPanel()
        ) : orderPanelTab === 'operationHistory' ? (
          renderOperationHistoryPanel()
        ) : (
          <>
            {/* Aile yonetimine git + ozet aksiyon */}
            <div className={`${CARD} flex flex-wrap items-center justify-between gap-2 p-3`}>
              <p className="text-[12.5px] text-[#51607a]">Aile olusturma ve urun ekleme islemleri ayri ekrana tasindi.</p>
              <Link href="/reports/product-families" className={btnSmTint}>Aile Yonetimine Git</Link>
            </div>

            <div className={`${CARD} grid grid-cols-1 md:grid-cols-4 gap-3 items-center p-3`}>
              <div>
                <p className="text-[11px] text-[#8b97ac]">Aile Sayisi</p>
                <p className="text-[14px] font-semibold text-[#14223b]">{familySuggestionsFiltered.length.toLocaleString('tr-TR')}</p>
              </div>
              <button type="button" className={btnPrimary + ' justify-center'} onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </button>
              <button type="button" className={btnGhost + ' justify-center'} onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
                <Truck width={15} height={15} />
                {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi'}
              </button>
              <button type="button" className={btnGhost + ' justify-center'} onClick={loadFamilies} disabled={familyLoading}>
                <RefreshCw width={15} height={15} className={familyLoading ? 'animate-spin' : ''} />
                {familyLoading ? 'Yenileniyor...' : 'Aileleri Yenile'}
              </button>
            </div>

            {/* Fiyatsiz stok uyarisi (pembe) */}
            {missingPriceProducts.length > 0 && (
              <div className="rounded-xl border border-pink-200 bg-[#fdf2f8] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle width={15} height={15} className="mt-0.5 flex-none text-[#be185d]" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#9d174d]">
                        Fiyati olmayan stoklar var ({missingPriceProducts.length.toLocaleString('tr-TR')})
                      </p>
                      <p className="mt-1 text-[11.5px] text-[#9d174d]">
                        Bu satirlar pembe isaretlendi. Fiyat girilmeden tedarikci siparisi modalina gecilmeyecek.
                      </p>
                    </div>
                  </div>
                  <button type="button" className={btnSmGhost} onClick={() => setMissingPriceProducts([])}>Uyariyi Temizle</button>
                </div>
                <div className="mt-2 max-h-28 overflow-auto rounded-lg border border-pink-200 bg-white">
                  {missingPriceProducts.map((item) => (
                    <div key={item.productCode} className="flex items-center justify-between gap-3 border-b border-pink-100 px-2 py-1 text-[11px]">
                      <span className="font-semibold text-[#9d174d] font-mono">{item.productCode}</span>
                      <span className="min-w-0 flex-1 truncate text-[#51607a]">{item.productName}</span>
                      <span className="text-[#8b97ac]">Miktar: {item.quantity.toLocaleString('tr-TR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Son olusturulan siparisler (emerald) */}
            {lastCreatedOrders.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11.5px] font-semibold text-[#047857] mb-2">
                  Son olusturulan siparisler: {lastCreatedOrders.length.toLocaleString('tr-TR')}
                </p>
                <button type="button" className={btnSmGhost} onClick={() => setCreatedOrdersModalOpen(true)}>PDF Indirme Penceresini Ac</button>
              </div>
            )}

            {/* Aileler + aktif aile paneli (sidebar yerine akis korunarak) */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef1f6]">
                <span className="text-[13px] font-semibold text-[#14223b]">Aileler</span>
              </div>
              <div className="p-3">
                <div className="relative mb-2.5">
                  <Search width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa6b8]" />
                  <input
                    type="text"
                    value={familyListSearch}
                    onChange={(e) => setFamilyListSearch(e.target.value)}
                    className={inputCls + ' w-full pl-8'}
                    placeholder="Aile ara (ad/kod)"
                  />
                </div>
                <div className="space-y-2">
                  {familySuggestionsFiltered.length === 0 && (
                    <p className="text-[12px] text-[#8b97ac]">Tanimli aile yok.</p>
                  )}
                  {suggestedFamilies.map((family) => {
                    const hasOrderRedirect = Boolean((family.redirectSuggestions || []).some((item) => item.type === 'ORDER'));
                    return (
                      <Fragment key={family.id}>
                        {renderFamilyCard(family, hasOrderRedirect)}
                        {activeFamilyId === family.id && renderActiveFamilyPanel()}
                      </Fragment>
                    );
                  })}
                  {unsuggestedFamilies.length > 0 && (
                    <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-2">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]"
                        onClick={() => setShowUnsuggestedFamilies((prev) => !prev)}
                      >
                        <span>Onerisiz Aileler ({unsuggestedFamilies.length.toLocaleString('tr-TR')})</span>
                        <ChevronDown width={14} height={14} className={`transition-transform ${showUnsuggestedFamilies ? 'rotate-180' : ''}`} />
                      </button>
                      {showUnsuggestedFamilies && (
                        <div className="mt-2 space-y-2">
                          {unsuggestedFamilies.map((family) => (
                            <Fragment key={family.id}>
                              {renderFamilyCard(family, false)}
                              {activeFamilyId === family.id && renderActiveFamilyPanel()}
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {familyLoading && <p className="text-[12.5px] text-[#8b97ac]">Aileler yukleniyor...</p>}
            {!familyLoading && !activeFamily && families.length > 0 && (
              <p className="text-[12.5px] text-[#8b97ac]">Aile detayi acmak icin listeden "Detayi Ac" kullanin.</p>
            )}

            {/* Aile Disi Oneriler */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-[#eef1f6]">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#14223b]">Aile Disi Oneriler</p>
                  <p className="text-[11.5px] text-[#8b97ac]">Ailelere dahil olmayan ancak siparise donusturulebilen urunler.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search width={14} height={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa6b8]" />
                    <input
                      type="text"
                      value={nonFamilySearch}
                      onChange={(e) => setNonFamilySearch(e.target.value)}
                      className={inputCls + ' pl-8 h-8 w-48'}
                      placeholder="Urun ara..."
                    />
                  </div>
                  <select value={nonFamilyColorFilter} onChange={(e) => setNonFamilyColorFilter(e.target.value as NonFamilyColorFilter)} className={selCls + ' h-8'}>
                    <option value="ALL">Renk: Tum</option>
                    <option value="GREEN">Renk: Yesil</option>
                    <option value="YELLOW">Renk: Sari</option>
                    <option value="RED">Renk: Kirmizi</option>
                    <option value="UNCOLORED">Renk: Renksiz</option>
                  </select>
                  <select value={nonFamilyColorSort} onChange={(e) => setNonFamilyColorSort(e.target.value as NonFamilyColorSort)} className={selCls + ' h-8'}>
                    <option value="NONE">Renk Sirala: Kapali</option>
                    <option value="RISK_DESC">Renk Sirala: Yuksek Risk</option>
                    <option value="RISK_ASC">Renk Sirala: Dusuk Risk</option>
                  </select>
                  <span className="text-[12px] text-[#51607a]">Kalem: <strong className="text-[#14223b]">{filteredNonFamilyRows.length.toLocaleString('tr-TR')}</strong></span>
                </div>
              </div>
              {/* Triyaj seridi: A -> B -> C (varsayilan siralama da bu sirayla) */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[#eef1f6] px-4 py-2.5">
                {(['ALL', 'A', 'B', 'C'] as SuggestionTriageFilter[]).map((filterKey) => {
                  const active = nonFamilyTriageFilter === filterKey;
                  const bucket = filterKey === 'ALL' ? null : nonFamilyTriageSummary[filterKey];
                  const label =
                    filterKey === 'ALL'
                      ? 'Tumu'
                      : `${filterKey} · ${TRIAGE_LABELS[filterKey as SuggestionTriageClass]}`;
                  return (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setNonFamilyTriageFilter(filterKey)}
                      className={
                        active
                          ? 'rounded-lg bg-[#15356b] px-3 py-1.5 text-[11px] font-semibold text-white'
                          : 'rounded-lg border border-[#d8e0ec] bg-white px-3 py-1.5 text-[11px] font-medium text-[#51607a] hover:bg-[#f4f6fa]'
                      }
                      title={
                        bucket
                          ? `Oneri: ${bucket.totalQty.toLocaleString('tr-TR')} adet / ${formatPdfMoney(bucket.totalAmount)} (KDV haric)`
                          : 'Tum siniflar'
                      }
                    >
                      {label}
                      {bucket && (
                        <span className="ml-1.5 font-normal">
                          ({bucket.count.toLocaleString('tr-TR')} kalem · {formatPdfMoney(bucket.totalAmount)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[62vh]">
                <table className="w-max min-w-[2200px] text-[11px]">
                  <thead className="bg-[#f8fafc] sticky top-0 z-20">
                    <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                      <th
                        className="px-2 py-2.5 text-center sticky left-0 top-0 z-30 bg-[#f8fafc] shadow-[2px_0_0_0_#eef1f6] cursor-pointer"
                        style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'color'))}
                      >
                        Sec{sortIndicator(nonFamilySort, 'color')}
                      </th>
                      <th
                        className="px-2 py-2.5 text-left sticky top-0 z-30 bg-[#f8fafc] cursor-pointer"
                        style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'code'))}
                      >
                        Stok Kodu{sortIndicator(nonFamilySort, 'code')}
                      </th>
                      <th
                        className="px-2 py-2.5 text-left sticky top-0 z-30 bg-[#f8fafc] shadow-[2px_0_0_0_#eef1f6] cursor-pointer"
                        style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'name'))}
                      >
                        Urun Adi{sortIndicator(nonFamilySort, 'name')}
                      </th>
                      <th className="px-2 py-2.5 text-left" title="A = musteri bekliyor, B = yakinda bekleyecek, C = min-max tamamlama">Sinif</th>
                      <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(nonFamilySort, 'supplierCode')}</th>
                      <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(nonFamilySort, 'supplierName')}</th>
                      <th className="px-2 py-2.5 text-center">Ana Saglayici</th>
                      <th className="px-2 py-2.5 text-center">Kalici Degistir</th>
                      <th className="px-2 py-2.5 text-center">MinMax Hesaplanmasin</th>
                      {panelColumns.depotQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(nonFamilySort, 'depotQty')}</th>}
                      {panelColumns.topcaDepotQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(nonFamilySort, 'topcaDepotQty')}</th>}
                      {panelColumns.incomingOrders && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(nonFamilySort, 'incomingOrders')}</th>}
                      {panelColumns.outgoingOrders && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(nonFamilySort, 'outgoingOrders')}</th>}
                      {panelColumns.realQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(nonFamilySort, 'realQty')}</th>}
                      {panelColumns.minQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(nonFamilySort, 'minQty')}</th>}
                      {panelColumns.maxQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(nonFamilySort, 'maxQty')}</th>}
                      {panelColumns.stockDays && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'stockDays'))} title="Depo miktari / son 120 gun gunluk ortalama satis">Stok Gunu{sortIndicator(nonFamilySort, 'stockDays')}</th>}
                      {panelColumns.packQty && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(nonFamilySort, 'packQty')}</th>}
                      {panelColumns.costExVat && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(nonFamilySort, 'costExVat')}</th>}
                      {panelColumns.costIncVat && <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(nonFamilySort, 'costIncVat')}</th>}
                      {panelColumns.currentCost && <th className="px-2 py-2.5 text-right">Maliyet P/T</th>}
                      <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'suggested'))}>Oneri{sortIndicator(nonFamilySort, 'suggested')}</th>
                      <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(nonFamilySort, 'allocation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNonFamilyRows.length === 0 && (
                      <tr>
                        <td colSpan={20} className="px-2 py-4 text-center text-[#8b97ac]">Aile disi onerili urun yok.</td>
                      </tr>
                    )}
                    {filteredNonFamilyRows.map((item) => {
                      const row = item.row;
                      const code = item.code;
                      const suggested = item.suggested;
                      const rawAllocated = nonFamilyAllocations[code];
                      const allocated = rawAllocated === '' || rawAllocated === undefined ? '' : item.allocation;
                      const hasMissingPrice = missingPriceCodeSet.has(code);
                      return (
                        <tr key={code} className={`border-t border-[#f1f4f9] text-[#14223b] ${hasMissingPrice ? 'bg-pink-200' : getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                          <td
                            className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_#eef1f6] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                          >
                            <input
                              type="checkbox"
                              className="accent-[#15356b]"
                              checked={Boolean(selectedTransferByCode[code])}
                              onChange={(e) => setSelectedTransferByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                            />
                          </td>
                          <td
                            className={`px-2 py-2 font-semibold sticky z-20 ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-mono">{code}</span>
                              <div className="flex flex-wrap items-center gap-1">
                                <button type="button" className={btnSmTint + ' !px-1.5 !py-0.5 !text-[9px]'} onClick={() => openSalesHistoryModal(code, 'minmax')} title="Satis MinMax detaylarini goster">
                                  Satis (MinMax)
                                </button>
                                <button type="button" className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100" onClick={() => openSalesHistoryModal(code, 'recentCustomers')} title="Son alinan carileri ve alis detaylarini goster">
                                  Son Alinan Cariler
                                </button>
                              </div>
                            </div>
                          </td>
                          <td
                            className={`px-2 py-2 text-[#51607a] sticky z-20 shadow-[2px_0_0_0_#eef1f6] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                          >
                            {productNameColumn ? normalizeValue(row?.[productNameColumn]) : '-'}
                          </td>
                          <td className="px-2 py-2">{renderTriageBadge(item.triage, item.incomingQty)}</td>
                          <td className="px-2 py-2">
                            <input
                              list="ucarer-supplier-cari-list"
                              value={getEffectiveSupplierCode(code)}
                              onChange={(e) => setSupplierOverrideByCode((prev) => ({ ...prev, [code]: String(e.target.value || '').trim().toUpperCase() }))}
                              className="w-32 rounded-md border border-[#d8e0ec] px-2 py-1 text-[11px] uppercase outline-none focus:border-[#15356b]"
                              placeholder="Cari kodu"
                            />
                          </td>
                          <td className="px-2 py-2 text-[#51607a]">{getEffectiveSupplierName(code)}</td>
                          <td className="px-2 py-2 text-center">
                            <button type="button" className={btnSmGhost} onClick={() => updateMainSupplier(code)} disabled={Boolean(updatingSupplierByCode[code])}>
                              {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="accent-[#15356b]"
                              checked={Boolean(persistSupplierOverrideByCode[code])}
                              onChange={(e) => setPersistSupplierOverrideByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <label className="inline-flex items-center gap-1 text-[10px] text-[#8b97ac]">
                                <input
                                  type="checkbox"
                                  className="accent-[#15356b]"
                                  checked={Boolean(resetMinMaxToZeroByCode[code])}
                                  onChange={(e) => setResetMinMaxToZeroByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                                  disabled={minMaxExcludedCodeSet.has(code)}
                                />
                                0-0
                              </label>
                              <button type="button" className={btnSmGhost} onClick={() => setMinMaxExclusion(code, !minMaxExcludedCodeSet.has(code))} disabled={Boolean(updatingMinMaxExclusionByCode[code])}>
                                {updatingMinMaxExclusionByCode[code] ? '...' : minMaxExcludedCodeSet.has(code) ? 'MinMax Hesaplansin' : 'MinMax Hesaplanmasin'}
                              </button>
                            </div>
                          </td>
                          {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                          {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                          {panelColumns.incomingOrders && (
                            <td className="px-2 py-2 text-right cursor-pointer text-[#15356b] hover:underline" onClick={() => openIncomingOrdersModal(code)} title="Alinan siparis detaylarini goster">
                              {getExtraColumnValue(row || {}, code, 'incomingOrders')}
                            </td>
                          )}
                          {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right text-[#b45309] font-semibold">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                          {panelColumns.realQty && <td className="px-2 py-2 text-right font-semibold">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                          {panelColumns.minQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                          {panelColumns.maxQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                          {panelColumns.stockDays && <td className="px-2 py-2 text-right">{renderStockDaysBadge(row)}</td>}
                          {panelColumns.packQty && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                          {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                          {panelColumns.costIncVat && <td className="px-2 py-2 text-right text-[#51607a]">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
                          {panelColumns.currentCost && (
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costPInputByCode[code] ?? ''}
                                  onChange={(e) => {
                                    const rawValue = e.target.value;
                                    setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                                    if (manualCostPOverrideByCode[code]) return;
                                    const parsed = Number(String(rawValue || '').replace(',', '.'));
                                    if (!Number.isFinite(parsed)) return;
                                    const vatRate = Number(vatRateByCode[code] ?? 0);
                                    const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                    const autoCostP = parsed * (1 + vatPercent / 200);
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: Number.isFinite(autoCostP) ? autoCostP.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                    }));
                                  }}
                                  className="w-20 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b]"
                                  title="Maliyet T"
                                  placeholder="T"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costTInputByCode[code] ?? ''}
                                  onChange={(e) => {
                                    setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                    setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                                  }}
                                  className="w-20 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b]"
                                  title="Maliyet P"
                                  placeholder="P"
                                />
                                <span className="text-[10px] text-[#8b97ac]">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                                <label className="inline-flex items-center gap-1 text-[10px] text-[#8b97ac]">
                                  <input
                                    type="checkbox"
                                    className="accent-[#15356b]"
                                    checked={h.isPriceListUpdateChecked(code)}
                                    onChange={(e) => h.setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                                  />
                                  10 liste
                                </label>
                                <button type="button" className={btnSmGhost} onClick={() => updateProductCost(code)} disabled={Boolean(updatingCostByCode[code])}>
                                  {updatingCostByCode[code] ? '...' : 'Guncelle'}
                                </button>
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-2 text-right font-semibold text-[#047857] cursor-pointer" title="Dagitima kopyala" onClick={() => setNonFamilyAllocations((prev) => ({ ...prev, [code]: Math.max(0, Math.trunc(suggested)) }))}>{suggested.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={allocated}
                              onChange={(e) =>
                                setNonFamilyAllocations((prev) => ({
                                  ...prev,
                                  [code]: e.target.value === '' ? '' : Math.max(0, Math.trunc(Number(e.target.value || 0))),
                                }))
                              }
                              className="w-24 rounded-md border border-[#d8e0ec] px-2 py-1 text-right outline-none focus:border-[#15356b]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <datalist id="ucarer-supplier-cari-list">
              {cariOptions.map((cari) => (
                <option key={cari.code} value={cari.code}>{cari.name}</option>
              ))}
            </datalist>
          </>
        )}
      </div>

      {/* Alt sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#e7ebf2] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={btnGhost} onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
              <Truck width={15} height={15} />
              {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi Siparis Olustur'}
            </button>
            <button type="button" className={btnPrimary} onClick={createSupplierOrders} disabled={creatingOrders}>
              {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
            </button>
          </div>
        </div>
      </div>

      {/* Aileyi Duzenle modal */}
      {familyEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#14223b]">Aileyi Duzenle</p>
              <button type="button" className="text-[#9aa6b8] hover:text-[#51607a]" onClick={closeFamilyEditModal} aria-label="Kapat"><X width={18} height={18} /></button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#51607a]">Aile Adi</label>
                <Input value={familyEditName} onChange={(e) => setFamilyEditName(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#51607a]">Aile Kodu</label>
                <Input value={familyEditCode} onChange={(e) => setFamilyEditCode(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-[#51607a]">Not</label>
                <Input value={familyEditNote} onChange={(e) => setFamilyEditNote(e.target.value)} className="h-9 text-xs" />
              </div>
              <label className="inline-flex items-center gap-2 text-[12px] text-[#51607a]">
                <input type="checkbox" className="accent-[#15356b]" checked={familyEditActive} onChange={(e) => setFamilyEditActive(e.target.checked)} />
                Aktif
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-[#e7ebf2] p-3">
              <p className="text-[11px] font-semibold text-[#51607a]">Aileye Urun Ekle/Cikar</p>
              <Input
                value={familyEditSearch}
                onChange={(e) => setFamilyEditSearch(e.target.value)}
                placeholder="Stok kodu veya adi yazin..."
                className="mt-2 h-9 text-xs"
              />
              {familyEditSearching && <p className="mt-2 text-[11.5px] text-[#8b97ac]">Araniyor...</p>}
              {!familyEditSearching && familyEditSearch.trim().length >= 2 && familyEditResults.length === 0 && (
                <p className="mt-2 text-[11.5px] text-[#8b97ac]">Sonuc bulunamadi.</p>
              )}
              {!familyEditSearching && familyEditResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-[#e7ebf2]">
                  {familyEditResults.map((item) => (
                    <button
                      key={`${item.productCode}-${item.productName}`}
                      type="button"
                      className="flex w-full items-center justify-between border-b border-[#f1f4f9] px-2 py-1.5 text-left text-[11.5px] hover:bg-[#fafbfd]"
                      onClick={() => addProductCodeToFamilyEdit(item.productCode, item.productName)}
                    >
                      <span><span className="font-mono">{item.productCode}</span> - {item.productName || '-'}</span>
                      <span className="text-[#15356b] font-semibold">Ekle</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-[#e7ebf2]">
                {familyEditProductCodes.length === 0 ? (
                  <p className="px-2 py-3 text-[11.5px] text-[#8b97ac]">Henuz urun secilmedi.</p>
                ) : (
                  familyEditProductCodes.map((code) => (
                    <div key={code} className="flex items-center justify-between border-b border-[#f1f4f9] px-2 py-1.5 text-[11.5px]">
                      <span className="min-w-0 truncate" title={getFamilyEditProductLabel(code)}>{getFamilyEditProductLabel(code)}</span>
                      <button type="button" className={btnSmGhost} onClick={() => removeProductCodeFromFamilyEdit(code)}>Cikar</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnSmGhost} onClick={closeFamilyEditModal}>Iptal</button>
              <button type="button" className={btnSmPrimary} onClick={saveFamilyEdit} disabled={familyEditSaving}>
                {familyEditSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Olusturulan Siparis PDF modal */}
      {createdOrdersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#14223b]">Olusturulan Siparis PDF Indirme</p>
              <button type="button" className="text-[#9aa6b8] hover:text-[#51607a]" onClick={() => setCreatedOrdersModalOpen(false)} aria-label="Kapat"><X width={18} height={18} /></button>
            </div>
            <p className="mt-1 text-[11.5px] text-[#8b97ac]">Olusan siparisleri tek tek ya da yonetici onay ozeti olarak indirebilirsiniz.</p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button type="button" className={btnGhost + ' justify-center'} onClick={() => downloadCreatedOrderPdfs()} disabled={downloadingOrderPdfs}>
                <FileText width={15} height={15} />
                {downloadingOrderPdfs ? 'Hazirlaniyor...' : 'Tum Siparisleri PDF (tek tek)'}
              </button>
              <button type="button" className={btnGhost + ' justify-center'} onClick={() => downloadCreatedOrdersSummaryPdf()} disabled={downloadingOrderSummaryPdf}>
                <ClipboardList width={15} height={15} />
                {downloadingOrderSummaryPdf ? 'Hazirlaniyor...' : 'Yonetici Onay Ozeti (tek PDF)'}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className={btnSmGhost} onClick={() => setCreatedOrdersModalOpen(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Alinan Siparis Detayi modal */}
      {incomingOrdersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#14223b]">Alinan Siparis Detayi - <span className="font-mono">{incomingOrdersProductCode || '-'}</span></p>
              <button type="button" className="text-[#9aa6b8] hover:text-[#51607a]" onClick={() => setIncomingOrdersModalOpen(false)} aria-label="Kapat"><X width={18} height={18} /></button>
            </div>
            <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-[#e7ebf2]">
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-[#f8fafc]">
                  <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                    <th className="px-2 py-2.5 text-left">Cari Kodu</th>
                    <th className="px-2 py-2.5 text-left">Cari Unvan</th>
                    <th className="px-2 py-2.5 text-left">Siparis No</th>
                    <th className="px-2 py-2.5 text-right">Siparis Miktari</th>
                    <th className="px-2 py-2.5 text-right">Teslim</th>
                    <th className="px-2 py-2.5 text-right">Kalan</th>
                    <th className="px-2 py-2.5 text-right">Birim Fiyat</th>
                    <th className="px-2 py-2.5 text-left">Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingOrdersLoading ? (
                    <tr><td colSpan={8} className="px-2 py-6 text-center text-[#8b97ac]">Yukleniyor...</td></tr>
                  ) : incomingOrdersDetailRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-2 py-6 text-center text-[#8b97ac]">Detay bulunamadi.</td></tr>
                  ) : (
                    incomingOrdersDetailRows.map((row, index) => (
                      <tr key={`${row.orderSeries}-${row.orderSequence}-${row.orderLineNo}-${index}`} className="border-t border-[#f1f4f9] text-[#14223b]">
                        <td className="px-2 py-2 font-mono">{row.customerCode}</td>
                        <td className="px-2 py-2">{row.customerName}</td>
                        <td className="px-2 py-2 font-mono">{row.orderSeries}-{row.orderSequence}</td>
                        <td className="px-2 py-2 text-right">{row.quantity.toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-right">{row.deliveredQuantity.toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-right font-semibold">{row.remainingQuantity.toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-right">{Number(row.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</td>
                        <td className="px-2 py-2">{row.orderDate ? new Date(row.orderDate).toLocaleDateString('tr-TR') : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className={btnSmGhost} onClick={() => setIncomingOrdersModalOpen(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Satis (MinMax) / Son Alinan Cariler modal */}
      {salesHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-6xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#14223b]">
                {salesHistoryViewMode === 'recentCustomers' ? 'Son Alinan Cariler' : 'Satis (MinMax)'} - Son {salesHistoryLookbackMonths} Ay {salesHistoryViewMode === 'recentCustomers' ? 'Alis' : 'Satis'} Detayi - <span className="font-mono">{salesHistoryProductCode || '-'}</span>
              </p>
              <button type="button" className="text-[#9aa6b8] hover:text-[#51607a]" onClick={() => setSalesHistoryModalOpen(false)} aria-label="Kapat"><X width={18} height={18} /></button>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-[11.5px] text-[#51607a]">
              <span>Toplam Miktar: <strong className="text-[#14223b]">{salesHistorySummary.totalQuantity.toLocaleString('tr-TR')}</strong></span>
              <span>Toplam Tutar: <strong className="text-[#14223b]">{salesHistorySummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</strong></span>
              <span>Ortalama Birim: <strong className="text-[#14223b]">{salesHistorySummary.averageUnitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</strong></span>
            </div>
            <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-[#e7ebf2]">
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-[#f8fafc]">
                  <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                    <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'customerCode'))}>Cari Kodu{salesSortIndicator('customerCode')}</th>
                    <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'customerName'))}>Cari Unvan{salesSortIndicator('customerName')}</th>
                    <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'documentNo'))}>Evrak No{salesSortIndicator('documentNo')}</th>
                    <th className="px-2 py-2.5 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'saleDate'))}>Tarih{salesSortIndicator('saleDate')}</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'quantity'))}>Miktar{salesSortIndicator('quantity')}</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'unitPrice'))}>Birim Fiyat (TL){salesSortIndicator('unitPrice')}</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'totalAmount'))}>Tutar (TL){salesSortIndicator('totalAmount')}</th>
                    <th className="px-2 py-2.5 text-left">Srm</th>
                    {salesHistoryViewMode === 'minmax' && <th className="px-2 py-2.5 text-left">Islem</th>}
                  </tr>
                </thead>
                <tbody>
                  {salesHistoryLoading ? (
                    <tr><td colSpan={salesHistoryViewMode === 'minmax' ? 9 : 8} className="px-2 py-6 text-center text-[#8b97ac]">Yukleniyor...</td></tr>
                  ) : salesHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={salesHistoryViewMode === 'minmax' ? 9 : 8} className="px-2 py-6 text-center text-[#8b97ac]">
                        Son {salesHistoryLookbackMonths} ayda {salesHistoryViewMode === 'recentCustomers' ? 'alis' : 'satis'} kaydi bulunamadi.
                      </td>
                    </tr>
                  ) : (
                    salesHistoryRowsSorted.map((row, index) => {
                      const documentNo = [row.documentSeries || '-', row.documentSequence].join('-');
                      const stockSrm = String(row.stockResponsibilityCenter || '').trim().toUpperCase();
                      const lineKey = row.lineGuid || `${row.documentSeries}-${row.documentSequence}-${row.documentLineNo}-${index}`;
                      const isMarkingToplu = markingTopluLineKey === lineKey;
                      const isToplu = stockSrm === 'TOPLU';
                      return (
                        <tr key={`${row.documentSeries}-${row.documentSequence}-${row.documentLineNo}-${index}`} className="border-t border-[#f1f4f9] text-[#14223b]">
                          <td className="px-2 py-2 font-mono">{row.customerCode || '-'}</td>
                          <td className="px-2 py-2">{row.customerName || '-'}</td>
                          <td className="px-2 py-2 font-mono">{documentNo}</td>
                          <td className="px-2 py-2">{row.saleDate ? new Date(row.saleDate).toLocaleDateString('tr-TR') : '-'}</td>
                          <td className="px-2 py-2 text-right">{Number(row.quantity || 0).toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right">{Number(row.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2 text-right font-semibold">{Number(row.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded px-2 py-1 text-[10.5px] font-semibold ${isToplu ? 'bg-amber-100 text-amber-800' : 'bg-[#eef2fa] text-[#51607a]'}`}>{stockSrm || '-'}</span>
                          </td>
                          {salesHistoryViewMode === 'minmax' && (
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className={btnSmGhost}
                                disabled={!row.lineGuid || isToplu || isMarkingToplu || salesHistoryLoading}
                                onClick={() => markSalesHistoryLineAsToplu(row)}
                              >
                                {isMarkingToplu ? 'Yapiliyor...' : isToplu ? 'TOPLU' : 'Toplu yap'}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className={btnSmGhost} onClick={() => setSalesHistoryModalOpen(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Cari Bazinda Siparis Ayarlari modal */}
      {seriesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#14223b]">Cari Bazinda Siparis Ayarlari</p>
              <button type="button" className="text-[#9aa6b8] hover:text-[#51607a]" onClick={() => { if (creatingOrders) return; setSeriesModalOpen(false); }} aria-label="Kapat"><X width={18} height={18} /></button>
            </div>
            <p className="mt-1 text-[11.5px] text-[#8b97ac]">Her cari icin seri, vergili/vergisiz, teslim turu ve teslim tarihi secin.</p>
            <div className="mt-3 max-h-[55vh] overflow-auto rounded-lg border border-[#e7ebf2]">
              <table className="w-full text-[11.5px]">
                <thead className="bg-[#f8fafc]">
                  <tr className="text-[#8b97ac] uppercase text-[9.5px] font-semibold">
                    <th className="px-2 py-2.5 text-center">Detay</th>
                    <th className="px-2 py-2.5 text-left">Cari</th>
                    <th className="px-2 py-2.5 text-left">Unvan</th>
                    <th className="px-2 py-2.5 text-right">Kalem</th>
                    <th className="px-2 py-2.5 text-right">Miktar</th>
                    <th className="px-2 py-2.5 text-left">Seri</th>
                    <th className="px-2 py-2.5 text-left">Vergi</th>
                    <th className="px-2 py-2.5 text-left">Teslim Turu</th>
                    <th className="px-2 py-2.5 text-left">Teslim Tarihi</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSupplierRows.map((row) => {
                    const cfg = supplierOrderConfigs[row.supplierCode] || { series: '', applyVAT: true, deliveryType: 'D', deliveryDate: '' };
                    const detailRows = pendingSupplierItemsByCode[row.supplierCode] || [];
                    const isExpanded = Boolean(expandedSupplierRows[row.supplierCode]);
                    const recentSeries = supplierRecentSeriesByCode[row.supplierCode] || [];
                    const seriesListId = `ucarer-series-${row.supplierCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                    return (
                      <Fragment key={row.supplierCode}>
                        <tr className="border-t border-[#f1f4f9] text-[#14223b]">
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#d8e0ec] bg-white hover:bg-[#f4f6fa]"
                              onClick={() => setExpandedSupplierRows((prev) => ({ ...prev, [row.supplierCode]: !prev[row.supplierCode] }))}
                              title="Urunleri goster/gizle"
                            >
                              {isExpanded ? <ChevronDown width={13} height={13} /> : <ChevronRight width={13} height={13} />}
                            </button>
                          </td>
                          <td className="px-2 py-2 font-semibold font-mono">{row.supplierCode}</td>
                          <td className="px-2 py-2">{row.supplierName}</td>
                          <td className="px-2 py-2 text-right">{row.itemCount.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right">{row.totalQuantity.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2">
                            <input
                              list={seriesListId}
                              className="w-20 rounded-md border border-[#d8e0ec] px-2 py-1 uppercase outline-none focus:border-[#15356b]"
                              maxLength={20}
                              value={cfg.series}
                              onChange={(e) => setSupplierOrderConfigs((prev) => ({ ...prev, [row.supplierCode]: { ...cfg, series: String(e.target.value || '').toUpperCase() } }))}
                            />
                            {recentSeries.length > 0 && (
                              <datalist id={seriesListId}>
                                {recentSeries.map((item) => (
                                  <option key={`${row.supplierCode}-${item.series}`} value={item.series}>{item.lastOrderNumber}</option>
                                ))}
                              </datalist>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <label className="inline-flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="accent-[#15356b]"
                                checked={Boolean(cfg.applyVAT)}
                                onChange={(e) => setSupplierOrderConfigs((prev) => ({ ...prev, [row.supplierCode]: { ...cfg, applyVAT: e.target.checked } }))}
                              />
                              Vergili
                            </label>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              list="ucarer-delivery-type-list"
                              className="w-44 rounded-md border border-[#d8e0ec] px-2 py-1 outline-none focus:border-[#15356b]"
                              placeholder="D / B / N"
                              value={cfg.deliveryType}
                              onChange={(e) => setSupplierOrderConfigs((prev) => ({ ...prev, [row.supplierCode]: { ...cfg, deliveryType: String(e.target.value || '').trim().toUpperCase() } }))}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              className="rounded-md border border-[#d8e0ec] px-2 py-1 outline-none focus:border-[#15356b]"
                              value={cfg.deliveryDate}
                              onChange={(e) => setSupplierOrderConfigs((prev) => ({ ...prev, [row.supplierCode]: { ...cfg, deliveryDate: String(e.target.value || '') } }))}
                            />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-[#f1f4f9] bg-[#fafbfd]">
                            <td className="px-2 py-2" />
                            <td className="px-2 py-2 text-[11px] text-[#51607a]" colSpan={8}>
                              <div className="space-y-1">
                                {detailRows.map((item) => (
                                  <div
                                    key={`${row.supplierCode}-${item.productCode}`}
                                    className={`flex items-center justify-between gap-4 rounded-md border px-2 py-1.5 ${item.unitPrice > 0 ? 'border-[#e7ebf2] bg-white' : 'border-pink-200 bg-pink-50'}`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium text-[#14223b]"><span className="font-mono">{item.productCode}</span> - {item.productName}</div>
                                      <div className="text-[11px] text-[#51607a]">
                                        Miktar: <strong>{item.quantity.toLocaleString('tr-TR')}</strong>
                                        <span className="ml-2">Tutar: <strong>{formatPdfMoney(item.total)}</strong></span>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <label className="flex items-center gap-1 text-[10px] text-[#8b97ac]">
                                        Fiyat
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          className="w-24 rounded-md border border-[#d8e0ec] px-2 py-1 text-right text-[11px] outline-none focus:border-[#15356b]"
                                          value={item.unitPrice > 0 ? item.unitPrice.toFixed(4).replace(/\.?0+$/, '') : ''}
                                          onChange={(e) => setPendingPriceOverrideForProduct(item.productCode, e.target.value)}
                                          placeholder="Birim"
                                        />
                                      </label>
                                      {(() => {
                                        const productCode = String(item.productCode || '').trim().toUpperCase();
                                        const typedValue = pendingSupplierInputByProduct[productCode] ?? String(
                                          pendingAllocations.find(
                                            (alloc) => String(alloc.productCode || '').trim().toUpperCase() === productCode
                                          )?.supplierCodeOverride || row.supplierCode
                                        ).trim().toUpperCase();
                                        return (
                                          <>
                                            <input
                                              list="ucarer-supplier-cari-list"
                                              className="w-40 rounded-md border border-[#d8e0ec] px-2 py-1 text-[11px] uppercase outline-none focus:border-[#15356b]"
                                              value={typedValue}
                                              onChange={(e) => setPendingSupplierInputByProduct((prev) => ({ ...prev, [productCode]: String(e.target.value || '').toUpperCase() }))}
                                              onKeyDown={(e) => {
                                                if (e.key !== 'Enter') return;
                                                reassignPendingSupplierForProduct(row.supplierCode, item.productCode, typedValue);
                                              }}
                                            />
                                            <button type="button" className={btnSmGhost} onClick={() => reassignPendingSupplierForProduct(row.supplierCode, item.productCode, typedValue)}>Uygula</button>
                                            <label className="inline-flex items-center gap-1 text-[10px] text-[#8b97ac]">
                                              <input
                                                type="checkbox"
                                                className="accent-[#15356b]"
                                                checked={Boolean(
                                                  pendingAllocations.find(
                                                    (alloc) => String(alloc.productCode || '').trim().toUpperCase() === String(item.productCode || '').trim().toUpperCase()
                                                  )?.persistSupplierOverride
                                                )}
                                                onChange={(e) => setPendingPersistOverrideForProduct(item.productCode, e.target.checked)}
                                              />
                                              Kalici
                                            </label>
                                            <button type="button" className={btnSmGhost} onClick={() => removePendingProductFromSupplierOrder(item.productCode)}>Kaldir</button>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                ))}
                                {detailRows.length === 0 && (
                                  <div className="text-[#8b97ac]">Bu cari icin urun bulunamadi.</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="ucarer-delivery-type-list">
                <option value="D">D-Dogrudan Sevk</option>
                <option value="B">B-Bakircilar Sevk</option>
                <option value="N">N-Nama Sevk</option>
              </datalist>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className={btnSmGhost} onClick={() => { if (creatingOrders) return; setSeriesModalOpen(false); }}>Vazgec</button>
              <button type="button" className={btnSmPrimary} onClick={submitCreateSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Siparisleri Olustur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
