'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronRight,
  Info,
  Percent,
  RefreshCw,
  Search,
} from 'lucide-react';
import adminApi, { type StickyDiscountsResult, type StickyDiscountRow } from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Yapiskan Iskonto raporu (/reports/sticky-discounts).
 * Son-satis-fiyati mekanizmasinin kalicilastirdigi (liste fiyatinin altinda
 * donmus) iskontolari ve aylik kaybi gosterir.
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

// Cari | Urun | Son Fiyat | Son Satis | Liste No | Liste Fiyati | Fark % | 90g Adet | Aylik Kayip
const GRID = '1.4fr 1.8fr 100px 120px 70px 100px 80px 90px 110px';
// En kotu cariler mini tablosu: Cari | Satir | Aylik Kayip
const WORST_GRID = '2fr 70px 120px';

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

const nf = new Intl.NumberFormat('tr-TR');
const nfPercent = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatQty = (value: number) => nf.format(Math.round((Number(value) || 0) * 100) / 100);

export default function YapiskanIskonto() {
  const [minGapInput, setMinGapInput] = useState(5);
  const [lookbackInput, setLookbackInput] = useState(365);
  const [data, setData] = useState<StickyDiscountsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cariFilter, setCariFilter] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getStickyDiscounts({
        minGapPercent: Number.isFinite(Number(minGapInput)) ? Math.max(0, Number(minGapInput)) : 5,
        lookbackDays: Number.isFinite(Number(lookbackInput)) ? Math.max(1, Math.trunc(Number(lookbackInput))) : 365,
      });
      setData(response.data);
      setCariFilter('');
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

  // Cari filtre secenekleri (rapor icindeki benzersiz cariler)
  const cariOptions = useMemo(() => {
    if (!data) return [] as Array<{ code: string; name: string }>;
    const map = new Map<string, string>();
    for (const row of data.rows) {
      if (!map.has(row.cariKodu)) map.set(row.cariKodu, row.cariAdi || row.cariKodu);
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [] as StickyDiscountRow[];
    let rows = data.rows;
    if (cariFilter) rows = rows.filter((row) => row.cariKodu === cariFilter);
    if (searchTokens.length > 0) {
      rows = rows.filter((row) => {
        const haystack = normalizeSearchText(`${row.cariKodu} ${row.cariAdi} ${row.stokKodu} ${row.stokAdi}`);
        return matchesSearchTokens(haystack, searchTokens);
      });
    }
    // Aylik kayip TL azalan sirali (backend zaten sirali; filtre sonrasi garanti)
    return [...rows].sort((a, b) => (b.aylikKayipTL || 0) - (a.aylikKayipTL || 0));
  }, [data, cariFilter, searchTokens]);

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Yapışkan İskonto</span>
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
            <Percent size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            Yapışkan İskonto
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Liste fiyatının altında donmuş son-satış fiyatlarını ve aylık kaybı izleyin.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={headBtn}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
        </div>
      </div>

      {/* Bilgi notu */}
      <div
        style={{
          ...cardStyle,
          border: '1px solid #c7d7f2',
          background: '#f4f8ff',
          padding: '12px 16px',
          marginBottom: 18,
          color: PRIMARY,
          fontSize: 12.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <Info size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Bu rapor, son-satış-fiyatı mekanizmasının kalıcılaştırdığı iskontoları gösterir.{' '}
          <strong>Ayarlar &gt; Son satış fiyatını liste değişimine endeksle</strong> açıldığında bu erime otomatik
          durur.
        </span>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>Filtreler</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Liste fiyatına göre minimum fark yüzdesini ve geriye bakış süresini seçin.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 180px auto', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Min. Fark (%)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={minGapInput}
              onChange={(event) => setMinGapInput(Number(event.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Geriye Bakış (gün)</label>
            <input
              type="number"
              min={1}
              step={30}
              value={lookbackInput}
              onChange={(event) => setLookbackInput(Number(event.target.value))}
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

      {/* Summary cards + En kotu 10 cari */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: 14,
          marginBottom: 18,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Satır Sayısı</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {data ? nf.format(data.summary.rowCount) : '-'}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Etkilenen Cari</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {data ? nf.format(data.summary.customerCount) : '-'}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Aylık Kayıp</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: RED, marginTop: 5 }}>
              {data ? formatCurrency(data.summary.totalMonthlyLossTL) : '-'}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>En Kötü 10 Cari</div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: WORST_GRID,
              gap: 10,
              padding: '8px 14px',
              background: TABLE_HEAD_BG,
              borderBottom: `1px solid ${SOFT_LINE}`,
              fontSize: 9.5,
              fontWeight: 600,
              color: FAINT,
              textTransform: 'uppercase',
            }}
          >
            <span>Cari</span>
            <span style={cellRight}>Satır</span>
            <span style={cellRight}>Aylık Kayıp</span>
          </div>
          {!data || data.summary.worstCustomers.length === 0 ? (
            <div style={{ padding: '14px', fontSize: 11.5, color: FAINT }}>Kayıt yok.</div>
          ) : (
            data.summary.worstCustomers.map((customer) => (
              <button
                key={customer.cariKodu}
                type="button"
                onClick={() => setCariFilter((prev) => (prev === customer.cariKodu ? '' : customer.cariKodu))}
                style={{
                  display: 'grid',
                  gridTemplateColumns: WORST_GRID,
                  gap: 10,
                  padding: '7px 14px',
                  fontSize: 11.5,
                  color: INK,
                  alignItems: 'center',
                  background: cariFilter === customer.cariKodu ? '#f4f8ff' : '#fff',
                  border: 'none',
                  boxShadow: `inset 0 1px 0 ${ROW_LINE}`,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                title="Ana tabloda bu cariyi filtrele"
              >
                <span
                  style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}
                >
                  {customer.cariAdi || customer.cariKodu}
                </span>
                <span style={cellRight}>{nf.format(customer.satirSayisi)}</span>
                <span style={{ ...cellRight, color: RED, fontWeight: 600 }}>
                  {formatCurrency(customer.aylikKayipTL)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main table */}
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
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>İskonto Satırları</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `Min. %${nf.format(data.summary.params.minGapPercent)} fark, son ${nf.format(data.summary.params.lookbackDays)} gün — ${nf.format(filteredRows.length)} satır (aylık kayıp azalan).`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={cariFilter}
              onChange={(event) => setCariFilter(event.target.value)}
              style={{ ...inputStyle, width: 240, cursor: 'pointer' }}
            >
              <option value="">Tüm cariler</option>
              {cariOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            <div style={{ position: 'relative', width: 240 }}>
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
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1200 }}>
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
              <span style={cellRight}>Son Fiyat</span>
              <span>Son Satış</span>
              <span style={cellRight}>Liste No</span>
              <span style={cellRight}>Liste Fiyatı</span>
              <span style={cellRight}>Fark %</span>
              <span style={cellRight}>90g Adet</span>
              <span style={cellRight}>Aylık Kayıp</span>
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
                <Percent size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                <p style={{ color: MUTED, margin: 0 }}>Kayıt bulunamadı.</p>
              </div>
            ) : (
              filteredRows.map((row) => (
                <div
                  key={`${row.cariKodu}|${row.stokKodu}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    gap: 10,
                    padding: '12px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                    background: '#fff',
                  }}
                >
                  {/* Cari */}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'block' }}>{row.cariKodu}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: FAINT,
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.cariAdi}
                    >
                      {row.cariAdi || '-'}
                    </span>
                  </span>

                  {/* Urun */}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED, display: 'block' }}>
                      {row.stokKodu}
                    </span>
                    <span
                      style={{
                        fontWeight: 500,
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.stokAdi}
                    >
                      {row.stokAdi || '-'}
                    </span>
                  </span>

                  <span style={{ ...cellRight, fontWeight: 600 }}>{formatCurrency(row.sonFiyat)}</span>
                  <span>
                    <span style={{ display: 'block', color: MUTED }}>
                      {row.sonSatisTarihi ? formatDateShort(row.sonSatisTarihi) : '-'}
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: FAINT }}>
                      {nf.format(row.fiyatYasiGun)} gün önce
                    </span>
                  </span>
                  <span style={{ ...cellRight, color: MUTED }}>{row.listeNo}</span>
                  <span style={cellRight}>{formatCurrency(row.listeFiyati)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: row.gapPercent >= 15 ? RED : AMBER }}>
                    %{nfPercent.format(row.gapPercent)}
                  </span>
                  <span style={cellRight}>{formatQty(row.son90GunAdet)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: RED }}>
                    {formatCurrency(row.aylikKayipTL)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
