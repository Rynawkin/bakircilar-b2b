'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TedarikMaliyetleriNew from './TedarikMaliyetleriNew';
import TedarikMaliyetleriClassic from './TedarikMaliyetleriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TedarikMaliyetleriNew /> : <TedarikMaliyetleriClassic />;
}
