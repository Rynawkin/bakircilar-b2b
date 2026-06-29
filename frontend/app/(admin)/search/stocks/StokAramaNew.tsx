'use client';

import { Search, Columns3, X } from 'lucide-react';
import { useStokArama } from './useStokArama';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Stok Arama (F10) ekrani. Mevcut TUM mantik useStokArama'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/durum dusurulmemistir; brief 4.8.4'teki her oge mevcut.
 *
 * Korunan ogeler:
 *  - Arama inputu (Enter ile ara), "Ara" butonu, "Kolonları Seç" butonu
 *  - "Tüm stokları göster" checkbox (showAll → input disable + tüm listeleme)
 *  - Hata mesaji (error)
 *  - Dinamik / kullanici-secimli kolonlu tablo; ilk 2 kolon STICKY; yatay kaydirma
 *  - Satir → Stok Detay Modal (tum kolonlar key/value, GUID haric)
 *  - Kolon Secici Modal (mevcut/secili kolonlar + Kaydet/İptal)
 *  - Sonuc sayaci
 */
export default function StokAramaNew() {
  const {
    searchTerm,
    setSearchTerm,
    stocks,
    loading,
    error,
    availableColumns,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    savingPreferences,
    showAll,
    setShowAll,
    selectedStock,
    showDetailModal,
    handleSearch,
    handleColumnToggle,
    saveColumnPreferences,
    getColumnDisplayName,
    formatValue,
    getColumnValue,
    handleRowClick,
    closeDetailModal,
  } = useStokArama();

  // Ilk 2 kolon sticky genislikleri (klasikteki 150px ofseti korunur)
  const COL0_W = 150;

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">Stok Arama</h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">
              Stok F10 · Mikro ERP entegrasyonu ile detaylı stok bilgileri · kullanıcı-seçimli kolonlar
            </div>
          </div>
        </div>

        {/* Arama bari: input + Kolonları Seç + Ara */}
        <div className={`${CARD} flex items-center gap-2.5 flex-wrap px-3.5 py-[11px] mb-3.5`}>
          <div
            className={`flex-1 min-w-[240px] flex items-center gap-2.5 h-[42px] rounded-[9px] px-3 border-2 ${
              showAll ? 'border-[#e3e8f0] bg-[#fafbfd]' : 'border-[#15356b] bg-white'
            }`}
          >
            <Search width={17} height={17} stroke={showAll ? '#9aa6b8' : '#15356b'} strokeWidth={2} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Stok kodu, ad, barkod, marka… (F10)"
              disabled={showAll}
              className="flex-1 border-none bg-transparent outline-none text-[14px] text-[#14223b] disabled:text-[#9aa6b8]"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowColumnSelector(true)}
            className="flex items-center gap-1.5 h-[42px] bg-white border border-[#d8e0ec] rounded-[9px] px-3.5 text-[12.5px] font-semibold text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
          >
            <Columns3 width={14} height={14} stroke="currentColor" strokeWidth={2} />
            Kolonları Seç
          </button>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="h-[42px] bg-[#15356b] border-none rounded-[9px] px-4 text-[12.5px] font-semibold text-white cursor-pointer hover:bg-[#1c4585] disabled:bg-[#9aa6b8] disabled:cursor-not-allowed"
          >
            {loading ? 'Aranıyor…' : 'Ara'}
          </button>
        </div>

        {/* Tüm stokları göster checkbox */}
        <div className="mb-3.5">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="w-[15px] h-[15px] cursor-pointer"
              style={{ accentColor: '#15356b' }}
            />
            <span className="text-[12.5px] text-[#51607a]">
              Tüm stokları göster (arama yapmadan tüm stokları listele)
            </span>
          </label>
        </div>

        {/* Hata */}
        {error && (
          <div className="mb-3.5 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[12.5px] rounded-[10px] px-3.5 py-2.5">
            {error}
          </div>
        )}

        {/* Sonuçlar */}
        {stocks.length > 0 && (
          <div className={`${CARD} overflow-hidden`}>
            {/* Sonuc basligi + sayac */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef1f6]">
              <span className="text-[13px] font-semibold text-[#14223b]">Sonuçlar</span>
              <span className="text-[12px] text-[#8b97ac]">{stocks.length} stok</span>
            </div>

            {/* Tablo - yatay kaydirma + ilk 2 kolon sticky */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-[#fafbfd] border-b border-[#eef1f6]">
                    {selectedColumns.map((column, idx) => (
                      <th
                        key={column}
                        className={`px-3 py-[11px] text-left text-[10px] font-semibold text-[#8b97ac] uppercase tracking-wide whitespace-nowrap ${
                          idx < 2 ? 'sticky bg-[#fafbfd] z-10' : ''
                        }`}
                        style={idx === 0 ? { left: 0 } : idx === 1 ? { left: `${COL0_W}px` } : {}}
                      >
                        {getColumnDisplayName(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, idx) => (
                    <tr
                      key={idx}
                      onClick={() => handleRowClick(stock)}
                      className="border-t border-[#f1f4f9] cursor-pointer hover:bg-[#fafbfd] group"
                    >
                      {selectedColumns.map((column, colIdx) => (
                        <td
                          key={column}
                          className={`px-3 py-[11px] text-[12px] whitespace-nowrap ${
                            colIdx === 0
                              ? 'font-semibold text-[#14223b] font-mono'
                              : 'text-[#51607a]'
                          } ${colIdx < 2 ? 'sticky bg-white z-10 group-hover:bg-[#fafbfd] border-r border-[#f1f4f9]' : ''}`}
                          style={colIdx === 0 ? { left: 0 } : colIdx === 1 ? { left: `${COL0_W}px` } : {}}
                        >
                          {getColumnValue(column, stock)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Kolon Seçici Modal */}
        {showColumnSelector && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[14px] shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-[#e7ebf2]">
              <div className="p-5 border-b border-[#eef1f6] flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#14223b] m-0">
                    Görüntülenecek Kolonları Seçin
                  </h2>
                  <p className="text-[12px] text-[#8b97ac] mt-1">
                    Seçtiğiniz kolonlar otomatik olarak kaydedilecek
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(false)}
                  className="text-[#9aa6b8] hover:text-[#51607a] cursor-pointer bg-transparent border-none p-0"
                >
                  <X width={20} height={20} stroke="currentColor" strokeWidth={2} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {availableColumns.map((column) => {
                    const checked = selectedColumns.includes(column);
                    return (
                      <label
                        key={column}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-[9px] cursor-pointer border ${
                          checked
                            ? 'bg-[#eef2fa] border-[#d6e0f1]'
                            : 'bg-white border-[#eef1f6] hover:bg-[#fafbfd]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleColumnToggle(column)}
                          className="w-[15px] h-[15px] cursor-pointer"
                          style={{ accentColor: '#15356b' }}
                        />
                        <span className="text-[12.5px] text-[#14223b]">
                          {getColumnDisplayName(column)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="p-5 border-t border-[#eef1f6] flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(false)}
                  className="bg-white border border-[#d8e0ec] rounded-[8px] px-4 py-2 text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={saveColumnPreferences}
                  disabled={savingPreferences || selectedColumns.length === 0}
                  className="bg-[#15356b] border-none rounded-[8px] px-4 py-2 text-[12.5px] font-semibold text-white cursor-pointer hover:bg-[#1c4585] disabled:bg-[#9aa6b8] disabled:cursor-not-allowed"
                >
                  {savingPreferences ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stok Detay Modal */}
        {showDetailModal && selectedStock && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[14px] shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-[#e7ebf2]">
              {/* Modal Header */}
              <div className="p-5 border-b border-[#eef1f6] flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h2 className="text-[19px] font-semibold text-[#14223b] m-0 truncate">
                    {formatValue(selectedStock['msg_S_0870'])}
                  </h2>
                  <p className="text-[12px] text-[#8b97ac] mt-1 font-mono">
                    Stok Kodu: {formatValue(selectedStock['msg_S_0078'])}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="text-[#9aa6b8] hover:text-[#51607a] cursor-pointer bg-transparent border-none p-0 flex-none"
                >
                  <X width={22} height={22} stroke="currentColor" strokeWidth={2} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-5 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                  {availableColumns.map((column) => {
                    if (column === 'msg_S_0088') return null; // GUID'i göstermeyelim

                    return (
                      <div key={column} className="border-b border-[#f1f4f9] pb-3">
                        <dt className="text-[11px] font-medium text-[#8b97ac] mb-1">
                          {getColumnDisplayName(column)}
                        </dt>
                        <dd className="text-[13.5px] text-[#14223b] font-semibold">
                          {getColumnValue(column, selectedStock)}
                        </dd>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-[#eef1f6] flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="bg-white border border-[#d8e0ec] rounded-[8px] px-5 py-2 text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa]"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
