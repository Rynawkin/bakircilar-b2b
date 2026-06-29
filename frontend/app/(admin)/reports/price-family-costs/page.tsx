'use client';

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import FiyatAilesiMaliyetNew from './FiyatAilesiMaliyetNew';
import FiyatAilesiMaliyetClassic from './FiyatAilesiMaliyetClassic';

export default function Page() {
  const theme = useUiThemeStore((s) => s.theme);
  return theme === 'new' ? <FiyatAilesiMaliyetNew /> : <FiyatAilesiMaliyetClassic />;
}
