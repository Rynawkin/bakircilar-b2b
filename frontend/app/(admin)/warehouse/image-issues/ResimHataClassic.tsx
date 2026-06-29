'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateShort } from '@/lib/utils/format';
import { useResimHata, statusBadge } from './useResimHata';

/**
 * Klasik (mevcut) Resim Hata Talepleri gorunumu.
 * JSX, eski page.tsx ile BIRE BIR aynidir; tum mantik useResimHata hook'undan gelir.
 */
export default function ResimHataClassic() {
  const {
    isLoading,
    reports,
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
    pagination,
    totalText,
    actionKey,
    uploadingReportId,
    previewImage,
    setPreviewImage,
    fileInputRefs,
    fetchReports,
    handleStatusChange,
    openUploadPicker,
    handleUploadImage,
    setPage,
  } = useResimHata();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-slate-100">
      <div className="w-full px-2 md:px-4 xl:px-6 py-5 space-y-4">
        <Card className="border border-cyan-200 bg-white/90 backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Resim Hata Talepleri</h1>
                <p className="text-sm text-slate-600">Depo kiosk ekranindan bildirilen urun resmi hatalari</p>
              </div>
              <div className="text-xs md:text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2 inline-flex">
                {totalText}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_140px] gap-3">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Siparis no, urun kodu, urun adi veya musteri ara..."
                className="h-11"
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'ALL' | typeof statusFilter);
                  setPage(1);
                }}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <option value="ALL">Tum Durumlar</option>
                <option value="OPEN">Acik</option>
                <option value="REVIEWED">Incelendi</option>
                <option value="FIXED">Duzeltildi</option>
              </select>
              <Button variant="secondary" onClick={() => fetchReports(true)} className="h-11">
                Yenile
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 bg-white/90">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 font-semibold">Yukleniyor...</div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-semibold">Filtreye uygun talep bulunamadi</div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const status = statusBadge[report.status];
                return (
                  <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
                    <div className="flex flex-col lg:flex-row gap-3">
                      <div className="w-28 h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        {(report.currentProductImageUrl || report.imageUrl) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                url: (report.currentProductImageUrl || report.imageUrl) as string,
                                name: report.productName,
                              })
                            }
                            className="block w-full h-full"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={(report.currentProductImageUrl || report.imageUrl) as string}
                              alt={report.productName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-slate-500">RESIM YOK</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm md:text-base font-black text-slate-900 line-clamp-2">
                              {report.productName}
                            </p>
                            <p className="text-xs text-slate-600">
                              {report.productCode}
                              {report.rowNumber ? ` | Satir #${report.rowNumber}` : ''}
                            </p>
                          </div>
                          <span className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold ${status.className}`}>
                            {status.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Siparis</p>
                            <p className="font-semibold text-slate-800">
                              {report.mikroOrderNumber} {report.orderSeries ? `(${report.orderSeries})` : ''}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Musteri</p>
                            <p className="font-semibold text-slate-800">
                              {report.customerCode || '-'} | {report.customerName || '-'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Bildiren</p>
                            <p className="font-semibold text-slate-800">{report.reporterName || '-'}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="font-bold text-slate-500">Bildirim Tarihi</p>
                            <p className="font-semibold text-slate-800">{formatDateShort(report.createdAt)}</p>
                          </div>
                        </div>

                        {(report.note || report.reviewNote || report.reviewedByName) && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-1">
                            {report.note && (
                              <p>
                                <span className="font-bold text-slate-600">Depo Notu:</span> {report.note}
                              </p>
                            )}
                            {report.reviewNote && (
                              <p>
                                <span className="font-bold text-slate-600">Inceleme Notu:</span> {report.reviewNote}
                              </p>
                            )}
                            {report.reviewedByName && (
                              <p>
                                <span className="font-bold text-slate-600">Inceleyen:</span> {report.reviewedByName}
                                {report.reviewedAt ? ` (${formatDateShort(report.reviewedAt)})` : ''}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <input
                            ref={(node) => {
                              fileInputRefs.current[report.id] = node;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0] || null;
                              void handleUploadImage(report, selectedFile);
                              event.target.value = '';
                            }}
                          />
                          <Button
                            variant="outline"
                            onClick={() => openUploadPicker(report.id)}
                            disabled={!report.productId || uploadingReportId === report.id}
                            className="h-9 text-xs"
                          >
                            {uploadingReportId === report.id ? 'Resim Yukleniyor...' : 'Yeni Resim Yukle'}
                          </Button>
                          <Button
                            variant={report.status === 'OPEN' ? 'danger' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'OPEN')}
                            disabled={actionKey === `${report.id}:OPEN`}
                            className="h-9 text-xs"
                          >
                            Acik
                          </Button>
                          <Button
                            variant={report.status === 'REVIEWED' ? 'primary' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'REVIEWED')}
                            disabled={actionKey === `${report.id}:REVIEWED`}
                            className="h-9 text-xs"
                          >
                            Incelendi
                          </Button>
                          <Button
                            variant={report.status === 'FIXED' ? 'primary' : 'secondary'}
                            onClick={() => handleStatusChange(report, 'FIXED')}
                            disabled={actionKey === `${report.id}:FIXED`}
                            className="h-9 text-xs"
                          >
                            Duzeltildi
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-slate-500">
                  Sayfa {pagination.page} / {pagination.totalPages} - Toplam {pagination.totalRecords} kayit
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="h-9 text-xs"
                  >
                    Onceki
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                    className="h-9 text-xs"
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-white/90 text-slate-900 font-black"
            >
              X
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-2xl border-2 border-white/50 object-contain bg-slate-950/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
