'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSearch,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  adminApi,
  MarginViolation,
  MarginViolationDashboard,
  MarginViolationExclusionProposal,
  MarginViolationResolutionType,
  MarginViolationScorecardRow,
  MarginViolationStatus,
} from '@/lib/api/admin';

type ModalKind = 'NOTE' | 'RESOLVE' | 'REOPEN' | 'CLOSE' | 'EXCLUDE' | 'VERIFY' | 'DECIDE';
type ModalState = {
  kind: ModalKind;
  violation: MarginViolation;
  proposal?: MarginViolationExclusionProposal;
  approve?: boolean;
} | null;

const STATUS_META: Record<MarginViolationStatus, { label: string; cls: string }> = {
  OPEN: { label: 'Açık', cls: 'border-red-200 bg-red-50 text-red-700' },
  IN_REVIEW: { label: 'İncelemede', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  RESOLVED: { label: 'Çözüldü', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REOPENED: { label: 'Yeniden Açıldı', cls: 'border-orange-200 bg-orange-50 text-orange-700' },
  ADMIN_CLOSED: { label: 'Yönetici Kapattı', cls: 'border-slate-200 bg-slate-100 text-slate-700' },
  INVALIDATED: { label: 'Kaynakta Yok', cls: 'border-slate-200 bg-white text-slate-500' },
};

const RESOLUTION_OPTIONS: Array<{ value: MarginViolationResolutionType; label: string }> = [
  { value: 'FIXED', label: 'Fiyat veya maliyet düzeltildi' },
  { value: 'APPROVED', label: 'Ticari gerekçeyle onaylandı' },
  { value: 'DATA_ERROR', label: 'Veri hatası doğrulandı' },
  { value: 'EXCLUDED', label: 'Dışlama kapsamında' },
  { value: 'OTHER', label: 'Diğer' },
];

const money = (value: number | null | undefined) => new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', maximumFractionDigits: 2,
}).format(Number(value || 0));
const percent = (value: number | null | undefined) => value === null || value === undefined ? '-' : `%${value.toFixed(2)}`;
const dateText = (value: string) => new Date(value).toLocaleDateString('tr-TR');

