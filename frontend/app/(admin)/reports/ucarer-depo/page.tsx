'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import UcarerDepoNew from './UcarerDepoNew';
import UcarerDepoClassic from './UcarerDepoClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <UcarerDepoNew /> : <UcarerDepoClassic />;
}
