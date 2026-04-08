'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';

interface EkstreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EkstreCari {
  raw: any;
  cariCode: string;
  cariName: string;
  sectorCode: string;
  groupCode: string;
  balance: number;
}

interface EkstreHareket {
  seri: string;
  sira: string;
  tarih: any;
  belgeNo: string;
  evrakTipi: string;
  odemeTipi: string;
  hareketTipi: string;
  tipKodu: number | null;
  tutar: number;
}

const normalizeColumnKey = (value: any): string => {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/ä±/g, 'i')
    .replace(/ä°/g, 'i')
    .replace(/åŸ/g, 's')
    .replace(/å/g, 's')
    .replace(/ä/g, 'g')
    .replace(/ã¼/g, 'u')
    .replace(/ã¶/g, 'o')
    .replace(/ã§/g, 'c')
    .replace(/[^a-z0-9]/g, '');
};

const pickRowValue = (row: any, aliases: string[]): any => {
  if (!row || typeof row !== 'object') return null;

  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null) return value;
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => ({
    key: normalizeColumnKey(key),
    value,
  }));

  for (const alias of aliases) {
    const normalizedAlias = normalizeColumnKey(alias);
    const match = normalizedEntries.find((entry) => entry.key === normalizedAlias);
    if (match && match.value !== undefined && match.value !== null) return match.value;
  }

  return null;
};

const mapCariRow = (row: any): EkstreCari => {
  const rawBalance = pickRowValue(row, ['Bakiye', 'balance', 'bakiye']);
  return {
    raw: row,
    cariCode: String(pickRowValue(row, ['Cari Kodu', 'cari_kod', 'Kod', 'msg_S_1032']) ?? '').trim(),
    cariName: String(pickRowValue(row, ['Cari Adi', 'Cari Adı', 'Cari AdÄ±', 'cari_unvan1', 'Unvan']) ?? '').trim(),
    sectorCode: String(pickRowValue(row, ['Sektor Kodu', 'Sektör Kodu', 'SektÃ¶r Kodu', 'cari_sektor_kodu']) ?? '').trim(),
    groupCode: String(pickRowValue(row, ['Grup Kodu', 'cari_grup_kodu']) ?? '').trim(),
    balance: Number(rawBalance) || 0,
  };
};

const mapHareketRow = (row: any): EkstreHareket => {
  const rawTipKodu = pickRowValue(row, ['Tip Kodu', 'tip_kodu', 'cha_tip']);
  const tipKodu = rawTipKodu === null || rawTipKodu === undefined || rawTipKodu === ''
    ? null
    : Number(rawTipKodu);

  const rawTutar = pickRowValue(row, ['Tutar', 'cha_meblag']);

  return {
    seri: String(pickRowValue(row, ['Seri', 'cha_evrakno_seri']) ?? '-'),
    sira: String(pickRowValue(row, ['Sira', 'Sıra', 'SÄ±ra', 'cha_evrakno_sira']) ?? '-'),
    tarih: pickRowValue(row, ['Tarih', 'cha_tarihi']),
    belgeNo: String(pickRowValue(row, ['Belge No', 'BelgeNo', 'cha_belge_no']) ?? '-'),
    evrakTipi: String(pickRowValue(row, ['Evrak Tipi', 'evrak_tipi']) ?? '-'),
    odemeTipi: String(pickRowValue(row, ['Odeme Tipi', 'Ödeme Tipi', 'odeme_tipi']) ?? '-'),
    hareketTipi: String(pickRowValue(row, ['Hareket Tipi', 'hareket_tipi']) ?? '-'),
    tipKodu: Number.isFinite(tipKodu) ? tipKodu : null,
    tutar: Number(rawTutar) || 0,
  };
};

const formatDateTr = (value: any): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('tr-TR');
};

