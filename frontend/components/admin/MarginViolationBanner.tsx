'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { adminApi, MarginViolationDashboard } from '@/lib/api/admin';

export function MarginViolationBanner() {
  const [data, setData] = useState<MarginViolationDashboard | null>(null);

  useEffect(() => {
    let active = true;
    adminApi.getMarginViolationDashboard()
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, []);

  if (!data || data.totalOpen <= 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 flex-none text-amber-700" size={18} />
        <div>
          <p className="text-sm font-semibold text-amber-950">{data.totalOpen} açık marj ihlali aksiyon bekliyor</p>
          <p className="mt-0.5 text-xs text-amber-800">
            {data.inReview} incelemede{data.escalated ? ` · ${data.escalated} gecikmiş` : ''}{data.unassigned ? ` · ${data.unassigned} sahipsiz` : ''}
          </p>
        </div>
      </div>
      <Link href="/margin-violations" className="inline-flex h-8 flex-none items-center gap-1.5 self-start rounded-md bg-amber-800 px-3 text-xs font-semibold text-white sm:self-auto">
        Aksiyon Merkezi <ArrowRight size={14} />
      </Link>
    </div>
  );
}
