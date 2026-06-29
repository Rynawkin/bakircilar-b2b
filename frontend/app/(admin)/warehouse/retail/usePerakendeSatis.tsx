'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency } from '@/lib/utils/format';

export type RetailProduct = {
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

export type CartItem = {
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

export type PriceLevel = 1 | 2 | 3 | 4 | 5;
export type PaymentType = 'CASH' | 'CARD';
export type WarehouseNo = 1 | 6 | 0;

export const getUnitPrice = (product: RetailProduct, level: PriceLevel) => {
  if (level === 1) return Number(product.perakende1) || 0;
  if (level === 2) return Number(product.perakende2) || 0;
  if (level === 3) return Number(product.perakende3) || 0;
  if (level === 4) return Number(product.perakende4) || 0;
  return Number(product.perakende5) || 0;
};

export const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(3)).toString();
};

export const parseQuickQuantity = (value: string): number | null => {
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

export const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'İ', 'Ö', 'Ü'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ç', 'Ğ', 'Ş', '.', '-'],
];

export const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];
export const NUMPAD_NUMBER_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];

/**
 * Perakende Satis ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function usePerakendeSatis() {
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
  const [moduleFullscreen, setModuleFullscreen] = useState(false);
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking') && !hasPermission('admin:warehouse-retail')) {
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

  useEffect(() => {
    if (!moduleFullscreen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [moduleFullscreen]);

  useEffect(() => {
    if (!isBarcodeMode) return;
    setSearchKeyboardOpen(false);
    const timer = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isBarcodeMode]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalAmount = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0),
    [cartItems]
  );
  const totalLineCount = cartItems.length;
  const totalQuantity = useMemo(() => cartItems.reduce((sum, row) => sum + row.quantity, 0), [cartItems]);

  const getQuickQuantity = () => parseQuickQuantity(quickQtyInput) ?? 1;

  const openSearchKeyboard = () => {
    if (isBarcodeMode) return;
    setSearchKeyboardValue(searchText);
    setSearchKeyboardOpen(true);
  };

  const applySearchKeyboard = () => {
    setSearchText(searchKeyboardValue.trim());
    setSearchKeyboardOpen(false);
  };

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

  const findScannedProduct = (list: RetailProduct[], token: string) => {
    const exactCode = list.find((product) => product.productCode.toUpperCase() === token);
    const startsWith = list.filter((product) => product.productCode.toUpperCase().startsWith(token));
    return exactCode || (startsWith.length === 1 ? startsWith[0] : list.length === 1 ? list[0] : null);
  };

  const handleBarcodeScanSubmit = async (rawInput?: string) => {
    const token = (rawInput ?? searchText).trim().toUpperCase();
    if (!token) return;

    let found = findScannedProduct(products, token);

    // Scanner Enter often arrives before debounced list refresh; do a direct API lookup fallback.
    if (!found) {
      try {
        const response = await adminApi.getWarehouseRetailProducts({
          search: token,
          limit: 20,
          warehouseNo: selectedWarehouse,
          onlyInStock,
        });
        const remoteProducts = response.products || [];
        if (remoteProducts.length > 0) {
          setProducts(remoteProducts);
        }
        found = findScannedProduct(remoteProducts, token);
      } catch (error) {
        console.error('Barkod arama fallback hatasi:', error);
      }
    }

    if (!found) {
      toast.error('Barkoddan urun bulunamadi');
      return;
    }

    addToCart(found);
    setSearchText('');
    setSearchDebounced('');
    setTimeout(() => searchInputRef.current?.focus(), 0);
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

  return {
    // refs
    searchInputRef,
    // search / list state
    searchText,
    setSearchText,
    searchDebounced,
    setSearchDebounced,
    products,
    loadingProducts,
    // controls state
    priceLevel,
    setPriceLevel,
    paymentType,
    setPaymentType,
    selectedWarehouse,
    setSelectedWarehouse,
    onlyInStock,
    setOnlyInStock,
    isBarcodeMode,
    setIsBarcodeMode,
    moduleFullscreen,
    setModuleFullscreen,
    // cart state
    cart,
    cartItems,
    totalAmount,
    totalLineCount,
    totalQuantity,
    creatingSale,
    lastSale,
    // quick qty
    quickQtyInput,
    setQuickQtyInput,
    getQuickQuantity,
    // search keyboard modal
    searchKeyboardOpen,
    setSearchKeyboardOpen,
    searchKeyboardValue,
    setSearchKeyboardValue,
    openSearchKeyboard,
    applySearchKeyboard,
    // qty / price edit modals
    qtyEditTarget,
    setQtyEditTarget,
    priceEditTarget,
    setPriceEditTarget,
    applyQtyEdit,
    applyPriceEdit,
    // handlers
    addToCart,
    handleBarcodeScanSubmit,
    changeCartQty,
    updateCartQty,
    updateCartUnitPrice,
    applyCartPriceListLevel,
    getSelectedPriceLevel,
    clearCart,
    createSale,
    // derived
    selectedWarehouseLabel,
  };
}

export default usePerakendeSatis;
