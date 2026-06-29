'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import DashboardNew from './DashboardNew';
import DashboardClassic from './DashboardClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <DashboardNew /> : <DashboardClassic />;
}
