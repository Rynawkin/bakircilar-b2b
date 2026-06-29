'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TamamlayiciEksikNew from './TamamlayiciEksikNew';
import TamamlayiciEksikClassic from './TamamlayiciEksikClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TamamlayiciEksikNew /> : <TamamlayiciEksikClassic />;
}
