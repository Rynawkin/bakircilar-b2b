'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import PerakendeSatisNew from './PerakendeSatisNew';
import PerakendeSatisClassic from './PerakendeSatisClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <PerakendeSatisNew /> : <PerakendeSatisClassic />;
}
