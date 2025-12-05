'use client';

import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';

interface Exclusion {
  id: string;
  type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
  value: string;
  description?: string;
  active: boolean;
  createdAt: string;
}

const EXCLUSION_TYPE_LABELS: Record<string, string> = {
  PRODUCT_CODE: 'Ürün Kodu',
  CUSTOMER_CODE: 'Cari Kodu',
  CUSTOMER_NAME: 'Cari Adı',
  PRODUCT_NAME: 'Ürün Adı',
  SECTOR_CODE: 'Sektör Kodu',
};

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExclusion, setEditingExclusion] = useState<Exclusion | null>(null);
  const [formType, setFormType] = useState<string>('PRODUCT_CODE');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);

  const fetchExclusions = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getExclusions();
      if (result.success) {
        setExclusions(result.data);
      } else {
        throw new Error('Veriler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

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

    if (!formValue.trim()) {
      alert('Değer boş olamaz');
      return;
    }

    try {
      if (editingExclusion) {
        await adminApi.updateExclusion(editingExclusion.id, {
          value: formValue,
          description: formDescription || undefined,
          active: formActive,
        });
        alert('Kural güncellendi');
      } else {
        await adminApi.createExclusion({
          type: formType as any,
          value: formValue,
          description: formDescription || undefined,
        });
        alert('Kural oluşturuldu');
      }

      handleCloseModal();
      fetchExclusions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await adminApi.deleteExclusion(id);
      alert('Kural silindi');
      fetchExclusions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Silme işlemi başarısız');
    }
  };

  const handleToggleActive = async (exclusion: Exclusion) => {
    try {
      await adminApi.updateExclusion(exclusion.id, {
        active: !exclusion.active,
      });
      alert(exclusion.active ? 'Kural devre dışı bırakıldı' : 'Kural aktif edildi');
      fetchExclusions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'İşlem başarısız');
    }
  };

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rapor Hariç Tutma Kuralları</h1>
            <p className="text-gray-600 mt-1">
              Raporlardan hariç tutulacak ürün ve carileri yönetin
            </p>
          </div>
          <Button onClick={() => handleOpenModal()}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Kural
          </Button>
        </div>

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
              Aktif kurallar raporlarınızdan belirtilen ürün/carileri hariç tutar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">{error}</div>
            ) : exclusions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Henüz kural oluşturulmamış</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Değer</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
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
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {exclusion.value}
                        </code>
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
                            exclusion.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {exclusion.active ? 'Aktif' : 'Pasif'}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(exclusion.createdAt).toLocaleDateString('tr-TR')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenModal(exclusion)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(exclusion.id)}
                          >
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
        title={editingExclusion ? 'Kuralı Düzenle' : 'Yeni Hariç Tutma Kuralı'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              İptal
            </Button>
            <Button onClick={handleSubmit}>
              {editingExclusion ? 'Güncelle' : 'Oluştur'}
            </Button>
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
              onChange={(e) => setFormType(e.target.value)}
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
              Değer
            </label>
            <Input
              id="value"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="Örn: B106430"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Açıklama (İsteğe Bağlı)
            </label>
            <textarea
              id="description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Neden bu kuralı oluşturdunuz?"
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
    </>
  );
}
