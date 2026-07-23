'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  FileUp,
  HandCoins,
  Package,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import {
  BIG_COST_CHANGE_PERCENT,
  computeCostChange,
  emptyForm,
  money,
  reportSections,
  useTedarikMaliyetleri,
} from './useTedarikMaliyetleri';
import {
  ApplicationHistory,
  CostChangeSummary,
  CostTable,
  HeroMetric,
  MiniMetric,
  PriceRequestsPanel,
  ProductSummary,
  ProductThumb,
  ReportSection,
  SelectBox,
  SupplierCostDashboard,
  TenderRequestsPanel,
} from './TedarikMaliyetleriShared';

/**
 * KLASIK gorunum — Tedarikci Maliyet Havuzu.
 * Mevcut page.tsx'in SupplierCostsPage return JSX'i BIREBIR korunmustur; sadece mantik
 * useTedarikMaliyetleri hook'undan ve paylasilan bilesenler TedarikMaliyetleriShared'dan gelir.
 */
export default function TedarikMaliyetleriClassic() {
  const {
    canManageSupplierCosts,
    activeTab,
    setActiveTab,
    visibleTabs,
    initialRequestId,
    productSearch,
    setProductSearch,
    productResults,
    selectedProduct,
    searchProducts,
    loadProduct,
    costs,
    applications,
    metrics,
    form,
    updateForm,
    updateMainCostT,
    updateMainCostP,
    updateMainVatRate,
    editingCostId,
    setEditingCostId,
    setForm,
    setManualCostPOverride,
    normalizedPreview,
    supplierSearch,
    setSupplierSearch,
    supplierResults,
    setSupplierResults,
    searchSuppliers,
    loading,
    saving,
    applying,
    uploading,
    saveCost,
    editCost,
    archiveCost,
    applyTarget,
    setApplyTarget,
    applyUpdateLists,
    setApplyUpdateLists,
    applyBigChangeAck,
    setApplyBigChangeAck,
    applyAfterSave,
    setApplyAfterSave,
    applyAfterSaveLists,
    setApplyAfterSaveLists,
    applyNote,
    setApplyNote,
    applyCost,
    saveApplyConfirm,
    setSaveApplyConfirm,
    saveApplyBigChangeAck,
    setSaveApplyBigChangeAck,
    confirmSaveApply,
    reports,
    reportSearch,
    setReportSearch,
    staleDays,
    setStaleDays,
    tolerancePercent,
    setTolerancePercent,
    spreadPercent,
    setSpreadPercent,
    loadReports,
    importMatches,
    historySearch,
    setHistorySearch,
    historyRows,
    loadHistory,
    uploadAttachment,
  } = useTedarikMaliyetleri();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_30%),linear-gradient(135deg,#f8fafc,#eef2ff_45%,#f8fafc)]">
      <div className="mx-auto max-w-[1800px] space-y-6 px-4 py-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
            <div>
              <Link href="/reports" className="mb-4 inline-flex items-center text-sm font-bold text-amber-200 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" /> Raporlara don
              </Link>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-400 p-3 text-slate-950">
                  <HandCoins className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight lg:text-4xl">Tedarikci Maliyet Havuzu</h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                    Ayni urun icin farkli firmalardan gelen maliyetleri sakla, karsilastir, raporla ve secilen maliyeti mevcut Mikro fiyat motoruyla uygula.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeroMetric label="Maliyet kaydi" value={reports?.summary?.costCount || 0} />
              <HeroMetric label="Riskli urun" value={(reports?.summary?.currentBelowSupplier || 0) + (reports?.summary?.expiredCosts || 0)} tone="red" />
              <HeroMetric label="Firsat" value={(reports?.summary?.currentAboveBest || 0) + (reports?.summary?.betterAfterApplied || 0)} tone="emerald" />
              <HeroMetric label="Tek tedarikci" value={reports?.summary?.singleSupplier || 0} tone="amber" />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-black transition',
                activeTab === key ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'requests' && (
          <PriceRequestsPanel canManage={canManageSupplierCosts} initialRequestId={initialRequestId} />
        )}

        {activeTab === 'dashboard' && (
          <SupplierCostDashboard
            canManage={canManageSupplierCosts}
            reports={reports}
            onOpenRequests={() => setActiveTab('requests')}
            onOpenTenders={() => setActiveTab('tenders')}
            onOpenEntry={() => setActiveTab(canManageSupplierCosts ? 'entry' : 'requests')}
          />
        )}

        {activeTab === 'tenders' && (
          <TenderRequestsPanel canManage={canManageSupplierCosts} />
        )}

        {activeTab === 'entry' && (
          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl">Urun sec</CardTitle>
                <CardDescription>Stok kodu, isim veya marka ile arayin.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
                    placeholder="B108423, havlu, focus..."
                    className="h-12 rounded-2xl"
                  />
                  <Button onClick={searchProducts} isLoading={loading} className="h-12 rounded-2xl">
                    <Search className="mr-2 h-4 w-4" /> Ara
                  </Button>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                  {productResults.map((product) => (
                    <button
                      key={product.mikroCode}
                      type="button"
                      onClick={() => loadProduct(product.mikroCode)}
                      className={cn(
                        'flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:border-amber-300 hover:bg-amber-50',
                        selectedProduct?.mikroCode === product.mikroCode ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                      )}
                    >
                      <ProductThumb product={product} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{product.name}</p>
                        <p className="text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
                        <p className="mt-1 text-xs text-slate-500">Maliyet: {money(product.currentCost)} | Son giris: {money(product.lastEntryPrice)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {selectedProduct ? (
                <>
                  <ProductSummary product={selectedProduct} metrics={metrics} />
                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-xl">{editingCostId ? 'Maliyet kaydini duzenle' : 'Yeni tedarikci maliyeti'}</CardTitle>
                          <CardDescription>Mikroya yazilacak deger Ucarer Depo ile ayni Maliyet T/P mantigiyla hesaplanir.</CardDescription>
                        </div>
                        {editingCostId && (
                          <Button variant="outline" onClick={() => { setEditingCostId(null); setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }}>
                            Yeni kayit
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                        <Input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Tedarikci kodu veya adi ara..." className="h-12 rounded-2xl" />
                        <Button variant="secondary" onClick={searchSuppliers} className="h-12 rounded-2xl">Tedarikci ara</Button>
                      </div>
                      {supplierResults.length > 0 && (
                        <div className="flex max-h-32 flex-wrap gap-2 overflow-auto rounded-2xl bg-slate-50 p-3">
                          {supplierResults.map((supplier) => (
                            <button
                              key={supplier.code}
                              type="button"
                              onClick={() => {
                                updateForm({ supplierCode: supplier.code, supplierName: supplier.name });
                                setSupplierResults([]);
                                setSupplierSearch(`${supplier.code} ${supplier.name}`);
                              }}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300"
                            >
                              {supplier.code} - {supplier.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Input label="Tedarikci kodu" value={form.supplierCode} onChange={(e) => updateForm({ supplierCode: e.target.value })} />
                        <Input label="Tedarikci adi" value={form.supplierName} onChange={(e) => updateForm({ supplierName: e.target.value })} />
                        <Input label="Tedarikci urun kodu" value={form.supplierProductCode} onChange={(e) => updateForm({ supplierProductCode: e.target.value })} />
                        <SelectBox label="Kaynak" value={form.sourceType} onChange={(value) => updateForm({ sourceType: value })} options={['MANUAL', 'PRICE_LIST', 'QUOTE', 'INVOICE', 'PHONE', 'EMAIL']} />
                        <Input label="Maliyet T (KDV haric)" value={form.costT} onChange={(e) => updateMainCostT(e.target.value)} inputMode="decimal" />
                        <Input label="Maliyet P (yarim KDV otomatik)" value={form.costP} onChange={(e) => updateMainCostP(e.target.value)} inputMode="decimal" />
                        <SelectBox label="Para birimi" value={form.currency} onChange={(value) => updateForm({ currency: value })} options={['TRY', 'USD', 'EUR']} />
                        <Input label="Kur" value={form.exchangeRate} onChange={(e) => updateForm({ exchangeRate: e.target.value })} inputMode="decimal" disabled={form.currency === 'TRY'} />
                        <Input label="Birim" value={form.unit} onChange={(e) => updateForm({ unit: e.target.value })} />
                        <Input label="Birim katsayisi" value={form.unitFactor} onChange={(e) => updateForm({ unitFactor: e.target.value })} inputMode="decimal" />
                        <Input label="KDV %" value={form.vatRate} onChange={(e) => updateMainVatRate(e.target.value)} inputMode="decimal" />
                        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                          <input type="checkbox" checked={form.vatIncluded} onChange={(e) => updateForm({ vatIncluded: e.target.checked })} />
                          Girilen fiyat KDV dahil
                        </label>
                        <Input label="Min. siparis miktari" value={form.minOrderQuantity} onChange={(e) => updateForm({ minOrderQuantity: e.target.value })} inputMode="decimal" />
                        <Input label="Teslim suresi gun" value={form.leadTimeDays} onChange={(e) => updateForm({ leadTimeDays: e.target.value })} inputMode="numeric" />
                        <Input label="Gecerlilik tarihi" type="date" value={form.validUntil} onChange={(e) => updateForm({ validUntil: e.target.value })} />
                        <Input label="Teklif tarihi" type="date" value={form.quoteDate} onChange={(e) => updateForm({ quoteDate: e.target.value })} />
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">Not</span>
                          <textarea
                            value={form.note}
                            onChange={(e) => updateForm({ note: e.target.value })}
                            rows={4}
                            className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Telefon gorusmesi, teklif kosullari, iskonto notu..."
                          />
                        </label>
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                          <p className="mb-2 text-sm font-black text-slate-800">Teklif dosyasi</p>
                          <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-5 text-sm font-bold text-slate-600 shadow-sm hover:bg-amber-50">
                            <UploadCloud className="mr-2 h-5 w-5" />
                            {uploading ? 'Yukleniyor...' : 'PDF/Excel/Gorsel yukle'}
                            <input type="file" className="hidden" onChange={(event) => uploadAttachment(event.target.files?.[0])} />
                          </label>
                          {form.attachmentUrl && (
                            <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">
                              <FileUp className="mr-1 h-4 w-4" /> Ek dosyayi ac
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-[1.5rem] bg-slate-950 p-4 text-white md:grid-cols-3">
                        <MiniMetric label="Normalize Maliyet T" value={normalizedPreview ? money(normalizedPreview.costT) : '-'} />
                        <MiniMetric label="Normalize Maliyet P" value={normalizedPreview ? money(normalizedPreview.costP) : '-'} />
                        <MiniMetric label="Mevcut Mikro maliyet" value={money(selectedProduct.currentCost)} />
                      </div>

                      <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                        <label className="flex items-start gap-3 text-sm font-black text-amber-950">
                          <input
                            type="checkbox"
                            checked={applyAfterSave}
                            onChange={(event) => setApplyAfterSave(event.target.checked)}
                            className="mt-1"
                          />
                          <span>
                            Kaydederken Mikro maliyetini de guncelle
                            <span className="block text-xs font-semibold text-amber-800">
                              Secilirse Maliyet T/P Ucarer Depo mantigiyla Mikroya yazilir.
                            </span>
                          </span>
                        </label>
                        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                          <input
                            type="checkbox"
                            checked={applyAfterSaveLists}
                            onChange={(event) => setApplyAfterSaveLists(event.target.checked)}
                            disabled={!applyAfterSave}
                          />
                          12 standart listeyi mevcut marjlara gore guncelle
                        </label>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => { setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }}>
                          Temizle
                        </Button>
                        <Button onClick={saveCost} isLoading={saving} className="rounded-xl">
                          {applyAfterSave ? 'Kaydet ve Mikroya uygula' : editingCostId ? 'Guncelle' : 'Maliyet kaydet'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <CostTable costs={costs} onEdit={editCost} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); setApplyBigChangeAck(false); }} applying={applying} />
                  <ApplicationHistory applications={applications} />
                </>
              ) : (
                <Card className="rounded-[2rem]">
                  <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
                    <Package className="mb-4 h-16 w-16 text-slate-300" />
                    <p className="text-lg font-black text-slate-900">Once urun secin</p>
                    <p className="mt-2 max-w-md text-sm text-slate-500">Urun secildikten sonra farkli firmalardan gelen maliyetleri girip gecmise atabilir ve istediginizi Mikroya uygulayabilirsiniz.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Maliyet raporlari</CardTitle>
                    <CardDescription>Firsat, risk, guncellik ve tedarik bagimliligi ayni veri havuzundan hesaplanir.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={importMatches}>
                      <FileUp className="mr-2 h-4 w-4" /> Fiyat listelerinden aktar
                    </Button>
                    <Button onClick={loadReports}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Raporu yenile
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <Input label="Arama" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Urun, tedarikci..." />
                  <Input label="Eski maliyet gun" value={String(staleDays)} onChange={(e) => setStaleDays(Number(e.target.value || 60))} inputMode="numeric" />
                  <Input label="Fark toleransi %" value={String(tolerancePercent)} onChange={(e) => setTolerancePercent(Number(e.target.value || 10))} inputMode="numeric" />
                  <Input label="Yuksek fark %" value={String(spreadPercent)} onChange={(e) => setSpreadPercent(Number(e.target.value || 15))} inputMode="numeric" />
                </div>
                {reports?.summary && (
                  <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                    {reportSections.map((section) => (
                      <MiniMetric key={section.key} label={section.title} value={reports.summary[section.key] || 0} light />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              {reportSections.map((section) => (
                <ReportSection
                  key={section.key}
                  title={section.title}
                  icon={section.icon}
                  rows={reports?.sections?.[section.key] || []}
                  tone={section.tone}
                  onOpenProduct={(code: string) => {
                    setActiveTab('entry');
                    void loadProduct(code);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <Card className="rounded-[2rem]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Maliyet gecmisi</CardTitle>
                  <CardDescription>Son girilen ve uygulanan tedarikci maliyetleri.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Urun/tedarikci ara..." className="h-10 w-72 rounded-xl" />
                  <Button onClick={loadHistory} variant="outline">Ara</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CostTable costs={historyRows} onEdit={(cost: any) => { setActiveTab('entry'); void loadProduct(cost.productCode).then(() => editCost(cost)); }} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); setApplyBigChangeAck(false); }} applying={applying} />
            </CardContent>
          </Card>
        )}
      </div>

      {applyTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Maliyeti Mikroya uygula</h2>
                <p className="mt-1 text-sm text-slate-500">{applyTarget.productCode} - {applyTarget.productName}</p>
              </div>
              <button onClick={() => setApplyTarget(null)} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Mevcut Mikro maliyet" value={money(applyTarget.currentCost)} light />
              <MiniMetric label="Yeni Maliyet T" value={money(applyTarget.normalizedCostT)} light />
              <MiniMetric label="Yeni Maliyet P" value={money(applyTarget.normalizedCostP)} light />
            </div>
            {/* 6.1: Mevcut -> yeni maliyet degisim ozeti. Liste guncelleniyorsa etkilenecek satir sayisi da gosterilir. */}
            <CostChangeSummary
              currentCost={applyTarget.currentCost}
              newCostT={applyTarget.normalizedCostT}
              updateLists={applyUpdateLists}
            />
            <label className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
              <input type="checkbox" checked={applyUpdateLists} onChange={(event) => setApplyUpdateLists(event.target.checked)} />
              12 ana satis fiyat listesini mevcut marjlara gore guncelle
            </label>
            {/* 6.1: Esik ustu degisimde ek/ikinci onay; parmak hatasini (or. 1.250 -> 12.500) yakalar. */}
            {computeCostChange(applyTarget.currentCost, applyTarget.normalizedCostT).isBig && (
              <label className="mt-4 flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
                <input type="checkbox" checked={applyBigChangeAck} onChange={(event) => setApplyBigChangeAck(event.target.checked)} className="mt-0.5" />
                <span>
                  Bu degisim %{BIG_COST_CHANGE_PERCENT}'in uzerinde. Yeni maliyetin dogru oldugunu kontrol ettim ve Mikroya yazilmasini onayliyorum.
                </span>
              </label>
            )}
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Uygulama notu</span>
              <textarea value={applyNote} onChange={(e) => setApplyNote(e.target.value)} rows={3} className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApplyTarget(null)}>Vazgec</Button>
              <Button
                onClick={applyCost}
                isLoading={applying === applyTarget.id}
                disabled={computeCostChange(applyTarget.currentCost, applyTarget.normalizedCostT).isBig && !applyBigChangeAck}
              >
                Mikroya uygula
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6.1: "Kaydet ve Mikroya uygula" akisinda Mikro yazimi oncesi onay/ozet diyalogu. */}
      {saveApplyConfirm && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Mikro maliyetini guncellemeyi onayla</h2>
                <p className="mt-1 text-sm text-slate-500">{saveApplyConfirm.payload.productCode}</p>
              </div>
              <button onClick={() => { setSaveApplyConfirm(null); setSaveApplyBigChangeAck(false); }} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Maliyet kaydi kaydedildi. Asagidaki deger Mikroya yazilmadan once kontrol edin.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Mevcut Mikro maliyet" value={money(saveApplyConfirm.currentCost)} light />
              <MiniMetric label="Yeni Maliyet T" value={money(saveApplyConfirm.newCostT)} light />
              <MiniMetric label="Yeni Maliyet P" value={money(saveApplyConfirm.newCostP)} light />
            </div>
            <CostChangeSummary
              currentCost={saveApplyConfirm.currentCost}
              newCostT={saveApplyConfirm.newCostT}
              updateLists={saveApplyConfirm.updateLists}
            />
            {/* 6.1: Esik ustu degisimde ek/ikinci onay. */}
            {computeCostChange(saveApplyConfirm.currentCost, saveApplyConfirm.newCostT).isBig && (
              <label className="mt-4 flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
                <input type="checkbox" checked={saveApplyBigChangeAck} onChange={(event) => setSaveApplyBigChangeAck(event.target.checked)} className="mt-0.5" />
                <span>
                  Bu degisim %{BIG_COST_CHANGE_PERCENT}'in uzerinde. Yeni maliyetin dogru oldugunu kontrol ettim ve Mikroya yazilmasini onayliyorum.
                </span>
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSaveApplyConfirm(null); setSaveApplyBigChangeAck(false); }}>
                Vazgec (Mikroya yazma)
              </Button>
              <Button
                onClick={confirmSaveApply}
                isLoading={saving}
                disabled={computeCostChange(saveApplyConfirm.currentCost, saveApplyConfirm.newCostT).isBig && !saveApplyBigChangeAck}
              >
                Mikroya uygula
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
