'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import VadeMusteriDetayNew from './VadeMusteriDetayNew';
import VadeMusteriDetayClassic from './VadeMusteriDetayClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <VadeMusteriDetayNew /> : <VadeMusteriDetayClassic />;
}
