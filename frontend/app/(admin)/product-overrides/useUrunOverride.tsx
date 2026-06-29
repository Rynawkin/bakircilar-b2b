'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { getCustomerTypeName, CUSTOMER_TYPES } from '@/lib/utils/customerTypes';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

// Re-export: Classic/New JSX'lerin tip ihtiyaci icin
export interface Product {
  id: string;
  name: string;
  mikroCode: string;
  unit: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  excessStock: number;
  prices: any;
  category: { id: string; name: string };
  imageUrl?: string | null;
  isFeatured?: boolean;
  featuredOrder?: number;
  excludeFromDiscount?: boolean;
}

/**
 * Urun Override (Vitrin Kontrolleri) ekraninin TUM mantigi
 * (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useUrunOverride() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [overrideMargins, setOverrideMargins] = useState<Record<string, string>>({
    BAYI: '',
    PERAKENDE: '',
    VIP: '',
    OZEL: ''
  });
  const [searchInput, setSearchInput] = useState('');
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [featuredOrderInput, setFeaturedOrderInput] = useState('');

  const handleToggleFlag = async (flag: 'isFeatured' | 'excludeFromDiscount', value: boolean) => {
    if (!selectedProduct) return;
    setIsSaving(flag);
    try {
      await adminApi.setProductFlags(selectedProduct.id, { [flag]: value });
      setProducts((prev) => prev.map((p) => (p.id === selectedProduct.id ? { ...p, [flag]: value } : p)));
      setSelectedProduct((prev) => (prev ? { ...prev, [flag]: value } : prev));
      toast.success('Güncellendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncellenemedi');
    } finally {
      setIsSaving(null);
    }
  };

  const handleSaveFeaturedOrder = async () => {
    if (!selectedProduct) return;
    const n = parseInt(featuredOrderInput || '0', 10);
    const order = Number.isFinite(n) ? n : 0;
    setIsSaving('featuredOrder');
    try {
      await adminApi.setProductFlags(selectedProduct.id, { featuredOrder: order });
      setProducts((prev) => prev.map((p) => (p.id === selectedProduct.id ? { ...p, featuredOrder: order } : p)));
      setSelectedProduct((prev) => (prev ? { ...prev, featuredOrder: order } : prev));
      toast.success('Sıra güncellendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncellenemedi');
    } finally {
      setIsSaving(null);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const { products } = await adminApi.getProducts();
      setProducts(products);
    } catch (error) {
      console.error('Products fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetOverride = async (customerType: string) => {
    if (!selectedProduct || !overrideMargins[customerType]) {
      toast.error('Lütfen kar marjı girin');
      return;
    }

    setIsSaving(customerType);
    try {
      await adminApi.setProductPriceOverride({
        productId: selectedProduct.id,
        customerType,
        profitMargin: parseFloat(overrideMargins[customerType]) / 100,
      });
      toast.success(`${selectedProduct.name} için ${getCustomerTypeName(customerType)} kar marjı güncellendi! ✅`);
      setOverrideMargins({ ...overrideMargins, [customerType]: '' });

      // 10.2: Backend override sonrası fiyatı aninda yeniden hesapliyor;
      // listeyi tazeleyip secili urunun guncel fiyatlarini ekranda goster.
      try {
        const { products: refreshed } = await adminApi.getProducts();
        setProducts(refreshed);
        const updated = refreshed.find((p: Product) => p.id === selectedProduct.id);
        if (updated) {
          setSelectedProduct((prev) => (prev ? { ...prev, prices: updated.prices } : prev));
        }
      } catch (refreshError) {
        console.error('Fiyat tazeleme hatasi:', refreshError);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncelleme başarısız');
    } finally {
      setIsSaving(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedProduct || !e.target.files || !e.target.files[0]) {
      return;
    }

    const file = e.target.files[0];

    // File validation
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen sadece resim dosyası yükleyin');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB\'dan küçük olmalıdır');
      return;
    }

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await adminApi.uploadProductImage(selectedProduct.id, formData);
      toast.success('Fotoğraf başarıyla yüklendi! 📷');

      // Update local state
      setProducts(products.map(p =>
        p.id === selectedProduct.id
          ? { ...p, imageUrl: response.imageUrl }
          : p
      ));
      setSelectedProduct({ ...selectedProduct, imageUrl: response.imageUrl });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fotoğraf yüklenemedi');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!selectedProduct || !selectedProduct.imageUrl) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Ürün fotoğrafını silmek istediğinizden emin misiniz?</p>
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
      try {
        await adminApi.deleteProductImage(selectedProduct.id);
        toast.success('Fotoğraf silindi');

        // Update local state
        setProducts(products.map(p =>
          p.id === selectedProduct.id
            ? { ...p, imageUrl: null }
            : p
        ));
        setSelectedProduct({ ...selectedProduct, imageUrl: null });
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Fotoğraf silinemedi');
      }
    }
  };

  const filteredProducts = products.filter((product) => {
    const tokens = buildSearchTokens(searchInput);
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText(`${product.name} ${product.mikroCode}`);
    return matchesSearchTokens(haystack, tokens);
  });

  return {
    // veri / yuklenme
    products,
    setProducts,
    isLoading,
    // secili urun
    selectedProduct,
    setSelectedProduct,
    // override marjlari
    overrideMargins,
    setOverrideMargins,
    // arama
    searchInput,
    setSearchInput,
    // kaydetme / yukleme durumlari
    isSaving,
    uploadingImage,
    // one cikan sira inputu
    featuredOrderInput,
    setFeaturedOrderInput,
    // handler'lar
    handleToggleFlag,
    handleSaveFeaturedOrder,
    handleSetOverride,
    handleImageUpload,
    handleDeleteImage,
    // turetilmis
    filteredProducts,
    // sabitler / yardimcilar (JSX kullanir)
    CUSTOMER_TYPES,
  };
}

export default useUrunOverride;
