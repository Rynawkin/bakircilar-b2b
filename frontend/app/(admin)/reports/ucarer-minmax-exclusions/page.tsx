'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type ExcludedRow = {
  productCode: string;
  productName: string;
  stoModelKodu: string;
  distinctCustomersLast1Month: number;
  distinctCustomersLast2Months: number;
  distinctCustomersLast3Months: number;
  hasMultiCustomerSalesLast2Months: boolean;
};

export default function UcarerMinMaxExclusionsPage() {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/reports/ucarer-depo">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Ucarer Depo
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MinMax Hesaplanmayacaklar Raporu</h1>
            <p className="text-sm text-gray-600">`sto_model_kodu = HAYIR` isaretli stoklar</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Liste</CardTitle>
            <CardDescription>
              Son 1/2/3 ay farkli cari satis sayilari ile birlikte listelenir. Son 2 ayda 1'den fazla cariye satilanlar renklidir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Yenileniyor...' : 'Listeyi Yenile'}
              </Button>
              <p className="text-sm text-gray-600">
                Toplam: <strong>{rows.length.toLocaleString('tr-TR')}</strong>
              </p>
            </div>

            <div className="overflow-auto rounded-md border bg-white max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left">Stok Kodu</th>
                    <th className="px-2 py-2 text-left">Stok Adi</th>
                    <th className="px-2 py-2 text-left">Model Kodu</th>
                    <th className="px-2 py-2 text-right">Son 1 Ay Farkli Cari</th>
                    <th className="px-2 py-2 text-right">Son 2 Ay Farkli Cari</th>
                    <th className="px-2 py-2 text-right">Son 3 Ay Farkli Cari</th>
                    <th className="px-2 py-2 text-center">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-gray-500">
                        Kayit yok.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const code = String(row.productCode || '').trim().toUpperCase();
                    const highlight = row.hasMultiCustomerSalesLast2Months ? 'bg-amber-300/70' : '';
                    return (
                      <tr key={code} className={`border-t ${highlight}`}>
                        <td className="px-2 py-2 font-semibold text-gray-900">{code}</td>
                        <td className="px-2 py-2">{row.productName || '-'}</td>
                        <td className="px-2 py-2">{row.stoModelKodu || '-'}</td>
                        <td className="px-2 py-2 text-right">{Number(row.distinctCustomersLast1Month || 0).toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-right">{Number(row.distinctCustomersLast2Months || 0).toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-right">{Number(row.distinctCustomersLast3Months || 0).toLocaleString('tr-TR')}</td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => includeBackToMinMax(code)}
                            disabled={Boolean(updatingByCode[code])}
                          >
                            {updatingByCode[code] ? '...' : 'Hesaplamaya Al'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

