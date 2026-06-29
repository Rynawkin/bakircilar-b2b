'use client';

import Link from 'next/link';
import { ArrowLeft, CheckCircle2, RefreshCw, Save, Search } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useBanaAtananGeriKazanim, toDateInputValue } from './useBanaAtananGeriKazanim';

/**
 * Klasik gorunum: Bana Atanan Geri Kazanim Aksiyonlari.
 * Mevcut JSX BIREBIR korunmustur; tum mantik useBanaAtananGeriKazanim hook'undan gelir.
 */
export default function BanaAtananGeriKazanimClassic() {
  const {
    actions,
    status,
    setStatus,
    search,
    setSearch,
    dueOnly,
    setDueOnly,
    page,
    setPage,
    pagination,
    loading,
    savingId,
    drafts,
    runSearch,
    updateDraft,
    saveAction,
    safeDate,
  } = useBanaAtananGeriKazanim();

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 p-6 text-white shadow-xl lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/reports/customer-recovery" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Cari geri kazanim raporuna don
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Bana atanan geri kazanım aksiyonları</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-100/85">
            Size atanan cari takiplerini buradan kapatabilir, takip tarihini guncelleyebilir ve gorusme sonucunu notlayabilirsiniz.
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm backdrop-blur-sm">
          <div className="text-white/70">Toplam aksiyon</div>
          <div className="mt-1 text-2xl font-bold">{pagination.totalRecords}</div>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b bg-white">
          <CardTitle>Filtreler</CardTitle>
          <CardDescription>Durum, cari veya not icinde arama yapin.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[220px_1fr_auto_auto] lg:items-end">
          <Select label="Durum" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">Acik</option>
            <option value="DONE">Tamamlanan</option>
            <option value="CANCELLED">Iptal</option>
            <option value="ALL">Tumu</option>
          </Select>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cari / not ara</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runSearch();
                }}
                className="pl-10"
                placeholder="Cari kodu, cari adi veya not..."
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} />
            Sadece takip tarihi gecenler
          </label>
          <Button onClick={runSearch} isLoading={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Listele
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b bg-white">
          <CardTitle>Aksiyonlarım</CardTitle>
          <CardDescription>
            Sayfa {pagination.page || page} / {pagination.totalPages || 0}, {pagination.totalRecords} kayit
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cari</TableHead>
                <TableHead>Aksiyon</TableHead>
                <TableHead>Takip</TableHead>
                <TableHead>Durum notu</TableHead>
                <TableHead className="text-right">Kaydet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-gray-500">Aksiyonlar yukleniyor...</TableCell>
                </TableRow>
              ) : actions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-gray-500">Filtrelere uygun aksiyon bulunamadi.</TableCell>
                </TableRow>
              ) : actions.map((action) => {
                const draft = drafts[action.id] || {
                  status: action.status || 'OPEN',
                  outcome: action.outcome || '',
                  followUpDate: toDateInputValue(action.followUpDate),
                };
                return (
                  <TableRow key={action.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="font-semibold text-gray-900">{action.customerName || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500">{action.customerCode}</div>
                      <div className="mt-2 text-xs text-gray-500">
                        Atayan: {action.author?.name || '-'} / {safeDate(action.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[280px]">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge variant={action.status === 'DONE' ? 'success' : 'warning'}>{action.status}</Badge>
                        <Badge variant="outline">{action.actionType}</Badge>
                        <Badge variant="outline">{action.priority}</Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{action.note}</p>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="space-y-3">
                        <Select label="Durum" value={draft.status} onChange={(event) => updateDraft(action.id, { status: event.target.value })}>
                          <option value="OPEN">Acik</option>
                          <option value="DONE">Tamamlandi</option>
                          <option value="CANCELLED">Iptal</option>
                        </Select>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">Takip tarihi</label>
                          <Input type="date" value={draft.followUpDate} onChange={(event) => updateDraft(action.id, { followUpDate: event.target.value })} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[320px]">
                      <textarea
                        value={draft.outcome}
                        onChange={(event) => updateDraft(action.id, { outcome: event.target.value })}
                        placeholder="Gorusme sonucu, musteri cevabi veya sonraki adim..."
                        className="min-h-[110px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        <Button size="sm" variant="outline" isLoading={savingId === action.id} onClick={() => saveAction(action)}>
                          <Save className="mr-1.5 h-4 w-4" />
                          Kaydet
                        </Button>
                        {action.status !== 'DONE' && (
                          <Button size="sm" isLoading={savingId === action.id} onClick={() => saveAction(action, true)}>
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Kapat
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t bg-slate-50 p-4">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Onceki
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>
              Sonraki
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
