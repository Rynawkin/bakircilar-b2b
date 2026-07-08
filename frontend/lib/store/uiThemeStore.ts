/**
 * Admin UI Theme Store (Zustand)
 *
 * Yonetim panelinde yeni gorunum zorunludur.
 * Eski localStorage tercihleri geriye uyumluluk icin temizlenir; uygulama her zaman
 * yeni admin kabugunu ve yeni ekran wrapper'larini kullanir.
 */

import { create } from 'zustand';

export type AdminUiTheme = 'new' | 'old';

export const DEFAULT_ADMIN_THEME: AdminUiTheme = 'new';

const THEME_KEY = 'admin-ui-theme';
const INTRO_KEY = 'admin-ui-intro-seen-v1';

interface UiThemeState {
  theme: AdminUiTheme;
  introSeen: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setTheme: (t: AdminUiTheme) => void;
  markIntroSeen: () => void;
}

export const useUiThemeStore = create<UiThemeState>((set) => ({
  theme: DEFAULT_ADMIN_THEME,
  // Hydrate olana kadar "gorulmus" varsay -> ilk render'da pop-up flash etmesin.
  introSeen: true,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const storedIntro = localStorage.getItem(INTRO_KEY);
      localStorage.setItem(THEME_KEY, DEFAULT_ADMIN_THEME);
      set({
        theme: DEFAULT_ADMIN_THEME,
        introSeen: storedIntro === '1',
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  setTheme: (t: AdminUiTheme) => {
    const next = t === 'new' ? t : DEFAULT_ADMIN_THEME;
    set({ theme: next });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* yoksay */
      }
    }
  },

  markIntroSeen: () => {
    set({ introSeen: true });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(INTRO_KEY, '1');
      } catch {
        /* yoksay */
      }
    }
  },
}));

export default useUiThemeStore;
