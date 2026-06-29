'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CategoryWithPriceRules } from '@/types';
import adminApi from '@/lib/api/admin';
import { CUSTOMER_TYPES, getCustomerTypeName } from '@/lib/utils/customerTypes';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { CategoryWithPriceRules } from '@/types';

/**
 * Kategori Fiyatlandirma ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 * toast-ici onay/girdi diyaloglari da burada KALIR; iki gorunum de ayni diyaloglari cagirir.
 */
export function useKategoriler() {
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
    const tokens = buildSearchTokens(searchQuery);
    if (tokens.length === 0) {
      setFilteredCategories(categories);
      return;
    }

    setFilteredCategories(
      categories.filter((cat) => {
        const haystack = normalizeSearchText(`${cat.name} ${cat.mikroCode}`);
        return matchesSearchTokens(haystack, tokens);
      })
    );
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
        <div className="flex flex-col gap-2 w-[320px] max-w-[90vw]">
          <p className="font-bold text-base">⚠️ Toplu Güncelleme</p>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
            <p className="font-medium mb-1">Uygulanacak marjlar:</p>
            <p className="text-amber-800">{segmentNames}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2">
            <p className="text-xs text-blue-700 leading-relaxed">
              • {totalUpdates} güncelleme<br/>
              • Süre: 30-60 saniye
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-3 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors font-bold"
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
      <div className="flex items-center gap-3 w-[320px] max-w-[90vw]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        <div className="flex-1">
          <p className="font-bold text-sm">Güncelleme yapılıyor...</p>
          <p className="text-xs text-gray-600">{totalUpdates} işlem</p>
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
        <div className="flex flex-col gap-1 w-[320px] max-w-[90vw]">
          <p className="font-bold text-sm">🎉 Güncelleme Tamamlandı!</p>
          <p className="text-xs leading-relaxed">
            ✅ {result.updatedRules} kural<br/>
            📊 {result.affectedCategories} kategori<br/>
            💰 {result.pricesUpdated} ürün fiyatı
          </p>
          {result.errors && result.errors.length > 0 && (
            <p className="text-xs text-red-600">⚠️ {result.errors.length} hata</p>
          )}
        </div>
      ), {
        duration: 6000,
      });

      setBulkMargin(CUSTOMER_TYPES.reduce((acc, type) => ({ ...acc, [type.value]: '' }), {}));
      setShowBulkUpdate(false);
      fetchCategories();
    } catch (error: any) {
      // Hata durumunda progress toast'ı kapat
      toast.dismiss(progressToast);
      toast.error((t) => (
        <div className="w-[320px] max-w-[90vw]">
          <p className="font-bold text-sm mb-1">❌ Güncelleme başarısız</p>
          <p className="text-xs">{error.response?.data?.error || error.message}</p>
        </div>
      ), {
        duration: 5000,
      });
    }
  };

  const handleCategoryBulkUpdate = async (categoryId: string, categoryName: string) => {
    const margin = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-2 w-[320px] max-w-[90vw]">
          <p className="font-bold text-sm">Kategori Güncelleme</p>
          <div className="bg-blue-50 border border-blue-200 rounded p-2">
            <p className="text-xs font-medium truncate">{categoryName}</p>
          </div>
          <input
            type="number"
            className="border rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="Kar marjı (%)"
            onChange={(e) => inputValue = e.target.value}
            step="0.1"
            autoFocus
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-3 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              onClick={() => {
                toast.dismiss(t.id);
                resolve('__CANCEL__');
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
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

  return {
    // veri / yuklenme
    categories,
    filteredCategories,
    isLoading,
    // duzenleme / panel / arama durumu
    editingId,
    setEditingId,
    showBulkUpdate,
    setShowBulkUpdate,
    searchQuery,
    setSearchQuery,
    bulkMargin,
    setBulkMargin,
    // aksiyonlar
    fetchCategories,
    handleSave,
    getPriceRule,
    handleBulkUpdate,
    handleCategoryBulkUpdate,
    // sabitler / yardimcilar
    CUSTOMER_TYPES,
    getCustomerTypeName,
  };
}
