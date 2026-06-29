'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import KategoriAlimKaybiNew from './KategoriAlimKaybiNew';
import KategoriAlimKaybiClassic from './KategoriAlimKaybiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <KategoriAlimKaybiNew /> : <KategoriAlimKaybiClassic />;
}
