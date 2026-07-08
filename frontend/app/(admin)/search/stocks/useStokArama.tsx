'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { getUnitConversionLabel } from '@/lib/utils/unit';

/**
 * Stok Arama (F10) ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useStokArama() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Kolon yönetimi
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Sayfalama
  const [limit] = useState(100);
  const [showAll, setShowAll] = useState(false);

  // Detay modal
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Kullanıcı tercihlerini yükle
  useEffect(() => {
    loadPreferences();
    loadAvailableColumns();
  }, []);

  const loadPreferences = async () => {
    try {
      const { preferences } = await adminApi.getSearchPreferences();
      if (preferences.stockColumns && preferences.stockColumns.length > 0) {
        setSelectedColumns(preferences.stockColumns);
      } else {
        // Varsayılan kolonlar
        setSelectedColumns(['msg_S_0078', 'msg_S_0870', 'KDV Oranı', 'Güncel Maliyet Kdv Dahil', 'Merkez Depo', 'Toplam Satılabilir', 'Koli Ici']);
      }
    } catch (err) {
      console.error('Tercihler yüklenemedi:', err);
      // Varsayılan kolonlar
      setSelectedColumns(['msg_S_0078', 'msg_S_0870', 'KDV Oranı', 'Güncel Maliyet Kdv Dahil', 'Merkez Depo', 'Toplam Satılabilir', 'Koli Ici']);
    }
  };

  const loadAvailableColumns = async () => {
    try {
      const { columns } = await adminApi.getStockColumns();
      const nextColumns = columns.includes('Koli Ici') ? columns : [...columns, 'Koli Ici'];
      setAvailableColumns(nextColumns);
    } catch (err) {
      console.error('Kolonlar yüklenemedi:', err);
    }
  };

  const handleSearch = async () => {
    if (!showAll && (!searchTerm || searchTerm.trim().length === 0)) {
      setError('Lütfen arama terimi girin veya "Tüm Stokları Göster" seçeneğini kullanın');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = showAll ? { limit: 1000 } : { searchTerm: searchTerm.trim(), limit };
      const response = await adminApi.searchStocks(params);
      setStocks(response.data);
      if (response.warning) {
        toast.error(response.warning.message || 'Canli Mikro stok aramasi alinamadi; son bilinen veri gosteriliyor.', {
          duration: 8000,
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Arama yapılırken bir hata oluştu');
      setStocks([]);
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
      await adminApi.updateSearchPreferences({ stockColumns: selectedColumns });
      setShowColumnSelector(false);
    } catch (err) {
      console.error('Tercihler kaydedilemedi:', err);
      alert('Tercihler kaydedilirken bir hata oluştu');
    } finally {
      setSavingPreferences(false);
    }
  };

  const getColumnDisplayName = (column: string) => {
    // msg_ ile başlayanları Türkçe'ye çevir
    const nameMap: { [key: string]: string } = {
      'msg_S_0088': 'GUID',
      'msg_S_0870': 'Ürün Adı',
      'msg_S_0078': 'Stok Kodu',
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

  const getColumnValue = (column: string, row: any) => {
    if (column === 'Koli Ici') {
      const label = getUnitConversionLabel(row['Birim'], row['2. Birim'], row['2. Birim Katsayısı']);
      return label || '-';
    }
    return formatValue(row[column]);
  };

  const handleRowClick = (stock: any) => {
    setSelectedStock(stock);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedStock(null);
  };

  return {
    // state
    searchTerm,
    setSearchTerm,
    stocks,
    loading,
    error,
    availableColumns,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    savingPreferences,
    showAll,
    setShowAll,
    selectedStock,
    showDetailModal,
    // handlers / turetilmis
    handleSearch,
    handleColumnToggle,
    saveColumnPreferences,
    getColumnDisplayName,
    formatValue,
    getColumnValue,
    handleRowClick,
    closeDetailModal,
  };
}

export default useStokArama;
