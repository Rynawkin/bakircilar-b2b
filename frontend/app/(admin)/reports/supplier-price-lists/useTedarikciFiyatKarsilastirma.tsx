'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';

/**
 * Tedarikci Fiyat Karsilastirma raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki SupplierPriceListsPage component'inin `return (` oncesindeki her sey
 *  ile tipler aynen buraya tasinmistir.)
 */

export interface Supplier {
  id: string;
  name: string;
}

export interface UploadItem {
  id: string;
  createdAt: string;
  status: string;
  supplier?: Supplier;
  totalItems: number;
  matchedItems: number;
  unmatchedItems: number;
  multiMatchItems: number;
}

export interface PreviewExcel {
  sheetNames: string[];
  sheetName: string;
  headerRow: number | null;
  headers: string[];
  detected: {
    code: string | null;
    name: string | null;
    price: string | null;
  };
  samples: Array<{ code?: string | null; name?: string | null; price?: number | null }>;
}

export interface PreviewPdf {
  codePattern: string | null;
  columns: Array<{
    index: number;
    samples: string[];
  }>;
  rows: Array<{
    cells: string[];
  }>;
  detected: {
    codeIndex: number | null;
    nameIndex: number | null;
    priceIndex: number | null;
  };
}

export interface PreviewData {
  excel?: PreviewExcel | null;
  pdf?: PreviewPdf | null;
}

export interface MappingState {
  excelSheetName: string;
  excelHeaderRow: string;
  excelCodeHeader: string;
  excelNameHeader: string;
  excelPriceHeader: string;
  pdfCodePattern: string;
  pdfColumnRoles: Record<string, PdfColumnRole>;
}

export type ExcelColumnRole = '' | 'code' | 'name' | 'price';
export type PdfColumnRole = '' | 'code' | 'name' | 'price';

export const STATUS_TABS = [
  { key: 'matched', label: 'Eslesenler' },
  { key: 'unmatched', label: 'Esmeyenler' },
  { key: 'multiple', label: 'Coklu Eslesenler' },
  { key: 'suspicious', label: 'Supheli' },
] as const;

export type StatusKey = typeof STATUS_TABS[number]['key'];

const EMPTY_MAPPING: MappingState = {
  excelSheetName: '',
  excelHeaderRow: '',
  excelCodeHeader: '',
  excelNameHeader: '',
  excelPriceHeader: '',
  pdfCodePattern: '',
  pdfColumnRoles: {},
};

