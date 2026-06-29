'use client';

import { Suspense } from 'react';
import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TeklifOlusturNew from './TeklifOlusturNew';
import TeklifOlusturClassic from './TeklifOlusturClassic';

function TeklifOlusturThemeSwitch() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TeklifOlusturNew /> : <TeklifOlusturClassic />;
}

export default function AdminQuoteNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yukleniyor...</div>}>
      <TeklifOlusturThemeSwitch />
    </Suspense>
  );
}
