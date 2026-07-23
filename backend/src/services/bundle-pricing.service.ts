/**
 * Bundle (paket) fiyatlama servisi.
 *
 * Paket fiyati = her bilesenin O MUSTERININ gordugu birim fiyatinin (liste/kural/son-fiyat/
 * anlasma — hangisi gecerliyse) adet ile carpiminin toplami; istenirse pakete ozel % iskonto.
 * Bilesen fiyatlamasi cart-pricing.service'teki resolveCartUnitPrices ile yapilir (fiyat
 * onceligini yeniden yazmayiz). Faturali (KDV haric) ve beyaz (KDV/2 dahil) DUZLEMLERI ayridir.
 *
 * KDV: faturali paket brutu icin harmanli oran = SumKDV / SumNet (mevcut brut = net×(1+vat)
 * formulu dogru calissin). Beyaz zaten KDV/2 icerir, ustune KDV eklenmez.
 *
 * Siparis: paket Mikro'ya YAZILMAZ; bilesenlere patlatilir. Iskonto her bilesenin birim
 * fiyatina gomulur (Mikro satir iskontosu kullanilmiyor). Musteri sepette/sipariste TEK
 * satir gorur; snapshot (bundleComponents) siparis aninda kilitlenir.
 */

import { prisma } from '../utils/prisma';
import { loadCartCustomerContext, resolveCartUnitPrices, CartPriceType } from './cart-pricing.service';

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 1e4) / 1e4;

type Ctx = Awaited<ReturnType<typeof loadCartCustomerContext>>;
type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

