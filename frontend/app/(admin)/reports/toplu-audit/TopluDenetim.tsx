'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  History,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import adminApi, { type TopluAuditResult, type TopluAuditRow } from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * TOPLU Denetim raporu (/reports/toplu-audit).
 * Ritmik (her ay tekrarlanan) TOPLU alimlari yakalar; grup bazinda TOPLU
 * isaretlerini kaldirarak satislarin tekrar min-max hesabina girmesini saglar.
 * Gorsel dil: yeni tema rapor sablonu (beyaz kart / #e7ebf2 border / 12px radius).
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

// Cari | Urun | Ay Kirilimi | Ay Sayisi | Toplam Miktar | Toplam Tutar | Son Tarih | Durum | Aksiyon
const GRID = '1.2fr 1.5fr 2fr 60px 90px 110px 90px 160px 130px';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
};

const headBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 36,
  padding: '0 14px',
  border: `1px solid ${LINE}`,
  borderRadius: 9,
  background: '#fff',
  color: INK,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
};

const primaryBtn: React.CSSProperties = {
  ...headBtn,
  background: PRIMARY,
  border: `1px solid ${PRIMARY}`,
  color: '#fff',
};

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: '1px solid #e3e8f0',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: FAINT,
  display: 'block',
  marginBottom: 4,
  fontWeight: 500,
};

const summaryCard: React.CSSProperties = { ...cardStyle, padding: 15 };
const cellRight: React.CSSProperties = { textAlign: 'right' };

const monthBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: 999,
  border: `1px solid ${LINE}`,
  fontSize: 10,
  fontWeight: 600,
  color: MUTED,
  background: '#fff',
  whiteSpace: 'nowrap',
};

const nf = new Intl.NumberFormat('tr-TR');
const formatQty = (value: number) => nf.format(Math.round((Number(value) || 0) * 100) / 100);

const clampInt = (value: number, min: number, max: number, fallback: number) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const groupKey = (row: TopluAuditRow) => `${row.cariCode}|${row.productCode}`;

// Unmark tarih araligi: backend'in dondugu gercek rapor penceresi (windowFrom/windowTo,
// Mikro sunucu saatiyle) DOGRUDAN kullanilir. Eski yanitlar icin fallback: rapor penceresi
// bugunden months ay geriye uzanabildiginden ilk ay 'months' ay geri gidilerek hesaplanir
// (months-1 ile aralik rapor penceresinden dar kaliyordu).
const rangeForReport = (result: TopluAuditResult): { from: string; to: string } => {
  if (result.windowFrom && result.windowTo) {
    return { from: result.windowFrom, to: result.windowTo };
  }
  const gen = result.generatedAt ? new Date(result.generatedAt) : new Date();
  const safeGen = Number.isNaN(gen.getTime()) ? new Date() : gen;
  const to = safeGen.toISOString().slice(0, 10);
  const from = new Date(Date.UTC(safeGen.getUTCFullYear(), safeGen.getUTCMonth() - result.months, 1))
    .toISOString()
    .slice(0, 10);
  return { from, to };
};

