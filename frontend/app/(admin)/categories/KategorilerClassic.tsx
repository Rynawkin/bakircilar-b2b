'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useKategoriler } from './useKategoriler';

/**
 * Klasik gorunum Kategori Fiyatlandirma ekrani.
 * JSX, eski page.tsx'in `return (...)` blogunun BIRE BIR aynisidir (emoji dahil hicbir sey degismez).
 * Tum mantik useKategoriler hook'undan gelir.
 */
export default function KategorilerClassic() {
  const {
    categories,
    filteredCategories,
    isLoading,
    editingId,
    setEditingId,
    showBulkUpdate,
    setShowBulkUpdate,
    searchQuery,
    setSearchQuery,
    bulkMargin,
    setBulkMargin,
    handleSave,
    getPriceRule,
    handleBulkUpdate,
    handleCategoryBulkUpdate,
    CUSTOMER_TYPES,
  } = useKategoriler();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600"></div>
          <p className="text-gray-600 font-medium">Kategoriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">

      <div className="container-custom py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Kategori Fiyatlandirma</h1>
              <span className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded-full">
                {categories.length} Kategori
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Her kategori icin musteri tipine gore kar marji belirleyin (%)
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowBulkUpdate(!showBulkUpdate)}
          >
            {showBulkUpdate ? 'Iptal' : 'Toplu Guncelleme'}
          </Button>
        </div>
        {/* Toplu Güncelleme Kartı */}
        {showBulkUpdate && (
          <Card className="mb-6 shadow-lg hover:shadow-xl transition-shadow border-2 border-primary-200 bg-gradient-to-br from-white to-primary-50">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary-600 text-white p-2 rounded-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800">Tüm Kategorilerde Toplu Güncelleme</h2>
              </div>
              <p className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
                💡 <strong>İpucu:</strong> Birden fazla müşteri tipi için değer girebilirsiniz. Dolu olan tüm alanlar güncellenecektir.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {CUSTOMER_TYPES.map((type) => (
                  <div key={type.value} className="relative">
                    <Input
                      label={type.label}
                      type="number"
                      step="0.1"
                      value={bulkMargin[type.value]}
                      onChange={(e) => setBulkMargin({ ...bulkMargin, [type.value]: e.target.value })}
                      placeholder="0"
                      className="transition-all focus:scale-105"
                    />
                    {bulkMargin[type.value] && (
                      <span className="absolute top-0 right-0 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                        ✓
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Button
                onClick={handleBulkUpdate}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-lg py-3 shadow-lg hover:shadow-xl transition-all"
              >
                🚀 Toplu Güncellemeyi Uygula
              </Button>
            </div>
          </Card>
        )}

        {/* Arama Kutusu */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Kategori adı veya kodu ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-xl shadow-md focus:outline-none focus:ring-4 focus:ring-primary-500 focus:border-primary-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-sm text-gray-600">
              <strong>{filteredCategories.length}</strong> kategori bulundu
            </p>
          )}
        </div>

        {/* Kategoriler Listesi */}
        <div className="space-y-4">
          {filteredCategories.length === 0 ? (
            <Card className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🔍</div>
              <p className="text-xl font-medium text-gray-600">Kategori bulunamadı</p>
              <p className="text-sm text-gray-500 mt-2">Arama kriterlerinizi değiştirmeyi deneyin</p>
            </Card>
          ) : (
            filteredCategories.map((category, index) => (
              <Card
                key={category.id}
                className="hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-l-4 border-primary-500 bg-gradient-to-r from-white to-gray-50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="p-6">
                  {/* Kategori Başlığı */}
                  <div className="mb-6 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-3 rounded-xl shadow-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-xl text-gray-800">{category.name}</h3>
                        <p className="text-sm text-gray-500 font-mono bg-gray-100 inline-block px-2 py-1 rounded mt-1">
                          Kod: {category.mikroCode}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCategoryBulkUpdate(category.id, category.name)}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md hover:shadow-lg transition-all"
                    >
                      ⚡ Toplu Güncelle
                    </Button>
                  </div>

                  {/* Fiyat Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {CUSTOMER_TYPES.map((type) => (
                      <div key={type.value} className="relative">
                        <label className="block text-sm font-semibold mb-2 text-gray-700">
                          {type.label}
                        </label>
                        {editingId === `${category.id}-${type.value}` ? (
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              step="0.1"
                              defaultValue={getPriceRule(category, type.value)}
                              id={`input-${category.id}-${type.value}`}
                              className="w-24 focus:ring-4 focus:ring-green-400 transition-all"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const input = document.getElementById(`input-${category.id}-${type.value}`) as HTMLInputElement;
                                handleSave(category.id, type.value, input.value);
                              }}
                              className="bg-green-500 hover:bg-green-600 text-white shadow-md"
                            >
                              ✓
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <div className="flex-1 border-2 rounded-lg px-4 py-3 bg-gradient-to-br from-gray-50 to-white font-bold text-lg text-primary-700 shadow-sm">
                              %{getPriceRule(category, type.value)}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(`${category.id}-${type.value}`)}
                              className="bg-gray-200 hover:bg-gray-300 transition-all"
                            >
                              ✎
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Footer İstatistikler */}
        {filteredCategories.length > 0 && (
          <div className="mt-8 p-6 bg-white rounded-xl shadow-lg border-2 border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">{filteredCategories.length}</div>
                <div className="text-sm text-gray-600 mt-1">Toplam Kategori</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{CUSTOMER_TYPES.length}</div>
                <div className="text-sm text-gray-600 mt-1">Müşteri Tipi</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">
                  {filteredCategories.length * CUSTOMER_TYPES.length}
                </div>
                <div className="text-sm text-gray-600 mt-1">Toplam Fiyat Kuralı</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg">
                <div className="text-3xl font-bold text-amber-600">
                  {filteredCategories.reduce((acc, cat) => acc + (cat.priceRules?.length || 0), 0)}
                </div>
                <div className="text-sm text-gray-600 mt-1">Aktif Kural</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
