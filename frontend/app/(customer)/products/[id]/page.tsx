'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product } from '@/types';
import customerApi from '@/lib/api/customer';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { ProductRecommendations } from '@/components/customer/ProductRecommendations';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import {
  ChevronRight,
  ImageIcon,
  ImageOff,
  CheckCircle2,
  Minus,
  Plus,
  Handshake,
  Truck,
  MapPin,
  AlertTriangle,
  ShoppingCart,
  Search,
} from 'lucide-react';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { addToCart } = useCartStore();
  const { user, loadUserFromStorage } = useAuthStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<'INVOICED' | 'WHITE'>('INVOICED');
  const [isAdding, setIsAdding] = useState(false);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isReportingImageIssue, setIsReportingImageIssue] = useState(false);
  const [imageIssueReported, setImageIssueReported] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(
    () => getAllowedPriceTypes(effectiveVisibility),
    [effectiveVisibility]
  );
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (params.id) {
      fetchProduct(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!product?.id) return;
    trackCustomerActivity({
      type: 'PRODUCT_VIEW',
      productId: product.id,
      productCode: product.mikroCode,
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { productName: product.name },
    });
  }, [product?.id]);

  useEffect(() => {
    if (params.id) {
      fetchRecommendations(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!allowedPriceTypes.includes(priceType)) {
      setPriceType(defaultPriceType);
    }
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  const fetchProduct = async (id: string) => {
    setIsLoading(true);
    try {
      const data = await customerApi.getProductById(id);
      setProduct(data);
      setIsZoomed(false);
      setImageIssueReported(false);
      setQuantity(1);
    } catch (error) {
      console.error('Urun yukleme hatasi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecommendations = async (id: string) => {
    setIsLoadingRecommendations(true);
    try {
      const data = await customerApi.getProductRecommendations(id);
      setRecommendations(data.products || []);
    } catch (error) {
      console.error('Oneriler yuklenemedi:', error);
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    if (quantity > maxQuantity) {
      const confirmed = await confirmBackorder({
        requestedQty: quantity,
        availableQty: maxQuantity,
        unit: product.unit,
      });
      if (!confirmed) {
        return;
      }
    }

    setIsAdding(true);
    try {
      const safePriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
      await addToCart({
        productId: product.id,
        quantity,
        priceType: safePriceType,
        priceMode,
      });

      toast.success('Urun sepete eklendi!');
      router.push('/cart');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sepete eklenirken hata olustu');
    } finally {
      setIsAdding(false);
    }
  };

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

  const handleReportImageIssue = async () => {
    if (!product) return;
    setIsReportingImageIssue(true);
    try {
      const result = await customerApi.reportProductImageIssue(product.id);
      setImageIssueReported(true);
      toast.success(
        result.alreadyReported
          ? 'Bu urun icin acik resim hata talebi zaten var'
          : 'Resim hata talebi gonderildi'
      );
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Resim hata talebi gonderilemedi');
    } finally {
      setIsReportingImageIssue(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)]">
        <div className="rounded-2xl border border-[var(--line)] bg-white px-8 py-12 text-center">
          <p className="text-[var(--ink-2)]">Ürün bulunamadı</p>
          <button onClick={() => router.push('/products')} className="btn-primary mt-4">
            Ürünlere Dön
          </button>
        </div>
      </div>
    );
  }

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity = isDiscounted
    ? Math.max(getDisplayStock(product), Number(product.excessStock) || 0)
    : getMaxOrderQuantity(product, 'LIST');
  const displayStock = isDiscounted
    ? product.excessStock ?? 0
    : getDisplayStock(product);
  const priceMode = isDiscounted ? 'EXCESS' : 'LIST';
  const warehouseBreakdown = isDiscounted ? product.warehouseExcessStocks : product.warehouseStocks;
  const warehouseLabels: Record<string, string> = { '1': 'Merkez Depo', '6': 'Topça Depo' };
  const warehouseEntries = Object.entries(warehouseBreakdown || {})
    .map(([warehouse, stock]) => {
      const match = String(warehouse).match(/\d+/);
      const key = match ? match[0] : warehouse;
      return { key, stock: Number(stock) || 0 };
    })
    .filter(({ key, stock }) => (key === '1' || key === '6') && stock > 0);
  const listInvoiced = product.listPrices?.invoiced;
  const listWhite = product.listPrices?.white;
  const excessInvoiced = product.excessPrices?.invoiced;
  const excessWhite = product.excessPrices?.white;
  const hasAgreement = Boolean(product.agreement);
  const agreementMinQuantity = product.agreement?.minQuantity ?? 1;
  const calcDiscount = (listPrice?: number, salePrice?: number) => {
    if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
    return Math.round(((listPrice - salePrice) / listPrice) * 100);
  };
  const invoicedDiscount = calcDiscount(listInvoiced, product.prices.invoiced);
  const whiteDiscount = calcDiscount(listWhite, product.prices.white);
  const excessInvoicedDiscount = calcDiscount(product.prices.invoiced, excessInvoiced);
  const excessWhiteDiscount = calcDiscount(product.prices.white, excessWhite);
  const shouldShowDiscounts = !hasAgreement;
  const selectedPriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
  const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const selectedListPrice = selectedPriceType === 'INVOICED' ? listInvoiced : listWhite;
  const selectedDiscount = selectedPriceType === 'INVOICED' ? invoicedDiscount : whiteDiscount;
  const totalPrice = selectedPrice * quantity;
  const displaySelectedPrice = getDisplayPrice(
    selectedPrice,
    product.vatRate,
    selectedPriceType,
    vatDisplayPreference
  );
  const displayTotalPrice = getDisplayPrice(
    totalPrice,
    product.vatRate,
    selectedPriceType,
    vatDisplayPreference
  );
  const displayInvoicedPrice = getDisplayPrice(
    product.prices.invoiced,
    product.vatRate,
    'INVOICED',
    vatDisplayPreference
  );
  const displayWhitePrice = getDisplayPrice(
    product.prices.white,
    product.vatRate,
    'WHITE',
    vatDisplayPreference
  );
  const displayListInvoiced = listInvoiced
    ? getDisplayPrice(listInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
    : 0;
  const displayListWhite = listWhite
    ? getDisplayPrice(listWhite, product.vatRate, 'WHITE', vatDisplayPreference)
    : 0;
  const displaySelectedListPrice = selectedListPrice
    ? getDisplayPrice(selectedListPrice, product.vatRate, selectedPriceType, vatDisplayPreference)
    : 0;
  const displayExcessInvoiced = excessInvoiced !== undefined
    ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
    : undefined;
  const displayExcessWhite = excessWhite !== undefined
    ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
    : undefined;
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
  const formatAgreementDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  };

  const rawDescription = (product as { description?: string | null }).description;
  const descriptionText = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  const packagingInfo = unitLabel || 'Koli içi bilgisi bulunamadı';

  const stockInStock = Number(displayStock) > 0;
  const totalWarehouseStock = warehouseEntries.reduce((sum, { stock }) => sum + stock, 0);
  const showInvoicedCard = allowedPriceTypes.includes('INVOICED');
  const showWhiteCard = allowedPriceTypes.includes('WHITE');
  const priceCardsGridClass = showInvoicedCard && showWhiteCard ? 'grid-cols-2' : 'grid-cols-1';
  const lastSales = product.lastSales || [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-4 sm:py-6 lg:px-6">
        {/* Breadcrumb */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--ink-3)]">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="transition-colors hover:text-primary-700"
          >
            Ana Sayfa
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={() => router.push('/products')}
            className="transition-colors hover:text-primary-700"
          >
            Tüm Ürünler
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">{product.name}</span>
        </div>

        <div className="flex flex-col items-start gap-7 lg:flex-row">
          {/* SOL: görsel */}
          <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-1">
            <div
              className={`relative flex h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] sm:h-[420px] ${
                isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsZoomed(!isZoomed)}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className={`h-full w-full object-contain p-3 transition-transform duration-300 ${
                    isZoomed ? 'scale-150' : 'scale-100'
                  }`}
                  style={{ transformOrigin: 'center center' }}
                />
              ) : (
                <ImageIcon className="h-20 w-20 text-[var(--ink-3)]/40" strokeWidth={1.2} />
              )}

              {product.imageUrl && (
                <span className="pointer-events-none absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)]">
                  <Search className="h-3 w-3" />
                  {isZoomed ? 'Küçültmek için tıklayın' : 'Büyütmek için tıklayın'}
                </span>
              )}

              {isDiscounted && (
                <span className="absolute right-3.5 top-3.5 badge-success">İndirimli</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleReportImageIssue}
              disabled={imageIssueReported || isReportingImageIssue}
              className={`inline-flex w-fit items-center gap-1.5 px-1 py-1 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                imageIssueReported
                  ? 'text-emerald-700'
                  : 'text-[var(--ink-3)] hover:text-amber-700'
              }`}
            >
              {imageIssueReported ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ImageOff className="h-4 w-4" />
              )}
              {isReportingImageIssue
                ? 'Bildiriliyor...'
                : imageIssueReported
                ? 'Resim hatası bildirildi'
                : 'Resim hatası bildir'}
            </button>
          </div>

          {/* SAĞ: bilgi + sipariş */}
          <div className="flex w-full flex-none flex-col gap-4 lg:w-[440px]">
            {/* Kategori + ad + kod + stok rozeti */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                {product.category.name}
              </div>
              <h1 className="mb-2 mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-[var(--ink-1)]">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[12.5px] text-[var(--ink-2)]">{product.mikroCode}</span>
                {stockInStock ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Stok {displayStock} {product.unit}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    Tedarikle
                  </span>
                )}
              </div>
            </div>

            {/* Koli içi + Sipariş birimi/KDV */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-[var(--line)] bg-white px-3.5 py-3">
                <div className="text-[11px] text-[var(--ink-3)]">Koli içi</div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--ink-1)]">{packagingInfo}</div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3.5 py-3">
                <div className="text-[11px] text-[var(--ink-3)]">KDV %{vatPercent}</div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--ink-1)]">Sipariş birimi: {product.unit}</div>
              </div>
            </div>

            {/* Depo bazlı stok */}
            {warehouseEntries.length > 0 && (
              <div className="rounded-xl border border-[var(--line)] bg-white p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-[var(--ink-1)]">Depo bazlı stok</span>
                  <span className="text-[12.5px] text-[var(--ink-3)]">
                    Toplam <b className="font-semibold text-[var(--ink-1)]">{totalWarehouseStock} {product.unit}</b>
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {warehouseEntries.map(({ key, stock }) => (
                    <div key={key} className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
                        <MapPin className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                        {warehouseLabels[key] || key}
                      </span>
                      <span className="font-semibold text-[var(--ink-1)]">{stock} {product.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anlaşma kutusu */}
            {product.agreement && (
              <div className="rounded-xl border border-primary-100 bg-primary-50 p-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-primary-700" />
                  <span className="text-[13px] font-semibold text-primary-800">Size özel anlaşma</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[12px]">
                  <div>
                    <div className="text-primary-700/70">Min. miktar</div>
                    <div className="mt-0.5 font-semibold text-[var(--ink-1)]">{agreementMinQuantity} {product.unit}</div>
                  </div>
                  <div>
                    <div className="text-primary-700/70">Müşteri kodu</div>
                    <div className="mt-0.5 font-mono font-semibold text-[var(--ink-1)]">
                      {product.agreement.customerProductCode || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-primary-700/70">Geçerlilik</div>
                    <div className="mt-0.5 font-semibold text-[var(--ink-1)]">
                      {formatAgreementDate(product.agreement.validFrom)}
                      {product.agreement.validTo ? ` – ${formatAgreementDate(product.agreement.validTo)}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fiyat kartları: Faturalı + Beyaz */}
            <div className={`grid ${priceCardsGridClass} gap-2.5`}>
              {showInvoicedCard && (
                <button
                  type="button"
                  onClick={() => showPriceTypeSelector && setPriceType('INVOICED')}
                  disabled={!showPriceTypeSelector}
                  className={`rounded-xl p-3.5 text-left transition-all ${
                    selectedPriceType === 'INVOICED'
                      ? 'border-[1.5px] border-primary-700 bg-white shadow-sm'
                      : 'border border-[var(--line)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]'
                  } ${!showPriceTypeSelector ? 'cursor-default' : ''}`}
                >
                  <div className="mb-1.5 text-[11px] font-semibold text-primary-700">
                    Faturalı{' '}
                    <span className="font-medium text-[var(--ink-3)]">{getVatLabel('INVOICED', vatDisplayPreference)}</span>
                  </div>
                  {shouldShowDiscounts && isDiscounted && listInvoiced && listInvoiced > 0 && (
                    <div className="text-[12px] text-[var(--ink-3)] line-through">{formatCurrency(displayListInvoiced)}</div>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[22px] font-semibold tracking-tight text-[var(--ink-1)]">
                      {formatCurrency(displayInvoicedPrice)}
                    </span>
                    {shouldShowDiscounts && isDiscounted && invoicedDiscount && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        %{invoicedDiscount}
                      </span>
                    )}
                  </div>
                  {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessInvoiced !== undefined && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                      <span>İndirimli: {formatCurrency(displayExcessInvoiced)}</span>
                      {excessInvoicedDiscount && (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">%{excessInvoicedDiscount}</span>
                      )}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10.5px] text-[var(--ink-3)]">/{product.unit}</div>
                </button>
              )}

              {showWhiteCard && (
                <button
                  type="button"
                  onClick={() => showPriceTypeSelector && setPriceType('WHITE')}
                  disabled={!showPriceTypeSelector}
                  className={`rounded-xl p-3.5 text-left transition-all ${
                    selectedPriceType === 'WHITE'
                      ? 'border-[1.5px] border-[var(--ink-1)] bg-white shadow-sm'
                      : 'border border-[var(--line)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]'
                  } ${!showPriceTypeSelector ? 'cursor-default' : ''}`}
                >
                  <div className="mb-1.5 text-[11px] font-semibold text-[var(--ink-2)]">
                    Beyaz{' '}
                    <span className="font-medium text-[var(--ink-3)]">{getVatLabel('WHITE', vatDisplayPreference)}</span>
                  </div>
                  {shouldShowDiscounts && isDiscounted && displayListWhite > 0 && (
                    <div className="text-[12px] text-[var(--ink-3)] line-through">{formatCurrency(displayListWhite)}</div>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[22px] font-semibold tracking-tight text-[var(--ink-1)]">
                      {formatCurrency(displayWhitePrice)}
                    </span>
                    {shouldShowDiscounts && isDiscounted && whiteDiscount && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        %{whiteDiscount}
                      </span>
                    )}
                  </div>
                  {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessWhite !== undefined && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                      <span>İndirimli: {formatCurrency(displayExcessWhite)}</span>
                      {excessWhiteDiscount && (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">%{excessWhiteDiscount}</span>
                      )}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10.5px] text-[var(--ink-3)]">/{product.unit}</div>
                </button>
              )}
            </div>

            {/* Seçili fiyatta indirim vurgusu - eski -> yeni + avantaj */}
            {shouldShowDiscounts && isDiscounted && selectedListPrice !== undefined && selectedDiscount && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <span className="text-[var(--ink-3)] line-through">{formatCurrency(displaySelectedListPrice)}</span>
                  <span className="text-emerald-400">→</span>
                  <span className="text-base font-semibold text-emerald-800">{formatCurrency(displaySelectedPrice)}</span>
                </span>
                <span className="badge-success">%{selectedDiscount} avantaj</span>
              </div>
            )}

            {/* Stok yetersiz - tedarik uyarısı */}
            {!stockInStock && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <span className="text-[12px] leading-relaxed text-amber-800">
                  Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez. Stok üstü
                  miktarlar tedarik/backorder onayına tabidir.
                </span>
              </div>
            )}

            {/* Miktar stepper + Toplam + Sepete Ekle */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center overflow-hidden rounded-xl border border-[var(--line-strong)]">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="flex h-[46px] w-[38px] items-center justify-center bg-white text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
                  aria-label="Azalt"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.4} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    if (value === '' || parseInt(value) === 0) {
                      return;
                    }
                    const numericValue = parseInt(value);
                    const nextValue = Math.max(1, numericValue);
                    setQuantity(nextValue);
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '' || parseInt(e.target.value) === 0) {
                      setQuantity(1);
                    }
                  }}
                  className="h-[46px] w-16 border-x border-[var(--line)] text-center text-[15px] font-semibold text-[var(--ink-1)] focus:outline-none"
                  aria-label="Miktar"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="flex h-[46px] w-[38px] items-center justify-center bg-white text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
                  aria-label="Artır"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>

              <div className="min-w-[120px] flex-1">
                <div className="text-[11px] text-[var(--ink-3)]">Toplam ({product.unit})</div>
                <div className="text-xl font-semibold tracking-tight text-[var(--ink-1)]">{formatCurrency(displayTotalPrice)}</div>
                <div className="mt-0.5 text-[11px] font-medium text-primary-600">
                  {quantity} {product.unit} × {formatCurrency(displaySelectedPrice)} · {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                </div>
              </div>

              <Button
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700 sm:w-auto"
                onClick={handleAddToCart}
                isLoading={isAdding}
              >
                <ShoppingCart className="h-[17px] w-[17px]" />
                {isAdding ? 'Ekleniyor...' : 'Sepete Ekle'}
              </Button>
            </div>

            {/* Ürün açıklaması */}
            {descriptionText && (
              <div className="rounded-xl border border-[var(--line)] bg-white p-3.5">
                <div className="mb-1 text-[13px] font-semibold text-[var(--ink-1)]">Ürün açıklaması</div>
                <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">{descriptionText}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tamamlayıcı Ürünler */}
        {isLoadingRecommendations ? (
          <div className="mt-9 text-sm text-[var(--ink-3)]">Öneriler yükleniyor...</div>
        ) : recommendations.length > 0 ? (
          <div className="mt-9">
            <h2 className="mb-3.5 text-[17px] font-semibold text-[var(--ink-1)]">Tamamlayıcı Ürünler</h2>
            <ProductRecommendations
              products={recommendations}
              title=""
              icon="+"
              onProductClick={(item) => router.push(`/products/${item.id}`)}
              onAddToCart={handleRecommendationAdd}
              allowedPriceTypes={allowedPriceTypes}
              vatDisplayPreference={vatDisplayPreference}
            />
          </div>
        ) : null}

        {/* Son Satışlar */}
        {lastSales.length > 0 && (
          <div className="mb-2 mt-8">
            <h2 className="mb-3.5 text-[17px] font-semibold text-[var(--ink-1)]">Son Satışlar</h2>
            <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
              <div className="min-w-[560px]">
              {/* Başlık satırı */}
              <div className="grid grid-cols-[1fr_1.3fr_1.1fr_0.8fr_1fr_1fr] gap-2 border-b border-[var(--line)] bg-[var(--surface-1)] px-4 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <span>Tarih</span>
                <span>Belge No</span>
                <span>Sipariş No</span>
                <span className="text-right">Miktar</span>
                <span className="text-right">Birim Fiyat</span>
                <span className="text-right">Tutar</span>
              </div>
              {lastSales.map((sale, index) => {
                const lineTotal = sale.lineTotal ?? sale.unitPrice * sale.quantity;
                return (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_1.3fr_1.1fr_0.8fr_1fr_1fr] items-center gap-2 border-t border-[var(--line)] px-4 py-3 text-[12.5px] text-[var(--ink-1)] first:border-t-0"
                  >
                    <span>{formatDateShort(sale.saleDate)}</span>
                    <span className="truncate font-mono text-[11.5px] text-[var(--ink-2)]">{sale.documentNo || '-'}</span>
                    <span className="truncate font-mono text-[11.5px] text-[var(--ink-2)]">{sale.orderNumber || '-'}</span>
                    <span className="text-right">{sale.quantity} {product.unit}</span>
                    <span className="text-right">{formatCurrency(sale.unitPrice)}</span>
                    <span className="text-right font-semibold">{formatCurrency(lineTotal)}</span>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
