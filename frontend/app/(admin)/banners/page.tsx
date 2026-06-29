'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import BannerlarNew from './BannerlarNew';
import BannerlarClassic from './BannerlarClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <BannerlarNew /> : <BannerlarClassic />;
}
