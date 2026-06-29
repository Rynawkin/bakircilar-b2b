'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

export type ExcludedRow = {
  productCode: string;
  productName: string;
  stoModelKodu: string;
  distinctCustomersLast1Month: number;
  distinctCustomersLast2Months: number;
  distinctCustomersLast3Months: number;
  hasMultiCustomerSalesLast2Months: boolean;
};

/**
 * MinMax Hesaplanmayacaklar raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki UcarerMinMaxExclusionsPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 *
 * Mikro/DB yazan akis: `setUcarerMinMaxExclusion({ exclude: false })` -> urunu tekrar
 * MinMax hesaplamasina alir. Bu handler'in mantigi TEK SATIR DEGISMEMISTIR.
 */
export function useMinMaxHaric() {
  const [rows, setRows] = useState<ExcludedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingByCode, setUpdatingByCode] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getUcarerMinMaxExcludedProductsReport();
      setRows(response.data?.rows || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Rapor alinamadi');
    } finally {
      setLoading(false);
    }
  };

  const includeBackToMinMax = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setUpdatingByCode((prev) => ({ ...prev, [code]: true }));
    try {
      await adminApi.setUcarerMinMaxExclusion({ productCode: code, exclude: false });
      toast.success('Urun tekrar MinMax hesaplamasina alindi.');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Islem basarisiz');
    } finally {
      setUpdatingByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  useEffect(() => {
    load();
  }, []);

  return {
    // state
    rows,
    loading,
    updatingByCode,
    // handlers
    load,
    includeBackToMinMax,
  };
}

export default useMinMaxHaric;
