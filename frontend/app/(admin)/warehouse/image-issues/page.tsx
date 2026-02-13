'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateShort } from '@/lib/utils/format';

type ImageIssueStatus = 'OPEN' | 'REVIEWED' | 'FIXED';

interface ImageIssueReport {
  id: string;
  mikroOrderNumber: string;
  orderSeries: string | null;
  customerCode: string | null;
  customerName: string | null;
  lineKey: string;
  rowNumber: number | null;
  productCode: string;
  productName: string;
  imageUrl: string | null;
  note: string | null;
  status: ImageIssueStatus;
  reporterName: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const statusBadge: Record<ImageIssueStatus, { label: string; className: string }> = {
  OPEN: {
    label: 'Acik',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  REVIEWED: {
    label: 'Incelendi',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  FIXED: {
    label: 'Duzeltildi',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
};

export default function WarehouseImageIssuesPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<ImageIssueReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ImageIssueStatus>('OPEN');
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalRecords: 0,
  });
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    reviewed: 0,
    fixed: 0,
  });
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchDebounced(searchText.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const fetchReports = async (showLoader: boolean, targetPage?: number) => {
    const nextPage = targetPage || page;
    if (showLoader) setIsLoading(true);
    try {
      const response = await adminApi.getWarehouseImageIssues({
        status: statusFilter,
        search: searchDebounced || undefined,
        page: nextPage,
        limit: 20,
      });
      setReports((response.reports || []) as ImageIssueReport[]);
      setSummary(response.summary || { total: 0, open: 0, reviewed: 0, fixed: 0 });
      setPagination(response.pagination || { page: nextPage, limit: 20, totalPages: 1, totalRecords: 0 });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Resim hata talepleri yuklenemedi');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking')) {
      router.push('/dashboard');
      return;
    }
    fetchReports(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsLoading, statusFilter, searchDebounced, page]);

  const handleStatusChange = async (report: ImageIssueReport, status: ImageIssueStatus) => {
    const key = `${report.id}:${status}`;
    setActionKey(key);
    try {
      await adminApi.updateWarehouseImageIssue(report.id, { status });
      await fetchReports(false);
      toast.success('Talep durumu guncellendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep durumu guncellenemedi');
    } finally {
      setActionKey((prev) => (prev === key ? null : prev));
    }
  };

  const totalText = useMemo(
    () => `Toplam ${summary.total} talep | Acik ${summary.open} | Incelenen ${summary.reviewed} | Duzeltilen ${summary.fixed}`,
    [summary]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-slate-100">
      <div className="w-full px-2 md:px-4 xl:px-6 py-5 space-y-4">
        <Card className="border border-cyan-200 bg-white/90 backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Resim Hata Talepleri</h1>
                <p className="text-sm text-slate-600">Depo kiosk ekranindan bildirilen urun resmi hatalari</p>
              </div>
              <div className="text-xs md:text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2 inline-flex">
                {totalText}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_140px] gap-3">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Siparis no, urun kodu, urun adi veya musteri ara..."
                className="h-11"
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'ALL' | ImageIssueStatus);
                  setPage(1);
                }}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <option value="ALL">Tum Durumlar</option>
                <option value="OPEN">Acik</option>
                <option value="REVIEWED">Incelendi</option>
                <option value="FIXED">Duzeltildi</option>
              </select>
              <Button variant="secondary" onClick={() => fetchReports(true)} className="h-11">
                Yenile
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 bg-white/90">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 font-semibold">Yukleniyor...</div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-semibold">Filtreye uygun talep bulunamadi</div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const status = statusBadge[report.status];
                return (
                  <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
                    <div className="flex flex-col lg:flex-row gap-3">
                      <div className="w-28 h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        {report.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: report.imageUrl as string, name: report.productName })}
                            className="block w-full h-full"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={report.imageUrl} alt={report.productName} className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-slate-500">RESIM YOK</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm md:text-base font-black text-slate-900 line-clamp-2">
                              {report.productName}
                            </p>
                            <p className="text-xs text-slate-600">
                              {report.productCode}
                              {report.rowNumber ? ` | Satir #${report.rowNumber}` : ''}
                            </p>
                          </div>
                          <span className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold ${status.className}`}>
                            {status.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Siparis</p>
                            <p className="font-semibold text-slate-800">
                              {report.mikroOrderNumber} {report.orderSeries ? `(${report.orderSeries})` : ''}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Musteri</p>
                            <p className="font-semibold text-slate-800">
                              {report.customerCode || '-'} | {report.customerName || '-'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Bildiren</p>
                            <p className="font-semibold text-slate-800">{report.reporterName || '-'}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Bildirim Tarihi</p>
                            <p className="font-semibold text-slate-800">{formatDateShort(report.createdAt)}</p>
                          </div>
                        </div>

                        {(report.note || report.reviewNote || report.reviewedByName) && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-1">
                            {report.note && (
                              <p>
                                <span className="font-bold text-slate-600">Depo Notu:</span> {report.note}
                              </p>
                            )}
                            {report.reviewNote && (
                              <p>
                                <span className="font-bold text-slate-600">Inceleme Notu:</span> {report.reviewNote}
                              </p>
                            )}
                            {report.reviewedByName && (
                              <p>
                                <span className="font-bold text-slate-600">Inceleyen:</span> {report.reviewedByName}
                                {report.reviewedAt ? ` (${formatDateShort(report.reviewedAt)})` : ''}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            variant={report.status === 'OPEN' ? 'danger' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'OPEN')}
                            disabled={actionKey === `${report.id}:OPEN`}
                            className="h-9 text-xs"
                          >
                            Acik
                          </Button>
                          <Button
                            variant={report.status === 'REVIEWED' ? 'primary' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'REVIEWED')}
                            disabled={actionKey === `${report.id}:REVIEWED`}
                            className="h-9 text-xs"
                          >
                            Incelendi
                          </Button>
                          <Button
                            variant={report.status === 'FIXED' ? 'primary' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'FIXED')}
                            disabled={actionKey === `${report.id}:FIXED`}
                            className="h-9 text-xs"
                          >
                            Duzeltildi
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-slate-500">
                  Sayfa {pagination.page} / {pagination.totalPages} - Toplam {pagination.totalRecords} kayit
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="h-9 text-xs"
                  >
                    Onceki
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                    className="h-9 text-xs"
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-white/90 text-slate-900 font-black"
            >
              X
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-2xl border-2 border-white/50 object-contain bg-slate-950/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
