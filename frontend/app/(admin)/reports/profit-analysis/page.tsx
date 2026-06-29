'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import KarAnaliziNew from './KarAnaliziNew';
import KarAnaliziClassic from './KarAnaliziClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <KarAnaliziNew /> : <KarAnaliziClassic />;
}
