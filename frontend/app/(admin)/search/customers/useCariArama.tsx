'use client';

import { useState, useEffect } from 'react';
import adminApi from '@/lib/api/admin';

/**
 * Cari Arama (F10) ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useCariArama() {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Kolon yönetimi
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Sayfalama
  const [limit] = useState(100);

  // Detay modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Kullanıcı tercihlerini yükle
  useEffect(() => {
    loadPreferences();
    loadAvailableColumns();
  }, []);

  const loadPreferences = async () => {
    try {
      const { preferences } = await adminApi.getSearchPreferences();
      if (preferences.customerColumns && preferences.customerColumns.length > 0) {
        setSelectedColumns(preferences.customerColumns);
      } else {
        // Varsayılan kolonlar
        setSelectedColumns(['msg_S_1032', 'msg_S_1033', 'IL', 'ILCE', 'Telefon', 'SEKTOR KODU', 'msg_S_1530']);
      }
    } catch (err) {
      console.error('Tercihler yüklenemedi:', err);
      // Varsayılan kolonlar
      setSelectedColumns(['msg_S_1032', 'msg_S_1033', 'IL', 'ILCE', 'Telefon', 'SEKTOR KODU', 'msg_S_1530']);
    }
  };

  const loadAvailableColumns = async () => {
    try {
      const { columns } = await adminApi.getCustomerColumns();
      setAvailableColumns(columns);
    } catch (err) {
      console.error('Kolonlar yüklenemedi:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      setError('Lütfen arama terimi girin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await adminApi.searchCustomers({
        searchTerm: searchTerm.trim(),
        limit
      });
      setCustomers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Arama yapılırken bir hata oluştu');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const saveColumnPreferences = async () => {
    setSavingPreferences(true);
    try {
      await adminApi.updateSearchPreferences({ customerColumns: selectedColumns });
      setShowColumnSelector(false);
    } catch (err) {
      console.error('Tercihler kaydedilemedi:', err);
      alert('Tercihler kaydedilirken bir hata oluştu');
    } finally {
      setSavingPreferences(false);
    }
  };

  const getColumnDisplayName = (column: string) => {
    // msg_ ile başlayanları ve diğer kodları Türkçe'ye çevir
    const nameMap: { [key: string]: string } = {
      'msg_S_0088': 'GUID',
      'msg_S_1033': 'Cari Ünvanı',
      'msg_S_1034': 'Cari Ünvanı 2',
      'msg_S_1032': 'Cari Kodu',
      'msg_S_1530': 'Bakiye',
      'msg_S_3171': 'Bağlantı Tipi',
      'msg_S_0888': 'Hareket Tipi',
    };
    return nameMap[column] || column;
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    }
    if (value instanceof Date) {
      return value.toLocaleDateString('tr-TR');
    }
    return String(value);
  };

  const handleRowClick = (customer: any) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCustomer(null);
  };

  return {
    // state
    searchTerm,
    setSearchTerm,
    customers,
    loading,
    error,
    availableColumns,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    savingPreferences,
    selectedCustomer,
    showDetailModal,
    // handlers / turetilmis
    handleSearch,
    handleColumnToggle,
    saveColumnPreferences,
    getColumnDisplayName,
    formatValue,
    handleRowClick,
    closeDetailModal,
  };
}

export default useCariArama;
