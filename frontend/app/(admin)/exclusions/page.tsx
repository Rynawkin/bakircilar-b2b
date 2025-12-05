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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Plus, Pencil, Trash2, RefreshCw, Filter, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { toast } from 'sonner';

interface Exclusion {
  id: string;
  type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
  value: string;
  description?: string;
  active: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

const EXCLUSION_TYPE_LABELS: Record<string, string> = {
  PRODUCT_CODE: 'Ürün Kodu',
  CUSTOMER_CODE: 'Cari Kodu',
  CUSTOMER_NAME: 'Cari Adı',
  PRODUCT_NAME: 'Ürün Adı',
  SECTOR_CODE: 'Sektör Kodu',
};

const EXCLUSION_TYPE_DESCRIPTIONS: Record<string, string> = {
  PRODUCT_CODE: 'Belirli bir ürün kodunu raporlardan hariç tut',
  CUSTOMER_CODE: 'Belirli bir cari kodunu raporlardan hariç tut',
  CUSTOMER_NAME: 'Cari adı içinde bu metni içeren tüm carileri hariç tut',
  PRODUCT_NAME: 'Ürün adı içinde bu metni içeren tüm ürünleri hariç tut',
  SECTOR_CODE: 'Belirli bir sektör kodundaki tüm carileri hariç tut',
};

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExclusion, setEditingExclusion] = useState<Exclusion | null>(null);

  // Form state
  const [formType, setFormType] = useState<string>('PRODUCT_CODE');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);

  const fetchExclusions = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getExclusions(filterActive === null ? undefined : filterActive);
      if (result.success) {
        setExclusions(result.data);
      } else {
        throw new Error('Veriler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Bir hata oluştu');
      toast.error('Hariç tutma kuralları yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, [filterActive]);

  const resetForm = () => {
    setFormType('PRODUCT_CODE');
    setFormValue('');
    setFormDescription('');
    setFormActive(true);
    setEditingExclusion(null);
  };

  const handleOpenDialog = (exclusion?: Exclusion) => {
    if (exclusion) {
      setEditingExclusion(exclusion);
      setFormType(exclusion.type);
      setFormValue(exclusion.value);
      setFormDescription(exclusion.description || '');
      setFormActive(exclusion.active);
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setTimeout(resetForm, 200); // Reset after animation
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formValue.trim()) {
      toast.error('Değer boş olamaz');
      return;
    }

    try {
      if (editingExclusion) {
        // Update existing
        await adminApi.updateExclusion(editingExclusion.id, {
          value: formValue,
          description: formDescription || undefined,
          active: formActive,
        });
        toast.success('Kural güncellendi');
      } else {
        // Create new
        await adminApi.createExclusion({
          type: formType as any,
          value: formValue,
          description: formDescription || undefined,
        });
        toast.success('Kural oluşturuldu');
      }

      handleCloseDialog();
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await adminApi.deleteExclusion(id);
      toast.success('Kural silindi');
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Silme işlemi başarısız');
    }
  };

  const handleToggleActive = async (exclusion: Exclusion) => {
    try {
      await adminApi.updateExclusion(exclusion.id, {
        active: !exclusion.active,
      });
      toast.success(exclusion.active ? 'Kural devre dışı bırakıldı' : 'Kural aktif edildi');
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'İşlem başarısız');
    }
  };

  const filteredExclusions = exclusions;

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rapor Hariç Tutma Kuralları</h1>
            <p className="text-muted-foreground mt-1">
              Raporlardan hariç tutulacak ürün ve carileri yönetin
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Yeni Kural
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingExclusion ? 'Kuralı Düzenle' : 'Yeni Hariç Tutma Kuralı'}
                </DialogTitle>
                <DialogDescription>
                  Belirli ürün veya carileri raporlardan hariç tutmak için kural oluşturun
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="type">Kural Tipi</Label>
                  <Select
                    value={formType}
                    onValueChange={setFormType}
                    disabled={!!editingExclusion}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {EXCLUSION_TYPE_DESCRIPTIONS[formType]}
                  </p>
                </div>

                {/* Value Input */}
                <div className="space-y-2">
                  <Label htmlFor="value">Değer</Label>
                  <Input
                    id="value"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder={
                      formType === 'PRODUCT_CODE'
                        ? 'Örn: B106430'
                        : formType === 'CUSTOMER_CODE'
                        ? 'Örn: C001'
                        : formType === 'CUSTOMER_NAME'
                        ? 'Örn: TEST'
                        : formType === 'PRODUCT_NAME'
                        ? 'Örn: HURDA'
                        : 'Örn: 120'
                    }
                    required
                  />
                  {(formType === 'CUSTOMER_NAME' || formType === 'PRODUCT_NAME') && (
                    <p className="text-xs text-muted-foreground">
                      Kısmi eşleşme: Bu metni içeren tüm kayıtlar hariç tutulacak
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Açıklama (İsteğe Bağlı)</Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Neden bu kuralı oluşturdunuz?"
                    rows={3}
                  />
                </div>

                {/* Active Toggle */}
                {editingExclusion && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={formActive}
                      onCheckedChange={setFormActive}
                    />
                    <Label htmlFor="active" className="cursor-pointer">
                      Kural aktif
                    </Label>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDialog}
                  >
                    İptal
                  </Button>
                  <Button type="submit">
                    {editingExclusion ? 'Güncelle' : 'Oluştur'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtreler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Durum:</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterActive === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterActive(null)}
                >
                  Tümü
                </Button>
                <Button
                  variant={filterActive === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterActive(true)}
                >
                  Aktif
                </Button>
                <Button
                  variant={filterActive === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterActive(false)}
                >
                  Pasif
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchExclusions}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Yenile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Exclusions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Kurallar ({filteredExclusions.length})</CardTitle>
            <CardDescription>
              Aktif kurallar raporlarınızdan belirtilen ürün/carileri hariç tutar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Yükleniyor...
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">{error}</div>
            ) : filteredExclusions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Henüz kural oluşturulmamış
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Değer</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Oluşturulma</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExclusions.map((exclusion) => (
                    <TableRow key={exclusion.id}>
                      <TableCell>
                        <div className="font-medium">
                          {EXCLUSION_TYPE_LABELS[exclusion.type]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {exclusion.type}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {exclusion.value}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate text-sm text-muted-foreground">
                          {exclusion.description || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={exclusion.active}
                            onCheckedChange={() => handleToggleActive(exclusion)}
                          />
                          <span className="text-sm">
                            {exclusion.active ? 'Aktif' : 'Pasif'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(exclusion.createdAt).toLocaleDateString('tr-TR')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(exclusion.createdAt).toLocaleTimeString('tr-TR')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(exclusion)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(exclusion.id)}
                            className="text-destructive hover:text-destructive"
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
    </>
  );
}
