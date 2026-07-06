'use client';

import {
  Search,
  Filter,
  FileUp,
  FileSpreadsheet,
  StickyNote,
  CalendarClock,
  Users,
  RefreshCw,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Layers,
  LayoutDashboard,
} from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { useVadeTakip } from './useVadeTakip';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Vade Takip ekrani. Mevcut TUM mantik useVadeTakip'ten gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/kolon/durum/rozet/sayfalama dusurulmemistir; brief 4.7.1'deki her oge mevcut.
 */
export default function VadeTakipNew() {
  const {
    router,
    balances,
    loading,
    pagination,
    setPagination,
    search,
    setSearch,
    overdueOnly,
    setOverdueOnly,
    upcomingOnly,
    setUpcomingOnly,
    hasNotes,
    setHasNotes,
    filtersOpen,
    setFiltersOpen,
    sectorCode,
    setSectorCode,
    groupCode,
    setGroupCode,
    minBalance,
    setMinBalance,
    maxBalance,
    setMaxBalance,
    notesKeyword,
    setNotesKeyword,
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    handleSort,
    totals,
    filterOptions,
    syncing,
    exporting,
    handleSync,
    handleExport,
  } = useVadeTakip();

  // Yeni stil tablo basligi: siralama gostergesi lucide ikon ile (mevcut getSortIndicator metni yerine gorsel)
  const sortIcon = (key: string) => {
    if (sortBy !== key) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp width={12} height={12} stroke="currentColor" strokeWidth={2.4} className="inline-block ml-1 -mt-0.5" />
    ) : (
      <ChevronDown width={12} height={12} stroke="currentColor" strokeWidth={2.4} className="inline-block ml-1 -mt-0.5" />
    );
  };

  // Ust bar aksiyon butonu (cevreleyici stil — outline)
  const headerBtn =
    'inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  // Toggle filtre butonu — aktif: primary, pasif: outline
  const toggleBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
      active
        ? 'bg-[#15356b] border border-[#15356b] text-white hover:bg-[#1c4585]'
        : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'
    }`;

  const fieldCls =
    'h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12px] text-[#14223b] outline-none focus:border-[#15356b] bg-white w-full';

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* Baslik + ust bar aksiyonlari (mevcut 6 buton bire bir korunur) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">Vade Takip</h1>
          <p className="text-[13px] text-[#8b97ac] mt-1.5">Mikro kaynakli vade ve alacak listesi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={headerBtn} onClick={() => router.push('/vade/dashboard')}>
            <LayoutDashboard width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Panel
          </button>
          <button type="button" className={headerBtn} onClick={() => router.push('/vade/import')}>
            <FileUp width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Excel Import
          </button>
          <button type="button" className={headerBtn} onClick={handleExport} disabled={exporting}>
            <FileSpreadsheet width={15} height={15} stroke="currentColor" strokeWidth={2} />
            {exporting ? 'Hazirlaniyor...' : 'Excel Indir'}
          </button>
          <button type="button" className={headerBtn} onClick={() => router.push('/vade/notes')}>
            <StickyNote width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Not Raporu
          </button>
          <button type="button" className={headerBtn} onClick={() => router.push('/vade/calendar')}>
            <CalendarClock width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Hatirlatma
          </button>
          <button type="button" className={headerBtn} onClick={() => router.push('/vade/assignments')}>
            <Users width={15} height={15} stroke="currentColor" strokeWidth={2} />
            Atamalar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-[#15356b] border-none rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw
              width={15}
              height={15}
              stroke="currentColor"
              strokeWidth={2}
              className={syncing ? 'animate-spin' : ''}
            />
            {syncing ? 'Senkronize...' : 'Senkronize Et'}
          </button>
        </div>
      </div>

      {/* 4 ozet karti */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        <div className={`${CARD} p-4`}>
          <div className="text-[12px] text-[#51607a] font-medium">Toplam Cari</div>
          <div className="text-[23px] font-semibold text-[#14223b] mt-2">{totals.count}</div>
        </div>
        <div className="bg-white border border-[#fecaca] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#b91c1c] font-medium">
            <AlertTriangle width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
            Vadesi Gecen
          </div>
          <div className="text-[23px] font-semibold text-[#b91c1c] mt-2">{formatCurrency(totals.overdue)}</div>
        </div>
        <div className="bg-white border border-[#d6e0f1] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#1c4585] font-medium">
            <AlertTriangle width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
            Vadesi Gelmemis
          </div>
          <div className="text-[23px] font-semibold text-[#1c4585] mt-2">{formatCurrency(totals.upcoming)}</div>
        </div>
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[12px] text-[#51607a] font-medium">
            <Wallet width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
            Toplam Bakiye
          </div>
          <div className="text-[23px] font-semibold text-[#14223b] mt-2">{formatCurrency(totals.total)}</div>
        </div>
      </div>

      {/* Yaslandirma kovalari + oncelik (Pareto) — vadesi gecen alacak gorunurlugu */}
      {totals.overdue > 0 && totals.aging && (
        <div className={`${CARD} p-4 mb-4`}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14223b]">
              <Layers width={14} height={14} stroke="currentColor" strokeWidth={2.2} />
              Vadesi Gecen Yaslandirma
            </div>
            <button
              type="button"
              onClick={() => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setOverdueOnly(true);
                setUpcomingOnly(false);
                setSortBy('pastDueBalance');
                setSortDirection('desc');
              }}
              className="inline-flex items-center gap-1.5 bg-[#15356b] border-none rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1c4585] transition-colors"
            >
              Once Ara Listesi
              <ArrowRight width={14} height={14} stroke="currentColor" strokeWidth={2.2} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {([
              { key: 'd0_30', label: '1-30 gun', cls: 'border-[#cfe6d6] bg-[#f2f9f4] text-[#166534]' },
              { key: 'd31_60', label: '31-60 gun', cls: 'border-[#e6ecc9] bg-[#f8faee] text-[#5c6a12]' },
              { key: 'd61_90', label: '61-90 gun', cls: 'border-[#fbe6c4] bg-[#fdf8ef] text-[#9a5b0c]' },
              { key: 'd91_180', label: '91-180 gun', cls: 'border-[#fbdcbf] bg-[#fdf4ec] text-[#b4530f]' },
              { key: 'd181_365', label: '181-365 gun', cls: 'border-[#fccfcf] bg-[#fdf1f1] text-[#b3312f]' },
              { key: 'd365plus', label: '365+ gun', cls: 'border-[#f6bcbc] bg-[#fdecec] text-[#991b1b]' },
            ] as const).map((cell) => {
              const bucket = totals.aging?.[cell.key];
              return (
                <div key={cell.key} className={`border rounded-lg p-2.5 ${cell.cls}`}>
                  <div className="text-[11px] font-medium opacity-80">{cell.label}</div>
                  <div className="text-[15px] font-semibold mt-1 leading-tight">{formatCurrency(bucket?.amount || 0)}</div>
                  <div className="text-[10.5px] opacity-70 mt-0.5">{bucket?.count || 0} cari</div>
                </div>
              );
            })}
          </div>
          {totals.concentration && totals.concentration.overdueCount > 0 && (
            <div className="mt-3 flex items-start gap-1.5 text-[12px] text-[#51607a] bg-[#f7f9fc] border border-[#e7ebf2] rounded-lg px-3 py-2">
              <AlertTriangle width={13} height={13} stroke="#b4530f" strokeWidth={2.2} className="mt-0.5 flex-shrink-0" />
              <span>
                Vadesi gecmis <b className="text-[#14223b]">{totals.concentration.overdueCount}</b> cariden en buyuk{' '}
                <b className="text-[#14223b]">20</b>&apos;si toplamin{' '}
                <b className="text-[#b91c1c]">%{totals.overdue > 0 ? Math.round((totals.concentration.top20 / totals.overdue) * 100) : 0}</b>&apos;ini,{' '}
                <b className="text-[#14223b]">50</b>&apos;si{' '}
                <b className="text-[#b91c1c]">%{totals.overdue > 0 ? Math.round((totals.concentration.top50 / totals.overdue) * 100) : 0}</b>&apos;ini olusturuyor. Once bunlari ara.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Arama + toggle filtreler + Temizle */}
      <div className={`${CARD} p-3.5 mb-3.5`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white md:max-w-sm w-full">
            <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
            <input
              placeholder="Cari kodu, unvan, sektor..."
              value={search}
              onChange={(event) => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setSearch(event.target.value);
              }}
              className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={toggleBtn(overdueOnly)}
              onClick={() => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setOverdueOnly((prev) => !prev);
              }}
            >
              Vadesi Gecen
            </button>
            <button
              type="button"
              className={toggleBtn(upcomingOnly)}
              onClick={() => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setUpcomingOnly((prev) => !prev);
              }}
            >
              Vadesi Gelmemis
            </button>
            <button
              type="button"
              className={toggleBtn(hasNotes)}
              onClick={() => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setHasNotes((prev) => !prev);
              }}
            >
              Notu Olan
            </button>
            <button type="button" className={toggleBtn(filtersOpen)} onClick={() => setFiltersOpen((prev) => !prev)}>
              <Filter width={14} height={14} stroke="currentColor" strokeWidth={2} />
              Filtreler
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#8b97ac] hover:bg-[#f4f6fa] transition-colors"
              onClick={() => {
                setSearch('');
                setOverdueOnly(false);
                setUpcomingOnly(false);
                setSectorCode('');
                setGroupCode('');
                setMinBalance('');
                setMaxBalance('');
                setHasNotes(false);
                setNotesKeyword('');
                setSortBy('pastDueBalance');
                setSortDirection('desc');
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <X width={14} height={14} stroke="currentColor" strokeWidth={2} />
              Temizle
            </button>
          </div>
        </div>

        {/* Genisletilebilir filtre paneli */}
        {filtersOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3.5 pt-3.5 border-t border-[#eef1f6]">
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Sektor</label>
              <select
                className={`${fieldCls} cursor-pointer`}
                value={sectorCode}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSectorCode(event.target.value);
                }}
              >
                <option value="">Tum sektorler</option>
                {filterOptions.sectorCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Grup</label>
              <select
                className={`${fieldCls} cursor-pointer`}
                value={groupCode}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setGroupCode(event.target.value);
                }}
              >
                <option value="">Tum gruplar</option>
                {filterOptions.groupCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Siralama</label>
              <select
                className={`${fieldCls} cursor-pointer`}
                value={sortBy}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSortBy(event.target.value);
                }}
              >
                <option value="customerName">Cari</option>
                <option value="mikroCariCode">Cari Kodu</option>
                <option value="sectorCode">Sektor</option>
                <option value="groupCode">Grup</option>
                <option value="pastDueBalance">Vadesi Gecen</option>
                <option value="pastDueDate">Vade Tarihi (Gecen)</option>
                <option value="notDueBalance">Vadesi Gelmemis</option>
                <option value="notDueDate">Vade Tarihi (Gelmemis)</option>
                <option value="totalBalance">Toplam</option>
                <option value="valor">Valor</option>
                <option value="lastNoteAt">Son Not</option>
                <option value="updatedAt">Guncel</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Yon</label>
              <select
                className={`${fieldCls} cursor-pointer`}
                value={sortDirection}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSortDirection(event.target.value as 'asc' | 'desc');
                }}
              >
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Min Bakiye</label>
              <input
                type="number"
                className={fieldCls}
                value={minBalance}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setMinBalance(event.target.value);
                }}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#8b97ac] font-medium">Max Bakiye</label>
              <input
                type="number"
                className={fieldCls}
                value={maxBalance}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setMaxBalance(event.target.value);
                }}
                placeholder="0"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="text-[11px] text-[#8b97ac] font-medium">Not Icerigi</label>
              <div className="flex items-center gap-2 h-9 border border-[#e3e8f0] rounded-lg px-2.5 bg-white">
                <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                <input
                  className="flex-1 border-none bg-transparent outline-none text-[12px] text-[#14223b]"
                  value={notesKeyword}
                  onChange={(event) => {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    setNotesKeyword(event.target.value);
                  }}
                  placeholder="Not icinde ara..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tablo (siralanabilir) — TUM kolonlar korunur: Cari, Sektor, Vadesi Gecen, Vade, Vadesi Gelmemis, Vade, Toplam, Valor, Son Not, Plan, Guncel */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-[12px]">
            <thead>
              <tr className="bg-[#fafbfd] border-b border-[#eef1f6] text-[10px] font-semibold text-[#8b97ac] uppercase">
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('customerName')}
                >
                  Cari{sortIcon('customerName')}
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('sectorCode')}
                >
                  Sektor{sortIcon('sectorCode')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('pastDueBalance')}
                >
                  Vadesi Gecen{sortIcon('pastDueBalance')}
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('pastDueDate')}
                >
                  Vade Tarihi{sortIcon('pastDueDate')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('notDueBalance')}
                >
                  Vadesi Gelmemis{sortIcon('notDueBalance')}
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('notDueDate')}
                >
                  Vade Tarihi{sortIcon('notDueDate')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('totalBalance')}
                >
                  Toplam{sortIcon('totalBalance')}
                </th>
                <th
                  className="px-4 py-3 text-center cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('valor')}
                >
                  Valor{sortIcon('valor')}
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('lastNoteAt')}
                >
                  Son Not{sortIcon('lastNoteAt')}
                </th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:text-[#51607a]"
                  onClick={() => handleSort('updatedAt')}
                >
                  Guncel{sortIcon('updatedAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-[#8b97ac]">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw width={15} height={15} stroke="currentColor" strokeWidth={2} className="animate-spin" />
                      Yukleniyor...
                    </div>
                  </td>
                </tr>
              )}
              {!loading && balances.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-[#8b97ac]">
                    Sonuc bulunamadi.
                  </td>
                </tr>
              )}
              {!loading &&
                balances.map((balance) => (
                  <tr
                    key={balance.id}
                    className="border-t border-[#f1f4f9] text-[#14223b] hover:bg-[#fafbfd] cursor-pointer"
                    onClick={() => router.push(`/vade/customers/${balance.user.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#14223b]">
                        {balance.user.displayName || balance.user.mikroName || balance.user.name || '-'}
                      </div>
                      <div className="text-[10.5px] text-[#8b97ac] font-mono">{balance.user.mikroCariCode}</div>
                    </td>
                    <td className="px-4 py-3 text-[#51607a]">
                      <div>{balance.user.sectorCode || '-'}</div>
                      {balance.user.groupCode && (
                        <div className="text-[10.5px] text-[#8b97ac]">{balance.user.groupCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={balance.pastDueBalance > 0 ? 'text-[#b91c1c] font-semibold' : 'text-[#51607a]'}>
                        {formatCurrency(balance.pastDueBalance || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#51607a]">
                      {balance.pastDueDate ? formatDateShort(balance.pastDueDate) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={balance.notDueBalance > 0 ? 'text-[#1c4585] font-semibold' : 'text-[#51607a]'}>
                        {formatCurrency(balance.notDueBalance || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#51607a]">
                      {balance.notDueDate ? formatDateShort(balance.notDueDate) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(balance.totalBalance || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {balance.valor > 0 ? (
                        <span className="inline-flex items-center bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[10.5px] font-semibold px-2 py-0.5 rounded-full">
                          {balance.valor} gun
                        </span>
                      ) : (
                        <span className="text-[#8b97ac]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10.5px] text-[#8b97ac]">
                      {balance.lastNoteAt ? (
                        <div>
                          <div className="text-[#51607a]">{formatDateShort(balance.lastNoteAt)}</div>
                          <div>
                            {Math.max(
                              0,
                              Math.floor(
                                (new Date().getTime() - new Date(balance.lastNoteAt).getTime()) /
                                  (24 * 60 * 60 * 1000)
                              )
                            )}{' '}
                            gun once
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#51607a]">
                      {balance.paymentTermLabel || balance.user.paymentPlanName || '-'}
                    </td>
                    <td className="px-4 py-3 text-[10.5px] text-[#8b97ac]">
                      {balance.updatedAt ? formatDateShort(balance.updatedAt) : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between mt-3.5">
        <span className="text-[11.5px] text-[#8b97ac]">Toplam {pagination.total} kayit</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center bg-white border border-[#d8e0ec] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
          >
            Onceki
          </button>
          <button
            type="button"
            className="inline-flex items-center bg-white border border-[#d8e0ec] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
