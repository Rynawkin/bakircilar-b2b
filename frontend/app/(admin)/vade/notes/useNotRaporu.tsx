'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { VadeNote } from '@/types';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { VadeNote } from '@/types';

export type StaffUser = { id: string; name: string; role: string };

/**
 * Not Raporu ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useNotRaporu() {
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tag, setTag] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [reminderOnly, setReminderOnly] = useState(false);
  const [reminderCompleted, setReminderCompleted] = useState<'all' | 'true' | 'false'>('all');

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeNotes({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        tag: tag || undefined,
        authorId: authorId || undefined,
        reminderOnly,
        reminderCompleted: reminderCompleted === 'all' ? undefined : reminderCompleted === 'true',
      });
      setNotes(response.notes || []);
    } catch (error) {
      console.error('Notes load error:', error);
      toast.error('Notlar yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, tag, authorId, reminderOnly, reminderCompleted]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const response = await adminApi.getStaffMembers();
        setStaff(response.staff || []);
      } catch (error) {
        console.error('Staff load error:', error);
      }
    };
    loadStaff();
  }, []);

  const stats = useMemo(() => {
    const byAuthor = new Map<string, number>();
    notes.forEach((note) => {
      const key = note.author?.name || 'Bilinmiyor';
      byAuthor.set(key, (byAuthor.get(key) || 0) + 1);
    });
    const topAuthors = Array.from(byAuthor.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { total: notes.length, topAuthors };
  }, [notes]);

  return {
    // state
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
    // handlers
    loadNotes,
    // derived
    stats,
    // utils (JSX kolayligi icin)
    formatDateShort,
  };
}

export default useNotRaporu;
