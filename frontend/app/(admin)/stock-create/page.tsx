'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import StokAcmaNew from './StokAcmaNew';
import StokAcmaClassic from './StokAcmaClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <StokAcmaNew /> : <StokAcmaClassic />;
}
