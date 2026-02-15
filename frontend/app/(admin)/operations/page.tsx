'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, Layers, RefreshCw, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
                    {data.atp.orders.slice(0, 14).map((order: any) => (
                      <tr key={order.mikroOrderNumber} className="border-b">
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
                {data.orchestration.waves.slice(0, 6).map((wave: any) => (
                  <div key={wave.waveId} className="border rounded-lg p-3">
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
                      <tr key={customer.customerId} className="border-b">
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
                      <tr key={risk.orderId} className="border-b">
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
              <div className="space-y-3 max-h-[360px] overflow-auto">
                {data.substitution.suggestions.slice(0, 8).map((row: any) => (
                  <div key={`${row.mikroOrderNumber}-${row.lineKey}`} className="border rounded-lg p-3">
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
              <div className="space-y-2 max-h-[360px] overflow-auto">
                {data.dataQuality.checks.map((check: any) => (
                  <div key={check.code} className="border rounded-lg p-3 flex items-start justify-between gap-3">
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
        </>
      )}
    </div>
  );
}

