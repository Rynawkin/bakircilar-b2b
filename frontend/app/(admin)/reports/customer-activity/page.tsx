'use client';

import { Suspense } from 'react';
import MusteriAktiviteNew from './MusteriAktiviteNew';

export default function Page() {
  return (
    <Suspense
      fallback={(
        <div className="container mx-auto p-6">
          <div className="text-gray-500">Rapor yukleniyor...</div>
        </div>
      )}
    >
      <MusteriAktiviteNew />
    </Suspense>
  );
}
