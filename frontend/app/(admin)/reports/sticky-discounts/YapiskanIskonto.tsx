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
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Yapiskan Iskonto raporu (/reports/sticky-discounts) — prim erimesi surumu.
 * Listenin UZERINDE satilan ve son-satis kuraliyla musteriye gorunen fiyatlari izler;
 * liste zamlandikca prim erir. Gorsel dil: yeni tema rapor sablonu.
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

// ---- Yeni yanit sekli (sozlesme, prim erimesi) ----
interface StickyRow {
  cariKodu: string;
  cariAdi: string;
  stokKodu: string;
  stokAdi: string;
  listNo: number;
  sonFiyat: number;
  sonSatisTarihi: string;
  fiyatYasiGun: number;
  listeFiyatiSatisAninda: number;
  guncelListeFiyati: number;
  primSatisAnindaPct: number;
  primBugunPct: number;
  erimePct: number;
  son90GunAdet: number;
  aylikPrimTL: number;
  kritik: boolean;
}
interface StickyResultV2 {
  rows: StickyRow[];
  summary: {
    rowCount: number;
    customerCount: number;
    totalMonthlyPremiumTL: number;
    criticalCount: number;
    worstErosion: Array<{
      cariKodu: string;
      cariAdi: string;
      toplamAylikPrimTL: number;
      satirSayisi: number;
    }>;
    params: { lookbackDays: number; minPremiumNowPercent: number };
    generatedAt: string;
  };
}

// cari | urun | liste no | son fiyat+tarih+yas | satis-ani liste | guncel liste |
// prim(satis ani) | prim(bugun) | erime | 90g adet | aylik prim | kritik
const GRID = '1.3fr 1.6fr 60px 130px 110px 110px 90px 90px 80px 80px 110px 100px';
// En cok eriyen mini tablo: Cari | Satir | Aylik Prim
const WORST_GRID = '2fr 60px 120px';

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
  const [lookbackInput, setLookbackInput] = useState(365);
  const [minPremiumInput, setMinPremiumInput] = useState(0);
  const [data, setData] = useState<StickyResultV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cariFilter, setCariFilter] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getStickyDiscounts({
        lookbackDays: Number.isFinite(Number(lookbackInput)) ? Math.max(1, Math.trunc(Number(lookbackInput))) : 365,
        minPremiumNowPercent: Number.isFinite(Number(minPremiumInput)) ? Math.max(0, Number(minPremiumInput)) : 0,
      } as any);
      setData(response.data as unknown as StickyResultV2);
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
    if (!data) return [] as StickyRow[];
    let rows = data.rows;
    if (cariFilter) rows = rows.filter((row) => row.cariKodu === cariFilter);
    if (searchTokens.length > 0) {
      rows = rows.filter((row) => {
        const haystack = normalizeSearchText(`${row.cariKodu} ${row.cariAdi} ${row.stokKodu} ${row.stokAdi}`);
        return matchesSearchTokens(haystack, searchTokens);
      });
    }
    // Aylik prim TL azalan
    return [...rows].sort((a, b) => (b.aylikPrimTL || 0) - (a.aylikPrimTL || 0));
  }, [data, cariFilter, searchTokens]);

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
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
            Yapışkan İskonto — Prim Erimesi
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Listenin üzerinde satılan ve son-satış kuralıyla müşteriye görünen fiyatlarda eriyen primi izleyin.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={headBtn}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
        </div>
      </div>

      {/* Bilgi notu — 2 satir aciklama */}
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
          lineHeight: 1.55,
        }}
      >
        <Info size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Bu rapor, listenin <strong>üzerinde</strong> satılan ve son-satış kuralıyla müşteriye görünen fiyatları izler.
          <br />
          Liste zamlandıkça bu primler erir; prim %10 ve altına düşen satırlar “erimek üzere” olarak işaretlenir.
        </span>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>Filtreler</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Geriye bakış süresini ve bugünkü minimum prim yüzdesini seçin.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 200px auto', gap: 14, alignItems: 'end' }}>
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
            <label style={labelStyle}>Min. Prim (bugün, %)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={minPremiumInput}
              onChange={(event) => setMinPremiumInput(Number(event.target.value))}
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

      {/* Summary cards + En cok eriyen 10 cari */}
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
            <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Aylık Prim</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
              {data ? formatCurrency(data.summary.totalMonthlyPremiumTL) : '-'}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Kritik Satır</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: RED, marginTop: 5 }}>
              {data ? nf.format(data.summary.criticalCount) : '-'}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Satır / Cari</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {data ? `${nf.format(data.summary.rowCount)} / ${nf.format(data.summary.customerCount)}` : '-'}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>En Çok Eriyen 10 Cari</div>
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
            <span style={cellRight}>Aylık Prim</span>
          </div>
          {!data || data.summary.worstErosion.length === 0 ? (
            <div style={{ padding: '14px', fontSize: 11.5, color: FAINT }}>Kayıt yok.</div>
          ) : (
            data.summary.worstErosion.map((customer) => (
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
                <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                  {formatCurrency(customer.toplamAylikPrimTL)}
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
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Prim Satırları</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `Son ${nf.format(data.summary.params.lookbackDays)} gün, min. bugün prim %${nf.format(data.summary.params.minPremiumNowPercent)} — ${nf.format(filteredRows.length)} satır (aylık prim azalan).`
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
          <div style={{ minWidth: 1360 }}>
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
              <span style={cellRight}>Liste No</span>
              <span>Son Fiyat</span>
              <span style={cellRight}>Satış Anı Liste</span>
              <span style={cellRight}>Güncel Liste</span>
              <span style={cellRight}>Prim (Satış Anı)</span>
              <span style={cellRight}>Prim (Bugün)</span>
              <span style={cellRight}>Erime</span>
              <span style={cellRight}>90g Adet</span>
              <span style={cellRight}>Aylık Prim</span>
              <span>Durum</span>
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
                    background: row.kritik ? '#fef2f2' : '#fff',
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

                  <span style={{ ...cellRight, color: MUTED }}>{row.listNo}</span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 600 }}>{formatCurrency(row.sonFiyat)}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: FAINT }}>
                      {row.sonSatisTarihi ? formatDateShort(row.sonSatisTarihi) : '-'} · {nf.format(row.fiyatYasiGun)} gün
                    </span>
                  </span>
                  <span style={cellRight}>{formatCurrency(row.listeFiyatiSatisAninda)}</span>
                  <span style={cellRight}>{formatCurrency(row.guncelListeFiyati)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: EMERALD }}>
                    %{nfPercent.format(row.primSatisAnindaPct)}
                  </span>
                  <span
                    style={{
                      ...cellRight,
                      fontWeight: 600,
                      color: row.primBugunPct <= 10 ? RED : row.primBugunPct < 20 ? AMBER : EMERALD,
                    }}
                  >
                    %{nfPercent.format(row.primBugunPct)}
                  </span>
                  <span style={{ ...cellRight, color: AMBER, fontWeight: 600 }}>
                    {nfPercent.format(row.erimePct)} p
                  </span>
                  <span style={cellRight}>{formatQty(row.son90GunAdet)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: EMERALD }}>{formatCurrency(row.aylikPrimTL)}</span>
                  <span>
                    {row.kritik ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '2px 9px',
                          borderRadius: 999,
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          color: RED,
                          fontSize: 10.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <AlertTriangle size={11} strokeWidth={2} />
                        Erimek üzere
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: FAINT }}>-</span>
                    )}
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
