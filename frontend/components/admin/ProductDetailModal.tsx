'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import adminApi from '@/lib/api/admin';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import { getUnitConversionLabel } from '@/lib/utils/unit';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
  onUploadImage?: (productId: string, file: File) => void;
  onDeleteImage?: (productId: string) => void;
  imageUploading?: boolean;
  imageDeleting?: boolean;
}

type ComplementMode = 'AUTO' | 'MANUAL';

type ComplementItem = {
  productId: string;
  productCode: string;
  productName: string;
  imageUrl?: string | null;
  pairCount?: number;
  rank?: number;
  sortOrder?: number;
};

type ComplementState = {
  mode: ComplementMode;
  limit: number;
  complementGroupCode?: string | null;
  auto: ComplementItem[];
  manual: ComplementItem[];
};

type ProductSearchResult = {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
};

export function ProductDetailModal({
  isOpen,
  onClose,
  product,
  onUploadImage,
  onDeleteImage,
  imageUploading,
  imageDeleting,
}: ProductDetailModalProps) {
  if (!product) return null;

  const customerTypes = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'];
  const getListPrice = (listNo: number) => {
    const value = product.mikroPriceLists?.[String(listNo)];
    return typeof value === 'number' ? value : Number(value) || 0;
  };
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const [complementLimit, setComplementLimit] = useState(10);
  const [autoComplements, setAutoComplements] = useState<ComplementItem[]>([]);
  const [manualComplements, setManualComplements] = useState<ComplementItem[]>([]);
  const [complementMode, setComplementMode] = useState<ComplementMode>('AUTO');
  const [complementGroupCode, setComplementGroupCode] = useState('');
  const [complementsLoading, setComplementsLoading] = useState(false);
  const [complementsError, setComplementsError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [initialMode, setInitialMode] = useState<ComplementMode>('AUTO');
  const [initialManualIds, setInitialManualIds] = useState<string[]>([]);
  const [initialComplementGroupCode, setInitialComplementGroupCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const manualIds = useMemo(() => manualComplements.map((item) => item.productId), [manualComplements]);
  const manualLimitReached = manualIds.length >= complementLimit;
  const saveMode = manualIds.length === 0 ? 'AUTO' : complementMode;
  const manualModeNeedsItems = complementMode === 'MANUAL' && manualIds.length === 0;
  const showManualPanel = complementMode === 'MANUAL';

  const filteredSearchResults = useMemo(() => {
    if (searchResults.length === 0) return [];
    const excludedIds = new Set(manualIds);
    if (product?.id) {
      excludedIds.add(product.id);
    }
    return searchResults.filter((item) => !excludedIds.has(item.id));
  }, [searchResults, manualIds, product?.id]);

  const isDirty = useMemo(() => {
    if (saveMode !== initialMode) return true;
    if (complementGroupCode.trim() !== initialComplementGroupCode.trim()) return true;
    if (manualIds.length !== initialManualIds.length) return true;
    return manualIds.some((id, index) => id !== initialManualIds[index]);
  }, [
    saveMode,
    initialMode,
    manualIds,
    initialManualIds,
    complementGroupCode,
    initialComplementGroupCode,
  ]);

  const loadComplements = useCallback(async () => {
    if (!product?.id) return;
    setComplementsLoading(true);
    setComplementsError(null);
    try {
      const data: ComplementState = await adminApi.getProductComplements(product.id);
      setAutoComplements(data.auto || []);
      setManualComplements(data.manual || []);
      setComplementMode(data.mode || 'AUTO');
      setComplementLimit(data.limit || 10);
      const groupCode = typeof data.complementGroupCode === 'string' ? data.complementGroupCode.trim() : '';
      setComplementGroupCode(groupCode);
      setInitialComplementGroupCode(groupCode);
      setInitialMode(data.mode || 'AUTO');
      setInitialManualIds((data.manual || []).map((item) => item.productId));
    } catch (error) {
      console.error('Tamamlayici urunler yuklenemedi:', error);
      setComplementsError('Tamamlayici urunler yuklenemedi');
    } finally {
      setComplementsLoading(false);
    }
  }, [product?.id]);

  useEffect(() => {
    if (!isOpen || !product?.id) return;
    loadComplements();
  }, [isOpen, product?.id, loadComplements]);

  useEffect(() => {
    if (isOpen) return;
    setSearchTerm('');
    setSearchResults([]);
    setComplementsError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const term = debouncedSearch.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const run = async () => {
      setIsSearching(true);
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 10 });
        const results = (response.products || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          mikroCode: item.mikroCode,
          imageUrl: item.imageUrl ?? null,
        }));
        if (active) {
          setSearchResults(results);
        }
      } catch (error) {
        console.error('Urun arama hatasi:', error);
        if (active) {
          setSearchResults([]);
        }
      } finally {
        if (active) {
          setIsSearching(false);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [debouncedSearch, isOpen]);

  const handleAddManual = (item: ProductSearchResult) => {
    if (manualIds.includes(item.id) || manualLimitReached) return;
    setManualComplements((prev) => [
      ...prev,
      {
        productId: item.id,
        productCode: item.mikroCode,
        productName: item.name,
        imageUrl: item.imageUrl ?? null,
        sortOrder: prev.length,
      },
    ]);
    setComplementMode('MANUAL');
  };

  const handleRemoveManual = (productId: string) => {
    setManualComplements((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleSaveComplements = async () => {
    if (!product?.id) return;
    setIsSaving(true);
    setComplementsError(null);
    try {
      const normalizedGroup = complementGroupCode.trim();
      await adminApi.updateProductComplements(product.id, {
        manualProductIds: manualIds,
        mode: saveMode,
        complementGroupCode: normalizedGroup ? normalizedGroup : null,
      });
      await loadComplements();
    } catch (error) {
      console.error('Tamamlayici urunler kaydedilemedi:', error);
      setComplementsError('Tamamlayici urunler kaydedilemedi');
    } finally {
      setIsSaving(false);
    }
  };


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadImage) {
      return;
    }

    onUploadImage(product.id, file);
    event.target.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ürün Detayları"
      size="xl"
    >
      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-6 rounded-xl border border-primary-200">
          <div className="flex gap-6">
            {product.imageUrl ? (
              <div className="w-32 h-32 bg-white rounded-lg overflow-hidden shadow-lg flex-shrink-0">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-5xl flex-shrink-0">
                📦
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Mikro Kod:</span>
                  <span className="ml-2 font-mono font-semibold text-gray-900">{product.mikroCode}</span>
                </div>
                <div>
                  <span className="text-gray-600">Birim:</span>
                  <span className="ml-2 font-semibold text-gray-900">{product.unit}</span>
                </div>
                <div>
                  <span className="text-gray-600">Kategori:</span>
                  <span className="ml-2 font-semibold text-gray-900">{product.category.name}</span>
                </div>
                <div>
                  <span className="text-gray-600">KDV Oranı:</span>
                  <span className="ml-2 font-semibold text-gray-900">%{(product.vatRate * 100).toFixed(0)}</span>
                </div>
                {unitLabel && (
                  <div className="col-span-2 text-xs text-gray-600">
                    {unitLabel}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <label className="font-semibold text-gray-700">Urun resmi:</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={imageUploading}
            className="block w-full max-w-xs text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {product.imageUrl && onDeleteImage && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDeleteImage(product.id)}
              disabled={imageDeleting}
            >
              {imageDeleting ? 'Siliniyor...' : 'Sil'}
            </Button>
          )}
          {imageUploading && (
            <span className="text-xs text-gray-500">Yukleniyor...</span>
          )}
        </div>

        {/* Stock Info */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-xl">📊</span>
            Stok Bilgileri
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-sm text-green-700 mb-1">Fazla Stok</div>
              <div className="text-3xl font-bold text-green-900">{product.excessStock}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-700 mb-1">Toplam Stok</div>
              <div className="text-3xl font-bold text-blue-900">{product.totalStock}</div>
            </div>
          </div>

          {/* Warehouse Breakdown */}
          {product.warehouseStocks && Object.keys(product.warehouseStocks).length > 0 && (
            <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-3">Depo Dağılımı:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(product.warehouseStocks).map(([warehouse, stock]) => (
                  <div key={warehouse} className="bg-white rounded-lg p-3 border border-gray-200 text-center">
                    <div className="text-xs text-gray-600 mb-1">{warehouse}</div>
                    <div className="text-lg font-bold text-gray-900">{stock as number}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost Info */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-xl">💰</span>
            Maliyet Bilgileri
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {/* Last Entry Price */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="text-xs text-purple-700 mb-2">Son Giriş Maliyeti</div>
              {product.lastEntryPrice ? (
                <>
                  <div className="text-xl font-bold text-purple-900 mb-1">
                    {formatCurrency(product.lastEntryPrice)}
                  </div>
                  {product.lastEntryDate && (
                    <div className="text-xs text-purple-600">
                      {formatDate(product.lastEntryDate)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-400">Bilgi yok</div>
              )}
            </div>

            {/* Current Cost */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="text-xs text-orange-700 mb-2">Güncel Maliyet (Tanımlı)</div>
              {product.currentCost ? (
                <>
                  <div className="text-xl font-bold text-orange-900 mb-1">
                    {formatCurrency(product.currentCost)}
                  </div>
                  {product.currentCostDate && (
                    <div className="text-xs text-orange-600">
                      {formatDate(product.currentCostDate)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-400">Bilgi yok</div>
              )}
            </div>

            {/* Calculated Cost */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-xs text-blue-700 mb-2">Hesaplanan Maliyet</div>
              {product.calculatedCost ? (
                <div className="text-xl font-bold text-blue-900">
                  {formatCurrency(product.calculatedCost)}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Bilgi yok</div>
              )}
            </div>
          </div>
        </div>

        {/* Mikro Liste Fiyatlari */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-xl">$</span>
            Mikro Liste Fiyatlari
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Perakende Satis Listeleri</div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((listNo) => {
                  const price = getListPrice(listNo);
                  return (
                    <div key={listNo} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Liste {listNo}</span>
                      <span className="font-semibold text-gray-900">
                        {price > 0 ? formatCurrency(price) : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Toptan Satis Listeleri</div>
              <div className="space-y-2">
                {[6, 7, 8, 9, 10].map((listNo) => {
                  const price = getListPrice(listNo);
                  const labelNo = listNo - 5;
                  return (
                    <div key={listNo} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Liste {labelNo}</span>
                      <span className="font-semibold text-gray-900">
                        {price > 0 ? formatCurrency(price) : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Prices by Customer Type */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-xl">🏷️</span>
            Satış Fiyatları (Müşteri Segmentlerine Göre)
          </h3>
          <div className="space-y-3">
            {customerTypes.map((type) => {
              const typeLabel = getCustomerTypeName(type);
              const typePrices = product.prices?.[type];

              if (!typePrices) {
                return (
                  <div key={type} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-gray-700 mb-2">{typeLabel}</div>
                    <div className="text-sm text-gray-400">Fiyat bilgisi yok</div>
                  </div>
                );
              }

              return (
                <div key={type} className="bg-white border-2 border-primary-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-3">{typeLabel}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-primary-50 rounded-lg p-3">
                      <div className="text-xs text-primary-700 mb-1">📄 Faturalı (KDV Hariç +KDV)</div>
                      <div className="text-2xl font-bold text-primary-900">
                        {formatCurrency(typePrices.INVOICED || 0)}
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-700 mb-1">⚪ Beyaz (Özel - Faturasız)</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(typePrices.WHITE || 0)}
                      </div>
                    </div>
                  </div>
                  {/* Kar Marjı Gösterimi */}
                  {product.calculatedCost && typePrices.INVOICED > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Faturalı Fiyat Kar Marjı:</span>
                        <span className={`font-semibold ${((typePrices.INVOICED - product.calculatedCost) / product.calculatedCost) * 100 < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          %{(((typePrices.INVOICED - product.calculatedCost) / product.calculatedCost) * 100).toFixed(1)}
                        </span>
                      </div>
                      {typePrices.WHITE > 0 && (
                        <div className="flex justify-between mt-1">
                          <span>Beyaz Fiyat Kar Marjı:</span>
                          <span className={`font-semibold ${((typePrices.WHITE - product.calculatedCost) / product.calculatedCost) * 100 < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            %{(((typePrices.WHITE - product.calculatedCost) / product.calculatedCost) * 100).toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>


        {/* Complementary Products */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-xl">+</span>
            Tamamlayici Urunler
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Button
              size="sm"
              variant={complementMode === 'AUTO' ? 'primary' : 'secondary'}
              onClick={() => setComplementMode('AUTO')}
            >
              Otomatik
            </Button>
            <Button
              size="sm"
              variant={complementMode === 'MANUAL' ? 'primary' : 'secondary'}
              onClick={() => setComplementMode('MANUAL')}
            >
              Manuel
            </Button>
            <span className="text-xs text-gray-500">
              {complementMode === 'MANUAL' ? 'Manuel liste kullaniliyor' : 'Otomatik oneriler aktif'}
            </span>
            <span className="text-xs text-gray-400">Limit: {complementLimit}</span>
          </div>
          <div className="mb-3 max-w-xs">
            <Input
              label="Tamamlayici Grup Kodu"
              placeholder="Ornek: TEA"
              value={complementGroupCode}
              onChange={(event) => setComplementGroupCode(event.target.value)}
            />
            <div className="text-xs text-gray-500 mt-1">
              Grup bazli raporlar icin kullanilir.
            </div>
          </div>
          {manualModeNeedsItems && (
            <div className="text-xs text-orange-600 mb-3">
              Manuel mod icin en az 1 urun ekleyin. Kaydedince otomatik moda doner.
            </div>
          )}
          {complementsLoading ? (
            <div className="text-sm text-gray-500">Yukleniyor...</div>
          ) : complementsError ? (
            <div className="text-sm text-red-600">{complementsError}</div>
          ) : (
            <div className={showManualPanel ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}>
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-semibold text-gray-800 mb-2">Otomatik Oneriler</div>
                {autoComplements.length === 0 ? (
                  <div className="text-xs text-gray-500">Oneri bulunamadi</div>
                ) : (
                  <div className="space-y-2">
                    {autoComplements.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-semibold text-gray-800">{item.productName}</div>
                          <div className="text-gray-500">{item.productCode}</div>
                        </div>
                        <div className="text-gray-500">x{item.pairCount}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {showManualPanel && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-800">Manuel Liste</div>
                    <div className="text-xs text-gray-500">
                      {manualIds.length}/{complementLimit}
                    </div>
                  </div>
                  {manualComplements.length === 0 ? (
                    <div className="text-xs text-gray-500">Manuel urun secilmedi</div>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {manualComplements.map((item) => (
                        <div key={item.productId} className="flex items-start justify-between gap-2 text-xs">
                          <div>
                            <div className="font-semibold text-gray-800">{item.productName}</div>
                            <div className="text-gray-500">{item.productCode}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveManual(item.productId)}
                          >
                            Kaldir
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Urun ekle</div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Urun adi veya kodu"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                    />
                    {isSearching && (
                      <div className="text-xs text-gray-500 mt-2">Araniyor...</div>
                    )}
                    {!isSearching && searchTerm.trim() && filteredSearchResults.length === 0 && (
                      <div className="text-xs text-gray-500 mt-2">Sonuc bulunamadi</div>
                    )}
                    {filteredSearchResults.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                        {filteredSearchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddManual(item)}
                            disabled={manualLimitReached}
                            className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            <span>
                              <span className="font-semibold text-gray-800">{item.name}</span>
                              <span className="text-gray-500 ml-2">{item.mikroCode}</span>
                            </span>
                            <span className="text-primary-600">Ekle</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {manualLimitReached && (
                      <div className="text-[11px] text-gray-500 mt-2">Limit doldu. Once listeden cikarin.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="primary"
              onClick={handleSaveComplements}
              disabled={!isDirty || isSaving || complementsLoading}
              isLoading={isSaving}
            >
              Kaydet
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
