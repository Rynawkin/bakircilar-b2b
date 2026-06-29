'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import KategoriFirsatNew from './KategoriFirsatNew';
import KategoriFirsatClassic from './KategoriFirsatClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <KategoriFirsatNew /> : <KategoriFirsatClassic />;
}
