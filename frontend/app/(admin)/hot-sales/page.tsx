'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SicakSatisNew from './SicakSatisNew';
import SicakSatisClassic from './SicakSatisClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SicakSatisNew /> : <SicakSatisClassic />;
}
