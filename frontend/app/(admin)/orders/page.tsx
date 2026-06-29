'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SiparislerNew from './SiparislerNew';
import SiparislerClassic from './SiparislerClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SiparislerNew /> : <SiparislerClassic />;
}
