'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { VadeNote } from '@/types';

// Re-export tip (Classic/New JSX'lerin ihtiyaci icin)
export type { VadeNote } from '@/types';

/**
 * Hatirlatma Takvimi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useHatirlatmaTakvimi() {
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeNotes({
        reminderOnly: true,
        reminderCompleted: false,
        reminderFrom: fromDate || undefined,
        reminderTo: toDate || undefined,
      });
      setNotes(response.notes || []);
    } catch (error) {
      console.error('Reminder load error:', error);
      toast.error('Hatirlatmalar yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const today = new Date();
    if (!fromDate) {
      setFromDate(today.toISOString().slice(0, 10));
    }
    if (!toDate) {
      const future = new Date(today);
      future.setDate(future.getDate() + 30);
      setToDate(future.toISOString().slice(0, 10));
    }
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    loadReminders();
  }, [fromDate, toDate, loadReminders]);

  const grouped = useMemo(() => {
    const map = new Map<string, VadeNote[]>();
    notes.forEach((note) => {
      const key = note.reminderDate ? note.reminderDate.slice(0, 10) : 'no-date';
      const list = map.get(key) || [];
      list.push(note);
      map.set(key, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const markCompleted = async (noteId: string) => {
    try {
      const response = await adminApi.updateVadeNote(noteId, { reminderCompleted: true });
      setNotes((prev) => prev.map((note) => (note.id === noteId ? response.note : note)));
    } catch (error) {
      console.error('Reminder update error:', error);
      toast.error('Hatirlatma guncellenemedi');
    }
  };

  return {
    // veri / durum
    notes,
    loading,
    grouped,
    // filtre tarihleri
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    // aksiyonlar
    loadReminders,
    markCompleted,
    // helpers
    formatDateShort,
  };
}

export default useHatirlatmaTakvimi;
