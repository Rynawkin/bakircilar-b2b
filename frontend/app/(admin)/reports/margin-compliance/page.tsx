'use client';

import KarMarjiUyumNew from './KarMarjiUyumNew';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Rapor yukleniyor...</div>}>
      <KarMarjiUyumNew />
    </Suspense>
  );
}
