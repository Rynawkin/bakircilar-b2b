'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Loader2,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Logo } from '@/components/ui/Logo';
import {
  ManagementProfitLayout,
  ManagementProfitReportApiError,
  ManagementProfitView,
  managementProfitPublicApi,
} from '@/lib/api/managementProfitReport';
import { ManagementProfitLayoutEditor } from './ManagementProfitLayoutEditor';
import { ManagementProfitPivot } from './ManagementProfitPivot';

type PageState = 'loading' | 'pin' | 'ready' | 'error';

const ACCESS_ERROR_MESSAGES: Record<string, string> = {
  LINK_PAUSED: 'Bu rapor bağlantısı geçici olarak duraklatılmış.',
  LINK_REVOKED: 'Bu rapor bağlantısı iptal edilmiş.',
  LINK_EXPIRED: 'Bu rapor bağlantısının süresi dolmuş.',
  INVALID_TOKEN: 'Rapor bağlantısı geçerli değil.',
  SESSION_EXPIRED: 'Güvenli oturumun süresi doldu. PIN’i yeniden girin.',
  PIN_REQUIRED: 'Devam etmek için rapor PIN’ini girin.',
  PIN_INVALID: 'Girdiğiniz PIN doğru değil.',
  PIN_RATE_LIMIT:
    'Çok fazla deneme yapıldı. Lütfen bir süre bekleyip yeniden deneyin.',
  RATE_LIMITED:
    'Çok fazla deneme yapıldı. Lütfen bir süre bekleyip yeniden deneyin.',
};

