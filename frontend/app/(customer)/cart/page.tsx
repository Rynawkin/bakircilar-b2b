'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileMenu } from '@/components/ui/MobileMenu';
import { formatCurrency } from '@/lib/utils/format';

export default function CartPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const { cart, fetchCart, removeItem, updateQuantity } = useCartStore();
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
  }, [loadUserFromStorage, fetchCart]);

  const handleRemove = async (itemId: string) => {
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Bu ürünü sepetten çıkarmak istediğinizden emin misiniz?</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Sil
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (confirmed) {
      await removeItem(itemId);
      toast.success('Ürün sepetten çıkarıldı');
    }
  };

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    await updateQuantity(itemId, newQuantity);
  };

  const handleCreateOrder = async () => {
    if (!cart || cart.items.length === 0) {
      toast.error('Sepetiniz boş!');
      return;
    }

    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Siparişinizi oluşturmak istediğinizden emin misiniz?</p>
          <p className="text-sm text-gray-600">Toplam: {formatCurrency(cart.total)}</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Onayla
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (confirmed) {
      setIsCreatingOrder(true);
      try {
        const result = await customerApi.createOrder();
        toast.success(`Sipariş oluşturuldu! 🎉\nSipariş No: ${result.orderNumber}`, {
          duration: 4000,
        });
        router.push('/my-orders');
      } catch (error: any) {
        if (error.response?.data?.error === 'INSUFFICIENT_STOCK') {
          toast.error('Stok yetersiz!\n' + error.response.data.details.join('\n'), {
            duration: 5000,
          });
        } else {
          toast.error(error.response?.data?.error || 'Sipariş oluşturulurken hata oluştu');
        }
      } finally {
        setIsCreatingOrder(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <header className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-700 shadow-xl border-b-4 border-primary-800">
        <div className="container-custom py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-3xl">🛒</span>
                  Sepetim
                </h1>
                <p className="text-sm text-primary-100 font-medium">
                  {cart && cart.items.length > 0 ? (
                    <>
                      {cart.items.filter(i => i.priceType === 'INVOICED').length > 0 && (
                        <span>📄 {cart.items.filter(i => i.priceType === 'INVOICED').length} Faturalı</span>
                      )}
                      {cart.items.filter(i => i.priceType === 'INVOICED').length > 0 && cart.items.filter(i => i.priceType === 'WHITE').length > 0 && (
                        <span> • </span>
                      )}
                      {cart.items.filter(i => i.priceType === 'WHITE').length > 0 && (
                        <span>⚪ {cart.items.filter(i => i.priceType === 'WHITE').length} Beyaz</span>
                      )}
                      <span> • {formatCurrency(cart.total)}</span>
                    </>
                  ) : (
                    'Sepetiniz boş'
                  )}
                </p>
              </div>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden lg:flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/products')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                🛍️ Alisverise Devam
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/my-orders')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                📦 Siparislerim
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/profile')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                👤 Profil
              </Button>
              <Button
                variant="ghost"
                onClick={() => { logout(); router.push('/login'); }}
                className="text-white hover:bg-primary-800 border border-white/30"
              >
                Cikis
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
        <div className="max-w-4xl mx-auto">
          {!cart || cart.items.length === 0 ? (
            <Card>
              <EmptyState
                icon="cart"
                title="Sepetiniz Boş"
                description="Henüz sepetinize ürün eklemediniz. Ürünleri inceleyerek alışverişe başlayın."
                actionLabel="🛍️ Ürünleri İncele"
                onAction={() => router.push('/products')}
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Faturalı Ürünler */}
              {(() => {
                const invoicedItems = cart.items.filter(item => item.priceType === 'INVOICED');
                const invoicedTotal = invoicedItems.reduce((sum, item) => sum + item.totalPrice, 0);

                if (invoicedItems.length === 0) return null;

                return (
                  <Card className="shadow-xl border-2 border-blue-200 bg-gradient-to-br from-white to-blue-50">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-blue-100">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-2xl">📄</span>
                        Faturalı Ürünler ({invoicedItems.length} ürün)
                      </h3>
                      <div className="text-right">
                        <p className="text-xs text-gray-600 mb-1">Alt Toplam (KDV Dahil)</p>
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(invoicedTotal)}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {invoicedItems.map((item) => (
                        <div key={item.id} className="p-5 bg-white rounded-xl border-2 border-blue-100 hover:border-blue-300 hover:shadow-lg transition-all">
                          <div className="flex flex-col sm:flex-row gap-4">
                            {/* Product Image */}
                            {item.product.imageUrl && (
                              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                                <img
                                  src={item.product.imageUrl}
                                  alt={item.product.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-lg mb-1">{item.product.name}</h3>
                              <p className="text-sm text-gray-600 font-mono mb-2">Kod: {item.product.mikroCode}</p>
                              <Badge variant="info" className="font-semibold">
                                📄 Faturalı (KDV Dahil)
                              </Badge>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-3 bg-gray-50 rounded-lg border-2 border-gray-200 p-1">
                                <button
                                  onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center font-bold text-lg transition-colors disabled:opacity-50"
                                  disabled={item.quantity <= 1}
                                >
                                  -
                                </button>
                                <span className="w-16 text-center font-bold text-lg">{item.quantity}</span>
                                <button
                                  onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center font-bold text-lg transition-colors"
                                >
                                  +
                                </button>
                              </div>

                              {/* Price */}
                              <div className="text-right min-w-[120px]">
                                <p className="text-sm text-gray-600 mb-1">
                                  {formatCurrency(item.unitPrice)} / adet
                                </p>
                                <p className="text-2xl font-bold text-blue-600">
                                  {formatCurrency(item.totalPrice)}
                                </p>
                              </div>

                              {/* Delete Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemove(item.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 font-semibold"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })()}

              {/* Beyaz Ürünler */}
              {(() => {
                const whiteItems = cart.items.filter(item => item.priceType === 'WHITE');
                const whiteTotal = whiteItems.reduce((sum, item) => sum + item.totalPrice, 0);

                if (whiteItems.length === 0) return null;

                return (
                  <Card className="shadow-xl border-2 border-gray-300 bg-gradient-to-br from-white to-gray-50">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-2xl">⚪</span>
                        Beyaz Fiyatlı Ürünler ({whiteItems.length} ürün)
                      </h3>
                      <div className="text-right">
                        <p className="text-xs text-gray-600 mb-1">Alt Toplam</p>
                        <p className="text-lg font-bold text-gray-700">{formatCurrency(whiteTotal)}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {whiteItems.map((item) => (
                        <div key={item.id} className="p-5 bg-white rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:shadow-lg transition-all">
                          <div className="flex flex-col sm:flex-row gap-4">
                            {/* Product Image */}
                            {item.product.imageUrl && (
                              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                                <img
                                  src={item.product.imageUrl}
                                  alt={item.product.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-lg mb-1">{item.product.name}</h3>
                              <p className="text-sm text-gray-600 font-mono mb-2">Kod: {item.product.mikroCode}</p>
                              <Badge variant="default" className="font-semibold bg-gray-200 text-gray-800">
                                ⚪ Beyaz (Özel)
                              </Badge>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-3 bg-gray-50 rounded-lg border-2 border-gray-200 p-1">
                                <button
                                  onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center font-bold text-lg transition-colors disabled:opacity-50"
                                  disabled={item.quantity <= 1}
                                >
                                  -
                                </button>
                                <span className="w-16 text-center font-bold text-lg">{item.quantity}</span>
                                <button
                                  onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center font-bold text-lg transition-colors"
                                >
                                  +
                                </button>
                              </div>

                              {/* Price */}
                              <div className="text-right min-w-[120px]">
                                <p className="text-sm text-gray-600 mb-1">
                                  {formatCurrency(item.unitPrice)} / adet
                                </p>
                                <p className="text-2xl font-bold text-gray-700">
                                  {formatCurrency(item.totalPrice)}
                                </p>
                              </div>

                              {/* Delete Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemove(item.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 font-semibold"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })()}

              {/* Sepeti Temizle Button */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const confirmed = await new Promise((resolve) => {
                      toast((t) => (
                        <div className="flex flex-col gap-3">
                          <p className="font-medium">Tüm ürünleri sepetten çıkarmak istediğinizden emin misiniz?</p>
                          <div className="flex gap-2 justify-end">
                            <button
                              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                              onClick={() => { toast.dismiss(t.id); resolve(false); }}
                            >
                              İptal
                            </button>
                            <button
                              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                              onClick={() => { toast.dismiss(t.id); resolve(true); }}
                            >
                              Sepeti Temizle
                            </button>
                          </div>
                        </div>
                      ), { duration: Infinity });
                    });

                    if (confirmed) {
                      for (const item of cart.items) {
                        await removeItem(item.id);
                      }
                      toast.success('Sepet temizlendi');
                    }
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300 font-semibold"
                >
                  🗑️ Sepeti Temizle
                </Button>
              </div>

              {/* Order Summary */}
              <Card className="shadow-xl border-2 border-green-100 bg-gradient-to-br from-white to-green-50">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-gray-100">
                    <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-xl w-14 h-14 flex items-center justify-center text-2xl">
                      💰
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Sipariş Özeti</h3>
                      <p className="text-sm text-gray-600">
                        {cart.items.filter(i => i.priceType === 'INVOICED').length > 0 && `${cart.items.filter(i => i.priceType === 'INVOICED').length} Faturalı`}
                        {cart.items.filter(i => i.priceType === 'INVOICED').length > 0 && cart.items.filter(i => i.priceType === 'WHITE').length > 0 && ' + '}
                        {cart.items.filter(i => i.priceType === 'WHITE').length > 0 && `${cart.items.filter(i => i.priceType === 'WHITE').length} Beyaz`}
                      </p>
                    </div>
                  </div>

                  <div className="border-t-2 border-gray-200 pt-6">
                    {/* KDV Detayları */}
                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Ara Toplam (KDV Hariç):</span>
                        <span className="font-bold text-gray-900">{formatCurrency(cart.subtotal)}</span>
                      </div>
                      {cart.totalVat !== undefined && cart.totalVat > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">KDV:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(cart.totalVat)}</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl p-5 shadow-lg mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Genel Toplam (KDV Dahil):</span>
                        <span className="text-3xl font-bold">{formatCurrency(cart.total)}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 text-lg shadow-xl rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleCreateOrder}
                      isLoading={isCreatingOrder}
                      disabled={!cart || cart.items.length === 0 || isCreatingOrder}
                    >
                      {isCreatingOrder ? '⏳ Olusturuluyor...' : !cart || cart.items.length === 0 ? '🛒 Sepet Boş' : '✅ Siparişi Oluştur'}
                    </Button>

                    <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="text-xs text-blue-800">
                          <p className="font-semibold mb-1">Siparis Bilgilendirmesi</p>
                          <ul className="space-y-1">
                            <li>• Siparisiniz olusturulduktan sonra admin onayi bekleyecektir</li>
                            <li>• Faturali ve beyaz urunler ayri siparisler olarak islenir</li>
                            <li>• Onaylanan siparisler en kisa surede hazirlanacaktir</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
