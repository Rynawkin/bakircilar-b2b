'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import adminApi from '@/lib/api/admin';

export default function StockSearchPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Kolon yönetimi
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Sayfalama
  const [limit] = useState(100);
  const [showAll, setShowAll] = useState(false);

  // Detay modal
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Kullanıcı tercihlerini yükle
  useEffect(() => {
    loadPreferences();
    loadAvailableColumns();
  }, []);

  const loadPreferences = async () => {
    try {
      const { preferences } = await adminApi.getSearchPreferences();
      if (preferences.stockColumns && preferences.stockColumns.length > 0) {
        setSelectedColumns(preferences.stockColumns);
      } else {
        // Varsayılan kolonlar
        setSelectedColumns(['msg_S_0078', 'msg_S_0870', 'KDV Oranı', 'Güncel Maliyet Kdv Dahil', 'Merkez Depo', 'Toplam Satılabilir']);
      }
    } catch (err) {
      console.error('Tercihler yüklenemedi:', err);
      // Varsayılan kolonlar
      setSelectedColumns(['msg_S_0078', 'msg_S_0870', 'KDV Oranı', 'Güncel Maliyet Kdv Dahil', 'Merkez Depo', 'Toplam Satılabilir']);
    }
  };

  const loadAvailableColumns = async () => {
    try {
      const { columns } = await adminApi.getStockColumns();
      setAvailableColumns(columns);
    } catch (err) {
      console.error('Kolonlar yüklenemedi:', err);
    }
  };

  const handleSearch = async () => {
    if (!showAll && (!searchTerm || searchTerm.trim().length === 0)) {
      setError('Lütfen arama terimi girin veya "Tüm Stokları Göster" seçeneğini kullanın');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = showAll ? { limit: 1000 } : { searchTerm: searchTerm.trim(), limit };
      const response = await adminApi.searchStocks(params);
      setStocks(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Arama yapılırken bir hata oluştu');
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const saveColumnPreferences = async () => {
    setSavingPreferences(true);
    try {
      await adminApi.updateSearchPreferences({ stockColumns: selectedColumns });
      setShowColumnSelector(false);
    } catch (err) {
      console.error('Tercihler kaydedilemedi:', err);
      alert('Tercihler kaydedilirken bir hata oluştu');
    } finally {
      setSavingPreferences(false);
    }
  };

  const getColumnDisplayName = (column: string) => {
    // msg_ ile başlayanları Türkçe'ye çevir
    const nameMap: { [key: string]: string } = {
      'msg_S_0088': 'GUID',
      'msg_S_0870': 'Ürün Adı',
      'msg_S_0078': 'Stok Kodu',
    };
    return nameMap[column] || column;
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    }
    if (value instanceof Date) {
      return value.toLocaleDateString('tr-TR');
    }
    return String(value);
  };

  const handleRowClick = (stock: any) => {
    setSelectedStock(stock);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedStock(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Stok Arama
          </h1>
          <p className="text-gray-600">
            Stok F10 - Mikro ERP entegrasyonu ile detaylı stok bilgileri
          </p>
        </div>

        {/* Arama ve Filtreler */}
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Arama kutusu */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stok Adı veya Kodu
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Arama yapmak için yazın..."
                disabled={showAll}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            {/* Butonlar */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors whitespace-nowrap"
              >
                {loading ? 'Aranıyor...' : 'Ara'}
              </button>

              <button
                onClick={() => setShowColumnSelector(true)}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                Kolonları Seç
              </button>
            </div>
          </div>

          {/* Tüm stokları göster checkbox */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Tüm stokları göster (arama yapmadan tüm stokları listele)
              </span>
            </label>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Sonuçlar */}
        {stocks.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  Sonuçlar ({stocks.length} adet)
                </h2>
              </div>
            </div>

            {/* Tablo - Yatay kaydırmalı + sticky kolonlar */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {selectedColumns.map((column, idx) => (
                      <th
                        key={column}
                        className={`px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap ${
                          idx < 2 ? 'sticky bg-gray-50 z-10' : ''
                        }`}
                        style={idx === 0 ? { left: 0 } : idx === 1 ? { left: '150px' } : {}}
                      >
                        {getColumnDisplayName(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stocks.map((stock, idx) => (
                    <tr
                      key={idx}
                      onClick={() => handleRowClick(stock)}
                      className="hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      {selectedColumns.map((column, colIdx) => (
                        <td
                          key={column}
                          className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap ${
                            colIdx < 2 ? 'sticky bg-white z-10' : ''
                          }`}
                          style={colIdx === 0 ? { left: 0 } : colIdx === 1 ? { left: '150px' } : {}}
                        >
                          {formatValue(stock[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Kolon Seçici Modal */}
        {showColumnSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  Görüntülenecek Kolonları Seçin
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Seçtiğiniz kolonlar otomatik olarak kaydedilecek
                </p>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableColumns.map((column) => (
                    <label
                      key={column}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(column)}
                        onChange={() => handleColumnToggle(column)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {getColumnDisplayName(column)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
                <button
                  onClick={() => setShowColumnSelector(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={saveColumnPreferences}
                  disabled={savingPreferences || selectedColumns.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                  {savingPreferences ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stok Detay Modal */}
        {showDetailModal && selectedStock && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {formatValue(selectedStock['msg_S_0870'])}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Stok Kodu: {formatValue(selectedStock['msg_S_0078'])}
                  </p>
                </div>
                <button
                  onClick={closeDetailModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {availableColumns.map((column) => {
                    const value = selectedStock[column];
                    if (column === 'msg_S_0088') return null; // GUID'i göstermeyelim

                    return (
                      <div key={column} className="border-b border-gray-200 pb-3">
                        <dt className="text-sm font-medium text-gray-500 mb-1">
                          {getColumnDisplayName(column)}
                        </dt>
                        <dd className="text-base text-gray-900 font-semibold">
                          {formatValue(value)}
                        </dd>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
                <button
                  onClick={closeDetailModal}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
