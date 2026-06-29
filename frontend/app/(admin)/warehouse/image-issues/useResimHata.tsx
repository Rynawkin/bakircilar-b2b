'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';

export type ImageIssueStatus = 'OPEN' | 'REVIEWED' | 'FIXED';

export interface ImageIssueReport {
  id: string;
  mikroOrderNumber: string;
  orderSeries: string | null;
  customerCode: string | null;
  customerName: string | null;
  lineKey: string;
  rowNumber: number | null;
  productCode: string;
  productName: string;
  productId: string | null;
  currentProductImageUrl: string | null;
  imageUrl: string | null;
  note: string | null;
  status: ImageIssueStatus;
  reporterName: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const statusBadge: Record<ImageIssueStatus, { label: string; className: string }> = {
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

/**
 * Resim Hata Talepleri ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useResimHata() {
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
  const [uploadingReportId, setUploadingReportId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const openUploadPicker = (reportId: string) => {
    const ref = fileInputRefs.current[reportId];
    if (ref) {
      ref.click();
    }
  };

  const handleUploadImage = async (report: ImageIssueReport, file: File | null) => {
    if (!file) return;
    if (!report.productId) {
      toast.error('Bu urun sistemde bulunamadi, once urun kartini kontrol edin');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Lutfen sadece resim dosyasi yukleyin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB altinda olmali');
      return;
    }

    setUploadingReportId(report.id);
    try {
      const formData = new FormData();
      formData.append('image', file);
      await adminApi.uploadProductImage(report.productId, formData);
      await adminApi.updateWarehouseImageIssue(report.id, {
        status: 'FIXED',
        note: 'Resim hata talepleri ekranindan guncellendi',
      });
      await fetchReports(false);
      toast.success('Resim yuklendi ve talep duzeltildi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Resim yuklenemedi');
    } finally {
      setUploadingReportId((prev) => (prev === report.id ? null : prev));
    }
  };

  return {
    // router
    router,
    // veri / yuklenme
    isLoading,
    reports,
    // filtre / arama
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
    // sayfalama
    page,
    setPage,
    pagination,
    // ozet
    summary,
    totalText,
    // aksiyon durumlari
    actionKey,
    uploadingReportId,
    // onizleme
    previewImage,
    setPreviewImage,
    // dosya inputlari
    fileInputRefs,
    // handler'lar
    fetchReports,
    handleStatusChange,
    openUploadPicker,
    handleUploadImage,
    // sabitler / yardimci
    statusBadge,
    formatDateShort,
  };
}

export default useResimHata;
