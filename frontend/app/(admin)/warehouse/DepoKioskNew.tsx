'use client';

import toast from 'react-hot-toast';
import {
  Search,
  RefreshCw,
  ScanLine,
  Truck,
  X,
  Maximize2,
  Minimize2,
  Package,
  ImageOff,
  Check,
  Plus,
  Minus,
  Trash2,
  Power,
  ChevronUp,
  ChevronDown,
  Delete,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { getCaseBreakdownLabel } from '@/lib/utils/unit';
import {
  useDepoKiosk,
  type WorkflowStatus,
  type OrderSortField,
  type OrderSortDirection,
  type OrderViewMode,
  KEYBOARD_ROWS,
  NUMPAD_NUMBER_KEYS,
  formatCurrency,
  formatDateShort,
  getUnitConversionLabel,
} from './useDepoKiosk';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Workflow durum rozeti (yeni stil) — mevcut statusBadge mantigini birebir karsilar.
const statusBadgeNew: Record<WorkflowStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Beklemede', cls: 'bg-[#f4f6fa] border-[#e3e8f0] text-[#51607a]' },
  PICKING: { label: 'Toplaniyor', cls: 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]' },
  READY_FOR_LOADING: { label: 'Yuklemeye Hazir', cls: 'bg-[#eff6ff] border-[#bae0fd] text-[#1d4ed8]' },
  PARTIALLY_LOADED: { label: 'Kismi Yuklendi', cls: 'bg-[#fff7ed] border-[#fed7aa] text-[#c2410c]' },
  LOADED: { label: 'Yuklendi', cls: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]' },
  DISPATCHED: { label: 'Sevk Edildi', cls: 'bg-[#eef2fb] border-[#c7d2fe] text-[#4338ca]' },
};

// Depo kapsama rozeti (Tam / Kismi / Yok)
const coverageBadgeNew: Record<'FULL' | 'PARTIAL' | 'NONE', { label: string; cls: string; cardBorder: string }> = {
  FULL: { label: 'Depodan Tam', cls: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]', cardBorder: '#a7f3d0' },
  PARTIAL: { label: 'Depodan Kismi', cls: 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]', cardBorder: '#fde68a' },
  NONE: { label: 'Depodan Yok', cls: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]', cardBorder: '#fecaca' },
};

// Satir stok rozeti (Siparis Depo Stok)
const stockStatusNew: Record<'FULL' | 'PARTIAL' | 'NONE', string> = {
  FULL: 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]',
  PARTIAL: 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]',
  NONE: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
};

// Kalan siparis kutusu (stok durumuna gore renk)
const remainingBoxNew = (status: 'FULL' | 'PARTIAL' | 'NONE') => {
  if (status === 'FULL') return 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]';
  if (status === 'PARTIAL') return 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]';
  return 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]';
};

const SELECT_CLS =
  'h-[38px] rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[12.5px] font-medium text-[#14223b] outline-none cursor-pointer focus:border-[#15356b]';

/**
 * Yeni gorunum Depo Kiosk ekrani. Mevcut TUM mantik useDepoKiosk'tan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/sekme/kolon/filtre/numpad/klavye/modal/satir-aksiyonu/durum dusurulmemistir.
 * Mikro'ya yazan (irsaliye/dispatch), seri-no, birim/katsayi ve raf-kodu akislari hook'ta korunur.
 */
