'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SahaSatisNew from './SahaSatisNew';
import SahaSatisClassic from './SahaSatisClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SahaSatisNew /> : <SahaSatisClassic />;
}
