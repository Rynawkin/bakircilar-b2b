'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, StickyNote, UserCheck, Activity, RefreshCw, AlertTriangle, Info, XCircle } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { VadeManagement } from '@/types';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const fieldCls = 'h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';
const DAYS_OPTIONS = [7, 30, 90, 365];

const scoreColor = (s: number) => (s >= 30 ? '#16a34a' : s >= 20 ? '#f59e0b' : s >= 10 ? '#ea580c' : '#dc2626');
const issueStyle = {
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', Icon: AlertTriangle },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', Icon: Info },
  error: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', Icon: XCircle },
} as const;

export default function VadeManagementView() {
  const router = useRouter();
  const [data, setData] = useState<VadeManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      setData(await adminApi.getVadeManagement({ days }));
    } catch (error: any) {
      if (error?.response?.status === 403) setDenied(true);
      else console.error('Vade management error:', error);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const trendMax = useMemo(() => Math.max(...(data?.dailyTrend || []).map((t) => t.notes), 1), [data]);

  if (denied) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <button type="button" onClick={() => router.push('/vade')} className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-[#51607a] hover:text-[#15356b]">
          <ArrowLeft width={15} height={15} stroke="currentColor" strokeWidth={2} /> Liste
        </button>
        <div className={`${CARD} p-10 text-center`}>
          <div className="text-[15px] font-semibold text-[#14223b]">Erisim Engellendi</div>
          <p className="mt-1.5 text-[13px] text-[#8b97ac]">Bu rapora sadece yonetici ve muhasebe erisebilir.</p>
        </div>
      </div>
    );
  }

  const kpi = (label: string, value: string | number, sub: string, Icon: any) => (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#51607a]"><Icon width={13} height={13} stroke="currentColor" strokeWidth={2.2} /> {label}</div>
      <div className="mt-2 text-[23px] font-semibold text-[#14223b]">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#8b97ac]">{sub}</div>}
    </div>
  );
  const th = 'px-3 py-2.5 text-left font-medium text-[#8b97ac] border-b border-[#eef1f6]';
  const td = 'px-3 py-2.5 border-b border-[#f2f4f8]';

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <button type="button" onClick={() => router.push('/vade')} className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-[#51607a] hover:text-[#15356b]">
            <ArrowLeft width={15} height={15} stroke="currentColor" strokeWidth={2} /> Liste
          </button>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">Yonetim & Performans</h1>
          <p className="mt-1.5 text-[13px] text-[#8b97ac]">Personel aktivitesi, verimlilik ve sorun tespiti</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${fieldCls} cursor-pointer`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS_OPTIONS.map((d) => <option key={d} value={d}>Son {d} gun</option>)}
          </select>
          <button type="button" onClick={fetchData} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
            <RefreshCw width={15} height={15} stroke="currentColor" strokeWidth={2} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className={`${CARD} p-10 text-center text-[13px] text-[#8b97ac]`}>Yukleniyor...</div>
      ) : data ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {kpi('Toplam Personel', data.summary.totalUsers, `${data.summary.activeUsers} aktif`, Users)}
            {kpi('Toplam Not', data.summary.totalNotes, `Ort. ${data.summary.totalUsers > 0 ? Math.round((data.summary.totalNotes / data.summary.totalUsers) * 10) / 10 : 0} not/kisi`, StickyNote)}
            {kpi('Toplam Atama', data.summary.totalAssignments, '', UserCheck)}
            {kpi('Aktif Personel', data.summary.activeUsers, 'en az 1 not', Activity)}
          </div>

          {/* Sorun tespiti */}
          {data.issues.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3.5 md:grid-cols-3">
              {data.issues.map((iss, i) => {
                const st = issueStyle[iss.type];
                return (
                  <div key={i} className="rounded-xl border p-4" style={{ background: st.bg, borderColor: st.border }}>
                    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: st.text }}>
                      <st.Icon width={15} height={15} stroke="currentColor" strokeWidth={2} /> {iss.title} ({iss.names.length})
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-[#51607a]">{iss.names.join(', ')}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gunluk aktivite trendi */}
          <div className={`${CARD} mb-4 p-4`}>
            <div className="mb-3 text-[13px] font-semibold text-[#14223b]">Gunluk Not Aktivitesi</div>
            {data.dailyTrend.length > 0 ? (
              <div className="flex h-[150px] items-end gap-[3px]">
                {data.dailyTrend.map((t) => {
                  const h = Math.max((t.notes / trendMax) * 130, t.notes > 0 ? 3 : 0);
                  return (
                    <div key={t.date} className="group flex h-full flex-1 flex-col items-center justify-end">
                      <div className="w-full max-w-[18px] rounded-t bg-[#2f6fb0] group-hover:bg-[#15356b]" style={{ height: `${h}px` }}>
                        <title>{`${t.date}: ${t.notes} not`}</title>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[12px] text-[#8b97ac]">Bu donemde aktivite yok</div>
            )}
          </div>

          {/* Personel performans */}
          <div className={`${CARD} overflow-hidden`}>
            <div className="border-b border-[#eef1f6] px-4 py-3 text-[13px] font-semibold text-[#14223b]">Personel Performansi</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead><tr className="bg-[#fafbfd]">
                  <th className={`${th} w-8`}>#</th><th className={th}>Personel</th>
                  <th className={`${th} text-right`}>Not</th><th className={`${th} text-right`}>Atanmis Musteri</th>
                  <th className={`${th} text-right`}>Verimlilik</th><th className={`${th} text-center`}>Aktivite Skoru</th>
                  <th className={th}>Son Aktivite</th>
                </tr></thead>
                <tbody>
                  {data.topPerformers.map((p, i) => (
                    <tr key={p.id} className="hover:bg-[#fafbfd]">
                      <td className={`${td} text-[#8b97ac]`}>{i + 1}</td>
                      <td className={td}><div className="font-medium text-[#14223b]">{p.name}</div><div className="text-[10.5px] text-[#8b97ac]">{p.role}</div></td>
                      <td className={`${td} text-right font-semibold text-[#14223b]`}>{p.noteCount}</td>
                      <td className={`${td} text-right text-[#51607a]`}>{p.assignedCustomers}</td>
                      <td className={`${td} text-right text-[#51607a]`}>{p.efficiency}</td>
                      <td className={`${td} text-center`}>
                        <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: scoreColor(p.activityScore) }}>{p.activityScore}</span>
                      </td>
                      <td className={`${td} text-[#8b97ac]`}>{p.lastActivity ? `${formatDateShort(p.lastActivity)}${p.daysSinceActivity !== null ? ` (${p.daysSinceActivity}g)` : ''}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
