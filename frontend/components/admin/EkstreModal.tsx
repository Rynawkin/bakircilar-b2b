'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';

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
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);

  // Helper function for formatting values
  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    }
    return String(value);
  };

  const formatAmount = (value: any) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0,00';
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const resolveMovementDirection = (row: any) => {
    const tipCode = Number(row['Tip Kodu']);
    if (Number.isFinite(tipCode)) {
      if (tipCode === 0) return 'BORC';
      if (tipCode === 1) return 'ALACAK';
    }

    const tipText = String(row['Hareket Tipi'] || '').toLowerCase();
    if (tipText.includes('bor')) return 'BORC';
    if (tipText.includes('alac')) return 'ALACAK';
    return null;
  };

  const calculateTotals = (rows: any[]) => {
    const totals = rows.reduce(
      (acc, row) => {
        const amount = Number(row['Tutar']) || 0;
        const direction = resolveMovementDirection(row);
        if (direction === 'BORC') acc.borc += amount;
        else if (direction === 'ALACAK') acc.alacak += amount;
        return acc;
      },
      { borc: 0, alacak: 0 }
    );

    return {
      ...totals,
      bakiye: totals.borc - totals.alacak,
    };
  };

  const normalizeOpening = (opening?: { borc?: number; alacak?: number; bakiye?: number } | null) => {
    const borc = Number(opening?.borc) || 0;
    const alacak = Number(opening?.alacak) || 0;
    return {
      borc,
      alacak,
      bakiye: Number.isFinite(opening?.bakiye) ? Number(opening?.bakiye) : borc - alacak,
    };
  };

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
      toast.error('Cari araması yapılırken bir hata oluştu');
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
      // Dynamically import xlsx library
      const XLSX = await import('xlsx');

      // Cari hareket föyünü al
      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari['Cari Kodu'],
        startDate,
        endDate
      });

      const hareketler = response.data;
      const openingTotals = normalizeOpening(response.opening);

      if (hareketler.length === 0 && openingTotals.borc === 0 && openingTotals.alacak === 0) {
        toast.error('Bu cari için hareket bulunamadı');
        return;
      }

      const headers = [
        'Seri',
        'Sıra',
        'Tarih',
        'Belge No',
        'Evrak Tipi',
        'Odeme Tipi',
        'Hareket Tipi',
        'Tutar'
      ];

      const exportRows = hareketler.map((row: any) => ({
        'Seri': row['Seri'] ?? '-',
        'Sıra': row['Sıra'] ?? '-',
        'Tarih': row['Tarih'] ? new Date(row['Tarih']).toLocaleDateString('tr-TR') : '-',
        'Belge No': row['Belge No'] ?? '-',
        'Evrak Tipi': row['Evrak Tipi'] ?? '-',
        'Odeme Tipi': row['Odeme Tipi'] ?? '-',
        'Hareket Tipi': row['Hareket Tipi'] ?? '-',
        'Tutar': Number(row['Tutar']) || 0
      }));

      const periodTotals = calculateTotals(hareketler);
      const totals = {
        borc: periodTotals.borc + openingTotals.borc,
        alacak: periodTotals.alacak + openingTotals.alacak,
        bakiye: (openingTotals.borc - openingTotals.alacak) + (periodTotals.borc - periodTotals.alacak),
      };

      // Excel dosyası oluştur
      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      XLSX.utils.sheet_add_json(
        worksheet,
        [
          {},
          { 'Seri': 'DEVIR BORC', 'Tutar': openingTotals.borc },
          { 'Seri': 'DEVIR ALACAK', 'Tutar': openingTotals.alacak },
          { 'Seri': 'DEVIR BAKIYE', 'Tutar': openingTotals.bakiye },
          {},
          { 'Seri': 'DONEM BORC', 'Tutar': periodTotals.borc },
          { 'Seri': 'DONEM ALACAK', 'Tutar': periodTotals.alacak },
          { 'Seri': 'DONEM BAKIYE', 'Tutar': periodTotals.bakiye },
          {},
          { 'Seri': 'TOPLAM BORC', 'Tutar': totals.borc },
          { 'Seri': 'TOPLAM ALACAK', 'Tutar': totals.alacak },
          { 'Seri': 'GENEL BAKIYE', 'Tutar': totals.bakiye }
        ],
        { header: headers, skipHeader: true, origin: -1 }
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cari Ekstre');

      // Dosyayı indir
      const fileName = `${selectedCari['Cari Kodu']}_${selectedCari['Cari Adı']}_${startDate}_${endDate}_Ekstre.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success('Excel dosyası başarıyla indirildi');
    } catch (error: any) {
      console.error('Excel export hatası:', error);
      toast.error('Excel dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportToPDF = async () => {
    if (!selectedCari) return;

    setExportingPDF(true);
    try {
      // Dynamically import jsPDF
      const { default: jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
      if (typeof autoTable !== 'function') {
        throw new Error('autoTable is not available');
      }

      // Cari hareket föyünü al
      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari['Cari Kodu'],
        startDate,
        endDate
      });

      const hareketler = response.data;
      const openingTotals = normalizeOpening(response.opening);

      if (hareketler.length === 0 && openingTotals.borc === 0 && openingTotals.alacak === 0) {
        toast.error('Bu cari için hareket bulunamadı');
        return;
      }

      const periodTotals = calculateTotals(hareketler);
      const totals = {
        borc: periodTotals.borc + openingTotals.borc,
        alacak: periodTotals.alacak + openingTotals.alacak,
        bakiye: (openingTotals.borc - openingTotals.alacak) + (periodTotals.borc - periodTotals.alacak),
      };

      // PDF oluştur (landscape - daha fazla kolon için)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Başlık
      doc.setFontSize(16);
      doc.text('CARI HESAP EKSTRESI', pageWidth / 2, 15, { align: 'center' });

      // Cari Bilgileri - Türkçe karakterleri temizle
      const cleanText = (text: string) => {
        return text
          .replace(/İ/g, 'I')
          .replace(/ı/g, 'i')
          .replace(/Ş/g, 'S')
          .replace(/ş/g, 's')
          .replace(/Ğ/g, 'G')
          .replace(/ğ/g, 'g')
          .replace(/Ü/g, 'U')
          .replace(/ü/g, 'u')
          .replace(/Ö/g, 'O')
          .replace(/ö/g, 'o')
          .replace(/Ç/g, 'C')
          .replace(/ç/g, 'c');
      };

      doc.setFontSize(10);
      doc.text(`Cari Kodu: ${selectedCari['Cari Kodu']}`, 14, 25);
      doc.text(`Cari Adi: ${cleanText(selectedCari['Cari Adı'] || '')}`, 14, 30);
      doc.text(`Donem: ${startDate} - ${endDate}`, 14, 35);

      // Tablo verilerini hazırla
      const tableData = hareketler.length > 0
        ? hareketler.map((row: any) => [
        cleanText(String(row['Seri'] || '-')),
        cleanText(String(row['Sıra'] || '-')),
        row['Tarih'] ? new Date(row['Tarih']).toLocaleDateString('tr-TR') : '-',
        cleanText(String(row['Belge No'] || '-')),
        cleanText(String(row['Evrak Tipi'] || '-')),
        cleanText(String(row['Odeme Tipi'] || '-')),
        cleanText(String(row['Hareket Tipi'] || '-')),
        formatAmount(row['Tutar'])
      ])
        : [[
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          formatAmount(0)
        ]];

      // AutoTable ile tablo oluştur
      autoTable(doc, {
        startY: 42,
        head: [[
          'Seri',
          'Sira',
          'Tarih',
          'Belge No',
          'Evrak Tipi',
          'Odeme Tipi',
          'Hareket Tipi',
          'Tutar'
        ]],
        body: tableData,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: 'linebreak',
          halign: 'left',
          font: 'helvetica' // Basic Latin charset
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 10
        },
        columnStyles: {
          0: { cellWidth: 20 },  // Seri
          1: { cellWidth: 18 },  // Sira
          2: { cellWidth: 22 },  // Tarih
          3: { cellWidth: 34 },  // Belge No
          4: { cellWidth: 40 },  // Evrak Tipi
          5: { cellWidth: 40 },  // Odeme Tipi
          6: { cellWidth: 28 },  // Hareket Tipi
          7: { cellWidth: 26, halign: 'right' }  // Tutar
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { top: 42, left: 14, right: 14 }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 42;
      const summaryStartY = finalY + 6;

      let summaryY = summaryStartY;
      if (summaryY + 56 > pageHeight - 12) {
        doc.addPage();
        summaryY = 18;
      }

      doc.setFontSize(10);
      doc.text(`Devir Borc: ${formatAmount(openingTotals.borc)} TL`, 14, summaryY);
      doc.text(`Devir Alacak: ${formatAmount(openingTotals.alacak)} TL`, 14, summaryY + 6);
      doc.text(`Devir Bakiye: ${formatAmount(openingTotals.bakiye)} TL`, 14, summaryY + 12);

      const totalsY = summaryY + 20;
      doc.text(`Donem Borc: ${formatAmount(periodTotals.borc)} TL`, 14, totalsY);
      doc.text(`Donem Alacak: ${formatAmount(periodTotals.alacak)} TL`, 14, totalsY + 6);
      doc.text(`Donem Bakiye: ${formatAmount(periodTotals.bakiye)} TL`, 14, totalsY + 12);

      const grandY = totalsY + 20;
      doc.text(`Toplam Borc: ${formatAmount(totals.borc)} TL`, 14, grandY);
      doc.text(`Toplam Alacak: ${formatAmount(totals.alacak)} TL`, 14, grandY + 6);
      doc.text(`Genel Bakiye: ${formatAmount(totals.bakiye)} TL`, 14, grandY + 12);

      // Footer - sayfa numaraları
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Sayfa ${i} / ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      // Dosyayı indir
      const fileName = `${selectedCari['Cari Kodu']}_${selectedCari['Cari Adı']}_${startDate}_${endDate}_Ekstre.pdf`;
      doc.save(fileName);

      toast.success('PDF dosyası başarıyla indirildi');
    } catch (error: any) {
      console.error('PDF export hatası:', error);
      toast.error('PDF dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExportingPDF(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
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
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {!selectedCari ? (
            <>
              {/* Arama */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cari Adı veya Kodu ile Ara
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Arama yapmak için yazın..."
                    className="w-full sm:flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={loading}
                    className="w-full sm:w-auto whitespace-nowrap"
                  >
                    {loading ? 'Aranıyor...' : 'Ara'}
                  </Button>
                </div>
              </div>

              {/* Sonuçlar */}
              {cariList.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[640px]">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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

              {/* Tarih Aralığı Seçimi */}
              <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Tarih Aralığı</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Başlangıç Tarihi
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bitiş Tarihi
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Export Seçenekleri */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-gray-900">Ekstre Formatı Seçin</h3>
                <p className="text-sm text-gray-600">
                  Seçilen tarih aralığı için tüm hareketler indirilecektir.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={exportToExcel}
                    disabled={exportingExcel}
                    className="flex items-center justify-center gap-3 p-4 sm:p-6 border-2 border-green-500 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
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
                    className="flex items-center justify-center gap-3 p-4 sm:p-6 border-2 border-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
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
        <div className="p-4 sm:p-6 border-t border-gray-200 flex gap-3 justify-end">
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
