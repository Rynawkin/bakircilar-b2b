'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils/format';

type RetailProduct = {
  productCode: string;
  productName: string;
  unit: string;
  stockMerkez: number;
  stockTopca: number;
  stockTotal: number;
  stockSelected: number;
  perakende1: number;
  perakende2: number;
  perakende3: number;
  perakende4: number;
  perakende5: number;
  imageUrl: string | null;
};

type CartItem = {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  priceOptions: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

type PriceLevel = 1 | 2 | 3 | 4 | 5;
type PaymentType = 'CASH' | 'CARD';
type WarehouseNo = 1 | 6 | 0;

const getUnitPrice = (product: RetailProduct, level: PriceLevel) => {
  if (level === 1) return Number(product.perakende1) || 0;
  if (level === 2) return Number(product.perakende2) || 0;
  if (level === 3) return Number(product.perakende3) || 0;
  if (level === 4) return Number(product.perakende4) || 0;
  return Number(product.perakende5) || 0;
};

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(3)).toString();
};

const parseQuickQuantity = (value: string): number | null => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;

  const starMatch = normalized.match(/^(\d+(?:\.\d+)?)\*$/);
  if (starMatch) {
    const parsed = Number(starMatch[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const plainMatch = normalized.match(/^\d+(?:\.\d+)?$/);
  if (plainMatch) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '*', '/'],
];

const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '*'];
const NUMPAD_NUMBER_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];

