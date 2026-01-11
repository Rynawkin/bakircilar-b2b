'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { VadeBalance } from '@/types';
import * as XLSX from 'xlsx';

type Pagination = { page: number; limit: number; total: number; totalPages: number };

export default function VadePage() {
  const router = useRouter();
  const [balances, setBalances] = useState<VadeBalance[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [sectorCode, setSectorCode] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [hasNotes, setHasNotes] = useState(false);
  const [notesKeyword, setNotesKeyword] = useState('');
  const [sortBy, setSortBy] = useState('pastDueBalance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState({ count: 0, overdue: 0, upcoming: 0, total: 0 });
  const [filterOptions, setFilterOptions] = useState<{ sectorCodes: string[]; groupCodes: string[] }>({
    sectorCodes: [],
    groupCodes: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeBalances({
        search: search.trim() || undefined,
        page: pagination.page,
        limit: pagination.limit,
        overdueOnly,
        upcomingOnly,
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
        minBalance: minBalance !== '' ? Number(minBalance) : undefined,
        maxBalance: maxBalance !== '' ? Number(maxBalance) : undefined,
        hasNotes: hasNotes || undefined,
        notesKeyword: notesKeyword.trim() || undefined,
        sortBy,
        sortDirection,
      });
      setBalances(response.balances || []);
      setPagination(response.pagination);
      setSummary({
        count: response.pagination.total || 0,
        overdue: response.summary?.overdue || 0,
        upcoming: response.summary?.upcoming || 0,
        total: response.summary?.total || 0,
      });
    } catch (error) {
      console.error('Vade balances not loaded:', error);
      toast.error('Vade listesi yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [
    search,
    pagination.page,
    pagination.limit,
    overdueOnly,
    upcomingOnly,
    sectorCode,
    groupCode,
    minBalance,
    maxBalance,
    hasNotes,
    notesKeyword,
    sortBy,
    sortDirection,
  ]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    let mounted = true;
    adminApi.getVadeFilters()
      .then((data) => {
        if (!mounted) return;
        setFilterOptions({
          sectorCodes: data.sectorCodes || [],
          groupCodes: data.groupCodes || [],
        });
      })
      .catch((error) => {
        console.error('Vade filtreleri yuklenemedi:', error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => summary, [summary]);

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

  const handleSort = (key: string) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    if (['customerName', 'mikroCariCode', 'sectorCode', 'groupCode', 'lastNoteAt'].includes(key)) {
      setSortDirection('asc');
    } else {
      setSortDirection('desc');
    }
  };

  const getSortIndicator = (key: string) => {
    if (sortBy !== key) return '';
    return sortDirection === 'asc' ? ' ^' : ' v';
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await adminApi.getVadeBalances({
        search: search.trim() || undefined,
        overdueOnly,
        upcomingOnly,
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
        minBalance: minBalance !== '' ? Number(minBalance) : undefined,
        maxBalance: maxBalance !== '' ? Number(maxBalance) : undefined,
        hasNotes: hasNotes || undefined,
        notesKeyword: notesKeyword.trim() || undefined,
        sortBy,
        sortDirection,
        export: true,
      });
      const rows = response.balances || [];
      if (rows.length === 0) {
        toast.error('Indirilecek kayit yok');
        return;
      }

      const exportRows = rows.map((balance) => ({
        'Cari Kodu': balance.user.mikroCariCode || '',
        'Cari Adi': balance.user.displayName || balance.user.mikroName || balance.user.name || '',
        Sektor: balance.user.sectorCode || '',
        Grup: balance.user.groupCode || '',
        'Vadesi Gecen': balance.pastDueBalance || 0,
        'Vadesi Gecen Vade': balance.pastDueDate ? formatDateShort(balance.pastDueDate) : '',
        Valor: balance.valor || 0,
        'Vadesi Gelmemis': balance.notDueBalance || 0,
        'Vadesi Gelmemis Vade': balance.notDueDate ? formatDateShort(balance.notDueDate) : '',
        Toplam: balance.totalBalance || 0,
        'Odeme Plani': balance.paymentTermLabel || balance.user.paymentPlanName || '',
        'Son Not Tarihi': balance.lastNoteAt ? formatDateShort(balance.lastNoteAt) : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vade Takip');
      const filename = `vade-takip-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, filename);
      toast.success('Excel indirildi');
    } catch (error) {
      console.error('Vade export error:', error);
      toast.error('Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
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
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Hazirlaniyor...' : 'Excel Indir'}
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
                variant={hasNotes ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setHasNotes((prev) => !prev);
                }}
              >
                Notu Olan
              </Button>
              <Button
                variant={filtersOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                Filtreler
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setOverdueOnly(false);
                  setUpcomingOnly(false);
                  setSectorCode('');
                  setGroupCode('');
                  setMinBalance('');
                  setMaxBalance('');
                  setHasNotes(false);
                  setNotesKeyword('');
                  setSortBy('pastDueBalance');
                  setSortDirection('desc');
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                Temizle
              </Button>
            </div>
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Select
                label="Sektor"
                value={sectorCode}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSectorCode(event.target.value);
                }}
              >
                <option value="">Tum sektorler</option>
                {filterOptions.sectorCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </Select>
              <Select
                label="Grup"
                value={groupCode}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setGroupCode(event.target.value);
                }}
              >
                <option value="">Tum gruplar</option>
                {filterOptions.groupCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </Select>
              <Select
                label="Siralama"
                value={sortBy}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSortBy(event.target.value);
                }}
              >
                <option value="customerName">Cari</option>
                <option value="mikroCariCode">Cari Kodu</option>
                <option value="sectorCode">Sektor</option>
                <option value="groupCode">Grup</option>
                <option value="pastDueBalance">Vadesi Gecen</option>
                <option value="pastDueDate">Vade Tarihi (Gecen)</option>
                <option value="notDueBalance">Vadesi Gelmemis</option>
                <option value="notDueDate">Vade Tarihi (Gelmemis)</option>
                <option value="totalBalance">Toplam</option>
                <option value="valor">Valor</option>
                <option value="lastNoteAt">Son Not</option>
                <option value="updatedAt">Guncel</option>
              </Select>
              <Select
                label="Yon"
                value={sortDirection}
                onChange={(event) => {
                  setPagination((prev) => ({ ...prev, page: 1 }));
                  setSortDirection(event.target.value as 'asc' | 'desc');
                }}
              >
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </Select>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Min Bakiye</label>
                <Input
                  type="number"
                  value={minBalance}
                  onChange={(event) => {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    setMinBalance(event.target.value);
                  }}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max Bakiye</label>
                <Input
                  type="number"
                  value={maxBalance}
                  onChange={(event) => {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    setMaxBalance(event.target.value);
                  }}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <label className="text-xs text-muted-foreground">Not Icerigi</label>
                <Input
                  value={notesKeyword}
                  onChange={(event) => {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    setNotesKeyword(event.target.value);
                  }}
                  placeholder="Not icinde ara..."
                />
              </div>
            </div>
          )}

          <div className="overflow-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('customerName')}>
                    Cari{getSortIndicator('customerName')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('sectorCode')}>
                    Sektor{getSortIndicator('sectorCode')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('pastDueBalance')}>
                    Vadesi Gecen{getSortIndicator('pastDueBalance')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('pastDueDate')}>
                    Vade Tarihi{getSortIndicator('pastDueDate')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('notDueBalance')}>
                    Vadesi Gelmemis{getSortIndicator('notDueBalance')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('notDueDate')}>
                    Vade Tarihi{getSortIndicator('notDueDate')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('totalBalance')}>
                    Toplam{getSortIndicator('totalBalance')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('valor')}>
                    Valor{getSortIndicator('valor')}
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('lastNoteAt')}>
                    Son Not{getSortIndicator('lastNoteAt')}
                  </th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-left cursor-pointer" onClick={() => handleSort('updatedAt')}>
                    Guncel{getSortIndicator('updatedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                      Yukleniyor...
                    </td>
                  </tr>
                )}
                {!loading && balances.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
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
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {balance.lastNoteAt ? (
                        <div>
                          <div>{formatDateShort(balance.lastNoteAt)}</div>
                          <div>
                            {Math.max(
                              0,
                              Math.floor(
                                (new Date().getTime() - new Date(balance.lastNoteAt).getTime())
                                / (24 * 60 * 60 * 1000)
                              )
                            )}{' '}
                            gun once
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
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
