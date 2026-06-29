'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import ResimHataNew from './ResimHataNew';
import ResimHataClassic from './ResimHataClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <ResimHataNew /> : <ResimHataClassic />;
}
