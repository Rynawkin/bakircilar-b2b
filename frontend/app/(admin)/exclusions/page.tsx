'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import DislamaKurallariNew from './DislamaKurallariNew';
import DislamaKurallariClassic from './DislamaKurallariClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <DislamaKurallariNew /> : <DislamaKurallariClassic />;
}
