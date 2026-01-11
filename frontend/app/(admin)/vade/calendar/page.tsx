'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatDateShort } from '@/lib/utils/format';
import { VadeNote } from '@/types';

export default function VadeCalendarPage() {
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

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Hatirlatma Takvimi</h1>
          <p className="text-sm text-muted-foreground">Bekleyen hatirlatmalar ve notlar.</p>
        </div>

        <Card className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Baslangic</label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bitis</label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadReminders}>
                Yenile
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          {loading && <div className="text-sm text-muted-foreground">Yukleniyor...</div>}
          {!loading && grouped.length === 0 && (
            <div className="text-sm text-muted-foreground">Hatirlatma bulunamadi.</div>
          )}
          {!loading && grouped.length > 0 && (
            <div className="space-y-4">
              {grouped.map(([dateKey, items]) => (
                <div key={dateKey} className="space-y-2">
                  <div className="text-sm font-semibold">
                    {dateKey === 'no-date' ? 'Tarihsiz' : formatDateShort(dateKey)}
                  </div>
                  <div className="space-y-2">
                    {items.map((note) => (
                      <div key={note.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium">
                            {note.customer?.displayName || note.customer?.mikroName || note.customer?.name || 'Cari'}
                          </div>
                          <div className="text-xs text-muted-foreground">{note.noteContent}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {note.reminderDate && (
                            <Badge variant="warning">{formatDateShort(note.reminderDate)}</Badge>
                          )}
                          <Button variant="outline" size="sm" onClick={() => markCompleted(note.id)}>
                            Tamamla
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
