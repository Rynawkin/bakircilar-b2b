'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  FileText,
  Circle,
  Trash2,
  Minus,
  Plus,
  Wallet,
  Info,
  Check,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Product } from '@/types';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductRecommendations } from '@/components/customer/ProductRecommendations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel, getVatStatusLabel } from '@/lib/utils/vatDisplay';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

type RecommendationGroup = {
  baseProduct: { id: string; name: string; mikroCode: string };
  products: Product[];
};

export default function CartPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, removeItem, updateQuantity, updateItemNote, addToCart } = useCartStore();
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  // Siparis olusturulurken stok yetersiz cikan kalemleri isaretleriz; bu kalemlerde
  // "tedarik edilebilir, teslim gecikebilir" uyarisi gosteririz. Veri uretmez, sadece
  // backend'in bildirdigi gercek stok sorununu kalem bazinda gorsellestirir.
  const [stockShortNames, setStockShortNames] = useState<string[]>([]);
  const { dialogState, isLoading, showConfirmDialog, closeDialog } = useConfirmDialog();
  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
  }, [loadUserFromStorage, fetchCart]);

  useEffect(() => {
    if (!cart?.items) return;
    const nextNotes: Record<string, string> = {};
    const nextQuantities: Record<string, string> = {};
    cart.items.forEach((item) => {
      nextNotes[item.id] = item.lineNote || '';
      nextQuantities[item.id] = String(item.quantity);
    });
    setLineNotes(nextNotes);
    setQuantityInputs(nextQuantities);
  }, [cart?.items]);

  const cartSignature = useMemo(() => {
    if (!cart?.items || cart.items.length === 0) return '';
    const ids = cart.items.map((item) => item.product.id).sort();
    return ids.join('|');
  }, [cart?.items]);

  // Bir kalemin stok sorunlu olup olmadigini, backend'in dondurdugu uyari metinlerinden
  // urun adi / Mikro kodu eslestirerek belirleriz.
  const isItemStockShort = (productName: string, mikroCode: string) => {
    if (stockShortNames.length === 0) return false;
    const name = (productName || '').toLowerCase();
    const code = (mikroCode || '').toLowerCase();
    return stockShortNames.some((detail) => {
      const d = (detail || '').toLowerCase();
      return (name && d.includes(name)) || (code && d.includes(code));
    });
  };

  const fetchRecommendations = async () => {
    if (!cartSignature) {
      setRecommendationGroups([]);
      return;
    }
    setIsLoadingRecommendations(true);
    try {
      const data = await customerApi.getCartRecommendations();
      setRecommendationGroups(data.groups || []);
    } catch (error) {
      console.error('Oneriler yuklenemedi:', error);
      setRecommendationGroups([]);
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [cartSignature]);

  const handleRecommendationAdd = async (productId: string) => {
    try {
      const safePriceType = allowedPriceTypes.includes(defaultPriceType)
        ? defaultPriceType
        : (allowedPriceTypes[0] || 'INVOICED');
      await addToCart({
        productId,
        quantity: 1,
        priceType: safePriceType,
        priceMode: 'LIST',
      });
      toast.success('Urun sepete eklendi!');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sepete eklenirken hata olustu');
    }
  };

  const handleRemove = async (itemId: string) => {
    await showConfirmDialog(
      {
        title: 'Ürünü Sepetten Çıkar',
        message: 'Bu ürünü sepetten çıkarmak istediğinizden emin misiniz?',
        confirmLabel: 'Sil',
        cancelLabel: 'İptal',
        type: 'danger',
      },
      async () => {
        await removeItem(itemId);
        toast.success('Ürün sepetten çıkarıldı');
      }
    );
  };

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setQuantityInputs((prev) => ({ ...prev, [itemId]: String(newQuantity) }));
    await updateQuantity(itemId, newQuantity);
  };

  const handleQuantityInputChange = (itemId: string, value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setQuantityInputs((prev) => ({ ...prev, [itemId]: sanitized }));
  };

  const commitQuantityInput = async (itemId: string, currentQuantity: number) => {
    const rawValue = quantityInputs[itemId] ?? String(currentQuantity);
    const parsed = parseInt(rawValue, 10);
    const nextQuantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    setQuantityInputs((prev) => ({ ...prev, [itemId]: String(nextQuantity) }));
    if (nextQuantity === currentQuantity) return;
    await handleQuantityChange(itemId, nextQuantity);
  };

  const handleLineNoteChange = (itemId: string, value: string) => {
    setLineNotes((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleLineNoteBlur = async (itemId: string, currentNote?: string | null) => {
    const rawNote = lineNotes[itemId] ?? '';
    const trimmed = rawNote.trim();
    const previous = (currentNote || '').trim();
    if (trimmed === previous) return;
    try {
      await updateItemNote(itemId, trimmed ? trimmed : null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Not guncellenemedi');
    }
  };

  const handleCreateOrder = async () => {
    if (!cart || cart.items.length === 0) {
      toast.error('Sepetiniz bos!');
      return;
    }

    await showConfirmDialog(
      {
        title: isSubUser ? 'Talebi Onayla' : 'Siparisi Onayla',
        message: `${isSubUser ? 'Talebinizi gondermek' : 'Siparisinizi olusturmak'} istediginizden emin misiniz?

Toplam: ${formatCurrency(cart.total)}`,
        confirmLabel: isSubUser ? 'Evet, Gonder' : 'Evet, Olustur',
        cancelLabel: 'Iptal',
        type: 'success',
      },
      async () => {
        setIsCreatingOrder(true);
        try {
          if (isSubUser) {
            await customerApi.createOrderRequest();
            await fetchCart();
            toast.success('Talep gonderildi.');
            router.push('/order-requests');
          } else {
            const result = await customerApi.createOrder({
              customerOrderNumber: customerOrderNumber.trim() || undefined,
              deliveryLocation: deliveryLocation.trim() || undefined,
            });
            await fetchCart();
            setCustomerOrderNumber('');
            setDeliveryLocation('');
            setStockShortNames([]);
            toast.success(`Siparis olusturuldu!
Siparis No: ${result.orderNumber}`, {
              duration: 4000,
            });
            // 1.6: Gizli/pasif oldugu icin siparise alinmayan urunler varsa kullaniciyi bilgilendir.
            if (Array.isArray(result.skippedItems) && result.skippedItems.length > 0) {
              toast.error(
                `Su urunler artik satista degil, siparise alinmadi:\n${result.skippedItems.join('\n')}`,
                { duration: 8000 }
              );
            }
            router.push('/my-orders');
          }
        } catch (error: any) {
          if (!isSubUser && error.response?.data?.error === 'INSUFFICIENT_STOCK') {
            const details: string[] = Array.isArray(error.response.data.details)
              ? error.response.data.details
              : [];
            setStockShortNames(details);
            toast.error(`Stok yetersiz!\n${details.join('\n')}`, {
              duration: 5000,
            });
          } else {
            toast.error(error.response?.data?.error || (isSubUser ? 'Talep gonderilemedi' : 'Siparis olusturulurken hata olustu'));
          }
        } finally {
          setIsCreatingOrder(false);
        }
      }
    );
  };

  const invoicedCount = cart?.items.filter((i) => i.priceType === 'INVOICED').length ?? 0;
  const whiteCount = cart?.items.filter((i) => i.priceType === 'WHITE').length ?? 0;

  const totalItemCount = cart?.items.length ?? 0;

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="container-custom py-8">
        <div className="max-w-4xl mx-auto">
          {/* ── Sayfa basligi ─────────────────────────────────────── */}
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <div>
              <h1 className="page-title">{isSubUser ? 'Talep Sepeti' : 'Sepetim'}</h1>
              <p className="page-subtitle">
                {totalItemCount > 0
                  ? `Sepetinizde ${totalItemCount} ürün bulunuyor`
                  : 'Henüz ürün eklemediniz'}
              </p>
            </div>
          </div>

          {!cart || cart.items.length === 0 ? (
            /* ── Bos sepet ───────────────────────────────────────── */
            <div className="card card-pad">
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-primary-100">
                  <ShoppingCart className="h-9 w-9 text-primary-600" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Sepetiniz boş</h3>
                <p className="text-sm text-gray-500 max-w-md leading-relaxed mb-6">
                  Henüz sepetinize ürün eklemediniz. Ürünleri inceleyerek dilediğiniz kalemi
                  ekleyebilir, hızlıca {isSubUser ? 'talep' : 'sipariş'} oluşturabilirsiniz.
                </p>
                <button onClick={() => router.push('/products')} className="btn-primary">
                  <ShoppingCart className="h-4 w-4" />
                  Ürünleri İncele
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Faturali Urunler ──────────────────────────────── */}
              {(() => {
                const invoicedItems = cart.items.filter(item => item.priceType === 'INVOICED');
                const invoicedSubtotal = invoicedItems.reduce((sum, item) => sum + item.totalPrice, 0);
                const invoicedVat = invoicedItems.reduce((sum, item) => sum + (item.totalPrice * item.vatRate), 0);
                const invoicedTotal = invoicedSubtotal + invoicedVat;

                if (invoicedItems.length === 0) return null;

                return (
                  <div className="card card-pad">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-[var(--line)]">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Faturalı Ürünler</h3>
                          <p className="text-xs text-gray-400">{invoicedItems.length} ürün</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-400">KDV Hariç {formatCurrency(invoicedSubtotal)}</p>
                        <p className="text-lg font-bold text-primary-700">{formatCurrency(invoicedTotal)}</p>
                        <p className="text-[11px] text-gray-400">KDV Dahil</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {invoicedItems.map((item) => {
                        const stockShort = isItemStockShort(item.product.name, item.product.mikroCode);
                        return (
                        <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-4 transition-colors hover:border-primary-200">
                          <div className="flex flex-col sm:flex-row gap-4">
                            {/* Gorsel */}
                            {item.product.imageUrl && (
                              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-gray-50">
                                <img
                                  src={item.product.imageUrl}
                                  alt={item.product.name}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            )}

                            {/* Bilgi */}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[15px] font-semibold leading-snug text-gray-900">{item.product.name}</h3>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="chip font-mono">{item.product.mikroCode}</span>
                                <span className="badge-info">Faturalı</span>
                                {item.priceMode === 'EXCESS' && (
                                  <span className="badge-success">İndirimli</span>
                                )}
                              </div>
                            </div>

                            {/* Miktar + fiyat + sil */}
                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <div className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-gray-50 p-1">
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
                                    disabled={item.quantity <= 1}
                                    aria-label="Azalt"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={quantityInputs[item.id] ?? String(item.quantity)}
                                    onFocus={(event) => event.target.select()}
                                    onChange={(event) => handleQuantityInputChange(item.id, event.target.value)}
                                    onBlur={() => void commitQuantityInput(item.id, item.quantity)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    className="h-8 w-12 rounded-md border border-[var(--line)] bg-white text-center text-sm font-bold text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                    aria-label={`${item.product.name} miktari`}
                                  />
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 transition-colors hover:bg-gray-100"
                                    aria-label="Artır"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>

                                {/* Sil - mobil */}
                                <button
                                  onClick={() => handleRemove(item.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:hidden"
                                  aria-label="Sepetten çıkar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Fiyat */}
                              <div className="flex items-end justify-between sm:block sm:min-w-[120px] sm:text-right">
                                <p className="text-xs text-gray-400">
                                  {formatCurrency(getDisplayPrice(item.unitPrice, item.vatRate, 'INVOICED', vatDisplayPreference))} / adet
                                  <span className="ml-1">({getVatLabel('INVOICED', vatDisplayPreference)})</span>
                                </p>
                                <div>
                                  <p className="text-xl font-bold text-primary-700">
                                    {formatCurrency(getDisplayPrice(item.totalPrice, item.vatRate, 'INVOICED', vatDisplayPreference))}
                                  </p>
                                  <p className="text-[11px] text-gray-400">{getVatStatusLabel(vatDisplayPreference)}</p>
                                </div>
                              </div>

                              {/* Sil - masaustu */}
                              <button
                                onClick={() => handleRemove(item.id)}
                                className="hidden h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:flex"
                                aria-label="Sepetten çıkar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Stok yetersiz uyarisi (getirtilebilir ama gecikebilir) */}
                          {stockShort && (
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                              <p className="text-xs leading-snug text-amber-700">
                                Bu üründe stok yetersiz — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
                              </p>
                            </div>
                          )}

                          {/* Satir notu */}
                          <div className="mt-3">
                            <label className="field-label">Satır notu (opsiyonel)</label>
                            <textarea
                              value={lineNotes[item.id] ?? ''}
                              onChange={(e) => handleLineNoteChange(item.id, e.target.value)}
                              onBlur={() => handleLineNoteBlur(item.id, item.lineNote)}
                              className="input text-xs"
                              rows={2}
                              placeholder="Marka, renk, teslimat notu..."
                            />
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Beyaz Urunler ─────────────────────────────────── */}
              {(() => {
                const whiteItems = cart.items.filter(item => item.priceType === 'WHITE');
                const whiteTotal = whiteItems.reduce((sum, item) => sum + item.totalPrice, 0);

                if (whiteItems.length === 0) return null;

                return (
                  <div className="card card-pad">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-[var(--line)]">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 ring-1 ring-gray-200">
                          <Circle className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Beyaz Fiyatlı Ürünler</h3>
                          <p className="text-xs text-gray-400">{whiteItems.length} ürün · özel fiyat</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-400">Alt Toplam</p>
                        <p className="text-lg font-bold text-gray-700">{formatCurrency(whiteTotal)}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {whiteItems.map((item) => {
                        const stockShort = isItemStockShort(item.product.name, item.product.mikroCode);
                        return (
                        <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-4 transition-colors hover:border-gray-300">
                          <div className="flex flex-col sm:flex-row gap-4">
                            {/* Gorsel */}
                            {item.product.imageUrl && (
                              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-gray-50">
                                <img
                                  src={item.product.imageUrl}
                                  alt={item.product.name}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            )}

                            {/* Bilgi */}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[15px] font-semibold leading-snug text-gray-900">{item.product.name}</h3>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="chip font-mono">{item.product.mikroCode}</span>
                                <span className="badge-neutral">Beyaz (Özel)</span>
                                {item.priceMode === 'EXCESS' && (
                                  <span className="badge-success">İndirimli</span>
                                )}
                              </div>
                            </div>

                            {/* Miktar + fiyat + sil */}
                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <div className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-gray-50 p-1">
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
                                    disabled={item.quantity <= 1}
                                    aria-label="Azalt"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={quantityInputs[item.id] ?? String(item.quantity)}
                                    onFocus={(event) => event.target.select()}
                                    onChange={(event) => handleQuantityInputChange(item.id, event.target.value)}
                                    onBlur={() => void commitQuantityInput(item.id, item.quantity)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    className="h-8 w-12 rounded-md border border-[var(--line)] bg-white text-center text-sm font-bold text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                    aria-label={`${item.product.name} miktari`}
                                  />
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 transition-colors hover:bg-gray-100"
                                    aria-label="Artır"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>

                                {/* Sil - mobil */}
                                <button
                                  onClick={() => handleRemove(item.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:hidden"
                                  aria-label="Sepetten çıkar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Fiyat */}
                              <div className="flex items-end justify-between sm:block sm:min-w-[120px] sm:text-right">
                                <p className="text-xs text-gray-400">
                                  {formatCurrency(item.unitPrice)} / adet
                                </p>
                                <div>
                                  <p className="text-xl font-bold text-gray-700">
                                    {formatCurrency(item.totalPrice)}
                                  </p>
                                  <p className="text-[11px] text-gray-400">Özel Fiyat</p>
                                </div>
                              </div>

                              {/* Sil - masaustu */}
                              <button
                                onClick={() => handleRemove(item.id)}
                                className="hidden h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:flex"
                                aria-label="Sepetten çıkar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Stok yetersiz uyarisi */}
                          {stockShort && (
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                              <p className="text-xs leading-snug text-amber-700">
                                Bu üründe stok yetersiz — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
                              </p>
                            </div>
                          )}

                          {/* Satir notu */}
                          <div className="mt-3">
                            <label className="field-label">Satır notu (opsiyonel)</label>
                            <textarea
                              value={lineNotes[item.id] ?? ''}
                              onChange={(e) => handleLineNoteChange(item.id, e.target.value)}
                              onBlur={() => handleLineNoteBlur(item.id, item.lineNote)}
                              className="input text-xs"
                              rows={2}
                              placeholder="Marka, renk, teslimat notu..."
                            />
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Sepeti Temizle */}
              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    await showConfirmDialog(
                      {
                        title: 'Sepeti Temizle',
                        message: 'Tüm ürünleri sepetten çıkarmak istediğinizden emin misiniz?',
                        confirmLabel: 'Sepeti Temizle',
                        cancelLabel: 'İptal',
                        type: 'danger',
                      },
                      async () => {
                        for (const item of cart.items) {
                          await removeItem(item.id);
                        }
                        toast.success('Sepet temizlendi');
                      }
                    );
                  }}
                  className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Sepeti Temizle
                </button>
              </div>

              {/* Tamamlayici oneriler */}
              {isLoadingRecommendations ? (
                <div className="card card-pad flex items-center gap-2 text-sm text-gray-400">
                  <Sparkles className="h-4 w-4 text-gray-300" />
                  Tamamlayıcı öneriler yükleniyor...
                </div>
              ) : recommendationGroups.length > 0 ? (
                <div className="space-y-4">
                  {recommendationGroups.map((group) => (
                    <Card key={group.baseProduct.id} className="border border-[var(--line)] shadow-none">
                      <ProductRecommendations
                        products={group.products}
                        title={`${group.baseProduct.mikroCode} · ${group.baseProduct.name} için tamamlayıcı ürünler`}
                        icon=""
                        onProductClick={(item) => router.push(`/products/${item.id}`)}
                        onAddToCart={handleRecommendationAdd}
                        allowedPriceTypes={allowedPriceTypes}
                        vatDisplayPreference={vatDisplayPreference}
                      />
                    </Card>
                  ))}
                </div>
              ) : null}

              {/* ── Siparis Ozeti ─────────────────────────────────── */}
              <div className="card card-pad">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-[var(--line)]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Sipariş Özeti</h3>
                      <p className="text-xs text-gray-400">
                        {invoicedCount > 0 && `${invoicedCount} Faturalı`}
                        {invoicedCount > 0 && whiteCount > 0 && ' · '}
                        {whiteCount > 0 && `${whiteCount} Beyaz`}
                      </p>
                    </div>
                  </div>

                  <div>
                    {/* KDV detaylari */}
                    <div className="space-y-2.5 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Ara Toplam (KDV Hariç)</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(cart.subtotal)}</span>
                      </div>
                      {cart.totalVat !== undefined && cart.totalVat > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">KDV</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(cart.totalVat)}</span>
                        </div>
                      )}
                    </div>

                    <div className="mb-6 flex items-center justify-between rounded-xl bg-primary-600 px-5 py-4 text-white shadow-sm shadow-primary-600/20">
                      <span className="text-sm font-semibold">Genel Toplam (KDV Dahil)</span>
                      <span className="text-2xl font-bold">{formatCurrency(cart.total)}</span>
                    </div>

                    {!isSubUser && (
                      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="Teslimat Birimi / Bolge (opsiyonel)"
                          value={deliveryLocation}
                          onChange={(e) => setDeliveryLocation(e.target.value)}
                        />
                        <Input
                          label="Musteri Siparis No (opsiyonel)"
                          value={customerOrderNumber}
                          onChange={(e) => setCustomerOrderNumber(e.target.value)}
                        />
                      </div>
                    )}

                    <Button
                      className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleCreateOrder}
                      isLoading={isCreatingOrder}
                      disabled={!cart || cart.items.length === 0 || isCreatingOrder}
                    >
                      {isCreatingOrder
                        ? (isSubUser ? 'Gonderiliyor...' : 'Olusturuluyor...')
                        : !cart || cart.items.length === 0
                          ? 'Sepet Bos'
                          : (isSubUser ? 'Talep Gonder' : 'Siparisi Olustur')}
                    </Button>

                    {/* Bilgilendirme */}
                    <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/60 p-4">
                      <div className="flex items-start gap-2.5">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
                        <div className="text-xs text-primary-900/90">
                          <p className="mb-1.5 font-semibold">{isSubUser ? 'Talep Bilgilendirmesi' : 'Siparis Bilgilendirmesi'}</p>
                          {isSubUser ? (
                            <ul className="space-y-1">
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Talebiniz yonetici onayina gonderilir</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Fiyat tipi secimi yonetici tarafindan yapilir</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Onaylanan talepler siparise cevrilir</span>
                              </li>
                            </ul>
                          ) : (
                            <ul className="space-y-1">
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Siparisiniz olusturulduktan sonra admin onayi bekler</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Faturali ve beyaz urunler ayri siparisler olarak islenir</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                                <span>Onaylanan siparisler en kisa surede hazirlanir</span>
                              </li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        type={dialogState.type}
        isLoading={isLoading}
      />
    </div>
  );
}
