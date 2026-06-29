'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import VadeAtamalariNew from './VadeAtamalariNew';
import VadeAtamalariClassic from './VadeAtamalariClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <VadeAtamalariNew /> : <VadeAtamalariClassic />;
}
