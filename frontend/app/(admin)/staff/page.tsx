'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import PersonelNew from './PersonelNew';
import PersonelClassic from './PersonelClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <PersonelNew /> : <PersonelClassic />;
}
