'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import toast from 'react-hot-toast';

/**
 * Tamamlayici Urun Eksikleri raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki ComplementMissingReportPage component'inin `return (` oncesindeki
 *  her state/effect/handler/turetilmis deger aynen tasinmistir.)
 */

export interface ComplementMissingItem {
  productCode: string;
  productName: string;
  estimatedQuantity?: number | null;
  unitPrice?: number | null;
  estimatedRevenue?: number | null;
}

export interface ComplementMissingRow {
  customerCode?: string;
  customerName?: string;
  productCode?: string;
  productName?: string;
  documentCount?: number;
  missingComplements: ComplementMissingItem[];
  missingCount: number;
}

export interface ComplementMissingMetadata {
  mode: 'product' | 'customer';
  matchMode: 'product' | 'category' | 'group';
  periodMonths: number;
  startDate: string;
  endDate: string;
  baseProduct?: {
    productCode: string;
    productName: string;
  };
  customer?: {
    customerCode: string;
    customerName: string | null;
  };
  sectorCode?: string | null;
  salesRep?: {
    id: string;
    name: string | null;
    email: string | null;
    assignedSectorCodes: string[];
  };
  minDocumentCount?: number | null;
}

export interface ComplementMissingSummary {
  totalRows: number;
  totalMissing: number;
}

export interface ComplementMissingParams {
  mode: 'product' | 'customer';
  matchMode: 'product' | 'category' | 'group';
  productCode?: string;
  customerCode?: string;
  periodMonths: number;
  sectorCode?: string;
  salesRepId?: string;
  minDocumentCount?: number;
}

export type RowActionType = 'note' | 'campaign';

