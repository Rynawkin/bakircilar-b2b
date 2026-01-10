'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product } from '@/types';
import customerApi from '@/lib/api/customer';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { addToCart } = useCartStore();
  const { user, loadUserFromStorage } = useAuthStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<'INVOICED' | 'WHITE'>('INVOICED');
  const [isAdding, setIsAdding] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const allowedPriceTypes = useMemo(
    () => getAllowedPriceTypes(effectiveVisibility),
    [effectiveVisibility]
  );
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (params.id) {
      fetchProduct(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!allowedPriceTypes.includes(priceType)) {
      setPriceType(defaultPriceType);
    }
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  const fetchProduct = async (id: string) => {
    setIsLoading(true);
    try {
      const data = await customerApi.getProductById(id);
      setProduct(data);
    } catch (error) {
      console.error('Ürün yükleme hatası:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;

    if (quantity > maxQuantity) {
      toast.error(`Maksimum ${maxQuantity} adet sipariş verebilirsiniz.`);
      return;
    }

    setIsAdding(true);
    try {
      const safePriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
      await addToCart({
        productId: product.id,
        quantity,
        priceType: safePriceType,
        priceMode,
      });

      toast.success('Ürün sepete eklendi!');
      router.push('/cart');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sepete eklenirken hata oluştu');
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-center text-gray-600">Ürün bulunamadı</p>
          <Button onClick={() => router.push('/products')} className="mt-4">
            Ürünlere Dön
          </Button>
        </Card>
      </div>
    );
  }

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity =
    product.maxOrderQuantity ??
    (isDiscounted ? product.excessStock : product.availableStock ?? product.excessStock ?? 0);
  const displayStock = isDiscounted
    ? product.excessStock
    : product.availableStock ?? product.excessStock ?? 0;
  const priceMode = isDiscounted ? 'EXCESS' : 'LIST';
  const warehouseBreakdown = isDiscounted ? product.warehouseExcessStocks : product.warehouseStocks;
  const selectedPriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
  const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const totalPrice = selectedPrice * quantity;
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const formatAgreementDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="container-custom py-4">
          <Button variant="ghost" onClick={() => router.push('/products')}>
            ← Ürünlere Dön
          </Button>
        </div>
      </header>

      <div className="container-custom py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Sol: Ürün Bilgileri */}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h1>
                <p className="text-sm text-gray-500 mb-4">Kod: {product.mikroCode}</p>
                <p className="text-sm text-gray-600 mb-2">Kategori: {product.category.name}</p>
                {unitLabel && (
                  <p className="text-xs text-gray-500 mb-6">{unitLabel}</p>
                )}

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">
                      {isDiscounted ? 'Toplam Fazla Stok' : 'Toplam Stok'}
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {displayStock} {product.unit}
                    </p>
                  </div>

                  {/* Warehouse Stock Details */}
                  {warehouseBreakdown && typeof warehouseBreakdown === 'object' && Object.keys(warehouseBreakdown).length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        {isDiscounted ? 'Depo Bazlı Fazla Stoklar' : 'Depo Bazlı Stoklar'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(warehouseBreakdown as Record<string, number>)
                          .filter(([_, stock]) => stock > 0)
                          .map(([warehouse, stock]) => (
                            <div key={warehouse} className="flex justify-between text-sm bg-green-50 p-2 rounded border border-green-200">
                              <span className="text-gray-600">{warehouse}:</span>
                              <span className="font-semibold text-green-700">{stock} {product.unit}</span>
                            </div>
                          ))}
                      </div>
                      {isDiscounted && (
                        <p className="text-xs text-gray-500 mt-2">
                          * Sadece fazla stoklu depolar gösteriliyor
                        </p>
                      )}
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      {showPriceTypeSelector ? 'Fiyat Seçenekleri' : 'Fiyat'}
                    </p>
                    {product.agreement && (
                      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                        <div className="font-semibold">Anlaşmalı fiyat</div>
                        <div>Min miktar: {product.agreement.minQuantity} {product.unit}</div>
                        <div>
                          Geçerlilik: {formatAgreementDate(product.agreement.validFrom)}
                          {product.agreement.validTo ? ` - ${formatAgreementDate(product.agreement.validTo)}` : ''}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {allowedPriceTypes.includes('INVOICED') && (
                        <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                          {showPriceTypeSelector && (
                            <input
                              type="radio"
                              name="priceType"
                              value="INVOICED"
                              checked={priceType === 'INVOICED'}
                              onChange={() => setPriceType('INVOICED')}
                              className="mr-3"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">Faturalı</p>
                            <p className="text-lg text-primary-600 font-bold">
                              {formatCurrency(product.prices.invoiced)}
                            </p>
                          </div>
                        </label>
                      )}

                      {allowedPriceTypes.includes('WHITE') && (
                        <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                          {showPriceTypeSelector && (
                            <input
                              type="radio"
                              name="priceType"
                              value="WHITE"
                              checked={priceType === 'WHITE'}
                              onChange={() => setPriceType('WHITE')}
                              className="mr-3"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">Beyaz</p>
                            <p className="text-lg text-gray-700 font-bold">
                              {formatCurrency(product.prices.white)}
                            </p>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sağ: Sipariş Formu */}
              <div>
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900">Sipariş Bilgileri</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Miktar ({product.unit})
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maksimum: {maxQuantity} {product.unit}
                    </p>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Birim Fiyat:</span>
                      <span className="font-medium">{formatCurrency(selectedPrice)}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Miktar:</span>
                      <span className="font-medium">{quantity} {product.unit}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Toplam:</span>
                      <span className="text-primary-600">{formatCurrency(totalPrice)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleAddToCart}
                    isLoading={isAdding}
                  >
                    Sepete Ekle
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    Ürün sepete eklenecek ve sonraki adımda sipariş oluşturabilirsiniz.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
