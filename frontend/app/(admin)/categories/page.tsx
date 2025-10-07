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

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkMargin, setBulkMargin] = useState<Record<string, string>>({
    BAYI: '',
    PERAKENDE: '',
    VIP: '',
    OZEL: ''
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { categories } = await adminApi.getCategories();
      setCategories(categories);
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
    const customerType = Object.keys(bulkMargin).find(k => bulkMargin[k] !== '');
    if (!customerType || !bulkMargin[customerType]) {
      toast.error('Lütfen bir müşteri tipi seçin ve kar marjı girin');
      return;
    }

    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[350px]">
          <p className="font-medium">TÜM kategorilerde {customerType} müşteri tipi için kar marjını %{bulkMargin[customerType]} olarak güncellemek istediğinizden emin misiniz?</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Güncelle
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!confirmed) return;

    try {
      for (const category of categories) {
        await adminApi.setCategoryPriceRule({
          categoryId: category.id,
          customerType: customerType as any,
          profitMargin: parseFloat(bulkMargin[customerType]) / 100,
        });
      }
      toast.success('Toplu güncelleme tamamlandı! 🎉');
      setBulkMargin({ BAYI: '', PERAKENDE: '', VIP: '', OZEL: '' });
      setShowBulkUpdate(false);
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Toplu güncelleme başarısız');
    }
  };

  const handleCategoryBulkUpdate = async (categoryId: string) => {
    const margin = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium">Bu kategori için tüm müşteri tiplerine uygulanacak kar marjı (%):</p>
          <input
            type="number"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Örn: 25"
            onChange={(e) => inputValue = e.target.value}
            step="0.1"
          />
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve('__CANCEL__');
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
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
      for (const type of ['BAYI', 'PERAKENDE', 'VIP', 'OZEL']) {
        await adminApi.setCategoryPriceRule({
          categoryId,
          customerType: type as any,
          profitMargin: parseFloat(margin) / 100,
        });
      }
      toast.success('Kategori toplu güncelleme tamamlandı! ✅');
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncelleme başarısız');
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">📊 Kategori Fiyatlandırma</h1>
                <p className="text-sm text-primary-100">Her kategori için müşteri tipine göre kar marjı belirleyin (%)</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowBulkUpdate(!showBulkUpdate)}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                {showBulkUpdate ? 'İptal' : 'Toplu Güncelleme'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {showBulkUpdate && (
          <Card title="Tüm Kategorilerde Toplu Güncelleme" className="mb-6">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Bir müşteri tipi seçin ve tüm kategorilerde aynı kar marjını uygulayın</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['BAYI', 'PERAKENDE', 'VIP', 'OZEL'].map((type) => (
                  <Input
                    key={type}
                    label={type}
                    type="number"
                    step="0.1"
                    value={bulkMargin[type]}
                    onChange={(e) => setBulkMargin({ ...bulkMargin, [type]: e.target.value })}
                    placeholder="0"
                  />
                ))}
              </div>
              <Button onClick={handleBulkUpdate} className="w-full">
                Toplu Güncellemeyi Uygula
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-4">
          {categories.map((category) => (
            <Card key={category.id}>
              <div className="mb-4 flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{category.name}</h3>
                  <p className="text-sm text-gray-500">Kod: {category.mikroCode}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCategoryBulkUpdate(category.id)}
                >
                  Toplu Güncelle
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['BAYI', 'PERAKENDE', 'VIP', 'OZEL'].map((type) => (
                  <div key={type}>
                    <label className="block text-sm font-medium mb-1">{type}</label>
                    {editingId === `${category.id}-${type}` ? (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          defaultValue={getPriceRule(category, type)}
                          id={`input-${category.id}-${type}`}
                          className="w-24"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const input = document.getElementById(`input-${category.id}-${type}`) as HTMLInputElement;
                            handleSave(category.id, type, input.value);
                          }}
                        >
                          ✓
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex-1 border rounded px-3 py-2 bg-gray-50">
                          %{getPriceRule(category, type)}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(`${category.id}-${type}`)}
                        >
                          ✎
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
