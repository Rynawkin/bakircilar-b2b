'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  FileText,
  Mail,
  Package,
  Search,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardRoot as Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

interface Customer360SearchRow {
  id: string;
  displayTitle?: string | null;
  mikroCariCode?: string | null;
  mikroName?: string | null;
  name?: string | null;
  city?: string | null;
  district?: string | null;
  sectorCode?: string | null;
  active?: boolean;
  balance?: number | null;
}

const safeDate = (value: unknown) => {
  if (!value) return '-';
  return formatDateShort(String(value));
};

const money = (value: unknown) => formatCurrency(Number(value || 0));

const statusClass = (value: unknown) => {
  const status = String(value || '').toUpperCase();
  if (status.includes('APPROVED') || status.includes('ACCEPTED') || status.includes('COMPLETED')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status.includes('REJECTED') || status.includes('CANCEL') || status.includes('OVERDUE')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (status.includes('PENDING') || status.includes('WAITING') || status.includes('OPEN')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const StatusBadge = ({ value }: { value: unknown }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(value)}`}>
    {String(value || '-')}
  </span>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
    {text}
  </div>
);

export default function Customer360Page() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer360SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer360SearchRow | null>(null);
  const [data, setData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:customers')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  useEffect(() => {
    if (user === null || permissionsLoading || !hasPermission('admin:customers')) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await adminApi.searchCustomer360({ search, limit: 25 });
        setCustomers(result.customers || []);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Cari arama yapilamadi');
        setCustomers([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, user, permissionsLoading, hasPermission]);

  const loadCustomer = async (customer: Customer360SearchRow) => {
    const id = String(customer.id || customer.mikroCariCode || '').trim();
    if (!id) return;
    setSelectedCustomer(customer);
    setData(null);
    setLoadingDetail(true);
    try {
      const response = await adminApi.getCustomer360(id);
      setData(response.data || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Cari 360 getirilemedi');
      setData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const customer = data?.customer || selectedCustomer;
  const summary = data?.summary || {};
  const activityCounts = data?.activity?.countsByType || {};
  const activityRows = useMemo(
    () => Object.entries(activityCounts).sort((a, b) => Number(b[1]) - Number(a[1])),
    [activityCounts]
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Cari 360</h1>
            <p className="mt-1 text-sm text-slate-600">
              Cariyi secip satis, teklif, sepet, vade, aksiyon ve aktiviteyi tek ekranda inceleyin.
            </p>
          </div>
          <Link href="/customers">
            <Button variant="outline">Musteri Listesi</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5" />
                Cari Ara
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Kod, unvan, sehir veya sektor"
              />
              <div className="mt-3 max-h-[680px] space-y-2 overflow-auto pr-1">
                {searching && <EmptyState text="Cariler yukleniyor..." />}
                {!searching && customers.length === 0 && <EmptyState text="Cari bulunamadi." />}
                {!searching && customers.map((item) => {
                  const active = String(selectedCustomer?.id || '') === String(item.id || '');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => loadCustomer(item)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.displayTitle || item.mikroName || item.name || '-'}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.mikroCariCode || '-'} / {item.sectorCode || '-'}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {item.active === false ? 'Pasif' : 'Aktif'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <span>{[item.city, item.district].filter(Boolean).join(' / ') || '-'}</span>
                        <span className="font-semibold">{money(item.balance)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {!customer && (
              <Card>
                <CardContent className="pt-6">
                  <EmptyState text="Analiz icin soldan bir cari secin." />
                </CardContent>
              </Card>
            )}

            {customer && (
              <>
                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 p-5 text-white">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-blue-100">{customer.mikroCariCode || '-'}</p>
                        <h2 className="mt-1 text-2xl font-bold">{customer.displayTitle || customer.mikroName || customer.name || '-'}</h2>
                        <p className="mt-2 text-sm text-slate-200">
                          {[customer.city, customer.district].filter(Boolean).join(' / ') || '-'} / Sektor: {customer.sectorCode || '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/10 px-4 py-3 text-right">
                        <p className="text-xs text-blue-100">Cari Bakiye</p>
                        <p className="text-xl font-bold">{money(summary.balance ?? customer.balance)}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {loadingDetail ? (
                  <Card>
                    <CardContent className="pt-6">
                      <EmptyState text="Cari detaylari yukleniyor..." />
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <Metric icon={ClipboardList} title="Siparis" value={summary.orderCount || 0} sub={`${money(summary.orderAmount)} / Bekleyen ${summary.pendingOrderCount || 0}`} />
                      <Metric icon={FileText} title="Teklif" value={summary.quoteCount || 0} sub={`${money(summary.quoteAmount)} / Bekleyen ${summary.pendingQuoteCount || 0}`} />
                      <Metric icon={ShoppingCart} title="Sepet" value={summary.cartItemCount || 0} sub={money(summary.cartTotal)} />
                      <Metric icon={AlertTriangle} title="Aksiyon" value={summary.openTaskCount || 0} sub={`Geciken ${summary.overdueTaskCount || 0} / Geri kazanma ${summary.openRecoveryActionCount || 0}`} />
                    </div>

                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                      <Section title="Son Siparisler" icon={ClipboardList}>
                        <DataTable
                          rows={data?.orders || []}
                          emptyText="Siparis yok."
                          columns={[
                            ['Siparis', (row) => row.orderNumber || row.customerOrderNumber || '-'],
                            ['Durum', (row) => <StatusBadge value={row.status} />],
                            ['Tutar', (row) => money(row.totalAmount)],
                            ['Tarih', (row) => safeDate(row.createdAt)],
                          ]}
                        />
                      </Section>

                      <Section title="Son Teklifler" icon={FileText}>
                        <DataTable
                          rows={data?.quotes || []}
                          emptyText="Teklif yok."
                          columns={[
                            ['Teklif', (row) => row.quoteNumber || row.mikroNumber || '-'],
                            ['Durum', (row) => <StatusBadge value={row.status} />],
                            ['Tutar', (row) => money(row.grandTotal ?? row.totalAmount)],
                            ['Tarih', (row) => safeDate(row.createdAt)],
                          ]}
                        />
                      </Section>

                      <Section title="Aktif Sepet" icon={ShoppingCart}>
                        <DataTable
                          rows={data?.cart?.items || []}
                          emptyText="Sepette urun yok."
                          columns={[
                            ['Stok', (row) => row.product?.mikroCode || '-'],
                            ['Urun', (row) => row.product?.name || '-'],
                            ['Miktar', (row) => Number(row.quantity || 0).toLocaleString('tr-TR')],
                            ['Tutar', (row) => money(Number(row.quantity || 0) * Number(row.unitPrice || 0))],
                          ]}
                        />
                      </Section>

                      <Section title="Vade ve Notlar" icon={Wallet}>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <MiniStat label="Vade Bakiyesi" value={money(data?.vade?.balance?.balance ?? summary.balance)} />
                          <MiniStat label="Sinif" value={data?.vade?.classification?.classCode || '-'} />
                          <MiniStat label="Aktif Atama" value={(data?.vade?.assignments || []).length} />
                        </div>
                        <div className="mt-3 space-y-2">
                          {(data?.vade?.notes || []).slice(0, 4).map((note: any) => (
                            <div key={note.id} className="rounded-lg border bg-slate-50 p-2 text-xs">
                              <p className="font-semibold text-slate-800">{note.author?.name || note.author?.email || '-'}</p>
                              <p className="mt-1 text-slate-600">{note.note || note.content || '-'}</p>
                            </div>
                          ))}
                          {(data?.vade?.notes || []).length === 0 && <EmptyState text="Vade notu yok." />}
                        </div>
                      </Section>
                    </div>

                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
                      <Section title="Aktivite" icon={Activity}>
                        <div className="grid grid-cols-2 gap-2">
                          <MiniStat label="30 Gun Event" value={summary.activityEventCount30d || 0} />
                          <MiniStat label="Son Aktivite" value={safeDate(summary.lastActivityAt)} />
                        </div>
                        <div className="mt-3 space-y-1 text-xs">
                          {activityRows.slice(0, 8).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                              <span>{key}</span>
                              <strong>{Number(value).toLocaleString('tr-TR')}</strong>
                            </div>
                          ))}
                        </div>
                      </Section>

                      <Section title="Anlasmalar" icon={Tag}>
                        <MiniStat label="Aktif Anlasma" value={summary.activeAgreementCount || 0} />
                        <DataTable
                          rows={data?.agreements?.recent || []}
                          emptyText="Aktif anlasma yok."
                          columns={[
                            ['Stok', (row) => row.product?.mikroCode || '-'],
                            ['Urun', (row) => row.product?.name || '-'],
                            ['Fiyat', (row) => money(row.priceInvoiced ?? row.priceWhite)],
                          ]}
                        />
                      </Section>

                      <Section title="Kisiler ve Alt Kullanici" icon={Users}>
                        <div className="space-y-2">
                          {(data?.contacts || []).slice(0, 5).map((contact: any) => (
                            <div key={contact.id} className="rounded-lg border bg-white p-2 text-xs">
                              <p className="font-semibold text-slate-900">{contact.name || '-'}</p>
                              <p className="text-slate-600">{[contact.phone, contact.email].filter(Boolean).join(' / ') || '-'}</p>
                            </div>
                          ))}
                          {(data?.subUsers || []).slice(0, 5).map((subUser: any) => (
                            <div key={subUser.id} className="rounded-lg border bg-blue-50 p-2 text-xs">
                              <p className="font-semibold text-slate-900">{subUser.name || subUser.displayName || subUser.email}</p>
                              <p className="text-slate-600">{subUser.email}</p>
                            </div>
                          ))}
                          {(data?.contacts || []).length === 0 && (data?.subUsers || []).length === 0 && <EmptyState text="Kisi veya alt kullanici yok." />}
                        </div>
                      </Section>
                    </div>

                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                      <Section title="Gorev ve Geri Kazanma" icon={Package}>
                        <DataTable
                          rows={[...(data?.tasks || []), ...(data?.recoveryActions || [])].slice(0, 10)}
                          emptyText="Aksiyon yok."
                          columns={[
                            ['Baslik', (row) => row.title || row.note || row.actionType || '-'],
                            ['Durum', (row) => <StatusBadge value={row.status} />],
                            ['Atanan', (row) => row.assignedTo?.name || row.assignedTo?.email || '-'],
                            ['Tarih', (row) => safeDate(row.updatedAt || row.createdAt)],
                          ]}
                        />
                      </Section>

                      <Section title="Faturalar ve Talepler" icon={Mail}>
                        <DataTable
                          rows={[...(data?.invoices?.recent || []), ...(data?.orderRequests || [])].slice(0, 10)}
                          emptyText="Kayit yok."
                          columns={[
                            ['No', (row) => row.invoiceNo || row.order?.orderNumber || row.id || '-'],
                            ['Durum', (row) => <StatusBadge value={row.matchStatus || row.status} />],
                            ['Tutar', (row) => row.totalAmount !== undefined ? money(row.totalAmount) : '-'],
                            ['Tarih', (row) => safeDate(row.issueDate || row.createdAt)],
                          ]}
                        />
                      </Section>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-2xl bg-slate-900 p-3 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-950">
            {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
          </p>
          <p className="truncate text-xs text-slate-500">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-slate-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DataTable({
  rows,
  columns,
  emptyText,
}: {
  rows: any[];
  columns: Array<[string, (row: any) => ReactNode]>;
  emptyText: string;
}) {
  if (!rows || rows.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map(([title]) => (
              <th key={title} className="px-3 py-2 text-left font-semibold text-slate-600">{title}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={row.id || `${rowIndex}`} className="hover:bg-slate-50">
              {columns.map(([title, render]) => (
                <td key={title} className="max-w-[260px] truncate px-3 py-2 text-slate-700">
                  {render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
