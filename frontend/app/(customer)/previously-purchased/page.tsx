'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { History, Search, ArrowDownUp, Warehouse, FileText, X } from 'lucide-react';
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
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDescendantCategoryIds } from '@/lib/utils/categoryTree';

const PAGE_SIZE = 60;
const CUSTOMER_PRODUCTS_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const CUSTOMER_PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';
const isCanceledRequest = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

export default function PreviouslyPurchasedPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  // 1.2: Sunucudaki toplam urun sayisi (sadece ekrandaki degil).
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isStaticDataLoaded, setIsStaticDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [documentNoFilter, setDocumentNoFilter] = useState('');
  const [lastPurchaseSort, setLastPurchaseSort] = useState<'none' | 'date-desc' | 'date-asc'>('date-desc');
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
  const [lastSalesModalProduct, setLastSalesModalProduct] = useState<Product | null>(null);

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
      meta: { query: term, source: 'previously-purchased' },
    });
  }, [debouncedSearch]);

  const loadStaticData = useCallback(async () => {
    try {
      const [categoriesData, warehousesData] = await Promise.all([
        customerApi.getCategories(),
        customerApi.getWarehouses(),
      ]);
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
            mode: 'purchased',
            sort: 'lastPurchasedDesc',
            limit: PAGE_SIZE,
            offset: nextOffset,
          }, { signal: controller.signal });

          const nextProducts = Array.isArray(productsData?.products) ? productsData.products : [];
          setProducts(nextProducts);
          setOffset(nextOffset + nextProducts.length);
          setHasMore(nextProducts.length === PAGE_SIZE);
          // 1.2: Toplam urun sayisini sunucudan al (mevcut ise).
          setTotalCount(typeof productsData?.total === 'number' ? productsData.total : null);
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
          mode: 'purchased',
          sort: 'lastPurchasedDesc',
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        const nextProducts = Array.isArray(productsData?.products) ? productsData.products : [];
        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setOffset(nextOffset + nextProducts.length);
        setHasMore(nextProducts.length === PAGE_SIZE);
        // 1.2: Toplam urun sayisini sunucudan al (mevcut ise).
        if (typeof productsData?.total === 'number') {
          setTotalCount(productsData.total);
        }
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

  const filteredProducts = useMemo(() => {
    let next = applyProductFilters(products, advancedFilters);
    const normalizedDoc = documentNoFilter.trim().toLowerCase();

    if (normalizedDoc) {
      next = next.filter((product) =>
        (product.lastSales || []).some((sale) => {
          const documentValue = String(sale.documentNo || sale.orderNumber || '').toLowerCase();
          return documentValue.includes(normalizedDoc);
        })
      );
    }

    if (lastPurchaseSort !== 'none') {
      next = [...next].sort((a, b) => {
        const aTs = a.lastSales?.[0]?.saleDate ? new Date(a.lastSales[0].saleDate).getTime() : 0;
        const bTs = b.lastSales?.[0]?.saleDate ? new Date(b.lastSales[0].saleDate).getTime() : 0;
        return lastPurchaseSort === 'date-desc' ? bTs - aTs : aTs - bTs;
      });
    }

    return next;
  }, [products, advancedFilters, documentNoFilter, lastPurchaseSort]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (selectedWarehouse) count += 1;
    if (documentNoFilter.trim()) count += 1;
    if (lastPurchaseSort !== 'date-desc') count += 1;
    if (advancedFilters.sortBy !== 'none') count += 1;
    if (typeof advancedFilters.minPrice === 'number') count += 1;
    if (typeof advancedFilters.maxPrice === 'number') count += 1;
    if (typeof advancedFilters.minStock === 'number') count += 1;
    if (typeof advancedFilters.maxStock === 'number') count += 1;
    return count;
  }, [search, selectedCategory, selectedWarehouse, documentNoFilter, lastPurchaseSort, advancedFilters]);

  const clearBaseFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedWarehouse('');
    setDocumentNoFilter('');
    setLastPurchaseSort('date-desc');
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
      toast.success('Urun sepete eklendi');
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
      toast.success('Urun sepete eklendi');
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
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <History className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h1 className="page-title">Daha Önce Aldıklarım</h1>
                  <p className="page-subtitle">
                    Daha önce satın aldığınız ürünleri hızlı şekilde tekrar siparişe ekleyebilirsiniz.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="chip">
                  {/* 1.2: Toplam urun sayisi varsa "Toplam N urunden ilk M" goster. */}
                  {totalCount !== null && totalCount > filteredProducts.length
                    ? `Toplam ${totalCount} üründen ilk ${filteredProducts.length}`
                    : `${filteredProducts.length} ürün`}
                </span>
                {activeFilterCount > 0 && (
                  <span className="chip">{activeFilterCount} aktif filtre</span>
                )}
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
                <div className="lg:w-40">
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

                {/* Belge No */}
                <div className="lg:w-44">
                  <label className="field-label">Belge No</label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Belge no ile filtrele"
                      value={documentNoFilter}
                      onChange={(e) => setDocumentNoFilter(e.target.value)}
                      className="w-full pl-9"
                    />
                  </div>
                </div>

                {/* Son alis siralama */}
                <div className="lg:w-56">
                  <label className="field-label">Son Alış Sıralama</label>
                  <div className="relative">
                    <History className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <select
                      value={lastPurchaseSort}
                      onChange={(e) => setLastPurchaseSort(e.target.value as 'none' | 'date-desc' | 'date-asc')}
                      className="input w-full pl-9"
                    >
                      <option value="date-desc">Son alış: yeniden eskiye</option>
                      <option value="none">Ürün adı varsayılanı</option>
                      <option value="date-asc">Son alış: eskiden yeniye</option>
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
              {(search || selectedCategory || selectedWarehouse || documentNoFilter || lastPurchaseSort !== 'date-desc') && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                  <span className="text-xs font-medium text-gray-500">Aktif:</span>
                  {search && <span className="chip">Arama: {search}</span>}
                  {selectedWarehouse && <span className="chip">Depo: {selectedWarehouse}</span>}
                  {selectedCategory && (
                    <span className="chip">
                      Kategori: {categories.find((cat) => cat.id === selectedCategory)?.name}
                    </span>
                  )}
                  {documentNoFilter && <span className="chip">Belge No: {documentNoFilter}</span>}
                  {lastPurchaseSort !== 'date-desc' && (
                    <span className="chip">
                      Sıralama: {lastPurchaseSort === 'date-asc' ? 'Eskiden yeniye' : 'Ürün adı varsayılanı'}
                    </span>
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
                  icon={search || selectedCategory ? 'search' : 'products'}
                  title={search || selectedCategory ? 'Urun bulunamadi' : 'Daha once aldiginiz urun bulunamadi'}
                  description={
                    search || selectedCategory
                      ? 'Arama veya filtre kriterlerini degistirip tekrar deneyebilirsiniz.'
                      : 'Bu cari hesap icin daha once satin alinan urun kaydi bulunamadi.'
                  }
                  actionLabel={search || selectedCategory ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory ? clearBaseFilters : undefined}
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

                <div className={CUSTOMER_PRODUCTS_GRID_CLASS}>
                  {filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
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
                    const displayExcessInvoiced =
                      excessInvoiced !== undefined
                        ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
                        : undefined;
                    const displayExcessWhite =
                      excessWhite !== undefined
                        ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
                        : undefined;
                    const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                    const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);
                    const lastSale = product.lastSales?.[0];
                    const lastSaleDocumentNo = lastSale?.documentNo || lastSale?.orderNumber || '-';

                    return (
                      <div
                        key={product.id}
                        className="group bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col hover:border-primary-300 hover:shadow-md transition-all duration-200"
                      >
                        {/* Image */}
                        <button
                          type="button"
                          onClick={() => openProductModal(product)}
                          className="relative block bg-gray-50 aspect-square overflow-hidden"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}

                          {/* Stock badge */}
                          {Number(getDisplayStock(product)) > 0 ? (
                            <span className="absolute top-2 right-2 bg-white/95 backdrop-blur text-emerald-700 ring-1 ring-emerald-200 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight shadow-sm">
                              Stok {getDisplayStock(product)} {product.unit}
                            </span>
                          ) : (
                            <span className="absolute top-2 right-2 bg-white/95 backdrop-blur text-amber-700 ring-1 ring-amber-200 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight shadow-sm">
                              Tedarikle
                            </span>
                          )}

                          {/* Excess stock badge */}
                          {product.excessStock > 0 && (
                            <span className="absolute bottom-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                              İndirimli · {product.excessStock} {product.unit}
                            </span>
                          )}
                        </button>

                        {/* Info */}
                        <div className="px-3 pt-3 pb-1 flex-1 flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => openProductModal(product)}
                            className="text-left text-sm font-semibold text-gray-900 leading-snug hover:text-primary-600 transition-colors"
                          >
                            <ProductNameTooltip name={product.name} />
                          </button>

                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-gray-400 font-mono">{product.mikroCode}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{product.category.name}</span>
                          </div>

                          {unitLabel && <span className="text-[11px] text-gray-500">{unitLabel}</span>}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">KDV: %{vatPercent}</span>
                            {hasAgreement && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                                Anlaşma: min {product.agreement?.minQuantity ?? 1} {product.unit}
                              </span>
                            )}
                          </div>

                          {/* Son alis ozeti - detay icin tiklanabilir */}
                          {lastSale?.saleDate && (
                            <button
                              type="button"
                              onClick={() => setLastSalesModalProduct(product)}
                              className="mt-1 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2 py-1.5 text-left text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                            >
                              <History className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                              <span className="leading-snug">
                                Son alış: {formatDateShort(lastSale.saleDate)} · Belge No: {lastSaleDocumentNo}
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Price Type Selector */}
                        <div className="px-3 py-2">
                          {showPriceTypeSelector ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              {allowedPriceTypes.includes('INVOICED') && (
                                <button
                                  onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'INVOICED' })}
                                  className={`rounded-lg px-2 py-2 text-left transition-all border ${
                                    selectedPriceType === 'INVOICED'
                                      ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                                      : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                                  }`}
                                >
                                  <div className={`text-[10px] font-medium mb-0.5 ${selectedPriceType === 'INVOICED' ? 'opacity-80' : 'text-gray-500'}`}>Faturalı</div>
                                  {showExcessPricing && displayExcessInvoiced !== undefined ? (
                                    <>
                                      <div className={`text-xs font-bold ${selectedPriceType === 'INVOICED' ? 'text-green-200' : 'text-green-600'}`}>
                                        {formatCurrency(displayExcessInvoiced)}
                                        {getDiscountPercent(product.prices.invoiced, excessInvoiced) && (
                                          <span className="ml-1 text-[10px]">-%{getDiscountPercent(product.prices.invoiced, excessInvoiced)}</span>
                                        )}
                                      </div>
                                      <div className={`text-[10px] line-through ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>
                                        {formatCurrency(displayInvoicedPrice)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                                  )}
                                  <div className={`text-[10px] mt-0.5 ${selectedPriceType === 'INVOICED' ? 'opacity-60' : 'text-gray-400'}`}>{invoicedVatLabel}</div>
                                </button>
                              )}
                              {allowedPriceTypes.includes('WHITE') && (
                                <button
                                  onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'WHITE' })}
                                  className={`rounded-lg px-2 py-2 text-left transition-all border ${
                                    selectedPriceType === 'WHITE'
                                      ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className={`text-[10px] font-medium mb-0.5 ${selectedPriceType === 'WHITE' ? 'opacity-80' : 'text-gray-500'}`}>Beyaz</div>
                                  {showExcessPricing && displayExcessWhite !== undefined ? (
                                    <>
                                      <div className={`text-xs font-bold ${selectedPriceType === 'WHITE' ? 'text-green-200' : 'text-green-600'}`}>
                                        {formatCurrency(displayExcessWhite)}
                                        {getDiscountPercent(product.prices.white, excessWhite) && (
                                          <span className="ml-1 text-[10px]">-%{getDiscountPercent(product.prices.white, excessWhite)}</span>
                                        )}
                                      </div>
                                      <div className={`text-[10px] line-through ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>
                                        {formatCurrency(displayWhitePrice)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-bold">{formatCurrency(displayWhitePrice)}</div>
                                  )}
                                  <div className={`text-[10px] mt-0.5 ${selectedPriceType === 'WHITE' ? 'opacity-60' : 'text-gray-400'}`}>{getVatLabel('WHITE', vatDisplayPreference)}</div>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                              <div className="text-[10px] text-gray-500 font-medium mb-0.5">
                                {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                              </div>
                              {showExcessPricing && displaySelectedExcessPrice !== undefined ? (
                                <>
                                  <div className="text-xs font-bold text-green-600">
                                    {formatCurrency(displaySelectedExcessPrice)}
                                    {selectedExcessDiscount && <span className="ml-1">-%{selectedExcessDiscount}</span>}
                                  </div>
                                  <div className="text-[10px] text-gray-400 line-through">{formatCurrency(displaySelectedPrice)}</div>
                                </>
                              ) : (
                                <div className="text-sm font-bold text-gray-900">{formatCurrency(displaySelectedPrice)}</div>
                              )}
                              <div className="text-[10px] text-gray-400 mt-0.5">{selectedVatLabel}</div>
                            </div>
                          )}
                        </div>

                        {/* Indirim vurgusu - ne kadardan kaca dustu + avantaj */}
                        {showExcessPricing && displaySelectedExcessPrice !== undefined && (
                          <div className="px-3 pb-1.5">
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
                              <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1.5">
                                <span className="line-through text-emerald-600/50">{formatCurrency(displaySelectedPrice)}</span>
                                <span className="text-emerald-400">→</span>
                                <span className="text-sm font-bold">{formatCurrency(displaySelectedExcessPrice)}</span>
                              </span>
                              {selectedExcessDiscount && (
                                <span className="badge-success">%{selectedExcessDiscount} avantaj</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Stok yetersiz - tedarik bilgisi (yanlis anlasilmasin: getirtilebilir ama gecikebilir) */}
                        {Number(getDisplayStock(product)) <= 0 && (
                          <div className="px-3 pb-1">
                            <div className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5">
                              <span className="text-[10px] leading-snug text-amber-700">Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.</span>
                            </div>
                          </div>
                        )}

                        {/* Quantity & Add to Cart */}
                        <div className="px-3 pb-3 flex items-center gap-2">
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
                            className="w-14 text-center font-semibold text-sm h-9 border border-gray-200 rounded-lg"
                          />
                          <span className="text-xs text-gray-500 font-medium w-8 flex-shrink-0">{product.unit}</span>
                          <Button
                            size="sm"
                            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs h-9 rounded-lg transition-colors"
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
                      Daha Fazla Urun Yukle
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

      {lastSalesModalProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Son 5 Alis Detayi</h3>
                <p className="text-xs text-gray-600">
                  {lastSalesModalProduct.name} ({lastSalesModalProduct.mikroCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLastSalesModalProduct(null)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Kapat
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {Array.isArray(lastSalesModalProduct.lastSales) && lastSalesModalProduct.lastSales.length > 0 ? (
                <div className="space-y-2">
                  {lastSalesModalProduct.lastSales.slice(0, 5).map((sale, index) => {
                    const lineTotal = Number(sale.lineTotal ?? (Number(sale.quantity || 0) * Number(sale.unitPrice || 0)));
                    return (
                      <div key={`${sale.saleDate}-${sale.documentNo || sale.orderNumber || index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="grid grid-cols-1 gap-2 text-xs text-gray-700 md:grid-cols-5">
                          <div>
                            <div className="font-semibold text-gray-500">Tarih</div>
                            <div>{formatDateShort(sale.saleDate)}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-500">Belge No</div>
                            <div>{sale.documentNo || '-'}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-500">Siparis No</div>
                            <div>{sale.orderNumber || '-'}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-500">Miktar</div>
                            <div>{sale.quantity} {lastSalesModalProduct.unit}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-500">Birim / Tutar</div>
                            <div>{formatCurrency(Number(sale.unitPrice || 0))} / {formatCurrency(lineTotal)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Son alis detayi bulunamadi.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
