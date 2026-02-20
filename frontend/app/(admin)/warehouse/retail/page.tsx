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
import { formatCurrency } from '@/lib/utils/format';

type RetailProduct = {
  productCode: string;
  productName: string;
  unit: string;
  stockMerkez: number;
  stockTopca: number;
  stockTotal: number;
  perakende1: number;
  perakende2: number;
  perakende3: number;
  perakende4: number;
  perakende5: number;
};

type CartItem = {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

type PriceLevel = 1 | 2 | 3 | 4 | 5;
type PaymentType = 'CASH' | 'CARD';

const getUnitPrice = (product: RetailProduct, level: PriceLevel) => {
  if (level === 1) return Number(product.perakende1) || 0;
  if (level === 2) return Number(product.perakende2) || 0;
  if (level === 3) return Number(product.perakende3) || 0;
  if (level === 4) return Number(product.perakende4) || 0;
  return Number(product.perakende5) || 0;
};

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
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [creatingSale, setCreatingSale] = useState(false);
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
    const timeout = setTimeout(() => setSearchDebounced(searchText.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const response = await adminApi.getWarehouseRetailProducts({
          search: searchDebounced || undefined,
          limit: 60,
        });
        setProducts(response.products || []);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Urunler alinamadi');
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [searchDebounced]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalAmount = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0),
    [cartItems]
  );
  const totalLineCount = cartItems.length;
  const totalQuantity = useMemo(() => cartItems.reduce((sum, row) => sum + row.quantity, 0), [cartItems]);

  const addToCart = (product: RetailProduct) => {
    const unitPrice = getUnitPrice(product, priceLevel);
    if (unitPrice <= 0) {
      toast.error(`Perakende-${priceLevel} fiyati sifir`);
      return;
    }
    setCart((prev) => {
      const existing = prev[product.productCode];
      const quantity = (existing?.quantity || 0) + 1;
      return {
        ...prev,
        [product.productCode]: {
          productCode: product.productCode,
          productName: product.productName,
          unit: product.unit,
          quantity,
          unitPrice,
        },
      };
    });
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

  const clearCart = () => setCart({});

  const refreshCartPrices = (nextLevel: PriceLevel, currentProducts: RetailProduct[]) => {
    const byCode = new Map(currentProducts.map((row) => [row.productCode, row]));
    setCart((prev) => {
      const next: Record<string, CartItem> = {};
      for (const [code, item] of Object.entries(prev)) {
        const product = byCode.get(code);
        if (!product) {
          next[code] = item;
          continue;
        }
        next[code] = { ...item, unitPrice: getUnitPrice(product, nextLevel) };
      }
      return next;
    });
  };

  const onChangePriceLevel = (nextLevel: PriceLevel) => {
    setPriceLevel(nextLevel);
    refreshCartPrices(nextLevel, products);
  };

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

  return (
    <div className="space-y-4 p-4 md:p-6 bg-slate-50 min-h-screen">
      <Card className="p-4 md:p-5 border-2 border-slate-200">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">
                Hizli Perakende Satis
              </h1>
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

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
            <div className="space-y-4">
              <Card className="p-4 border border-slate-200">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
                  <Input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Urun kodu veya isim ara..."
                    className="h-14 text-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => setPaymentType('CASH')}
                      className={`h-14 text-base font-black ${
                        paymentType === 'CASH' ? 'bg-emerald-600 hover:bg-emerald-700' : ''
                      }`}
                      variant={paymentType === 'CASH' ? 'primary' : 'secondary'}
                    >
                      Nakit
                    </Button>
                    <Button
                      onClick={() => setPaymentType('CARD')}
                      className={`h-14 text-base font-black ${
                        paymentType === 'CARD' ? 'bg-indigo-600 hover:bg-indigo-700' : ''
                      }`}
                      variant={paymentType === 'CARD' ? 'primary' : 'secondary'}
                    >
                      Kart
                    </Button>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => onChangePriceLevel(level as PriceLevel)}
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
                </div>
              </Card>

              <Card className="p-3 border border-slate-200">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-sm font-bold text-slate-600">Urunler</p>
                  <p className="text-xs font-semibold text-slate-500">
                    Fiyat: Perakende-{priceLevel}
                  </p>
                </div>
                {loadingProducts ? (
                  <div className="p-6 text-center text-slate-500 text-sm font-semibold">Yukleniyor...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 max-h-[65vh] overflow-y-auto pr-1">
                    {products.map((product) => {
                      const price = getUnitPrice(product, priceLevel);
                      return (
                        <button
                          key={product.productCode}
                          onClick={() => addToCart(product)}
                          className="text-left rounded-2xl border-2 border-slate-200 bg-white p-3 hover:border-cyan-400 transition-colors"
                        >
                          <p className="text-sm font-black text-slate-900 line-clamp-2">{product.productName}</p>
                          <p className="text-xs font-semibold text-slate-500">{product.productCode}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Stok: {product.stockTotal} {product.unit}
                            </span>
                            <span className="text-lg font-black text-cyan-700">{formatCurrency(price)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {!products.length && (
                      <div className="col-span-full text-center py-10 text-slate-500 text-sm font-semibold">
                        Urun bulunamadi
                      </div>
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

                <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                  {cartItems.map((item) => (
                    <div key={item.productCode} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-black text-slate-900 line-clamp-2">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.productCode}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => changeCartQty(item.productCode, -1)}
                            className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-black"
                          >
                            -
                          </button>
                          <div className="h-11 min-w-[72px] px-3 rounded-lg bg-slate-100 flex items-center justify-center text-lg font-black">
                            {item.quantity}
                          </div>
                          <button
                            onClick={() => changeCartQty(item.productCode, 1)}
                            className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-black"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{formatCurrency(item.unitPrice)} / {item.unit}</p>
                          <p className="text-base font-black text-slate-900">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
                    <span>{totalQuantity}</span>
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
    </div>
  );
}
