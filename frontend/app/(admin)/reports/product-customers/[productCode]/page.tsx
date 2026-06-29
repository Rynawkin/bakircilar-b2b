'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import UrunMusteriDetayNew from './UrunMusteriDetayNew';
import UrunMusteriDetayClassic from './UrunMusteriDetayClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <UrunMusteriDetayNew /> : <UrunMusteriDetayClassic />;
}
