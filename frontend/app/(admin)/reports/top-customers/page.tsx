'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import EnIyiMusterilerNew from './EnIyiMusterilerNew';
import EnIyiMusterilerClassic from './EnIyiMusterilerClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <EnIyiMusterilerNew /> : <EnIyiMusterilerClassic />;
}
