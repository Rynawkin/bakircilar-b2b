'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import RaporMerkeziNew from './RaporMerkeziNew';
import RaporMerkeziClassic from './RaporMerkeziClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <RaporMerkeziNew /> : <RaporMerkeziClassic />;
}
