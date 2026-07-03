'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Settings } from '@/types';
import adminApi from '@/lib/api/admin';
import { CUSTOMER_TYPES } from '@/lib/utils/customerTypes';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Settings } from '@/types';

// Re-export sabitler (Classic/New ortak kullanir)
export { CUSTOMER_TYPES };

export const RETAIL_LISTS = [
  { value: 1, label: 'Perakende Satis 1' },
  { value: 2, label: 'Perakende Satis 2' },
  { value: 3, label: 'Perakende Satis 3' },
  { value: 4, label: 'Perakende Satis 4' },
  { value: 5, label: 'Perakende Satis 5' },
];

export const WHOLESALE_LISTS = [
  { value: 6, label: 'Toptan Satis 1' },
  { value: 7, label: 'Toptan Satis 2' },
  { value: 8, label: 'Toptan Satis 3' },
  { value: 9, label: 'Toptan Satis 4' },
  { value: 10, label: 'Toptan Satis 5' },
];

export const DEFAULT_CUSTOMER_PRICE_LISTS: NonNullable<Settings['customerPriceLists']> = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

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

  useEffect(() => {
    fetchSettings();
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
    // sabitler (JSX kolayligi icin)
    RETAIL_LISTS,
    WHOLESALE_LISTS,
    DEFAULT_CUSTOMER_PRICE_LISTS,
    CUSTOMER_TYPES,
  };
}

export default useAyarlar;
