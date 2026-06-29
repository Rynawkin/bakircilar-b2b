'use client';

import Link from 'next/link';
import { Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { usePersonelAktivite } from './usePersonelAktivite';

export default function PersonelAktiviteClassic() {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    role,
    setRole,
    route,
    setRoute,
    userId,
    setUserId,
    loading,
    summary,
    topRoutes,
    topUsers,
    events,
    page,
    totalPages,
    fetchReport,
    formatDateTime,
    formatDuration,
    methodVariant,
    statusVariant,
  } = usePersonelAktivite();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Personel Aktivite Takibi</h1>
              <p className="text-sm text-gray-600">Staff kullanicilarinin API islemlerini izler</p>
            </div>
          </div>
          <Button onClick={() => fetchReport(page)} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtreler</CardTitle>
            <CardDescription>Tarih, rol, route ve kullanici bazli filtreleme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Tum Roller</option>
                <option value="HEAD_ADMIN">HEAD_ADMIN</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="SALES_REP">SALES_REP</option>
                <option value="DEPOCU">DEPOCU</option>
                <option value="DIVERSEY">DIVERSEY</option>
              </Select>
              <Input placeholder="Route filtre (or: /orders)" value={route} onChange={(e) => setRoute(e.target.value)} />
              <Input placeholder="User ID (opsiyonel)" value={userId} onChange={(e) => setUserId(e.target.value)} />
              <Button onClick={() => fetchReport(1)} disabled={loading}>
                <Activity className="mr-2 h-4 w-4" />
                Raporu Calistir
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-500">Toplam Event</p>
              <p className="text-2xl font-bold">{summary?.totalEvents || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-500">Aktif Personel</p>
              <p className="text-2xl font-bold">{summary?.uniqueStaff || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-500">Toplam Tıklama</p>
              <p className="text-2xl font-bold">{summary?.clickCount || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-500">Toplam Aktiflik (sn)</p>
              <p className="text-2xl font-bold">{summary?.activeSeconds || 0}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">En Cok Islem Yapilan Rotalar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topRoutes.length === 0 && <p className="text-sm text-gray-500">Kayit yok</p>}
              {topRoutes.map((row) => (
                <div key={row.route} className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm font-mono break-all">{row.route}</span>
                  <Badge variant="info">{row.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">En Aktif Personeller</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topUsers.length === 0 && <p className="text-sm text-gray-500">Kayit yok</p>}
              {topUsers.map((row) => (
                <div key={row.userId} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <p className="text-sm font-semibold">{row.userName || row.email || row.userId}</p>
                    <p className="text-xs text-gray-500">{row.role}</p>
                  </div>
                  <Badge variant="success">{row.eventCount}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Event Detayi</CardTitle>
            <CardDescription>Son aktiviteler</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Personel</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Adim / Aksiyon</TableHead>
                  <TableHead>Detay</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Sure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500">
                      Kayit yok
                    </TableCell>
                  </TableRow>
                )}
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs">{formatDateTime(event.createdAt)}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <p className="font-semibold">{event.userName || '-'}</p>
                        <p className="text-gray-500">{event.email || event.userId}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="default">{event.role}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={methodVariant(event.method)}>{event.method}</Badge>
                        <span className="text-xs font-mono">{event.action || event.route || event.pagePath || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-700">{event.details || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(event.statusCode)}>
                        {event.statusCode ?? '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDuration(event.durationMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Sayfa {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || page <= 1}
                  onClick={() => fetchReport(page - 1)}
                >
                  Geri
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || page >= totalPages}
                  onClick={() => fetchReport(page + 1)}
                >
                  Ileri
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Method Dagilimi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Badge variant="info" className="justify-center py-2">GET: {summary?.getCount || 0}</Badge>
              <Badge variant="success" className="justify-center py-2">POST: {summary?.postCount || 0}</Badge>
              <Badge variant="warning" className="justify-center py-2">PUT: {summary?.putCount || 0}</Badge>
              <Badge variant="warning" className="justify-center py-2">PATCH: {summary?.patchCount || 0}</Badge>
              <Badge variant="danger" className="justify-center py-2">DELETE: {summary?.deleteCount || 0}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
