'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { VadeAssignment, VadeNote } from '@/types';

type CustomerDetail = {
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

const classificationOptions = [
  { value: 'green', label: 'Yesil - Dusuk Risk' },
  { value: 'yellow', label: 'Sari - Orta Risk' },
  { value: 'red', label: 'Kirmizi - Yuksek Risk' },
  { value: 'black', label: 'Siyah - Cok Yuksek Risk' },
  { value: 'special', label: 'Ozel Durum' },
  { value: 'custom', label: 'Ozel Siniflandirma' },
];

const tagToBadge = (tag: string) => {
  const key = tag.toLowerCase();
  if (key.includes('promise') || key.includes('soz')) return 'success';
  if (key.includes('erte') || key.includes('postpone')) return 'warning';
  if (key.includes('yanit') || key.includes('no')) return 'danger';
  if (key.includes('takip') || key.includes('follow')) return 'info';
  return 'default';
};

export default function VadeCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = String(params.id || '');

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

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

  const handleSaveNote = async () => {
    if (!noteContent.trim()) {
      toast.error('Not bos olamaz');
      return;
    }
    setSavingNote(true);
    try {
      const tags = noteTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const response = await adminApi.createVadeNote({
        customerId,
        noteContent: noteContent.trim(),
        promiseDate: promiseDate || null,
        tags,
        reminderDate: reminderDate || null,
        reminderNote: reminderNote || null,
      });
      setNotes((prev) => [response.note, ...prev]);
      setNoteContent('');
      setNoteTags('');
      setPromiseDate('');
      setReminderDate('');
      setReminderNote('');
      toast.success('Not eklendi');
    } catch (error) {
      console.error('Note create error:', error);
      toast.error('Not eklenemedi');
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

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{customerLabel || 'Cari Detay'}</h1>
            <p className="text-sm text-muted-foreground">{customer?.mikroCariCode}</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/vade')}>
            Geri Don
          </Button>
        </div>

        {loading && (
          <Card className="p-6 text-center text-muted-foreground">Yukleniyor...</Card>
        )}

        {!loading && !customer && (
          <Card className="p-6 text-center text-muted-foreground">Cari bulunamadi.</Card>
        )}

        {!loading && customer && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Vadesi Gecen</div>
                <div className="text-xl font-semibold text-red-600">
                  {formatCurrency(balance?.pastDueBalance || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {balance?.pastDueDate ? formatDateShort(balance.pastDueDate) : '-'}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Vadesi Gelmemis</div>
                <div className="text-xl font-semibold text-blue-600">
                  {formatCurrency(balance?.notDueBalance || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {balance?.notDueDate ? formatDateShort(balance.notDueDate) : '-'}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Toplam / Valor</div>
                <div className="text-xl font-semibold">{formatCurrency(balance?.totalBalance || 0)}</div>
                <div className="text-xs text-muted-foreground">
                  {balance?.valor ? `${balance.valor} gun` : '-'}
                </div>
              </Card>
            </div>

            <Card className="p-4 grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Sektor / Grup</div>
                <div className="font-medium">{customer.sectorCode || '-'}</div>
                <div className="text-xs text-muted-foreground">{customer.groupCode || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Vade Plani</div>
                <div className="font-medium">{balance?.paymentTermLabel || customer.paymentPlanName || '-'}</div>
                <div className="text-xs text-muted-foreground">{customer.paymentPlanCode || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Lokasyon</div>
                <div className="font-medium">{customer.city || '-'}</div>
                <div className="text-xs text-muted-foreground">{customer.district || '-'}</div>
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              <h2 className="text-lg font-semibold">Siniflandirma</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">Seviye</label>
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={classification}
                    onChange={(event) => setClassification(event.target.value)}
                  >
                    {classificationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Risk Skoru</label>
                  <Input
                    value={riskScore}
                    onChange={(event) => setRiskScore(event.target.value)}
                    placeholder="0-100"
                    type="number"
                    min={0}
                    max={100}
                  />
                </div>
                {classification === 'custom' && (
                  <div>
                    <label className="text-xs text-muted-foreground">Ozel Etiket</label>
                    <Input
                      value={customClassification}
                      onChange={(event) => setCustomClassification(event.target.value)}
                      placeholder="Ozel not"
                    />
                  </div>
                )}
              </div>
              <Button onClick={handleSaveClassification} disabled={savingClassification}>
                {savingClassification ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </Card>

            <Card className="p-4 space-y-4">
              <h2 className="text-lg font-semibold">Not Ekle</h2>
              <div className="grid gap-3">
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Not girin..."
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={noteTags}
                    onChange={(event) => setNoteTags(event.target.value)}
                    placeholder="Etiketler (virgul ile)"
                  />
                  <Input
                    type="date"
                    value={promiseDate}
                    onChange={(event) => setPromiseDate(event.target.value)}
                  />
                  <Input
                    type="date"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                  />
                </div>
                <Input
                  value={reminderNote}
                  onChange={(event) => setReminderNote(event.target.value)}
                  placeholder="Hatirlatma notu"
                />
                <Button onClick={handleSaveNote} disabled={savingNote}>
                  {savingNote ? 'Kaydediliyor...' : 'Not Ekle'}
                </Button>
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gecmis Notlar</h2>
                <Button variant="outline" size="sm" onClick={loadDetail}>
                  Yenile
                </Button>
              </div>
              {notes.length === 0 && <div className="text-sm text-muted-foreground">Not bulunamadi.</div>}
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {note.author?.name || 'Sistem'} · {formatDateShort(note.createdAt)}
                    </div>
                    {note.reminderDate && (
                      <div className="flex items-center gap-2">
                        <Badge variant={note.reminderCompleted ? 'success' : 'warning'}>
                          {note.reminderCompleted ? 'Tamamlandi' : 'Hatirlatma'}
                        </Badge>
                        {!note.reminderCompleted && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReminderComplete(note.id)}
                          >
                            Tamamla
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.noteContent}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {note.tags?.map((tag) => (
                      <Badge key={tag} variant={tagToBadge(tag)}>{tag}</Badge>
                    ))}
                    {note.promiseDate && (
                      <Badge variant="info">Soz: {formatDateShort(note.promiseDate)}</Badge>
                    )}
                    {note.reminderDate && (
                      <Badge variant="outline">Hatirlatma: {formatDateShort(note.reminderDate)}</Badge>
                    )}
                    {note.balanceAtTime !== null && note.balanceAtTime !== undefined && (
                      <Badge variant="default">Bakiye: {formatCurrency(note.balanceAtTime)}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-lg font-semibold">Atanan Personeller</h2>
              {assignments.length === 0 && (
                <div className="text-sm text-muted-foreground">Atama yok.</div>
              )}
              {assignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{assignment.staff?.name || 'Personel'}</div>
                    <div className="text-xs text-muted-foreground">{assignment.staff?.role || '-'}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {assignment.createdAt ? formatDateShort(assignment.createdAt) : '-'}
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
