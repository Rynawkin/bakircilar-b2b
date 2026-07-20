'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import apiClient from '@/lib/api/client';
import authApi from '@/lib/api/auth';
import toast from 'react-hot-toast';
import { Info, CheckCircle2, AlertCircle, ChevronRight, LockKeyhole } from 'lucide-react';

export default function PreferencesPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, refreshUser, logout } = useAuthStore();
  const [vatDisplayPreference, setVatDisplayPreference] = useState<'WITH_VAT' | 'WITHOUT_VAT'>('WITHOUT_VAT');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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

  const handleChangePassword = async () => {
    if (isChangingPassword) return;
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError('Yeni şifre en az 10 karakter olmalıdır.');
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setPasswordError('Yeni şifre en fazla 72 bayt olabilir; Türkçe karakterler birden fazla bayt kullanabilir.');
      return;
    }
    if (!/[a-zçğıöşü]/.test(newPassword) || !/[A-ZÇĞİÖŞÜ]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Yeni şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Yeni şifre mevcut şifrenizden farklı olmalıdır.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await authApi.changePassword({ currentPassword, newPassword });
      toast.success(result.message);
      logout();
      router.replace('/login');
    } catch (error: any) {
      setPasswordError(
        error.response?.data?.details?.[0]?.message ||
          error.response?.data?.error ||
          'Şifre değiştirilemedi. Lütfen tekrar deneyin.'
      );
    } finally {
      setIsChangingPassword(false);
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
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Tercihlerim</span>
        </div>

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-[var(--ink-1)]">Tercihler</h1>
          <p className="text-[13px] text-[var(--ink-3)] mt-0.5">Fiyat ve KDV görünüm tercihleriniz</p>
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

        <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm" aria-labelledby="password-heading">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h2 id="password-heading" className="text-base font-semibold text-[var(--ink-1)]">Şifre değiştir</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
                Bu işlem yalnızca B2B giriş şifrenizi değiştirir; cari ve Mikro bilgileriniz değişmez.
              </p>
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleChangePassword();
            }}
          >
            <Input
              type="password"
              autoComplete="current-password"
              label="Mevcut şifre"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setPasswordError(null);
              }}
            />
            <Input
              type="password"
              autoComplete="new-password"
              label="Yeni şifre"
              maxLength={72}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setPasswordError(null);
              }}
            />
            <Input
              type="password"
              autoComplete="new-password"
              label="Yeni şifre (tekrar)"
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setPasswordError(null);
              }}
            />
            {passwordError && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {passwordError}
              </p>
            )}
            <p className="text-xs text-[var(--ink-3)]">
              En az 10 karakter; en az bir büyük harf, bir küçük harf ve bir rakam kullanın.
            </p>
            <Button
              type="submit"
              isLoading={isChangingPassword}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              className="w-full sm:w-auto"
            >
              Şifremi değiştir
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
