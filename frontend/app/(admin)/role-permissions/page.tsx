'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import RolIzinleriNew from './RolIzinleriNew';
import RolIzinleriClassic from './RolIzinleriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <RolIzinleriNew /> : <RolIzinleriClassic />;
}
