'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, Layers, RefreshCw, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import adminApi from '@/lib/api/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store/authStore';

type CommandCenterData = Awaited<ReturnType<typeof adminApi.getOperationsCommandCenter>>['data'];

const coverageBadgeClass = (status: string) => {
  if (status === 'FULL') return 'bg-emerald-100 text-emerald-700';
  if (status === 'PARTIAL') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
};

const decisionBadgeClass = (decision: string) => {
  if (decision === 'AUTO_APPROVE') return 'bg-emerald-100 text-emerald-700';
  if (decision === 'MANUAL_REVIEW') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
};

const intentBadgeClass = (segment: string) => {
  if (segment === 'HOT') return 'bg-emerald-100 text-emerald-700';
  if (segment === 'WARM') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-200 text-slate-700';
};

export default function OperationsCommandCenterPage() {
  const router = useRouter();
  const { loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionLoading } = usePermissions();

  const [seriesText, setSeriesText] = useState('');
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAtpOrderNumber, setSelectedAtpOrderNumber] = useState<string | null>(null);
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedRiskOrderId, setSelectedRiskOrderId] = useState<string | null>(null);
  const [selectedSubstitutionKey, setSelectedSubstitutionKey] = useState<string | null>(null);
  const [selectedDataCheckCode, setSelectedDataCheckCode] = useState<string | null>(null);

  const [atpLineQuery, setAtpLineQuery] = useState('');
  const [atpLineMode, setAtpLineMode] = useState<'ALL' | 'SHORTAGE' | 'RESERVE'>('ALL');

  const canAccess = useMemo(() => {
    if (permissionLoading) return true;
    return (
      hasPermission('admin:order-tracking') ||
      hasPermission('admin:orders') ||
      hasPermission('reports:customer-activity') ||
      hasPermission('admin:vade')
    );
  }, [permissionLoading, hasPermission]);

  const parsedSeries = useMemo(() => {
    return seriesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [seriesText]);

  const selectedAtpOrder = useMemo(() => {
    if (!data || !selectedAtpOrderNumber) return null;
    return data.atp.orders.find((order: any) => order.mikroOrderNumber === selectedAtpOrderNumber) || null;
  }, [data, selectedAtpOrderNumber]);

  const selectedWave = useMemo(() => {
    if (!data || !selectedWaveId) return null;
    return data.orchestration.waves.find((wave: any) => wave.waveId === selectedWaveId) || null;
  }, [data, selectedWaveId]);

  const selectedCustomer = useMemo(() => {
    if (!data || !selectedCustomerId) return null;
    return data.customerIntent.customers.find((customer: any) => customer.customerId === selectedCustomerId) || null;
  }, [data, selectedCustomerId]);

  const selectedRiskOrder = useMemo(() => {
    if (!data || !selectedRiskOrderId) return null;
    return data.risk.orders.find((order: any) => order.orderId === selectedRiskOrderId) || null;
  }, [data, selectedRiskOrderId]);

  const selectedSubstitution = useMemo(() => {
    if (!data || !selectedSubstitutionKey) return null;
    return (
      data.substitution.suggestions.find(
        (row: any) => `${row.mikroOrderNumber}::${row.lineKey}` === selectedSubstitutionKey
      ) || null
    );
  }, [data, selectedSubstitutionKey]);

  const selectedDataCheck = useMemo(() => {
    if (!data || !selectedDataCheckCode) return null;
    return data.dataQuality.checks.find((check: any) => check.code === selectedDataCheckCode) || null;
  }, [data, selectedDataCheckCode]);

  const filteredAtpLines = useMemo(() => {
    if (!selectedAtpOrder) return [];
    const term = atpLineQuery.trim().toLowerCase();
    let lines = Array.isArray(selectedAtpOrder.lines) ? [...selectedAtpOrder.lines] : [];
    if (term) {
      lines = lines.filter((line: any) => {
        const code = String(line.productCode || '').toLowerCase();
        const name = String(line.productName || '').toLowerCase();
        return code.includes(term) || name.includes(term);
      });
    }
    if (atpLineMode === 'SHORTAGE') lines = lines.filter((line: any) => Number(line.shortageQty || 0) > 0);
    if (atpLineMode === 'RESERVE') {
      lines = lines.filter(
        (line: any) => Number(line.ownReservedQty || 0) > 0 || Number(line.reservedByOthersQty || 0) > 0
      );
    }
    lines.sort((a: any, b: any) => {
      const aShort = Number(a.shortageQty || 0);
      const bShort = Number(b.shortageQty || 0);
      if (bShort !== aShort) return bShort - aShort;
      return Number(b.remainingQty || 0) - Number(a.remainingQty || 0);
    });
    return lines;
  }, [selectedAtpOrder, atpLineQuery, atpLineMode]);

  const fetchData = async (showSpinner: boolean) => {
    try {
      setError(null);
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      const response = await adminApi.getOperationsCommandCenter({
        series: parsedSeries,
        orderLimit: 150,
        customerLimit: 80,
      });
      setData(response.data);
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.error || fetchError?.message || 'Veriler alinamadi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (permissionLoading) return;
    if (!canAccess) {
      router.push('/dashboard');
      return;
    }
    fetchData(true);
  }, [permissionLoading, canAccess, parsedSeries.join('|')]);

  if (!canAccess && !permissionLoading) return null;

  const summaryCards = data
    ? [
        {
          title: 'Acil ATP',
          value: `${data.summary.lowCoverageOrderCount} siparis`,
          helper: `Toplam acik siparis: ${data.summary.openOrderCount}`,
          icon: <Layers className="w-5 h-5" />,
        },
        {
          title: 'Kritik Risk',
          value: `${data.summary.highRiskOrderCount} siparis`,
          helper: `Toplam shortage: ${Math.round(data.summary.shortageQty)} adet`,
          icon: <ShieldAlert className="w-5 h-5" />,
        },
        {
          title: 'Sicak Musteri',
          value: `${data.summary.hotCustomerCount} musteri`,
          helper: `Aktif picker: ${data.summary.activePickerCount}`,
          icon: <Users className="w-5 h-5" />,
        },
        {
          title: 'Ikame Ihtiyaci',
          value: `${data.summary.substitutionNeedCount} satir`,
          helper: `Data block: ${data.summary.blockedDataChecks}`,
          icon: <Sparkles className="w-5 h-5" />,
        },
      ]
    : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operasyon Komuta Merkezi</h1>
          <p className="text-sm text-gray-600">
            A2 ATP/Tahsis, A3 Depo Orkestrasyonu, A5 Musteri Intent, A7 Risk/Vade, Ikame Motoru ve Data Quality Firewall
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={seriesText}
            onChange={(event) => setSeriesText(event.target.value)}
            placeholder="Seriler (ornek: HENDEK,ADAPAZARI)"
            className="w-72"
          />
          <Button onClick={() => fetchData(false)} disabled={loading || refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {loading && (
        <Card>
          <div className="py-12 text-center text-gray-500">Komuta merkezi verileri yukleniyor...</div>
        </Card>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {summaryCards.map((card) => (
              <Card key={card.title} className="border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.helper}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-700">{card.icon}</div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="A2 ATP / Tahsis" subtitle="Webdeki siparislerin mobil/kiosk ile ortak stok gercegi">
              <div className="text-xs text-gray-500 mb-3">Satira tikla: siparis detayini ac</div>
              <div className="overflow-auto max-h-[460px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Siparis</th>
                      <th className="px-2 py-2 text-left">Musteri</th>
                      <th className="px-2 py-2 text-right">Kalan</th>
                      <th className="px-2 py-2 text-right">Shortage</th>
                      <th className="px-2 py-2 text-center">Kapsama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atp.orders.slice(0, 24).map((order: any) => (
                      <tr
                        key={order.mikroOrderNumber}
                        className="border-b cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setAtpLineQuery('');
                          setAtpLineMode('ALL');
                          setSelectedAtpOrderNumber(order.mikroOrderNumber);
                        }}
                      >
                        <td className="px-2 py-2 font-medium">{order.mikroOrderNumber}</td>
                        <td className="px-2 py-2">{order.customerName}</td>
                        <td className="px-2 py-2 text-right">{Math.round(order.remainingQty)}</td>
                        <td className="px-2 py-2 text-right">{Math.round(order.shortageQty)}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${coverageBadgeClass(order.coverageStatus)}`}>
                            %{order.coveredPercent} - {order.coverageStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="A3 Depo Orkestrasyonu" subtitle="Dalga planlama + picker is yuku">
              <div className="space-y-3 max-h-[460px] overflow-auto">
                {data.orchestration.waves.slice(0, 10).map((wave: any) => (
                  <div
                    key={wave.waveId}
                    className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    onClick={() => setSelectedWaveId(wave.waveId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedWaveId(wave.waveId);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{wave.waveId}</div>
                      <div className="text-xs text-gray-600">{wave.orderCount} siparis | {wave.lineCount} satir</div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Tahmini sure: {wave.estimatedMinutes} dk | Onerilen picker: {wave.recommendedPickerCount}
                    </div>
                  </div>
                ))}
                <div className="border-t pt-3">
                  <div className="text-sm font-semibold mb-2">Aktif pickerler</div>
                  <div className="space-y-2">
                    {data.orchestration.pickerWorkload.slice(0, 6).map((picker: any) => (
                      <div key={picker.pickerUserId || picker.pickerName} className="text-xs flex items-center justify-between">
                        <span>{picker.pickerName}</span>
                        <span className="text-gray-600">{picker.activeOrders} siparis / {picker.openLines} satir</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="A5 Musteri 360 / Intent" subtitle="Sicak-mesgul musteriler ve sonraki aksiyon">
              <div className="text-xs text-gray-500 mb-3">Satira tikla: musteri detayini ac</div>
              <div className="overflow-auto max-h-[360px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Musteri</th>
                      <th className="px-2 py-2 text-right">Skor</th>
                      <th className="px-2 py-2 text-center">Segment</th>
                      <th className="px-2 py-2 text-right">Sepet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customerIntent.customers.slice(0, 12).map((customer: any) => (
                      <tr
                        key={customer.customerId}
                        className="border-b cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedCustomerId(customer.customerId)}
                      >
                        <td className="px-2 py-2">
                          <div className="font-medium">{customer.customerName}</div>
                          <div className="text-xs text-gray-500">{customer.nextBestAction}</div>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{customer.intentScore}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${intentBadgeClass(customer.intentSegment)}`}>
                            {customer.intentSegment}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">{formatCurrency(customer.cartAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="A7 Risk / Vade Motoru" subtitle="Siparis onay karar destegi">
              <div className="text-xs text-gray-500 mb-3">Satira tikla: risk detayini ac</div>
              <div className="overflow-auto max-h-[360px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Siparis</th>
                      <th className="px-2 py-2 text-right">Tutar</th>
                      <th className="px-2 py-2 text-right">Skor</th>
                      <th className="px-2 py-2 text-center">Karar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.risk.orders.slice(0, 12).map((risk: any) => (
                      <tr
                        key={risk.orderId}
                        className="border-b cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedRiskOrderId(risk.orderId)}
                      >
                        <td className="px-2 py-2">
                          <div className="font-medium">{risk.orderNumber}</div>
                          <div className="text-xs text-gray-500">{risk.customerName}</div>
                        </td>
                        <td className="px-2 py-2 text-right">{formatCurrency(risk.orderAmount)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{risk.riskScore}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${decisionBadgeClass(risk.decision)}`}>
                            {risk.decision}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Ikame Motoru" subtitle="Eksik satirlarda anlik alternatif oneriler">
              <div className="text-xs text-gray-500 mb-3">Kart'a tikla: ikame detayini ac</div>
              <div className="space-y-3 max-h-[360px] overflow-auto">
                {data.substitution.suggestions.slice(0, 8).map((row: any) => (
                  <div
                    key={`${row.mikroOrderNumber}-${row.lineKey}`}
                    className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    onClick={() => setSelectedSubstitutionKey(`${row.mikroOrderNumber}::${row.lineKey}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        setSelectedSubstitutionKey(`${row.mikroOrderNumber}::${row.lineKey}`);
                      }
                    }}
                  >
                    <div className="text-sm font-semibold">{row.mikroOrderNumber} - {row.sourceProductCode}</div>
                    <div className="text-xs text-gray-600">
                      Eksik: {Math.round(row.shortageQty)} / Gerekli: {Math.round(row.neededQty)}
                    </div>
                    <div className="mt-2 space-y-1">
                      {row.candidates.slice(0, 3).map((candidate: any) => (
                        <div key={candidate.productCode} className="text-xs flex items-center justify-between">
                          <span>{candidate.productCode} - {candidate.productName}</span>
                          <span className="text-gray-600">Skor {candidate.score}</span>
                        </div>
                      ))}
                      {row.candidates.length === 0 && (
                        <div className="text-xs text-rose-600">Uygun ikame bulunamadi</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Master Data Quality Firewall" subtitle="Operasyonu bloke eden veri kalitesi kontrolleri">
              <div className="text-xs text-gray-500 mb-3">Kart'a tikla: ornek kayitlari gor</div>
              <div className="space-y-2 max-h-[360px] overflow-auto">
                {data.dataQuality.checks.map((check: any) => (
                  <div
                    key={check.code}
                    className="border rounded-lg p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    onClick={() => setSelectedDataCheckCode(check.code)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedDataCheckCode(check.code);
                    }}
                  >
                    <div>
                      <div className="text-sm font-semibold">{check.title}</div>
                      <div className="text-xs text-gray-600">{check.description}</div>
                      <div className="text-xs text-gray-500 mt-1">Severity: {check.severity}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">{check.count}</div>
                      <div className={`text-xs font-semibold ${check.blocked ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {check.blocked ? 'BLOCK' : 'OK'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Son guncelleme: {formatDateShort(data.generatedAt)}
              </span>
              <span>Health Score: {data.dataQuality.summary.healthScore}</span>
            </div>
          </Card>

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
