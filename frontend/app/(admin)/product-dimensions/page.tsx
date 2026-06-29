'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import UrunOlculeriNew from './UrunOlculeriNew';
import UrunOlculeriClassic from './UrunOlculeriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <UrunOlculeriNew /> : <UrunOlculeriClassic />;
}
