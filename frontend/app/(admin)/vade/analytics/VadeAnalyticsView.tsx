'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Users, UserCheck, FileSpreadsheet, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { noteTagLabel } from '@/lib/vadeNotes';
import { VadeAnalytics } from '@/types';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const fieldCls = 'h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';
const DAYS_OPTIONS = [30, 90, 180, 365];

export default function VadeAnalyticsView() {
  const router = useRouter();
  const [data, setData] = useState<VadeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [tab, setTab] = useState<'customer' | 'staff'>('customer');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.getVadeAnalytics({ days }));
    } catch (error) {
      console.error('Vade analytics error:', error);
      toast.error('Analiz verisi yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    if (tab === 'customer') {
      const rows = data.customerBehavior.map((c) => ({
        'Cari Kodu': c.code, 'Cari': c.name, 'Sektor': c.sector,
        'Not Sayisi': c.noteCount, 'Soz Sayisi': c.promiseCount,
        'En Sik Etiket': c.mostUsedTag ? noteTagLabel(c.mostUsedTag) : '',
        'Son Not': c.lastNoteAt ? formatDateShort(c.lastNoteAt) : '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Musteri Analizi');
    } else {
      const rows = data.staffPerformance.map((s) => ({
        'Satici': s.name, 'Rol': s.role, 'Toplam Not': s.totalNotes,
        'Soz Notu': s.promiseNotes, 'Etiketli': s.taggedNotes,
        'Benzersiz Musteri': s.uniqueCustomers, 'Musteri Basina Not': s.avgNotesPerCustomer,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Satici Performans');
    }
    XLSX.writeFile(wb, `vade-analiz-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel indirildi');
  };

  const th = 'px-3 py-2.5 text-left font-medium text-[#8b97ac] border-b border-[#eef1f6]';
  const td = 'px-3 py-2.5 border-b border-[#f2f4f8]';

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <button type="button" onClick={() => router.push('/vade')} className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-[#51607a] hover:text-[#15356b]">
            <ArrowLeft width={15} height={15} stroke="currentColor" strokeWidth={2} /> Liste
          </button>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">Vade Analizi</h1>
          <p className="mt-1.5 text-[13px] text-[#8b97ac]">Musteri iletisim davranisi ve satici not performansi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${fieldCls} cursor-pointer`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS_OPTIONS.map((d) => <option key={d} value={d}>Son {d} gun</option>)}
          </select>
          <button type="button" onClick={fetchData} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
            <RefreshCw width={15} height={15} stroke="currentColor" strokeWidth={2} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          <button type="button" onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
            <FileSpreadsheet width={15} height={15} stroke="currentColor" strokeWidth={2} /> Excel
          </button>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="mb-3.5 flex gap-2">
        <button type="button" onClick={() => setTab('customer')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-medium ${tab === 'customer' ? 'bg-[#15356b] text-white' : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'}`}>
          <Users width={15} height={15} stroke="currentColor" strokeWidth={2} /> Musteri Analizi
        </button>
        <button type="button" onClick={() => setTab('staff')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-medium ${tab === 'staff' ? 'bg-[#15356b] text-white' : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'}`}>
          <UserCheck width={15} height={15} stroke="currentColor" strokeWidth={2} /> Satici Performansi
        </button>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="p-10 text-center text-[13px] text-[#8b97ac]">Yukleniyor...</div>
          ) : tab === 'customer' ? (
            <table className="w-full min-w-[720px] text-[12px]">
              <thead><tr className="bg-[#fafbfd]">
                <th className={th}>Cari</th><th className={th}>Sektor</th>
                <th className={`${th} text-right`}>Not</th><th className={`${th} text-right`}>Soz</th>
                <th className={th}>En Sik Etiket</th><th className={th}>Son Not</th>
              </tr></thead>
              <tbody>
                {(data?.customerBehavior || []).map((c, i) => (
                  <tr key={c.code || i} className="hover:bg-[#fafbfd]">
                    <td className={td}><div className="font-medium text-[#14223b]">{c.name || '-'}</div><div className="text-[10.5px] text-[#8b97ac] font-mono">{c.code}</div></td>
                    <td className={`${td} text-[#51607a]`}>{c.sector || '-'}</td>
                    <td className={`${td} text-right font-semibold text-[#14223b]`}>{c.noteCount}</td>
                    <td className={`${td} text-right text-[#51607a]`}>{c.promiseCount}</td>
                    <td className={td}>{c.mostUsedTag ? <span className="rounded bg-[#eef2fa] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#1c4585]">{noteTagLabel(c.mostUsedTag)} ({c.mostUsedTagCount})</span> : <span className="text-[#8b97ac]">-</span>}</td>
                    <td className={`${td} text-[#8b97ac]`}>{c.lastNoteAt ? formatDateShort(c.lastNoteAt) : '-'}</td>
                  </tr>
                ))}
                {data && data.customerBehavior.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[#8b97ac]">Bu donemde not yok</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[720px] text-[12px]">
              <thead><tr className="bg-[#fafbfd]">
                <th className={th}>Satici</th><th className={`${th} text-right`}>Toplam Not</th>
                <th className={`${th} text-right`}>Soz Notu</th><th className={`${th} text-right`}>Etiketli</th>
                <th className={`${th} text-right`}>Benzersiz Musteri</th><th className={`${th} text-right`}>Musteri/Not</th>
              </tr></thead>
              <tbody>
                {(data?.staffPerformance || []).map((s, i) => (
                  <tr key={i} className="hover:bg-[#fafbfd]">
                    <td className={td}><div className="font-medium text-[#14223b]">{s.name}</div><div className="text-[10.5px] text-[#8b97ac]">{s.role}</div></td>
                    <td className={`${td} text-right font-semibold text-[#14223b]`}>{s.totalNotes}</td>
                    <td className={`${td} text-right text-[#51607a]`}>{s.promiseNotes}</td>
                    <td className={`${td} text-right text-[#51607a]`}>{s.taggedNotes}</td>
                    <td className={`${td} text-right text-[#51607a]`}>{s.uniqueCustomers}</td>
                    <td className={`${td} text-right text-[#51607a]`}>{s.avgNotesPerCustomer}</td>
                  </tr>
                ))}
                {data && data.staffPerformance.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[#8b97ac]">Bu donemde not yok</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
