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

type StaffUser = { id: string; name: string; role: string };

export default function VadeNotesPage() {
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

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Not Raporu</h1>
          <p className="text-sm text-muted-foreground">Notlar, hatirlatmalar ve performans ozeti.</p>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground">Baslangic</label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bitis</label>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Etiket</label>
              <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="etiket" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Personel</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant={reminderOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReminderOnly((prev) => !prev)}
            >
              Hatirlatma
            </Button>
            <select
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={reminderCompleted}
              onChange={(event) => setReminderCompleted(event.target.value as 'all' | 'true' | 'false')}
            >
              <option value="all">Tum durumlar</option>
              <option value="false">Bekleyen</option>
              <option value="true">Tamamlanan</option>
            </select>
            <Button variant="outline" size="sm" onClick={loadNotes}>
              Yenile
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Toplam Not</div>
            <div className="text-xl font-semibold">{stats.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">En Aktif</div>
            <div className="space-y-1 text-sm">
              {stats.topAuthors.length === 0 && <div>-</div>}
              {stats.topAuthors.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between">
                  <span>{name}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Filtre</div>
            <div className="text-sm">
              {reminderOnly ? 'Hatirlatmalar' : 'Tum notlar'}
            </div>
          </Card>
        </div>

        <Card className="p-4">
          {loading && <div className="text-sm text-muted-foreground">Yukleniyor...</div>}
          {!loading && notes.length === 0 && <div className="text-sm text-muted-foreground">Not bulunamadi.</div>}
          {!loading && notes.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Cari</th>
                    <th className="px-3 py-2 text-left">Personel</th>
                    <th className="px-3 py-2 text-left">Tarih</th>
                    <th className="px-3 py-2 text-left">Etiketler</th>
                    <th className="px-3 py-2 text-left">Hatirlatma</th>
                    <th className="px-3 py-2 text-left">Not</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note) => (
                    <tr key={note.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {note.customer?.displayName || note.customer?.mikroName || note.customer?.name || '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">{note.customer?.mikroCariCode}</div>
                      </td>
                      <td className="px-3 py-2">{note.author?.name || '-'}</td>
                      <td className="px-3 py-2">{formatDateShort(note.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {note.tags?.map((tag) => (
                            <Badge key={tag} variant="outline">{tag}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {note.reminderDate ? (
                          <Badge variant={note.reminderCompleted ? 'success' : 'warning'}>
                            {formatDateShort(note.reminderDate)}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate">{note.noteContent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
