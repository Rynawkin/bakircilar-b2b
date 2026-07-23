'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Settings } from '@/types';
import adminApi from '@/lib/api/admin';
import { CUSTOMER_TYPES } from '@/lib/utils/customerTypes';
import { INVOICED_PRICE_LISTS, RETAIL_PRICE_LISTS } from '@/lib/utils/priceLists';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Settings } from '@/types';

// Re-export sabitler (Classic/New ortak kullanir)
export { CUSTOMER_TYPES };

export const RETAIL_LISTS = RETAIL_PRICE_LISTS.map((list) => ({
  value: list.listNo,
  label: list.label,
}));

export const WHOLESALE_LISTS = INVOICED_PRICE_LISTS.map((list) => ({
  value: list.listNo,
  label: list.label,
}));

export const DEFAULT_CUSTOMER_PRICE_LISTS: NonNullable<Settings['customerPriceLists']> = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

// ==================== Tetiklenecek Isler (scheduled jobs) ====================
// Backend contract: GET/PUT /admin/scheduled-jobs, POST /admin/scheduled-jobs/:key/run
export interface ScheduledJob {
  key: string;
  name: string;
  description: string;
  schedule: string;          // efektif (override varsa override, yoksa default)
  defaultSchedule: string;
  isOverride: boolean;
  editable: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastResult: 'OK' | 'ERROR' | null;
  lastError: string | null;
}

// Basit cron dogrulama (5 alan; her alan izinli karakter kumesi).
// Sunucu tarafi node-cron ile ikinci kez dogrular; bu sadece hizli istemci kontrolu.
export function isValidCronExpression(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldPattern = /^[0-9*,/\-]+$/;
  return parts.every((part) => fieldPattern.test(part));
}

// "0 18 * * *" gibi yaygin desenleri Turkce insan diline cevirir (ipucu metni).
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
export function describeCron(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return '';
  const [min, hour, dom, mon, dow] = parts;
  const pad = (v: string) => (v.length === 1 ? `0${v}` : v);
  const isNum = (v: string) => /^\d+$/.test(v);

  // Her N dakikada bir
  const stepMin = min.match(/^\*\/(\d+)$/);
  if (stepMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `${stepMin[1]} dakikada bir`;
  }
  // Saatte bir (0 * * * *)
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Saatte bir (dakika 00)';
  }
  const stepHour = hour.match(/^\*\/(\d+)$/);
  if (isNum(min) && stepHour && dom === '*' && mon === '*' && dow === '*') {
    return `${stepHour[1]} saatte bir (dakika ${pad(min)})`;
  }
  // Her gun HH:MM
  if (isNum(min) && isNum(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `Her gun ${pad(hour)}:${pad(min)}`;
  }
  // Haftalik gun HH:MM
  if (isNum(min) && isNum(hour) && dom === '*' && mon === '*' && isNum(dow)) {
    const dayName = DAY_NAMES[Number(dow) % 7] || `Gun ${dow}`;
    return `Her ${dayName} ${pad(hour)}:${pad(min)}`;
  }
  return '';
}

const normalizePriceLists = (
  value?: Settings['customerPriceLists']
): NonNullable<Settings['customerPriceLists']> => ({
  BAYI: { ...DEFAULT_CUSTOMER_PRICE_LISTS.BAYI, ...(value?.BAYI || {}) },
  PERAKENDE: { ...DEFAULT_CUSTOMER_PRICE_LISTS.PERAKENDE, ...(value?.PERAKENDE || {}) },
  VIP: { ...DEFAULT_CUSTOMER_PRICE_LISTS.VIP, ...(value?.VIP || {}) },
  OZEL: { ...DEFAULT_CUSTOMER_PRICE_LISTS.OZEL, ...(value?.OZEL || {}) },
});

