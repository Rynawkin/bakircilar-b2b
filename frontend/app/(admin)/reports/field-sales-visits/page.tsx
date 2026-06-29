'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import SahaZiyaretleriNew from './SahaZiyaretleriNew';
import SahaZiyaretleriClassic from './SahaZiyaretleriClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <SahaZiyaretleriNew /> : <SahaZiyaretleriClassic />;
}
