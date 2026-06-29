'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import FiyatAileYonetimiNew from './FiyatAileYonetimiNew';
import FiyatAileYonetimiClassic from './FiyatAileYonetimiClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <FiyatAileYonetimiNew /> : <FiyatAileYonetimiClassic />;
}
