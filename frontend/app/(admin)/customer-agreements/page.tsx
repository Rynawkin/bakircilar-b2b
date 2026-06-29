'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import AnlasmaliFiyatlarNew from './AnlasmaliFiyatlarNew';
import AnlasmaliFiyatlarClassic from './AnlasmaliFiyatlarClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <AnlasmaliFiyatlarNew /> : <AnlasmaliFiyatlarClassic />;
}
