'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Minus, Plus, ShoppingCart, Check } from 'lucide-react';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';

type PriceType = 'INVOICED' | 'WHITE';

export interface ProductCardAddArgs {
  productId: string;
  quantity: number;
  priceType: PriceType;
  priceMode: 'LIST' | 'EXCESS';
}

interface ProductCardProps {
  product: Product;
  allowedPriceTypes: PriceType[];
  defaultPriceType: PriceType;
  vatDisplayPreference: 'WITH_VAT' | 'WITHOUT_VAT';
  /**
   * 'default'    : Tum Urunler (prices=temel, excessPrices=indirim)
   * 'discounted' : Indirimli/One cikan (listPrices=eski, prices/excessPrices=indirimli, hep EXCESS)
   * 'agreement'  : Anlasmali (default + gecerlilik tarihi vurgusu)
   */
  variant?: 'default' | 'discounted' | 'agreement';
  onAdd: (args: ProductCardAddArgs) => Promise<void>;
}

const getDiscountPercent = (listPrice?: number, salePrice?: number) => {
  if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
  const discount = Math.round(((listPrice - salePrice) / listPrice) * 100);
  return discount > 0 ? discount : null;
};

const resolveValidExcessPrice = (basePrice?: number, excessPrice?: number) => {
  if (typeof basePrice !== 'number' || typeof excessPrice !== 'number') return undefined;
  if (!Number.isFinite(basePrice) || !Number.isFinite(excessPrice)) return undefined;
  if (excessPrice >= basePrice) return undefined;
  return excessPrice;
};

const formatAgreementDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function ProductCard({
  product,
  allowedPriceTypes,
  defaultPriceType,
  vatDisplayPreference,
  variant = 'default',
  onAdd,
}: ProductCardProps) {
  const [qty, setQty] = useState(1);
  const [qtyInput, setQtyInput] = useState('1');
  const [priceType, setPriceType] = useState<PriceType>(defaultPriceType);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!allowedPriceTypes.includes(priceType)) {
      setPriceType(defaultPriceType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  const showPriceTypeSelector = allowedPriceTypes.length > 1;
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
  const displayStock = Number(getDisplayStock(product));
  const isSupply = displayStock <= 0;
  const hasAgreement = Boolean(product.agreement);
  const isDiscountedVariant = variant === 'discounted';

  // ── Varyant-farkindalı fiyat hesabi (mevcut sayfa mantiklari birebir) ──
  let baseInvoiced: number | undefined;
  let baseWhite: number | undefined;
  let discInvoiced: number | undefined;
  let discWhite: number | undefined;

  if (isDiscountedVariant) {
    // Indirimli: listPrices = eski, prices/excessPrices = indirimli
    baseInvoiced = product.listPrices?.invoiced ?? product.prices.invoiced;
    baseWhite = product.listPrices?.white ?? product.prices.white;
    discInvoiced = resolveValidExcessPrice(baseInvoiced, product.excessPrices?.invoiced ?? product.prices.invoiced);
    discWhite = resolveValidExcessPrice(baseWhite, product.excessPrices?.white ?? product.prices.white);
  } else {
    // Tum Urunler / Anlasmali: prices = temel, excessPrices = indirim (anlasmada indirim yok)
    baseInvoiced = product.prices.invoiced;
    baseWhite = product.prices.white;
    discInvoiced =
      !hasAgreement && product.excessStock > 0
        ? resolveValidExcessPrice(baseInvoiced, product.excessPrices?.invoiced)
        : undefined;
    discWhite =
      !hasAgreement && product.excessStock > 0
        ? resolveValidExcessPrice(baseWhite, product.excessPrices?.white)
        : undefined;
  }

  const selectedBase = priceType === 'INVOICED' ? baseInvoiced : baseWhite;
  const selectedDisc = priceType === 'INVOICED' ? discInvoiced : discWhite;
  const hasDiscount = selectedDisc !== undefined;
  const discountPct = hasDiscount ? getDiscountPercent(selectedBase, selectedDisc) : null;

  const displayShown = getDisplayPrice(
    hasDiscount ? (selectedDisc as number) : (selectedBase as number),
    product.vatRate,
    priceType,
    vatDisplayPreference
  );
  const displayOld = hasDiscount
    ? getDisplayPrice(selectedBase as number, product.vatRate, priceType, vatDisplayPreference)
    : undefined;
  const vatLabel = getVatLabel(priceType, vatDisplayPreference);
  const agreementValidTo = formatAgreementDate(product.agreement?.validTo);

  const handleAdd = async () => {
    const priceMode: 'LIST' | 'EXCESS' = isDiscountedVariant ? 'EXCESS' : hasDiscount ? 'EXCESS' : 'LIST';
    setAdding(true);
    try {
      const maxQty =
        priceMode === 'EXCESS'
          ? Math.max(getMaxOrderQuantity(product, 'LIST'), Number(product.excessStock) || 0)
          : getMaxOrderQuantity(product, 'LIST');
      if (qty > maxQty) {
        const confirmed = await confirmBackorder({ requestedQty: qty, availableQty: maxQty, unit: product.unit });
        if (!confirmed) {
          setAdding(false);
          return;
        }
      }
      await onAdd({ productId: product.id, quantity: qty, priceType, priceMode });
      setQty(1);
      setQtyInput('1');
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
      toast.success('Ürün sepete eklendi', { duration: 2000 });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Sepete eklenemedi';
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const commitQty = (raw: string) => {
    const value = raw.replace(/[^0-9]/g, '');
    const next = value === '' ? 1 : Math.max(1, parseInt(value, 10));
    setQty(next);
    setQtyInput(String(next));
  };

  const segClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-white text-primary-600 shadow-sm ring-1 ring-[var(--line-strong)]'
        : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
    }`;

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white transition-all duration-200 hover:border-[var(--line-strong)] hover:shadow-[0_8px_22px_rgba(20,34,59,0.10)]">
      {/* ── Gorsel ──────────────────────────────────────────────── */}
      <Link
        href={`/products/${product.id}`}
        prefetch
        className="relative block aspect-square overflow-hidden border-b border-[var(--line)] bg-[var(--surface-0)]"
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-11 w-11 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="m7.5 4.27 9 5.15" />
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
        )}

        {!isSupply ? (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Stok {getDisplayStock(product)} {product.unit}
          </span>
        ) : (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
            Tedarikle
          </span>
        )}

        {hasDiscount && discountPct && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            %{discountPct} avantaj
          </span>
        )}
      </Link>

      {/* ── Bilgi ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
          {product.category.name}
        </div>

        <Link
          href={`/products/${product.id}`}
          prefetch
          className="line-clamp-2 min-h-[36px] text-[13.5px] font-medium leading-snug text-[var(--ink-1)] transition-colors hover:text-primary-700"
          title={product.name}
        >
          {product.name}
        </Link>

        <div className="font-mono text-[11px] text-gray-500">{product.mikroCode}</div>

        <div className="flex flex-wrap gap-1.5">
          {unitLabel && (
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-0)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
              {unitLabel}
            </span>
          )}
          <span className="rounded-md border border-[var(--line)] bg-[var(--surface-0)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
            KDV %{vatPercent}
          </span>
        </div>

        {hasAgreement && (
          <div className="rounded-lg border border-primary-100 bg-primary-50 px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-primary-700">
                Anlaşma: min {product.agreement?.minQuantity ?? 1} {product.unit}
              </span>
              {product.agreement?.customerProductCode && (
                <span className="ml-auto font-mono text-[10.5px] text-[var(--ink-3)]">
                  {product.agreement.customerProductCode}
                </span>
              )}
            </div>
            {variant === 'agreement' && agreementValidTo && (
              <div className="mt-0.5 text-[10.5px] text-[var(--ink-2)]">Geçerli: {agreementValidTo}</div>
            )}
          </div>
        )}

        {isSupply && (
          <div className="flex gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5">
            <span className="text-[10.5px] leading-snug text-amber-700">
              Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
            </span>
          </div>
        )}

        {/* ── Fiyat ─────────────────────────────────────────────── */}
        <div className="mt-auto">
          {showPriceTypeSelector && (
            <div className="mb-2 flex rounded-lg bg-[var(--surface-0)] p-0.5">
              {allowedPriceTypes.includes('INVOICED') && (
                <button type="button" onClick={() => setPriceType('INVOICED')} className={segClass(priceType === 'INVOICED')}>
                  Faturalı
                </button>
              )}
              {allowedPriceTypes.includes('WHITE') && (
                <button type="button" onClick={() => setPriceType('WHITE')} className={segClass(priceType === 'WHITE')}>
                  Beyaz
                </button>
              )}
            </div>
          )}

          {hasDiscount && displayOld !== undefined ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13px] text-gray-400 line-through">{formatCurrency(displayOld)}</span>
              <span className="text-xl font-semibold text-emerald-700">{formatCurrency(displayShown)}</span>
              <span className="text-[10.5px] text-[var(--ink-3)]">{vatLabel}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold text-[var(--ink-1)]">{formatCurrency(displayShown)}</span>
              <span className="text-[10.5px] text-[var(--ink-3)]">{vatLabel}</span>
            </div>
          )}

          <div className="mt-1 min-h-[15px]">
            {hasDiscount && product.excessStock > 0 && (
              <span className="text-[11px] text-amber-700">
                İlk {product.excessStock} {product.unit} indirimli fiyattan
              </span>
            )}
          </div>
        </div>

        {/* ── Miktar + Sepete Ekle ──────────────────────────────── */}
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
            <button
              type="button"
              onClick={() => commitQty(String(qty - 1))}
              className="flex h-9 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
              aria-label="Azalt"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={qtyInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '');
                setQtyInput(v);
                if (v !== '' && parseInt(v, 10) > 0) setQty(parseInt(v, 10));
              }}
              onBlur={(e) => commitQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="h-9 w-11 border-x border-[var(--line)] text-center text-sm font-semibold text-[var(--ink-1)] focus:outline-none"
              aria-label={`${product.name} miktarı`}
            />
            <button
              type="button"
              onClick={() => commitQty(String(qty + 1))}
              className="flex h-9 w-8 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
              aria-label="Artır"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </div>
          <span className="w-9 flex-shrink-0 text-[11px] font-medium text-[var(--ink-3)]">{product.unit}</span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {adding ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : added ? (
              <Check className="h-4 w-4" strokeWidth={2.4} />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {added ? 'Eklendi' : 'Sepete Ekle'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
