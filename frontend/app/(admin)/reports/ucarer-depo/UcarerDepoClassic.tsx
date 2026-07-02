'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, Download, Play, RefreshCw, Warehouse, WandSparkles } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
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
  type ProductSalesHistoryRow,
  type AllocationMode,
  type NonFamilyColorFilter,
  type NonFamilyColorSort,
  type DepotType,
  type SuggestionMode,
  type SuggestionTriageClass,
  type SuggestionTriageFilter,
} from './useUcarerDepo';

/**
 * Klasik (mevcut) gorunum. Eski page.tsx'in JSX'i BIRE BIR korunur; tum mantik useUcarerDepo'dan gelir.
 * Hicbir handler/buton/kolon/filtre/sekme/modal/satir-aksiyon/onay/AI/stok-ailesi/Mikro-yazma dusurulmemistir.
 */
export default function UcarerDepoClassic() {
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

  // 'Kalan stok gunu' rozeti: 7 gun alti kirmizi, 14 gun alti sari.
  const renderStockDaysBadge = (row?: Record<string, any>) => {
    const days = getDaysOfStock(row);
    if (days === null) return <span className="text-gray-400">-</span>;
    const dailyAvg = getDailyAverageSales(row);
    const cls =
      days < 7
        ? 'bg-red-100 text-red-700'
        : days < TRIAGE_SOON_DAYS
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';
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
        : 'bg-slate-100 text-slate-700';
    return (
      <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
        {triage} · {TRIAGE_LABELS[triage]}
        {triage === 'A' && incomingQty > 0 ? ` (${incomingQty.toLocaleString('tr-TR')})` : ''}
      </span>
    );
  };

  const renderCreatedOrderHistoryPanel = () => (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-gray-900">Olusturulan Siparis Gecmisi</p>
          <p className="text-xs text-gray-600">
            Bu tarayicida olusturulan son siparis setleri tarih/saat bazinda saklanir.
          </p>
        </div>
        {createdOrderHistory.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setCreatedOrderHistory([])}>
            Gecmisi Temizle
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {createdOrderHistory.length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
            Henuz kayitli olusturulan siparis yok.
          </div>
        ) : (
          createdOrderHistory.map((batch) => {
            const orderCount = batch.orders.length;
            const lineCount = batch.lines.length;
            const totalAmount = batch.lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
            return (
              <div key={batch.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(batch.createdAt).toLocaleString('tr-TR')} / {batch.depot}
                    </p>
                    <p className="text-xs text-gray-600">
                      Cari: {orderCount.toLocaleString('tr-TR')} / Kalem: {lineCount.toLocaleString('tr-TR')} / Tutar: {formatPdfMoney(totalAmount)}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {batch.orders.map((order) => `${order.supplierCode}: ${order.orderNumber}`).join(' | ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadCreatedOrderPdfs(batch)} disabled={downloadingOrderPdfs}>
                      Tek Tek PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadCreatedOrdersSummaryPdf(batch)} disabled={downloadingOrderSummaryPdf}>
                      Yonetici Onayi
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
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
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Ucarer Islem Gecmisi</p>
            <p className="text-xs text-gray-600">
              Maliyet, ana saglayici, aile, MinMax, TOPLU ve siparis olusturma islemleri kullanici ve tarih bazinda tutulur.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => loadUcarerOperationLogs(1)} disabled={operationLogLoading}>
            {operationLogLoading ? 'Yukleniyor...' : 'Yenile'}
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input
            value={operationLogSearch}
            onChange={(event) => setOperationLogSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void loadUcarerOperationLogs(1);
            }}
            placeholder="Stok, aile, evrak, kullanici ara"
            className="md:col-span-2"
          />
          <Select
            value={operationLogType}
            onChange={(event) => setOperationLogType(event.target.value)}
          >
            <option value="">Tum islemler</option>
            {Object.entries(OPERATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => loadUcarerOperationLogs(1)} disabled={operationLogLoading}>
            Filtrele
          </Button>
        </div>

        <div className="mt-3 overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Tarih</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Islem</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Detay</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Kullanici</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Deger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {operationLogLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">Islem gecmisi yukleniyor...</td>
                </tr>
              )}
              {!operationLogLoading && operationLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">Kayit bulunamadi.</td>
                </tr>
              )}
              {!operationLogLoading && operationLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatOperationDate(log.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{log.title}</div>
                    <div className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {OPERATION_TYPE_LABELS[log.operationType] || log.operationType}
                    </div>
                  </td>
                  <td className="min-w-[260px] px-3 py-2 text-gray-700">
                    <div>{summarizeLog(log)}</div>
                    {log.productName && <div className="mt-1 text-gray-500">{log.productName}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{log.userName || log.userId || '-'}</td>
                  <td className="max-w-[340px] px-3 py-2 font-mono text-[11px] text-gray-600">
                    {renderJsonSummary(log.newValues || log.metadata || log.previousValues)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          <span>
            Toplam {operationLogPagination.totalRecords.toLocaleString('tr-TR')} kayit / Sayfa {operationLogPagination.page.toLocaleString('tr-TR')} - {operationLogPagination.totalPages.toLocaleString('tr-TR')}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={operationLogLoading || operationLogPagination.page <= 1}
              onClick={() => setOperationLogPage((prev) => Math.max(1, prev - 1))}
            >
              Onceki
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={operationLogLoading || operationLogPagination.page >= operationLogPagination.totalPages}
              onClick={() => setOperationLogPage((prev) => Math.min(operationLogPagination.totalPages, prev + 1))}
            >
              Sonraki
            </Button>
          </div>
        </div>
      </div>
    );
  };
  const renderActiveFamilyPanel = () => {
    if (!activeFamily || !activeFamilySuggestion) return null;
    const mode = allocationModeByFamily[activeFamily.id] || 'MANUAL';
    return (
      <div
        className={`rounded-xl border bg-gradient-to-br from-white to-slate-50 p-4 space-y-4 transition-all ${
          panelHighlight ? 'ring-2 ring-emerald-400 shadow-xl' : 'shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {activeFamily.name} {activeFamily.code ? `(${activeFamily.code})` : ''}
            </p>
            <p className="text-xs text-gray-600">
              Mode gore ihtiyac ({suggestionMode === 'INCLUDE_MINMAX' ? '4. Sorun' : '3. Sorun'})
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Ihtiyac</p>
              <p className={`font-semibold ${activeFamilyNeedRaw < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {activeFamilyNeedRaw.toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Dagitim</p>
              <p className="font-semibold text-blue-700">{activeFamilyAllocated.toLocaleString('tr-TR')}</p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Kalan</p>
              <p className={`font-semibold ${activeFamilyRemaining === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {activeFamilyRemaining.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        </div>
        {Boolean(activeFamilySuggestion?.redirectSuggestions?.length) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            <strong>Yonlendirme Onerileri:</strong>
            {(activeFamilySuggestion?.redirectSuggestions || []).map((item, idx) => (
              <div
                key={`inline-redir-${idx}`}
                className={
                  item.type === 'ORDER'
                    ? 'flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900'
                    : 'flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-100 px-2 py-1 text-amber-900'
                }
              >
                <span className="min-w-0 flex-1">{item.text}</span>
                {item.type === 'ORDER' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => sendRedirectSuggestionToSales(item)}
                    disabled={sendingRedirectKey === `${activeFamily.id}:${item.sourceCode}:${item.targetCode}`}
                  >
                    {sendingRedirectKey === `${activeFamily.id}:${item.sourceCode}:${item.targetCode}` ? 'Gonderiliyor...' : 'Satisa Gonder'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border bg-white p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Operasyon Kolonlari (ac/kapat)</p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-700">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.depotQty} onChange={(e) => setPanelColumns((p) => ({ ...p, depotQty: e.target.checked }))} />
              Depo Miktari
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.topcaDepotQty} onChange={(e) => setPanelColumns((p) => ({ ...p, topcaDepotQty: e.target.checked }))} />
              Topca Depo
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.incomingOrders} onChange={(e) => setPanelColumns((p) => ({ ...p, incomingOrders: e.target.checked }))} />
              Alinan Siparis
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.outgoingOrders} onChange={(e) => setPanelColumns((p) => ({ ...p, outgoingOrders: e.target.checked }))} />
              Verilen Siparis
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.realQty} onChange={(e) => setPanelColumns((p) => ({ ...p, realQty: e.target.checked }))} />
              Reel Miktar
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.minQty} onChange={(e) => setPanelColumns((p) => ({ ...p, minQty: e.target.checked }))} />
              Min
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.maxQty} onChange={(e) => setPanelColumns((p) => ({ ...p, maxQty: e.target.checked }))} />
              Max
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.currentCost} onChange={(e) => setPanelColumns((p) => ({ ...p, currentCost: e.target.checked }))} />
              Maliyet (P/T)
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.packQty} onChange={(e) => setPanelColumns((p) => ({ ...p, packQty: e.target.checked }))} />
              Koli Ici
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.costExVat} onChange={(e) => setPanelColumns((p) => ({ ...p, costExVat: e.target.checked }))} />
              Maliyet KDV Haric
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.costIncVat} onChange={(e) => setPanelColumns((p) => ({ ...p, costIncVat: e.target.checked }))} />
              Maliyet KDV Dahil
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.stockDays} onChange={(e) => setPanelColumns((p) => ({ ...p, stockDays: e.target.checked }))} />
              Stok Gunu
            </label>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={fillActiveBySuggestions}>
              <WandSparkles className="mr-1 h-3 w-3" />
              Oneriye Gore Doldur
            </Button>
            <Button size="sm" variant="outline" onClick={splitActiveEvenly}>
              Esit Dagit
            </Button>
            <Button size="sm" variant="outline" onClick={clearActiveAllocations}>
              Sifirla
            </Button>
            <p className="text-xs text-gray-600">
              Hizli aksiyonlar manuel dagitim tablosunu otomatik doldurur.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
          <div className="lg:col-span-3">
            <p className="text-xs text-gray-600 mb-1">Dagitim Modu</p>
            <Select
              value={mode}
              onChange={(e) =>
                setAllocationModeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value as AllocationMode }))
              }
            >
              <option value="SINGLE">Tek Urun</option>
              <option value="TWO_SPLIT">Iki Urun</option>
              <option value="MANUAL">Manuel</option>
            </Select>
          </div>

          {mode === 'SINGLE' && (
            <>
              <div className="lg:col-span-5">
                <p className="text-xs text-gray-600 mb-1">Urun</p>
                <Select
                  value={singleCodeByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) =>
                    setSingleCodeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))
                  }
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode} - {item.productName || '-'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Button size="sm" className="w-full" onClick={() => applySingleAllocation(activeFamily)}>
                  Uygula
                </Button>
              </div>
            </>
          )}

          {mode === 'TWO_SPLIT' && (
            <>
              <div className="lg:col-span-3">
                <p className="text-xs text-gray-600 mb-1">Urun A</p>
                <Select
                  value={splitAByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitAByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-3">
                <p className="text-xs text-gray-600 mb-1">Urun B</p>
                <Select
                  value={splitBByFamily[activeFamily.id] || activeFamilyItems[1]?.productCode || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitBByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-2">
                <p className="text-xs text-gray-600 mb-1">A Orani %{splitRatioByFamily[activeFamily.id] ?? 50}</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={splitRatioByFamily[activeFamily.id] ?? 50}
                  onChange={(e) =>
                    setSplitRatioByFamily((prev) => ({ ...prev, [activeFamily.id]: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>
              <div className="lg:col-span-1">
                <Button size="sm" className="w-full" onClick={() => applySplitAllocation(activeFamily)}>
                  Uygula
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-md border bg-white p-2">
          <input
            type="text"
            value={familyDetailSearch}
            onChange={(e) => setFamilyDetailSearch(e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            placeholder="Aile detayinda ara (stok kodu/adi/saglayici)"
          />
        </div>

        <div className="overflow-x-auto overflow-y-auto rounded border bg-white max-h-[62vh]">
          <table className="w-max min-w-[2200px] text-[11px]">
            <thead className="bg-gray-100 sticky top-0 z-20">
              <tr>
                <th
                  className="px-2 py-2 text-center sticky left-0 top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                  style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'color'))}
                >
                  Sec{sortIndicator(familySort, 'color')}
                </th>
                <th
                  className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 cursor-pointer"
                  style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'code'))}
                >
                  Stok Kodu{sortIndicator(familySort, 'code')}
                </th>
                <th
                  className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                  style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'name'))}
                >
                  Urun Adi{sortIndicator(familySort, 'name')}
                </th>
                <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(familySort, 'supplierCode')}</th>
                <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(familySort, 'supplierName')}</th>
                <th className="px-2 py-2 text-center">Ana Saglayici</th>
                <th className="px-2 py-2 text-center">Kalici Degistir</th>
                <th className="px-2 py-2 text-center">MinMax Hesaplanmasin</th>
                {panelColumns.depotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(familySort, 'depotQty')}</th>}
                {panelColumns.topcaDepotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(familySort, 'topcaDepotQty')}</th>}
                {panelColumns.incomingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(familySort, 'incomingOrders')}</th>}
                {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(familySort, 'outgoingOrders')}</th>}
                {panelColumns.realQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(familySort, 'realQty')}</th>}
                {panelColumns.minQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(familySort, 'minQty')}</th>}
                {panelColumns.maxQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(familySort, 'maxQty')}</th>}
                {panelColumns.stockDays && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'stockDays'))} title="Depo miktari / son 120 gun gunluk ortalama satis">Stok Gunu{sortIndicator(familySort, 'stockDays')}</th>}
                {panelColumns.packQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(familySort, 'packQty')}</th>}
                {panelColumns.costExVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(familySort, 'costExVat')}</th>}
                {panelColumns.costIncVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(familySort, 'costIncVat')}</th>}
                {panelColumns.currentCost && <th className="px-2 py-2 text-right">Maliyet P/T</th>}
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'suggested'))}>Aile Oneri{sortIndicator(familySort, 'suggested')}</th>
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(familySort, 'allocation')}</th>
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'diff'))}>Fark{sortIndicator(familySort, 'diff')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredActiveFamilyRows.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
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
                  <tr key={item.id} className={`border-t ${hasMissingPrice ? 'bg-pink-200' : getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                    <td
                      className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTransferByCode[code])}
                        onChange={(e) =>
                          setSelectedTransferByCode((prev) => ({
                            ...prev,
                            [code]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td
                      className={`px-2 py-2 font-semibold text-gray-900 sticky z-20 ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                    >
                      <div className="flex flex-col gap-1">
                        <span>{item.productCode}</span>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            className="w-fit rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
                            onClick={() => openSalesHistoryModal(code, 'minmax')}
                            title="Satis MinMax detaylarini goster"
                          >
                            Satis (MinMax)
                          </button>
                          <button
                            type="button"
                            className="w-fit rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                            onClick={() => openSalesHistoryModal(code, 'recentCustomers')}
                            title="Son alinan carileri ve alis detaylarini goster"
                          >
                            Son Alinan Cariler
                          </button>
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-2 py-2 text-gray-700 sticky z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                    >
                      {item.productName || '-'}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        list="ucarer-supplier-cari-list"
                        value={getEffectiveSupplierCode(code)}
                        onChange={(e) =>
                          setSupplierOverrideByCode((prev) => ({
                            ...prev,
                            [code]: String(e.target.value || '').trim().toUpperCase(),
                          }))
                        }
                        className="w-32 rounded border px-2 py-1 text-xs uppercase"
                        placeholder="Cari kodu"
                      />
                    </td>
                    <td className="px-2 py-2 text-gray-600">{getEffectiveSupplierName(code)}</td>
                    <td className="px-2 py-2 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateMainSupplier(code)}
                        disabled={Boolean(updatingSupplierByCode[code])}
                      >
                        {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                      </Button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(persistSupplierOverrideByCode[code])}
                        onChange={(e) =>
                          setPersistSupplierOverrideByCode((prev) => ({
                            ...prev,
                            [code]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        const isExcluded = minMaxExcludedCodeSet.has(code);
                        return (
                      <div className="flex items-center justify-center gap-2">
                        <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                          <input
                            type="checkbox"
                            checked={Boolean(resetMinMaxToZeroByCode[code])}
                            onChange={(e) =>
                              setResetMinMaxToZeroByCode((prev) => ({
                                ...prev,
                                [code]: e.target.checked,
                              }))
                            }
                            disabled={isExcluded}
                          />
                          0-0
                        </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMinMaxExclusion(code, !isExcluded)}
                        disabled={Boolean(updatingMinMaxExclusionByCode[code])}
                      >
                        {updatingMinMaxExclusionByCode[code]
                          ? '...'
                          : isExcluded
                          ? 'MinMax Hesaplansin'
                          : 'MinMax Hesaplanmasin'}
                      </Button>
                      </div>
                        );
                      })()}
                    </td>
                    {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                    {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                    {panelColumns.incomingOrders && (
                      <td
                        className="px-2 py-2 text-right cursor-pointer hover:underline"
                        onClick={() => openIncomingOrdersModal(code)}
                        title="Alinan siparis detaylarini goster"
                      >
                        {getExtraColumnValue(row || {}, code, 'incomingOrders')}
                      </td>
                    )}
                    {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                    {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                    {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                    {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                    {panelColumns.stockDays && <td className="px-2 py-2 text-right">{renderStockDaysBadge(row)}</td>}
                    {panelColumns.packQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                    {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                    {panelColumns.costIncVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
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
                              setCostPInputByCode((prev) => ({
                                ...prev,
                                [code]: rawValue,
                              }));
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
                            className="w-20 rounded border px-2 py-1 text-right"
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
                              setCostTInputByCode((prev) => ({
                                ...prev,
                                [code]: e.target.value,
                              }));
                            }}
                            className="w-20 rounded border px-2 py-1 text-right"
                            title="Maliyet P"
                            placeholder="P"
                          />
                          <span className="text-[10px] text-gray-600">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                          <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={h.isPriceListUpdateChecked(code)}
                              onChange={(e) =>
                                h.setUpdatePriceListsByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                            10 liste
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateProductCost(code)}
                            disabled={Boolean(updatingCostByCode[code])}
                          >
                            {updatingCostByCode[code] ? '...' : 'Guncelle'}
                          </Button>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2 text-right text-emerald-700 font-semibold cursor-pointer" title="Dagitima kopyala" onClick={() => setManualAllocation(activeFamily.id, code, Math.max(0, Math.trunc(itemNeed)))}>{itemNeed.toLocaleString('tr-TR')}</td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={allocation}
                        onChange={(e) => setManualAllocation(activeFamily.id, code, Number(e.target.value))}
                        className="w-24 rounded border px-2 py-1 text-right"
                        disabled={mode !== 'MANUAL'}
                      />
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 pb-28 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ucarer Depo ve MinMax Modulu</h1>
              <p className="text-sm text-gray-600">Mikro SQL raporlarinin B2B icinde calistirilan surumu</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Ucarer Depo Karar Raporu
            </CardTitle>
            <CardDescription>Merkez veya Topca depo secip raporu getir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={depot} onChange={(e) => setDepot(e.target.value as DepotType)} className="w-40">
                <option value="MERKEZ">MERKEZ</option>
                <option value="TOPCA">TOPCA</option>
              </Select>
              <Select value={depotLimit} onChange={(e) => setDepotLimit(e.target.value)} className="w-48">
                <option value="500">Ilk 500 satir</option>
                <option value="1000">Ilk 1000 satir</option>
                <option value="2000">Ilk 2000 satir</option>
                <option value="5000">Ilk 5000 satir</option>
                <option value="ALL">Tum satirlar</option>
              </Select>
              <Button onClick={loadDepotReport} disabled={depotLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${depotLoading ? 'animate-spin' : ''}`} />
                Raporu Getir
              </Button>
              <Button variant="outline" onClick={exportDepot} disabled={exportingDepot || depotRows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {exportingDepot ? 'Hazirlaniyor...' : "Excel'e Aktar"}
              </Button>
              <Link href="/reports/ucarer-minmax-exclusions">
                <Button variant="outline">MinMax Hesaplanmayacaklar Raporu</Button>
              </Link>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="text-xs font-semibold text-emerald-900">MinMax Hesaplama</span>
                <Button size="sm" onClick={runMinMax} disabled={minMaxLoading}>
                  <Play className="mr-2 h-4 w-4" />
                  {minMaxLoading ? 'Calisiyor...' : 'MinMax Calistir'}
                </Button>
                <MinMaxV2Panel depot={depot} />
                <Button size="sm" variant="outline" onClick={exportMinMax} disabled={exportingMinMax || minMaxRows.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  {exportingMinMax ? 'Hazirlaniyor...' : "Excel'e Aktar"}
                </Button>
                <span className="text-xs text-emerald-900">
                  Toplam: <strong>{minMaxTotal.toLocaleString('tr-TR')}</strong>
                </span>
                {minMaxJobStatusText && (
                  <span className="text-xs font-medium text-emerald-800">
                    {minMaxJobStatusText}
                  </span>
                )}
              </div>
              <span title={SUGGESTION_MODE_HELP[suggestionMode]}>
                <Select value={suggestionMode} onChange={(e) => setSuggestionMode(e.target.value as SuggestionMode)} className="w-56">
                  <option value="INCLUDE_MINMAX">MinMax Dahil (4. Sorun)</option>
                  <option value="EXCLUDE_MINMAX">MinMax Haric (3. Sorun)</option>
                </Select>
              </span>
              <p className="text-sm text-gray-600">
                Toplam: <strong>{depotTotal.toLocaleString('tr-TR')}</strong>
                {depotLimited ? ` (ilk ${depotLimit} satir gosteriliyor)` : ''}
              </p>
              <p className="text-sm text-gray-700">
                Mod'a Gore Onerilen Toplam: <strong>{totalSuggestedQty.toLocaleString('tr-TR')}</strong>
              </p>
            </div>
            {suggestionMode === 'EXCLUDE_MINMAX' && (
              <p className="rounded border bg-slate-50 px-3 py-2 text-xs text-gray-600">
                {SUGGESTION_MODE_HELP.EXCLUDE_MINMAX}
              </p>
            )}

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aile Operasyon Paneli</CardTitle>
            <CardDescription>
              Aile bazli oneriden sec, detayini ac, dagitimi tek panelden hizli yonet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b pb-3">
              <Button
                size="sm"
                variant={orderPanelTab === 'work' ? 'primary' : 'outline'}
                onClick={() => setOrderPanelTab('work')}
              >
                Operasyon
              </Button>
              <Button
                size="sm"
                variant={orderPanelTab === 'history' ? 'primary' : 'outline'}
                onClick={() => setOrderPanelTab('history')}
              >
                Olusturulan Siparisler ({createdOrderHistory.length.toLocaleString('tr-TR')})
              </Button>
              <Button
                size="sm"
                variant={orderPanelTab === 'operationHistory' ? 'primary' : 'outline'}
                onClick={() => setOrderPanelTab('operationHistory')}
              >
                Islem Gecmisi
              </Button>
            </div>

            {orderPanelTab === 'history' ? (
              renderCreatedOrderHistoryPanel()
            ) : orderPanelTab === 'operationHistory' ? (
              renderOperationHistoryPanel()
            ) : (
              <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3">
              <p className="text-sm text-gray-700">
                Aile olusturma ve urun ekleme islemleri ayri ekrana tasindi.
              </p>
              <Link href="/reports/product-families">
                <Button size="sm" variant="outline">Aile Yonetimine Git</Button>
              </Link>
            </div>

            <div className="rounded-md border bg-white p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div>
                <p className="text-xs text-gray-600">Aile Sayisi</p>
                <p className="text-sm font-semibold text-gray-900">{familySuggestionsFiltered.length.toLocaleString('tr-TR')}</p>
              </div>
              <Button size="sm" onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </Button>
              <Button size="sm" variant="secondary" onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
                {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi Siparis Olustur'}
              </Button>
              <Button size="sm" variant="outline" onClick={loadFamilies} disabled={familyLoading}>
                {familyLoading ? 'Yenileniyor...' : 'Aileleri Yenile'}
              </Button>
            </div>

            {missingPriceProducts.length > 0 && (
              <div className="rounded-md border border-pink-300 bg-pink-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-pink-900">
                      Fiyati olmayan stoklar var ({missingPriceProducts.length.toLocaleString('tr-TR')})
                    </p>
                    <p className="mt-1 text-xs text-pink-800">
                      Bu satirlar pembe isaretlendi. Fiyat girilmeden tedarikci siparisi modalina gecilmeyecek.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setMissingPriceProducts([])}>
                    Uyariyi Temizle
                  </Button>
                </div>
                <div className="mt-2 max-h-28 overflow-auto rounded border border-pink-200 bg-white">
                  {missingPriceProducts.map((item) => (
                    <div key={item.productCode} className="flex items-center justify-between gap-3 border-b px-2 py-1 text-xs">
                      <span className="font-semibold text-pink-900">{item.productCode}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{item.productName}</span>
                      <span className="text-gray-600">Miktar: {item.quantity.toLocaleString('tr-TR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastCreatedOrders.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900 mb-2">
                  Son olusturulan siparisler: {lastCreatedOrders.length.toLocaleString('tr-TR')}
                </p>
                <Button size="sm" variant="outline" onClick={() => setCreatedOrdersModalOpen(true)}>
                  PDF Indirme Penceresini Ac
                </Button>
              </div>
            )}

            <div className="rounded-md border bg-white p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Aileler</p>
              <input
                type="text"
                value={familyListSearch}
                onChange={(e) => setFamilyListSearch(e.target.value)}
                className="mb-2 w-full rounded border px-2 py-1 text-xs"
                placeholder="Aile ara (ad/kod)"
              />
              <div className="space-y-2">
                {familySuggestionsFiltered.length === 0 && (
                  <p className="text-xs text-gray-500">Tanimli aile yok.</p>
                )}
                {suggestedFamilies.map((family) => (
                  <Fragment key={family.id}>
                    {(() => {
                      const hasOrderRedirect = Boolean(
                        (family.redirectSuggestions || []).some((item) => item.type === 'ORDER')
                      );
                      return (
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 ${
                        activeFamilyId === family.id
                          ? 'border-emerald-300 bg-emerald-50'
                          : hasOrderRedirect
                          ? 'border-emerald-400 bg-emerald-100'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {family.name} {family.code ? `(${family.code})` : ''}
                        </p>
                        <p className="text-xs text-gray-600">
                          Oneri: {family.suggestedRaw.toLocaleString('tr-TR')} | Kalem: {family.itemCount.toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openFamilyEditModal(family.id)}>
                          Aileyi Duzenle
                        </Button>
                        <Button size="sm" variant={activeFamilyId === family.id ? 'secondary' : 'outline'} onClick={() => toggleFamilyDetail(family.id)}>
                          {activeFamilyId === family.id ? 'Detayi Kapat' : 'Detayi Ac'}
                        </Button>
                      </div>
                    </div>
                      );
                    })()}
                    {activeFamilyId === family.id && renderActiveFamilyPanel()}
                  </Fragment>
                ))}
                {unsuggestedFamilies.length > 0 && (
                  <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-2">
                    <button
                      type="button"
                      className="w-full text-left text-xs font-semibold text-gray-700"
                      onClick={() => setShowUnsuggestedFamilies((prev) => !prev)}
                    >
                      Onerisiz Aileler ({unsuggestedFamilies.length.toLocaleString('tr-TR')}) {showUnsuggestedFamilies ? '▲' : '▼'}
                    </button>
                    {showUnsuggestedFamilies && (
                      <div className="mt-2 space-y-2">
                        {unsuggestedFamilies.map((family) => (
                          <Fragment key={family.id}>
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 ${
                                activeFamilyId === family.id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {family.name} {family.code ? `(${family.code})` : ''}
                                </p>
                                <p className="text-xs text-gray-600">
                                  Oneri: {family.suggestedRaw.toLocaleString('tr-TR')} | Kalem: {family.itemCount.toLocaleString('tr-TR')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => openFamilyEditModal(family.id)}>
                                  Aileyi Duzenle
                                </Button>
                                <Button size="sm" variant={activeFamilyId === family.id ? 'secondary' : 'outline'} onClick={() => toggleFamilyDetail(family.id)}>
                                  {activeFamilyId === family.id ? 'Detayi Kapat' : 'Detayi Ac'}
                                </Button>
                              </div>
                            </div>
                            {activeFamilyId === family.id && renderActiveFamilyPanel()}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {familyLoading && <p className="text-sm text-gray-500">Aileler yukleniyor...</p>}
            {!familyLoading && !activeFamily && families.length > 0 && (
              <p className="text-sm text-gray-500">Aile detayi acmak icin listeden "Detayi Ac" kullanin.</p>
            )}

            <div className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Aile Disi Oneriler</p>
                  <p className="text-xs text-gray-600">Ailelere dahil olmayan ancak siparise donusturulebilen urunler.</p>
                </div>
                <p className="text-sm text-gray-700">
                  Kalem: <strong>{filteredNonFamilyRows.length.toLocaleString('tr-TR')}</strong>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  type="text"
                  value={nonFamilySearch}
                  onChange={(e) => setNonFamilySearch(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-xs md:col-span-2"
                  placeholder="Aile disi onerilerde ara (stok kodu/adi/saglayici)"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select
                    value={nonFamilyColorFilter}
                    onChange={(e) => setNonFamilyColorFilter(e.target.value as NonFamilyColorFilter)}
                    className="h-8 text-xs"
                  >
                    <option value="ALL">Renk: Tum</option>
                    <option value="GREEN">Renk: Yesil</option>
                    <option value="YELLOW">Renk: Sari</option>
                    <option value="RED">Renk: Kirmizi</option>
                    <option value="UNCOLORED">Renk: Renksiz</option>
                  </Select>
                  <Select
                    value={nonFamilyColorSort}
                    onChange={(e) => setNonFamilyColorSort(e.target.value as NonFamilyColorSort)}
                    className="h-8 text-xs"
                  >
                    <option value="NONE">Renk Sirala: Kapali</option>
                    <option value="RISK_DESC">Renk Sirala: Yuksek Risk</option>
                    <option value="RISK_ASC">Renk Sirala: Dusuk Risk</option>
                  </Select>
                </div>
              </div>
              {/* Triyaj seridi: A -> B -> C (varsayilan siralama da bu sirayla) */}
              <div className="flex flex-wrap items-center gap-2">
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
                          ? 'rounded bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white'
                          : 'rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50'
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
              <div className="overflow-x-auto overflow-y-auto rounded border max-h-[62vh]">
                <table className="w-max min-w-[2200px] text-[11px]">
                  <thead className="bg-gray-100 sticky top-0 z-20">
                    <tr>
                      <th
                        className="px-2 py-2 text-center sticky left-0 top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                        style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'color'))}
                      >
                        Sec{sortIndicator(nonFamilySort, 'color')}
                      </th>
                      <th
                        className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 cursor-pointer"
                        style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'code'))}
                      >
                        Stok Kodu{sortIndicator(nonFamilySort, 'code')}
                      </th>
                      <th
                        className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                        style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'name'))}
                      >
                        Urun Adi{sortIndicator(nonFamilySort, 'name')}
                      </th>
                      <th className="px-2 py-2 text-left" title="A = musteri bekliyor, B = yakinda bekleyecek, C = min-max tamamlama">Sinif</th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(nonFamilySort, 'supplierCode')}</th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(nonFamilySort, 'supplierName')}</th>
                      <th className="px-2 py-2 text-center">Ana Saglayici</th>
                      <th className="px-2 py-2 text-center">Kalici Degistir</th>
                      <th className="px-2 py-2 text-center">MinMax Hesaplanmasin</th>
                      {panelColumns.depotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(nonFamilySort, 'depotQty')}</th>}
                      {panelColumns.topcaDepotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(nonFamilySort, 'topcaDepotQty')}</th>}
                      {panelColumns.incomingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(nonFamilySort, 'incomingOrders')}</th>}
                      {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(nonFamilySort, 'outgoingOrders')}</th>}
                      {panelColumns.realQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(nonFamilySort, 'realQty')}</th>}
                      {panelColumns.minQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(nonFamilySort, 'minQty')}</th>}
                      {panelColumns.maxQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(nonFamilySort, 'maxQty')}</th>}
                      {panelColumns.stockDays && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'stockDays'))} title="Depo miktari / son 120 gun gunluk ortalama satis">Stok Gunu{sortIndicator(nonFamilySort, 'stockDays')}</th>}
                      {panelColumns.packQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(nonFamilySort, 'packQty')}</th>}
                      {panelColumns.costExVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(nonFamilySort, 'costExVat')}</th>}
                      {panelColumns.costIncVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(nonFamilySort, 'costIncVat')}</th>}
                      {panelColumns.currentCost && <th className="px-2 py-2 text-right">Maliyet P/T</th>}
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'suggested'))}>Oneri{sortIndicator(nonFamilySort, 'suggested')}</th>
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(nonFamilySort, 'allocation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNonFamilyRows.length === 0 && (
                      <tr>
                        <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
                          Aile disi onerili urun yok.
                        </td>
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
                        <tr key={code} className={`border-t ${hasMissingPrice ? 'bg-pink-200' : getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                          <td
                            className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(selectedTransferByCode[code])}
                              onChange={(e) =>
                                setSelectedTransferByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td
                            className={`px-2 py-2 font-semibold text-gray-900 sticky z-20 ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                          >
                            <div className="flex flex-col gap-1">
                              <span>{code}</span>
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  className="w-fit rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
                                  onClick={() => openSalesHistoryModal(code, 'minmax')}
                                  title="Satis MinMax detaylarini goster"
                                >
                                  Satis (MinMax)
                                </button>
                                <button
                                  type="button"
                                  className="w-fit rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                                  onClick={() => openSalesHistoryModal(code, 'recentCustomers')}
                                  title="Son alinan carileri ve alis detaylarini goster"
                                >
                                  Son Alinan Cariler
                                </button>
                              </div>
                            </div>
                          </td>
                          <td
                            className={`px-2 py-2 text-gray-700 sticky z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${hasMissingPrice ? 'bg-pink-200' : getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                          >
                            {productNameColumn ? normalizeValue(row?.[productNameColumn]) : '-'}
                          </td>
                          <td className="px-2 py-2">{renderTriageBadge(item.triage, item.incomingQty)}</td>
                          <td className="px-2 py-2">
                            <input
                              list="ucarer-supplier-cari-list"
                              value={getEffectiveSupplierCode(code)}
                              onChange={(e) =>
                                setSupplierOverrideByCode((prev) => ({
                                  ...prev,
                                  [code]: String(e.target.value || '').trim().toUpperCase(),
                                }))
                              }
                              className="w-32 rounded border px-2 py-1 text-xs uppercase"
                              placeholder="Cari kodu"
                            />
                          </td>
                          <td className="px-2 py-2 text-gray-600">{getEffectiveSupplierName(code)}</td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateMainSupplier(code)}
                              disabled={Boolean(updatingSupplierByCode[code])}
                            >
                              {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                            </Button>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(persistSupplierOverrideByCode[code])}
                              onChange={(e) =>
                                setPersistSupplierOverrideByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(resetMinMaxToZeroByCode[code])}
                                  onChange={(e) =>
                                    setResetMinMaxToZeroByCode((prev) => ({
                                      ...prev,
                                      [code]: e.target.checked,
                                    }))
                                  }
                                  disabled={minMaxExcludedCodeSet.has(code)}
                                />
                                0-0
                              </label>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setMinMaxExclusion(code, !minMaxExcludedCodeSet.has(code))}
                                disabled={Boolean(updatingMinMaxExclusionByCode[code])}
                              >
                                {updatingMinMaxExclusionByCode[code]
                                  ? '...'
                                  : minMaxExcludedCodeSet.has(code)
                                  ? 'MinMax Hesaplansin'
                                  : 'MinMax Hesaplanmasin'}
                              </Button>
                            </div>
                          </td>
                          {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                          {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                          {panelColumns.incomingOrders && (
                            <td
                              className="px-2 py-2 text-right cursor-pointer hover:underline"
                              onClick={() => openIncomingOrdersModal(code)}
                              title="Alinan siparis detaylarini goster"
                            >
                              {getExtraColumnValue(row || {}, code, 'incomingOrders')}
                            </td>
                          )}
                          {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                          {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                          {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                          {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                          {panelColumns.stockDays && <td className="px-2 py-2 text-right">{renderStockDaysBadge(row)}</td>}
                          {panelColumns.packQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                          {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                          {panelColumns.costIncVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
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
                                    setCostPInputByCode((prev) => ({
                                      ...prev,
                                      [code]: rawValue,
                                    }));
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
                                  className="w-20 rounded border px-2 py-1 text-right"
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
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: e.target.value,
                                    }));
                                  }}
                                  className="w-20 rounded border px-2 py-1 text-right"
                                  title="Maliyet P"
                                  placeholder="P"
                                />
                                <span className="text-[10px] text-gray-600">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                                <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={h.isPriceListUpdateChecked(code)}
                                    onChange={(e) =>
                                      h.setUpdatePriceListsByCode((prev) => ({
                                        ...prev,
                                        [code]: e.target.checked,
                                      }))
                                    }
                                  />
                                  10 liste
                                </label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProductCost(code)}
                                  disabled={Boolean(updatingCostByCode[code])}
                                >
                                  {updatingCostByCode[code] ? '...' : 'Guncelle'}
                                </Button>
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-2 text-right font-semibold text-emerald-700 cursor-pointer" title="Dagitima kopyala" onClick={() => setNonFamilyAllocations((prev) => ({ ...prev, [code]: Math.max(0, Math.trunc(suggested)) }))}>{suggested.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={allocated}
                              onChange={(e) =>
                                setNonFamilyAllocations((prev) => ({
                                  ...prev,
                                  [code]:
                                    e.target.value === ''
                                      ? ''
                                      : Math.max(0, Math.trunc(Number(e.target.value || 0))),
                                }))
                              }
                              className="w-24 rounded border px-2 py-1 text-right"
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
                <option key={cari.code} value={cari.code}>
                  {cari.name}
                </option>
              ))}
            </datalist>
              </>
            )}
          </CardContent>
        </Card>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-300 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </Button>
              <Button variant="secondary" onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
                {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi Siparis Olustur'}
              </Button>
            </div>
          </div>
        </div>
        {familyEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-3xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">Aileyi Duzenle</p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Aile Adi</label>
                  <Input value={familyEditName} onChange={(e) => setFamilyEditName(e.target.value)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Aile Kodu</label>
                  <Input value={familyEditCode} onChange={(e) => setFamilyEditCode(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Not</label>
                  <Input value={familyEditNote} onChange={(e) => setFamilyEditNote(e.target.value)} className="h-9 text-xs" />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={familyEditActive} onChange={(e) => setFamilyEditActive(e.target.checked)} />
                  Aktif
                </label>
              </div>

              <div className="mt-4 rounded border p-3">
                <p className="text-xs font-semibold text-gray-700">Aileye Urun Ekle/Cikar</p>
                <Input
                  value={familyEditSearch}
                  onChange={(e) => setFamilyEditSearch(e.target.value)}
                  placeholder="Stok kodu veya adi yazin..."
                  className="mt-2 h-9 text-xs"
                />
                {familyEditSearching && <p className="mt-2 text-xs text-gray-500">Araniyor...</p>}
                {!familyEditSearching && familyEditSearch.trim().length >= 2 && familyEditResults.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">Sonuc bulunamadi.</p>
                )}
                {!familyEditSearching && familyEditResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-auto rounded border">
                    {familyEditResults.map((item) => (
                      <button
                        key={`${item.productCode}-${item.productName}`}
                        type="button"
                        className="flex w-full items-center justify-between border-b px-2 py-1 text-left text-xs hover:bg-gray-50"
                        onClick={() => addProductCodeToFamilyEdit(item.productCode, item.productName)}
                      >
                        <span>{item.productCode} - {item.productName || '-'}</span>
                        <span className="text-blue-600">Ekle</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 max-h-44 overflow-auto rounded border">
                  {familyEditProductCodes.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-gray-500">Henuz urun secilmedi.</p>
                  ) : (
                    familyEditProductCodes.map((code) => (
                      <div key={code} className="flex items-center justify-between border-b px-2 py-1 text-xs">
                        <span className="min-w-0 truncate" title={getFamilyEditProductLabel(code)}>
                          {getFamilyEditProductLabel(code)}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => removeProductCodeFromFamilyEdit(code)}>
                          Cikar
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={closeFamilyEditModal}>
                  Iptal
                </Button>
                <Button size="sm" onClick={saveFamilyEdit} disabled={familyEditSaving}>
                  {familyEditSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {createdOrdersModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">Olusturulan Siparis PDF Indirme</p>
              <p className="mt-1 text-xs text-gray-600">
                Olusan siparisleri tek tek ya da yonetici onay ozeti olarak indirebilirsiniz.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadCreatedOrderPdfs()} disabled={downloadingOrderPdfs}>
                  {downloadingOrderPdfs ? 'Hazirlaniyor...' : 'Tum Siparisleri PDF (tek tek)'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadCreatedOrdersSummaryPdf()} disabled={downloadingOrderSummaryPdf}>
                  {downloadingOrderSummaryPdf ? 'Hazirlaniyor...' : 'Yonetici Onay Ozeti (tek PDF)'}
                </Button>
              </div>
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setCreatedOrdersModalOpen(false)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        )}
        {incomingOrdersModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-5xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">
                Alinan Siparis Detayi - {incomingOrdersProductCode || '-'}
              </p>
              <div className="mt-3 max-h-[60vh] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      <th className="px-2 py-2 text-left">Cari Kodu</th>
                      <th className="px-2 py-2 text-left">Cari Unvan</th>
                      <th className="px-2 py-2 text-left">Siparis No</th>
                      <th className="px-2 py-2 text-right">Siparis Miktari</th>
                      <th className="px-2 py-2 text-right">Teslim</th>
                      <th className="px-2 py-2 text-right">Kalan</th>
                      <th className="px-2 py-2 text-right">Birim Fiyat</th>
                      <th className="px-2 py-2 text-left">Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomingOrdersLoading ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-6 text-center text-gray-500">Yukleniyor...</td>
                      </tr>
                    ) : incomingOrdersDetailRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-6 text-center text-gray-500">Detay bulunamadi.</td>
                      </tr>
                    ) : (
                      incomingOrdersDetailRows.map((row, index) => (
                        <tr key={`${row.orderSeries}-${row.orderSequence}-${row.orderLineNo}-${index}`} className="border-t">
                          <td className="px-2 py-2">{row.customerCode}</td>
                          <td className="px-2 py-2">{row.customerName}</td>
                          <td className="px-2 py-2">{row.orderSeries}-{row.orderSequence}</td>
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
                <Button size="sm" variant="outline" onClick={() => setIncomingOrdersModalOpen(false)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        )}
        {salesHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-6xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">
                {salesHistoryViewMode === 'recentCustomers' ? 'Son Alinan Cariler' : 'Satis (MinMax)'} - Son {salesHistoryLookbackMonths} Ay {salesHistoryViewMode === 'recentCustomers' ? 'Alis' : 'Satis'} Detayi - {salesHistoryProductCode || '-'}
              </p>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-700">
                <span>
                  Toplam Miktar: <strong>{salesHistorySummary.totalQuantity.toLocaleString('tr-TR')}</strong>
                </span>
                <span>
                  Toplam Tutar: <strong>{salesHistorySummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</strong>
                </span>
                <span>
                  Ortalama Birim: <strong>{salesHistorySummary.averageUnitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</strong>
                </span>
              </div>
              <div className="mt-3 max-h-[60vh] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'customerCode'))}>
                        Cari Kodu{salesSortIndicator('customerCode')}
                      </th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'customerName'))}>
                        Cari Unvan{salesSortIndicator('customerName')}
                      </th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'documentNo'))}>
                        Evrak No{salesSortIndicator('documentNo')}
                      </th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'saleDate'))}>
                        Tarih{salesSortIndicator('saleDate')}
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'quantity'))}>
                        Miktar{salesSortIndicator('quantity')}
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'unitPrice'))}>
                        Birim Fiyat (TL){salesSortIndicator('unitPrice')}
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setSalesHistorySort((prev) => updateSalesHistorySort(prev, 'totalAmount'))}>
                        Tutar (TL){salesSortIndicator('totalAmount')}
                      </th>
                      <th className="px-2 py-2 text-left">Srm</th>
                      {salesHistoryViewMode === 'minmax' && <th className="px-2 py-2 text-left">Islem</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {salesHistoryLoading ? (
                      <tr>
                        <td colSpan={salesHistoryViewMode === 'minmax' ? 9 : 8} className="px-2 py-6 text-center text-gray-500">Yukleniyor...</td>
                      </tr>
                    ) : salesHistoryRows.length === 0 ? (
                      <tr>
                        <td colSpan={salesHistoryViewMode === 'minmax' ? 9 : 8} className="px-2 py-6 text-center text-gray-500">
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
                          <tr key={`${row.documentSeries}-${row.documentSequence}-${row.documentLineNo}-${index}`} className="border-t">
                            <td className="px-2 py-2">{row.customerCode || '-'}</td>
                            <td className="px-2 py-2">{row.customerName || '-'}</td>
                            <td className="px-2 py-2">{documentNo}</td>
                            <td className="px-2 py-2">{row.saleDate ? new Date(row.saleDate).toLocaleDateString('tr-TR') : '-'}</td>
                            <td className="px-2 py-2 text-right">{Number(row.quantity || 0).toLocaleString('tr-TR')}</td>
                            <td className="px-2 py-2 text-right">{Number(row.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-2 py-2 text-right font-semibold">{Number(row.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-2 py-2">
                              <span className={`rounded px-2 py-1 text-[11px] font-semibold ${isToplu ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                                {stockSrm || '-'}
                              </span>
                            </td>
                            {salesHistoryViewMode === 'minmax' && (
                              <td className="px-2 py-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!row.lineGuid || isToplu || isMarkingToplu || salesHistoryLoading}
                                  onClick={() => markSalesHistoryLineAsToplu(row)}
                                >
                                  {isMarkingToplu ? 'Yapiliyor...' : isToplu ? 'TOPLU' : 'Toplu yap'}
                                </Button>
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
                <Button size="sm" variant="outline" onClick={() => setSalesHistoryModalOpen(false)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        )}
        {seriesModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-4xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">Cari Bazinda Siparis Ayarlari</p>
              <p className="mt-1 text-xs text-gray-600">
                Her cari icin seri, vergili/vergisiz, teslim turu ve teslim tarihi secin.
              </p>
              <div className="mt-3 max-h-[55vh] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-2 text-center">Detay</th>
                      <th className="px-2 py-2 text-left">Cari</th>
                      <th className="px-2 py-2 text-left">Unvan</th>
                      <th className="px-2 py-2 text-right">Kalem</th>
                      <th className="px-2 py-2 text-right">Miktar</th>
                      <th className="px-2 py-2 text-left">Seri</th>
                      <th className="px-2 py-2 text-left">Vergi</th>
                      <th className="px-2 py-2 text-left">Teslim Turu</th>
                      <th className="px-2 py-2 text-left">Teslim Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSupplierRows.map((row) => {
                      const cfg = supplierOrderConfigs[row.supplierCode] || {
                        series: '',
                        applyVAT: true,
                        deliveryType: 'D',
                        deliveryDate: '',
                      };
                      const detailRows = pendingSupplierItemsByCode[row.supplierCode] || [];
                      const isExpanded = Boolean(expandedSupplierRows[row.supplierCode]);
                      const recentSeries = supplierRecentSeriesByCode[row.supplierCode] || [];
                      const seriesListId = `ucarer-series-${row.supplierCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                      return (
                        <Fragment key={row.supplierCode}>
                          <tr className="border-t">
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border bg-white"
                                onClick={() =>
                                  setExpandedSupplierRows((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: !prev[row.supplierCode],
                                  }))
                                }
                                title="Urunleri goster/gizle"
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                            </td>
                            <td className="px-2 py-2 font-semibold">{row.supplierCode}</td>
                            <td className="px-2 py-2">{row.supplierName}</td>
                            <td className="px-2 py-2 text-right">{row.itemCount.toLocaleString('tr-TR')}</td>
                            <td className="px-2 py-2 text-right">{row.totalQuantity.toLocaleString('tr-TR')}</td>
                            <td className="px-2 py-2">
                              <input
                                list={seriesListId}
                                className="w-20 rounded border px-2 py-1 uppercase"
                                maxLength={20}
                                value={cfg.series}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      series: String(e.target.value || '').toUpperCase(),
                                    },
                                  }))
                                }
                              />
                              {recentSeries.length > 0 && (
                                <datalist id={seriesListId}>
                                  {recentSeries.map((item) => (
                                    <option key={`${row.supplierCode}-${item.series}`} value={item.series}>
                                      {item.lastOrderNumber}
                                    </option>
                                  ))}
                                </datalist>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={Boolean(cfg.applyVAT)}
                                  onChange={(e) =>
                                    setSupplierOrderConfigs((prev) => ({
                                      ...prev,
                                      [row.supplierCode]: {
                                        ...cfg,
                                        applyVAT: e.target.checked,
                                      },
                                    }))
                                  }
                                />
                                Vergili
                              </label>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                list="ucarer-delivery-type-list"
                                className="w-44 rounded border px-2 py-1"
                                placeholder="D / B / N"
                                value={cfg.deliveryType}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      deliveryType: String(e.target.value || '').trim().toUpperCase(),
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="date"
                                className="rounded border px-2 py-1"
                                value={cfg.deliveryDate}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      deliveryDate: String(e.target.value || ''),
                                    },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t bg-gray-50">
                              <td className="px-2 py-2" />
                              <td className="px-2 py-2 text-[11px] text-gray-700" colSpan={8}>
                                <div className="space-y-1">
                                  {detailRows.map((item) => (
                                    <div
                                      key={`${row.supplierCode}-${item.productCode}`}
                                      className={`flex items-center justify-between gap-4 rounded border px-2 py-1 ${
                                        item.unitPrice > 0 ? 'bg-white' : 'border-pink-200 bg-pink-50'
                                      }`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium text-gray-800">
                                          {item.productCode} - {item.productName}
                                        </div>
                                        <div className="text-[11px] text-gray-700">
                                          Miktar: <strong>{item.quantity.toLocaleString('tr-TR')}</strong>
                                          <span className="ml-2">
                                            Tutar: <strong>{formatPdfMoney(item.total)}</strong>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <label className="flex items-center gap-1 text-[10px] text-gray-600">
                                          Fiyat
                                          <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            className="w-24 rounded border px-2 py-1 text-right text-[11px]"
                                            value={item.unitPrice > 0 ? item.unitPrice.toFixed(4).replace(/\.?0+$/, '') : ''}
                                            onChange={(e) => setPendingPriceOverrideForProduct(item.productCode, e.target.value)}
                                            placeholder="Birim"
                                          />
                                        </label>
                                        {(() => {
                                          const productCode = String(item.productCode || '').trim().toUpperCase();
                                          const typedValue = pendingSupplierInputByProduct[productCode] ?? String(
                                            pendingAllocations.find(
                                              (alloc) =>
                                                String(alloc.productCode || '').trim().toUpperCase() === productCode
                                            )?.supplierCodeOverride || row.supplierCode
                                          ).trim().toUpperCase();
                                          return (
                                            <>
                                        <input
                                          list="ucarer-supplier-cari-list"
                                          className="w-40 rounded border px-2 py-1 text-[11px] uppercase"
                                          value={typedValue}
                                          onChange={(e) =>
                                            setPendingSupplierInputByProduct((prev) => ({
                                              ...prev,
                                              [productCode]: String(e.target.value || '').toUpperCase(),
                                            }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return;
                                            reassignPendingSupplierForProduct(row.supplierCode, item.productCode, typedValue);
                                          }}
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => reassignPendingSupplierForProduct(row.supplierCode, item.productCode, typedValue)}
                                        >
                                          Uygula
                                        </Button>
                                        <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(
                                              pendingAllocations.find(
                                                (alloc) =>
                                                  String(alloc.productCode || '').trim().toUpperCase() ===
                                                  String(item.productCode || '').trim().toUpperCase()
                                              )?.persistSupplierOverride
                                            )}
                                            onChange={(e) => setPendingPersistOverrideForProduct(item.productCode, e.target.checked)}
                                          />
                                          Kalici
                                        </label>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => removePendingProductFromSupplierOrder(item.productCode)}
                                        >
                                          Kaldir
                                        </Button>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  ))}
                                  {detailRows.length === 0 && (
                                    <div className="text-gray-500">Bu cari icin urun bulunamadi.</div>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (creatingOrders) return;
                    setSeriesModalOpen(false);
                  }}
                >
                  Vazgec
                </Button>
                <Button size="sm" onClick={submitCreateSupplierOrders} disabled={creatingOrders}>
                  {creatingOrders ? 'Olusturuluyor...' : 'Siparisleri Olustur'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
