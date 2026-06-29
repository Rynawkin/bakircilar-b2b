'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import UrunOverrideNew from './UrunOverrideNew';
import UrunOverrideClassic from './UrunOverrideClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <UrunOverrideNew /> : <UrunOverrideClassic />;
}
