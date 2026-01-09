'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { VadeBalance } from '@/types';

type Pagination = { page: number; limit: number; total: number; totalPages: number };

export default function VadePage() {
  const router = useRouter();
  const [balances, setBalances] = useState<VadeBalance[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeBalances({
        search: search.trim() || undefined,
        page: pagination.page,
        limit: pagination.limit,
        overdueOnly,
        upcomingOnly,
      });
      setBalances(response.balances || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Vade balances not loaded:', error);
      toast.error('Vade listesi yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit, overdueOnly, upcomingOnly]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const totals = useMemo(() => {
    const summary = balances.reduce(
      (acc, balance) => {
        acc.count += 1;
        acc.overdue += balance.pastDueBalance || 0;
        acc.upcoming += balance.notDueBalance || 0;
        acc.total += balance.totalBalance || 0;
        return acc;
      },
      { count: 0, overdue: 0, upcoming: 0, total: 0 }
    );
    return summary;
  }, [balances]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await adminApi.triggerVadeSync();
      if (result.success) {
        toast.success('Vade senkronizasyonu basladi');
      } else {
        toast.error(result.error || 'Vade senkronizasyonu baslatilamadi');
      }
    } catch (error) {
      console.error('Vade sync error:', error);
      toast.error('Vade senkronizasyonu baslatilamadi');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Vade Takip</h1>
            <p className="text-sm text-muted-foreground">Mikro kaynakli vade ve alacak listesi</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/vade/import')}>
              Excel Import
            </Button>
            <Button variant="outline" onClick={() => router.push('/vade/notes')}>
              Not Raporu
            </Button>
            <Button variant="outline" onClick={() => router.push('/vade/calendar')}>
              Hatirlatma
            </Button>
            <Button variant="outline" onClick={() => router.push('/vade/assignments')}>
              Atamalar
            </Button>
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? 'Senkronize...' : 'Senkronize Et'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Toplam Cari</div>
            <div className="text-xl font-semibold">{totals.count}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Vadesi Gecen</div>
            <div className="text-xl font-semibold text-red-600">{formatCurrency(totals.overdue)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Vadesi Gelmemis</div>
            <div className="text-xl font-semibold text-blue-600">{formatCurrency(totals.upcoming)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Toplam Bakiye</div>
            <div className="text-xl font-semibold">{formatCurrency(totals.total)}</div>
          </Card>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Cari kodu, unvan, sektor..."
              value={search}
              onChange={(event) => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setSearch(event.target.value);
              }}
              className="md:max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant={overdueOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setOverdueOnly((prev) => !prev);
                }}
              >
                Vadesi Gecen
              </Button>
              <Button
                variant={upcomingOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setUpcomingOnly((prev) => !prev);
                }}
              >
                Vadesi Gelmemis
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setOverdueOnly(false);
                  setUpcomingOnly(false);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                Temizle
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Cari</th>
                  <th className="px-3 py-2 text-left">Sektor</th>
                  <th className="px-3 py-2 text-left">Vadesi Gecen</th>
                  <th className="px-3 py-2 text-left">Vade Tarihi</th>
                  <th className="px-3 py-2 text-left">Vadesi Gelmemis</th>
                  <th className="px-3 py-2 text-left">Vade Tarihi</th>
                  <th className="px-3 py-2 text-left">Toplam</th>
                  <th className="px-3 py-2 text-left">Valor</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-left">Guncel</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                      Yukleniyor...
                    </td>
                  </tr>
                )}
                {!loading && balances.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                      Sonuc bulunamadi.
                    </td>
                  </tr>
                )}
                {!loading && balances.map((balance) => (
                  <tr
                    key={balance.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => router.push(`/vade/customers/${balance.user.id}`)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {balance.user.displayName || balance.user.mikroName || balance.user.name || '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">{balance.user.mikroCariCode}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{balance.user.sectorCode || '-'}</div>
                      {balance.user.groupCode && (
                        <div className="text-xs text-muted-foreground">{balance.user.groupCode}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className={balance.pastDueBalance > 0 ? 'text-red-600 font-semibold' : ''}>
                        {formatCurrency(balance.pastDueBalance || 0)}
                      </div>
                    </td>
                    <td className="px-3 py-2">{balance.pastDueDate ? formatDateShort(balance.pastDueDate) : '-'}</td>
                    <td className="px-3 py-2">
                      <div className={balance.notDueBalance > 0 ? 'text-blue-600 font-semibold' : ''}>
                        {formatCurrency(balance.notDueBalance || 0)}
                      </div>
                    </td>
                    <td className="px-3 py-2">{balance.notDueDate ? formatDateShort(balance.notDueDate) : '-'}</td>
                    <td className="px-3 py-2">{formatCurrency(balance.totalBalance || 0)}</td>
                    <td className="px-3 py-2">
                      {balance.valor > 0 ? <Badge variant="destructive">{balance.valor} gun</Badge> : '-'}
                    </td>
                    <td className="px-3 py-2">{balance.paymentTermLabel || balance.user.paymentPlanName || '-'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {balance.updatedAt ? formatDateShort(balance.updatedAt) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Toplam {pagination.total} kayit
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                Onceki
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Sonraki
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
