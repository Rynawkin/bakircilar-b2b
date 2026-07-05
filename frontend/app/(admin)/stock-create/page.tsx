'use client';

import { Suspense } from 'react';
import StokAcmaNew from './StokAcmaNew';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yukleniyor...</div>}>
      <StokAcmaNew />
    </Suspense>
  );
}
