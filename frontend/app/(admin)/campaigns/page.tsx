'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import KampanyalarNew from './KampanyalarNew';
import KampanyalarClassic from './KampanyalarClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <KampanyalarNew /> : <KampanyalarClassic />;
}
