'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import type { PriceMarginConsistencyRow, PriceMarginListStatus } from '@/types';
import {
  ISSUE_LABELS,
  canRepairRow,
  formatMoney,
  formatPercent,
  getVisibleChecks,
  usePriceMarginConsistency,
  type IssueFilter,
} from './usePriceMarginConsistency';

const ISSUE_CLASSES: Record<PriceMarginListStatus, string> = {
  OK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  MISSING_COST: 'border-red-200 bg-red-50 text-red-700',
  MISSING_MARGIN: 'border-amber-200 bg-amber-50 text-amber-700',
  MISSING_PRICE: 'border-rose-200 bg-rose-50 text-rose-700',
  PRICE_MISMATCH: 'border-orange-200 bg-orange-50 text-orange-700',
  DUPLICATE_PRICE: 'border-violet-200 bg-violet-50 text-violet-700',
};

const fieldClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/10';
const buttonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

function StatusBadge({ status }: { status: PriceMarginListStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ISSUE_CLASSES[status]}`}>
      {ISSUE_LABELS[status]}
    </span>
  );
}

function ProductIssueBadges({ row }: { row: PriceMarginConsistencyRow }) {
  if (row.isCompliant) return <StatusBadge status="OK" />;
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {row.issueTypes.slice(0, 2).map((status) => <StatusBadge key={status} status={status} />)}
      {row.issueTypes.length > 2 && (
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          +{row.issueTypes.length - 2}
        </span>
      )}
    </div>
  );
}

export default function PriceMarginConsistencyNew() {
  const state = usePriceMarginConsistency();
  const {
    report,
    loading,
    refreshing,
    searchInput,
    setSearchInput,
    issueType,
    setIssueType,
    category,
    setCategory,
    brand,
    setBrand,
    supplier,
    setSupplier,
    listNo,
    setListNo,
    minDifferenceAmount,
    setMinDifferenceAmount,
    minDifferencePercent,
    setMinDifferencePercent,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    expandedCodes,
    selectedCodes,
    repairRows,
    repairing,
    repairProgress,
    exporting,
    allSelectableSelected,
    applyFilters,
    clearFilters,
    toggleExpanded,
    toggleSelected,
    toggleAllVisible,
    openRepair,
    openSelectedRepair,
    closeRepair,
    confirmRepair,
    exportToExcel,
    loadReport,
  } = state;

  const summaryCards = [
    { label: 'Kontrol Edilen', value: report.summary.totalProducts, tone: 'text-slate-900', icon: null },
    { label: 'Tam Uyumlu', value: report.summary.compliantProducts, tone: 'text-emerald-700', icon: CheckCircle2 },
    { label: 'Sorunlu Urun', value: report.summary.problemProducts, tone: 'text-red-700', icon: AlertTriangle },
    { label: 'Fiyat Uyumsuz', value: report.summary.priceMismatchProducts, tone: 'text-orange-700', icon: null },
    { label: 'Marj Eksik', value: report.summary.missingMarginProducts, tone: 'text-amber-700', icon: null },
    { label: 'Fiyat Satiri Eksik', value: report.summary.missingPriceProducts, tone: 'text-rose-700', icon: null },
  ];

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-[#14223b]">
      <div className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <Link href="/reports" className="hover:text-[#15356b]">Rapor Merkezi</Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Fiyat Kontrolu</span>
            </div>
            <h1 className="text-xl font-bold text-[#14223b]">Liste Fiyati - Marj Uyum Raporu</h1>
            <p className="mt-1 text-xs text-slate-500">
              Son kontrol: {report.metadata.generatedAt ? new Date(report.metadata.generatedAt).toLocaleString('tr-TR') : '-'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCodes.size > 0 && (
              <button
                type="button"
                onClick={openSelectedRepair}
                className={`${buttonClass} border-[#15356b] bg-[#15356b] text-white hover:bg-[#102b58]`}
              >
                <Wrench className="h-4 w-4" />
                Secilenleri Duzelt ({selectedCodes.size})
              </button>
            )}
            <button
              type="button"
              onClick={exportToExcel}
              disabled={exporting || loading}
              className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300`}
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => loadReport({ refresh: true, pageOverride: page })}
              disabled={refreshing || loading}
              className={`${buttonClass} border-[#15356b] bg-white text-[#15356b] hover:bg-blue-50`}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Canli Yenile
            </button>
          </div>
        </header>

        {report.metadata.stale && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{report.metadata.staleReason || 'Canli Mikro verisi yenilenemedi; son bilinen rapor gosteriliyor.'}</span>
          </div>
        )}

        <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500">{card.label}</span>
                  {Icon && <Icon className={`h-4 w-4 ${card.tone}`} />}
                </div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${card.tone}`}>{card.value.toLocaleString('tr-TR')}</div>
              </div>
            );
          })}
        </section>

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && applyFilters()}
                placeholder="Urun, kod, kategori, marka, saglayici"
                className={`${fieldClass} pl-9`}
              />
            </div>
            <select value={issueType} onChange={(event) => { setIssueType(event.target.value as IssueFilter); setPage(1); }} className={fieldClass}>
              <option value="PROBLEM">Tum sorunlar</option>
              <option value="PRICE_MISMATCH">Fiyat uyumsuz</option>
              <option value="MISSING_MARGIN">Marj eksik/bozuk</option>
              <option value="MISSING_PRICE">Fiyat satiri eksik</option>
              <option value="MISSING_COST">Maliyet eksik</option>
              <option value="DUPLICATE_PRICE">Cift fiyat uyumsuz</option>
              <option value="ALL">Tum urunler</option>
            </select>
            <select value={listNo} onChange={(event) => { setListNo(Number(event.target.value)); setPage(1); }} className={fieldClass}>
              <option value={0}>Tum listeler</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>Liste {number}</option>)}
            </select>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className={fieldClass}>
              <option value="">Tum kategoriler</option>
              {report.options.categories.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={brand} onChange={(event) => { setBrand(event.target.value); setPage(1); }} className={fieldClass}>
              <option value="">Tum markalar</option>
              {report.options.brands.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1); }} className={fieldClass}>
              <option value="">Tum saglayicilar</option>
              {report.options.suppliers.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <button type="button" onClick={applyFilters} className={`${buttonClass} border-[#15356b] bg-[#15356b] text-white hover:bg-[#102b58]`}>
              <Search className="h-4 w-4" /> Ara
            </button>
          </div>
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-2 lg:grid-cols-5">
            <input
              value={minDifferenceAmount}
              onChange={(event) => setMinDifferenceAmount(event.target.value)}
              placeholder="Min. fark TL"
              inputMode="decimal"
              className={fieldClass}
            />
            <input
              value={minDifferencePercent}
              onChange={(event) => setMinDifferencePercent(event.target.value)}
              placeholder="Min. fark %"
              inputMode="decimal"
              className={fieldClass}
            />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className={fieldClass}>
              <option value="maxDifferenceAmount">Fark TL</option>
              <option value="maxDifferencePercent">Fark %</option>
              <option value="problemListCount">Sorunlu liste</option>
              <option value="productCode">Urun kodu</option>
              <option value="productName">Urun adi</option>
            </select>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'asc' | 'desc')} className={fieldClass}>
              <option value="desc">Azalan</option>
              <option value="asc">Artan</option>
            </select>
            <button type="button" onClick={clearFilters} className={`${buttonClass} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>
              <RotateCcw className="h-4 w-4" /> Temizle
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <span className="text-sm font-semibold text-slate-900">Urunler</span>
              <span className="ml-2 text-xs text-slate-500">{report.pagination.totalRecords.toLocaleString('tr-TR')} kayit</span>
            </div>
            <span className="text-[11px] text-slate-500">Tolerans: {formatMoney(report.metadata.tolerance)} TL</span>
          </div>

          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-[1280px] w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#fafbfd] text-[10px] font-semibold uppercase text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-10 px-3 py-3 text-center">
                    <input type="checkbox" checked={allSelectableSelected} onChange={toggleAllVisible} aria-label="Gorunen duzeltilebilir urunleri sec" />
                  </th>
                  <th className="w-10 px-2 py-3" />
                  <th className="min-w-[280px] px-3 py-3">Urun</th>
                  <th className="min-w-[180px] px-3 py-3">Kategori / Marka</th>
                  <th className="min-w-[220px] px-3 py-3">Ana Saglayici</th>
                  <th className="px-3 py-3 text-right">Maliyet P</th>
                  <th className="px-3 py-3 text-right">Maliyet T</th>
                  <th className="min-w-[230px] px-3 py-3">Sorun</th>
                  <th className="px-3 py-3 text-right">Liste</th>
                  <th className="px-3 py-3 text-right">Maks. Fark</th>
                  <th className="w-32 px-3 py-3 text-right">Islem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="h-40 text-center text-sm text-slate-500">Rapor hazirlaniyor...</td></tr>
                ) : report.rows.length === 0 ? (
                  <tr><td colSpan={11} className="h-40 text-center text-sm text-slate-500">Filtreye uygun kayit bulunamadi.</td></tr>
                ) : report.rows.map((row) => {
                  const expanded = expandedCodes.has(row.productCode);
                  const repairable = canRepairRow(row);
                  const checks = getVisibleChecks(row, listNo);
                  return (
                    <Fragment key={row.productCode}>
                    <tr>
                      <td className="border-b border-slate-100 px-3 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          checked={selectedCodes.has(row.productCode)}
                          disabled={!repairable}
                          onChange={() => toggleSelected(row)}
                          aria-label={`${row.productCode} sec`}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-2 py-3 align-top">
                        <button type="button" onClick={() => toggleExpanded(row.productCode)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Liste detaylarini ac">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="font-semibold text-slate-900">{row.productName}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.productCode}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="text-slate-700">{row.categoryName || row.categoryCode || '-'}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{row.brandCode || '-'}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top">
                        <div className="text-slate-700">{row.mainSupplierName || '-'}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.mainSupplierCode || '-'}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right align-top tabular-nums">{formatMoney(row.costP)}</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right align-top tabular-nums">{formatMoney(row.costT)}</td>
                      <td className="border-b border-slate-100 px-3 py-3 align-top"><ProductIssueBadges row={row} /></td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right align-top font-semibold tabular-nums">{row.problemListCount}/10</td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right align-top">
                        <div className="font-semibold tabular-nums text-slate-900">{formatMoney(row.maxDifferenceAmount)} TL</div>
                        <div className="text-[11px] tabular-nums text-slate-500">{formatPercent(row.maxDifferencePercent)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right align-top">
                        <button
                          type="button"
                          onClick={() => openRepair([row])}
                          disabled={!repairable}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-[#15356b] hover:border-[#15356b] disabled:cursor-not-allowed disabled:text-slate-400"
                          title={repairable ? '10 listeyi maliyet ve marjdan yeniden hesapla' : 'Maliyet veya marj eksik'}
                        >
                          <Wrench className="h-3.5 w-3.5" /> Duzelt
                        </button>
                      </td>
                    </tr>
                      {expanded && (
                        <tr>
                        <td colSpan={11} className="border-b border-slate-200 bg-slate-50 px-12 py-3">
                          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="w-full min-w-[950px] text-[11px]">
                              <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                  <th className="px-3 py-2 text-left">Liste</th>
                                  <th className="px-3 py-2 text-left">Baz</th>
                                  <th className="px-3 py-2 text-right">Maliyet</th>
                                  <th className="px-3 py-2 text-right">Marj</th>
                                  <th className="px-3 py-2 text-right">Beklenen</th>
                                  <th className="px-3 py-2 text-right">Mevcut</th>
                                  <th className="px-3 py-2 text-right">Fark TL</th>
                                  <th className="px-3 py-2 text-right">Fark %</th>
                                  <th className="px-3 py-2 text-center">Satir</th>
                                  <th className="px-3 py-2 text-left">Durum</th>
                                </tr>
                              </thead>
                              <tbody>
                                {checks.map((check) => (
                                  <tr key={check.listNo} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-semibold">Liste {check.listNo}</td>
                                    <td className="px-3 py-2 text-slate-600">Maliyet {check.costType} / Marj {check.marginNo}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(check.baseCost)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{check.margin === null ? '-' : check.margin.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}</td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(check.expectedPrice)}</td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(check.actualPrice)}</td>
                                    <td className={`px-3 py-2 text-right tabular-nums ${Number(check.differenceAmount || 0) === 0 ? 'text-slate-500' : 'font-semibold text-red-700'}`}>{formatMoney(check.differenceAmount)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(check.differencePercent)}</td>
                                    <td className="px-3 py-2 text-center tabular-nums">{check.priceRowCount}</td>
                                    <td className="px-3 py-2"><StatusBadge status={check.status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-500">
              Sayfa {report.pagination.page} / {report.pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1 || loading}
                className={`${buttonClass} border-slate-200 bg-white text-slate-600`}
                title="Onceki sayfa"
              >
                <ChevronLeft className="h-4 w-4" /> Onceki
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(report.pagination.totalPages, page + 1))}
                disabled={page >= report.pagination.totalPages || loading}
                className={`${buttonClass} border-slate-200 bg-white text-slate-600`}
                title="Sonraki sayfa"
              >
                Sonraki <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {repairRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Fiyat listelerini duzelt">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">10 Fiyat Listesini Duzelt</h2>
                <p className="mt-0.5 text-xs text-slate-500">{repairRows.length} urun</p>
              </div>
              <button type="button" onClick={closeRepair} disabled={repairing} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Kapat">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-auto px-5 py-4">
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Maliyet P/T degismeden korunacak; liste 1-10 mevcut marjlardan yeniden hesaplanacak ve Mikro'da geri okunarak dogrulanacak.</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {repairRows.slice(0, 20).map((row) => (
                  <div key={row.productCode} className="flex items-center justify-between gap-4 px-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">{row.productName}</div>
                      <div className="font-mono text-[10px] text-slate-500">{row.productCode}</div>
                    </div>
                    <span className="shrink-0 font-semibold text-red-700">{row.problemListCount} liste</span>
                  </div>
                ))}
                {repairRows.length > 20 && <div className="px-3 py-2 text-xs text-slate-500">+{repairRows.length - 20} urun</div>}
              </div>
              {repairing && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                    <span>Guncelleniyor</span>
                    <span>{repairProgress.current}/{repairProgress.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-[#15356b] transition-all" style={{ width: `${repairProgress.total ? (repairProgress.current / repairProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={closeRepair} disabled={repairing} className={`${buttonClass} border-slate-200 bg-white text-slate-600`}>Vazgec</button>
              <button type="button" onClick={confirmRepair} disabled={repairing} className={`${buttonClass} border-[#15356b] bg-[#15356b] text-white hover:bg-[#102b58]`}>
                {repairing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {repairing ? 'Duzeltiliyor' : 'Onayla ve Duzelt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
