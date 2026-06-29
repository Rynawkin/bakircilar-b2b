'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import StokAileYonetimiNew from './StokAileYonetimiNew';
import StokAileYonetimiClassic from './StokAileYonetimiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <StokAileYonetimiNew /> : <StokAileYonetimiClassic />;
}
