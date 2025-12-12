'use client';

import { useState } from 'react';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import * as XLSX from 'xlsx';

interface EkstreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EkstreModal({ isOpen, onClose }: EkstreModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cariList, setCariList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCari, setSelectedCari] = useState<any | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.searchCariForEkstre({
        searchTerm: searchTerm.trim(),
        limit: 100
      });
      setCariList(response.data);
    } catch (error: any) {
      console.error('Cari arama hatası:', error);
      alert('Cari araması yapılırken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleCariSelect = (cari: any) => {
    setSelectedCari(cari);
  };

  const exportToExcel = async () => {
    if (!selectedCari) return;

    setExportingExcel(true);
    try {
      // Bu yılın ilk ve son günü
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;

      // Cari hareket föyünü al
      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari['Cari Kodu'],
        startDate,
        endDate
      });

      const hareketler = response.data;

      if (hareketler.length === 0) {
        alert('Bu cari için hareket bulunamadı');
        return;
      }

      // Excel dosyası oluştur
      const worksheet = XLSX.utils.json_to_sheet(hareketler);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cari Ekstre');

      // Dosyayı indir
      const fileName = `${selectedCari['Cari Kodu']}_${selectedCari['Cari Adı']}_${currentYear}_Ekstre.xlsx`;
      XLSX.writeFile(workbook, fileName);

      alert('Excel dosyası başarıyla indirildi');
    } catch (error: any) {
      console.error('Excel export hatası:', error);
      alert('Excel dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportToPDF = async () => {
    if (!selectedCari) return;

    setExportingPDF(true);
    try {
      // PDF için jsPDF kullanabiliriz, ancak şimdilik Excel'e yönlendirelim
      alert('PDF export özelliği yakında eklenecek. Şimdilik Excel kullanabilirsiniz.');
    } catch (error: any) {
      console.error('PDF export hatası:', error);
      alert('PDF dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExportingPDF(false);
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    }
    return String(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Cari Ekstre Al
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {!selectedCari ? (
            <>
              {/* Arama */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cari Adı veya Kodu ile Ara
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Arama yapmak için yazın..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={loading}
                    className="whitespace-nowrap"
                  >
                    {loading ? 'Aranıyor...' : 'Ara'}
                  </Button>
                </div>
              </div>

              {/* Sonuçlar */}
              {cariList.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari Kodu</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari Adı</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Sektör</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Grup</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Bakiye</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {cariList.map((cari, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari['Cari Kodu'])}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari['Cari Adı'])}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari['Sektör Kodu'])}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari['Grup Kodu'])}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatValue(cari['Bakiye'])}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleCariSelect(cari)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Seç →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Seçili Cari Bilgisi */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-lg text-blue-900 mb-2">Seçili Cari</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Cari Kodu:</span>
                    <span className="ml-2 text-blue-900">{selectedCari['Cari Kodu']}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Cari Adı:</span>
                    <span className="ml-2 text-blue-900">{selectedCari['Cari Adı']}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Sektör:</span>
                    <span className="ml-2 text-blue-900">{selectedCari['Sektör Kodu']}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Bakiye:</span>
                    <span className="ml-2 text-blue-900">{formatValue(selectedCari['Bakiye'])}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCari(null)}
                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  ← Farklı Cari Seç
                </button>
              </div>

              {/* Export Seçenekleri */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-gray-900">Ekstre Formatı Seçin</h3>
                <p className="text-sm text-gray-600">
                  {new Date().getFullYear()} yılı için tüm hareketler indirilecektir.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={exportToExcel}
                    disabled={exportingExcel}
                    className="flex items-center justify-center gap-3 p-6 border-2 border-green-500 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-12 h-12 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M15.8,20H14L12,13.2L10,20H8.2L5.5,11H7.3L9,17L11,10H13L15,17L16.7,11H18.5L15.8,20M13,9V3.5L18.5,9H13Z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-bold text-green-900">Excel</div>
                      <div className="text-sm text-green-700">
                        {exportingExcel ? 'İndiriliyor...' : '.xlsx dosyası'}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={exportToPDF}
                    disabled={exportingPDF}
                    className="flex items-center justify-center gap-3 p-6 border-2 border-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M15.5,14.5C15.5,15.61 14.61,16.5 13.5,16.5H11V19H9.5V11H13.5C14.61,11 15.5,11.89 15.5,13V14.5M13,9V3.5L18.5,9H13M11,12.5V15H13.5V12.5H11Z" />
                    </svg>
                    <div className="text-left">
                      <div className="font-bold text-red-900">PDF</div>
                      <div className="text-sm text-red-700">
                        {exportingPDF ? 'İndiriliyor...' : '.pdf dosyası'}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}
