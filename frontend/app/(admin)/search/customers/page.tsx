'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import CariAramaNew from './CariAramaNew';
import CariAramaClassic from './CariAramaClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <CariAramaNew /> : <CariAramaClassic />;
}