function ActionModal({ state, busy, onClose, onSubmit }: {
  state: NonNullable<ModalState>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: { note: string; resolutionType: MarginViolationResolutionType; exclusionType: 'BRAND' | 'PRODUCT_CODE' | 'PRODUCT_NAME'; exclusionValue: string }) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [resolutionType, setResolutionType] = useState<MarginViolationResolutionType>('FIXED');
  const [exclusionType, setExclusionType] = useState<'BRAND' | 'PRODUCT_CODE' | 'PRODUCT_NAME'>('PRODUCT_CODE');
  const [exclusionValue, setExclusionValue] = useState(state.violation.productCode);

  const title = {
    NOTE: 'İnceleme Notu Ekle',
    RESOLVE: 'İhlali Sonuçlandır',
    REOPEN: 'Kaydı Yeniden Aç',
    CLOSE: 'Yönetici Olarak Kapat',
    EXCLUDE: 'Dışlama Önerisi Gönder',
    VERIFY: 'Fiyat / Maliyet Teyidi Aç',
    DECIDE: state.approve ? 'Dışlama Önerisini Onayla' : 'Dışlama Önerisini Reddet',
  }[state.kind];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{state.violation.productCode} · {state.violation.productName}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Kapat">
            <X size={17} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {state.kind === 'RESOLVE' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Sonuç</label>
              <select value={resolutionType} onChange={(e) => setResolutionType(e.target.value as MarginViolationResolutionType)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800">
                {RESOLUTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}
          {state.kind === 'EXCLUDE' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Dışlama Tipi</label>
                <select
                  value={exclusionType}
                  onChange={(e) => {
                    const next = e.target.value as typeof exclusionType;
                    setExclusionType(next);
                    setExclusionValue(next === 'PRODUCT_CODE' ? state.violation.productCode : state.violation.productName || '');
                  }}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="PRODUCT_CODE">Ürün Kodu</option>
                  <option value="PRODUCT_NAME">Ürün Adı</option>
                  <option value="BRAND">Marka</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Değer</label>
                <input value={exclusionValue} onChange={(e) => setExclusionValue(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
              </div>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              {state.kind === 'NOTE' ? 'Not' : 'Gerekçe / açıklama'}
            </label>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="İnceleme sonucunu somut biçimde yazın..."
              className="w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-700"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Vazgeç</button>
          <button
            type="button"
            disabled={busy || !note.trim() || (state.kind === 'EXCLUDE' && !exclusionValue.trim())}
            onClick={() => onSubmit({ note: note.trim(), resolutionType, exclusionType, exclusionValue: exclusionValue.trim() })}
            className="h-9 rounded-md bg-[#15356b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarginViolationsContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MarginViolation[]>([]);
  const [dashboard, setDashboard] = useState<MarginViolationDashboard | null>(null);
  const [scorecard, setScorecard] = useState<MarginViolationScorecardRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState<MarginViolationStatus | 'ALL'>((searchParams.get('status') as MarginViolationStatus) || 'ALL');
  const [assignee, setAssignee] = useState(searchParams.get('assignee') || '');
  const [unassigned, setUnassigned] = useState(searchParams.get('unassigned') === 'true');
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [pendingProposalOnly, setPendingProposalOnly] = useState(searchParams.get('proposal') === 'pending');
  const proposal = pendingProposalOnly ? 'pending' as const : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, kpis] = await Promise.all([
        adminApi.getMarginViolations({ page, limit: 50, status, search: appliedSearch.trim() || undefined, assignee: assignee || undefined, unassigned, recurringOnly, proposal }),
        adminApi.getMarginViolationDashboard(),
      ]);
      setItems(list.items);
      setCanManage(list.scope.canManage);
      setTotalPages(Math.max(1, list.pagination.totalPages));
      setTotal(list.pagination.total);
      setDashboard(kpis);
      if (list.scope.canManage) {
        const result = await adminApi.getMarginViolationScorecard();
        setScorecard(result.rows || []);
      } else {
        setScorecard([]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Marj ihlalleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, assignee, page, proposal, recurringOnly, status, unassigned]);

  useEffect(() => { load(); }, [load]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(success);
      setModal(null);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || 'İşlem tamamlanamadı');
    } finally {
      setBusy(false);
    }
  };

  const submitModal = async (values: { note: string; resolutionType: MarginViolationResolutionType; exclusionType: 'BRAND' | 'PRODUCT_CODE' | 'PRODUCT_NAME'; exclusionValue: string }) => {
    if (!modal) return;
    const { violation } = modal;
    if (modal.kind === 'NOTE') return run(() => adminApi.addMarginViolationNote(violation.id, values.note), 'Not eklendi');
    if (modal.kind === 'RESOLVE') return run(() => adminApi.resolveMarginViolation(violation.id, { resolutionType: values.resolutionType, note: values.note }), 'İhlal sonuçlandırıldı');
    if (modal.kind === 'REOPEN') return run(() => adminApi.reopenMarginViolation(violation.id, values.note), 'Kayıt yeniden açıldı');
    if (modal.kind === 'CLOSE') return run(() => adminApi.adminCloseMarginViolation(violation.id, values.note), 'Kayıt yönetici tarafından kapatıldı');
    if (modal.kind === 'EXCLUDE') return run(() => adminApi.proposeMarginViolationExclusion(violation.id, {
      type: values.exclusionType, value: values.exclusionValue, label: violation.productName || undefined, note: values.note,
    }), 'Dışlama önerisi yöneticilere gönderildi');
    if (modal.kind === 'VERIFY') return run(() => adminApi.openMarginViolationPriceVerification(violation.id, values.note), 'Fiyat / maliyet teyit talebi açıldı');
    if (modal.kind === 'DECIDE' && modal.proposal) return run(() => adminApi.decideMarginViolationExclusion(modal.proposal!.id, {
      approve: modal.approve === true, note: values.note,
    }), modal.approve ? 'Dışlama önerisi onaylandı' : 'Dışlama önerisi reddedildi');
  };

  const kpis = useMemo(() => [
    { label: 'Açık', value: dashboard?.open || 0, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'İncelemede', value: dashboard?.inReview || 0, icon: Clock3, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Kapalı', value: dashboard?.resolved || 0, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Eskalasyon', value: dashboard?.escalated || 0, icon: ShieldCheck, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: 'Sahipsiz', value: dashboard?.unassigned || 0, icon: UserX, color: 'text-slate-700', bg: 'bg-slate-100' },
    { label: 'Dışlama Kararı', value: dashboard?.pendingExclusionProposals || 0, icon: FileSearch, color: 'text-blue-700', bg: 'bg-blue-50' },
  ], [dashboard]);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1580px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <Link href="/reports" className="hover:text-blue-800">Raporlar</Link><span>/</span><span>Marj İhlalleri</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Marj İhlali Aksiyon Merkezi</h1>
            <p className="mt-1 text-sm text-slate-500">Maliyet altı satışları tek kayıt, iki ayrı maliyet tabanı ve ortak kapanış akışıyla yönetin.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/reports/margin-compliance" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <CircleDollarSign size={16} /> Marj Raporu
            </Link>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#15356b] px-3 text-sm font-semibold text-white disabled:opacity-60">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        </div>

        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={() => {
                if (kpi.label === 'Açık') setStatus('OPEN');
                if (kpi.label === 'İncelemede') setStatus('IN_REVIEW');
                if (kpi.label === 'Kapalı') setStatus('RESOLVED');
                if (kpi.label === 'Sahipsiz') setUnassigned(true);
                if (kpi.label === 'Dışlama Kararı') setPendingProposalOnly(true);
                setPage(1);
              }}
              className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-left hover:border-slate-300"
            >
              <span className={`grid h-10 w-10 flex-none place-items-center rounded-md ${kpi.bg} ${kpi.color}`}><kpi.icon size={19} /></span>
              <span><span className="block text-xl font-semibold text-slate-900">{kpi.value}</span><span className="text-xs text-slate-500">{kpi.label}</span></span>
            </button>
          ))}
        </section>

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_170px_auto_auto_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setAppliedSearch(search); } }} placeholder="Ürün, cari, evrak veya sektör ara" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-700" />
            </label>
            <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="ALL">Tüm durumlar</option>
              {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            <select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="">Tüm sorumlular</option>
              <option value="me">Bana atananlar</option>
            </select>
            {canManage && <label className="flex h-9 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={unassigned} onChange={(e) => { setUnassigned(e.target.checked); setPage(1); }} /> Sahipsiz</label>}
            {canManage && <label className="flex h-9 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={pendingProposalOnly} onChange={(e) => { setPendingProposalOnly(e.target.checked); setPage(1); }} /> Karar bekleyen</label>}
            <label className="flex h-9 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={recurringOnly} onChange={(e) => { setRecurringOnly(e.target.checked); setPage(1); }} /> Tekrarlayan</label>
            <button type="button" onClick={() => { setPage(1); setAppliedSearch(search); }} className="h-9 rounded-md border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700">Uygula</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">İhlaller</h2><span className="text-xs text-slate-500">{total.toLocaleString('tr-TR')} kayıt</span>
          </div>
          {loading ? (
            <div className="py-20 text-center text-sm text-slate-500">Kayıtlar yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center"><CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={28} /><p className="text-sm font-medium text-slate-700">Bu filtrede ihlal yok.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const statusMeta = STATUS_META[item.status];
                const pending = item.exclusionProposals.filter((entry) => entry.status === 'PENDING');
                return (
                  <article key={item.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(270px,1.2fr)_minmax(390px,1.5fr)_minmax(210px,.8fr)]">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.cls}`}>{statusMeta.label}</span>
                          {item.isRecurring && <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{item.repeatCount} gün tekrar</span>}
                          {item.escalatedAt && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Gecikmiş</span>}
                        </div>
                        <div className="font-mono text-xs font-semibold text-blue-800">{item.productCode}</div>
                        <h3 className="mt-1 break-words text-sm font-semibold leading-5 text-slate-900">{item.productName}</h3>
                        <div className="mt-2 space-y-1 text-xs text-slate-500">
                          <p>{item.customerName || '-'} <span className="font-mono">{item.customerCode || ''}</span></p>
                          <p>{item.documentType || 'Evrak'} · {item.documentNo} · {dateText(item.reportDate)}</p>
                          <p>{item.quantityLabel || `${item.quantity || 0} ${item.unit || ''}`} · Birim satış {money(item.unitPrice)}</p>
                          <p>Sektör: <strong className="text-slate-700">{item.sectorCode || 'Atanmamış'}</strong></p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {item.bases.map((basis) => (
                          <div key={basis.basis} className={`border-l-4 px-3 py-2.5 ${basis.basis === 'CURRENT' ? 'border-l-blue-700 bg-blue-50/60' : 'border-l-violet-600 bg-violet-50/60'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{basis.basis === 'CURRENT' ? 'Güncel Maliyet' : 'Son Giriş Maliyeti'}</span>
                              <span className="text-sm font-bold text-red-700">{percent(basis.margin)}</span>
                            </div>
                            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <dt className="text-slate-500">Net / KDV'li Ciro</dt><dd className="text-right font-medium text-slate-800">{money(item.revenueNet)} / {money(item.revenueGross)}</dd>
                              <dt className="text-slate-500">Birim Maliyet</dt><dd className="text-right font-medium text-slate-800">{money(basis.unitCost)}</dd>
                              <dt className="text-slate-500">Kâr / Zarar</dt><dd className="text-right font-semibold text-red-700">{money(basis.profit)}</dd>
                              <dt className="text-slate-500">{basis.basis === 'CURRENT' ? 'Markup' : 'Mikro SÖ %'}</dt><dd className="text-right text-slate-700">{basis.sourceMargin === null ? (basis.dataAvailable ? 'Yok · hesaplandı' : 'Veri yok') : percent(basis.sourceMargin)}</dd>
                            </dl>
                          </div>
                        ))}
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sorumlular</div>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{item.assignees.length ? item.assignees.map((entry) => entry.userName || entry.userId).join(', ') : 'Sektör ataması yok'}</p>
                        {item.claimedByName && <p className="mt-1 text-xs font-medium text-blue-800">Sahiplenen: {item.claimedByName}</p>}
                        {item.notes[0] && <div className="mt-2 border-l-2 border-slate-300 pl-2 text-xs text-slate-600"><strong>{item.notes[0].authorName || 'Sistem'}:</strong> {item.notes[0].body}</div>}
                      </div>
                    </div>

                    {pending.map((proposalItem) => (
                      <div key={proposalItem.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <span><strong>Dışlama önerisi:</strong> {proposalItem.type} · {proposalItem.value} · {proposalItem.note}</span>
                        {item.availableActions.canDecideExclusion && <span className="flex gap-2"><button onClick={() => setModal({ kind: 'DECIDE', violation: item, proposal: proposalItem, approve: false })} className="font-semibold text-red-700">Reddet</button><button onClick={() => setModal({ kind: 'DECIDE', violation: item, proposal: proposalItem, approve: true })} className="font-semibold text-emerald-700">Onayla</button></span>}
                      </div>
                    ))}

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      {item.availableActions.canClaim && <button onClick={() => run(() => adminApi.claimMarginViolation(item.id), 'İhlal sahiplenildi')} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#15356b] px-3 text-xs font-semibold text-white"><UserCheck size={14} /> Sahiplen</button>}
                      {item.availableActions.canAddNote && <button onClick={() => setModal({ kind: 'NOTE', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700"><MessageSquarePlus size={14} /> Not</button>}
                      {item.availableActions.canResolve && <button onClick={() => setModal({ kind: 'RESOLVE', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Sonuçlandır</button>}
                      {item.availableActions.canOpenPriceVerification && <button onClick={() => setModal({ kind: 'VERIFY', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700"><FileSearch size={14} /> Fiyat Teyidi</button>}
                      {item.availableActions.canProposeExclusion && <button onClick={() => setModal({ kind: 'EXCLUDE', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800"><ShieldCheck size={14} /> Dışlama Öner</button>}
                      {item.availableActions.canReopen && <button onClick={() => setModal({ kind: 'REOPEN', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-orange-200 px-3 text-xs font-semibold text-orange-700"><RotateCcw size={14} /> Yeniden Aç</button>}
                      {item.availableActions.canAdminClose && <button onClick={() => setModal({ kind: 'CLOSE', violation: item })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600"><X size={14} /> Yönetici Kapat</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-40"><ChevronLeft size={14} /> Önceki</button>
            <span className="text-xs text-slate-500">Sayfa {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 disabled:opacity-40">Sonraki <ChevronRight size={14} /></button>
          </div>
        </section>

        {canManage && scorecard.length > 0 && (
          <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">Son 30 Gün Sorumlu Performansı</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Personel</th><th className="px-4 py-2.5 text-right">Toplam</th><th className="px-4 py-2.5 text-right">Açık</th><th className="px-4 py-2.5 text-right">Çözülen</th><th className="px-4 py-2.5 text-right">Ort. Süre</th><th className="px-4 py-2.5 text-right">Tekrarlayan Ürün</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{scorecard.map((row) => <tr key={row.userId}><td className="px-4 py-3 font-medium text-slate-800">{row.userName}</td><td className="px-4 py-3 text-right">{row.total}</td><td className="px-4 py-3 text-right text-red-700">{row.open}</td><td className="px-4 py-3 text-right text-emerald-700">{row.resolved}</td><td className="px-4 py-3 text-right">{row.avgResolutionHours === null ? '-' : `${row.avgResolutionHours} sa`}</td><td className="px-4 py-3 text-right">{row.recurringProductCount}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
      </div>
      {modal && <ActionModal key={`${modal.kind}-${modal.violation.id}-${modal.proposal?.id || ''}`} state={modal} busy={busy} onClose={() => !busy && setModal(null)} onSubmit={submitModal} />}
    </main>
  );
}

export default function MarginViolationsPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-500">Marj aksiyon merkezi yükleniyor...</div>}><MarginViolationsContent /></Suspense>;
}
