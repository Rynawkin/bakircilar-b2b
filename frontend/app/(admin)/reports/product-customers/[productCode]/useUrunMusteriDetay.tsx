'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/api/admin';

export interface Customer {
  customerCode: string;
  customerName: string;
  sectorCode: string;
  orderCount: number;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  lastOrderDate: string;
}

export interface Summary {
  totalCustomers: number;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
  avgProfitMargin: number;
}

/**
 * Urun Musteri Detayi raporunun TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useUrunMusteriDetay() {
  const params = useParams();
  const productCode = params.productCode as string;

  const [data, setData] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getProductCustomers({
        productCode,
        limit: 100,
      });

      if (result.success) {
        setData(result.data.customers);
        setSummary(result.data.summary);
      } else {
        throw new Error('Bir hata oluştu');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [productCode]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  return {
    productCode,
    data,
    summary,
    loading,
    error,
    fetchData,
    formatCurrency,
    formatDate,
  };
}

export default useUrunMusteriDetay;