const getMessage = (
  error: unknown,
  fallback = 'Rapor şu anda görüntülenemiyor.'
) => {
  if (error instanceof ManagementProfitReportApiError) {
    return (
      (error.code && ACCESS_ERROR_MESSAGES[error.code]) ||
      error.message ||
      fallback
    );
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const extractFragmentToken = () => {
  if (typeof window === 'undefined') return '';
  const fragment = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!fragment || fragment.length > 1024) return '';
  try {
    return decodeURIComponent(fragment).trim();
  } catch {
    return fragment.trim();
  }
};

const cloneLayout = (
  layout: ManagementProfitLayout
): ManagementProfitLayout => ({
  ...layout,
  rowFields: [...layout.rowFields],
});

const formatReportDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

export function ManagementProfitPublicReport() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [token, setToken] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ManagementProfitView | null>(null);
  const [activeLayout, setActiveLayout] =
    useState<ManagementProfitLayout | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const navigationGenerationRef = useRef(0);

  const loadView = useCallback(async (
    fragmentToken: string,
    navigationGeneration = navigationGenerationRef.current
  ) => {
    setError(null);
    try {
      const response = await managementProfitPublicApi.view();
      if (navigationGeneration !== navigationGenerationRef.current) return;
      setView(response);
      setActiveLayout(cloneLayout(response.layout));
      setPageState('ready');
      setPinError(null);
    } catch (requestError) {
      if (navigationGeneration !== navigationGenerationRef.current) return;
      const isUnauthorized =
        requestError instanceof ManagementProfitReportApiError &&
        requestError.status === 401;

      if (isUnauthorized && fragmentToken) {
        setPinError(
          requestError.code === 'SESSION_EXPIRED'
            ? getMessage(requestError)
            : null
        );
        setPageState('pin');
        return;
      }

      setError(
        !fragmentToken && isUnauthorized
          ? 'Bağlantı anahtarı bulunamadı. Size gönderilen tam bağlantıyı açın.'
          : getMessage(requestError)
      );
      setPageState('error');
    }
  }, []);

  useEffect(() => {
    const openFromCurrentLocation = () => {
      const navigationGeneration = navigationGenerationRef.current + 1;
      navigationGenerationRef.current = navigationGeneration;
      const fragmentToken = extractFragmentToken();
      setToken(fragmentToken);
      setPinLoading(false);
      // A newly opened share URL must always be bound to its own token + PIN.
      // Do not let an existing cookie for another report link satisfy /view
      // before this fragment has been authorized. Listen for hash changes too:
      // navigating from link A to link B can be a same-document navigation.
      if (fragmentToken) {
        setView(null);
        setActiveLayout(null);
        setPin('');
        setError(null);
        setPinError(null);
        setPageState('pin');
        return;
      }
      setPageState('loading');
      loadView('', navigationGeneration);
    };

    openFromCurrentLocation();
    window.addEventListener('hashchange', openFromCurrentLocation);
    return () => {
      window.removeEventListener('hashchange', openFromCurrentLocation);
    };
  }, [loadView]);

  const submitPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setPinError(
        'Bağlantı anahtarı bulunamadı. Size gönderilen tam bağlantıyı açın.'
      );
      return;
    }
    if (pin.trim().length < 6) {
      setPinError('Lütfen 6–12 haneli PIN’i girin.');
      return;
    }

    setPinLoading(true);
    setPinError(null);
    const navigationGeneration = navigationGenerationRef.current;
    const submittedToken = token;
    try {
      await managementProfitPublicApi.access(submittedToken, pin.trim());
      if (
        navigationGeneration !== navigationGenerationRef.current ||
        extractFragmentToken() !== submittedToken
      ) {
        return;
      }
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`
        );
      }
      setPin('');
      await loadView(submittedToken, navigationGeneration);
    } catch (requestError) {
      if (navigationGeneration !== navigationGenerationRef.current) return;
      setPinError(getMessage(requestError, 'PIN doğrulanamadı.'));
    } finally {
      if (navigationGeneration === navigationGenerationRef.current) {
        setPinLoading(false);
      }
    }
  };

  const applyLayout = (layout: ManagementProfitLayout) => {
    setActiveLayout(cloneLayout(layout));
    setReloadKey((value) => value + 1);
    setEditorOpen(false);
    toast.success('Görünüm bu oturum için uygulandı.');
  };

  const saveLayout = async (layout: ManagementProfitLayout) => {
    if (!view?.link.canSaveLayout) return;
    setSavingLayout(true);
    try {
      const response = await managementProfitPublicApi.saveLayout(
        layout,
        view.revision
      );
      const savedLayout = response.layout || layout;
      setView((current) =>
        current
          ? {
              ...current,
              layout: cloneLayout(savedLayout),
              revision: response.revision,
            }
          : current
      );
      setActiveLayout(cloneLayout(savedLayout));
      setReloadKey((value) => value + 1);
      setEditorOpen(false);
      toast.success('Varsayılan görünüm kaydedildi.');
    } catch (requestError) {
      if (
        requestError instanceof ManagementProfitReportApiError &&
        requestError.status === 409
      ) {
        toast.error(
          'Görünüm başka bir oturumda değişti. Güncel ayarlar yeniden yüklendi.'
        );
        await loadView(token);
      } else {
        toast.error(getMessage(requestError, 'Görünüm kaydedilemedi.'));
      }
    } finally {
      setSavingLayout(false);
    }
  };

  const logout = async () => {
    try {
      await managementProfitPublicApi.logout();
    } catch {
      // Sunucu oturumu zaten sonlanmışsa da yerel ekranı kilitle.
    }
    setView(null);
    setActiveLayout(null);
    setPin('');
    setPinError(null);
    setPageState(token ? 'pin' : 'error');
    if (!token) {
      setError(
        'Bağlantı anahtarı bulunamadı. Size gönderilen tam bağlantıyı açın.'
      );
    }
  };

  if (pageState === 'loading') {
    return <ReportLoading />;
  }

  if (pageState === 'pin') {
    return (
      <PinGate
        pin={pin}
        error={pinError}
        loading={pinLoading}
        onPinChange={setPin}
        onSubmit={submitPin}
      />
    );
  }

  if (
    pageState === 'error' ||
    !view ||
    !activeLayout
  ) {
    return (
      <ReportError
        message={error || 'Rapor bağlantısı görüntülenemiyor.'}
        onRetry={() => {
          setPageState('loading');
          loadView(token);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#eef2f7] text-slate-900">
      <header className="border-b border-white/10 bg-[#0b1d3b] text-white">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1800px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Logo layout="horizontal" tone="white" size="md" />
          <div className="hidden h-8 w-px bg-white/15 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold sm:text-base">
              {view.link.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/60">
              <span>Yönetim karlılık raporu</span>
              <span aria-hidden="true">·</span>
              <span>Revizyon {view.revision}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-semibold text-white/90 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Yenile</span>
          </button>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#0b1d3b] hover:bg-slate-100"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Görünüm</span>
          </button>
          <button
            type="button"
            onClick={logout}
            title="Güvenli oturumu kapat"
            aria-label="Güvenli oturumu kapat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <section className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Rapor dönemi
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-slate-900 sm:text-base">
                  {view.period.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {formatReportDate(view.period.startDate)} –{' '}
                  {formatReportDate(view.period.endDate)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    Ana döviz
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    İrsaliyeler dahil
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            <ShieldCheck className="h-4 w-4 flex-none" />
            <span>
              PIN korumalı, oturuma özel erişim
              {view.link.canSaveLayout ? ' · düzen kaydı açık' : ''}
            </span>
          </div>
        </section>

        <ManagementProfitPivot
          layout={activeLayout}
          rowFields={view.fields.rows}
          reloadKey={reloadKey}
        />
      </main>

      <ManagementProfitLayoutEditor
        open={editorOpen}
        layout={activeLayout}
        rowFields={view.fields.rows}
        columnFields={view.fields.columns}
        valueFields={view.fields.values}
        canSave={view.link.canSaveLayout}
        saving={savingLayout}
        onClose={() => setEditorOpen(false)}
        onApply={applyLayout}
        onSave={saveLayout}
      />
    </div>
  );
}

function ReportLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef2f7] px-4">
      <div className="text-center">
        <Logo layout="horizontal" tone="blue" size="lg" />
        <Loader2 className="mx-auto mt-8 h-7 w-7 animate-spin text-primary-600" />
        <p className="mt-3 text-sm font-medium text-slate-700">
          Güvenli rapor oturumu kontrol ediliyor
        </p>
      </div>
    </div>
  );
}

function PinGate({
  pin,
  error,
  loading,
  onPinChange,
  onSubmit,
}: {
  pin: string;
  error: string | null;
  loading: boolean;
  onPinChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#e7ecf3] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_26px_80px_rgba(11,29,59,0.18)]">
        <div className="bg-[#0b1d3b] px-7 py-7 text-white">
          <Logo layout="horizontal" tone="white" size="md" />
          <div className="mt-8 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-blue-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">
            Yönetim karlılık raporu
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/65">
            Rapor şirket içi ve hassas veriler içerir. Devam etmek için size
            iletilen PIN’i girin.
          </p>
        </div>
        <form onSubmit={onSubmit} className="p-7">
          <label htmlFor="management-profit-pin" className="field-label">
            Erişim PIN’i
          </label>
          <input
            id="management-profit-pin"
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(event) =>
              onPinChange(event.target.value.replace(/\D/g, '').slice(0, 12))
            }
            placeholder="••••"
            className="input h-12 text-center font-mono text-xl tracking-[0.3em]"
          />
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loading || pin.length < 6}
            className="btn-primary mt-4 h-11 w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {loading ? 'Doğrulanıyor…' : 'Raporu aç'}
          </button>
          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Güvenli oturum kapatıldığında veya süresi dolduğunda PIN yeniden
            istenir.
          </p>
        </form>
      </div>
    </div>
  );
}

function ReportError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef2f7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <Logo
          layout="horizontal"
          tone="blue"
          size="lg"
          className="justify-center"
        />
        <AlertCircle className="mx-auto mt-7 h-9 w-9 text-amber-600" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">
          Rapor görüntülenemiyor
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <button type="button" onClick={onRetry} className="btn-primary mt-5">
          <RefreshCw className="h-4 w-4" />
          Tekrar dene
        </button>
      </div>
    </div>
  );
}
