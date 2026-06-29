'use client';

import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Plus, Pencil, RefreshCw } from 'lucide-react';
import { useTedarikciIskonto } from './useTedarikciIskonto';

/**
 * Klasik gorunum — mevcut JSX birebir korunur. Tum mantik useTedarikciIskonto'tan gelir.
 */
export default function TedarikciIskontoClassic() {
  const {
    suppliers,
    loading,
    saving,
    modalOpen,
    editingSupplier,
    form,
    setForm,
    discountSummary,
    loadSuppliers,
    openModal,
    closeModal,
    addDiscountRule,
    removeDiscountRule,
    updateDiscountRule,
    handleSave,
    buildDiscountSummary,
  } = useTedarikciIskonto();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tedarikci Iskonto Ayarlari</h1>
          <p className="text-muted-foreground">Tedarikci bazli iskonto ve dosya eslestirme ayarlarini yonetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadSuppliers} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Yenile
          </Button>
          <Button onClick={() => openModal()} className="gap-2">
            <Plus className="h-4 w-4" />
            Yeni Tedarikci
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mevcut Tedarikciler</CardTitle>
          <CardDescription>Iskonto ve eslestirme ayarlarini duzenleyin.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Yukleniyor...</div>
          ) : suppliers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Henuz tedarikci yok.</div>
          ) : (
            <div className="space-y-3">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{supplier.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Iskonto: {buildDiscountSummary(supplier)} | Durum: {supplier.active ? 'Aktif' : 'Pasif'}
                      {Array.isArray(supplier.discountRules) && supplier.discountRules.length > 0
                        ? ` | Ozel Kural: ${supplier.discountRules.length}`
                        : ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openModal(supplier)} className="gap-2">
                    <Pencil className="h-4 w-4" />
                    Duzenle
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingSupplier ? `Tedarikci Duzenle (${discountSummary || 'Iskonto'})` : 'Yeni Tedarikci'}
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Iptal
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Tedarikci Adi"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Select
              label="Durum"
              value={form.active ? 'active' : 'inactive'}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === 'active' }))}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </Select>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Iskonto Kurallari</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input label="Iskonto 1" value={form.discount1} onChange={(e) => setForm((prev) => ({ ...prev, discount1: e.target.value }))} />
              <Input label="Iskonto 2" value={form.discount2} onChange={(e) => setForm((prev) => ({ ...prev, discount2: e.target.value }))} />
              <Input label="Iskonto 3" value={form.discount3} onChange={(e) => setForm((prev) => ({ ...prev, discount3: e.target.value }))} />
              <Input label="Iskonto 4" value={form.discount4} onChange={(e) => setForm((prev) => ({ ...prev, discount4: e.target.value }))} />
              <Input label="Iskonto 5" value={form.discount5} onChange={(e) => setForm((prev) => ({ ...prev, discount5: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Bos birakilirsa net liste kabul edilir.</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-lg font-semibold">Ozel Iskonto Kurallari</h3>
              <Button variant="outline" size="sm" onClick={addDiscountRule}>
                Kural Ekle
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Urun adinda gecen kelimelere gore iskonto uygular. Orn: eko, ekonomik = %15.
            </p>
            {form.discountRules.length === 0 ? (
              <div className="text-xs text-muted-foreground">Ozel kural yok.</div>
            ) : (
              <div className="space-y-3">
                {form.discountRules.map((rule, index) => (
                  <div key={`rule-${index}`} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          label="Anahtar Kelimeler"
                          value={rule.keywords}
                          onChange={(e) => updateDiscountRule(index, 'keywords', e.target.value)}
                          placeholder="eko, ekonomik"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeDiscountRule(index)}
                      >
                        Sil
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <Input
                        label="Iskonto 1"
                        value={rule.discount1}
                        onChange={(e) => updateDiscountRule(index, 'discount1', e.target.value)}
                      />
                      <Input
                        label="Iskonto 2"
                        value={rule.discount2}
                        onChange={(e) => updateDiscountRule(index, 'discount2', e.target.value)}
                      />
                      <Input
                        label="Iskonto 3"
                        value={rule.discount3}
                        onChange={(e) => updateDiscountRule(index, 'discount3', e.target.value)}
                      />
                      <Input
                        label="Iskonto 4"
                        value={rule.discount4}
                        onChange={(e) => updateDiscountRule(index, 'discount4', e.target.value)}
                      />
                      <Input
                        label="Iskonto 5"
                        value={rule.discount5}
                        onChange={(e) => updateDiscountRule(index, 'discount5', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Fiyat Tipi</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label="Fiyat Kaynagi"
                value={form.priceIsNet ? 'net' : 'list'}
                onChange={(e) => setForm((prev) => ({ ...prev, priceIsNet: e.target.value === 'net' }))}
              >
                <option value="list">Liste fiyat (iskonto uygulanir)</option>
                <option value="net">Net fiyat (iskonto yok)</option>
              </Select>
              <Select
                label="KDV Durumu"
                value={form.priceIncludesVat ? 'with' : 'without'}
                onChange={(e) => setForm((prev) => ({ ...prev, priceIncludesVat: e.target.value === 'with' }))}
              >
                <option value="without">KDV haric</option>
                <option value="with">KDV dahil</option>
              </Select>
              <Select
                label="Renkli/Siyah Ayrimi"
                value={form.priceByColor ? 'on' : 'off'}
                onChange={(e) => setForm((prev) => ({ ...prev, priceByColor: e.target.value === 'on' }))}
              >
                <option value="off">Tek fiyat</option>
                <option value="on">Siyah urunlerde dusuk fiyat</option>
              </Select>
              <Input
                label="Varsayilan KDV Orani"
                value={form.defaultVatRate}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultVatRate: e.target.value }))}
                placeholder="0.20"
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Excel Eslestirme</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Sheet Adi"
                value={form.excelSheetName}
                onChange={(e) => setForm((prev) => ({ ...prev, excelSheetName: e.target.value }))}
                placeholder="Orn: Subat'26"
              />
              <Input
                label="Baslik Satiri"
                value={form.excelHeaderRow}
                onChange={(e) => setForm((prev) => ({ ...prev, excelHeaderRow: e.target.value }))}
                placeholder="Orn: 3"
              />
              <Input
                label="Urun Kodu Basligi"
                value={form.excelCodeHeader}
                onChange={(e) => setForm((prev) => ({ ...prev, excelCodeHeader: e.target.value }))}
                placeholder="Orn: Urun Kodu"
              />
              <Input
                label="Urun Adi Basligi"
                value={form.excelNameHeader}
                onChange={(e) => setForm((prev) => ({ ...prev, excelNameHeader: e.target.value }))}
                placeholder="Orn: Urun Adi"
              />
              <Input
                label="Fiyat Basligi"
                value={form.excelPriceHeader}
                onChange={(e) => setForm((prev) => ({ ...prev, excelPriceHeader: e.target.value }))}
                placeholder="Orn: Tavsiye Birim Satis Fiyati"
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">PDF Eslestirme</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Fiyat Sira No"
                value={form.pdfPriceIndex}
                onChange={(e) => setForm((prev) => ({ ...prev, pdfPriceIndex: e.target.value }))}
                placeholder="Orn: 1 (ilk fiyat)"
              />
              <Input
                label="Kod Regex (opsiyonel)"
                value={form.pdfCodePattern}
                onChange={(e) => setForm((prev) => ({ ...prev, pdfCodePattern: e.target.value }))}
                placeholder="Orn: [A-Z]{2,}\\d+"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
