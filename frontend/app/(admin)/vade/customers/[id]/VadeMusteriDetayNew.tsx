'use client';

import { ChevronLeft, RefreshCw, Check } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  useVadeMusteriDetay,
  classificationOptions,
  tagToBadge,
} from './useVadeMusteriDetay';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const FIELD =
  'h-9 w-full rounded-lg border border-[#e3e8f0] px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]';
const LABEL = 'text-[11px] text-[#8b97ac]';
const PRIMARY_BTN =
  'rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-60';

// Geçmiş not etiket rozeti — semantik renkler (mevcut tagToBadge mantigina baglidir)
const tagBadgeStyle: Record<string, string> = {
  success: 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857]',
  warning: 'bg-[#fffbeb] border border-[#fde68a] text-[#b45309]',
  danger: 'bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c]',
  info: 'bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585]',
  default: 'bg-[#f1f4f9] border border-[#e7ebf2] text-[#51607a]',
  outline: 'bg-white border border-[#d8e0ec] text-[#51607a]',
};

const initialsOf = (name: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export default function VadeMusteriDetayNew() {
  const {
    router,
    customer,
    notes,
    assignments,
    loading,
    noteContent,
    setNoteContent,
    noteTags,
    setNoteTags,
    promiseDate,
    setPromiseDate,
    reminderDate,
    setReminderDate,
    reminderNote,
    setReminderNote,
    savingNote,
    classification,
    setClassification,
    customClassification,
    setCustomClassification,
    riskScore,
    setRiskScore,
    savingClassification,
    loadDetail,
    handleSaveNote,
    handleSaveClassification,
    handleReminderComplete,
    balance,
    customerLabel,
  } = useVadeMusteriDetay();

  return (
    <div className="container mx-auto p-6 text-[#14223b]">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] text-[#8b97ac]">
        <button
          type="button"
          onClick={() => router.push('/vade')}
          className="flex items-center gap-1.5 font-semibold text-[#15356b]"
        >
          <ChevronLeft size={14} />
          Vade Takip
        </button>
        <span>›</span>
        <span>Musteri Detay</span>
      </div>

      {/* Baslik: cari adi + kod/lokasyon/vade plani + Geri Don */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">
            {customerLabel || 'Cari Detay'}
          </h1>
          <div className="mt-1 font-mono text-[12.5px] text-[#8b97ac]">
            {[
              customer?.mikroCariCode,
              customer?.city
                ? `${customer.city}${customer?.district ? ` / ${customer.district}` : ''}`
                : null,
              balance?.paymentTermLabel || customer?.paymentPlanName
                ? `Vade Plani: ${balance?.paymentTermLabel || customer?.paymentPlanName}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || ' '}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push('/vade')}
          className="rounded-lg border border-[#d8e0ec] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
        >
          Geri Don
        </button>
      </div>

      {loading && (
        <div className={`${CARD} p-6 text-center text-[13px] text-[#8b97ac]`}>Yukleniyor...</div>
      )}

      {!loading && !customer && (
        <div className={`${CARD} p-6 text-center text-[13px] text-[#8b97ac]`}>Cari bulunamadi.</div>
      )}

      {!loading && customer && (
        <>
          {/* 3 metrik: Vadesi Gecen (kirmizi) / Vadesi Gelmemis (mavi) / Toplam (Valor) */}
          <div className="mb-4 grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="rounded-xl border border-[#fecaca] bg-white p-4">
              <div className="text-[12px] font-medium text-[#b91c1c]">Vadesi Gecen</div>
              <div className="mt-1.5 text-[22px] font-semibold text-[#b91c1c]">
                {formatCurrency(balance?.pastDueBalance || 0)}
              </div>
              <div className="mt-1 text-[11px] text-[#8b97ac]">
                {balance?.pastDueDate ? formatDateShort(balance.pastDueDate) : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-[#d6e0f1] bg-white p-4">
              <div className="text-[12px] font-medium text-[#1c4585]">Vadesi Gelmemis</div>
              <div className="mt-1.5 text-[22px] font-semibold text-[#1c4585]">
                {formatCurrency(balance?.notDueBalance || 0)}
              </div>
              <div className="mt-1 text-[11px] text-[#8b97ac]">
                {balance?.notDueDate ? formatDateShort(balance.notDueDate) : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-[#e7ebf2] bg-white p-4">
              <div className="text-[12px] font-medium text-[#51607a]">Toplam (Valor)</div>
              <div className="mt-1.5 text-[22px] font-semibold text-[#14223b]">
                {formatCurrency(balance?.totalBalance || 0)}
              </div>
              <div className="mt-1 text-[11px] text-[#8b97ac]">
                {balance?.valor ? `${balance.valor} gun` : '-'}
              </div>
            </div>
          </div>

          {/* Kunye: Sektor/Grup · Vade Plani · Lokasyon */}
          <div className={`${CARD} mb-4 grid gap-4 p-4 md:grid-cols-3`}>
            <div>
              <div className="text-[11px] text-[#8b97ac]">Sektor / Grup</div>
              <div className="text-[13px] font-medium text-[#14223b]">{customer.sectorCode || '-'}</div>
              <div className="text-[11px] text-[#8b97ac]">{customer.groupCode || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#8b97ac]">Vade Plani</div>
              <div className="text-[13px] font-medium text-[#14223b]">
                {balance?.paymentTermLabel || customer.paymentPlanName || '-'}
              </div>
              <div className="text-[11px] text-[#8b97ac]">{customer.paymentPlanCode || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#8b97ac]">Lokasyon</div>
              <div className="text-[13px] font-medium text-[#14223b]">{customer.city || '-'}</div>
              <div className="text-[11px] text-[#8b97ac]">{customer.district || '-'}</div>
            </div>
          </div>

          {/* Ana grid: sol (Not Ekle + Gecmis Notlar) · sag (Siniflandirma + Atanan Personeller) */}
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
            {/* SOL KOLON */}
            <div className="flex flex-col gap-3.5">
              {/* Not Ekle */}
              <div className={`${CARD} p-4`}>
                <div className="mb-3 text-[13px] font-semibold text-[#14223b]">Not Ekle</div>
                <textarea
                  className="mb-2.5 min-h-[64px] w-full resize-none rounded-lg border border-[#e3e8f0] px-2.5 py-2 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Gorusme notu..."
                />
                <div className="mb-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Etiketler</span>
                    <input
                      className={FIELD}
                      value={noteTags}
                      onChange={(event) => setNoteTags(event.target.value)}
                      placeholder="odeme, soz..."
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Soz Tarihi</span>
                    <input
                      className={FIELD}
                      type="date"
                      value={promiseDate}
                      onChange={(event) => setPromiseDate(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Hatirlatma Tarihi</span>
                    <input
                      className={FIELD}
                      type="date"
                      value={reminderDate}
                      onChange={(event) => setReminderDate(event.target.value)}
                    />
                  </label>
                </div>
                <label className="mb-3 flex flex-col gap-1">
                  <span className={LABEL}>Hatirlatma Notu</span>
                  <input
                    className={FIELD}
                    value={reminderNote}
                    onChange={(event) => setReminderNote(event.target.value)}
                    placeholder="Aranacak..."
                  />
                </label>
                <button type="button" className={PRIMARY_BTN} onClick={handleSaveNote} disabled={savingNote}>
                  {savingNote ? 'Kaydediliyor...' : 'Not Kaydet'}
                </button>
              </div>

              {/* Gecmis Notlar */}
              <div className={`${CARD} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-[#14223b]">Gecmis Notlar</div>
                  <button
                    type="button"
                    onClick={loadDetail}
                    className="flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
                  >
                    <RefreshCw size={13} />
                    Yenile
                  </button>
                </div>

                {notes.length === 0 && (
                  <div className="text-[12.5px] text-[#8b97ac]">Not bulunamadi.</div>
                )}

                <div className="flex flex-col gap-2.5">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-[9px] border border-[#eef1f6] p-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-semibold text-[#14223b]">
                          {note.author?.name || 'Sistem'}
                        </span>
                        <span className="text-[10.5px] text-[#8b97ac]">
                          {formatDateShort(note.createdAt)}
                        </span>
                        {note.reminderDate && (
                          <span className="ml-auto flex items-center gap-2">
                            <span
                              className={`rounded-[5px] px-2 py-0.5 text-[9.5px] font-semibold ${
                                note.reminderCompleted
                                  ? 'border border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]'
                                  : 'border border-[#fde68a] bg-[#fffbeb] text-[#b45309]'
                              }`}
                            >
                              {note.reminderCompleted ? 'Tamamlandi' : 'Hatirlatma'}
                            </span>
                            {!note.reminderCompleted && (
                              <button
                                type="button"
                                onClick={() => handleReminderComplete(note.id)}
                                className="flex items-center gap-1 rounded-[5px] border border-[#a7f3d0] bg-[#ecfdf5] px-2 py-0.5 text-[9.5px] font-semibold text-[#047857] hover:bg-[#d1fae5]"
                              >
                                <Check size={11} />
                                Tamamla
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-[12px] text-[#51607a]">{note.noteContent}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        {note.tags?.map((tag) => (
                          <span
                            key={tag}
                            className={`rounded-[5px] px-2 py-0.5 font-semibold ${
                              tagBadgeStyle[tagToBadge(tag)] || tagBadgeStyle.default
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                        {note.promiseDate && (
                          <span className={`rounded-[5px] px-2 py-0.5 font-semibold ${tagBadgeStyle.info}`}>
                            Soz: {formatDateShort(note.promiseDate)}
                          </span>
                        )}
                        {note.reminderDate && (
                          <span className={`rounded-[5px] px-2 py-0.5 font-semibold ${tagBadgeStyle.outline}`}>
                            Hatirlatma: {formatDateShort(note.reminderDate)}
                          </span>
                        )}
                        {note.balanceAtTime !== null && note.balanceAtTime !== undefined && (
                          <span className={`rounded-[5px] px-2 py-0.5 font-semibold ${tagBadgeStyle.default}`}>
                            Bakiye: {formatCurrency(note.balanceAtTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* SAG KOLON */}
            <div className="flex flex-col gap-3.5">
              {/* Siniflandirma */}
              <div className={`${CARD} p-4`}>
                <div className="mb-3 text-[13px] font-semibold text-[#14223b]">Siniflandirma</div>
                <label className="mb-2.5 flex flex-col gap-1">
                  <span className={LABEL}>Seviye</span>
                  <select
                    className={`${FIELD} h-[38px] cursor-pointer`}
                    value={classification}
                    onChange={(event) => setClassification(event.target.value)}
                  >
                    {classificationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mb-2.5 flex flex-col gap-1">
                  <span className={LABEL}>Risk Skoru (0-100)</span>
                  <input
                    className={`${FIELD} h-[38px]`}
                    value={riskScore}
                    onChange={(event) => setRiskScore(event.target.value)}
                    placeholder="0-100"
                    type="number"
                    min={0}
                    max={100}
                  />
                </label>
                {classification === 'custom' && (
                  <label className="mb-3 flex flex-col gap-1">
                    <span className={LABEL}>Ozel Etiket</span>
                    <input
                      className={`${FIELD} h-[38px]`}
                      value={customClassification}
                      onChange={(event) => setCustomClassification(event.target.value)}
                      placeholder="Stratejik musteri..."
                    />
                  </label>
                )}
                <button
                  type="button"
                  className={`${PRIMARY_BTN} w-full`}
                  onClick={handleSaveClassification}
                  disabled={savingClassification}
                >
                  {savingClassification ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>

              {/* Atanan Personeller */}
              <div className={`${CARD} p-4`}>
                <div className="mb-3 text-[13px] font-semibold text-[#14223b]">Atanan Personeller</div>
                {assignments.length === 0 && (
                  <div className="text-[12px] text-[#8b97ac]">Atama yok.</div>
                )}
                <div className="flex flex-col gap-2">
                  {assignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#eef2fa] text-[11.5px] font-semibold text-[#15356b]">
                        {initialsOf(assignment.staff?.name || 'Personel')}
                      </span>
                      <div className="flex-1">
                        <div className="text-[12.5px] font-semibold text-[#14223b]">
                          {assignment.staff?.name || 'Personel'}
                        </div>
                        <div className="text-[10.5px] text-[#8b97ac]">
                          {assignment.staff?.role || '-'}
                        </div>
                      </div>
                      <div className="text-[10.5px] text-[#8b97ac]">
                        {assignment.createdAt ? formatDateShort(assignment.createdAt) : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
