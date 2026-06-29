'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import MusteriSepetleriNew from './MusteriSepetleriNew';
import MusteriSepetleriClassic from './MusteriSepetleriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <MusteriSepetleriNew /> : <MusteriSepetleriClassic />;
}
