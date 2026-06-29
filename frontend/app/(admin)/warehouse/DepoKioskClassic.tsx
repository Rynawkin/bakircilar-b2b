'use client';

import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  useDepoKiosk,
  type WorkflowStatus,
  type OrderSortField,
  type OrderSortDirection,
  type OrderViewMode,
  statusBadge,
  stockStatusClass,
  orderCoverageBadge,
  getRemainingQtyClass,
  KEYBOARD_ROWS,
  NUMPAD_NUMBER_KEYS,
  formatCurrency,
  formatDateShort,
  getUnitConversionLabel,
} from './useDepoKiosk';

/**
 * Klasik (mevcut) Depo Kiosk gorunumu.
 * JSX, eski page.tsx ile BIRE BIR aynidir; tum mantik useDepoKiosk hook'undan gelir.
 */
export default function DepoKioskClassic() {
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
    actionButtonClass,
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
    <div className="h-[calc(100dvh-56px)] overflow-hidden bg-gradient-to-br from-slate-50 via-cyan-50 to-slate-100">
      <div className="h-full w-full overflow-hidden px-2 md:px-4 xl:px-6 py-2 flex flex-col gap-2">
        <Card className="shrink-0 border border-cyan-200 bg-white/90 backdrop-blur">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Depo Kiosk</h1>
                <p className="text-sm text-slate-600">
                  Dokunmatik toplama ve yukleme akisi ({isPortrait ? 'Dikey' : 'Yatay'} mod)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs md:text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2 inline-flex">
                  Gorunen siparis: <strong className="ml-1">{totalOrdersCount}</strong>
                </div>
                <Button
                  variant={isKioskTouchMode ? 'primary' : 'secondary'}
                  onClick={() => setIsKioskTouchMode((prev) => !prev)}
                  className="h-9 text-[11px] font-bold"
                >
                  {isKioskTouchMode ? 'Dokunmatik Acik' : 'Dokunmatik Kapali'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowTopControls((prev) => !prev)}
                  className="h-9 px-2 text-[11px] font-bold"
                >
                  {showTopControls ? '▲ Kapat' : '▼ Ac'}
                </Button>
              </div>
            </div>

            {showTopControls && (
            <>
            <div className="grid grid-cols-1 md:grid-cols-9 gap-2">
              <Input
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
                className="h-10 text-sm md:col-span-3"
              />
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value as any)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
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
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="orderDate">Tarih</option>
                <option value="customerName">Musteri (A-Z)</option>
                <option value="grandTotal">Tutar</option>
                <option value="coveredPercent">Karsilama %</option>
              </select>
              <select
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as OrderSortDirection)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="desc">Azalan</option>
                <option value="asc">Artan</option>
              </select>
              <select
                value={viewMode}
                onChange={(event) => setViewMode(event.target.value as OrderViewMode)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="order">Siparis bazli</option>
                <option value="customer">Musteriye gore grupla</option>
              </select>
              <Button variant="secondary" onClick={refreshWithSync} className="h-10 text-sm" disabled={actionLoading}>
                Senkron + Yenile
              </Button>
              <Button
                variant={isBarcodeMode ? 'primary' : 'secondary'}
                onClick={() => setIsBarcodeMode((prev) => !prev)}
                className="h-10 text-xs font-bold"
              >
                {isBarcodeMode ? 'Barkod Odak Acik' : 'Barkod Odak Kapali'}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-600">Sofor/Arac Tanimlari</p>
              <Button
                variant={showDispatchCatalogAdmin ? 'primary' : 'secondary'}
                onClick={() => setShowDispatchCatalogAdmin((prev) => !prev)}
                className="h-8 px-3 text-xs font-bold"
              >
                {showDispatchCatalogAdmin ? 'Kapat' : 'Ac'}
              </Button>
            </div>

            {showDispatchCatalogAdmin && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-sm font-black text-slate-800">Sofor Tanimlari</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input
                    value={newDriverFirstName}
                    onChange={(event) => setNewDriverFirstName(event.target.value)}
                    placeholder="Ad"
                    className="h-11 text-sm"
                  />
                  <Input
                    value={newDriverLastName}
                    onChange={(event) => setNewDriverLastName(event.target.value)}
                    placeholder="Soyad"
                    className="h-11 text-sm"
                  />
                  <Input
                    value={newDriverTcNo}
                    onChange={(event) => setNewDriverTcNo(event.target.value)}
                    placeholder="TC No"
                    className="h-11 text-sm"
                  />
                  <Button onClick={createDriver} disabled={actionLoading || catalogLoading} className="h-11 text-sm font-bold">
                    Sofor Ekle
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {dispatchDrivers.map((driver) => (
                    <div key={driver.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5">
                      <div className="text-xs text-slate-700">
                        <strong>{driver.firstName} {driver.lastName}</strong> | {driver.tcNo}
                        {!driver.active && <span className="ml-2 text-rose-600 font-bold">(PASIF)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleDriverActive(driver)}
                          className="px-2 py-1 text-[11px] rounded-md border border-slate-300 font-bold text-slate-700"
                        >
                          {driver.active ? 'Pasif Yap' : 'Aktif Yap'}
                        </button>
                        <button
                          onClick={() => removeDriver(driver)}
                          className="px-2 py-1 text-[11px] rounded-md border border-rose-300 font-bold text-rose-700"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-sm font-black text-slate-800">Arac Tanimlari</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input
                    value={newVehicleName}
                    onChange={(event) => setNewVehicleName(event.target.value)}
                    placeholder="Arac adi"
                    className="h-11 text-sm"
                  />
                  <Input
                    value={newVehiclePlate}
                    onChange={(event) => setNewVehiclePlate(event.target.value)}
                    placeholder="Plaka"
                    className="h-11 text-sm"
                  />
                  <Button onClick={createVehicle} disabled={actionLoading || catalogLoading} className="h-11 text-sm font-bold">
                    Arac Ekle
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {dispatchVehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5">
                      <div className="text-xs text-slate-700">
                        <strong>{vehicle.name}</strong> | {vehicle.plate}
                        {!vehicle.active && <span className="ml-2 text-rose-600 font-bold">(PASIF)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleVehicleActive(vehicle)}
                          className="px-2 py-1 text-[11px] rounded-md border border-slate-300 font-bold text-slate-700"
                        >
                          {vehicle.active ? 'Pasif Yap' : 'Aktif Yap'}
                        </button>
                        <button
                          onClick={() => removeVehicle(vehicle)}
                          className="px-2 py-1 text-[11px] rounded-md border border-rose-300 font-bold text-rose-700"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedSeries([])}
                className={`px-3 h-9 rounded-xl border text-xs font-bold whitespace-nowrap ${
                  selectedSeries.length === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Tum Seriler
              </button>
              {series.map((item) => (
                <button
                  key={item.series}
                  onClick={() => toggleSeriesSelection(item.series)}
                  className={`px-3 h-9 rounded-xl border text-xs font-bold whitespace-nowrap ${
                    selectedSeries.includes(item.series)
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {item.series} ({item.total})
                </button>
              ))}
            </div>
            </>
            )}
          </div>
        </Card>

        <div className={`${layoutClass} flex-1 min-h-0`}>
          <Card className="h-full min-h-0 border border-slate-200 bg-white/90">
            <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 touch-pan-y overscroll-contain">
              {isLoading ? (
                <div className="py-16 text-center text-slate-500 font-semibold">Yukleniyor...</div>
              ) : sortedOrders.length === 0 ? (
                <div className="py-16 text-center text-slate-500 font-semibold">Filtreye uygun siparis bulunamadi</div>
              ) : (
                viewMode === 'customer' ? (
                  groupedCustomerOrders.map((group) => (
                    <div key={group.customerCode} className="rounded-2xl border border-slate-200 bg-white p-2.5 md:p-3 space-y-2.5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <p className="text-sm font-black text-slate-900">{group.customerName}</p>
                          <p className="text-xs text-slate-600">
                            {group.customerCode} | {group.totalOrders} siparis | Ortalama karsilama %{group.avgCoveredPercent}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold">
                            Tam: {group.fullCount}
                          </span>
                          <span className="text-[11px] px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 font-bold">
                            Kismi: {group.partialCount}
                          </span>
                          <span className="text-[11px] px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-bold">
                            Eksik: {group.noneCount}
                          </span>
                          <button
                            onClick={async () => {
                              for (let i = 0; i < group.orders.length; i += 1) {
                                const order = group.orders[i];
                                await loadOrderDetail(order.mikroOrderNumber, { makeActive: i === 0, silent: true });
                              }
                              toast.success(`${group.customerName} icin tum siparisler acildi`);
                            }}
                            className="text-xs px-3 py-2 rounded-xl bg-cyan-600 text-white font-bold"
                          >
                            Tumunu Ac
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.orders.map((order) => {
                          const active = activeOrderNumber === order.mikroOrderNumber;
                          const isOpen = openOrderNumbers.includes(order.mikroOrderNumber);
                          const coverageBadge = orderCoverageBadge[order.coverageStatus];
                          return (
                            <button
                              key={order.mikroOrderNumber}
                              onClick={() => loadOrderDetail(order.mikroOrderNumber)}
                              className={`text-left rounded-xl border p-2 transition ${
                                active
                                  ? 'border-cyan-500 bg-cyan-50 shadow-sm'
                                  : isOpen
                                  ? 'border-cyan-300 bg-cyan-50/50'
                                  : `${coverageBadge.cardClass} hover:border-cyan-300`
                              }`}
                            >
                              <p className="text-sm font-black text-slate-900">{order.mikroOrderNumber}</p>
                              <p className="text-xs text-slate-600">{formatDateShort(order.orderDate)} | {formatCurrency(order.grandTotal)}</p>
                              <p className="text-xs text-slate-600">Karsilama %{order.coverage.coveredPercent}</p>
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
                  const badge = statusBadge[order.workflowStatus];
                  const coverageBadge = orderCoverageBadge[order.coverageStatus];
                  return (
                    <button
                      key={order.mikroOrderNumber}
                      onClick={() => loadOrderDetail(order.mikroOrderNumber)}
                      className={`w-full text-left rounded-2xl border p-2.5 transition-all ${
                        active
                          ? 'border-cyan-500 bg-cyan-50 shadow-md'
                          : `${coverageBadge.cardClass} bg-white hover:border-cyan-300 hover:bg-cyan-50/40`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-base font-black text-slate-900">
                            {order.mikroOrderNumber}
                            {isOpen ? ' *' : ''}
                          </p>
                          <p className="text-xs text-slate-600">{order.customerCode}</p>
                        </div>
                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${coverageBadge.className}`}>
                          {coverageBadge.label}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          Depo: {order.warehouseCode || 'Tum Depolar'}
                        </span>
                      </div>
                      {order.mikroDeliveryNoteNo && (
                        <p className="text-[11px] text-indigo-700 font-bold mb-2">
                          Irsaliye: {order.mikroDeliveryNoteNo}
                        </p>
                      )}
                      <p className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2">{order.customerName}</p>
                      <div className="flex justify-between text-xs text-slate-600 mb-2">
                        <span>{formatDateShort(order.orderDate)}</span>
                        <span>{formatCurrency(order.grandTotal)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                          style={{ width: `${order.coverage.coveredPercent}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-slate-600 flex justify-between">
                        <span>Karsilama %{order.coverage.coveredPercent}</span>
                        <span>
                          {order.coverage.fullLines} tam / {order.coverage.partialLines} kismi / {order.coverage.missingLines} eksik
                        </span>
                      </div>
                    </button>
                  );
                })
                )
              )}
            </div>
          </Card>

          <div
            ref={detailContainerRef}
            className={isDetailFullscreen ? 'h-full w-full overflow-y-auto bg-slate-100 p-4' : 'h-full min-h-0'}
          >
            <Card className="h-full min-h-0 border border-slate-200 bg-white/95 overflow-hidden">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {openOrderNumbers.length > 0 && (
                  <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                    {openOrderNumbers.map((orderNumber) => {
                      const tabDetail = detailByOrder[orderNumber];
                      const active = activeOrderNumber === orderNumber;
                      return (
                        <div
                          key={orderNumber}
                          className={`inline-flex items-center rounded-xl border ${
                            active ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <button
                            onClick={() => setActiveOrderNumber(orderNumber)}
                            className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${
                              active ? 'text-cyan-700' : 'text-slate-700'
                            }`}
                          >
                            {orderNumber}
                            {tabDetail ? '' : ' (Yukleniyor)'}
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              closeOrderTab(orderNumber);
                            }}
                            className="px-2 py-2 text-xs font-black text-slate-500 hover:text-rose-600"
                          >
                            X
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {openOrderNumbers.length > 1 && (
                  <Button
                    variant={showAllOpenOrders ? 'primary' : 'secondary'}
                    onClick={() => setShowAllOpenOrders((prev) => !prev)}
                    className="h-10 text-xs font-bold whitespace-nowrap"
                  >
                    {showAllOpenOrders ? 'Tek Siparis Gorunumu' : 'Tum Acik Siparisleri Goster'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={toggleDetailFullscreen}
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold whitespace-nowrap"
                >
                  {isDetailFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
                </Button>
              </div>

              {isDetailLoading && !detail ? (
                <div className="py-20 text-center text-slate-500 font-semibold">Siparis detayi yukleniyor...</div>
              ) : visibleOrderNumbers.length === 0 ? (
                <div className="py-20 text-center text-slate-500 font-semibold">
                  Sol listeden bir siparis secin
                </div>
              ) : (
                <div
                  className={
                    showAllOpenOrders
                      ? 'grid grid-cols-1 2xl:grid-cols-2 gap-4'
                      : 'space-y-4'
                  }
                >
                  {visibleOrderNumbers.map((orderNumber) => {
                    const panelDetail = detailByOrder[orderNumber];
                    if (!panelDetail) {
                      return (
                        <div key={orderNumber} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                          <p className="text-sm text-slate-600 font-semibold">Siparis detayi yukleniyor...</p>
                        </div>
                      );
                    }

                    const panelWorkflowStatus: WorkflowStatus = panelDetail.workflow?.status || 'PENDING';
                    const panelHasStarted =
                      Boolean(panelDetail.workflow?.startedAt) || panelWorkflowStatus !== 'PENDING';
                    const panelCanEditLines = panelHasStarted && panelWorkflowStatus !== 'DISPATCHED';
                    const panelIsActive = activeOrderNumber === orderNumber;
                    const panelCoverageBadge = orderCoverageBadge[panelDetail.coverageStatus];
                    const panelLineAreaClass = isDetailFullscreen
                      ? 'space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-1 touch-pan-y overscroll-contain'
                      : 'space-y-2 max-h-[58vh] overflow-y-auto pr-1 touch-pan-y overscroll-contain';
                    const visibleLines = showCompletedLines
                      ? panelDetail.lines
                      : panelDetail.lines.filter((line) => line.remainingQty > 0 && line.pickedQty < line.remainingQty);

                    return (
                      <div
                        key={orderNumber}
                        className={`space-y-4 rounded-2xl border p-3 ${
                          panelIsActive ? 'border-cyan-300 bg-cyan-50/30' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                              <h2 className="text-lg font-black text-slate-900 leading-tight">{panelDetail.order.mikroOrderNumber}</h2>
                              <p className="text-xs text-slate-700 font-semibold">{panelDetail.order.customerName}</p>
                              {panelDetail.order.orderNote && (
                                <p className="mt-1 inline-flex max-w-full rounded-lg border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">
                                  {panelDetail.order.orderNote}
                                </p>
                              )}
                              <p className="text-xs text-slate-500 mt-1">
                                {panelDetail.order.customerCode} | Depo: {panelDetail.order.warehouseCode || 'Tum Depolar'} | {panelDetail.order.itemCount} kalem
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`text-xs px-2.5 py-1 rounded-xl border font-bold ${statusBadge[panelWorkflowStatus].className}`}>
                                {statusBadge[panelWorkflowStatus].label}
                              </span>
                              <span className={`text-xs px-2.5 py-1 rounded-xl border font-bold ${panelCoverageBadge.className}`}>
                                {panelCoverageBadge.label}
                              </span>
                              {panelDetail.workflow?.mikroDeliveryNoteNo && (
                                <span className="text-xs px-2.5 py-1 rounded-xl border font-bold border-indigo-200 bg-indigo-100 text-indigo-700">
                                  Irsaliye: {panelDetail.workflow.mikroDeliveryNoteNo}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                              style={{ width: `${panelDetail.coverage.coveredPercent}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1.5">
                            Toplam karsilama: %{panelDetail.coverage.coveredPercent} ({panelDetail.coverage.fullLines} tam / {panelDetail.coverage.partialLines} kismi / {panelDetail.coverage.missingLines} eksik)
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              onClick={() => handleStartPicking(orderNumber)}
                              disabled={actionLoading || panelHasStarted}
                              className={actionButtonClass}
                            >
                              {panelHasStarted ? 'Basladi' : 'Toplamaya Basla'}
                            </Button>
                            <Button
                              variant={panelIsActive ? 'primary' : 'secondary'}
                              onClick={() => setActiveOrderNumber(orderNumber)}
                              className={actionButtonClass}
                            >
                              {panelIsActive ? 'Aktif Siparis' : 'Aktif'}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => refreshOrderDetail(orderNumber)}
                              disabled={actionLoading}
                              className={actionButtonClass}
                            >
                              Detay Yenile
                            </Button>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                              Satirlar ({visibleLines.length}/{panelDetail.lines.length})
                            </span>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              variant={showCompletedLines ? 'secondary' : 'primary'}
                              onClick={() => setShowCompletedLines((prev) => !prev)}
                              className="h-8 min-w-[190px] px-4 text-[11px] font-bold whitespace-nowrap"
                            >
                              {showCompletedLines ? 'Toplananlari Gizle' : 'Toplananlari Goster'}
                            </Button>
                            <Button
                              onClick={() => openDispatchModal(orderNumber)}
                              disabled={actionLoading || panelWorkflowStatus === 'DISPATCHED' || !panelHasStarted}
                              className="h-9 min-w-[260px] px-6 text-[12px] font-black whitespace-nowrap"
                            >
                              {panelWorkflowStatus === 'DISPATCHED'
                                ? `Irsaliyelestirildi (${panelDetail.workflow?.mikroDeliveryNoteNo || '-'})`
                                : 'Kapat ve Irsaliyelestir'}
                            </Button>
                          </div>
                        </div>
                        <div className={panelLineAreaClass}>
                          {visibleLines.map((line, lineIndex) => {
                            const draftKey = getShelfDraftKey(orderNumber, line.lineKey);
                            const saving = lineSavingKey === draftKey;
                            const remainingQtyClass = getRemainingQtyClass(line);
                            const isLineCompleted = line.remainingQty <= 0 || line.pickedQty >= line.remainingQty;
                            const reservationKey = `${orderNumber}::${line.lineKey}`;
                            const reservationOpen = openReservationKey === reservationKey;
                            const imageIssueKey = `${orderNumber}::${line.lineKey}`;
                            const imageIssueReported = Boolean(reportedImageKeys[imageIssueKey]);
                            const imageIssueReporting = reportingImageKey === imageIssueKey;
                            const confirmComplete = Boolean(confirmCompleteKeys[draftKey]);
                            const unitLabel = getUnitConversionLabel(line.unit, line.unit2, line.unit2Factor);
                            const zebraClass = lineIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80';
                            const statusBorderClass = isLineCompleted
                              ? 'border-emerald-300'
                              : line.stockCoverageStatus === 'NONE'
                              ? 'border-rose-300'
                              : line.stockCoverageStatus === 'PARTIAL'
                              ? 'border-amber-300'
                              : 'border-slate-200';
                            return (
                              <div
                                key={line.lineKey}
                                className={`rounded-xl border p-2 md:p-2.5 shadow-sm transition-colors ${zebraClass} ${statusBorderClass}`}
                              >
                                <div className="flex gap-3">
                                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                    {line.imageUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewImage({ url: line.imageUrl as string, name: line.productName })}
                                        className="block w-full h-full"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={line.imageUrl} alt={line.productName} className="w-full h-full object-cover" />
                                      </button>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">RESIM</div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-sm font-black text-slate-900 line-clamp-2">{line.productName}</p>
                                        <p className="text-xs text-slate-600">
                                          Satir #{line.rowNumber} | {line.productCode} | Birim: {line.unit}
                                        </p>
                                        {unitLabel && (
                                          <p className="text-xs font-semibold text-cyan-700">{unitLabel}</p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-1">
                                        {isLineCompleted && (
                                          <span className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-800 font-black">
                                            TOPLANDI
                                          </span>
                                        )}
                                        {line.hasOwnReservation && (
                                          <button
                                            onClick={() =>
                                              setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                            }
                                            className="text-[12px] md:text-sm px-3 py-1.5 rounded-xl border-2 border-emerald-700 bg-emerald-600 text-white font-black tracking-wide shadow-sm"
                                          >
                                            REZERVE SIPARIS
                                          </button>
                                        )}
                                        {line.hasOtherReservation && (
                                          <button
                                            onClick={() =>
                                              setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                            }
                                            className="text-[12px] md:text-sm px-3 py-1.5 rounded-xl border-2 border-rose-700 bg-rose-600 text-white font-black tracking-wide shadow-sm"
                                          >
                                            BASKA SIPARISTE REZERVE
                                          </button>
                                        )}
                                        {line.reservedQty > 0 && (
                                          <span className="text-[12px] md:text-sm px-3 py-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-100 text-emerald-900 font-black tracking-wide">
                                            SATIR REZERVE: {line.reservedQty} {line.unit}
                                          </span>
                                        )}
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Birim: {line.unit}
                                        </span>
                                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${stockStatusClass[line.stockCoverageStatus]}`}>
                                          Siparis Depo Stok: {line.stockAvailable} {line.unit}
                                        </span>
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Merkez: {line.warehouseStocks.merkez}
                                        </span>
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Topca: {line.warehouseStocks.topca}
                                        </span>
                                        <button
                                          onClick={() => reportImageIssue(orderNumber, line)}
                                          disabled={imageIssueReported || imageIssueReporting}
                                          className={`text-[10px] px-2 py-1 rounded-lg border font-bold disabled:opacity-60 ${
                                            imageIssueReported
                                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                              : 'border-rose-300 bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {imageIssueReporting
                                            ? 'Bildiriliyor'
                                            : imageIssueReported
                                            ? 'Resim bildirildi'
                                            : 'Resim hatasi bildir'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-1.5 grid grid-cols-1 xl:grid-cols-[245px_minmax(0,1fr)] gap-2">
                                      <div className="grid grid-cols-2 gap-1.5 text-xs xl:self-start">
                                        <div className={`rounded-lg border px-2 py-1.5 min-w-0 ${remainingQtyClass}`}>
                                          <p className="text-[10px] font-black uppercase tracking-wide">Kalan Siparis</p>
                                          <p className="text-base leading-none font-black mt-1">{line.remainingQty}</p>
                                        </div>
                                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1.5 min-w-0">
                                          <p className="text-[10px] font-black uppercase tracking-wide text-cyan-800">Depodaki Miktar</p>
                                          <p className="text-base leading-none font-black mt-1 text-cyan-900">
                                            {line.stockAvailable}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-2">
                                        <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-1.5">
                                          <p className="text-[10px] font-bold text-slate-600 mb-1">Toplanan Miktar</p>
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => changePicked(orderNumber, line, -1)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-7 w-7 rounded-md border border-slate-300 text-sm font-black text-slate-700 disabled:opacity-50"
                                            >
                                              -
                                            </button>
                                            <button
                                              onClick={() => openQtyPad('picked', orderNumber, line)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-8 flex-1 rounded-md bg-cyan-600 text-white flex items-center justify-center text-base font-black disabled:opacity-50"
                                            >
                                              {line.pickedQty}
                                            </button>
                                            <button
                                              onClick={() => changePicked(orderNumber, line, 1)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-7 w-7 rounded-md border border-slate-300 text-sm font-black text-slate-700 disabled:opacity-50"
                                            >
                                              +
                                            </button>
                                            <button
                                              onClick={() => handleCompleteLine(orderNumber, line)}
                                              disabled={saving || !panelCanEditLines}
                                              className={`h-7 px-2 rounded-md text-[10px] font-bold disabled:opacity-50 whitespace-nowrap ${
                                                confirmComplete
                                                  ? 'border border-slate-900 bg-white text-slate-900 shadow-sm'
                                                  : 'bg-emerald-600 text-white'
                                              }`}
                                            >
                                              {confirmComplete ? 'Tamamladim' : 'Tamami'}
                                            </button>
                                          </div>
                                        </div>

                                        <div className="rounded-lg border border-slate-200 p-1.5">
                                          <p className="text-[10px] font-bold text-slate-600 mb-1">Siparissiz Ek</p>
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => changeExtra(orderNumber, line, -1)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-7 w-7 rounded-md border border-slate-300 text-sm font-black text-slate-700 disabled:opacity-50"
                                            >
                                              -
                                            </button>
                                            <button
                                              onClick={() => openQtyPad('extra', orderNumber, line)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-8 flex-1 rounded-md bg-slate-100 flex items-center justify-center text-sm font-black text-slate-900 disabled:opacity-50"
                                            >
                                              {line.extraQty}
                                            </button>
                                            <button
                                              onClick={() => changeExtra(orderNumber, line, 1)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-7 w-7 rounded-md border border-slate-300 text-sm font-black text-slate-700 disabled:opacity-50"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </div>

                                        <div className="rounded-lg border border-slate-200 p-1.5">
                                          <p className="text-[10px] font-bold text-slate-600 mb-1">Mevcut Raf</p>
                                          <p className="h-8 rounded-md bg-slate-100 px-2 flex items-center text-xs font-bold text-slate-800">
                                            {line.shelfCode || '-'}
                                          </p>
                                        </div>

                                        <div className="rounded-lg border border-slate-200 p-1.5">
                                          <p className="text-[10px] font-bold text-slate-600 mb-1">Raf Guncelle</p>
                                          <div className="grid grid-cols-[1fr_auto] gap-1">
                                            <Input
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
                                              className="h-8 text-xs"
                                              disabled={!panelCanEditLines}
                                            />
                                            <Button
                                              variant="secondary"
                                              onClick={() => saveShelf(orderNumber, line)}
                                              disabled={saving || !panelCanEditLines}
                                              className="h-8 px-2 text-[11px]"
                                            >
                                              Kaydet
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {reservationOpen && line.reservations.length > 0 && (
                                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-black text-slate-700">Rezerve Detaylari</p>
                                          <button
                                            onClick={() => setOpenReservationKey(null)}
                                            className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                                          >
                                            Kapat
                                          </button>
                                        </div>
                                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                          {line.reservations.map((reservation, index) => (
                                            <div
                                              key={`${reservation.mikroOrderNumber}-${reservation.rowNumber || 'x'}-${index}`}
                                              className={`rounded-lg border px-2 py-1.5 ${
                                                reservation.isCurrentOrder
                                                  ? 'border-emerald-200 bg-emerald-50'
                                                  : 'border-rose-200 bg-rose-50'
                                              }`}
                                            >
                                              <p className="text-[11px] font-bold text-slate-800">
                                                {reservation.mikroOrderNumber}
                                                {reservation.rowNumber ? ` (Satir #${reservation.rowNumber})` : ''}
                                              </p>
                                              <p className="text-[11px] text-slate-700">
                                                {reservation.customerCode} | {reservation.customerName}
                                              </p>
                                              <p className="text-[11px] text-slate-700">
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
            </Card>
          </div>
        </div>
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-white/90 text-slate-900 font-black"
            >
              X
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-2xl border-2 border-white/50 object-contain bg-slate-950/40"
            />
          </div>
        </div>
      )}
      <Modal
        isOpen={Boolean(dispatchModalOrderNumber)}
        onClose={() => setDispatchModalOrderNumber(null)}
        title="Siparisi Kapat ve Irsaliyelestir"
        size="md"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setDispatchModalOrderNumber(null)}>
              Iptal
            </Button>
            <Button
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
            >
              Irsaliyelestir
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Siparis: <strong>{dispatchModalOrderNumber || '-'}</strong>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">Irsaliye Serisi</p>
            <Input
              value={dispatchModalSeries}
              onChange={(event) => setDispatchModalSeries(event.target.value.toUpperCase())}
              placeholder="Ornek: BKR"
              className="h-10 text-sm font-bold"
            />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">Sofor</p>
            <select
              value={dispatchModalDriverId}
              onChange={(event) => setDispatchModalDriverId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
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
            <p className="text-xs font-bold text-slate-600 mb-1">Arac</p>
            <select
              value={dispatchModalVehicleId}
              onChange={(event) => setDispatchModalVehicleId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
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
            <Button variant="secondary" onClick={() => setKeyboardValue('')}>Temizle</Button>
            <Button onClick={() => void applyKeyboard()}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={keyboardValue}
            onChange={(event) => setKeyboardValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void applyKeyboard();
              }
            }}
            className="h-12 text-lg font-bold"
          />
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="grid grid-cols-10 gap-2">
              {row.map((key) => (
                <button
                  key={`${rowIndex}-${key}`}
                  onClick={() => setKeyboardValue((prev) => `${prev}${key}`)}
                  className="h-11 rounded-lg border border-slate-300 bg-white text-sm font-black"
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setKeyboardValue((prev) => prev.slice(0, -1))}
              className="h-11 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Geri Sil
            </button>
            <button
              onClick={() => setKeyboardValue((prev) => `${prev} `)}
              className="col-span-2 h-11 rounded-lg border border-slate-300 bg-white text-sm font-black"
            >
              Bosluk
            </button>
            <button
              onClick={() => setKeyboardValue('')}
              className="h-11 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(qtyPadTarget)}
        onClose={() => setQtyPadTarget(null)}
        title={qtyPadTarget?.type === 'extra' ? 'Siparissiz Ek Miktar' : 'Toplanan Miktar'}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setQtyPadTarget(null)}>Iptal</Button>
            <Button onClick={applyQtyPad}>OK</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={qtyPadTarget?.value || ''} readOnly className="h-12 text-lg font-black" />
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_NUMBER_KEYS.map((key) => (
              <button
                key={`qty-${key}`}
                onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: `${prev.value}${key}` } : prev))}
                className="h-11 rounded-lg border border-slate-300 bg-white text-lg font-black"
              >
                {key}
              </button>
            ))}
            <button
              onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: prev.value.slice(0, -1) } : prev))}
              className="h-11 rounded-lg border border-amber-300 bg-amber-50 text-sm font-black text-amber-700"
            >
              Sil
            </button>
            <button
              onClick={() => setQtyPadTarget((prev) => (prev ? { ...prev, value: '' } : prev))}
              className="h-11 rounded-lg border border-rose-300 bg-rose-50 text-sm font-black text-rose-700"
            >
              Temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
