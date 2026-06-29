'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import FiyatGecmisiNew from './FiyatGecmisiNew';
import FiyatGecmisiClassic from './FiyatGecmisiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <FiyatGecmisiNew /> : <FiyatGecmisiClassic />;
}
