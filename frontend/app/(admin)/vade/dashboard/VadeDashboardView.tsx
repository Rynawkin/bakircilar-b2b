'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ListChecks,
  AlertTriangle,
  Wallet,
  RefreshCw,
  CalendarClock,
  PieChart as PieIcon,
  BarChart3,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import { VadeDashboard } from '@/types';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const DONUT_COLORS = ['#15356b', '#1c4585', '#2f6fb0', '#4f9bd6', '#7bb8e0', '#a9d0ea', '#c9a227', '#e0a458', '#9aa7bd'];

// Kompakt TL (eksen/etiket icin): 1.234.567 -> 1,2M
const compactTL = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `${Math.round(n / 1_000)}B`;
  return String(Math.round(n));
};

/** Inline SVG donut — bagimliliksiz */
function Donut({ items }: { items: { label: string; amount: number }[] }) {
  const total = items.reduce((s, x) => s + x.amount, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let cum = 0;
  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-[150px] text-[12px] text-[#8b97ac]">
        Gosterilecek veri yok
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <svg width={150} height={150} viewBox="0 0 150 150" className="shrink-0">
        <circle cx={75} cy={75} r={R} fill="none" stroke="#eef1f6" strokeWidth={20} />
        {items.map((it, i) => {
          const frac = it.amount / total;
          const dash = frac * C;
          const seg = (
            <circle
              key={i}
              cx={75}
              cy={75}
              r={R}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={20}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-cum}
              transform="rotate(-90 75 75)"
              strokeLinecap="butt"
            >
              <title>{`${it.label}: ${formatCurrency(it.amount)} (%${Math.round(frac * 100)})`}</title>
            </circle>
          );
          cum += dash;
          return seg;
        })}
        <text x={75} y={71} textAnchor="middle" className="fill-[#14223b]" style={{ fontSize: 15, fontWeight: 700 }}>
          {compactTL(total)}
        </text>
        <text x={75} y={88} textAnchor="middle" className="fill-[#8b97ac]" style={{ fontSize: 9 }}>
          toplam
        </text>
      </svg>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {items.map((it, i) => {
          const pct = Math.round((it.amount / total) * 100);
          return (
            <div key={i} className="flex items-center gap-2 text-[11.5px] min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-[#51607a] truncate flex-1" title={it.label}>{it.label}</span>
              <span className="text-[#14223b] font-medium tabular-nums shrink-0">{formatCurrency(it.amount)}</span>
              <span className="text-[#8b97ac] tabular-nums shrink-0 w-9 text-right">%{pct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AGING_META: { key: 'd0_30' | 'd31_60' | 'd61_90' | 'd91_180' | 'd181_365' | 'd365plus'; label: string; color: string }[] = [
  { key: 'd0_30', label: '1-30 gun', color: '#16a34a' },
  { key: 'd31_60', label: '31-60 gun', color: '#65a30d' },
  { key: 'd61_90', label: '61-90 gun', color: '#ca8a04' },
  { key: 'd91_180', label: '91-180 gun', color: '#ea580c' },
  { key: 'd181_365', label: '181-365 gun', color: '#dc2626' },
  { key: 'd365plus', label: '365+ gun', color: '#991b1b' },
];

export default function VadeDashboardView() {
  const router = useRouter();
  const [data, setData] = useState<VadeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectorCode, setSectorCode] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [filterOptions, setFilterOptions] = useState<{ sectorCodes: string[]; groupCodes: string[] }>({ sectorCodes: [], groupCodes: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getVadeDashboard({
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
      });
      setData(res);
    } catch (error) {
      console.error('Vade dashboard error:', error);
      toast.error('Panel verisi yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [sectorCode, groupCode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    let mounted = true;
    adminApi.getVadeFilters()
      .then((d) => { if (mounted) setFilterOptions({ sectorCodes: d.sectorCodes || [], groupCodes: d.groupCodes || [] }); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const agingMax = useMemo(() => {
    if (!data?.aging) return 0;
    return Math.max(...AGING_META.map((m) => data.aging![m.key].amount), 1);
  }, [data]);

  const timelineMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.upcomingTimeline.map((t) => t.amount), 1);
  }, [data]);

  const fieldCls = 'h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';
  const kpis = data?.kpis;
  const conc = data?.concentration;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* Baslik + geri + filtreler */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/vade')}
              className="inline-flex items-center gap-1 text-[12.5px] text-[#51607a] hover:text-[#15356b]"
            >
              <ArrowLeft width={15} height={15} stroke="currentColor" strokeWidth={2} /> Liste
            </button>
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0 mt-1">Vade Paneli</h1>
          <p className="text-[13px] text-[#8b97ac] mt-1.5">Alacak yaslandirmasi, yogunlasma ve vade takvimi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={fieldCls} value={sectorCode} onChange={(e) => setSectorCode(e.target.value)}>
            <option value="">Tum Sektorler</option>
            {filterOptions.sectorCodes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={fieldCls} value={groupCode} onChange={(e) => setGroupCode(e.target.value)}>
            <option value="">Tum Gruplar</option>
            {filterOptions.groupCodes.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <RefreshCw width={15} height={15} stroke="currentColor" strokeWidth={2} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
      </div>

      {/* KPI kartlari */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[12px] text-[#51607a] font-medium">
            <ListChecks width={13} height={13} stroke="currentColor" strokeWidth={2.2} /> Toplam Cari
          </div>
          <div className="text-[23px] font-semibold text-[#14223b] mt-2">{kpis?.count ?? 0}</div>
        </div>
        <div className="bg-white border border-[#fecaca] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#b91c1c] font-medium">
            <AlertTriangle width={13} height={13} stroke="currentColor" strokeWidth={2.2} /> Vadesi Gecen
          </div>
          <div className="text-[23px] font-semibold text-[#b91c1c] mt-2">{formatCurrency(kpis?.overdue ?? 0)}</div>
        </div>
        <div className="bg-white border border-[#d6e0f1] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#1c4585] font-medium">
            <CalendarClock width={13} height={13} stroke="currentColor" strokeWidth={2.2} /> Vadesi Gelmemis
          </div>
          <div className="text-[23px] font-semibold text-[#1c4585] mt-2">{formatCurrency(kpis?.upcoming ?? 0)}</div>
        </div>
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[12px] text-[#51607a] font-medium">
            <Wallet width={13} height={13} stroke="currentColor" strokeWidth={2.2} /> Toplam Bakiye
          </div>
          <div className="text-[23px] font-semibold text-[#14223b] mt-2">{formatCurrency(kpis?.total ?? 0)}</div>
        </div>
      </div>

      {loading && !data ? (
        <div className={`${CARD} p-10 text-center text-[13px] text-[#8b97ac]`}>Yukleniyor...</div>
      ) : (
        <>
          {/* Yaslandirma bar + Pareto */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mb-4">
            <div className={`${CARD} p-4 lg:col-span-2`}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14223b] mb-3">
                <BarChart3 width={15} height={15} stroke="currentColor" strokeWidth={2} /> Vadesi Gecen Yaslandirma
              </div>
              <div className="flex flex-col gap-2.5">
                {AGING_META.map((m) => {
                  const b = data?.aging?.[m.key] || { amount: 0, count: 0 };
                  const w = agingMax > 0 ? Math.max((b.amount / agingMax) * 100, b.amount > 0 ? 2 : 0) : 0;
                  return (
                    <div key={m.key} className="flex items-center gap-3">
                      <div className="w-[78px] text-[11.5px] text-[#51607a] shrink-0">{m.label}</div>
                      <div className="flex-1 h-6 bg-[#f4f6fa] rounded-md overflow-hidden relative">
                        <div className="h-full rounded-md transition-all" style={{ width: `${w}%`, background: m.color }} />
                      </div>
                      <div className="w-[120px] text-right text-[11.5px] text-[#14223b] font-medium tabular-nums shrink-0">
                        {formatCurrency(b.amount)}
                      </div>
                      <div className="w-[54px] text-right text-[11px] text-[#8b97ac] tabular-nums shrink-0">{b.count} cari</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${CARD} p-4`}>
              <div className="text-[13px] font-semibold text-[#14223b] mb-3">Yogunlasma (Pareto)</div>
              {conc && conc.overdueCount > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-[12px] text-[#51607a] leading-relaxed">
                    Vadesi gecmis <b className="text-[#14223b]">{conc.overdueCount}</b> cari.
                    En buyuk <b>20</b> cari toplamin{' '}
                    <b className="text-[#b91c1c]">%{kpis && kpis.overdue > 0 ? Math.round((conc.top20 / kpis.overdue) * 100) : 0}</b>&apos;ini,{' '}
                    en buyuk <b>50</b> cari{' '}
                    <b className="text-[#b91c1c]">%{kpis && kpis.overdue > 0 ? Math.round((conc.top50 / kpis.overdue) * 100) : 0}</b>&apos;ini olusturuyor.
                  </p>
                  {([{ n: 10, v: conc.top10 }, { n: 20, v: conc.top20 }, { n: 50, v: conc.top50 }]).map((r) => {
                    const pct = kpis && kpis.overdue > 0 ? Math.min(Math.round((r.v / kpis.overdue) * 100), 100) : 0;
                    return (
                      <div key={r.n} className="flex items-center gap-2">
                        <div className="w-[46px] text-[11.5px] text-[#51607a] shrink-0">En buyuk {r.n}</div>
                        <div className="flex-1 h-5 bg-[#f4f6fa] rounded-md overflow-hidden">
                          <div className="h-full bg-[#15356b] rounded-md" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-[42px] text-right text-[11.5px] font-medium text-[#14223b] tabular-nums shrink-0">%{pct}</div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => router.push('/vade?overdue=1')}
                    className="mt-1 inline-flex items-center justify-center gap-1 bg-[#15356b] text-white rounded-lg px-3 py-2 text-[12px] font-medium hover:bg-[#1c4585]"
                  >
                    Once Ara Listesi
                  </button>
                </div>
              ) : (
                <div className="text-[12px] text-[#8b97ac] py-6 text-center">Vadesi gecen cari yok</div>
              )}
            </div>
          </div>

          {/* Sektor + Grup donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4">
            <div className={`${CARD} p-4`}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14223b] mb-3">
                <PieIcon width={15} height={15} stroke="currentColor" strokeWidth={2} /> Sektor Bazli Vadesi Gecen
              </div>
              <Donut items={(data?.sectorDistribution || []).map((d) => ({ label: d.label, amount: d.amount }))} />
            </div>
            <div className={`${CARD} p-4`}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14223b] mb-3">
                <PieIcon width={15} height={15} stroke="currentColor" strokeWidth={2} /> Grup Bazli Vadesi Gecen
              </div>
              <Donut items={(data?.groupDistribution || []).map((d) => ({ label: d.label, amount: d.amount }))} />
            </div>
          </div>

          {/* 30 gunluk vade takvimi */}
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14223b] mb-1">
              <CalendarClock width={15} height={15} stroke="currentColor" strokeWidth={2} /> {data?.upcomingWindowDays ?? 30} Gunluk Vade Takvimi (vadesi gelmemis)
            </div>
            <p className="text-[11.5px] text-[#8b97ac] mb-3">Bugunden itibaren gunlere gore tahsil edilecek tutar</p>
            {data && data.upcomingTimeline.some((t) => t.amount > 0) ? (
              <div className="flex items-end gap-[3px] h-[160px]">
                {data.upcomingTimeline.map((t, i) => {
                  const h = timelineMax > 0 ? Math.max((t.amount / timelineMax) * 140, t.amount > 0 ? 3 : 0) : 0;
                  const d = new Date(t.date);
                  const dayLabel = `${d.getDate()}`;
                  return (
                    <div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                      <div
                        className="w-full max-w-[16px] rounded-t bg-[#2f6fb0] group-hover:bg-[#15356b] transition-colors"
                        style={{ height: `${h}px` }}
                      >
                        <title>{`${t.date}: ${formatCurrency(t.amount)}`}</title>
                      </div>
                      <div className="text-[8.5px] text-[#8b97ac] mt-1 h-3">{i % 3 === 0 ? dayLabel : ''}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[#8b97ac] py-8 text-center">Onumuzdeki {data?.upcomingWindowDays ?? 30} gunde vadesi gelen tutar yok</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
