'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import Cari360New from './Cari360New';
import Cari360Classic from './Cari360Classic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <Cari360New /> : <Cari360Classic />;
}
