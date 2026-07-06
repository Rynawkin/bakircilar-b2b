'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { NOTE_TEMPLATES, NOTE_TAGS, businessDayBefore } from '@/lib/vadeNotes';

const FIELD =
  'h-9 w-full rounded-lg border border-[#e3e8f0] px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]';
const LABEL = 'text-[11px] text-[#8b97ac]';

export default function VadeQuickNoteModal({
  customerId,
  customerLabel,
  onClose,
  onSaved,
}: {
  customerId: string;
  customerLabel: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [promiseDate, setPromiseDate] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleTag = (id: string) =>
    setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const applyTemplate = (id: string) => {
    const tpl = NOTE_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setContent(tpl.content);
    if (tpl.tag) setTags((prev) => (prev.includes(tpl.tag) ? prev : [...prev, tpl.tag]));
  };

  const save = async () => {
    if (!content.trim()) {
      toast.error('Not bos olamaz');
      return;
    }
    setSaving(true);
    try {
      let effReminderDate = reminderDate;
      let effReminderNote = reminderNote;
      if (promiseDate && !reminderDate) {
        const auto = businessDayBefore(promiseDate);
        if (auto) {
          effReminderDate = auto;
          if (!effReminderNote.trim()) effReminderNote = `${customerLabel || 'Musteri'} icin odeme gunu yaklasti`;
        }
      }
      await adminApi.createVadeNote({
        customerId,
        noteContent: content.trim(),
        tags,
        promiseDate: promiseDate || null,
        reminderDate: effReminderDate || null,
        reminderNote: effReminderNote || null,
      });
      toast.success('Not eklendi');
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Quick note error:', error);
      toast.error('Not eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[#14223b]">Hizli Not</div>
            <div className="truncate text-[11.5px] text-[#8b97ac]">{customerLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#8b97ac] hover:bg-[#f4f6fa] hover:text-[#51607a]"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-2.5 flex flex-col gap-1">
          <span className={LABEL}>Hazir Sablon</span>
          <select
            className={`${FIELD} cursor-pointer`}
            value=""
            onChange={(e) => {
              if (e.target.value) applyTemplate(e.target.value);
            }}
          >
            <option value="">Sablon sec (opsiyonel)</option>
            {NOTE_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.label}
              </option>
            ))}
          </select>
        </label>

        <textarea
          className="mb-2.5 min-h-[72px] w-full resize-none rounded-lg border border-[#e3e8f0] px-2.5 py-2 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Gorusme notu..."
          autoFocus
        />

        <div className="mb-2.5">
          <span className={LABEL}>Etiketler</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {NOTE_TAGS.map((tag) => {
              const active = tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={
                    active
                      ? { background: tag.bg, borderColor: tag.border, color: tag.text }
                      : { background: '#fff', borderColor: '#e3e8f0', color: '#8b97ac' }
                  }
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-1.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Soz Tarihi</span>
            <input className={FIELD} type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Hatirlatma Tarihi</span>
            <input className={FIELD} type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} />
          </label>
        </div>
        {promiseDate && !reminderDate && (
          <div className="mb-2.5 text-[10.5px] text-[#8b97ac]">
            Hatirlatma bos — soz tarihinden bir is gunu oncesine otomatik kurulacak.
          </div>
        )}

        <label className="mb-3 flex flex-col gap-1">
          <span className={LABEL}>Hatirlatma Notu</span>
          <input
            className={FIELD}
            value={reminderNote}
            onChange={(e) => setReminderNote(e.target.value)}
            placeholder="Aranacak..."
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d8e0ec] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#51607a] hover:bg-[#f4f6fa]"
          >
            Vazgec
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#15356b] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-60"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
