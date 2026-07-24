'use client';

import Link from 'next/link';
import {
  SALES_DECISION_REPORT_LIST,
  type SalesDecisionReportKey,
} from '@/lib/reports/salesDecisionReports';

export function SalesDecisionReportGuide({ active }: { active: SalesDecisionReportKey }) {
  const activeReport = SALES_DECISION_REPORT_LIST.find((report) => report.key === active)!;

  return (
    <section
      aria-label="Satış karar raporları"
      className="mb-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
    >
      <div className="mb-3">
        <div className="text-[13px] font-semibold text-slate-900">Hangi raporu kullanmalıyım?</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Aynı müşteri evrenini farklı karar sorularıyla inceleyen dört ayrı rapor.
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SALES_DECISION_REPORT_LIST.map((report) => {
          const selected = report.key === active;
          return (
            <Link
              key={report.key}
              href={report.href}
              aria-current={selected ? 'page' : undefined}
              className="rounded-lg border p-3 no-underline transition hover:-translate-y-px hover:shadow-sm"
              style={{
                borderColor: selected ? report.accent : '#e7ebf2',
                background: selected ? `${report.accent}0d` : '#fff',
              }}
            >
              <div
                className="text-[10px] font-bold tracking-[0.08em]"
                style={{ color: report.accent }}
              >
                {report.purpose}
              </div>
              <div className="mt-1 text-[12.5px] font-semibold text-slate-900">
                {report.shortTitle}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-slate-500">{report.description}</div>
            </Link>
          );
        })}
      </div>
      <div
        className="mt-3 grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-3"
        style={{
          borderColor: `${activeReport.accent}33`,
          background: `${activeReport.accent}08`,
        }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
            Bu raporun sorusu
          </div>
          <div className="mt-1 text-[11.5px] leading-4 text-slate-800">
            {activeReport.decisionQuestion}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
            Satıra giriş koşulu
          </div>
          <div className="mt-1 text-[11.5px] leading-4 text-slate-800">
            {activeReport.inclusionRule}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
            İlk aksiyon
          </div>
          <div className="mt-1 text-[11.5px] leading-4 text-slate-800">
            {activeReport.firstAction}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SalesDecisionReportGuide;
