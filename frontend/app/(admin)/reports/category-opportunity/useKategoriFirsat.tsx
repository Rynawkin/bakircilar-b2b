'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

export interface CategoryOption {
  categoryCode: string;
  categoryName: string | null;
}

export interface OpportunitySourceProduct {
  productCode: string;
  productName: string;
  pairCount: number;
  customerDocumentCount: number;
}

export interface OpportunityRecommendation {
  recommendedProductCode: string;
  recommendedProductName: string;
  weightedScore: number;
  associationDocumentCount: number;
  sourceProductCount: number;
  sourceProducts: OpportunitySourceProduct[];
}

export interface OpportunityRow {
  customerCode: string;
  customerName: string | null;
  customerSectorCode: string | null;
  totalOpportunityScore: number;
  recommendationCount: number;
  recommendations: OpportunityRecommendation[];
}

export interface OpportunitySummary {
  totalCustomers: number;
  totalRecommendations: number;
  scannedCustomers: number;
  excludedBecauseAlreadyBoughtCategory: number;
}

export interface OpportunityMetadata {
  category: {
    categoryCode: string;
    categoryName: string | null;
    productCount: number;
  };
  customerFilterCode: string | null;
  lookbackMonths: number;
  minPairCount: number;
  startDate: string;
  endDate: string;
}

export interface SubmittedParams {
  categoryCode: string;
  customerCode?: string;
  lookbackMonths: number;
  minPairCount: number;
  limit: number;
}

/**
 * Kategori Firsat Onerileri raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CategoryOpportunityReportPage component'inin `return (` oncesindeki
 * her sey aynen tasinmistir.)
 */
export function useKategoriFirsat() {
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySearching, setCategorySearching] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const [lookbackMonths, setLookbackMonths] = useState('6');
  const [minPairCount, setMinPairCount] = useState('2');
  const [limit, setLimit] = useState('50');

  const [submitted, setSubmitted] = useState<SubmittedParams | null>(null);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [metadata, setMetadata] = useState<OpportunityMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setCategorySearching(true);
      try {
        const result = await adminApi.getCategoryOptions({
          search: categorySearch.trim() || undefined,
          limit: 20,
        });
        setCategoryOptions(result?.data?.categories || []);
      } catch (_err) {
        setCategoryOptions([]);
      } finally {
        setCategorySearching(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [categorySearch]);

  useEffect(() => {
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
  }, [customerSearch]);

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  const handleSelectCategory = (item: CategoryOption) => {
    setCategoryCode(item.categoryCode);
    setCategoryName(item.categoryName || '');
    setCategorySearch(`${item.categoryCode} - ${item.categoryName || '-'}`);
    setCategoryOptions([]);
  };

  const fetchReport = async (params: SubmittedParams) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCategoryOpportunityReport(params);
      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }
      setRows(result.data.rows || []);
      setSummary(result.data.summary || null);
      setMetadata(result.data.metadata || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted);
  }, [submitted]);

  const runReport = () => {
    let normalizedCategory = categoryCode.trim().toUpperCase();
    if (!normalizedCategory && categorySearch.trim()) {
      const term = categorySearch.trim().toLowerCase();
      const matched = categoryOptions.find((item) => {
        const code = item.categoryCode.toLowerCase();
        const name = (item.categoryName || '').toLowerCase();
        return code === term || name === term;
      });
      if (matched) {
        normalizedCategory = matched.categoryCode.toUpperCase();
        setCategoryCode(matched.categoryCode);
        setCategoryName(matched.categoryName || '');
        setCategorySearch(`${matched.categoryCode} - ${matched.categoryName || '-'}`);
      }
    }

    let normalizedCustomer = customerCode.trim().toUpperCase();
    if (!normalizedCustomer && customerSearch.trim()) {
      const customerTerm = customerSearch.trim().toLowerCase();
      const matchedCustomer = customerOptions.find((item) => {
        const parsed = parseCustomerOption(item);
        return (
          parsed.code.toLowerCase() === customerTerm ||
          parsed.name.toLowerCase() === customerTerm ||
          parsed.label.toLowerCase() === customerTerm
        );
      });
      if (matchedCustomer) {
        normalizedCustomer = parseCustomerOption(matchedCustomer).code.toUpperCase();
      }
    }

    const months = Number(lookbackMonths);
    const minPair = Number(minPairCount);
    const safeLimit = Number(limit);

    if (!normalizedCategory) {
      toast.error('Kategori secin');
      return;
    }
    if (!Number.isFinite(months) || months <= 0) {
      toast.error('Ay bilgisi gecersiz');
      return;
    }
    if (!Number.isFinite(minPair) || minPair <= 0) {
      toast.error('Min ortak evrak gecersiz');
      return;
    }
    if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
      toast.error('Liste limiti gecersiz');
      return;
    }

    const params: SubmittedParams = {
      categoryCode: normalizedCategory,
      lookbackMonths: Math.floor(months),
      minPairCount: Math.floor(minPair),
      limit: Math.floor(safeLimit),
    };

    if (normalizedCustomer) {
      params.customerCode = normalizedCustomer;
    }

    setSubmitted(params);
  };

  return {
    // category filter state
    categorySearch,
    setCategorySearch,
    categoryCode,
    setCategoryCode,
    categoryName,
    setCategoryName,
    categoryOptions,
    categorySearching,
    // customer filter state
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerOptions,
    customerSearching,
    // numeric filter state
    lookbackMonths,
    setLookbackMonths,
    minPairCount,
    setMinPairCount,
    limit,
    setLimit,
    // report state
    submitted,
    rows,
    summary,
    metadata,
    loading,
    error,
    // handlers / helpers
    parseCustomerOption,
    handleSelectCustomer,
    handleSelectCategory,
    fetchReport,
    runReport,
  };
}

export default useKategoriFirsat;
