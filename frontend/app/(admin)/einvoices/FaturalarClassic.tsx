'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { useFaturalar } from './useFaturalar';

const matchBadge = (status: string) => {
  if (status === 'MATCHED') return <Badge variant="success">Eslesmis</Badge>;
  if (status === 'PARTIAL') return <Badge variant="warning">Eksik</Badge>;
  return <Badge variant="danger">Bulunamadi</Badge>;
};

export default function FaturalarClassic() {
  const {
    formatAmount,
    formatDateShort,
    documents,
    pagination,
    loading,
    loadDocuments,
    bulkDownloading,
    handleBulkDownload,
    selectedIds,
    setSelectedIds,
    selectedCount,
    allSelectedOnPage,
    toggleSelectAll,
    toggleSelection,
    cariList,
    cariModalOpen,
    setCariModalOpen,
    selectedCari,
    setSelectedCari,
    search,
    setSearch,
    invoicePrefix,
    setInvoicePrefix,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedFiles,
    setSelectedFiles,
    uploading,
    uploadResult,
    handleUpload,
    handleDownload,
  } = useFaturalar();

  return (
    <>
      <div className="container-custom space-y-6 py-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturalar</h1>
          <p className="text-sm text-gray-600">E-fatura PDF arsivi ve indirme</p>
        </div>

        <Card title="PDF Yukleme" subtitle="Gun sonunda indirilen e-fatura/e-arsiv PDF'lerini yukleyin.">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                className="text-sm"
              />
              <p className="text-xs text-gray-500">
                {selectedFiles.length > 0 ? `${selectedFiles.length} dosya secildi` : 'PDF dosyasi secin'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setSelectedFiles([])}
                disabled={selectedFiles.length === 0 || uploading}
              >
                Temizle
              </Button>
              <Button onClick={handleUpload} isLoading={uploading} disabled={selectedFiles.length === 0}>
                PDF Yukle
              </Button>
            </div>
          </div>

          {uploadResult && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="flex flex-wrap gap-4">
                <span>Yeni: <strong>{uploadResult.uploaded}</strong></span>
                <span>Guncel: <strong>{uploadResult.updated}</strong></span>
                <span>Hata: <strong>{uploadResult.failed}</strong></span>
              </div>
              {uploadResult.results.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadResult.results.slice(0, 6).map((item) => (
                    <div key={item.invoiceNo} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs">{item.invoiceNo}</span>
                      <div className="flex items-center gap-2">
                        {matchBadge(item.status)}
                        {item.message && <span className="text-xs text-gray-500">{item.message}</span>}
                      </div>
                    </div>
                  ))}
                  {uploadResult.results.length > 6 && (
                    <div className="text-xs text-gray-500">+{uploadResult.results.length - 6} satir daha</div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Fatura Listesi" subtitle="Cari ve fatura numarasina gore filtreleyin.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Arama</label>
              <Input
                placeholder="Fatura no veya cari"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Fatura Prefix</label>
              <Input
                placeholder="DEF2026"
                value={invoicePrefix}
                onChange={(event) => setInvoicePrefix(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Baslangic Tarihi</label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Bitis Tarihi</label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-600">Cari</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setCariModalOpen(true)}>
                  Cari Sec
                </Button>
                {selectedCari && (
                  <>
                    <span className="text-sm font-medium">{selectedCari.code}</span>
                    <span className="text-sm text-gray-600">{selectedCari.name}</span>
                    <Button variant="ghost" onClick={() => setSelectedCari(null)}>
                      Temizle
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setInvoicePrefix('');
                  setFromDate('');
                  setToDate('');
                  setSelectedCari(null);
                  loadDocuments(1);
                }}
              >
                Filtre Temizle
              </Button>
              <Button onClick={() => loadDocuments(1)} isLoading={loading}>
                Listele
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span>
              {selectedCount > 0 ? `${selectedCount} fatura secili` : 'Fatura secimi yok'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedCount === 0 || bulkDownloading}
                onClick={() => setSelectedIds(new Set())}
              >
                Secimi Temizle
              </Button>
              <Button
                size="sm"
                onClick={handleBulkDownload}
                disabled={selectedCount === 0 || bulkDownloading}
              >
                {bulkDownloading ? 'Indiriliyor...' : 'Secilileri Indir'}
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-primary-600"
                    />
                  </TableHead>
                  <TableHead>Fatura No</TableHead>
                  <TableHead>Cari</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">Ara Toplam</TableHead>
                  <TableHead className="text-right">Genel Toplam</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-gray-500">
                      Kayit bulunamadi.
                    </TableCell>
                  </TableRow>
                )}
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelection(doc.id)}
                        disabled={!doc.fileName}
                        className="h-4 w-4 accent-primary-600"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{doc.invoiceNo}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900">{doc.customerName || '-'}</div>
                      <div className="text-xs text-gray-500">{doc.customerCode || '-'}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {doc.issueDate ? formatDateShort(doc.issueDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatAmount(doc.subtotalAmount, doc.currency)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatAmount(doc.totalAmount, doc.currency)}
                    </TableCell>
                    <TableCell>{matchBadge(doc.matchStatus)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        disabled={!doc.fileName}
                      >
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-gray-500">
                      Yukleniyor...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <span>
              {pagination.total} kayit
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => loadDocuments(pagination.page - 1)}
              >
                Geri
              </Button>
              <span>{pagination.page} / {pagination.totalPages}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadDocuments(pagination.page + 1)}
              >
                Ileri
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <CariSelectModal
        isOpen={cariModalOpen}
        onClose={() => setCariModalOpen(false)}
        onSelect={(cari) => setSelectedCari(cari)}
        cariList={cariList}
      />
    </>
  );
}
