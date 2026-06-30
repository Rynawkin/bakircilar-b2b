/**
 * Admin UI Theme Store (Zustand)
 *
 * Yonetim paneli icin "yeni gorunum" (redesign) ile "klasik gorunum" (mevcut) arasinda
 * KULLANICI-BAZLI gecis. Tercih cihaz-bazli localStorage'da tutulur.
 *
 * - Ekranlar tek tek yeni tasarima cevrilir. Cevrilen ekran: theme==='new' ise yeni,
 *   degilse (veya cevrilmemisse) klasik render eder (per-screen fallback).
 * - DEFAULT_ADMIN_THEME su an 'old' (production guvenli). Yeterli ekran hazir olunca
 *   'new'e cevrilir; o an ilk-giris pop-up'i (AdminThemeIntro) devreye girer.
 */

import { create } from 'zustand';

export type AdminUiTheme = 'new' | 'old';

// 67/67 ekran cevrildi + kullanici onayladi -> varsayilan YENI gorunum.
// Klasik gorunum hala mevcut: kullanici menusu -> Gorunum -> Klasik ile donulebilir.
// (Geri almak icin tek satir: 'old' yap.)
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
      const storedTheme = localStorage.getItem(THEME_KEY) as AdminUiTheme | null;
      const storedIntro = localStorage.getItem(INTRO_KEY);
      set({
        theme: storedTheme === 'new' || storedTheme === 'old' ? storedTheme : DEFAULT_ADMIN_THEME,
        introSeen: storedIntro === '1',
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  setTheme: (t: AdminUiTheme) => {
    set({ theme: t });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_KEY, t);
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
