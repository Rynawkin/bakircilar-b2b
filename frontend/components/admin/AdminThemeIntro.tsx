'use client';

/**
 * AdminThemeIntro — yeni gorunum default olunca ILK GIRISTE bir kez cikan tanitim pop-up'i.
 * Eski (klasik) gorunume nasil donulecegini anlatir. theme==='new' && !introSeen iken gosterilir.
 */

import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import { Sparkles, X } from 'lucide-react';

export function AdminThemeIntro() {
  const { theme, introSeen, hydrated, setTheme, markIntroSeen } = useUiThemeStore();

  if (!hydrated || introSeen || theme !== 'new') return null;

  const stayNew = () => markIntroSeen();
  const goOld = () => {
    setTheme('old');
    markIntroSeen();
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={stayNew} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-gradient-to-r from-primary-700 to-primary-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Yönetim paneli yenilendi</div>
              <div className="text-[11px] text-primary-100">Yeni görünümü kullanıyorsunuz</div>
            </div>
          </div>
          <button onClick={stayNew} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-[13px] text-[var(--ink-2)]">
          <p>
            Panel <b>yeni, daha modern bir görünüme</b> geçti. Tüm verileriniz, butonlarınız ve işlevleriniz
            aynı; sadece görünüm yenilendi.
          </p>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-0)] p-3">
            <p className="font-semibold text-[var(--ink-1)]">Eski (klasik) görünüme dönmek isterseniz:</p>
            <p className="mt-1">
              Sağ üstteki <b>kullanıcı menüsünü</b> açın → <b>Görünüm</b> → <b>Klasik</b>’i seçin. İstediğiniz
              zaman tekrar geçiş yapabilirsiniz.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-0)] px-5 py-3">
          <button
            onClick={goOld}
            className="rounded-lg border border-[var(--line-strong)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--ink-2)] hover:bg-gray-50"
          >
            Klasik görünüme dön
          </button>
          <button
            onClick={stayNew}
            className="rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Yeni görünümde devam et
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminThemeIntro;
