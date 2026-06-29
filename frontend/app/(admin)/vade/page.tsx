'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import VadeTakipNew from './VadeTakipNew';
import VadeTakipClassic from './VadeTakipClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <VadeTakipNew /> : <VadeTakipClassic />;
}
