'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LogoLink } from '@/components/ui/Logo';
import { MobileMenu } from '@/components/ui/MobileMenu';
import apiClient from '@/lib/api/client';

export default function PreferencesPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout, refreshUser } = useAuthStore();
  const [vatDisplayPreference, setVatDisplayPreference] = useState<'WITH_VAT' | 'WITHOUT_VAT'>('WITH_VAT');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user) {
      setVatDisplayPreference(user.vatDisplayPreference || 'WITH_VAT');
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
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">⚙️ Tercihler</h1>
                <p className="text-sm text-primary-100">Görünüm ve tercihler</p>
              </div>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden lg:flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/products')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                🛍️ Ürünler
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/profile')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                👤 Profil
              </Button>
              <Button
                variant="ghost"
                onClick={() => { logout(); router.push('/login'); }}
                className="text-white hover:bg-primary-800"
              >
                Çıkış
              </Button>
            </div>

            {/* Mobile Navigation */}
            <MobileMenu
              items={[
                { label: 'Ürünler', href: '/products', icon: '🛍️' },
                { label: 'Sepetim', href: '/cart', icon: '🛒' },
                { label: 'Siparişlerim', href: '/my-orders', icon: '📦' },
                { label: 'Profilim', href: '/profile', icon: '👤' },
                { label: 'Tercihler', href: '/preferences', icon: '⚙️' },
              ]}
              user={user}
              onLogout={() => { logout(); router.push('/login'); }}
            />
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                💰
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Fiyat Gösterim Tercihi</h3>
                <p className="text-sm text-gray-600">Faturalı fiyatların nasıl görüntüleneceğini seçin</p>
              </div>
            </div>

            {message && (
              <div
                className={`mb-6 p-4 rounded-lg border-l-4 ${
                  message.type === 'success'
                    ? 'bg-green-50 border-green-500 text-green-800'
                    : 'bg-red-50 border-red-500 text-red-800'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="space-y-4">
              <div
                onClick={() => setVatDisplayPreference('WITH_VAT')}
                className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  vatDisplayPreference === 'WITH_VAT'
                    ? 'border-primary-600 bg-primary-50 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        vatDisplayPreference === 'WITH_VAT'
                          ? 'border-primary-600 bg-primary-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {vatDisplayPreference === 'WITH_VAT' && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-lg mb-2">📄 KDV Dahil Görüntüle</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Faturalı fiyatlar KDV dahil olarak gösterilir. Ödeyeceğiniz toplam tutarı direkt görürsünüz.
                    </p>
                    <div className="bg-white border border-gray-200 rounded p-3 text-sm">
                      <p className="text-gray-700 mb-1"><strong>Örnek:</strong></p>
                      <p className="text-gray-600">
                        Ürün maliyeti: <span className="font-mono">100 TL</span><br />
                        KDV (%18): <span className="font-mono">+ 18 TL</span><br />
                        <span className="font-bold text-primary-700">Görünen fiyat: 118 TL</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setVatDisplayPreference('WITHOUT_VAT')}
                className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  vatDisplayPreference === 'WITHOUT_VAT'
                    ? 'border-primary-600 bg-primary-50 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        vatDisplayPreference === 'WITHOUT_VAT'
                          ? 'border-primary-600 bg-primary-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {vatDisplayPreference === 'WITHOUT_VAT' && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-lg mb-2">📋 KDV Hariç Görüntüle</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Faturalı fiyatlar KDV hariç olarak gösterilir. KDV tutarı sepet ve fatura aşamasında eklenir.
                    </p>
                    <div className="bg-white border border-gray-200 rounded p-3 text-sm">
                      <p className="text-gray-700 mb-1"><strong>Örnek:</strong></p>
                      <p className="text-gray-600">
                        <span className="font-bold text-primary-700">Görünen fiyat: 100 TL</span><br />
                        <span className="text-xs text-gray-500">(KDV sepette hesaplanır)</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💡</span>
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">Not:</p>
                    <ul className="text-sm text-blue-800 space-y-1">
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
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-3 shadow-lg"
              >
                {isSaving ? '💾 Kaydediliyor...' : '💾 Ayarları Kaydet'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
