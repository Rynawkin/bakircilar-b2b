'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, CreditCard, RefreshCw, Search, X } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import { PaymentAttempt, PaymentStatus } from '@/types';

const statusLabels: Record<PaymentStatus, string> = {
  CREATED: 'Hazirlaniyor',
  PENDING: 'Odeme bekleniyor',
  SUCCEEDED: 'Basarili',
  FAILED: 'Basarisiz',
  EXPIRED: 'Suresi doldu',
  REVIEW_REQUIRED: 'Kontrol gerekli',
  CANCELLED: 'Iptal',
};

const statusClass: Record<PaymentStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-50 text-amber-700',
  SUCCEEDED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-600',
  REVIEW_REQUIRED: 'bg-blue-50 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  : '-';

export default function PaymentOperationsPage() {
  const [items, setItems] = useState<PaymentAttempt[]>([]);
  const [totals, setTotals] = useState<Array<{ status: PaymentStatus; count: number; amount: number }>>([]);
  const [gateway, setGateway] = useState<{ configured: boolean; enabled: boolean; bankName: string } | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [reconciled, setReconciled] = useState<'true' | 'false' | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PaymentAttempt | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await adminApi.getPaymentOperations({
        status,
        reconciled,
        search: search || undefined,
        page,
        pageSize: pagination.pageSize,
      });
      setItems(result.items || []);
      setTotals(result.totals || []);
      setGateway(result.gateway || null);
      setPagination(result.pagination);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tahsilat kayitlari yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, reconciled, search, status]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalByStatus = useMemo(() => new Map(totals.map((row) => [row.status, row])), [totals]);
  const successful = totalByStatus.get('SUCCEEDED');
  const pending = totalByStatus.get('PENDING');
  const review = totalByStatus.get('REVIEW_REQUIRED');

  const reconcile = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminApi.reconcilePayment(selected.id, note);
      toast.success('Odeme muhasebe ile mutabik edildi.');
      setSelected(null);
      setNote('');
      await load(pagination.page);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Mutabakat kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const verify = async (item: PaymentAttempt) => {
    setVerifyingId(item.id);
    try {
      await adminApi.verifyPayment(item.id);
      toast.success('Odeme durumu bankadan kontrol edildi.');
      await load(pagination.page);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Banka durumu kontrol edilemedi.');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 lg:px-7">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#15356b] text-white"><CreditCard className="h-5 w-5" /></span>
            <div><h1 className="text-[22px] font-bold text-[#14223b]">Online Tahsilatlar</h1><p className="text-[12px] text-[#6f7d94]">Ziraat PayByLink durumlari ve muhasebe mutabakati</p></div>
          </div>
          <button type="button" onClick={() => load(pagination.page)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7deea] bg-white px-3.5 text-xs font-semibold text-[#33445f] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Yenile</button>
        </header>

        <div className="mb-5 flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <div><strong>Mutabakat Mikro'ya kayit yazmaz.</strong> Basarili tahsilati yalniz banka hareketi ve cari bakiyeye islendigini kontrol ettikten sonra mutabik edin. Erken mutabakat, musteriye yeniden odeme limiti acar.</div>
        </div>

        {gateway && !gateway.enabled && (
          <div className="mb-5 flex items-start gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
            <div><strong>{gateway.bankName} PayByLink canli kullanima kapali.</strong> API kullanici yetkisi dogrulanmadan musteri odeme baglantisi uretemez.</div>
          </div>
        )}

        <section className="mb-5 grid grid-cols-1 border-y border-[#dce2ec] bg-white sm:grid-cols-3">
          <div className="px-5 py-4 sm:border-r sm:border-[#dce2ec]"><p className="text-xs text-[#718097]">Basarili</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(successful?.amount || 0)}</p><p className="text-[11px] text-[#8b97ac]">{successful?.count || 0} islem</p></div>
          <div className="border-t border-[#dce2ec] px-5 py-4 sm:border-r sm:border-t-0"><p className="text-xs text-[#718097]">Odeme bekleyen</p><p className="mt-1 text-xl font-bold text-amber-700">{formatCurrency(pending?.amount || 0)}</p><p className="text-[11px] text-[#8b97ac]">{pending?.count || 0} link</p></div>
          <div className="border-t border-[#dce2ec] px-5 py-4 sm:border-t-0"><p className="text-xs text-[#718097]">Kontrol gereken</p><p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(review?.amount || 0)}</p><p className="text-[11px] text-[#8b97ac]">{review?.count || 0} islem</p></div>
        </section>

        <div className="mb-4 flex flex-wrap gap-2 border border-[#dce2ec] bg-white p-3">
          <div className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-[#d7deea] px-3"><Search className="h-4 w-4 text-[#8b97ac]" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load(1)} placeholder="Cari, cari kodu veya referans" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <select value={status} onChange={(event) => setStatus(event.target.value as PaymentStatus | '')} className="h-10 rounded-lg border border-[#d7deea] bg-white px-3 text-xs font-medium"><option value="">Tum durumlar</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={reconciled} onChange={(event) => setReconciled(event.target.value as typeof reconciled)} className="h-10 rounded-lg border border-[#d7deea] bg-white px-3 text-xs font-medium"><option value="">Tum mutabakatlar</option><option value="false">Mutabakat bekleyen</option><option value="true">Mutabik</option></select>
          <button type="button" onClick={() => load(1)} className="h-10 rounded-lg bg-[#15356b] px-4 text-xs font-semibold text-white">Listele</button>
        </div>

        <section className="overflow-hidden border border-[#dce2ec] bg-white">
          {loading ? <div className="flex justify-center py-14"><div className="h-9 w-9 animate-spin rounded-full border-b-2 border-[#15356b]" /></div> : items.length === 0 ? <div className="py-14 text-center text-sm text-[#718097]">Bu filtreye uygun tahsilat bulunamadi.</div> : (
            <div className="overflow-x-auto"><div className="min-w-[1050px]">
              <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1.1fr_1.1fr] gap-3 bg-[#f7f8fb] px-4 py-3 text-[10px] font-semibold uppercase text-[#718097]"><span>Tarih / Referans</span><span>Cari</span><span className="text-right">Tutar</span><span>Durum</span><span>Mutabakat</span><span className="text-right">Islem</span></div>
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1.1fr_1.1fr] items-center gap-3 border-t border-[#e3e7ee] px-4 py-3 text-xs">
                  <div><p className="font-medium text-[#24344f]">{formatDateTime(item.createdAt)}</p><p className="mt-0.5 font-mono text-[9px] text-[#8b97ac]">{item.orderId}</p></div>
                  <div><p className="font-semibold text-[#14223b]">{item.customerName}</p><p className="text-[10px] text-[#718097]">{item.customerCode || '-'} · {item.requestedByName || 'Musteri'}</p></div>
                  <span className="text-right text-sm font-bold text-[#14223b]">{formatCurrency(item.amount)}</span>
                  <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass[item.status]}`}>{statusLabels[item.status]}</span>
                  <div>{item.reconciledAt ? <><p className="font-semibold text-emerald-700">Mutabik</p><p className="text-[10px] text-[#8b97ac]">{formatDateTime(item.reconciledAt)}</p></> : <span className="text-[#8b97ac]">Bekliyor</span>}</div>
                  <div className="flex justify-end gap-1.5">{item.status === 'SUCCEEDED' && !item.reconciledAt ? <button type="button" onClick={() => { setSelected(item); setNote(''); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-semibold text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Mutabik et</button> : ['PENDING', 'REVIEW_REQUIRED'].includes(item.status) ? <button type="button" onClick={() => verify(item)} disabled={verifyingId === item.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d7deea] px-3 text-[11px] font-semibold text-[#33445f] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${verifyingId === item.id ? 'animate-spin' : ''}`} /> Bankadan kontrol</button> : <span className="text-[10px] text-[#8b97ac]">{item.bankReturnCode || '-'}</span>}</div>
                </div>
              ))}
            </div></div>
          )}
          <div className="flex items-center justify-between border-t border-[#dce2ec] px-4 py-3 text-xs text-[#718097]"><span>{pagination.total} kayit · Sayfa {pagination.page}/{pagination.totalPages}</span><div className="flex gap-2"><button disabled={pagination.page <= 1 || loading} onClick={() => load(pagination.page - 1)} className="h-8 rounded-lg border border-[#d7deea] px-3 disabled:opacity-40">Onceki</button><button disabled={pagination.page >= pagination.totalPages || loading} onClick={() => load(pagination.page + 1)} className="h-8 rounded-lg border border-[#d7deea] px-3 disabled:opacity-40">Sonraki</button></div></div>
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e2e6ed] px-5 py-4"><div><h2 className="text-base font-semibold text-[#14223b]">Odemeyi mutabik et</h2><p className="mt-0.5 text-xs text-[#718097]">{selected.customerName} · {formatCurrency(selected.amount)}</p></div><button type="button" onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
            <div className="p-5"><div className="mb-4 flex gap-2 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle className="h-4 w-4 flex-none" /><span>Banka hareketini ve cari bakiyeye islendigi bilgisini kontrol ettiginizi onaylar.</span></div><label className="block text-xs font-semibold text-[#33445f]">Muhasebe notu (opsiyonel)</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-[#d7deea] p-3 text-sm outline-none focus:border-[#15356b]" placeholder="Dekont / islem aciklamasi" /></div>
            <div className="flex justify-end gap-2 border-t border-[#e2e6ed] px-5 py-4"><button type="button" onClick={() => setSelected(null)} className="h-9 rounded-lg border border-[#d7deea] px-4 text-xs font-semibold">Vazgec</button><button type="button" onClick={reconcile} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Onayla</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
