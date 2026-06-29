'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import MusterilerNew from './MusterilerNew';
import MusterilerClassic from './MusterilerClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <MusterilerNew /> : <MusterilerClassic />;
}
