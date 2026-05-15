'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Barcode,
  Briefcase,
  Camera,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserRound,
  Warehouse,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type TabKey = 'customer' | 'products' | 'draft' | 'history';

type DraftItem = {
  productId?: string | null;
  productCode: string;
  productName: string;
  imageUrl?: string | null;
  unit: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  quantity: number;
  unitPrice: number;
  priceSource: 'PRICE_LIST' | 'MANUAL';
  priceListNo?: number | null;
  priceType: 'INVOICED' | 'WHITE';
};

const DRAFT_KEY = 'field-sales:draft';
const RECENT_CUSTOMERS_KEY = 'field-sales:recent-customers';
const RECENT_PRODUCTS_KEY = 'field-sales:recent-products';
const SAFE_MODE_KEY = 'field-sales:safe-mode';

const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'customer', label: 'Cari', icon: UserRound },
  { key: 'products', label: 'Urun', icon: Search },
  { key: 'draft', label: 'Taslak', icon: ShoppingCart },
  { key: 'history', label: 'Gecmis', icon: History },
];

const money = (value: any) => formatCurrency(Number(value || 0));
const n = (value: any, digits = 2) => Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });
const safeDate = (value?: string | null) => (value ? formatDateShort(String(value)) : '-');

const loadJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const upsertRecent = (key: string, item: any, idGetter: (row: any) => string) => {
  const id = idGetter(item);
  if (!id) return;
  const current = loadJson<any[]>(key, []);
  const next = [item, ...current.filter((row) => idGetter(row) !== id)].slice(0, 12);
  saveJson(key, next);
};

const getProductPrice = (product: any) => {
  const customerPrice = product?.customerPrice;
  if (customerPrice?.invoiced > 0) {
    return {
      value: Number(customerPrice.invoiced),
      source: customerPrice.source === 'AGREEMENT' ? 'Anlasma' : `Liste ${customerPrice.priceListNo || '-'}`,
      priceListNo: customerPrice.source === 'AGREEMENT' ? null : customerPrice.priceListNo,
      priceSource: customerPrice.source === 'AGREEMENT' ? 'MANUAL' : 'PRICE_LIST',
    };
  }
  const fallback = Number(product?.priceLists?.['6'] || product?.priceLists?.[6] || 0);
  return { value: fallback, source: 'Liste 6', priceListNo: 6, priceSource: 'PRICE_LIST' };
};

