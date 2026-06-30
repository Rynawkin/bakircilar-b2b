'use client';

import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { formatPercent, type ApplyPreviewData } from './useTedarikciFiyatKarsilastirma';

/**
 * Toplu maliyet uygulama ONIZLEME MODALI.
 * /reports/supplier-price-lists te eslesen urunlerin maliyetlerini TOPLU olarak
 * Mikro'ya uygulamadan ONCE oran/aykiri gosterir; son onayda backend Mikro'ya yazar.
 * Yazma mantigi Ucarer ile AYNI (updateUcarerProductCost). Bu modal SADECE goruntuler;
 * preview cagrisi Mikro YAZMAZ, sadece son "Mikro'ya Uygula" yazar.
 *
 * Stil: mevcut admin yeni tasarimi (beyaz kart #fff / primary #15356b / ink tonlari /
 * emerald-amber-red durum renkleri).
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';
const RED = '#b91c1c';

// Maliyet artis% renk esigi (artis -> dikkat; dusus -> uyari):
//   < 0 (maliyet dusuyor)  -> kirmizi-uyari
//   >= 25                  -> kirmizi (asiri artis)
//   >= 12                  -> amber
//   diger                  -> emerald
const pctColor = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return MUTED;
  if (pct < 0) return RED;
  if (pct >= 25) return RED;
  if (pct >= 12) return AMBER;
  return EMERALD;
};

const fmtPct = (pct: number | null | undefined): string =>
  pct === null || pct === undefined || !Number.isFinite(pct) ? '-' : formatPercent(pct);

const fmtMoney = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? formatCurrency(v) : '-';

interface Props {
  open: boolean;
  loading: boolean;
  data: ApplyPreviewData | null;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  applying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ApplyCostModal({
  open,
  loading,
  data,
  confirmed,
  setConfirmed,
  applying,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  const summary = data?.summary;
  const products = data?.products || [];
  // Aykiri satirlar uste alinsin (dikkat cekilecekler once)
  const sorted = [...products].sort((a, b) => {
    if (a.outlier === b.outlier) return 0;
    return a.outlier ? -1 : 1;
  });

  const confirmDisabled = !confirmed || applying || loading || !products.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          width: '100%',
          maxWidth: 1080,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px -20px rgba(15,23,42,0.45)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '16px 20px',
            borderBottom: `1px solid ${SOFT_LINE}`,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>
              Maliyetleri Mikro'ya Uygula
            </div>
            <div style={{ fontSize: 12.5, color: FAINT, marginTop: 4 }}>
              Asagidaki maliyet ve fiyat listesi degisikliklerini gozden gecirin. Onaylayana
              kadar Mikro'ya hicbir sey yazilmaz.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            style={{
              border: `1px solid ${LINE}`,
              background: '#fff',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: applying ? 'not-allowed' : 'pointer',
              color: MUTED,
              flex: 'none',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Ust ozet */}
        {summary && !loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              padding: '14px 20px',
              borderBottom: `1px solid ${SOFT_LINE}`,
              background: '#fafbfd',
            }}
          >
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 13px', background: '#fff' }}>
              <div style={{ fontSize: 11, color: FAINT }}>Urun Sayisi</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 3 }}>{summary.count}</div>
            </div>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 13px', background: '#fff' }}>
              <div style={{ fontSize: 11, color: FAINT }}>Ortalama Maliyet Artisi</div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  marginTop: 3,
                  color: pctColor(summary.avgCostIncreasePct),
                }}
              >
                {fmtPct(summary.avgCostIncreasePct)}
              </div>
            </div>
            <div
              style={{
                border: `1px solid ${summary.outlierCount > 0 ? '#f3d2a8' : LINE}`,
                borderRadius: 10,
                padding: '10px 13px',
                background: summary.outlierCount > 0 ? '#fff8ed' : '#fff',
              }}
            >
              <div style={{ fontSize: 11, color: FAINT }}>Aykiri Urun</div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  marginTop: 3,
                  color: summary.outlierCount > 0 ? AMBER : EMERALD,
                }}
              >
                {summary.outlierCount}
              </div>
            </div>
          </div>
        )}

        {/* Govde */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <RefreshCw
                size={28}
                strokeWidth={2}
                className="animate-spin"
                style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }}
              />
              <span style={{ fontSize: 12.5, color: FAINT }}>Onizleme hazirlaniyor...</span>
            </div>
          ) : !products.length ? (
            <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 12.5, color: FAINT }}>
              Uygulanacak urun bulunamadi.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
              {sorted.map((p) => (
                <div
                  key={p.productCode}
                  style={{
                    border: `1px solid ${p.outlier ? '#f0c9a0' : LINE}`,
                    borderRadius: 11,
                    background: p.outlier ? '#fff8ed' : '#fff',
                    overflow: 'hidden',
                  }}
                >
                  {/* Urun ust satir */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.8fr 1fr 1fr 0.9fr',
                      gap: 10,
                      alignItems: 'center',
                      padding: '11px 14px',
                      borderBottom: `1px solid ${p.outlier ? '#f3d9bd' : SOFT_LINE}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {p.outlier && (
                          <AlertTriangle
                            size={15}
                            strokeWidth={2.2}
                            style={{ color: AMBER, flex: 'none' }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: INK,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={p.name}
                        >
                          {p.name || p.productCode}
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: "'Roboto Mono', monospace",
                          fontSize: 11,
                          color: MUTED,
                          marginTop: 3,
                        }}
                      >
                        {p.productCode}
                      </div>
                      {p.outlier && p.outlierReason && (
                        <div style={{ fontSize: 11, color: AMBER, marginTop: 4, fontWeight: 500 }}>
                          {p.outlierReason}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        Eski Maliyet (T)
                      </div>
                      <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{fmtMoney(p.currentCostT)}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        Yeni Maliyet (T)
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 2 }}>
                        {fmtMoney(p.newCostT)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        Maliyet Artis%
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: pctColor(p.costIncreasePct), marginTop: 2 }}>
                        {fmtPct(p.costIncreasePct)}
                      </div>
                    </div>
                  </div>

                  {/* Fiyat listeleri (kompakt grid) */}
                  {p.priceLists?.length ? (
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 7, fontWeight: 600 }}>
                        FIYAT LISTELERI
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                          gap: 8,
                        }}
                      >
                        {p.priceLists.map((pl) => (
                          <div
                            key={`${p.productCode}-list-${pl.listNo}`}
                            style={{
                              border: `1px solid ${ROW_LINE}`,
                              borderRadius: 8,
                              padding: '7px 9px',
                              background: TABLE_HEAD_BG,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 6,
                              }}
                            >
                              <span style={{ fontSize: 10.5, color: FAINT, fontWeight: 600 }}>
                                Liste {pl.listNo}
                              </span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: pctColor(pl.increasePct) }}>
                                {fmtPct(pl.increasePct)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                marginTop: 4,
                                fontSize: 11.5,
                              }}
                            >
                              <span style={{ color: MUTED }}>{fmtMoney(pl.oldPrice)}</span>
                              <span style={{ color: FAINT }}>&rarr;</span>
                              <span style={{ fontWeight: 600, color: INK }}>{fmtMoney(pl.newPrice)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: son onay */}
        <div
          style={{
            borderTop: `1px solid ${SOFT_LINE}`,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            background: '#fafbfd',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontSize: 12.5,
              color: INK,
              cursor: loading || !products.length || applying ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: loading || !products.length ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              disabled={loading || !products.length || applying}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: PRIMARY, cursor: 'inherit' }}
            />
            Tum artislari gordum, onayliyorum
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              style={{
                height: 38,
                padding: '0 16px',
                border: `1px solid ${LINE}`,
                borderRadius: 9,
                background: '#fff',
                color: INK,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: applying ? 'not-allowed' : 'pointer',
              }}
            >
              Vazgec
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              style={{
                height: 38,
                padding: '0 18px',
                border: 'none',
                borderRadius: 9,
                background: PRIMARY,
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: confirmDisabled ? 0.5 : 1,
                cursor: confirmDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {applying && <RefreshCw size={15} strokeWidth={2} className="animate-spin" />}
              Mikro'ya Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
