'use client';

import { Suspense } from 'react';
import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import MusteriAktiviteNew from './MusteriAktiviteNew';
import MusteriAktiviteClassic from './MusteriAktiviteClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return (
    <Suspense
      fallback={(
        <div className="container mx-auto p-6">
          <div className="text-gray-500">Rapor yukleniyor...</div>
        </div>
      )}
    >
      {theme === 'new' ? <MusteriAktiviteNew /> : <MusteriAktiviteClassic />}
    </Suspense>
  );
}
