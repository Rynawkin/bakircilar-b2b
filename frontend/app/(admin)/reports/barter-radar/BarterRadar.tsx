'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  HandCoins,
  Info,
  RefreshCw,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

/**
 * Borc-Mal Takasi Radari (/reports/barter-radar).
 * Iki yon:
 *  - Musteriler (bize borclu): vadesi gecmis carinin bize satabilecegi ihtiyac urunleri.
 *  - Tedarikciler (biz borcluyuz): borclu oldugumuz tedarikcinin bizden aldigi urunler.
 * SALT RAPOR — mahsup/vergi kurgusu muhasebeyle yapilir.
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

// ---- Yeni yanit sekli (sozlesme) ----
interface BarterDepotNeed {
  min: number;
  stock: number;
  need: number;
}
interface BarterCustomerProduct {
  productCode: string;
  productName: string;
  isMainSupplier: boolean;
  hasPastOrders: boolean;
  merkez: BarterDepotNeed;
  topca: BarterDepotNeed;
  needQuantity: number;
  unitCost: number;
  amount: number;
}
interface BarterCustomerRow {
  cariCode: string;
  cariName: string;
  pastDueBalance: number;
  totalBalance: number;
  pastDueDate: string | null;
  products: BarterCustomerProduct[];
  productCount: number;
  barterPotential: number;
  cappedPotential: number;
}
interface BarterSupplierProduct {
  productCode: string;
  productName: string;
  last12moQty: number;
  last12moAmount: number;
}
interface BarterSupplierRow {
  cariCode: string;
  cariName: string;
  payableBalance: number;
  pastDuePayable: number;
  lastPurchaseDate: string | null;
  ourProductsTheyBuy: BarterSupplierProduct[];
  offsetPotential: number;
}
interface BarterRadarResultV2 {
  minPastDue: number;
  minPayable: number;
  customers: BarterCustomerRow[];
  suppliers: BarterSupplierRow[];
  summary: {
    customerCount: number;
    supplierCount: number;
    totalReceivablePotential: number;
    totalPayablePotential: number;
  };
  generatedAt: string;
}

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

const badgeStyle = (color: string, border: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 8px',
  borderRadius: 999,
  border: `1px solid ${border}`,
  fontSize: 10,
  fontWeight: 600,
  color,
  background: bg,
  whiteSpace: 'nowrap',
});

const nf = new Intl.NumberFormat('tr-TR');
const formatQty = (value: number) => nf.format(Math.round((Number(value) || 0) * 100) / 100);

// Musteri urun alt-tablosu grid
const CUST_HEAD_GRID = '2fr 1.1fr 70px 1.1fr 1.1fr 110px';
const CUST_ITEM_GRID = '2fr 1.2fr 1.2fr 1.2fr 80px 1fr 1.1fr';
// Tedarikci grid
const SUP_HEAD_GRID = '2fr 1.1fr 1.1fr 1.1fr 90px 110px';
const SUP_ITEM_GRID = '2.4fr 1fr 1.2fr';

type BarterTab = 'CUSTOMERS' | 'SUPPLIERS';

export default function BarterRadar() {
  const [minPastDueInput, setMinPastDueInput] = useState(50000);
  const [minPayableInput, setMinPayableInput] = useState(50000);
  const [data, setData] = useState<BarterRadarResultV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BarterTab>('CUSTOMERS');
  const [expandedCust, setExpandedCust] = useState<Set<string>>(new Set());
  const [expandedSup, setExpandedSup] = useState<Set<string>>(new Set());

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const minPastDue = Number.isFinite(Number(minPastDueInput)) ? Math.max(0, Number(minPastDueInput)) : 50000;
      const minPayable = Number.isFinite(Number(minPayableInput)) ? Math.max(0, Number(minPayableInput)) : 50000;
      const response = await adminApi.getBarterRadar({ minPastDue, minPayable } as any);
      setData(response.data as unknown as BarterRadarResultV2);
      setExpandedCust(new Set());
      setExpandedSup(new Set());
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

  const customers = useMemo(() => data?.customers ?? [], [data]);
  const suppliers = useMemo(() => data?.suppliers ?? [], [data]);

  const toggleCust = (cariCode: string) => {
    setExpandedCust((prev) => {
      const next = new Set(prev);
      if (next.has(cariCode)) next.delete(cariCode);
      else next.add(cariCode);
      return next;
    });
  };
  const toggleSup = (cariCode: string) => {
    setExpandedSup((prev) => {
      const next = new Set(prev);
      if (next.has(cariCode)) next.delete(cariCode);
      else next.add(cariCode);
      return next;
    });
  };

  const renderDepotCell = (depot: BarterDepotNeed) => (
    <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
      <span style={{ display: 'block' }}>
        Min <strong style={{ color: INK }}>{formatQty(depot.min)}</strong> / Stok{' '}
        <strong style={{ color: INK }}>{formatQty(depot.stock)}</strong>
      </span>
      <span style={{ display: 'block' }}>
        İhtiyaç <strong style={{ color: depot.need > 0 ? AMBER : FAINT }}>{formatQty(depot.need)}</strong>
      </span>
    </span>
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Borç-Mal Takası</span>
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
            <HandCoins size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            Borç-Mal Takası Radarı
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Vadesi geçmiş carilerle (bize borçlu) ve borçlu olduğumuz tedarikçilerle mahsup fırsatlarını eşleştirir.
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
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Info size={16} strokeWidth={2} />
        Salt rapor — mahsup/vergi kurgusu muhasebeyle yapılmalı.
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>Filtreler</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Müşteri tarafı için minimum vadesi geçmiş bakiye, tedarikçi tarafı için minimum borcumuz taranır.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 220px auto', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Min. Vadesi Geçmiş (TL)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={minPastDueInput}
              onChange={(event) => setMinPastDueInput(Number(event.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Min. Borcumuz (TL)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={minPayableInput}
              onChange={(event) => setMinPayableInput(Number(event.target.value))}
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

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Müşteri (bize borçlu)</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {data ? nf.format(data.summary.customerCount) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Alacak Takas Potansiyeli</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
            {data ? formatCurrency(data.summary.totalReceivablePotential) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Tedarikçi (biz borçluyuz)</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {data ? nf.format(data.summary.supplierCount) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Borç Takas Potansiyeli</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: RED, marginTop: 5 }}>
            {data ? formatCurrency(data.summary.totalPayablePotential) : '-'}
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${LINE}` }}>
        {([
          ['CUSTOMERS', `Müşteriler (bize borçlu)${data ? ` · ${nf.format(customers.length)}` : ''}`],
          ['SUPPLIERS', `Tedarikçiler (biz borçluyuz)${data ? ` · ${nf.format(suppliers.length)}` : ''}`],
        ] as Array<[BarterTab, string]>).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: active ? PRIMARY : MUTED,
                borderBottom: active ? `2px solid ${PRIMARY}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: '48px 16px', textAlign: 'center' }}>
          <RefreshCw
            size={30}
            strokeWidth={2}
            className="animate-spin"
            style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }}
          />
          <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
        </div>
      ) : tab === 'CUSTOMERS' ? (
        /* ---- Musteriler (bize borclu) ---- */
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Cari Bazlı Eşleşmeler</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `Min. ${formatCurrency(data.minPastDue)} vadesi geçmiş — ${nf.format(customers.length)} cari.`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 960 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: CUST_HEAD_GRID,
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
                <span style={cellRight}>Vadesi Geçmiş</span>
                <span style={cellRight}>Ürün</span>
                <span style={cellRight}>Potansiyel</span>
                <span style={cellRight}>Sınırlı Potansiyel</span>
                <span />
              </div>

              {customers.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <HandCoins size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Eşleşme bulunamadı.</p>
                </div>
              ) : (
                customers.map((row) => {
                  const isExpanded = expandedCust.has(row.cariCode);
                  return (
                    <div key={row.cariCode}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: CUST_HEAD_GRID,
                          gap: 10,
                          padding: '12px 16px',
                          borderTop: `1px solid ${ROW_LINE}`,
                          fontSize: 12,
                          color: INK,
                          alignItems: 'center',
                          background: isExpanded ? '#f9fafc' : '#fff',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleCust(row.cariCode)}
                      >
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
                            {row.pastDueDate ? ` — en eski vade: ${formatDateShort(row.pastDueDate)}` : ''}
                          </span>
                        </span>
                        <span style={{ ...cellRight, color: RED, fontWeight: 600 }}>
                          {formatCurrency(row.pastDueBalance)}
                        </span>
                        <span style={{ ...cellRight, fontWeight: 500 }}>{nf.format(row.productCount)}</span>
                        <span style={{ ...cellRight, fontWeight: 500 }}>{formatCurrency(row.barterPotential)}</span>
                        <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                          {formatCurrency(row.cappedPotential)}
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCust(row.cariCode);
                            }}
                            style={{ ...headBtn, height: 30, padding: '0 10px', fontSize: 11.5 }}
                          >
                            {isExpanded ? (
                              <>
                                Gizle
                                <ChevronUp size={14} strokeWidth={2} />
                              </>
                            ) : (
                              <>
                                Ürünler
                                <ChevronDown size={14} strokeWidth={2} />
                              </>
                            )}
                          </button>
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${ROW_LINE}`, background: '#f7f9fc', padding: '12px 16px' }}>
                          <div style={{ ...cardStyle, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                              <div style={{ minWidth: 900 }}>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: CUST_ITEM_GRID,
                                    gap: 10,
                                    padding: '9px 14px',
                                    background: TABLE_HEAD_BG,
                                    borderBottom: `1px solid ${SOFT_LINE}`,
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    color: FAINT,
                                    textTransform: 'uppercase',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span>Ürün</span>
                                  <span>Rozetler</span>
                                  <span>Merkez</span>
                                  <span>Topça</span>
                                  <span style={cellRight}>İhtiyaç</span>
                                  <span style={cellRight}>Birim Maliyet</span>
                                  <span style={cellRight}>Tutar</span>
                                </div>
                                {row.products.map((product) => (
                                  <div
                                    key={product.productCode}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: CUST_ITEM_GRID,
                                      gap: 10,
                                      padding: '10px 14px',
                                      borderTop: `1px solid ${ROW_LINE}`,
                                      fontSize: 11.5,
                                      color: INK,
                                      alignItems: 'center',
                                      background: '#fff',
                                    }}
                                  >
                                    <span style={{ minWidth: 0 }}>
                                      <span
                                        style={{
                                          fontFamily: "'Roboto Mono', monospace",
                                          fontSize: 11,
                                          color: MUTED,
                                          display: 'block',
                                        }}
                                      >
                                        {product.productCode}
                                      </span>
                                      <span
                                        style={{
                                          fontWeight: 500,
                                          display: 'block',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}
                                        title={product.productName}
                                      >
                                        {product.productName || '-'}
                                      </span>
                                    </span>
                                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {product.isMainSupplier && (
                                        <span style={badgeStyle(PRIMARY, '#c7d7f2', '#f4f8ff')}>Ana Tedarikçi</span>
                                      )}
                                      {product.hasPastOrders && (
                                        <span style={badgeStyle(EMERALD, '#bbf7d0', '#f0fdf4')}>Geçmiş Sipariş</span>
                                      )}
                                      {!product.isMainSupplier && !product.hasPastOrders && (
                                        <span style={{ fontSize: 11, color: FAINT }}>-</span>
                                      )}
                                    </span>
                                    <span>{renderDepotCell(product.merkez)}</span>
                                    <span>{renderDepotCell(product.topca)}</span>
                                    <span style={{ ...cellRight, fontWeight: 600, color: AMBER }}>
                                      {formatQty(product.needQuantity)}
                                    </span>
                                    <span style={cellRight}>{formatCurrency(product.unitCost)}</span>
                                    <span style={{ ...cellRight, fontWeight: 600, color: EMERALD }}>
                                      {formatCurrency(product.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ---- Tedarikciler (biz borcluyuz) ---- */
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Tedarikçi Bazlı Eşleşmeler</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `Min. ${formatCurrency(data.minPayable)} borcumuz — ${nf.format(suppliers.length)} tedarikçi.`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 900 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: SUP_HEAD_GRID,
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
                <span>Tedarikçi</span>
                <span style={cellRight}>Borcumuz</span>
                <span style={cellRight}>Vadesi Geçmiş Borç</span>
                <span style={cellRight}>Takas Potansiyeli</span>
                <span style={cellRight}>Ürün</span>
                <span />
              </div>

              {suppliers.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <HandCoins size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Eşleşme bulunamadı.</p>
                </div>
              ) : (
                suppliers.map((row) => {
                  const isExpanded = expandedSup.has(row.cariCode);
                  return (
                    <div key={row.cariCode}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: SUP_HEAD_GRID,
                          gap: 10,
                          padding: '12px 16px',
                          borderTop: `1px solid ${ROW_LINE}`,
                          fontSize: 12,
                          color: INK,
                          alignItems: 'center',
                          background: isExpanded ? '#f9fafc' : '#fff',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleSup(row.cariCode)}
                      >
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
                            {row.lastPurchaseDate ? ` — son alım: ${formatDateShort(row.lastPurchaseDate)}` : ''}
                          </span>
                        </span>
                        <span style={{ ...cellRight, color: RED, fontWeight: 600 }}>
                          {formatCurrency(row.payableBalance)}
                        </span>
                        <span style={{ ...cellRight, color: AMBER, fontWeight: 600 }}>
                          {formatCurrency(row.pastDuePayable)}
                        </span>
                        <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                          {formatCurrency(row.offsetPotential)}
                        </span>
                        <span style={{ ...cellRight, fontWeight: 500 }}>{nf.format(row.ourProductsTheyBuy.length)}</span>
                        <span style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSup(row.cariCode);
                            }}
                            style={{ ...headBtn, height: 30, padding: '0 10px', fontSize: 11.5 }}
                          >
                            {isExpanded ? (
                              <>
                                Gizle
                                <ChevronUp size={14} strokeWidth={2} />
                              </>
                            ) : (
                              <>
                                Ürünler
                                <ChevronDown size={14} strokeWidth={2} />
                              </>
                            )}
                          </button>
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${ROW_LINE}`, background: '#f7f9fc', padding: '12px 16px' }}>
                          <div style={{ ...cardStyle, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                              <div style={{ minWidth: 640 }}>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: SUP_ITEM_GRID,
                                    gap: 10,
                                    padding: '9px 14px',
                                    background: TABLE_HEAD_BG,
                                    borderBottom: `1px solid ${SOFT_LINE}`,
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    color: FAINT,
                                    textTransform: 'uppercase',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span>Ürün (bizden aldığı)</span>
                                  <span style={cellRight}>12 Ay Adet</span>
                                  <span style={cellRight}>12 Ay Tutar</span>
                                </div>
                                {row.ourProductsTheyBuy.length === 0 ? (
                                  <div style={{ padding: '12px 14px', fontSize: 11.5, color: FAINT }}>
                                    Son 12 ayda bu tedarikçiye satışımız yok.
                                  </div>
                                ) : (
                                  row.ourProductsTheyBuy.map((product) => (
                                    <div
                                      key={product.productCode}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: SUP_ITEM_GRID,
                                        gap: 10,
                                        padding: '10px 14px',
                                        borderTop: `1px solid ${ROW_LINE}`,
                                        fontSize: 11.5,
                                        color: INK,
                                        alignItems: 'center',
                                        background: '#fff',
                                      }}
                                    >
                                      <span style={{ minWidth: 0 }}>
                                        <span
                                          style={{
                                            fontFamily: "'Roboto Mono', monospace",
                                            fontSize: 11,
                                            color: MUTED,
                                            display: 'block',
                                          }}
                                        >
                                          {product.productCode}
                                        </span>
                                        <span
                                          style={{
                                            fontWeight: 500,
                                            display: 'block',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                          }}
                                          title={product.productName}
                                        >
                                          {product.productName || '-'}
                                        </span>
                                      </span>
                                      <span style={{ ...cellRight, fontWeight: 500 }}>{formatQty(product.last12moQty)}</span>
                                      <span style={{ ...cellRight, fontWeight: 600, color: EMERALD }}>
                                        {formatCurrency(product.last12moAmount)}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
