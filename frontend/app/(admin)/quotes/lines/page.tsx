'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TeklifKalemleriNew from './TeklifKalemleriNew';
import TeklifKalemleriClassic from './TeklifKalemleriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TeklifKalemleriNew /> : <TeklifKalemleriClassic />;
}