const buildWhatsappText = (customer: any, product: any, safeMode: boolean) => {
  const price = getProductPrice(product);
  const stockLine = (product?.warehouses || [])
    .filter((row: any) => Number(row.sellable || row.stock || 0) !== 0)
    .map((row: any) => `${row.label}: ${n(row.sellable || row.stock)}`)
    .join(' | ');
  const lines = [
    customer ? `${customer.displayTitle || customer.name || customer.mikroCariCode}` : null,
    `${product.name} (${product.mikroCode})`,
    `Fiyat: ${money(price.value)} ${price.source}`,
    stockLine ? `Stok: ${stockLine}` : 'Stok: sorunuz',
    product.unit ? `Birim: ${product.unit}` : null,
    !safeMode && product.cost?.currentCostVatIncluded ? `Ic not maliyet: ${money(product.cost.currentCostVatIncluded)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

export default function FieldSalesPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('customer');
  const [safeMode, setSafeMode] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQuantities, setProductQuantities] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [quoteNote, setQuoteNote] = useState('Saha satis taslagi');
  const [validityDate, setValidityDate] = useState('');
  const [orderWarehouse, setOrderWarehouse] = useState('1');
  const [orderSeries, setOrderSeries] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [visitNote, setVisitNote] = useState('');
  const [visitDemand, setVisitDemand] = useState('');
  const [competitorInfo, setCompetitorInfo] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [barcodeActive, setBarcodeActive] = useState(false);

  useEffect(() => {
    setDraft(loadJson<DraftItem[]>(DRAFT_KEY, []));
    setRecentCustomers(loadJson<any[]>(RECENT_CUSTOMERS_KEY, []));
    setRecentProducts(loadJson<any[]>(RECENT_PRODUCTS_KEY, []));
    const savedSafeMode = loadJson<boolean | null>(SAFE_MODE_KEY, null);
    setSafeMode(savedSafeMode === null ? true : Boolean(savedSafeMode));
    const date = new Date();
    date.setDate(date.getDate() + 7);
    setValidityDate(date.toISOString().slice(0, 10));
    return () => stopBarcodeScanner();
  }, []);

  useEffect(() => {
    saveJson(DRAFT_KEY, draft);
  }, [draft]);

  useEffect(() => {
    saveJson(SAFE_MODE_KEY, safeMode);
  }, [safeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchCustomers();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (!selectedCustomer) return;
    void loadCustomerSnapshot(selectedCustomer.id || selectedCustomer.mikroCariCode);
    upsertRecent(RECENT_CUSTOMERS_KEY, selectedCustomer, (row) => String(row.id || row.mikroCariCode || ''));
    setRecentCustomers(loadJson<any[]>(RECENT_CUSTOMERS_KEY, []));
  }, [selectedCustomer?.id, selectedCustomer?.mikroCariCode]);

  useEffect(() => {
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setProducts([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchProducts();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [productSearch, selectedCustomer?.id, selectedCustomer?.mikroCariCode, safeMode]);

  const draftTotal = useMemo(
    () => draft.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [draft]
  );

  const customerIdForApi = selectedCustomer?.id || selectedCustomer?.mikroCariCode || '';

  const searchCustomers = async () => {
    const term = customerSearch.trim();
    if (term.length > 0 && term.length < 2) return;
    setCustomerLoading(true);
    try {
      const result = await adminApi.searchFieldSalesCustomers({ search: term, limit: 25 });
      setCustomers(result.customers || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Cari aramasi yapilamadi.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const loadCustomerSnapshot = async (customerIdOrCode: string) => {
    if (!customerIdOrCode) return;
    setSnapshotLoading(true);
    try {
      const result = await adminApi.getFieldSalesCustomer(customerIdOrCode);
      setSnapshot(result.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Cari bilgileri alinamadi.');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const searchProducts = async () => {
    const term = productSearch.trim();
    if (term.length < 2) return;
    setProductsLoading(true);
    try {
      const result = await adminApi.searchFieldSalesProducts({
        search: term,
        customerId: customerIdForApi || undefined,
        limit: 30,
        safeMode,
      });
      setProducts(result.products || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun aramasi yapilamadi.');
    } finally {
      setProductsLoading(false);
    }
  };

  const openProductDetail = async (product: any) => {
    setSelectedProduct(product);
    upsertRecent(RECENT_PRODUCTS_KEY, product, (row) => String(row.mikroCode || ''));
    setRecentProducts(loadJson<any[]>(RECENT_PRODUCTS_KEY, []));
    try {
      const result = await adminApi.getFieldSalesProduct(product.mikroCode, {
        customerId: customerIdForApi || undefined,
        safeMode,
      });
      setSelectedProduct(result.data.product || product);
    } catch {
      setSelectedProduct(product);
    }
  };

  const addToDraft = (product: any) => {
    const price = getProductPrice(product);
    const quantity = Math.max(0.0001, Number(productQuantities[product.mikroCode] || 1) || 1);
    const item: DraftItem = {
      productId: product.id,
      productCode: product.mikroCode,
      productName: product.name,
      imageUrl: product.imageUrl,
      unit: product.unit || 'ADET',
      unit2: product.unit2 || null,
      unit2Factor: product.unit2Factor || null,
      quantity,
      unitPrice: Number(price.value || 0),
      priceSource: price.priceSource as 'PRICE_LIST' | 'MANUAL',
      priceListNo: price.priceListNo || null,
      priceType: 'INVOICED',
    };

    setDraft((current) => {
      const existing = current.find((row) => row.productCode === item.productCode && row.unitPrice === item.unitPrice);
      if (!existing) return [...current, item];
      return current.map((row) =>
        row === existing ? { ...row, quantity: Number(row.quantity || 0) + quantity } : row
      );
    });
    setProductQuantities((current) => ({ ...current, [product.mikroCode]: '1' }));
    toast.success('Taslak sepete eklendi.');
  };

  const updateDraftItem = (index: number, changes: Partial<DraftItem>) => {
    setDraft((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  };

  const removeDraftItem = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index));
  };

  const clearDraft = () => {
    setDraft([]);
    saveJson(DRAFT_KEY, []);
  };

  const createQuote = async () => {
    if (!selectedCustomer?.id) {
      toast.error('Once cari secin.');
      setActiveTab('customer');
      return;
    }
    if (draft.length === 0) {
      toast.error('Taslakta urun yok.');
      return;
    }
    if (!validityDate) {
      toast.error('Teklif gecerlilik tarihi gerekli.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminApi.createQuote({
        customerId: selectedCustomer.id,
        validityDate,
        note: quoteNote,
        documentNo: quoteNote,
        vatZeroed: false,
        items: draft.map((item) => ({
          productId: item.productId || undefined,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          unit2: item.unit2 || undefined,
          unit2Factor: item.unit2Factor || undefined,
          selectedUnit: item.unit,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          priceSource: item.priceSource,
          priceListNo: item.priceSource === 'PRICE_LIST' ? item.priceListNo : undefined,
          priceType: 'INVOICED',
        })),
      });
      toast.success('Teklif olusturuldu.');
      clearDraft();
      router.push(`/quotes?tab=sent${result.quote?.id ? `&download=${result.quote.id}` : ''}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Teklif olusturulamadi.');
    } finally {
      setSubmitting(false);
    }
  };

  const createOrder = async () => {
    if (!selectedCustomer?.id) {
      toast.error('Once cari secin.');
      return;
    }
    if (draft.length === 0) {
      toast.error('Taslakta urun yok.');
      return;
    }
    if (!orderSeries.trim()) {
      toast.error('Siparis seri no girin.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminApi.createManualOrder({
        customerId: selectedCustomer.id,
        warehouseNo: Number(orderWarehouse),
        description: quoteNote || 'Saha satis siparisi',
        documentDescription: quoteNote || undefined,
        invoicedSeries: orderSeries.trim(),
        items: draft.map((item) => ({
          productId: item.productId || undefined,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          unit2: item.unit2 || undefined,
          unit2Factor: item.unit2Factor || undefined,
          selectedUnit: item.unit,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          priceType: 'INVOICED',
          lineDescription: item.productName,
        })),
      });
      toast.success(`Siparis olusturuldu: ${result.orderNumber}`);
      clearDraft();
      router.push('/orders');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Siparis olusturulamadi.');
    } finally {
      setSubmitting(false);
    }
  };

  const shareProduct = (product: any) => {
    const text = buildWhatsappText(selectedCustomer, product, true);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareDraft = () => {
    if (draft.length === 0) return;
    const lines = [
      selectedCustomer ? `${selectedCustomer.displayTitle || selectedCustomer.mikroCariCode}` : 'Saha satis taslagi',
      ...draft.map((item) => `${item.productName} (${item.productCode}) - ${n(item.quantity)} ${item.unit} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`),
      `Toplam: ${money(draftTotal)}`,
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  const saveVisitNote = async () => {
    if (!selectedCustomer) {
      toast.error('Once cari secin.');
      return;
    }
    if (!visitNote.trim()) {
      toast.error('Not bos olamaz.');
      return;
    }
    setNoteSaving(true);
    try {
      await adminApi.createFieldSalesVisitNote(customerIdForApi, {
        note: visitNote.trim(),
        demand: visitDemand.trim() || null,
        competitorInfo: competitorInfo.trim() || null,
        photoUrl,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      });
      setVisitNote('');
      setVisitDemand('');
      setCompetitorInfo('');
      setPhotoUrl(null);
      setLocation(null);
      toast.success('Ziyaret notu kaydedildi.');
      await loadCustomerSnapshot(customerIdForApi);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Not kaydedilemedi.');
    } finally {
      setNoteSaving(false);
    }
  };

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 800_000) {
      toast.error('Foto cok buyuk. 800 KB altinda bir gorsel secin.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Konum destegi yok.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        toast.success('Konum eklendi.');
      },
      () => toast.error('Konum alinamadi.'),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  const stopBarcodeScanner = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setBarcodeActive(false);
  };

  const startBarcodeScanner = async () => {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Bu tarayicida kamera barkod okuma yok. Kodu arama kutusuna okutabilirsiniz.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setBarcodeActive(true);
      window.setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length > 0) {
              const value = String(codes[0].rawValue || '').trim();
              if (value) {
                setProductSearch(value);
                setActiveTab('products');
                stopBarcodeScanner();
                toast.success(`Okutuldu: ${value}`);
                return;
              }
            }
          } catch {
            // Continue scanning while camera is open.
          }
          requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
      }, 100);
    } catch {
      toast.error('Kamera acilamadi.');
      stopBarcodeScanner();
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f1e8] pb-24 text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-amber-950/10 bg-[#17201b] text-white shadow-2xl">
          <div className="relative p-5 sm:p-7">
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="absolute bottom-0 left-1/2 h-24 w-72 -translate-x-1/2 bg-emerald-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">Mobil saha satis</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Saha Masasi</h1>
                <p className="mt-2 max-w-2xl text-sm text-amber-50/80">
                  Cari, bakiye, stok, fiyat, maliyet, son alim, firsat ve taslak teklif/siparis tek ekranda.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  onClick={() => setSafeMode((value) => !value)}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition',
                    safeMode ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50' : 'border-red-300/40 bg-red-300/15 text-red-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    {safeMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {safeMode ? 'Musteri modu' : 'Ic gorunum'}
                  </span>
                  <span className="mt-1 block text-xs font-medium opacity-75">
                    {safeMode ? 'Maliyet gizli' : 'Maliyet acik'}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm font-bold backdrop-blur"
                >
                  <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Taslak</span>
                  <span className="mt-1 block text-xs font-medium text-amber-50/75">{draft.length} kalem - {money(draftTotal)}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <CustomerStrip
          selectedCustomer={selectedCustomer}
          snapshot={snapshot}
          loading={snapshotLoading}
          onSelectTab={setActiveTab}
        />

        <main className="grid gap-4 lg:grid-cols-[1.05fr_1.55fr]">
          <div className={cn(activeTab === 'customer' ? 'block' : 'hidden lg:block')}>
            <CustomerPanel
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              customerLoading={customerLoading}
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              snapshot={snapshot}
              snapshotLoading={snapshotLoading}
              visitNote={visitNote}
              setVisitNote={setVisitNote}
              visitDemand={visitDemand}
              setVisitDemand={setVisitDemand}
              competitorInfo={competitorInfo}
              setCompetitorInfo={setCompetitorInfo}
              photoUrl={photoUrl}
              pickPhoto={pickPhoto}
              location={location}
              captureLocation={captureLocation}
              saveVisitNote={saveVisitNote}
              noteSaving={noteSaving}
            />
          </div>

          <div className={cn(activeTab === 'products' ? 'block' : activeTab === 'draft' ? 'hidden lg:block' : activeTab === 'history' ? 'hidden lg:block' : 'hidden lg:block')}>
            <ProductPanel
              productSearch={productSearch}
              setProductSearch={setProductSearch}
              products={products}
              productsLoading={productsLoading}
              searchProducts={searchProducts}
              startBarcodeScanner={startBarcodeScanner}
              safeMode={safeMode}
              productQuantities={productQuantities}
              setProductQuantities={setProductQuantities}
              addToDraft={addToDraft}
              openProductDetail={openProductDetail}
              shareProduct={shareProduct}
            />
          </div>

          <div className={cn(activeTab === 'draft' ? 'block lg:col-span-2' : 'hidden')}>
            <DraftPanel
              draft={draft}
              updateDraftItem={updateDraftItem}
              removeDraftItem={removeDraftItem}
              clearDraft={clearDraft}
              draftTotal={draftTotal}
              selectedCustomer={selectedCustomer}
              quoteNote={quoteNote}
              setQuoteNote={setQuoteNote}
              validityDate={validityDate}
              setValidityDate={setValidityDate}
              orderWarehouse={orderWarehouse}
              setOrderWarehouse={setOrderWarehouse}
              orderSeries={orderSeries}
              setOrderSeries={setOrderSeries}
              createQuote={createQuote}
              createOrder={createOrder}
              shareDraft={shareDraft}
              submitting={submitting}
            />
          </div>

          <div className={cn(activeTab === 'history' ? 'block lg:col-span-2' : 'hidden')}>
            <HistoryPanel
              recentCustomers={recentCustomers}
              recentProducts={recentProducts}
              setSelectedCustomer={setSelectedCustomer}
              openProductDetail={openProductDetail}
              notes={snapshot?.notes || []}
              selectedCustomer={selectedCustomer}
            />
          </div>
        </main>
      </div>

      <BottomTabs activeTab={activeTab} setActiveTab={setActiveTab} draftCount={draft.length} />

      {selectedProduct && (
        <ProductDrawer
          product={selectedProduct}
          safeMode={safeMode}
          onClose={() => setSelectedProduct(null)}
          addToDraft={addToDraft}
          shareProduct={shareProduct}
          quantity={productQuantities[selectedProduct.mikroCode] || '1'}
          setQuantity={(value: string) => setProductQuantities((current) => ({ ...current, [selectedProduct.mikroCode]: value }))}
        />
      )}

      {barcodeActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-900">Barkod okut</p>
              <Button variant="secondary" size="sm" onClick={stopBarcodeScanner}>Kapat</Button>
            </div>
            <video ref={videoRef} className="aspect-video w-full rounded-2xl bg-black object-cover" muted playsInline />
            <p className="mt-3 text-xs text-slate-500">Kamera barkodu gordugunde arama otomatik baslar.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerStrip({ selectedCustomer, snapshot, loading, onSelectTab }: any) {
  if (!selectedCustomer) {
    return (
      <section className="rounded-3xl border border-dashed border-amber-900/20 bg-white/75 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-800"><UserRound className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-bold text-slate-900">Once cari secin</p>
            <p className="text-xs text-slate-600">Fiyat, anlasma, son alis ve firsatlar cari secildikten sonra netlesir.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-3xl border border-amber-900/10 bg-white p-4 shadow-sm lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Secili cari</p>
        <p className="mt-1 text-lg font-black text-slate-950">{selectedCustomer.displayTitle || selectedCustomer.name}</p>
        <p className="text-xs text-slate-500">{selectedCustomer.mikroCariCode} - {selectedCustomer.sectorCode || 'Sektor yok'}</p>
      </div>
      <Metric label="Bakiye" value={loading ? '...' : money(snapshot?.summary?.balance || selectedCustomer.balance)} tone="amber" />
      <Metric label="Son satis" value={loading ? '...' : safeDate(snapshot?.summary?.lastSaleDate)} tone="emerald" />
      <button onClick={() => onSelectTab('products')} className="rounded-2xl bg-slate-950 px-4 py-3 text-left text-white">
        <span className="text-xs text-white/70">Hizli aksiyon</span>
        <span className="mt-1 flex items-center gap-2 text-sm font-bold"><Search className="h-4 w-4" /> Urun ara</span>
      </button>
    </section>
  );
}

function Metric({ label, value, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    slate: 'bg-slate-100 text-slate-900',
  };
  return (
    <div className={cn('rounded-2xl px-4 py-3', tones[tone] || tones.slate)}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

function CustomerPanel(props: any) {
  const {
    customerSearch,
    setCustomerSearch,
    customerLoading,
    customers,
    selectedCustomer,
    setSelectedCustomer,
    snapshot,
    snapshotLoading,
    visitNote,
    setVisitNote,
    visitDemand,
    setVisitDemand,
    competitorInfo,
    setCompetitorInfo,
    photoUrl,
    pickPhoto,
    location,
    captureLocation,
    saveVisitNote,
    noteSaving,
  } = props;

  return (
    <section className="flex flex-col gap-4">
      <Panel title="Cari ara" icon={UserRound}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="Cari kodu, unvan, sehir, sektor..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold outline-none focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
          {customerLoading && <LoadingLine label="Cari aranıyor" />}
          {!customerLoading && customers.length === 0 && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Arama icin en az 2 karakter yazin.</p>
          )}
          {customers.map((customer: any) => (
            <button
              key={customer.id}
              onClick={() => setSelectedCustomer(customer)}
              className={cn(
                'w-full rounded-2xl border p-3 text-left transition',
                selectedCustomer?.id === customer.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">{customer.displayTitle || customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.mikroCariCode} - {customer.city || '-'} / {customer.district || '-'}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{customer.sectorCode || 'Sektor yok'}</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Cari ozet" icon={Briefcase}>
        {!selectedCustomer ? (
          <EmptyText text="Cari secildikten sonra bakiye, vade, acik teklif/siparis ve firsatlar gorunur." />
        ) : snapshotLoading ? (
          <LoadingLine label="Cari ozeti yukleniyor" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Vade" value={snapshot?.summary?.vade?.paymentPlanName || selectedCustomer.paymentPlanName || `${selectedCustomer.paymentTerm || 0} gun`} />
              <Metric label="Acik siparis" value={snapshot?.summary?.openOrderCount || 0} />
              <Metric label="Acik teklif" value={snapshot?.summary?.openQuoteCount || 0} />
              <Metric label="Sepet" value={snapshot?.summary?.cartItemCount || 0} />
            </div>
            {selectedCustomer.isLocked && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Cari kilitli gorunuyor.</div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Firsatlar" icon={BadgeCheck}>
        {!snapshot ? (
          <EmptyText text="Cari secin." />
        ) : (
          <OpportunityList opportunities={snapshot.opportunities} />
        )}
      </Panel>

      <Panel title="Ziyaret notu" icon={MapPin}>
        {!selectedCustomer ? (
          <EmptyText text="Not yazmak icin cari secin." />
        ) : (
          <div className="space-y-3">
            <textarea
              value={visitNote}
              onChange={(event) => setVisitNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Gorusme notu, alinacak aksiyon..."
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <input
              value={visitDemand}
              onChange={(event) => setVisitDemand(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Talep / ihtiyac"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <input
              value={competitorInfo}
              onChange={(event) => setCompetitorInfo(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Rakip fiyat / rakip bilgi"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                <Camera className="h-4 w-4" />
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
              </label>
              <button onClick={captureLocation} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                <MapPin className="h-4 w-4" />
                Konum
              </button>
            </div>
            {(photoUrl || location) && (
              <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                {photoUrl && <span className="mr-3 font-bold text-emerald-700">Foto eklendi</span>}
                {location && <span className="font-bold text-emerald-700">Konum eklendi</span>}
              </div>
            )}
            <Button className="h-12 w-full rounded-2xl" isLoading={noteSaving} onClick={saveVisitNote}>
              Notu kaydet
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Gecmis notlar" icon={History}>
        <div className="space-y-2">
          {(snapshot?.notes || []).length === 0 && <EmptyText text="Bu cari icin saha notu yok." />}
          {(snapshot?.notes || []).map((note: any) => (
            <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500">{note.createdByName || note.createdBy?.name || '-'}</p>
                <p className="text-xs text-slate-400">{safeDate(note.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900">{note.note}</p>
              {note.demand && <p className="mt-1 text-xs text-slate-600">Talep: {note.demand}</p>}
              {note.competitorInfo && <p className="mt-1 text-xs text-slate-600">Rakip: {note.competitorInfo}</p>}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function ProductPanel(props: any) {
  const {
    productSearch,
    setProductSearch,
    products,
    productsLoading,
    searchProducts,
    startBarcodeScanner,
    safeMode,
    productQuantities,
    setProductQuantities,
    addToDraft,
    openProductDetail,
    shareProduct,
  } = props;

  return (
    <section className="flex flex-col gap-4">
      <Panel title="Urun ara" icon={Package}>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Stok kodu, barkod, urun adi..."
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>
          <Button className="h-14 rounded-2xl" onClick={searchProducts}>
            Ara
          </Button>
          <Button variant="secondary" className="h-14 rounded-2xl" onClick={startBarcodeScanner}>
            <Barcode className="mr-2 h-5 w-5" /> Okut
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          {safeMode ? 'Musteri modu acik: maliyet/marj gizli.' : 'Ic gorunum acik: maliyet ve marj gorunur.'}
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        {productsLoading && <LoadingCard />}
        {!productsLoading && products.length === 0 && (
          <div className="xl:col-span-2">
            <EmptyText text="Urun aramak icin stok kodu, ad veya barkod okutun." />
          </div>
        )}
        {products.map((product: any) => {
          const price = getProductPrice(product);
          const qty = productQuantities[product.mikroCode] || '1';
          return (
            <article key={product.mikroCode} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <button onClick={() => openProductDetail(product)} className="block w-full p-4 text-left">
                <div className="flex gap-3">
                  <ProductImage product={product} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{product.name}</p>
                    <p className="text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Mini label="Fiyat" value={money(price.value)} />
                      <Mini label="Kaynak" value={price.source} />
                      <Mini label="Satilabilir" value={n(product.totalSellable)} />
                      <Mini label="Son alim" value={safeDate(product.customerPrice?.lastSales?.[0]?.saleDate)} />
                    </div>
                  </div>
                </div>
              </button>
              <div className="grid grid-cols-[88px_1fr_1fr] gap-2 border-t border-slate-100 p-3">
                <input
                  value={qty}
                  onChange={(event) => setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: event.target.value }))}
                  onFocus={(event) => event.currentTarget.select()}
                  inputMode="decimal"
                  className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-black outline-none focus:border-amber-500"
                />
                <Button variant="secondary" className="rounded-2xl" onClick={() => shareProduct(product)}>
                  WhatsApp
                </Button>
                <Button className="rounded-2xl" onClick={() => addToDraft(product)}>
                  <Plus className="mr-1 h-4 w-4" /> Ekle
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DraftPanel(props: any) {
  const {
    draft,
    updateDraftItem,
    removeDraftItem,
    clearDraft,
    draftTotal,
    selectedCustomer,
    quoteNote,
    setQuoteNote,
    validityDate,
    setValidityDate,
    orderWarehouse,
    setOrderWarehouse,
    orderSeries,
    setOrderSeries,
    createQuote,
    createOrder,
    shareDraft,
    submitting,
  } = props;

  return (
    <Panel title="Taslak teklif / siparis" icon={ShoppingCart}>
      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <Metric label="Cari" value={selectedCustomer?.displayTitle || selectedCustomer?.mikroCariCode || 'Secilmedi'} />
        <Metric label="Kalem" value={draft.length} />
        <Metric label="Toplam" value={money(draftTotal)} tone="amber" />
        <Metric label="Mod" value="Faturali" tone="emerald" />
      </div>

      <div className="space-y-3">
        {draft.length === 0 && <EmptyText text="Urun arama ekranindan taslaga urun ekleyin." />}
        {draft.map((item: DraftItem, index: number) => (
          <div key={`${item.productCode}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-3">
            <div className="flex gap-3">
              <ProductImage product={{ imageUrl: item.imageUrl, name: item.productName, mikroCode: item.productCode }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900">{item.productName}</p>
                <p className="text-xs font-bold text-slate-500">{item.productCode} - {item.unit}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <LabeledInput
                    label="Miktar"
                    value={String(item.quantity)}
                    onChange={(value: string) => updateDraftItem(index, { quantity: Number(value) || 0 })}
                  />
                  <LabeledInput
                    label="Fiyat"
                    value={String(item.unitPrice)}
                    onChange={(value: string) => updateDraftItem(index, { unitPrice: Number(value) || 0 })}
                  />
                  <Mini label="Satir" value={money(item.quantity * item.unitPrice)} />
                  <button onClick={() => removeDraftItem(index)} className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">Teklif olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={validityDate}
              onChange={(event) => setValidityDate(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-amber-500"
            />
            <input
              value={quoteNote}
              onChange={(event) => setQuoteNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Not"
              className="h-12 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-amber-500"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-12 rounded-2xl" onClick={shareDraft}>
              <Send className="mr-2 h-4 w-4" /> Paylas
            </Button>
            <Button className="h-12 rounded-2xl" isLoading={submitting} onClick={createQuote}>
              <FileText className="mr-2 h-4 w-4" /> Teklif
            </Button>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-black">Siparis olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={orderWarehouse}
              onChange={(event) => setOrderWarehouse(event.target.value)}
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-bold outline-none"
            >
              <option value="1">Merkez depo</option>
              <option value="6">Topca depo</option>
            </select>
            <input
              value={orderSeries}
              onChange={(event) => setOrderSeries(event.target.value.toUpperCase())}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Siparis seri no"
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-bold uppercase text-white outline-none placeholder:text-white/50"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-12 rounded-2xl" onClick={clearDraft}>
              Temizle
            </Button>
            <Button className="h-12 rounded-2xl bg-amber-500 text-slate-950 hover:bg-amber-400" isLoading={submitting} onClick={createOrder}>
              <ClipboardList className="mr-2 h-4 w-4" /> Siparis
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function HistoryPanel({ recentCustomers, recentProducts, setSelectedCustomer, openProductDetail, notes, selectedCustomer }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Son cariler" icon={UserRound}>
        <div className="space-y-2">
          {recentCustomers.length === 0 && <EmptyText text="Son cari yok." />}
          {recentCustomers.map((customer: any) => (
            <button key={customer.id || customer.mikroCariCode} onClick={() => setSelectedCustomer(customer)} className="w-full rounded-2xl bg-slate-50 p-3 text-left">
              <p className="font-black text-slate-900">{customer.displayTitle || customer.name}</p>
              <p className="text-xs text-slate-500">{customer.mikroCariCode}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Son urunler" icon={Package}>
        <div className="space-y-2">
          {recentProducts.length === 0 && <EmptyText text="Son urun yok." />}
          {recentProducts.map((product: any) => (
            <button key={product.mikroCode} onClick={() => openProductDetail(product)} className="flex w-full gap-3 rounded-2xl bg-slate-50 p-3 text-left">
              <ProductImage product={product} small />
              <div className="min-w-0">
                <p className="truncate font-black text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">{product.mikroCode}</p>
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Cari notlari" icon={History}>
        <div className="space-y-2">
          {!selectedCustomer && <EmptyText text="Cari secin." />}
          {selectedCustomer && notes.length === 0 && <EmptyText text="Not yok." />}
          {notes.map((note: any) => (
            <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{safeDate(note.createdAt)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{note.note}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ProductDrawer({ product, safeMode, onClose, addToDraft, shareProduct, quantity, setQuantity }: any) {
  const price = getProductPrice(product);
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="ml-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex min-w-0 gap-3">
            <ProductImage product={product} />
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-slate-950">{product.name}</p>
              <p className="text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>Kapat</Button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Cari fiyat" value={money(price.value)} tone="amber" />
            <Metric label="Kaynak" value={price.source} />
            <Metric label="Satilabilir" value={n(product.totalSellable)} tone="emerald" />
            <Metric label="KDV" value={`%${n(product.vatRate, 0)}`} />
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><Warehouse className="h-4 w-4" /> Depolar</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(product.warehouses || []).map((row: any) => (
                <div key={row.key} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-slate-900">{row.label}</p>
                    <p className={cn('rounded-full px-2 py-1 text-xs font-black', Number(row.sellable) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800')}>
                      {n(row.sellable)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Eldeki {n(row.stock)} - Musteri bekleyen {n(row.pendingCustomer)} - Satin alma {n(row.pendingPurchase)}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><DollarSign className="h-4 w-4" /> Fiyat listeleri</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(product.priceLists || {}).map(([listNo, value]) => (
                <Mini key={listNo} label={`Liste ${listNo}`} value={money(value)} />
              ))}
            </div>
          </div>

          {!safeMode && product.cost && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-black text-red-900"><ShieldCheck className="h-4 w-4" /> Ic maliyet gorunumu</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Guncel maliyet" value={money(product.cost.currentCost)} />
                <Mini label="KDV dahil" value={money(product.cost.currentCostVatIncluded)} />
                <Mini label="Maliyet tarihi" value={safeDate(product.cost.currentCostDate)} />
                <Mini label="Son giris" value={safeDate(product.cost.lastEntryDate)} />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-black text-slate-900">Son satislar</p>
            {(product.customerPrice?.lastSales || []).length === 0 && <EmptyText text="Bu cari icin son satis bulunamadi." />}
            {(product.customerPrice?.lastSales || []).map((sale: any, index: number) => (
              <div key={`${sale.documentNo}-${index}`} className="mb-2 rounded-2xl bg-slate-50 p-3 text-sm">
                <span className="font-bold text-slate-900">{safeDate(sale.saleDate)}</span>
                <span className="ml-2 text-slate-500">{sale.documentNo || '-'}</span>
                <span className="ml-2 font-bold">{n(sale.quantity)} x {money(sale.unitPrice)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[96px_1fr_1fr] gap-2 border-t border-slate-100 p-4">
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            inputMode="decimal"
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-black outline-none focus:border-amber-500"
          />
          <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => shareProduct(product)}>WhatsApp</Button>
          <Button className="h-12 rounded-2xl" onClick={() => addToDraft(product)}><Plus className="mr-2 h-4 w-4" /> Ekle</Button>
        </div>
      </div>
    </div>
  );
}

function OpportunityList({ opportunities }: any) {
  const rows = [
    ...(opportunities?.stalePurchased || []),
    ...(opportunities?.agreementNoRecent || []),
    ...(opportunities?.similarSector || []),
  ].slice(0, 12);

  if (rows.length === 0) return <EmptyText text="Firsat onerisi yok." />;

  return (
    <div className="space-y-2">
      {rows.map((row: any, index: number) => (
        <div key={`${row.type}-${row.productCode}-${index}`} className="rounded-2xl bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{row.productName || row.productCode}</p>
              <p className="text-xs font-bold text-amber-700">{row.title}</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{row.productCode}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{row.reason}</p>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: any) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-2xl bg-slate-950 p-2 text-white"><Icon className="h-4 w-4" /></div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ProductImage({ product, small = false }: any) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-2xl bg-slate-100', small ? 'h-12 w-12' : 'h-20 w-20')}>
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.productName || product.mikroCode} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Package className={small ? 'h-5 w-5' : 'h-8 w-8'} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{String(value ?? '-')}</p>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: any) {
  return (
    <label className="block rounded-2xl bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        inputMode="decimal"
        className="mt-1 h-7 w-full bg-transparent text-sm font-black text-slate-900 outline-none"
      />
    </label>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">{text}</p>;
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <LoadingLine label="Urunler yukleniyor" />
    </div>
  );
}

function BottomTabs({ activeTab, setActiveTab, draftCount }: any) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn('relative rounded-2xl px-2 py-2 text-xs font-black transition', active ? 'bg-slate-950 text-white' : 'text-slate-500')}
            >
              <Icon className="mx-auto mb-1 h-5 w-5" />
              {tab.label}
              {tab.key === 'draft' && draftCount > 0 && (
                <span className="absolute right-2 top-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-950">{draftCount}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
