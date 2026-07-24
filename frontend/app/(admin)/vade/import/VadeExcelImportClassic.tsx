'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useVadeExcelImport } from './useVadeExcelImport';

/**
 * Klasik gorunum: Vade Excel Import.
 * Mevcut JSX birebir korunmustur; tum mantik useVadeExcelImport hook'undan gelir.
 */
export default function VadeExcelImportClassic() {
  const { file, setFile, loading, summary, handleImport } = useVadeExcelImport();

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vade Excel Import</h1>
          <p className="text-sm text-muted-foreground">
            Muhasebe raporundaki cariler tek işlemde güncellenir; dosyada olmayan kayıtlar silinmez.
            B2B'de bulunmayan cariler girişe kapalı vade carisi olarak oluşturulur.
          </p>
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
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>Aktarılan: {summary.imported}</div>
                <div>Yeni cari: {summary.createdCustomers}</div>
                <div>Atlanan: {summary.skipped}</div>
              </div>
              {summary.skipped > 0 && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div>
                    Cari bulunamadı: {summary.skipReasons.customerNotFound} · Sektör kapsam dışı:{' '}
                    {summary.skipReasons.excludedSector} · Mükerrer kod: {summary.skipReasons.duplicateCode}
                  </div>
                  {summary.skippedRows.slice(0, 20).map((row, index) => (
                    <div key={`${row.sourceRowNumber ?? 'row'}-${row.mikroCariCode}-${index}`}>
                      Satır {row.sourceRowNumber ?? '—'} · {row.mikroCariCode} · {row.reason}
                    </div>
                  ))}
                  {summary.skipped > 20 && (
                    <div>İlk 20 ayrıntı gösteriliyor; toplam {summary.skipped} atlanan satır var.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