export default function TopluDenetim() {
  const [monthsInput, setMonthsInput] = useState(6);
  const [minRepeatInput, setMinRepeatInput] = useState(3);
  const [data, setData] = useState<TopluAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unmarkTarget, setUnmarkTarget] = useState<TopluAuditRow | null>(null);
  const [unmarkBusy, setUnmarkBusy] = useState(false);
  const [unmarkError, setUnmarkError] = useState<string | null>(null);
  // Cikarilan gruplar: key -> etkilenen satir sayisi
  const [unmarked, setUnmarked] = useState<Record<string, number>>({});

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getTopluAudit({
        months: clampInt(monthsInput, 1, 24, 6),
        minRepeatMonths: clampInt(minRepeatInput, 2, 12, 3),
      });
      setData(response.data);
      setUnmarked({});
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchTokens = useMemo(() => buildSearchTokens(search), [search]);

  const filteredRows = useMemo(() => {
    if (!data) return [] as TopluAuditRow[];
    if (searchTokens.length === 0) return data.rows;
    return data.rows.filter((row) => {
      const haystack = normalizeSearchText(
        `${row.cariCode} ${row.cariName} ${row.productCode} ${row.productName}`
      );
      return matchesSearchTokens(haystack, searchTokens);
    });
  }, [data, searchTokens]);

  const range = data ? rangeForReport(data) : null;

  const confirmUnmark = async () => {
    if (!unmarkTarget || !data || !range) return;
    setUnmarkBusy(true);
    setUnmarkError(null);
    try {
      const response = await adminApi.unmarkTopluGroup({
        cariCode: unmarkTarget.cariCode,
        productCode: unmarkTarget.productCode,
        fromDate: range.from,
        toDate: range.to,
      });
      setUnmarked((prev) => ({ ...prev, [groupKey(unmarkTarget)]: response.data.affected }));
      setUnmarkTarget(null);
    } catch (err: any) {
      setUnmarkError(err?.response?.data?.error || err?.message || 'Islem basarisiz');
    } finally {
      setUnmarkBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>TOPLU Denetim</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-.02em',
              margin: 0,
              color: INK,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <History size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            TOPLU Denetim
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Her ay tekrarlanan (ritmik) TOPLU alımları yakalayın; gerekirse grubu topludan çıkarın.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={headBtn}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>Filtreler</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          İncelenecek ay sayısını ve ritmik sayılacak minimum tekrar ayını seçin.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 160px auto',
            gap: 14,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Ay Sayısı (1-24)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={monthsInput}
              onChange={(event) => setMonthsInput(Number(event.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Min. Tekrar Ayı (2-12)</label>
            <input
              type="number"
              min={2}
              max={12}
              value={minRepeatInput}
              onChange={(event) => setMinRepeatInput(Number(event.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              style={{ ...primaryBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
              Raporu Getir
            </button>
          </div>
        </div>
      </div>

      {/* Error band */}
      {error && (
        <div
          style={{
            ...cardStyle,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            padding: '12px 16px',
            marginBottom: 18,
            color: RED,
            fontSize: 12.5,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} strokeWidth={2} />
          {error}
        </div>
      )}

      {/* Truncated warning */}
      {data?.truncated && (
        <div
          style={{
            ...cardStyle,
            border: '1px solid #fcd9a8',
            background: '#fffaf2',
            padding: '12px 16px',
            marginBottom: 18,
            color: AMBER,
            fontSize: 12.5,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} strokeWidth={2} />
          Sonuç kümesi kırpıldı: tüm gruplar gösterilemiyor. Filtreleri daraltarak tekrar deneyin.
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Grup</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {data ? nf.format(data.summary.totalGroups) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Ritmik Grup</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: AMBER, marginTop: 5 }}>
            {data ? nf.format(data.summary.rhythmicGroups) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Ritmik Tutar</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
            {data ? formatCurrency(data.summary.rhythmicTotalAmount) : '-'}
          </div>
        </div>
      </div>

      {/* List card */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>TOPLU Grupları</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `Son ${data.months} ay, min. ${data.minRepeatMonths} tekrar — ${nf.format(filteredRows.length)} grup listeleniyor.`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ position: 'relative', width: 280 }}>
            <Search
              size={15}
              strokeWidth={2}
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT }}
            />
            <input
              placeholder="Ara (cari, ürün)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ ...inputStyle, padding: '0 10px 0 34px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1220 }}>
            {/* Table head */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 10,
                padding: '11px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 600,
                color: FAINT,
                textTransform: 'uppercase',
                alignItems: 'center',
              }}
            >
              <span>Cari</span>
              <span>Ürün</span>
              <span>Ay Kırılımı</span>
              <span style={cellRight}>Ay</span>
              <span style={cellRight}>Miktar</span>
              <span style={cellRight}>Tutar</span>
              <span>Son Tarih</span>
              <span>Durum</span>
              <span style={cellRight}>Aksiyon</span>
            </div>

            {loading ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <RefreshCw
                  size={30}
                  strokeWidth={2}
                  className="animate-spin"
                  style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <History size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                <p style={{ color: MUTED, margin: 0 }}>Kayıt bulunamadı.</p>
              </div>
            ) : (
              filteredRows.map((row) => {
                const key = groupKey(row);
                const removedAffected = unmarked[key];
                const isRemoved = removedAffected !== undefined;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      gap: 10,
                      padding: '12px 16px',
                      borderTop: `1px solid ${ROW_LINE}`,
                      fontSize: 12,
                      color: INK,
                      alignItems: 'center',
                      background: isRemoved ? '#f0fdf4' : '#fff',
                    }}
                  >
                    {/* Cari */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: 'block' }}>{row.cariCode}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: FAINT,
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={row.cariName}
                      >
                        {row.cariName || '-'}
                      </span>
                    </span>

                    {/* Urun */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED, display: 'block' }}>
                        {row.productCode}
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={row.productName}
                      >
                        {row.productName || '-'}
                      </span>
                    </span>

                    {/* Ay kirilimi rozetleri */}
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.months.map((month) => (
                        <span key={month.month} style={monthBadge} title={formatCurrency(month.amount)}>
                          {month.month}: {formatQty(month.quantity)} ad
                        </span>
                      ))}
                    </span>

                    <span style={{ ...cellRight, fontWeight: 600 }}>{row.monthsCount}</span>
                    <span style={{ ...cellRight, fontWeight: 500 }}>{formatQty(row.totalQuantity)}</span>
                    <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                      {formatCurrency(row.totalAmount)}
                    </span>
                    <span style={{ color: MUTED }}>{row.lastSaleDate ? formatDateShort(row.lastSaleDate) : '-'}</span>

                    {/* Durum */}
                    <span>
                      {isRemoved ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 9px',
                            borderRadius: 999,
                            border: '1px solid #bbf7d0',
                            background: '#f0fdf4',
                            color: EMERALD,
                            fontSize: 10.5,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <CheckCircle2 size={12} strokeWidth={2} />
                          Çıkarıldı ({nf.format(removedAffected)} satır)
                        </span>
                      ) : row.isRhythmic ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 9px',
                            borderRadius: 999,
                            border: '1px solid #fcd9a8',
                            background: '#fffaf2',
                            color: AMBER,
                            fontSize: 10.5,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Topludan çıkar önerisi
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: FAINT }}>-</span>
                      )}
                    </span>

                    {/* Aksiyon */}
                    <span style={{ textAlign: 'right' }}>
                      {row.isRhythmic && !isRemoved && (
                        <button
                          type="button"
                          onClick={() => {
                            setUnmarkError(null);
                            setUnmarkTarget(row);
                          }}
                          style={{ ...headBtn, height: 30, padding: '0 10px', fontSize: 11.5, color: AMBER, borderColor: '#fcd9a8' }}
                        >
                          Topludan Çıkar
                        </button>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {unmarkTarget && range && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{ ...cardStyle, width: 'min(520px, 100%)', padding: 20, boxShadow: '0 18px 50px rgba(15,23,42,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={17} strokeWidth={2} style={{ color: AMBER }} />
                Topludan Çıkar
              </div>
              <button
                type="button"
                onClick={() => setUnmarkTarget(null)}
                disabled={unmarkBusy}
                style={{ ...headBtn, height: 28, padding: '0 8px' }}
                aria-label="Kapat"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              <div style={{ ...cardStyle, background: '#f8fafc', padding: 12, marginBottom: 12 }}>
                <div>
                  <span style={{ color: FAINT }}>Cari:</span>{' '}
                  <strong style={{ color: INK }}>
                    {unmarkTarget.cariCode} — {unmarkTarget.cariName || '-'}
                  </strong>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: FAINT }}>Ürün:</span>{' '}
                  <strong style={{ color: INK }}>
                    {unmarkTarget.productCode} — {unmarkTarget.productName || '-'}
                  </strong>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: FAINT }}>Tarih Aralığı:</span>{' '}
                  <strong style={{ color: INK }}>
                    {formatDateShort(range.from)} — {formatDateShort(range.to)}
                  </strong>
                </div>
              </div>
              <p style={{ margin: 0 }}>
                Bu grubun TOPLU işaretleri kaldırılacak, satışlar tekrar min-max hesabına girecek.
              </p>
            </div>

            {unmarkError && (
              <div
                style={{
                  marginTop: 12,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: RED,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {unmarkError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setUnmarkTarget(null)} disabled={unmarkBusy} style={headBtn}>
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmUnmark}
                disabled={unmarkBusy}
                style={{
                  ...primaryBtn,
                  background: AMBER,
                  border: '1px solid #b45309',
                  opacity: unmarkBusy ? 0.7 : 1,
                  cursor: unmarkBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {unmarkBusy && <RefreshCw size={14} strokeWidth={2} className="animate-spin" />}
                Onayla, Topludan Çıkar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
