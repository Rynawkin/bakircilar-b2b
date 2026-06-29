'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import FaturalarNew from './FaturalarNew';
import FaturalarClassic from './FaturalarClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <FaturalarNew /> : <FaturalarClassic />;
}
