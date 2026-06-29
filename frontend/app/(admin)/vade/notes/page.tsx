'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import NotRaporuNew from './NotRaporuNew';
import NotRaporuClassic from './NotRaporuClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <NotRaporuNew /> : <NotRaporuClassic />;
}
