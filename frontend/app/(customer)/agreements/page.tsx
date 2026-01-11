'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductDetailModal } from '@/components/customer/ProductDetailModal';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

export default function AgreementProductsPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const { fetchCart, addToCart } = useCartStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });

  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITH_VAT';
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const defaultFilterPriceType = defaultPriceType === 'INVOICED' ? 'invoiced' : 'white';
  const allowedFilterPriceTypes = allowedPriceTypes.map((type) => type === 'INVOICED' ? 'invoiced' : 'white');
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
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setIsSearching(true);
    try {
      const searchParams = {
        categoryId: selectedCategory || undefined,
        search: debouncedSearch || undefined,
        warehouse: selectedWarehouse || undefined,
        mode: 'agreements' as const,
      };

      const productsData = await customerApi.getProducts(searchParams);
      setProducts(productsData.products);
    } catch (error) {
      console.error('Product fetch error:', error);
    } finally {
      setIsSearching(false);
      setIsLoading(false);
    }
  }, [selectedCategory, debouncedSearch, selectedWarehouse]);

  useEffect(() => {
    if (categories.length > 0 && warehouses.length > 0) {
      fetchProducts();
    }
  }, [selectedCategory, debouncedSearch, selectedWarehouse, categories, warehouses, fetchProducts]);

  const filteredProducts = useMemo(() => {
    return applyProductFilters(products, advancedFilters);
  }, [products, advancedFilters]);

  const getDiscountPercent = (listPrice?: number, salePrice?: number) => {
    if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
    const discount = Math.round(((listPrice - salePrice) / listPrice) * 100);
    return discount > 0 ? discount : null;
  };

  const handleQuickAdd = async (productId: string) => {
    const quantity = quickAddQuantities[productId] || 1;
    const requestedPriceType = quickAddPriceTypes[productId] || defaultPriceType;
    const priceType = allowedPriceTypes.includes(requestedPriceType)
      ? requestedPriceType
      : defaultPriceType;

    setAddingToCart({ ...addingToCart, [productId]: true });
    try {
      await addToCart({
        productId,
        quantity,
        priceType,
        priceMode: 'LIST',
      });
      setQuickAddQuantities({ ...quickAddQuantities, [productId]: 1 });
      toast.success('Urun sepete eklendi');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
    } finally {
      setAddingToCart({ ...addingToCart, [productId]: false });
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="container-custom py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Anlasmali Urunler</h1>
        <p className="text-sm text-gray-600">Sadece anlasma kapsamindaki urunleri goruntulersiniz.</p>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Urun Ara</label>
            <Input
              placeholder="Urun adi veya kodu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Depo</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="input w-full"
            >
              <option value="">Tum Depolar</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>{warehouse}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input w-full"
            >
              <option value="">Tum Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="mb-6">
        <AdvancedFilters
          onFilterChange={(filters) => setAdvancedFilters(filters)}
          onReset={() => setAdvancedFilters({ sortBy: 'none', priceType: defaultFilterPriceType })}
          allowedPriceTypes={allowedFilterPriceTypes}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-sm text-gray-600">
            Anlasmali urun bulunamadi.
          </div>
        </Card>
      ) : (
        <div className="relative">
          {isSearching && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 rounded-lg flex items-start justify-center pt-4">
              <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="font-medium text-sm">Araniyor...</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                            const selectedPriceType = allowedPriceTypes.includes(quickAddPriceTypes[product.id])
                ? quickAddPriceTypes[product.id]
                : defaultPriceType;
              const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
              const hasAgreement = Boolean(product.agreement);
              const showExcessPricing = !hasAgreement && Boolean(product.excessPrices) && product.excessStock > 0;
              const selectedExcessPrice = showExcessPricing
                ? (selectedPriceType === 'INVOICED' ? product.excessPrices?.invoiced : product.excessPrices?.white)
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
                  const selectedVatLabel = getVatLabel(selectedPriceType, vatDisplayPreference);
                  const invoicedVatLabel = getVatLabel('INVOICED', vatDisplayPreference);
  return (
                <Card key={product.id} className="p-4 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Gorsel yok</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <button
                        className="text-left font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                        onClick={() => openProductModal(product)}
                      >
                        {product.name}
                      </button>
                      <div className="text-xs text-gray-500 font-mono mt-1">Kod: {product.mikroCode}</div>
                      <div className="text-xs text-gray-500 mt-1">Kategori: {product.category.name}</div>
                      {unitLabel && <div className="text-xs text-gray-400 mt-1">{unitLabel}</div>}
                      {product.agreement && (
                        <div className="mt-2 text-[11px] bg-blue-50 text-blue-800 inline-flex px-2 py-1 rounded">
                          Anlasma: min {product.agreement.minQuantity} {product.unit}
                        </div>
                      )}
                    </div>
                  </div>

                  {showPriceTypeSelector ? (
                    <div className="grid grid-cols-2 gap-2">
                      {allowedPriceTypes.includes('INVOICED') && (
                        <button
                          className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold ${selectedPriceType === 'INVOICED'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-700 hover:border-primary-300'}`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'INVOICED' })}
                        >
                          <div>Faturali</div>
                          <div className="font-bold">{formatCurrency(displayInvoicedPrice)}</div>
                          <div className="text-[10px] opacity-70 mt-1">{invoicedVatLabel}</div>
                        </button>
                      )}
                      {allowedPriceTypes.includes('WHITE') && (
                        <button
                          className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold ${selectedPriceType === 'WHITE'
                            ? 'border-gray-700 bg-gray-100 text-gray-800'
                            : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'WHITE' })}
                        >
                          <div>Beyaz</div>
                          <div className="font-bold">{formatCurrency(displayWhitePrice)}</div>
                          <div className="text-[10px] opacity-70 mt-1">{getVatLabel('WHITE', vatDisplayPreference)}</div>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                      <div>{selectedPriceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}</div>
                      <div className="font-bold">{formatCurrency(displaySelectedPrice)}</div>
                      {showExcessPricing && displaySelectedExcessPrice !== undefined && (
                        <div className="text-[10px] text-green-700 font-semibold">
                          Fazla: {formatCurrency(displaySelectedExcessPrice)}
                          {selectedExcessDiscount && <span> (-%{selectedExcessDiscount})</span>}
                        </div>
                      )}
                      <div className="text-[10px] opacity-70 mt-1">{selectedVatLabel}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quickAddQuantities[product.id] || 1}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        if (value === '' || parseInt(value) === 0) return;
                        const maxQty = product.maxOrderQuantity ?? product.availableStock ?? product.excessStock ?? 0;
                        const numValue = Math.max(1, Math.min(maxQty, parseInt(value)));
                        setQuickAddQuantities({ ...quickAddQuantities, [product.id]: numValue });
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseInt(e.target.value) === 0) {
                          setQuickAddQuantities({ ...quickAddQuantities, [product.id]: 1 });
                        }
                      }}
                      className="w-16 text-center font-bold text-sm h-10 px-2 border-2 border-gray-200 rounded-lg"
                    />
                    <span className="text-xs text-gray-500">{product.unit}</span>
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs h-10"
                      onClick={() => handleQuickAdd(product.id)}
                      isLoading={addingToCart[product.id]}
                    >
                      Sepete Ekle
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

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
