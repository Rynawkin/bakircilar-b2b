'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TaleplerNew from './TaleplerNew';
import TaleplerClassic from './TaleplerClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TaleplerNew /> : <TaleplerClassic />;
}
