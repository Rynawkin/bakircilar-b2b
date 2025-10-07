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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">🛒 Sepetim</h1>
                <p className="text-sm text-primary-100">
                  {cart && cart.items.length > 0
                    ? `${cart.items.length} ürün - ${formatCurrency(cart.total)}`
                    : 'Sepetiniz boş'
                  }
                </p>
              </div>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden lg:flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/products')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                🛍️ Alışverişe Devam
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/my-orders')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                📦 Siparişlerim
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
              {/* Cart Items */}
              <Card>
                <div className="flex justify-between items-center mb-4 pb-4 border-b">
                  <h3 className="font-semibold text-gray-900">Sepetim ({cart.items.length} ürün)</h3>
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
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    🗑️ Sepeti Temizle
                  </Button>
                </div>
                <div className="divide-y">
                  {cart.items.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{item.product.name}</h3>
                          <p className="text-sm text-gray-500">Kod: {item.product.mikroCode}</p>
                          <Badge
                            variant={item.priceType === 'INVOICED' ? 'info' : 'default'}
                            className="mt-2"
                          >
                            {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              className="w-8 h-8 rounded border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                              disabled={item.quantity <= 1}
                            >
                              -
                            </button>
                            <span className="w-12 text-center font-medium">{item.quantity}</span>
                            <button
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                              className="w-8 h-8 rounded border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-right w-32">
                            <p className="text-sm text-gray-500">
                              {formatCurrency(item.unitPrice)}
                            </p>
                            <p className="font-bold text-primary-600">
                              {formatCurrency(item.totalPrice)}
                            </p>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(item.id)}
                          >
                            Sil
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Order Summary */}
              <Card>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Sipariş Özeti</h3>

                  <div className="space-y-2">
                    {cart.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {item.product.name} x {item.quantity}
                        </span>
                        <span className="text-gray-900">{formatCurrency(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 flex justify-between text-lg font-bold">
                    <span>Toplam:</span>
                    <span className="text-primary-600">{formatCurrency(cart.total)}</span>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleCreateOrder}
                    isLoading={isCreatingOrder}
                  >
                    Siparişi Oluştur
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    Siparişiniz oluşturulduktan sonra admin onayı bekleyecektir.
                    <br />
                    Faturalı ve beyaz ürünler ayrı siparişler olarak işlenir.
                  </p>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
