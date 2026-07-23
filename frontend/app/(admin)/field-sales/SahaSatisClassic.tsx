'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  useSahaSatis,
  // ikonlar
  BadgeCheck,
  Barcode,
  Briefcase,
  Camera,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  Warehouse,
  X,
  // yardimcilar / sabitler
  Button,
  cn,
  tabs,
  money,
  n,
  safeDate,
  getPriceListLabel,
  getActiveWarehouses,
  getWarehouseByNo,
  activeSellable,
  roundUnitValue,
  parseDecimalInput,
  formatDecimalInput,
  getMikroListPrice,
  getDraftPriceListNo,
  getDraftPriceListOptions,
  getSelectedUnit,
  getDisplayQuantity,
  getDisplayUnitPrice,
  getCategoryLastPurchaseInfo,
  monthsSinceDate,
  getMatchingPriceListLabel,
  readCompressedVisitPhoto,
  getProductPrice,
  normalizeProductLike,
  matchesProductSearch,
  bumpDecimalText,
  getProfitInfo,
  getOpportunityRows,
  // tipler
  type DraftItem,
  type TabKey,
  type ProductMode,
  type PriceType,
} from './useSahaSatis';
import {
  convertPriceFromBaseUnit,
  convertPriceToBaseUnit,
  convertQuantityToBaseUnit,
  convertQuantityFromBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
} from './useSahaSatis';

/**
 * Klasik (mevcut) Saha Satis gorunumu.
 * TUM mantik useSahaSatis hook'undan gelir; bu dosya eski page.tsx'in JSX'inin BIRE BIR halidir.
 */
