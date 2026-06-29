'use client';

import { Plus, Pencil, Trash2, RefreshCw, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useDislamaKurallari,
  EXCLUSION_TYPE_LABELS,
  normalizeProductCode,
  type Exclusion,
  type ExclusionType,
} from './useDislamaKurallari';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Dislama Kurallari ekrani. Mevcut TUM mantik useDislamaKurallari'dan gelir;
 * sadece gorsel yeni. Hicbir handler/izin/kosul/modal/kolon/durum/buton dusurulmemistir;
 * brief 4.13.2'deki her oge mevcut ve eski handler'a bagli.
 */
export default function DislamaKurallariNew() {
  const {
    exclusions,
    loading,
    error,
    modalOpen,
    editingExclusion,
    formType,
    setFormType,
    formValue,
    setFormValue,
    formDescription,
    setFormDescription,
    formActive,
    setFormActive,
    confirmDialog,
    setConfirmDialog,
    productSearch,
    setProductSearch,
    productSearchLoading,
    productSearchResults,
    productExclusionMap,
    activeProductExclusions,
    fetchExclusions,
    handleOpenModal,
    handleCloseModal,
    handleSubmit,
    handleDelete,
    handleToggleActive,
    handleQuickExclude,
    handleQuickUnexclude,
  } = useDislamaKurallari();

  // Tip rozeti (yeni stil) — primary tonlu nötr rozet
  const renderTypeBadge = (type: ExclusionType) => (
    <span className="inline-flex flex-col leading-tight">
      <span className="inline-flex items-center bg-[#eef2fa] border border-[#d6e0f1] text-[#15356b] text-[11px] font-semibold px-2.5 py-1 rounded-full w-fit">
        {EXCLUSION_TYPE_LABELS[type]}
      </span>
      <span className="text-[10px] text-[#8b97ac] font-[Roboto_Mono,monospace] mt-1">{type}</span>
    </span>
  );

  // Durum rozeti/toggle — Aktif emerald / Pasif nötr (tiklanabilir, handleToggleActive)
  const renderStatusToggle = (exclusion: Exclusion) => (
    <button
      type="button"
      onClick={() => handleToggleActive(exclusion)}
      className={
        exclusion.active
          ? 'inline-flex items-center bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#d1fae5] transition-colors'
          : 'inline-flex items-center bg-[#f4f6fa] border border-[#e3e8f0] text-[#64748b] text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#eef1f6] transition-colors'
      }
    >
      {exclusion.active ? 'Aktif' : 'Pasif'}
    </button>
  );

  return (
    <>
      <div className="max-w-[1200px] mx-auto px-6 pb-10">
        {/* Sayfa basligi + Yeni Kural */}
        <div className="flex items-end justify-between gap-4 my-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#14223b] m-0">
              Dislama Kurallari
            </h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">
              Dislanan urunler musteride gorunmez ve raporlarda yer almaz.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-1.5 bg-[#15356b] hover:bg-[#1c4585] text-white border-none rounded-[9px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer transition-colors"
          >
            <Plus width={15} height={15} stroke="currentColor" strokeWidth={2.2} />
            Yeni Kural
          </button>
        </div>

        {/* Hizli Urun Dislama */}
        <div className="bg-[#eef2fa] border border-[#d6e0f1] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-[13px] font-semibold text-[#14223b]">Hizli Urun Dislama</span>
            <span className="text-[12px] text-[#51607a]">
              Aktif dislanan:{' '}
              <b className="text-[#14223b] font-semibold">{activeProductExclusions.length}</b>
            </span>
          </div>
          <div className="text-[12px] text-[#51607a] mb-3">
            Mikro urun koduna gore ara, tek tikla disla veya geri al.
          </div>

          <div className="flex items-center gap-2 h-9 border border-[#d6e0f1] rounded-lg px-3 bg-white">
            <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Urun ara (kod veya ad)"
              className="flex-1 border-none bg-transparent outline-none text-[12.5px] text-[#14223b]"
            />
          </div>

          <div className="mt-3 bg-white border border-[#e7ebf2] rounded-[10px] overflow-hidden">
            {productSearchLoading ? (
              <div className="px-4 py-6 text-sm text-[#8b97ac]">Urunler yukleniyor...</div>
            ) : productSearchResults.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#8b97ac]">Urun bulunamadi</div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-[#f1f4f9]">
                {productSearchResults.map((product) => {
                  const code = normalizeProductCode(product.mikroCode);
                  const existingRules = productExclusionMap.get(code) || [];
                  const isExcluded = existingRules.some((rule) => rule.active);

                  return (
                    <div
                      key={product.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[13px] text-[#14223b] truncate">
                          {product.name}
                        </div>
                        <div className="text-[11px] text-[#8b97ac] mt-0.5">
                          <code className="font-[Roboto_Mono,monospace] text-[#51607a]">{code}</code>
                          {product.category?.name ? ` - ${product.category.name}` : ''}
                        </div>
                      </div>
                      {isExcluded ? (
                        <button
                          type="button"
                          onClick={() => handleQuickUnexclude(code)}
                          className="bg-white border border-[#d8e0ec] hover:bg-[#eef2fa] text-[#15356b] rounded-[7px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-colors whitespace-nowrap"
                        >
                          Geri Al
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleQuickExclude(product)}
                          className="bg-[#fef2f2] border border-[#fecaca] hover:bg-[#fee2e2] text-[#b91c1c] rounded-[7px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-colors whitespace-nowrap"
                        >
                          Disla
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Kurallar tablosu */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#eef1f6] flex-wrap">
            <div>
              <span className="text-[14px] font-semibold text-[#14223b]">
                Kurallar ({exclusions.length})
              </span>
              <div className="text-[12px] text-[#8b97ac] mt-0.5">
                Aktif kurallar sistemde ilgili kayitlari dislar.
              </div>
            </div>
            <button
              type="button"
              onClick={fetchExclusions}
              className="inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] hover:bg-[#eef2fa] text-[#15356b] rounded-[7px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-colors"
            >
              <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} />
              Yenile
            </button>
          </div>

          {loading ? (
            <div className="text-center py-10 text-[13px] text-[#8b97ac]">Yukleniyor...</div>
          ) : error ? (
            <div className="text-center py-10 text-[13px] text-[#b91c1c]">{error}</div>
          ) : exclusions.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-[#8b97ac]">
              Henuz kural olusturulmamis
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                {/* Baslik satiri */}
                <div className="grid grid-cols-[1.2fr_1.4fr_2fr_100px_1fr_120px] gap-2.5 px-4 py-3 bg-[#fafbfd] border-b border-[#eef1f6] text-[10px] font-semibold text-[#8b97ac] uppercase tracking-[0.03em] items-center">
                  <span>Tip</span>
                  <span>Deger</span>
                  <span>Aciklama</span>
                  <span className="text-center">Durum</span>
                  <span>Tarih</span>
                  <span className="text-center">Islemler</span>
                </div>
                {/* Veri satirlari */}
                {exclusions.map((exclusion) => (
                  <div
                    key={exclusion.id}
                    className="grid grid-cols-[1.2fr_1.4fr_2fr_100px_1fr_120px] gap-2.5 px-4 py-3 border-t border-[#f1f4f9] text-[12px] text-[#14223b] items-center"
                  >
                    <span>{renderTypeBadge(exclusion.type)}</span>
                    <span>
                      <code className="bg-[#f4f6fa] border border-[#e7ebf2] font-[Roboto_Mono,monospace] text-[#51607a] px-2 py-1 rounded text-[12px]">
                        {exclusion.value}
                      </code>
                    </span>
                    <span className="text-[#51607a] truncate" title={exclusion.description || '-'}>
                      {exclusion.description || '-'}
                    </span>
                    <span className="text-center">{renderStatusToggle(exclusion)}</span>
                    <span className="text-[#51607a]">
                      {new Date(exclusion.createdAt).toLocaleDateString('tr-TR')}
                    </span>
                    <span className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(exclusion)}
                        title="Duzenle"
                        className="inline-flex items-center justify-center w-8 h-8 bg-white border border-[#d8e0ec] hover:bg-[#eef2fa] text-[#15356b] rounded-[7px] cursor-pointer transition-colors"
                      >
                        <Pencil width={14} height={14} stroke="currentColor" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(exclusion.id)}
                        title="Sil"
                        className="inline-flex items-center justify-center w-8 h-8 bg-white border border-[#fecaca] hover:bg-[#fee2e2] text-[#b91c1c] rounded-[7px] cursor-pointer transition-colors"
                      >
                        <Trash2 width={14} height={14} stroke="currentColor" strokeWidth={2} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal — mevcut Modal komponenti (parite icin) */}
      <Modal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        title={editingExclusion ? 'Kurali Duzenle' : 'Yeni Dislama Kurali'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Iptal
            </Button>
            <Button onClick={handleSubmit}>{editingExclusion ? 'Guncelle' : 'Olustur'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="type" className="block text-[12px] font-semibold text-[#51607a]">
              Kural Tipi
            </label>
            <select
              id="type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as ExclusionType)}
              disabled={!!editingExclusion}
              className="w-full h-[38px] border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] disabled:bg-[#f4f6fa] disabled:text-[#8b97ac] disabled:cursor-not-allowed cursor-pointer"
            >
              {Object.entries(EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="value" className="block text-[12px] font-semibold text-[#51607a]">
              Deger
            </label>
            <input
              id="value"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={formType === 'PRODUCT_CODE' ? 'Orn: B106430' : 'Deger girin'}
              required
              className="w-full h-[38px] border border-[#e3e8f0] rounded-lg px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="block text-[12px] font-semibold text-[#51607a]">
              Aciklama (Opsiyonel)
            </label>
            <textarea
              id="description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Bu kural neden olusturuldu?"
              rows={3}
              className="w-full rounded-lg border border-[#e3e8f0] px-3 py-2 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
            />
          </div>

          {editingExclusion && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="active"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="w-4 h-4 accent-[#15356b] rounded border-[#d8e0ec]"
              />
              <span className="text-[12.5px] font-semibold text-[#51607a]">Kural aktif</span>
            </label>
          )}
        </form>
      </Modal>

      {/* Onay diyalogu — mevcut ConfirmDialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="Iptal"
      />
    </>
  );
}
