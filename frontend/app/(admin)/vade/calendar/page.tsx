'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import HatirlatmaTakvimiNew from './HatirlatmaTakvimiNew';
import HatirlatmaTakvimiClassic from './HatirlatmaTakvimiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <HatirlatmaTakvimiNew /> : <HatirlatmaTakvimiClassic />;
}
