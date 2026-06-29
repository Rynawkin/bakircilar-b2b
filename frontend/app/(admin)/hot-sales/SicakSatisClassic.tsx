'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Search, Truck, ShoppingCart, PackagePlus, ClipboardCheck, Settings, Plus, X, BarChart3, Banknote, FileDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
 * Klasik gorunum Sicak Satis ekrani. Mevcut TUM mantik useSicakSatis'tan gelir; JSX BIRE BIR korunmustur.
 * Eski page.tsx'in `return (...)` JSX'i ve alt bilesenleri hicbir degisiklik olmadan tasinmistir.
 */
export default function SicakSatisClassic() {
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
    return <div className="p-6 text-sm text-slate-500">Sicak satis yukleniyor...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f6f1e8] p-3 text-slate-950 md:p-5">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <header className="overflow-hidden rounded-[2rem] bg-[#18231d] text-white shadow-2xl">
          <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-100">
                <Truck className="h-4 w-4" /> Depo 11 Sicak Depo
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">Sicak Satis Operasyon Paneli</h1>
              <p className="mt-2 max-w-3xl text-sm text-amber-50/80 md:text-base">
                Arac yukleme, faturasiz anlik satis faturasi, faturali irsaliye, siparis ve gun sonu sayimi tek ekranda.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
              <Metric title="Aktif Arac" value={dashboard?.openSessions?.length || 0} />
              <Metric title="Arac" value={vehicles.length} />
              <Metric title="Son Islem" value={dashboard?.recentTransactions?.length || 0} />
              <Metric title="Aktif Seri" value="SICAK" />
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
              <h2 className="mb-3 text-lg font-black">Oturum</h2>
              {activeSession ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-xs font-bold text-emerald-700">ACIK OTURUM</p>
                    <p className="text-lg font-black">{activeSession.vehicle?.name}</p>
                    <p className="text-sm text-emerald-900">{activeSession.vehicle?.plate} / Kaynak depo {warehouseLabel(activeSession.sourceWarehouseNo)}</p>
                  </div>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
                  >
                    {(dashboard?.openSessions || []).map((session: any) => (
                      <option key={session.id} value={session.id}>
                        {session.vehicle?.name} - {session.user?.displayName || session.user?.name || session.user?.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={sessionForm.vehicleId}
                    onChange={(e) => setSessionForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
                  >
                    <option value="">Arac sec</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>{vehicle.name} - {vehicle.plate}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <WarehouseSelect value={sessionForm.sourceWarehouseNo} onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))} />
                    <Input placeholder="Baslangic nakit" value={sessionForm.openingCash} onChange={(e) => setSessionForm((p) => ({ ...p, openingCash: e.target.value }))} />
                  </div>
                  <Button onClick={startSession} disabled={submitting} className="w-full rounded-2xl">
                    Oturumu Ac
                  </Button>
                </div>
              )}
            </Card>

            <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
              <h2 className="mb-3 text-lg font-black">Arac Stogu</h2>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {inventory.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Arac stogu yok.</p>}
                {inventory.map((row: any) => (
                  <div key={row.productCode} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    <ProductImage src={row.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{row.productName}</p>
                      <p className="text-xs text-slate-500">{row.productCode}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right text-sm font-black text-emerald-700">
                      {fmtQty(row.quantity)} {row.unit}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <main className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-[2rem] bg-white p-2 shadow-xl md:grid-cols-3 xl:grid-cols-6">
              <TabButton active={activeTab === 'sale'} icon={<ShoppingCart className="h-4 w-4" />} label="Satis" onClick={() => setActiveTab('sale')} />
              <TabButton active={activeTab === 'load'} icon={<PackagePlus className="h-4 w-4" />} label="Yukleme" onClick={() => setActiveTab('load')} />
              <TabButton active={activeTab === 'orders'} icon={<ClipboardCheck className="h-4 w-4" />} label="Siparis Teslim" onClick={() => setActiveTab('orders')} />
              <TabButton active={activeTab === 'close'} icon={<ClipboardCheck className="h-4 w-4" />} label="Gun Sonu" onClick={() => setActiveTab('close')} />
              <TabButton active={activeTab === 'report'} icon={<BarChart3 className="h-4 w-4" />} label="Rapor" onClick={() => setActiveTab('report')} />
              <TabButton active={activeTab === 'manage'} icon={<Settings className="h-4 w-4" />} label="Yonetim" onClick={() => setActiveTab('manage')} />
            </div>

            {activeTab === 'sale' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <div className="mb-4 grid gap-3 lg:grid-cols-3">
                    <select value={saleType} onChange={(e) => setSaleType(e.target.value as SaleType)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      <option value="CASH_INVOICE">Faturasiz Anlik Satis</option>
                      <option value="INVOICED_DISPATCH">Faturali Irsaliye</option>
                      <option value="ORDER">Aracta Yoksa Siparis</option>
                    </select>
                    <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      <option value="CASH">Nakit</option>
                      <option value="CARD">Kart</option>
                      <option value="TRANSFER">Havale</option>
                      <option value="OPEN_ACCOUNT">Acik Hesap</option>
                    </select>
                    <select value={priceListNo} onChange={(e) => setPriceListNo(Number(e.target.value))} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                        <option key={listNo} value={listNo}>{priceLabel(listNo)}</option>
                      ))}
                    </select>
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
                </Card>

                <CartPanel
                  title="Satis Sepeti"
                  cart={cart}
                  total={saleTotal}
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('sale', code, patch)}
                  onRemove={(code: string) => removeCart('sale', code)}
                  onSubmit={submitSale}
                  submitLabel={saleType === 'ORDER' ? 'Siparis Olustur' : saleType === 'INVOICED_DISPATCH' ? 'Irsaliye Kes' : 'Satis Faturasi Kes'}
                  disabled={submitting || !activeSession || priceViolations.length > 0 || saleStockViolations.length > 0}
                  saleType={saleType}
                  mode="sale"
                />
              </section>
            )}

            {activeTab === 'load' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <WarehouseSelect value={sessionForm.sourceWarehouseNo} onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))} />
                    <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">Hedef: Sicak Depo (11)</div>
                  </div>
                  <ProductSearch value={productSearch} onChange={setProductSearch} products={products} actionLabel="Yuklemeye Ekle" onAdd={(product: any) => addToCart(product, 'load')} />
                </Card>
                <CartPanel
                  title="Yukleme Listesi"
                  cart={loadCart}
                  total={loadTotalQty}
                  totalLabel="Toplam miktar"
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('load', code, patch)}
                  onRemove={(code: string) => removeCart('load', code)}
                  onSubmit={activeSession ? addLoad : startSession}
                  submitLabel={activeSession ? 'Araca Yukle' : 'Yukleyerek Oturum Ac'}
                  disabled={submitting || loadStockViolations.length > 0}
                  hidePrice
                  mode="load"
                  sourceWarehouseNo={sessionForm.sourceWarehouseNo}
                />
              </section>
            )}

            {activeTab === 'orders' && (
              <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <label className="mb-1 block text-sm font-black">Acik SICAK Siparis Ara</label>
                    <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Siparis no, cari veya urun" />
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
                <div className="grid gap-4 xl:grid-cols-2">
                  {openOrders.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-sm font-bold text-slate-500">Teslim edilecek acik SICAK siparis bulunamadi.</p>}
                  {openOrders.map((order: any) => (
                    <article key={order.orderNumber} className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-50 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Siparisten Irsaliye</p>
                          <h3 className="text-2xl font-black">{order.orderNumber}</h3>
                          <p className="text-sm text-white/70">{fmtDate(order.orderDate)} / {order.customerName || order.customerCode}</p>
                        </div>
                        <div className="rounded-2xl bg-white/10 px-4 py-2 text-right">
                          <p className="text-xs text-white/60">Kalan tutar</p>
                          <p className="font-black">{formatCurrency(order.totalAmount || 0)}</p>
                        </div>
                      </div>
                      <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                        {order.items.map((item: any) => {
                          const enough = n(item.vehicleStock) + 0.0001 >= n(item.remainingQty);
                          const key = `${order.orderNumber}:${item.orderGuid || item.rowNumber}`;
                          const deliverQty = deliveryQuantities[key] ?? '0';
                          const deliverNumber = Number(String(deliverQty).replace(',', '.')) || 0;
                          const invalidQty = deliverNumber > n(item.remainingQty) + 0.0001 || deliverNumber > n(item.vehicleStock) + 0.0001;
                          return (
                            <div key={`${order.orderNumber}-${item.rowNumber}`} className={`flex gap-3 rounded-2xl bg-white p-3 ${invalidQty ? 'ring-2 ring-red-300' : ''}`}>
                              <ProductImage src={item.imageUrl} large />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-black">{item.productName}</p>
                                <p className="text-xs text-slate-500">{item.productCode}</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Kalan {fmtQty(item.remainingQty)} {item.unit}</span>
                                  <span className={`rounded-full px-2 py-1 ${enough ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    Arac {fmtQty(item.vehicleStock)}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{formatCurrency(item.unitPrice || 0)}</span>
                                </div>
                              </div>
                              <div className="w-28 shrink-0">
                                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Kesilecek</label>
                                <input
                                  value={deliverQty}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setDeliveryQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                                  className={`h-11 w-full rounded-2xl border bg-slate-50 px-3 text-sm font-black outline-none ${invalidQty ? 'border-red-400 text-red-700' : 'border-slate-200'}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-slate-100 p-3">
                        <Button onClick={() => deliverOrder(order)} disabled={!activeSession || submitting} className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500">
                          Girilen Miktarlari Irsaliye Kes
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </Card>
            )}

            {activeTab === 'close' && (
              <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">Gun Sonu Sayimi</h2>
                    <p className="text-sm text-slate-500">Tum arac stogu sayilmadan oturum kapatilmaz.</p>
                  </div>
                  <Button onClick={closeSession} disabled={!activeSession || submitting} className="rounded-2xl">Gun Sonunu Kapat</Button>
                </div>
                <div className="grid gap-3">
                  {inventory.map((row: any) => {
                    const count = closingCounts[row.productCode] || { countedQty: '', action: 'KEEP_ON_VEHICLE', note: '' };
                    const diff = Number(String(count.countedQty || '0').replace(',', '.')) - n(row.quantity);
                    return (
                      <div key={row.productCode} className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[80px_minmax(0,1fr)_120px_170px_100px]">
                        <ProductImage src={row.imageUrl} large />
                        <div className="min-w-0">
                          <p className="font-black">{row.productName}</p>
                          <p className="text-xs text-slate-500">{row.productCode} / Beklenen {fmtQty(row.quantity)} {row.unit}</p>
                        </div>
                        <Input value={count.countedQty} onChange={(e) => setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, countedQty: e.target.value } }))} />
                        <select value={count.action} onChange={(e) => setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, action: e.target.value as any } }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold">
                          <option value="KEEP_ON_VEHICLE">Aracta Birak</option>
                          <option value="RETURN_TO_DEPOT">Depoya Indir</option>
                        </select>
                        <div className={`rounded-2xl px-3 py-2 text-center text-sm font-black ${Math.abs(diff) > 0.001 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          Fark {fmtQty(diff)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {activeTab === 'report' && (
              <section className="space-y-4">
                <Card className="overflow-hidden rounded-[2rem] border-0 bg-slate-950 p-0 text-white shadow-xl">
                  <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-950">
                        <Banknote className="h-4 w-4" /> Kasa ve Ciro Raporu
                      </div>
                      <h2 className="text-3xl font-black tracking-tight">Gunluk Sicak Satis Mutabakati</h2>
                      <p className="mt-1 max-w-3xl text-sm font-medium text-white/65">
                        Acilis nakiti, nakit/kart/havale/acik hesap kirilimi, kapanis farki, arac oturumlari, Mikro riski ve stok sayim farklari tek raporda.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:w-[560px]">
                      <Input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
                      <Input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
                      <select value={reportFilters.vehicleId} onChange={(e) => setReportFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="h-11 rounded-2xl border border-white/10 bg-white px-3 text-sm font-black text-slate-950">
                        <option value="">Tum araclar</option>
                        {(dailyReport?.options?.vehicles || vehicles).map((vehicle: any) => (
                          <option key={vehicle.id} value={vehicle.id}>{vehicle.name} - {vehicle.plate}</option>
                        ))}
                      </select>
                      <select value={reportFilters.userId} onChange={(e) => setReportFilters((prev) => ({ ...prev, userId: e.target.value }))} className="h-11 rounded-2xl border border-white/10 bg-white px-3 text-sm font-black text-slate-950">
                        <option value="">Tum personeller</option>
                        {(dailyReport?.options?.users || []).map((operator: any) => (
                          <option key={operator.id} value={operator.id}>{operator.name || operator.email}</option>
                        ))}
                      </select>
                      <Button onClick={refreshDailyReport} disabled={reportLoading} className="rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
                        <RefreshCcw className="mr-2 h-4 w-4" /> Raporu Getir
                      </Button>
                      <Button onClick={exportDailyReportCsv} disabled={!dailyReport} className="rounded-2xl bg-white text-slate-950 hover:bg-amber-50">
                        <FileDown className="mr-2 h-4 w-4" /> Excel CSV
                      </Button>
                    </div>
                  </div>
                </Card>

                {reportLoading && !dailyReport ? (
                  <Card className="rounded-[2rem] border-0 bg-white p-6 text-sm font-bold text-slate-500 shadow-xl">Rapor hazirlaniyor...</Card>
                ) : !dailyReport ? (
                  <Card className="rounded-[2rem] border-0 bg-white p-6 text-sm font-bold text-slate-500 shadow-xl">Filtreleri secip raporu getirin.</Card>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <ReportMetric title="Toplam Ciro" value={formatCurrency(dailyReport.summary?.totalRevenue || 0)} tone="dark" sub={`${dailyReport.summary?.completedTransactionCount || 0} aktif islem`} />
                      <ReportMetric title="Nakit Satis" value={formatCurrency(dailyReport.summary?.cashSales || 0)} tone="green" sub={`Acilis: ${formatCurrency(dailyReport.summary?.openingCash || 0)}`} />
                      <ReportMetric title="Beklenen Kasa" value={formatCurrency(dailyReport.summary?.expectedCash || 0)} tone="amber" sub={`Kapanis: ${formatCurrency(dailyReport.summary?.closingCash || 0)}`} />
                      <ReportMetric
                        title="Kasa Farki"
                        value={formatCurrency(dailyReport.summary?.cashDifference || 0)}
                        tone={Math.abs(n(dailyReport.summary?.cashDifference)) > 0.01 ? 'red' : 'green'}
                        sub={`${dailyReport.summary?.riskySessionCount || 0} riskli oturum`}
                      />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                      <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-black">Odeme ve Islem Kirilimi</h3>
                            <p className="text-xs font-bold text-slate-500">Iptal islemler cirodan ayrilir, sync failed ayrica risk olarak isaretlenir.</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {fmtDate(dailyReport.filters?.startDate)} - {fmtDate(dailyReport.filters?.endDate)}
                          </span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-3xl bg-slate-50 p-4">
                            <p className="mb-3 text-sm font-black text-slate-500">Odeme Tipleri</p>
                            {['CASH', 'CARD', 'TRANSFER', 'OPEN_ACCOUNT', 'MIXED'].map((key) => (
                              <ReportBar key={key} label={paymentLabel(key)} value={dailyReport.paymentTotals?.[key] || 0} max={dailyReport.summary?.totalRevenue || 1} />
                            ))}
                          </div>
                          <div className="rounded-3xl bg-slate-50 p-4">
                            <p className="mb-3 text-sm font-black text-slate-500">Islem Tipleri</p>
                            {['CASH_INVOICE', 'INVOICED_DISPATCH', 'ORDER', 'ORDER_DELIVERY'].map((key) => (
                              <ReportBar key={key} label={typeLabel(key)} value={dailyReport.typeTotals?.[key]?.amount || 0} count={dailyReport.typeTotals?.[key]?.count || 0} max={dailyReport.summary?.totalRevenue || 1} />
                            ))}
                          </div>
                        </div>
                      </Card>

                      <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-black">Uyari Paneli</h3>
                            <p className="text-xs font-bold text-slate-500">Kasa, Mikro ve stok sayim riskleri.</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${dailyReport.riskySessions?.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {dailyReport.riskySessions?.length || 0} risk
                          </span>
                        </div>
                        <div className="max-h-[310px] space-y-2 overflow-y-auto pr-1">
                          {(dailyReport.riskySessions || []).length === 0 && (
                            <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">Bu filtrede kasa/Mikro/sayim riski gorunmuyor.</p>
                          )}
                          {(dailyReport.riskySessions || []).map((session: any) => (
                            <div key={session.id} className="rounded-2xl border border-red-100 bg-red-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-black text-red-950">{session.vehicleName || '-'} / {session.userName || '-'}</p>
                                  <p className="text-xs font-bold text-red-700">
                                    Kasa farki {formatCurrency(session.cashDifference || 0)} · Mikro risk {session.syncFailedCount || 0} · Sayim fark {session.stockDifferenceCount || 0}
                                  </p>
                                </div>
                                <span className="rounded-xl bg-white px-2 py-1 text-xs font-black text-red-700">{session.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>

                    <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black">Oturum Bazli Kasa Mutabakati</h3>
                          <p className="text-xs font-bold text-slate-500">Her arac/personel icin acilis, nakit satis, beklenen kasa, kapanis ve fark.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-black">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{dailyReport.summary?.closedSessionCount || 0} kapali</span>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{dailyReport.summary?.openSessionCount || 0} acik</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[1100px] w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">
                              <th className="py-3 pr-3">Arac / Personel</th>
                              <th className="py-3 pr-3">Durum</th>
                              <th className="py-3 pr-3 text-right">Acilis</th>
                              <th className="py-3 pr-3 text-right">Nakit Satis</th>
                              <th className="py-3 pr-3 text-right">Beklenen</th>
                              <th className="py-3 pr-3 text-right">Kapanis</th>
                              <th className="py-3 pr-3 text-right">Fark</th>
                              <th className="py-3 pr-3 text-right">Ciro</th>
                              <th className="py-3 pr-3">Evrak</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dailyReport.sessions || []).map((session: any) => {
                              const diffRisk = Math.abs(n(session.cashDifference)) > 0.01;
                              return (
                                <tr key={session.id} className="border-b border-slate-50">
                                  <td className="py-3 pr-3">
                                    <p className="font-black">{session.vehicleName || '-'} <span className="text-xs text-slate-400">{session.plate || ''}</span></p>
                                    <p className="text-xs font-bold text-slate-500">{session.userName || '-'} / {fmtDateTime(session.startedAt)}</p>
                                  </td>
                                  <td className="py-3 pr-3">
                                    <span className={`rounded-full px-3 py-1 text-xs font-black ${session.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{session.status}</span>
                                  </td>
                                  <td className="py-3 pr-3 text-right font-bold">{formatCurrency(session.openingCash || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-bold">{formatCurrency(session.cashSales || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-black">{formatCurrency(session.expectedCash || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-bold">{session.closingCash === null ? '-' : formatCurrency(session.closingCash || 0)}</td>
                                  <td className={`py-3 pr-3 text-right font-black ${diffRisk ? 'text-red-700' : 'text-emerald-700'}`}>{session.cashDifference === null ? '-' : formatCurrency(session.cashDifference || 0)}</td>
                                  <td className="py-3 pr-3 text-right font-black">{formatCurrency(session.revenue || 0)}</td>
                                  <td className="py-3 pr-3 text-xs font-bold text-slate-500">
                                    <div>Yukleme: {session.loadDocumentNo || '-'}</div>
                                    <div>Donus: {session.returnDocumentNo || '-'}</div>
                                  </td>
                                </tr>
                              );
                            })}
                            {(dailyReport.sessions || []).length === 0 && (
                              <tr><td colSpan={9} className="py-8 text-center text-sm font-bold text-slate-400">Bu filtrede oturum yok.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                      <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                        <h3 className="mb-4 text-xl font-black">Islem Dokumu</h3>
                        <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                          {(dailyReport.transactions || []).map((row: any) => (
                            <div key={row.id} className={`rounded-3xl border p-3 ${row.status === 'SYNC_FAILED' ? 'border-red-100 bg-red-50' : row.status === 'CANCELLED' ? 'border-slate-200 bg-slate-100 opacity-70' : 'border-slate-100 bg-slate-50'}`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-black">{row.documentNo || row.linkedOrderNumber || row.id}</p>
                                  <p className="text-xs font-bold text-slate-500">{fmtDateTime(row.createdAt)} / {row.vehicleName || '-'} / {row.userName || '-'}</p>
                                  <p className="text-xs font-bold text-slate-500">{row.customerName || row.customerCode || '-'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-black">{formatCurrency(row.totalAmount || 0)}</p>
                                  <p className="text-xs font-bold text-slate-500">{typeLabel(row.type)} / {paymentLabel(row.paymentType)}</p>
                                </div>
                              </div>
                              {row.syncError && <p className="mt-2 rounded-2xl bg-red-100 px-3 py-2 text-xs font-black text-red-700">{row.syncError}</p>}
                            </div>
                          ))}
                          {(dailyReport.transactions || []).length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Islem yok.</p>}
                        </div>
                      </Card>

                      <div className="space-y-4">
                        <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                          <h3 className="mb-3 text-xl font-black">En Cok Satan Urunler</h3>
                          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                            {(dailyReport.topProducts || []).slice(0, 12).map((row: any, index: number) => (
                              <div key={row.productCode} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black">{index + 1}. {row.productName}</p>
                                  <p className="text-xs font-bold text-slate-500">{row.productCode} / {fmtQty(row.quantity)} {row.unit || ''}</p>
                                </div>
                                <p className="shrink-0 font-black text-emerald-700">{formatCurrency(row.revenue || 0)}</p>
                              </div>
                            ))}
                          </div>
                        </Card>

                        <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                          <h3 className="mb-3 text-xl font-black">Stok Hareket Ozeti</h3>
                          <div className="space-y-2">
                            {Object.entries(dailyReport.stockSummary || {}).map(([key, value]: any) => (
                              <div key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                                <span className="font-black">{movementLabel(key)}</span>
                                <span className="font-black text-slate-700">{fmtQty(value.quantity)} / {value.count} satir</span>
                              </div>
                            ))}
                            {Object.keys(dailyReport.stockSummary || {}).length === 0 && <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Stok hareketi yok.</p>}
                          </div>
                        </Card>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {activeTab === 'manage' && (
              <section className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <h2 className="mb-3 text-xl font-black">Arac Tanimla</h2>
                  <div className="grid gap-3">
                    <Input placeholder="Arac adi" value={vehicleForm.name} onChange={(e) => setVehicleForm((p) => ({ ...p, name: e.target.value }))} />
                    <Input placeholder="Plaka" value={vehicleForm.plate} onChange={(e) => setVehicleForm((p) => ({ ...p, plate: e.target.value }))} />
                    <WarehouseSelect value={vehicleForm.defaultSourceWarehouseNo} onChange={(value: string) => setVehicleForm((p) => ({ ...p, defaultSourceWarehouseNo: value }))} label="Varsayilan kaynak depo" />
                    <Input placeholder="Not" value={vehicleForm.note} onChange={(e) => setVehicleForm((p) => ({ ...p, note: e.target.value }))} />
                    <Button onClick={saveVehicle} className="rounded-2xl">Araci Kaydet</Button>
                  </div>
                </Card>
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black">Mikro-B2B Mutabakat</h2>
                      <p className="text-xs font-bold text-slate-500">Eksik Mikro evragi, sync hatasi ve B2B disi SICAK evraklar.</p>
                    </div>
                    <Button onClick={refreshReconciliation} disabled={reconciliationLoading} className="rounded-2xl">
                      <RefreshCcw className="mr-2 h-4 w-4" /> Yenile
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 text-sm font-black">
                      Problemli yerel islem: {reconciliation?.localProblems?.length || 0} / B2B disi Mikro evragi: {reconciliation?.orphanMikroDocs?.length || 0}
                    </div>
                    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {(reconciliation?.localProblems || []).map((row: any) => (
                        <div key={row.id} className="rounded-2xl border border-red-100 bg-red-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-red-900">{row.documentNo || row.linkedOrderNumber || row.type}</p>
                              <p className="text-xs font-bold text-red-700">{row.customerName || row.customerCode || '-'} / {row.vehicleName || '-'}</p>
                              <p className="mt-1 text-xs text-red-700">{row.syncError || (row.missingDocs?.length ? `Mikroda bulunamayan: ${row.missingDocs.join(', ')}` : 'Kontrol gerekli')}</p>
                            </div>
                            {row.canCancelLocal && (
                              <button onClick={() => cancelLocalTransaction(row.id)} disabled={submitting} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">
                                Yerel Iptal
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {(reconciliation?.orphanMikroDocs || []).slice(0, 10).map((row: any) => (
                        <div key={row.documentNo} className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                          <p className="font-black text-amber-900">{row.documentNo} / {row.documentKind}</p>
                          <p className="text-xs font-bold text-amber-700">{fmtDate(row.documentDate)} / {fmtQty(row.totalQty)} adet / {formatCurrency(row.totalAmount || 0)}</p>
                        </div>
                      ))}
                      {!reconciliation?.localProblems?.length && !reconciliation?.orphanMikroDocs?.length && (
                        <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Gorunen mutabakat problemi yok.</p>
                      )}
                    </div>
                  </div>
                </Card>
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <h2 className="mb-3 text-xl font-black">Son Islemler</h2>
                  <div className="max-h-[520px] space-y-2 overflow-y-auto">
                    {(dashboard?.recentTransactions || []).map((row: any) => (
                      <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black">{row.mikroDocumentNo || row.linkedOrderNumber || row.type}</p>
                          <p className="font-black text-emerald-700">{formatCurrency(row.totalAmount || 0)}</p>
                        </div>
                        <p className="text-xs text-slate-500">{row.customerName || row.customerCode || '-'} / {row.session?.vehicle?.name || '-'}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-100/70">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function ReportMetric({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone: 'dark' | 'green' | 'amber' | 'red' }) {
  const tones = {
    dark: 'bg-slate-950 text-white',
    green: 'bg-emerald-700 text-white',
    amber: 'bg-amber-400 text-slate-950',
    red: 'bg-red-600 text-white',
  };
  return (
    <div className={`rounded-[2rem] p-5 shadow-xl ${tones[tone]}`}>
      <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{title}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs font-bold opacity-75">{sub}</p>}
    </div>
  );
}

function ReportBar({ label, value, max, count }: { label: string; value: number; max: number; count?: number }) {
  const pct = Math.max(4, Math.min(100, max > 0 ? (n(value) / max) * 100 : 0));
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black">
        <span>{label}{count !== undefined ? ` (${count})` : ''}</span>
        <span>{formatCurrency(value || 0)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-slate-950" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-12 items-center justify-center gap-2 rounded-3xl text-sm font-black transition ${active ? 'bg-slate-950 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
      {icon}
      {label}
    </button>
  );
}

function ProductImage({ src, large }: { src?: string | null; large?: boolean }) {
  return (
    <div className={`${large ? 'h-16 w-16' : 'h-12 w-12'} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Truck className="h-5 w-5 text-slate-300" />}
    </div>
  );
}

function WarehouseSelect({ value, onChange, label = 'Kaynak depo' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
        {WAREHOUSE_OPTIONS.map((warehouse) => (
          <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>
        ))}
      </select>
    </label>
  );
}

function CustomerPicker({ value, onChange, customers, selectedCustomer, onSelect, onCreateRequest }: any) {
  return (
    <div className="relative mb-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-black">Cari</label>
        <button type="button" onClick={onCreateRequest} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900 hover:bg-amber-200">
          Yeni SICAK Cari
        </button>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cari kodu veya unvan ara" />
      {selectedCustomer && <p className="mt-1 text-xs font-bold text-emerald-700">Secili: {selectedCustomer.displayName || selectedCustomer.mikroName || selectedCustomer.name}</p>}
      {customers.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl">
          {customers.map((customer: any) => (
            <button key={customer.id} onClick={() => onSelect(customer)} className="block w-full rounded-2xl p-3 text-left hover:bg-amber-50">
              <p className="font-black">{customer.displayName || customer.mikroName || customer.name}</p>
              <p className="text-xs text-slate-500">{customer.mikroCariCode} / {customer.city || '-'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCustomerPanel({ form, onChange, onSubmit, submitting }: { form: NewCustomerForm; onChange: (patch: Partial<NewCustomerForm>) => void; onSubmit: () => void; submitting: boolean }) {
  return (
    <div className="mb-4 rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3">
        <h3 className="text-lg font-black text-amber-950">Yeni SICAK Cari Ac</h3>
        <p className="text-xs font-bold text-amber-800">Zorunlu: unvan, cep telefonu, vergi dairesi, vergi no. Odeme plani Pesin, sektor/grup SICAK olarak acilir.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input placeholder="Cari unvani *" value={form.customerName} onChange={(e) => onChange({ customerName: e.target.value })} />
        <Input placeholder="Cep telefonu *" value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        <Input placeholder="Vergi dairesi *" value={form.taxOffice} onChange={(e) => onChange({ taxOffice: e.target.value })} />
        <Input placeholder="Vergi no *" value={form.taxNumber} onChange={(e) => onChange({ taxNumber: e.target.value })} />
        <Input placeholder="E-posta" value={form.email} onChange={(e) => onChange({ email: e.target.value })} />
        <Input placeholder="Il" value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        <Input placeholder="Ilce" value={form.district} onChange={(e) => onChange({ district: e.target.value })} />
        <Input placeholder="Adres" value={form.address} onChange={(e) => onChange({ address: e.target.value })} />
      </div>
      <Button onClick={onSubmit} disabled={submitting} className="mt-3 rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
        Cariyi Ac ve Sec
      </Button>
    </div>
  );
}

function ProductSearch({ value, onChange, products, onAdd, actionLabel }: any) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black">Urun Ara</label>
      <div className="relative">
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="h-14 w-full rounded-3xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-bold outline-none focus:border-amber-400" placeholder="Kod, isim veya barkod; bosken arac stogu listelenir" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {products.length === 0 && <p className="rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-500 md:col-span-2 2xl:col-span-3">Urun bulunamadi veya arac stogu bos.</p>}
        {products.map((product: any) => {
          const vehicleStock = n(product.vehicleStock);
          const noStock = n(product.totalVisibleStock) <= 0;
          const missingCost = n(product.currentCost) <= 0;
          const cardClass = vehicleStock > 0 ? 'border-emerald-200 bg-emerald-50' : noStock ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50';
          return (
            <article key={product.productCode} className={`overflow-hidden rounded-3xl border shadow-sm ${cardClass}`}>
              <div className="flex gap-3 p-3">
                <ProductImage src={product.imageUrl} large />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-black">{product.productName}</p>
                  <p className="text-xs text-slate-500">{product.productCode}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-black">
                    <span className={`rounded-full px-2 py-1 ${vehicleStock > 0 ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}>Arac {fmtQty(product.vehicleStock)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-blue-700">Sicak Depo {fmtQty(product.hotWarehouseStock)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-slate-700">Merkez {fmtQty(product.stockMerkez)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-slate-700">Topca {fmtQty(product.stockTopca)}</span>
                    {noStock && <span className="rounded-full bg-red-600 px-2 py-1 text-white">Stok Yok</span>}
                    {missingCost && <span className="rounded-full bg-orange-600 px-2 py-1 text-white">Maliyet Yok</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-white/70 p-3 text-xs">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((listNo) => (
                  <button key={listNo} type="button" onClick={() => onAdd(product, listNo)} className="rounded-2xl bg-white px-2 py-2 text-left font-black shadow-sm hover:bg-slate-950 hover:text-white">
                    {priceLabel(listNo)}: {formatCurrency(product.priceLists?.[listNo] || 0)}
                  </button>
                ))}
              </div>
              <button onClick={() => onAdd(product)} className="flex h-11 w-full items-center justify-center gap-2 bg-slate-950 text-sm font-black text-white">
                <Plus className="h-4 w-4" /> {actionLabel}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CartPanel({ title, cart, total, totalLabel = 'Toplam', onUpdate, onRemove, onSubmit, submitLabel, disabled, hidePrice, saleType, mode = 'sale', sourceWarehouseNo }: any) {
  return (
    <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">{cart.length} kalem</span>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {cart.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Liste bos.</p>}
        {cart.map((item: CartItem) => {
          const available = itemAvailableFor(item, mode, saleType, sourceWarehouseNo);
          const stockInvalid = Number.isFinite(available) && n(item.quantity) > available + 0.0001;
          const missingCost = !hidePrice && costMissing(item);
          return (
          <div key={item.productCode} className={`rounded-3xl border p-3 ${stockInvalid || missingCost ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex gap-3">
              <ProductImage src={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-black">{item.productName}</p>
                <p className="text-xs text-slate-500">{item.productCode}</p>
              </div>
              <button onClick={() => onRemove(item.productCode)} className="h-9 w-9 rounded-full bg-white text-slate-500"><X className="mx-auto h-4 w-4" /></button>
            </div>
            <div className={`mt-3 grid gap-2 ${hidePrice ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <input value={item.quantity} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdate(item.productCode, { quantity: Number(e.target.value.replace(',', '.')) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black" />
              {!hidePrice && (
                <select
                  value={item.priceListNo}
                  onChange={(e) => {
                    const listNo = Number(e.target.value);
                    onUpdate(item.productCode, { priceListNo: listNo, unitPrice: n(item.priceLists?.[listNo]) || item.unitPrice });
                  }}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black"
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                    <option key={listNo} value={listNo}>{priceLabel(listNo)}</option>
                  ))}
                </select>
              )}
              {!hidePrice && <input value={item.unitPrice} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdate(item.productCode, { unitPrice: Number(e.target.value.replace(',', '.')) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black" />}
            </div>
            {stockInvalid && (
              <p className="mt-2 flex items-center gap-2 rounded-2xl bg-red-100 px-3 py-2 text-xs font-black text-red-700">
                <AlertTriangle className="h-4 w-4" /> Stok yetersiz. Mevcut: {fmtQty(available)} / Girilen: {fmtQty(item.quantity)}
              </p>
            )}
            {missingCost && (
              <p className="mt-2 flex items-center gap-2 rounded-2xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-800">
                <AlertTriangle className="h-4 w-4" /> Guncel maliyet yok. Bu urun satisa kaydedilemez.
              </p>
            )}
            {!hidePrice && minAllowedPrice(item, saleType) > 0 && (
              <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-black ${n(item.unitPrice) + 0.0001 >= minAllowedPrice(item, saleType) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                Alt limit: {formatCurrency(minAllowedPrice(item, saleType))} / Guncel maliyet: {formatCurrency(n(item.currentCost))}
              </p>
            )}
          </div>
        );
        })}
      </div>
      <div className="mt-4 rounded-3xl bg-slate-950 p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-white/70">{totalLabel}</span>
          <span className="text-2xl font-black">{hidePrice ? fmtQty(total) : formatCurrency(total)}</span>
        </div>
        <Button onClick={onSubmit} disabled={disabled} className="w-full rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
          {submitLabel}
        </Button>
      </div>
    </Card>
  );
}
