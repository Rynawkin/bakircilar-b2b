'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CategoryWithPriceRules } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LogoLink } from '@/components/ui/Logo';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<CategoryWithPriceRules[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkMargin, setBulkMargin] = useState<Record<string, string>>(
    CUSTOMER_TYPES.reduce((acc, type) => ({ ...acc, [type.value]: '' }), {})
  );

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCategories(categories);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredCategories(
        categories.filter(
          (cat) =>
            cat.name.toLowerCase().includes(query) ||
            cat.mikroCode.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, categories]);

  const fetchCategories = async () => {
    try {
      const { categories } = await adminApi.getCategories();
      setCategories(categories);
      setFilteredCategories(categories);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (categoryId: string, customerType: string, value: string) => {
    try {
      await adminApi.setCategoryPriceRule({
        categoryId,
        customerType: customerType as any,
        profitMargin: parseFloat(value) / 100,
      });
      toast.success('Kar marjı kaydedildi! Fiyatlar yeniden hesaplanıyor... ✅');
      fetchCategories();
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kaydetme başarısız');
    }
  };

  const getPriceRule = (category: CategoryWithPriceRules, customerType: string) => {
    const rule = category.priceRules?.find(r => r.customerType === customerType);
    return rule ? (rule.profitMargin * 100).toFixed(0) : '0';
  };

  const handleBulkUpdate = async () => {
    // Tüm dolu segmentleri bul
    const filledSegments = Object.entries(bulkMargin).filter(([_, value]) => value !== '');

    if (filledSegments.length === 0) {
      toast.error('Lütfen en az bir müşteri tipi için kar marjı girin');
      return;
    }

    const segmentNames = filledSegments.map(([type, value]) => {
      const typeName = CUSTOMER_TYPES.find(t => t.value === type)?.label || type;
      return `${typeName}: %${value}`;
    }).join(', ');

    const totalUpdates = categories.length * filledSegments.length;

    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[400px]">
          <p className="font-bold text-lg">⚠️ Toplu Güncelleme Onayı</p>
          <p className="text-sm">TÜM kategorilerde aşağıdaki kar marjları uygulanacak:</p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm font-medium">
            {segmentNames}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm font-bold text-blue-800 mb-1">ℹ️ Bilgi:</p>
            <p className="text-xs text-blue-700">
              • Toplam {totalUpdates} güncelleme yapılacak<br/>
              • Tahmini süre: 30-60 saniye<br/>
              • İşlem tek seferde tamamlanacak
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors font-bold"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Başlat
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!confirmed) return;

    // Progress toast göster
    const progressToast = toast((t) => (
      <div className="flex flex-col gap-3 min-w-[450px]">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <div className="flex-1">
            <p className="font-bold text-lg">Toplu Güncelleme Devam Ediyor...</p>
            <p className="text-xs text-gray-600 mt-1">{totalUpdates} güncelleme işleniyor...</p>
          </div>
        </div>
      </div>
    ), {
      duration: Infinity,
    });

    try {
      // Tüm kuralları toplu olarak gönder
      const rules = categories.flatMap(category =>
        filledSegments.map(([customerType, marginValue]) => ({
          categoryId: category.id,
          customerType,
          profitMargin: parseFloat(marginValue) / 100,
        }))
      );

      const result = await adminApi.setBulkCategoryPriceRules(rules);

      // Progress toast'ı kapat
      toast.dismiss(progressToast);

      // Başarı mesajı
      toast.success((t) => (
        <div className="flex flex-col gap-2">
          <p className="font-bold text-lg">🎉 Toplu Güncelleme Tamamlandı!</p>
          <p className="text-sm">
            ✅ {result.updatedRules} kural güncellendi<br/>
            📊 {result.affectedCategories} kategori etkilendi<br/>
            💰 {result.pricesUpdated} ürün fiyatı yeniden hesaplandı
          </p>
          {result.errors && result.errors.length > 0 && (
            <p className="text-xs text-red-600">⚠️ {result.errors.length} hata oluştu</p>
          )}
          <p className="text-xs text-gray-600">Kategoriler yeniden yükleniyor...</p>
        </div>
      ), {
        duration: 8000,
      });

      setBulkMargin(CUSTOMER_TYPES.reduce((acc, type) => ({ ...acc, [type.value]: '' }), {}));
      setShowBulkUpdate(false);
      fetchCategories();
    } catch (error: any) {
      // Hata durumunda progress toast'ı kapat
      toast.dismiss(progressToast);
      toast.error(`Toplu güncelleme başarısız!\n${error.response?.data?.error || error.message}`);
    }
  };

  const handleCategoryBulkUpdate = async (categoryId: string, categoryName: string) => {
    const margin = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[350px]">
          <p className="font-bold text-lg">Kategori Toplu Güncelleme</p>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2">
            <span className="font-medium">{categoryName}</span>
          </p>
          <p className="text-sm">Tüm müşteri tiplerine uygulanacak kar marjı (%):</p>
          <input
            type="number"
            className="border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="Örn: 25"
            onChange={(e) => inputValue = e.target.value}
            step="0.1"
            autoFocus
          />
          <div className="flex gap-2 justify-end pt-2">
            <button
              className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              onClick={() => {
                toast.dismiss(t.id);
                resolve('__CANCEL__');
              }}
            >
              İptal
            </button>
            <button
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
              onClick={() => {
                toast.dismiss(t.id);
                if (!inputValue) {
                  toast.error('Kar marjı girilmelidir');
                  resolve('__CANCEL__');
                } else {
                  resolve(inputValue);
                }
              }}
            >
              Uygula
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (margin === '__CANCEL__') return;

    try {
      for (const type of CUSTOMER_TYPES.map(t => t.value)) {
        await adminApi.setCategoryPriceRule({
          categoryId,
          customerType: type as any,
          profitMargin: parseFloat(margin) / 100,
        });
      }
      toast.success(`${categoryName} kategorisi güncellendi! ✅`);
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncelleme başarısız');
    }
  };

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
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-700 shadow-2xl border-b-4 border-primary-800">
        <div className="container-custom py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-white">📊 Kategori Fiyatlandırma</h1>
                  <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {categories.length} Kategori
                  </span>
                </div>
                <p className="text-sm text-primary-100">
                  Her kategori için müşteri tipine göre kar marjı belirleyin (%)
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowBulkUpdate(!showBulkUpdate)}
                className="bg-white text-primary-700 hover:bg-primary-50 font-medium shadow-lg hover:shadow-xl transition-all"
              >
                {showBulkUpdate ? '✕ İptal' : '⚡ Toplu Güncelleme'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50 font-medium shadow-lg hover:shadow-xl transition-all"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
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
