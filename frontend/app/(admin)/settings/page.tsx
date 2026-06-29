'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import AyarlarNew from './AyarlarNew';
import AyarlarClassic from './AyarlarClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <AyarlarNew /> : <AyarlarClassic />;
}
