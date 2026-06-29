'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import BanaAtananGeriKazanimNew from './BanaAtananGeriKazanimNew';
import BanaAtananGeriKazanimClassic from './BanaAtananGeriKazanimClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <BanaAtananGeriKazanimNew /> : <BanaAtananGeriKazanimClassic />;
}
