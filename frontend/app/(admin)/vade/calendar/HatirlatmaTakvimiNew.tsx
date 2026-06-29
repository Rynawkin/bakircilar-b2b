'use client';

import { useMemo } from 'react';
import {
  CalendarClock,
  RefreshCw,
  Check,
  Bell,
  CalendarDays,
} from 'lucide-react';
import { useHatirlatmaTakvimi } from './useHatirlatmaTakvimi';

/**
 * Yeni gorunum — Hatirlatma Takvimi.
 * Mevcut TUM mantik (filtre/grup/markCompleted/loading) useHatirlatmaTakvimi'den gelir; sadece gorsel yeni.
 * DROP YOK: tarih araligi filtresi + Yenile, her hatirlatma kartinda cari + not + amber tarih rozeti + Tamamla,
 * loading/bos durumlari ve tarihe gore gruplama korunmustur.
 *
 * Brief 4.7.4 "firsat": tarihe gore gruplu liste + GERCEK takvim izgarasi (her ikisi de ayni veriden).
 * Vade renk semantigi: amber = bekleyen hatirlatma; yesil = tamamlama aksiyonu.
 */
export default function HatirlatmaTakvimiNew() {
  const {
    notes,
    loading,
    grouped,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    loadReminders,
    markCompleted,
    formatDateShort,
  } = useHatirlatmaTakvimi();

  // --- Takvim izgarasi hucreleri (firsat). fromDate-toDate araliginin ay/aylarini doldur. ---
  // Sadece gorsel turetilmis veri; hicbir handler/mantik degismez. Kaynak: grouped (= notes).
  const reminderCountByDay = useMemo(() => {
    const map = new Map<string, number>();
    grouped.forEach(([dateKey, items]) => {
      if (dateKey !== 'no-date') map.set(dateKey, items.length);
    });
    return map;
  }, [grouped]);

  const calendar = useMemo(() => {
    if (!fromDate || !toDate) return null;
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;

    // Izgara: baslangic ayinin ilk gununun bulundugu haftanin Pazartesi'sinden,
    // bitis ayinin son gununun bulundugu haftanin Pazar'ina kadar.
    const gridStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const startWeekday = (gridStart.getDay() + 6) % 7; // Pazartesi = 0
    gridStart.setDate(gridStart.getDate() - startWeekday);

    const gridEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    const endWeekday = (gridEnd.getDay() + 6) % 7;
    gridEnd.setDate(gridEnd.getDate() + (6 - endWeekday));

    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
    const cells: Array<{
      key: string;
      iso: string;
      dayNum: number;
      inRange: boolean;
      count: number;
    }> = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const dd = `${d.getDate()}`.padStart(2, '0');
      const iso = `${y}-${m}-${dd}`;
      cells.push({
        key: iso,
        iso,
        dayNum: d.getDate(),
        inRange: d >= start && d <= end,
        count: reminderCountByDay.get(iso) || 0,
      });
    }
    return cells;
  }, [fromDate, toDate, reminderCountByDay]);

  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  const totalReminders = notes.length;
  const dayCount = grouped.filter(([k]) => k !== 'no-date').length;

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <div className="container mx-auto p-6 space-y-5">
        {/* Baslik */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] flex items-center gap-2">
              <CalendarClock className="w-6 h-6 text-[#15356b]" />
              Hatirlatma Takvimi
            </h1>
            <p className="text-[13px] text-[#8b97ac] mt-1">Bekleyen hatirlatmalar ve notlar.</p>
          </div>
          <button
            type="button"
            onClick={loadReminders}
            className="flex items-center gap-2 h-9 bg-[#15356b] hover:bg-[#1c4585] text-white text-[12.5px] font-semibold px-4 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
        </div>

        {/* Metrikler */}
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
            <div className="text-[12px] text-[#51607a] font-medium flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-[#b45309]" />
              Bekleyen Hatirlatma
            </div>
            <div className="text-[23px] font-semibold text-[#b45309] mt-2">{totalReminders}</div>
          </div>
          <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
            <div className="text-[12px] text-[#51607a] font-medium flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-[#15356b]" />
              Hatirlatma Gunu
            </div>
            <div className="text-[23px] font-semibold text-[#14223b] mt-2">{dayCount}</div>
          </div>
          <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
            <div className="text-[12px] text-[#51607a] font-medium">Tarih Araligi</div>
            <div className="text-[14px] font-semibold text-[#14223b] mt-2.5">
              {fromDate ? formatDateShort(fromDate) : '—'} – {toDate ? formatDateShort(toDate) : '—'}
            </div>
          </div>
        </div>

        {/* Filtre karti — tarih araligi + Yenile */}
        <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[#8b97ac] font-medium">Baslangic</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[#8b97ac] font-medium">Bitis</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-9 border border-[#e3e8f0] rounded-lg px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={loadReminders}
                className="flex items-center gap-2 h-9 bg-white hover:bg-[#f4f6fa] border border-[#d8e0ec] text-[#51607a] text-[12.5px] font-medium px-4 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Yenile
              </button>
            </div>
          </div>
        </div>

        {/* Takvim izgarasi (firsat) — ayni veriden, hatirlatma sayisi rozeti */}
        {!loading && calendar && calendar.length > 0 && (
          <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
            <div className="text-[13px] font-semibold text-[#14223b] mb-3">Takvim</div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-[10.5px] font-semibold text-[#8b97ac] py-1">
                  {d}
                </div>
              ))}
              {calendar.map((cell) => (
                <div
                  key={cell.key}
                  className={`min-h-[58px] rounded-lg border p-1.5 flex flex-col ${
                    cell.inRange ? 'border-[#eef1f6] bg-white' : 'border-transparent bg-[#fafbfd]'
                  }`}
                >
                  <span
                    className={`text-[11px] ${
                      cell.inRange ? 'text-[#51607a] font-medium' : 'text-[#c3cfe0]'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.count > 0 && (
                    <div className="mt-1 bg-[#fffbeb] border border-[#fde68a] rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-[#b45309] whitespace-nowrap overflow-hidden text-ellipsis">
                      {cell.count} hatirlatma
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tarihe gore gruplu liste — her kart: cari + not + amber tarih rozeti + Tamamla */}
        <div className="bg-white border border-[#e7ebf2] rounded-xl p-4">
          {loading && (
            <div className="text-[13px] text-[#8b97ac] flex items-center gap-2 py-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#15356b]" />
              Yukleniyor...
            </div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarClock className="w-9 h-9 text-[#c3cfe0] mb-2" />
              <div className="text-[13px] text-[#8b97ac]">Hatirlatma bulunamadi.</div>
            </div>
          )}
          {!loading && grouped.length > 0 && (
            <div className="space-y-5">
              {grouped.map(([dateKey, items]) => (
                <div key={dateKey} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]" />
                    <div className="text-[13px] font-semibold text-[#14223b]">
                      {dateKey === 'no-date' ? 'Tarihsiz' : formatDateShort(dateKey)}
                    </div>
                    <span className="text-[10.5px] text-[#8b97ac] bg-[#f4f6fa] border border-[#e3e8f0] rounded-full px-2 py-0.5 font-semibold">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((note) => (
                      <div
                        key={note.id}
                        className="flex flex-col gap-2 rounded-lg border border-[#eef1f6] p-3 text-[12.5px] hover:bg-[#fafbfd] transition-colors md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#14223b]">
                            {note.customer?.displayName ||
                              note.customer?.mikroName ||
                              note.customer?.name ||
                              'Cari'}
                          </div>
                          <div className="text-[11.5px] text-[#51607a] mt-0.5">{note.noteContent}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                          {note.reminderDate && (
                            <span className="inline-flex items-center bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                              {formatDateShort(note.reminderDate)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => markCompleted(note.id)}
                            className="inline-flex items-center gap-1.5 bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] text-[#047857] text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Tamamla
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
