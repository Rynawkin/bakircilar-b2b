'use client';

import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { noteTagLabel } from '@/lib/vadeNotes';
import { VadeNote } from '@/types';

type Balance = {
  pastDueBalance?: number;
  pastDueDate?: string | null;
  notDueBalance?: number;
  notDueDate?: string | null;
} | null | undefined;

type Ev = {
  date: string;
  kind: 'note' | 'overdue' | 'upcoming';
  title: string;
  body?: string;
  note?: VadeNote;
  amount?: number;
};

const DOT: Record<Ev['kind'], string> = { note: '#3b82f6', overdue: '#dc2626', upcoming: '#16a34a' };

export default function VadeTimeline({ notes, balance }: { notes: VadeNote[]; balance: Balance }) {
  const events: Ev[] = [];
  for (const n of notes) {
    events.push({
      date: n.createdAt,
      kind: 'note',
      title: `${n.author?.name || 'Sistem'} not ekledi`,
      body: n.noteContent,
      note: n,
    });
  }
  if (balance?.pastDueDate && (balance.pastDueBalance || 0) > 0) {
    events.push({ date: balance.pastDueDate, kind: 'overdue', title: 'Vadesi Gecmis Bakiye', amount: balance.pastDueBalance });
  }
  if (balance?.notDueDate && (balance.notDueBalance || 0) > 0) {
    events.push({ date: balance.notDueDate, kind: 'upcoming', title: 'Yaklasan Vade', amount: balance.notDueBalance });
  }
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) {
    return <div className="text-[12.5px] text-[#8b97ac]">Kayit yok.</div>;
  }

  return (
    <div className="relative pl-4">
      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[#eef1f6]" />
      <div className="flex flex-col gap-3">
        {events.map((ev, i) => (
          <div key={i} className="relative">
            <span
              className="absolute -left-[13px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
              style={{ background: DOT[ev.kind] }}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#14223b]">{ev.title}</span>
              <span className="text-[10.5px] text-[#8b97ac]">{formatDateShort(ev.date)}</span>
            </div>
            {ev.amount !== undefined && (
              <div className={`text-[12px] font-semibold ${ev.kind === 'overdue' ? 'text-[#b91c1c]' : 'text-[#1c4585]'}`}>
                {formatCurrency(ev.amount)}
              </div>
            )}
            {ev.body && <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] text-[#51607a]">{ev.body}</p>}
            {ev.note && (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[9.5px]">
                {ev.note.tags?.map((t) => (
                  <span key={t} className="rounded bg-[#eef2fa] px-1.5 py-0.5 font-semibold text-[#1c4585]">{noteTagLabel(t)}</span>
                ))}
                {ev.note.promiseDate && (
                  <span className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-semibold text-[#047857]">Soz: {formatDateShort(ev.note.promiseDate)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