// customerProducts.ts'teki ayni mantik (export edilmedigi icin lokal kopya).
const sumStocks = (warehouseStocks: Record<string, number>, includedWarehouses: string[]): number => {
  if (!warehouseStocks) return 0;
  if (!includedWarehouses || includedWarehouses.length === 0) {
    return Object.values(warehouseStocks).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return includedWarehouses.reduce((sum, wh) => sum + (Number(warehouseStocks[wh]) || 0), 0);
};
const applyPendingOrders = (
  warehouseStocks: Record<string, number>,
  pendingByWarehouse: Record<string, number>
): Record<string, number> => {
  const result: Record<string, number> = {};
  Object.entries(warehouseStocks || {}).forEach(([wh, qty]) => {
    const pending = Number(pendingByWarehouse?.[wh]) || 0;
    result[wh] = Math.max(0, (Number(qty) || 0) - pending);
  });
  return result;
};

const COMPONENT_SELECT = {
  id: true,
  name: true,
  mikroCode: true,
  brandCode: true,
  categoryId: true,
  currentCost: true,
  lastEntryPrice: true,
  excessStock: true,
  excludeFromDiscount: true,
  prices: true,
  vatRate: true,
  unit: true,
  active: true,
  hiddenFromCustomers: true,
  warehouseStocks: true,
  pendingCustomerOrdersByWarehouse: true,
} as const;

export interface BundleComponentSnapshot {
  componentProductId: string; // bilesenin gercek Product id'si (OrderItem.productId -> karlilik)
  mikroCode: string;
  name: string;
  unit: string | null;
  quantity: number;   // paket BASINA adet
  unitPrice: number;  // iskonto GOMULU birim fiyat (verilen priceType duzleminde)
  vatRate: number;    // faturali icin; beyazda Mikro'ya 0 yazilir
  priceListNo: number; // Mikro fiziksel standart liste numarasi
}

export interface BundleContentLine {
  mikroCode: string;
  name: string;
  quantity: number;
  unit: string | null;
}

interface ComponentPriced {
  componentProductId: string;
  mikroCode: string;
  name: string;
  unit: string | null;
  quantity: number;
  vatRate: number;
  useDiscountedPrice: boolean;
  unitInvoiced: number; // KDV haric net, iskonto YOK (baz)
  unitWhite: number;    // KDV/2 dahil, iskonto YOK (baz)
  invoicedPriceListNo: number;
  whitePriceListNo: number;
  availableForBundles: number;
  missing: boolean;     // bilesen pasif/gizli/silinmis -> paket saglikli degil
}

type BundleRow = {
  id: string;
  name: string;
  mikroCode: string;
  unit: string;
  bundleDiscountPercent: number | null;
  items: Array<{ componentProductId: string; quantity: number; useDiscountedPrice: boolean; sortOrder: number }>;
};

const clampDiscount = (pct: number | null | undefined): number => {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

/** Bir paketi + bilesenlerini + (istenen) bilesen urunleri yukler. */
async function loadBundleAndComponents(bundleId: string): Promise<{ bundle: BundleRow; components: Map<string, any> } | null> {
  const bundle = await prisma.product.findUnique({
    where: { id: bundleId },
    select: {
      id: true, name: true, mikroCode: true, unit: true, isBundle: true,
      bundleDiscountPercent: true,
      bundleItems: {
        orderBy: { sortOrder: 'asc' },
        select: { componentProductId: true, quantity: true, useDiscountedPrice: true, sortOrder: true },
      },
    },
  });
  if (!bundle || !bundle.isBundle) return null;

  const componentIds = bundle.bundleItems.map((i) => i.componentProductId);
  const componentRows = componentIds.length
    ? await prisma.product.findMany({ where: { id: { in: componentIds } }, select: COMPONENT_SELECT })
    : [];
  const components = new Map(componentRows.map((c) => [c.id, c]));
  return {
    bundle: {
      id: bundle.id, name: bundle.name, mikroCode: bundle.mikroCode, unit: bundle.unit,
      bundleDiscountPercent: bundle.bundleDiscountPercent,
      items: bundle.bundleItems,
    },
    components,
  };
}

/** Bilesenleri musteri-bazli fiyatla (istenen duzlemler). */
async function priceComponents(
  ctx: Ctx,
  includedWarehouses: string[],
  bundle: BundleRow,
  components: Map<string, any>,
  planes: { invoiced: boolean; white: boolean }
): Promise<ComponentPriced[]> {
  const out: ComponentPriced[] = [];
  for (const item of bundle.items) {
    const product = components.get(item.componentProductId);
    const qty = Number(item.quantity) || 0;
    if (!product || !product.active || product.hiddenFromCustomers) {
      out.push({
        componentProductId: item.componentProductId,
        mikroCode: product?.mikroCode || '?',
        name: product?.name || 'Bilinmeyen urun',
        unit: product?.unit || null,
        quantity: qty,
        vatRate: Number(product?.vatRate) || 0,
        useDiscountedPrice: item.useDiscountedPrice,
        unitInvoiced: 0,
        unitWhite: 0,
        invoicedPriceListNo: 6,
        whitePriceListNo: 1,
        availableForBundles: 0,
        missing: true,
      });
      continue;
    }

    let unitInvoiced = 0;
    let unitWhite = 0;
    let invoicedPriceListNo = 6;
    let whitePriceListNo = 1;
    if (planes.invoiced) {
      const inv = await resolveCartUnitPrices({ context: ctx, product, priceType: 'INVOICED', totalQuantity: qty });
      unitInvoiced = (item.useDiscountedPrice && inv.hasExcessDiscount) ? inv.excessUnitPrice : inv.listUnitPrice;
      invoicedPriceListNo = inv.priceListNo;
    }
    if (planes.white) {
      const wht = await resolveCartUnitPrices({ context: ctx, product, priceType: 'WHITE', totalQuantity: qty });
      unitWhite = (item.useDiscountedPrice && wht.hasExcessDiscount) ? wht.excessUnitPrice : wht.listUnitPrice;
      whitePriceListNo = wht.priceListNo;
    }

    const availableStock = sumStocks(
      applyPendingOrders(
        (product.warehouseStocks || {}) as Record<string, number>,
        (product.pendingCustomerOrdersByWarehouse || {}) as Record<string, number>
      ),
      includedWarehouses
    );
    const availableForBundles = qty > 0 ? Math.floor(availableStock / qty) : 0;

    out.push({
      componentProductId: item.componentProductId,
      mikroCode: product.mikroCode,
      name: product.name,
      unit: product.unit || null,
      quantity: qty,
      vatRate: Number(product.vatRate) || 0,
      useDiscountedPrice: item.useDiscountedPrice,
      unitInvoiced,
      unitWhite,
      invoicedPriceListNo,
      whitePriceListNo,
      availableForBundles,
      missing: false,
    });
  }
  return out;
}

/** Bir duzlemin (invoiced/white) paket toplamlari. */
function planeTotals(components: ComponentPriced[], plane: 'invoiced' | 'white', discountPct: number) {
  const d = discountPct / 100;
  let net = 0;   // iskonto ONCESI toplam (bu duzlem)
  let kdv = 0;   // sadece invoiced icin anlamli
  for (const c of components) {
    const base = plane === 'invoiced' ? c.unitInvoiced : c.unitWhite;
    net += base * c.quantity;
    if (plane === 'invoiced') kdv += base * c.quantity * c.vatRate;
  }
  const total = round2(net * (1 - d));
  const listTotal = round2(net);
  const vatRate = plane === 'invoiced' && net > 0 ? kdv / net : 0;
  return { total, listTotal, vatRate };
}

export interface BundlePriceComputed {
  discountPercent: number;
  availableStock: number;
  hasMissing: boolean;
  prices: { invoiced: number; white: number };
  listPrices: { invoiced: number; white: number };
  vatRate: number; // faturali brut icin harmanli oran
  contents: BundleContentLine[];
  components: ComponentPriced[];
}

function planesForVisibility(v: PriceVisibilityValue | null | undefined): { invoiced: boolean; white: boolean } {
  if (v === 'WHITE_ONLY') return { invoiced: false, white: true };
  if (v === 'INVOICED_ONLY') return { invoiced: true, white: false };
  return { invoiced: true, white: true };
}

/** Cekirdek: bir paketi tam olarak hesapla (istenen duzlemler). */
async function computeBundle(
  ctx: Ctx,
  includedWarehouses: string[],
  bundleId: string,
  planes: { invoiced: boolean; white: boolean }
): Promise<BundlePriceComputed | null> {
  const loaded = await loadBundleAndComponents(bundleId);
  if (!loaded) return null;
  const { bundle, components } = loaded;
  const priced = await priceComponents(ctx, includedWarehouses, bundle, components, planes);
  const discountPercent = clampDiscount(bundle.bundleDiscountPercent);

  const inv = planeTotals(priced, 'invoiced', discountPercent);
  const wht = planeTotals(priced, 'white', discountPercent);
  const hasMissing = priced.some((c) => c.missing);
  const availableStock = priced.length
    ? Math.min(...priced.map((c) => (c.missing ? 0 : c.availableForBundles)))
    : 0;

  return {
    discountPercent,
    availableStock: Number.isFinite(availableStock) ? availableStock : 0,
    hasMissing,
    prices: { invoiced: inv.total, white: wht.total },
    listPrices: { invoiced: inv.listTotal, white: wht.listTotal },
    vatRate: inv.vatRate,
    contents: priced.map((c) => ({ mikroCode: c.mikroCode, name: c.name, quantity: c.quantity, unit: c.unit })),
    components: priced,
  };
}

async function getIncludedWarehouses(): Promise<string[]> {
  const settings = await prisma.settings.findFirst({ select: { includedWarehouses: true } });
  return settings?.includedWarehouses || [];
}

/**
 * LISTE payload'larini paket olanlar icin yerinde duzeltir (fiyat/stok/icerik).
 * payloads: buildCustomerProductPayloads / controller'in urettigi dizi.
 */
export async function decorateBundlePayloads(params: {
  payloads: any[];
  bundleIds: Set<string>;
  userId: string;
  effectiveVisibility: PriceVisibilityValue | null | undefined;
}): Promise<any[]> {
  const { payloads, bundleIds, userId, effectiveVisibility } = params;
  if (!bundleIds || bundleIds.size === 0) return payloads;

  const ctx = await loadCartCustomerContext(userId);
  const includedWarehouses = await getIncludedWarehouses();
  const planes = planesForVisibility(effectiveVisibility);

  for (const p of payloads) {
    if (!bundleIds.has(p.id)) continue;
    const computed = await computeBundle(ctx, includedWarehouses, p.id, planes);
    if (!computed) continue;
    p.isBundle = true;
    p.prices = computed.prices;
    p.excessPrices = computed.prices;
    p.listPrices = computed.discountPercent > 0 ? computed.listPrices : undefined;
    p.vatRate = computed.vatRate;
    p.excessStock = 0;
    p.totalExcessStock = 0;
    p.availableStock = computed.availableStock;
    p.maxOrderQuantity = computed.availableStock;
    p.pricingMode = 'LIST';
    p.bundleDiscountPercent = computed.discountPercent || undefined;
    p.bundleItemCount = computed.contents.length;
  }
  return payloads;
}

/** DETAY payload'i (icerik + galeri dahil). Paket degilse null. */
export async function buildBundleDetailPayload(userId: string, bundleId: string): Promise<any | null> {
  const ctx = await loadCartCustomerContext(userId);
  const includedWarehouses = await getIncludedWarehouses();
  const planes = planesForVisibility(ctx.effectiveVisibility as PriceVisibilityValue);
  const computed = await computeBundle(ctx, includedWarehouses, bundleId, planes);
  if (!computed) return null;

  const bundle = await prisma.product.findUnique({
    where: { id: bundleId },
    select: {
      id: true, name: true, mikroCode: true, unit: true, imageUrl: true,
      active: true, hiddenFromCustomers: true,
      category: { select: { id: true, name: true } },
    },
  });
  if (!bundle || !bundle.active || bundle.hiddenFromCustomers) return null;

  const galleryRows = await prisma.productImage.findMany({
    where: { productId: bundleId },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { url: true },
  });
  const images = galleryRows.length ? galleryRows.map((g) => g.url) : (bundle.imageUrl ? [bundle.imageUrl] : []);

  return {
    id: bundle.id,
    name: bundle.name,
    mikroCode: bundle.mikroCode,
    unit: bundle.unit || 'SET',
    unit2: null,
    unit2Factor: null,
    vatRate: computed.vatRate,
    excessStock: 0,
    availableStock: computed.availableStock,
    maxOrderQuantity: computed.availableStock,
    warehouseStocks: {},
    warehouseExcessStocks: {},
    imageUrl: bundle.imageUrl,
    images,
    category: bundle.category,
    prices: computed.prices,
    excessPrices: computed.prices,
    listPrices: computed.discountPercent > 0 ? computed.listPrices : undefined,
    pricingMode: 'LIST',
    isBundle: true,
    bundleDiscountPercent: computed.discountPercent || undefined,
    bundleContents: computed.contents,
  };
}

/** Sepete ekleme icin tek birim fiyat + stok (verilen priceType). */
export async function priceBundleForCart(
  userId: string,
  bundleId: string,
  priceType: CartPriceType
): Promise<{ unitPrice: number; availableStock: number } | null> {
  const ctx = await loadCartCustomerContext(userId);
  const includedWarehouses = await getIncludedWarehouses();
  const planes = { invoiced: priceType === 'INVOICED', white: priceType === 'WHITE' };
  const computed = await computeBundle(ctx, includedWarehouses, bundleId, planes);
  if (!computed) return null;
  const unitPrice = priceType === 'INVOICED' ? computed.prices.invoiced : computed.prices.white;
  return { unitPrice, availableStock: computed.availableStock };
}

/**
 * Siparis icin paket bilesen snapshot'i (iskonto GOMULU birim fiyatlar) + paket birim fiyati.
 * priceType = paketin (OrderItem) duzlemi. Bilesen satirlari bu duzlemde yazilir.
 */
export async function buildOrderBundleComponents(
  ctx: Ctx,
  includedWarehouses: string[],
  bundleId: string,
  priceType: CartPriceType
): Promise<{ unitPrice: number; components: BundleComponentSnapshot[] } | null> {
  const planes = { invoiced: priceType === 'INVOICED', white: priceType === 'WHITE' };
  const computed = await computeBundle(ctx, includedWarehouses, bundleId, planes);
  if (!computed) return null;
  // Bilesenlerden biri pasif/gizli/silinmis ise paketi EKSIK gonderme; tumden reddet
  // (siparis yolu br=null gorunce satiri atlar + musteriye bildirir). Yarim paket YAZILMAZ.
  if (computed.hasMissing) return null;

  const d = computed.discountPercent / 100;
  const components: BundleComponentSnapshot[] = computed.components
    .filter((c) => c.quantity > 0)
    .map((c) => {
      const base = priceType === 'INVOICED' ? c.unitInvoiced : c.unitWhite;
      return {
        componentProductId: c.componentProductId,
        mikroCode: c.mikroCode,
        name: c.name,
        unit: c.unit,
        quantity: c.quantity,
        unitPrice: round4(base * (1 - d)), // iskonto gomulu birim fiyat
        vatRate: c.vatRate,
        priceListNo:
          priceType === 'INVOICED'
            ? c.invoicedPriceListNo
            : c.whitePriceListNo,
      };
    });
  if (components.length === 0) return null;

  // Paket birim fiyati = bilesen (round4) satir toplamlarinin toplami. round4 tutulur ki
  // Mikro'nun her satirda hesapladigi tutar (miktar×fiyat) toplamiyla BIREBIR essin (kurus
  // kaymasi olmasin). Siparis totalPrice'i = quantity × unitPrice (ek round2 YOK).
  const unitPrice = round4(components.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0));
  return { unitPrice, components };
}

export default {
  decorateBundlePayloads,
  buildBundleDetailPayload,
  priceBundleForCart,
  buildOrderBundleComponents,
};
