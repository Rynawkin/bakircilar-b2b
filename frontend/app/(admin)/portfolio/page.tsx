'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import PortfoyumNew from './PortfoyumNew';
import PortfoyumClassic from './PortfoyumClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <PortfoyumNew /> : <PortfoyumClassic />;
}
