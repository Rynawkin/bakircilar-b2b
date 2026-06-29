'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import EnCokSatanNew from './EnCokSatanNew';
import EnCokSatanClassic from './EnCokSatanClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <EnCokSatanNew /> : <EnCokSatanClassic />;
}