const parseOptionalInt = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const formatPercent = (value: number) => {
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted}%`;
};

export function useTedarikciFiyatKarsilastirma() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<UploadItem | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusKey>('matched');
  const [items, setItems] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  const excelHeaders = useMemo(() => {
    if (!preview?.excel?.headers?.length) return [];
    return preview.excel.headers.filter((header) => header && header.trim());
  }, [preview]);

  const pdfColumns = useMemo(() => preview?.pdf?.columns || [], [preview]);

  const parsePreviewNumber = (value: string) => {
    if (!value) return null;
    let normalized = value.replace(/\s+/g, '');
    normalized = normalized.replace(/[^0-9,\.-]/g, '');
    if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(normalized)) {
      normalized = normalized.replace(',', '.');
    } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getExcelRoleForHeader = (header: string): ExcelColumnRole => {
    if (mapping.excelCodeHeader === header) return 'code';
    if (mapping.excelNameHeader === header) return 'name';
    if (mapping.excelPriceHeader === header) return 'price';
    return '';
  };

  const handleExcelRoleChange = (header: string, role: ExcelColumnRole) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (next.excelCodeHeader === header) next.excelCodeHeader = '';
      if (next.excelNameHeader === header) next.excelNameHeader = '';
      if (next.excelPriceHeader === header) next.excelPriceHeader = '';
      if (role === 'code') next.excelCodeHeader = header;
      if (role === 'name') next.excelNameHeader = header;
      if (role === 'price') next.excelPriceHeader = header;
      return next;
    });
  };

  const getPdfRoleForColumn = (index: number): PdfColumnRole =>
    mapping.pdfColumnRoles[String(index)] || '';

  const getPdfIndexForRole = (role: PdfColumnRole) => {
    const entry = Object.entries(mapping.pdfColumnRoles).find(([, value]) => value === role);
    return entry ? Number(entry[0]) : null;
  };

  const handlePdfColumnRoleChange = (index: number, role: PdfColumnRole) => {
    setMapping((prev) => {
      const nextRoles: Record<string, PdfColumnRole> = { ...prev.pdfColumnRoles };
      const key = String(index);

      if (role === '') {
        delete nextRoles[key];
        return { ...prev, pdfColumnRoles: nextRoles };
      }

      Object.keys(nextRoles).forEach((existingKey) => {
        if (nextRoles[existingKey] === role) {
          delete nextRoles[existingKey];
        }
      });

      nextRoles[key] = role;
      return { ...prev, pdfColumnRoles: nextRoles };
    });
  };

  const resetPreview = () => {
    setPreview(null);
    setMapping(EMPTY_MAPPING);
    setShowAdvanced(false);
  };

  const buildOverrides = () => ({
    excelSheetName: mapping.excelSheetName || null,
    excelHeaderRow: parseOptionalInt(mapping.excelHeaderRow),
    excelCodeHeader: mapping.excelCodeHeader || null,
    excelNameHeader: mapping.excelNameHeader || null,
    excelPriceHeader: mapping.excelPriceHeader || null,
    pdfColumnRoles: Object.keys(mapping.pdfColumnRoles).length ? mapping.pdfColumnRoles : null,
    pdfCodePattern: showAdvanced ? (mapping.pdfCodePattern || null) : null,
  });

  const pdfPreviewRows = useMemo(() => {
    if (!preview?.pdf?.rows?.length) return [];
    const codeIndex = getPdfIndexForRole('code');
    const nameIndex = getPdfIndexForRole('name');
    const priceIndex = getPdfIndexForRole('price');

    return preview.pdf.rows.map((row) => ({
      code: codeIndex !== null ? row.cells[codeIndex] || '' : '',
      name: nameIndex !== null ? row.cells[nameIndex] || '' : '',
      price: priceIndex !== null ? row.cells[priceIndex] || '' : '',
    })).filter((row) => row.code || row.name || row.price);
  }, [preview, mapping.pdfColumnRoles]);

  const loadSuppliers = async () => {
    try {
      const result = await adminApi.getSupplierPriceListSuppliers();
      setSuppliers(result.suppliers || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tedarikciler yuklenemedi');
    }
  };

  const loadUploads = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getSupplierPriceListUploads({ page: 1, limit: 20 });
      setUploads(result.uploads || []);
      if (!activeUploadId && result.uploads?.length) {
        setActiveUploadId(result.uploads[0].id);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Gecmis yuklemeler alinmadi');
    } finally {
      setLoading(false);
    }
  };

  const loadUploadDetail = async (uploadId: string) => {
    try {
      const result = await adminApi.getSupplierPriceListUpload(uploadId);
      setActiveUpload(result.upload);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Rapor detayi alinmadi');
    }
  };

  const loadItems = async (uploadId: string, status: StatusKey, page = 1) => {
    setItemsLoading(true);
    try {
      const result = await adminApi.getSupplierPriceListItems({
        uploadId,
        status,
        page,
        limit: pagination.limit,
      });
      setItems(result.items || []);
      setPagination((prev) => ({
        ...prev,
        page: result.pagination?.page ?? page,
        totalPages: result.pagination?.totalPages ?? 1,
        total: result.pagination?.total ?? 0,
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Liste alinmadi');
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadUploads();
  }, []);

  useEffect(() => {
    if (!activeUploadId) return;
    loadUploadDetail(activeUploadId);
    loadItems(activeUploadId, activeStatus, 1);
  }, [activeUploadId, activeStatus]);

  const handleSupplierChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSupplierId(event.target.value);
    resetPreview();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    resetPreview();
  };

  const handlePreview = async () => {
    if (!selectedSupplierId) {
      toast.error('Tedarikci secin');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Dosya secin');
      return;
    }

    try {
      setPreviewLoading(true);
      const result = await adminApi.previewSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      setPreview(result);
      const detectedPdfRoles: Record<string, PdfColumnRole> = {};
      if (result.pdf?.detected?.codeIndex !== null && result.pdf?.detected?.codeIndex !== undefined) {
        detectedPdfRoles[String(result.pdf.detected.codeIndex)] = 'code';
      }
      if (result.pdf?.detected?.nameIndex !== null && result.pdf?.detected?.nameIndex !== undefined) {
        detectedPdfRoles[String(result.pdf.detected.nameIndex)] = 'name';
      }
      if (result.pdf?.detected?.priceIndex !== null && result.pdf?.detected?.priceIndex !== undefined) {
        detectedPdfRoles[String(result.pdf.detected.priceIndex)] = 'price';
      }
      setMapping((prev) => ({
        excelSheetName: result.excel ? result.excel.sheetName || '' : prev.excelSheetName,
        excelHeaderRow: result.excel ? (result.excel.headerRow ? String(result.excel.headerRow) : '') : prev.excelHeaderRow,
        excelCodeHeader: result.excel ? result.excel.detected?.code || '' : prev.excelCodeHeader,
        excelNameHeader: result.excel ? result.excel.detected?.name || '' : prev.excelNameHeader,
        excelPriceHeader: result.excel ? result.excel.detected?.price || '' : prev.excelPriceHeader,
        pdfCodePattern: result.pdf ? result.pdf.codePattern || '' : prev.pdfCodePattern,
        pdfColumnRoles: result.pdf ? detectedPdfRoles : prev.pdfColumnRoles,
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Onizleme basarisiz');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedSupplierId) {
      toast.error('Tedarikci secin');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Dosya secin');
      return;
    }
    if (!preview) {
      toast.error('Once onizleme alin');
      return;
    }

    try {
      setUploading(true);
      const result = await adminApi.uploadSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      toast.success('Dosyalar yuklendi');
      setSelectedFiles([]);
      resetPreview();
      await loadUploads();
      if (result.uploadId) {
        setActiveUploadId(result.uploadId);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Yukleme basarisiz');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!activeUploadId) return;
    try {
      const blob = await adminApi.downloadSupplierPriceListExport(activeUploadId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `supplier-price-list-${activeUploadId}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Excel indirilemedi');
    }
  };

  const columnCount =
    activeStatus === 'matched'
      ? 10
      : activeStatus === 'multiple' || activeStatus === 'suspicious'
        ? 5
        : 4;
  const canPreview = Boolean(selectedSupplierId) && selectedFiles.length > 0 && !previewLoading && !uploading;
  const uploadDisabled = !preview || uploading || previewLoading;

  const pageSummary = useMemo(() => {
    if (!activeUpload) return null;
    return [
      { label: 'Toplam', value: activeUpload.totalItems },
      { label: 'Eslesen', value: activeUpload.matchedItems },
      { label: 'Esmeyen', value: activeUpload.unmatchedItems },
      { label: 'Coklu', value: activeUpload.multiMatchItems },
    ];
  }, [activeUpload]);

  return {
    // state
    suppliers,
    uploads,
    selectedSupplierId,
    selectedFiles,
    preview,
    previewLoading,
    showAdvanced,
    setShowAdvanced,
    mapping,
    setMapping,
    activeUploadId,
    setActiveUploadId,
    activeUpload,
    activeStatus,
    setActiveStatus,
    items,
    pagination,
    loading,
    uploading,
    itemsLoading,
    // derived
    excelHeaders,
    pdfColumns,
    pdfPreviewRows,
    columnCount,
    canPreview,
    uploadDisabled,
    pageSummary,
    // helpers
    parsePreviewNumber,
    getExcelRoleForHeader,
    handleExcelRoleChange,
    getPdfRoleForColumn,
    handlePdfColumnRoleChange,
    // loaders / handlers
    loadUploads,
    loadItems,
    handleSupplierChange,
    handleFileChange,
    handlePreview,
    handleUpload,
    handleDownload,
  };
}

export default useTedarikciFiyatKarsilastirma;
