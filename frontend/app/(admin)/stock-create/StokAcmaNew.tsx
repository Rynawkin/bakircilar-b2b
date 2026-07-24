'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  History,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CopyButton,
  CopyableInput,
  FactorDirection,
  LookupField,
  costPFromCostT,
  formatDateTime,
  useStokAcma,
} from './useStokAcma';

/**
 * Yeni gorunum (redesign) — Bakircilar Yonetim Paneli tasarim diline gore.
 * Beyaz kart #fff / border #e7ebf2 / radius 12px, primary #15356b, koyu hero #0c2247,
 * ink #14223b/#51607a/#8b97ac, durum renkleri emerald/amber/red, lucide ikon, EMOJI YOK.
 *
 * Tum mantik useStokAcma hook'undan gelir; lookup/kopyala ureten alanlar mantigi koruyan
 * paylasilan bilesenlerden (LookupField/CopyableInput/CopyButton) saglanir.
 * SADECE tekli, gorsel-zorunlu stok acma akisi vardir (toplu/Excel akisi kaldirildi).
 */

// Yeni tema input/label sinifi (acik, duz #15356b odakli). Mantik degismez, sadece gorsel.
const nLabel = 'mb-1 block text-[11px] font-medium text-[#8b97ac]';
const nInput =
  'w-full h-[38px] rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/10';

