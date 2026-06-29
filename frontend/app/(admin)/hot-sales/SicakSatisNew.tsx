'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  RefreshCcw,
  Search,
  Truck,
  ShoppingCart,
  PackagePlus,
  ClipboardCheck,
  Settings,
  Plus,
  X,
  BarChart3,
  Banknote,
  FileDown,
  Flame,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  useSicakSatis,
  WAREHOUSE_OPTIONS,
  priceLabel,
  n,
  fmtQty,
  fmtDate,
  fmtDateTime,
  warehouseLabel,
  typeLabel,
  paymentLabel,
  movementLabel,
  minAllowedPrice,
  costMissing,
  itemAvailableFor,
} from './useSicakSatis';
import type { CartItem, SaleType, PaymentType, NewCustomerForm } from './useSicakSatis';

/**
 * Yeni gorunum Sicak Satis ekrani. Mevcut TUM mantik useSicakSatis'tan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/sekme/kolon/filtre/numpad/modal/satir-aksiyon/durum/Mikro-yazma dusurulmemistir.
 * Brief 4.4.2'deki her oge mevcut ve mevcut handler'a baglidir.
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INPUT =
  'h-9 w-full border border-[#e3e8f0] rounded-lg px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';
const SELECT =
  'h-9 w-full border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white cursor-pointer';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 bg-[#15356b] text-white border-none rounded-lg px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed';

export default function SicakSatisNew() {
  const {
    activeTab,
    setActiveTab,
    dashboard,
    selectedSessionId,
    setSelectedSessionId,
    loading,
    vehicles,
    customers,
    setCustomers,
    products,
    openOrders,
    reconciliation,
    customerSearch,
    setCustomerSearch,
    productSearch,
    setProductSearch,
    orderSearch,
    setOrderSearch,
    selectedCustomer,
    setSelectedCustomer,
    showCustomerForm,
    setShowCustomerForm,
    saleType,
    setSaleType,
    paymentType,
    setPaymentType,
    priceListNo,
    setPriceListNo,
    cart,
    loadCart,
    deliveryQuantities,
    setDeliveryQuantities,
    closingCounts,
    setClosingCounts,
    submitting,
    reconciliationLoading,
    reportLoading,
    dailyReport,
    reportFilters,
    setReportFilters,
    sessionForm,
    setSessionForm,
    vehicleForm,
    setVehicleForm,
    newCustomerForm,
    setNewCustomerForm,
    saleTotal,
    loadTotalQty,
    priceViolations,
    saleStockViolations,
    loadStockViolations,
    activeSession,
    inventory,
    addToCart,
    updateCart,
    removeCart,
    startSession,
    addLoad,
    submitSale,
    deliverOrder,
    closeSession,
    saveVehicle,
    refreshReconciliation,
    refreshDailyReport,
    exportDailyReportCsv,
    cancelLocalTransaction,
    createHotCustomer,
  } = useSicakSatis();

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6 text-[13px] text-[#8b97ac]">
          Sicak satis yukleniyor...
        </div>
      </div>
    );
  }

  // 6 sekme (klasik activeTab mantigi) — Satis / Yukleme / Siparis Teslim / Gun Sonu / Rapor / Yonetim
  const tabs: Array<{ key: typeof activeTab; label: string; icon: ReactNode }> = [
    { key: 'sale', label: 'Satış', icon: <ShoppingCart width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
    { key: 'load', label: 'Yükleme', icon: <PackagePlus width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
    { key: 'orders', label: 'Sipariş Teslim', icon: <ClipboardCheck width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
    { key: 'close', label: 'Gün Sonu', icon: <ClipboardCheck width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
    { key: 'report', label: 'Rapor', icon: <BarChart3 width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
    { key: 'manage', label: 'Yönetim', icon: <Settings width={15} height={15} stroke="currentColor" strokeWidth={2} /> },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header (koyu) — Depo 11 Sicak Depo + 4 metrik (Aktif Arac / Arac / Son Islem / Aktif Seri=SICAK) */}
        <div className="bg-[#0c2247] rounded-[14px] px-5 py-[18px] mb-4 flex items-center gap-5 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-[9px] bg-white/10 text-[#fbbf24] shrink-0">
              <Flame width={18} height={18} stroke="currentColor" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-white m-0">Depo 11 · Sıcak Satış Operasyon</h1>
              <div className="text-[12.5px] text-[#9bb0d4] mt-1">
                Araç stok bazlı sıcak satış · yükleme, anlık satış, irsaliye, gün sonu
              </div>
            </div>
          </div>
          <div className="ml-auto flex gap-6 flex-wrap">
            <HeaderMetric label="Aktif Araç" value={dashboard?.openSessions?.length || 0} />
            <HeaderMetric label="Araç" value={vehicles.length} />
            <HeaderMetric label="Son İşlem" value={dashboard?.recentTransactions?.length || 0} />
            <HeaderMetric label="Aktif Seri" value="SICAK" accent />
          </div>
        </div>

        {/* Sekme bar (6 sekme) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold cursor-pointer border ${
                  isActive
                    ? 'bg-white border-[#d3deef] shadow-[0_1px_2px_rgba(20,34,59,.06)]'
                    : 'bg-transparent border-transparent hover:bg-white/60'
                }`}
                style={{ color: isActive ? '#15356b' : '#8b97ac' }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
          {/* Sol sabit sutun: Oturum karti + Arac Stogu karti */}
          <div className="flex flex-col gap-4">
            {/* Oturum karti */}
            <div className={`${CARD} p-4`}>
              <div className="text-[13px] font-semibold text-[#14223b] mb-3">Oturum</div>
              {activeSession ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] p-3">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#047857]">Açık Oturum</div>
                    <div className="text-[15px] font-semibold text-[#14223b] mt-0.5">{activeSession.vehicle?.name}</div>
                    <div className="flex items-center gap-1.5 text-[12px] text-[#065f46] mt-0.5">
                      <AlertTriangle width={12} height={12} stroke="currentColor" strokeWidth={2} className="shrink-0" />
                      {activeSession.vehicle?.plate} / Kaynak depo {warehouseLabel(activeSession.sourceWarehouseNo)}
                    </div>
                  </div>
                  <select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)} className={SELECT}>
                    {(dashboard?.openSessions || []).map((session: any) => (
                      <option key={session.id} value={session.id}>
                        {session.vehicle?.name} - {session.user?.displayName || session.user?.name || session.user?.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <select
                    value={sessionForm.vehicleId}
                    onChange={(e) => setSessionForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                    className={SELECT}
                  >
                    <option value="">Araç seç</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} - {vehicle.plate}
                      </option>
                    ))}
                  </select>
                  <WarehouseField
                    value={sessionForm.sourceWarehouseNo}
                    onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-[#8b97ac]">Başlangıç Nakit</span>
                    <input
                      placeholder="Başlangıç nakit"
                      value={sessionForm.openingCash}
                      onChange={(e) => setSessionForm((p) => ({ ...p, openingCash: e.target.value }))}
                      className={INPUT}
                    />
                  </label>
                  <button type="button" onClick={startSession} disabled={submitting} className={`${BTN_PRIMARY} w-full mt-1`}>
                    Oturumu Aç
                  </button>
                </div>
              )}
            </div>

            {/* Arac Stogu karti */}
            <div className={`${CARD} p-4`}>
              <div className="text-[13px] font-semibold text-[#14223b] mb-3">Araç Stoğu</div>
              <div className="max-h-[420px] flex flex-col gap-2 overflow-y-auto pr-1">
                {inventory.length === 0 && (
                  <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-3 text-[12px] text-[#8b97ac]">Araç stoğu yok.</p>
                )}
                {inventory.map((row: any) => (
                  <div key={row.productCode} className="flex items-center gap-2.5 rounded-lg border border-[#eef1f6] p-2">
                    <ProductImage src={row.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-medium text-[#14223b]">{row.productName}</div>
                      <div className="text-[10px] text-[#8b97ac] font-mono">{row.productCode}</div>
                    </div>
                    <div className="rounded-md bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-1 text-right text-[12px] font-semibold text-[#047857]">
                      {fmtQty(row.quantity)} {row.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sag icerik: aktif sekme */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* ===== SATIS ===== */}
            {activeTab === 'sale' && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
                <div className={`${CARD} p-4`}>
                  {/* Satis tipi / Odeme / Fiyat listesi */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-3.5">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-[#8b97ac]">Satış Tipi</span>
                      <select value={saleType} onChange={(e) => setSaleType(e.target.value as SaleType)} className={SELECT}>
                        <option value="CASH_INVOICE">Faturasız Anlık Satış</option>
                        <option value="INVOICED_DISPATCH">Faturalı İrsaliye</option>
                        <option value="ORDER">Araçta Yoksa Sipariş</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-[#8b97ac]">Ödeme</span>
                      <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={SELECT}>
                        <option value="CASH">Nakit</option>
                        <option value="CARD">Kart</option>
                        <option value="TRANSFER">Havale</option>
                        <option value="OPEN_ACCOUNT">Açık Hesap</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-[#8b97ac]">Fiyat Listesi</span>
                      <select value={priceListNo} onChange={(e) => setPriceListNo(Number(e.target.value))} className={SELECT}>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                          <option key={listNo} value={listNo}>
                            {priceLabel(listNo)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <CustomerPicker
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onCreateRequest={() => setShowCustomerForm((value) => !value)}
                    onSelect={(customer: any) => {
                      setSelectedCustomer(customer);
                      setCustomerSearch(customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode);
                      setCustomers([]);
                    }}
                  />
                  {showCustomerForm && (
                    <NewCustomerPanel
                      form={newCustomerForm}
                      onChange={(patch: Partial<NewCustomerForm>) => setNewCustomerForm((prev) => ({ ...prev, ...patch }))}
                      onSubmit={createHotCustomer}
                      submitting={submitting}
                    />
                  )}

                  <ProductSearch
                    value={productSearch}
                    onChange={setProductSearch}
                    products={products}
                    actionLabel={activeSession ? 'Sepete Ekle' : 'Oturum gerekli'}
                    onAdd={(product: any, listNo?: number) => addToCart(product, 'sale', listNo)}
                  />
                </div>

                <CartPanel
                  title="Satış Sepeti"
                  cart={cart}
                  total={saleTotal}
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('sale', code, patch)}
                  onRemove={(code: string) => removeCart('sale', code)}
                  onSubmit={submitSale}
                  submitLabel={saleType === 'ORDER' ? 'Sipariş Oluştur' : saleType === 'INVOICED_DISPATCH' ? 'İrsaliye Kes' : 'Satış Faturası Kes'}
                  disabled={submitting || !activeSession || priceViolations.length > 0 || saleStockViolations.length > 0}
                  saleType={saleType}
                  mode="sale"
                />
              </div>
            )}

            {/* ===== YUKLEME ===== */}
            {activeTab === 'load' && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
                <div className={`${CARD} p-4`}>
                  <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                    <WarehouseField
                      value={sessionForm.sourceWarehouseNo}
                      onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-[#8b97ac]">Hedef</span>
                      <div className="flex h-9 items-center rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 text-[12.5px] font-semibold text-[#92500a]">
                        Sıcak Depo (11)
                      </div>
                    </div>
                  </div>
                  <ProductSearch
                    value={productSearch}
                    onChange={setProductSearch}
                    products={products}
                    actionLabel="Yüklemeye Ekle"
                    onAdd={(product: any) => addToCart(product, 'load')}
                  />
                </div>
                <CartPanel
                  title="Yükleme Listesi"
                  cart={loadCart}
                  total={loadTotalQty}
                  totalLabel="Toplam miktar"
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('load', code, patch)}
                  onRemove={(code: string) => removeCart('load', code)}
                  onSubmit={activeSession ? addLoad : startSession}
                  submitLabel={activeSession ? 'Araca Yükle' : 'Yükleyerek Oturum Aç'}
                  disabled={submitting || loadStockViolations.length > 0}
                  hidePrice
                  mode="load"
                  sourceWarehouseNo={sessionForm.sourceWarehouseNo}
                />
              </div>
            )}

            {/* ===== SIPARIS TESLIM ===== */}
            {activeTab === 'orders' && (
              <div className={`${CARD} p-4`}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#14223b] mb-1.5">Açık SICAK Sipariş Ara</label>
                    <div className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-3">
                      <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
                      <input
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder="Sipariş no, cari veya ürün"
                        className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
                      />
                    </div>
                  </div>
                  <CustomerPicker
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onCreateRequest={() => setShowCustomerForm((value) => !value)}
                    onSelect={(customer: any) => {
                      setSelectedCustomer(customer);
                      setCustomerSearch(customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode);
                      setCustomers([]);
                    }}
                  />
                </div>
                {showCustomerForm && (
                  <NewCustomerPanel
                    form={newCustomerForm}
                    onChange={(patch: Partial<NewCustomerForm>) => setNewCustomerForm((prev) => ({ ...prev, ...patch }))}
                    onSubmit={createHotCustomer}
                    submitting={submitting}
                  />
                )}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {openOrders.length === 0 && (
                    <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-5 text-[12.5px] font-medium text-[#8b97ac]">
                      Teslim edilecek açık SICAK sipariş bulunamadı.
                    </p>
                  )}
                  {openOrders.map((order: any) => (
                    <div key={order.orderNumber} className="overflow-hidden rounded-xl border border-[#e7ebf2] bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3 bg-[#0c2247] p-4 text-white">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#fbbf24]">Siparişten İrsaliye</div>
                          <div className="text-lg font-semibold font-mono mt-0.5">{order.orderNumber}</div>
                          <div className="text-[12px] text-white/70 mt-0.5">
                            {fmtDate(order.orderDate)} / {order.customerName || order.customerCode}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/10 px-3 py-2 text-right">
                          <div className="text-[10.5px] text-white/60">Kalan tutar</div>
                          <div className="font-semibold">{formatCurrency(order.totalAmount || 0)}</div>
                        </div>
                      </div>
                      <div className="max-h-[360px] flex flex-col gap-2 overflow-y-auto p-3">
                        {order.items.map((item: any) => {
                          const enough = n(item.vehicleStock) + 0.0001 >= n(item.remainingQty);
                          const key = `${order.orderNumber}:${item.orderGuid || item.rowNumber}`;
                          const deliverQty = deliveryQuantities[key] ?? '0';
                          const deliverNumber = Number(String(deliverQty).replace(',', '.')) || 0;
                          const invalidQty = deliverNumber > n(item.remainingQty) + 0.0001 || deliverNumber > n(item.vehicleStock) + 0.0001;
                          return (
                            <div
                              key={`${order.orderNumber}-${item.rowNumber}`}
                              className={`flex gap-3 rounded-lg border p-3 ${invalidQty ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#eef1f6] bg-white'}`}
                            >
                              <ProductImage src={item.imageUrl} large />
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-[12px] font-medium text-[#14223b]">{item.productName}</div>
                                <div className="text-[10px] text-[#8b97ac] font-mono">{item.productCode}</div>
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                                  <span className="rounded-full bg-[#fffbeb] border border-[#fde68a] px-2 py-0.5 text-[#b45309]">
                                    Kalan {fmtQty(item.remainingQty)} {item.unit}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 border ${
                                      enough ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]' : 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
                                    }`}
                                  >
                                    Araç {fmtQty(item.vehicleStock)}
                                  </span>
                                  <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[#51607a]">{formatCurrency(item.unitPrice || 0)}</span>
                                </div>
                              </div>
                              <div className="w-24 shrink-0">
                                <label className="mb-1 block text-[9.5px] font-semibold uppercase text-[#8b97ac]">Kesilecek</label>
                                <input
                                  value={deliverQty}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setDeliveryQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                                  className={`h-9 w-full rounded-lg border px-3 text-[12px] font-semibold text-center outline-none ${
                                    invalidQty ? 'border-[#f87171] text-[#b91c1c]' : 'border-[#d8e0ec] text-[#14223b]'
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-[#eef1f6] p-3">
                        <button
                          type="button"
                          onClick={() => deliverOrder(order)}
                          disabled={!activeSession || submitting}
                          className="w-full inline-flex items-center justify-center gap-2 bg-[#047857] text-white border-none rounded-lg px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#065f46] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Girilen Miktarları İrsaliye Kes
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== GUN SONU ===== */}
            {activeTab === 'close' && (
              <div className={`${CARD} overflow-hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-[#eef1f6]">
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#14223b]">Gün Sonu Sayım</div>
                    <div className="text-[12px] text-[#8b97ac] mt-0.5">Tüm araç stoğu sayılmadan oturum kapatılmaz.</div>
                  </div>
                  <button type="button" onClick={closeSession} disabled={!activeSession || submitting} className={BTN_PRIMARY}>
                    Gün Sonunu Kapat
                  </button>
                </div>
                <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_120px_160px_100px] gap-3 px-4 py-2.5 bg-[#fafbfd] border-b border-[#eef1f6] text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                  <span></span>
                  <span>Ürün</span>
                  <span className="text-center">Sayılan</span>
                  <span className="text-center">Aksiyon</span>
                  <span className="text-center">Fark</span>
                </div>
                <div className="flex flex-col">
                  {inventory.map((row: any) => {
                    const count = closingCounts[row.productCode] || { countedQty: '', action: 'KEEP_ON_VEHICLE', note: '' };
                    const diff = Number(String(count.countedQty || '0').replace(',', '.')) - n(row.quantity);
                    const diffRisk = Math.abs(diff) > 0.001;
                    return (
                      <div
                        key={row.productCode}
                        className="grid grid-cols-1 md:grid-cols-[64px_minmax(0,1fr)_120px_160px_100px] gap-3 px-4 py-3 border-t border-[#f1f4f9] items-center"
                      >
                        <ProductImage src={row.imageUrl} large />
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-[#14223b]">{row.productName}</div>
                          <div className="text-[10px] text-[#8b97ac] font-mono">
                            {row.productCode} / Beklenen {fmtQty(row.quantity)} {row.unit}
                          </div>
                        </div>
                        <input
                          value={count.countedQty}
                          onChange={(e) =>
                            setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, countedQty: e.target.value } }))
                          }
                          className="h-9 rounded-lg border border-[#d8e0ec] px-3 text-[12px] text-center text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <select
                          value={count.action}
                          onChange={(e) =>
                            setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, action: e.target.value as any } }))
                          }
                          className="h-9 rounded-lg border border-[#e3e8f0] px-2.5 text-[11.5px] text-[#14223b] outline-none focus:border-[#15356b] cursor-pointer bg-white"
                        >
                          <option value="KEEP_ON_VEHICLE">Araçta Bırak</option>
                          <option value="RETURN_TO_DEPOT">Depoya İndir</option>
                        </select>
                        <div
                          className={`rounded-lg px-3 py-2 text-center text-[12px] font-semibold ${
                            diffRisk ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#ecfdf5] text-[#047857]'
                          }`}
                        >
                          Fark {fmtQty(diff)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ===== RAPOR ===== */}
            {activeTab === 'report' && (
              <div className="flex flex-col gap-4">
                {/* Filtre karti (koyu) */}
                <div className="bg-[#0c2247] rounded-xl overflow-hidden">
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4 p-5">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#fbbf24] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#0c2247]">
                        <Banknote width={14} height={14} stroke="currentColor" strokeWidth={2} /> Kasa ve Ciro Raporu
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight text-white m-0">Günlük Sıcak Satış Mutabakatı</h2>
                      <p className="mt-1 max-w-3xl text-[12.5px] text-white/65">
                        Açılış nakiti, nakit/kart/havale/açık hesap kırılımı, kapanış farkı, araç oturumları, Mikro riski ve stok sayım farkları tek raporda.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:w-[560px]">
                      <input
                        type="date"
                        value={reportFilters.startDate}
                        onChange={(e) => setReportFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                        className="h-9 rounded-lg border border-white/10 bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none"
                      />
                      <input
                        type="date"
                        value={reportFilters.endDate}
                        onChange={(e) => setReportFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                        className="h-9 rounded-lg border border-white/10 bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none"
                      />
                      <select
                        value={reportFilters.vehicleId}
                        onChange={(e) => setReportFilters((prev) => ({ ...prev, vehicleId: e.target.value }))}
                        className="h-9 rounded-lg border border-white/10 bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none cursor-pointer"
                      >
                        <option value="">Tüm araçlar</option>
                        {(dailyReport?.options?.vehicles || vehicles).map((vehicle: any) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} - {vehicle.plate}
                          </option>
                        ))}
                      </select>
                      <select
                        value={reportFilters.userId}
                        onChange={(e) => setReportFilters((prev) => ({ ...prev, userId: e.target.value }))}
                        className="h-9 rounded-lg border border-white/10 bg-white px-3 text-[12.5px] font-medium text-[#14223b] outline-none cursor-pointer"
                      >
                        <option value="">Tüm personeller</option>
                        {(dailyReport?.options?.users || []).map((operator: any) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.name || operator.email}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={refreshDailyReport}
                        disabled={reportLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#fbbf24] text-[#0c2247] border-none px-4 py-2 text-[12.5px] font-semibold cursor-pointer hover:bg-[#f59e0b] disabled:opacity-50"
                      >
                        <RefreshCcw width={14} height={14} stroke="currentColor" strokeWidth={2} /> Raporu Getir
                      </button>
                      <button
                        type="button"
                        onClick={exportDailyReportCsv}
                        disabled={!dailyReport}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-[#14223b] border-none px-4 py-2 text-[12.5px] font-semibold cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50"
                      >
                        <FileDown width={14} height={14} stroke="currentColor" strokeWidth={2} /> Excel CSV
                      </button>
                    </div>
                  </div>
                </div>

                {reportLoading && !dailyReport ? (
                  <div className={`${CARD} p-6 text-[12.5px] font-medium text-[#8b97ac]`}>Rapor hazırlanıyor...</div>
                ) : !dailyReport ? (
                  <div className={`${CARD} p-6 text-[12.5px] font-medium text-[#8b97ac]`}>Filtreleri seçip raporu getirin.</div>
                ) : (
                  <>
                    {/* 4 metrik */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <ReportMetric
                        title="Toplam Ciro"
                        value={formatCurrency(dailyReport.summary?.totalRevenue || 0)}
                        tone="dark"
                        sub={`${dailyReport.summary?.completedTransactionCount || 0} aktif işlem`}
                      />
                      <ReportMetric
                        title="Nakit Satış"
                        value={formatCurrency(dailyReport.summary?.cashSales || 0)}
                        tone="green"
                        sub={`Açılış: ${formatCurrency(dailyReport.summary?.openingCash || 0)}`}
                      />
                      <ReportMetric
                        title="Beklenen Kasa"
                        value={formatCurrency(dailyReport.summary?.expectedCash || 0)}
                        tone="amber"
                        sub={`Kapanış: ${formatCurrency(dailyReport.summary?.closingCash || 0)}`}
                      />
                      <ReportMetric
                        title="Kasa Farkı"
                        value={formatCurrency(dailyReport.summary?.cashDifference || 0)}
                        tone={Math.abs(n(dailyReport.summary?.cashDifference)) > 0.01 ? 'red' : 'green'}
                        sub={`${dailyReport.summary?.riskySessionCount || 0} riskli oturum`}
                      />
                    </div>

                    {/* Odeme & Islem kirilimi + Uyari paneli */}
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4">
                      <div className={`${CARD} p-4`}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-[15px] font-semibold text-[#14223b]">Ödeme ve İşlem Kırılımı</h3>
                            <p className="text-[11px] font-medium text-[#8b97ac] mt-0.5">
                              İptal işlemler cirodan ayrılır, sync failed ayrıca risk olarak işaretlenir.
                            </p>
                          </div>
                          <span className="rounded-full bg-[#f1f4f9] px-3 py-1 text-[11px] font-semibold text-[#51607a]">
                            {fmtDate(dailyReport.filters?.startDate)} - {fmtDate(dailyReport.filters?.endDate)}
                          </span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-4">
                            <p className="mb-3 text-[12px] font-semibold text-[#51607a]">Ödeme Tipleri</p>
                            {['CASH', 'CARD', 'TRANSFER', 'OPEN_ACCOUNT', 'MIXED'].map((key) => (
                              <ReportBar
                                key={key}
                                label={paymentLabel(key)}
                                value={dailyReport.paymentTotals?.[key] || 0}
                                max={dailyReport.summary?.totalRevenue || 1}
                              />
                            ))}
                          </div>
                          <div className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-4">
                            <p className="mb-3 text-[12px] font-semibold text-[#51607a]">İşlem Tipleri</p>
                            {['CASH_INVOICE', 'INVOICED_DISPATCH', 'ORDER', 'ORDER_DELIVERY'].map((key) => (
                              <ReportBar
                                key={key}
                                label={typeLabel(key)}
                                value={dailyReport.typeTotals?.[key]?.amount || 0}
                                count={dailyReport.typeTotals?.[key]?.count || 0}
                                max={dailyReport.summary?.totalRevenue || 1}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className={`${CARD} p-4`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-[15px] font-semibold text-[#14223b]">Uyarı Paneli</h3>
                            <p className="text-[11px] font-medium text-[#8b97ac] mt-0.5">Kasa, Mikro ve stok sayım riskleri.</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                              dailyReport.riskySessions?.length
                                ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
                                : 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]'
                            }`}
                          >
                            {dailyReport.riskySessions?.length || 0} risk
                          </span>
                        </div>
                        <div className="max-h-[310px] flex flex-col gap-2 overflow-y-auto pr-1">
                          {(dailyReport.riskySessions || []).length === 0 && (
                            <p className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] p-3 text-[12px] font-semibold text-[#047857]">
                              Bu filtrede kasa/Mikro/sayım riski görünmüyor.
                            </p>
                          )}
                          {(dailyReport.riskySessions || []).map((session: any) => (
                            <div key={session.id} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#7f1d1d] text-[12.5px]">
                                    {session.vehicleName || '-'} / {session.userName || '-'}
                                  </p>
                                  <p className="text-[11px] font-medium text-[#b91c1c] mt-0.5">
                                    Kasa farkı {formatCurrency(session.cashDifference || 0)} · Mikro risk {session.syncFailedCount || 0} · Sayım fark{' '}
                                    {session.stockDifferenceCount || 0}
                                  </p>
                                </div>
                                <span className="rounded-md bg-white px-2 py-1 text-[10.5px] font-semibold text-[#b91c1c]">{session.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Oturum Bazli Kasa Mutabakati tablosu */}
                    <div className={`${CARD} p-4`}>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[15px] font-semibold text-[#14223b]">Oturum Bazlı Kasa Mutabakatı</h3>
                          <p className="text-[11px] font-medium text-[#8b97ac] mt-0.5">
                            Her araç/personel için açılış, nakit satış, beklenen kasa, kapanış ve fark.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                          <span className="rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-3 py-1 text-[#047857]">
                            {dailyReport.summary?.closedSessionCount || 0} kapalı
                          </span>
                          <span className="rounded-full bg-[#fffbeb] border border-[#fde68a] px-3 py-1 text-[#b45309]">
                            {dailyReport.summary?.openSessionCount || 0} açık
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[1100px] w-full text-left text-[12px]">
                          <thead>
                            <tr className="border-b border-[#eef1f6] text-[10px] uppercase tracking-wide text-[#8b97ac]">
                              <th className="py-3 pr-3 font-semibold">Araç / Personel</th>
                              <th className="py-3 pr-3 font-semibold">Durum</th>
                              <th className="py-3 pr-3 font-semibold text-right">Açılış</th>
                              <th className="py-3 pr-3 font-semibold text-right">Nakit Satış</th>
                              <th className="py-3 pr-3 font-semibold text-right">Beklenen</th>
                              <th className="py-3 pr-3 font-semibold text-right">Kapanış</th>
                              <th className="py-3 pr-3 font-semibold text-right">Fark</th>
                              <th className="py-3 pr-3 font-semibold text-right">Ciro</th>
                              <th className="py-3 pr-3 font-semibold">Evrak</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dailyReport.sessions || []).map((session: any) => {
                              const diffRisk = Math.abs(n(session.cashDifference)) > 0.01;
                              return (
                                <tr key={session.id} className="border-b border-[#f1f4f9]">
                                  <td className="py-3 pr-3">
                                    <p className="font-semibold text-[#14223b]">
                                      {session.vehicleName || '-'} <span className="text-[10px] text-[#8b97ac]">{session.plate || ''}</span>
                                    </p>
                                    <p className="text-[10px] font-medium text-[#8b97ac]">
                                      {session.userName || '-'} / {fmtDateTime(session.startedAt)}
                                    </p>
                                  </td>
                                  <td className="py-3 pr-3">
                                    <span
                                      className={`rounded-full px-3 py-1 text-[10.5px] font-semibold border ${
                                        session.status === 'CLOSED'
                                          ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]'
                                          : 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]'
                                      }`}
                                    >
                                      {session.status}
                                    </span>
                                  </td>
                                  <td className="py-3 pr-3 text-right font-medium text-[#14223b]">{formatCurrency(session.openingCash || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-medium text-[#14223b]">{formatCurrency(session.cashSales || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-semibold text-[#14223b]">{formatCurrency(session.expectedCash || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-medium text-[#14223b]">
                                    {session.closingCash === null ? '-' : formatCurrency(session.closingCash || 0)}
                                  </td>
                                  <td className={`py-3 pr-3 text-right font-semibold ${diffRisk ? 'text-[#b91c1c]' : 'text-[#047857]'}`}>
                                    {session.cashDifference === null ? '-' : formatCurrency(session.cashDifference || 0)}
                                  </td>
                                  <td className="py-3 pr-3 text-right font-semibold text-[#14223b]">{formatCurrency(session.revenue || 0)}</td>
                                  <td className="py-3 pr-3 text-[10.5px] font-medium text-[#8b97ac]">
                                    <div>Yükleme: {session.loadDocumentNo || '-'}</div>
                                    <div>Dönüş: {session.returnDocumentNo || '-'}</div>
                                  </td>
                                </tr>
                              );
                            })}
                            {(dailyReport.sessions || []).length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-8 text-center text-[12px] font-medium text-[#8b97ac]">
                                  Bu filtrede oturum yok.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Islem Dokumu + En Cok Satan + Stok Hareket Ozeti */}
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4">
                      <div className={`${CARD} p-4`}>
                        <h3 className="mb-4 text-[15px] font-semibold text-[#14223b]">İşlem Dökümü</h3>
                        <div className="max-h-[560px] flex flex-col gap-2 overflow-y-auto pr-1">
                          {(dailyReport.transactions || []).map((row: any) => (
                            <div
                              key={row.id}
                              className={`rounded-lg border p-3 ${
                                row.status === 'SYNC_FAILED'
                                  ? 'border-[#fecaca] bg-[#fef2f2]'
                                  : row.status === 'CANCELLED'
                                  ? 'border-[#e7ebf2] bg-[#f1f4f9] opacity-70'
                                  : 'border-[#eef1f6] bg-[#fafbfd]'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#14223b] text-[12.5px]">{row.documentNo || row.linkedOrderNumber || row.id}</p>
                                  <p className="text-[10.5px] font-medium text-[#8b97ac]">
                                    {fmtDateTime(row.createdAt)} / {row.vehicleName || '-'} / {row.userName || '-'}
                                  </p>
                                  <p className="text-[10.5px] font-medium text-[#8b97ac]">{row.customerName || row.customerCode || '-'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[15px] font-semibold text-[#14223b]">{formatCurrency(row.totalAmount || 0)}</p>
                                  <p className="text-[10.5px] font-medium text-[#8b97ac]">
                                    {typeLabel(row.type)} / {paymentLabel(row.paymentType)}
                                  </p>
                                </div>
                              </div>
                              {row.syncError && (
                                <p className="mt-2 rounded-md bg-[#fee2e2] px-3 py-2 text-[10.5px] font-semibold text-[#b91c1c]">{row.syncError}</p>
                              )}
                            </div>
                          ))}
                          {(dailyReport.transactions || []).length === 0 && (
                            <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-4 text-[12px] font-medium text-[#8b97ac]">İşlem yok.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className={`${CARD} p-4`}>
                          <h3 className="mb-3 text-[15px] font-semibold text-[#14223b]">En Çok Satan Ürünler</h3>
                          <div className="max-h-[300px] flex flex-col gap-2 overflow-y-auto pr-1">
                            {(dailyReport.topProducts || []).slice(0, 12).map((row: any, index: number) => (
                              <div key={row.productCode} className="flex items-center justify-between gap-3 rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-3">
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-semibold text-[#14223b]">
                                    {index + 1}. {row.productName}
                                  </p>
                                  <p className="text-[10px] font-medium text-[#8b97ac] font-mono">
                                    {row.productCode} / {fmtQty(row.quantity)} {row.unit || ''}
                                  </p>
                                </div>
                                <p className="shrink-0 font-semibold text-[#047857] text-[12.5px]">{formatCurrency(row.revenue || 0)}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className={`${CARD} p-4`}>
                          <h3 className="mb-3 text-[15px] font-semibold text-[#14223b]">Stok Hareket Özeti</h3>
                          <div className="flex flex-col gap-2">
                            {Object.entries(dailyReport.stockSummary || {}).map(([key, value]: any) => (
                              <div key={key} className="flex items-center justify-between rounded-lg border border-[#eef1f6] bg-[#fafbfd] px-3 py-2 text-[12px]">
                                <span className="font-semibold text-[#14223b]">{movementLabel(key)}</span>
                                <span className="font-semibold text-[#51607a]">
                                  {fmtQty(value.quantity)} / {value.count} satır
                                </span>
                              </div>
                            ))}
                            {Object.keys(dailyReport.stockSummary || {}).length === 0 && (
                              <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-3 text-[12px] font-medium text-[#8b97ac]">Stok hareketi yok.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== YONETIM ===== */}
            {activeTab === 'manage' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* Arac Tanimla */}
                <div className={`${CARD} p-4`}>
                  <h2 className="mb-3 text-[13.5px] font-semibold text-[#14223b]">Araç Tanımla</h2>
                  <div className="flex flex-col gap-2.5">
                    <input
                      placeholder="Araç adı"
                      value={vehicleForm.name}
                      onChange={(e) => setVehicleForm((p) => ({ ...p, name: e.target.value }))}
                      className={INPUT}
                    />
                    <input
                      placeholder="Plaka"
                      value={vehicleForm.plate}
                      onChange={(e) => setVehicleForm((p) => ({ ...p, plate: e.target.value }))}
                      className={INPUT}
                    />
                    <WarehouseField
                      value={vehicleForm.defaultSourceWarehouseNo}
                      onChange={(value: string) => setVehicleForm((p) => ({ ...p, defaultSourceWarehouseNo: value }))}
                      label="Varsayılan kaynak depo"
                    />
                    <input
                      placeholder="Not"
                      value={vehicleForm.note}
                      onChange={(e) => setVehicleForm((p) => ({ ...p, note: e.target.value }))}
                      className={INPUT}
                    />
                    <button type="button" onClick={saveVehicle} className={BTN_PRIMARY}>
                      Aracı Kaydet
                    </button>
                  </div>
                </div>

                {/* Mikro-B2B Mutabakat */}
                <div className={`${CARD} p-4`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[13.5px] font-semibold text-[#14223b]">Mikro-B2B Mutabakat</h2>
                      <p className="text-[11px] font-medium text-[#8b97ac] mt-0.5">Eksik Mikro evrağı, sync hatası ve B2B dışı SICAK evraklar.</p>
                    </div>
                    <button
                      type="button"
                      onClick={refreshReconciliation}
                      disabled={reconciliationLoading}
                      className="inline-flex items-center justify-center gap-2 bg-white text-[#15356b] border border-[#d8e0ec] rounded-lg px-3.5 py-2 text-[12px] font-semibold cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50"
                    >
                      <RefreshCcw width={14} height={14} stroke="currentColor" strokeWidth={2} /> Yenile
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-3 text-[12px] font-semibold text-[#14223b]">
                      Problemli yerel işlem: {reconciliation?.localProblems?.length || 0} / B2B dışı Mikro evrağı:{' '}
                      {reconciliation?.orphanMikroDocs?.length || 0}
                    </div>
                    <div className="max-h-[360px] flex flex-col gap-2 overflow-y-auto pr-1">
                      {(reconciliation?.localProblems || []).map((row: any) => (
                        <div key={row.id} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[#7f1d1d] text-[12.5px]">{row.documentNo || row.linkedOrderNumber || row.type}</p>
                              <p className="text-[11px] font-medium text-[#b91c1c]">{row.customerName || row.customerCode || '-'} / {row.vehicleName || '-'}</p>
                              <p className="mt-1 text-[11px] text-[#b91c1c]">
                                {row.syncError ||
                                  (row.missingDocs?.length ? `Mikroda bulunamayan: ${row.missingDocs.join(', ')}` : 'Kontrol gerekli')}
                              </p>
                            </div>
                            {row.canCancelLocal && (
                              <button
                                type="button"
                                onClick={() => cancelLocalTransaction(row.id)}
                                disabled={submitting}
                                className="rounded-md bg-[#dc2626] px-3 py-2 text-[11px] font-semibold text-white cursor-pointer hover:bg-[#b91c1c] disabled:opacity-50"
                              >
                                Yerel İptal
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {(reconciliation?.orphanMikroDocs || []).slice(0, 10).map((row: any) => (
                        <div key={row.documentNo} className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
                          <p className="font-semibold text-[#92500a] text-[12.5px]">
                            {row.documentNo} / {row.documentKind}
                          </p>
                          <p className="text-[11px] font-medium text-[#b45309]">
                            {fmtDate(row.documentDate)} / {fmtQty(row.totalQty)} adet / {formatCurrency(row.totalAmount || 0)}
                          </p>
                        </div>
                      ))}
                      {!reconciliation?.localProblems?.length && !reconciliation?.orphanMikroDocs?.length && (
                        <p className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] p-3 text-[12px] font-medium text-[#047857]">
                          Görünen mutabakat problemi yok.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Son Islemler */}
                <div className={`${CARD} p-4`}>
                  <h2 className="mb-3 text-[13.5px] font-semibold text-[#14223b]">Son İşlemler</h2>
                  <div className="max-h-[520px] flex flex-col gap-2 overflow-y-auto">
                    {(dashboard?.recentTransactions || []).map((row: any) => (
                      <div key={row.id} className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-[#14223b] text-[12.5px]">{row.mikroDocumentNo || row.linkedOrderNumber || row.type}</p>
                          <p className="font-semibold text-[#047857] text-[12.5px]">{formatCurrency(row.totalAmount || 0)}</p>
                        </div>
                        <p className="text-[11px] text-[#8b97ac]">
                          {row.customerName || row.customerCode || '-'} / {row.session?.vehicle?.name || '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================= Alt bilesenler (yeni gorunum) ============================= */

function HeaderMetric({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] text-[#7d93bd]">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent ? 'text-[#34d399]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function ReportMetric({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone: 'dark' | 'green' | 'amber' | 'red' }) {
  const tones: Record<string, string> = {
    dark: 'bg-[#0c2247] text-white',
    green: 'bg-[#047857] text-white',
    amber: 'bg-[#fbbf24] text-[#0c2247]',
    red: 'bg-[#dc2626] text-white',
  };
  return (
    <div className={`rounded-xl p-4 ${tones[tone]}`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-[10.5px] font-medium opacity-75">{sub}</p>}
    </div>
  );
}

function ReportBar({ label, value, max, count }: { label: string; value: number; max: number; count?: number }) {
  const pct = Math.max(4, Math.min(100, max > 0 ? (n(value) / max) * 100 : 0));
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-[#14223b]">
        <span>
          {label}
          {count !== undefined ? ` (${count})` : ''}
        </span>
        <span>{formatCurrency(value || 0)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white border border-[#eef1f6]">
        <div className="h-full rounded-full bg-[#15356b]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProductImage({ src, large }: { src?: string | null; large?: boolean }) {
  return (
    <div
      className={`${large ? 'h-14 w-14' : 'h-10 w-10'} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f4f6fa] border border-[#eef1f6]`}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Truck width={18} height={18} stroke="#c3cfe0" strokeWidth={2} />}
    </div>
  );
}

function WarehouseField({ value, onChange, label = 'Kaynak depo' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-[#8b97ac]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white cursor-pointer"
      >
        {WAREHOUSE_OPTIONS.map((warehouse) => (
          <option key={warehouse.value} value={warehouse.value}>
            {warehouse.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CustomerPicker({ value, onChange, customers, selectedCustomer, onSelect, onCreateRequest }: any) {
  return (
    <div className="relative mb-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[12px] font-semibold text-[#14223b]">Cari</label>
        <button
          type="button"
          onClick={onCreateRequest}
          className="inline-flex items-center gap-1 rounded-md border border-[#c3cfe0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#f6f8fc]"
        >
          <Plus width={12} height={12} stroke="currentColor" strokeWidth={2.2} /> Yeni SICAK Cari
        </button>
      </div>
      <div className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-3">
        <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cari kodu veya unvan ara"
          className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
        />
      </div>
      {selectedCustomer && (
        <p className="mt-1 text-[11px] font-semibold text-[#047857]">
          Seçili: {selectedCustomer.displayName || selectedCustomer.mikroName || selectedCustomer.name}
        </p>
      )}
      {customers.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-[#e7ebf2] bg-white p-1.5 shadow-xl">
          {customers.map((customer: any) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelect(customer)}
              className="block w-full rounded-md p-2.5 text-left hover:bg-[#f6f8fc] cursor-pointer"
            >
              <p className="font-semibold text-[#14223b] text-[12.5px]">{customer.displayName || customer.mikroName || customer.name}</p>
              <p className="text-[10.5px] text-[#8b97ac] font-mono">
                {customer.mikroCariCode} / {customer.city || '-'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCustomerPanel({
  form,
  onChange,
  onSubmit,
  submitting,
}: {
  form: NewCustomerForm;
  onChange: (patch: Partial<NewCustomerForm>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const field =
    'h-9 w-full border border-[#fcd34d] rounded-lg px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#b45309] bg-white';
  return (
    <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-[#92500a]">Yeni SICAK Cari Aç</h3>
        <p className="text-[11px] font-medium text-[#b45309]">
          Zorunlu: unvan, cep telefonu, vergi dairesi, vergi no. Ödeme planı Peşin, sektör/grup SICAK olarak açılır.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <input className={field} placeholder="Cari unvanı *" value={form.customerName} onChange={(e) => onChange({ customerName: e.target.value })} />
        <input className={field} placeholder="Cep telefonu *" value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        <input className={field} placeholder="Vergi dairesi *" value={form.taxOffice} onChange={(e) => onChange({ taxOffice: e.target.value })} />
        <input className={field} placeholder="Vergi no *" value={form.taxNumber} onChange={(e) => onChange({ taxNumber: e.target.value })} />
        <input className={field} placeholder="E-posta" value={form.email} onChange={(e) => onChange({ email: e.target.value })} />
        <input className={field} placeholder="İl" value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        <input className={field} placeholder="İlçe" value={form.district} onChange={(e) => onChange({ district: e.target.value })} />
        <input className={field} placeholder="Adres" value={form.address} onChange={(e) => onChange({ address: e.target.value })} />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0c2247] text-white border-none px-4 py-2.5 text-[12.5px] font-semibold cursor-pointer hover:bg-[#15356b] disabled:opacity-50"
      >
        Cariyi Aç ve Seç
      </button>
    </div>
  );
}

function ProductSearch({ value, onChange, products, onAdd, actionLabel }: any) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-[#14223b]">Ürün Ara</label>
      <div className="flex items-center gap-2 h-10 border border-[#e3e8f0] rounded-lg px-3">
        <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border-none bg-transparent outline-none text-[13px] text-[#14223b]"
          placeholder="Kod, isim veya barkod; boşken araç stoğu listelenir"
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {products.length === 0 && (
          <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-4 text-[12px] font-medium text-[#8b97ac] md:col-span-2 2xl:col-span-3">
            Ürün bulunamadı veya araç stoğu boş.
          </p>
        )}
        {products.map((product: any) => {
          const vehicleStock = n(product.vehicleStock);
          const noStock = n(product.totalVisibleStock) <= 0;
          const missingCost = n(product.currentCost) <= 0;
          const cardClass = vehicleStock > 0 ? 'border-[#a7f3d0] bg-[#ecfdf5]' : noStock ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#eef1f6] bg-white';
          return (
            <div key={product.productCode} className={`overflow-hidden rounded-xl border ${cardClass}`}>
              <div className="flex gap-3 p-3">
                <ProductImage src={product.imageUrl} large />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12px] font-medium text-[#14223b]">{product.productName}</p>
                  <p className="text-[10px] text-[#8b97ac] font-mono">{product.productCode}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold">
                    <span className={`rounded-full px-2 py-0.5 border ${vehicleStock > 0 ? 'bg-[#047857] border-[#047857] text-white' : 'bg-white border-[#eef1f6] text-[#51607a]'}`}>
                      Araç {fmtQty(product.vehicleStock)}
                    </span>
                    <span className="rounded-full bg-white border border-[#eef1f6] px-2 py-0.5 text-[#2563eb]">Sıcak Depo {fmtQty(product.hotWarehouseStock)}</span>
                    <span className="rounded-full bg-white border border-[#eef1f6] px-2 py-0.5 text-[#51607a]">Merkez {fmtQty(product.stockMerkez)}</span>
                    <span className="rounded-full bg-white border border-[#eef1f6] px-2 py-0.5 text-[#51607a]">Topca {fmtQty(product.stockTopca)}</span>
                    {noStock && <span className="rounded-full bg-[#dc2626] px-2 py-0.5 text-white">Stok Yok</span>}
                    {missingCost && <span className="rounded-full bg-[#ea580c] px-2 py-0.5 text-white">Maliyet Yok</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-[#eef1f6] p-3 text-[11px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((listNo) => (
                  <button
                    key={listNo}
                    type="button"
                    onClick={() => onAdd(product, listNo)}
                    className="rounded-md bg-white border border-[#eef1f6] px-2 py-1.5 text-left font-semibold text-[#14223b] cursor-pointer hover:bg-[#15356b] hover:text-white hover:border-[#15356b]"
                  >
                    {priceLabel(listNo)}: {formatCurrency(product.priceLists?.[listNo] || 0)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onAdd(product)}
                className="flex h-10 w-full items-center justify-center gap-2 bg-[#0c2247] text-[12.5px] font-semibold text-white cursor-pointer hover:bg-[#15356b]"
              >
                <Plus width={14} height={14} stroke="currentColor" strokeWidth={2.2} /> {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CartPanel({
  title,
  cart,
  total,
  totalLabel = 'Toplam',
  onUpdate,
  onRemove,
  onSubmit,
  submitLabel,
  disabled,
  hidePrice,
  saleType,
  mode = 'sale',
  sourceWarehouseNo,
}: any) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[#14223b]">{title}</h2>
        <span className="rounded-full bg-[#fffbeb] border border-[#fde68a] px-3 py-1 text-[12px] font-semibold text-[#b45309]">{cart.length} kalem</span>
      </div>
      <div className="max-h-[560px] flex flex-col gap-3 overflow-y-auto pr-1">
        {cart.length === 0 && <p className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-4 text-[12px] text-[#8b97ac]">Liste boş.</p>}
        {cart.map((item: CartItem) => {
          const available = itemAvailableFor(item, mode, saleType, sourceWarehouseNo);
          const stockInvalid = Number.isFinite(available) && n(item.quantity) > available + 0.0001;
          const missingCost = !hidePrice && costMissing(item);
          return (
            <div
              key={item.productCode}
              className={`rounded-lg border p-3 ${stockInvalid || missingCost ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#eef1f6] bg-[#fafbfd]'}`}
            >
              <div className="flex gap-3">
                <ProductImage src={item.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12px] font-medium text-[#14223b]">{item.productName}</p>
                  <p className="text-[10px] text-[#8b97ac] font-mono">{item.productCode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.productCode)}
                  className="h-8 w-8 rounded-full bg-white border border-[#eef1f6] text-[#8b97ac] cursor-pointer hover:bg-[#f1f4f9]"
                >
                  <X width={14} height={14} stroke="currentColor" strokeWidth={2} className="mx-auto" />
                </button>
              </div>
              <div className={`mt-3 grid gap-2 ${hidePrice ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <input
                  value={item.quantity}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => onUpdate(item.productCode, { quantity: Number(e.target.value.replace(',', '.')) || 0 })}
                  className="h-9 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[12px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                />
                {!hidePrice && (
                  <select
                    value={item.priceListNo}
                    onChange={(e) => {
                      const listNo = Number(e.target.value);
                      onUpdate(item.productCode, { priceListNo: listNo, unitPrice: n(item.priceLists?.[listNo]) || item.unitPrice });
                    }}
                    className="h-9 rounded-lg border border-[#d8e0ec] bg-white px-2.5 text-[11px] font-semibold text-[#14223b] outline-none focus:border-[#15356b] cursor-pointer"
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                      <option key={listNo} value={listNo}>
                        {priceLabel(listNo)}
                      </option>
                    ))}
                  </select>
                )}
                {!hidePrice && (
                  <input
                    value={item.unitPrice}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => onUpdate(item.productCode, { unitPrice: Number(e.target.value.replace(',', '.')) || 0 })}
                    className="h-9 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[12px] font-semibold text-[#14223b] outline-none focus:border-[#15356b]"
                  />
                )}
              </div>
              {stockInvalid && (
                <p className="mt-2 flex items-center gap-2 rounded-md bg-[#fee2e2] px-3 py-2 text-[10.5px] font-semibold text-[#b91c1c]">
                  <AlertTriangle width={14} height={14} stroke="currentColor" strokeWidth={2} /> Stok yetersiz. Mevcut: {fmtQty(available)} / Girilen:{' '}
                  {fmtQty(item.quantity)}
                </p>
              )}
              {missingCost && (
                <p className="mt-2 flex items-center gap-2 rounded-md bg-[#ffedd5] px-3 py-2 text-[10.5px] font-semibold text-[#9a3412]">
                  <AlertTriangle width={14} height={14} stroke="currentColor" strokeWidth={2} /> Güncel maliyet yok. Bu ürün satışa kaydedilemez.
                </p>
              )}
              {!hidePrice && minAllowedPrice(item, saleType) > 0 && (
                <p
                  className={`mt-2 rounded-md px-3 py-2 text-[10.5px] font-semibold ${
                    n(item.unitPrice) + 0.0001 >= minAllowedPrice(item, saleType) ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fee2e2] text-[#b91c1c]'
                  }`}
                >
                  Alt limit: {formatCurrency(minAllowedPrice(item, saleType))} / Güncel maliyet: {formatCurrency(n(item.currentCost))}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg bg-[#0c2247] p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12.5px] text-white/70">{totalLabel}</span>
          <span className="text-xl font-semibold">{hidePrice ? fmtQty(total) : formatCurrency(total)}</span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#fbbf24] text-[#0c2247] border-none px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#f59e0b] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
