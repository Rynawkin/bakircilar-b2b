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

export interface PreviewExcelColumn {
  index: number;
  header: string;
  label: string;
  samples: string[];
}

export interface PreviewExcel {
  sheetNames: string[];
  sheetName: string;
  headerRow: number | null;
  headers: string[];
  headerLabels?: string[];
  columns?: PreviewExcelColumn[];
  rawRows?: string[][];
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

// === Toplu maliyet uygulama (apply-preview / apply) tipleri ===
export interface ApplyPriceListRow {
  listNo: number;
  oldPrice: number | null;
  newPrice: number;
  increasePct: number | null;
}

export interface ApplyPreviewProduct {
  productCode: string;
  name: string;
  currentCostT: number | null;
  newCostT: number;
  costIncreasePct: number | null;
  newCostP: number;
  vatRate: number;
  priceLists: ApplyPriceListRow[];
  outlier: boolean;
  outlierReason: string | null;
}

export interface ApplyPreviewSummary {
  count: number;
  avgCostIncreasePct: number | null;
  outlierCount: number;
}

export interface ApplyPreviewData {
  products: ApplyPreviewProduct[];
  summary: ApplyPreviewSummary;
}

export interface ApplyItem {
  productCode: string;
  newCostT: number;
}

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

  // === Toplu maliyet uygulama (apply) durumu ===
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [applyPreview, setApplyPreview] = useState<ApplyPreviewData | null>(null);
  const [applyItems, setApplyItems] = useState<ApplyItem[]>([]);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);

  // Index korunarak TUM kolonlar (bos basliklar dahil). Backend "columns" verir;
  // gelmezse headers/headerLabels'tan tureriz (eski yanit uyumlulugu).
  const excelColumns = useMemo<PreviewExcelColumn[]>(() => {
    const excel = preview?.excel;
    if (!excel) return [];
    if (excel.columns?.length) return excel.columns;
    const headers = excel.headers || [];
    return headers.map((header, index) => ({
      index,
      header: header || '',
      label: (excel.headerLabels && excel.headerLabels[index]) || (header ? header : `(bos kolon ${index + 1})`),
      samples: [],
    }));
  }, [preview]);

  // Geriye donuk uyum: bazi yerler hala excelHeaders bekleyebilir.
  const excelHeaders = useMemo(() => excelColumns.map((column) => column.label), [excelColumns]);

  // Ham satirlar (baslik satiri secimi dropdown'u icin)
  const excelRawRows = useMemo(() => preview?.excel?.rawRows || [], [preview]);

  const pdfColumns = useMemo(() => preview?.pdf?.columns || [], [preview]);

  const parsePreviewNumber = (value: string) => {
    if (!value) return null;
    let normalized = value.replace(/\s+/g, '');
    normalized = normalized.replace(/[^0-9,\.-]/g, '');
    // Rakam icermeyen hucre -> null (backend parseNumber ile ayni davranis)
    if (!/\d/.test(normalized)) return null;
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

  // Tam-manuel kolon secimi: roller kolon INDEX'i ("#col:N") ile saklanir.
  const columnToken = (index: number) => `#col:${index}`;

  // Bir kolon index'inin (token'inin) hangi role atandigini dondurur.
  const getExcelRoleForColumn = (index: number): ExcelColumnRole => {
    const token = columnToken(index);
    if (mapping.excelCodeHeader === token) return 'code';
    if (mapping.excelNameHeader === token) return 'name';
    if (mapping.excelPriceHeader === token) return 'price';
    return '';
  };

  const handleExcelColumnRoleChange = (index: number, role: ExcelColumnRole) => {
    const token = columnToken(index);
    setMapping((prev) => {
      const next = { ...prev };
      // Ayni kolon baska bir role atanmissa cikar (bir kolon tek role)
      if (next.excelCodeHeader === token) next.excelCodeHeader = '';
      if (next.excelNameHeader === token) next.excelNameHeader = '';
      if (next.excelPriceHeader === token) next.excelPriceHeader = '';
      if (role === 'code') next.excelCodeHeader = token;
      if (role === 'name') next.excelNameHeader = token;
      if (role === 'price') next.excelPriceHeader = token;
      return next;
    });
  };

  // Belirli bir role atanmis kolon index'ini dondurur (-1 yoksa)
  const getExcelColumnIndexForRole = (role: 'code' | 'name' | 'price'): number => {
    const token =
      role === 'code' ? mapping.excelCodeHeader : role === 'name' ? mapping.excelNameHeader : mapping.excelPriceHeader;
    if (!token) return -1;
    const match = String(token).match(/^#col:(\d+)$/);
    return match ? Number(match[1]) : -1;
  };

  // Tek dropdown'dan rol -> kolon secimi (Urun Kodu / Urun Adi / Maliyet dropdownlari)
  const handleExcelRoleSelect = (role: 'code' | 'name' | 'price', index: number | null) => {
    setMapping((prev) => {
      const next = { ...prev };
      const token = index !== null && index >= 0 ? columnToken(index) : '';
      // Bu kolon zaten baska role atanmissa onu temizle (ayni kolon iki role atanmasin)
      if (token) {
        if (role !== 'code' && next.excelCodeHeader === token) next.excelCodeHeader = '';
        if (role !== 'name' && next.excelNameHeader === token) next.excelNameHeader = '';
        if (role !== 'price' && next.excelPriceHeader === token) next.excelPriceHeader = '';
      }
      if (role === 'code') next.excelCodeHeader = token;
      if (role === 'name') next.excelNameHeader = token;
      if (role === 'price') next.excelPriceHeader = token;
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

  const buildOverrides = (source: MappingState = mapping) => ({
    excelSheetName: source.excelSheetName || null,
    excelHeaderRow: parseOptionalInt(source.excelHeaderRow),
    excelCodeHeader: source.excelCodeHeader || null,
    excelNameHeader: source.excelNameHeader || null,
    excelPriceHeader: source.excelPriceHeader || null,
    pdfColumnRoles: Object.keys(source.pdfColumnRoles).length ? source.pdfColumnRoles : null,
    pdfCodePattern: showAdvanced ? (source.pdfCodePattern || null) : null,
  });

  // Excel rol secimi/baslik-satiri degisince eslesen onizleme ANINDA guncellensin diye
  // rawRows + secili kolonlardan canli ornek satirlari uretilir (yeniden preview cagirmadan).
  const excelMatchPreview = useMemo(() => {
    if (!preview?.excel) return [];
    const rawRows = preview.excel.rawRows || [];
    const headerRow = parseOptionalInt(mapping.excelHeaderRow) ?? preview.excel.headerRow;
    if (!headerRow || !rawRows.length) return preview.excel.samples || [];

    const codeIndex = getExcelColumnIndexForRole('code');
    const nameIndex = getExcelColumnIndexForRole('name');
    const priceIndex = getExcelColumnIndexForRole('price');

    const dataRows = rawRows.slice(headerRow); // headerRow 1-tabanli; sonrasi veri
    const out: Array<{ code?: string | null; name?: string | null; price?: number | null }> = [];
    for (const row of dataRows) {
      const code = codeIndex >= 0 ? row[codeIndex] ?? '' : '';
      const name = nameIndex >= 0 ? row[nameIndex] ?? '' : '';
      const priceRaw = priceIndex >= 0 ? row[priceIndex] ?? '' : '';
      if (!code && !name && !priceRaw) continue;
      out.push({
        code: code || null,
        name: name || null,
        price: priceRaw ? parsePreviewNumber(priceRaw) : null,
      });
      if (out.length >= 8) break;
    }
    return out;
  }, [preview, mapping.excelCodeHeader, mapping.excelNameHeader, mapping.excelPriceHeader, mapping.excelHeaderRow]);

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

  const handlePreview = async (opts?: { overrideMapping?: MappingState; preserveRoles?: boolean }) => {
    if (!selectedSupplierId) {
      toast.error('Tedarikci secin');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Dosya secin');
      return;
    }

    const sourceMapping = opts?.overrideMapping ?? mapping;
    const preserveRoles = opts?.preserveRoles ?? false;

    try {
      setPreviewLoading(true);
      const result = await adminApi.previewSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(sourceMapping),
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
      setMapping((prev) => {
        const base = opts?.overrideMapping ?? prev;
        return {
          excelSheetName: result.excel ? result.excel.sheetName || '' : base.excelSheetName,
          excelHeaderRow: result.excel ? (result.excel.headerRow ? String(result.excel.headerRow) : '') : base.excelHeaderRow,
          // preserveRoles: kullanicinin sectigi kolon rollerini koru; aksi halde
          // backend'in detected (#col:N) onerisini kullan.
          excelCodeHeader: result.excel
            ? (preserveRoles ? base.excelCodeHeader : result.excel.detected?.code || '')
            : base.excelCodeHeader,
          excelNameHeader: result.excel
            ? (preserveRoles ? base.excelNameHeader : result.excel.detected?.name || '')
            : base.excelNameHeader,
          excelPriceHeader: result.excel
            ? (preserveRoles ? base.excelPriceHeader : result.excel.detected?.price || '')
            : base.excelPriceHeader,
          pdfCodePattern: result.pdf ? result.pdf.codePattern || '' : base.pdfCodePattern,
          pdfColumnRoles: result.pdf ? detectedPdfRoles : base.pdfColumnRoles,
        };
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Onizleme basarisiz');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Baslik satiri degisince: yeni satiri override edip otomatik yeniden onizleme al.
  // Yeni satira gore kolonlar/basliklar degisecegi icin backend yeniden algilar.
  const handleExcelHeaderRowChange = (headerRow: number) => {
    const nextMapping: MappingState = {
      ...mapping,
      excelHeaderRow: String(headerRow),
      // Yeni baslik satirinda eski kolon index'leri anlamsiz olabilir -> sifirla
      excelCodeHeader: '',
      excelNameHeader: '',
      excelPriceHeader: '',
    };
    setMapping(nextMapping);
    void handlePreview({ overrideMapping: nextMapping, preserveRoles: false });
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

  // Eslesen (matched) TUM urunleri (tum sayfalar) cekip { productCode, newCostT } listesi cikar.
  // newCostT = parse edilmis NET maliyet (matched satirdaki newCost / netPrice).
  const collectMatchedApplyItems = async (uploadId: string): Promise<ApplyItem[]> => {
    const fetchLimit = 200;
    const collected: ApplyItem[] = [];
    const seen = new Set<string>();
    let page = 1;
    let totalPages = 1;
    do {
      const result = await adminApi.getSupplierPriceListItems({
        uploadId,
        status: 'matched',
        page,
        limit: fetchLimit,
      });
      totalPages = result.pagination?.totalPages ?? 1;
      for (const row of result.items || []) {
        const productCode = row?.productCode;
        const newCostT = typeof row?.newCost === 'number' ? row.newCost : null;
        if (!productCode || newCostT === null || !Number.isFinite(newCostT)) continue;
        // Ayni productCode birden fazla satirda olabilir (coklu tedarikci kodu) -> tekillesir
        if (seen.has(productCode)) continue;
        seen.add(productCode);
        collected.push({ productCode, newCostT });
      }
      page += 1;
    } while (page <= totalPages);
    return collected;
  };

  // Buton: "Maliyetleri Mikro'ya Uygula (toplu)" -> onizleme al + modal ac (Mikro YAZMA YOK)
  const handleApplyPreviewOpen = async () => {
    if (!activeUploadId) {
      toast.error('Once bir rapor secin');
      return;
    }
    setApplyConfirmed(false);
    setApplyPreview(null);
    setApplyPreviewLoading(true);
    setApplyModalOpen(true);
    try {
      const items = await collectMatchedApplyItems(activeUploadId);
      if (!items.length) {
        toast.error('Uygulanacak eslesen urun bulunamadi');
        setApplyModalOpen(false);
        return;
      }
      setApplyItems(items);
      const result = await adminApi.applySupplierCostPreview(items);
      setApplyPreview(result);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Onizleme alinamadi');
      setApplyModalOpen(false);
    } finally {
      setApplyPreviewLoading(false);
    }
  };

  const closeApplyModal = () => {
    if (applying) return;
    setApplyModalOpen(false);
    setApplyPreview(null);
    setApplyItems([]);
    setApplyConfirmed(false);
  };

  // SON ONAY: Mikro'ya TOPLU YAZMA (her item icin updateUcarerProductCost backend'de cagrilir)
  const handleApplyConfirm = async () => {
    if (!applyConfirmed || applying) return;
    if (!applyItems.length) {
      toast.error('Uygulanacak urun yok');
      return;
    }
    setApplying(true);
    try {
      const result = await adminApi.applySupplierCostBulk(applyItems);
      const okCount = result.okCount ?? 0;
      const failCount = result.failCount ?? 0;
      if (failCount > 0) {
        toast.error(`${okCount} urun uygulandi, ${failCount} urun hata verdi`);
      } else {
        toast.success(`${okCount} urun maliyeti Mikro'ya uygulandi`);
      }
      setApplyModalOpen(false);
      setApplyPreview(null);
      setApplyItems([]);
      setApplyConfirmed(false);
      // Listeyi yenile (guncel maliyetler/farklar degisti)
      if (activeUploadId) {
        await loadItems(activeUploadId, activeStatus, pagination.page);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Maliyet uygulama basarisiz');
    } finally {
      setApplying(false);
    }
  };

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
    // toplu maliyet uygulama
    applyModalOpen,
    applyPreviewLoading,
    applyPreview,
    applyItems,
    applyConfirmed,
    setApplyConfirmed,
    applying,
    handleApplyPreviewOpen,
    handleApplyConfirm,
    closeApplyModal,
    // derived
    excelHeaders,
    excelColumns,
    excelRawRows,
    excelMatchPreview,
    pdfColumns,
    pdfPreviewRows,
    columnCount,
    canPreview,
    uploadDisabled,
    pageSummary,
    // helpers
    parsePreviewNumber,
    getExcelRoleForColumn,
    handleExcelColumnRoleChange,
    getExcelColumnIndexForRole,
    handleExcelRoleSelect,
    handleExcelHeaderRowChange,
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
