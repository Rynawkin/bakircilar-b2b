'use client';

import { useStokArama } from './useStokArama';

/**
 * Klasik (mevcut) gorunum. JSX, eski page.tsx'in `return (` icerigi ile BIRE BIRDIR.
 * Hicbir mantik burada degil; tum mantik useStokArama hook'undan gelir.
 */
export default function StokAramaClassic() {
  const {
    searchTerm,
    setSearchTerm,
    stocks,
    loading,
    error,
    availableColumns,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    savingPreferences,
    showAll,
    setShowAll,
    selectedStock,
    showDetailModal,
    handleSearch,
    handleColumnToggle,
    saveColumnPreferences,
    getColumnDisplayName,
    formatValue,
    getColumnValue,
    handleRowClick,
    closeDetailModal,
  } = useStokArama();

  return (
    <>
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
                          {getColumnValue(column, stock)}
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
                    if (column === 'msg_S_0088') return null; // GUID'i göstermeyelim

                    return (
                      <div key={column} className="border-b border-gray-200 pb-3">
                        <dt className="text-sm font-medium text-gray-500 mb-1">
                          {getColumnDisplayName(column)}
                        </dt>
                        <dd className="text-base text-gray-900 font-semibold">
                          {getColumnValue(column, selectedStock)}
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
    </>
  );
}
