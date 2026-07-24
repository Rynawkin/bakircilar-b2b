'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
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
  ManagementProfitPeriodInput,
  ManagementProfitReportApiError,
  ManagementProfitView,
  managementProfitPublicApi,
} from '@/lib/api/managementProfitReport';
import { ManagementProfitLayoutEditor } from './ManagementProfitLayoutEditor';
import { ManagementProfitPivot } from './ManagementProfitPivot';

type PageState = 'loading' | 'pin' | 'ready' | 'error';
type PeriodMode =
  | 'CURRENT_MONTH'
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'CURRENT_YEAR'
  | 'LAST_12_MONTHS'
  | 'CUSTOM';

const PERIOD_OPTIONS: Array<{ value: PeriodMode; label: string }> = [
  { value: 'CURRENT_MONTH', label: 'Bu ay (varsayılan)' },
  { value: 'LAST_3_MONTHS', label: 'Son 3 ay' },
  { value: 'LAST_6_MONTHS', label: 'Son 6 ay' },
  { value: 'CURRENT_YEAR', label: 'Bu yıl' },
  { value: 'LAST_12_MONTHS', label: 'Son 12 ay' },
  { value: 'CUSTOM', label: 'Özel tarih aralığı' },
];

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
  REPORT_PERIOD_INVALID: 'Seçilen tarih aralığı geçerli değil.',
  REPORT_PERIOD_ORDER_INVALID: 'İlk tarih son tarihten sonra olamaz.',
  REPORT_PERIOD_FUTURE_INVALID: 'Raporun son tarihi bugünden ileri olamaz.',
  REPORT_PERIOD_TOO_LARGE: 'Tek seferde en fazla 12 takvim ayı seçebilirsiniz.',
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

const getIstanbulDateParts = (instant = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
  };
};

const toIsoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const monthStartWithOffset = (
  year: number,
  month: number,
  monthOffset: number
) => {
  const shifted = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return toIsoDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    1
  );
};

const strictIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, value };
};

const validatePeriod = (period: ManagementProfitPeriodInput) => {
  const start = strictIsoDate(period.startDate);
  const end = strictIsoDate(period.endDate);
  if (!start || !end) return 'İlk ve son tarihi eksiksiz seçin.';
  if (period.startDate > period.endDate) {
    return 'İlk tarih son tarihten sonra olamaz.';
  }
  const today = getIstanbulDateParts();
  if (period.endDate > toIsoDate(today.year, today.month, today.day)) {
    return 'Raporun son tarihi bugünden ileri olamaz.';
  }
  const calendarMonthCount =
    (end.year - start.year) * 12 + end.month - start.month + 1;
  if (calendarMonthCount > 12) {
    return 'Tek seferde en fazla 12 takvim ayı seçebilirsiniz.';
  }
  return null;
};

const resolvePeriodInput = (
  mode: PeriodMode,
  customStartDate: string,
  customEndDate: string
): ManagementProfitPeriodInput | undefined => {
  if (mode === 'CURRENT_MONTH') return undefined;
  if (mode === 'CUSTOM') {
    return { startDate: customStartDate, endDate: customEndDate };
  }

  const today = getIstanbulDateParts();
  const endDate = toIsoDate(today.year, today.month, today.day);
  const monthOffsets: Partial<Record<PeriodMode, number>> = {
    LAST_3_MONTHS: -2,
    LAST_6_MONTHS: -5,
    LAST_12_MONTHS: -11,
  };
  const startDate =
    mode === 'CURRENT_YEAR'
      ? toIsoDate(today.year, 1, 1)
      : monthStartWithOffset(
          today.year,
          today.month,
          monthOffsets[mode] || 0
        );
  return { startDate, endDate };
};

