'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TumUrunlerMaliyetGuncellemeNew from './TumUrunlerMaliyetGuncellemeNew';
import TumUrunlerMaliyetGuncellemeClassic from './TumUrunlerMaliyetGuncellemeClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TumUrunlerMaliyetGuncellemeNew /> : <TumUrunlerMaliyetGuncellemeClassic />;
}
