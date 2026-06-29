'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  CopyButton,
  CopyableInput,
  FactorDirection,
  LookupField,
  MAX_BULK_ITEMS,
  costPFromCostT,
  formatDateTime,
  labelClass,
  logStatusStyle,
  statusStyle,
  textInputClass,
  useStokAcma,
} from './useStokAcma';

export default function StokAcmaClassic() {
  const {
    nextCode,
    defaultTemplateCode,
    unitNames,
    form,
    bulkItems,
    previewRows,
    historyRows,
    templateStock,
    templateLoading,
    editingStockCode,
    editLoading,
    updating,
    loading,
    creating,
    activeTab,
    setActiveTab,
    activeItems,
    hasErrors,
    user,
    permissionsLoading,
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
    cancelEditMode,
    loadStockForEdit,
    preview,
    createStocks,
    updateExistingStock,
    downloadTemplate,
    handleFileUpload,
    setPreviewRows,
  } = useStokAcma();

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f8fafc_32%,#eef2ff_100%)]">
      <datalist id="stock-create-unit-names">
        {unitNames.map((unitName) => (
          <option key={unitName} value={unitName} />
        ))}
      </datalist>

      <div className="mx-auto max-w-[1840px] px-4 py-8 sm:px-6 2xl:px-10">
        <div className="mb-7 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[2rem] border border-white/70 bg-slate-950 p-6 text-white shadow-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
              <PackagePlus className="h-4 w-4" />
              Mikro Stok Karti Olusturma
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Yeni Stok Acma</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
              Tekli veya Excel ile toplu stok karti acin. Sistem once Mikro referanslarini kontrol eder, sonra siradaki B kodunu transaction icinde kilitleyerek olusturur.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5">Siradaki kod: {nextCode || '-'}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Varsayilan sablon: {defaultTemplateCode}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Ana birim zorunlu, ek birimler opsiyonel</span>
            </div>
          </div>

          <Card className="rounded-[2rem] border-0 bg-white/80 p-5 shadow-xl backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Guvenli Yazim
            </h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div>1. Sablon stok karti kopyalanir.</div>
              <div>2. Zorunlu alanlar ve referanslar dogrulanir.</div>
              <div>3. Kod transaction kilidiyle uretilir.</div>
              <div>4. Mikro + B2B urun kaydi + islem gecmisi yazilir.</div>
            </div>
          </Card>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('single');
              setPreviewRows([]);
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === 'single' ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}
          >
            {editingStockCode ? 'Stok Duzenle' : 'Tekli Stok Ac'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (editingStockCode && !window.confirm('Duzenleme modu kapatilip toplu ekrana gecilsin mi?')) return;
              if (editingStockCode) cancelEditMode();
              setActiveTab('bulk');
              setPreviewRows([]);
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === 'bulk' ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}
          >
            Toplu Excel
          </button>
          <Button onClick={loadMetadata} isLoading={loading} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
            <RefreshCw className="mr-2 h-4 w-4" />
            Yenile
          </Button>
          <Button onClick={downloadTemplate} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
            <Download className="mr-2 h-4 w-4" />
            Excel Sablonu
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-4 py-2 text-base font-medium text-white transition hover:bg-emerald-700">
            <Upload className="mr-2 h-4 w-4" />
            Excel Yukle
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="space-y-6">
            {activeTab === 'single' ? (
              <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">{editingStockCode ? `Stok Duzenle - ${editingStockCode}` : 'Tekli Stok Bilgileri'}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {editingStockCode
                        ? 'Bu mod mevcut Mikro stok kartini gunceller; stok kodu degismez.'
                        : 'Zorunlu alanlari doldurun, once on kontrol calistirin.'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right">
                    <div className="text-xs font-bold uppercase text-emerald-700">{editingStockCode ? 'Duzenlenen Kod' : 'Olusacak Kod'}</div>
                    <div className="text-2xl font-black text-emerald-900">{editingStockCode || previewRows[0]?.previewCode || nextCode || '-'}</div>
                  </div>
                </div>

                {editingStockCode && (
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase text-blue-700">Duzenleme modu</div>
                      <div className="line-clamp-1 text-sm font-bold text-blue-950">{editingStockCode} - {form.name || 'Stok adi bos'}</div>
                      <div className="mt-1 text-xs font-semibold text-blue-800">Kaydet butonu yeni stok acmaz; bu stok kartinin mevcut verilerini gunceller.</div>
                    </div>
                    <Button onClick={cancelEditMode} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
                      Yeni stok moduna don
                    </Button>
                  </div>
                )}

                {!editingStockCode && templateStock && (
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase text-emerald-700">Aktif sablon</div>
                      <div className="line-clamp-1 text-sm font-bold text-emerald-950">{templateStock.templateCode} - {templateStock.name}</div>
                      <div className="mt-1 text-xs font-semibold text-emerald-800">Otomatik sadece kategori, KDV ve marjlar alinir; diger alanlar kopyala butonuyla aktarilir.</div>
                    </div>
                    <Button onClick={() => applyTemplateDefaults(templateStock)} className="bg-emerald-700 text-white hover:bg-emerald-800">
                      Kategori/KDV/Marj Yenile
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
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
                    {editingStockCode ? (
                      <>
                        <label className={labelClass}>Stok Kodu</label>
                        <input value={editingStockCode} readOnly className={`${textInputClass} bg-slate-100 text-slate-500`} />
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
                        {templateLoading && <div className="mt-1 text-xs font-semibold text-emerald-700">Sablon bilgileri aliniyor...</div>}
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
                    <label className={labelClass}>KDV % *</label>
                    <div className="relative">
                      <select value={form.vatRatePercent} onChange={(event) => updateVatRatePercent(event.target.value)} className={`${textInputClass} ${templateStock?.vatRatePercent ? 'pr-11' : ''}`}>
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
                    label="Maliyet T (Toptan)"
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
                    label="Maliyet P (Perakende)"
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

                <div className="mt-6 rounded-3xl bg-emerald-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-900">Ana Birim Olculeri</h3>
                      <p className="text-xs text-slate-500">Ekranda cm girilir; Mikroya en/boy/yukseklik mm olarak kaydedilir.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">1 {form.mainUnit || 'ANA BIRIM'}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
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

                <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-black text-slate-900">Marjlar *</h3>
                    <span className="text-xs font-semibold text-slate-500">Virgul veya nokta kabul edilir</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {form.margins.map((margin, index) => (
                      <div key={index}>
                        <label className={labelClass}>Marj {index + 1}</label>
                        <div className="relative">
                          <input value={margin} onChange={(event) => updateMargin(index, event.target.value)} className={`${textInputClass} ${templateStock?.margins?.[index] ? 'pr-11' : ''}`} />
                          <CopyButton value={templateStock?.margins?.[index]} onCopy={() => updateMargin(index, templateStock?.margins?.[index] || '')} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">Ek Birimler</h3>
                      <p className="text-xs text-slate-500">Ana birim zorunlu. 2-4. birimler istege bagli olarak katsayilariyla yazilir.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {templateStock?.extraUnits?.length ? (
                        <Button onClick={() => copyFromTemplate({ extraUnits: templateStock.extraUnits })} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
                          <Copy className="mr-2 h-4 w-4" />
                          Sablon Birimleri
                        </Button>
                      ) : null}
                      <Button onClick={addExtraUnit} disabled={form.extraUnits.length >= 3} className="bg-slate-950 text-white">
                        <Plus className="mr-2 h-4 w-4" />
                        Birim Ekle
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {form.extraUnits.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Ek birim yok. Ihtiyac varsa "Birim Ekle" ile tanimlayin.</div>}
                    {form.extraUnits.map((unit) => {
                      const templateUnit = templateStock?.extraUnits?.find((item) => item.index === unit.index);
                      return (
                        <div key={unit.index} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="font-black text-slate-900">{unit.index}. Birim</div>
                            <button type="button" onClick={() => removeExtraUnit(unit.index)} className="rounded-xl p-2 text-rose-600 hover:bg-rose-50">
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
                              <label className={labelClass}>Katsayi Yonu</label>
                              <div className="relative">
                                <select value={unit.factorDirection} onChange={(event) => updateExtraUnit(unit.index, { factorDirection: event.target.value as FactorDirection })} className={`${textInputClass} ${templateUnit?.factorDirection ? 'pr-11' : ''}`}>
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

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className={labelClass}>Barkod</label>
                    <input value={form.barcode} onChange={(event) => updateForm({ barcode: event.target.value })} className={textInputClass} placeholder="Opsiyonel, Mikro barkod tanimina yazilir" />
                  </div>
                  <div>
                    <label className={labelClass}>Not</label>
                    <input value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} className={textInputClass} placeholder="Opsiyonel islem notu" />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">Toplu Stok Acma</h2>
                    <p className="mt-1 text-sm text-slate-500">Excel satirlari on kontrolden gecer; kodlar Mikroya yazim aninda kesinlesir.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-4 py-3 text-right">
                    <div className="text-xs font-bold uppercase text-slate-500">Yuklenen Satir</div>
                    <div className="text-2xl font-black text-slate-900">{bulkItems.length}</div>
                  </div>
                </div>
                {bulkItems.length > MAX_BULK_ITEMS && (
                  <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>
                      {bulkItems.length} satir yuklendi; tek seferde en fazla {MAX_BULK_ITEMS} satir islenir. Mikroya yazim engellenir.
                      Kalan {bulkItems.length - MAX_BULK_ITEMS} satiri ayri bir parti olarak yukleyin.
                    </span>
                  </div>
                )}
                {bulkItems.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-center">
                    <FileSpreadsheet className="h-16 w-16 text-slate-300" />
                    <h3 className="mt-4 text-xl font-black text-slate-900">Excel yukleyin</h3>
                    <p className="mt-2 max-w-md text-sm text-slate-500">Sablonu indirip doldurun. Zorunlu alanlar eksikse sistem satir satir gosterecek.</p>
                  </div>
                ) : (
                  <div className="overflow-auto rounded-2xl border border-slate-200">
                    <table className="min-w-[1100px] w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Stok Adi</th>
                          <th className="px-3 py-3">Tedarikci</th>
                          <th className="px-3 py-3">Marka</th>
                          <th className="px-3 py-3">Kategori</th>
                          <th className="px-3 py-3">Ambalaj</th>
                          <th className="px-3 py-3">Ana Birim</th>
                          <th className="px-3 py-3">Marjlar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {bulkItems.slice(0, 80).map((item, index) => (
                          <tr key={`${item.name}-${index}`}>
                            <td className="px-3 py-3 font-bold text-slate-500">{index + 1}</td>
                            <td className="max-w-[360px] px-3 py-3 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-3 py-3">{item.supplierCode}</td>
                            <td className="px-3 py-3">{item.brandCode}</td>
                            <td className="px-3 py-3">{item.categoryCode}</td>
                            <td className="px-3 py-3">{item.packageCode || '-'}</td>
                            <td className="px-3 py-3">{item.mainUnit}</td>
                            <td className="px-3 py-3">{item.margins.join(' / ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkItems.length > 80 && <div className="bg-slate-50 px-4 py-3 text-sm text-slate-500">Ilk 80 satir gosteriliyor.</div>}
                  </div>
                )}
              </Card>
            )}

            <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">{editingStockCode ? 'Stok Guncelleme' : 'On Kontrol Sonuclari'}</h2>
                  <p className="text-sm text-slate-500">
                    {editingStockCode
                      ? 'Formdaki bilgiler mevcut Mikro stok kartina yazilir. Kod sabit kalir.'
                      : 'Kolonlar ve referanslar Mikroya yazmadan once kontrol edilir.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingStockCode ? (
                    <>
                      <Button onClick={cancelEditMode} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
                        Vazgec
                      </Button>
                      <Button onClick={updateExistingStock} isLoading={updating} className="bg-blue-600 text-white hover:bg-blue-700">
                        <Save className="mr-2 h-4 w-4" />
                        Mikroda Guncelle
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={preview} isLoading={loading} className="bg-slate-950 text-white">
                        <Search className="mr-2 h-4 w-4" />
                        On Kontrol
                      </Button>
                      <Button onClick={createStocks} isLoading={creating} disabled={!previewRows.length || hasErrors || activeItems.length > MAX_BULK_ITEMS} className="bg-emerald-600 text-white hover:bg-emerald-700">
                        <Save className="mr-2 h-4 w-4" />
                        Mikroya Yaz
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {editingStockCode ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 text-sm text-blue-800">
                  {editingStockCode} kodlu stok duzenleniyor. Degisiklikleri kaydetmek icin "Mikroda Guncelle" butonunu kullanin.
                </div>
              ) : previewRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">On kontrol henuz calistirilmadi.</div>
              ) : (
                <div className="space-y-3">
                  {previewRows.map((row) => (
                    <div key={row.rowNo} className={`rounded-2xl border p-4 ${statusStyle[row.status]}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black">
                            {row.status === 'valid' && <CheckCircle2 className="h-5 w-5" />}
                            {row.status === 'warning' && <AlertTriangle className="h-5 w-5" />}
                            {row.status === 'error' && <XCircle className="h-5 w-5" />}
                            Satir {row.rowNo} - {row.previewCode}
                          </div>
                          <div className="mt-1 text-sm font-semibold">{row.item.name}</div>
                        </div>
                        <div className="text-xs font-bold uppercase">{row.status === 'valid' ? 'Kayda hazir' : row.status === 'warning' ? 'Uyarili' : 'Hatali'}</div>
                      </div>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <div className="mt-3 space-y-1 text-sm">
                          {row.errors.map((error) => <div key={error}>Hata: {error}</div>)}
                          {row.warnings.map((warning) => <div key={warning}>Uyari: {warning}</div>)}
                        </div>
                      )}
                      {row.refs && (
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
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
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[2rem] border-0 p-5 shadow-xl">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
                <History className="h-5 w-5 text-slate-500" />
                Son Acilan / Duzenlenen Stoklar
              </h2>
              <div className="space-y-3">
                {historyRows.length === 0 && <div className="text-sm text-slate-500">Kayit yok</div>}
                {historyRows.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    disabled={!log.stockCode || editLoading}
                    onClick={() => void loadStockForEdit(log.stockCode)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-900">{log.stockCode || '-'}</div>
                        <div className="line-clamp-2 text-sm text-slate-600">{log.stockName}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${logStatusStyle(log.status)}`}>{log.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDateTime(log.createdAt)} {log.createdByName ? `- ${log.createdByName}` : ''}</div>
                    <div className="mt-2 flex items-center gap-1 text-xs font-bold text-blue-700">
                      <Pencil className="h-3.5 w-3.5" />
                      Duzenlemek icin tikla
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="rounded-[2rem] border-0 bg-slate-950 p-5 text-white shadow-xl">
              <h2 className="mb-3 text-lg font-black">Excel Kolonlari</h2>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                {['Stok Adi', 'Ana Saglayici Kodu', 'Marka Kodu/Adi', 'Kategori Kodu', 'Ambalaj Kodu/Adi (opsiyonel)', 'Ana Birim', 'Ana Birim Olculeri', 'KDV', 'Marj 1-5', '2. Birim', '2. Katsayi', 'Maliyet T/P', 'Raf Kodu'].map((item) => (
                  <div key={item} className="rounded-xl bg-white/10 px-3 py-2">{item}</div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
