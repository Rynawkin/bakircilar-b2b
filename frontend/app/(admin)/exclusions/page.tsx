'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Pencil, Trash2, RefreshCw, Search } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';

type ExclusionType = 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';

interface Exclusion {
  id: string;
  type: ExclusionType;
  value: string;
  description?: string;
  active: boolean;
  createdAt: string;
}

interface ProductSearchItem {
  id: string;
  name: string;
  mikroCode: string;
  category?: {
    id: string;
    name: string;
  } | null;
}

const EXCLUSION_TYPE_LABELS: Record<ExclusionType, string> = {
  PRODUCT_CODE: 'Urun Kodu',
  CUSTOMER_CODE: 'Cari Kodu',
  CUSTOMER_NAME: 'Cari Adi',
  PRODUCT_NAME: 'Urun Adi',
  SECTOR_CODE: 'Sektor Kodu',
};

const normalizeProductCode = (value: string) => String(value || '').trim().toUpperCase();

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExclusion, setEditingExclusion] = useState<Exclusion | null>(null);
  const [formType, setFormType] = useState<ExclusionType>('PRODUCT_CODE');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [productSearch, setProductSearch] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchResults, setProductSearchResults] = useState<ProductSearchItem[]>([]);

  const productExclusionMap = useMemo(() => {
    const map = new Map<string, Exclusion[]>();
    exclusions
      .filter((item) => item.type === 'PRODUCT_CODE')
      .forEach((item) => {
        const key = normalizeProductCode(item.value);
        const list = map.get(key) || [];
        list.push(item);
        map.set(key, list);
      });
    return map;
  }, [exclusions]);

  const activeProductExclusions = useMemo(
    () =>
      exclusions
        .filter((item) => item.type === 'PRODUCT_CODE' && item.active)
        .sort((a, b) => a.value.localeCompare(b.value, 'tr')),
    [exclusions]
  );

  const fetchExclusions = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getExclusions();
      if (!result.success) {
        throw new Error('Veriler yuklenemedi');
      }
      setExclusions(result.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Bir hata olustu');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductCandidates = async (searchText: string) => {
    try {
      setProductSearchLoading(true);
      const params: any = {
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      };
      if (searchText.trim()) {
        params.search = searchText.trim();
      }
      const result = await adminApi.getProducts(params);
      const items: ProductSearchItem[] = (result.products || []).map((product: any) => ({
        id: product.id,
        name: String(product.name || ''),
        mikroCode: String(product.mikroCode || ''),
        category: product.category || null,
      }));
      setProductSearchResults(items);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Urunler getirilemedi');
    } finally {
      setProductSearchLoading(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProductCandidates(productSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const resetForm = () => {
    setFormType('PRODUCT_CODE');
    setFormValue('');
    setFormDescription('');
    setFormActive(true);
    setEditingExclusion(null);
  };

  const handleOpenModal = (exclusion?: Exclusion) => {
    if (exclusion) {
      setEditingExclusion(exclusion);
      setFormType(exclusion.type);
      setFormValue(exclusion.value);
      setFormDescription(exclusion.description || '');
      setFormActive(exclusion.active);
    } else {
      resetForm();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setTimeout(resetForm, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedValue =
      formType === 'PRODUCT_CODE' ? normalizeProductCode(formValue) : String(formValue || '').trim();

    if (!normalizedValue) {
      toast.error('Deger bos olamaz');
      return;
    }

    try {
      if (editingExclusion) {
        await adminApi.updateExclusion(editingExclusion.id, {
          value: normalizedValue,
          description: formDescription || undefined,
          active: formActive,
        });
        toast.success('Kural guncellendi');
      } else {
        await adminApi.createExclusion({
          type: formType,
          value: normalizedValue,
          description: formDescription || undefined,
        });
        toast.success('Kural olusturuldu');
      }

      handleCloseModal();
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Kurali Sil',
      message: 'Bu kurali silmek istediginize emin misiniz?',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await adminApi.deleteExclusion(id);
          toast.success('Kural silindi');
          fetchExclusions();
        } catch (err: any) {
          toast.error(err.response?.data?.error || 'Silme islemi basarisiz');
        }
      },
    });
  };

  const handleToggleActive = async (exclusion: Exclusion) => {
    try {
      await adminApi.updateExclusion(exclusion.id, { active: !exclusion.active });
      toast.success(exclusion.active ? 'Kural devre disi birakildi' : 'Kural aktif edildi');
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  const handleQuickExclude = async (product: ProductSearchItem) => {
    const code = normalizeProductCode(product.mikroCode);
    if (!code) return;

    const existingRules = productExclusionMap.get(code) || [];
    const activeRule = existingRules.find((rule) => rule.active);
    if (activeRule) {
      toast('Bu urun zaten dislanmis');
      return;
    }

    try {
      const inactiveRule = existingRules.find((rule) => !rule.active);
      if (inactiveRule) {
        await adminApi.updateExclusion(inactiveRule.id, { active: true });
      } else {
        await adminApi.createExclusion({
          type: 'PRODUCT_CODE',
          value: code,
          description: 'Admin panelden urun dislama',
        });
      }
      toast.success(`${code} dislandi`);
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Urun dislanamadi');
    }
  };

  const handleQuickUnexclude = async (productCode: string) => {
    const code = normalizeProductCode(productCode);
    const existingRules = productExclusionMap.get(code) || [];
    const activeRule = existingRules.find((rule) => rule.active);
    if (!activeRule) {
      toast('Bu urun zaten aktif dislama listesinde degil');
      return;
    }

    try {
      await adminApi.updateExclusion(activeRule.id, { active: false });
      toast.success(`${code} geri alindi`);
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dislama Kurallari</h1>
            <p className="text-gray-600 mt-1">
              Dislanan urunler musteride gorunmez ve raporlarda yer almaz.
            </p>
          </div>
          <Button onClick={() => handleOpenModal()}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Kural
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Hizli Urun Dislama</CardTitle>
            <CardDescription>
              Mikro urun koduna gore ara, tek tikla disla veya geri al.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Urun ara (kod veya ad)"
                className="pl-9"
              />
            </div>

            <div className="border rounded-md">
              {productSearchLoading ? (
                <div className="px-4 py-6 text-sm text-gray-500">Urunler yukleniyor...</div>
              ) : productSearchResults.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">Urun bulunamadi</div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto divide-y">
                  {productSearchResults.map((product) => {
                    const code = normalizeProductCode(product.mikroCode);
                    const existingRules = productExclusionMap.get(code) || [];
                    const isExcluded = existingRules.some((rule) => rule.active);

                    return (
                      <div key={product.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{product.name}</div>
                          <div className="text-xs text-gray-500">
                            <code>{code}</code>
                            {product.category?.name ? ` - ${product.category.name}` : ''}
                          </div>
                        </div>
                        {isExcluded ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleQuickUnexclude(code)}
                          >
                            Geri Al
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleQuickExclude(product)}
                          >
                            Disla
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500">
              Aktif dislanan urun sayisi: <span className="font-semibold">{activeProductExclusions.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Kurallar ({exclusions.length})</CardTitle>
              <Button variant="secondary" size="sm" onClick={fetchExclusions}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Yenile
              </Button>
            </div>
            <CardDescription>
              Aktif kurallar sistemde ilgili kayitlari dislar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Yukleniyor...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">{error}</div>
            ) : exclusions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Henuz kural olusturulmamis</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Deger</TableHead>
                    <TableHead>Aciklama</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">Islemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exclusions.map((exclusion) => (
                    <TableRow key={exclusion.id}>
                      <TableCell>
                        <div className="font-medium">{EXCLUSION_TYPE_LABELS[exclusion.type]}</div>
                        <div className="text-xs text-gray-500">{exclusion.type}</div>
                      </TableCell>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{exclusion.value}</code>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate text-sm text-gray-600">
                          {exclusion.description || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleActive(exclusion)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            exclusion.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {exclusion.active ? 'Aktif' : 'Pasif'}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{new Date(exclusion.createdAt).toLocaleDateString('tr-TR')}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(exclusion)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(exclusion.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        title={editingExclusion ? 'Kurali Duzenle' : 'Yeni Dislama Kurali'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Iptal
            </Button>
            <Button onClick={handleSubmit}>{editingExclusion ? 'Guncelle' : 'Olustur'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Kural Tipi
            </label>
            <Select
              id="type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as ExclusionType)}
              disabled={!!editingExclusion}
              className="w-full"
            >
              {Object.entries(EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="value" className="block text-sm font-medium text-gray-700">
              Deger
            </label>
            <Input
              id="value"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={formType === 'PRODUCT_CODE' ? 'Orn: B106430' : 'Deger girin'}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Aciklama (Opsiyonel)
            </label>
            <textarea
              id="description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Bu kural neden olusturuldu?"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {editingExclusion && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700 cursor-pointer">
                Kural aktif
              </label>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="Iptal"
      />
    </>
  );
}
