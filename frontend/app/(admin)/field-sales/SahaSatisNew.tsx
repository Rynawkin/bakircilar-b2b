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
  tabs,
  money,
  n,
  safeDate,
  PRICE_LIST_LABELS,
  getPriceListLabel,
  getActiveWarehouses,
  getWarehouseByNo,
  activeSellable,
  parseDecimalInput,
  formatDecimalInput,
  getMikroListPrice,
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
  roundUnitValue,
  // tipler
  type DraftItem,
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

/* ----------------------------------------------------------------------------
 * Yeni gorunum Saha Satis. TUM mantik useSahaSatis'tan gelir; sadece gorsel yeni.
 * Hicbir handler/sekme/kolon/filtre/numpad/barkod/satir-aksiyon/modal/durum/Mikro-DB
 * yazma dusurulmemistir. Klasik ile birebir ozellik esligi (brief 4.4.1).
 * Renkler: primary #15356b, koyu header #0c2247, ink #14223b/#51607a/#8b97ac,
 * kart #fff border #e7ebf2 radius 12px; emerald/amber/red durum renkleri.
 * -------------------------------------------------------------------------- */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INPUT =
  'h-[38px] border border-[#e3e8f0] rounded-lg px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white w-full';
const LABEL = 'text-[11px] font-semibold text-[#8b97ac]';