export default function StokAcmaNew() {
  const {
    nextCode,
    defaultTemplateCode,
    unitNames,
    form,
    previewRows,
    historyRows,
    templateStock,
    templateLoading,
    stockFamilyOptions,
    priceFamilyOptions,
    editingStockCode,
    editLoading,
    updating,
    loading,
    creating,
    activateMode,
    activating,
    hasExistingImage,
    existingImageUrl,
    hasErrors,
    user,
    permissionsLoading,
    router,
    loadMetadata,
    applyTemplateDefaults,
    loadTemplate,
    copyFromTemplate,
    updateTemplateCode,
    updateForm,
    updateVatRatePercent,
    updateCostT,
    updateCostP,
    updateMargin,
    addExtraUnit,
    updateExtraUnit,
    removeExtraUnit,
    setCalculateMinMax,
    toggleStockFamily,
    setPriceFamily,
    handleImageChange,
    clearImage,
    cancelEditMode,
    loadStockForEdit,
    preview,
    createStocks,
    activateStock,
    updateExistingStock,
  } = useStokAcma();

  // Aile secicilerde arama + "icindekiler" modali (dogru aileye ekledigini teyit icin)
  const [stockFamilySearch, setStockFamilySearch] = useState('');
  const [priceFamilySearch, setPriceFamilySearch] = useState('');
  const [membersModal, setMembersModal] = useState<null | { title: string; members: { productCode: string; productName: string }[] }>(null);
  const famMatch = (f: { name: string; code?: string | null }, q: string) => {
    const s = q.trim().toLocaleLowerCase('tr');
    if (!s) return true;
    return f.name.toLocaleLowerCase('tr').includes(s) || String(f.code || '').toLocaleLowerCase('tr').includes(s);
  };
  const displayedImageUrl = form.imagePreviewUrl || (activateMode ? existingImageUrl : null);
  const needsActivationImage = Boolean(activateMode && !hasExistingImage && !form.image);

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#15356b]" />
      </div>
    );
  }

  // Yeni tema durum stilleri (onizleme kartlari icin)
  const newStatusCard = {
    valid: 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]',
    warning: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
    error: 'border-[#fecaca] bg-[#fff7f7] text-[#b91c1c]',
  } as const;

  const newLogStatus = (status: string) => {
    if (status === 'CREATED') return 'bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]';
    if (status === 'ACTIVATED') return 'bg-[#f5f3ff] text-[#6d28d9] border border-[#c4b5fd]';
    if (status === 'UPDATED') return 'bg-[#eef2fa] text-[#15356b] border border-[#d6e0f1]';
    return 'bg-[#fff7f7] text-[#b91c1c] border border-[#fecaca]';
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#14223b]">
      <datalist id="stock-create-unit-names">
        {unitNames.map((unitName) => (
          <option key={unitName} value={unitName} />
        ))}
      </datalist>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {/* Baslik */}
        <div className="mb-4 mt-1">
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">
            {activateMode ? 'Pasif Stok Aktiflestir' : 'Yeni Stok Acma'}
          </h1>
          <div className="mt-1.5 text-[13px] text-[#8b97ac]">
            {activateMode
              ? `Mevcut ${activateMode} stok kartinin bilgileri tamamlanip ayni kodla aktiflestirilir`
              : 'Mikro stok karti olustur · gorsel zorunlu'}
          </div>
        </div>

        {/* Siradaki kod / varsayilan sablon seridi */}
        {activateMode ? (
          <div className="mb-4 flex flex-wrap items-center gap-5 rounded-xl bg-[#4c1d95] px-[18px] py-[14px] text-white">
            <div>
              <div className="text-[10.5px] text-[#ddd6fe]">Aktiflesecek Stok</div>
              <div className="font-mono text-[15px] font-semibold">{activateMode}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#ddd6fe]">Mikroda Degisecek Alan</div>
              <div className="text-[15px] font-semibold">Kart Bilgileri + Pasif → Aktif</div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11.5px] text-[#ede9fe]">
              <ShieldCheck className="h-4 w-4 text-[#a7f3d0]" />
              Yeni stok kodu uretilmez; mevcut kart ayni kodla guncellenir
            </div>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-5 rounded-xl bg-[#0c2247] px-[18px] py-[14px]">
            <div>
              <div className="text-[10.5px] text-[#7d93bd]">Siradaki Kod</div>
              <div className="font-mono text-[15px] font-semibold text-white">{nextCode || '-'}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#7d93bd]">Son Acilan Stok</div>
              <div className="text-[15px] font-semibold text-white">{defaultTemplateCode || '-'}</div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11.5px] text-[#9bb0d4]">
              <ShieldCheck className="h-4 w-4 text-[#6ee7b7]" />
              Guvenli yazim: sablon kopyala · referans dogrula · kod transaction kilidiyle uretilir
            </div>
          </div>
        )}

        {/* Ust aksiyonlar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-[#d6e0f1] bg-[#eef2fa] px-[14px] py-2 text-[12.5px] font-semibold text-[#15356b]">
            {editingStockCode ? 'Stok Duzenle' : activateMode ? 'Pasif Stok Aktiflestir' : 'Tekli Stok Ac'}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadMetadata()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-[13px] py-[9px] text-[12.5px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-[#e7ebf2] bg-white p-[18px]">
                {/* Form basligi + olusacak/duzenlenen kod */}
                <div className="mb-3.5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="m-0 text-[16px] font-semibold text-[#14223b]">
                      {editingStockCode
                        ? `Stok Duzenle — ${editingStockCode}`
                        : activateMode
                        ? `Pasif Stok Aktiflestir — ${activateMode}`
                        : 'Tekli Stok Bilgileri'}
                    </h2>
                    <p className="mt-1 text-[12px] text-[#8b97ac]">
                      {editingStockCode
                        ? 'Bu mod mevcut Mikro stok kartini gunceller; stok kodu degismez.'
                        : activateMode
                        ? 'Eksik veya hatali alanlari duzeltin; mevcut kart ayni kodla guncellenip aktiflestirilir.'
                        : 'Zorunlu alanlari doldurun, once on kontrol calistirin.'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#d6e0f1] bg-[#eef2fa] px-[14px] py-2 text-right">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-[#15356b]">
                      {editingStockCode ? 'Duzenlenen Kod' : activateMode ? 'Aktiflesecek Kod' : 'Olusacak Kod'}
                    </div>
                    <div className="font-mono text-[18px] font-semibold text-[#0c2247]">
                      {editingStockCode || activateMode || previewRows[0]?.previewCode || nextCode || '-'}
                    </div>
                  </div>
                </div>

                {/* Duzenleme modu seridi */}
                {editingStockCode && (
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-[14px] py-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#1d4ed8]">Duzenleme modu</div>
                      <div className="line-clamp-1 text-[13px] font-semibold text-[#1e3a8a]">
                        {editingStockCode} - {form.name || 'Stok adi bos'}
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-[#2563eb]">
                        Kaydet butonu yeni stok acmaz; bu stok kartinin mevcut verilerini gunceller.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEditMode}
                      className="rounded-lg border border-[#d8e0ec] bg-white px-[13px] py-[7px] text-[12px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa]"
                    >
                      Yeni stok moduna don
                    </button>
                  </div>
                )}

                {/* Pasif stok aktiflestirme seridi */}
                {activateMode && (
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c4b5fd] bg-[#f5f3ff] px-[14px] py-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6d28d9]">Pasif stok aktiflestiriliyor</div>
                      <div className="line-clamp-1 text-[13px] font-semibold text-[#5b21b6]">
                        {activateMode} - {form.name || 'Stok adi bos'}
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-[#7c3aed]">
                        On kontrol zorunlu alanlari ve hedef kartin pasif oldugunu dogrular. Kayitta yeni stok acilmaz.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push('/passive-stocks')}
                      className="rounded-lg border border-[#d8e0ec] bg-white px-[13px] py-[7px] text-[12px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa]"
                    >
                      Pasif stok listesine don
                    </button>
                  </div>
                )}

                {activateMode && (
                  <div className="grid gap-3 rounded-lg border border-[#e7ebf2] bg-[#fafbfd] p-4 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Stok Kodu</div>
                      <div className="mt-1 font-mono font-semibold text-[#14223b]">{activateMode}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Stok Adi</div>
                      <div className="mt-1 font-semibold text-[#14223b]">{form.name || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Kategori</div>
                      <div className="mt-1 font-mono font-semibold text-[#14223b]">{form.categoryCode || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Ana Saglayici</div>
                      <div className="mt-1 font-mono font-semibold text-[#14223b]">{form.supplierCode || '-'}</div>
                    </div>
                  </div>
                )}

                <div>

                {/* Aktif sablon seridi */}
                {!editingStockCode && !activateMode && templateStock && (
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-[14px] py-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#047857]">Aktif sablon</div>
                      <div className="line-clamp-1 text-[13px] font-semibold text-[#065f46]">
                        {templateStock.templateCode} - {templateStock.name}
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-[#047857]">
                        Otomatik sadece kategori, KDV ve marjlar alinir; diger alanlar kopyala butonuyla aktarilir.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyTemplateDefaults(templateStock)}
                      className="rounded-lg border border-[#047857] bg-[#047857] px-[13px] py-[7px] text-[12px] font-semibold text-white transition hover:bg-[#065f46]"
                    >
                      Kategori/KDV/Marj Yenile
                    </button>
                  </div>
                )}

                {/* Ana alanlar */}
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <CopyableInput
                      label="Stok Adi *"
                      value={form.name}
                      onChange={(name) => updateForm({ name })}
                      placeholder="Urun adi"
                      copyValue={templateStock?.name}
                      onCopy={() => copyFromTemplate({ name: templateStock?.name || '' })}
                    />
                  </div>
                  <div>
                    {editingStockCode || activateMode ? (
                      <>
                        <label className={nLabel}>Stok Kodu</label>
                        <input value={(editingStockCode || activateMode) as string} readOnly className={`${nInput} bg-[#fafbfd] text-[#8b97ac]`} />
                      </>
                    ) : (
                      <>
                        <LookupField
                          label="Sablon Stok"
                          type="template"
                          value={form.templateCode}
                          placeholder="Kod veya stok adi ara"
                          onChange={(templateCode, item) => {
                            const code = (item?.code || templateCode).toUpperCase();
                            updateTemplateCode(code);
                            if (item?.code) void loadTemplate(item.code, true);
                          }}
                        />
                        {templateLoading && <div className="mt-1 text-[11px] font-medium text-[#047857]">Sablon bilgileri aliniyor...</div>}
                      </>
                    )}
                  </div>
                  <CopyableInput
                    label="Tedarikci Urun Kodu"
                    value={form.foreignName}
                    onChange={(foreignName) => updateForm({ foreignName })}
                    placeholder="Orn. 50003071"
                    copyValue={templateStock?.foreignName}
                    onCopy={() => copyFromTemplate({ foreignName: templateStock?.foreignName || '' })}
                  />
                  <CopyableInput
                    label="Kisa Isim"
                    value={form.shortName}
                    onChange={(shortName) => updateForm({ shortName })}
                    placeholder="Opsiyonel"
                    copyValue={templateStock?.shortName}
                    onCopy={() => copyFromTemplate({ shortName: templateStock?.shortName || '' })}
                  />
                  <div>
                    <label className={nLabel}>KDV % *</label>
                    <div className="relative">
                      <select
                        value={form.vatRatePercent}
                        onChange={(event) => updateVatRatePercent(event.target.value)}
                        className={`${nInput} cursor-pointer ${templateStock?.vatRatePercent ? 'pr-11' : ''}`}
                      >
                        <option value="20">%20</option>
                        <option value="10">%10</option>
                        <option value="1">%1</option>
                        <option value="0">%0</option>
                      </select>
                      <CopyButton value={templateStock?.vatRatePercent} onCopy={() => copyFromTemplate({ vatRatePercent: templateStock?.vatRatePercent || '20' })} />
                    </div>
                  </div>
                  <LookupField
                    label="Ana Saglayici *"
                    type="supplier"
                    value={form.supplierCode}
                    onChange={(supplierCode) => updateForm({ supplierCode })}
                    copyValue={templateStock?.supplierCode}
                    onCopy={() => copyFromTemplate({ supplierCode: templateStock?.supplierCode || '' })}
                  />
                  <LookupField
                    label="Marka *"
                    type="brand"
                    value={form.brandCode}
                    onChange={(brandCode, item) => updateForm({ brandCode: brandCode.toUpperCase(), brandName: item?.name || '' })}
                    copyValue={templateStock?.brandCode}
                    onCopy={() => copyFromTemplate({ brandCode: templateStock?.brandCode || '', brandName: templateStock?.brandName || '' })}
                  />
                  <CopyableInput
                    label="Marka Adi (yeni marka icin)"
                    value={form.brandName}
                    onChange={(brandName) => updateForm({ brandName })}
                    placeholder="Kod Mikroda yoksa zorunlu"
                    copyValue={templateStock?.brandName}
                    onCopy={() => copyFromTemplate({ brandName: templateStock?.brandName || '' })}
                  />
                  <LookupField
                    label="Kategori * (en alt kategori)"
                    type="category"
                    value={form.categoryCode}
                    placeholder="Orn. 1.09.04"
                    onChange={(categoryCode) => updateForm({ categoryCode })}
                    copyValue={templateStock?.categoryCode}
                    onCopy={() => copyFromTemplate({ categoryCode: templateStock?.categoryCode || '' })}
                  />
                  <LookupField
                    label="Ambalaj"
                    type="package"
                    value={form.packageCode}
                    placeholder="Opsiyonel"
                    onChange={(packageCode, item) => updateForm({ packageCode, packageName: item?.name || '' })}
                    copyValue={templateStock?.packageCode}
                    onCopy={() => copyFromTemplate({ packageCode: templateStock?.packageCode || '', packageName: templateStock?.packageName || '' })}
                  />
                  <CopyableInput
                    label="Ambalaj Adi (yeni ambalaj icin)"
                    value={form.packageName}
                    onChange={(packageName) => updateForm({ packageName })}
                    placeholder="Ambalaj kodu girildiyse ve Mikroda yoksa gerekli"
                    copyValue={templateStock?.packageName}
                    onCopy={() => copyFromTemplate({ packageName: templateStock?.packageName || '' })}
                  />
                  <CopyableInput
                    label="Ana Birim *"
                    value={form.mainUnit}
                    onChange={(mainUnit) => updateForm({ mainUnit: mainUnit.toUpperCase() })}
                    list="stock-create-unit-names"
                    copyValue={templateStock?.mainUnit}
                    onCopy={() => copyFromTemplate({ mainUnit: templateStock?.mainUnit || '' })}
                  />
                  <CopyableInput
                    label="Maliyet T (KDV haric)"
                    value={form.costT}
                    onChange={updateCostT}
                    placeholder="KDV haric"
                    copyValue={templateStock?.costT}
                    onCopy={() => {
                      const costT = templateStock?.costT || '';
                      const costP = costPFromCostT(costT, form.vatRatePercent) || templateStock?.costP || '';
                      copyFromTemplate({ costT, costP, currentCost: costT });
                    }}
                  />
                  <CopyableInput
                    label="Maliyet P (yarim KDV otomatik)"
                    value={form.costP}
                    onChange={updateCostP}
                    placeholder="Yarim KDV otomatik"
                    copyValue={templateStock?.costP}
                    onCopy={() => copyFromTemplate({ costP: templateStock?.costP || '' })}
                  />
                  <CopyableInput
                    label="Raf / Reyon Kodu"
                    value={form.shelfCode}
                    onChange={(shelfCode) => updateForm({ shelfCode: shelfCode.toUpperCase() })}
                    placeholder="Opsiyonel"
                    copyValue={templateStock?.shelfCode}
                    onCopy={() => copyFromTemplate({ shelfCode: templateStock?.shelfCode || '' })}
                  />
                </div>

                {/* Ana birim olculeri */}
                <div className="mt-3.5 border-t border-[#eef1f6] pt-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div>
                      <h3 className="m-0 text-[12px] font-semibold text-[#14223b]">Ana Birim Olculeri</h3>
                      <p className="mt-0.5 text-[11px] text-[#8b97ac]">Ekranda cm girilir; Mikroya en/boy/yukseklik mm olarak kaydedilir.</p>
                    </div>
                    <span className="rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-2.5 py-1 text-[10.5px] font-semibold text-[#15356b]">
                      1 {form.mainUnit || 'ANA BIRIM'}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <CopyableInput
                      label="Ana Birim Kg"
                      value={form.mainUnitWeightKg}
                      onChange={(mainUnitWeightKg) => updateForm({ mainUnitWeightKg })}
                      placeholder="Kg"
                      copyValue={templateStock?.mainUnitWeightKg}
                      onCopy={() => copyFromTemplate({ mainUnitWeightKg: templateStock?.mainUnitWeightKg || '' })}
                    />
                    <CopyableInput
                      label="Ana Birim En cm"
                      value={form.mainUnitWidthCm}
                      onChange={(mainUnitWidthCm) => updateForm({ mainUnitWidthCm })}
                      placeholder="En cm"
                      copyValue={templateStock?.mainUnitWidthCm}
                      onCopy={() => copyFromTemplate({ mainUnitWidthCm: templateStock?.mainUnitWidthCm || '' })}
                    />
                    <CopyableInput
                      label="Ana Birim Boy cm"
                      value={form.mainUnitLengthCm}
                      onChange={(mainUnitLengthCm) => updateForm({ mainUnitLengthCm })}
                      placeholder="Boy cm"
                      copyValue={templateStock?.mainUnitLengthCm}
                      onCopy={() => copyFromTemplate({ mainUnitLengthCm: templateStock?.mainUnitLengthCm || '' })}
                    />
                    <CopyableInput
                      label="Ana Birim Yukseklik cm"
                      value={form.mainUnitHeightCm}
                      onChange={(mainUnitHeightCm) => updateForm({ mainUnitHeightCm })}
                      placeholder="Yukseklik cm"
                      copyValue={templateStock?.mainUnitHeightCm}
                      onCopy={() => copyFromTemplate({ mainUnitHeightCm: templateStock?.mainUnitHeightCm || '' })}
                    />
                  </div>
                </div>

                {/* Marjlar */}
                <div className="mt-3.5 border-t border-[#eef1f6] pt-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="m-0 text-[12px] font-semibold text-[#14223b]">Kar Marjlari (1-6) *</h3>
                    <span className="text-[10.5px] text-[#8b97ac]">Virgul veya nokta kabul edilir</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    {form.margins.map((margin, index) => (
                      <div key={index}>
                        <label className={nLabel}>Marj {index + 1}</label>
                        <div className="relative">
                          <input
                            value={margin}
                            onChange={(event) => updateMargin(index, event.target.value)}
                            className={`${nInput} text-center ${templateStock?.margins?.[index] ? 'pr-9' : ''}`}
                          />
                          <CopyButton value={templateStock?.margins?.[index]} onCopy={() => updateMargin(index, templateStock?.margins?.[index] || '')} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ek birimler */}
                <div className="mt-3.5 border-t border-[#eef1f6] pt-3.5">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="m-0 text-[12px] font-semibold text-[#14223b]">Ek Birimler (maks 3)</h3>
                      <p className="mt-0.5 text-[11px] text-[#8b97ac]">Ana birim zorunlu. 2-4. birimler istege bagli olarak katsayilariyla yazilir.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {templateStock?.extraUnits?.length ? (
                        <button
                          type="button"
                          onClick={() => copyFromTemplate({ extraUnits: templateStock.extraUnits })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-[11px] py-[6px] text-[11.5px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Sablon Birimleri
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={addExtraUnit}
                        disabled={form.extraUnits.length >= 3}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6e0f1] bg-[#eef2fa] px-[11px] py-[6px] text-[11.5px] font-semibold text-[#15356b] transition hover:bg-[#dde7f6] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Birim Ekle
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {form.extraUnits.length === 0 && (
                      <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-3.5 text-[12px] text-[#8b97ac]">
                        Ek birim yok. Ihtiyac varsa "Birim Ekle" ile tanimlayin.
                      </div>
                    )}
                    {form.extraUnits.map((unit) => {
                      const templateUnit = templateStock?.extraUnits?.find((item) => item.index === unit.index);
                      return (
                        <div key={unit.index} className="rounded-lg border border-[#e7ebf2] bg-[#fafbfd] p-3.5">
                          <div className="mb-2.5 flex items-center justify-between">
                            <div className="text-[12px] font-semibold text-[#14223b]">{unit.index}. Birim</div>
                            <button
                              type="button"
                              onClick={() => removeExtraUnit(unit.index)}
                              className="rounded-md p-1.5 text-[#b91c1c] transition hover:bg-[#fff7f7]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid gap-3 lg:grid-cols-4">
                            <CopyableInput
                              label="Birim Adi"
                              value={unit.name}
                              onChange={(name) => updateExtraUnit(unit.index, { name: name.toUpperCase() })}
                              list="stock-create-unit-names"
                              copyValue={templateUnit?.name}
                              onCopy={() => updateExtraUnit(unit.index, { name: templateUnit?.name || '' })}
                            />
                            <CopyableInput
                              label="Katsayi"
                              value={unit.factor}
                              onChange={(factor) => updateExtraUnit(unit.index, { factor })}
                              placeholder="Orn. 6"
                              copyValue={templateUnit?.factor}
                              onCopy={() => updateExtraUnit(unit.index, { factor: templateUnit?.factor || '' })}
                            />
                            <div className="lg:col-span-2">
                              <label className={nLabel}>Katsayi Yonu</label>
                              <div className="relative">
                                <select
                                  value={unit.factorDirection}
                                  onChange={(event) => updateExtraUnit(unit.index, { factorDirection: event.target.value as FactorDirection })}
                                  className={`${nInput} cursor-pointer ${templateUnit?.factorDirection ? 'pr-9' : ''}`}
                                >
                                  <option value="larger">Buyuk birim: 1 {unit.name || 'birim'} = X {form.mainUnit || 'ana birim'} (Mikro negatif)</option>
                                  <option value="smaller">Mikro pozitif / ters katsayi</option>
                                </select>
                                <CopyButton value={templateUnit?.factorDirection} onCopy={() => updateExtraUnit(unit.index, { factorDirection: templateUnit?.factorDirection || 'larger' })} />
                              </div>
                            </div>
                            <CopyableInput label="Kg" value={unit.weightKg} onChange={(weightKg) => updateExtraUnit(unit.index, { weightKg })} copyValue={templateUnit?.weightKg} onCopy={() => updateExtraUnit(unit.index, { weightKg: templateUnit?.weightKg || '' })} />
                            <CopyableInput label="En cm" value={unit.widthCm} onChange={(widthCm) => updateExtraUnit(unit.index, { widthCm })} copyValue={templateUnit?.widthCm} onCopy={() => updateExtraUnit(unit.index, { widthCm: templateUnit?.widthCm || '' })} />
                            <CopyableInput label="Boy cm" value={unit.lengthCm} onChange={(lengthCm) => updateExtraUnit(unit.index, { lengthCm })} copyValue={templateUnit?.lengthCm} onCopy={() => updateExtraUnit(unit.index, { lengthCm: templateUnit?.lengthCm || '' })} />
                            <CopyableInput label="Yukseklik cm" value={unit.heightCm} onChange={(heightCm) => updateExtraUnit(unit.index, { heightCm })} copyValue={templateUnit?.heightCm} onCopy={() => updateExtraUnit(unit.index, { heightCm: templateUnit?.heightCm || '' })} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Barkod / Not */}
                <div className="mt-3.5 grid gap-3 border-t border-[#eef1f6] pt-3.5 lg:grid-cols-2">
                  <div>
                    <label className={nLabel}>Barkod</label>
                    <input value={form.barcode} onChange={(event) => updateForm({ barcode: event.target.value })} className={nInput} placeholder="Opsiyonel, Mikro barkod tanimina yazilir" />
                  </div>
                  <div>
                    <label className={nLabel}>Not</label>
                    <input value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} className={nInput} placeholder="Opsiyonel islem notu" />
                  </div>
                </div>

                {/* Min-Max hesaplansin mi (ZORUNLU) */}
                <div className="mt-3.5 border-t border-[#eef1f6] pt-3.5">
                  <div className="mb-2.5">
                    <h3 className="m-0 text-[12px] font-semibold text-[#14223b]">Min-Max hesaplansin mi? *</h3>
                    <p className="mt-0.5 text-[11px] text-[#8b97ac]">
                      Hayir → Ucarer min-max hesabina girmez (Mikro sto_model_kodu='HAYIR').
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg border border-[#e3e8f0] bg-[#fafbfd] p-1">
                    <button
                      type="button"
                      onClick={() => setCalculateMinMax(true)}
                      className={`rounded-md px-[18px] py-[7px] text-[12.5px] font-semibold transition ${
                        form.calculateMinMax === true ? 'bg-[#15356b] text-white shadow-sm' : 'bg-transparent text-[#51607a] hover:bg-[#eef2fa]'
                      }`}
                    >
                      Evet
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalculateMinMax(false)}
                      className={`rounded-md px-[18px] py-[7px] text-[12.5px] font-semibold transition ${
                        form.calculateMinMax === false ? 'bg-[#b91c1c] text-white shadow-sm' : 'bg-transparent text-[#51607a] hover:bg-[#eef2fa]'
                      }`}
                    >
                      Hayir
                    </button>
                  </div>
                </div>

                {/* Aile atamalari (opsiyonel) */}
                <div className="mt-3.5 grid gap-3.5 border-t border-[#eef1f6] pt-3.5 lg:grid-cols-2">
                  {/* Stok Ailesi - coklu secim + arama + icindekiler */}
                  <div>
                    <label className={nLabel}>Stok Ailesi (opsiyonel · coklu)</label>
                    {stockFamilyOptions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] px-3 py-2.5 text-[11.5px] text-[#8b97ac]">Tanimli stok ailesi yok.</div>
                    ) : (
                      <>
                        <div className="mb-1.5 flex h-[32px] items-center gap-1.5 rounded-lg border border-[#e3e8f0] bg-white px-2.5">
                          <Search className="h-3.5 w-3.5 shrink-0 text-[#9aa6b8]" />
                          <input
                            value={stockFamilySearch}
                            onChange={(e) => setStockFamilySearch(e.target.value)}
                            placeholder="Stok ailesi ara..."
                            className="min-w-0 flex-1 border-none bg-transparent text-[12px] text-[#14223b] outline-none"
                          />
                        </div>
                        <div className="max-h-[168px] space-y-1 overflow-auto rounded-lg border border-[#e3e8f0] bg-white p-1.5">
                          {stockFamilyOptions.filter((f) => famMatch(f, stockFamilySearch)).map((family) => {
                            const selected = form.stockFamilyIds.includes(family.id);
                            return (
                              <div key={family.id} className={`flex items-center gap-1 rounded-md ${selected ? 'bg-[#eef2fa]' : 'hover:bg-[#f4f6fa]'}`}>
                                <button
                                  type="button"
                                  onClick={() => toggleStockFamily(family.id)}
                                  className={`flex flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-[7px] text-left text-[12px] transition ${selected ? 'font-semibold text-[#15356b]' : 'text-[#51607a]'}`}
                                >
                                  <span className="line-clamp-1">{family.name}</span>
                                  {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15356b]" />}
                                </button>
                                <button
                                  type="button"
                                  title="Icindeki urunler"
                                  onClick={() => setMembersModal({ title: family.name, members: family.members })}
                                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8b97ac] hover:bg-white hover:text-[#15356b]"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          {stockFamilyOptions.filter((f) => famMatch(f, stockFamilySearch)).length === 0 && (
                            <div className="px-2 py-2 text-center text-[11.5px] text-[#9aa6b8]">Aile bulunamadi</div>
                          )}
                        </div>
                      </>
                    )}
                    {form.stockFamilyIds.length > 0 && (
                      <div className="mt-1 text-[11px] font-medium text-[#15356b]">{form.stockFamilyIds.length} aile secili</div>
                    )}
                  </div>
                  {/* Fiyat Ailesi - tekli secim + arama + icindekiler */}
                  <div>
                    <label className={nLabel}>Fiyat Ailesi (opsiyonel · tekli)</label>
                    {priceFamilyOptions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] px-3 py-2.5 text-[11.5px] text-[#8b97ac]">Tanimli fiyat ailesi yok.</div>
                    ) : (
                      <>
                        <div className="mb-1.5 flex h-[32px] items-center gap-1.5 rounded-lg border border-[#e3e8f0] bg-white px-2.5">
                          <Search className="h-3.5 w-3.5 shrink-0 text-[#9aa6b8]" />
                          <input
                            value={priceFamilySearch}
                            onChange={(e) => setPriceFamilySearch(e.target.value)}
                            placeholder="Fiyat ailesi ara..."
                            className="min-w-0 flex-1 border-none bg-transparent text-[12px] text-[#14223b] outline-none"
                          />
                        </div>
                        <div className="max-h-[168px] space-y-1 overflow-auto rounded-lg border border-[#e3e8f0] bg-white p-1.5">
                          <button
                            type="button"
                            onClick={() => setPriceFamily(null)}
                            className={`flex w-full items-center rounded-md px-2.5 py-[7px] text-left text-[12px] transition ${!form.priceFamilyId ? 'bg-[#eef2fa] font-semibold text-[#15356b]' : 'text-[#51607a] hover:bg-[#f4f6fa]'}`}
                          >
                            Secilmedi
                          </button>
                          {priceFamilyOptions.filter((f) => famMatch(f, priceFamilySearch)).map((family) => {
                            const selected = form.priceFamilyId === family.id;
                            return (
                              <div key={family.id} className={`flex items-center gap-1 rounded-md ${selected ? 'bg-[#eef2fa]' : 'hover:bg-[#f4f6fa]'}`}>
                                <button
                                  type="button"
                                  onClick={() => setPriceFamily(family.id)}
                                  className={`flex flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-[7px] text-left text-[12px] transition ${selected ? 'font-semibold text-[#15356b]' : 'text-[#51607a]'}`}
                                >
                                  <span className="line-clamp-1">{family.name}</span>
                                  {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15356b]" />}
                                </button>
                                <button
                                  type="button"
                                  title="Icindeki urunler"
                                  onClick={() => setMembersModal({ title: family.name, members: family.members })}
                                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8b97ac] hover:bg-white hover:text-[#15356b]"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          {priceFamilyOptions.filter((f) => famMatch(f, priceFamilySearch)).length === 0 && (
                            <div className="px-2 py-2 text-center text-[11.5px] text-[#9aa6b8]">Aile bulunamadi</div>
                          )}
                        </div>
                      </>
                    )}
                    <p className="mt-1 text-[11px] text-[#8b97ac]">Bir urun yalnizca bir fiyat ailesinde olabilir.</p>
                  </div>
                </div>

                {/* Urun gorseli (ZORUNLU) */}
                <div className="mt-3.5 border-t border-[#eef1f6] pt-3.5">
                  <div className="mb-2.5">
                    <h3 className="m-0 text-[12px] font-semibold text-[#14223b]">
                      Gorsel {!editingStockCode && (!activateMode || !hasExistingImage) ? '*' : ''}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[#8b97ac]">
                      {activateMode
                        ? hasExistingImage
                          ? 'Mevcut gorsel korunur. Degistirmek isterseniz yeni bir gorsel secin.'
                          : 'Bu stokta mevcut gorsel yok. Aktiflestirmek icin gorsel zorunlu.'
                        : 'Zorunlu. Gorselsiz stok acilmaz. Sadece resim dosyasi, 5MB alti.'}
                      {editingStockCode ? ' Duzenlemede gorsel opsiyoneldir.' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e3e8f0] bg-[#fafbfd]">
                      {displayedImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={displayedImageUrl} alt="Urun gorseli onizlemesi" className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-[#c7d2e3]" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="block max-w-xs text-[11.5px] text-[#51607a] file:mr-2 file:rounded-md file:border-0 file:bg-[#eef2fa] file:px-3 file:py-1.5 file:text-[11.5px] file:font-semibold file:text-[#15356b] hover:file:bg-[#dde7f6]"
                      />
                      {form.image && (
                        <div className="flex items-center gap-2">
                          <span className="line-clamp-1 max-w-[220px] text-[11.5px] font-medium text-[#14223b]">{form.image.name}</span>
                          <button
                            type="button"
                            onClick={clearImage}
                            className="inline-flex items-center gap-1 rounded-md border border-[#d8e0ec] bg-white px-2 py-1 text-[11px] font-semibold text-[#b91c1c] transition hover:bg-[#fff7f7]"
                          >
                            <X className="h-3 w-3" />
                            Kaldir
                          </button>
                        </div>
                      )}
                      {activateMode && hasExistingImage && !form.image && (
                        <span className="text-[11px] font-medium text-[#047857]">Mevcut gorsel kullanilacak.</span>
                      )}
                      {needsActivationImage && (
                        <span className="text-[11px] font-semibold text-[#b91c1c]">Gorsel secmeden aktiflestirilemez.</span>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              </div>

            {/* On kontrol / guncelleme paneli */}
            <div className="rounded-xl border border-[#e7ebf2] bg-white p-[18px]">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[15px] font-semibold text-[#14223b]">
                    {editingStockCode ? 'Stok Guncelleme' : 'On Kontrol Sonuclari'}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[#8b97ac]">
                    {editingStockCode
                      ? 'Formdaki bilgiler mevcut Mikro stok kartina yazilir. Kod sabit kalir.'
                      : activateMode
                      ? 'Alanlar ve referanslar kontrol edilir; mevcut pasif kart ayni kodla guncellenir.'
                      : 'Kolonlar ve referanslar Mikroya yazmadan once kontrol edilir.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingStockCode ? (
                    <>
                      <button
                        type="button"
                        onClick={cancelEditMode}
                        className="rounded-lg border border-[#d8e0ec] bg-white px-[14px] py-[9px] text-[12.5px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa]"
                      >
                        Vazgec
                      </button>
                      <button
                        type="button"
                        onClick={updateExistingStock}
                        disabled={updating}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2563eb] bg-[#2563eb] px-[16px] py-[9px] text-[12.5px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {updating ? 'Guncelleniyor...' : 'Mikroda Guncelle'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={preview}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-[16px] py-[9px] text-[12.5px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa] disabled:opacity-60"
                      >
                        <Search className="h-4 w-4" />
                        {loading ? 'Kontrol ediliyor...' : 'On Kontrol'}
                      </button>
                      {activateMode ? (
                        <button
                          type="button"
                          onClick={activateStock}
                          disabled={
                            activating ||
                            !previewRows.length ||
                            hasErrors ||
                            needsActivationImage ||
                            (form.calculateMinMax !== true && form.calculateMinMax !== false)
                          }
                          title={needsActivationImage ? 'Bu stokta gorsel yok; once urun gorseli secin' : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#6d28d9] bg-[#6d28d9] px-[18px] py-[9px] text-[12.5px] font-semibold text-white transition hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {activating ? 'Aktiflestiriliyor...' : 'Aktiflestir'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={createStocks}
                          disabled={
                            creating ||
                            !previewRows.length ||
                            hasErrors ||
                            !form.image ||
                            (form.calculateMinMax !== true && form.calculateMinMax !== false)
                          }
                          title={!form.image ? 'Once urun gorseli secin' : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#15356b] bg-[#15356b] px-[18px] py-[9px] text-[12.5px] font-semibold text-white transition hover:bg-[#1c4585] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {creating ? 'Yaziliyor...' : 'Mikroya Yaz'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {editingStockCode ? (
                <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[12.5px] text-[#1e40af]">
                  {editingStockCode} kodlu stok duzenleniyor. Degisiklikleri kaydetmek icin "Mikroda Guncelle" butonunu kullanin.
                </div>
              ) : previewRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-4 text-[12.5px] text-[#8b97ac]">
                  On kontrol henuz calistirilmadi.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {previewRows.map((row) => (
                    <div key={row.rowNo} className={`rounded-lg border p-3.5 ${newStatusCard[row.status]}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                            {row.status === 'valid' && <CheckCircle2 className="h-[18px] w-[18px]" />}
                            {row.status === 'warning' && <AlertTriangle className="h-[18px] w-[18px]" />}
                            {row.status === 'error' && <XCircle className="h-[18px] w-[18px]" />}
                            <span className="font-mono">Satir {row.rowNo} - {row.previewCode}</span>
                          </div>
                          <div className="mt-1 text-[12px] font-medium">{row.item.name}</div>
                        </div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide">
                          {row.status === 'valid'
                            ? activateMode ? 'Aktiflestirmeye hazir' : 'Kayda hazir'
                            : row.status === 'warning' ? 'Uyarili' : 'Hatali'}
                        </div>
                      </div>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <div className="mt-2.5 space-y-1 text-[12px]">
                          {row.errors.map((error) => <div key={error}>Hata: {error}</div>)}
                          {row.warnings.map((warning) => <div key={warning}>Uyari: {warning}</div>)}
                        </div>
                      )}
                      {row.refs && (
                        <div className="mt-2.5 grid gap-2 text-[11px] sm:grid-cols-2 xl:grid-cols-4">
                          <span>Marka: {row.refs.brand?.name || '-'}</span>
                          <span>Kategori: {row.refs.category?.name || '-'}</span>
                          <span>Ambalaj: {row.refs.package?.name || '-'}</span>
                          <span>Saglayici: {row.refs.supplier?.name || '-'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sag kolon */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[#e7ebf2] bg-white p-[15px]">
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#14223b]">
                <History className="h-4 w-4 text-[#8b97ac]" />
                Son Acilan / Duzenlenen Stoklar
              </h2>
              <div className="space-y-2.5">
                {historyRows.length === 0 && <div className="text-[12px] text-[#8b97ac]">Kayit yok</div>}
                {historyRows.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    disabled={!log.stockCode || editLoading}
                    onClick={() => void loadStockForEdit(log.stockCode)}
                    className="w-full rounded-lg border border-[#eef1f6] bg-white p-2.5 text-left transition hover:border-[#15356b] hover:shadow-[0_4px_12px_rgba(20,34,59,.08)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[12px] font-semibold text-[#14223b]">{log.stockCode || '-'}</div>
                        <div className="line-clamp-2 text-[12px] text-[#51607a]">{log.stockName}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${newLogStatus(log.status)}`}>{log.status}</span>
                    </div>
                    <div className="mt-1.5 text-[10.5px] text-[#8b97ac]">
                      {formatDateTime(log.createdAt)} {log.createdByName ? `- ${log.createdByName}` : ''}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#15356b]">
                      <Pencil className="h-3 w-3" />
                      Duzenlemek icin tikla
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#0c2247] bg-[#0c2247] p-[15px] text-white">
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
                <ImageIcon className="h-4 w-4 text-[#9bb0d4]" />
                Zorunlu Alanlar
              </h2>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#cdd9ef]">
                {[
                  'Stok Adi',
                  'Ana Saglayici',
                  'Marka',
                  'Kategori',
                  'Ana Birim',
                  'KDV',
                  'Marj 1-6',
                  'Min-Max secimi',
                  activateMode && hasExistingImage ? 'Urun gorseli mevcut' : 'Urun gorseli',
                ].map((item) => (
                  <div key={item} className="rounded-md bg-white/10 px-2.5 py-1.5">{item}</div>
                ))}
              </div>
              <p className="mt-2.5 text-[10.5px] text-[#9bb0d4]">
                {activateMode
                  ? hasExistingImage
                    ? 'Mevcut gorsel korunur; yeni gorsel yuklemek opsiyoneldir.'
                    : 'Gorsel olmadan stok aktiflestirilemez.'
                  : 'Gorsel olmadan stok acilamaz.'}{' '}
                Aile atamalari opsiyoneldir.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Aile "icindekiler" modali — dogru aileye ekledigini teyit icin */}
      {membersModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setMembersModal(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-[#eef1f6] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8b97ac]">Aile icindekiler</div>
                <div className="line-clamp-1 text-[14px] font-semibold text-[#14223b]">{membersModal.title}</div>
              </div>
              <button type="button" onClick={() => setMembersModal(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#51607a] hover:bg-[#f1f4f9]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-3">
              {membersModal.members.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12.5px] text-[#8b97ac]">Bu ailede urun yok.</div>
              ) : (
                <ul className="space-y-1">
                  {membersModal.members.map((m, i) => (
                    <li key={`${m.productCode}-${i}`} className="flex items-center gap-2 rounded-lg border border-[#eef1f6] px-3 py-2">
                      <span className="shrink-0 rounded bg-[#f1f4f9] px-1.5 py-0.5 font-mono text-[11px] text-[#51607a]">{m.productCode}</span>
                      <span className="line-clamp-1 text-[12.5px] text-[#14223b]">{m.productName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[#eef1f6] px-4 py-2.5 text-right">
              <span className="text-[11.5px] text-[#8b97ac]">{membersModal.members.length} urun</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
