'use client';

import Link from 'next/link';
import {
  Archive,
  ArrowLeft,
  FileUp,
  Package,
  Pencil,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  BIG_COST_CHANGE_PERCENT,
  computeCostChange,
  dateText,
  emptyForm,
  money,
  percent,
  reportSections,
  useTedarikMaliyetleri,
} from './useTedarikMaliyetleri';
import {
  PriceRequestsPanel,
  SupplierCostDashboard,
  TenderRequestsPanel,
} from './TedarikMaliyetleriShared';

/**
 * YENI gorunum — Tedarikci Maliyet Havuzu.
 * Mevcut TUM mantik useTedarikMaliyetleri hook'undan; Fiyat teyit talepleri ve Ihale maliyet
 * talepleri panelleri TedarikMaliyetleriShared'dan BIREBIR kullanilir (handler/kolon/modal/numpad
 * dusurulmedi). mark-current SADECE satis tarafina bilgi verir; Mikro maliyet tarihini OTOMATIK
 * GUNCELLEMEZ. Hicbir Mikro/DB yazma butonu/durumu/onay-dialogu atlanmamistir.
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INK = '#14223b';
const INK_MUTED = '#51607a';
const INK_FAINT = '#8b97ac';
const PRIMARY = '#15356b';

export default function TedarikMaliyetleriNew() {
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

  const heroMetrics = [
    { label: 'Maliyet Kaydi', value: reports?.summary?.costCount || 0, color: '#fff' },
    { label: 'Riskli Urun', value: (reports?.summary?.currentBelowSupplier || 0) + (reports?.summary?.expiredCosts || 0), color: '#fca5a5' },
    { label: 'Firsat', value: (reports?.summary?.currentAboveBest || 0) + (reports?.summary?.betterAfterApplied || 0), color: '#6ee7b7' },
    { label: 'Tek Tedarikci', value: reports?.summary?.singleSupplier || 0, color: '#fbbf24' },
  ];

  // Maliyet formu numpad/grid alanlari (klasikteki TUM input'lar; hicbiri dusurulmedi)
  const labelCls = 'block text-[10.5px] font-semibold uppercase tracking-wide';
  const fieldCls =
    'mt-1 w-full h-9 rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[12px] text-[#14223b] outline-none focus:border-[#15356b]';

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-5 lg:px-8">
        {/* Koyu header */}
        <header className="rounded-[14px] bg-[#0c2247] p-5 text-white">
          <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#9bb0d4] hover:text-white">
            <ArrowLeft width={14} height={14} stroke="currentColor" strokeWidth={2} /> Raporlara don
          </Link>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Tedarikci Maliyet Havuzu</h1>
          <p className="mt-1 text-[12.5px] text-[#9bb0d4]">
            Coklu tedarikci maliyetlerini sakla, karsilastir, Mikro fiyat motoruna uygula; fiyat teyit ve ihale taleplerini yonet.
          </p>
          <div className="mt-4 flex flex-wrap gap-6">
            {heroMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-[20px] font-bold" style={{ color: metric.color }}>{metric.value}</div>
                <div className="text-[11.5px] text-[#9bb0d4]">{metric.label}</div>
              </div>
            ))}
          </div>
        </header>

        {/* Sekme bari */}
        <div className="flex flex-wrap items-center gap-1">
          {visibleTabs.map(([key, label]) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as typeof activeTab)}
                className="rounded-lg px-4 py-2 text-[12.5px] font-semibold transition"
                style={
                  active
                    ? { background: PRIMARY, color: '#fff' }
                    : { background: '#fff', color: INK_MUTED, border: '1px solid #e7ebf2' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Fiyat teyit talepleri — paylasilan panel BIREBIR */}
        {activeTab === 'requests' && (
          <PriceRequestsPanel canManage={canManageSupplierCosts} initialRequestId={initialRequestId} />
        )}

        {/* Ozet — paylasilan dashboard BIREBIR */}
        {activeTab === 'dashboard' && (
          <SupplierCostDashboard
            canManage={canManageSupplierCosts}
            reports={reports}
            onOpenRequests={() => setActiveTab('requests')}
            onOpenTenders={() => setActiveTab('tenders')}
            onOpenEntry={() => setActiveTab(canManageSupplierCosts ? 'entry' : 'requests')}
          />
        )}

        {/* Ihale maliyet talepleri — paylasilan panel BIREBIR */}
        {activeTab === 'tenders' && (
          <TenderRequestsPanel canManage={canManageSupplierCosts} />
        )}

        {/* Maliyet gir / uygula */}
        {activeTab === 'entry' && (
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            {/* Sol: urun arama */}
            <div className={`${CARD} p-3.5`}>
              <div className="text-[13px] font-semibold" style={{ color: INK }}>Urun Ara</div>
              <div className="mt-2.5 flex gap-2">
                <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#e3e8f0] px-2.5">
                  <Search width={14} height={14} stroke={INK_FAINT} strokeWidth={2} />
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
                    placeholder="Stok kodu, isim veya marka..."
                    className="flex-1 border-none bg-transparent text-[12px] outline-none"
                    style={{ color: INK }}
                  />
                </div>
                <Button onClick={searchProducts} isLoading={loading} className="h-9 rounded-lg px-3" style={{ background: PRIMARY }}>
                  Ara
                </Button>
              </div>
              <div className="mt-2.5 flex max-h-[560px] flex-col gap-1.5 overflow-auto pr-1">
                {productResults.map((product) => {
                  const selected = selectedProduct?.mikroCode === product.mikroCode;
                  return (
                    <button
                      key={product.mikroCode}
                      type="button"
                      onClick={() => loadProduct(product.mikroCode)}
                      className="rounded-[9px] border p-2.5 text-left transition"
                      style={
                        selected
                          ? { border: '1px solid #d6e0f1', background: '#eef2fa' }
                          : { border: '1px solid #eef1f6', background: '#fff' }
                      }
                    >
                      <div className="flex gap-2.5">
                        <ProductThumbNew product={product} />
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold" style={{ color: INK }}>{product.name}</div>
                          <div className="font-mono text-[10.5px]" style={{ color: INK_FAINT }}>{product.mikroCode} - {product.unit}</div>
                          <div className="mt-1 text-[10.5px]" style={{ color: INK_MUTED }}>Maliyet: {money(product.currentCost)} | Son giris: {money(product.lastEntryPrice)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sag: urun ozeti + maliyet formu + tablo + gecmis */}
            <div className="space-y-4">
              {selectedProduct ? (
                <>
                  {/* Urun ozeti (8 metrik) */}
                  <div className={`${CARD} overflow-hidden`}>
                    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr]">
                      <div className="flex items-center justify-center bg-[#f4f6fa] p-5">
                        <ProductThumbNew product={selectedProduct} large />
                      </div>
                      <div className="p-4">
                        <div className="font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: PRIMARY }}>{selectedProduct.mikroCode}</div>
                        <div className="mt-0.5 text-[18px] font-semibold" style={{ color: INK }}>{selectedProduct.name}</div>
                        <div className="mt-0.5 text-[12px]" style={{ color: INK_FAINT }}>{selectedProduct.category?.name || '-'} | {selectedProduct.brandCode || '-'}</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          <MetricBoxNew label="Guncel maliyet" value={money(selectedProduct.currentCost)} strong />
                          <MetricBoxNew label="Maliyet tarihi" value={dateText(selectedProduct.currentCostDate)} />
                          <MetricBoxNew label="En iyi tedarik" value={money(metrics?.bestCost)} accent="#047857" />
                          <MetricBoxNew label="Tedarikci sayisi" value={metrics?.supplierCount || 0} />
                          <MetricBoxNew label="Son giris" value={money(selectedProduct.lastEntryPrice)} />
                          <MetricBoxNew label="Son giris tarihi" value={dateText(selectedProduct.lastEntryDate)} />
                          <MetricBoxNew label="Ana saglayici" value={selectedProduct.mainSupplier?.name || selectedProduct.mainSupplier?.code || '-'} />
                          <MetricBoxNew
                            label="Stok M:T"
                            value={`M:${selectedProduct?.warehouseStocks?.MERKEZ ?? selectedProduct?.warehouseStocks?.['1'] ?? '-'} T:${selectedProduct?.warehouseStocks?.TOPCA ?? selectedProduct?.warehouseStocks?.['6'] ?? '-'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Maliyet formu */}
                  <div className={`${CARD} p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{editingCostId ? 'Maliyet kaydini duzenle' : 'Yeni tedarikci maliyeti'}</div>
                        <div className="text-[11.5px]" style={{ color: INK_FAINT }}>Mikroya yazilacak deger Ucarer Depo ile ayni Maliyet T/P mantigiyla hesaplanir.</div>
                      </div>
                      {editingCostId && (
                        <Button variant="outline" onClick={() => { setEditingCostId(null); setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }} className="h-8 rounded-lg text-[12px]">
                          Yeni kayit
                        </Button>
                      )}
                    </div>

                    {/* Tedarikci ara */}
                    <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
                      <input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Tedarikci kodu veya adi ara..." className={fieldCls} style={{ height: 36 }} />
                      <Button variant="secondary" onClick={searchSuppliers} className="h-9 rounded-lg px-3">Tedarikci ara</Button>
                    </div>
                    {supplierResults.length > 0 && (
                      <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-auto rounded-lg bg-[#fafbfd] p-2.5">
                        {supplierResults.map((supplier) => (
                          <button
                            key={supplier.code}
                            type="button"
                            onClick={() => {
                              updateForm({ supplierCode: supplier.code, supplierName: supplier.name });
                              setSupplierResults([]);
                              setSupplierSearch(`${supplier.code} ${supplier.name}`);
                            }}
                            className="rounded-full border border-[#e3e8f0] bg-white px-2.5 py-1 text-[11px] font-semibold hover:border-[#d6e0f1]"
                            style={{ color: INK_MUTED }}
                          >
                            {supplier.code} - {supplier.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Form gridi — klasikteki TUM alanlar */}
                    <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                      <FieldNew label="Tedarikci kodu"><input className={fieldCls} value={form.supplierCode} onChange={(e) => updateForm({ supplierCode: e.target.value })} /></FieldNew>
                      <FieldNew label="Tedarikci adi"><input className={fieldCls} value={form.supplierName} onChange={(e) => updateForm({ supplierName: e.target.value })} /></FieldNew>
                      <FieldNew label="Tedarikci urun kodu"><input className={fieldCls} value={form.supplierProductCode} onChange={(e) => updateForm({ supplierProductCode: e.target.value })} /></FieldNew>
                      <FieldNew label="Kaynak">
                        <select className={fieldCls} value={form.sourceType} onChange={(e) => updateForm({ sourceType: e.target.value })}>
                          {['MANUAL', 'PRICE_LIST', 'QUOTE', 'INVOICE', 'PHONE', 'EMAIL'].map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </FieldNew>
                      <FieldNew label="Maliyet T (KDV haric)"><input className={fieldCls} value={form.costT} onChange={(e) => updateMainCostT(e.target.value)} inputMode="decimal" /></FieldNew>
                      <FieldNew label="Maliyet P (yarim KDV otomatik)"><input className={fieldCls} value={form.costP} onChange={(e) => updateMainCostP(e.target.value)} inputMode="decimal" /></FieldNew>
                      <FieldNew label="Para birimi">
                        <select className={fieldCls} value={form.currency} onChange={(e) => updateForm({ currency: e.target.value })}>
                          {['TRY', 'USD', 'EUR'].map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </FieldNew>
                      <FieldNew label="Kur"><input className={fieldCls} value={form.exchangeRate} onChange={(e) => updateForm({ exchangeRate: e.target.value })} inputMode="decimal" disabled={form.currency === 'TRY'} /></FieldNew>
                      <FieldNew label="Birim"><input className={fieldCls} value={form.unit} onChange={(e) => updateForm({ unit: e.target.value })} /></FieldNew>
                      <FieldNew label="Birim katsayisi"><input className={fieldCls} value={form.unitFactor} onChange={(e) => updateForm({ unitFactor: e.target.value })} inputMode="decimal" /></FieldNew>
                      <FieldNew label="KDV %"><input className={fieldCls} value={form.vatRate} onChange={(e) => updateMainVatRate(e.target.value)} inputMode="decimal" /></FieldNew>
                      <label className="flex items-center gap-2 self-end rounded-lg border border-[#e3e8f0] px-2.5 py-2 text-[11.5px] font-semibold" style={{ color: INK_MUTED }}>
                        <input type="checkbox" checked={form.vatIncluded} onChange={(e) => updateForm({ vatIncluded: e.target.checked })} style={{ accentColor: PRIMARY }} />
                        Girilen fiyat KDV dahil
                      </label>
                      <FieldNew label="Min. siparis miktari"><input className={fieldCls} value={form.minOrderQuantity} onChange={(e) => updateForm({ minOrderQuantity: e.target.value })} inputMode="decimal" /></FieldNew>
                      <FieldNew label="Teslim suresi gun"><input className={fieldCls} value={form.leadTimeDays} onChange={(e) => updateForm({ leadTimeDays: e.target.value })} inputMode="numeric" /></FieldNew>
                      <FieldNew label="Gecerlilik tarihi"><input className={fieldCls} type="date" value={form.validUntil} onChange={(e) => updateForm({ validUntil: e.target.value })} /></FieldNew>
                      <FieldNew label="Teklif tarihi"><input className={fieldCls} type="date" value={form.quoteDate} onChange={(e) => updateForm({ quoteDate: e.target.value })} /></FieldNew>
                    </div>

                    {/* Not + teklif dosyasi */}
                    <div className="mt-3 grid gap-2.5 lg:grid-cols-[1fr_280px]">
                      <label className="block">
                        <span className={labelCls} style={{ color: INK_FAINT }}>Not</span>
                        <textarea
                          value={form.note}
                          onChange={(e) => updateForm({ note: e.target.value })}
                          rows={4}
                          className="mt-1 w-full rounded-lg border border-[#e3e8f0] px-2.5 py-2 text-[12px] outline-none focus:border-[#15356b]"
                          style={{ color: INK }}
                          placeholder="Telefon gorusmesi, teklif kosullari, iskonto notu..."
                        />
                      </label>
                      <div className="rounded-lg border border-dashed border-[#d6e0f1] bg-[#fafbfd] p-3">
                        <div className="mb-2 text-[12px] font-semibold" style={{ color: INK }}>Teklif dosyasi</div>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 py-3.5 text-[12px] font-semibold hover:bg-[#eef2fa]" style={{ color: INK_MUTED }}>
                          <UploadCloud width={16} height={16} stroke="currentColor" strokeWidth={2} />
                          {uploading ? 'Yukleniyor...' : 'PDF/Excel/Gorsel yukle'}
                          <input type="file" className="hidden" onChange={(event) => uploadAttachment(event.target.files?.[0])} />
                        </label>
                        {form.attachmentUrl && (
                          <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: PRIMARY }}>
                            <FileUp width={13} height={13} stroke="currentColor" strokeWidth={2} /> Ek dosyayi ac
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Normalize onizleme */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-[#eef1f6] bg-[#fafbfd] px-3 py-2.5">
                      <span className="text-[11px]" style={{ color: INK_FAINT }}>Normalize onizleme:</span>
                      <span className="text-[12px]" style={{ color: INK }}>T <b className="font-semibold">{normalizedPreview ? money(normalizedPreview.costT) : '-'}</b></span>
                      <span className="text-[12px]" style={{ color: INK }}>P <b className="font-semibold">{normalizedPreview ? money(normalizedPreview.costP) : '-'}</b></span>
                      <span className="text-[12px]" style={{ color: INK }}>Mikro <b className="font-semibold">{money(selectedProduct.currentCost)}</b></span>
                    </div>

                    {/* Kaydederken Mikro guncelle + 10 liste */}
                    <div className="mt-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
                      <label className="flex items-start gap-2.5 text-[12px] font-semibold" style={{ color: '#92400e' }}>
                        <input type="checkbox" checked={applyAfterSave} onChange={(event) => setApplyAfterSave(event.target.checked)} className="mt-0.5" style={{ accentColor: PRIMARY }} />
                        <span>
                          Kaydederken Mikro maliyetini de guncelle
                          <span className="mt-0.5 block text-[11px] font-medium" style={{ color: '#b45309' }}>
                            Secilirse Maliyet T/P Ucarer Depo mantigiyla Mikroya yazilir.
                          </span>
                        </span>
                      </label>
                      <label className="mt-2.5 flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#b45309' }}>
                        <input type="checkbox" checked={applyAfterSaveLists} onChange={(event) => setApplyAfterSaveLists(event.target.checked)} disabled={!applyAfterSave} style={{ accentColor: PRIMARY }} />
                        10 listeyi mevcut marjlara gore guncelle
                      </label>
                    </div>

                    {/* Aksiyonlar */}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={() => { setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }} className="h-9 rounded-lg text-[12.5px]">
                        Temizle
                      </Button>
                      <Button onClick={saveCost} isLoading={saving} className="h-9 rounded-lg px-4 text-[12.5px]" style={{ background: PRIMARY }}>
                        {applyAfterSave ? 'Kaydet ve Mikroya uygula' : editingCostId ? 'Guncelle' : 'Maliyet kaydet'}
                      </Button>
                    </div>
                  </div>

                  {/* Maliyet tablosu */}
                  <CostTableNew costs={costs} onEdit={editCost} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); setApplyBigChangeAck(false); }} applying={applying} />

                  {/* Mikro uygulama gecmisi */}
                  <ApplicationHistoryNew applications={applications} />
                </>
              ) : (
                <div className={`${CARD} flex min-h-[340px] flex-col items-center justify-center p-6 text-center`}>
                  <Package width={56} height={56} stroke="#cbd5e1" strokeWidth={1.5} />
                  <p className="mt-3 text-[15px] font-semibold" style={{ color: INK }}>Once urun secin</p>
                  <p className="mt-1 max-w-md text-[12.5px]" style={{ color: INK_FAINT }}>Urun secildikten sonra farkli firmalardan gelen maliyetleri girip gecmise atabilir ve istediginizi Mikroya uygulayabilirsiniz.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raporlar */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[13.5px] font-semibold" style={{ color: INK }}>Maliyet raporlari</div>
                  <div className="text-[11.5px]" style={{ color: INK_FAINT }}>Firsat, risk, guncellik ve tedarik bagimliligi ayni veri havuzundan hesaplanir.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={importMatches} className="h-9 rounded-lg text-[12px]">
                    <FileUp width={14} height={14} stroke="currentColor" strokeWidth={2} className="mr-1.5" /> Fiyat listelerinden aktar
                  </Button>
                  <Button onClick={loadReports} className="h-9 rounded-lg px-3 text-[12px]" style={{ background: PRIMARY }}>
                    <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} className="mr-1.5" /> Raporu yenile
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 md:grid-cols-4">
                <FieldNew label="Arama"><input className={fieldCls} value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Urun, tedarikci..." /></FieldNew>
                <FieldNew label="Eski maliyet gun"><input className={fieldCls} value={String(staleDays)} onChange={(e) => setStaleDays(Number(e.target.value || 60))} inputMode="numeric" /></FieldNew>
                <FieldNew label="Fark toleransi %"><input className={fieldCls} value={String(tolerancePercent)} onChange={(e) => setTolerancePercent(Number(e.target.value || 10))} inputMode="numeric" /></FieldNew>
                <FieldNew label="Yuksek fark %"><input className={fieldCls} value={String(spreadPercent)} onChange={(e) => setSpreadPercent(Number(e.target.value || 15))} inputMode="numeric" /></FieldNew>
              </div>
              {reports?.summary && (
                <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
                  {reportSections.map((section) => (
                    <MetricBoxNew key={section.key} label={section.title} value={reports.summary[section.key] || 0} />
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {reportSections.map((section) => (
                <ReportSectionNew
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

        {/* Gecmis */}
        {activeTab === 'history' && (
          <div className={`${CARD} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-semibold" style={{ color: INK }}>Maliyet gecmisi</div>
                <div className="text-[11.5px]" style={{ color: INK_FAINT }}>Son girilen ve uygulanan tedarikci maliyetleri.</div>
              </div>
              <div className="flex gap-2">
                <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Urun/tedarikci ara..." className={`${fieldCls} w-72`} />
                <Button onClick={loadHistory} variant="outline" className="h-9 rounded-lg text-[12px]">Ara</Button>
              </div>
            </div>
            <div className="mt-3">
              <CostTableNew costs={historyRows} onEdit={(cost: any) => { setActiveTab('entry'); void loadProduct(cost.productCode).then(() => editCost(cost)); }} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); setApplyBigChangeAck(false); }} applying={applying} />
            </div>
          </div>
        )}
      </div>

      {/* Maliyeti Mikroya uygula modali */}
      {applyTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0c2247]/55 p-4">
          <div className="w-full max-w-2xl rounded-[14px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[16px] font-semibold" style={{ color: INK }}>Maliyeti Mikroya uygula</div>
                <div className="mt-0.5 text-[12px]" style={{ color: INK_FAINT }}>{applyTarget.productCode} - {applyTarget.productName}</div>
              </div>
              <button onClick={() => setApplyTarget(null)} className="rounded-full bg-[#f4f6fa] p-1.5 hover:bg-[#e7ebf2]">
                <X width={18} height={18} stroke={INK_MUTED} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <MetricBoxNew label="Mevcut Mikro maliyet" value={money(applyTarget.currentCost)} />
              <MetricBoxNew label="Yeni Maliyet T" value={money(applyTarget.normalizedCostT)} accent="#1c4585" />
              <MetricBoxNew label="Yeni Maliyet P" value={money(applyTarget.normalizedCostP)} accent="#1c4585" />
            </div>
            {/* 6.1: Mevcut -> yeni maliyet degisim ozeti. */}
            <CostChangeSummaryNew
              currentCost={applyTarget.currentCost}
              newCostT={applyTarget.normalizedCostT}
              updateLists={applyUpdateLists}
            />
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2.5 text-[12px] font-semibold" style={{ color: '#b45309' }}>
              <input type="checkbox" checked={applyUpdateLists} onChange={(event) => setApplyUpdateLists(event.target.checked)} style={{ accentColor: PRIMARY }} />
              Liste 1-10 satis fiyatlarini mevcut marjlara gore guncelle
            </label>
            {/* 6.1: Esik ustu degisimde ek/ikinci onay (parmak hatasi yakalar). */}
            {computeCostChange(applyTarget.currentCost, applyTarget.normalizedCostT).isBig && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-2.5 text-[12px] font-semibold" style={{ color: '#b91c1c' }}>
                <input type="checkbox" checked={applyBigChangeAck} onChange={(event) => setApplyBigChangeAck(event.target.checked)} className="mt-0.5" style={{ accentColor: '#b91c1c' }} />
                <span>
                  Bu degisim %{BIG_COST_CHANGE_PERCENT}'in uzerinde. Yeni maliyetin dogru oldugunu kontrol ettim ve Mikroya yazilmasini onayliyorum.
                </span>
              </label>
            )}
            <label className="mt-3 block">
              <span className={labelCls} style={{ color: INK_FAINT }}>Uygulama notu</span>
              <textarea value={applyNote} onChange={(e) => setApplyNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#e3e8f0] px-2.5 py-2 text-[12px] outline-none focus:border-[#15356b]" style={{ color: INK }} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApplyTarget(null)} className="h-9 rounded-lg text-[12.5px]">Vazgec</Button>
              <Button
                onClick={applyCost}
                isLoading={applying === applyTarget.id}
                disabled={computeCostChange(applyTarget.currentCost, applyTarget.normalizedCostT).isBig && !applyBigChangeAck}
                className="h-9 rounded-lg px-4 text-[12.5px]"
                style={{ background: PRIMARY }}
              >
                Mikroya uygula
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* "Kaydet ve Mikroya uygula" onay/ozet diyalogu */}
      {saveApplyConfirm && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#0c2247]/55 p-4">
          <div className="w-full max-w-2xl rounded-[14px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[16px] font-semibold" style={{ color: INK }}>Mikro maliyetini guncellemeyi onayla</div>
                <div className="mt-0.5 text-[12px]" style={{ color: INK_FAINT }}>{saveApplyConfirm.payload.productCode}</div>
              </div>
              <button onClick={() => { setSaveApplyConfirm(null); setSaveApplyBigChangeAck(false); }} className="rounded-full bg-[#f4f6fa] p-1.5 hover:bg-[#e7ebf2]">
                <X width={18} height={18} stroke={INK_MUTED} strokeWidth={2} />
              </button>
            </div>
            <p className="mt-2.5 text-[12px]" style={{ color: INK_FAINT }}>
              Maliyet kaydi kaydedildi. Asagidaki deger Mikroya yazilmadan once kontrol edin.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <MetricBoxNew label="Mevcut Mikro maliyet" value={money(saveApplyConfirm.currentCost)} />
              <MetricBoxNew label="Yeni Maliyet T" value={money(saveApplyConfirm.newCostT)} accent="#1c4585" />
              <MetricBoxNew label="Yeni Maliyet P" value={money(saveApplyConfirm.newCostP)} accent="#1c4585" />
            </div>
            <CostChangeSummaryNew
              currentCost={saveApplyConfirm.currentCost}
              newCostT={saveApplyConfirm.newCostT}
              updateLists={saveApplyConfirm.updateLists}
            />
            {/* 6.1: Esik ustu degisimde ek/ikinci onay. */}
            {computeCostChange(saveApplyConfirm.currentCost, saveApplyConfirm.newCostT).isBig && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-2.5 text-[12px] font-semibold" style={{ color: '#b91c1c' }}>
                <input type="checkbox" checked={saveApplyBigChangeAck} onChange={(event) => setSaveApplyBigChangeAck(event.target.checked)} className="mt-0.5" style={{ accentColor: '#b91c1c' }} />
                <span>
                  Bu degisim %{BIG_COST_CHANGE_PERCENT}'in uzerinde. Yeni maliyetin dogru oldugunu kontrol ettim ve Mikroya yazilmasini onayliyorum.
                </span>
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSaveApplyConfirm(null); setSaveApplyBigChangeAck(false); }} className="h-9 rounded-lg text-[12.5px]">
                Vazgec (Mikroya yazma)
              </Button>
              <Button
                onClick={confirmSaveApply}
                isLoading={saving}
                disabled={computeCostChange(saveApplyConfirm.currentCost, saveApplyConfirm.newCostT).isBig && !saveApplyBigChangeAck}
                className="h-9 rounded-lg px-4 text-[12.5px]"
                style={{ background: PRIMARY }}
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

/* ---- Yeni gorunum yardimci bilesenleri (sadece gorsel; mantik hook/Shared'dan) ---- */

function FieldNew({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: INK_FAINT }}>{label}</span>
      {children}
    </label>
  );
}

function MetricBoxNew({ label, value, strong = false, accent }: { label: string; value: any; strong?: boolean; accent?: string }) {
  return (
    <div className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-2.5">
      <div className="text-[10px]" style={{ color: INK_FAINT }}>{label}</div>
      <div className="mt-0.5 truncate text-[13.5px] font-semibold" style={{ color: accent || INK, fontWeight: strong ? 700 : 600 }}>{String(value ?? '-')}</div>
    </div>
  );
}

function ProductThumbNew({ product, large = false }: { product: any; large?: boolean }) {
  const size = large ? 160 : 56;
  return (
    <div className="shrink-0 overflow-hidden rounded-lg bg-white" style={{ width: size, height: size, border: '1px solid #eef1f6' }}>
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.mikroCode} className="h-full w-full object-contain p-1.5" />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ color: '#cbd5e1' }}>
          <Package width={large ? 56 : 26} height={large ? 56 : 26} stroke="currentColor" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

function CostTableNew({ costs, onEdit, onArchive, onApply, applying }: any) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="border-b border-[#eef1f6] px-4 py-3">
        <div className="text-[13.5px] font-semibold" style={{ color: INK }}>Tedarikci maliyetleri</div>
        <div className="text-[11.5px]" style={{ color: INK_FAINT }}>Uygula butonu secilen maliyeti Mikro guncel maliyet alanina ve istege bagli fiyat listelerine yazar.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-[11.5px]">
          <thead>
            <tr className="border-b border-[#eef1f6] bg-[#fafbfd] text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: INK_FAINT }}>
              <th className="px-3 py-2.5">Urun</th>
              <th className="px-3 py-2.5">Tedarikci</th>
              <th className="px-3 py-2.5">Giris T/P</th>
              <th className="px-3 py-2.5">Normalize T/P</th>
              <th className="px-3 py-2.5">Mikro fark</th>
              <th className="px-3 py-2.5">Kosullar</th>
              <th className="px-3 py-2.5">Durum</th>
              <th className="px-3 py-2.5 text-right">Islem</th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: INK_FAINT }}>Kayit yok.</td></tr>
            ) : costs.map((cost: any) => (
              <tr key={cost.id} className="border-b border-[#f1f4f9] align-top" style={cost.isExpired ? { background: '#fef2f2' } : undefined}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold" style={{ color: INK }}>{cost.productCode}</p>
                  <p className="max-w-xs truncate text-[10.5px]" style={{ color: INK_FAINT }}>{cost.productName}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium" style={{ color: INK }}>{cost.supplierName}</p>
                  <p className="text-[10.5px]" style={{ color: INK_FAINT }}>{cost.supplierCode || '-'} {cost.supplierProductCode ? `| ${cost.supplierProductCode}` : ''}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold" style={{ color: INK }}>{money(cost.costT)} / {money(cost.costP)}</p>
                  <p className="text-[10.5px]" style={{ color: INK_FAINT }}>{cost.currency} {cost.vatIncluded ? 'KDV dahil' : 'Net'}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold" style={{ color: '#1c4585' }}>{money(cost.normalizedCostT)} / {money(cost.normalizedCostP)}</p>
                  <p className="text-[10.5px]" style={{ color: INK_FAINT }}>{cost.unit || '-'} x {cost.unitFactor || 1}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold" style={{ color: Number(cost.diffFromCurrent || 0) > 0 ? '#b91c1c' : '#047857' }}>{money(cost.diffFromCurrent)}</p>
                  <p className="text-[10.5px]" style={{ color: INK_FAINT }}>{percent(cost.diffFromCurrentPercent)}</p>
                </td>
                <td className="px-3 py-2.5 text-[10.5px]" style={{ color: INK_MUTED }}>
                  <p>Min: {cost.minOrderQuantity || '-'}</p>
                  <p>Teslim: {cost.leadTimeDays ? `${cost.leadTimeDays} gun` : '-'}</p>
                  <p>Gecerlilik: {dateText(cost.validUntil)}</p>
                  {cost.attachmentUrl && <a href={cost.attachmentUrl} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: PRIMARY }}>Dosya</a>}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-semibold"
                    style={
                      cost.status === 'APPLIED'
                        ? { background: '#ecfdf5', color: '#047857' }
                        : cost.isExpired
                          ? { background: '#fef2f2', color: '#b91c1c' }
                          : { background: '#f1f4f9', color: INK_MUTED }
                    }
                  >
                    {cost.isExpired ? 'EXPIRED' : cost.status}
                  </span>
                  <p className="mt-1 text-[10.5px]" style={{ color: INK_FAINT }}>{dateText(cost.createdAt)}</p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApply(cost)}
                      disabled={applying === cost.id}
                      className="rounded-md border border-[#d6e0f1] bg-[#eef2fa] px-2.5 py-1.5 text-[10.5px] font-semibold disabled:opacity-60"
                      style={{ color: PRIMARY }}
                    >
                      {applying === cost.id ? '...' : 'Uygula'}
                    </button>
                    <button type="button" title="Duzenle" onClick={() => onEdit(cost)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#d8e0ec] bg-white hover:bg-[#f4f6fa]" style={{ color: INK_MUTED }}>
                      <Pencil width={13} height={13} stroke="currentColor" strokeWidth={2} />
                    </button>
                    <button type="button" title="Arsiv" onClick={() => onArchive(cost)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#d8e0ec] bg-white hover:bg-[#fef2f2]" style={{ color: '#b91c1c' }}>
                      <Archive width={13} height={13} stroke="currentColor" strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApplicationHistoryNew({ applications }: { applications: any[] }) {
  if (!applications.length) return null;
  return (
    <div className={`${CARD} p-4`}>
      <div className="text-[13.5px] font-semibold" style={{ color: INK }}>Mikro uygulama gecmisi</div>
      <div className="mt-2.5 flex flex-col gap-2">
        {applications.map((row) => (
          <div key={row.id} className="rounded-lg border border-[#eef1f6] bg-white p-2.5 text-[12px]">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold" style={{ color: INK }}>{money(row.previousCost)} {'->'} {money(row.newCostT)} / {money(row.newCostP)}</p>
              <p className="text-[10.5px] font-semibold" style={{ color: INK_FAINT }}>{dateText(row.createdAt)} | {row.userName || '-'}</p>
            </div>
            <p className="mt-1 text-[10.5px]" style={{ color: INK_FAINT }}>{row.supplierName || '-'} {row.updatePriceLists ? '| Liste fiyatlari guncellendi' : '| Sadece maliyet'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportSectionNew({ title, icon: Icon, rows, tone, onOpenProduct }: any) {
  const toneStyle = toneStyleNew(tone);
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: toneStyle.bg, color: toneStyle.fg }}>
            <Icon width={16} height={16} stroke="currentColor" strokeWidth={2} />
          </div>
          <div className="text-[13px] font-semibold" style={{ color: INK }}>{title}</div>
        </div>
        <span className="rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[11px] font-semibold" style={{ color: INK_MUTED }}>{rows.length}</span>
      </div>
      <div className="max-h-[420px] overflow-auto p-3">
        {rows.length === 0 ? (
          <p className="rounded-lg bg-[#fafbfd] p-5 text-center text-[12px]" style={{ color: INK_FAINT }}>Bu raporda sonuc yok.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row: any) => (
              <button
                key={`${title}-${row.productCode}`}
                type="button"
                onClick={() => onOpenProduct(row.productCode)}
                className="w-full rounded-lg border border-[#eef1f6] bg-white p-2.5 text-left transition hover:border-[#d6e0f1] hover:bg-[#fafbfd]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold" style={{ color: INK }}>{row.productCode} - {row.productName}</p>
                    <p className="mt-0.5 text-[10.5px]" style={{ color: INK_FAINT }}>{row.reason}</p>
                  </div>
                  <div className="text-right text-[10.5px] font-semibold" style={{ color: INK_MUTED }}>
                    <p>Mikro: {money(row.currentCost)}</p>
                    <p>En iyi: {money(row.bestCost)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5" style={{ color: INK_MUTED }}>Tedarikci: {row.supplierCount || 0}</span>
                  {row.diffPercent !== undefined && <span className="rounded-full bg-[#fef2f2] px-2 py-0.5" style={{ color: '#b91c1c' }}>Fark: {percent(row.diffPercent)}</span>}
                  {row.spreadPercent !== undefined && <span className="rounded-full bg-[#eef2fa] px-2 py-0.5" style={{ color: '#1c4585' }}>Spread: {percent(row.spreadPercent)}</span>}
                  {row.bestSupplier?.name && <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5" style={{ color: '#047857' }}>En iyi: {row.bestSupplier.name}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CostChangeSummaryNew({ currentCost, newCostT, updateLists }: { currentCost: any; newCostT: any; updateLists: boolean }) {
  const change = computeCostChange(currentCost, newCostT);
  const big = change.isBig;
  const affectedRows = updateLists ? 11 : 1;
  return (
    <div
      className="mt-3 rounded-lg border p-3"
      style={big ? { borderColor: '#fecaca', background: '#fef2f2' } : { borderColor: '#e7ebf2', background: '#fafbfd' }}
    >
      <div className="flex flex-wrap items-center gap-3 text-[13px] font-semibold">
        <span style={{ color: INK_FAINT }}>{money(currentCost)}</span>
        <span style={{ color: '#cbd5e1' }}>{'->'}</span>
        <span style={{ color: big ? '#b91c1c' : INK }}>{money(newCostT)}</span>
        {change.percent !== null && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={
              big
                ? { background: '#fecaca', color: '#991b1b' }
                : change.direction === 'down'
                  ? { background: '#ecfdf5', color: '#047857' }
                  : { background: '#e7ebf2', color: INK_MUTED }
            }
          >
            {change.direction === 'up' ? '+' : ''}{percent(change.percent)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] font-semibold" style={{ color: INK_FAINT }}>
        {change.percent === null
          ? 'Mevcut maliyet bos; degisim yuzdesi hesaplanamadi.'
          : updateLists
            ? `Maliyet ve 10 satis listesi (toplam ${affectedRows} satir) Mikroya yazilacak.`
            : 'Sadece Mikro maliyet alani yazilacak (1 satir).'}
      </p>
      {big && (
        <p className="mt-1 text-[11px] font-semibold" style={{ color: '#b91c1c' }}>
          Dikkat: Degisim %{BIG_COST_CHANGE_PERCENT}'in uzerinde. Lutfen yeni maliyeti tekrar kontrol edin.
        </p>
      )}
    </div>
  );
}

function toneStyleNew(tone: string) {
  if (tone === 'red') return { bg: '#fef2f2', fg: '#b91c1c' };
  if (tone === 'emerald') return { bg: '#ecfdf5', fg: '#047857' };
  if (tone === 'amber') return { bg: '#fffbeb', fg: '#b45309' };
  if (tone === 'orange') return { bg: '#fff7ed', fg: '#c2410c' };
  if (tone === 'blue') return { bg: '#eef2fa', fg: '#1c4585' };
  return { bg: '#f1f4f9', fg: INK_MUTED };
}