export default function SahaSatisNew() {
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
    <div className="min-h-screen bg-[#f4f6fa] pb-24 text-[#14223b]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
        {/* Header (koyu) — MOBIL SAHA SATIS + cevrimici/cevrimdisi + 3 toggle */}
        <div className="bg-[#0c2247] rounded-[14px] px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-[#9bb0d4]">MOBIL SAHA SATIS</span>
              {/* 4.5: cevrimici/cevrimdisi gostergesi */}
              <span
                className={cnx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold',
                  isOnline ? 'bg-[#34d399]/[0.16] text-[#6ee7b7]' : 'bg-[#f87171]/[0.2] text-[#fca5a5]'
                )}
              >
                <span className={cnx('h-1.5 w-1.5 rounded-full', isOnline ? 'bg-[#34d399]' : 'bg-[#f87171]')} />
                {isOnline ? 'Cevrimici' : 'Cevrimdisi'}
              </span>
            </div>
            <h1 className="mt-2 text-[21px] font-semibold text-white">Saha Satis Masasi</h1>
            <p className="mt-1 text-[12.5px] text-[#9bb0d4] max-w-2xl">
              Cari, bakiye, stok, fiyat, maliyet, son alim, firsat ve taslak teklif/siparis tek ekranda.
            </p>
          </div>
          <div className="lg:ml-auto flex flex-wrap items-center gap-2">
            {/* 4.2: Faturali / Beyaz fiyat tipi secimi */}
            <div className="inline-flex bg-white/[0.08] rounded-lg p-[3px]" role="group" aria-label="Fiyat tipi">
              <button
                type="button"
                onClick={() => priceType !== 'INVOICED' && setPriceType('INVOICED')}
                className={cnx(
                  'px-3.5 py-1.5 text-[12px] rounded-md transition',
                  priceType === 'INVOICED' ? 'bg-white text-[#0c2247] font-semibold' : 'text-[#cdddf5] font-medium'
                )}
              >
                Faturali
              </button>
              <button
                type="button"
                onClick={() => priceType !== 'WHITE' && setPriceType('WHITE')}
                className={cnx(
                  'px-3.5 py-1.5 text-[12px] rounded-md transition',
                  priceType === 'WHITE' ? 'bg-white text-[#0c2247] font-semibold' : 'text-[#cdddf5] font-medium'
                )}
              >
                Beyaz
              </button>
            </div>
            {/* 4.2: safeMode — Musteri modu / Ic gorunum */}
            <div className="inline-flex bg-white/[0.08] rounded-lg p-[3px]" role="group" aria-label="Gorunum modu">
              <button
                type="button"
                onClick={() => safeMode && setSafeMode(false)}
                className={cnx(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] rounded-md transition',
                  !safeMode ? 'bg-white text-[#0c2247] font-semibold' : 'text-[#cdddf5] font-medium'
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Ic Gorunum
              </button>
              <button
                type="button"
                onClick={() => !safeMode && setSafeMode(true)}
                className={cnx(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] rounded-md transition',
                  safeMode ? 'bg-white text-[#0c2247] font-semibold' : 'text-[#cdddf5] font-medium'
                )}
              >
                <EyeOff className="h-3.5 w-3.5" /> Musteri Modu
              </button>
            </div>
            {/* Taslak ozeti -> Taslak sekmesine git */}
            <button
              type="button"
              onClick={() => setActiveTab('draft')}
              className="inline-flex items-center gap-1.5 bg-white/[0.08] border border-white/[0.14] text-white text-[12px] font-medium px-3 py-[7px] rounded-lg hover:bg-white/[0.14] transition"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Taslak: {draft.length} kalem - {money(draftTotal)}
            </button>
          </div>
        </div>

        {/* Ust sekme bari (Cari / Urun / Taslak / Gecmis) — masaustunde de gorunur */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            const labelMap: Record<string, string> = { customer: 'Cari', products: 'Urun', draft: 'Taslak', history: 'Gecmis' };
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cnx(
                  'inline-flex items-center gap-2 px-3.5 py-2 text-[13px] rounded-lg transition',
                  active
                    ? 'bg-[#eef2fa] border border-[#d6e0f1] text-[#15356b] font-semibold'
                    : 'text-[#64748b] font-medium hover:bg-[#f1f4f9]'
                )}
              >
                <Icon className="h-4 w-4" />
                {labelMap[tab.key] || tab.label}
                {tab.key === 'draft' && draft.length > 0 && (
                  <span className="bg-[#15356b] text-white text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full">{draft.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* CustomerStrip — secili cari + bakiye + son satis + Urun ara */}
        <CustomerStrip
          selectedCustomer={selectedCustomer}
          snapshot={snapshot}
          loading={snapshotLoading}
          onSelectTab={setActiveTab}
        />

        <main className="grid gap-4 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.8fr)] 2xl:grid-cols-[460px_minmax(0,1fr)]">
          <div className={cnx(activeTab === 'customer' ? 'block' : 'hidden lg:block')}>
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

          <div className={cnx(activeTab === 'products' ? 'block' : 'hidden lg:block')}>
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

          <div className={cnx(activeTab === 'draft' ? 'block lg:col-span-2' : 'hidden')}>
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

          <div className={cnx(activeTab === 'history' ? 'block lg:col-span-2' : 'hidden')}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-white rounded-[14px] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-[#14223b]">Barkod okut</p>
              <button
                type="button"
                onClick={stopBarcodeScanner}
                className="bg-white border border-[#d8e0ec] rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
              >
                Kapat
              </button>
            </div>
            <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
            <p className="mt-3 text-[11.5px] text-[#8b97ac]">Kamera barkodu gordugunde arama otomatik baslar.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* küçük yardımcı className birleştirici (cn ile aynı davranış, isim çakışması yok) */
function cnx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* ===========================  CustomerStrip  ============================ */
function CustomerStrip({ selectedCustomer, snapshot, loading, onSelectTab }: any) {
  if (!selectedCustomer) {
    return (
      <section className="bg-white border border-dashed border-[#d6e0f1] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#eef2fa] p-2.5 text-[#15356b]">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#14223b]">Once cari secin</p>
            <p className="text-[12px] text-[#51607a]">Fiyat, anlasma, son alis ve firsatlar cari secildikten sonra netlesir.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex items-center gap-3 flex-wrap bg-[#eef2fa] border border-[#d6e0f1] rounded-xl px-4 py-3">
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#15356b]">Secili cari</div>
        <div className="text-[15px] font-semibold text-[#14223b] truncate">{selectedCustomer.displayTitle || selectedCustomer.name}</div>
        <div className="text-[11.5px] text-[#51607a] font-mono">
          {selectedCustomer.mikroCariCode} - {selectedCustomer.sectorCode || 'Sektor yok'}
        </div>
      </div>
      <div className="text-[12.5px] font-semibold text-[#b45309]">
        Bakiye: {loading ? '...' : money(snapshot?.summary?.balance || selectedCustomer.balance)}
      </div>
      <div className="text-[12px] text-[#51607a]">Son satis: {loading ? '...' : safeDate(snapshot?.summary?.lastSaleDate)}</div>
      <button
        type="button"
        onClick={() => onSelectTab('products')}
        className="ml-auto inline-flex items-center gap-1.5 bg-white border border-[#d6e0f1] rounded-lg px-3 py-[7px] text-[12px] font-semibold text-[#15356b] hover:bg-[#15356b] hover:text-white transition"
      >
        <Search className="h-3.5 w-3.5" /> Urun ara
      </button>
    </section>
  );
}

/* ============================  Metric  ================================= */
function Metric({ label, value, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    amber: 'bg-[#fffbeb] border-[#fde68a] text-[#92500a]',
    emerald: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]',
    slate: 'bg-[#fafbfd] border-[#eef1f6] text-[#14223b]',
  };
  return (
    <div className={cnx('rounded-lg border px-3 py-2.5', tones[tone] || tones.slate)}>
      <div className="text-[10.5px] font-medium opacity-80">{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold">{value}</div>
    </div>
  );
}

/* ===========================  Panel  ================================== */
function Panel({ title, icon: Icon, children, action }: any) {
  return (
    <section className={cnx(CARD, 'p-4')}>
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-lg bg-[#eef2fa] p-1.5 text-[#15356b]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-[14px] font-semibold text-[#14223b]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ========================  CustomerPanel  ============================= */
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
      {/* Cari ara + Yeni musteri ziyareti */}
      <Panel title="Cari ara" icon={UserRound}>
        <button
          type="button"
          onClick={() => {
            setDuplicateCandidates([]); // 4.6: dialog acilip kapaninca aday listesini sifirla
            setNewVisitOpen((value: boolean) => !value);
          }}
          className={cnx(
            'mb-3 w-full rounded-lg border px-3.5 py-2.5 text-left transition',
            newVisitOpen
              ? 'border-[#a7f3d0] bg-[#ecfdf5]'
              : 'border-[#d8e0ec] bg-white hover:bg-[#f4f6fa]'
          )}
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#15356b]">
            <Plus className="h-4 w-4" /> Yeni musteri ziyareti
          </div>
          <div className="mt-0.5 text-[11.5px] text-[#51607a]">Mikroda ZIYARET carisi acar ve notu konumla kaydeder.</div>
        </button>

        {newVisitOpen && (
          <div className="mb-4 rounded-xl border border-[#a7f3d0] bg-[#f0fdf9] p-3">
            <div className="grid gap-2.5">
              <input
                value={newVisitName}
                onChange={(event) => {
                  setNewVisitName(event.target.value);
                  setDuplicateCandidates([]);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Musteri / isletme adi *"
                className={INPUT}
              />
              <input
                value={newVisitPhone}
                onChange={(event) => {
                  setNewVisitPhone(event.target.value);
                  setDuplicateCandidates([]);
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Telefon"
                className={INPUT}
              />
              <textarea
                value={newVisitNote}
                onChange={(event) => setNewVisitNote(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Ziyaret notu"
                className="min-h-[68px] rounded-lg border border-[#e3e8f0] bg-white p-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] resize-none"
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <input
                  value={newVisitDemand}
                  onChange={(event) => setNewVisitDemand(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="Talep / ihtiyac"
                  className={INPUT}
                />
                <input
                  value={newVisitCompetitorInfo}
                  onChange={(event) => setNewVisitCompetitorInfo(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="Rakip bilgi"
                  className={INPUT}
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
                  <Camera className="h-3.5 w-3.5" />
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
                <button
                  type="button"
                  onClick={captureNewVisitLocation}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Konum
                </button>
              </div>
              {(newVisitPhotoUrl || newVisitLocation) && (
                <div className="rounded-lg bg-white border border-[#a7f3d0] px-3 py-2 text-[11.5px] font-semibold text-[#047857]">
                  {newVisitPhotoUrl ? 'Foto eklendi. ' : ''}
                  {newVisitLocation ? 'Konum eklendi.' : ''}
                </div>
              )}

              {/* 4.6: benzer cari uyarisi - mevcut cariyi sec ya da yine de olustur */}
              {(duplicateCandidates?.length || 0) > 0 && (
                <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
                  <p className="text-[13px] font-semibold text-[#92500a]">Benzer cari(ler) bulundu</p>
                  <p className="mt-0.5 text-[11.5px] text-[#92500a]">
                    Mukerrer cari acmamak icin once asagidakilerden birini secebilirsiniz.
                  </p>
                  <div className="mt-2 space-y-2">
                    {duplicateCandidates.map((candidate: any) => (
                      <button
                        key={candidate.id || candidate.mikroCariCode}
                        type="button"
                        onClick={() => selectExistingDuplicate(candidate)}
                        className="w-full rounded-lg border border-[#fde68a] bg-white px-3 py-2 text-left hover:bg-[#fffdf5]"
                      >
                        <p className="text-[12.5px] font-semibold text-[#14223b]">
                          {candidate.displayTitle || candidate.name || candidate.mikroCariCode}
                        </p>
                        <p className="text-[11px] font-medium text-[#51607a]">
                          {candidate.mikroCariCode}
                          {candidate.phone ? ` - ${candidate.phone}` : ''}
                          {candidate.matchReason ? ` - ${candidate.matchReason}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={newVisitSaving}
                    onClick={() => saveNewVisitCustomer(true)}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#fde68a] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#92500a] hover:bg-[#fffdf5] disabled:opacity-60"
                  >
                    {newVisitSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Yine de yeni cari olustur
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={newVisitSaving}
                onClick={() => saveNewVisitCustomer()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#047857] px-3 py-2.5 text-[12.5px] font-semibold text-white hover:bg-[#065f46] disabled:opacity-60"
              >
                {newVisitSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ziyaret carisi ac ve notu kaydet
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa6b8]" />
          <input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="Cari kodu, unvan, sehir, sektor..."
            className="h-[42px] w-full rounded-lg border border-[#e3e8f0] bg-white pl-9 pr-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
          />
        </div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
          {customerLoading && <LoadingLine label="Cari araniyor" />}
          {!customerLoading && customers.length === 0 && (
            <p className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3.5 text-[12.5px] text-[#8b97ac]">
              Arama icin en az 2 karakter yazin.
            </p>
          )}
          {customers.map((customer: any) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedCustomer(customer)}
              className={cnx(
                'w-full rounded-lg border p-3 text-left transition',
                selectedCustomer?.id === customer.id
                  ? 'border-[#15356b] bg-[#eef2fa]'
                  : 'border-[#e7ebf2] bg-white hover:border-[#c3cfe0]'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#14223b] truncate">{customer.displayTitle || customer.name}</p>
                  <p className="text-[11px] text-[#51607a] font-mono">
                    {customer.mikroCariCode} - {customer.city || '-'} / {customer.district || '-'}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-[#f4f6fa] border border-[#e3e8f0] px-2 py-0.5 text-[10px] font-semibold text-[#51607a]">
                  {customer.sectorCode || 'Sektor yok'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* Cari ozet */}
      <Panel title="Cari ozet" icon={Briefcase}>
        {!selectedCustomer ? (
          <EmptyText text="Cari secildikten sonra bakiye, vade, acik teklif/siparis ve firsatlar gorunur." />
        ) : snapshotLoading ? (
          <LoadingLine label="Cari ozeti yukleniyor" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="Vade"
                value={snapshot?.summary?.vade?.paymentPlanName || selectedCustomer.paymentPlanName || `${selectedCustomer.paymentTerm || 0} gun`}
              />
              <Metric label="Acik siparis" value={snapshot?.summary?.openOrderCount || 0} />
              <Metric label="Acik teklif" value={snapshot?.summary?.openQuoteCount || 0} />
              <Metric label="Sepet" value={snapshot?.summary?.cartItemCount || 0} />
            </div>
            {selectedCustomer.isLocked && (
              <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-[12.5px] font-semibold text-[#b91c1c]">
                Cari kilitli gorunuyor.
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Firsatlar */}
      <Panel title="Firsatlar" icon={BadgeCheck}>
        {!snapshot ? <EmptyText text="Cari secin." /> : <OpportunityList opportunities={snapshot.opportunities} />}
      </Panel>

      {/* Ziyaret notu */}
      <Panel title="Ziyaret notu" icon={MapPin}>
        {!selectedCustomer ? (
          <EmptyText text="Not yazmak icin cari secin." />
        ) : (
          <div className="space-y-2.5">
            <textarea
              value={visitNote}
              onChange={(event) => setVisitNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Gorusme notu, alinacak aksiyon..."
              className="min-h-[88px] w-full rounded-lg border border-[#e3e8f0] bg-white p-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] resize-none"
            />
            <input
              value={visitDemand}
              onChange={(event) => setVisitDemand(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Talep / ihtiyac"
              className={INPUT}
            />
            <input
              value={competitorInfo}
              onChange={(event) => setCompetitorInfo(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Rakip fiyat / rakip bilgi"
              className={INPUT}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
                <Camera className="h-3.5 w-3.5" />
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
              </label>
              <button
                type="button"
                onClick={captureLocation}
                className="flex items-center justify-center gap-2 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
              >
                <MapPin className="h-3.5 w-3.5" />
                Konum
              </button>
            </div>
            {(photoUrl || location) && (
              <div className="rounded-lg bg-[#f0fdf9] border border-[#a7f3d0] p-2.5 text-[11.5px]">
                {photoUrl && <span className="mr-3 font-semibold text-[#047857]">Foto eklendi</span>}
                {location && <span className="font-semibold text-[#047857]">Konum eklendi</span>}
              </div>
            )}
            <button
              type="button"
              disabled={noteSaving}
              onClick={saveVisitNote}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#15356b] px-3 py-2.5 text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-60"
            >
              {noteSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Notu kaydet
            </button>
          </div>
        )}
      </Panel>

      {/* Gecmis notlar */}
      <Panel title="Gecmis notlar" icon={History}>
        <div className="space-y-2">
          {(snapshot?.notes || []).length === 0 && <EmptyText text="Bu cari icin saha notu yok." />}
          {(snapshot?.notes || []).map((note: any) => (
            <div key={note.id} className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[#51607a]">{note.createdByName || note.createdBy?.name || '-'}</p>
                <p className="text-[11px] text-[#8b97ac]">{safeDate(note.createdAt)}</p>
              </div>
              <p className="mt-1 text-[12.5px] font-medium text-[#14223b]">{note.note}</p>
              {note.demand && <p className="mt-1 text-[11.5px] text-[#51607a]">Talep: {note.demand}</p>}
              {note.competitorInfo && <p className="mt-1 text-[11.5px] text-[#51607a]">Rakip: {note.competitorInfo}</p>}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

/* ==========================  ProductPanel  =========================== */
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
  const visibleProducts =
    productMode === 'purchased'
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
  const placeholder =
    productMode === 'purchased'
      ? 'Daha once aldiklarinda ara...'
      : productMode === 'opportunity'
      ? 'Firsatlarda urun/kategori ara...'
      : 'Stok kodu, barkod, urun adi...';

  return (
    <section className="flex flex-col gap-4">
      <Panel title="Urun ara" icon={Package}>
        {selectedCustomer && (
          <div className="mb-3 grid gap-2 rounded-lg border border-[#d6e0f1] bg-[#eef2fa] p-3 text-[11.5px] sm:grid-cols-3">
            <div>
              <p className="font-semibold text-[#15356b]">Cari</p>
              <p className="truncate font-medium text-[#14223b]">{selectedCustomer.displayTitle || selectedCustomer.mikroCariCode}</p>
            </div>
            <div>
              <p className="font-semibold text-[#15356b]">Son satis</p>
              <p className="font-medium text-[#14223b]">{safeDate(snapshot?.summary?.lastSaleDate)}</p>
            </div>
            <div>
              <p className="font-semibold text-[#15356b]">Acik siparis / teklif</p>
              <p className="font-medium text-[#14223b]">
                {snapshot?.summary?.openOrderCount || 0} / {snapshot?.summary?.openQuoteCount || 0}
              </p>
            </div>
          </div>
        )}
        {/* Mod sekmeleri (Tum / Aldiklari / Stokta / Firsatlar, sayacli) */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-[#f1f4f9] p-[3px] lg:grid-cols-4">
          {productModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setProductMode(mode.key)}
              className={cnx(
                'rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition',
                productMode === mode.key ? 'bg-white text-[#14223b] shadow-sm' : 'text-[#64748b]'
              )}
            >
              {mode.label}
              {mode.count !== undefined && (
                <span className="ml-1 rounded-full bg-[#e3e8f0] px-1.5 py-0.5 text-[9.5px] text-[#51607a]">{mode.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa6b8]" />
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder={placeholder}
              className="h-[42px] w-full rounded-lg border border-[#e3e8f0] bg-white pl-9 pr-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
            />
          </div>
          <button
            type="button"
            onClick={productMode === 'search' || productMode === 'stock' ? searchProducts : undefined}
            className="h-[42px] rounded-lg bg-[#15356b] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1c4585]"
          >
            Ara
          </button>
          <button
            type="button"
            onClick={startBarcodeScanner}
            className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-4 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            <Barcode className="h-4 w-4" /> Okut
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3 text-[11.5px] text-[#51607a]">
          <ShieldCheck className="h-4 w-4 text-[#047857]" />
          {safeMode ? 'Musteri modu acik: maliyet/marj gizli.' : 'Ic gorunum acik: maliyet ve marj gorunur.'}
          {/* 4.2: hangi fiyat tipinin gosterildigini belirt */}
          <span
            className={cnx(
              'rounded-full border px-2 py-0.5 font-semibold',
              priceType === 'WHITE' ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]' : 'bg-[#fffbeb] border-[#fde68a] text-[#92500a]'
            )}
          >
            {priceType === 'WHITE' ? 'Beyaz fiyat' : 'Faturali fiyat'}
          </span>
        </div>
      </Panel>

      {/* Urun kartlari */}
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
          const stockTone =
            stockTotal > 0
              ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
              : 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]';
          return (
            <article
              key={product.mikroCode}
              className="overflow-hidden rounded-xl border border-[#e7ebf2] bg-white transition hover:border-[#c3cfe0] hover:shadow-sm"
            >
              <button onClick={() => openProductDetail(product)} className="block w-full p-3.5 text-left">
                <div className="flex gap-3">
                  <ProductImage product={product} card />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#14223b] lg:overflow-visible lg:whitespace-normal lg:text-clip lg:leading-snug">
                      {product.name}
                    </p>
                    <p className="text-[11px] font-medium text-[#51607a] font-mono">
                      {product.mikroCode} - {product.unit}
                    </p>
                    <CategoryLastPurchasePill info={categoryInfo} />
                    {rawProduct.reason && <p className="mt-1 line-clamp-2 text-[11px] font-medium text-[#92500a]">{rawProduct.reason}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                      <span className={cnx('rounded-full border px-2 py-0.5', stockTone)}>
                        Merkez+Topca: {isSummaryRow ? 'Detayda' : n(stockTotal)}
                      </span>
                      {rawProduct.lastPurchaseDate && (
                        <span className="rounded-full border border-[#e3e8f0] bg-[#f4f6fa] px-2 py-0.5 text-[#51607a]">
                          Son alim: {safeDate(rawProduct.lastPurchaseDate)}
                        </span>
                      )}
                      {rawProduct.title && (
                        <span className="rounded-full border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-[#92500a]">{rawProduct.title}</span>
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
              {/* Miktar stepper + WhatsApp/Detay + Ekle */}
              <div className="grid gap-2 border-t border-[#eef1f6] p-3 sm:grid-cols-[140px_1fr_1fr]">
                <div className="grid grid-cols-[34px_1fr_34px] overflow-hidden rounded-lg border border-[#d8e0ec] bg-[#f8fafc]">
                  <button
                    type="button"
                    onClick={() =>
                      setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: bumpDecimalText(qty, -1) }))
                    }
                    className="text-[15px] font-semibold text-[#51607a]"
                  >
                    -
                  </button>
                  <input
                    value={qty}
                    onChange={(event) => setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: event.target.value }))}
                    onFocus={(event) => event.currentTarget.select()}
                    inputMode="decimal"
                    className="h-[38px] bg-transparent px-2 text-center text-[12.5px] font-semibold text-[#14223b] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setProductQuantities((current: any) => ({ ...current, [product.mikroCode]: bumpDecimalText(qty, 1) }))
                    }
                    className="text-[15px] font-semibold text-[#51607a]"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => (isSummaryRow ? openProductDetail(product) : shareProduct(product))}
                  className="rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  {isSummaryRow ? 'Detay' : 'WhatsApp'}
                </button>
                <button
                  type="button"
                  onClick={() => addToDraft(product)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#15356b] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c4585]"
                >
                  <Plus className="h-3.5 w-3.5" /> Ekle
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ===========================  DraftPanel  ============================ */
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
      const listNo = item.priceListNo || 6;
      updateDraftItem(index, {
        priceSource,
        priceListNo: listNo,
        unitPrice: getMikroListPrice(item.priceLists, listNo),
        selectedSaleIndex: null,
        manualPriceInput: undefined,
      });
      return;
    }
    if (priceSource === 'LAST_SALE') {
      const sale = item.lastSales?.[0];
      updateDraftItem(index, {
        priceSource,
        selectedSaleIndex: sale ? 0 : null,
        unitPrice: Number(sale?.unitPrice || item.unitPrice || 0),
        vatZeroed: Boolean(sale?.vatZeroed),
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
    });
  };
  const updatePriceList = (index: number, item: DraftItem, value: string) => {
    const listNo = Number(value || 0);
    updateDraftItem(index, {
      priceListNo: listNo || null,
      unitPrice: listNo ? getMikroListPrice(item.priceLists, listNo) : 0,
      manualPriceInput: undefined,
    });
  };
  const updateLastSale = (index: number, item: DraftItem, value: string) => {
    const saleIndex = value === '' ? null : Number(value);
    const sale = saleIndex === null ? null : item.lastSales?.[saleIndex];
    updateDraftItem(index, {
      selectedSaleIndex: saleIndex,
      unitPrice: Number(sale?.unitPrice || 0),
      vatZeroed: Boolean(sale?.vatZeroed),
      manualPriceInput: undefined,
    });
  };
  const updateManualPrice = (index: number, item: DraftItem, value: string) => {
    const parsed = parseDecimalInput(value);
    const basePrice =
      parsed === undefined ? 0 : convertPriceToBaseUnit(parsed, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor);
    updateDraftItem(index, { unitPrice: basePrice, manualPriceInput: value });
  };
  // 4.2: Satir bazinda Faturali/Beyaz. Fiyat numarasini DEGISTIRMEZ; sadece tip + KDV (beyaz=KDV sifir).
  const updateLinePriceType = (index: number, item: DraftItem, nextType: PriceType) => {
    updateDraftItem(index, {
      priceType: nextType,
      vatZeroed:
        nextType === 'WHITE'
          ? true
          : Boolean(
              item.selectedSaleIndex !== null && item.selectedSaleIndex !== undefined
                ? item.lastSales?.[item.selectedSaleIndex]?.vatZeroed
                : false
            ),
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
          className={cnx(
            'rounded-lg border px-3 py-2.5 text-left transition',
            priceType === 'WHITE' ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]' : 'bg-[#fffbeb] border-[#fde68a] text-[#92500a]'
          )}
        >
          <p className="text-[10.5px] font-medium opacity-80">Yeni kalem tipi</p>
          <p className="mt-0.5 text-[14px] font-semibold">{priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</p>
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
          const selectedSale =
            item.selectedSaleIndex !== null && item.selectedSaleIndex !== undefined ? item.lastSales?.[item.selectedSaleIndex] : null;
          const profitInfo = getProfitInfo(item.unitPrice, item);
          return (
            <div key={`${item.productCode}-${index}`} className="rounded-xl border border-[#e7ebf2] bg-white p-3">
              <div className="flex gap-3">
                <ProductImage product={{ imageUrl: item.imageUrl, name: item.productName, mikroCode: item.productCode }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#14223b]">{item.productName}</p>
                      <p className="text-[11px] font-medium text-[#51607a] font-mono">
                        {item.productCode} - {item.unit}
                      </p>
                      {unitLabel && <p className="mt-1 text-[11px] font-medium text-[#1c4585]">{unitLabel}</p>}
                      <CategoryLastPurchasePill info={categoryInfo} />
                      {/* 4.2: satir bazinda Faturali/Beyaz; fiyat numarasini degil sadece tip+KDV'yi degistirir */}
                      <div className="mt-2 inline-flex overflow-hidden rounded-md border border-[#d8e0ec] text-[10.5px] font-semibold">
                        {(['INVOICED', 'WHITE'] as PriceType[]).map((typeOption) => (
                          <button
                            key={typeOption}
                            type="button"
                            onClick={() => updateLinePriceType(index, item, typeOption)}
                            className={cnx(
                              'px-3 py-1 transition',
                              item.priceType === typeOption
                                ? typeOption === 'WHITE'
                                  ? 'bg-[#1d4ed8] text-white'
                                  : 'bg-[#15356b] text-white'
                                : 'bg-white text-[#51607a]'
                            )}
                          >
                            {typeOption === 'WHITE' ? 'Beyaz' : 'Faturali'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraftItem(index)}
                      className="rounded-lg bg-[#fef2f2] border border-[#fecaca] px-2.5 py-2 text-[#b91c1c] hover:bg-[#fee2e2]"
                      aria-label="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(170px,0.9fr)_minmax(220px,1.2fr)_minmax(220px,1.2fr)_120px]">
                    {/* Miktar (+ hizli -1/+1/+5) + Birim */}
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
                              className="rounded-md bg-[#f1f4f9] px-2 py-1 text-[10.5px] font-semibold text-[#51607a] hover:bg-[#e3e8f0]"
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Birim</span>
                        <select
                          value={selectedUnit}
                          onChange={(event) => updateSelectedUnit(index, item, event.target.value)}
                          className="h-[38px] w-full rounded-lg border border-[#e3e8f0] bg-white px-2 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                        >
                          {availableUnits.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Fiyat kaynagi (Son Satis / Liste / Manuel) */}
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Fiyat kaynagi</span>
                      <select
                        value={item.priceSource || 'PRICE_LIST'}
                        onChange={(event) => updatePriceSource(index, item, event.target.value as DraftItem['priceSource'])}
                        className="h-[38px] w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                      >
                        <option value="LAST_SALE">Son Satis</option>
                        <option value="PRICE_LIST">Fiyat Listesi</option>
                        <option value="MANUAL">Manuel</option>
                      </select>
                    </label>

                    {/* Fiyat secimi */}
                    <div>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Fiyat secimi</span>
                      {item.priceSource === 'LAST_SALE' ? (
                        <select
                          value={item.selectedSaleIndex ?? ''}
                          onChange={(event) => updateLastSale(index, item, event.target.value)}
                          className="h-[38px] w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                        >
                          <option value="">Son satis sec</option>
                          {(item.lastSales || []).map((sale: any, saleIndex: number) => {
                            const listLabel = getMatchingPriceListLabel(item.priceLists, sale.unitPrice);
                            const displaySalePrice = convertPriceFromBaseUnit(sale.unitPrice, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            const displaySaleQty = convertQuantityFromBaseUnit(sale.quantity, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            return (
                              <option key={`${sale.documentNo || sale.saleDate}-${saleIndex}`} value={saleIndex}>
                                {safeDate(sale.saleDate)} - {money(displaySalePrice)} ({formatDecimalInput(displaySaleQty)} {selectedUnit})
                                {listLabel ? ` - ${listLabel}` : ''}
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
                          className="h-[38px] w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                      ) : (
                        <select
                          value={item.priceListNo || ''}
                          onChange={(event) => updatePriceList(index, item, event.target.value)}
                          className="h-[38px] w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                        >
                          <option value="">Liste sec</option>
                          {Object.keys(PRICE_LIST_LABELS).map((key) => {
                            const listNo = Number(key);
                            const listPrice = getMikroListPrice(item.priceLists, listNo);
                            const displayPrice = convertPriceFromBaseUnit(listPrice, selectedUnit, item.unit, item.unit2, item.unit2Factor);
                            return (
                              <option key={key} value={key}>
                                {getPriceListLabel(listNo)} - {listPrice ? money(displayPrice) : 'Fiyat yok'}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>

                    {/* Satir tutari */}
                    <div className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-2.5 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Satir</p>
                      <p className="text-[13px] font-semibold text-[#14223b]">{money(item.quantity * item.unitPrice)}</p>
                      <p className="text-[10.5px] font-medium text-[#51607a]">
                        {money(displayUnitPrice)} / {selectedUnit}
                      </p>
                    </div>
                  </div>

                  {/* Rozetler: Mikro / Son satis belge / Son teklif / (ic gorunum) Maliyet & Kar */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#51607a]">
                    {selectedUnit !== item.unit && (
                      <span className="rounded-full bg-[#eef2fa] border border-[#d6e0f1] px-2 py-0.5 font-semibold text-[#1c4585]">
                        Mikro: {formatDecimalInput(item.quantity)} {item.unit}
                      </span>
                    )}
                    {selectedSale?.documentNo && (
                      <span className="rounded-full bg-[#f4f6fa] border border-[#e3e8f0] px-2 py-0.5 font-semibold text-[#51607a]">
                        Son satis belge: {selectedSale.documentNo}
                      </span>
                    )}
                    {(item.lastQuotes || []).length > 0 && (
                      <span className="rounded-full bg-[#eef2fb] border border-[#c7d2fe] px-2 py-0.5 font-semibold text-[#4338ca]">
                        Son teklif: {safeDate(item.lastQuotes?.[0]?.quoteDate)} - {money(item.lastQuotes?.[0]?.unitPrice)}
                      </span>
                    )}
                    {!safeMode && item.cost?.currentCost && (
                      <span className="rounded-full bg-[#fef2f2] border border-[#fecaca] px-2 py-0.5 font-semibold text-[#b91c1c]">
                        Maliyet: {money(item.cost.currentCost)}
                      </span>
                    )}
                    {!safeMode && profitInfo && (
                      <span
                        className={cnx(
                          'rounded-full px-2 py-0.5 font-semibold border',
                          profitInfo.tone === 'red'
                            ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
                            : profitInfo.tone === 'amber'
                            ? 'bg-[#fffbeb] border-[#fde68a] text-[#92500a]'
                            : 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]'
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
        {/* Teklif olustur */}
        <div className="rounded-xl bg-[#f8fafc] border border-[#eef1f6] p-4">
          <p className="text-[13px] font-semibold text-[#14223b]">Teklif olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={validityDate}
              onChange={(event) => setValidityDate(event.target.value)}
              className="h-[40px] rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none focus:border-[#15356b]"
            />
            <input
              value={quoteNote}
              onChange={(event) => setQuoteNote(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Not"
              className="h-[40px] rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none focus:border-[#15356b]"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={shareDraft}
              className="inline-flex h-[40px] items-center justify-center gap-2 rounded-lg border border-[#d8e0ec] bg-white text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
            >
              <Send className="h-3.5 w-3.5" /> Paylas
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={createQuote}
              className="inline-flex h-[40px] items-center justify-center gap-2 rounded-lg bg-[#15356b] text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Teklif
            </button>
          </div>
        </div>

        {/* Siparis olustur (koyu kart) */}
        <div className="rounded-xl bg-[#0c2247] p-4 text-white">
          <p className="text-[13px] font-semibold">Siparis olustur</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={orderWarehouse}
              onChange={(event) => setOrderWarehouse(event.target.value)}
              className="h-[40px] rounded-lg border border-white/15 bg-white/10 px-3 text-[12.5px] font-medium text-white outline-none"
            >
              <option className="text-[#14223b]" value="1">
                Merkez depo
              </option>
              <option className="text-[#14223b]" value="6">
                Topca depo
              </option>
            </select>
            <input
              value={orderSeries}
              onChange={(event) => setOrderSeries(event.target.value.toUpperCase())}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Siparis seri no"
              className="h-[40px] rounded-lg border border-white/15 bg-white/10 px-3 text-[12.5px] font-semibold uppercase text-white outline-none placeholder:text-white/50"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={clearDraft}
              className="inline-flex h-[40px] items-center justify-center rounded-lg border border-white/15 bg-white/10 text-[12.5px] font-medium text-white hover:bg-white/[0.18]"
            >
              Temizle
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={createOrder}
              className="inline-flex h-[40px] items-center justify-center gap-2 rounded-lg bg-white text-[12.5px] font-semibold text-[#0c2247] hover:bg-[#eef2fa] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Siparis
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ===========================  HistoryPanel  ========================== */
function HistoryPanel({ recentCustomers, recentProducts, setSelectedCustomer, openProductDetail, notes, selectedCustomer }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Son cariler" icon={UserRound}>
        <div className="space-y-2">
          {recentCustomers.length === 0 && <EmptyText text="Son cari yok." />}
          {recentCustomers.map((customer: any) => (
            <button
              key={customer.id || customer.mikroCariCode}
              type="button"
              onClick={() => setSelectedCustomer(customer)}
              className="w-full rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3 text-left hover:bg-[#f1f4f9]"
            >
              <p className="text-[13px] font-semibold text-[#14223b]">{customer.displayTitle || customer.name}</p>
              <p className="text-[11px] text-[#51607a] font-mono">{customer.mikroCariCode}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Son urunler" icon={Package}>
        <div className="space-y-2">
          {recentProducts.length === 0 && <EmptyText text="Son urun yok." />}
          {recentProducts.map((product: any) => (
            <button
              key={product.mikroCode}
              type="button"
              onClick={() => openProductDetail(product)}
              className="flex w-full gap-3 rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3 text-left hover:bg-[#f1f4f9]"
            >
              <ProductImage product={product} small />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[#14223b]">{product.name}</p>
                <p className="text-[11px] text-[#51607a] font-mono">{product.mikroCode}</p>
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
            <div key={note.id} className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3">
              <p className="text-[11px] text-[#8b97ac]">{safeDate(note.createdAt)}</p>
              <p className="mt-1 text-[12.5px] font-medium text-[#14223b]">{note.note}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ===========================  ProductDrawer  ========================= */
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
      className="fixed inset-0 z-[90] flex items-end overflow-hidden bg-[#0c2247]/65 p-0 backdrop-blur-sm lg:items-center lg:justify-center lg:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[96svh] sm:rounded-t-[16px] lg:h-[90vh] lg:max-w-6xl lg:rounded-[16px]"
        onClick={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-20 border-b border-[#eef1f6] bg-white/95 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur lg:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <button type="button" onClick={() => setImageOpen(true)} className="shrink-0">
                <ProductImage product={product} />
              </button>
              <div className="min-w-0">
                <p className="max-h-20 overflow-y-auto text-[17px] font-semibold leading-tight text-[#14223b] lg:text-[22px]">{product.name}</p>
                <p className="mt-1 text-[11px] font-medium text-[#51607a] font-mono">
                  {product.mikroCode} - {product.unit}
                </p>
                {unitLabel && <p className="mt-1 text-[11px] font-medium text-[#1c4585]">{unitLabel}</p>}
                <CategoryLastPurchasePill info={categoryInfo} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#15356b] text-white"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Ust metrikler */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold lg:grid-cols-5">
            <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-2 py-2 text-[#92500a]">
              <p className="opacity-80">Cari fiyat ({priceType === 'WHITE' ? 'Beyaz' : 'Faturali'})</p>
              <p>{money(displayPrice)}</p>
            </div>
            <div className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-2 py-2 text-[#14223b]">
              <p className="opacity-80">Kaynak</p>
              <p className="truncate">{price.source}</p>
            </div>
            <div className="rounded-lg bg-[#ecfdf5] border border-[#a7f3d0] px-2 py-2 text-[#047857]">
              <p className="opacity-80">M+T stok</p>
              <p>{n(activeSellable(product))}</p>
            </div>
            <div className="hidden rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-2 py-2 text-[#14223b] lg:block">
              <p className="opacity-80">Son teklif</p>
              <p>{safeDate(product.lastQuotes?.[0]?.quoteDate)}</p>
            </div>
            <div className="hidden rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-2 py-2 text-[#14223b] lg:block">
              <p className="opacity-80">Son satis</p>
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

                {/* Depolar */}
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#14223b]">
                    <Warehouse className="h-4 w-4 text-[#15356b]" /> Depolar
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleWarehouses.map((row: any) => (
                      <div key={row.key} className="rounded-lg border border-[#e7ebf2] p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-[#14223b]">{row.label}</p>
                          <p
                            className={cnx(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold border',
                              Number(row.sellable) > 0
                                ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]'
                                : 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
                            )}
                          >
                            {n(row.sellable)}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] text-[#51607a]">
                          Eldeki {n(row.stock)} - Musteri bekleyen {n(row.pendingCustomer)} - Satin alma {n(row.pendingPurchase)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fiyat listeleri (her biri tek tikta taslaga ekler) */}
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#14223b]">
                    <DollarSign className="h-4 w-4 text-[#15356b]" /> Fiyat listeleri
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {Object.entries(product.priceLists || {}).map(([listNo, value]) => (
                      <button
                        key={listNo}
                        type="button"
                        onClick={() =>
                          addToDraft(product, {
                            priceSource: 'PRICE_LIST',
                            priceListNo: Number(listNo),
                            unitPrice: Number(value || 0),
                            selectedUnit,
                          })
                        }
                        className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-3 py-2 text-left transition hover:bg-[#eef2fa] hover:border-[#d6e0f1]"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">{getPriceListLabel(listNo)}</p>
                        <p className="mt-0.5 truncate text-[13px] font-semibold text-[#14223b]">
                          {money(convertPriceFromBaseUnit(Number(value || 0), selectedUnit, product.unit, product.unit2, product.unit2Factor))}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Ic maliyet gorunumu (sadece ic gorunum) */}
              {!safeMode && product.cost && (
                <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#b91c1c]">
                    <ShieldCheck className="h-4 w-4" /> Ic maliyet gorunumu
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Mini label="Guncel maliyet" value={money(product.cost.currentCost)} />
                    <Mini label="KDV dahil" value={money(product.cost.currentCostVatIncluded)} />
                    <Mini label="Maliyet tarihi" value={safeDate(product.cost.currentCostDate)} />
                    <Mini label="Son giris" value={safeDate(product.cost.lastEntryDate)} />
                  </div>
                  {profitInfo && (
                    <div
                      className={cnx(
                        'mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold border',
                        profitInfo.tone === 'red'
                          ? 'bg-[#fee2e2] border-[#fecaca] text-[#b91c1c]'
                          : profitInfo.tone === 'amber'
                          ? 'bg-[#fffbeb] border-[#fde68a] text-[#92500a]'
                          : 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]'
                      )}
                    >
                      Cari fiyatta kar: {money(profitInfo.profit)} / %{n(profitInfo.percent, 1)}
                    </div>
                  )}
                </div>
              )}

              {/* Hizli ekleme (miktar + birim + numpad) */}
              <div className="rounded-xl border border-[#e7ebf2] bg-white p-4">
                <p className="mb-3 text-[13px] font-semibold text-[#14223b]">Hizli ekleme</p>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    inputMode="decimal"
                    className="h-[42px] rounded-lg border border-[#e3e8f0] bg-white px-3 text-center text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                  />
                  <select
                    value={selectedUnit}
                    onChange={(event) => setSelectedUnit(event.target.value)}
                    className="h-[42px] rounded-lg border border-[#e3e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                  >
                    {availableUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[-1, 1, 5, 10].map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setQuantity(bumpDecimalText(quantity, diff))}
                      className="h-9 rounded-lg bg-[#f1f4f9] text-[12.5px] font-semibold text-[#51607a] hover:bg-[#e3e8f0]"
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Son satislar */}
              <div>
                <p className="mb-2 text-[13px] font-semibold text-[#14223b]">Son satislar</p>
                {(product.customerPrice?.lastSales || []).length === 0 && <EmptyText text="Bu cari icin son satis bulunamadi." />}
                {(product.customerPrice?.lastSales || []).map((sale: any, index: number) => (
                  <div key={`${sale.documentNo}-${index}`} className="mb-2 rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#14223b]">{safeDate(sale.saleDate)}</span>
                      <span className="text-[#51607a]">{sale.documentNo || '-'}</span>
                      <span className="font-semibold text-[#14223b]">
                        {n(sale.quantity)} x {money(sale.unitPrice)}
                      </span>
                      {getMatchingPriceListLabel(product.priceLists, sale.unitPrice) && (
                        <span className="rounded-full bg-[#eff6ff] border border-[#bfdbfe] px-2 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">
                          {getMatchingPriceListLabel(product.priceLists, sale.unitPrice)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => addToDraft(product, { priceSource: 'LAST_SALE', saleIndex: index, unitPrice: sale.unitPrice, selectedUnit })}
                      className="mt-2 rounded-full border border-[#d8e0ec] bg-white px-3 py-1 text-[11.5px] font-semibold text-[#15356b] hover:bg-[#f4f6fa]"
                    >
                      Bu fiyatla ekle
                    </button>
                  </div>
                ))}
              </div>

              {/* Son teklifler */}
              <div>
                <p className="mb-2 text-[13px] font-semibold text-[#14223b]">Son teklifler</p>
                {(product.lastQuotes || []).length === 0 && <EmptyText text="Bu urun icin son teklif bulunamadi." />}
                {(product.lastQuotes || []).slice(0, 3).map((quote: any, index: number) => (
                  <div key={`${quote.documentNo || quote.quoteDate}-${index}`} className="mb-2 rounded-lg bg-[#eef2fb] border border-[#c7d2fe] p-3 text-[12.5px]">
                    <div>
                      <span className="font-semibold text-[#312e81]">{safeDate(quote.quoteDate)}</span>
                      <span className="ml-2 text-[#4338ca]">{quote.documentNo || quote.quoteNumber || '-'}</span>
                      <span className="ml-2 font-semibold text-[#312e81]">
                        {n(quote.quantity)} x {money(quote.unitPrice)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToDraft(product, { priceSource: 'MANUAL', unitPrice: Number(quote.unitPrice || 0), selectedUnit })}
                      className="mt-2 rounded-full border border-[#c7d2fe] bg-white px-3 py-1 text-[11.5px] font-semibold text-[#4338ca] hover:bg-[#eef2fb]"
                    >
                      Teklif fiyatiyla ekle
                    </button>
                  </div>
                ))}
              </div>

              {/* Fiyat teyidi ekranini ac */}
              <button
                type="button"
                onClick={requestPriceCheck}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5 text-[12.5px] font-semibold text-[#92500a] hover:bg-[#fffdf5]"
              >
                <Sparkles className="h-4 w-4" />
                Fiyat teyidi ekranini ac
              </button>
            </div>
          </div>
        </div>
        {/* Alt sabit aksiyon bari */}
        <div className="sticky bottom-0 z-20 grid grid-cols-[1fr_1fr] gap-2 border-t border-[#eef1f6] bg-white/95 p-4 backdrop-blur lg:grid-cols-[1fr_1fr_1fr] lg:p-6">
          <div className="hidden rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-3 py-2 text-[12.5px] font-semibold text-[#14223b] lg:block">
            {quantity || '1'} {selectedUnit} x {money(displayPrice)}
          </div>
          <button
            type="button"
            onClick={() => shareProduct(product)}
            className="h-[42px] rounded-lg border border-[#d8e0ec] bg-white text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => addToDraft(product, { selectedUnit })}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-[#15356b] text-[12.5px] font-semibold text-white hover:bg-[#1c4585]"
          >
            <Plus className="h-4 w-4" /> Ekle
          </button>
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
              className="absolute right-2 top-2 rounded-full bg-white/90 px-4 py-2 text-[12.5px] font-semibold text-[#14223b] shadow"
              type="button"
              onClick={() => setImageOpen(false)}
            >
              Kapat
            </button>
            {product?.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name || product.mikroCode}
                className="max-h-[88vh] max-w-full rounded-[16px] bg-white object-contain p-3 shadow-2xl"
              />
            ) : (
              <div className="flex h-[60vh] w-[80vw] max-w-3xl items-center justify-center rounded-[16px] bg-white text-[#9aa6b8]">
                <Package className="h-20 w-20" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================  OpportunityList  ======================= */
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
        <div key={`${row.type}-${row.productCode}-${index}`} className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-[#14223b]">{row.productName || row.productCode}</p>
              <p className="text-[11px] font-semibold text-[#92500a]">{row.title}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white border border-[#e3e8f0] px-2 py-0.5 text-[10px] font-semibold text-[#51607a]">
              {row.productCode}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[#51607a]">{row.reason}</p>
          {(row.categoryName || row.categoryCode || row.categoryLastPurchaseDate) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
              {(row.categoryName || row.categoryCode) && (
                <span className="rounded-full bg-white border border-[#e3e8f0] px-2 py-0.5 text-[#51607a]">
                  Kategori: {row.categoryName || row.categoryCode}
                </span>
              )}
              {row.categoryLastPurchaseDate && (
                <span className="rounded-full bg-[#fffbeb] border border-[#fde68a] px-2 py-0.5 text-[#92500a]">
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

/* ===========================  Kucuk parcalar  ======================== */
function ProductLargeImage({ product, onOpen }: any) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border border-[#e7ebf2] bg-[#f8fafc]"
    >
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.mikroCode} className="h-full w-full object-contain p-4 transition group-hover:scale-105" />
      ) : (
        <Package className="h-16 w-16 text-[#c2cbda]" />
      )}
      <span className="absolute bottom-3 right-3 rounded-full bg-[#0c2247]/85 px-3 py-1.5 text-[11px] font-semibold text-white">Buyut</span>
    </button>
  );
}

function ProductImage({ product, small = false, card = false }: any) {
  return (
    <div className={cnx('shrink-0 overflow-hidden rounded-lg bg-[#f4f6fa] border border-[#eef1f6]', small ? 'h-12 w-12' : card ? 'h-20 w-20 lg:h-24 lg:w-24' : 'h-20 w-20')}>
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.productName || product.mikroCode} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#c2cbda]">
          <Package className={small ? 'h-5 w-5' : 'h-8 w-8'} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: any) {
  return (
    <div className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-semibold text-[#14223b]">{String(value ?? '-')}</p>
    </div>
  );
}

function CategoryLastPurchasePill({ info }: { info?: any }) {
  if (!info?.lastPurchaseDate) return null;
  const months = info.monthsSinceLastPurchase ?? monthsSinceDate(info.lastPurchaseDate);
  const monthsText = months === null ? null : `${Number(months).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay once`;
  return (
    <span className="mt-1 inline-flex max-w-full rounded-full border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-[10.5px] font-semibold text-[#92500a]">
      Kategori son alim: {monthsText || safeDate(info.lastPurchaseDate)}
    </span>
  );
}

function LabeledInput({ label, value, onChange }: any) {
  return (
    <label className="block rounded-lg bg-[#f8fafc] border border-[#eef1f6] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        inputMode="decimal"
        className="mt-1 h-7 w-full bg-transparent text-[12.5px] font-semibold text-[#14223b] outline-none"
      />
    </label>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3.5 text-[12.5px] font-medium text-[#8b97ac]">{text}</p>;
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#f8fafc] border border-[#eef1f6] p-3.5 text-[12.5px] font-semibold text-[#51607a]">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-xl border border-[#e7ebf2] bg-white p-5">
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
      className="fixed bottom-20 left-3 right-3 z-30 flex items-center justify-between rounded-xl border border-white/10 bg-[#0c2247] px-4 py-3 text-left text-white shadow-2xl lg:bottom-5 lg:left-auto lg:right-6 lg:w-[420px]"
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-white/65">
          {selectedCustomer?.displayTitle || selectedCustomer?.mikroCariCode || 'Cari secilmedi'}
        </p>
        <p className="text-[13px] font-semibold">{draftCount} kalem taslak kayitli</p>
      </div>
      <div className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-[#0c2247]">{money(draftTotal)}</div>
    </button>
  );
}

function BottomTabs({ activeTab, setActiveTab, draftCount }: any) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#e7ebf2] bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          const labelMap: Record<string, string> = { customer: 'Cari', products: 'Urun', draft: 'Taslak', history: 'Gecmis' };
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cnx(
                'relative rounded-lg px-2 py-2 text-[11px] font-semibold transition',
                active ? 'bg-[#15356b] text-white' : 'text-[#64748b]'
              )}
            >
              <Icon className="mx-auto mb-1 h-5 w-5" />
              {labelMap[tab.key] || tab.label}
              {tab.key === 'draft' && draftCount > 0 && (
                <span className="absolute right-2 top-1 rounded-full bg-[#15356b] px-1.5 text-[9px] text-white">{draftCount}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
