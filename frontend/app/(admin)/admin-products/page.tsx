'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { LogoLink } from '@/components/ui/Logo';
import { ProductDetailModal } from '@/components/admin/ProductDetailModal';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface Product {
  id: string;
  name: string;
  mikroCode: string;
  unit: string;
  excessStock: number;
  totalStock: number;
  warehouseStocks: Record<string, number>;
  warehouseExcessStocks: Record<string, number>;
  lastEntryPrice: number | null;
  lastEntryDate: string | null;
  currentCost: number | null;
  currentCostDate: string | null;
  calculatedCost: number | null;
  vatRate: number;
  prices: any;
  imageUrl: string | null;
  category: {
    id: string;
    name: string;
  };
}

interface Category {
  id: string;
  name: string;
}

export default function AdminProductsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 800);
  const [hasImage, setHasImage] = useState<'all' | 'true' | 'false'>('all');
  const [categoryId, setCategoryId] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'mikroCode' | 'excessStock' | 'lastEntryDate' | 'currentCost'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Detail Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null) return;
    if (user.role !== 'ADMIN') {
      router.push('/login');
      return;
    }

    fetchData();
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchProducts();
    }
  }, [debouncedSearch, hasImage, categoryId, sortBy, sortOrder, user]);

  const fetchData = async () => {
    await Promise.all([fetchProducts(), fetchCategories()]);
  };

  const fetchProducts = async () => {
    setIsSearching(true);
    try {
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (hasImage !== 'all') params.hasImage = hasImage;
      if (categoryId) params.categoryId = categoryId;
      params.sortBy = sortBy;
      params.sortOrder = sortOrder;

      const data = await adminApi.getProducts(params);
      setProducts(data.products);
      setCurrentPage(1); // Reset to first page on filter change
    } catch (error) {
      console.error('Ürünler yüklenemedi:', error);
      toast.error('Ürünler yüklenemedi');
    } finally {
      setIsSearching(false);
      setIsInitialLoad(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(data.categories);
    } catch (error) {
      console.error('Kategoriler yüklenemedi:', error);
    }
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Pagination
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = products.slice(startIndex, endIndex);

  if (!user || isInitialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">📦 Ürün Yönetimi</h1>
                <p className="text-sm text-primary-100">Tüm ürünleri görüntüle ve yönet</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
              <Button
                variant="ghost"
                onClick={() => { logout(); router.push('/login'); }}
                className="text-white hover:bg-primary-800"
              >
                Çıkış
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {/* Filters */}
        <Card className="mb-6 shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-10 h-10 flex items-center justify-center text-xl">
                🔍
              </div>
              <h2 className="text-lg font-bold text-gray-900">Filtreleme ve Arama</h2>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ürün Ara (İsim veya Kod)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı veya mikro kodu..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Image Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fotoğraf Durumu
                </label>
                <select
                  value={hasImage}
                  onChange={(e) => setHasImage(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">Tümü</option>
                  <option value="true">Fotoğrafı Olanlar</option>
                  <option value="false">Fotoğrafı Olmayanlar</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Tüm Kategoriler</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sıralama
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="name">İsim</option>
                    <option value="mikroCode">Mikro Kod</option>
                    <option value="excessStock">Fazla Stok</option>
                    <option value="lastEntryDate">Son Giriş Tarihi</option>
                    <option value="currentCost">Güncel Maliyet</option>
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-4"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 pt-3 border-t border-gray-200 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Toplam:</span>
                <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full font-bold">
                  {products.length} ürün
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Fotoğraflı:</span>
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">
                  {products.filter(p => p.imageUrl).length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Fotoğrafsız:</span>
                <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-bold">
                  {products.filter(p => !p.imageUrl).length}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Products Table */}
        <Card className="shadow-lg overflow-hidden">
          <div className="relative">
            {/* Loading Overlay */}
            {isSearching && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 rounded-lg flex items-start justify-center pt-8">
                <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-sm">Aranıyor...</span>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Fotoğraf
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Ürün Adı
                      {sortBy === 'name' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('mikroCode')}
                  >
                    <div className="flex items-center gap-1">
                      Mikro Kod
                      {sortBy === 'mikroCode' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('excessStock')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Fazla Stok
                      {sortBy === 'excessStock' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Toplam Stok
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('currentCost')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Hesaplanan Maliyet
                      {sortBy === 'currentCost' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('lastEntryDate')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Son Giriş
                      {sortBy === 'lastEntryDate' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Ürün bulunamadı
                    </td>
                  </tr>
                ) : (
                  currentProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {product.imageUrl ? (
                          <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-2xl">
                            📦
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-500">{product.unit}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-gray-700">{product.mikroCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{product.category.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.excessStock > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                            {product.excessStock}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-700">{product.totalStock}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.calculatedCost ? (
                          <div>
                            <div className="font-semibold text-gray-900">
                              {formatCurrency(product.calculatedCost)}
                            </div>
                            <div className="text-xs text-gray-500">
                              KDV: %{(product.vatRate * 100).toFixed(0)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {product.lastEntryDate ? (
                          <div>
                            <div className="text-sm text-gray-700">
                              {formatDate(product.lastEntryDate)}
                            </div>
                            {product.lastEntryPrice && (
                              <div className="text-xs text-gray-500">
                                {formatCurrency(product.lastEntryPrice)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          📋 Detay
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="text-sm text-gray-600">
                Sayfa {currentPage} / {totalPages} ({products.length} ürün)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  size="sm"
                >
                  ← Önceki
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  size="sm"
                >
                  Sonraki →
                </Button>
              </div>
            </div>
          )}
          </div>
        </Card>
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={selectedProduct}
      />
    </div>
  );
}