export default function SahaSatisClassic() {
  const {
    videoRef,
    activeTab,
    setActiveTab,
    safeMode,
    setSafeMode,
    priceType,
    setPriceType,
    isOnline,
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    customers,
    customerLoading,
    snapshot,
    snapshotLoading,
    productSearch,
    setProductSearch,
    productMode,
    setProductMode,
    products,
    productsLoading,
    selectedProduct,
    setSelectedProduct,
    productQuantities,
    setProductQuantities,
    draft,
    quoteNote,
    setQuoteNote,
    validityDate,
    setValidityDate,
    orderWarehouse,
    setOrderWarehouse,
    orderSeries,
    setOrderSeries,
    submitting,
    draftTotal,
    visitNote,
    setVisitNote,
    visitDemand,
    setVisitDemand,
    competitorInfo,
    setCompetitorInfo,
    photoUrl,
    location,
    noteSaving,
    newVisitOpen,
    setNewVisitOpen,
    newVisitName,
    setNewVisitName,
    newVisitPhone,
    setNewVisitPhone,
    newVisitNote,
    setNewVisitNote,
    newVisitDemand,
    setNewVisitDemand,
    newVisitCompetitorInfo,
    setNewVisitCompetitorInfo,
    newVisitPhotoUrl,
    setNewVisitPhotoUrl,
    newVisitLocation,
    newVisitSaving,
    duplicateCandidates,
    setDuplicateCandidates,
    recentCustomers,
    recentProducts,
    barcodeActive,
    searchProducts,
    openProductDetail,
    addToDraft,
    updateDraftItem,
    removeDraftItem,
    clearDraft,
    createQuote,
    createOrder,
    shareProduct,
    shareDraft,
    saveVisitNote,
    saveNewVisitCustomer,
    selectExistingDuplicate,
    pickPhoto,
    captureLocation,
    captureNewVisitLocation,
    stopBarcodeScanner,
    startBarcodeScanner,
  } = useSahaSatis();

  return (
    <div className="min-h-screen bg-[#f5f1e8] pb-24 text-slate-950">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-3 py-4 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-amber-950/10 bg-[#17201b] text-white shadow-2xl">
          <div className="relative p-5 sm:p-7">
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="absolute bottom-0 left-1/2 h-24 w-72 -translate-x-1/2 bg-emerald-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">Mobil saha satis</p>
                  {/* 4.5: cevrimici/cevrimdisi gostergesi */}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black',
                      isOnline ? 'bg-emerald-400/20 text-emerald-100' : 'bg-red-400/25 text-red-100'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-emerald-300' : 'bg-red-300')} />
                    {isOnline ? 'Cevrimici' : 'Cevrimdisi'}
                  </span>
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Saha Masasi</h1>
                <p className="mt-2 max-w-2xl text-sm text-amber-50/80">
                  Cari, bakiye, stok, fiyat, maliyet, son alim, firsat ve taslak teklif/siparis tek ekranda.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                {/* 4.2: Faturali / Beyaz fiyat tipi secimi (varsayilan cariye gore gelir) */}
                <button
                  onClick={() => setPriceType((value) => (value === 'WHITE' ? 'INVOICED' : 'WHITE'))}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition',
                    priceType === 'WHITE' ? 'border-sky-300/40 bg-sky-300/15 text-sky-50' : 'border-amber-300/40 bg-amber-300/15 text-amber-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}
                  </span>
                  <span className="mt-1 block text-xs font-medium opacity-75">
                    {priceType === 'WHITE' ? 'KDV sifir / beyaz fiyat' : 'KDV dahil / faturali fiyat'}
                  </span>
                </button>
                <button
                  onClick={() => setSafeMode((value) => !value)}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition',
                    safeMode ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50' : 'border-red-300/40 bg-red-300/15 text-red-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    {safeMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {safeMode ? 'Musteri modu' : 'Ic gorunum'}
                  </span>
                  <span className="mt-1 block text-xs font-medium opacity-75">
                    {safeMode ? 'Maliyet gizli' : 'Maliyet acik'}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm font-bold backdrop-blur"
                >
                  <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Taslak</span>
                  <span className="mt-1 block text-xs font-medium text-amber-50/75">{draft.length} kalem - {money(draftTotal)}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <CustomerStrip
          selectedCustomer={selectedCustomer}
          snapshot={snapshot}
          loading={snapshotLoading}
          onSelectTab={setActiveTab}
        />

        <main className="grid gap-4 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.8fr)] 2xl:grid-cols-[460px_minmax(0,1fr)]">
          <div className={cn(activeTab === 'customer' ? 'block' : 'hidden lg:block')}>
            <CustomerPanel
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              customerLoading={customerLoading}
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              snapshot={snapshot}
              snapshotLoading={snapshotLoading}
              visitNote={visitNote}
              setVisitNote={setVisitNote}
              visitDemand={visitDemand}
              setVisitDemand={setVisitDemand}
              competitorInfo={competitorInfo}
              setCompetitorInfo={setCompetitorInfo}
              photoUrl={photoUrl}
              pickPhoto={pickPhoto}
              location={location}
              captureLocation={captureLocation}
              saveVisitNote={saveVisitNote}
              noteSaving={noteSaving}
              newVisitOpen={newVisitOpen}
              setNewVisitOpen={setNewVisitOpen}
              newVisitName={newVisitName}
              setNewVisitName={setNewVisitName}
              newVisitPhone={newVisitPhone}
              setNewVisitPhone={setNewVisitPhone}
              newVisitNote={newVisitNote}
              setNewVisitNote={setNewVisitNote}
              newVisitDemand={newVisitDemand}
              setNewVisitDemand={setNewVisitDemand}
              newVisitCompetitorInfo={newVisitCompetitorInfo}
              setNewVisitCompetitorInfo={setNewVisitCompetitorInfo}
              newVisitPhotoUrl={newVisitPhotoUrl}
              setNewVisitPhotoUrl={setNewVisitPhotoUrl}
              newVisitLocation={newVisitLocation}
              captureNewVisitLocation={captureNewVisitLocation}
              saveNewVisitCustomer={saveNewVisitCustomer}
              newVisitSaving={newVisitSaving}
              duplicateCandidates={duplicateCandidates}
              setDuplicateCandidates={setDuplicateCandidates}
              selectExistingDuplicate={selectExistingDuplicate}
            />
          </div>

          <div className={cn(activeTab === 'products' ? 'block' : activeTab === 'draft' ? 'hidden lg:block' : activeTab === 'history' ? 'hidden lg:block' : 'hidden lg:block')}>
            <ProductPanel
              productSearch={productSearch}
              setProductSearch={setProductSearch}
              productMode={productMode}
              setProductMode={setProductMode}
              products={products}
              purchasedProducts={snapshot?.recentPurchases || []}
              opportunities={snapshot?.opportunities}
              productsLoading={productsLoading}
              searchProducts={searchProducts}
              startBarcodeScanner={startBarcodeScanner}
              safeMode={safeMode}
              priceType={priceType}
              selectedCustomer={selectedCustomer}
              snapshot={snapshot}
              productQuantities={productQuantities}
              setProductQuantities={setProductQuantities}
              addToDraft={addToDraft}
              openProductDetail={openProductDetail}
              shareProduct={shareProduct}
            />
          </div>

          <div className={cn(activeTab === 'draft' ? 'block lg:col-span-2' : 'hidden')}>
            <DraftPanel
              draft={draft}
              updateDraftItem={updateDraftItem}
              removeDraftItem={removeDraftItem}
              clearDraft={clearDraft}
              draftTotal={draftTotal}
              selectedCustomer={selectedCustomer}
              quoteNote={quoteNote}
              setQuoteNote={setQuoteNote}
              validityDate={validityDate}
              setValidityDate={setValidityDate}
              orderWarehouse={orderWarehouse}
              setOrderWarehouse={setOrderWarehouse}
              orderSeries={orderSeries}
              setOrderSeries={setOrderSeries}
              createQuote={createQuote}
              createOrder={createOrder}
              shareDraft={shareDraft}
              submitting={submitting}
              safeMode={safeMode}
              priceType={priceType}
              setPriceType={setPriceType}
            />
          </div>

          <div className={cn(activeTab === 'history' ? 'block lg:col-span-2' : 'hidden')}>
            <HistoryPanel
              recentCustomers={recentCustomers}
              recentProducts={recentProducts}
              setSelectedCustomer={setSelectedCustomer}
              openProductDetail={openProductDetail}
              notes={snapshot?.notes || []}
              selectedCustomer={selectedCustomer}
            />
          </div>
        </main>
      </div>

      <FloatingDraftBar
        draftCount={draft.length}
        draftTotal={draftTotal}
        selectedCustomer={selectedCustomer}
        onOpenDraft={() => setActiveTab('draft')}
        activeTab={activeTab}
      />

      <BottomTabs activeTab={activeTab} setActiveTab={setActiveTab} draftCount={draft.length} />

      {selectedProduct && (
        <ProductDrawer
          product={selectedProduct}
          safeMode={safeMode}
          priceType={priceType}
          onClose={() => setSelectedProduct(null)}
          addToDraft={addToDraft}
          shareProduct={shareProduct}
          quantity={productQuantities[selectedProduct.mikroCode] || '1'}
          setQuantity={(value: string) => setProductQuantities((current) => ({ ...current, [selectedProduct.mikroCode]: value }))}
        />
      )}

      {barcodeActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-900">Barkod okut</p>
              <Button variant="secondary" size="sm" onClick={stopBarcodeScanner}>Kapat</Button>
            </div>
            <video ref={videoRef} className="aspect-video w-full rounded-2xl bg-black object-cover" muted playsInline />
            <p className="mt-3 text-xs text-slate-500">Kamera barkodu gordugunde arama otomatik baslar.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerStrip({ selectedCustomer, snapshot, loading, onSelectTab }: any) {
  if (!selectedCustomer) {
    return (
      <section className="rounded-3xl border border-dashed border-amber-900/20 bg-white/75 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-800"><UserRound className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-bold text-slate-900">Once cari secin</p>
            <p className="text-xs text-slate-600">Fiyat, anlasma, son alis ve firsatlar cari secildikten sonra netlesir.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-3xl border border-amber-900/10 bg-white p-4 shadow-sm lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Secili cari</p>
        <p className="mt-1 text-lg font-black text-slate-950">{selectedCustomer.displayTitle || selectedCustomer.name}</p>
        <p className="text-xs text-slate-500">{selectedCustomer.mikroCariCode} - {selectedCustomer.sectorCode || 'Sektor yok'}</p>
      </div>
      <Metric label="Bakiye" value={loading ? '...' : money(snapshot?.summary?.balance || selectedCustomer.balance)} tone="amber" />
      <Metric label="Son satis" value={loading ? '...' : safeDate(snapshot?.summary?.lastSaleDate)} tone="emerald" />
      <button onClick={() => onSelectTab('products')} className="rounded-2xl bg-slate-950 px-4 py-3 text-left text-white">
        <span className="text-xs text-white/70">Hizli aksiyon</span>
        <span className="mt-1 flex items-center gap-2 text-sm font-bold"><Search className="h-4 w-4" /> Urun ara</span>
      </button>
    </section>
  );
}

function Metric({ label, value, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-900',
    emerald: 'bg-emerald-50 text-emerald-900',
    slate: 'bg-slate-100 text-slate-900',
  };
  return (
    <div className={cn('rounded-2xl px-4 py-3', tones[tone] || tones.slate)}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

function CustomerPanel(props: any) {
  const {
    customerSearch,
    setCustomerSearch,
    customerLoading,
    customers,
    selectedCustomer,
    setSelectedCustomer,
    snapshot,
    snapshotLoading,
    visitNote,
    setVisitNote,
    visitDemand,
    setVisitDemand,
    competitorInfo,
    setCompetitorInfo,
    photoUrl,
    pickPhoto,
    location,
    captureLocation,
    saveVisitNote,
    noteSaving,
    newVisitOpen,
    setNewVisitOpen,
    newVisitName,
    setNewVisitName,
    newVisitPhone,
    setNewVisitPhone,
    newVisitNote,
    setNewVisitNote,
    newVisitDemand,
    setNewVisitDemand,
    newVisitCompetitorInfo,
    setNewVisitCompetitorInfo,
    newVisitPhotoUrl,
    setNewVisitPhotoUrl,
    newVisitLocation,
    captureNewVisitLocation,
    saveNewVisitCustomer,
    newVisitSaving,
    duplicateCandidates,
    setDuplicateCandidates,
    selectExistingDuplicate,
  } = props;

  return (
    <section className="flex flex-col gap-4">
      <Panel title="Cari ara" icon={UserRound}>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => {
              setDuplicateCandidates([]); // 4.6: dialog acilip kapaninca aday listesini sifirla
              setNewVisitOpen((value: boolean) => !value);
            }}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left text-sm font-black transition',
              newVisitOpen ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
            )}
          >
            <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Yeni musteri ziyareti</span>
            <span className="mt-1 block text-xs font-medium opacity-75">Mikroda ZIYARET carisi acar ve notu konumla kaydeder.</span>
          </button>
        </div>

        {newVisitOpen && (
          <div className="mb-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="grid gap-2">
              <input
                value={newVisitName}
                onChange={(event) => { setNewVisitName(event.target.value); setDuplicateCandidates([]); }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Musteri / isletme adi *"
                className="h-12 rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-500"
              />
              <input
                value={newVisitPhone}
                onChange={(event) => { setNewVisitPhone(event.target.value); setDuplicateCandidates([]); }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Telefon"
                className="h-12 rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-500"
              />
              <textarea
                value={newVisitNote}
                onChange={(event) => setNewVisitNote(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Ziyaret notu"
                className="min-h-24 rounded-2xl border border-emerald-200 bg-white p-4 text-sm outline-none focus:border-emerald-500"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={newVisitDemand}
                  onChange={(event) => setNewVisitDemand(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="Talep / ihtiyac"
                  className="h-12 rounded-2xl border border-emerald-200 bg-white px-4 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  value={newVisitCompetitorInfo}
                  onChange={(event) => setNewVisitCompetitorInfo(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="Rakip bilgi"
                  className="h-12 rounded-2xl border border-emerald-200 bg-white px-4 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                  <Camera className="h-4 w-4" />
                  Foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void readCompressedVisitPhoto(file)
                        .then((dataUrl) => setNewVisitPhotoUrl(dataUrl))
                        .catch((error: any) => toast.error(error.message || 'Foto eklenemedi.'));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <button onClick={captureNewVisitLocation} className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                  <MapPin className="h-4 w-4" />
                  Konum
                </button>
              </div>
              {(newVisitPhotoUrl || newVisitLocation) && (
                <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-emerald-700">
                  {newVisitPhotoUrl ? 'Foto eklendi. ' : ''}
                  {newVisitLocation ? 'Konum eklendi.' : ''}
                </div>
              )}

              {/* 4.6: benzer cari uyarisi - mevcut cariyi sec ya da yine de olustur */}
              {(duplicateCandidates?.length || 0) > 0 && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-black text-amber-900">Benzer cari(ler) bulundu</p>
                  <p className="mt-0.5 text-xs font-medium text-amber-800">
                    Mukerrer cari acmamak icin once asagidakilerden birini secebilirsiniz.
                  </p>
                  <div className="mt-2 space-y-2">
                    {duplicateCandidates.map((candidate: any) => (
                      <button
                        key={candidate.id || candidate.mikroCariCode}
                        type="button"
                        onClick={() => selectExistingDuplicate(candidate)}
                        className="w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 text-left"
                      >
                        <p className="text-sm font-black text-slate-900">{candidate.displayTitle || candidate.name || candidate.mikroCariCode}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {candidate.mikroCariCode}
                          {candidate.phone ? ` - ${candidate.phone}` : ''}
                          {candidate.matchReason ? ` - ${candidate.matchReason}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-2 h-11 w-full rounded-2xl border-amber-300 text-amber-900"
                    isLoading={newVisitSaving}
                    onClick={() => saveNewVisitCustomer(true)}
                  >
                    Yine de yeni cari olustur
                  </Button>
                </div>
              )}

              <Button
                className="h-12 rounded-2xl bg-emerald-700 text-white hover:bg-emerald-800"
                isLoading={newVisitSaving}
                onClick={() => saveNewVisitCustomer()}
              >
                Ziyaret carisi ac ve notu kaydet
              </Button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="Cari kodu, unvan, sehir, sektor..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold outline-none focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
          {customerLoading && <LoadingLine label="Cari aranıyor" />}
          {!customerLoading && customers.length === 0 && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Arama icin en az 2 karakter yazin.</p>
          )}
          {customers.map((customer: any) => (
            <button
              key={customer.id}
              onClick={() => setSelectedCustomer(customer)}
              className={cn(
                'w-full rounded-2xl border p-3 text-left transition',
                selectedCustomer?.id === customer.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">{customer.displayTitle || customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.mikroCariCode} - {customer.city || '-'} / {customer.district || '-'}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{customer.sectorCode || 'Sektor yok'}</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Cari ozet" icon={Briefcase}>
        {!selectedCustomer ? (
          <EmptyText text="Cari secildikten sonra bakiye, vade, acik teklif/siparis ve firsatlar gorunur." />
        ) : snapshotLoading ? (
          <LoadingLine label="Cari ozeti yukleniyor" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Vade" value={snapshot?.summary?.vade?.paymentPlanName || selectedCustomer.paymentPlanName || `${selectedCustomer.paymentTerm || 0} gun`} />
              <Metric label="Acik siparis" value={snapshot?.summary?.openOrderCount || 0} />
              <Metric label="Acik teklif" value={snapshot?.summary?.openQuoteCount || 0} />
              <Metric label="Sepet" value={snapshot?.summary?.cartItemCount || 0} />
            </div>
            {selectedCustomer.isLocked && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Cari kilitli gorunuyor.</div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Firsatlar" icon={BadgeCheck}>
        {!snapshot ? (
          <EmptyText text="Cari secin." />
        ) : (
          <OpportunityList opportunities={snapshot.opportunities} />
        )}
      </Panel>

      <Panel title="Ziyaret notu" icon={MapPin}>
        {!selectedCustomer ? (
          <EmptyText text="Not yazmak icin cari secin." />
        ) : (
          <div className="space-y-3">
            <textarea
              value={visitNote}
              onChange={(event) => setVisitNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Gorusme notu, alinacak aksiyon..."
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <input
              value={visitDemand}
              onChange={(event) => setVisitDemand(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Talep / ihtiyac"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <input
              value={competitorInfo}
              onChange={(event) => setCompetitorInfo(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Rakip fiyat / rakip bilgi"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                <Camera className="h-4 w-4" />
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
              </label>
              <button onClick={captureLocation} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                <MapPin className="h-4 w-4" />
                Konum
              </button>
            </div>
            {(photoUrl || location) && (
              <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                {photoUrl && <span className="mr-3 font-bold text-emerald-700">Foto eklendi</span>}
                {location && <span className="font-bold text-emerald-700">Konum eklendi</span>}
              </div>
            )}
            <Button className="h-12 w-full rounded-2xl" isLoading={noteSaving} onClick={saveVisitNote}>
              Notu kaydet
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Gecmis notlar" icon={History}>
        <div className="space-y-2">
          {(snapshot?.notes || []).length === 0 && <EmptyText text="Bu cari icin saha notu yok." />}
          {(snapshot?.notes || []).map((note: any) => (
            <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500">{note.createdByName || note.createdBy?.name || '-'}</p>
                <p className="text-xs text-slate-400">{safeDate(note.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900">{note.note}</p>
              {note.demand && <p className="mt-1 text-xs text-slate-600">Talep: {note.demand}</p>}
              {note.competitorInfo && <p className="mt-1 text-xs text-slate-600">Rakip: {note.competitorInfo}</p>}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function ProductPanel(props: any) {
  const {
    productSearch,
    setProductSearch,
    productMode,
    setProductMode,
    products,
    purchasedProducts,
    opportunities,
    productsLoading,
    searchProducts,
    startBarcodeScanner,
    safeMode,
    priceType = 'INVOICED',
    selectedCustomer,
    snapshot,
    productQuantities,
    setProductQuantities,
    addToDraft,
    openProductDetail,
    shareProduct,
  } = props;
  const purchasedRows = useMemo(() => {
    const rows = Array.isArray(purchasedProducts) ? purchasedProducts : [];
    return rows.filter((product: any) => matchesProductSearch(product, productSearch));
  }, [purchasedProducts, productSearch]);
  const opportunityRows = useMemo(
    () => getOpportunityRows(opportunities).filter((product: any) => matchesProductSearch(product, productSearch)),
    [opportunities, productSearch]
  );
  const visibleProducts = productMode === 'purchased'
    ? purchasedRows
    : productMode === 'opportunity'
    ? opportunityRows
    : productMode === 'stock'
    ? products.filter((product: any) => activeSellable(product) > 0)
    : products;
  const productModes: Array<{ key: ProductMode; label: string; count?: number }> = [
    { key: 'search', label: 'Tum urunler', count: products.length },
    { key: 'purchased', label: 'Aldiklari', count: purchasedRows.length },
    { key: 'stock', label: 'Stokta', count: products.filter((product: any) => activeSellable(product) > 0).length },
    { key: 'opportunity', label: 'Firsatlar', count: opportunityRows.length },
  ];
  const placeholder = productMode === 'purchased'
    ? 'Daha once aldiklarinda ara...'
    : productMode === 'opportunity'
    ? 'Firsatlarda urun/kategori ara...'
    : 'Stok kodu, barkod, urun adi...';

  return (
    <section className="flex flex-col gap-4">
      <Panel title="Urun ara" icon={Package}>
        {selectedCustomer && (
          <div className="mb-3 grid gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900 sm:grid-cols-3">
            <div>
              <p className="font-black">Cari</p>
              <p className="truncate font-semibold">{selectedCustomer.displayTitle || selectedCustomer.mikroCariCode}</p>
            </div>
            <div>
              <p className="font-black">Son satis</p>
              <p className="font-semibold">{safeDate(snapshot?.summary?.lastSaleDate)}</p>
            </div>
            <div>
              <p className="font-black">Acik siparis / teklif</p>
              <p className="font-semibold">{snapshot?.summary?.openOrderCount || 0} / {snapshot?.summary?.openQuoteCount || 0}</p>
            </div>
          </div>
        )}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 lg:grid-cols-4">
          {productModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setProductMode(mode.key)}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-black transition',
                productMode === mode.key ? 'bg-white text-slate-950 shadow' : 'text-slate-500'
              )}
            >
              {mode.label}
              {mode.count !== undefined && (
                <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{mode.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder={placeholder}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>
          <Button className="h-14 rounded-2xl" onClick={productMode === 'search' || productMode === 'stock' ? searchProducts : undefined}>
            Ara
          </Button>
          <Button variant="secondary" className="h-14 rounded-2xl" onClick={startBarcodeScanner}>
            <Barcode className="mr-2 h-5 w-5" /> Okut
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          {safeMode ? 'Musteri modu acik: maliyet/marj gizli.' : 'Ic gorunum acik: maliyet ve marj gorunur.'}
          {/* 4.2: hangi fiyat tipinin gosterildigini belirt */}
          <span className={cn('rounded-full px-2 py-1 font-black', priceType === 'WHITE' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800')}>
            {priceType === 'WHITE' ? 'Beyaz fiyat' : 'Faturali fiyat'}
          </span>
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        {(productMode === 'search' || productMode === 'stock') && productsLoading && <LoadingCard />}
        {!productsLoading && visibleProducts.length === 0 && (
          <div className="xl:col-span-2">
            <EmptyText
              text={
                productMode === 'purchased'
                  ? 'Bu carinin daha once aldiklarinda sonuc yok.'
                  : productMode === 'opportunity'
                  ? 'Bu cari icin firsat listesinde sonuc yok.'
                  : productMode === 'stock'
                  ? 'Arama sonucunda merkez/topca stogu olan urun yok.'
                  : 'Urun aramak icin stok kodu, ad veya barkod okutun.'
              }
            />
          </div>
        )}
        {visibleProducts.map((rawProduct: any) => {
          const isSummaryRow = !rawProduct.mikroCode;
          const product = normalizeProductLike(rawProduct);
          const price = getProductPrice(product, priceType); // 4.2: secili fiyat tipine gore
          const qty = productQuantities[product.mikroCode] || '1';
          const merkez = getWarehouseByNo(product, 1);
          const topca = getWarehouseByNo(product, 6);
          const categoryInfo = getCategoryLastPurchaseInfo(product);
          const stockTotal = activeSellable(product);
          const stockTone = stockTotal > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800';
          return (
            <article key={product.mikroCode} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-lg">
              <button onClick={() => openProductDetail(product)} className="block w-full p-4 text-left">
                <div className="flex gap-3">
                  <ProductImage product={product} card />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-black leading-snug text-slate-950 lg:text-base">{product.name}</p>
                    <p className="text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
                    <CategoryLastPurchasePill info={categoryInfo} />
                    {rawProduct.reason && (
                      <p className="mt-1 line-clamp-2 text-xs font-semibold text-amber-700">{rawProduct.reason}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black">
                      <span className={cn('rounded-full border px-2 py-1', stockTone)}>
                        Merkez+Topca: {isSummaryRow ? 'Detayda' : n(stockTotal)}
                      </span>
                      {rawProduct.lastPurchaseDate && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                          Son alim: {safeDate(rawProduct.lastPurchaseDate)}
                        </span>
                      )}
                      {rawProduct.title && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                          {rawProduct.title}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                      <Mini label="Fiyat" value={isSummaryRow ? 'Detayda' : money(price.value)} />
                      <Mini label="Kaynak" value={isSummaryRow ? 'Detayda' : price.source} />
                      <Mini label="Merkez" value={isSummaryRow ? '-' : n(merkez?.sellable || 0)} />
                      <Mini label="Topca" value={isSummaryRow ? '-' : n(topca?.sellable || 0)} />
                    </div>
                  </div>
                </div>
              </button>
              <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-[148px_1fr_1fr]">
                <div className="grid grid-cols-[36px_1fr_36px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: bumpDecimalText(qty, -1) }))}
                    className="text-sm font-black text-slate-600"
                  >
                    -
                  </button>
                  <input
                    value={qty}
                    onChange={(event) => setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: event.target.value }))}
                    onFocus={(event) => event.currentTarget.select()}
                    inputMode="decimal"
                    className="h-11 bg-transparent px-2 text-center text-sm font-black outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: bumpDecimalText(qty, 1) }))}
                    className="text-sm font-black text-slate-600"
                  >
                    +
                  </button>
                </div>
                <Button variant="secondary" className="rounded-2xl" onClick={() => (isSummaryRow ? openProductDetail(product) : shareProduct(product))}>
                  {isSummaryRow ? 'Detay' : 'WhatsApp'}
                </Button>
                <Button className="min-h-11 rounded-2xl" onClick={() => addToDraft(product)}>
                  <Plus className="mr-1 h-4 w-4" /> Ekle
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DraftPanel(props: any) {
  const {
    draft,
    updateDraftItem,
    removeDraftItem,
    clearDraft,
    draftTotal,
    selectedCustomer,
    quoteNote,
    setQuoteNote,
    validityDate,
    setValidityDate,
    orderWarehouse,
    setOrderWarehouse,
    orderSeries,
    setOrderSeries,
    createQuote,
    createOrder,
    shareDraft,
    submitting,
    safeMode,
    priceType = 'INVOICED',
    setPriceType,
  } = props;
  const updateQuantity = (index: number, item: DraftItem, value: string) => {
    const parsed = parseDecimalInput(value);
    if (parsed === undefined) {
      updateDraftItem(index, { quantity: 0 });
      return;
    }
    const baseQuantity = convertQuantityToBaseUnit(parsed, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor);
    updateDraftItem(index, { quantity: Math.max(0, roundUnitValue(baseQuantity)) });
  };
  const updateSelectedUnit = (index: number, item: DraftItem, selectedUnit: string) => {
    updateDraftItem(index, { selectedUnit, manualPriceInput: undefined });
  };
  const updatePriceSource = (index: number, item: DraftItem, priceSource: DraftItem['priceSource']) => {
    if (priceSource === 'PRICE_LIST') {
      const listNo = getDraftPriceListNo(item, item.priceType, selectedCustomer);
      updateDraftItem(index, {
        priceSource,
        priceListNo: listNo,
        unitPrice: getMikroListPrice(item.priceLists, listNo),
        selectedSaleIndex: null,
        manualPriceInput: undefined,
        vatZeroed: item.priceType === 'WHITE',
      });
      return;
    }
    if (priceSource === 'LAST_SALE') {
      const sale = item.lastSales?.[0];
      updateDraftItem(index, {
        priceSource,
        selectedSaleIndex: sale ? 0 : null,
        unitPrice: Number(sale?.unitPrice || item.unitPrice || 0),
        vatZeroed: item.priceType === 'WHITE' ? true : Boolean(sale?.vatZeroed),
        priceListNo: null,
        manualPriceInput: undefined,
      });
      return;
    }
    updateDraftItem(index, {
      priceSource: 'MANUAL',
      priceListNo: null,
      selectedSaleIndex: null,
      manualPriceInput: formatDecimalInput(getDisplayUnitPrice(item)),
      vatZeroed: item.priceType === 'WHITE',
    });
  };
  const updatePriceList = (index: number, item: DraftItem, value: string) => {
    const listNo = getDraftPriceListNo(
      { ...item, priceListNo: Number(value || 0) || null },
      item.priceType,
      selectedCustomer
    );
    updateDraftItem(index, {
      priceListNo: listNo,
      unitPrice: getMikroListPrice(item.priceLists, listNo),
      manualPriceInput: undefined,
    });
  };
  const updateLastSale = (index: number, item: DraftItem, value: string) => {
    const saleIndex = value === '' ? null : Number(value);
    const sale = saleIndex === null ? null : item.lastSales?.[saleIndex];
    updateDraftItem(index, {
      selectedSaleIndex: saleIndex,
      unitPrice: Number(sale?.unitPrice || 0),
      vatZeroed: item.priceType === 'WHITE' ? true : Boolean(sale?.vatZeroed),
      manualPriceInput: undefined,
    });
  };
  const updateManualPrice = (index: number, item: DraftItem, value: string) => {
    const parsed = parseDecimalInput(value);
    const basePrice = parsed === undefined
      ? 0
      : convertPriceToBaseUnit(parsed, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor);
    updateDraftItem(index, { unitPrice: basePrice, manualPriceInput: value });
  };
  // Satir duzlemi degisince ayni ticari tier'in karsi fiziksel listesine gecilir
  // (ornegin Faturali 6 / liste 13 <-> Beyaz 6 / liste 14).
  const updateLinePriceType = (index: number, item: DraftItem, nextType: PriceType) => {
    const nextPriceListNo = item.priceSource === 'PRICE_LIST'
      ? getDraftPriceListNo(item, nextType, selectedCustomer)
      : null;
    updateDraftItem(index, {
      priceType: nextType,
      ...(item.priceSource === 'PRICE_LIST'
        ? {
            priceListNo: nextPriceListNo,
            unitPrice: getMikroListPrice(item.priceLists, Number(nextPriceListNo)),
            selectedSaleIndex: null,
            manualPriceInput: undefined,
          }
        : {}),
      vatZeroed: nextType === 'WHITE' ? true : Boolean(item.selectedSaleIndex !== null && item.selectedSaleIndex !== undefined ? item.lastSales?.[item.selectedSaleIndex]?.vatZeroed : false),
    });
  };

  return (
    <Panel title="Taslak teklif / siparis" icon={ShoppingCart}>
      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <Metric label="Cari" value={selectedCustomer?.displayTitle || selectedCustomer?.mikroCariCode || 'Secilmedi'} />
        <Metric label="Kalem" value={draft.length} />
        <Metric label="Toplam" value={money(draftTotal)} tone="amber" />
        {/* 4.2: yeni eklenecek kalemler icin varsayilan fiyat tipi (Faturali/Beyaz) */}
        <button
          type="button"
          onClick={() => setPriceType?.((value: PriceType) => (value === 'WHITE' ? 'INVOICED' : 'WHITE'))}
          className={cn(
            'rounded-2xl px-4 py-3 text-left transition',
            priceType === 'WHITE' ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'
          )}
        >
          <p className="text-xs font-semibold opacity-70">Yeni kalem tipi</p>
          <p className="mt-1 text-base font-black">{priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</p>
        </button>
      </div>

      <div className="space-y-3">
        {draft.length === 0 && <EmptyText text="Urun arama ekranindan taslaga urun ekleyin." />}
        {draft.map((item: DraftItem, index: number) => {
          const selectedUnit = getSelectedUnit(item);
          const availableUnits = getAvailableUnits(item.unit, item.unit2, item.unit2Factor);
          const displayQuantity = getDisplayQuantity(item);
          const displayUnitPrice = getDisplayUnitPrice(item);
          const categoryInfo = getCategoryLastPurchaseInfo(item);
          const unitLabel = getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor);
          const selectedSale = item.selectedSaleIndex !== null && item.selectedSaleIndex !== undefined
            ? item.lastSales?.[item.selectedSaleIndex]
            : null;
          const profitInfo = getProfitInfo(item.unitPrice, item);
          return (
            <div key={`${item.productCode}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                <ProductImage product={{ imageUrl: item.imageUrl, name: item.productName, mikroCode: item.productCode }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900 lg:text-base">{item.productName}</p>
                      <p className="text-xs font-bold text-slate-500">{item.productCode} - {item.unit}</p>
                      {unitLabel && <p className="mt-1 text-xs font-semibold text-sky-700">{unitLabel}</p>}
                      <CategoryLastPurchasePill info={categoryInfo} />
                      {/* Satir tipi degisince fiyat listesi ayni tier'in diger duzlemine eslenir. */}
                      <div className="mt-2 inline-flex overflow-hidden rounded-full border border-slate-200 text-[11px] font-black">
                        {(['INVOICED', 'WHITE'] as PriceType[]).map((typeOption) => (
                          <button
                            key={typeOption}
                            type="button"
                            onClick={() => updateLinePriceType(index, item, typeOption)}
                            className={cn(
                              'px-3 py-1 transition',
                              item.priceType === typeOption
                                ? typeOption === 'WHITE' ? 'bg-sky-600 text-white' : 'bg-amber-500 text-slate-950'
                                : 'bg-white text-slate-500'
                            )}
                          >
                            {typeOption === 'WHITE' ? 'Beyaz' : 'Faturali'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => removeDraftItem(index)} className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(170px,0.9fr)_minmax(220px,1.2fr)_minmax(220px,1.2fr)_120px]">
                    <div className="grid grid-cols-[1fr_92px] gap-2">
                      <div>
                        <LabeledInput
                          label="Miktar"
                          value={displayQuantity ? formatDecimalInput(displayQuantity) : ''}
                          onChange={(value: string) => updateQuantity(index, item, value)}
                        />
                        <div className="mt-1 grid grid-cols-3 gap-1">
                          {[-1, 1, 5].map((diff) => (
                            <button
                              key={diff}
                              type="button"
                              onClick={() => updateQuantity(index, item, bumpDecimalText(formatDecimalInput(displayQuantity), diff))}
                              className="rounded-xl bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600"
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Birim</span>
                        <select
                          value={selectedUnit}
                          onChange={(event) => updateSelectedUnit(index, item, event.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 text-sm font-black outline-none focus:border-amber-500"
                        >
                          {availableUnits.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Fiyat kaynagi</span>
                      <select
                        value={item.priceSource || 'PRICE_LIST'}
                        onChange={(event) => updatePriceSource(index, item, event.target.value as DraftItem['priceSource'])}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-amber-500"
                      >
                        <option value="LAST_SALE">Son Satis</option>
                        <option value="PRICE_LIST">Fiyat Listesi</option>
                        <option value="MANUAL">Manuel</option>
                      </select>
                    </label>

                    <div>
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Fiyat secimi</span>
                      {item.priceSource === 'LAST_SALE' ? (
                        <select
                          value={item.selectedSaleIndex ?? ''}
                          onChange={(event) => updateLastSale(index, item, event.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-amber-500"
                        >
                          <option value="">Son satis sec</option>
                          {(item.lastSales || []).map((sale: any, saleIndex: number) => {
                            const listLabel = getMatchingPriceListLabel(item.priceLists, sale.unitPrice);
                            const displaySalePrice = convertPriceFromBaseUnit(sale.unitPrice, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            const displaySaleQty = convertQuantityFromBaseUnit(sale.quantity, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            return (
                              <option key={`${sale.documentNo || sale.saleDate}-${saleIndex}`} value={saleIndex}>
                                {safeDate(sale.saleDate)} - {money(displaySalePrice)} ({formatDecimalInput(displaySaleQty)} {selectedUnit}){listLabel ? ` - ${listLabel}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      ) : item.priceSource === 'MANUAL' ? (
                        <input
                          value={item.manualPriceInput ?? formatDecimalInput(displayUnitPrice)}
                          onChange={(event) => updateManualPrice(index, item, event.target.value)}
                          onFocus={(event) => event.currentTarget.select()}
                          inputMode="decimal"
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-amber-500"
                        />
                      ) : (
                        <select
                          value={item.priceListNo || ''}
                          onChange={(event) => updatePriceList(index, item, event.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-amber-500"
                        >
                          {getDraftPriceListOptions(item.priceType).map((definition) => {
                            const listNo = definition.listNo;
                            const listPrice = getMikroListPrice(item.priceLists, listNo);
                            const displayPrice = convertPriceFromBaseUnit(listPrice, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            return (
                              <option key={listNo} value={listNo}>
                                {getPriceListLabel(listNo)} - {listPrice ? money(displayPrice) : 'Fiyat yok'}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3 text-right">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Satir</p>
                      <p className="text-sm font-black text-slate-950">{money(item.quantity * item.unitPrice)}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{money(displayUnitPrice)} / {selectedUnit}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {selectedUnit !== item.unit && (
                      <span className="rounded-full bg-sky-50 px-2 py-1 font-bold text-sky-700">
                        Mikro: {formatDecimalInput(item.quantity)} {item.unit}
                      </span>
                    )}
                    {selectedSale?.documentNo && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">
                        Son satis belge: {selectedSale.documentNo}
                      </span>
                    )}
                    {(item.lastQuotes || []).length > 0 && (
                      <span className="rounded-full bg-indigo-50 px-2 py-1 font-bold text-indigo-700">
                        Son teklif: {safeDate(item.lastQuotes?.[0]?.quoteDate)} - {money(item.lastQuotes?.[0]?.unitPrice)}
                      </span>
                    )}
                    {!safeMode && item.cost?.currentCost && (
                      <span className="rounded-full bg-red-50 px-2 py-1 font-bold text-red-700">
                        Maliyet: {money(item.cost.currentCost)}
                      </span>
                    )}
                    {!safeMode && profitInfo && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-1 font-bold',
                          profitInfo.tone === 'red'
                            ? 'bg-red-100 text-red-800'
                            : profitInfo.tone === 'amber'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        )}
                      >
                        Kar: {money(profitInfo.profit)} / %{n(profitInfo.percent, 1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">Teklif olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={validityDate}
              onChange={(event) => setValidityDate(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-amber-500"
            />
            <input
              value={quoteNote}
              onChange={(event) => setQuoteNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Not"
              className="h-12 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-amber-500"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-12 rounded-2xl" onClick={shareDraft}>
              <Send className="mr-2 h-4 w-4" /> Paylas
            </Button>
            <Button className="h-12 rounded-2xl" isLoading={submitting} onClick={createQuote}>
              <FileText className="mr-2 h-4 w-4" /> Teklif
            </Button>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-black">Siparis olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={orderWarehouse}
              onChange={(event) => setOrderWarehouse(event.target.value)}
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-bold outline-none"
            >
              <option value="1">Merkez depo</option>
              <option value="6">Topca depo</option>
            </select>
            <input
              value={orderSeries}
              onChange={(event) => setOrderSeries(event.target.value.toUpperCase())}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Siparis seri no"
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-bold uppercase text-white outline-none placeholder:text-white/50"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-12 rounded-2xl" onClick={clearDraft}>
              Temizle
            </Button>
            <Button className="h-12 rounded-2xl bg-amber-500 text-slate-950 hover:bg-amber-400" isLoading={submitting} onClick={createOrder}>
              <ClipboardList className="mr-2 h-4 w-4" /> Siparis
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function HistoryPanel({ recentCustomers, recentProducts, setSelectedCustomer, openProductDetail, notes, selectedCustomer }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Son cariler" icon={UserRound}>
        <div className="space-y-2">
          {recentCustomers.length === 0 && <EmptyText text="Son cari yok." />}
          {recentCustomers.map((customer: any) => (
            <button key={customer.id || customer.mikroCariCode} onClick={() => setSelectedCustomer(customer)} className="w-full rounded-2xl bg-slate-50 p-3 text-left">
              <p className="font-black text-slate-900">{customer.displayTitle || customer.name}</p>
              <p className="text-xs text-slate-500">{customer.mikroCariCode}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Son urunler" icon={Package}>
        <div className="space-y-2">
          {recentProducts.length === 0 && <EmptyText text="Son urun yok." />}
          {recentProducts.map((product: any) => (
            <button key={product.mikroCode} onClick={() => openProductDetail(product)} className="flex w-full gap-3 rounded-2xl bg-slate-50 p-3 text-left">
              <ProductImage product={product} small />
              <div className="min-w-0">
                <p className="truncate font-black text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">{product.mikroCode}</p>
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Cari notlari" icon={History}>
        <div className="space-y-2">
          {!selectedCustomer && <EmptyText text="Cari secin." />}
          {selectedCustomer && notes.length === 0 && <EmptyText text="Not yok." />}
          {notes.map((note: any) => (
            <div key={note.id} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{safeDate(note.createdAt)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{note.note}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ProductDrawer({ product, safeMode, priceType = 'INVOICED', onClose, addToDraft, shareProduct, quantity, setQuantity }: any) {
  const price = getProductPrice(product, priceType); // 4.2: secili fiyat tipine gore goster
  const [imageOpen, setImageOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(product?.unit || 'ADET');
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previous = {
      bodyOverflow: bodyStyle.overflow,
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyWidth: bodyStyle.width,
      htmlOverscrollBehavior: htmlStyle.overscrollBehavior,
    };

    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.width = '100%';
    htmlStyle.overscrollBehavior = 'none';

    return () => {
      bodyStyle.overflow = previous.bodyOverflow;
      bodyStyle.position = previous.bodyPosition;
      bodyStyle.top = previous.bodyTop;
      bodyStyle.width = previous.bodyWidth;
      htmlStyle.overscrollBehavior = previous.htmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    setSelectedUnit(product?.unit || 'ADET');
  }, [product?.mikroCode, product?.unit]);
  const visibleWarehouses = getActiveWarehouses(product);
  const categoryInfo = getCategoryLastPurchaseInfo(product);
  const availableUnits = getAvailableUnits(product.unit, product.unit2, product.unit2Factor);
  const displayPrice = convertPriceFromBaseUnit(price.value, selectedUnit, product.unit, product.unit2, product.unit2Factor);
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const profitInfo = getProfitInfo(price.value, product);
  const requestPriceCheck = () => {
    if (typeof window === 'undefined') return;
    void navigator.clipboard?.writeText(product.mikroCode || '');
    window.open('/supplier-costs?tab=requests', '_blank');
  };
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end overflow-hidden bg-slate-950/65 p-0 backdrop-blur-sm lg:items-center lg:justify-center lg:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[96svh] sm:rounded-t-[2rem] lg:h-[90vh] lg:max-w-6xl lg:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-sm backdrop-blur lg:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <button type="button" onClick={() => setImageOpen(true)} className="shrink-0">
                <ProductImage product={product} />
              </button>
              <div className="min-w-0">
                <p className="max-h-20 overflow-y-auto text-lg font-black leading-tight text-slate-950 lg:text-2xl">
                  {product.name}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
                {unitLabel && <p className="mt-1 text-xs font-semibold text-sky-700">{unitLabel}</p>}
                <CategoryLastPurchasePill info={categoryInfo} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black lg:grid-cols-5">
            <div className="rounded-2xl bg-amber-50 px-2 py-2 text-amber-900">
              <p className="opacity-70">Cari fiyat ({priceType === 'WHITE' ? 'Beyaz' : 'Faturali'})</p>
              <p>{money(displayPrice)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-2 py-2 text-slate-800">
              <p className="opacity-70">Kaynak</p>
              <p className="truncate">{price.source}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-2 py-2 text-emerald-800">
              <p className="opacity-70">M+T stok</p>
              <p>{n(activeSellable(product))}</p>
            </div>
            <div className="hidden rounded-2xl bg-slate-50 px-2 py-2 text-slate-800 lg:block">
              <p className="opacity-70">Son teklif</p>
              <p>{safeDate(product.lastQuotes?.[0]?.quoteDate)}</p>
            </div>
            <div className="hidden rounded-2xl bg-slate-50 px-2 py-2 text-slate-800 lg:block">
              <p className="opacity-70">Son satis</p>
              <p>{safeDate(product.customerPrice?.lastSales?.[0]?.saleDate)}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-start">
            <div className="min-w-0">
              <div className="space-y-4">
              <ProductLargeImage product={product} onOpen={() => setImageOpen(true)} />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Cari fiyat" value={money(displayPrice)} tone="amber" />
                <Metric label="Kaynak" value={price.source} />
                <Metric label="Merkez+Topca" value={n(activeSellable(product))} tone="emerald" />
                <Metric label="KDV" value={`%${n(product.vatRate, 0)}`} />
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><Warehouse className="h-4 w-4" /> Depolar</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleWarehouses.map((row: any) => (
                    <div key={row.key} className="rounded-2xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-black text-slate-900">{row.label}</p>
                        <p className={cn('rounded-full px-2 py-1 text-xs font-black', Number(row.sellable) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800')}>
                          {n(row.sellable)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Eldeki {n(row.stock)} - Musteri bekleyen {n(row.pendingCustomer)} - Satin alma {n(row.pendingPurchase)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><DollarSign className="h-4 w-4" /> Fiyat listeleri</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {getDraftPriceListOptions(priceType).map((definition) => {
                    const listNo = definition.listNo;
                    const value = getMikroListPrice(product.priceLists, listNo);
                    return (
                    <button
                      key={listNo}
                      type="button"
                      onClick={() =>
                        addToDraft(product, {
                          priceSource: 'PRICE_LIST',
                          priceListNo: listNo,
                          unitPrice: Number(value || 0),
                          selectedUnit,
                          priceType,
                        })
                      }
                      className="rounded-2xl bg-slate-50 px-3 py-2 text-left transition hover:bg-amber-50"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{getPriceListLabel(listNo)}</p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                        {money(convertPriceFromBaseUnit(Number(value || 0), selectedUnit, product.unit, product.unit2, product.unit2Factor))}
                      </p>
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>

            <div className="space-y-4">
              {!safeMode && product.cost && (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-black text-red-900"><ShieldCheck className="h-4 w-4" /> Ic maliyet gorunumu</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Mini label="Guncel maliyet" value={money(product.cost.currentCost)} />
                    <Mini label="KDV dahil" value={money(product.cost.currentCostVatIncluded)} />
                    <Mini label="Maliyet tarihi" value={safeDate(product.cost.currentCostDate)} />
                    <Mini label="Son giris" value={safeDate(product.cost.lastEntryDate)} />
                  </div>
                  {profitInfo && (
                    <div className={cn(
                      'mt-3 rounded-2xl px-3 py-2 text-sm font-black',
                      profitInfo.tone === 'red'
                        ? 'bg-red-100 text-red-800'
                        : profitInfo.tone === 'amber'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    )}>
                      Cari fiyatta kar: {money(profitInfo.profit)} / %{n(profitInfo.percent, 1)}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-sm font-black text-slate-900">Hizli ekleme</p>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    inputMode="decimal"
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-black outline-none focus:border-amber-500"
                  />
                  <select
                    value={selectedUnit}
                    onChange={(event) => setSelectedUnit(event.target.value)}
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-amber-500"
                  >
                    {availableUnits.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[-1, 1, 5, 10].map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setQuantity(bumpDecimalText(quantity, diff))}
                      className="h-10 rounded-2xl bg-slate-100 text-sm font-black text-slate-700"
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-black text-slate-900">Son satislar</p>
                {(product.customerPrice?.lastSales || []).length === 0 && <EmptyText text="Bu cari icin son satis bulunamadi." />}
                {(product.customerPrice?.lastSales || []).map((sale: any, index: number) => (
                  <div key={`${sale.documentNo}-${index}`} className="mb-2 rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{safeDate(sale.saleDate)}</span>
                      <span className="text-slate-500">{sale.documentNo || '-'}</span>
                      <span className="font-bold">{n(sale.quantity)} x {money(sale.unitPrice)}</span>
                      {getMatchingPriceListLabel(product.priceLists, sale.unitPrice) && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-700">
                          {getMatchingPriceListLabel(product.priceLists, sale.unitPrice)}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 rounded-full"
                      onClick={() => addToDraft(product, { priceSource: 'LAST_SALE', saleIndex: index, unitPrice: sale.unitPrice, selectedUnit })}
                    >
                      Bu fiyatla ekle
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-black text-slate-900">Son teklifler</p>
                {(product.lastQuotes || []).length === 0 && <EmptyText text="Bu urun icin son teklif bulunamadi." />}
                {(product.lastQuotes || []).slice(0, 3).map((quote: any, index: number) => (
                  <div key={`${quote.documentNo || quote.quoteDate}-${index}`} className="mb-2 rounded-2xl bg-indigo-50 p-3 text-sm">
                    <div>
                      <span className="font-bold text-indigo-950">{safeDate(quote.quoteDate)}</span>
                      <span className="ml-2 text-indigo-700">{quote.documentNo || quote.quoteNumber || '-'}</span>
                      <span className="ml-2 font-bold text-indigo-950">{n(quote.quantity)} x {money(quote.unitPrice)}</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 rounded-full"
                      onClick={() => addToDraft(product, { priceSource: 'MANUAL', unitPrice: Number(quote.unitPrice || 0), selectedUnit })}
                    >
                      Teklif fiyatiyla ekle
                    </Button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={requestPriceCheck}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800"
              >
                <Sparkles className="h-4 w-4" />
                Fiyat teyidi ekranini ac
              </button>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 z-20 grid grid-cols-[1fr_1fr] gap-2 border-t border-slate-100 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:grid-cols-[1fr_1fr_1fr] lg:p-6">
          <div className="hidden rounded-2xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-800 lg:block">
            {quantity || '1'} {selectedUnit} x {money(displayPrice)}
          </div>
          <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => shareProduct(product)}>WhatsApp</Button>
          <Button className="h-12 rounded-2xl" onClick={() => addToDraft(product, { selectedUnit })}><Plus className="mr-2 h-4 w-4" /> Ekle</Button>
        </div>
      </div>
      {imageOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={(event) => {
            event.stopPropagation();
            setImageOpen(false);
          }}
        >
          <div className="relative max-h-full max-w-5xl">
            <button
              className="absolute right-2 top-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-slate-900 shadow"
              type="button"
              onClick={() => setImageOpen(false)}
            >
              Kapat
            </button>
            {product?.imageUrl ? (
              <img src={product.imageUrl} alt={product.name || product.mikroCode} className="max-h-[88vh] max-w-full rounded-3xl bg-white object-contain p-3 shadow-2xl" />
            ) : (
              <div className="flex h-[60vh] w-[80vw] max-w-3xl items-center justify-center rounded-3xl bg-white text-slate-400">
                <Package className="h-20 w-20" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OpportunityList({ opportunities }: any) {
  const rows = [
    ...(opportunities?.stalePurchased || []),
    ...(opportunities?.agreementNoRecent || []),
    ...(opportunities?.similarSector || []),
  ].slice(0, 12);

  if (rows.length === 0) return <EmptyText text="Firsat onerisi yok." />;

  return (
    <div className="space-y-2">
      {rows.map((row: any, index: number) => (
        <div key={`${row.type}-${row.productCode}-${index}`} className="rounded-2xl bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{row.productName || row.productCode}</p>
              <p className="text-xs font-bold text-amber-700">{row.title}</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{row.productCode}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{row.reason}</p>
          {(row.categoryName || row.categoryCode || row.categoryLastPurchaseDate) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
              {(row.categoryName || row.categoryCode) && (
                <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                  Kategori: {row.categoryName || row.categoryCode}
                </span>
              )}
              {row.categoryLastPurchaseDate && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                  Kategori son alim: {safeDate(row.categoryLastPurchaseDate)}
                  {row.categoryMonthsSinceLastPurchase !== null && row.categoryMonthsSinceLastPurchase !== undefined
                    ? ` (${n(row.categoryMonthsSinceLastPurchase, 1)} ay)`
                    : ''}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: any) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-2xl bg-slate-950 p-2 text-white"><Icon className="h-4 w-4" /></div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ProductLargeImage({ product, onOpen }: any) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50"
    >
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.mikroCode} className="h-full w-full object-contain p-4 transition group-hover:scale-105" />
      ) : (
        <Package className="h-16 w-16 text-slate-300" />
      )}
      <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs font-black text-white shadow">
        Buyut
      </span>
    </button>
  );
}

function ProductImage({ product, small = false, card = false }: any) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-2xl bg-slate-100', small ? 'h-12 w-12' : card ? 'h-20 w-20 lg:h-24 lg:w-24' : 'h-20 w-20')}>
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.productName || product.mikroCode} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Package className={small ? 'h-5 w-5' : 'h-8 w-8'} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{String(value ?? '-')}</p>
    </div>
  );
}

function CategoryLastPurchasePill({ info }: { info?: any }) {
  if (!info?.lastPurchaseDate) return null;
  const months = info.monthsSinceLastPurchase ?? monthsSinceDate(info.lastPurchaseDate);
  const monthsText = months === null ? null : `${Number(months).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay once`;
  return (
    <span className="mt-1 inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-800">
      Kategori son alim: {monthsText || safeDate(info.lastPurchaseDate)}
    </span>
  );
}

function LabeledInput({ label, value, onChange }: any) {
  return (
    <label className="block rounded-2xl bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        inputMode="decimal"
        className="mt-1 h-7 w-full bg-transparent text-sm font-black text-slate-900 outline-none"
      />
    </label>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">{text}</p>;
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <LoadingLine label="Urunler yukleniyor" />
    </div>
  );
}

function FloatingDraftBar({ draftCount, draftTotal, selectedCustomer, onOpenDraft, activeTab }: any) {
  if (!draftCount || activeTab === 'draft') return null;
  return (
    <button
      type="button"
      onClick={onOpenDraft}
      className="fixed bottom-20 left-3 right-3 z-30 flex items-center justify-between rounded-3xl border border-amber-200 bg-slate-950 px-4 py-3 text-left text-white shadow-2xl lg:bottom-5 lg:left-auto lg:right-6 lg:w-[420px]"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-white/65">
          {selectedCustomer?.displayTitle || selectedCustomer?.mikroCariCode || 'Cari secilmedi'}
        </p>
        <p className="text-sm font-black">{draftCount} kalem taslak kayitli</p>
      </div>
      <div className="shrink-0 rounded-2xl bg-amber-400 px-3 py-2 text-sm font-black text-slate-950">
        {money(draftTotal)}
      </div>
    </button>
  );
}

function BottomTabs({ activeTab, setActiveTab, draftCount }: any) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn('relative rounded-2xl px-2 py-2 text-xs font-black transition', active ? 'bg-slate-950 text-white' : 'text-slate-500')}
            >
              <Icon className="mx-auto mb-1 h-5 w-5" />
              {tab.label}
              {tab.key === 'draft' && draftCount > 0 && (
                <span className="absolute right-2 top-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-950">{draftCount}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