export function ManagementProfitPublicReport() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [token, setToken] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [periodMode, setPeriodMode] =
    useState<PeriodMode>('CURRENT_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
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
        setPeriodMode('CURRENT_MONTH');
        setCustomStartDate('');
        setCustomEndDate('');
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
    const requestedPeriod = resolvePeriodInput(
      periodMode,
      customStartDate,
      customEndDate
    );
    if (requestedPeriod) {
      const periodError = validatePeriod(requestedPeriod);
      if (periodError) {
        setPinError(periodError);
        return;
      }
    }

    setPinLoading(true);
    setPinError(null);
    const navigationGeneration = navigationGenerationRef.current;
    const submittedToken = token;
    try {
      await managementProfitPublicApi.access(
        submittedToken,
        pin.trim(),
        requestedPeriod
      );
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

  const closeSession = async (resetPeriod: boolean) => {
    try {
      await managementProfitPublicApi.logout();
    } catch {
      // Sunucu oturumu zaten sonlanmışsa da yerel ekranı kilitle.
    }
    setView(null);
    setActiveLayout(null);
    setPin('');
    setPinError(null);
    if (resetPeriod) {
      setPeriodMode('CURRENT_MONTH');
      setCustomStartDate('');
      setCustomEndDate('');
    }
    setPageState(token ? 'pin' : 'error');
    if (!token) {
      setError(
        'Bağlantı anahtarı bulunamadı. Size gönderilen tam bağlantıyı açın.'
      );
    }
  };

  const logout = () => closeSession(true);

  const changePeriod = () => {
    if (view?.period.preset === 'CUSTOM') {
      setPeriodMode('CUSTOM');
      setCustomStartDate(view.period.startDate);
      setCustomEndDate(view.period.endDate);
    } else {
      setPeriodMode('CURRENT_MONTH');
      setCustomStartDate('');
      setCustomEndDate('');
    }
    void closeSession(false);
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
        periodMode={periodMode}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onPinChange={setPin}
        onPeriodModeChange={(nextMode) => {
          setPeriodMode(nextMode);
          setPinError(null);
          if (
            nextMode === 'CUSTOM' &&
            (!customStartDate || !customEndDate)
          ) {
            const today = getIstanbulDateParts();
            setCustomStartDate(toIsoDate(today.year, today.month, 1));
            setCustomEndDate(toIsoDate(today.year, today.month, today.day));
          }
        }}
        onCustomStartDateChange={setCustomStartDate}
        onCustomEndDateChange={setCustomEndDate}
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
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#eef2f7] text-slate-900">
      <header className="border-b border-white/10 bg-[#0b1d3b] text-white">
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2.5 sm:min-h-[72px] sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-3 lg:px-8 [@media(max-height:600px)]:min-h-[48px] [@media(max-height:600px)]:py-1.5">
          <Logo
            layout="horizontal"
            tone="white"
            size="sm"
            className="sm:hidden"
          />
          <Logo
            layout="horizontal"
            tone="white"
            size="md"
            className="hidden sm:inline-flex"
          />
          <div className="hidden h-8 w-px bg-white/15 sm:block" />
          <div className="order-3 min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
            <div className="truncate text-sm font-semibold sm:text-base">
              {view.link.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/60 [@media(max-height:600px)]:hidden">
              <span>Yönetim karlılık raporu</span>
              <span aria-hidden="true">·</span>
              <span>Revizyon {view.revision}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              title="Raporu yenile"
              aria-label="Raporu yenile"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 text-xs font-semibold text-white/90 hover:bg-white/10 sm:w-auto sm:gap-1.5 sm:px-3 lg:h-9"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Yenile</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              title="Rapor görünümünü düzenle"
              aria-label="Rapor görünümünü düzenle"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-xs font-semibold text-[#0b1d3b] hover:bg-slate-100 sm:w-auto sm:gap-1.5 sm:px-3 lg:h-9"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Görünüm</span>
            </button>
            <button
              type="button"
              onClick={logout}
              title="Güvenli oturumu kapat"
              aria-label="Güvenli oturumu kapat"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 text-white/80 hover:bg-white/10 hover:text-white lg:h-9 lg:w-9"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-2.5 py-3 sm:px-6 sm:py-6 lg:px-8 [@media(max-height:600px)]:py-2">
        <section className="mb-3 grid gap-3 sm:mb-4 md:grid-cols-[minmax(0,1fr)_auto] [@media(max-height:600px)]:mb-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:rounded-2xl sm:px-5 sm:py-3.5 [@media(max-height:600px)]:py-2">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-50 text-blue-700 sm:h-10 sm:w-10 sm:rounded-xl">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
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
                <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex [@media(max-height:600px)]:hidden">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    Ana döviz
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    İrsaliyeler dahil
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 md:hidden [@media(max-height:600px)]:hidden">
                  <ShieldCheck className="h-3.5 w-3.5 flex-none" />
                  <span>PIN korumalı güvenli erişim</span>
                </div>
              </div>
              {token && (
                <button
                  type="button"
                  onClick={changePeriod}
                  title="Rapor dönemini değiştir"
                  aria-label="Rapor dönemini değiştir"
                  className="inline-flex h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:px-3"
                >
                  <CalendarRange className="h-4 w-4" />
                  <span className="hidden min-[360px]:inline">Değiştir</span>
                </button>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 md:flex">
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
  periodMode,
  customStartDate,
  customEndDate,
  onPinChange,
  onPeriodModeChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onSubmit,
}: {
  pin: string;
  error: string | null;
  loading: boolean;
  periodMode: PeriodMode;
  customStartDate: string;
  customEndDate: string;
  onPinChange: (value: string) => void;
  onPeriodModeChange: (value: PeriodMode) => void;
  onCustomStartDateChange: (value: string) => void;
  onCustomEndDateChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const today = getIstanbulDateParts();
  const todayIso = toIsoDate(today.year, today.month, today.day);

  return (
    <div className="flex min-h-[100dvh] items-start justify-center overflow-y-auto bg-[#e7ecf3] px-3 py-3 sm:items-center sm:px-4 sm:py-8 [@media(max-height:620px)]:items-start [@media(max-height:620px)]:py-2">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_80px_rgba(11,29,59,0.18)] sm:rounded-2xl">
        <div className="bg-[#0b1d3b] px-5 py-5 text-white sm:px-7 sm:py-7 [@media(max-height:620px)]:px-5 [@media(max-height:620px)]:py-3">
          <Logo layout="horizontal" tone="white" size="sm" />
          <div className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-blue-200 sm:mt-8 sm:h-11 sm:w-11 [@media(max-height:620px)]:hidden">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-white sm:mt-4 sm:text-xl [@media(max-height:620px)]:mt-2">
            Yönetim karlılık raporu
          </h1>
          <p className="mt-1.5 text-sm leading-5 text-white/65 sm:mt-2 sm:leading-6 [@media(max-height:620px)]:hidden">
            Rapor şirket içi ve hassas veriler içerir. Devam etmek için size
            iletilen PIN’i girin.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-7 [@media(max-height:620px)]:space-y-3 [@media(max-height:620px)]:p-4">
          <div>
            <label htmlFor="management-profit-pin" className="field-label">
              Erişim PIN’i
            </label>
            <input
              id="management-profit-pin"
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
          </div>
          <div>
            <label
              htmlFor="management-profit-period"
              className="field-label"
            >
              Rapor dönemi
            </label>
            <select
              id="management-profit-period"
              value={periodMode}
              onChange={(event) =>
                onPeriodModeChange(event.target.value as PeriodMode)
              }
              disabled={loading}
              className="input h-11"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {periodMode === 'CUSTOM' && (
            <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 min-[380px]:grid-cols-2">
              <label className="min-w-0">
                <span className="field-label">İlk tarih</span>
                <input
                  type="date"
                  value={customStartDate}
                  max={customEndDate || todayIso}
                  onChange={(event) =>
                    onCustomStartDateChange(event.target.value)
                  }
                  disabled={loading}
                  className="input h-11 min-w-0 px-2 text-xs sm:text-sm"
                />
              </label>
              <label className="min-w-0">
                <span className="field-label">Son tarih</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate || undefined}
                  max={todayIso}
                  onChange={(event) =>
                    onCustomEndDateChange(event.target.value)
                  }
                  disabled={loading}
                  className="input h-11 min-w-0 px-2 text-xs sm:text-sm"
                />
              </label>
              <p className="text-[10px] leading-4 text-slate-500 min-[380px]:col-span-2">
                Bugüne kadar, en fazla 12 takvim ayı seçilebilir.
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loading || pin.length < 6}
            className="btn-primary h-11 w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {loading ? 'Doğrulanıyor…' : 'Raporu aç'}
          </button>
          <p className="text-center text-[11px] leading-5 text-slate-500 [@media(max-height:620px)]:hidden">
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
