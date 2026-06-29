'use client';

import { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Plus, Pencil, Trash2, Tag, AlertTriangle, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useKampanyalar } from './useKampanyalar';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INPUT =
  'w-full h-[38px] border border-[#e3e8f0] rounded-lg px-[11px] text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15';
const LABEL = 'block text-[11px] text-[#8b97ac] mb-[5px]';

/**
 * Yeni gorunum Kampanya Yonetimi. Mevcut TUM mantik useKampanyalar'tan gelir; sadece gorsel yeni.
 * Hicbir handler/alan/buton/modal/durum dusurulmemistir. (Brief 4.10.2 + design "Kampanyalar" blogu)
 */
export default function KampanyalarNew() {
  const {
    campaigns,
    loading,
    isModalOpen,
    setIsModalOpen,
    editingCampaign,
    formData,
    setFormData,
    handleSubmit,
    handleCloseModal,
    handleEdit,
    handleDelete,
    confirmDialog,
    setConfirmDialog,
    getCampaignTypeLabel,
    formatDiscountValue,
    formatCurrency,
    formatDate,
  } = useKampanyalar();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#15356b]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <div className="container-custom py-8">
        {/* Baslik + Yeni Kampanya */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-[18px]">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">
              Kampanyalar
            </h1>
            <div className="text-[13px] text-[#8b97ac] mt-[5px]">
              İndirim kampanyaları · hedef ürün/kategori/müşteri tipi
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-[7px] bg-[#15356b] hover:bg-[#1c4585] text-white border-none rounded-[9px] px-4 py-[10px] text-[13px] font-semibold cursor-pointer transition-colors"
          >
            <Plus width={15} height={15} strokeWidth={2.2} />
            Yeni Kampanya
          </button>
        </div>

        {/* Bos durum / kart grid */}
        {campaigns.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center justify-center text-center px-6 py-[60px]`}>
            <span className="w-[56px] h-[56px] rounded-[14px] bg-[#eef2fa] flex items-center justify-center mb-4">
              <Tag width={26} height={26} stroke="#15356b" strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-semibold text-[#14223b] mb-1">
              Henüz kampanya oluşturulmamış.
            </p>
            <p className="text-[12.5px] text-[#8b97ac] mb-4 max-w-[420px]">
              Dinamik indirim ve kampanya sistemi ile ilk kampanyanızı oluşturun.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-[7px] bg-[#15356b] hover:bg-[#1c4585] text-white border-none rounded-[9px] px-5 py-[11px] text-[13.5px] font-semibold cursor-pointer transition-colors"
            >
              <Plus width={15} height={15} strokeWidth={2.2} />
              İlk Kampanyayı Oluştur
            </button>
          </div>
        ) : (
          <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className={`${CARD} p-4`}>
                {/* Ad + durum rozeti */}
                <div className="flex items-center justify-between gap-2 mb-[9px]">
                  <span className="text-[15px] font-semibold text-[#14223b]">
                    {campaign.name}
                  </span>
                  {campaign.active ? (
                    <span className="bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[10px] font-semibold px-[7px] py-[2px] rounded-md">
                      Aktif
                    </span>
                  ) : (
                    <span className="bg-[#f4f6fa] border border-[#e3e8f0] text-[#51607a] text-[10px] font-semibold px-[7px] py-[2px] rounded-md">
                      Pasif
                    </span>
                  )}
                </div>

                {/* Aciklama */}
                {campaign.description && (
                  <div className="text-[12px] text-[#8b97ac] leading-[1.45] mb-3">
                    {campaign.description}
                  </div>
                )}

                {/* Detaylar */}
                <div className="grid grid-cols-2 gap-2 text-[11.5px] mb-3">
                  <div>
                    <span className="text-[#8b97ac]">Tip:</span>{' '}
                    <b className="text-[#14223b] font-semibold">
                      {getCampaignTypeLabel(campaign.type)}
                    </b>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <AlertTriangle width={11} height={11} stroke="#d97706" strokeWidth={2} />
                    <span className="text-[#8b97ac]">İndirim:</span>{' '}
                    <b className="text-[#047857] font-semibold">
                      {formatDiscountValue(campaign)}
                    </b>
                  </div>
                  {campaign.minOrderAmount && (
                    <div>
                      <span className="text-[#8b97ac]">Min:</span>{' '}
                      <b className="text-[#14223b] font-semibold">
                        {formatCurrency(campaign.minOrderAmount)}
                      </b>
                    </div>
                  )}
                  {campaign.maxDiscountAmount && (
                    <div>
                      <span className="text-[#8b97ac]">Maks:</span>{' '}
                      <b className="text-[#14223b] font-semibold">
                        {formatCurrency(campaign.maxDiscountAmount)}
                      </b>
                    </div>
                  )}
                  <div>
                    <span className="text-[#8b97ac]">Başlangıç:</span>{' '}
                    <b className="text-[#14223b] font-semibold">{formatDate(campaign.startDate)}</b>
                  </div>
                  <div>
                    <span className="text-[#8b97ac]">Bitiş:</span>{' '}
                    <b className="text-[#14223b] font-semibold">{formatDate(campaign.endDate)}</b>
                  </div>
                </div>

                {/* Aksiyonlar */}
                <div className="flex gap-2 border-t border-[#f1f4f9] pt-[11px]">
                  <button
                    type="button"
                    onClick={() => handleEdit(campaign)}
                    className="flex-1 flex items-center justify-center gap-[6px] bg-white hover:bg-[#eef2fa] border border-[#d8e0ec] rounded-lg py-[7px] text-[12px] font-semibold text-[#15356b] cursor-pointer transition-colors"
                  >
                    <Pencil width={13} height={13} strokeWidth={2} />
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(campaign.id)}
                    className="flex items-center justify-center gap-[6px] bg-white hover:bg-[#fef2f2] border border-[#fecaca] rounded-lg px-[11px] py-[7px] text-[12px] font-semibold text-[#b91c1c] cursor-pointer transition-colors"
                  >
                    <Trash2 width={13} height={13} strokeWidth={2} />
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal (yeni gorsel; mevcut alan/handler birebir korunur) */}
        <Transition show={isModalOpen} as={Fragment}>
          <Dialog onClose={handleCloseModal} className="relative z-50">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-[rgba(12,16,30,0.5)]" aria-hidden="true" />
            </TransitionChild>

            <div className="fixed inset-0 flex items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="bg-white rounded-[14px] shadow-[0_30px_70px_rgba(0,0,0,0.32)] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  {/* Modal baslik */}
                  <div className="flex items-center justify-between gap-3 px-[20px] py-4 border-b border-[#eef1f6]">
                    <DialogTitle className="text-[16px] font-semibold text-[#14223b] m-0">
                      {editingCampaign ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
                    </DialogTitle>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="w-8 h-8 border border-[#e7ebf2] rounded-lg bg-white text-[#51607a] hover:bg-[#f4f6fa] cursor-pointer flex items-center justify-center transition-colors"
                    >
                      <X width={16} height={16} strokeWidth={2} />
                    </button>
                  </div>

                  <div className="p-[20px]">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div>
                        <label className={LABEL}>Kampanya Adı *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          className={INPUT}
                        />
                      </div>

                      <div>
                        <label className={LABEL}>Açıklama</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({ ...formData, description: e.target.value })
                          }
                          rows={3}
                          className="w-full border border-[#e3e8f0] rounded-lg px-[11px] py-2 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15 resize-y"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={`${LABEL} flex items-center gap-1`}>
                            <AlertTriangle width={11} height={11} stroke="#d97706" strokeWidth={2} />
                            Kampanya Tipi *
                          </label>
                          <select
                            value={formData.type}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                type: e.target.value as any,
                              })
                            }
                            className={`${INPUT} cursor-pointer`}
                          >
                            <option value="PERCENTAGE">Yüzde İndirim</option>
                            <option value="FIXED_AMOUNT">Sabit Tutar İndirim</option>
                            <option value="BUY_X_GET_Y">X Al Y Öde</option>
                          </select>
                        </div>

                        <div>
                          <label className={`${LABEL} flex items-center gap-1`}>
                            <AlertTriangle width={11} height={11} stroke="#d97706" strokeWidth={2} />
                            İndirim Değeri *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.discountValue}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                discountValue: parseFloat(e.target.value),
                              })
                            }
                            placeholder={
                              formData.type === 'PERCENTAGE'
                                ? '0.15 (%15 için)'
                                : '50 (50 TL için)'
                            }
                            className={INPUT}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={LABEL}>Minimum Sipariş Tutarı (TL)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.minOrderAmount || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                minOrderAmount: e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              })
                            }
                            className={INPUT}
                          />
                        </div>

                        <div>
                          <label className={LABEL}>Maksimum İndirim Tutarı (TL)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.maxDiscountAmount || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                maxDiscountAmount: e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              })
                            }
                            className={INPUT}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={LABEL}>Başlangıç Tarihi *</label>
                          <input
                            type="date"
                            required
                            value={formData.startDate}
                            onChange={(e) =>
                              setFormData({ ...formData, startDate: e.target.value })
                            }
                            className={INPUT}
                          />
                        </div>

                        <div>
                          <label className={LABEL}>Bitiş Tarihi *</label>
                          <input
                            type="date"
                            required
                            value={formData.endDate}
                            onChange={(e) =>
                              setFormData({ ...formData, endDate: e.target.value })
                            }
                            className={INPUT}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.active}
                            onChange={(e) =>
                              setFormData({ ...formData, active: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-[#d8e0ec] [accent-color:#15356b]"
                          />
                          <span className="text-[12.5px] font-medium text-[#14223b]">
                            Kampanya Aktif
                          </span>
                        </label>
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-[#eef1f6]">
                        <button
                          type="button"
                          onClick={handleCloseModal}
                          className="bg-white hover:bg-[#f4f6fa] border border-[#d8e0ec] rounded-lg px-4 py-[10px] text-[12.5px] font-semibold text-[#51607a] cursor-pointer transition-colors"
                        >
                          İptal
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-[#15356b] hover:bg-[#1c4585] text-white border-none rounded-lg px-4 py-[10px] text-[12.5px] font-semibold cursor-pointer transition-colors"
                        >
                          {editingCampaign ? 'Güncelle' : 'Oluştur'}
                        </button>
                      </div>
                    </form>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </Dialog>
        </Transition>

        {/* Confirm Dialog (silme onayi) */}
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
    </div>
  );
}
