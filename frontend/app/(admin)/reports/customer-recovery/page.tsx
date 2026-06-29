'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import CariGeriKazanimNew from './CariGeriKazanimNew';
import CariGeriKazanimClassic from './CariGeriKazanimClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <CariGeriKazanimNew /> : <CariGeriKazanimClassic />;
}
