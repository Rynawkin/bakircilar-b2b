'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductDetailModal } from '@/components/customer/ProductDetailModal';
import { FilterState } from '@/components/customer/AdvancedFilters';
import { CategoryMegaMenu } from '@/components/customer/CategoryMegaMenu';
import { CustomerCartSidebar } from '@/components/customer/CustomerCartSidebar';
import { ProductNameTooltip } from '@/components/customer/ProductNameTooltip';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';
import { Handshake, ImageOff, BadgeCheck, Hash, CalendarClock, Search, ArrowDownUp, Warehouse, X } from 'lucide-react';

const PAGE_SIZE = 60;
const CUSTOMER_PRODUCTS_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const AGREEMENT_PRODUCTS_GRID_CLASS = 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3 min-[1800px]:grid-cols-4';
const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

const formatAgreementDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function AgreementProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isStaticDataLoaded, setIsStaticDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const productsRequestRef = useRef<AbortController | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? user?.priceVisibility === 'WHITE_ONLY'
      ? 'WHITE_ONLY'
      : 'INVOICED_ONLY'
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => (type === 'INVOICED' ? 'invoiced' : 'white'));
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  useEffect(() => {
    setAdvancedFilters((prev) => {
      if (!allowedFilterPriceTypes.includes(prev.priceType)) {
        return { ...prev, priceType: defaultFilterPriceType };
      }
      return prev;
    });
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

  useEffect(() => {
    setQuickAddPriceTypes((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(next).forEach(([productId, priceType]) => {
        if (!allowedPriceTypes.includes(priceType)) {
          next[productId] = defaultPriceType;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    loadStaticData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      const controller = productsRequestRef.current;
      productsRequestRef.current = null;
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      lastSearchRef.current = '';
      return;
    }
    if (term === lastSearchRef.current) return;

    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { query: term, source: 'agreements' },
    });
  }, [debouncedSearch]);

  const loadStaticData = useCallback(async () => {
    try {
      const [categoriesData, warehousesData] = await Promise.all([customerApi.getCategories(), customerApi.getWarehouses()]);
      setCategories(categoriesData.categories);
      setWarehouses(warehousesData.warehouses);
    } catch (error) {
      console.error('Static data error:', error);
    } finally {
      setIsStaticDataLoaded(true);
    }
  }, []);

  const fetchProducts = useCallback(
    async (options?: { reset?: boolean; offset?: number }) => {
      const reset = options?.reset ?? false;
      const nextOffset = options?.offset ?? 0;

      if (reset) {
        productsRequestRef.current?.abort();
        const controller = new AbortController();
        productsRequestRef.current = controller;
        setIsSearching(true);
        try {
          const productsData = await customerApi.getProducts({
            categoryId: selectedCategory || undefined,
            categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
            search: debouncedSearch || undefined,
            warehouse: selectedWarehouse || undefined,
            mode: 'agreements',
            limit: PAGE_SIZE,
            offset: nextOffset,
          }, { signal: controller.signal });

          const nextProducts = productsData.products;
          setProducts(nextProducts);
          setOffset(nextOffset + nextProducts.length);
          setHasMore(nextProducts.length === PAGE_SIZE);
        } catch (error) {
          if (!isCanceledRequest(error)) {
            console.error('Product fetch error:', error);
          }
        } finally {
          if (productsRequestRef.current === controller) {
            productsRequestRef.current = null;
            setIsSearching(false);
            setIsLoading(false);
          }
        }
        return;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const productsData = await customerApi.getProducts({
          categoryId: selectedCategory || undefined,
          categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
          search: debouncedSearch || undefined,
          warehouse: selectedWarehouse || undefined,
          mode: 'agreements',
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        const nextProducts = productsData.products;
        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setOffset(nextOffset + nextProducts.length);
        setHasMore(nextProducts.length === PAGE_SIZE);
      } catch (error) {
        console.error('Product fetch error:', error);
      } finally {
        if (reset) {
          setIsSearching(false);
          setIsLoading(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [selectedCategory, selectedCategoryIds, debouncedSearch, selectedWarehouse]
  );

  useEffect(() => {
    if (!isStaticDataLoaded) return;
    setOffset(0);
    setHasMore(true);
    fetchProducts({ reset: true, offset: 0 });
  }, [selectedCategory, debouncedSearch, selectedWarehouse, isStaticDataLoaded, fetchProducts]);

  const filteredProducts = useMemo(() => applyProductFilters(products, advancedFilters), [products, advancedFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (selectedWarehouse) count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    return count;
  }, [search, selectedCategory, selectedWarehouse, advancedFilters]);

  const clearBaseFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedWarehouse('');
  };

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

  const handleQuickAdd = async (product: Product) => {
    const productId = product.id;
    const quantity = quickAddQuantities[productId] || 1;
    const requestedPriceType = quickAddPriceTypes[productId] || defaultPriceType;
    const priceType = allowedPriceTypes.includes(requestedPriceType) ? requestedPriceType : defaultPriceType;

    setAddingToCart((prev) => ({ ...prev, [productId]: true }));

    try {
      const maxQty = getMaxOrderQuantity(product, 'LIST');
      if (quantity > maxQty) {
        const confirmed = await confirmBackorder({
          requestedQty: quantity,
          availableQty: maxQty,
          unit: product.unit,
        });

        if (!confirmed) {
          return;
        }
      }

      await addToCart({
        productId,
        quantity,
        priceType,
        priceMode: 'LIST',
      });

      setQuickAddQuantities((prev) => ({ ...prev, [productId]: 1 }));
      toast.success('Ürün sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleModalAddToCart = async (
    productId: string,
    quantity: number,
    priceType: 'INVOICED' | 'WHITE',
    priceMode: 'LIST' | 'EXCESS' = 'LIST'
  ) => {
    try {
      const safePriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
      await addToCart({
        productId,
        quantity,
        priceType: safePriceType,
        priceMode,
      });
      toast.success('Ürün sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
      throw error;
    }
  };

  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleLoadMore = () => {
    if (isSearching || isLoadingMore || !hasMore) return;
    fetchProducts({ offset, reset: false });
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={CUSTOMER_PRODUCTS_CONTAINER_CLASS}>
        <div className="flex gap-4 2xl:gap-6">
          <div className="min-w-0 flex-1">
            <div className="card card-pad mb-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <Handshake className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="page-title">Anlaşmalı Ürünler</h1>
                  <p className="page-subtitle">
                    Size özel tanımlı anlaşma fiyatları. Bu fiyatlar yalnızca sizin firmanız için geçerlidir.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="badge-info">
                  <Handshake className="h-3 w-3" />
                  Sadece sizin için
                </span>
                <span className="chip">{filteredProducts.length} ürün</span>
                {activeFilterCount > 0 && <span className="chip">{activeFilterCount} aktif filtre</span>}
              </div>
            </div>

            {/* ── Kategori mega-menusu (grid ustunde, tam genislik) ──── */}
            <div className="mb-4">
              <CategoryMegaMenu
                categories={categories}
                selectedCategoryId={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>

            {/* ── Yatay filtre / siralama bari ──────────────────────── */}
            <div className="card mb-6 px-3 py-3 sm:px-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                {/* Arama */}
                <div className="min-w-0 flex-1 lg:min-w-[200px]">
                  <label className="field-label">Ürün Ara</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Ürün adı veya kodu"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9"
                    />
                  </div>
                </div>

                {/* Depo */}
                <div className="lg:w-44">
                  <label className="field-label">Depo</label>
                  <div className="relative">
                    <Warehouse className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <select
                      value={selectedWarehouse}
                      onChange={(e) => setSelectedWarehouse(e.target.value)}
                      className="input w-full pl-9"
                    >
                      <option value="">Tüm Depolar</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse} value={warehouse}>
                          {warehouse}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Siralama */}
                <div className="lg:w-52">
                  <label className="field-label">Sıralama</label>
                  <div className="relative">
                    <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <select
                      value={advancedFilters.sortBy}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, sortBy: e.target.value as FilterState['sortBy'] }))}
                      className="input w-full pl-9"
                    >
                      <option value="none">Varsayılan</option>
                      <option value="name-asc">İsim (A-Z)</option>
                      <option value="name-desc">İsim (Z-A)</option>
                      <option value="price-asc">Fiyat (Düşükten Yükseğe)</option>
                      <option value="price-desc">Fiyat (Yüksekten Düşüğe)</option>
                      <option value="stock-asc">Stok (Azdan Çoğa)</option>
                      <option value="stock-desc">Stok (Çoktan Aza)</option>
                    </select>
                  </div>
                </div>

                {/* Fiyat turu */}
                {showPriceTypeSelector && (
                  <div>
                    <label className="field-label">Fiyat Türü</label>
                    <div className="flex rounded-lg border border-[var(--line-strong)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setAdvancedFilters((prev) => ({ ...prev, priceType: 'invoiced' }))}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                          advancedFilters.priceType === 'invoiced' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        Faturalı
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvancedFilters((prev) => ({ ...prev, priceType: 'white' }))}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                          advancedFilters.priceType === 'white' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        Beyaz
                      </button>
                    </div>
                  </div>
                )}

                {/* Fiyat araligi */}
                <div className="lg:w-44">
                  <label className="field-label">Fiyat Aralığı</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={advancedFilters.minPrice ?? ''}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, minPrice: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full"
                    />
                    <span className="text-gray-300">–</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={advancedFilters.maxPrice ?? ''}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, maxPrice: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Stok araligi */}
                <div className="lg:w-44">
                  <label className="field-label">Stok Aralığı</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={advancedFilters.minStock ?? ''}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, minStock: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full"
                    />
                    <span className="text-gray-300">–</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={advancedFilters.maxStock ?? ''}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, maxStock: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Temizle */}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearBaseFilters();
                      setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType });
                    }}
                    className="btn-ghost h-9 px-3 text-xs text-red-600 hover:bg-red-50 lg:ml-auto"
                  >
                    <X className="h-3.5 w-3.5" />
                    Filtreleri Temizle
                  </button>
                )}
              </div>

              {/* Aktif filtre rozetleri */}
              {(search || selectedWarehouse || selectedCategory) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                  <span className="text-xs font-medium text-gray-500">Aktif:</span>
                  {search && <span className="chip">Arama: {search}</span>}
                  {selectedWarehouse && <span className="chip">Depo: {selectedWarehouse}</span>}
                  {selectedCategory && (
                    <span className="chip">Kategori: {categories.find((cat) => cat.id === selectedCategory)?.name}</span>
                  )}
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={search || selectedCategory || selectedWarehouse ? 'search' : 'products'}
                  title={search || selectedCategory || selectedWarehouse ? 'Ürün bulunamadı' : 'Anlaşmalı ürün bulunamadı'}
                  description={
                    search || selectedCategory || selectedWarehouse
                      ? 'Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz.'
                      : 'Size özel anlaşma tanımları tamamlandığında ürünler burada listelenecektir.'
                  }
                  actionLabel={search || selectedCategory || selectedWarehouse ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory || selectedWarehouse ? clearBaseFilters : undefined}
                />
              </Card>
            ) : (
              <div className="relative">
                {isSearching && (
                  <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/70 pt-6 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Aranıyor…
                    </div>
                  </div>
                )}

                <div className={AGREEMENT_PRODUCTS_GRID_CLASS}>
                  {filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const selectedPriceType = allowedPriceTypes.includes(quickAddPriceTypes[product.id])
                      ? quickAddPriceTypes[product.id]
                      : defaultPriceType;
                    const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
                    const hasAgreement = Boolean(product.agreement);
                    const excessInvoiced = resolveValidExcessPrice(product.prices.invoiced, product.excessPrices?.invoiced);
                    const excessWhite = resolveValidExcessPrice(product.prices.white, product.excessPrices?.white);
                    const showExcessPricing =
                      !hasAgreement && product.excessStock > 0 && (excessInvoiced !== undefined || excessWhite !== undefined);
                    const selectedExcessPrice = showExcessPricing
                      ? selectedPriceType === 'INVOICED'
                        ? excessInvoiced
                        : excessWhite
                      : undefined;
                    const selectedExcessDiscount =
                      showExcessPricing && selectedExcessPrice
                        ? getDiscountPercent(
                            selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white,
                            selectedExcessPrice
                          )
                        : null;
                    const displaySelectedPrice = getDisplayPrice(
                      selectedPrice,
                      product.vatRate,
                      selectedPriceType,
                      vatDisplayPreference
                    );
                    const displaySelectedExcessPrice =
                      selectedExcessPrice !== undefined
                        ? getDisplayPrice(selectedExcessPrice, product.vatRate, selectedPriceType, vatDisplayPreference)
                        : undefined;
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
                    const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                    const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);
                    const whiteVatLabel = getVatLabel('WHITE', vatDisplayPreference);

                    // "Sadece sizin icin" avantaji: anlasma fiyatini standart liste fiyatiyla kiyasla.
                    // product.prices = anlasma uygulanmis fiyat, product.listPrices = standart liste fiyati.
                    const standardSelectedPrice =
                      selectedPriceType === 'INVOICED' ? product.listPrices?.invoiced : product.listPrices?.white;
                    const displayStandardSelectedPrice =
                      typeof standardSelectedPrice === 'number'
                        ? getDisplayPrice(standardSelectedPrice, product.vatRate, selectedPriceType, vatDisplayPreference)
                        : undefined;
                    const agreementDiscount = getDiscountPercent(standardSelectedPrice, selectedPrice);
                    const showAgreementSaving =
                      hasAgreement && displayStandardSelectedPrice !== undefined && displayStandardSelectedPrice > displaySelectedPrice;

                    const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
                    const stockCount = Number(getDisplayStock(product));
                    const customerProductCode = product.agreement?.customerProductCode;
                    const validFromLabel = formatAgreementDate(product.agreement?.validFrom);
                    const validToLabel = formatAgreementDate(product.agreement?.validTo);
                    const validityLabel = validFromLabel
                      ? validToLabel
                        ? `${validFromLabel} – ${validToLabel}`
                        : `${validFromLabel} tarihinden itibaren`
                      : validToLabel
                        ? `${validToLabel} tarihine kadar`
                        : null;

                    return (
                      <div
                        key={product.id}
                        className="card card-hover group relative flex flex-col gap-3 p-4 ring-1 ring-inset ring-primary-100/60"
                      >
                        {/* Size ozel anlasma seridi */}
                        <div className="-mx-4 -mt-4 mb-1 flex items-center gap-1.5 rounded-t-xl bg-primary-50 px-4 py-1.5 text-[11px] font-semibold text-primary-700">
                          <Handshake className="h-3.5 w-3.5" />
                          Size özel anlaşma fiyatı
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => openProductModal(product)}
                            className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-gray-50"
                          >
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-300">
                                <ImageOff className="h-7 w-7" />
                              </div>
                            )}
                            {stockCount > 0 ? (
                              <span className="absolute right-1 top-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-emerald-700 shadow-sm ring-1 ring-emerald-200 backdrop-blur">
                                Stok {getDisplayStock(product)} {product.unit}
                              </span>
                            ) : (
                              <span className="absolute right-1 top-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-amber-700 shadow-sm ring-1 ring-amber-200 backdrop-blur">
                                Tedarikle
                              </span>
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <button
                              className="text-left text-sm font-semibold leading-snug text-gray-900 transition-colors hover:text-primary-600"
                              onClick={() => openProductModal(product)}
                            >
                              <ProductNameTooltip name={product.name} />
                            </button>

                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[10px] text-gray-400">{product.mikroCode}</span>
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                {product.category.name}
                              </span>
                            </div>

                            {unitLabel && <div className="mt-1 text-[11px] text-gray-500">{unitLabel}</div>}

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                              <span>KDV: %{vatPercent}</span>
                              {product.agreement && (
                                <span>
                                  Min. miktar: {product.agreement.minQuantity} {product.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Anlasma detaylari: musteri urun kodu + gecerlilik (sadece sizin icin) */}
                        {(customerProductCode || validityLabel || product.agreement) && (
                          <div className="surface flex flex-col gap-1.5 px-3 py-2 text-[11px]">
                            {product.agreement && (
                              <div className="flex items-center gap-1.5 text-primary-700">
                                <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="font-semibold">
                                  Min. {product.agreement.minQuantity} {product.unit} sipariş ile anlaşma fiyatı
                                </span>
                              </div>
                            )}
                            {customerProductCode && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <Hash className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                                <span>
                                  Sizin ürün kodunuz:{' '}
                                  <span className="font-mono font-semibold text-gray-800">{customerProductCode}</span>
                                </span>
                              </div>
                            )}
                            {validityLabel && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                                <span>Geçerlilik: {validityLabel}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {showPriceTypeSelector ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {allowedPriceTypes.includes('INVOICED') && (
                              <button
                                onClick={() => setQuickAddPriceTypes((prev) => ({ ...prev, [product.id]: 'INVOICED' }))}
                                className={`rounded-lg border px-2 py-2 text-left transition-all ${
                                  selectedPriceType === 'INVOICED'
                                    ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                                }`}
                              >
                                <div
                                  className={`mb-0.5 text-[10px] font-medium ${
                                    selectedPriceType === 'INVOICED' ? 'opacity-80' : 'text-gray-500'
                                  }`}
                                >
                                  Faturalı
                                </div>
                                <div className="text-sm font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                                <div
                                  className={`mt-0.5 text-[10px] ${
                                    selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'
                                  }`}
                                >
                                  {invoicedVatLabel}
                                </div>
                              </button>
                            )}
                            {allowedPriceTypes.includes('WHITE') && (
                              <button
                                onClick={() => setQuickAddPriceTypes((prev) => ({ ...prev, [product.id]: 'WHITE' }))}
                                className={`rounded-lg border px-2 py-2 text-left transition-all ${
                                  selectedPriceType === 'WHITE'
                                    ? 'border-gray-800 bg-gray-800 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                                }`}
                              >
                                <div
                                  className={`mb-0.5 text-[10px] font-medium ${
                                    selectedPriceType === 'WHITE' ? 'opacity-80' : 'text-gray-500'
                                  }`}
                                >
                                  Beyaz
                                </div>
                                <div className="text-sm font-bold">{formatCurrency(displayWhitePrice)}</div>
                                <div
                                  className={`mt-0.5 text-[10px] ${
                                    selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'
                                  }`}
                                >
                                  {whiteVatLabel}
                                </div>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="mb-0.5 text-[10px] font-medium text-gray-500">
                              {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                            </div>
                            <div className="text-base font-bold text-gray-900">{formatCurrency(displaySelectedPrice)}</div>
                            <div className="mt-0.5 text-[10px] text-gray-400">{selectedVatLabel}</div>
                          </div>
                        )}

                        {/* Sadece sizin icin avantaji: standart fiyat -> anlasma fiyati + avantaj */}
                        {showAgreementSaving && (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                              <span className="text-emerald-600/50 line-through">{formatCurrency(displayStandardSelectedPrice)}</span>
                              <span className="text-emerald-400">→</span>
                              <span className="text-sm font-bold">{formatCurrency(displaySelectedPrice)}</span>
                            </span>
                            {agreementDiscount && <span className="badge-success">size özel %{agreementDiscount}</span>}
                          </div>
                        )}

                        {/* Stok yetersiz - tedarik bilgisi (getirtilebilir ama gecikebilir) */}
                        {stockCount <= 0 && (
                          <div className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5">
                            <span className="text-[10px] leading-snug text-amber-700">
                              Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
                            </span>
                          </div>
                        )}

                        <div className="mt-auto flex items-center gap-2 pt-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={quickAddQuantities[product.id] || 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              if (value === '' || parseInt(value, 10) === 0) return;
                              const numValue = Math.max(1, parseInt(value, 10));
                              setQuickAddQuantities((prev) => ({ ...prev, [product.id]: numValue }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || parseInt(e.target.value, 10) === 0) {
                                setQuickAddQuantities((prev) => ({ ...prev, [product.id]: 1 }));
                              }
                            }}
                            className="h-10 w-14 rounded-lg border border-gray-200 text-center text-sm font-bold"
                          />
                          <span className="w-8 flex-shrink-0 text-xs font-medium text-gray-500">{product.unit}</span>
                          <Button
                            size="sm"
                            className="h-10 flex-1 bg-primary-600 text-xs font-semibold text-white hover:bg-primary-700"
                            onClick={() => handleQuickAdd(product)}
                            isLoading={addingToCart[product.id]}
                          >
                            Sepete Ekle
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="mt-6 flex justify-center">
                    <Button className="px-6" onClick={handleLoadMore} isLoading={isLoadingMore}>
                      Daha Fazla Ürün Yükle
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="hidden w-72 flex-shrink-0 xl:block 2xl:w-80">
            <CustomerCartSidebar items={cartItems} onRemoveItem={removeItem} onGoToCart={() => router.push('/cart')} />
          </aside>
        </div>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToCart={handleModalAddToCart}
        allowedPriceTypes={allowedPriceTypes}
        vatDisplayPreference={vatDisplayPreference}
      />
    </div>
  );
}
