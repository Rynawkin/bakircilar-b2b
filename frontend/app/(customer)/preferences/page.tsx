'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import apiClient from '@/lib/api/client';
import { Wallet, Check, Info, CheckCircle2, AlertCircle } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="page-title">Tercihlerim</h1>
            <p className="page-subtitle">Fiyat gösterim ayarlarınızı yönetin</p>
          </div>

          <Card className="bg-white">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary-50 text-primary-700 rounded-lg w-11 h-11 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-gray-900">Fiyat Gösterim Tercihi</h3>
                <p className="text-sm text-gray-500">Faturalı fiyatların nasıl görüntüleneceğini seçin</p>
              </div>
            </div>

            {message && (
              <div
                className={`mb-6 p-3.5 rounded-lg border flex items-start gap-2.5 ${
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

            <div className="space-y-4">
              <div
                onClick={() => setVatDisplayPreference('WITH_VAT')}
                className={`p-5 rounded-xl border cursor-pointer transition-all ${
                  vatDisplayPreference === 'WITH_VAT'
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-[var(--line-strong)] hover:border-primary-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        vatDisplayPreference === 'WITH_VAT'
                          ? 'border-primary-600 bg-primary-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {vatDisplayPreference === 'WITH_VAT' && (
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 text-base mb-1.5">KDV Dahil Görüntüle</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Faturalı fiyatlar KDV dahil olarak gösterilir. Ödeyeceğiniz toplam tutarı direkt görürsünüz.
                    </p>
                    <div className="surface p-3 text-sm">
                      <p className="text-gray-700 mb-1 font-medium">Örnek</p>
                      <p className="text-gray-600">
                        Ürün maliyeti: <span className="font-mono">100 TL</span><br />
                        KDV (%18): <span className="font-mono">+ 18 TL</span><br />
                        <span className="font-semibold text-primary-700">Görünen fiyat: 118 TL</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setVatDisplayPreference('WITHOUT_VAT')}
                className={`p-5 rounded-xl border cursor-pointer transition-all ${
                  vatDisplayPreference === 'WITHOUT_VAT'
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-[var(--line-strong)] hover:border-primary-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        vatDisplayPreference === 'WITHOUT_VAT'
                          ? 'border-primary-600 bg-primary-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {vatDisplayPreference === 'WITHOUT_VAT' && (
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 text-base mb-1.5">KDV Hariç Görüntüle</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Faturalı fiyatlar KDV hariç olarak gösterilir. KDV tutarı sepet ve fatura aşamasında eklenir.
                    </p>
                    <div className="surface p-3 text-sm">
                      <p className="text-gray-700 mb-1 font-medium">Örnek</p>
                      <p className="text-gray-600">
                        <span className="font-semibold text-primary-700">Görünen fiyat: 100 TL</span><br />
                        <span className="text-xs text-gray-500">(KDV sepette hesaplanır)</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[var(--line)]">
              <div className="bg-primary-50 border border-primary-100 p-4 rounded-lg mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-primary-900 mb-1">Bilgi</p>
                    <ul className="text-sm text-primary-800 space-y-1">
                      <li>• Bu ayar sadece <strong>Faturalı fiyatları</strong> etkiler</li>
                      <li>• Beyaz fiyatlar her zaman aynı şekilde gösterilir (maliyet + yarım KDV)</li>
                      <li>• Sepet ve sipariş toplamları her zaman doğru hesaplanır</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSave}
                isLoading={isSaving}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3"
              >
                Ayarları Kaydet
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
