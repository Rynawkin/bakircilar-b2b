'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import OperasyonNew from './OperasyonNew';
import OperasyonClassic from './OperasyonClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <OperasyonNew /> : <OperasyonClassic />;
}