export default function DepoKioskNew() {
  const {
    series,
    detailByOrder,
    isLoading,
    actionLoading,
    lineSavingKey,
    selectedSeries,
    setSelectedSeries,
    selectedStatus,
    setSelectedStatus,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    viewMode,
    setViewMode,
    searchText,
    setSearchText,
    openOrderNumbers,
    activeOrderNumber,
    setActiveOrderNumber,
    shelfDrafts,
    setShelfDrafts,
    isPortrait,
    isKioskTouchMode,
    setIsKioskTouchMode,
    isBarcodeMode,
    setIsBarcodeMode,
    isDetailFullscreen,
    showAllOpenOrders,
    setShowAllOpenOrders,
    showCompletedLines,
    setShowCompletedLines,
    sortLinesByShelf,
    toggleSortLinesByShelf,
    dispatchModalOrderNumber,
    setDispatchModalOrderNumber,
    dispatchModalSeries,
    setDispatchModalSeries,
    dispatchModalDriverId,
    setDispatchModalDriverId,
    dispatchModalVehicleId,
    setDispatchModalVehicleId,
    showTopControls,
    setShowTopControls,
    openReservationKey,
    setOpenReservationKey,
    previewImage,
    setPreviewImage,
    reportingImageKey,
    reportedImageKeys,
    confirmCompleteKeys,
    dispatchDrivers,
    dispatchVehicles,
    catalogLoading,
    newDriverFirstName,
    setNewDriverFirstName,
    newDriverLastName,
    setNewDriverLastName,
    newDriverTcNo,
    setNewDriverTcNo,
    newVehicleName,
    setNewVehicleName,
    newVehiclePlate,
    setNewVehiclePlate,
    showDispatchCatalogAdmin,
    setShowDispatchCatalogAdmin,
    keyboardTarget,
    setKeyboardTarget,
    keyboardValue,
    setKeyboardValue,
    qtyPadTarget,
    setQtyPadTarget,
    detailContainerRef,
    searchInputRef,
    setActiveInputCount,
    layoutClass,
    activeDrivers,
    activeVehicles,
    sortedOrders,
    groupedCustomerOrders,
    totalOrdersCount,
    detail,
    isDetailLoading,
    visibleOrderNumbers,
    getShelfDraftKey,
    loadOrderDetail,
    refreshWithSync,
    createDriver,
    toggleDriverActive,
    removeDriver,
    createVehicle,
    toggleVehicleActive,
    removeVehicle,
    refreshOrderDetail,
    handleStartPicking,
    changePicked,
    changeExtra,
    saveShelf,
    handleCompleteLine,
    handleDispatchWithDeliveryNote,
    openDispatchModal,
    reportImageIssue,
    toggleSeriesSelection,
    closeOrderTab,
    toggleDetailFullscreen,
    openSearchKeyboard,
    openShelfKeyboard,
    applyKeyboard,
    openQtyPad,
    applyQtyPad,
    handleBarcodeOrderSearch,
  } = useDepoKiosk();

  return (
    <div className="h-[calc(100dvh-56px)] overflow-hidden bg-[#f4f6fa]">
      <div className="h-full w-full overflow-hidden px-3 md:px-5 py-3 flex flex-col gap-3">
        {/* Ust baslik + aksiyonlar */}
        <div className={`${CARD} shrink-0 px-4 py-3`}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Depo Kiosk</h1>
                <p className="text-[13px] text-[#8b97ac] mt-1">
                  Dokunmatik toplama ve yukleme akisi ({isPortrait ? 'Dikey' : 'Yatay'} mod)
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[12.5px] text-[#8b97ac]">
                  Gorunen siparis: <b className="text-[#14223b] font-semibold">{totalOrdersCount}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setIsKioskTouchMode((prev) => !prev)}
                  className={`h-9 px-3.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
                    isKioskTouchMode
                      ? 'bg-[#15356b] text-white border border-[#15356b] hover:bg-[#1c4585]'
                      : 'bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa]'
                  }`}
                >
                  {isKioskTouchMode ? 'Dokunmatik Acik' : 'Dokunmatik Kapali'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTopControls((prev) => !prev)}
                  className="h-9 px-3 rounded-lg text-[12.5px] font-medium bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa] inline-flex items-center gap-1.5"
                >
                  {showTopControls ? <ChevronUp width={15} height={15} /> : <ChevronDown width={15} height={15} />}
                  {showTopControls ? 'Kapat' : 'Ac'}
                </button>
              </div>
            </div>

            {showTopControls && (
              <>
                {/* Filtre / arama / siralama / gorunum / senkron / barkod */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px] flex items-center gap-2 h-[38px] border border-[#e3e8f0] rounded-lg px-3 focus-within:border-[#15356b]">
                    <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
                    <input
                      ref={searchInputRef}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      onFocus={openSearchKeyboard}
                      onClick={openSearchKeyboard}
                      onBlur={() => {
                        if (!isBarcodeMode) return;
                        setTimeout(() => searchInputRef.current?.focus(), 0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && isBarcodeMode) {
                          event.preventDefault();
                          void handleBarcodeOrderSearch();
                        }
                      }}
                      placeholder="Siparis no, cari kod veya musteri ara..."
                      className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
                    />
                  </div>
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as any)}
                    className={SELECT_CLS}
                  >
                    <option value="ALL">Tum Durumlar</option>
                    <option value="PENDING">Beklemede</option>
                    <option value="PICKING">Toplaniyor</option>
                    <option value="READY_FOR_LOADING">Yuklemeye Hazir</option>
                    <option value="PARTIALLY_LOADED">Kismi Yuklendi</option>
                    <option value="LOADED">Yuklendi</option>
                    <option value="DISPATCHED">Sevk Edildi</option>
                  </select>
                  <select
                    value={sortField}
                    onChange={(event) => setSortField(event.target.value as OrderSortField)}
                    className={SELECT_CLS}
                  >
                    <option value="orderDate">Tarih</option>
                    <option value="customerName">Musteri (A-Z)</option>
                    <option value="grandTotal">Tutar</option>
                    <option value="coveredPercent">Karsilama %</option>
                  </select>
                  <select
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value as OrderSortDirection)}
                    className={SELECT_CLS}
                  >
                    <option value="desc">Azalan</option>
                    <option value="asc">Artan</option>
                  </select>
                  <select
                    value={viewMode}
                    onChange={(event) => setViewMode(event.target.value as OrderViewMode)}
                    className={SELECT_CLS}
                  >
                    <option value="order">Siparis bazli</option>
                    <option value="customer">Musteriye gore grupla</option>
                  </select>
                  <button
                    type="button"
                    onClick={refreshWithSync}
                    disabled={actionLoading}
                    className="h-[38px] px-3 rounded-lg text-[12px] font-medium bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa] disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw width={14} height={14} />
                    Senkron + Yenile
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBarcodeMode((prev) => !prev)}
                    className={`h-[38px] px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      isBarcodeMode
                        ? 'bg-[#15356b] text-white border border-[#15356b] hover:bg-[#1c4585]'
                        : 'bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa]'
                    }`}
                  >
                    <ScanLine width={14} height={14} />
                    {isBarcodeMode ? 'Barkod Odak Acik' : 'Barkod Odak Kapali'}
                  </button>
                </div>

                {/* Sofor/Arac Tanimlari ac/kapat */}
                <div className="flex items-center gap-2 h-[38px] border border-[#e3e8f0] rounded-lg px-3">
                  <span className="text-[12px] text-[#8b97ac]">Sofor / Arac Tanimlari</span>
                  <button
                    type="button"
                    onClick={() => setShowDispatchCatalogAdmin((prev) => !prev)}
                    className={`ml-auto rounded-md px-3 py-1.5 text-[11.5px] font-semibold ${
                      showDispatchCatalogAdmin
                        ? 'bg-[#15356b] text-white border border-[#15356b]'
                        : 'bg-[#eef2fa] text-[#15356b] border border-[#d6e0f1]'
                    }`}
                  >
                    {showDispatchCatalogAdmin ? 'Kapat' : 'Ac'}
                  </button>
                </div>

                {/* Sofor/Arac katalog yonetimi */}
                {showDispatchCatalogAdmin && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                    <div className={`${CARD} p-3 space-y-2`}>
                      <p className="text-[13px] font-semibold text-[#14223b]">Sofor Tanimlari</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                          value={newDriverFirstName}
                          onChange={(event) => setNewDriverFirstName(event.target.value)}
                          placeholder="Ad"
                          className="h-11 rounded-lg border border-[#e3e8f0] px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <input
                          value={newDriverLastName}
                          onChange={(event) => setNewDriverLastName(event.target.value)}
                          placeholder="Soyad"
                          className="h-11 rounded-lg border border-[#e3e8f0] px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <input
                          value={newDriverTcNo}
                          onChange={(event) => setNewDriverTcNo(event.target.value)}
                          placeholder="TC No"
                          className="h-11 rounded-lg border border-[#e3e8f0] px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <button
                          type="button"
                          onClick={createDriver}
                          disabled={actionLoading || catalogLoading}
                          className="h-11 rounded-lg bg-[#15356b] text-white text-[13px] font-semibold hover:bg-[#1c4585] disabled:opacity-50"
                        >
                          Sofor Ekle
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {dispatchDrivers.map((driver) => (
                          <div
                            key={driver.id}
                            className="flex items-center justify-between rounded-lg border border-[#eef1f6] px-2.5 py-1.5"
                          >
                            <div className="text-[12px] text-[#51607a]">
                              <strong className="text-[#14223b]">
                                {driver.firstName} {driver.lastName}
                              </strong>{' '}
                              | {driver.tcNo}
                              {!driver.active && <span className="ml-2 text-[#b91c1c] font-semibold">(PASIF)</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleDriverActive(driver)}
                                className="px-2 py-1 text-[11px] rounded-md border border-[#d8e0ec] font-semibold text-[#51607a] inline-flex items-center gap-1"
                              >
                                <Power width={12} height={12} />
                                {driver.active ? 'Pasif Yap' : 'Aktif Yap'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeDriver(driver)}
                                className="px-2 py-1 text-[11px] rounded-md border border-[#fecaca] font-semibold text-[#b91c1c] inline-flex items-center gap-1"
                              >
                                <Trash2 width={12} height={12} />
                                Sil
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`${CARD} p-3 space-y-2`}>
                      <p className="text-[13px] font-semibold text-[#14223b]">Arac Tanimlari</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          value={newVehicleName}
                          onChange={(event) => setNewVehicleName(event.target.value)}
                          placeholder="Arac adi"
                          className="h-11 rounded-lg border border-[#e3e8f0] px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <input
                          value={newVehiclePlate}
                          onChange={(event) => setNewVehiclePlate(event.target.value)}
                          placeholder="Plaka"
                          className="h-11 rounded-lg border border-[#e3e8f0] px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <button
                          type="button"
                          onClick={createVehicle}
                          disabled={actionLoading || catalogLoading}
                          className="h-11 rounded-lg bg-[#15356b] text-white text-[13px] font-semibold hover:bg-[#1c4585] disabled:opacity-50"
                        >
                          Arac Ekle
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {dispatchVehicles.map((vehicle) => (
                          <div
                            key={vehicle.id}
                            className="flex items-center justify-between rounded-lg border border-[#eef1f6] px-2.5 py-1.5"
                          >
                            <div className="text-[12px] text-[#51607a]">
                              <strong className="text-[#14223b]">{vehicle.name}</strong> | {vehicle.plate}
                              {!vehicle.active && <span className="ml-2 text-[#b91c1c] font-semibold">(PASIF)</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleVehicleActive(vehicle)}
                                className="px-2 py-1 text-[11px] rounded-md border border-[#d8e0ec] font-semibold text-[#51607a] inline-flex items-center gap-1"
                              >
                                <Power width={12} height={12} />
                                {vehicle.active ? 'Pasif Yap' : 'Aktif Yap'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeVehicle(vehicle)}
                                className="px-2 py-1 text-[11px] rounded-md border border-[#fecaca] font-semibold text-[#b91c1c] inline-flex items-center gap-1"
                              >
                                <Trash2 width={12} height={12} />
                                Sil
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Seri filtreleri (chip) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSeries([])}
                    className={`h-9 px-3 rounded-lg border text-[12px] font-semibold whitespace-nowrap ${
                      selectedSeries.length === 0
                        ? 'bg-[#14223b] text-white border-[#14223b]'
                        : 'bg-white text-[#51607a] border-[#d8e0ec] hover:bg-[#f4f6fa]'
                    }`}
                  >
                    Tum Seriler
                  </button>
                  {series.map((item) => (
                    <button
                      key={item.series}
                      type="button"
                      onClick={() => toggleSeriesSelection(item.series)}
                      className={`h-9 px-3 rounded-lg border text-[12px] font-semibold whitespace-nowrap ${
                        selectedSeries.includes(item.series)
                          ? 'bg-[#15356b] text-white border-[#15356b]'
                          : 'bg-white text-[#51607a] border-[#d8e0ec] hover:bg-[#f4f6fa]'
                      }`}
                    >
                      {item.series} ({item.total})
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Liste (sol) + Detay (sag) */}
        <div className={`${layoutClass} flex-1 min-h-0`}>
          {/* Sol: siparis listesi */}
          <div className={`${CARD} h-full min-h-0 p-2.5`}>
            <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 touch-pan-y overscroll-contain">
              {isLoading ? (
                <div className="py-16 text-center text-[#8b97ac] font-medium">Yukleniyor...</div>
              ) : sortedOrders.length === 0 ? (
                <div className="py-16 text-center text-[#8b97ac] font-medium">Filtreye uygun siparis bulunamadi</div>
              ) : viewMode === 'customer' ? (
                groupedCustomerOrders.map((group) => (
                  <div key={group.customerCode} className="rounded-xl border border-[#eef1f6] bg-white p-2.5 md:p-3 space-y-2.5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-[#14223b]">{group.customerName}</p>
                        <p className="text-[11.5px] text-[#8b97ac]">
                          {group.customerCode} | {group.totalOrders} siparis | Ortalama karsilama %{group.avgCoveredPercent}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10.5px] px-2 py-1 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] text-[#047857] font-semibold">
                          Tam: {group.fullCount}
                        </span>
                        <span className="text-[10.5px] px-2 py-1 rounded-md border border-[#fde68a] bg-[#fffbeb] text-[#b45309] font-semibold">
                          Kismi: {group.partialCount}
                        </span>
                        <span className="text-[10.5px] px-2 py-1 rounded-md border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c] font-semibold">
                          Eksik: {group.noneCount}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            for (let i = 0; i < group.orders.length; i += 1) {
                              const order = group.orders[i];
                              await loadOrderDetail(order.mikroOrderNumber, { makeActive: i === 0, silent: true });
                            }
                            toast.success(`${group.customerName} icin tum siparisler acildi`);
                          }}
                          className="text-[11.5px] px-3 py-1.5 rounded-lg bg-[#15356b] text-white font-semibold hover:bg-[#1c4585]"
                        >
                          Tumunu Ac
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.orders.map((order) => {
                        const active = activeOrderNumber === order.mikroOrderNumber;
                        const isOpen = openOrderNumbers.includes(order.mikroOrderNumber);
                        const cov = coverageBadgeNew[order.coverageStatus];
                        return (
                          <button
                            key={order.mikroOrderNumber}
                            type="button"
                            onClick={() => loadOrderDetail(order.mikroOrderNumber)}
                            className="text-left rounded-lg border p-2 transition-colors"
                            style={{
                              borderColor: active ? '#15356b' : isOpen ? '#bcd0ef' : cov.cardBorder,
                              background: active ? '#eef2fa' : isOpen ? '#f5f8fd' : '#fff',
                            }}
                          >
                            <p className="text-[13px] font-semibold text-[#14223b]">{order.mikroOrderNumber}</p>
                            <p className="text-[11px] text-[#8b97ac]">
                              {formatDateShort(order.orderDate)} | {formatCurrency(order.grandTotal)}
                            </p>
                            <p className="text-[11px] text-[#8b97ac]">Karsilama %{order.coverage.coveredPercent}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                sortedOrders.map((order) => {
                  const active = activeOrderNumber === order.mikroOrderNumber;
                  const isOpen = openOrderNumbers.includes(order.mikroOrderNumber);
                  const badge = statusBadgeNew[order.workflowStatus];
                  const cov = coverageBadgeNew[order.coverageStatus];
                  return (
                    <button
                      key={order.mikroOrderNumber}
                      type="button"
                      onClick={() => loadOrderDetail(order.mikroOrderNumber)}
                      className="w-full text-left rounded-xl border p-2.5 transition-colors"
                      style={{
                        borderColor: active ? '#15356b' : cov.cardBorder,
                        background: active ? '#eef2fa' : '#fff',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-[14px] font-semibold text-[#14223b]">
                            {order.mikroOrderNumber}
                            {isOpen ? ' *' : ''}
                          </p>
                          <p className="text-[11px] text-[#8b97ac] font-mono">{order.customerCode}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-md border font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`text-[10px] px-2 py-1 rounded-md border font-semibold ${cov.cls}`}>
                          {cov.label}
                        </span>
                        <span className="text-[10.5px] font-medium text-[#8b97ac]">
                          Depo: {order.warehouseCode || 'Tum Depolar'}
                        </span>
                      </div>
                      {order.mikroDeliveryNoteNo && (
                        <p className="text-[10.5px] text-[#4338ca] font-semibold mb-2">
                          Irsaliye: {order.mikroDeliveryNoteNo}
                        </p>
                      )}
                      <p className="text-[12.5px] font-medium text-[#14223b] line-clamp-1 mb-2">{order.customerName}</p>
                      <div className="flex justify-between text-[11px] text-[#8b97ac] mb-2">
                        <span>{formatDateShort(order.orderDate)}</span>
                        <span className="text-[#14223b] font-semibold">{formatCurrency(order.grandTotal)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#eef1f6] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0e7c66]"
                          style={{ width: `${order.coverage.coveredPercent}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[10.5px] text-[#8b97ac] flex justify-between">
                        <span>Karsilama %{order.coverage.coveredPercent}</span>
                        <span className="text-[#51607a]">
                          {order.coverage.fullLines} tam / {order.coverage.partialLines} kismi / {order.coverage.missingLines} eksik
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Sag: detay paneli */}
          <div
            ref={detailContainerRef}
            className={isDetailFullscreen ? 'h-full w-full overflow-y-auto bg-[#f4f6fa] p-4' : 'h-full min-h-0'}
          >
            <div className={`${CARD} h-full min-h-0 overflow-hidden flex flex-col`}>
              {/* Acik siparis sekmeleri + tum acik / tam ekran */}
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-[#eef1f6]">
                {openOrderNumbers.length > 0 && (
                  <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                    {openOrderNumbers.map((orderNumber) => {
                      const tabDetail = detailByOrder[orderNumber];
                      const active = activeOrderNumber === orderNumber;
                      return (
                        <div
                          key={orderNumber}
                          className={`inline-flex items-center rounded-lg border ${
                            active ? 'border-[#15356b] bg-[#eef2fa]' : 'border-[#e3e8f0] bg-[#fafbfd]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveOrderNumber(orderNumber)}
                            className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${
                              active ? 'text-[#15356b]' : 'text-[#51607a]'
                            }`}
                          >
                            {orderNumber}
                            {tabDetail ? '' : ' (Yukleniyor)'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              closeOrderTab(orderNumber);
                            }}
                            className="px-2 py-1.5 text-[#9aa6b8] hover:text-[#b91c1c]"
                          >
                            <X width={13} height={13} strokeWidth={2.4} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {openOrderNumbers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowAllOpenOrders((prev) => !prev)}
                    className={`h-9 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap ${
                      showAllOpenOrders
                        ? 'bg-[#15356b] text-white border border-[#15356b]'
                        : 'bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa]'
                    }`}
                  >
                    {showAllOpenOrders ? 'Tek Siparis Gorunumu' : 'Tum Acik Siparisleri Goster'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleDetailFullscreen}
                  disabled={actionLoading}
                  className="h-9 px-3 rounded-lg text-[12px] font-medium bg-white text-[#51607a] border border-[#d8e0ec] hover:bg-[#f4f6fa] disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isDetailFullscreen ? <Minimize2 width={14} height={14} /> : <Maximize2 width={14} height={14} />}
                  {isDetailFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
                </button>
              </div>

              {/* Tek siparis gorunumunde xl+ YATAY ekranda dis kapsayici scroll etmez;
                  sadece satir listesi scroll eder (baslik+aksiyon sabit, 58vh siniri yok,
                  32" ekranda cok daha fazla satir gorunur). xl alti ve dikey modda ise
                  yukseklik zinciri belirsiz kalacagi icin ESKI davranis korunur
                  (dis kapsayici scroll + satir listesinde 58vh siniri). */}
              <div
                className={`flex-1 min-h-0 p-3 ${
                  showAllOpenOrders || isPortrait ? 'overflow-y-auto' : 'overflow-y-auto xl:overflow-hidden'
                }`}
              >
                {isDetailLoading && !detail ? (
                  <div className="py-20 text-center text-[#8b97ac] font-medium">Siparis detayi yukleniyor...</div>
                ) : visibleOrderNumbers.length === 0 ? (
                  <div className="py-20 text-center text-[#8b97ac] font-medium">Sol listeden bir siparis secin</div>
                ) : (
                  <div
                    className={
                      showAllOpenOrders
                        ? 'grid grid-cols-1 2xl:grid-cols-2 gap-4'
                        : isPortrait
                        ? undefined
                        : 'xl:h-full'
                    }
                  >
                    {visibleOrderNumbers.map((orderNumber) => {
                      const panelDetail = detailByOrder[orderNumber];
                      if (!panelDetail) {
                        return (
                          <div key={orderNumber} className="rounded-xl border border-[#eef1f6] bg-[#fafbfd] p-6 text-center">
                            <p className="text-[12.5px] text-[#8b97ac] font-medium">Siparis detayi yukleniyor...</p>
                          </div>
                        );
                      }

                      const panelWorkflowStatus: WorkflowStatus = panelDetail.workflow?.status || 'PENDING';
                      const panelHasStarted =
                        Boolean(panelDetail.workflow?.startedAt) || panelWorkflowStatus !== 'PENDING';
                      const panelCanEditLines = panelHasStarted && panelWorkflowStatus !== 'DISPATCHED';
                      const panelIsActive = activeOrderNumber === orderNumber;
                      const panelCov = coverageBadgeNew[panelDetail.coverageStatus];
                      const panelStatusBadge = statusBadgeNew[panelWorkflowStatus];
                      // Tek siparis gorunumunde xl+ yatayda satir listesi kalan TUM yuksekligi
                      // kullanir; xl alti / dikey / coklu (grid) gorunumde 58vh siniri korunur.
                      const panelLineAreaClass = showAllOpenOrders
                        ? isDetailFullscreen
                          ? 'space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-1 touch-pan-y overscroll-contain'
                          : 'space-y-2 max-h-[58vh] overflow-y-auto pr-1 touch-pan-y overscroll-contain'
                        : isPortrait
                        ? 'space-y-2 max-h-[58vh] overflow-y-auto pr-1 touch-pan-y overscroll-contain'
                        : 'space-y-2 max-h-[58vh] xl:max-h-none xl:flex-1 xl:min-h-0 overflow-y-auto pr-1 touch-pan-y overscroll-contain';
                      const visibleLines = showCompletedLines
                        ? panelDetail.lines
                        : panelDetail.lines.filter((line) => line.remainingQty > 0 && line.pickedQty < line.remainingQty);
                      // Raf sirasi acikken satirlar raf koduna gore (dogal/sayisal) dizilir;
                      // rafi olmayanlar sona, esitlikte siparis satir sirasi korunur.
                      const orderedLines = sortLinesByShelf
                        ? [...visibleLines].sort((a, b) => {
                            const shelfA = (a.shelfCode || '').trim();
                            const shelfB = (b.shelfCode || '').trim();
                            if (shelfA && shelfB) {
                              const compared = shelfA.localeCompare(shelfB, 'tr', { numeric: true, sensitivity: 'base' });
                              if (compared !== 0) return compared;
                            } else if (shelfA) {
                              return -1;
                            } else if (shelfB) {
                              return 1;
                            }
                            return (Number(a.rowNumber) || 0) - (Number(b.rowNumber) || 0);
                          })
                        : visibleLines;

                      return (
                        <div
                          key={orderNumber}
                          className={
                            showAllOpenOrders
                              ? 'space-y-3 rounded-xl border p-3'
                              : isPortrait
                              ? 'flex flex-col gap-2.5 rounded-xl border p-2.5'
                              : 'xl:h-full min-h-0 flex flex-col gap-2.5 rounded-xl border p-2.5'
                          }
                          style={{
                            borderColor: panelIsActive ? '#bcd0ef' : '#eef1f6',
                            background: panelIsActive ? '#f5f8fd' : '#fff',
                          }}
                        >
                          {/* Siparis baslik karti */}
                          <div className="shrink-0 rounded-xl border border-[#eef1f6] bg-[#fafbfd] px-3 py-2">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <h2 className="text-[16px] font-semibold text-[#14223b] leading-tight">
                                  {panelDetail.order.mikroOrderNumber}
                                </h2>
                                <p className="text-[12px] text-[#51607a] font-medium">{panelDetail.order.customerName}</p>
                                {panelDetail.order.orderNote && (
                                  <p className="mt-1 inline-flex max-w-full rounded-md border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-[12px] font-semibold text-[#b45309]">
                                    {panelDetail.order.orderNote}
                                  </p>
                                )}
                                <p className="text-[11px] text-[#8b97ac] mt-1 font-mono">
                                  {panelDetail.order.customerCode} · Depo: {panelDetail.order.warehouseCode || 'Tum Depolar'} · {panelDetail.order.itemCount} kalem
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${panelStatusBadge.cls}`}>
                                  {panelStatusBadge.label}
                                </span>
                                <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${panelCov.cls}`}>
                                  {panelCov.label}
                                </span>
                                {panelDetail.workflow?.mikroDeliveryNoteNo && (
                                  <span className="text-[11px] px-2.5 py-1 rounded-full border font-semibold border-[#c7d2fe] bg-[#eef2fb] text-[#4338ca]">
                                    Irsaliye: {panelDetail.workflow.mikroDeliveryNoteNo}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2.5 h-1.5 rounded-full bg-[#eef1f6] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#0e7c66]"
                                style={{ width: `${panelDetail.coverage.coveredPercent}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-[#51607a] mt-1.5">
                              Toplam karsilama:{' '}
                              <b className="text-[#047857] font-semibold">%{panelDetail.coverage.coveredPercent}</b> (
                              {panelDetail.coverage.fullLines} tam / {panelDetail.coverage.partialLines} kismi /{' '}
                              {panelDetail.coverage.missingLines} eksik)
                            </p>
                          </div>

                          {/* Aksiyon cubugu */}
                          <div className="shrink-0 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartPicking(orderNumber)}
                                disabled={actionLoading || panelHasStarted}
                                className="h-9 px-3.5 rounded-lg text-[12px] font-semibold bg-[#15356b] text-white hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {panelHasStarted ? 'Basladi' : 'Toplamaya Basla'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveOrderNumber(orderNumber)}
                                className={`h-9 px-3.5 rounded-lg text-[12px] font-semibold ${
                                  panelIsActive
                                    ? 'bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585]'
                                    : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'
                                }`}
                              >
                                {panelIsActive ? 'Aktif Siparis' : 'Aktif'}
                              </button>
                              <button
                                type="button"
                                onClick={() => refreshOrderDetail(orderNumber)}
                                disabled={actionLoading}
                                className="h-9 px-3 rounded-lg text-[12px] font-medium bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-50"
                              >
                                Detay Yenile
                              </button>
                              <span className="text-[11.5px] text-[#8b97ac]">
                                Satirlar ({orderedLines.length}/{panelDetail.lines.length})
                              </span>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                              <button
                                type="button"
                                onClick={toggleSortLinesByShelf}
                                className={`h-9 px-3.5 rounded-lg text-[12px] font-semibold whitespace-nowrap ${
                                  sortLinesByShelf
                                    ? 'bg-[#0e7c66] text-white hover:bg-[#0b6553]'
                                    : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'
                                }`}
                              >
                                {sortLinesByShelf ? 'Raf Sirasi: Acik' : 'Raf Sirasi: Kapali'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCompletedLines((prev) => !prev)}
                                className={`h-9 min-w-[170px] px-3.5 rounded-lg text-[12px] font-semibold whitespace-nowrap ${
                                  showCompletedLines
                                    ? 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'
                                    : 'bg-[#15356b] text-white hover:bg-[#1c4585]'
                                }`}
                              >
                                {showCompletedLines ? 'Toplananlari Gizle' : 'Toplananlari Goster'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openDispatchModal(orderNumber)}
                                disabled={actionLoading || panelWorkflowStatus === 'DISPATCHED' || !panelHasStarted}
                                className={`h-9 min-w-[230px] px-4 rounded-lg text-[12px] font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
                                  panelWorkflowStatus === 'DISPATCHED'
                                    ? 'bg-[#eef1f6] text-[#9aa6b8] cursor-not-allowed'
                                    : 'bg-[#15356b] text-white hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}
                              >
                                {panelWorkflowStatus === 'DISPATCHED' ? (
                                  <>
                                    <Check width={14} height={14} />
                                    Irsaliyelestirildi ({panelDetail.workflow?.mikroDeliveryNoteNo || '-'})
                                  </>
                                ) : (
                                  <>
                                    <Truck width={14} height={14} />
                                    Kapat ve Irsaliyelestir
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Satirlar */}
                          <div className={panelLineAreaClass}>
                            {orderedLines.map((line) => {
                              const draftKey = getShelfDraftKey(orderNumber, line.lineKey);
                              const saving = lineSavingKey === draftKey;
                              const isLineCompleted = line.remainingQty <= 0 || line.pickedQty >= line.remainingQty;
                              const reservationKey = `${orderNumber}::${line.lineKey}`;
                              const reservationOpen = openReservationKey === reservationKey;
                              const imageIssueKey = `${orderNumber}::${line.lineKey}`;
                              const imageIssueReported = Boolean(reportedImageKeys[imageIssueKey]);
                              const imageIssueReporting = reportingImageKey === imageIssueKey;
                              const confirmComplete = Boolean(confirmCompleteKeys[draftKey]);
                              const unitLabel = getUnitConversionLabel(line.unit, line.unit2, line.unit2Factor);
                              // Kalan miktarin koli kirilimi: orn. koli ici 30 -> 305 = "10 KOLI + 5 ADET"
                              const remainingCaseLabel = getCaseBreakdownLabel(
                                line.remainingQty,
                                line.unit,
                                line.unit2,
                                line.unit2Factor
                              );
                              const lineBorder = isLineCompleted
                                ? '#a7f3d0'
                                : line.stockCoverageStatus === 'NONE'
                                ? '#fecaca'
                                : line.stockCoverageStatus === 'PARTIAL'
                                ? '#fde68a'
                                : '#eef1f6';
                              return (
                                <div
                                  key={line.lineKey}
                                  className="rounded-xl border overflow-hidden bg-white"
                                  style={{ borderColor: lineBorder }}
                                >
                                  <div className="flex gap-2.5 p-2">
                                    {/* Urun gorseli */}
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-[#f4f6fa] border border-[#eef1f6] shrink-0 flex items-center justify-center">
                                      {line.imageUrl ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewImage({ url: line.imageUrl as string, name: line.productName })
                                          }
                                          className="block w-full h-full"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={line.imageUrl} alt={line.productName} className="w-full h-full object-cover" />
                                        </button>
                                      ) : (
                                        <Package width={26} height={26} stroke="#c2cbda" strokeWidth={1.5} />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-[13px] font-semibold text-[#14223b] line-clamp-2">{line.productName}</p>
                                          <p className="text-[10.5px] text-[#b45309] font-mono mt-0.5">
                                            Satir #{line.rowNumber} · {line.productCode} · Birim: {line.unit}
                                          </p>
                                          {unitLabel && <p className="text-[10.5px] font-medium text-[#0e7c66] mt-0.5">{unitLabel}</p>}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-1">
                                          {isLineCompleted && (
                                            <span className="text-[10px] px-2 py-1 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] text-[#047857] font-semibold inline-flex items-center gap-1">
                                              <Check width={11} height={11} strokeWidth={2.6} />
                                              TOPLANDI
                                            </span>
                                          )}
                                          {line.hasOwnReservation && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                              }
                                              className="text-[11px] px-2.5 py-1 rounded-md border border-[#047857] bg-[#047857] text-white font-semibold tracking-wide"
                                            >
                                              REZERVE SIPARIS
                                            </button>
                                          )}
                                          {line.hasOtherReservation && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                              }
                                              className="text-[11px] px-2.5 py-1 rounded-md border border-[#b91c1c] bg-[#b91c1c] text-white font-semibold tracking-wide"
                                            >
                                              BASKA SIPARISTE REZERVE
                                            </button>
                                          )}
                                          {line.reservedQty > 0 && (
                                            <span className="text-[11px] px-2.5 py-1 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46] font-semibold tracking-wide">
                                              SATIR REZERVE: {line.reservedQty} {line.unit}
                                            </span>
                                          )}
                                          <span className={`text-[10px] px-2 py-1 rounded-md border font-semibold ${stockStatusNew[line.stockCoverageStatus]}`}>
                                            Siparis Depo Stok: {line.stockAvailable} {line.unit}
                                          </span>
                                          <span className="text-[10px] px-2 py-1 rounded-md border border-[#e3e8f0] bg-[#f4f6fa] text-[#51607a] font-semibold">
                                            Merkez: {line.warehouseStocks.merkez}
                                          </span>
                                          <span className="text-[10px] px-2 py-1 rounded-md border border-[#e3e8f0] bg-[#f4f6fa] text-[#51607a] font-semibold">
                                            Topca: {line.warehouseStocks.topca}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => reportImageIssue(orderNumber, line)}
                                            disabled={imageIssueReported || imageIssueReporting}
                                            className={`text-[10px] px-2 py-1 rounded-md border font-semibold disabled:opacity-60 inline-flex items-center gap-1 ${
                                              imageIssueReported
                                                ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
                                                : 'border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d] hover:bg-[#fce7f3]'
                                            }`}
                                          >
                                            <ImageOff width={11} height={11} />
                                            {imageIssueReporting
                                              ? 'Bildiriliyor'
                                              : imageIssueReported
                                              ? 'Resim bildirildi'
                                              : 'Resim hatasi bildir'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Miktar / raf kolonlari */}
                                      <div className="mt-1.5 grid grid-cols-1 xl:grid-cols-[245px_minmax(0,1fr)] gap-2">
                                        <div className="grid grid-cols-2 gap-1.5 xl:self-start">
                                          <div className={`rounded-lg border px-2 py-1.5 min-w-0 ${remainingBoxNew(line.stockCoverageStatus)}`}>
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide">Kalan Siparis</p>
                                            <p className="text-[15px] leading-none font-semibold mt-1">{line.remainingQty}</p>
                                            {remainingCaseLabel && (
                                              <p className="text-[10px] font-bold mt-0.5 whitespace-nowrap">= {remainingCaseLabel}</p>
                                            )}
                                          </div>
                                          <div className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-2 py-1.5 min-w-0">
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#047857]">Depodaki Miktar</p>
                                            <p className="text-[15px] leading-none font-semibold mt-1 text-[#047857]">{line.stockAvailable}</p>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-2">
                                          {/* Toplanan Miktar */}
                                          <div className="rounded-lg border border-[#99f6e4] bg-[#f0fdfa] p-1.5">
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#0e7c66] mb-1">Toplanan Miktar</p>
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => changePicked(orderNumber, line, -1)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-7 w-7 rounded-md border border-[#ccfbf1] bg-[#f0fdfa] text-[#0e7c66] inline-flex items-center justify-center disabled:opacity-50"
                                              >
                                                <Minus width={15} height={15} strokeWidth={2.4} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => openQtyPad('picked', orderNumber, line)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-8 flex-1 rounded-md bg-[#0e7c66] text-white flex items-center justify-center text-[15px] font-semibold disabled:opacity-50"
                                              >
                                                {line.pickedQty}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => changePicked(orderNumber, line, 1)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-7 w-7 rounded-md border border-[#ccfbf1] bg-[#f0fdfa] text-[#0e7c66] inline-flex items-center justify-center disabled:opacity-50"
                                              >
                                                <Plus width={15} height={15} strokeWidth={2.4} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleCompleteLine(orderNumber, line)}
                                                disabled={saving || !panelCanEditLines}
                                                className={`h-7 px-2 rounded-md text-[10px] font-semibold disabled:opacity-50 whitespace-nowrap ${
                                                  confirmComplete
                                                    ? 'border border-[#14223b] bg-white text-[#14223b]'
                                                    : 'bg-[#0e7c66] text-white'
                                                }`}
                                              >
                                                {confirmComplete ? 'Tamamladim' : 'Tamami'}
                                              </button>
                                            </div>
                                          </div>

                                          {/* Siparissiz Ek */}
                                          <div className="rounded-lg border border-[#eef1f6] p-1.5">
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8b97ac] mb-1">Siparissiz Ek</p>
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => changeExtra(orderNumber, line, -1)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-7 w-7 rounded-md border border-[#e3e8f0] bg-[#fafbfd] text-[#51607a] inline-flex items-center justify-center disabled:opacity-50"
                                              >
                                                <Minus width={15} height={15} strokeWidth={2.4} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => openQtyPad('extra', orderNumber, line)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-8 flex-1 rounded-md bg-[#f4f6fa] flex items-center justify-center text-[13px] font-semibold text-[#14223b] disabled:opacity-50"
                                              >
                                                {line.extraQty}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => changeExtra(orderNumber, line, 1)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-7 w-7 rounded-md border border-[#e3e8f0] bg-[#fafbfd] text-[#51607a] inline-flex items-center justify-center disabled:opacity-50"
                                              >
                                                <Plus width={15} height={15} strokeWidth={2.4} />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Mevcut Raf */}
                                          <div className="rounded-lg border border-[#eef1f6] p-1.5">
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8b97ac] mb-1">Mevcut Raf</p>
                                            <p className="h-8 rounded-md bg-[#f4f6fa] px-2 flex items-center text-[12px] font-semibold text-[#14223b] font-mono">
                                              {line.shelfCode || '-'}
                                            </p>
                                          </div>

                                          {/* Raf Guncelle */}
                                          <div className="rounded-lg border border-[#eef1f6] p-1.5">
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8b97ac] mb-1">Raf Guncelle</p>
                                            <div className="grid grid-cols-[1fr_auto] gap-1">
                                              <input
                                                value={shelfDrafts[draftKey] || ''}
                                                onChange={(event) =>
                                                  setShelfDrafts((prev) => ({ ...prev, [draftKey]: event.target.value }))
                                                }
                                                onFocus={() => {
                                                  // 5.6: Raf kodu girilirken otomatik yenilemeyi duraklat
                                                  setActiveInputCount((count) => count + 1);
                                                  if (panelCanEditLines) openShelfKeyboard(orderNumber, line);
                                                }}
                                                onClick={() => {
                                                  if (panelCanEditLines) openShelfKeyboard(orderNumber, line);
                                                }}
                                                onBlur={() => {
                                                  // 5.6: Odak gidince duraklatma sayacini dusur
                                                  setActiveInputCount((count) => Math.max(0, count - 1));
                                                  if (panelCanEditLines) saveShelf(orderNumber, line);
                                                }}
                                                placeholder="A-03-12"
                                                disabled={!panelCanEditLines}
                                                className="h-8 rounded-md border border-[#e3e8f0] px-2 text-[12px] text-[#14223b] font-mono outline-none focus:border-[#15356b] disabled:opacity-50 disabled:bg-[#f4f6fa]"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => saveShelf(orderNumber, line)}
                                                disabled={saving || !panelCanEditLines}
                                                className="h-8 px-2.5 rounded-md text-[11px] font-semibold bg-white border border-[#d8e0ec] text-[#15356b] hover:bg-[#f4f6fa] disabled:opacity-50"
                                              >
                                                Kaydet
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Rezerve detaylari */}
                                      {reservationOpen && line.reservations.length > 0 && (
                                        <div className="mt-2 rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-2">
                                          <div className="flex items-center justify-between">
                                            <p className="text-[12px] font-semibold text-[#51607a]">Rezerve Detaylari</p>
                                            <button
                                              type="button"
                                              onClick={() => setOpenReservationKey(null)}
                                              className="text-[11px] font-semibold text-[#8b97ac] hover:text-[#14223b]"
                                            >
                                              Kapat
                                            </button>
                                          </div>
                                          <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                            {line.reservations.map((reservation, index) => (
                                              <div
                                                key={`${reservation.mikroOrderNumber}-${reservation.rowNumber || 'x'}-${index}`}
                                                className={`rounded-md border px-2 py-1.5 ${
                                                  reservation.isCurrentOrder
                                                    ? 'border-[#a7f3d0] bg-[#ecfdf5]'
                                                    : 'border-[#fecaca] bg-[#fef2f2]'
                                                }`}
                                              >
                                                <p className="text-[11px] font-semibold text-[#14223b]">
                                                  {reservation.mikroOrderNumber}
                                                  {reservation.rowNumber ? ` (Satir #${reservation.rowNumber})` : ''}
                                                </p>
                                                <p className="text-[11px] text-[#51607a]">
                                                  {reservation.customerCode} | {reservation.customerName}
                                                </p>
                                                <p className="text-[11px] text-[#51607a]">
                                                  {formatDateShort(reservation.orderDate)} | Rezerve: {reservation.reservedQty} {line.unit}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resim onizleme overlay */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-[#0b1220]/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-white/90 text-[#14223b] inline-flex items-center justify-center"
            >
              <X width={17} height={17} strokeWidth={2.4} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-xl border-2 border-white/40 object-contain bg-[#0b1220]/40"
            />
          </div>
        </div>
      )}

      {/* Kapat ve Irsaliyelestir modali */}
      <Modal
        isOpen={Boolean(dispatchModalOrderNumber)}
        onClose={() => setDispatchModalOrderNumber(null)}
        title="Siparisi Kapat ve Irsaliyelestir"
        size="md"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDispatchModalOrderNumber(null)}
              className="h-9 px-4 rounded-lg text-[12.5px] font-medium bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]"
            >
              Iptal
            </button>
            <button
              type="button"
              onClick={() => {
                if (!dispatchModalOrderNumber) return;
                void handleDispatchWithDeliveryNote(dispatchModalOrderNumber, {
                  deliverySeries: dispatchModalSeries,
                  driverId: dispatchModalDriverId,
                  vehicleId: dispatchModalVehicleId,
                });
              }}
              disabled={
                actionLoading ||
                !dispatchModalSeries.trim() ||
                !dispatchModalDriverId ||
                !dispatchModalVehicleId
              }
              className="h-9 px-4 rounded-lg text-[12.5px] font-semibold bg-[#047857] text-white hover:bg-[#065f46] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Truck width={14} height={14} />
              Irsaliyelestir
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-[#d6e0f1] bg-[#eef2fa] px-3 py-2.5">
            <Truck width={16} height={16} stroke="#15356b" strokeWidth={2} />
            <span className="text-[12px] text-[#1c4585]">
              Siparis: <strong>{dispatchModalOrderNumber || '-'}</strong> — irsaliye serisi, sofor ve arac secimi zorunlu.
            </span>
          </div>
          {(() => {
            const modalDetail = dispatchModalOrderNumber ? detailByOrder[dispatchModalOrderNumber] : null;
            const extraLines = (modalDetail?.lines || []).filter((line) => line.extraQty > 0);
            if (extraLines.length === 0) return null;
            return (
              <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5">
                <p className="text-[11.5px] font-semibold text-[#b45309] mb-1">
                  Siparissiz ek miktarlar irsaliyeye AYRI SATIR olarak eklenecek:
                </p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {extraLines.map((line) => (
                    <p key={line.lineKey} className="text-[11px] text-[#92400e]">
                      • {line.productName}: +{line.extraQty} {line.unit}
                    </p>
                  ))}
                </div>
              </div>
            );
          })()}
          <div>
            <p className="text-[11px] font-semibold text-[#8b97ac] mb-1">Irsaliye Serisi</p>
            <input
              value={dispatchModalSeries}
              onChange={(event) => setDispatchModalSeries(event.target.value.toUpperCase())}
              placeholder="Ornek: BKR"
              className="h-10 w-full rounded-lg border border-[#e3e8f0] px-3 text-[13px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#8b97ac] mb-1">Sofor</p>
            <select
              value={dispatchModalDriverId}
              onChange={(event) => setDispatchModalDriverId(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[13px] font-medium text-[#14223b] outline-none focus:border-[#15356b] cursor-pointer"
            >
              <option value="">Sofor secin</option>
              {activeDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.firstName} {driver.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#8b97ac] mb-1">Arac</p>
            <select
              value={dispatchModalVehicleId}
              onChange={(event) => setDispatchModalVehicleId(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#e3e8f0] bg-white px-3 text-[13px] font-medium text-[#14223b] outline-none focus:border-[#15356b] cursor-pointer"
            >
              <option value="">Arac secin</option>
              {activeVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} ({vehicle.plate})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Ekran klavyesi modali (arama / irsaliye / raf) */}
      <Modal
        isOpen={Boolean(keyboardTarget)}
        onClose={() => setKeyboardTarget(null)}
        title={
          keyboardTarget?.type === 'delivery'
            ? 'Irsaliye Serisi Klavyesi'
            : keyboardTarget?.type === 'shelf'
            ? 'Raf Kodu Klavyesi'
            : 'Siparis Arama Klavyesi'
        }
        size="xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setKeyboardValue('')}
              className="h-9 px-4 rounded-lg text-[12.5px] font-medium bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => void applyKeyboard()}
              className="h-9 px-5 rounded-lg text-[12.5px] font-semibold bg-[#15356b] text-white hover:bg-[#1c4585]"
            >
              OK
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <input
            autoFocus
            value={keyboardValue}
            onChange={(event) => setKeyboardValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void applyKeyboard();
              }
            }}
            className="h-12 w-full rounded-lg border border-[#e3e8f0] px-3 text-[18px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
          />
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="grid grid-cols-10 gap-2">
              {row.map((key) => (
                <button
                  key={`${rowIndex}-${key}`}
                  type="button"
                  onClick={() => setKeyboardValue((prev) => `${prev}${key}`)}
                  className="h-11 rounded-lg border border-[#e3e8f0] bg-white text-[14px] font-semibold text-[#14223b] hover:bg-[#f4f6fa]"
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setKeyboardValue((prev) => prev.slice(0, -1))}
              className="h-11 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[13px] font-semibold text-[#b45309] inline-flex items-center justify-center gap-1.5"
            >
              <Delete width={15} height={15} />
              Geri Sil
            </button>
            <button
              type="button"
              onClick={() => setKeyboardValue((prev) => `${prev} `)}
              className="col-span-2 h-11 rounded-lg border border-[#e3e8f0] bg-white text-[13px] font-semibold text-[#14223b] hover:bg-[#f4f6fa]"
            >
              Bosluk
            </button>
            <button
              type="button"
              onClick={() => setKeyboardValue('')}
              className="h-11 rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[13px] font-semibold text-[#b91c1c]"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      {/* Numpad modali (toplanan / ek miktar) */}
      <Modal
        isOpen={Boolean(qtyPadTarget)}
        onClose={() => setQtyPadTarget(null)}
        title={qtyPadTarget?.type === 'extra' ? 'Siparissiz Ek Miktar' : 'Toplanan Miktar'}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setQtyPadTarget(null)}
              className="h-9 px-4 rounded-lg text-[12.5px] font-medium bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]"
            >
              Iptal
            </button>
            <button
              type="button"
              onClick={applyQtyPad}
              className="h-9 px-5 rounded-lg text-[12.5px] font-semibold bg-[#15356b] text-white hover:bg-[#1c4585]"
            >
              OK
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <input
            value={qtyPadTarget?.value || ''}
            readOnly
            className="h-12 w-full rounded-lg border border-[#e3e8f0] px-3 text-[18px] font-semibold text-[#14223b] outline-none bg-[#fafbfd]"
          />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`qty-${key}`}
                type="button"
                onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-11 rounded-lg border border-[#e3e8f0] bg-white text-[18px] font-semibold text-[#14223b] hover:bg-[#f4f6fa]"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-11 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[13px] font-semibold text-[#b45309] inline-flex items-center justify-center gap-1.5"
            >
              <Delete width={15} height={15} />
              Sil
            </button>
            <button
              type="button"
              onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-11 rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[13px] font-semibold text-[#b91c1c]"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
