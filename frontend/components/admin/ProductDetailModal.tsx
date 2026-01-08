'use client';

import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import { getUnitConversionLabel } from '@/lib/utils/unit';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
}

export function ProductDetailModal({ isOpen, onClose, product }: ProductDetailModalProps) {
  if (!product) return null;

  const customerTypes = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'];
  const getListPrice = (listNo: number) => {
    const value = product.mikroPriceLists?.[String(listNo)];
    return typeof value === 'number' ? value : Number(value) || 0;
  };
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);

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
                  className="w-full h-full object-cover"
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
      </div>
    </Modal>
  );
}
