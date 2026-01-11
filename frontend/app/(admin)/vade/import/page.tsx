'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type ImportRow = {
  mikroCariCode: string;
  pastDueBalance?: number;
  pastDueDate?: string | null;
  notDueBalance?: number;
  notDueDate?: string | null;
  totalBalance?: number;
  valor?: number;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
};

const parseNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(str)) {
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDateValue = (value: any) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const parts = raw.split('.');
  if (parts.length === 3) {
    const [day, month, year] = parts.map((part) => Number(part));
    if (day && month && year) {
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toISOString().slice(0, 10);
    }
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const findColumnIndex = (headers: any[], name: string) => {
  const target = name.toLowerCase();
  return headers.findIndex((header) => String(header || '').toLowerCase().includes(target));
};

export default function VadeImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const handleImport = async () => {
    if (!file) {
      toast.error('Dosya secin');
      return;
    }

    setLoading(true);
    setSummary(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[];
      const headers = data[0] || [];

      const codeIndex = findColumnIndex(headers, 'cari hesap kodu');
      const pastDueBalanceIndex = findColumnIndex(headers, 'vadesi geçen bakiye');
      const pastDueDateIndex = findColumnIndex(headers, 'vadesi geçen bakiye vadesi');
      const notDueBalanceIndex = findColumnIndex(headers, 'vadesi geçmemiş bakiye');
      const notDueDateIndex = findColumnIndex(headers, 'vadesi geçmemiş bakiye vadesi');
      const totalBalanceIndex = findColumnIndex(headers, 'toplam bakiye');
      const valorIndex = findColumnIndex(headers, 'valör');
      const paymentTermIndex = findColumnIndex(headers, 'cari ödeme vadesi');
      const referenceDateIndex = findColumnIndex(headers, 'bakiyeye konu ilk evrak');

      if (codeIndex === -1) {
        throw new Error('Cari hesap kodu kolonu bulunamadi');
      }

      const rows: ImportRow[] = [];
      for (let i = 1; i < data.length; i += 1) {
        const row = data[i];
        const code = String(row[codeIndex] || '').trim();
        if (!code) continue;

        rows.push({
          mikroCariCode: code,
          pastDueBalance: pastDueBalanceIndex !== -1 ? parseNumber(row[pastDueBalanceIndex]) : 0,
          pastDueDate: pastDueDateIndex !== -1 ? parseDateValue(row[pastDueDateIndex]) : null,
          notDueBalance: notDueBalanceIndex !== -1 ? parseNumber(row[notDueBalanceIndex]) : 0,
          notDueDate: notDueDateIndex !== -1 ? parseDateValue(row[notDueDateIndex]) : null,
          totalBalance: totalBalanceIndex !== -1 ? parseNumber(row[totalBalanceIndex]) : undefined,
          valor: valorIndex !== -1 ? parseNumber(row[valorIndex]) : 0,
          paymentTermLabel: paymentTermIndex !== -1 ? String(row[paymentTermIndex] || '').trim() || null : null,
          referenceDate: referenceDateIndex !== -1 ? parseDateValue(row[referenceDateIndex]) : null,
        });
      }

      if (rows.length === 0) {
        throw new Error('Islenecek satir bulunamadi');
      }

      const result = await adminApi.importVadeBalances(rows);
      setSummary(result);
      toast.success('Import tamamlandi');
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error?.message || 'Import hatasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vade Excel Import</h1>
          <p className="text-sm text-muted-foreground">Muhasebe raporunu buradan yukleyebilirsiniz.</p>
        </div>

        <Card className="p-4 space-y-4">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={loading || !file}>
              {loading ? 'Yukleniyor...' : 'Import Et'}
            </Button>
            <Button variant="outline" onClick={() => setFile(null)} disabled={loading}>
              Temizle
            </Button>
          </div>
          {summary && (
            <div className="text-sm">
              <div>Aktarilan: {summary.imported}</div>
              <div>Atlanan: {summary.skipped}</div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
