'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { VadeAssignment, VadeNote } from '@/types';
import { NOTE_TEMPLATES, businessDayBefore } from '@/lib/vadeNotes';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { VadeAssignment, VadeNote } from '@/types';

export type CustomerDetail = {
  id: string;
  name: string;
  displayName?: string | null;
  mikroName?: string | null;
  mikroCariCode?: string | null;
  sectorCode?: string | null;
  groupCode?: string | null;
  city?: string | null;
  district?: string | null;
  phone?: string | null;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  balance?: number;
  isLocked?: boolean;
  vadeBalance?: {
    pastDueBalance?: number;
    pastDueDate?: string | null;
    notDueBalance?: number;
    notDueDate?: string | null;
    totalBalance?: number;
    valor?: number;
    paymentTermLabel?: string | null;
    referenceDate?: string | null;
    source?: string;
    updatedAt?: string;
  } | null;
  vadeClassification?: {
    classification: string;
    customClassification?: string | null;
    riskScore?: number | null;
  } | null;
};

export const classificationOptions = [
  { value: 'green', label: 'Yesil - Dusuk Risk' },
  { value: 'yellow', label: 'Sari - Orta Risk' },
  { value: 'red', label: 'Kirmizi - Yuksek Risk' },
  { value: 'black', label: 'Siyah - Cok Yuksek Risk' },
  { value: 'special', label: 'Ozel Durum' },
  { value: 'custom', label: 'Ozel Siniflandirma' },
];

export const tagToBadge = (tag: string) => {
  const key = tag.toLowerCase();
  if (key.includes('promise') || key.includes('soz')) return 'success';
  if (key.includes('erte') || key.includes('postpone')) return 'warning';
  if (key.includes('yanit') || key.includes('no')) return 'danger';
  if (key.includes('takip') || key.includes('follow')) return 'info';
  return 'default';
};

