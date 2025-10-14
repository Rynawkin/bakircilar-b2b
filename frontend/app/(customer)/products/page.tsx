'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product, Category } from '@/types';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileMenu } from '@/components/ui/MobileMenu';
import { formatCurrency } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { LogoLink } from '@/components/ui/Logo';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import { ProductDetailModal } from '@/components/customer/ProductDetailModal';
import { AdvancedFilters, FilterState } from '@/components/customer/AdvancedFilters';
import { applyProductFilters } from '@/lib/utils/productFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';

export default function ProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const { cart, fetchCart, addToCart, removeItem } = useCartStore();

  const cartItems = cart?.items || [];

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: 'invoiced',
  });

  // Quick add states
  const [quickAddQuantities, setQuickAddQuantities] = useState<Record<string, number>>({});
  const [quickAddPriceTypes, setQuickAddPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Apply advanced filters to products
  const filteredProducts = useMemo(() => {
    return applyProductFilters(products, advancedFilters);
  }, [products, advancedFilters]);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
  }, [loadUserFromStorage, fetchCart]);

  useEffect(() => {
    fetchData();
  }, [selectedCategory, debouncedSearch, selectedWarehouse]);

  const fetchData = async () => {
    setIsSearching(true);
    try {
      const searchParams = {
        categoryId: selectedCategory || undefined,
        search: debouncedSearch || undefined,
        warehouse: selectedWarehouse || undefined,
      };

      console.log('🔍 Customer Products Search Params:', searchParams);
      console.log('📝 debouncedSearch value:', debouncedSearch);

      const [productsData, categoriesData, warehousesData] = await Promise.all([
        customerApi.getProducts(searchParams),
        customerApi.getCategories(),
        customerApi.getWarehouses(),
      ]);

      setProducts(productsData.products);
      setCategories(categoriesData.categories);
      setWarehouses(warehousesData.warehouses);
    } catch (error) {
      console.error('Veri yükleme hatası:', error);
    } finally {
      setIsSearching(false);
      setIsInitialLoad(false);
    }
  };

  const handleQuickAdd = async (productId: string) => {
    const quantity = quickAddQuantities[productId] || 1;
    const priceType = quickAddPriceTypes[productId] || 'INVOICED';

    setAddingToCart({ ...addingToCart, [productId]: true });

    try {
      await addToCart({
        productId,
        quantity,
        priceType,
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

  const handleModalAddToCart = async (productId: string, quantity: number, priceType: 'INVOICED' | 'WHITE') => {
    try {
      await addToCart({
        productId,
        quantity,
        priceType,
      });

      toast.success('Ürün sepete eklendi! 🛒', {
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Cart error:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Sepete eklenemedi';
      toast.error(errorMessage);
      throw error; // Re-throw so modal can handle it
    }
  };

  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  // Calculate cart totals
  const invoicedTotal = (cartItems || [])
    .filter(item => item.priceType === 'INVOICED')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const whiteTotal = (cartItems || [])
    .filter(item => item.priceType === 'WHITE')
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const totalItems = (cartItems || []).reduce((sum, item) => sum + item.quantity, 0);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-700 shadow-xl sticky top-0 z-10 border-b-4 border-primary-800">
        <div className="container-custom py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <LogoLink href="/products" variant="light" />
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🛍️</span>
                Urun Katalogu
              </h1>
              <p className="text-sm text-primary-100">
                {user.name} • {getCustomerTypeName(user.customerType || '')}
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push('/cart')}
              className="relative bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md"
            >
              🛒 Sepetim
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg animate-pulse">
                  {totalItems}
                </span>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push('/profile')}
              className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md"
            >
              👤 Profil
            </Button>
            <Button
              variant="ghost"
              onClick={() => { logout(); router.push('/login'); }}
              className="text-white hover:bg-primary-800 border border-white/30"
            >
              Cikis
            </Button>
          </div>

          {/* Mobile Menu */}
          <div className="flex items-center gap-2 lg:hidden">
            {totalItems > 0 && (
              <button
                onClick={() => router.push('/cart')}
                className="relative p-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                  {totalItems}
                </span>
              </button>
            )}
            <MobileMenu
              items={[
                { label: 'Ürünler', href: '/products', icon: '🛍️' },
                { label: 'Sepetim', href: '/cart', icon: '🛒' },
                { label: 'Siparişlerim', href: '/my-orders', icon: '📦' },
                { label: 'Profilim', href: '/profile', icon: '👤' },
                { label: 'Tercihler', href: '/preferences', icon: '⚙️' },
              ]}
              user={user}
              onLogout={() => { logout(); router.push('/login'); }}
            />
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main content */}
          <div className="lg:col-span-3">
            {/* Filters */}
            <Card className="mb-6 bg-white border-2 border-primary-100 shadow-xl">
              <div className="mb-4 pb-4 border-b-2 border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-xl">🔍</span>
                  Filtreler
                </h3>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <span>📝</span>
                    Urun Ara
                    {search !== debouncedSearch && (
                      <span className="ml-2 text-xs text-primary-600 font-normal">
                        (yazıyorsunuz...)
                      </span>
                    )}
                  </label>
                  <Input
                    placeholder="Urun ismi veya kodu..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg shadow-sm"
                  />
                </div>

                <div className="min-w-[150px]">
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <span>🏢</span>
                    Depo
                  </label>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="input w-full h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg shadow-sm"
                  >
                    <option value="">Tum Depolar</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse} value={warehouse}>
                        {warehouse}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[180px]">
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <span>📁</span>
                    Kategori
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="input w-full h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg shadow-sm"
                  >
                    <option value="">Tum Kategoriler</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(search || selectedWarehouse || selectedCategory) && (
                <div className="mt-4 pt-4 border-t-2 border-gray-100 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">Aktif filtreler:</span>
                  {search && (
                    <span className="bg-gradient-to-r from-primary-100 to-primary-200 text-primary-800 px-3 py-1.5 rounded-lg font-medium text-sm shadow-sm">
                      🔍 "{search}"
                    </span>
                  )}
                  {selectedWarehouse && (
                    <span className="bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 px-3 py-1.5 rounded-lg font-medium text-sm shadow-sm">
                      🏢 {selectedWarehouse}
                    </span>
                  )}
                  {selectedCategory && (
                    <span className="bg-gradient-to-r from-green-100 to-green-200 text-green-800 px-3 py-1.5 rounded-lg font-medium text-sm shadow-sm">
                      📁 {categories.find(c => c.id === selectedCategory)?.name}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedWarehouse('');
                      setSelectedCategory('');
                    }}
                    className="ml-auto bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
                  >
                    ✕ Temizle
                  </button>
                </div>
              )}
            </Card>

            {/* Advanced Filters */}
            <div className="mb-6">
              <AdvancedFilters
                onFilterChange={(filters) => setAdvancedFilters(filters)}
                onReset={() => {
                  setAdvancedFilters({
                    sortBy: 'none',
                    priceType: 'invoiced',
                  });
                }}
              />
            </div>

            {/* Products Grid with Loading Overlay */}
            {isInitialLoad ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={search || selectedCategory || selectedWarehouse ? 'search' : 'products'}
                  title={search || selectedCategory || selectedWarehouse ? 'Ürün Bulunamadı' : 'Henüz Fazla Stoklu Ürün Yok'}
                  description={
                    search || selectedCategory || selectedWarehouse
                      ? 'Arama kriterlerinize uygun ürün bulunamadı. Filtreleri değiştirerek tekrar deneyin.'
                      : 'Fazla stoklu ürün bulunduğunda burada görüntülenecektir.'
                  }
                  actionLabel={search || selectedCategory || selectedWarehouse ? 'Filtreleri Temizle' : undefined}
                  onAction={search || selectedCategory || selectedWarehouse ? () => {
                    setSearch('');
                    setSelectedCategory('');
                    setSelectedWarehouse('');
                  } : undefined}
                />
              </Card>
            ) : (
              <div className="relative">
                {/* Loading Overlay */}
                {isSearching && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 rounded-lg flex items-start justify-center pt-4">
                    <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-medium text-sm">Aranıyor...</span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="group hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden flex flex-col h-full p-0 border-2 border-gray-200 hover:border-primary-400 bg-white rounded-xl">
                    <div className="space-y-3 flex flex-col h-full">
                      {/* Product Image */}
                      <div
                        className="w-full h-40 bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 overflow-hidden relative cursor-pointer"
                        onClick={() => openProductModal(product)}
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* Stock badge */}
                        <div className="absolute top-2 right-2 bg-gradient-to-br from-green-500 to-green-600 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg">
                          {product.excessStock} {product.unit}
                        </div>
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white text-primary-700 px-4 py-2 rounded-lg font-semibold text-sm shadow-xl">
                            🔍 Detayli Incele
                          </div>
                        </div>
                      </div>

                      <div className="px-3 min-h-[60px]">
                        <h3
                          className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight cursor-pointer hover:text-primary-600 transition-colors mb-2"
                          onClick={() => openProductModal(product)}
                        >
                          {product.name}
                        </h3>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-500 font-mono">Kod: {product.mikroCode}</span>
                          <span className="bg-gradient-to-r from-primary-100 to-primary-200 text-primary-700 text-xs font-semibold px-2 py-0.5 rounded inline-block">
                            {product.category.name}
                          </span>
                        </div>
                      </div>

                      {/* Spacer to push buttons to bottom */}
                      <div className="flex-1"></div>

                      {/* Price Type Selection */}
                      <div className="px-3 grid grid-cols-2 gap-2">
                        <button
                          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all shadow-md ${
                            (quickAddPriceTypes[product.id] || 'INVOICED') === 'INVOICED'
                              ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white scale-105 shadow-lg'
                              : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200 hover:border-primary-300'
                          }`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'INVOICED' })}
                        >
                          <div className="opacity-80 mb-0.5">📄 Faturali</div>
                          <div className="font-bold text-sm">{formatCurrency(product.prices.invoiced)}</div>
                        </button>
                        <button
                          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all shadow-md ${
                            quickAddPriceTypes[product.id] === 'WHITE'
                              ? 'bg-gradient-to-br from-gray-700 to-gray-800 text-white scale-105 shadow-lg'
                              : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-400'
                          }`}
                          onClick={() => setQuickAddPriceTypes({ ...quickAddPriceTypes, [product.id]: 'WHITE' })}
                        >
                          <div className="opacity-80 mb-0.5">⚪ Beyaz</div>
                          <div className="font-bold text-sm">{formatCurrency(product.prices.white)}</div>
                        </button>
                      </div>

                      {/* Quantity & Add to Cart */}
                      <div className="px-3 pb-3 flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type="number"
                            min="1"
                            max={product.excessStock}
                            value={quickAddQuantities[product.id] || 1}
                            onChange={(e) => setQuickAddQuantities({
                              ...quickAddQuantities,
                              [product.id]: parseInt(e.target.value) || 1
                            })}
                            className="w-full text-center font-bold text-sm h-10 pr-10 border-2 border-gray-200 focus:border-primary-500 rounded-lg"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold">{product.unit}</span>
                        </div>
                        <Button
                          size="sm"
                          className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold text-xs h-10 px-3 rounded-lg shadow-md hover:shadow-lg transition-all"
                          onClick={() => handleQuickAdd(product.id)}
                          isLoading={addingToCart[product.id]}
                        >
                          🛒 Ekle
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              </div>
            )}
          </div>

          {/* Cart Preview Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 shadow-2xl bg-gradient-to-br from-white via-gray-50 to-white border-2 border-primary-100">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-100">
                <h3 className="font-bold text-xl flex items-center gap-2 text-gray-900">
                  <span className="text-2xl">🛒</span>
                  Sepet Ozeti
                </h3>
                {totalItems > 0 && (
                  <span className="bg-gradient-to-br from-primary-600 to-primary-700 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-md animate-pulse">
                    {totalItems} Urun
                  </span>
                )}
              </div>

              {!cartItems || cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-300 mb-3">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Sepetiniz boş</p>
                  <p className="text-xs text-gray-400 mt-1">Ürün ekleyerek başlayın</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Clear Cart Button */}
                  <button
                    onClick={async () => {
                      const confirmed = await new Promise((resolve) => {
                        toast((t) => (
                          <div className="flex flex-col gap-3">
                            <p className="font-medium">Tüm ürünleri sepetten çıkarmak istediğinizden emin misiniz?</p>
                            <div className="flex gap-2 justify-end">
                              <button
                                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                onClick={() => { toast.dismiss(t.id); resolve(false); }}
                              >
                                İptal
                              </button>
                              <button
                                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                onClick={() => { toast.dismiss(t.id); resolve(true); }}
                              >
                                Sepeti Temizle
                              </button>
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
                    className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50 py-2 rounded transition-colors"
                  >
                    🗑️ Sepeti Temizle
                  </button>

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {(cartItems || []).map((item) => (
                      <div key={item.id} className="text-sm bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-semibold text-gray-900 flex-1">{item.product.name}</div>
                          <button
                            onClick={async () => {
                              const confirmed = await new Promise((resolve) => {
                                toast((t) => (
                                  <div className="flex flex-col gap-3">
                                    <p className="font-medium">Bu ürünü sepetten çıkarmak istediğinizden emin misiniz?</p>
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                        onClick={() => { toast.dismiss(t.id); resolve(false); }}
                                      >
                                        İptal
                                      </button>
                                      <button
                                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                        onClick={() => { toast.dismiss(t.id); resolve(true); }}
                                      >
                                        Sil
                                      </button>
                                    </div>
                                  </div>
                                ), { duration: Infinity });
                              });

                              if (confirmed) {
                                await removeItem(item.id);
                                toast.success('Ürün sepetten çıkarıldı');
                              }
                            }}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                          <span className={`px-2 py-1 rounded font-medium ${
                            item.priceType === 'INVOICED'
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-200 text-gray-800'
                          }`}>
                            {item.priceType === 'INVOICED' ? '📄 Faturalı' : '⚪ Beyaz'}
                          </span>
                        </div>
                        <div className="text-right mt-1 font-bold text-primary-700">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t-2 border-gray-200 pt-4 space-y-3">
                    {invoicedTotal > 0 && (
                      <div className="flex justify-between text-sm bg-primary-50 px-3 py-2 rounded-lg">
                        <span className="text-primary-800 font-medium">📄 Faturalı Toplam:</span>
                        <span className="font-bold text-primary-700">{formatCurrency(invoicedTotal)}</span>
                      </div>
                    )}
                    {whiteTotal > 0 && (
                      <div className="flex justify-between text-sm bg-gray-100 px-3 py-2 rounded-lg">
                        <span className="text-gray-800 font-medium">⚪ Beyaz Toplam:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(whiteTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-3 rounded-lg shadow-lg">
                      <span>💰 Genel Toplam:</span>
                      <span>{formatCurrency(invoicedTotal + whiteTotal)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 shadow-lg"
                    onClick={() => router.push('/cart')}
                  >
                    🛒 Sepete Git ({totalItems} ürün)
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddToCart={handleModalAddToCart}
      />
    </div>
  );
}
