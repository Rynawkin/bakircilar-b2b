'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import MaliyetGuncellemeUyarilariNew from './MaliyetGuncellemeUyarilariNew';
import MaliyetGuncellemeUyarilariClassic from './MaliyetGuncellemeUyarilariClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <MaliyetGuncellemeUyarilariNew /> : <MaliyetGuncellemeUyarilariClassic />;
}