/**
 * Vade Musteri Detay ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useVadeMusteriDetay() {
  const params = useParams();
  const router = useRouter();
  const customerId = String(params.id || '');

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [promiseDate, setPromiseDate] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const [classification, setClassification] = useState('green');
  const [customClassification, setCustomClassification] = useState('');
  const [riskScore, setRiskScore] = useState('');
  const [savingClassification, setSavingClassification] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeCustomer(customerId);
      setCustomer(response.customer);
      setNotes(response.notes || []);
      setAssignments(response.assignments || []);

      if (response.customer?.vadeClassification) {
        setClassification(response.customer.vadeClassification.classification || 'green');
        setCustomClassification(response.customer.vadeClassification.customClassification || '');
        setRiskScore(
          response.customer.vadeClassification.riskScore !== null &&
          response.customer.vadeClassification.riskScore !== undefined
            ? String(response.customer.vadeClassification.riskScore)
            : ''
        );
      }
    } catch (error) {
      console.error('Vade detail not loaded:', error);
      toast.error('Cari detaylari yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    loadDetail();
  }, [customerId, loadDetail]);

  const resetNoteForm = () => {
    setNoteContent('');
    setNoteTags('');
    setSelectedTags([]);
    setPromiseDate('');
    setReminderDate('');
    setReminderNote('');
    setEditingNoteId(null);
  };

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const applyTemplate = (templateId: string) => {
    const tpl = NOTE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setNoteContent(tpl.content);
    if (tpl.tag) setSelectedTags((prev) => (prev.includes(tpl.tag) ? prev : [...prev, tpl.tag]));
  };

  const startEditNote = (note: VadeNote) => {
    setEditingNoteId(note.id);
    setNoteContent(note.noteContent || '');
    setSelectedTags(Array.isArray(note.tags) ? note.tags : []);
    setNoteTags('');
    setPromiseDate(note.promiseDate ? String(note.promiseDate).slice(0, 10) : '');
    setReminderDate(note.reminderDate ? String(note.reminderDate).slice(0, 10) : '');
    setReminderNote(note.reminderNote || '');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => resetNoteForm();

  const handleSaveNote = async () => {
    if (!noteContent.trim()) {
      toast.error('Not bos olamaz');
      return;
    }
    setSavingNote(true);
    try {
      // Etiketler: yeni cip secimi varsa onu, yoksa eski virgullu metni kullan (geriye uyum)
      const tags = selectedTags.length
        ? selectedTags
        : noteTags.split(',').map((tag) => tag.trim()).filter(Boolean);

      // Soz tarihinden otomatik hatirlatici (hatirlatma bos ise bir is gunu oncesi)
      let effReminderDate = reminderDate;
      let effReminderNote = reminderNote;
      if (promiseDate && !reminderDate) {
        const auto = businessDayBefore(promiseDate);
        if (auto) {
          effReminderDate = auto;
          if (!effReminderNote.trim()) {
            const label = customer?.displayName || customer?.mikroName || customer?.name || 'Musteri';
            effReminderNote = `${label} icin odeme gunu yaklasti`;
          }
        }
      }

      if (editingNoteId) {
        const response = await adminApi.updateVadeNote(editingNoteId, {
          noteContent: noteContent.trim(),
          promiseDate: promiseDate || null,
          tags,
          reminderDate: effReminderDate || null,
          reminderNote: effReminderNote || null,
        });
        setNotes((prev) => prev.map((n) => (n.id === editingNoteId ? response.note : n)));
        toast.success('Not guncellendi');
      } else {
        const response = await adminApi.createVadeNote({
          customerId,
          noteContent: noteContent.trim(),
          promiseDate: promiseDate || null,
          tags,
          reminderDate: effReminderDate || null,
          reminderNote: effReminderNote || null,
        });
        setNotes((prev) => [response.note, ...prev]);
        toast.success('Not eklendi');
      }
      resetNoteForm();
    } catch (error) {
      console.error('Note save error:', error);
      toast.error('Not kaydedilemedi');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveClassification = async () => {
    if (!classification) {
      toast.error('Siniflandirma secin');
      return;
    }
    if (classification === 'custom' && !customClassification.trim()) {
      toast.error('Ozel siniflandirma girin');
      return;
    }
    setSavingClassification(true);
    try {
      await adminApi.upsertVadeClassification({
        customerId,
        classification,
        customClassification: classification === 'custom' ? customClassification.trim() : null,
        riskScore: riskScore ? Number(riskScore) : null,
      });
      toast.success('Siniflandirma kaydedildi');
      loadDetail();
    } catch (error) {
      console.error('Classification update error:', error);
      toast.error('Siniflandirma kaydedilemedi');
    } finally {
      setSavingClassification(false);
    }
  };

  const handleReminderComplete = async (noteId: string) => {
    try {
      const response = await adminApi.updateVadeNote(noteId, { reminderCompleted: true });
      setNotes((prev) => prev.map((note) => (note.id === noteId ? response.note : note)));
    } catch (error) {
      console.error('Reminder update error:', error);
      toast.error('Hatirlatma guncellenemedi');
    }
  };

  const balance = customer?.vadeBalance;

  const customerLabel = useMemo(() => {
    if (!customer) return '';
    return customer.displayName || customer.mikroName || customer.name || '';
  }, [customer]);

  return {
    // router / nav
    router,
    customerId,
    // state
    customer,
    notes,
    assignments,
    loading,
    noteContent,
    setNoteContent,
    noteTags,
    setNoteTags,
    selectedTags,
    setSelectedTags,
    toggleTag,
    applyTemplate,
    editingNoteId,
    startEditNote,
    cancelEdit,
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
    // handlers
    loadDetail,
    handleSaveNote,
    handleSaveClassification,
    handleReminderComplete,
    // derived
    balance,
    customerLabel,
  };
}

export default useVadeMusteriDetay;
