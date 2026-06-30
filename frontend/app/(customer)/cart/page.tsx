'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  AlertTriangle,
  ChevronLeft,
  ArrowRight,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { CartItem, Product } from '@/types';
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
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
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
    const nextOpen: Record<string, boolean> = {};
    cart.items.forEach((item) => {
      nextNotes[item.id] = item.lineNote || '';
      nextQuantities[item.id] = String(item.quantity);
      if (item.lineNote) nextOpen[item.id] = true;
    });
    setLineNotes(nextNotes);
    setQuantityInputs(nextQuantities);
    setNoteOpen((prev) => ({ ...nextOpen, ...prev }));
  }, [cart?.items]);

  const cartSignature = useMemo(() => {
    if (!cart?.items || cart.items.length === 0) return '';
    const ids = cart.items.map((item) => item.product.id).sort();
    return ids.join('|');
  }, [cart?.items]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  const handleRecommendationAdd = async (productId: string) => {
    try {
      const safePriceType = allowedPriceTypes.includes(defaultPriceType)
        ? defaultPriceType
        : (allowedPriceTypes[0] || 'INVOICED');
      await addToCart({ productId, quantity: 1, priceType: safePriceType, priceMode: 'LIST' });
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
Siparis No: ${result.orderNumber}`, { duration: 4000 });
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
            const details: string[] = Array.isArray(error.response.data.details) ? error.response.data.details : [];
            setStockShortNames(details);
            toast.error(`Stok yetersiz!\n${details.join('\n')}`, { duration: 5000 });
          } else {
            toast.error(error.response?.data?.error || (isSubUser ? 'Talep gonderilemedi' : 'Siparis olusturulurken hata olustu'));
          }
        } finally {
          setIsCreatingOrder(false);
        }
      }
    );
  };

  const handleClearCart = async () => {
    if (!cart) return;
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
  };

  const invoicedItems = cart?.items.filter((i) => i.priceType === 'INVOICED') ?? [];
  const whiteItems = cart?.items.filter((i) => i.priceType === 'WHITE') ?? [];
  const invoicedSubtotal = invoicedItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const invoicedVat = invoicedItems.reduce((sum, item) => sum + item.totalPrice * item.vatRate, 0);
  const whiteSubtotal = whiteItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalItemCount = cart?.items.length ?? 0;

  // ── Tek satir render (Faturali + Beyaz ortak) ─────────────────────────
  const renderLine = (item: CartItem) => {
    const stockShort = isItemStockShort(item.product.name, item.product.mikroCode);
    const isInvoiced = item.priceType === 'INVOICED';
    const unitDisplay = isInvoiced
      ? getDisplayPrice(item.unitPrice, item.vatRate, 'INVOICED', vatDisplayPreference)
      : item.unitPrice;
    const lineDisplay = isInvoiced
      ? getDisplayPrice(item.totalPrice, item.vatRate, 'INVOICED', vatDisplayPreference)
      : item.totalPrice;
    const open = noteOpen[item.id];
    return (
      <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          {item.product.imageUrl ? (
            <div className="h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-0)]">
              <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-0)]">
              <ShoppingCart className="h-5 w-5 text-gray-300" />
            </div>
          )}

          <div className="min-w-0 flex-1 sm:min-w-[180px]">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink-1)]">{item.product.name}</span>
              {isInvoiced ? (
                <span className="badge-info flex-shrink-0">Faturalı</span>
              ) : (
                <span className="badge-neutral flex-shrink-0">Beyaz</span>
              )}
              {item.priceMode === 'EXCESS' && <span className="badge-success flex-shrink-0">İndirimli</span>}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-[var(--ink-3)]">
              {item.product.mikroCode} · KDV %{Math.round((item.vatRate || 0) * 100)}
            </div>
          </div>

          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:w-auto">
            <div className="flex items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
              <button
                onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
                className="flex h-8 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:opacity-40"
                aria-label="Azalt"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantityInputs[item.id] ?? String(item.quantity)}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                onBlur={() => void commitQuantityInput(item.id, item.quantity)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="h-8 w-11 border-x border-[var(--line)] text-center text-sm font-semibold text-[var(--ink-1)] focus:outline-none"
                aria-label={`${item.product.name} miktari`}
              />
              <button
                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                className="flex h-8 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
                aria-label="Artır"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              </button>
            </div>

            <div className="min-w-[88px] text-right">
              <div className="text-[12.5px] text-[var(--ink-2)]">{formatCurrency(unitDisplay)}</div>
              <div className="text-[10.5px] text-[var(--ink-3)]">birim</div>
            </div>
            <div className="min-w-[96px] text-right">
              <div className="text-[15px] font-semibold text-[var(--ink-1)]">{formatCurrency(lineDisplay)}</div>
              <div className="text-[10.5px] text-[var(--ink-3)]">
                {isInvoiced ? getVatStatusLabel(vatDisplayPreference) : 'Özel Fiyat'}
              </div>
            </div>
            <button
              onClick={() => handleRemove(item.id)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-3)] transition-colors hover:border-red-200 hover:text-red-600"
              aria-label="Sepetten çıkar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {stockShort && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs leading-snug text-amber-700">
              Bu üründe stok yetersiz — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
            </p>
          </div>
        )}

        <div className="mt-2.5">
          {!open ? (
            <button
              type="button"
              onClick={() => setNoteOpen((prev) => ({ ...prev, [item.id]: true }))}
              className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] transition-colors hover:text-primary-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Satır notu ekle
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-0)] px-2.5">
              <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
              <input
                value={lineNotes[item.id] ?? ''}
                onChange={(e) => handleLineNoteChange(item.id, e.target.value)}
                onBlur={() => handleLineNoteBlur(item.id, item.lineNote)}
                placeholder="Satır notu (marka, renk, teslimat talebi)"
                className="h-9 flex-1 border-none bg-transparent text-[12.5px] text-[var(--ink-1)] outline-none"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        {/* Baslik */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">
              {isSubUser ? 'Talep Sepeti' : 'Sepetim'}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--ink-3)]">
              {totalItemCount > 0
                ? `${totalItemCount} kalem · Faturalı ve Beyaz olarak gruplanmıştır`
                : 'Henüz ürün eklemediniz'}
            </p>
          </div>
          {totalItemCount > 0 && (
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-3.5 py-2 text-[13px] font-medium text-primary-600 transition-colors hover:bg-[var(--surface-0)]"
            >
              <ChevronLeft className="h-4 w-4" />
              Alışverişe devam et
            </Link>
          )}
        </div>

        {!cart || cart.items.length === 0 ? (
          /* Bos sepet */
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-6 py-16 text-center">
            <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-inset ring-primary-100">
              <ShoppingCart className="h-8 w-8 text-primary-600" strokeWidth={1.7} />
            </span>
            <h2 className="mb-2 text-xl font-semibold text-[var(--ink-1)]">Sepetiniz şu an boş</h2>
            <p className="mb-6 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink-3)]">
              Eklediğiniz ürünler Faturalı ve Beyaz olarak burada gruplanır. Daha önce aldıklarınızdan tek tıkla tekrar
              {isSubUser ? ' talep' : ' sipariş'} verebilirsiniz.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => router.push('/products')} className="btn-primary">
                Ürünlere göz at
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => router.push('/previously-purchased')} className="btn-secondary">
                Daha önce aldıklarım
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-5 lg:flex-row">
            {/* SOL: kalemler */}
            <div className="min-w-0 flex-1 space-y-5">
              {invoicedItems.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="badge-info">Faturalı</span>
                      <span className="text-[12.5px] text-[var(--ink-3)]">{invoicedItems.length} kalem · +KDV</span>
                    </div>
                    <div className="text-[12.5px] text-[var(--ink-2)]">
                      KDV hariç <b className="font-semibold text-[var(--ink-1)]">{formatCurrency(invoicedSubtotal)}</b> · dahil{' '}
                      <b className="font-semibold text-[var(--ink-1)]">{formatCurrency(invoicedSubtotal + invoicedVat)}</b>
                    </div>
                  </div>
                  <div className="space-y-2.5 p-3.5">{invoicedItems.map(renderLine)}</div>
                </div>
              )}

              {whiteItems.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="badge-neutral">Beyaz (Özel)</span>
                      <span className="text-[12.5px] text-[var(--ink-3)]">{whiteItems.length} kalem · özel fiyat</span>
                    </div>
                    <div className="text-[12.5px] text-[var(--ink-2)]">
                      Alt toplam <b className="font-semibold text-[var(--ink-1)]">{formatCurrency(whiteSubtotal)}</b>
                    </div>
                  </div>
                  <div className="space-y-2.5 p-3.5">{whiteItems.map(renderLine)}</div>
                </div>
              )}

              {/* Sepeti temizle */}
              <div className="flex justify-end">
                <button
                  onClick={handleClearCart}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Sepeti Temizle
                </button>
              </div>

              {/* Tamamlayici oneriler */}
              {recommendationGroups.length > 0 && (
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
              )}
            </div>

            {/* SAG: siparis ozeti */}
            <aside className="w-full flex-shrink-0 lg:sticky lg:top-[120px] lg:w-[348px]">
              <div className="rounded-2xl border border-[var(--line)] bg-white p-[18px]">
                <h3 className="mb-3.5 text-[15px] font-semibold text-[var(--ink-1)]">Sipariş Özeti</h3>

                <div className="space-y-2 text-[13px]">
                  {invoicedItems.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--ink-2)]">Faturalı <span className="text-[var(--ink-3)]">(KDV hariç)</span></span>
                      <span className="font-medium text-[var(--ink-1)]">{formatCurrency(invoicedSubtotal)}</span>
                    </div>
                  )}
                  {whiteItems.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--ink-2)]">Beyaz <span className="text-[var(--ink-3)]">(KDV hariç)</span></span>
                      <span className="font-medium text-[var(--ink-1)]">{formatCurrency(whiteSubtotal)}</span>
                    </div>
                  )}
                </div>

                <div className="my-3.5 border-t border-[var(--line)]" />

                <div className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">Ara toplam (KDV hariç)</span>
                    <span className="font-medium text-[var(--ink-1)]">{formatCurrency(cart.subtotal)}</span>
                  </div>
                  {cart.totalVat !== undefined && cart.totalVat > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--ink-2)]">KDV</span>
                      <span className="font-medium text-[var(--ink-1)]">{formatCurrency(cart.totalVat)}</span>
                    </div>
                  )}
                </div>

                <div className="my-3.5 border-t border-[var(--line)]" />

                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-[var(--ink-1)]">Genel Toplam</span>
                  <span className="text-2xl font-semibold tracking-tight text-[var(--ink-1)]">{formatCurrency(cart.total)}</span>
                </div>
                <div className="mt-0.5 text-right text-[11px] text-[var(--ink-3)]">KDV dahil</div>

                {!isSubUser && (
                  <div className="mt-4 space-y-3">
                    <Input
                      label="Teslimat birimi / bölge (opsiyonel)"
                      value={deliveryLocation}
                      onChange={(e) => setDeliveryLocation(e.target.value)}
                      placeholder="Örn. Merkez depodan teslim"
                    />
                    <Input
                      label="Müşteri sipariş no (opsiyonel)"
                      value={customerOrderNumber}
                      onChange={(e) => setCustomerOrderNumber(e.target.value)}
                      placeholder="Örn. SAT-2026-0481"
                    />
                  </div>
                )}

                <Button
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-base font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleCreateOrder}
                  isLoading={isCreatingOrder}
                  disabled={!cart || cart.items.length === 0 || isCreatingOrder}
                >
                  {isCreatingOrder
                    ? (isSubUser ? 'Gönderiliyor…' : 'Oluşturuluyor…')
                    : (isSubUser ? 'Talebi Gönder' : 'Siparişi Tamamla')}
                  {!isCreatingOrder && <ArrowRight className="h-4 w-4" />}
                </Button>

                <div className="mt-3.5 flex items-start gap-2 border-t border-[var(--line)] pt-3.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
                  <span className="text-[11.5px] leading-relaxed text-[var(--ink-2)]">
                    {isSubUser
                      ? 'Talebiniz yöneticinize iletilir; fiyat tipi yönetici tarafından seçilir ve onaylanınca siparişe çevrilir.'
                      : 'Siparişiniz temsilcinize iletilir; stok ve fiyat onayından sonra kesinleşir. Faturalı ve beyaz ürünler ayrı işlenir.'}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

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
