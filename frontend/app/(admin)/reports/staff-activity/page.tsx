'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import PersonelAktiviteNew from './PersonelAktiviteNew';
import PersonelAktiviteClassic from './PersonelAktiviteClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <PersonelAktiviteNew /> : <PersonelAktiviteClassic />;
}
