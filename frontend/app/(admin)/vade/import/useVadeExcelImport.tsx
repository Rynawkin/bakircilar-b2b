'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import {
  parseVadeExcelWorksheet,
  type VadeExcelImportRow,
  type VadeImportResult,
} from '@/lib/vadeExcelImport';

/**
 * Klasik ve yeni Vade Excel ekranlarinin dosya okuma ve snapshot import akisi.
 * Saf kolon/tarih/sayi parser'i frontend/lib/vadeExcelImport.ts icinde tutulur.
 */

export type ImportRow = VadeExcelImportRow;

export function useVadeExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<VadeImportResult | null>(null);

  const handleImport = async () => {
    if (!file) {
      toast.error('Dosya secin');
      return;
    }

    setLoading(true);
    setSummary(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Tarihleri Date nesnesine cevirmeden seri deger olarak tutuyoruz. Boylece
      // tarayici saat dilimi Excel gununu bir onceki UTC gunune kaydiramaz.
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Excel dosyasında sayfa bulunamadı');
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true,
      }) as unknown[][];
      const formattedRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][];
      const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
      const parsed = parseVadeExcelWorksheet(rawRows, {
        formattedRows,
        date1904,
      });

      const result = await adminApi.importVadeBalances(parsed.rows, {
        mode: 'SNAPSHOT',
        createMissingCustomers: true,
      });
      setSummary(result);
      toast.success(
        `${result.imported} cari aktarıldı, ${result.createdCustomers} yeni cari oluşturuldu`,
      );
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(getApiErrorMessage(error, 'Import hatası'));
    } finally {
      setLoading(false);
    }
  };

  return {
    // state
    file,
    setFile,
    loading,
    summary,
    // handlers
    handleImport,
  };
}

export default useVadeExcelImport;
