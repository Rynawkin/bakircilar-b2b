'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  ArrowRight,
  Pencil,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { CartItem, Product } from '@/types';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductRecommendations } from '@/components/customer/ProductRecommendations';
import { CartGiftPicker } from '@/components/customer/CartGiftPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel, getVatStatusLabel } from '@/lib/utils/vatDisplay';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getUnitOptions, normalizeUnitName } from '@/lib/utils/unit';

type RecommendationGroup = {
  baseProduct: { id: string; name: string; mikroCode: string };
  products: Product[];
};

export default function CartPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const {
    cart,
    isLoading: isCartLoading,
    error: cartError,
    fetchCart,
    removeItem,
    updateQuantity,
    updateItemNote,
    addToCart,
  } = useCartStore();
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  // Mobilde tamamlayici oneriler varsayilan kapali (akordeon) — "Siparisi Tamamla"yi asagi itmesin
  const [mobileRecoOpen, setMobileRecoOpen] = useState(false);
  const [stockShortNames, setStockShortNames] = useState<string[]>([]);
  const [quantityUpdatingIds, setQuantityUpdatingIds] = useState<Record<string, boolean>>({});
  const [removingItemIds, setRemovingItemIds] = useState<Record<string, boolean>>({});
  const [isClearingCart, setIsClearingCart] = useState(false);
  const quantityLocksRef = useRef<Set<string>>(new Set());
  const { dialogState, isLoading, showConfirmDialog, closeDialog } = useConfirmDialog();
  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);

  const getErrorMessage = (error: unknown, fallback: string) => {
    const requestError = error as { response?: { data?: { error?: string } }; message?: string };
    return requestError?.response?.data?.error || requestError?.message || fallback;
  };

  // Girdi kutusu icin GRUPLAMASIZ sayi metni (parseInt guvenli). tr-TR gruplama
  // (1.000) parseInt'i bozar -> input'ta locale KULLANMA; sadece ≈ ipucunda kullan.
  const plainQtyString = (value: number) => {
    if (!Number.isFinite(value)) return '1';
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  };

  // Bir sepet satiri 2. birim (KOLI/PAKET) ile mi eklendi? Eklendiyse stepper/gosterim
  // o birimde calisir; miktar guncellemede BAZ (ana) birime cevrilerek gonderilir.
  const resolveLineUnit = (item: CartItem) => {
    const info = getUnitOptions(item.product.unit, item.product.unit2, item.product.unit2Factor);
    const sel = normalizeUnitName(item.selectedUnit);
    const isSubUnit =
      info.hasToggle && !!sel && !!info.altUnit && sel === normalizeUnitName(info.altUnit);
    // Ekranda gosterilecek miktar (2. birim satirinda alt birime cevrilir)
    const displayQty = isSubUnit ? info.baseToAlt(item.quantity) : item.quantity;
    return { info, isSubUnit, displayQty, displayUnit: isSubUnit ? (info.altUnit as string) : (item.product.unit || 'ADET') };
  };

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
      // Girdi kutusu 2. birim satirinda alt birim miktarini gosterir (gruplamasiz)
      const { displayQty } = resolveLineUnit(item);
      nextQuantities[item.id] = plainQtyString(displayQty);
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
    if (isClearingCart || removingItemIds[itemId]) return;
    await showConfirmDialog(
      {
        title: 'Ürünü Sepetten Çıkar',
        message: 'Bu ürünü sepetten çıkarmak istediğinizden emin misiniz?',
        confirmLabel: 'Sil',
        cancelLabel: 'İptal',
        type: 'danger',
        onError: (error) => toast.error(getErrorMessage(error, 'Ürün sepetten çıkarılamadı.')),
      },
      async () => {
        setRemovingItemIds((prev) => ({ ...prev, [itemId]: true }));
        try {
          await removeItem(itemId);
          toast.success('Ürün sepetten çıkarıldı');
        } finally {
          setRemovingItemIds((prev) => ({ ...prev, [itemId]: false }));
        }
      }
    );
  };

  // Miktar guncelleme — DISPLAY (secili) birim uzerinden calisir; BAZ (ana) birime
  // cevrilip backend'e gonderilir. 2. birim satirinda selectedUnit da iletilir.
  const applyDisplayQuantity = async (item: CartItem, nextDisplayQty: number) => {
    if (!(nextDisplayQty > 0)) return;
    if (quantityLocksRef.current.has(item.id)) return;
    const { info, isSubUnit, displayQty } = resolveLineUnit(item);
    const baseQty = isSubUnit ? info.altToBase(nextDisplayQty) : nextDisplayQty;
    if (!(baseQty > 0)) return;
    const previousInput = plainQtyString(displayQty);
    quantityLocksRef.current.add(item.id);
    setQuantityUpdatingIds((prev) => ({ ...prev, [item.id]: true }));
    setQuantityInputs((prev) => ({ ...prev, [item.id]: plainQtyString(nextDisplayQty) }));
    try {
      await updateQuantity(item.id, baseQty, isSubUnit ? (info.altUnit as string) : undefined);
    } catch (error) {
      setQuantityInputs((prev) => ({ ...prev, [item.id]: previousInput }));
      toast.error(getErrorMessage(error, 'Miktar güncellenemedi. Eski değer geri getirildi.'));
    } finally {
      quantityLocksRef.current.delete(item.id);
      setQuantityUpdatingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleQuantityStep = async (item: CartItem, delta: number) => {
    const { displayQty } = resolveLineUnit(item);
    const next = Math.max(1, Math.round(displayQty) + delta);
    await applyDisplayQuantity(item, next);
  };

  const handleQuantityInputChange = (itemId: string, value: string) => {
    // 2. birim satirinda tam sayi alt-birim; ana birim satiri da tam sayi -> yalniz rakam
    const sanitized = value.replace(/[^0-9]/g, '');
    setQuantityInputs((prev) => ({ ...prev, [itemId]: sanitized }));
  };

  const commitQuantityInput = async (item: CartItem) => {
    const { displayQty } = resolveLineUnit(item);
    const rawValue = quantityInputs[item.id] ?? plainQtyString(displayQty);
    const parsed = parseInt(rawValue, 10);
    const nextDisplayQty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    setQuantityInputs((prev) => ({ ...prev, [item.id]: String(nextDisplayQty) }));
    if (nextDisplayQty === Math.round(displayQty)) return;
    await applyDisplayQuantity(item, nextDisplayQty);
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
    if (!cart || isClearingCart) return;
    await showConfirmDialog(
      {
        title: 'Sepeti Temizle',
        message: 'Tüm ürünleri sepetten çıkarmak istediğinizden emin misiniz?',
        confirmLabel: 'Sepeti Temizle',
        cancelLabel: 'İptal',
        type: 'danger',
        onError: (error) => toast.error(getErrorMessage(error, 'Sepet tamamen temizlenemedi. Lütfen tekrar deneyin.')),
      },
      async () => {
        setIsClearingCart(true);
        try {
          for (const item of cart.items) {
            await removeItem(item.id);
          }
          toast.success('Sepet temizlendi');
        } finally {
          setIsClearingCart(false);
        }
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
    const lineUnit = resolveLineUnit(item);
    // Birim fiyat gosterimi: 2. birim satirinda secili birime cevrilir (fiyat*altPriceFactor)
    const baseUnitPriceDisplay = isInvoiced
      ? getDisplayPrice(item.unitPrice, item.vatRate, 'INVOICED', vatDisplayPreference)
      : item.unitPrice;
    const unitDisplay = lineUnit.isSubUnit
      ? baseUnitPriceDisplay * lineUnit.info.altPriceFactor
      : baseUnitPriceDisplay;
    const lineDisplay = isInvoiced
      ? getDisplayPrice(item.totalPrice, item.vatRate, 'INVOICED', vatDisplayPreference)
      : item.totalPrice;
    const qtyValue = quantityInputs[item.id] ?? plainQtyString(lineUnit.displayQty);
    const stepDisabled = Math.round(lineUnit.displayQty) <= 1;
    const open = noteOpen[item.id];
    const isQuantityUpdating = Boolean(quantityUpdatingIds[item.id]);
    const isRemoving = Boolean(removingItemIds[item.id]) || isClearingCart;
    return (
      <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/products/${item.product.id}`}
            aria-label={`${item.product.name} ürün detayını aç`}
            className="h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-0)] transition-colors hover:border-primary-300"
          >
            {item.product.imageUrl ? (
              <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-gray-300" />
              </span>
            )}
          </Link>

          <div className="min-w-0 flex-1 sm:min-w-[180px]">
            <div className="flex items-center gap-2">
              <Link
                href={`/products/${item.product.id}`}
                className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink-1)] transition-colors hover:text-primary-700 hover:underline"
              >
                {item.product.name}
              </Link>
              {isInvoiced ? (
                <span className="badge-info flex-shrink-0">Faturalı</span>
              ) : (
                <span className="badge-neutral flex-shrink-0">Beyaz</span>
              )}
              {item.priceMode === 'EXCESS' && <span className="badge-success flex-shrink-0">İndirimli</span>}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-[var(--ink-3)]">
              <Link href={`/products/${item.product.id}`} className="hover:text-primary-700 hover:underline">
                {item.product.mikroCode}
              </Link>{' '}
              · KDV %{Math.round((item.vatRate || 0) * 100)}
            </div>
          </div>

          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:w-auto">
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
                <button
                  onClick={() => handleQuantityStep(item, -1)}
                  disabled={stepDisabled || isQuantityUpdating || isClearingCart}
                  className="flex h-8 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:opacity-40"
                  aria-label="Azalt"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={qtyValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                  onBlur={() => void commitQuantityInput(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  disabled={isQuantityUpdating || isClearingCart}
                  className="h-8 w-11 border-x border-[var(--line)] text-center text-sm font-semibold text-[var(--ink-1)] focus:outline-none"
                  aria-label={`${item.product.name} miktarı`}
                />
                <button
                  onClick={() => handleQuantityStep(item, 1)}
                  disabled={isQuantityUpdating || isClearingCart}
                  className="flex h-8 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Artır"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </div>
              {lineUnit.isSubUnit && (
                <div className="flex flex-col items-center leading-tight">
                  <span className="whitespace-nowrap text-[10.5px] font-semibold text-primary-700">
                    {lineUnit.displayUnit}
                  </span>
                  {lineUnit.info.ratioLabel && (
                    <span className="whitespace-nowrap text-[9.5px] text-[var(--ink-3)]">
                      {lineUnit.info.ratioLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="min-w-[88px] text-right">
              <div className="text-[12.5px] text-[var(--ink-2)]">{formatCurrency(unitDisplay)}</div>
              <div className="text-[10.5px] text-[var(--ink-3)]">
                {lineUnit.isSubUnit ? `${lineUnit.displayUnit} fiyatı` : 'birim'}
              </div>
            </div>
            <div className="min-w-[96px] text-right">
              <div className="text-[15px] font-semibold text-[var(--ink-1)]">{formatCurrency(lineDisplay)}</div>
              <div className="text-[10.5px] text-[var(--ink-3)]">
                {isInvoiced ? getVatStatusLabel(vatDisplayPreference) : 'Özel Fiyat'}
              </div>
            </div>
            <button
              onClick={() => handleRemove(item.id)}
              disabled={isRemoving || isQuantityUpdating}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-3)] transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Sepetten çıkar"
            >
              {isRemoving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
      {/* Mobil: alttaki sabit "Siparisi Tamamla" cubugu + gezinme sekmesi icin ekstra bosluk */}
      <div className="mx-auto w-full max-w-[1200px] px-3 py-6 pb-[168px] sm:px-4 lg:px-6 lg:pb-6">
        {/* Baslik */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef2fa] text-[#15356b] sm:flex">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink-1)] sm:text-2xl">
                {isSubUser ? 'Talep Sepeti' : 'Sepetim'}
              </h1>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
                {totalItemCount > 0
                  ? `${totalItemCount} kalem · Faturalı ve Beyaz olarak gruplanmıştır`
                  : 'Henüz ürün eklemediniz'}
              </p>
            </div>
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

        {isCartLoading && !cart ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[var(--line)] bg-white">
            <div className="flex flex-col items-center gap-3 text-sm text-[var(--ink-3)]">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
              Sepetiniz yükleniyor…
            </div>
          </div>
        ) : cartError && (!cart || cart.items.length === 0) ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-white px-6 py-14 text-center" role="alert">
            <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
            <h2 className="text-lg font-semibold text-[var(--ink-1)]">Sepet yüklenemedi</h2>
            <p className="mt-1 max-w-sm text-sm text-[var(--ink-3)]">Bağlantıyı kontrol edip tekrar deneyin.</p>
            <Button className="mt-5" onClick={() => void fetchCart()} isLoading={isCartLoading}>
              Tekrar dene
            </Button>
          </div>
        ) : !cart || cart.items.length === 0 ? (
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
          <div className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-start">
            {/* SOL: kalemler — mobilde w-full ile viewport'a gerilir (items-start icerige gore
                boyutlayip uzun urun adi/fiyatlarla tasmaya yol aciyordu; lg'de sticky aside icin items-start) */}
            <div className="w-full min-w-0 space-y-5 lg:flex-1">
              {/* Hediyeli kampanya (GWP) — hediye secici (Vitrin: kalemlerin ustunde) */}
              <CartGiftPicker refreshKey={cart?.total} />
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
                  disabled={isClearingCart || Object.values(removingItemIds).some(Boolean)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isClearingCart ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isClearingCart ? 'Temizleniyor…' : 'Sepeti Temizle'}
                </button>
              </div>

              {/* Tamamlayici oneriler — mobilde akordeon (varsayilan kapali), masaustunde her zaman acik */}
              {recommendationGroups.length > 0 && (
                <div>
                  {/* Mobil baslik/toggle */}
                  <button
                    type="button"
                    onClick={() => setMobileRecoOpen((o) => !o)}
                    className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left lg:hidden"
                    aria-expanded={mobileRecoOpen}
                  >
                    <span className="text-[13.5px] font-semibold text-[var(--ink-1)]">
                      Tamamlayıcı Öneriler ({recommendationGroups.length})
                    </span>
                    <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--ink-3)] transition-transform ${mobileRecoOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`${mobileRecoOpen ? 'block' : 'hidden'} space-y-4 lg:block`}>
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

            {/* ── MOBIL SABIT ALT CUBUK (Siparisi Tamamla) ─────────────
                 Gezinme sekme cubugunun (~56px + safe-area) hemen ustunde durur.
                 Onay diyalogu acikken gizlenir. Masaustunde gizli (lg:hidden). */}
            {!dialogState.isOpen && (
              <div
                className="fixed inset-x-0 z-40 border-t border-[var(--line)] bg-white px-3 pt-2.5 shadow-[0_-6px_20px_rgba(20,34,59,0.08)] lg:hidden"
                style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
              >
                <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 pb-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[var(--ink-3)]">Genel Toplam · KDV dahil</div>
                    <div className="truncate text-lg font-semibold tracking-tight text-[var(--ink-1)]">
                      {formatCurrency(cart.total)}
                    </div>
                  </div>
                  <Button
                    className="flex h-12 flex-[1.2] items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleCreateOrder}
                    isLoading={isCreatingOrder}
                    disabled={!cart || cart.items.length === 0 || isCreatingOrder}
                  >
                    {isCreatingOrder
                      ? (isSubUser ? 'Gönderiliyor…' : 'Oluşturuluyor…')
                      : (isSubUser ? 'Talebi Gönder' : 'Siparişi Tamamla')}
                    {!isCreatingOrder && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
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
