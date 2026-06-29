'use client';

import {
  Activity,
  AlertTriangle,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  useOperasyon,
  coverageBadgeClass,
  decisionBadgeClass,
  intentBadgeClass,
} from './useOperasyon';

// Yeni gorunum ortak stil sabitleri (tasarim referansina gore)
const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const PANEL_HEAD =
  'px-4 py-3 border-b border-[#eef1f6] text-[13.5px] font-semibold text-[#14223b]';
const TH =
  'text-[10px] font-semibold uppercase tracking-[0.03em] text-[#8b97ac]';

/**
 * Yeni gorunum - Operasyon Komuta Merkezi.
 * Mevcut TUM mantik useOperasyon'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/rozet/sekme dusurulmemistir.
 * Paylasilan Modal komponentleri (6 adet) Classic ile birebir aynidir.
 */
export default function OperasyonNew() {
  const {
    router,
    permissionLoading,
    canAccess,
    seriesText,
    setSeriesText,
    data,
    loading,
    refreshing,
    error,
    fetchData,
    setSelectedAtpOrderNumber,
    setSelectedWaveId,
    setSelectedCustomerId,
    setSelectedRiskOrderId,
    setSelectedSubstitutionKey,
    setSelectedDataCheckCode,
    atpLineQuery,
    setAtpLineQuery,
    atpLineMode,
    setAtpLineMode,
    selectedAtpOrder,
    selectedWave,
    selectedCustomer,
    selectedRiskOrder,
    selectedSubstitution,
    selectedDataCheck,
    filteredAtpLines,
  } = useOperasyon();

  if (!canAccess && !permissionLoading) return null;

  // Metrik kartlari (Classic ile ayni alanlar; yeni gorsel)
  const summaryCards = data
    ? [
        {
          title: 'Acil ATP',
          value: `${data.summary.lowCoverageOrderCount} siparis`,
          helper: `Toplam acik siparis: ${data.summary.openOrderCount}`,
          valueColor: '#14223b',
          icon: <Layers className="w-[18px] h-[18px]" />,
        },
        {
          title: 'Kritik Risk',
          value: `${data.summary.highRiskOrderCount} siparis`,
          helper: `Toplam shortage: ${Math.round(data.summary.shortageQty)} adet`,
          valueColor: '#b91c1c',
          icon: <ShieldAlert className="w-[18px] h-[18px]" />,
        },
        {
          title: 'Sicak Musteri',
          value: `${data.summary.hotCustomerCount} musteri`,
          helper: `Aktif picker: ${data.summary.activePickerCount}`,
          valueColor: '#047857',
          icon: <Users className="w-[18px] h-[18px]" />,
        },
        {
          title: 'Ikame Ihtiyaci',
          value: `${data.summary.substitutionNeedCount} satir`,
          helper: `Data block: ${data.summary.blockedDataChecks}`,
          valueColor: '#14223b',
          icon: <Sparkles className="w-[18px] h-[18px]" />,
        },
      ]
    : [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
      {/* Ust bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#14223b] m-0">
            Operasyon Komuta Merkezi
          </h1>
          <p className="text-[13px] text-[#8b97ac] mt-1.5">
            Stok gercegi (ATP/tahsis), depo is yuku, musteri intent, risk ve master-data tek konsolda
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Input
            value={seriesText}
            onChange={(event) => setSeriesText(event.target.value)}
            placeholder="Seri filtre (HENDEK,ADAPAZARI)"
            className="w-[230px]"
          />
          <button
            type="button"
            onClick={() => fetchData(false)}
            disabled={loading || refreshing}
            className="flex items-center gap-[7px] bg-[#15356b] hover:bg-[#1c4585] disabled:opacity-60 border-0 rounded-lg px-[15px] h-10 text-[13px] font-semibold text-white cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-[15px] h-[15px] ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && (
        <div className={`${CARD} border-[#f3c7cd] bg-[#fdf2f3] p-4`}>
          <div className="flex items-center gap-2 text-[#b91c1c]">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {loading && (
        <div className={`${CARD} p-4`}>
          <div className="py-12 text-center text-[#8b97ac] text-sm">
            Komuta merkezi verileri yukleniyor...
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* 4 metrik kart */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {summaryCards.map((card) => (
              <div key={card.title} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#51607a]">{card.title}</div>
                    <div
                      className="text-[23px] font-semibold mt-2"
                      style={{ color: card.valueColor }}
                    >
                      {card.value}
                    </div>
                    <div className="text-[11.5px] text-[#8b97ac] mt-[3px]">{card.helper}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#eef2f8] text-[#15356b] shrink-0">
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* A2 ATP + A3 Orkestrasyon */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* A2 ATP / Tahsis */}
            <div className={`${CARD} overflow-hidden`}>
              <div className={PANEL_HEAD}>A2 - ATP / Tahsis</div>
              <div className="text-[11px] text-[#8b97ac] px-4 pt-2.5">
                Webdeki siparislerin mobil/kiosk ile ortak stok gercegi - satira tikla: siparis detayini ac
              </div>
              <div className="overflow-auto max-h-[460px]">
                <table className="min-w-full text-[12px]">
                  <thead className="bg-[#fafbfd] sticky top-0">
                    <tr>
                      <th className={`px-3 py-2.5 text-left ${TH}`}>Siparis</th>
                      <th className={`px-3 py-2.5 text-left ${TH}`}>Musteri</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Kalan</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Shortage</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Kapsama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atp.orders.slice(0, 24).map((order: any) => (
                      <tr
                        key={order.mikroOrderNumber}
                        className="border-t border-[#f1f4f9] cursor-pointer hover:bg-[#fafbfd] text-[#14223b]"
                        onClick={() => {
                          setAtpLineQuery('');
                          setAtpLineMode('ALL');
                          setSelectedAtpOrderNumber(order.mikroOrderNumber);
                        }}
                      >
                        <td className="px-3 py-2.5 font-mono font-semibold">{order.mikroOrderNumber}</td>
                        <td className="px-3 py-2.5 max-w-[160px] truncate">{order.customerName}</td>
                        <td className="px-3 py-2.5 text-right">{Math.round(order.remainingQty)}</td>
                        <td className="px-3 py-2.5 text-right text-[#b91c1c] font-semibold">
                          {Math.round(order.shortageQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`px-2 py-1 rounded text-[11px] font-semibold ${coverageBadgeClass(order.coverageStatus)}`}>
                            %{order.coveredPercent} - {order.coverageStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* A3 Depo Orkestrasyonu */}
            <div className={`${CARD} overflow-hidden`}>
              <div className={PANEL_HEAD}>A3 - Depo Orkestrasyonu</div>
              <div className="p-3.5 flex flex-col gap-2.5 max-h-[460px] overflow-auto">
                {data.orchestration.waves.slice(0, 10).map((wave: any) => (
                  <div
                    key={wave.waveId}
                    className="border border-[#eef1f6] rounded-[9px] p-3 cursor-pointer hover:bg-[#fafbfd] transition-colors"
                    onClick={() => setSelectedWaveId(wave.waveId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedWaveId(wave.waveId);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12.5px] font-semibold text-[#15356b]">
                        {wave.waveId}
                      </span>
                      <span className="text-[11.5px] text-[#8b97ac]">
                        {wave.orderCount} siparis | {wave.lineCount} satir
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#51607a] mt-1">
                      Tahmini sure: {wave.estimatedMinutes} dk | Onerilen picker:{' '}
                      <b className="text-[#14223b] font-semibold">{wave.recommendedPickerCount}</b>
                    </div>
                  </div>
                ))}
                <div className="border-t border-[#eef1f6] pt-2.5">
                  <div className="text-[11px] font-semibold text-[#8b97ac] uppercase tracking-[0.04em] mb-[7px]">
                    Aktif Pickerler
                  </div>
                  <div className="flex flex-col gap-1">
                    {data.orchestration.pickerWorkload.slice(0, 6).map((picker: any) => (
                      <div
                        key={picker.pickerUserId || picker.pickerName}
                        className="flex items-center justify-between text-[12px] py-[3px]"
                      >
                        <span className="text-[#14223b] font-medium">{picker.pickerName}</span>
                        <span className="text-[#8b97ac]">
                          {picker.activeOrders} siparis / {picker.openLines} satir
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* A5 Intent + A7 Risk */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* A5 Musteri Intent */}
            <div className={`${CARD} overflow-hidden`}>
              <div className={PANEL_HEAD}>A5 - Musteri 360 / Intent</div>
              <div className="text-[11px] text-[#8b97ac] px-4 pt-2.5">
                Sicak-mesgul musteriler ve sonraki aksiyon - satira tikla: musteri detayini ac
              </div>
              <div className="overflow-auto max-h-[360px]">
                <table className="min-w-full text-[12px]">
                  <thead className="bg-[#fafbfd] sticky top-0">
                    <tr>
                      <th className={`px-3 py-2.5 text-left ${TH}`}>Musteri</th>
                      <th className={`px-3 py-2.5 text-center ${TH}`}>Skor</th>
                      <th className={`px-3 py-2.5 text-center ${TH}`}>Segment</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Sepet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customerIntent.customers.slice(0, 12).map((customer: any) => (
                      <tr
                        key={customer.customerId}
                        className="border-t border-[#f1f4f9] cursor-pointer hover:bg-[#fafbfd] text-[#14223b]"
                        onClick={() => setSelectedCustomerId(customer.customerId)}
                      >
                        <td className="px-3 py-2.5 min-w-0">
                          <div className="font-medium truncate max-w-[220px]">{customer.customerName}</div>
                          <div className="text-[10.5px] text-[#8b97ac] truncate max-w-[220px]">
                            {customer.nextBestAction}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold">{customer.intentScore}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-1 rounded text-[11px] font-semibold ${intentBadgeClass(customer.intentSegment)}`}>
                            {customer.intentSegment}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {formatCurrency(customer.cartAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* A7 Risk / Vade */}
            <div className={`${CARD} overflow-hidden`}>
              <div className={PANEL_HEAD}>A7 - Risk / Vade Motoru</div>
              <div className="text-[11px] text-[#8b97ac] px-4 pt-2.5">
                Siparis onay karar destegi - satira tikla: risk detayini ac
              </div>
              <div className="overflow-auto max-h-[360px]">
                <table className="min-w-full text-[12px]">
                  <thead className="bg-[#fafbfd] sticky top-0">
                    <tr>
                      <th className={`px-3 py-2.5 text-left ${TH}`}>Siparis</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Tutar</th>
                      <th className={`px-3 py-2.5 text-center ${TH}`}>Skor</th>
                      <th className={`px-3 py-2.5 text-right ${TH}`}>Karar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.risk.orders.slice(0, 12).map((risk: any) => (
                      <tr
                        key={risk.orderId}
                        className="border-t border-[#f1f4f9] cursor-pointer hover:bg-[#fafbfd] text-[#14223b]"
                        onClick={() => setSelectedRiskOrderId(risk.orderId)}
                      >
                        <td className="px-3 py-2.5 min-w-0">
                          <div className="font-mono font-semibold">{risk.orderNumber}</div>
                          <div className="text-[10.5px] text-[#8b97ac] truncate max-w-[180px]">
                            {risk.customerName}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(risk.orderAmount)}</td>
                        <td className="px-3 py-2.5 text-center font-semibold">{risk.riskScore}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`px-2 py-1 rounded text-[11px] font-semibold ${decisionBadgeClass(risk.decision)}`}>
                            {risk.decision}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Ikame + Data Quality */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Ikame Motoru */}
            <div className={`${CARD} p-4`}>
              <div className="text-[13.5px] font-semibold text-[#14223b] mb-2.5">Ikame Motoru</div>
              <div className="text-[11px] text-[#8b97ac] mb-2.5">
                Eksik satirlarda anlik alternatif oneriler - kart&apos;a tikla: ikame detayini ac
              </div>
              <div className="flex flex-col gap-2.5 max-h-[360px] overflow-auto">
                {data.substitution.suggestions.slice(0, 8).map((row: any) => (
                  <div
                    key={`${row.mikroOrderNumber}-${row.lineKey}`}
                    className="border border-[#eef1f6] rounded-[9px] p-3 cursor-pointer hover:bg-[#fafbfd] transition-colors"
                    onClick={() => setSelectedSubstitutionKey(`${row.mikroOrderNumber}::${row.lineKey}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        setSelectedSubstitutionKey(`${row.mikroOrderNumber}::${row.lineKey}`);
                      }
                    }}
                  >
                    <div className="text-[12px] font-semibold text-[#14223b]">
                      {row.mikroOrderNumber} - {row.sourceProductCode}
                    </div>
                    <div className="text-[11px] text-[#b45309] mt-1 mb-2">
                      Eksik: {Math.round(row.shortageQty)} / Gerekli: {Math.round(row.neededQty)}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {row.candidates.slice(0, 3).map((candidate: any) => (
                        <div
                          key={candidate.productCode}
                          className="flex items-center justify-between bg-[#fafbfd] border border-[#eef1f6] rounded-[7px] px-2.5 py-[7px] text-[11.5px]"
                        >
                          <span className="text-[#14223b] truncate max-w-[260px]">
                            {candidate.productCode} - {candidate.productName}
                          </span>
                          <span className="font-semibold text-[#047857] shrink-0 ml-2">
                            skor {candidate.score}
                          </span>
                        </div>
                      ))}
                      {row.candidates.length === 0 && (
                        <div className="text-[11.5px] text-[#b91c1c]">Uygun ikame bulunamadi</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Master Data Quality Firewall */}
            <div className={`${CARD} p-4`}>
              <div className="text-[13.5px] font-semibold text-[#14223b] mb-2.5">
                Master Data Quality Firewall
              </div>
              <div className="text-[11px] text-[#8b97ac] mb-2.5">
                Operasyonu bloke eden veri kalitesi kontrolleri - kart&apos;a tikla: ornek kayitlari gor
              </div>
              <div className="flex flex-col gap-2.5 max-h-[360px] overflow-auto">
                {data.dataQuality.checks.map((check: any) => (
                  <div
                    key={check.code}
                    className="flex items-center gap-2.5 border border-[#eef1f6] rounded-[9px] p-3 cursor-pointer hover:bg-[#fafbfd] transition-colors"
                    onClick={() => setSelectedDataCheckCode(check.code)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedDataCheckCode(check.code);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#14223b]">{check.title}</div>
                      <div className="text-[11px] text-[#8b97ac]">{check.description}</div>
                      <div className="text-[11px] text-[#8b97ac] mt-0.5">Severity: {check.severity}</div>
                    </div>
                    <span className="text-[18px] font-semibold text-[#14223b] shrink-0">{check.count}</span>
                    <span
                      className={`px-2 py-1 rounded text-[11px] font-semibold shrink-0 ${
                        check.blocked ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {check.blocked ? 'BLOCK' : 'OK'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Alt bilgi (koyu) */}
          <div className="flex items-center justify-between bg-[#0c2247] rounded-xl px-[18px] py-3.5 flex-wrap gap-2.5">
            <span className="flex items-center gap-2 text-[12.5px] text-[#9bb0d4]">
              <Activity className="w-4 h-4" />
              Son guncelleme: {formatDateShort(data.generatedAt)}
            </span>
            <span className="text-[13px] font-semibold text-white">
              Health Score:{' '}
              <span className="text-[#34d399]">{data.dataQuality.summary.healthScore}</span>
            </span>
          </div>

          {/* ===== Modallar (Classic ile birebir ayni - paylasilan komponent) ===== */}
          <Modal
            isOpen={Boolean(selectedAtpOrder)}
            onClose={() => {
              setSelectedAtpOrderNumber(null);
              setAtpLineQuery('');
              setAtpLineMode('ALL');
            }}
            title={selectedAtpOrder ? `ATP Detay - ${selectedAtpOrder.mikroOrderNumber}` : 'ATP Detay'}
            size="full"
          >
            {selectedAtpOrder && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{selectedAtpOrder.customerName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {selectedAtpOrder.customerCode} | Seri: {selectedAtpOrder.orderSeries}-{selectedAtpOrder.orderSequence} | Workflow: {selectedAtpOrder.workflowStatus}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Tarih: {formatDateShort(selectedAtpOrder.orderDate)} | Teslim: {selectedAtpOrder.deliveryDate ? formatDateShort(selectedAtpOrder.deliveryDate) : '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${coverageBadgeClass(selectedAtpOrder.coverageStatus)}`}>
                        %{selectedAtpOrder.coveredPercent} - {selectedAtpOrder.coverageStatus}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      Kalan: {Math.round(selectedAtpOrder.remainingQty)} | Cover: {Math.round(selectedAtpOrder.coverableQty)} | Shortage: {Math.round(selectedAtpOrder.shortageQty)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={atpLineMode === 'ALL' ? 'primary' : 'secondary'} size="sm" onClick={() => setAtpLineMode('ALL')}>
                      Tum satirlar
                    </Button>
                    <Button variant={atpLineMode === 'SHORTAGE' ? 'primary' : 'secondary'} size="sm" onClick={() => setAtpLineMode('SHORTAGE')}>
                      Sadece eksikler
                    </Button>
                    <Button variant={atpLineMode === 'RESERVE' ? 'primary' : 'secondary'} size="sm" onClick={() => setAtpLineMode('RESERVE')}>
                      Rezerve
                    </Button>
                  </div>
                  <Input
                    value={atpLineQuery}
                    onChange={(event) => setAtpLineQuery(event.target.value)}
                    placeholder="Urun kodu / adi ara"
                    className="w-72"
                  />
                </div>

                <div className="overflow-auto border rounded-xl max-h-[62vh]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Satir</th>
                        <th className="px-3 py-2 text-left">Urun</th>
                        <th className="px-3 py-2 text-right">Kalan</th>
                        <th className="px-3 py-2 text-right">Stok</th>
                        <th className="px-3 py-2 text-right">Own Rez</th>
                        <th className="px-3 py-2 text-right">Diger Rez</th>
                        <th className="px-3 py-2 text-right">ATP</th>
                        <th className="px-3 py-2 text-right">Cover</th>
                        <th className="px-3 py-2 text-right">Shortage</th>
                        <th className="px-3 py-2 text-center">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAtpLines.map((line: any) => (
                        <tr key={line.lineKey} className={`border-t ${Number(line.shortageQty || 0) > 0 ? 'bg-rose-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-600">{line.rowNumber}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{line.productCode}</div>
                            <div className="text-xs text-gray-500">{line.productName}</div>
                            <div className="text-xs text-gray-400">{line.unit}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{Math.round(line.remainingQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(line.stockQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(line.ownReservedQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(line.reservedByOthersQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(line.atpQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(line.coverableQty)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-rose-700">{Math.round(line.shortageQty)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${coverageBadgeClass(line.coverageStatus)}`}>
                              {line.coverageStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredAtpLines.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-3 py-10 text-center text-gray-500">
                            Filtreye uygun satir bulunamadi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(selectedWave)}
            onClose={() => setSelectedWaveId(null)}
            title={selectedWave ? `Dalga Detay - ${selectedWave.waveId}` : 'Dalga Detay'}
            size="xl"
          >
            {selectedWave && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Hacim</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedWave.orderCount} siparis</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedWave.lineCount} satir | {Math.round(selectedWave.totalRemainingQty)} adet</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Sure</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedWave.estimatedMinutes} dk</div>
                    <div className="text-xs text-gray-600 mt-1">Onerilen picker: {selectedWave.recommendedPickerCount}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Shortage</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{Math.round(selectedWave.shortageQty)} adet</div>
                    <div className="text-xs text-gray-600 mt-1">Seri: {selectedWave.orderSeries}</div>
                  </div>
                </div>

                <div className="overflow-auto border rounded-xl max-h-[58vh]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Siparis</th>
                        <th className="px-3 py-2 text-left">Musteri</th>
                        <th className="px-3 py-2 text-right">Satir</th>
                        <th className="px-3 py-2 text-right">Kalan</th>
                        <th className="px-3 py-2 text-right">Shortage</th>
                        <th className="px-3 py-2 text-center">Kapsama</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWave.orders.map((order: any) => (
                        <tr
                          key={order.mikroOrderNumber}
                          className="border-t cursor-pointer hover:bg-gray-50"
                          onClick={() => {
                            setSelectedWaveId(null);
                            setSelectedAtpOrderNumber(order.mikroOrderNumber);
                          }}
                        >
                          <td className="px-3 py-2 font-medium">{order.mikroOrderNumber}</td>
                          <td className="px-3 py-2">{order.customerName}</td>
                          <td className="px-3 py-2 text-right">{order.lineCount}</td>
                          <td className="px-3 py-2 text-right">{Math.round(order.remainingQty)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(order.shortageQty)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${coverageBadgeClass(order.coverageStatus)}`}>
                              {order.coverageStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-gray-500">Siparis satirina tiklayinca ATP detayina gider.</div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(selectedCustomer)}
            onClose={() => setSelectedCustomerId(null)}
            title={selectedCustomer ? `Musteri Intent Detay - ${selectedCustomer.customerName}` : 'Musteri Intent Detay'}
            size="lg"
          >
            {selectedCustomer && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Cari</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedCustomer.customerCode}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedCustomer.sectorCode || '-'}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Skor / Segment</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedCustomer.intentScore}</div>
                    <div className="mt-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${intentBadgeClass(selectedCustomer.intentSegment)}`}>
                        {selectedCustomer.intentSegment}
                      </span>
                      <span className="ml-2 text-xs text-gray-600">Churn: {selectedCustomer.churnRisk}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Recency: {selectedCustomer.recencyDays ?? '-'} gun</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Sepet</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(selectedCustomer.cartAmount)}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedCustomer.cartItems} adet urun</div>
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <div className="text-sm font-semibold text-gray-900">Oncelikli aksiyon</div>
                  <div className="text-sm text-gray-700 mt-2">{selectedCustomer.nextBestAction}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded-xl p-4">
                    <div className="text-sm font-semibold text-gray-900">Aktivite (14 gun)</div>
                    <div className="text-sm text-gray-700 mt-2">Sayfa: {selectedCustomer.pageViews} | Urun: {selectedCustomer.productViews}</div>
                    <div className="text-sm text-gray-700 mt-1">Sepet +: {selectedCustomer.cartAdds} | Arama: {selectedCustomer.searches}</div>
                    <div className="text-sm text-gray-700 mt-1">Aktif: {selectedCustomer.activeMinutes} dk</div>
                  </div>
                  <div className="border rounded-xl p-4">
                    <div className="text-sm font-semibold text-gray-900">Siparis (30 gun)</div>
                    <div className="text-sm text-gray-700 mt-2">Adet: {selectedCustomer.orderCount30d}</div>
                    <div className="text-sm text-gray-700 mt-1">Tutar: {formatCurrency(selectedCustomer.orderAmount30d)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      router.push(`/reports/customer-activity?customerCode=${encodeURIComponent(selectedCustomer.customerCode)}`);
                    }}
                  >
                    Aktivite raporuna git
                  </Button>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(selectedRiskOrder)}
            onClose={() => setSelectedRiskOrderId(null)}
            title={selectedRiskOrder ? `Risk Detay - ${selectedRiskOrder.orderNumber}` : 'Risk Detay'}
            size="lg"
          >
            {selectedRiskOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Musteri</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedRiskOrder.customerName}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedRiskOrder.customerCode}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Siparis</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(selectedRiskOrder.orderAmount)}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedRiskOrder.itemCount} satir | {selectedRiskOrder.pendingDays} gun bekliyor</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Karar</div>
                    <div className="mt-1">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${decisionBadgeClass(selectedRiskOrder.decision)}`}>
                        {selectedRiskOrder.decision}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">Skor: {selectedRiskOrder.riskScore}</div>
                    {selectedRiskOrder.classification && (
                      <div className="text-xs text-gray-600 mt-1">Sinif: {selectedRiskOrder.classification}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4">
                    <div className="text-xs text-gray-500">Vadesi gecmis</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(selectedRiskOrder.pastDueBalance)}</div>
                  </div>
                  <div className="border rounded-xl p-4">
                    <div className="text-xs text-gray-500">Vadesi gelmemis</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(selectedRiskOrder.notDueBalance)}</div>
                  </div>
                  <div className="border rounded-xl p-4">
                    <div className="text-xs text-gray-500">Toplam bakiye</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(selectedRiskOrder.totalBalance)}</div>
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <div className="text-sm font-semibold text-gray-900">Gerekceler</div>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-700">
                    {(selectedRiskOrder.reasons || []).map((reason: string, idx: number) => (
                      <li key={`${idx}-${reason}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(selectedSubstitution)}
            onClose={() => setSelectedSubstitutionKey(null)}
            title={
              selectedSubstitution
                ? `Ikame Detay - ${selectedSubstitution.mikroOrderNumber} / ${selectedSubstitution.sourceProductCode}`
                : 'Ikame Detay'
            }
            size="xl"
          >
            {selectedSubstitution && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Siparis</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedSubstitution.mikroOrderNumber}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedSubstitution.customerName}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Kaynak urun</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedSubstitution.sourceProductCode}</div>
                    <div className="text-xs text-gray-600 mt-1">{selectedSubstitution.sourceProductName}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Ihtiyac</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">
                      Eksik: {Math.round(selectedSubstitution.shortageQty)} / {Math.round(selectedSubstitution.neededQty)}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{selectedSubstitution.categoryName || '-'}</div>
                  </div>
                </div>

                <div className="overflow-auto border rounded-xl max-h-[58vh]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Aday</th>
                        <th className="px-3 py-2 text-right">Stok</th>
                        <th className="px-3 py-2 text-right">Skor</th>
                        <th className="px-3 py-2 text-left">Neden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSubstitution.candidates.map((candidate: any) => (
                        <tr key={candidate.productCode} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{candidate.productCode}</div>
                            <div className="text-xs text-gray-500">{candidate.productName}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{Math.round(candidate.stockQty)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{candidate.score}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{candidate.reason}</td>
                        </tr>
                      ))}
                      {selectedSubstitution.candidates.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-10 text-center text-rose-600">
                            Uygun ikame bulunamadi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedSubstitutionKey(null);
                      setSelectedAtpOrderNumber(selectedSubstitution.mikroOrderNumber);
                    }}
                  >
                    ATP siparis detayini ac
                  </Button>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(selectedDataCheck)}
            onClose={() => setSelectedDataCheckCode(null)}
            title={selectedDataCheck ? `Data Quality Detay - ${selectedDataCheck.title}` : 'Data Quality Detay'}
            size="xl"
          >
            {selectedDataCheck && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Kod</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedDataCheck.code}</div>
                    <div className="text-xs text-gray-600 mt-1">Severity: {selectedDataCheck.severity}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Durum</div>
                    <div className={`text-sm font-semibold mt-1 ${selectedDataCheck.blocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {selectedDataCheck.blocked ? 'BLOCK' : 'OK'}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Adet: {selectedDataCheck.count}</div>
                  </div>
                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="text-xs text-gray-500">Aciklama</div>
                    <div className="text-sm text-gray-700 mt-1">{selectedDataCheck.description}</div>
                  </div>
                </div>

                <div className="overflow-auto border rounded-xl max-h-[58vh]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Urun</th>
                        <th className="px-3 py-2 text-left">Detay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedDataCheck.sample || []).map((row: any) => (
                        <tr key={`${row.code}-${row.detail}`} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{row.code}</div>
                            <div className="text-xs text-gray-500">{row.name}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{row.detail}</td>
                        </tr>
                      ))}
                      {(!selectedDataCheck.sample || selectedDataCheck.sample.length === 0) && (
                        <tr>
                          <td colSpan={2} className="px-3 py-10 text-center text-gray-500">
                            Ornek kayit bulunamadi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {selectedDataCheck.code === 'MISSING_IMAGE' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedDataCheckCode(null);
                        router.push('/warehouse/image-issues');
                      }}
                    >
                      Resim hatalarina git
                    </Button>
                  )}
                  {selectedDataCheck.code === 'MISSING_SHELF_WITH_STOCK' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedDataCheckCode(null);
                        router.push('/warehouse');
                      }}
                    >
                      Depo ekranina git
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}
