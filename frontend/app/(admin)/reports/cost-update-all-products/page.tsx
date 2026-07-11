'use client';

import TumUrunlerMaliyetGuncellemeNew from './TumUrunlerMaliyetGuncellemeNew';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Urunler yukleniyor...</div>}>
      <TumUrunlerMaliyetGuncellemeNew />
    </Suspense>
  );
}
