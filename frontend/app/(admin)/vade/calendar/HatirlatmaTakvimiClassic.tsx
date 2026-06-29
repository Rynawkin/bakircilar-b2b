'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useHatirlatmaTakvimi } from './useHatirlatmaTakvimi';

/**
 * Klasik gorunum — mevcut JSX BIREBIR korunmustur. Tum mantik useHatirlatmaTakvimi'den gelir.
 */
export default function HatirlatmaTakvimiClassic() {
  const {
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
