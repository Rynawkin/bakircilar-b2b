'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import customerApi from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';
import { PaymentAmountType, PaymentAttempt, PaymentStatus, PaymentSummary } from '@/types';

const statusMeta: Record<PaymentStatus, { label: string; className: string }> = {
  CREATED: { label: 'Hazirlaniyor', className: 'bg-gray-100 text-gray-700' },
  PENDING: { label: 'Odeme bekleniyor', className: 'bg-amber-50 text-amber-700' },
  SUCCEEDED: { label: 'Basarili', className: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Basarisiz', className: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Suresi doldu', className: 'bg-gray-100 text-gray-600' },
  REVIEW_REQUIRED: { label: 'Kontrol ediliyor', className: 'bg-blue-50 text-blue-700' },
  CANCELLED: { label: 'Iptal', className: 'bg-gray-100 text-gray-600' },
};

const amountTypeLabel: Record<PaymentAmountType, string> = {
  TOTAL_BALANCE: 'Toplam bakiye',
  PAST_DUE: 'Vadesi gecen',
  CUSTOM: 'Ozel tutar',
};

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  : '-';

const newIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export default function CustomerPaymentsPage() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [amountType, setAmountType] = useState<PaymentAmountType>('TOTAL_BALANCE');
  const [customAmount, setCustomAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, historyData] = await Promise.all([
        customerApi.getPaymentSummary(),
        customerApi.getPaymentHistory(40),
      ]);
      setSummary(summaryData);
      setPayments(historyData.payments || []);
      setAmountType((current) => {
        if (current === 'CUSTOM') return current;
        return summaryData.availability.pastDue > 0 ? 'PAST_DUE' : 'TOTAL_BALANCE';
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Odeme bilgileri yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('result');
    const paymentId = params.get('paymentId');
    if (!result) return;
    if (result === 'success') toast.success('Odemeniz banka tarafindan basarili olarak dogrulandi.');
    else if (result === 'failure') toast.error('Odeme tamamlanamadi. Kartinizdan tahsilat yapilmadiysa tekrar deneyebilirsiniz.');
    else if (result === 'review') toast('Odeme sonucu banka ile kontrol ediliyor.', { icon: 'i' });
    else toast('Banka sonucu dogrulaniyor. Durum birazdan guncellenecek.', { icon: 'i' });
    if (paymentId) {
      customerApi.getPaymentStatus(paymentId).catch(() => undefined).finally(load);
    }
    window.history.replaceState({}, '', '/payments');
  }, [load]);

  const selectedAmount = useMemo(() => {
    if (!summary) return 0;
    if (amountType === 'TOTAL_BALANCE') return summary.availability.total;
    if (amountType === 'PAST_DUE') return summary.availability.pastDue;
    return Number(customAmount || 0);
  }, [amountType, customAmount, summary]);

  const createPayment = async () => {
    if (!summary?.eligibility.canCreate) {
      toast.error(summary?.eligibility.reason === 'BALANCE_STALE'
        ? 'Cari bakiye verisi guncel degil. Yeni rapor yuklendikten sonra tekrar deneyin.'
        : 'Online odeme su anda kullanilamiyor.');
      return;
    }
    if (!Number.isFinite(selectedAmount) || selectedAmount < summary.limits.min) {
      toast.error(`Odeme tutari en az ${formatCurrency(summary.limits.min)} olmali.`);
      return;
    }
    if (selectedAmount > summary.availability.total) {
      toast.error('Odeme tutari odenebilir bakiyeyi asamaz.');
      return;
    }
    setCreating(true);
    try {
      const { payment } = await customerApi.createPayByLink({
        idempotencyKey,
        amountType,
        ...(amountType === 'CUSTOM' ? { customAmount: selectedAmount } : {}),
      });
      if (!payment.paymentLinkUrl) throw new Error(payment.bankMessage || 'Banka odeme baglantisi olusturmadi.');
      window.location.assign(payment.paymentLinkUrl);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Odeme baglantisi olusturulamadi.';
      toast.error(message, { duration: 7000 });
      if (error?.response) setIdempotencyKey(newIdempotencyKey());
      await load();
    } finally {
      setCreating(false);
    }
  };

  const refreshPayment = async (id: string) => {
    setRefreshingId(id);
    try {
      const { payment } = await customerApi.getPaymentStatus(id);
      setPayments((current) => current.map((item) => item.id === id ? payment : item));
      await load();
      toast.success('Odeme durumu bankadan kontrol edildi.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Banka durumu kontrol edilemedi.');
    } finally {
      setRefreshingId(null);
    }
  };

  if (loading && !summary) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 sm:px-5 sm:py-7 lg:px-6">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-[var(--ink-1)]">Ana Sayfa</Link>
          <span>/</span>
          <span className="font-medium text-[var(--ink-2)]">Online Odeme</span>
        </nav>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#15356b] text-white">
              <WalletCards className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-[24px] font-bold text-[var(--ink-1)]">Online Odeme</h1>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">Ziraat Bankasi guvenli odeme sayfasi ile cari bakiye odemesi</p>
            </div>
          </div>
          <Link href="/invoices" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3.5 text-[13px] font-semibold text-[var(--ink-2)] hover:bg-gray-50">
            <FileText className="h-4 w-4" /> Faturalarim
          </Link>
        </header>

        {summary && (
          <>
            <section className="mb-5 grid grid-cols-1 border-y border-[var(--line)] bg-white sm:grid-cols-3">
              <div className="px-5 py-4 sm:border-r sm:border-[var(--line)]">
                <p className="text-xs font-medium text-[var(--ink-3)]">Toplam bakiye</p>
                <p className="mt-1 text-[23px] font-bold tabular-nums text-[var(--ink-1)]">{formatCurrency(summary.balance.total)}</p>
              </div>
              <div className="border-t border-[var(--line)] px-5 py-4 sm:border-r sm:border-t-0">
                <p className="text-xs font-medium text-[var(--ink-3)]">Vadesi gecen</p>
                <p className="mt-1 text-[23px] font-bold tabular-nums text-[#b45309]">{formatCurrency(summary.balance.pastDue)}</p>
              </div>
              <div className="border-t border-[var(--line)] px-5 py-4 sm:border-t-0">
                <p className="text-xs font-medium text-[var(--ink-3)]">Odenebilir tutar</p>
                <p className="mt-1 text-[23px] font-bold tabular-nums text-[#15356b]">{formatCurrency(summary.availability.total)}</p>
              </div>
            </section>

            <p className="-mt-3 mb-5 text-right text-[11px] text-[var(--ink-3)]">
              Bakiye verisi: {formatDateTime(summary.balance.updatedAt)} · Odeme ve acik link rezervasyonlari odenebilir tutardan dusulmustur.
            </p>

            {!summary.gateway.enabled && (
              <div className="mb-5 flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
                <div><strong>Banka aktivasyonu bekleniyor.</strong> PayByLink API kullanici yetkisi tamamlandiginda bu ekran otomatik olarak odeme baglantisi uretecek.</div>
              </div>
            )}

            {!summary.eligibility.balanceFresh && (
              <div className="mb-5 flex items-start gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
                <div><strong>Bakiye verisi guncel degil.</strong> Son bakiye {Math.round(summary.eligibility.balanceAgeHours)} saat once yenilenmis. Yeni vade/bakiye raporu yuklenene kadar odeme baglantisi olusturulamaz.</div>
              </div>
            )}

            {(summary.availability.reserved > 0 || summary.availability.successfulUnreconciled > 0) && (
              <div className="mb-5 flex items-start gap-3 border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <Clock3 className="mt-0.5 h-5 w-5 flex-none" />
                <div>
                  {summary.availability.reserved > 0 && <p>Acik odeme baglantilarinda {formatCurrency(summary.availability.reserved)} bekliyor.</p>}
                  {summary.availability.successfulUnreconciled > 0 && <p>{formatCurrency(summary.availability.successfulUnreconciled)} basarili odeme muhasebe mutabakati bekliyor.</p>}
                </div>
              </div>
            )}

            <section className="mb-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="border border-[var(--line)] bg-white p-4 sm:p-5">
                <h2 className="text-[16px] font-semibold text-[var(--ink-1)]">Odenecek tutari secin</h2>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  {([
                    ['PAST_DUE', 'Vadesi gecen', summary.availability.pastDue],
                    ['TOTAL_BALANCE', 'Toplam bakiye', summary.availability.total],
                    ['CUSTOM', 'Ozel tutar', null],
                  ] as Array<[PaymentAmountType, string, number | null]>).map(([type, label, amount]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAmountType(type)}
                      disabled={type !== 'CUSTOM' && Number(amount) <= 0}
                      className={`min-h-[82px] border px-3.5 py-3 text-left transition-colors ${amountType === type ? 'border-[#15356b] bg-blue-50 ring-1 ring-[#15356b]' : 'border-[var(--line)] bg-white hover:border-blue-300'} disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <span className="block text-[13px] font-semibold text-[var(--ink-1)]">{label}</span>
                      <span className="mt-1 block text-[15px] font-bold tabular-nums text-[#15356b]">{amount === null ? 'Tutari siz girin' : formatCurrency(amount)}</span>
                    </button>
                  ))}
                </div>

                {amountType === 'CUSTOM' && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs font-semibold text-[var(--ink-2)]">Ozel odeme tutari</span>
                    <div className="flex h-12 items-center border border-[var(--line)] bg-white px-3 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
                      <input
                        type="number"
                        min={summary.limits.min}
                        max={summary.availability.total}
                        step="0.01"
                        inputMode="decimal"
                        value={customAmount}
                        onChange={(event) => setCustomAmount(event.target.value)}
                        placeholder="0,00"
                        className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                      />
                      <span className="text-sm font-semibold text-[var(--ink-3)]">TL</span>
                    </div>
                  </label>
                )}

                <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-[var(--ink-3)]">Banka sayfasina aktarilacak tutar</p>
                    <p className="text-xl font-bold tabular-nums text-[var(--ink-1)]">{formatCurrency(selectedAmount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={createPayment}
                    disabled={creating || !summary.eligibility.canCreate || selectedAmount <= 0}
                    className="inline-flex h-12 items-center justify-center gap-2 bg-[#b45309] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#963f08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {creating ? 'Baglanti olusturuluyor' : 'Guvenli odemeye gec'}
                    {!creating && <ArrowRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <aside className="border border-[var(--line)] bg-[#14223b] p-5 text-white">
                <ShieldCheck className="h-7 w-7 text-emerald-300" />
                <h2 className="mt-3 text-[16px] font-semibold">Kart bilgileriniz B2B'ye gelmez</h2>
                <p className="mt-2 text-[13px] leading-5 text-slate-300">Kart ve 3D Secure islemleri dogrudan Ziraat Bankasi sayfasinda tamamlanir. B2B yalniz banka tarafindan kesin olarak dogrulanan sonucu kaydeder.</p>
                <div className="mt-4 border-t border-white/15 pt-4 text-xs leading-5 text-slate-300">
                  <p>Tek kullanımlik odeme baglantisi</p>
                  <p>Tutar banka ekraninda degistirilemez</p>
                  <p>Mikro'ya otomatik tahsilat fisi yazilmaz</p>
                </div>
              </aside>
            </section>
          </>
        )}

        <section className="overflow-hidden border border-[var(--line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink-1)]">Odeme gecmisi</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">Banka baglantilari ve muhasebe mutabakat durumu</p>
            </div>
            <button type="button" onClick={load} className="inline-flex h-9 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold text-[var(--ink-2)] hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Yenile
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--ink-3)]">Henuz online odeme kaydi bulunmuyor.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr] gap-3 bg-[var(--surface-0)] px-5 py-2.5 text-[10px] font-semibold uppercase text-[var(--ink-3)]">
                  <span>Tarih / Referans</span><span>Tur</span><span className="text-right">Tutar</span><span>Durum</span><span className="text-right">Islem</span>
                </div>
                {payments.map((payment) => {
                  const meta = statusMeta[payment.status];
                  const canResume = payment.status === 'PENDING' && payment.paymentLinkUrl && (!payment.linkExpiresAt || new Date(payment.linkExpiresAt) > new Date());
                  return (
                    <div key={payment.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr] items-center gap-3 border-t border-[var(--line)] px-5 py-3 text-[12px]">
                      <div><p className="font-medium text-[var(--ink-1)]">{formatDateTime(payment.createdAt)}</p><p className="mt-0.5 font-mono text-[10px] text-[var(--ink-3)]">{payment.orderId}</p></div>
                      <span className="text-[var(--ink-2)]">{amountTypeLabel[payment.amountType]}</span>
                      <span className="text-right text-[13px] font-bold tabular-nums text-[var(--ink-1)]">{formatCurrency(payment.amount)}</span>
                      <div><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>{payment.reconciledAt && <p className="mt-1 text-[10px] text-emerald-700">Muhasebeye islendi</p>}</div>
                      <div className="flex justify-end gap-1.5">
                        {canResume && <a href={payment.paymentLinkUrl!} className="inline-flex h-8 items-center gap-1 bg-[#b45309] px-2.5 font-semibold text-white"><ExternalLink className="h-3 w-3" /> Devam et</a>}
                        {['PENDING', 'REVIEW_REQUIRED'].includes(payment.status) && <button type="button" onClick={() => refreshPayment(payment.id)} disabled={refreshingId === payment.id} className="inline-flex h-8 items-center gap-1 border border-[var(--line)] px-2.5 font-semibold text-[var(--ink-2)] disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${refreshingId === payment.id ? 'animate-spin' : ''}`} /> Kontrol</button>}
                        {payment.status === 'SUCCEEDED' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
