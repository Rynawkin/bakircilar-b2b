'use client';

import { ArrowRight, FileText, Filter, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';
import { useRaporMerkezi, type ReportCard, type ReportCategory } from './useRaporMerkezi';

/**
 * Yeni gorunum Rapor Merkezi ekrani. Mevcut TUM mantik/veri useRaporMerkezi'den gelir; sadece gorsel yeni.
 * Hicbir kart/link/badge/kategori-filtresi/arama/sayac/yetki-kosulu dusurulmemistir; brief 4.11.1'deki her oge mevcut.
 * Referans: Bakircilar Yonetim Paneli mockup -> data-screen-label="Rapor Merkezi".
 */

// Panel pastel gradient (kategori bazli) — referans tasarimin yumusak panel arka planlari
const panelStyle: Record<ReportCategory, string> = {
  cost: 'border-[#f3e3c8] bg-gradient-to-br from-[#fdf6ea] via-[#fbf3e6] to-white',
  stock: 'border-[#cdeede] bg-gradient-to-br from-[#eafaf2] via-[#eef9f1] to-white',
  customer: 'border-[#cfe6f5] bg-gradient-to-br from-[#eaf5fc] via-[#eef6fb] to-white',
  order: 'border-[#e7ebf2] bg-gradient-to-br from-[#f6f8fb] via-[#f7f9fc] to-white',
};

// Kategori basligi yaninda ikon rozeti rengi
const panelIconStyle: Record<ReportCategory, string> = {
  cost: 'bg-[#fdf0db] text-[#b45309]',
  stock: 'bg-[#dcf5e8] text-[#047857]',
  customer: 'bg-[#e2f0fb] text-[#1c4585]',
  order: 'bg-[#eef2fa] text-[#15356b]',
};

// Rozet stilleri — Aktif yesil / Yeni mavi / Onerilen amber / Kritik kirmizi / Onemli turuncu
const badgeStyle: Record<string, string> = {
  Aktif: 'bg-[#dcf5e8] text-[#047857] border border-[#bbeacf]',
  Yeni: 'bg-[#e7eefb] text-[#1c4585] border border-[#cfddf6]',
  Onerilen: 'bg-[#fdf0db] text-[#b45309] border border-[#fbe0b3]',
  Kritik: 'bg-[#fde8e8] text-[#b91c1c] border border-[#f7c9c9]',
  Onemli: 'bg-[#fdeedd] text-[#c2410c] border border-[#fbd6b3]',
};

const defaultBadgeStyle = 'bg-[#f1f4f9] text-[#51607a] border border-[#e3e8f0]';

export default function RaporMerkeziNew() {
  const {
    categories,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    visibleReports,
    categoryCounts,
    activeCategoryCount,
    filteredReports,
    categoryGroups,
  } = useRaporMerkezi();

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
      {/* Hero — koyu gradient + Karar Destek Paneli + 3 metrik */}
      <div
        className="rounded-2xl px-6 py-6 text-white sm:px-7"
        style={{ background: 'linear-gradient(120deg,#0c2247,#15356b)' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9bb0d4]">
          Karar Destek Paneli
        </div>
        <h1 className="mt-2 text-[26px] font-bold tracking-tight">Rapor Merkezi</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] text-[#9bb0d4]">
          Operasyon, satis ve stok kararlarinizi tek panelde hizli takip edin.
        </p>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="text-[22px] font-bold leading-none">{visibleReports.length}</div>
            <div className="mt-1 text-[12px] text-[#9bb0d4]">Toplam Rapor</div>
          </div>
          <div>
            <div className="text-[22px] font-bold leading-none">{filteredReports.length}</div>
            <div className="mt-1 text-[12px] text-[#9bb0d4]">Gorunen</div>
          </div>
          <div>
            <div className="text-[22px] font-bold leading-none">
              {selectedCategory === 'all' ? activeCategoryCount : 1}
            </div>
            <div className="mt-1 text-[12px] text-[#9bb0d4]">Aktif Kategori</div>
          </div>
        </div>
      </div>

      {/* Arama + kategori pill segmenti */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#e3e8f0] bg-white px-3">
          <Search className="h-[15px] w-[15px] shrink-0 text-[#9aa6b8]" />
          <input
            placeholder="Rapor ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 border-none bg-transparent text-[13px] text-[#14223b] outline-none placeholder:text-[#9aa6b8]"
          />
        </div>

        <div className="hidden h-10 items-center gap-2 rounded-lg border border-dashed border-[#d8e0ec] bg-white px-3 text-[12.5px] text-[#8b97ac] sm:inline-flex">
          <Filter className="h-4 w-4" />
          Filtreler
        </div>
      </div>

      {/* Kategori pill segmenti (sayacli) — selectedCategory mantigi */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-[#f1f4f9] p-[3px]">
        {categories.map((category) => {
          const count = category.id === 'all' ? visibleReports.length : categoryCounts[category.id];
          const isActive = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={
                isActive
                  ? 'inline-flex items-center gap-1.5 rounded-md border border-[#d3deef] bg-white px-3.5 py-[7px] text-[12.5px] font-semibold text-[#15356b]'
                  : 'inline-flex items-center gap-1.5 rounded-md border border-transparent px-3.5 py-[7px] text-[12.5px] font-medium text-[#8b97ac] transition-colors hover:text-[#51607a]'
              }
            >
              {category.icon}
              <span>{category.label}</span>
              <span
                className={
                  isActive
                    ? 'rounded-full bg-[#eef2fa] px-1.5 text-[11px] font-semibold text-[#15356b]'
                    : 'rounded-full bg-white/70 px-1.5 text-[11px] font-semibold text-[#8b97ac]'
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kategori panelleri */}
      <div className="flex flex-col gap-5">
        {selectedCategory === 'all' ? (
          categoryGroups.map(
            (category) =>
              category.reports.length > 0 && (
                <CategoryPanel
                  key={category.id}
                  category={category.id}
                  title={category.label}
                  icon={category.icon}
                  reports={category.reports}
                />
              )
          )
        ) : (
          <CategoryPanel
            category={selectedCategory}
            title={categories.find((c) => c.id === selectedCategory)?.label ?? 'Raporlar'}
            icon={categories.find((c) => c.id === selectedCategory)?.icon ?? <FileText className="h-4 w-4" />}
            reports={filteredReports}
          />
        )}
      </div>

      {/* Bos durum */}
      {filteredReports.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#d8e0ec] bg-white px-6 py-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-[#9aa6b8]" />
          <h3 className="text-[15px] font-semibold text-[#14223b]">Rapor bulunamadi</h3>
          <p className="mt-1 text-[12.5px] text-[#8b97ac]">Arama kelimesi veya kategori filtresini degistirin.</p>
        </div>
      )}
    </div>
  );
}

function CategoryPanel({
  category,
  title,
  icon,
  reports,
}: {
  category: ReportCategory;
  title: string;
  icon: ReactNode;
  reports: ReportCard[];
}) {
  // Klasik ile ayni one-cikan secimi: highImpact varsa o, yoksa ilk rapor
  const featured = reports.find((report) => report.highImpact) ?? reports[0];
  const compactReports = reports.filter((report) => report.id !== featured?.id);

  if (!featured) return null;

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${panelStyle[category]}`}>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${panelIconStyle[category]}`}
        >
          {icon}
        </span>
        <h2 className="text-[14px] font-semibold text-[#14223b]">{title}</h2>
        <span className="rounded-full border border-[#e7ebf2] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
          {reports.length}
        </span>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        <ReportCardCell report={featured} featured />
        {compactReports.map((report) => (
          <ReportCardCell key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}

function ReportCardCell({ report, featured = false }: { report: ReportCard; featured?: boolean }) {
  return (
    <Link
      href={report.href}
      className="group flex flex-col gap-2 rounded-xl border border-[#e7ebf2] bg-white p-3.5 transition-all hover:-translate-y-px hover:border-[#15356b] hover:shadow-[0_6px_16px_rgba(20,34,59,.07)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#eef2fa] text-[#15356b]">
            {report.icon}
          </span>
          {featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0c2247] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.04em] text-white">
              <Sparkles className="h-[11px] w-[11px]" />
              One Cikan
            </span>
          )}
        </span>
        {report.badge && (
          <span
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
              badgeStyle[report.badge] ?? defaultBadgeStyle
            }`}
          >
            {report.badge}
          </span>
        )}
      </div>

      <div className="text-[14px] font-semibold text-[#14223b]">{report.title}</div>
      <div className="text-[12px] leading-[1.4] text-[#8b97ac]">{report.description}</div>

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {report.tags.slice(0, featured ? 3 : 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[#e7ebf2] bg-[#f8fafc] px-2 py-0.5 text-[10.5px] font-medium text-[#51607a]"
          >
            {tag}
          </span>
        ))}
      </div>

      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#15356b]">
        Raporu Ac
        <ArrowRight className="h-[13px] w-[13px] transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
