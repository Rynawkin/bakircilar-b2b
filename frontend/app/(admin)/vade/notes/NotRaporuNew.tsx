'use client';

import {
  StickyNote,
  Bell,
  Filter,
  RefreshCw,
  Users,
  Tag as TagIcon,
  Calendar,
  Clock,
} from 'lucide-react';
import { useNotRaporu } from './useNotRaporu';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Not Raporu ekrani. Mevcut TUM mantik useNotRaporu'dan gelir; sadece gorsel yeni.
 * Hicbir handler/filtre/sayac/kolon/durum/rozet dusurulmemistir; brief 4.7.5'teki her oge mevcut.
 *
 * Vade renk semantigi: kirmizi=vadesi gecen, mavi=vadesi gelmemis,
 * amber=bekleyen hatirlatma, yesil=tamamlanmis.
 */
export default function NotRaporuNew() {
  const {
    notes,
    staff,
    loading,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    tag,
    setTag,
    authorId,
    setAuthorId,
    reminderOnly,
    setReminderOnly,
    reminderCompleted,
    setReminderCompleted,
    loadNotes,
    stats,
    formatDateShort,
  } = useNotRaporu();

  // Form alan stili (input/select ortak)
  const fieldCls =
    'h-9 w-full border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b] bg-white';

  const labelCls = 'text-[11px] font-medium text-[#8b97ac] mb-1 block';

  // Toggle filtre butonu — aktif: primary, pasif: outline
  const toggleBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-medium transition-colors ${
      active
        ? 'bg-[#15356b] border border-[#15356b] text-white hover:bg-[#1c4585]'
        : 'bg-white border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'
    }`;

  const outlineBtn =
    'inline-flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-lg px-3 h-9 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors';

  // En aktif personel ozeti (ilk sira). Bos ise '-'.
  const topAuthorName = stats.topAuthors.length > 0 ? stats.topAuthors[0][0] : '-';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Baslik */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0 flex items-center gap-2">
            <StickyNote width={22} height={22} stroke="#15356b" strokeWidth={2} />
            Not Raporu
          </h1>
          <div className="text-[13px] text-[#8b97ac] mt-1.5">
            Notlar, hatirlatmalar ve performans ozeti.
          </div>
        </div>
      </div>

      {/* Filtre paneli */}
      <div className={`${CARD} p-4 mb-4`}>
        <div className="flex items-center gap-2 mb-3 text-[#51607a]">
          <Filter width={15} height={15} stroke="currentColor" strokeWidth={2} />
          <span className="text-[12.5px] font-semibold text-[#14223b]">Filtreler</span>
        </div>

        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <div>
            <label className={labelCls}>Baslangic</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Bitis</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Etiket</label>
            <div className="relative">
              <TagIcon
                width={13}
                height={13}
                stroke="#9aa6b8"
                strokeWidth={2}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                placeholder="etiket"
                className={`${fieldCls} pl-7`}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Personel</label>
            <select
              className={`${fieldCls} cursor-pointer`}
              value={authorId}
              onChange={(event) => setAuthorId(event.target.value)}
            >
              <option value="">Tum Personel</option>
              {staff.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={toggleBtn(reminderOnly)}
            onClick={() => setReminderOnly((prev) => !prev)}
          >
            <Bell width={14} height={14} stroke="currentColor" strokeWidth={2} />
            Hatirlatma
          </button>
          <select
            className={`${fieldCls} w-auto cursor-pointer`}
            value={reminderCompleted}
            onChange={(event) => setReminderCompleted(event.target.value as 'all' | 'true' | 'false')}
          >
            <option value="all">Tum durumlar</option>
            <option value="false">Bekleyen</option>
            <option value="true">Tamamlanan</option>
          </select>
          <button type="button" className={outlineBtn} onClick={loadNotes}>
            <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} />
            Yenile
          </button>
        </div>
      </div>

      {/* Metrikler: Toplam Not / En Aktif / Filtre */}
      <div className="grid gap-3.5 md:grid-cols-3 mb-4">
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
            <StickyNote width={13} height={13} stroke="currentColor" strokeWidth={2} />
            Toplam Not
          </div>
          <div className="text-[22px] font-semibold text-[#14223b] mt-1.5">{stats.total}</div>
        </div>

        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
            <Users width={13} height={13} stroke="currentColor" strokeWidth={2} />
            En Aktif
          </div>
          <div className="mt-2 space-y-1 text-[12.5px]">
            {stats.topAuthors.length === 0 && <div className="text-[#9aa6b8]">-</div>}
            {stats.topAuthors.map(([name, count], idx) => (
              <div key={name} className="flex items-center justify-between">
                <span className={idx === 0 ? 'font-semibold text-[#14223b]' : 'text-[#51607a]'}>
                  {name}
                </span>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[10.5px] font-semibold">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#8b97ac]">
            <Filter width={13} height={13} stroke="currentColor" strokeWidth={2} />
            Filtre
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 h-[26px] rounded-lg text-[12px] font-semibold ${
                reminderOnly
                  ? 'bg-[#fffbeb] border border-[#fde68a] text-[#b45309]'
                  : 'bg-[#f4f6fa] border border-[#e3e8f0] text-[#51607a]'
              }`}
            >
              {reminderOnly ? (
                <Bell width={13} height={13} stroke="currentColor" strokeWidth={2} />
              ) : (
                <StickyNote width={13} height={13} stroke="currentColor" strokeWidth={2} />
              )}
              {reminderOnly ? 'Hatirlatmalar' : 'Tum notlar'}
            </span>
          </div>
        </div>
      </div>

      {/* Not tablosu */}
      <div className={`${CARD} overflow-hidden`}>
        {loading && (
          <div className="p-6 text-[12.5px] text-[#8b97ac] flex items-center gap-2">
            <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} className="animate-spin" />
            Yukleniyor...
          </div>
        )}
        {!loading && notes.length === 0 && (
          <div className="p-10 text-center">
            <StickyNote width={30} height={30} stroke="#c3cfe0" strokeWidth={1.6} className="mx-auto mb-2" />
            <div className="text-[12.5px] text-[#8b97ac]">Not bulunamadi.</div>
          </div>
        )}
        {!loading && notes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full border-collapse">
              <thead>
                <tr className="bg-[#fafbfd] border-b border-[#eef1f6]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Cari
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Personel
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Tarih
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Etiketler
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Hatirlatma
                  </th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-[#8b97ac] tracking-wide">
                    Not
                  </th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr
                    key={note.id}
                    className="border-t border-[#f1f4f9] hover:bg-[#fafbfd] transition-colors"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="text-[12.5px] font-semibold text-[#14223b]">
                        {note.customer?.displayName || note.customer?.mikroName || note.customer?.name || '-'}
                      </div>
                      <div className="text-[10.5px] text-[#8b97ac] font-mono">
                        {note.customer?.mikroCariCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-[#51607a]">
                      {note.author?.name || '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-[#51607a]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar width={12} height={12} stroke="#9aa6b8" strokeWidth={2} />
                        {formatDateShort(note.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {note.tags?.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[9.5px] font-semibold px-1.5 py-0.5 rounded-[5px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {note.reminderDate ? (
                        <span
                          className={`inline-flex items-center gap-1 text-[9.5px] font-semibold px-2 py-[3px] rounded-full ${
                            note.reminderCompleted
                              ? 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857]'
                              : 'bg-[#fffbeb] border border-[#fde68a] text-[#b45309]'
                          }`}
                        >
                          {note.reminderCompleted ? (
                            <Clock width={11} height={11} stroke="currentColor" strokeWidth={2.2} />
                          ) : (
                            <Bell width={11} height={11} stroke="currentColor" strokeWidth={2.2} />
                          )}
                          {formatDateShort(note.reminderDate)}
                        </span>
                      ) : (
                        <span className="text-[#9aa6b8]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-[#51607a] max-w-xs">
                      <div className="truncate">{note.noteContent}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
