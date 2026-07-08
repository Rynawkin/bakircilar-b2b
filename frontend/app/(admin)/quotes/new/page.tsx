'use client';

import { Suspense } from 'react';
import TeklifOlusturNew from './TeklifOlusturNew';

function TeklifOlusturThemeSwitch() {
  return <TeklifOlusturNew />;
}

export default function AdminQuoteNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yukleniyor...</div>}>
      <TeklifOlusturThemeSwitch />
    </Suspense>
  );
}
