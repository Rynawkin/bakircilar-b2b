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
