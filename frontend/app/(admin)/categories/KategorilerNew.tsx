'use client';

import {
  Zap,
  Search,
  X,
  Pencil,
  Check,
  Tag,
  Lightbulb,
  Layers,
  Users,
  ListChecks,
  CheckCircle2,
} from 'lucide-react';
import { useKategoriler } from './useKategoriler';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Kategori Fiyatlandirma ekrani.
 * Mevcut TUM mantik useKategoriler'dan gelir; sadece gorsel yeni (claude.ai admin brief 4.13.1).
 * Hicbir handler/izin/kosul/panel/alan/buton/kolon/durum/metrik dusurulmemistir; emoji yerine lucide.
 */
export default function KategorilerNew() {
  const {
    categories,
    filteredCategories,
    isLoading,
    editingId,
    setEditingId,
    showBulkUpdate,
    setShowBulkUpdate,
    searchQuery,
    setSearchQuery,
    bulkMargin,
    setBulkMargin,
    handleSave,
    getPriceRule,
    handleBulkUpdate,
    handleCategoryBulkUpdate,
    CUSTOMER_TYPES,
  } = useKategoriler();

  const pageHeader = (
    <div className="flex items-end justify-between gap-4 mb-[18px] flex-wrap">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">
            Kategori Fiyatlandırma
          </h1>
          <span className="inline-flex items-center bg-[#f4f6fa] border border-[#e3e8f0] text-[#51607a] text-[10.5px] font-semibold px-2 py-0.5 rounded-md font-mono">
            {categories.length} Kategori
          </span>
        </div>
        <div className="text-[13px] text-[#8b97ac] mt-1.5">
          Her kategori için müşteri tipine göre kâr marjı belirleyin (%)
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowBulkUpdate(!showBulkUpdate)}
        className="flex items-center gap-2 bg-[#15356b] text-white border-none rounded-[9px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585]"
      >
        {showBulkUpdate ? (
          <X width={15} height={15} stroke="currentColor" strokeWidth={2.2} />
        ) : (
          <Zap width={15} height={15} stroke="currentColor" strokeWidth={2.2} />
        )}
        {showBulkUpdate ? 'İptal' : 'Toplu Güncelleme'}
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {pageHeader}
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="w-8 h-8 border-[3px] border-[#d6e0f1] border-t-[#15356b] rounded-full animate-spin" />
            <p className="text-[13px] text-[#8b97ac]">Kategoriler yükleniyor…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="w-full max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {pageHeader}

        {/* Toplu Güncelleme Paneli (tüm kategoriler × 4 segment + Uygula) */}
        {showBulkUpdate && (
          <div className={`${CARD} p-[18px] mb-4`}>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-8 h-8 rounded-[9px] bg-[#eef2fa] text-[#15356b] flex items-center justify-center flex-none">
                <Zap width={17} height={17} stroke="currentColor" strokeWidth={2.1} />
              </span>
              <span className="text-[14px] font-semibold text-[#14223b]">
                Tüm Kategorilerde Toplu Güncelleme
              </span>
            </div>
            <div className="flex items-start gap-2.5 bg-[#eef2fa] border border-[#d6e0f1] rounded-[10px] px-3.5 py-3 mb-4">
              <Lightbulb
                width={16}
                height={16}
                stroke="#15356b"
                strokeWidth={2}
                className="flex-none mt-0.5"
              />
              <p className="text-[12.5px] text-[#51607a] leading-relaxed m-0">
                <strong className="text-[#14223b] font-semibold">İpucu:</strong> Birden fazla müşteri
                tipi için değer girebilirsiniz. Dolu olan tüm alanlar güncellenecektir.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {CUSTOMER_TYPES.map((type) => (
                <div key={type.value} className="relative">
                  <label className="block text-[11px] text-[#8b97ac] mb-1.5 font-semibold">
                    {type.label}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={bulkMargin[type.value]}
                    onChange={(e) => setBulkMargin({ ...bulkMargin, [type.value]: e.target.value })}
                    placeholder="0"
                    className="w-full h-[38px] border border-[#e3e8f0] rounded-lg px-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#d6e0f1]"
                  />
                  {bulkMargin[type.value] && (
                    <span className="absolute top-[26px] right-2 flex items-center justify-center w-5 h-5 rounded-full bg-[#10b981] text-white">
                      <CheckCircle2 width={13} height={13} stroke="currentColor" strokeWidth={2.4} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleBulkUpdate}
              className="w-full flex items-center justify-center gap-2 bg-[#15356b] text-white border-none rounded-[9px] py-3 text-[13.5px] font-semibold cursor-pointer hover:bg-[#1c4585]"
            >
              <Zap width={16} height={16} stroke="currentColor" strokeWidth={2.2} />
              Toplu Güncellemeyi Uygula
            </button>
          </div>
        )}

        {/* Arama Kutusu */}
        <div className="mb-4">
          <div className="flex items-center gap-2.5 h-11 bg-white border border-[#e3e8f0] rounded-[10px] px-3.5">
            <Search width={16} height={16} stroke="#9aa6b8" strokeWidth={2} className="flex-none" />
            <input
              type="text"
              placeholder="Kategori adı veya kodu ile ara…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-none bg-transparent outline-none text-[13px] text-[#14223b] font-[inherit]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="flex-none text-[#9aa6b8] hover:text-[#51607a] bg-transparent border-none cursor-pointer p-0"
              >
                <X width={16} height={16} stroke="currentColor" strokeWidth={2.2} />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-[12px] text-[#8b97ac]">
              <strong className="text-[#14223b] font-semibold">{filteredCategories.length}</strong>{' '}
              kategori bulundu
            </p>
          )}
        </div>

        {/* Kategoriler Listesi */}
        {filteredCategories.length === 0 ? (
          <div className={`${CARD} px-6 py-12 text-center`}>
            <span className="w-[52px] h-[52px] rounded-[14px] bg-[#f4f6fa] flex items-center justify-center mx-auto mb-3.5">
              <Search width={24} height={24} stroke="#9aa6b8" strokeWidth={1.6} />
            </span>
            <div className="text-[14px] font-semibold text-[#14223b]">Kategori bulunamadı</div>
            <div className="text-[12px] text-[#8b97ac] mt-1.5">
              Arama kriterlerinizi değiştirmeyi deneyin
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredCategories.map((category) => (
              <div key={category.id} className={`${CARD} p-4`}>
                {/* Kategori Başlığı + kod rozeti + per-kategori toplu güncelle */}
                <div className="flex items-start justify-between gap-2.5 mb-3.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-[9px] bg-[#eef2fa] text-[#15356b] flex items-center justify-center flex-none">
                      <Tag width={17} height={17} stroke="currentColor" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#14223b] truncate">
                        {category.name}
                      </div>
                      <span className="inline-flex items-center bg-[#f4f6fa] border border-[#e3e8f0] text-[#51607a] text-[10.5px] font-semibold px-2 py-0.5 rounded-md font-mono mt-1">
                        {category.mikroCode}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCategoryBulkUpdate(category.id, category.name)}
                    className="flex-none flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#eef2fa]"
                  >
                    <Zap width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
                    Toplu Güncelle
                  </button>
                </div>

                {/* CUSTOMER_TYPES × kâr marjı % (görüntü / inline düzenle + kaydet) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {CUSTOMER_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className="bg-[#fafbfd] border border-[#eef1f6] rounded-lg p-2.5"
                    >
                      <div className="text-[10.5px] text-[#8b97ac] uppercase tracking-wide font-semibold">
                        {type.label}
                      </div>
                      {editingId === `${category.id}-${type.value}` ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <input
                            type="number"
                            step="0.1"
                            defaultValue={getPriceRule(category, type.value)}
                            id={`input-${category.id}-${type.value}`}
                            autoFocus
                            className="w-full h-8 border border-[#d8e0ec] rounded-md px-2 text-[13px] text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#bbf7d0]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById(
                                `input-${category.id}-${type.value}`
                              ) as HTMLInputElement;
                              handleSave(category.id, type.value, input.value);
                            }}
                            className="flex-none flex items-center justify-center w-8 h-8 rounded-md bg-[#10b981] text-white border-none cursor-pointer hover:bg-[#059669]"
                          >
                            <Check width={15} height={15} stroke="currentColor" strokeWidth={2.6} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1.5 mt-0.5">
                          <span className="text-[15px] font-semibold text-[#14223b]">
                            %{getPriceRule(category, type.value)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingId(`${category.id}-${type.value}`)}
                            className="flex-none flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#d8e0ec] text-[#51607a] cursor-pointer hover:bg-[#eef2fa] hover:text-[#15356b]"
                          >
                            <Pencil width={13} height={13} stroke="currentColor" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer İstatistikler (4 metrik) */}
        {filteredCategories.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-4">
            <div className={`${CARD} p-[15px] flex items-center gap-3`}>
              <span className="w-9 h-9 rounded-[9px] bg-[#eef2fa] text-[#15356b] flex items-center justify-center flex-none">
                <Layers width={17} height={17} stroke="currentColor" strokeWidth={2} />
              </span>
              <div>
                <div className="text-[20px] font-semibold text-[#14223b] leading-none">
                  {filteredCategories.length}
                </div>
                <div className="text-[11.5px] text-[#8b97ac] mt-1.5">Toplam Kategori</div>
              </div>
            </div>
            <div className={`${CARD} p-[15px] flex items-center gap-3`}>
              <span className="w-9 h-9 rounded-[9px] bg-[#ecfdf5] text-[#047857] flex items-center justify-center flex-none">
                <Users width={17} height={17} stroke="currentColor" strokeWidth={2} />
              </span>
              <div>
                <div className="text-[20px] font-semibold text-[#14223b] leading-none">
                  {CUSTOMER_TYPES.length}
                </div>
                <div className="text-[11.5px] text-[#8b97ac] mt-1.5">Müşteri Tipi</div>
              </div>
            </div>
            <div className={`${CARD} p-[15px] flex items-center gap-3`}>
              <span className="w-9 h-9 rounded-[9px] bg-[#f3f0ff] text-[#6d28d9] flex items-center justify-center flex-none">
                <ListChecks width={17} height={17} stroke="currentColor" strokeWidth={2} />
              </span>
              <div>
                <div className="text-[20px] font-semibold text-[#14223b] leading-none">
                  {filteredCategories.length * CUSTOMER_TYPES.length}
                </div>
                <div className="text-[11.5px] text-[#8b97ac] mt-1.5">Toplam Fiyat Kuralı</div>
              </div>
            </div>
            <div className={`${CARD} p-[15px] flex items-center gap-3`}>
              <span className="w-9 h-9 rounded-[9px] bg-[#fffbeb] text-[#b45309] flex items-center justify-center flex-none">
                <CheckCircle2 width={17} height={17} stroke="currentColor" strokeWidth={2} />
              </span>
              <div>
                <div className="text-[20px] font-semibold text-[#14223b] leading-none">
                  {filteredCategories.reduce((acc, cat) => acc + (cat.priceRules?.length || 0), 0)}
                </div>
                <div className="text-[11.5px] text-[#8b97ac] mt-1.5">Aktif Kural</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
