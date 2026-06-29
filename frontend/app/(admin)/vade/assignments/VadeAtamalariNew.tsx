'use client';

import {
  Users,
  Search,
  CheckCircle2,
  CheckSquare,
  Eraser,
  UserPlus,
  Trash2,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { useVadeAtamalari } from './useVadeAtamalari';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Vade Atamalari ekrani. Mevcut TUM mantik useVadeAtamalari'ndan gelir; sadece gorsel yeni.
 * Hicbir handler/kosul/kolon/durum/buton dusurulmemistir; brief 4.7.3'teki her oge mevcut.
 * Vade renk semantigi: primary mavi #15356b (atama/personel), emerald (secili/atanmis), red (kaldir).
 */
export default function VadeAtamalariNew() {
  const {
    staff,
    assignments,
    selectedStaffId,
    setSelectedStaffId,
    selectedSector,
    setSelectedSector,
    search,
    setSearch,
    selectedCustomerIds,
    setSelectedCustomerIds,
    loading,
    saving,
    sectors,
    visibleCustomers,
    toggleCustomer,
    handleAssign,
    handleRemove,
  } = useVadeAtamalari();

  const fieldCls =
    'h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white w-full';

  const selectedStaff = staff.find((item) => item.id === selectedStaffId);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* Baslik */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">Vade Atamalari</h1>
          <p className="text-[13px] text-[#8b97ac] mt-1.5">Personel bazli cari atamalari</p>
        </div>
        {/* Ozet rozetler: secili cari + atanmis cari */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-[#eef5ff] border border-[#d6e0f1] text-[#1c4585] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
            <CheckSquare width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
            Secili: {selectedCustomerIds.size}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-[#ecfdf5] border border-[#bbf7d0] text-[#047857] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
            <CheckCircle2 width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
            Atanmis: {assignments.length}
          </span>
        </div>
      </div>

      {/* Filtre + toplu islem karti: Personel select + Sektor select + Arama */}
      <div className={`${CARD} p-4 mb-4`}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] text-[#8b97ac] font-medium">Personel</label>
            <div className="flex items-center gap-2">
              <Users width={15} height={15} stroke="#9aa6b8" strokeWidth={2} className="shrink-0" />
              <select
                className={`${fieldCls} cursor-pointer`}
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
              >
                <option value="">Personel secin</option>
                {staff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#8b97ac] font-medium">Sektor</label>
            <select
              className={`${fieldCls} cursor-pointer`}
              value={selectedSector}
              onChange={(event) => setSelectedSector(event.target.value)}
            >
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector === 'all' ? 'Tum sektorler' : sector}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-[#8b97ac] font-medium">Arama</label>
            <div className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white focus-within:border-[#15356b]">
              <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kodu veya unvan"
                className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
              />
            </div>
          </div>
        </div>

        {/* Toplu islem butonlari: Secilenleri Ata / Tumunu Sec / Temizle */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#eef1f6]">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-[#15356b] border-none rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleAssign}
            disabled={saving || loading}
          >
            {saving ? (
              <Loader2 width={15} height={15} stroke="currentColor" strokeWidth={2} className="animate-spin" />
            ) : (
              <UserPlus width={15} height={15} stroke="currentColor" strokeWidth={2} />
            )}
            {saving ? 'Kaydediliyor...' : 'Secilenleri Ata'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={() => setSelectedCustomerIds(new Set(visibleCustomers.map((customer) => customer.id)))}
            disabled={loading}
          >
            <CheckSquare width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Tumunu Sec
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={() => setSelectedCustomerIds(new Set())}
            disabled={loading}
          >
            <Eraser width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Temizle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cari secim listesi (checkbox grid) */}
        <div className={`${CARD} p-4 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#14223b]">
              <Users width={15} height={15} stroke="#15356b" strokeWidth={2.2} />
              Cari Secim Listesi
            </div>
            {!loading && (
              <span className="text-[11px] text-[#8b97ac]">{visibleCustomers.length} cari</span>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-[#8b97ac]">
              <Loader2 width={15} height={15} stroke="currentColor" strokeWidth={2} className="animate-spin" />
              Yukleniyor...
            </div>
          )}
          {!loading && visibleCustomers.length === 0 && (
            <div className="py-10 text-center text-[12.5px] text-[#8b97ac]">Cari bulunamadi.</div>
          )}
          {!loading && visibleCustomers.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {visibleCustomers.map((customer) => {
                const checked = selectedCustomerIds.has(customer.id);
                return (
                  <label
                    key={customer.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[12.5px] cursor-pointer transition-colors ${
                      checked
                        ? 'border-[#15356b] bg-[#f5f8ff]'
                        : 'border-[#e7ebf2] bg-white hover:bg-[#fafbfd]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#15356b] cursor-pointer"
                      checked={checked}
                      onChange={() => toggleCustomer(customer.id)}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-[#14223b] truncate">{customer.name}</div>
                      <div className="text-[10.5px] text-[#8b97ac] font-mono">{customer.mikroCariCode}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Mevcut Atamalar (cari + Kaldir) */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-2 mb-3 text-[13px] font-semibold text-[#14223b]">
            <ClipboardList width={15} height={15} stroke="#047857" strokeWidth={2.2} />
            Mevcut Atamalar
          </div>

          {!selectedStaffId && (
            <div className="py-8 text-center text-[12px] text-[#8b97ac]">
              Atamalari gormek icin personel secin.
            </div>
          )}
          {selectedStaffId && assignments.length === 0 && (
            <div className="py-8 text-center text-[12px] text-[#8b97ac]">Atama bulunamadi.</div>
          )}
          {selectedStaffId && assignments.length > 0 && (
            <div className="space-y-2">
              {selectedStaff && (
                <div className="text-[11px] text-[#8b97ac] mb-1">
                  {selectedStaff.name} ({selectedStaff.role})
                </div>
              )}
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#e7ebf2] bg-white px-3 py-2.5 text-[12.5px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#14223b] truncate">
                      {assignment.customer?.name || 'Cari'}
                    </div>
                    <div className="text-[10.5px] text-[#8b97ac] font-mono">
                      {assignment.customer?.mikroCariCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 bg-white border border-[#fecaca] rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2] transition-colors shrink-0"
                    onClick={() => handleRemove(assignment)}
                  >
                    <Trash2 width={13} height={13} stroke="currentColor" strokeWidth={2} />
                    Kaldir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
