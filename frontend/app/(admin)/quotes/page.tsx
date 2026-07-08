'use client';

import { Suspense } from 'react';
import TekliflerNew from './TekliflerNew';

function QuotesThemeSwitch() {
  return <TekliflerNew />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      }
    >
      <QuotesThemeSwitch />
    </Suspense>
  );
}
