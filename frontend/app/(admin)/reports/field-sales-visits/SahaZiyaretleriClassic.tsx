'use client';

import { type ReactNode } from 'react';
import { Camera, MapPin, RefreshCw, Search, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { useSahaZiyaretleri } from './useSahaZiyaretleri';

/**
 * Klasik gorunum: Saha Ziyaretleri.
 * Mevcut JSX BIREBIR korunmustur; tum mantik useSahaZiyaretleri hook'undan gelir.
 */
export default function SahaZiyaretleriClassic() {
  const {
    search,
    setSearch,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    onlyVisitCustomers,
    setOnlyVisitCustomers,
    page,
    visits,
    summary,
    pagination,
    loading,
    photoPreview,
    setPhotoPreview,
    customerGroups,
    loadVisits,
    formatDateTime,
  } = useSahaZiyaretleri();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f8fafc_34%,#eef2ff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">
                <MapPin className="h-4 w-4" />
                Saha satis raporu
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">Saha Ziyaretleri</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Acilan ziyaret carilerini ve mevcut carilere yazilan saha notlarini cari bazinda takip edin.
              </p>
            </div>
            <Button onClick={() => loadVisits(1)} isLoading={loading} className="h-12 rounded-2xl bg-white text-slate-950 hover:bg-slate-100">
              <RefreshCw className="mr-2 h-4 w-4" />
              Raporu Yenile
            </Button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Toplam Not" value={summary.total || 0} icon={<MapPin className="h-5 w-5" />} />
          <SummaryCard label="Cari Sayisi" value={summary.uniqueCustomers || 0} icon={<Users className="h-5 w-5" />} />
          <SummaryCard label="Ziyaret Carisi Notu" value={summary.visitCustomerNotes || 0} icon={<UserRound className="h-5 w-5" />} />
          <SummaryCard label="Fotografli Not" value={summary.photoCount || 0} icon={<Camera className="h-5 w-5" />} />
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-4 shadow-xl backdrop-blur">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadVisits(1);
                }}
                placeholder="Cari kodu, cari adi, not, talep, rakip bilgi, personel..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-500" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-500" />
            <label className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={onlyVisitCustomers} onChange={(event) => setOnlyVisitCustomers(event.target.checked)} />
              Sadece ziyaret carileri
            </label>
            <Button onClick={() => loadVisits(1)} isLoading={loading} className="h-12 rounded-2xl bg-slate-950 text-white">
              Listele
            </Button>
          </div>
        </section>

        <main className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-xl">
            <h2 className="mb-4 text-lg font-black text-slate-950">Cari Bazli Ozet</h2>
            <div className="max-h-[760px] space-y-3 overflow-auto pr-1">
              {customerGroups.length === 0 && <EmptyState text="Bu filtrelerle cari bulunamadi." />}
              {customerGroups.map((group) => (
                <div key={group.code} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{group.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{group.code}</p>
                    </div>
                    <span className={cn('rounded-full px-2 py-1 text-[11px] font-black', group.isVisitCustomer ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                      {group.isVisitCustomer ? 'Ziyaret carisi' : `${group.count} not`}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-semibold text-slate-600">{group.lastNote || '-'}</p>
                  <p className="mt-2 text-xs text-slate-400">Son ziyaret: {formatDateTime(group.lastAt)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Ziyaret Detaylari</h2>
                <p className="text-sm text-slate-500">{pagination.total || 0} kayit, sayfa {pagination.page || 1}/{pagination.totalPages || 1}</p>
              </div>
              <div className="flex gap-2">
                <Button disabled={loading || page <= 1} onClick={() => loadVisits(page - 1)} className="h-10 rounded-2xl bg-white text-slate-700 shadow-sm hover:bg-slate-100">
                  Onceki
                </Button>
                <Button disabled={loading || page >= (pagination.totalPages || 1)} onClick={() => loadVisits(page + 1)} className="h-10 rounded-2xl bg-white text-slate-700 shadow-sm hover:bg-slate-100">
                  Sonraki
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {loading && <EmptyState text="Rapor yukleniyor..." />}
              {!loading && visits.length === 0 && <EmptyState text="Bu filtrelerle ziyaret notu bulunamadi." />}
              {visits.map((visit) => (
                <article key={visit.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-black text-slate-950">{visit.customerTitle || visit.customerName || visit.customerCode}</h3>
                        {visit.isVisitCustomer && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">Ziyaret carisi</span>}
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {visit.customerCode} {visit.city ? `- ${visit.city}` : ''} {visit.district ? `/ ${visit.district}` : ''}
                      </p>
                    </div>
                    <div className="text-left text-xs font-bold text-slate-500 lg:text-right">
                      <div>{formatDateTime(visit.createdAt)}</div>
                      <div>{visit.createdByName || '-'}</div>
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-800">{visit.note}</p>
                  {(visit.demand || visit.competitorInfo) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {visit.demand && <InfoBox label="Talep / Ihtiyac" value={visit.demand} />}
                      {visit.competitorInfo && <InfoBox label="Rakip Bilgi" value={visit.competitorInfo} />}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visit.photoUrl && (
                      <button onClick={() => setPhotoPreview(visit.photoUrl)} className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                        <Camera className="h-4 w-4" />
                        Fotograf
                      </button>
                    )}
                    {visit.latitude && visit.longitude && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"
                      >
                        <MapPin className="h-4 w-4" />
                        Konum
                      </a>
                    )}
                    {visit.phone && <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{visit.phone}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {photoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setPhotoPreview(null)}>
          <div className="relative max-h-full max-w-5xl">
            <button className="absolute right-2 top-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-slate-900 shadow" type="button">
              Kapat
            </button>
            <img src={photoPreview} alt="Ziyaret fotografi" className="max-h-[88vh] max-w-full rounded-3xl bg-white object-contain p-3 shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3 text-white">{icon}</div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">{text}</div>;
}
