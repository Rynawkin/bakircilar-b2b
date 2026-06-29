'use client';

import {
  Search,
  RefreshCw,
  ImageOff,
  Upload,
  X,
  Check,
  Eye,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useResimHata, ImageIssueStatus } from './useResimHata';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Resim Hata Talepleri ekrani.
 * Mevcut TUM mantik useResimHata'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/durum/rozet/kolon/buton/modal/onizleme/inline-form dusurulmemistir;
 * brief 4.5.3'teki her oge (urun, hata tipi/aciklama, durum rozeti, aksiyonlar, sayfalama) mevcut.
 */
export default function ResimHataNew() {
  const {
    isLoading,
    reports,
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
    pagination,
    summary,
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
    statusBadge,
    formatDateShort,
  } = useResimHata();

  // Durum rozeti (yeni stil) — OPEN red / REVIEWED amber / FIXED emerald
  const renderStatusBadge = (status: ImageIssueStatus) => {
    const meta = statusBadge[status];
    if (status === 'OPEN') {
      return (
        <span className="inline-flex items-center gap-1.5 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[11px] font-semibold px-2.5 py-1 rounded-full">
          <AlertTriangle width={12} height={12} stroke="currentColor" strokeWidth={2.2} />
          {meta.label}
        </span>
      );
    }
    if (status === 'REVIEWED') {
      return (
        <span className="inline-flex items-center gap-1.5 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px] font-semibold px-2.5 py-1 rounded-full">
          <Eye width={12} height={12} stroke="currentColor" strokeWidth={2.2} />
          {meta.label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[11px] font-semibold px-2.5 py-1 rounded-full">
        <Check width={12} height={12} stroke="currentColor" strokeWidth={2.4} />
        {meta.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <div className="w-full px-3 md:px-6 xl:px-8 py-6 space-y-4">
        {/* Baslik + ozet + filtre kart */}
        <div className={`${CARD} p-5`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">
                  Resim Hata Talepleri
                </h1>
                <div className="text-[13px] text-[#8b97ac] mt-1.5">
                  Depodan gelen urun gorseli hatalarini yonet · dogru gorsel yuklenince otomatik duzeltildi
                </div>
              </div>
              {/* Ozet (totalText birebir korunur) */}
              <div className="text-[12px] md:text-[12.5px] text-[#51607a] bg-[#f4f6fa] border border-[#eef1f6] rounded-lg px-3 py-2 inline-flex">
                {totalText}
              </div>
            </div>

            {/* Ozet cipleri (toplam/acik/incelenen/duzeltilen) */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 bg-[#f4f6fa] border border-[#eef1f6] text-[#51607a] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                Toplam <b className="text-[#14223b]">{summary.total}</b>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                Acik <b>{summary.open}</b>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                Incelenen <b>{summary.reviewed}</b>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                Duzeltilen <b>{summary.fixed}</b>
              </span>
            </div>

            {/* Arama + durum filtresi + yenile (mevcut handler'lar) */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_140px] gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b97ac] pointer-events-none">
                  <Search width={16} height={16} stroke="currentColor" strokeWidth={2} />
                </span>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Siparis no, urun kodu, urun adi veya musteri ara..."
                  className="h-11 w-full rounded-[10px] border border-[#d8e0ec] bg-white pl-9 pr-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b] placeholder:text-[#9aa6b8]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'ALL' | ImageIssueStatus);
                  setPage(1);
                }}
                className="h-11 rounded-[10px] border border-[#d8e0ec] bg-white px-4 text-[13px] font-semibold text-[#51607a] outline-none focus:border-[#15356b]"
              >
                <option value="ALL">Tum Durumlar</option>
                <option value="OPEN">Acik</option>
                <option value="REVIEWED">Incelendi</option>
                <option value="FIXED">Duzeltildi</option>
              </select>
              <button
                type="button"
                onClick={() => fetchReports(true)}
                className="h-11 inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#d8e0ec] bg-white px-4 text-[13px] font-semibold text-[#51607a] hover:bg-[#f4f6fa] transition-colors"
              >
                <RefreshCw width={14} height={14} stroke="currentColor" strokeWidth={2} />
                Yenile
              </button>
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className={`${CARD} p-5`}>
          {isLoading ? (
            <div className="py-16 text-center text-[#8b97ac] font-semibold text-[13px]">Yukleniyor...</div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-[#8b97ac] font-semibold text-[13px]">
              Filtreye uygun talep bulunamadi
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((report) => {
                const hasImage = Boolean(report.currentProductImageUrl || report.imageUrl);
                const imageSrc = (report.currentProductImageUrl || report.imageUrl) as string;
                return (
                  <div
                    key={report.id}
                    className="border border-[#e7ebf2] rounded-xl p-4 bg-white hover:border-[#d8e0ec] transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row gap-4">
                      {/* Urun gorseli (onizleme butonu / RESIM YOK) */}
                      <div className="w-28 h-28 rounded-[10px] overflow-hidden bg-[#f4f6fa] border border-[#eef1f6] shrink-0 flex items-center justify-center">
                        {hasImage ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({ url: imageSrc, name: report.productName })
                            }
                            className="block w-full h-full"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageSrc}
                              alt={report.productName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-[#c2cbda]">
                            <ImageOff width={22} height={22} stroke="currentColor" strokeWidth={1.5} />
                            <span className="text-[10px] font-semibold text-[#9aa6b8]">RESIM YOK</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        {/* Urun adi + kod/satir + durum rozeti */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-[#14223b] line-clamp-2 m-0">
                              {report.productName}
                            </p>
                            <p className="text-[11.5px] text-[#8b97ac] font-mono mt-1">
                              {report.productCode}
                              {report.rowNumber ? ` | Satir #${report.rowNumber}` : ''}
                            </p>
                          </div>
                          {renderStatusBadge(report.status)}
                        </div>

                        {/* 4 bilgi kutusu: Siparis / Musteri / Bildiren / Bildirim Tarihi */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-[11.5px]">
                          <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fafc] px-3 py-2">
                            <p className="font-semibold text-[#9aa6b8] m-0">Siparis</p>
                            <p className="font-semibold text-[#14223b] mt-0.5">
                              {report.mikroOrderNumber} {report.orderSeries ? `(${report.orderSeries})` : ''}
                            </p>
                          </div>
                          <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fafc] px-3 py-2">
                            <p className="font-semibold text-[#9aa6b8] m-0">Musteri</p>
                            <p className="font-semibold text-[#14223b] mt-0.5">
                              {report.customerCode || '-'} | {report.customerName || '-'}
                            </p>
                          </div>
                          <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fafc] px-3 py-2">
                            <p className="font-semibold text-[#9aa6b8] m-0">Bildiren</p>
                            <p className="font-semibold text-[#14223b] mt-0.5">{report.reporterName || '-'}</p>
                          </div>
                          <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fafc] px-3 py-2">
                            <p className="font-semibold text-[#9aa6b8] m-0">Bildirim Tarihi</p>
                            <p className="font-semibold text-[#14223b] mt-0.5">{formatDateShort(report.createdAt)}</p>
                          </div>
                        </div>

                        {/* Notlar: Depo Notu / Inceleme Notu / Inceleyen */}
                        {(report.note || report.reviewNote || report.reviewedByName) && (
                          <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fafc] px-3 py-2 text-[11.5px] space-y-1 text-[#51607a]">
                            {report.note && (
                              <p className="m-0">
                                <span className="font-semibold text-[#14223b]">Depo Notu:</span> {report.note}
                              </p>
                            )}
                            {report.reviewNote && (
                              <p className="m-0">
                                <span className="font-semibold text-[#14223b]">Inceleme Notu:</span> {report.reviewNote}
                              </p>
                            )}
                            {report.reviewedByName && (
                              <p className="m-0">
                                <span className="font-semibold text-[#14223b]">Inceleyen:</span> {report.reviewedByName}
                                {report.reviewedAt ? ` (${formatDateShort(report.reviewedAt)})` : ''}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Aksiyonlar: gizli dosya input + Yeni Resim Yukle + 3 durum butonu */}
                        <div className="flex flex-wrap gap-2 pt-0.5">
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
                          <button
                            type="button"
                            onClick={() => openUploadPicker(report.id)}
                            disabled={!report.productId || uploadingReportId === report.id}
                            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1c4585] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Upload width={13} height={13} stroke="currentColor" strokeWidth={2} />
                            {uploadingReportId === report.id ? 'Resim Yukleniyor...' : 'Yeni Resim Yukle'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(report, 'OPEN')}
                            disabled={actionKey === `${report.id}:OPEN`}
                            className={
                              report.status === 'OPEN'
                                ? 'h-9 inline-flex items-center rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3.5 text-[12px] font-semibold text-[#b91c1c] hover:bg-[#fde2e2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                : 'h-9 inline-flex items-center rounded-lg border border-[#d8e0ec] bg-white px-3.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            }
                          >
                            Acik
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(report, 'REVIEWED')}
                            disabled={actionKey === `${report.id}:REVIEWED`}
                            className={
                              report.status === 'REVIEWED'
                                ? 'h-9 inline-flex items-center rounded-lg border border-[#15356b] bg-[#15356b] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1c4585] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                : 'h-9 inline-flex items-center rounded-lg border border-[#d8e0ec] bg-white px-3.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            }
                          >
                            Incelendi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(report, 'FIXED')}
                            disabled={actionKey === `${report.id}:FIXED`}
                            className={
                              report.status === 'FIXED'
                                ? 'h-9 inline-flex items-center rounded-lg border border-[#15356b] bg-[#15356b] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1c4585] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                : 'h-9 inline-flex items-center rounded-lg border border-[#d8e0ec] bg-white px-3.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            }
                          >
                            Duzeltildi
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Sayfalama */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11.5px] text-[#8b97ac] m-0">
                  Sayfa {pagination.page} / {pagination.totalPages} - Toplam {pagination.totalRecords} kayit
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="h-9 inline-flex items-center gap-1 rounded-lg border border-[#d8e0ec] bg-white px-3.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft width={14} height={14} stroke="currentColor" strokeWidth={2} />
                    Onceki
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                    className="h-9 inline-flex items-center gap-1 rounded-lg border border-[#d8e0ec] bg-white px-3.5 text-[12px] font-medium text-[#51607a] hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Sonraki
                    <ChevronRight width={14} height={14} stroke="currentColor" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gorsel onizleme modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-[#0b1424]/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/90 text-[#14223b] hover:bg-white transition-colors"
            >
              <X width={18} height={18} stroke="currentColor" strokeWidth={2.4} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-2xl border-2 border-white/40 object-contain bg-[#0b1424]/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
