'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import KategorilerNew from './KategorilerNew';
import KategorilerClassic from './KategorilerClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <KategorilerNew /> : <KategorilerClassic />;
}
