'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TedarikciFiyatKarsilastirmaNew from './TedarikciFiyatKarsilastirmaNew';
import TedarikciFiyatKarsilastirmaClassic from './TedarikciFiyatKarsilastirmaClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TedarikciFiyatKarsilastirmaNew /> : <TedarikciFiyatKarsilastirmaClassic />;
}
