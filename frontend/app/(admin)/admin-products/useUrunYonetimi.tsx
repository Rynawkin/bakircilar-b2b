'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { useDebounce } from '@/lib/hooks/useDebounce';

export interface Product {
  id: string;
  name: string;
  mikroCode: string;
  unit: string;
  unit2?: string | null;
  unit2Factor?: number | null;
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
  mikroPriceLists?: Record<string, number>;
  imageUrl: string | null;
  imageChecksum?: string | null;
  imageSyncStatus?: string | null;
  imageSyncErrorType?: string | null;
  imageSyncErrorMessage?: string | null;
  imageSyncUpdatedAt?: string | null;
  imageSizeBytes?: number | null;
  imageUploadedAt?: string | null;
  imageUploadedById?: string | null;
  imageUploadedByName?: string | null;
  hiddenFromCustomers: boolean;
  category: {
    id: string;
    name: string;
  };
}

export interface Category {
  id: string;
  name: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Stats {
  total: number;
  withImage: number;
  withoutImage: number;
}

/**
 * Urun Yonetimi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useUrunYonetimi() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({ total: 0, withImage: 0, withoutImage: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [brand, setBrand] = useState('');
  const debouncedBrand = useDebounce(brand, 300);
  const [hasImage, setHasImage] = useState<'all' | 'true' | 'false'>('all');
  const [hasStock, setHasStock] = useState<'all' | 'true' | 'false'>('all');
  const [imageSyncErrorType, setImageSyncErrorType] = useState<'all' | 'NO_IMAGE' | 'NO_GUID' | 'IMAGE_TOO_LARGE' | 'IMAGE_DOWNLOAD_ERROR' | 'IMAGE_PROCESS_ERROR' | 'NO_SERVICE'>('all');
  const [categoryId, setCategoryId] = useState<string>('');
  const [priceListStatus, setPriceListStatus] = useState<'all' | 'missing' | 'available'>('all');
  const [customerVisibility, setCustomerVisibility] = useState<'all' | 'visible' | 'hidden'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'mikroCode' | 'excessStock' | 'totalStock' | 'lastEntryDate' | 'currentCost' | 'imageSyncErrorType' | 'imageSyncUpdatedAt' | 'imageUploadedAt' | 'imageSizeBytes'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Detail Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageDeleting, setIsImageDeleting] = useState(false);
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(data.categories);
    } catch (error) {
      console.error('Kategoriler yüklenemedi:', error);
    }
  }, []);

  const fetchProducts = useCallback(async (page: number = 1) => {
    setIsSearching(true);
    try {
      const params: any = {
        page,
        limit: itemsPerPage,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedBrand) params.brand = debouncedBrand;
      if (hasImage !== 'all') params.hasImage = hasImage;
      if (hasStock !== 'all') params.hasStock = hasStock;
      if (imageSyncErrorType !== 'all') params.imageSyncErrorType = imageSyncErrorType;
      if (categoryId) params.categoryId = categoryId;
      if (priceListStatus !== 'all') params.priceListStatus = priceListStatus;
      if (customerVisibility === 'visible') params.hiddenFromCustomers = 'false';
      if (customerVisibility === 'hidden') params.hiddenFromCustomers = 'true';
      params.sortBy = sortBy;
      params.sortOrder = sortOrder;

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Admin Products Search Params:', params);
      }

      const data = await adminApi.getProducts(params);
      setProducts(data.products);
      if (data.pagination) {
        setPagination(data.pagination);
        setCurrentPage(data.pagination.page ?? page);
      } else {
        setCurrentPage(page);
      }
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Ürünler yüklenemedi:', error);
      toast.error('Ürünler yüklenemedi');
    } finally {
      setIsSearching(false);
      setIsInitialLoad(false);
    }
  }, [debouncedSearch, debouncedBrand, hasImage, hasStock, imageSyncErrorType, categoryId, priceListStatus, customerVisibility, sortBy, sortOrder]);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchProducts(1), fetchCategories()]);
  }, [fetchProducts, fetchCategories]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:products')) {
      router.push('/dashboard');
      return;
    }

    fetchData();
  }, [user, permissionsLoading, router, fetchData, hasPermission]);

  useEffect(() => {
    if (hasPermission('admin:products')) {
      setCurrentPage(1); // Reset page when filters change
      fetchProducts(1);
    }
  }, [debouncedSearch, debouncedBrand, hasImage, hasStock, imageSyncErrorType, categoryId, priceListStatus, customerVisibility, sortBy, sortOrder, hasPermission, fetchProducts]);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // For displaying current page products (backend already paginated)
  const currentProducts = products;
  const currentPageIds = currentProducts.map((product) => product.id);
  const allSelectedOnPage = currentPageIds.length > 0 && currentPageIds.every((id) => selectedProductIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelectedProductIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
      return;
    }

    setSelectedProductIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const handleBulkImageSync = async () => {
    if (selectedProductIds.length === 0) {
      toast.error('Secili urun bulunamadi');
      return;
    }

    setIsBulkSyncing(true);
    try {
      await adminApi.triggerSelectedImageSync(selectedProductIds);
      toast.success('Secili urunler icin resim senkronu baslatildi');
    } catch (error) {
      console.error('Secili resim senkronu baslatilamadi:', error);
      toast.error('Resim senkronu baslatilamadi');
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const handleCustomerVisibilityToggle = async (product: Product) => {
    const nextHidden = !product.hiddenFromCustomers;
    setVisibilityUpdatingId(product.id);
    try {
      const response = await adminApi.updateProductCustomerVisibility(product.id, nextHidden);
      updateProductState(product.id, {
        hiddenFromCustomers: response.product?.hiddenFromCustomers ?? nextHidden,
      });
      toast.success(response.message || (nextHidden ? 'Urun musteriye gizlendi' : 'Urun musteriye acildi'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Musteri gorunurlugu guncellenemedi');
    } finally {
      setVisibilityUpdatingId(null);
    }
  };

  const updateProductState = useCallback((productId: string, updates: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((product) => (product.id === productId ? { ...product, ...updates } : product))
    );
    setSelectedProduct((prev) => (prev && prev.id === productId ? { ...prev, ...updates } : prev));
  }, []);

  const handleImageUpload = async (productId: string, file: File) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Lutfen sadece resim dosyasi yukleyin');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB altinda olmali');
      return;
    }

    setIsImageUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await adminApi.uploadProductImage(productId, formData);
      updateProductState(productId, {
        imageUrl: response.imageUrl,
        imageChecksum: response.imageChecksum ?? null,
        imageSyncStatus: 'SUCCESS',
        imageSyncErrorType: null,
        imageSyncErrorMessage: null,
        imageSyncUpdatedAt: response.imageSyncUpdatedAt ?? new Date().toISOString(),
      });
      toast.success('Fotograf yuklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fotograf yuklenemedi');
    } finally {
      setIsImageUploading(false);
    }
  };

  const handleImageDelete = async (productId: string) => {
    const confirmed = window.confirm('Urun fotografini silmek istiyor musunuz?');
    if (!confirmed) {
      return;
    }

    setIsImageDeleting(true);
    try {
      await adminApi.deleteProductImage(productId);
      updateProductState(productId, {
        imageUrl: null,
        imageChecksum: null,
        imageSyncStatus: null,
        imageSyncErrorType: null,
        imageSyncErrorMessage: null,
        imageSyncUpdatedAt: new Date().toISOString(),
      });
      toast.success('Fotograf silindi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fotograf silinemedi');
    } finally {
      setIsImageDeleting(false);
    }
  };

  const getImageSyncErrorLabel = (value?: string | null) => {
    switch (value) {
      case 'NO_IMAGE':
        return 'Mikro resim yok';
      case 'NO_GUID':
        return 'GUID yok';
      case 'IMAGE_TOO_LARGE':
        return 'Resim cok buyuk';
      case 'IMAGE_DOWNLOAD_ERROR':
        return 'Indirme hatasi';
      case 'IMAGE_PROCESS_ERROR':
        return 'Isleme hatasi';
      case 'NO_SERVICE':
        return 'Mock/No Service';
      default:
        return '';
    }
  };

  return {
    // router / user / permissions
    router,
    user,
    hasPermission,
    permissionsLoading,
    // data
    products,
    categories,
    isInitialLoad,
    isSearching,
    pagination,
    stats,
    // filters
    search,
    setSearch,
    debouncedSearch,
    brand,
    setBrand,
    debouncedBrand,
    hasImage,
    setHasImage,
    hasStock,
    setHasStock,
    imageSyncErrorType,
    setImageSyncErrorType,
    categoryId,
    setCategoryId,
    priceListStatus,
    setPriceListStatus,
    customerVisibility,
    setCustomerVisibility,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    // pagination
    currentPage,
    setCurrentPage,
    itemsPerPage,
    // detail modal
    selectedProduct,
    setSelectedProduct,
    isModalOpen,
    setIsModalOpen,
    // selection / bulk
    selectedProductIds,
    setSelectedProductIds,
    isBulkSyncing,
    isImageUploading,
    isImageDeleting,
    visibilityUpdatingId,
    // fetch
    fetchCategories,
    fetchProducts,
    fetchData,
    // sort / select / handlers
    handleSort,
    currentProducts,
    currentPageIds,
    allSelectedOnPage,
    toggleSelectAll,
    toggleProductSelection,
    handleBulkImageSync,
    handleCustomerVisibilityToggle,
    updateProductState,
    handleImageUpload,
    handleImageDelete,
    getImageSyncErrorLabel,
    // util (JSX'te kullanilir)
    getUnitConversionLabel,
  };
}

export default useUrunYonetimi;
