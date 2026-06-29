'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import TedarikciIskontoNew from './TedarikciIskontoNew';
import TedarikciIskontoClassic from './TedarikciIskontoClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <TedarikciIskontoNew /> : <TedarikciIskontoClassic />;
}