export default function WarehouseRetailPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [priceLevel, setPriceLevel] = useState<PriceLevel>(1);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseNo>(1);
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [creatingSale, setCreatingSale] = useState(false);
  const [quickQtyInput, setQuickQtyInput] = useState('');

  const [searchKeyboardOpen, setSearchKeyboardOpen] = useState(false);
  const [searchKeyboardValue, setSearchKeyboardValue] = useState('');
  const [qtyEditTarget, setQtyEditTarget] = useState<{ productCode: string; value: string } | null>(null);
  const [priceEditTarget, setPriceEditTarget] = useState<{ productCode: string; value: string } | null>(null);

  const [lastSale, setLastSale] = useState<{
    invoiceNo: string;
    totalAmount: number;
    paymentLabel: string;
    customerCode: string;
  } | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  useEffect(() => {
    const timeout = setTimeout(() => setSearchDebounced(searchText.trim()), 220);
    return () => clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const response = await adminApi.getWarehouseRetailProducts({
          search: searchDebounced || undefined,
          limit: 80,
          warehouseNo: selectedWarehouse,
          onlyInStock,
        });
        setProducts(response.products || []);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Urunler alinamadi');
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [searchDebounced, selectedWarehouse, onlyInStock]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalAmount = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0),
    [cartItems]
  );
  const totalLineCount = cartItems.length;
  const totalQuantity = useMemo(() => cartItems.reduce((sum, row) => sum + row.quantity, 0), [cartItems]);

  const getQuickQuantity = () => parseQuickQuantity(quickQtyInput) ?? 1;

  const addToCart = (product: RetailProduct) => {
    const unitPrice = getUnitPrice(product, priceLevel);
    if (unitPrice <= 0) {
      toast.error(`Perakende-${priceLevel} fiyati sifir`);
      return;
    }

    const quantity = getQuickQuantity();
    if (quantity <= 0) {
      toast.error('Miktar gecersiz');
      return;
    }

    setCart((prev) => {
      const existing = prev[product.productCode];
      const priceOptions = {
        1: Math.max(Number(product.perakende1) || 0, 0),
        2: Math.max(Number(product.perakende2) || 0, 0),
        3: Math.max(Number(product.perakende3) || 0, 0),
        4: Math.max(Number(product.perakende4) || 0, 0),
        5: Math.max(Number(product.perakende5) || 0, 0),
      };
      return {
        ...prev,
        [product.productCode]: {
          productCode: product.productCode,
          productName: product.productName,
          unit: product.unit,
          quantity: Number(((existing?.quantity || 0) + quantity).toFixed(3)),
          unitPrice: existing?.unitPrice || unitPrice,
          priceOptions: existing?.priceOptions || priceOptions,
        },
      };
    });

    if (quickQtyInput.trim()) {
      setQuickQtyInput('');
    }
  };

  const changeCartQty = (productCode: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productCode];
      if (!current) return prev;
      const nextQty = Number((current.quantity + delta).toFixed(3));
      if (nextQty <= 0) {
        const clone = { ...prev };
        delete clone[productCode];
        return clone;
      }
      return { ...prev, [productCode]: { ...current, quantity: nextQty } };
    });
  };

  const updateCartQty = (productCode: string, quantity: number) => {
    setCart((prev) => {
      const current = prev[productCode];
      if (!current) return prev;
      const nextQty = Number(quantity.toFixed(3));
      if (nextQty <= 0) {
        const clone = { ...prev };
        delete clone[productCode];
        return clone;
      }
      return { ...prev, [productCode]: { ...current, quantity: nextQty } };
    });
  };

  const updateCartUnitPrice = (productCode: string, unitPrice: number) => {
    setCart((prev) => {
      const current = prev[productCode];
      if (!current) return prev;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return prev;
      return { ...prev, [productCode]: { ...current, unitPrice: Number(unitPrice.toFixed(4)) } };
    });
  };

  const applyCartPriceListLevel = (productCode: string, level: PriceLevel) => {
    setCart((prev) => {
      const current = prev[productCode];
      if (!current) return prev;
      const nextPrice = Number(current.priceOptions[level] || 0);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        toast.error(`Perakende-${level} fiyati sifir`);
        return prev;
      }
      return { ...prev, [productCode]: { ...current, unitPrice: Number(nextPrice.toFixed(4)) } };
    });
  };

  const getSelectedPriceLevel = (item: CartItem): PriceLevel | null => {
    const epsilon = 0.0001;
    const levels: PriceLevel[] = [1, 2, 3, 4, 5];
    for (const level of levels) {
      if (Math.abs(item.unitPrice - Number(item.priceOptions[level] || 0)) < epsilon) {
        return level;
      }
    }
    return null;
  };

  const clearCart = () => setCart({});

  const createSale = async () => {
    if (!cartItems.length) {
      toast.error('Sepet bos');
      return;
    }

    setCreatingSale(true);
    try {
      const result = await adminApi.createWarehouseRetailSale({
        paymentType,
        priceLevel,
        items: cartItems.map((row) => ({
          productCode: row.productCode,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
        })),
      });
      setLastSale({
        invoiceNo: result.invoiceNo,
        totalAmount: result.totalAmount,
        paymentLabel: result.paymentLabel,
        customerCode: result.customerCode,
      });
      setCart({});
      toast.success(`Satis olustu: ${result.invoiceNo}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Perakende satis olusturulamadi');
    } finally {
      setCreatingSale(false);
    }
  };

  const applyQtyEdit = () => {
    if (!qtyEditTarget) return;
    const parsed = Number(qtyEditTarget.value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Miktar gecersiz');
      return;
    }
    updateCartQty(qtyEditTarget.productCode, parsed);
    setQtyEditTarget(null);
  };

  const applyPriceEdit = () => {
    if (!priceEditTarget) return;
    const parsed = Number(priceEditTarget.value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Birim fiyat gecersiz');
      return;
    }
    updateCartUnitPrice(priceEditTarget.productCode, parsed);
    setPriceEditTarget(null);
  };

  const selectedWarehouseLabel =
    selectedWarehouse === 1 ? 'Merkez' : selectedWarehouse === 6 ? 'Topca' : 'Tum Depolar';

  return (
    <div className="space-y-4 p-4 md:p-6 bg-slate-50 min-h-screen">
      <Card className="p-4 md:p-5 border-2 border-slate-200">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Hizli Perakende Satis</h1>
              <p className="text-sm md:text-base text-slate-600">
                Vergisiz satis. Seri: <span className="font-black">FTR</span>
              </p>
            </div>
            {lastSale && (
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 min-w-[280px]">
                <p className="text-xs font-bold text-emerald-700">SON SATIS</p>
                <p className="text-lg font-black text-emerald-900">{lastSale.invoiceNo}</p>
                <p className="text-sm font-semibold text-emerald-800">
                  {lastSale.paymentLabel} / {lastSale.customerCode}
                </p>
                <p className="text-sm font-bold text-emerald-800">{formatCurrency(lastSale.totalAmount)}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_460px] gap-4">
            <div className="space-y-4">
              <Card className="p-4 border border-slate-200">
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-3">
                    <Input
                      value={searchText}
                      readOnly
                      onClick={() => {
                        setSearchKeyboardValue(searchText);
                        setSearchKeyboardOpen(true);
                      }}
                      placeholder="Urun kodu veya isim ara..."
                      className="h-14 text-lg"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => setSelectedWarehouse(1)}
                        className="h-14 text-sm font-black"
                        variant={selectedWarehouse === 1 ? 'primary' : 'secondary'}
                      >
                        Merkez
                      </Button>
                      <Button
                        onClick={() => setSelectedWarehouse(6)}
                        className="h-14 text-sm font-black"
                        variant={selectedWarehouse === 6 ? 'primary' : 'secondary'}
                      >
                        Topca
                      </Button>
                      <Button
                        onClick={() => setSelectedWarehouse(0)}
                        className="h-14 text-sm font-black"
                        variant={selectedWarehouse === 0 ? 'primary' : 'secondary'}
                      >
                        Tum
                      </Button>
                    </div>

                    <Button
                      onClick={() => setOnlyInStock((prev) => !prev)}
                      className="h-14 text-sm font-black"
                      variant={onlyInStock ? 'primary' : 'secondary'}
                    >
                      {onlyInStock ? 'Sadece Stoktakiler' : 'Tum Urunler'}
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => setPaymentType('CASH')}
                        className="h-14 text-base font-black"
                        variant={paymentType === 'CASH' ? 'primary' : 'secondary'}
                      >
                        Nakit
                      </Button>
                      <Button
                        onClick={() => setPaymentType('CARD')}
                        className="h-14 text-base font-black"
                        variant={paymentType === 'CARD' ? 'primary' : 'secondary'}
                      >
                        Kart
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-2">Hizli Miktar Paneli (ornek: 5*)</p>
                      <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xl font-black text-slate-900 mb-2 min-h-[52px]">
                        {quickQtyInput || '1'}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {NUMPAD_KEYS.map((key) => (
                          <button
                            key={key}
                            onClick={() => setQuickQtyInput((prev) => `${prev}${key}`)}
                            className="h-12 rounded-lg border border-slate-300 bg-white text-lg font-black"
                          >
                            {key}
                          </button>
                        ))}
                        <button
                          onClick={() => setQuickQtyInput((prev) => prev.slice(0, -1))}
                          className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setQuickQtyInput('')}
                          className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
                        >
                          Temizle
                        </button>
                        <button
                          onClick={() => {
                            const qty = getQuickQuantity();
                            toast.success(`Secili miktar: ${formatQty(qty)}`);
                          }}
                          className="col-span-2 h-12 rounded-lg border border-emerald-300 bg-emerald-50 text-sm font-black text-emerald-700"
                        >
                          Miktar: {formatQty(getQuickQuantity())}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold text-slate-500 mb-2">Fiyat Listesi</p>
                      <div className="grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            onClick={() => setPriceLevel(level as PriceLevel)}
                            className={`h-14 rounded-xl border-2 text-base font-black ${
                              priceLevel === level
                                ? 'border-cyan-600 bg-cyan-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            P{level}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        P seviye sadece yeni eklenen urunlerin ilk fiyatini belirler. Sepette duzenlenebilir.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-3 border border-slate-200">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-sm font-bold text-slate-600">Urunler</p>
                  <p className="text-xs font-semibold text-slate-500">
                    Depo: {selectedWarehouseLabel} | Fiyat: Perakende-{priceLevel}
                  </p>
                </div>
                {loadingProducts ? (
                  <div className="p-6 text-center text-slate-500 text-sm font-semibold">Yukleniyor...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 max-h-[66vh] overflow-y-auto pr-1">
                    {products.map((product) => {
                      const price = getUnitPrice(product, priceLevel);
                      return (
                        <button
                          key={product.productCode}
                          onClick={() => addToCart(product)}
                          className="text-left rounded-2xl border-2 border-slate-200 bg-white p-3 hover:border-cyan-400 transition-colors"
                        >
                          <div className="flex gap-3">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.productName}
                                className="h-20 w-20 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="h-20 w-20 rounded-lg border border-dashed border-slate-300 bg-slate-100 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-500 text-center px-1">
                                Gorsel Yok
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-black text-slate-900 line-clamp-2">{product.productName}</p>
                              <p className="text-xs font-semibold text-slate-500">{product.productCode}</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-600">
                                  Stok: {formatQty(product.stockSelected)} {product.unit}
                                </span>
                                <span className="text-lg font-black text-cyan-700">{formatCurrency(price)}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {!products.length && (
                      <div className="col-span-full text-center py-10 text-slate-500 text-sm font-semibold">Urun bulunamadi</div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-4 border-2 border-slate-300 h-fit xl:sticky xl:top-20">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900">Sepet</h2>
                  <button
                    onClick={clearCart}
                    className="h-10 px-3 rounded-xl border border-rose-300 text-rose-700 text-sm font-bold"
                  >
                    Temizle
                  </button>
                </div>

                <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
                  {cartItems.map((item) => {
                    const selectedPriceLevel = getSelectedPriceLevel(item);
                    return (
                    <div key={item.productCode} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-black text-slate-900 line-clamp-2">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.productCode}</p>
                      <div className="mt-2 grid grid-cols-5 gap-1">
                        {[1, 2, 3, 4, 5].map((level) => {
                          const value = item.priceOptions[level as PriceLevel];
                          const disabled = !Number.isFinite(value) || value <= 0;
                          const active = selectedPriceLevel === (level as PriceLevel);
                          return (
                            <button
                              key={`${item.productCode}-p${level}`}
                              onClick={() => applyCartPriceListLevel(item.productCode, level as PriceLevel)}
                              disabled={disabled}
                              className={`h-8 rounded-md border text-[11px] font-black ${
                                active
                                  ? 'border-cyan-600 bg-cyan-600 text-white'
                                  : 'border-slate-300 bg-white text-slate-700'
                              }`}
                            >
                              P{level}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => changeCartQty(item.productCode, -1)}
                            className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-black"
                          >
                            -
                          </button>
                          <button
                            onClick={() =>
                              setQtyEditTarget({
                                productCode: item.productCode,
                                value: formatQty(item.quantity),
                              })
                            }
                            className="h-11 min-w-[90px] px-3 rounded-lg bg-slate-100 flex items-center justify-center text-lg font-black"
                          >
                            {formatQty(item.quantity)}
                          </button>
                          <button
                            onClick={() => changeCartQty(item.productCode, 1)}
                            className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-black"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <button
                            onClick={() =>
                              setPriceEditTarget({
                                productCode: item.productCode,
                                value: String(Number(item.unitPrice.toFixed(4))),
                              })
                            }
                            className="text-xs text-slate-500 underline underline-offset-2"
                          >
                            {formatCurrency(item.unitPrice)} / {item.unit}
                          </button>
                          <p className="text-base font-black text-slate-900">{formatCurrency(item.unitPrice * item.quantity)}</p>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                  {!cartItems.length && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500 text-sm font-semibold">
                      Sepet bos
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                  <div className="flex justify-between text-sm font-semibold text-slate-700">
                    <span>Kalem</span>
                    <span>{totalLineCount}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-700">
                    <span>Miktar</span>
                    <span>{formatQty(totalQuantity)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xl font-black text-slate-900">
                    <span>Toplam</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>

                <Button
                  onClick={createSale}
                  disabled={creatingSale || !cartItems.length}
                  className="h-16 text-xl font-black w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {creatingSale ? 'Isleniyor...' : 'Satisi Tamamla (FTR)'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={searchKeyboardOpen}
        onClose={() => setSearchKeyboardOpen(false)}
        title="Urun Arama Klavyesi"
        size="xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setSearchKeyboardValue('')}>Temizle</Button>
            <Button
              onClick={() => {
                setSearchText(searchKeyboardValue.trim());
                setSearchKeyboardOpen(false);
              }}
            >
              OK
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={searchKeyboardValue} readOnly className="h-14 text-xl font-bold" />
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="grid grid-cols-10 gap-2">
              {row.map((key) => (
                <button
                  key={`${rowIndex}-${key}`}
                  onClick={() => setSearchKeyboardValue((prev) => `${prev}${key}`)}
                  className="h-12 rounded-lg border border-slate-300 bg-white text-base font-black"
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSearchKeyboardValue((prev) => prev.slice(0, -1))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Geri Sil
            </button>
            <button
              onClick={() => setSearchKeyboardValue((prev) => `${prev} `)}
              className="col-span-2 h-12 rounded-lg border border-slate-300 bg-white text-sm font-black"
            >
              Bosluk
            </button>
            <button
              onClick={() => setSearchKeyboardValue('')}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(qtyEditTarget)}
        onClose={() => setQtyEditTarget(null)}
        title="Miktar Duzenle"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setQtyEditTarget(null)}>Iptal</Button>
            <Button onClick={applyQtyEdit}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={qtyEditTarget?.value || ''} readOnly className="h-14 text-xl font-black" />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`qty-${key}`}
                onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-12 rounded-lg border border-slate-300 bg-white text-lg font-black"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Sil
            </button>
            <button
              onClick={() => setQtyEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(priceEditTarget)}
        onClose={() => setPriceEditTarget(null)}
        title="Birim Fiyat Duzenle"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setPriceEditTarget(null)}>Iptal</Button>
            <Button onClick={applyPriceEdit}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={priceEditTarget?.value || ''} readOnly className="h-14 text-xl font-black" />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`price-${key}`}
                onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-12 rounded-lg border border-slate-300 bg-white text-lg font-black"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-12 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Sil
            </button>
            <button
              onClick={() => setPriceEditTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-12 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
