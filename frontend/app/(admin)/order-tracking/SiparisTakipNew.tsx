'use client';

import {
  Users,
  Factory,
  Wallet,
  Mail,
  RefreshCw,
  Zap,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  Boxes,
  FileText,
  FileSpreadsheet,
  Check,
  Clock,
  Save,
  Send,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { useSiparisTakip } from './useSiparisTakip';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Siparis Takip ekrani. Mevcut TUM mantik useSiparisTakip'tan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/sekme/sayac/rozet/durum dusurulmemistir; brief 4.3.2'deki her oge mevcut.
 */
export default function SiparisTakipNew() {
  const {
    settings,
    customerWarehouseFilter,
    setCustomerWarehouseFilter,
    customerFulfillmentFilter,
    setCustomerFulfillmentFilter,
    supplierCityFilter,
    setSupplierCityFilter,
    supplierCitySort,
    setSupplierCitySort,
    activeTab,
    setActiveTab,
    isLoading,
    isSyncing,
    isSendingEmails,
    sendingToCustomer,
    downloadingSupplier,
    downloadingCustomerStatementPdf,
    downloadingCustomerPdf,
    downloadingSupplierExcel,
    downloadingSelectedCustomerStatements,
    downloadingSelectedCustomers,
    downloadingSelectedSuppliers,
    selectedCustomerCodes,
    selectedSupplierCodes,
    markingSupplierTransmission,
    closingOrderTarget,
    updatingQuantityTarget,
    expandedCustomers,
    emailOverrides,
    setEmailOverrides,
    showSettingsModal,
    setShowSettingsModal,
    settingsForm,
    setSettingsForm,
    confirmDialog,
    setConfirmDialog,
    user,
    customerSummary,
    supplierSummary,
    handleSaveSettings,
    handleSync,
    handleSendCustomerEmails,
    handleSendSupplierEmails,
    handleSyncAndSend,
    handleSendToCustomer,
    toggleCustomerExpanded,
    toggleCustomerSelection,
    setVisibleCustomerSelection,
    toggleSupplierSelection,
    setVisibleSupplierSelection,
    handleDownloadCustomerPdf,
    handleDownloadCustomerStatementPdf,
    handleDownloadSelectedCustomersPdf,
    handleDownloadSelectedCustomerStatementsPdf,
    handleDownloadSelectedSuppliersApprovalPdf,
    handleDownloadSupplierPdf,
    handleDownloadSupplierExcel,
    handleMarkSupplierTransmitted,
    handleCloseRemaining,
    handleUpdateLineQuantity,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatWarehouseName,
    getOrderWarehouseLabel,
    getItemStock,
    itemCanFulfill,
    getFulfillmentText,
    getWarehouseBreakdown,
    formatSchedule,
    customerAmount,
    supplierAmount,
    totalAmount,
    isSupplierTab,
    supplierCities,
    filteredCustomerSummary,
    filteredSupplierSummary,
    currentSummary,
    currentAmount,
    visibleSelectableCustomers,
    selectedVisibleCustomerCount,
    visibleSelectableSuppliers,
    selectedVisibleSupplierCount,
  } = useSiparisTakip();

  // --- New gorsel yardimcilari (mantik degil, sadece renk/etiket) ---
  // Karsilanabilirlik rozeti (yeni stil): Karsilar emerald / Yetmez red; preferred=koyu vurgu
  const renderFulfillBadge = (canFulfill: boolean, highlighted: boolean) => {
    const base =
      'inline-flex min-w-[64px] justify-center items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold';
    if (canFulfill) {
      return (
        <span
          className={`${base} ${
            highlighted ? 'bg-[#047857] text-white border-[#047857]' : 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]'
          }`}
        >
          {getFulfillmentText(canFulfill)}
        </span>
      );
    }
    return (
      <span
        className={`${base} ${
          highlighted ? 'bg-[#b91c1c] text-white border-[#b91c1c]' : 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]'
        }`}
      >
        {getFulfillmentText(canFulfill)}
      </span>
    );
  };

  // Sekme tanimi (sayacli) — mevcut activeTab mantigi
  const tabs: Array<{ key: 'customers' | 'suppliers'; label: string; count: number; active: string }> = [
    { key: 'customers', label: 'Müşteriler', count: customerSummary.length, active: '#15356b' },
    { key: 'suppliers', label: 'Tedarikçiler', count: supplierSummary.length, active: '#b45309' },
  ];

  // Yukleniyor durumu (yeni iskelet)
  if (!user || isLoading) {
    return (
      <div className="px-1 py-6">
        <div className="mb-[18px]">
          <div className="h-7 w-52 rounded bg-[#eef1f6] animate-pulse" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-[#f1f3f8] animate-pulse" />
        </div>
        <div className="grid gap-3.5 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${CARD} p-4`}>
              <div className="h-4 w-32 rounded bg-[#eef1f6] animate-pulse" />
              <div className="mt-3 h-6 w-24 rounded bg-[#f1f3f8] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </div>
      </div>
    );
  }

  // Ozet kartlari (4)
  const statCards = (
    <div className="grid gap-3.5 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#51607a]">
          <span className="w-7 h-7 rounded-[7px] bg-[#eef2fa] flex items-center justify-center">
            <Users width={14} height={14} stroke="#15356b" strokeWidth={2} />
          </span>
          Müşteri Siparişleri
        </div>
        <div className="mt-2.5 text-[14px] text-[#14223b]">
          <span className="text-[22px] font-semibold">{customerSummary.length}</span>
          <span className="mx-1.5 text-[#c2cad8]">·</span>
          <span className="font-semibold">{formatCurrency(customerAmount)}</span>
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#51607a]">
          <span className="w-7 h-7 rounded-[7px] bg-[#fff7ed] flex items-center justify-center">
            <Factory width={14} height={14} stroke="#b45309" strokeWidth={2} />
          </span>
          Tedarikçi Siparişleri
        </div>
        <div className="mt-2.5 text-[14px] text-[#14223b]">
          <span className="text-[22px] font-semibold">{supplierSummary.length}</span>
          <span className="mx-1.5 text-[#c2cad8]">·</span>
          <span className="font-semibold">{formatCurrency(supplierAmount)}</span>
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#51607a]">
          <span className="w-7 h-7 rounded-[7px] bg-[#ecfdf5] flex items-center justify-center">
            <Wallet width={14} height={14} stroke="#047857" strokeWidth={2} />
          </span>
          Genel Toplam
        </div>
        <div className="mt-2.5 text-[22px] font-semibold text-[#14223b]">{formatCurrency(totalAmount)}</div>
        <div className="mt-1 text-[11px] text-[#8b97ac]">{customerSummary.length + supplierSummary.length} sipariş</div>
      </div>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#51607a]">
          <span className="w-7 h-7 rounded-[7px] bg-[#fffbeb] flex items-center justify-center">
            <Mail width={14} height={14} stroke="#b45309" strokeWidth={2} />
          </span>
          Son Maillar
        </div>
        <div className="mt-2.5 text-[12px] text-[#51607a] leading-relaxed">
          <div>Müşteri: {settings?.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : '-'}</div>
          <div>Tedarikçi: {settings?.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : '-'}</div>
          <div className="mt-1 text-[#8b97ac]">
            Son sync: {settings?.lastSyncAt ? formatDate(settings.lastSyncAt) : '-'}
          </div>
        </div>
      </div>
    </div>
  );

  // Hizli islemler karti (3 buton)
  const quickActions = (
    <div className={`${CARD} p-3.5 mb-4`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={handleSync}
          isLoading={isSyncing}
          disabled={isSyncing}
          className="!bg-[#15356b] hover:!bg-[#1c4585] !text-white !border-none !rounded-lg !px-3.5 !py-2.5 !text-[12.5px] !font-semibold inline-flex items-center gap-2"
        >
          <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} />
          Siparişleri Sync Et
        </Button>
        <Button
          onClick={activeTab === 'customers' ? handleSendCustomerEmails : handleSendSupplierEmails}
          isLoading={isSendingEmails}
          disabled={isSendingEmails}
          className="!bg-white hover:!bg-[#f4f6fa] !text-[#51607a] !border !border-[#d8e0ec] !rounded-lg !px-3.5 !py-2.5 !text-[12.5px] !font-medium inline-flex items-center gap-2"
        >
          <Mail width={13} height={13} stroke="currentColor" strokeWidth={2} />
          {activeTab === 'customers' ? 'Müşterilere' : 'Tedarikçilere'} Mail Gönder
        </Button>
        <Button
          onClick={handleSyncAndSend}
          isLoading={isSyncing || isSendingEmails}
          disabled={isSyncing || isSendingEmails}
          className="!bg-white hover:!bg-[#f4f6fa] !text-[#51607a] !border !border-[#d8e0ec] !rounded-lg !px-3.5 !py-2.5 !text-[12.5px] !font-medium inline-flex items-center gap-2"
        >
          <Zap width={13} height={13} stroke="currentColor" strokeWidth={2} />
          Sync + Tüm Mailleri Gönder
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-[#8b97ac]">
        Sync: Mikro ERP'den bekleyen siparişleri çeker · Mail: seçili sekmedeki tüm
        {activeTab === 'customers' ? ' müşterilere' : ' tedarikçilere'} gönderir · Sync + Tüm Mailler: ikisini sırayla yapar.
      </p>
    </div>
  );

  // Otomatik Mail Ayarlari karti (Musteri / Tedarikci kolonlari)
  const settingsSummaryCard = settings ? (
    <div className={`${CARD} p-[15px] mb-4`}>
      <div className="text-[13.5px] font-semibold text-[#14223b] mb-3">Otomatik Mail Ayarları</div>
      <div className="grid gap-3.5 md:grid-cols-2">
        {/* Musteri */}
        <div className="border border-[#eef1f6] rounded-[10px] p-[13px]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12.5px] font-semibold text-[#14223b]">Müşteri</span>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                settings.customerEmailEnabled
                  ? 'bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]'
                  : 'bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]'
              }`}
            >
              {settings.customerEmailEnabled ? 'Aktif' : 'Pasif'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 text-[11.5px] text-[#51607a]">
            <div className="flex justify-between gap-2">
              <span>Zamanlama</span>
              <b className="text-[#14223b] font-semibold text-right">{formatSchedule(settings.customerSyncSchedule)}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span>Email Konusu</span>
              <b className="text-[#14223b] font-semibold text-right">{settings.customerEmailSubject}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span>Son Gönderim</span>
              <b className="text-[#14223b] font-semibold text-right">
                {settings.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : 'Henüz gönderilmedi'}
              </b>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg py-2 text-[12px] font-semibold text-[#15356b] hover:bg-[#eef2fa]"
          >
            <Pencil width={12} height={12} stroke="currentColor" strokeWidth={2} />
            Düzenle
          </button>
        </div>
        {/* Tedarikci */}
        <div className="border border-[#eef1f6] rounded-[10px] p-[13px]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12.5px] font-semibold text-[#14223b]">Tedarikçi</span>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                settings.supplierEmailEnabled
                  ? 'bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]'
                  : 'bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]'
              }`}
            >
              {settings.supplierEmailEnabled ? 'Aktif' : 'Pasif'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 text-[11.5px] text-[#51607a]">
            <div className="flex justify-between gap-2">
              <span>Zamanlama</span>
              <b className="text-[#14223b] font-semibold text-right">{formatSchedule(settings.supplierSyncSchedule)}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span>Email Konusu</span>
              <b className="text-[#14223b] font-semibold text-right">{settings.supplierEmailSubject}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span>Son Gönderim</span>
              <b className="text-[#14223b] font-semibold text-right">
                {settings.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : 'Henüz gönderilmedi'}
              </b>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg py-2 text-[12px] font-semibold text-[#15356b] hover:bg-[#eef2fa]"
          >
            <Pencil width={12} height={12} stroke="currentColor" strokeWidth={2} />
            Düzenle
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Sekme cubugu + Toplam tutar
  const tabBar = (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
              style={{
                background: active ? t.active : '#fff',
                color: active ? '#fff' : '#51607a',
                border: active ? '1px solid transparent' : '1px solid #e3e8f0',
              }}
            >
              {t.label}
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: active ? 'rgba(255,255,255,0.22)' : '#eef1f6',
                  color: active ? '#fff' : '#51607a',
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-right">
        <div className="text-[11px] text-[#8b97ac]">Toplam Tutar ({currentSummary.length})</div>
        <div className="text-[18px] font-semibold text-[#14223b]">{formatCurrency(currentAmount)}</div>
      </div>
    </div>
  );

  // Filtre satiri (sekmeye gore)
  const filterRow = !isSupplierTab ? (
    <div className="flex items-center gap-2 flex-wrap mb-3.5">
      <label className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white">
        <span className="text-[12px] text-[#8b97ac]">Depo</span>
        <select
          value={customerWarehouseFilter}
          onChange={(e) => setCustomerWarehouseFilter(e.target.value as 'ALL' | '1' | '6')}
          className="border-none bg-transparent outline-none text-[12.5px] font-medium text-[#14223b] cursor-pointer"
        >
          <option value="ALL">Tüm Depolar</option>
          <option value="1">Sadece Merkez</option>
          <option value="6">Sadece Topça</option>
        </select>
      </label>
      <label className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white">
        <span className="text-[12px] text-[#8b97ac]">Karşılanabilirlik</span>
        <select
          value={customerFulfillmentFilter}
          onChange={(e) =>
            setCustomerFulfillmentFilter(
              e.target.value as 'ALL' | 'ANY_UNFULFILLED' | 'MERKEZ_UNFULFILLED' | 'TOPCA_UNFULFILLED'
            )
          }
          className="border-none bg-transparent outline-none text-[12.5px] font-medium text-[#14223b] cursor-pointer"
        >
          <option value="ALL">Tüm Siparişler</option>
          <option value="ANY_UNFULFILLED">Sadece Karşılanamayanlar</option>
          <option value="MERKEZ_UNFULFILLED">Merkezden Karşılanamayanlar</option>
          <option value="TOPCA_UNFULFILLED">Topçadan Karşılanamayanlar</option>
        </select>
      </label>
      <div className="md:ml-auto flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setVisibleCustomerSelection(filteredCustomerSummary, true)}
          disabled={visibleSelectableCustomers.length === 0}
          className="bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Tümünü Seç
        </button>
        <button
          type="button"
          onClick={() => setVisibleCustomerSelection(filteredCustomerSummary, false)}
          disabled={selectedVisibleCustomerCount === 0}
          className="bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Seçimi Temizle
        </button>
        <Button
          onClick={() => handleDownloadSelectedCustomerStatementsPdf(filteredCustomerSummary)}
          isLoading={downloadingSelectedCustomerStatements}
          disabled={selectedVisibleCustomerCount === 0 || downloadingSelectedCustomerStatements}
          className="!bg-[#15356b] hover:!bg-[#1c4585] !text-white !border-none !rounded-lg !px-3 !py-2 !text-[12px] !font-semibold inline-flex items-center gap-1.5"
        >
          <FileText width={13} height={13} stroke="currentColor" strokeWidth={2} />
          Seçili Müşteri PDF ({selectedVisibleCustomerCount})
        </Button>
        <Button
          onClick={() => handleDownloadSelectedCustomersPdf(filteredCustomerSummary)}
          isLoading={downloadingSelectedCustomers}
          disabled={selectedVisibleCustomerCount === 0 || downloadingSelectedCustomers}
          className="!bg-[#334155] hover:!bg-[#1e293b] !text-white !border-none !rounded-lg !px-3 !py-2 !text-[12px] !font-semibold inline-flex items-center gap-1.5"
        >
          <FileText width={13} height={13} stroke="currentColor" strokeWidth={2} />
          Seçili Stok PDF ({selectedVisibleCustomerCount})
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2 flex-wrap mb-3.5">
      <label className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white">
        <span className="text-[12px] text-[#8b97ac]">Şehir</span>
        <select
          value={supplierCityFilter}
          onChange={(e) => setSupplierCityFilter(e.target.value)}
          className="border-none bg-transparent outline-none text-[12.5px] font-medium text-[#14223b] cursor-pointer"
        >
          <option value="ALL">Tüm Şehirler</option>
          {supplierCities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white">
        <span className="text-[12px] text-[#8b97ac]">Şehire Göre Sırala</span>
        <select
          value={supplierCitySort}
          onChange={(e) => setSupplierCitySort(e.target.value as 'none' | 'asc' | 'desc')}
          className="border-none bg-transparent outline-none text-[12.5px] font-medium text-[#14223b] cursor-pointer"
        >
          <option value="none">Varsayılan</option>
          <option value="asc">A-Z</option>
          <option value="desc">Z-A</option>
        </select>
      </label>
      <div className="md:ml-auto flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setVisibleSupplierSelection(filteredSupplierSummary, true)}
          disabled={visibleSelectableSuppliers.length === 0}
          className="bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Tümünü Seç
        </button>
        <button
          type="button"
          onClick={() => setVisibleSupplierSelection(filteredSupplierSummary, false)}
          disabled={selectedVisibleSupplierCount === 0}
          className="bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Seçimi Temizle
        </button>
        <Button
          onClick={() => handleDownloadSelectedSuppliersApprovalPdf(filteredSupplierSummary)}
          isLoading={downloadingSelectedSuppliers}
          disabled={selectedVisibleSupplierCount === 0 || downloadingSelectedSuppliers}
          className="!bg-[#0d9488] hover:!bg-[#0f766e] !text-white !border-none !rounded-lg !px-3 !py-2 !text-[12px] !font-semibold inline-flex items-center gap-1.5"
        >
          <FileText width={13} height={13} stroke="currentColor" strokeWidth={2} />
          Seçilileri İndir ({selectedVisibleSupplierCount})
        </Button>
      </div>
    </div>
  );

  return (
    <div className="px-1 py-6">
      {/* Page header */}
      <div className="mb-[18px]">
        <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Sipariş Takip</h1>
        <div className="text-[13px] text-[#8b97ac] mt-1.5">
          Mikro'daki açık müşteri ve tedarikçi siparişleri · cari bazında takip, mail, karşılanabilirlik
        </div>
      </div>

      {statCards}
      {quickActions}
      {settingsSummaryCard}

      {/* Sekmeler + Toplam */}
      {tabBar}

      {/* Filtreler */}
      {filterRow}

      {/* Liste */}
      {currentSummary.length === 0 ? (
        <div className={`${CARD} text-center py-14`}>
          <CheckCircle2 width={28} height={28} stroke="#047857" strokeWidth={2} className="mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-[#14223b]">Bekleyen sipariş yok</p>
          <p className="text-[12px] text-[#8b97ac] mt-1">Yeni siparişler sync edildiğinde burada görünecek.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {currentSummary.map((customer) => {
            const isExpanded = expandedCustomers.has(customer.customerCode);
            const hasPendingItems = customer.orders.some((order) =>
              order.items.some((item) => item.remainingQty > 0)
            );
            const warehouseBreakdown = isSupplierTab ? getWarehouseBreakdown(customer.orders) : null;
            return (
              <div key={customer.customerCode} className={`${CARD} overflow-hidden`}>
                {/* Cari header */}
                <div className="flex items-start gap-3 p-4">
                  {!isSupplierTab && (
                    <input
                      type="checkbox"
                      className="mt-1 w-4 h-4 accent-[#15356b] flex-none"
                      checked={selectedCustomerCodes.has(customer.customerCode)}
                      disabled={!hasPendingItems}
                      onChange={(e) => toggleCustomerSelection(customer.customerCode, e.target.checked)}
                      title="Toplu PDF secimi"
                    />
                  )}
                  {isSupplierTab && (
                    <input
                      type="checkbox"
                      className="mt-1 w-4 h-4 accent-[#15356b] flex-none"
                      checked={selectedSupplierCodes.has(customer.customerCode)}
                      disabled={!hasPendingItems}
                      onChange={(e) => toggleSupplierSelection(customer.customerCode, e.target.checked)}
                      title="Toplu yonetici onayi PDF secimi"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[15px] font-semibold text-[#14223b]">{customer.customerName}</span>
                      {customer.emailSent ? (
                        <span className="inline-flex items-center gap-1 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          <Check width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
                          Gönderildi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          <Clock width={12} height={12} stroke="currentColor" strokeWidth={2.2} />
                          Bekliyor
                        </span>
                      )}
                    </div>

                    {/* Cipler: kod / email / sektor (+ tedarikci: sehir/son iletim/depo dagilimi) */}
                    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-1.5 text-[11.5px] text-[#8b97ac]">
                      <span className="font-mono">Kod: {customer.customerCode}</span>
                      <span>
                        {customer.customerEmail ? (
                          <span className="text-[#1c4585] font-medium">{customer.customerEmail}</span>
                        ) : (
                          <span className="text-[#b91c1c]">Email kayıtlı değil</span>
                        )}
                      </span>
                      {customer.sectorCode && (
                        <span className="inline-flex items-center bg-[#eef1f6] text-[#51607a] px-2 py-0.5 rounded-md">
                          {customer.sectorCode}
                        </span>
                      )}
                      {isSupplierTab && (
                        <span className="inline-flex items-center bg-[#fff7ed] text-[#b45309] border border-[#fed7aa] px-2 py-0.5 rounded-md">
                          Şehir: {customer.city || '-'}
                        </span>
                      )}
                      {isSupplierTab && (
                        <span className="inline-flex items-center bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0] px-2 py-0.5 rounded-md">
                          Son İletim: {formatDateTime(customer.lastTransmittedAt || null)}
                          {customer.lastTransmittedByName ? ` (${customer.lastTransmittedByName})` : ''}
                        </span>
                      )}
                      {isSupplierTab && warehouseBreakdown && warehouseBreakdown.merkezItems > 0 && (
                        <span className="inline-flex items-center bg-[#eef2fa] text-[#1c4585] border border-[#d6e0f1] px-2 py-0.5 rounded-md">
                          Merkez: {warehouseBreakdown.merkezOrders} sipariş / {warehouseBreakdown.merkezItems} satır
                        </span>
                      )}
                      {isSupplierTab && warehouseBreakdown && warehouseBreakdown.topcaItems > 0 && (
                        <span className="inline-flex items-center bg-[#fffbeb] text-[#b45309] border border-[#fde68a] px-2 py-0.5 rounded-md">
                          Topça: {warehouseBreakdown.topcaOrders} sipariş / {warehouseBreakdown.topcaItems} satır
                        </span>
                      )}
                      {isSupplierTab && warehouseBreakdown && warehouseBreakdown.otherItems > 0 && (
                        <span className="inline-flex items-center bg-[#eef1f6] text-[#51607a] border border-[#e3e8f0] px-2 py-0.5 rounded-md">
                          Diğer depo: {warehouseBreakdown.otherOrders} sipariş / {warehouseBreakdown.otherItems} satır
                        </span>
                      )}
                    </div>

                    {/* Siparis sayisi + tutar */}
                    <div className="flex items-center gap-3.5 mt-2 text-[12.5px] text-[#51607a]">
                      <span className="inline-flex items-center gap-1.5">
                        <Boxes width={13} height={13} stroke="#8b97ac" strokeWidth={2} />
                        <b className="text-[#14223b] font-semibold">{customer.ordersCount} sipariş</b>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Wallet width={13} height={13} stroke="#8b97ac" strokeWidth={2} />
                        <b className="text-[#14223b] font-semibold">{formatCurrency(customer.totalAmount)}</b>
                      </span>
                    </div>
                  </div>

                  {/* Sag aksiyonlar */}
                  <div className="flex flex-col items-end gap-2 flex-none">
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {!isSupplierTab && (
                        <>
                          <Button
                            onClick={() => handleDownloadCustomerStatementPdf(customer)}
                            isLoading={downloadingCustomerStatementPdf === customer.customerCode}
                            disabled={!hasPendingItems || downloadingCustomerStatementPdf === customer.customerCode}
                            className="!bg-white hover:!bg-[#f4f6fa] !text-[#51607a] !border !border-[#d8e0ec] !rounded-lg !px-2.5 !py-1.5 !text-[11.5px] !font-medium inline-flex items-center gap-1.5"
                          >
                            <FileText width={12} height={12} stroke="currentColor" strokeWidth={2} />
                            Müşteri PDF
                          </Button>
                          <Button
                            onClick={() => handleDownloadCustomerPdf(customer)}
                            isLoading={downloadingCustomerPdf === customer.customerCode}
                            disabled={!hasPendingItems || downloadingCustomerPdf === customer.customerCode}
                            className="!bg-white hover:!bg-[#f4f6fa] !text-[#51607a] !border !border-[#d8e0ec] !rounded-lg !px-2.5 !py-1.5 !text-[11.5px] !font-medium inline-flex items-center gap-1.5"
                          >
                            <FileText width={12} height={12} stroke="currentColor" strokeWidth={2} />
                            Stok PDF
                          </Button>
                        </>
                      )}
                      {isSupplierTab && (
                        <Button
                          onClick={() => handleMarkSupplierTransmitted(customer)}
                          isLoading={markingSupplierTransmission === customer.customerCode}
                          disabled={markingSupplierTransmission === customer.customerCode}
                          className="!bg-[#047857] hover:!bg-[#065f46] !text-white !border-none !rounded-lg !px-2.5 !py-1.5 !text-[11.5px] !font-semibold inline-flex items-center gap-1.5"
                        >
                          <Check width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
                          İletildi
                        </Button>
                      )}
                      {isSupplierTab && (
                        <Button
                          onClick={() => handleDownloadSupplierPdf(customer)}
                          isLoading={downloadingSupplier === customer.customerCode}
                          disabled={
                            !hasPendingItems ||
                            downloadingSupplier === customer.customerCode ||
                            downloadingSupplierExcel === customer.customerCode
                          }
                          className="!bg-white hover:!bg-[#f4f6fa] !text-[#b45309] !border !border-[#fed7aa] !rounded-lg !px-2.5 !py-1.5 !text-[11.5px] !font-medium inline-flex items-center gap-1.5"
                        >
                          <FileText width={12} height={12} stroke="currentColor" strokeWidth={2} />
                          PDF İndir
                        </Button>
                      )}
                      {isSupplierTab && (
                        <Button
                          onClick={() => handleDownloadSupplierExcel(customer)}
                          isLoading={downloadingSupplierExcel === customer.customerCode}
                          disabled={
                            !hasPendingItems ||
                            downloadingSupplierExcel === customer.customerCode ||
                            downloadingSupplier === customer.customerCode
                          }
                          className="!bg-white hover:!bg-[#f4f6fa] !text-[#047857] !border !border-[#a7f3d0] !rounded-lg !px-2.5 !py-1.5 !text-[11.5px] !font-medium inline-flex items-center gap-1.5"
                        >
                          <FileSpreadsheet width={12} height={12} stroke="currentColor" strokeWidth={2} />
                          Excel İndir
                        </Button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCustomerExpanded(customer.customerCode)}
                      className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[12px] font-medium text-[#15356b]"
                    >
                      {isExpanded ? 'Gizle' : 'Detay'}
                      {isExpanded ? (
                        <ChevronUp width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      ) : (
                        <ChevronDown width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Email override + Mail Gonder */}
                <div className="border-t border-[#eef1f6] bg-[#fafbfd] px-4 py-3">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-medium text-[#51607a] mb-1">
                        Email Override (opsiyonel · tek seferlik)
                      </label>
                      <input
                        type="email"
                        placeholder={customer.customerEmail || 'email@example.com'}
                        value={emailOverrides[customer.customerCode] || ''}
                        onChange={(e) =>
                          setEmailOverrides((prev) => ({
                            ...prev,
                            [customer.customerCode]: e.target.value,
                          }))
                        }
                        className="w-full sm:max-w-[320px] h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                      />
                      <p className="text-[11px] text-[#8b97ac] mt-1">
                        {emailOverrides[customer.customerCode]
                          ? `Mail ${emailOverrides[customer.customerCode]} adresine gönderilecek`
                          : `Varsayılan: ${customer.customerEmail || 'Email bulunamadı'}`}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleSendToCustomer(customer.customerCode)}
                      isLoading={sendingToCustomer === customer.customerCode}
                      disabled={sendingToCustomer === customer.customerCode}
                      className="!bg-[#15356b] hover:!bg-[#1c4585] !text-white !border-none !rounded-lg !px-3.5 !py-2.5 !text-[12.5px] !font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Send width={13} height={13} stroke="currentColor" strokeWidth={2} />
                      Mail Gönder
                    </Button>
                  </div>
                </div>

                {/* Detay (acilir) */}
                {isExpanded && (
                  <div className="border-t border-[#eef1f6] bg-[#fafbfd] px-4 py-3.5">
                    <div className="text-[12.5px] font-semibold text-[#14223b] mb-2.5">
                      Siparişler ({customer.orders.length})
                    </div>
                    <div className="flex flex-col gap-3">
                      {customer.orders.map((order) => (
                        <div key={order.id} className="bg-white border border-[#eef1f6] rounded-[10px] p-3">
                          {/* Siparis basligi */}
                          <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
                            <span className="font-mono text-[12px] font-semibold text-[#14223b]">
                              Sipariş No: {order.mikroOrderNumber}
                            </span>
                            {!isSupplierTab && (
                              <span className="inline-flex items-center bg-[#eef2fa] text-[#1c4585] border border-[#d6e0f1] text-[10.5px] font-semibold px-2 py-0.5 rounded-md">
                                Depo: {getOrderWarehouseLabel(order)}
                              </span>
                            )}
                            <span className="text-[11.5px] text-[#8b97ac]">
                              Tarih {formatDate(order.orderDate)} · Teslimat {formatDate(order.deliveryDate)} ·{' '}
                              {order.itemCount} kalem
                            </span>
                            <span className="ml-auto text-[14px] font-semibold text-[#14223b]">
                              {formatCurrency(order.grandTotal)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCloseRemaining(order, isSupplierTab ? 'supplier' : 'customer')}
                              disabled={
                                closingOrderTarget === `${order.mikroOrderNumber}:ORDER` ||
                                !order.items.some((item) => item.remainingQty > 0)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[11px] font-semibold text-[#b91c1c] hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <X width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
                              {closingOrderTarget === `${order.mikroOrderNumber}:ORDER`
                                ? 'Kapatiliyor'
                                : 'Tum Kalanlari Kapat'}
                            </button>
                          </div>

                          {/* Kalem tablosu */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11.5px] border-collapse min-w-[760px]">
                              <thead>
                                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                                  <th className="px-2.5 py-2 font-semibold">Ürün</th>
                                  <th className="px-2.5 py-2 font-semibold text-center">Miktar (Sip/Tes/Kalan)</th>
                                  {!isSupplierTab && (
                                    <>
                                      <th className="px-2.5 py-2 font-semibold text-right">Merkez Stok</th>
                                      <th className="px-2.5 py-2 font-semibold text-right">Topça Stok</th>
                                      <th className="px-2.5 py-2 font-semibold text-center">Merkez</th>
                                      <th className="px-2.5 py-2 font-semibold text-center">Topça</th>
                                    </>
                                  )}
                                  <th className="px-2.5 py-2 font-semibold text-right">Birim Fiyat</th>
                                  <th className="px-2.5 py-2 font-semibold text-right">Kalan Tutar</th>
                                  <th className="px-2.5 py-2 font-semibold text-center">Islem</th>
                                </tr>
                              </thead>
                              <tbody>
                                {order.items.map((item, idx) => {
                                  const isFullyDelivered = item.remainingQty === 0;
                                  const preferredWarehouseCode = String(item.warehouseCode || '').trim();
                                  const merkezCanFulfill = itemCanFulfill(item, '1');
                                  const topcaCanFulfill = itemCanFulfill(item, '6');
                                  return (
                                    <tr
                                      key={idx}
                                      className={`border-t border-[#eef1f6] ${isFullyDelivered ? 'opacity-60' : ''}`}
                                    >
                                      <td className="px-2.5 py-2 align-top">
                                        <div
                                          className={`font-medium ${
                                            isFullyDelivered ? 'text-[#8b97ac] line-through' : 'text-[#14223b]'
                                          }`}
                                        >
                                          {item.productName}
                                          {isFullyDelivered && (
                                            <span className="ml-1.5 inline-flex items-center gap-1 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                              <Check width={10} height={10} stroke="currentColor" strokeWidth={2.4} />
                                              Teslim Edildi
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-[#8b97ac] font-mono mt-0.5">
                                          {item.productCode} / Depo: {formatWarehouseName(item.warehouseCode)}
                                        </div>
                                      </td>
                                      <td className="px-2.5 py-2 align-top text-center">
                                        <div className="flex flex-col items-center gap-0.5">
                                          <div className={isFullyDelivered ? 'text-[#8b97ac]' : 'text-[#51607a]'}>
                                            <span className="font-semibold text-[#14223b]">{item.quantity}</span>{' '}
                                            {item.unit}
                                          </div>
                                          {item.deliveredQty > 0 && (
                                            <div className="text-[10px] text-[#a9b3c2] line-through">
                                              Teslim: {item.deliveredQty}
                                            </div>
                                          )}
                                          <div
                                            className={`text-[10.5px] font-semibold ${
                                              isFullyDelivered ? 'text-[#047857]' : 'text-[#b45309]'
                                            }`}
                                          >
                                            Kalan: {item.remainingQty}
                                          </div>
                                          {!isSupplierTab && item.fulfillment?.hasAggregateRisk && (
                                            <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#b91c1c]">
                                              <AlertTriangle
                                                width={10}
                                                height={10}
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              />
                                              Toplam talep riski
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      {!isSupplierTab && (
                                        <>
                                          <td className="px-2.5 py-2 align-top text-right font-semibold text-[#14223b]">
                                            {formatNumber(getItemStock(item, '1'))}
                                          </td>
                                          <td className="px-2.5 py-2 align-top text-right font-semibold text-[#14223b]">
                                            {formatNumber(getItemStock(item, '6'))}
                                          </td>
                                          <td className="px-2.5 py-2 align-top text-center">
                                            <span
                                              title={`Merkez toplam acik talep: ${formatNumber(
                                                item.fulfillment?.merkezTotalDemand || 0
                                              )}`}
                                            >
                                              {renderFulfillBadge(merkezCanFulfill, preferredWarehouseCode === '1')}
                                            </span>
                                          </td>
                                          <td className="px-2.5 py-2 align-top text-center">
                                            <span
                                              title={`Topca toplam acik talep: ${formatNumber(
                                                item.fulfillment?.topcaTotalDemand || 0
                                              )}`}
                                            >
                                              {renderFulfillBadge(topcaCanFulfill, preferredWarehouseCode === '6')}
                                            </span>
                                          </td>
                                        </>
                                      )}
                                      <td
                                        className={`px-2.5 py-2 align-top text-right ${
                                          isFullyDelivered ? 'text-[#8b97ac]' : 'text-[#51607a]'
                                        }`}
                                      >
                                        {formatCurrency(item.unitPrice)}
                                      </td>
                                      <td
                                        className={`px-2.5 py-2 align-top text-right font-semibold ${
                                          isFullyDelivered ? 'text-[#8b97ac]' : 'text-[#14223b]'
                                        }`}
                                      >
                                        {formatCurrency(item.lineTotal)}
                                      </td>
                                      <td className="px-2.5 py-2 align-top text-center">
                                        <div className="flex flex-wrap justify-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateLineQuantity(order, isSupplierTab ? 'supplier' : 'customer', item)
                                            }
                                            disabled={updatingQuantityTarget === `${order.mikroOrderNumber}:${item.rowNumber}`}
                                            className="inline-flex items-center justify-center gap-1 rounded-md border border-[#c7d2fe] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#15356b] hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-45"
                                          >
                                            <Pencil width={10} height={10} stroke="currentColor" strokeWidth={2.2} />
                                            {updatingQuantityTarget === `${order.mikroOrderNumber}:${item.rowNumber}`
                                              ? 'Kaydediliyor'
                                              : 'Duzenle'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCloseRemaining(order, isSupplierTab ? 'supplier' : 'customer', item)
                                            }
                                            disabled={
                                              isFullyDelivered ||
                                              closingOrderTarget === `${order.mikroOrderNumber}:${item.rowNumber}`
                                            }
                                            className="inline-flex items-center justify-center gap-1 rounded-md border border-[#fecaca] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-45"
                                          >
                                            <X width={10} height={10} stroke="currentColor" strokeWidth={2.4} />
                                            {closingOrderTarget === `${order.mikroOrderNumber}:${item.rowNumber}`
                                              ? 'Kapatiliyor'
                                              : 'Kapat'}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Otomatik Mail Ayarlari Modal (yeni gorsel; ayni form/handler) */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-[#14223b]/45 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-[#e7ebf2]">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[18px] font-semibold text-[#14223b]">Otomatik Mail Ayarlarını Düzenle</h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-[#8b97ac] hover:text-[#51607a]"
                >
                  <X width={20} height={20} stroke="currentColor" strokeWidth={2} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Musteri Ayarlari */}
                <div className="border border-[#d6e0f1] rounded-[10px] p-4 bg-[#f7f9fd]">
                  <h3 className="font-semibold text-[#15356b] mb-4 text-[14px]">Müşteri Mail Ayarları</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.customerEmailEnabled}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, customerEmailEnabled: e.target.checked }))
                          }
                          className="w-4 h-4 accent-[#15356b]"
                        />
                        <span className="text-[12.5px] font-medium text-[#14223b]">
                          Otomatik mail gönderimi aktif
                        </span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-1">Email Konusu</label>
                      <input
                        type="text"
                        value={settingsForm.customerEmailSubject}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, customerEmailSubject: e.target.value }))
                        }
                        className="w-full h-9 px-2.5 border border-[#e3e8f0] rounded-lg text-[12.5px] outline-none focus:border-[#15356b]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-2">Gönderim Günleri</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 1, label: 'Pazartesi' },
                          { value: 2, label: 'Salı' },
                          { value: 3, label: 'Çarşamba' },
                          { value: 4, label: 'Perşembe' },
                          { value: 5, label: 'Cuma' },
                          { value: 6, label: 'Cumartesi' },
                          { value: 0, label: 'Pazar' },
                        ].map((day) => (
                          <label key={day.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsForm.customerDays.includes(day.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    customerDays: [...prev.customerDays, day.value].sort(),
                                  }));
                                } else {
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    customerDays: prev.customerDays.filter((d) => d !== day.value),
                                  }));
                                }
                              }}
                              className="w-4 h-4 accent-[#15356b]"
                            />
                            <span className="text-[12px] text-[#51607a]">{day.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-1">Gönderim Saati</label>
                      <select
                        value={settingsForm.customerHour}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, customerHour: parseInt(e.target.value) }))
                        }
                        className="w-full h-9 px-2.5 border border-[#e3e8f0] rounded-lg text-[12.5px] outline-none focus:border-[#15356b] bg-white"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {i.toString().padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tedarikci Ayarlari */}
                <div className="border border-[#fed7aa] rounded-[10px] p-4 bg-[#fff8f1]">
                  <h3 className="font-semibold text-[#b45309] mb-4 text-[14px]">Tedarikçi Mail Ayarları</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.supplierEmailEnabled}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({ ...prev, supplierEmailEnabled: e.target.checked }))
                          }
                          className="w-4 h-4 accent-[#b45309]"
                        />
                        <span className="text-[12.5px] font-medium text-[#14223b]">
                          Otomatik mail gönderimi aktif
                        </span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-1">Email Konusu</label>
                      <input
                        type="text"
                        value={settingsForm.supplierEmailSubject}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, supplierEmailSubject: e.target.value }))
                        }
                        className="w-full h-9 px-2.5 border border-[#e3e8f0] rounded-lg text-[12.5px] outline-none focus:border-[#b45309]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-2">Gönderim Günleri</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 1, label: 'Pazartesi' },
                          { value: 2, label: 'Salı' },
                          { value: 3, label: 'Çarşamba' },
                          { value: 4, label: 'Perşembe' },
                          { value: 5, label: 'Cuma' },
                          { value: 6, label: 'Cumartesi' },
                          { value: 0, label: 'Pazar' },
                        ].map((day) => (
                          <label key={day.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsForm.supplierDays.includes(day.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    supplierDays: [...prev.supplierDays, day.value].sort(),
                                  }));
                                } else {
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    supplierDays: prev.supplierDays.filter((d) => d !== day.value),
                                  }));
                                }
                              }}
                              className="w-4 h-4 accent-[#b45309]"
                            />
                            <span className="text-[12px] text-[#51607a]">{day.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#51607a] mb-1">Gönderim Saati</label>
                      <select
                        value={settingsForm.supplierHour}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, supplierHour: parseInt(e.target.value) }))
                        }
                        className="w-full h-9 px-2.5 border border-[#e3e8f0] rounded-lg text-[12.5px] outline-none focus:border-[#b45309] bg-white"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {i.toString().padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[#eef1f6]">
                <Button
                  onClick={() => setShowSettingsModal(false)}
                  className="!bg-white hover:!bg-[#f4f6fa] !text-[#51607a] !border !border-[#d8e0ec] !rounded-lg !px-4 !py-2.5 !text-[12.5px] !font-medium"
                >
                  İptal
                </Button>
                <Button
                  onClick={handleSaveSettings}
                  className="!bg-[#047857] hover:!bg-[#065f46] !text-white !border-none !rounded-lg !px-4 !py-2.5 !text-[12.5px] !font-semibold inline-flex items-center gap-1.5"
                >
                  <Save width={13} height={13} stroke="currentColor" strokeWidth={2} />
                  Kaydet
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="İptal"
      />
    </div>
  );
}
