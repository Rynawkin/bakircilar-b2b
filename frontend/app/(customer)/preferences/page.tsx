'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/api/client';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';

export default function PreferencesPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, refreshUser } = useAuthStore();
  const [vatDisplayPreference, setVatDisplayPreference] = useState<'WITH_VAT' | 'WITHOUT_VAT'>('WITHOUT_VAT');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user) {
      setVatDisplayPreference(user.vatDisplayPreference || 'WITHOUT_VAT');
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await apiClient.put('/customer/settings', {
        vatDisplayPreference,
      });

      setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi!' });

      // Refresh user data
      await refreshUser();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Ayarlar kaydedilemedi' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const priceVisibility = user.priceVisibility || 'INVOICED_ONLY';

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[680px] px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="mt-2 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-1)]">Tercihler</h1>
          <p className="text-sm text-[var(--ink-3)] mt-1">Fiyat ve KDV görünüm tercihleriniz</p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 p-3.5 rounded-xl border flex items-start gap-2.5 ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-red-50 border-red-100 text-red-700'
            }`}
          >
            {message.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {/* KDV gösterimi */}
          <div className="bg-white border border-[var(--line)] rounded-xl px-5 py-4 shadow-sm hover:shadow transition-shadow flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[var(--ink-1)]">KDV gösterimi</div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">Fiyatların KDV dahil mi hariç mi gösterileceği</div>
            </div>
            <div className="inline-flex bg-[var(--surface-0)] rounded-[9px] p-[3px]">
              <button
                type="button"
                onClick={() => setVatDisplayPreference('WITHOUT_VAT')}
                aria-pressed={vatDisplayPreference === 'WITHOUT_VAT'}
                className={`px-4 py-2 text-[13px] rounded-md transition-all ${
                  vatDisplayPreference === 'WITHOUT_VAT'
                    ? 'bg-white border border-[#d3deef] text-primary-700 font-semibold shadow-sm'
                    : 'text-[var(--ink-3)] font-medium hover:text-[var(--ink-2)]'
                }`}
              >
                KDV Hariç
              </button>
              <button
                type="button"
                onClick={() => setVatDisplayPreference('WITH_VAT')}
                aria-pressed={vatDisplayPreference === 'WITH_VAT'}
                className={`px-4 py-2 text-[13px] rounded-md transition-all ${
                  vatDisplayPreference === 'WITH_VAT'
                    ? 'bg-white border border-[#d3deef] text-primary-700 font-semibold shadow-sm'
                    : 'text-[var(--ink-3)] font-medium hover:text-[var(--ink-2)]'
                }`}
              >
                KDV Dahil
              </button>
            </div>
          </div>

          {/* Fiyat görünürlüğü (read-only) */}
          <div className="bg-white border border-[var(--line)] rounded-xl px-5 py-4 shadow-sm hover:shadow transition-shadow flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[var(--ink-1)]">
                Fiyat görünürlüğü{' '}
                <span className="text-[11px] font-medium text-[var(--ink-3)]">(salt-okunur)</span>
              </div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">Varsayılan olarak gösterilecek fiyat türü</div>
            </div>
            <div className="inline-flex bg-[var(--surface-0)] rounded-[9px] p-[3px]">
              <span
                className={`px-3.5 py-2 text-[13px] rounded-md ${
                  priceVisibility === 'INVOICED_ONLY'
                    ? 'bg-white border border-[#d3deef] text-primary-700 font-semibold shadow-sm'
                    : 'text-[var(--ink-3)] font-medium'
                }`}
              >
                Faturalı
              </span>
              <span
                className={`px-3.5 py-2 text-[13px] rounded-md ${
                  priceVisibility === 'WHITE_ONLY'
                    ? 'bg-white border border-[#d3deef] text-primary-700 font-semibold shadow-sm'
                    : 'text-[var(--ink-3)] font-medium'
                }`}
              >
                Beyaz
              </span>
              <span
                className={`px-3.5 py-2 text-[13px] rounded-md ${
                  priceVisibility === 'BOTH'
                    ? 'bg-white border border-[#d3deef] text-primary-700 font-semibold shadow-sm'
                    : 'text-[var(--ink-3)] font-medium'
                }`}
              >
                Her ikisi
              </span>
            </div>
          </div>
        </div>

        {/* Bilgi */}
        <div className="bg-primary-50 border border-primary-100 p-4 rounded-xl mt-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-primary-900 mb-1">Bilgi</p>
              <ul className="text-sm text-primary-800 space-y-1">
                <li>• Bu ayar sadece <strong>Faturalı fiyatları</strong> etkiler</li>
                <li>• Beyaz fiyatlar her zaman aynı şekilde gösterilir (maliyet + yarım KDV)</li>
                <li>• Sepet ve sipariş toplamları her zaman doğru hesaplanır</li>
                <li>• Fiyat görünürlüğü temsilciniz tarafından ayarlanır</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Kaydet */}
        <Button
          onClick={handleSave}
          isLoading={isSaving}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 mt-4"
        >
          Ayarları Kaydet
        </Button>
      </div>
    </div>
  );
}
