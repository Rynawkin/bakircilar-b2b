'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getCustomerTypeName, CUSTOMER_TYPES } from '@/lib/utils/customerTypes';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

interface Product {
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

export default function AdminProductOverridesPage() {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Urun Bazli Fiyatlandirma</h1>
            <p className="text-sm text-gray-600">Ozel urunler icin kar marji belirleyin</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ürün Listesi */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg">
              <div className="mb-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <span className="text-2xl">📦</span>
                  Ürün Listesi ({filteredProducts.length})
                </h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="🔍 Ürün ara (isim veya kod)..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="flex-1"
                  />
                  {searchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchInput('')}
                    >
                      Temizle
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">Ürün bulunamadı</p>
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    return (
                    <div
                      key={product.id}
                      className={`p-4 border-2 rounded-lg cursor-pointer hover:shadow-md transition-all ${
                        selectedProduct?.id === product.id
                          ? 'border-primary-600 bg-primary-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        setSelectedProduct(product);
                        setFeaturedOrderInput(String(product.featuredOrder ?? 0));
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{product.name}</h4>
                          <div className="flex gap-2 mt-2">
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              Kod: {product.mikroCode}
                            </span>
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded font-medium">
                              {product.category.name}
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-700 font-semibold">
                          {product.excessStock} {product.unit}
                        </Badge>
                      </div>
                      {unitLabel && (
                        <div className="mt-2 text-xs text-gray-500">{unitLabel}</div>
                      )}

                      {selectedProduct?.id === product.id && (
                        <div className="mt-3 pt-3 border-t border-primary-200">
                          <p className="text-xs font-semibold text-primary-700 mb-2">Mevcut Fiyatlar:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {CUSTOMER_TYPES.map((type) => (
                              <div key={type.value} className="bg-white border border-gray-200 p-2 rounded">
                                <div className="font-medium text-gray-700">{type.label}</div>
                                <div className="text-primary-700 font-bold">
                                  {product.prices && product.prices[type.value] ? formatCurrency(product.prices[type.value].INVOICED) : 'N/A'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Override Paneli */}
          <div className="lg:col-span-1">
            {selectedProduct ? (
              <Card className="shadow-lg sticky top-24 bg-gradient-to-br from-white to-gray-50">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-10 h-10 flex items-center justify-center text-lg">
                      ✏️
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Override Ayarla</h3>
                      <p className="text-xs text-gray-600">Özel kar marjı belirle</p>
                    </div>
                  </div>
                  <div className="bg-primary-100 border-l-4 border-primary-600 p-3 rounded mt-4">
                    <p className="text-sm font-semibold text-primary-900 mb-1">{selectedProduct.name}</p>
                    <p className="text-xs text-primary-700">Kod: {selectedProduct.mikroCode}</p>
                  </div>
                </div>

                {/* Product Image Upload */}
                <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">📷 Ürün Fotoğrafı</h4>
                  {selectedProduct.imageUrl ? (
                    <div className="space-y-3">
                      <div className="relative group bg-white rounded-lg border-2 border-gray-300 overflow-hidden aspect-square">
                        <img
                          src={`http://localhost:5000${selectedProduct.imageUrl}`}
                          alt={selectedProduct.name}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                          <button
                            onClick={handleDeleteImage}
                            className="opacity-0 group-hover:opacity-100 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
                          >
                            🗑️ Sil
                          </button>
                        </div>
                      </div>
                      <label className="block">
                        <span className="text-xs text-gray-600">Fotoğrafı değiştir:</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                          className="block w-full text-sm text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 mt-1"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-full aspect-square bg-white rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                        <div className="text-center text-gray-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm">Fotoğraf yok</p>
                        </div>
                      </div>
                      <label className="block">
                        <span className="text-xs text-gray-600">Fotoğraf yükle:</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                          className="block w-full text-sm text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 mt-1"
                        />
                      </label>
                      {uploadingImage && (
                        <div className="text-xs text-gray-600 flex items-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600"></div>
                          Yükleniyor...
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Max 5MB, JPG, PNG, GIF, WebP
                  </p>
                </div>

                {/* Vitrin kontrolleri: one cikar + indirime sokma */}
                <div className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-gray-900">Vitrin Kontrolleri</h4>

                  <div className="flex items-center justify-between">
                    <div className="pr-3">
                      <p className="text-sm font-medium text-gray-800">Ana sayfada öne çıkar</p>
                      <p className="text-xs text-gray-500">&quot;Öne Çıkan&quot; bölümünde gösterilir</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!selectedProduct.isFeatured}
                      onClick={() => handleToggleFlag('isFeatured', !selectedProduct.isFeatured)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${selectedProduct.isFeatured ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${selectedProduct.isFeatured ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {selectedProduct.isFeatured && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-xs text-gray-600">Sıra (küçük önce):</span>
                      <Input
                        type="number"
                        value={featuredOrderInput}
                        onChange={(e) => setFeaturedOrderInput(e.target.value)}
                        className="w-20 text-center"
                      />
                      <Button size="sm" onClick={handleSaveFeaturedOrder} isLoading={isSaving === 'featuredOrder'}>
                        Kaydet
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <div className="pr-3">
                      <p className="text-sm font-medium text-gray-800">İndirime sokma</p>
                      <p className="text-xs text-gray-500">Fazla stok olsa bile indirimli gösterilmez (normal fiyat)</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!selectedProduct.excludeFromDiscount}
                      onClick={() => handleToggleFlag('excludeFromDiscount', !selectedProduct.excludeFromDiscount)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${selectedProduct.excludeFromDiscount ? 'bg-amber-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${selectedProduct.excludeFromDiscount ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-xs text-blue-900">
                    <strong>💡 Not:</strong> Burada belirlediğiniz kar marjı, kategori bazlı kar marjını <strong>geçersiz kılar</strong>.
                    Sadece bu ürün için özel fiyatlandırma uygulanır.
                  </p>
                </div>

                <div className="space-y-4">
                  {CUSTOMER_TYPES.map((type) => (
                    <div key={type.value} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <label className="block text-sm font-bold text-gray-900 mb-3">
                        {type.label}
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="number"
                            step="0.1"
                            value={overrideMargins[type.value]}
                            onChange={(e) =>
                              setOverrideMargins({ ...overrideMargins, [type.value]: e.target.value })
                            }
                            placeholder="Kar marjı %"
                            className="text-center font-semibold"
                          />
                          <p className="text-xs text-gray-500 mt-1 text-center">Örnek: 15 = %15</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSetOverride(type.value)}
                          disabled={!overrideMargins[type.value]}
                          isLoading={isSaving === type.value}
                          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold"
                        >
                          💾 Kaydet
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t">
                  <Button
                    variant="ghost"
                    className="w-full text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setSelectedProduct(null);
                      setOverrideMargins({ BAYI: '', PERAKENDE: '', VIP: '', OZEL: '' });
                    }}
                  >
                    ✖️ Seçimi Temizle
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
                <div className="text-center py-12">
                  <div className="text-gray-300 mb-4">
                    <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium mb-2">Ürün Seçilmedi</p>
                  <p className="text-sm text-gray-500">
                    Soldaki listeden bir ürün seçin
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