export function EkstreModal({ isOpen, onClose }: EkstreModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cariList, setCariList] = useState<EkstreCari[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCari, setSelectedCari] = useState<EkstreCari | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') return '-';
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

  const resolveMovementDirection = (row: EkstreHareket) => {
    if (row.tipKodu === 0) return 'BORC';
    if (row.tipKodu === 1) return 'ALACAK';

    const tipText = String(row.hareketTipi || '').toLowerCase();
    if (tipText.includes('bor')) return 'BORC';
    if (tipText.includes('alac')) return 'ALACAK';
    return null;
  };

  const calculateTotals = (rows: EkstreHareket[]) => {
    const totals = rows.reduce(
      (acc, row) => {
        const direction = resolveMovementDirection(row);
        if (direction === 'BORC') acc.borc += row.tutar;
        else if (direction === 'ALACAK') acc.alacak += row.tutar;
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
    if (!searchTerm || searchTerm.trim().length === 0) return;

    setLoading(true);
    try {
      const response = await adminApi.searchCariForEkstre({
        searchTerm: searchTerm.trim(),
        limit: 100,
      });

      const rows = Array.isArray(response.data) ? response.data : [];
      setCariList(rows.map(mapCariRow));
    } catch (error: any) {
      console.error('Cari arama hatasi:', error);
      toast.error('Cari aramasi yapilirken bir hata olustu');
    } finally {
      setLoading(false);
    }
  };

  const handleCariSelect = (cari: EkstreCari) => {
    setSelectedCari(cari);
  };

  const exportToExcel = async () => {
    if (!selectedCari) return;

    setExportingExcel(true);
    try {
      const XLSX = await import('xlsx');

      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari.cariCode,
        startDate,
        endDate,
      });

      const hareketlerRaw = Array.isArray(response.data) ? response.data : [];
      const hareketler = hareketlerRaw.map(mapHareketRow);
      const openingTotals = normalizeOpening(response.opening);

      if (hareketler.length === 0 && openingTotals.borc === 0 && openingTotals.alacak === 0) {
        toast.error('Bu cari icin hareket bulunamadi');
        return;
      }

      const headers = ['Seri', 'Sira', 'Tarih', 'Belge No', 'Evrak Tipi', 'Odeme Tipi', 'Hareket Tipi', 'Tutar'];

      const exportRows = hareketler.map((row) => ({
        Seri: row.seri || '-',
        Sira: row.sira || '-',
        Tarih: formatDateTr(row.tarih),
        'Belge No': row.belgeNo || '-',
        'Evrak Tipi': row.evrakTipi || '-',
        'Odeme Tipi': row.odemeTipi || '-',
        'Hareket Tipi': row.hareketTipi || '-',
        Tutar: row.tutar,
      }));

      const periodTotals = calculateTotals(hareketler);
      const totals = {
        borc: periodTotals.borc + openingTotals.borc,
        alacak: periodTotals.alacak + openingTotals.alacak,
        bakiye: (openingTotals.borc - openingTotals.alacak) + (periodTotals.borc - periodTotals.alacak),
      };

      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      XLSX.utils.sheet_add_json(
        worksheet,
        [
          {},
          { Seri: 'DEVIR BORC', Tutar: openingTotals.borc },
          { Seri: 'DEVIR ALACAK', Tutar: openingTotals.alacak },
          { Seri: 'DEVIR BAKIYE', Tutar: openingTotals.bakiye },
          {},
          { Seri: 'DONEM BORC', Tutar: periodTotals.borc },
          { Seri: 'DONEM ALACAK', Tutar: periodTotals.alacak },
          { Seri: 'DONEM BAKIYE', Tutar: periodTotals.bakiye },
          {},
          { Seri: 'TOPLAM BORC', Tutar: totals.borc },
          { Seri: 'TOPLAM ALACAK', Tutar: totals.alacak },
          { Seri: 'GENEL BAKIYE', Tutar: totals.bakiye },
        ],
        { header: headers, skipHeader: true, origin: -1 }
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cari Ekstre');

      const fileName = `${selectedCari.cariCode || 'Cari'}_${selectedCari.cariName || 'Isimsiz'}_${startDate}_${endDate}_Ekstre.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success('Excel dosyasi basariyla indirildi');
    } catch (error: any) {
      console.error('Excel export hatasi:', error);
      toast.error('Excel dosyasi olusturulurken bir hata olustu');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportToPDF = async () => {
    if (!selectedCari) return;

    setExportingPDF(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
      if (typeof autoTable !== 'function') {
        throw new Error('autoTable is not available');
      }

      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari.cariCode,
        startDate,
        endDate,
      });

      const hareketlerRaw = Array.isArray(response.data) ? response.data : [];
      const hareketler = hareketlerRaw.map(mapHareketRow);
      const openingTotals = normalizeOpening(response.opening);

      if (hareketler.length === 0 && openingTotals.borc === 0 && openingTotals.alacak === 0) {
        toast.error('Bu cari icin hareket bulunamadi');
        return;
      }

      const periodTotals = calculateTotals(hareketler);
      const totals = {
        borc: periodTotals.borc + openingTotals.borc,
        alacak: periodTotals.alacak + openingTotals.alacak,
        bakiye: (openingTotals.borc - openingTotals.alacak) + (periodTotals.borc - periodTotals.alacak),
      };

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const cleanText = (text: string) =>
        String(text || '')
          .replace(/Ä°/g, 'I')
          .replace(/Ä±/g, 'i')
          .replace(/Å/g, 'S')
          .replace(/ÅŸ/g, 's')
          .replace(/Ä/g, 'G')
          .replace(/ÄŸ/g, 'g')
          .replace(/Ãœ/g, 'U')
          .replace(/Ã¼/g, 'u')
          .replace(/Ã–/g, 'O')
          .replace(/Ã¶/g, 'o')
          .replace(/Ã‡/g, 'C')
          .replace(/Ã§/g, 'c');

      doc.setFontSize(16);
      doc.text('CARI HESAP EKSTRESI', pageWidth / 2, 15, { align: 'center' });

      doc.setFontSize(10);
      doc.text(`Cari Kodu: ${selectedCari.cariCode}`, 14, 25);
      doc.text(`Cari Adi: ${cleanText(selectedCari.cariName || '')}`, 14, 30);
      doc.text(`Donem: ${startDate} - ${endDate}`, 14, 35);

      const tableData = hareketler.length > 0
        ? hareketler.map((row) => [
          cleanText(row.seri || '-'),
          cleanText(row.sira || '-'),
          formatDateTr(row.tarih),
          cleanText(row.belgeNo || '-'),
          cleanText(row.evrakTipi || '-'),
          cleanText(row.odemeTipi || '-'),
          cleanText(row.hareketTipi || '-'),
          formatAmount(row.tutar),
        ])
        : [['-', '-', '-', '-', '-', '-', '-', formatAmount(0)]];

      autoTable(doc, {
        startY: 42,
        head: [['Seri', 'Sira', 'Tarih', 'Belge No', 'Evrak Tipi', 'Odeme Tipi', 'Hareket Tipi', 'Tutar']],
        body: tableData,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: 'linebreak',
          halign: 'left',
          font: 'helvetica',
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 18 },
          2: { cellWidth: 22 },
          3: { cellWidth: 34 },
          4: { cellWidth: 40 },
          5: { cellWidth: 40 },
          6: { cellWidth: 28 },
          7: { cellWidth: 26, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: 42, left: 14, right: 14 },
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

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Sayfa ${i} / ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, {
          align: 'center',
        });
      }

      const fileName = `${selectedCari.cariCode || 'Cari'}_${selectedCari.cariName || 'Isimsiz'}_${startDate}_${endDate}_Ekstre.pdf`;
      doc.save(fileName);

      toast.success('PDF dosyasi basariyla indirildi');
    } catch (error: any) {
      console.error('PDF export hatasi:', error);
      toast.error('PDF dosyasi olusturulurken bir hata olustu');
    } finally {
      setExportingPDF(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Cari Ekstre Al</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {!selectedCari ? (
            <>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Cari Adi veya Kodu ile Ara</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Arama yapmak icin yazin..."
                    className="w-full sm:flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button onClick={handleSearch} disabled={loading} className="w-full sm:w-auto whitespace-nowrap">
                    {loading ? 'Araniyor...' : 'Ara'}
                  </Button>
                </div>
              </div>

              {cariList.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari Kodu</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cari Adi</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Sektor</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Grup</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Bakiye</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {cariList.map((cari, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari.cariCode)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari.cariName)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari.sectorCode)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatValue(cari.groupCode)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatValue(cari.balance)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleCariSelect(cari)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Sec -&gt;
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-lg text-blue-900 mb-2">Secili Cari</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Cari Kodu:</span>
                    <span className="ml-2 text-blue-900">{selectedCari.cariCode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Cari Adi:</span>
                    <span className="ml-2 text-blue-900">{selectedCari.cariName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Sektor:</span>
                    <span className="ml-2 text-blue-900">{selectedCari.sectorCode || '-'}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Bakiye:</span>
                    <span className="ml-2 text-blue-900">{formatValue(selectedCari.balance)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCari(null)}
                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  &lt;- Farkli Cari Sec
                </button>
              </div>

              <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Tarih Araligi</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Baslangic Tarihi</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bitis Tarihi</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-gray-900">Ekstre Formati Secin</h3>
                <p className="text-sm text-gray-600">Secilen tarih araligi icin tum hareketler indirilecektir.</p>
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
                      <div className="text-sm text-green-700">{exportingExcel ? 'Indiriliyor...' : '.xlsx dosyasi'}</div>
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
                      <div className="text-sm text-red-700">{exportingPDF ? 'Indiriliyor...' : '.pdf dosyasi'}</div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-200 flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}
