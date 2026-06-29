'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SiparisCevirNew from './SiparisCevirNew';
import SiparisCevirClassic from './SiparisCevirClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SiparisCevirNew /> : <SiparisCevirClassic />;
}