/**
 * Sistem Ayarlari ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useAyarlar() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [marginRecipientsInput, setMarginRecipientsInput] = useState('');

  // Tetiklenecek isler (scheduled jobs)
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  // Kullanicinin duzenledigi (henuz kaydedilmemis) cron ifadeleri; key -> metin
  const [jobScheduleDrafts, setJobScheduleDrafts] = useState<Record<string, string>>({});
  const [savingJobKey, setSavingJobKey] = useState<string | null>(null);
  const [runningJobKey, setRunningJobKey] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchScheduledJobs();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await adminApi.getSettings();
      const recipients = data.marginReportEmailRecipients || [];
      setSettings({
        ...data,
        customerPriceLists: normalizePriceLists(data.customerPriceLists),
        lastPriceIndexationEnabled: data.lastPriceIndexationEnabled ?? false,
        marginReportEmailEnabled: data.marginReportEmailEnabled ?? false,
        marginReportEmailRecipients: recipients,
        marginReportEmailSubject: data.marginReportEmailSubject || 'Kar Marji Raporu',
        marginAlertLowThreshold: data.marginAlertLowThreshold ?? 5,
        marginAlertHighThreshold: data.marginAlertHighThreshold ?? 70,
        marginEmailWorstLimit: data.marginEmailWorstLimit ?? 15,
        marginPersonalEmailEnabled: data.marginPersonalEmailEnabled ?? false,
        marginViolationEscalationBusinessDays: data.marginViolationEscalationBusinessDays ?? 3,
      });
      setMarginRecipientsInput(recipients.join(', '));
    } finally {
      setIsLoading(false);
    }
  };

  const parseEmailList = (value: string) =>
    value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    try {
      const recipients = parseEmailList(marginRecipientsInput);
      const payload = { ...settings, marginReportEmailRecipients: recipients };
      await adminApi.updateSettings(payload);
      setSettings(payload);
      setMarginRecipientsInput(recipients.join(', '));
      toast.success('Ayarlar basariyla kaydedildi.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kaydetme başarısız');
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Tetiklenecek isler ----
  const applyJobsResponse = (jobs: ScheduledJob[]) => {
    setScheduledJobs(jobs);
    // Taslaklari efektif zamanlama ile senkronize et (kullanici duzenlemedikce).
    setJobScheduleDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const job of jobs) {
        next[job.key] = prev[job.key] !== undefined ? prev[job.key] : job.schedule;
      }
      return next;
    });
  };

  const fetchScheduledJobs = async () => {
    setJobsLoading(true);
    try {
      const data = await adminApi.getScheduledJobs();
      const jobs = (data?.jobs || []) as ScheduledJob[];
      applyJobsResponse(jobs);
    } catch (error) {
      // Endpoint yoksa/erisim yoksa kart sessizce bos kalir.
      setScheduledJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  const setJobScheduleDraft = (key: string, value: string) => {
    setJobScheduleDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const saveJobSchedule = async (key: string) => {
    const draft = (jobScheduleDrafts[key] ?? '').trim();
    if (!isValidCronExpression(draft)) {
      toast.error('Gecersiz cron ifadesi. Ornek: 0 18 * * *');
      return;
    }
    setSavingJobKey(key);
    try {
      const data = await adminApi.setScheduledJobSchedule(key, draft);
      const updated = data?.job as ScheduledJob | undefined;
      if (updated) {
        setScheduledJobs((prev) => prev.map((j) => (j.key === key ? updated : j)));
        setJobScheduleDrafts((prev) => ({ ...prev, [key]: updated.schedule }));
      }
      toast.success('Zamanlama guncellendi. Aninda uygulanir.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Zamanlama kaydedilemedi.');
    } finally {
      setSavingJobKey(null);
    }
  };

  const resetJobSchedule = async (key: string) => {
    setSavingJobKey(key);
    try {
      const data = await adminApi.setScheduledJobSchedule(key, null);
      const updated = data?.job as ScheduledJob | undefined;
      if (updated) {
        setScheduledJobs((prev) => prev.map((j) => (j.key === key ? updated : j)));
        setJobScheduleDrafts((prev) => ({ ...prev, [key]: updated.schedule }));
      }
      toast.success('Varsayilan zamanlamaya donuldu.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Varsayilana donulemedi.');
    } finally {
      setSavingJobKey(null);
    }
  };

  const runJobNow = async (key: string) => {
    setRunningJobKey(key);
    try {
      const data = await adminApi.runScheduledJob(key);
      if (data?.alreadyRunning) {
        toast('Bu is zaten calisiyor.', { icon: '⏳' });
      } else {
        toast.success('Is baslatildi. Arka planda calisiyor.');
      }
      // Kisa bir sure sonra durumlari tazele (lastRunAt / running).
      setTimeout(() => {
        fetchScheduledJobs();
      }, 1500);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Is baslatilamadi.');
    } finally {
      setRunningJobKey(null);
    }
  };

  return {
    // state
    settings,
    setSettings,
    isLoading,
    isSaving,
    marginRecipientsInput,
    setMarginRecipientsInput,
    // handlers
    handleSave,
    // tetiklenecek isler (scheduled jobs)
    scheduledJobs,
    jobsLoading,
    jobScheduleDrafts,
    savingJobKey,
    runningJobKey,
    fetchScheduledJobs,
    setJobScheduleDraft,
    saveJobSchedule,
    resetJobSchedule,
    runJobNow,
    describeCron,
    isValidCronExpression,
    // sabitler (JSX kolayligi icin)
    RETAIL_LISTS,
    WHOLESALE_LISTS,
    DEFAULT_CUSTOMER_PRICE_LISTS,
    CUSTOMER_TYPES,
  };
}

export default useAyarlar;