export function useTamamlayiciEksik() {
  const [mode, setMode] = useState<'product' | 'customer'>('product');
  const [matchMode, setMatchMode] = useState<'product' | 'category' | 'group'>('product');
  const [productSearch, setProductSearch] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);
  const [sectorCode, setSectorCode] = useState('');
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);
  const [salesRepId, setSalesRepId] = useState('');
  const [salesRepOptions, setSalesRepOptions] = useState<Array<{
    id: string;
    name: string;
    email: string;
    assignedSectorCodes: string[];
  }>>([]);
  const [minDocumentEnabled, setMinDocumentEnabled] = useState(false);
  const [minDocumentCount, setMinDocumentCount] = useState('3');
  const [submitted, setSubmitted] = useState<ComplementMissingParams | null>(null);
  const [rows, setRows] = useState<ComplementMissingRow[]>([]);
  const [summary, setSummary] = useState<ComplementMissingSummary | null>(null);
  const [metadata, setMetadata] = useState<ComplementMissingMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [actionRow, setActionRow] = useState<ComplementMissingRow | null>(null);
  const [actionType, setActionType] = useState<RowActionType | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const parseProductOption = (item: any) => {
    const code = String(item?.['msg_S_0078'] ?? item?.productCode ?? '').trim();
    const name = String(item?.['msg_S_0870'] ?? item?.productName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectProduct = (item: any) => {
    const parsed = parseProductOption(item);
    if (!parsed.code) return;
    setProductCode(parsed.code);
    setProductName(parsed.name);
    setProductSearch(parsed.label || parsed.code);
    setProductOptions([]);
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  useEffect(() => {
    if (mode === 'product') {
      setCustomerSearch('');
      setCustomerCode('');
      setCustomerName('');
      setCustomerOptions([]);
      setCustomerSearching(false);
      return;
    }
    setProductSearch('');
    setProductCode('');
    setProductName('');
    setProductOptions([]);
    setProductSearching(false);
  }, [mode]);

  useEffect(() => {
    let active = true;

    const loadFilters = async () => {
      const results = await Promise.allSettled([
        adminApi.getSectorCodes(),
        adminApi.getStaffMembers(),
      ]);

      if (!active) return;

      const sectorResult = results[0];
      if (sectorResult.status === 'fulfilled') {
        setSectorOptions(sectorResult.value.sectorCodes || []);
      }

      const staffResult = results[1];
      if (staffResult.status === 'fulfilled') {
        const reps = (staffResult.value.staff || [])
          .filter((member) => member.role === 'SALES_REP' && member.active)
          .map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            assignedSectorCodes: member.assignedSectorCodes || [],
          }));
        setSalesRepOptions(reps);
      }
    };

    loadFilters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'product') return;
    const term = productSearch.trim();
    if (term.length < 2) {
      setProductOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setProductSearching(true);
      try {
        const result = await adminApi.searchStocks({ searchTerm: term, limit: 12, offset: 0 });
        setProductOptions(result.data || []);
        if (result.warning) {
          toast.error(result.warning.message || 'Canli Mikro urun aramasi alinamadi; son bilinen veri gosteriliyor.', {
            duration: 8000,
          });
        }
      } catch (_err) {
        setProductOptions([]);
      } finally {
        setProductSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [productSearch, mode]);

  useEffect(() => {
    if (mode !== 'customer') return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const result = await adminApi.searchCustomers({ searchTerm: term, limit: 12, offset: 0 });
        setCustomerOptions(result.data || []);
      } catch (_err) {
        setCustomerOptions([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [customerSearch, mode]);

  const handleRunReport = () => {
    const productValue = productCode.trim() || productSearch.trim();
    const customerValue = customerCode.trim() || customerSearch.trim();
    let minDocumentValue: number | undefined;

    if (minDocumentEnabled) {
      const parsed = Number(minDocumentCount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error('Minimum evrak sayisi girin');
        return;
      }
      minDocumentValue = Math.floor(parsed);
    }

    setPage(1);
    setSubmitted({
      mode,
      matchMode,
      periodMonths,
      productCode: productValue || undefined,
      customerCode: customerValue || undefined,
      sectorCode: sectorCode.trim() || undefined,
      salesRepId: salesRepId.trim() || undefined,
      minDocumentCount: minDocumentValue,
    });
  };

  const fetchReport = async (params: ComplementMissingParams, currentPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getComplementMissingReport({
        mode: params.mode,
        matchMode: params.matchMode,
        productCode: params.productCode,
        customerCode: params.customerCode,
        sectorCode: params.sectorCode,
        salesRepId: params.salesRepId,
        periodMonths: params.periodMonths,
        page: currentPage,
        limit: 50,
        minDocumentCount: params.minDocumentCount,
      });

      if (result.success) {
        setRows(result.data.rows || []);
        setSummary(result.data.summary || null);
        setMetadata(result.data.metadata || null);
        setTotalPages(result.data.pagination?.totalPages || 1);
      } else {
        throw new Error('Rapor yuklenemedi');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted, page);
  }, [submitted, page]);

  const tableMode = metadata?.mode ?? mode;
  const matchModeValue = metadata?.matchMode ?? matchMode;
  const matchModeLabel = matchModeValue === 'category' ? 'Kategori' : matchModeValue === 'group' ? 'Grup' : 'Urun';
  const showProductMode = mode === 'product';
  const showProductTable = tableMode === 'product';
  const formatMoney = (value?: number | null) =>
    Number.isFinite(value) ? formatCurrency(value as number) : '-';
  const formatQuantity = (value?: number | null) =>
    Number.isFinite(value)
      ? (value as number).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '-';

  const handleExport = async () => {
    if (!submitted) {
      toast.error('Once raporu olusturun');
      return;
    }

    setExporting(true);
    try {
      const blob = await adminApi.downloadComplementMissingExport(submitted);
      const filenameBase = metadata?.baseProduct?.productCode
        || metadata?.customer?.customerCode
        || 'tamamlayici-urun-eksikleri';
      const dateRange = metadata?.startDate && metadata?.endDate
        ? `${metadata.startDate}-${metadata.endDate}`
        : 'rapor';
      const fileName = `tamamlayici-urun-eksikleri-${filenameBase}-${dateRange}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel indirildi');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  const openActionModal = (row: ComplementMissingRow, type: RowActionType) => {
    setActionRow(row);
    setActionType(type);
    setActionNote('');
  };

  const closeActionModal = () => {
    setActionRow(null);
    setActionType(null);
    setActionNote('');
  };

  const handleActionSubmit = async () => {
    if (!actionRow || !actionType) return;
    setActionSaving(true);

    const rowCustomerCode = showProductTable ? actionRow.customerCode : metadata?.customer?.customerCode;
    const rowCustomerName = showProductTable ? actionRow.customerName : metadata?.customer?.customerName;
    const rowProductCode = showProductTable ? metadata?.baseProduct?.productCode : actionRow.productCode;
    const rowProductName = showProductTable ? metadata?.baseProduct?.productName : actionRow.productName;
    const missingLabel = actionRow.missingComplements
      .map((item) => `${item.productCode} - ${item.productName}`)
      .join(', ');

    const descriptionParts = [
      rowCustomerCode ? `Cari: ${rowCustomerCode}${rowCustomerName ? ` - ${rowCustomerName}` : ''}` : null,
      rowProductCode ? `Urun: ${rowProductCode}${rowProductName ? ` - ${rowProductName}` : ''}` : null,
      actionRow.documentCount !== undefined ? `Evrak sayisi: ${actionRow.documentCount}` : null,
      missingLabel ? `Eksik tamamlayicilar (${actionRow.missingComplements.length}): ${missingLabel}` : null,
      actionNote.trim() ? `Not: ${actionNote.trim()}` : null,
    ].filter(Boolean);

    const links: Array<{
      type: string;
      label?: string;
      referenceCode?: string;
    }> = [];

    if (rowCustomerCode) {
      links.push({
        type: 'CUSTOMER',
        label: rowCustomerName || rowCustomerCode,
        referenceCode: rowCustomerCode,
      });
    }

    if (rowProductCode) {
      links.push({
        type: 'PRODUCT',
        label: rowProductName || rowProductCode,
        referenceCode: rowProductCode,
      });
    }

    actionRow.missingComplements.slice(0, 5).forEach((item) => {
      if (!item.productCode) return;
      links.push({
        type: 'PRODUCT',
        label: item.productName || item.productCode,
        referenceCode: item.productCode,
      });
    });

    try {
      await adminApi.createTask({
        title: actionType === 'campaign' ? 'Tamamlayici urun kampanya onerisi' : 'Tamamlayici urun notu',
        description: descriptionParts.join('\n'),
        type: actionType === 'campaign' ? 'FEATURE' : 'REPORT',
        links,
      });
      toast.success('Aksiyon olusturuldu');
      closeActionModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Aksiyon olusturulamadi');
    } finally {
      setActionSaving(false);
    }
  };

  const handleCreateQuote = (row: ComplementMissingRow) => {
    const customerCodeValue = showProductTable ? row.customerCode : metadata?.customer?.customerCode;
    const productCodes = row.missingComplements.map((item) => item.productCode).filter(Boolean);
    if (!customerCodeValue || productCodes.length === 0) {
      toast.error('Teklif icin cari ve urun secimi bulunamadi');
      return;
    }
    const params = new URLSearchParams();
    params.set('customerCode', customerCodeValue);
    params.set('productCodes', productCodes.join(','));
    const url = `/quotes/new?${params.toString()}`;
    window.open(url, '_blank', 'noopener');
  };

  return {
    // mode / match
    mode,
    setMode,
    matchMode,
    setMatchMode,
    // product search
    productSearch,
    setProductSearch,
    productCode,
    setProductCode,
    productName,
    setProductName,
    productOptions,
    productSearching,
    // customer search
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    // period / segment filters
    periodMonths,
    setPeriodMonths,
    sectorCode,
    setSectorCode,
    sectorOptions,
    salesRepId,
    setSalesRepId,
    salesRepOptions,
    minDocumentEnabled,
    setMinDocumentEnabled,
    minDocumentCount,
    setMinDocumentCount,
    // report state
    submitted,
    rows,
    summary,
    metadata,
    loading,
    error,
    page,
    setPage,
    totalPages,
    exporting,
    // action modal state
    actionRow,
    actionType,
    actionNote,
    setActionNote,
    actionSaving,
    // derived
    tableMode,
    matchModeValue,
    matchModeLabel,
    showProductMode,
    showProductTable,
    // helpers
    parseProductOption,
    parseCustomerOption,
    formatMoney,
    formatQuantity,
    // handlers
    handleSelectProduct,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
    handleExport,
    openActionModal,
    closeActionModal,
    handleActionSubmit,
    handleCreateQuote,
  };
}

export default useTamamlayiciEksik;
