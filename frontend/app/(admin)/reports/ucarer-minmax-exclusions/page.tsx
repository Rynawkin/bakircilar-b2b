'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import MinMaxHaricNew from './MinMaxHaricNew';
import MinMaxHaricClassic from './MinMaxHaricClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <MinMaxHaricNew /> : <MinMaxHaricClassic />;
}
