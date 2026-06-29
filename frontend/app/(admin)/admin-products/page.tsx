'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import UrunYonetimiNew from './UrunYonetimiNew';
import UrunYonetimiClassic from './UrunYonetimiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <UrunYonetimiNew /> : <UrunYonetimiClassic />;
}
