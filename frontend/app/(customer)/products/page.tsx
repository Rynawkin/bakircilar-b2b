'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { CategoryMegaMenu } from '@/components/customer/CategoryMegaMenu';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { buildCategoryTree, getCategoryPath, getDescendantCategoryIds } from '@/lib/utils/categoryTree';

const PRODUCTS_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1900px] px-3 py-6 sm:px-4 lg:px-6 2xl:px-8';
const PRODUCTS_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6';

export default function ProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];
  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => type === 'INVOICED' ? 'invoiced' : 'white');
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const selectedCategoryIds = useMemo(
    () => (selectedCategory ? getDescendantCategoryIds(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });

  // Category sidebar state
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setAdvancedFilters((prev) => {
      if (!allowedFilterPriceTypes.includes(prev.priceType)) {
        return { ...prev, priceType: defaultFilterPriceType };
      }
      return prev;
    });
  }, [allowedFilterPriceTypes.join('|'), defaultFilterPriceType]);

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
      meta: { query: term, source: 'products' },
    });
  }, [debouncedSearch]);

  // Quick add states
  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

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

  // Apply advanced filters to products
  const filteredProducts = useMemo(() => {
    return applyProductFilters(products, advancedFilters);
  }, [products, advancedFilters]);

  // Load static data (categories) only once on mount
  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    loadStaticData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStaticData = useCallback(async () => {
    try {
      const categoriesData = await customerApi.getCategories();
      setCategories(categoriesData.categories);
    } catch (error) {
      console.error('Statik veri yükleme hatası:', error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setIsSearching(true);
    try {
      const searchParams = {
        categoryId: selectedCategory || undefined,
        categoryIds: selectedCategoryIds.length ? selectedCategoryIds : undefined,
        search: debouncedSearch || undefined,
        mode: 'all' as const,
      };

      const productsData = await customerApi.getProducts(searchParams);
      setProducts(productsData.products);
    } catch (error) {
      console.error('Ürün yükleme hatası:', error);
    } finally {
      setIsSearching(false);
      setIsInitialLoad(false);
    }
  }, [selectedCategory, selectedCategoryIds, debouncedSearch]);

  // Load products whenever filters change
  useEffect(() => {
    if (categories.length > 0) {
      fetchProducts();
    }
  }, [selectedCategory, debouncedSearch, categories, fetchProducts]);

  const handleQuickAdd = async (product: Product) => {
    const productId = product.id;
    const quantity = quickAddQuantities[productId] || 1;
    const requestedPriceType = quickAddPriceTypes[productId] || defaultPriceType;
    const priceType = allowedPriceTypes.includes(requestedPriceType)
      ? requestedPriceType
      : defaultPriceType;
    const hasAgreement = Boolean(product.agreement);
    const excessInvoiced = resolveValidExcessPrice(
      product.prices.invoiced,
      product.excessPrices?.invoiced
    );
    const excessWhite = resolveValidExcessPrice(
      product.prices.white,
      product.excessPrices?.white
    );
    const showExcessPricing =
      !hasAgreement &&
      product.excessStock > 0 &&
      (excessInvoiced !== undefined || excessWhite !== undefined);
    const hasSelectedExcessPrice = showExcessPricing
      ? (priceType === 'INVOICED' ? excessInvoiced !== undefined : excessWhite !== undefined)
      : false;
    const effectivePriceMode: 'LIST' | 'EXCESS' = hasSelectedExcessPrice ? 'EXCESS' : 'LIST';

    setAddingToCart({ ...addingToCart, [productId]: true });

    try {
      const maxQty = effectivePriceMode === 'EXCESS'
        ? Math.max(0, Number(product.excessStock) || 0)
        : getMaxOrderQuantity(product, 'LIST');
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
        priceMode: effectivePriceMode,
      });

      // Reset quantity after adding
      setQuickAddQuantities({ ...quickAddQuantities, [productId]: 1 });

      toast.success('Ürün sepete eklendi! 🛒', {
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Cart error:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart({ ...addingToCart, [productId]: false });
    }
  };

  // Calculate cart totals
  const invoicedTotal = (cartItems || [])
    .filter(item => item.priceType === 'INVOICED')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const whiteTotal = (cartItems || [])
    .filter(item => item.priceType === 'WHITE')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const totalItems = (cartItems || []).reduce((sum, item) => sum + item.quantity, 0);

  // Category tree — built via buildCategoryTree (same utility as CategoryMegaMenu)
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const { roots: rootCategories, nodesById: catNodesById, childrenById: catChildrenById } = categoryTree;

  // Path of the currently selected category (for auto-expand)
  const selectedCategoryPath = useMemo(
    () => (selectedCategory ? getCategoryPath(selectedCategory, categories) : []),
    [selectedCategory, categories]
  );

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={PRODUCTS_PAGE_CONTAINER_CLASS}>

        {/* Top search bar */}
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative w-full max-w-3xl xl:flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              placeholder="Ürün adı veya kodu ile ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm border border-gray-200 rounded-lg bg-white shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
            {search !== debouncedSearch && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-primary-500">yazılıyor…</span>
            )}
          </div>

          {/* Active filter chips */}
          {(search || selectedCategory) && (
            <div className="flex items-center gap-2 flex-wrap">
              {search && (
                <span className="inline-flex items-center gap-1 bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1 rounded-full text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  "{search}"
                  <button onClick={() => setSearch('')} className="ml-1 hover:text-primary-900">✕</button>
                </span>
              )}
              {selectedCategory && (
                <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                  {categories.find(c => c.id === selectedCategory)?.name}
                  <button onClick={() => setSelectedCategory('')} className="ml-1 hover:text-green-900">✕</button>
                </span>
              )}
              <button
                onClick={() => { setSearch(''); setSelectedCategory(''); }}
                className="text-xs text-gray-500 hover:text-red-600 underline"
              >
                Tümünü temizle
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-4 2xl:gap-6">

          {/* ── LEFT: Category Sidebar ─────────────────────────────── */}
          <aside className="hidden w-64 flex-shrink-0 lg:block 2xl:w-72">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-6">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategoriler</h2>
              </div>
              <nav className="py-2 max-h-[calc(100vh-10rem)] overflow-y-auto">
                {/* All products */}
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                    !selectedCategory
                      ? 'bg-primary-50 text-primary-700 font-semibold border-r-2 border-primary-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Tüm Ürünler
                  </span>
                </button>

                {rootCategories.map((cat) => {
                  const childIds = catChildrenById.get(cat.id) || [];
                  const children = childIds.map(id => catNodesById.get(id)).filter(Boolean) as typeof rootCategories;
                  const isExpanded = expandedCategories[cat.id];
                  const isSelected = selectedCategory === cat.id;
                  // A child (or deeper descendant) is selected under this root
                  const hasChildSelected =
                    selectedCategoryPath.length > 1 && selectedCategoryPath[0]?.id === cat.id;

                  return (
                    <div key={cat.id}>
                      <div
                        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary-50 text-primary-700 font-semibold border-r-2 border-primary-600'
                            : hasChildSelected
                            ? 'text-primary-600 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <button
                          className="text-sm flex-1 text-left"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            if (children.length > 0) toggleCategory(cat.id);
                          }}
                        >
                          {cat.name}
                        </button>
                        {children.length > 0 && (
                          <button
                            onClick={() => toggleCategory(cat.id)}
                            className="ml-1 p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded || hasChildSelected ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Subcategories (level 2) */}
                      {children.length > 0 && (isExpanded || hasChildSelected) && (
                        <div className="bg-gray-50 border-l-2 border-gray-200 ml-4">
                          {children.map((child) => {
                            const grandChildIds = catChildrenById.get(child.id) || [];
                            const grandChildren = grandChildIds.map(id => catNodesById.get(id)).filter(Boolean) as typeof rootCategories;
                            const isChildSelected = selectedCategory === child.id;
                            const hasGrandChildSelected =
                              selectedCategoryPath.length > 2 && selectedCategoryPath[1]?.id === child.id;
                            const isChildExpanded = expandedCategories[child.id];

                            return (
                              <div key={child.id}>
                                <div className={`flex items-center justify-between transition-colors ${
                                  isChildSelected
                                    ? 'bg-primary-50 text-primary-700 font-semibold border-r-2 border-primary-600'
                                    : hasGrandChildSelected
                                    ? 'text-primary-600 font-medium'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}>
                                  <button
                                    onClick={() => {
                                      setSelectedCategory(child.id);
                                      if (grandChildren.length > 0) toggleCategory(child.id);
                                    }}
                                    className="flex-1 text-left px-3 py-2 text-xs"
                                  >
                                    {child.name}
                                  </button>
                                  {grandChildren.length > 0 && (
                                    <button
                                      onClick={() => toggleCategory(child.id)}
                                      className="pr-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                                    >
                                      <svg
                                        className={`w-3 h-3 transition-transform ${isChildExpanded || hasGrandChildSelected ? 'rotate-90' : ''}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  )}
                                </div>

                                {/* Subcategories (level 3) */}
                                {grandChildren.length > 0 && (isChildExpanded || hasGrandChildSelected) && (
                                  <div className="border-l-2 border-gray-200 ml-3">
                                    {grandChildren.map((leaf) => (
                                      <button
                                        key={leaf.id}
                                        onClick={() => setSelectedCategory(leaf.id)}
                                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                                          selectedCategory === leaf.id
                                            ? 'bg-primary-50 text-primary-700 font-semibold border-r-2 border-primary-600'
                                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                        }`}
                                      >
                                        {leaf.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* ── CENTER: Products ───────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Mobile category strip */}
            <div className="lg:hidden mb-4">
              <CategoryMegaMenu
                categories={categories}
                selectedCategoryId={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>

            {/* Advanced filters */}
            <div className="mb-4">
              <AdvancedFilters
                onFilterChange={(filters) => setAdvancedFilters(filters)}
                onReset={() => {
                  setAdvancedFilters({
                    sortBy: 'none',
                    priceType: defaultFilterPriceType,
                  });
                }}
                allowedPriceTypes={allowedFilterPriceTypes}
              />
            </div>

            {/* Result count */}
            {!isInitialLoad && filteredProducts.length > 0 && (
              <p className="text-sm text-gray-500 mb-3">
                <span className="font-medium text-gray-800">{filteredProducts.length}</span> ürün listeleniyor
              </p>
            )}

            {/* Products Grid */}
            {isInitialLoad ? (
              <div className={PRODUCTS_GRID_CLASS}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl">
                <EmptyState
                  icon={search || selectedCategory ? 'search' : 'products'}
                  title={search || selectedCategory ? 'Ürün Bulunamadı' : 'Henüz Ürün Yok'}
                  description={
                    search || selectedCategory
                      ? 'Arama kriterlerinize uygun ürün bulunamadı. Filtreleri değiştirerek tekrar deneyin.'
                      : 'Ürünler senkronize edildiğinde burada görüntülenecektir.'
                  }
                  actionLabel={search || selectedCategory ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory ? () => { setSearch(''); setSelectedCategory(''); } : undefined}
                />
              </div>
            ) : (
              <div className="relative">
                {/* Loading Overlay */}
                {isSearching && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 rounded-xl flex items-start justify-center pt-6">
                    <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Aranıyor…
                    </div>
                  </div>
                )}

                <div className={PRODUCTS_GRID_CLASS}>
                  {filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
                    const selectedPriceType = allowedPriceTypes.includes(quickAddPriceTypes[product.id])
                      ? quickAddPriceTypes[product.id]
                      : defaultPriceType;
                    const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
                    const hasAgreement = Boolean(product.agreement);
                    const excessInvoiced = resolveValidExcessPrice(
                      product.prices.invoiced,
                      product.excessPrices?.invoiced
                    );
                    const excessWhite = resolveValidExcessPrice(
                      product.prices.white,
                      product.excessPrices?.white
                    );
                    const showExcessPricing =
                      !hasAgreement &&
                      product.excessStock > 0 &&
                      (excessInvoiced !== undefined || excessWhite !== undefined);
                    const selectedExcessPrice = showExcessPricing
                      ? (selectedPriceType === 'INVOICED' ? excessInvoiced : excessWhite)
                      : undefined;
                    const selectedExcessDiscount = showExcessPricing && selectedExcessPrice
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
                    const displaySelectedExcessPrice = selectedExcessPrice !== undefined
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
                    const displayExcessInvoiced = excessInvoiced !== undefined
                      ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
                      : undefined;
                    const displayExcessWhite = excessWhite !== undefined
                      ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
                      : undefined;
                    const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                    const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);

                    return (
                      <div
                        key={product.id}
                        className="group bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col hover:border-primary-300 hover:shadow-md transition-all duration-200"
                      >
                        {/* Image */}
                        <Link
                          href={`/products/${product.id}`}
                          target="_blank"
                          rel="noreferrer"
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
                          <span className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                            {getDisplayStock(product)} {product.unit}
                          </span>

                          {/* Excess stock badge */}
                          {product.excessStock > 0 && (
                            <span className="absolute bottom-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                              İndirimli · {product.excessStock} {product.unit}
                            </span>
                          )}

                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white text-primary-700 text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md border border-primary-100">
                              Detay →
                            </span>
                          </div>
                        </Link>

                        {/* Info */}
                        <div className="px-3 pt-3 pb-1 flex-1 flex flex-col gap-1">
                          <Link
                            href={`/products/${product.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-gray-900 leading-snug hover:text-primary-600 transition-colors line-clamp-2"
                          >
                            {product.name}
                          </Link>

                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-gray-400 font-mono">{product.mikroCode}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{product.category.name}</span>
                          </div>

                          {unitLabel && (
                            <span className="text-[11px] text-gray-500">{unitLabel}</span>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">KDV: %{vatPercent}</span>
                            {hasAgreement && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                                Anlaşma: min {product.agreement?.minQuantity ?? 1} {product.unit}
                              </span>
                            )}
                          </div>
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

                        {/* Quantity & Add to Cart */}
                        <div className="px-3 pb-3 flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={quickAddQuantities[product.id] || 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              if (value === '' || parseInt(value) === 0) return;
                              const numValue = Math.max(1, parseInt(value));
                              setQuickAddQuantities({ ...quickAddQuantities, [product.id]: numValue });
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || parseInt(e.target.value) === 0) {
                                setQuickAddQuantities({ ...quickAddQuantities, [product.id]: 1 });
                              }
                            }}
                            className="w-14 text-center font-semibold text-sm h-9 border border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
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
              </div>
            )}
          </div>

          {/* ── RIGHT: Cart Sidebar ────────────────────────────────── */}
          <aside className="hidden w-72 flex-shrink-0 xl:block 2xl:w-80">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col">
              {/* Header */}
              <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-800">Sepet</h3>
                </div>
                {totalItems > 0 && (
                  <span className="bg-primary-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
                    {totalItems}
                  </span>
                )}
              </div>

              {!cartItems || cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <p className="text-sm text-gray-400 font-medium">Sepetiniz boş</p>
                  <p className="text-xs text-gray-300 mt-1">Ürün ekleyerek başlayın</p>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  {/* Clear cart */}
                  <div className="px-3 pt-2">
                    <button
                      onClick={async () => {
                        const confirmed = await new Promise((resolve) => {
                          toast((t) => (
                            <div className="flex flex-col gap-3">
                              <p className="font-medium text-sm">Tüm ürünleri sepetten çıkarmak istediğinizden emin misiniz?</p>
                              <div className="flex gap-2 justify-end">
                                <button
                                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                  onClick={() => { toast.dismiss(t.id); resolve(false); }}
                                >İptal</button>
                                <button
                                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                  onClick={() => { toast.dismiss(t.id); resolve(true); }}
                                >Temizle</button>
                              </div>
                            </div>
                          ), { duration: Infinity });
                        });
                        if (confirmed) {
                          for (const item of cartItems) {
                            await removeItem(item.id);
                          }
                          toast.success('Sepet temizlendi');
                        }
                      }}
                      className="w-full text-xs text-red-500 hover:text-red-700 hover:bg-red-50 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Sepeti temizle
                    </button>
                  </div>

                  {/* Cart items */}
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                    {(cartItems || []).map((item) => (
                      <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <span className="text-xs font-semibold text-gray-900 leading-snug flex-1 line-clamp-2">
                            {item.product.name}
                          </span>
                          <button
                            onClick={async () => {
                              const confirmed = await new Promise((resolve) => {
                                toast((t) => (
                                  <div className="flex flex-col gap-3">
                                    <p className="font-medium text-sm">Bu ürünü sepetten çıkarmak istediğinizden emin misiniz?</p>
                                    <div className="flex gap-2 justify-end">
                                      <button className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => { toast.dismiss(t.id); resolve(false); }}>İptal</button>
                                      <button className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700" onClick={() => { toast.dismiss(t.id); resolve(true); }}>Sil</button>
                                    </div>
                                  </div>
                                ), { duration: Infinity });
                              });
                              if (confirmed) {
                                await removeItem(item.id);
                                toast.success('Ürün sepetten çıkarıldı');
                              }
                            }}
                            className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-gray-500">{item.quantity} ×</span>
                            <span className="text-[11px] text-gray-500">{formatCurrency(item.unitPrice)}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              item.priceType === 'INVOICED'
                                ? 'bg-primary-100 text-primary-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}>
                              {item.priceType === 'INVOICED' ? 'F' : 'B'}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-900">
                            {formatCurrency(item.quantity * item.unitPrice)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t border-gray-100 px-3 py-3 space-y-2">
                    {invoicedTotal > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">Faturalı Toplam</span>
                        <span className="font-semibold text-primary-700">{formatCurrency(invoicedTotal)}</span>
                      </div>
                    )}
                    {whiteTotal > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">Beyaz Toplam</span>
                        <span className="font-semibold text-gray-800">{formatCurrency(whiteTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                      <span className="text-sm font-semibold text-gray-800">Genel Toplam</span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(invoicedTotal + whiteTotal)}</span>
                    </div>

                    <Button
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm py-2.5 rounded-lg mt-1 transition-colors"
                      onClick={() => router.push('/cart')}
                    >
                      Sepete Git
                      <svg className="w-4 h-4 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
