'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import StokAramaNew from './StokAramaNew';
import StokAramaClassic from './StokAramaClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <StokAramaNew /> : <StokAramaClassic />;
}
