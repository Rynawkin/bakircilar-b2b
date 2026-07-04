'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Info,
  RefreshCw,
  Search,
  TrendingDown,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Indirimli Fiyati Giris Maliyeti Altinda raporu (/reports/discount-below-entry-cost)
 * Indirimli (OZEL faturali, KDV haric) fiyati son giris maliyetinin ALTINDA kalan,
 * indirimli havuzdaki (excessStock > 0) urunleri listeler. Amac: guncel maliyeti
 * hatali/eski kalmis urunleri periyodik yakalayip duzeltmek. Salt-okunur.
 * Gorsel dil: yeni tema rapor sablonu.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const AMBER = '#b45309';
const RED = '#b91c1c';

interface ReportItem {
  mikroCode: string;
  name: string;
  discountedInvoiced: number;
  lastEntryPrice: number;
  currentCost: number | null;
  calculatedCost: number | null;
  excessStock: number;
  vatRate: number;
  gap: number;
  lossPct: number;
}

interface ReportData {
  items: ReportItem[];
  totalCount: number;
  totalRiskTL: number;
}

// Kod | Urun | Indirimli (fat.) | Giris Maliyeti | Guncel Maliyet | Blend | Fazla Stok | KDV | Fark | Kayip %
const GRID = '120px 1.8fr 120px 120px 120px 110px 90px 60px 120px 90px';

const nf = new Intl.NumberFormat('tr-TR');
const nfPercent = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

const summaryCard: React.CSSProperties = { ...cardStyle, padding: 15 };
const cellRight: React.CSSProperties = { textAlign: 'right' };

const formatVat = (rate: number) => `%${nf.format(Math.round((Number(rate) || 0) * 100))}`;

export default function IndirimAltiMaliyet() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDiscountBelowEntryCost();
      setData(response.data as ReportData);
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

  const filteredItems = useMemo(() => {
    if (!data) return [] as ReportItem[];
    if (searchTokens.length === 0) return data.items;
    return data.items.filter((item) => {
      const haystack = normalizeSearchText(`${item.mikroCode} ${item.name}`);
      return matchesSearchTokens(haystack, searchTokens);
    });
  }, [data, searchTokens]);

  const exportCsv = () => {
    if (!data) return;
    const header = [
      'Stok Kodu',
      'Urun',
      'Indirimli Fiyat (faturali, KDV haric)',
      'Giris Maliyeti',
      'Guncel Maliyet',
      'Hesaplanan Maliyet (blend)',
      'Fazla Stok',
      'KDV',
      'Fark (TL)',
      'Kayip %',
    ];
    const escape = (value: string | number | null) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = filteredItems.map((item) =>
      [
        item.mikroCode,
        item.name,
        item.discountedInvoiced,
        item.lastEntryPrice,
        item.currentCost ?? '',
        item.calculatedCost ?? '',
        item.excessStock,
        item.vatRate,
        item.gap,
        item.lossPct.toFixed(1),
      ]
        .map(escape)
        .join(';')
    );
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `indirim-alti-maliyet-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>İndirimli Fiyatı Giriş Maliyeti Altında</span>
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
            <TrendingDown size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            İndirimli Fiyatı Giriş Maliyeti Altında
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            İndirimli (faturalı, KDV hariç) satış fiyatı son giriş maliyetinin altına düşen ürünler.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || filteredItems.length === 0}
            style={{
              ...headBtn,
              opacity: !data || filteredItems.length === 0 ? 0.5 : 1,
              cursor: !data || filteredItems.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={15} strokeWidth={2} />
            CSV
          </button>
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
            Yenile
          </button>
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
          border: '1px solid #fde3c7',
          background: '#fffaf3',
          padding: '12px 16px',
          marginBottom: 18,
          color: AMBER,
          fontSize: 12.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          lineHeight: 1.55,
        }}
      >
        <Info size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Bu ürünlerde indirimli satış fiyatı, son giriş maliyetinin <strong>altında</strong> kalıyor. Çoğu zaman sebep{' '}
          <strong>hatalı/eski güncel maliyet</strong>tir. Listeyi periyodik gözden geçirip ilgili ürünlerin güncel
          maliyetini düzeltin. Rapor yalnızca gösterim amaçlıdır, hiçbir değişiklik yazmaz.
        </span>
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

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Riskli Ürün Sayısı</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 5 }}>
            {data ? nf.format(data.totalCount) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Risk (Fark × Fazla Stok)</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: RED, marginTop: 5 }}>
            {data ? formatCurrency(data.totalRiskTL) : '-'}
          </div>
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
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Riskli Ürünler</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `${nf.format(filteredItems.length)} ürün — farka göre azalan sıralı.`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ position: 'relative', width: 260 }}>
            <Search
              size={15}
              strokeWidth={2}
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT }}
            />
            <input
              placeholder="Ara (stok kodu, ürün adı)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ ...inputStyle, padding: '0 10px 0 34px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1180 }}>
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
              <span>Stok Kodu</span>
              <span>Ürün</span>
              <span style={cellRight}>İndirimli (Fat.)</span>
              <span style={cellRight}>Giriş Maliyeti</span>
              <span style={cellRight}>Güncel Maliyet</span>
              <span style={cellRight}>Blend</span>
              <span style={cellRight}>Fazla Stok</span>
              <span style={cellRight}>KDV</span>
              <span style={cellRight}>Fark</span>
              <span style={cellRight}>Kayıp %</span>
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
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <TrendingDown size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                <p style={{ color: MUTED, margin: 0 }}>
                  {data ? 'Riskli ürün bulunamadı. İndirimli fiyatı giriş maliyetinin altında ürün yok.' : 'Kayıt yok.'}
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.mikroCode}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    gap: 10,
                    padding: '12px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                    {item.mikroCode}
                  </span>
                  <span
                    style={{
                      fontWeight: 500,
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={item.name}
                  >
                    {item.name || '-'}
                  </span>
                  <span style={{ ...cellRight, fontWeight: 600, color: RED }}>
                    {formatCurrency(item.discountedInvoiced)}
                  </span>
                  <span style={{ ...cellRight, fontWeight: 600 }}>{formatCurrency(item.lastEntryPrice)}</span>
                  <span style={{ ...cellRight, color: MUTED }}>
                    {item.currentCost !== null ? formatCurrency(item.currentCost) : '-'}
                  </span>
                  <span style={{ ...cellRight, color: MUTED }}>
                    {item.calculatedCost !== null ? formatCurrency(item.calculatedCost) : '-'}
                  </span>
                  <span style={cellRight}>{nf.format(item.excessStock)}</span>
                  <span style={{ ...cellRight, color: FAINT }}>{formatVat(item.vatRate)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: RED }}>{formatCurrency(item.gap)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: AMBER }}>
                    %{nfPercent.format(item.lossPct)}
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
