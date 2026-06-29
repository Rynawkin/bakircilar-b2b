'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import DepoKioskNew from './DepoKioskNew';
import DepoKioskClassic from './DepoKioskClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <DepoKioskNew /> : <DepoKioskClassic />;
}
