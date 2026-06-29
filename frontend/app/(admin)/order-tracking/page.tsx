'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SiparisTakipNew from './SiparisTakipNew';
import SiparisTakipClassic from './SiparisTakipClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SiparisTakipNew /> : <SiparisTakipClassic />;
}
