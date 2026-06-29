'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { EInvoiceDocument } from '@/types';
import { formatDateShort } from '@/lib/utils/format';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { EInvoiceDocument } from '@/types';

export type MikroCari = {
  userId?: string;
  code: string;
  name: string;
  city?: string;
  district?: string;
  phone?: string;
  isLocked: boolean;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  hasEInvoice: boolean;
  balance: number;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const formatAmount = (value?: number | null, currency?: string) => {
  if (value === null || value === undefined) return '-';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currency || ''}`.trim();
  }
};

/**
 * Faturalar (E-Fatura) ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useFaturalar() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [cariList, setCariList] = useState<MikroCari[]>([]);
  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);

  const [search, setSearch] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    uploaded: number;
    updated: number;
    failed: number;
    results: Array<{ invoiceNo: string; status: string; message?: string }>;
  } | null>(null);

  const loadCariList = async () => {
    try {
      const { cariList: data } = await adminApi.getCariList();
      setCariList(data || []);
    } catch (error) {
      console.error('Cari list not loaded', error);
    }
  };

  const loadDocuments = async (page = 1) => {
    setLoading(true);
    try {
      const response = await adminApi.getEInvoices({
        search: search || undefined,
        invoicePrefix: invoicePrefix || undefined,
        customerCode: selectedCari?.code || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: pagination.limit,
      });
      setDocuments(response.documents || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Invoice list not loaded', error);
      toast.error('Fatura listesi alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCariList();
    loadDocuments(1);
  }, []);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('PDF secmeniz gerekiyor');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      const result = await adminApi.uploadEInvoices(formData);
      setUploadResult(result);
      setSelectedFiles([]);
      toast.success('PDF yukleme tamamlandi');
      await loadDocuments(1);
    } catch (error) {
      console.error('Upload failed', error);
      toast.error('PDF yukleme basarisiz');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: EInvoiceDocument) => {
    try {
      const blob = await adminApi.downloadEInvoice(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.invoiceNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed', error);
      toast.error('PDF indirilemedi');
    }
  };

  const selectableIds = documents.filter((doc) => doc.fileName).map((doc) => doc.id);
  const selectedCount = selectedIds.size;
  const allSelectedOnPage =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) {
      toast.error('Once fatura secin');
      return;
    }

    const missingFiles = documents.filter((doc) => selectedIds.has(doc.id) && !doc.fileName);
    if (missingFiles.length > 0) {
      toast.error('PDF bulunamayan faturalar secildi');
      return;
    }

    setBulkDownloading(true);
    try {
      const blob = await adminApi.downloadEInvoices(Array.from(selectedIds));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      link.href = url;
      link.download = `faturalar_${stamp}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Toplu indirme basladi');
    } catch (error) {
      console.error('Bulk download failed', error);
      toast.error('Toplu indirme basarisiz');
    } finally {
      setBulkDownloading(false);
    }
  };

  return {
    // helpers
    formatAmount,
    formatDateShort,
    // liste / pagination / loading
    documents,
    pagination,
    loading,
    loadDocuments,
    // toplu indirme
    bulkDownloading,
    handleBulkDownload,
    // secim
    selectedIds,
    setSelectedIds,
    selectableIds,
    selectedCount,
    allSelectedOnPage,
    toggleSelectAll,
    toggleSelection,
    // cari
    cariList,
    cariModalOpen,
    setCariModalOpen,
    selectedCari,
    setSelectedCari,
    // filtre
    search,
    setSearch,
    invoicePrefix,
    setInvoicePrefix,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    // upload
    selectedFiles,
    setSelectedFiles,
    uploading,
    uploadResult,
    handleUpload,
    // indirme (tekil)
    handleDownload,
  };
}

export default useFaturalar;
