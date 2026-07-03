'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import toast from 'react-hot-toast';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Talep Deseni Dortlusu raporu (/reports/demand-pattern).
 * Her stoklu urunu Syntetos-Boylan ceyregine (duzenli/kesikli/dalgali/topakli) gore
 * siniflar ve tek-cari payini hesaplar. Topakli + tek-cari + min>0 urunler "siparise
 * getir" (min=0/max=0) adayidir; bunlar isaretlenince min-max motoru artik onermez.
 * Gorsel dil: yeni tema rapor sablonu (TopluDenetim ile ayni).
 */

// ---- Sozlesme sekli (component yerel tipleri) ----
type DemandPatternKind = 'SMOOTH' | 'ERRATIC' | 'INTERMITTENT' | 'LUMPY';

interface DemandPatternRow {
  productCode: string;
  productName: string;
  supplierName: string | null;
  pattern: DemandPatternKind;
  adi: number;
  cv2: number | null;
  demandWeeks: number;
  totalQty: number;
  topCustomerCode: string | null;
  topCustomerName: string | null;
  topCustomerShare: number; // 0..1
  currentMin: number;
  currentMax: number;
  unitCost: number;
  minStockValueTL: number;
  recommended: boolean;
}

interface DemandPatternResult {
  depot: 'MERKEZ' | 'TOPCA';
  lookbackWeeks: number;
  generatedAt: string;
  rows: DemandPatternRow[];
  summary: {
    counts: { smooth: number; erratic: number; intermittent: number; lumpy: number };
    totalProducts: number;
    lumpyMinStockTL: number;
    recommendedCount: number;
    recommendedMinStockTL: number;
    truncated?: boolean;
    params: { depot: string; lookbackWeeks: number; adiCut: number; cv2Cut: number; topShareCut: number };
  };
}

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

// Sec | Stok | Urun | Tedarikci | Desen | ADI | CV2 | Tek-cari % | Tek cari | Min | Birim Maliyet | Min-Stok TL
const GRID = '34px 1.1fr 1.7fr 1.2fr 110px 70px 70px 90px 1.2fr 80px 110px 120px';

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
const formatMoney = (value: number) =>
  `₺${(Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatDecimal = (value: number, digits = 2) =>
  (Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatQty = (value: number) => nf.format(Math.round((Number(value) || 0) * 100) / 100);
const formatPercent = (share: number) => `%${((Number(share) || 0) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;

const clampInt = (value: number, min: number, max: number, fallback: number) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

// ---- Desen rozet renk haritasi ----
const PATTERN_META: Record<
  DemandPatternKind,
  { label: string; color: string; border: string; bg: string }
> = {
  SMOOTH: { label: 'Düzenli', color: EMERALD, border: '#bbf7d0', bg: '#f0fdf4' },
  INTERMITTENT: { label: 'Kesikli', color: '#1d4ed8', border: '#bfdbfe', bg: '#eff6ff' },
  ERRATIC: { label: 'Dalgalı', color: AMBER, border: '#fcd9a8', bg: '#fffaf2' },
  LUMPY: { label: 'Topaklı', color: RED, border: '#fecaca', bg: '#fef2f2' },
};

const PATTERN_ORDER: DemandPatternKind[] = ['SMOOTH', 'INTERMITTENT', 'ERRATIC', 'LUMPY'];

type SortKey =
  | 'productName'
  | 'pattern'
  | 'adi'
  | 'cv2'
  | 'topCustomerShare'
  | 'currentMin'
  | 'unitCost'
  | 'minStockValueTL';

const rowKey = (row: DemandPatternRow) => row.productCode;

export default function DemandPattern() {
  const [depot, setDepot] = useState<'MERKEZ' | 'TOPCA'>('MERKEZ');
  const [lookbackInput, setLookbackInput] = useState(52);
  const [data, setData] = useState<DemandPatternResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [patternFilter, setPatternFilter] = useState<DemandPatternKind | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('minStockValueTL');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Secili urun kodlari
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Uygulanmis (siparise getir'e alinmis) urun kodlari
  const [applied, setApplied] = useState<Set<string>>(new Set());
  // Onay modali
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDemandPattern({
        depot,
        lookbackWeeks: clampInt(lookbackInput, 4, 260, 52),
      });
      const result = response.data as DemandPatternResult;
      setData(result);
      // Onerili satirlari (henuz uygulanmamis) varsayilan olarak sec
      const preselect = new Set<string>();
      for (const row of result.rows) {
        if (row.recommended) preselect.add(row.productCode);
      }
      setSelected(preselect);
      setApplied(new Set());
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const searchTokens = useMemo(() => buildSearchTokens(search), [search]);

  const filteredRows = useMemo(() => {
    if (!data) return [] as DemandPatternRow[];
    let rows = data.rows;
    if (patternFilter !== 'ALL') rows = rows.filter((row) => row.pattern === patternFilter);
    if (searchTokens.length > 0) {
      rows = rows.filter((row) => {
        const haystack = normalizeSearchText(
          `${row.productCode} ${row.productName} ${row.supplierName || ''} ${row.topCustomerCode || ''} ${row.topCustomerName || ''}`
        );
        return matchesSearchTokens(haystack, searchTokens);
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'productName') {
        return dir * (a.productName || '').localeCompare(b.productName || '', 'tr');
      }
      if (sortKey === 'pattern') {
        return dir * (PATTERN_ORDER.indexOf(a.pattern) - PATTERN_ORDER.indexOf(b.pattern));
      }
      // cv2 null -> en sona (LUMPY tek-tepe) itmek icin buyuk deger gibi davran
      const av = sortKey === 'cv2' ? (a.cv2 === null ? Number.POSITIVE_INFINITY : a.cv2) : (a[sortKey] as number);
      const bv = sortKey === 'cv2' ? (b.cv2 === null ? Number.POSITIVE_INFINITY : b.cv2) : (b[sortKey] as number);
      return dir * ((Number(av) || 0) - (Number(bv) || 0));
    });
    return sorted;
  }, [data, patternFilter, searchTokens, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'productName' || key === 'pattern' ? 'asc' : 'desc');
    }
  };

  const toggleRow = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Uygulanmamis + goruntulenen satirlar uzerinden secim durumu
  const selectableVisible = useMemo(
    () => filteredRows.filter((row) => !applied.has(row.productCode)),
    [filteredRows, applied]
  );
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((row) => selected.has(row.productCode));

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const row of selectableVisible) next.delete(row.productCode);
      } else {
        for (const row of selectableVisible) next.add(row.productCode);
      }
      return next;
    });
  };

  // Onay modaline giren (uygulanmamis) secili urunler
  const selectedRows = useMemo(() => {
    if (!data) return [] as DemandPatternRow[];
    return data.rows.filter((row) => selected.has(row.productCode) && !applied.has(row.productCode));
  }, [data, selected, applied]);

  // Tek seferde en fazla 200 kod yazilir (backend siniri). Onay modali BU set uzerinden
  // konusmali ki kullanicinin onayladigi kapsam gercekten yazilanla ayni olsun.
  const APPLY_CAP = 200;
  const applyRows = useMemo(() => selectedRows.slice(0, APPLY_CAP), [selectedRows]);
  const applyMinStockTL = useMemo(
    () => applyRows.reduce((sum, row) => sum + (Number(row.minStockValueTL) || 0), 0),
    [applyRows]
  );

  const confirmApply = async () => {
    if (!data || applyRows.length === 0) return;
    setApplyBusy(true);
    try {
      const productCodes = applyRows.map((row) => row.productCode);
      const response = await adminApi.applyDemandPatternOrderToOrder({ depot: data.depot, productCodes });
      const result = (response.data || {}) as {
        applied?: string[];
        skipped?: Array<{ productCode: string; reason: string }>;
      };
      const appliedCodes = Array.isArray(result.applied) ? result.applied : [];
      const skipped = Array.isArray(result.skipped) ? result.skipped : [];
      // Min=0 yazilan ama haric-listesine eklenemeyen urun BE'de hem applied hem skipped'a
      // girer; toast'ta cift saymamak icin applied olanlari skipped'tan dus.
      const trueSkipped = skipped.filter((s) => !appliedCodes.includes(s.productCode));

      // Basarili olanlari isaretle ve secimden dusur
      setApplied((prev) => {
        const next = new Set(prev);
        for (const code of appliedCodes) next.add(code);
        return next;
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const code of appliedCodes) next.delete(code);
        return next;
      });

      if (trueSkipped.length > 0) {
        toast.error(`${appliedCodes.length} ürün siparişe getir'e alındı, ${trueSkipped.length} ürün atlandı.`);
      } else {
        toast.success(`${appliedCodes.length} ürün siparişe getir'e alındı (min=0/max=0).`);
      }
      setConfirmOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'İşlem başarısız');
    } finally {
      setApplyBusy(false);
    }
  };

  const summary = data?.summary;

  const SortHead = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 'inherit',
          textTransform: 'uppercase',
          color: active ? PRIMARY : FAINT,
          width: '100%',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        {label}
        {active &&
          (sortDir === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />)}
      </button>
    );
  };

  const patternChips: Array<{ key: DemandPatternKind | 'ALL'; label: string; count: number | null }> = [
    { key: 'ALL', label: 'Tümü', count: summary?.totalProducts ?? null },
    { key: 'SMOOTH', label: 'Düzenli', count: summary?.counts.smooth ?? null },
    { key: 'INTERMITTENT', label: 'Kesikli', count: summary?.counts.intermittent ?? null },
    { key: 'ERRATIC', label: 'Dalgalı', count: summary?.counts.erratic ?? null },
    { key: 'LUMPY', label: 'Topaklı', count: summary?.counts.lumpy ?? null },
  ];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Talep Deseni</span>
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
            <Activity size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            Talep Deseni
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Ürünleri talep desenine (düzenli / kesikli / dalgalı / topaklı) göre sınıflar; topaklı + tek-cari ürünlere
            siparişe-getir (min=0) önerir.
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
          Depoyu ve geriye dönük kaç haftalık satışın inceleneceğini seçin.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 170px auto',
            gap: 14,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Depo</label>
            <div style={{ display: 'inline-flex', border: `1px solid ${LINE}`, borderRadius: 9, overflow: 'hidden' }}>
              {(['MERKEZ', 'TOPCA'] as const).map((d) => {
                const active = depot === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepot(d)}
                    style={{
                      height: 36,
                      padding: '0 18px',
                      border: 'none',
                      background: active ? PRIMARY : '#fff',
                      color: active ? '#fff' : MUTED,
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'MERKEZ' ? 'Merkez' : 'Topça'}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Geriye Dönük (hafta, 4-260)</label>
            <input
              type="number"
              min={4}
              max={260}
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
              Getir
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
      {summary?.truncated && (
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
          Sonuç kümesi kırpıldı: tüm ürünler gösterilemiyor. Depo veya hafta aralığını daraltarak tekrar deneyin.
        </div>
      )}

      {/* Summary strip: 4 desen rozeti + topakli yatan + siparise getir adayi */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        {(['SMOOTH', 'INTERMITTENT', 'ERRATIC', 'LUMPY'] as DemandPatternKind[]).map((kind) => {
          const meta = PATTERN_META[kind];
          const count =
            kind === 'SMOOTH'
              ? summary?.counts.smooth
              : kind === 'INTERMITTENT'
              ? summary?.counts.intermittent
              : kind === 'ERRATIC'
              ? summary?.counts.erratic
              : summary?.counts.lumpy;
          return (
            <div key={kind} style={summaryCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: meta.color,
                  }}
                />
                <span style={{ fontSize: 11.5, color: FAINT }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: meta.color, marginTop: 5 }}>
                {count !== undefined ? nf.format(count) : '-'}
              </div>
            </div>
          );
        })}
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Topaklı Yatan Min-Stok</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: RED, marginTop: 5 }}>
            {summary ? formatMoney(summary.lumpyMinStockTL) : '-'}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Siparişe-Getir Adayı</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
            {summary ? nf.format(summary.recommendedCount) : '-'}
            {summary ? (
              <span style={{ fontSize: 12, fontWeight: 500, color: FAINT }}>
                {' '}
                ürün / {formatMoney(summary.recommendedMinStockTL)}
              </span>
            ) : null}
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
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Talep Deseni Dörtlüsü</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {data
                ? `${data.depot === 'MERKEZ' ? 'Merkez' : 'Topça'} · son ${data.lookbackWeeks} hafta — ${nf.format(
                    filteredRows.length
                  )} ürün listeleniyor.`
                : 'Rapor bekleniyor.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Siparise Getir'e Al */}
            {selectedRows.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                style={{ ...primaryBtn, background: RED, border: `1px solid ${RED}` }}
              >
                <CheckCircle2 size={15} strokeWidth={2} />
                Siparişe Getir'e Al ({nf.format(selectedRows.length)})
              </button>
            )}
            <div style={{ position: 'relative', width: 260 }}>
              <Search
                size={15}
                strokeWidth={2}
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT }}
              />
              <input
                placeholder="Ara (stok, ürün, tedarikçi, cari)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ ...inputStyle, padding: '0 10px 0 34px' }}
              />
            </div>
          </div>
        </div>

        {/* Pattern filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          {patternChips.map((chip) => {
            const active = patternFilter === chip.key;
            const meta = chip.key === 'ALL' ? null : PATTERN_META[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setPatternFilter(chip.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? (meta?.color ?? PRIMARY) : LINE}`,
                  background: active ? (meta?.bg ?? '#eef3fb') : '#fff',
                  color: active ? (meta?.color ?? PRIMARY) : MUTED,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {meta && (
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: meta.color }} />
                )}
                {chip.label}
                {chip.count !== null && (
                  <span style={{ color: FAINT, fontWeight: 500 }}>{nf.format(chip.count)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1280 }}>
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
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  disabled={selectableVisible.length === 0}
                  style={{ width: 15, height: 15, cursor: selectableVisible.length ? 'pointer' : 'default' }}
                  aria-label="Görünenleri seç"
                />
              </span>
              <span>Stok</span>
              <SortHead label="Ürün" k="productName" />
              <span>Tedarikçi</span>
              <SortHead label="Desen" k="pattern" />
              <SortHead label="ADI" k="adi" align="right" />
              <SortHead label="CV²" k="cv2" align="right" />
              <SortHead label="Tek-cari %" k="topCustomerShare" align="right" />
              <span>Tek Cari</span>
              <SortHead label="Mevcut Min" k="currentMin" align="right" />
              <SortHead label="Birim Maliyet" k="unitCost" align="right" />
              <SortHead label="Min-Stok ₺" k="minStockValueTL" align="right" />
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
                <Activity size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                <p style={{ color: MUTED, margin: 0 }}>{data ? 'Kayıt bulunamadı.' : 'Rapor için "Getir" butonuna basın.'}</p>
              </div>
            ) : (
              filteredRows.map((row) => {
                const key = rowKey(row);
                const meta = PATTERN_META[row.pattern];
                const isApplied = applied.has(key);
                const isSelected = selected.has(key);
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
                      background: isApplied ? '#f0fdf4' : row.recommended ? '#fff7f7' : '#fff',
                    }}
                  >
                    {/* Secim / uygulanmis rozet */}
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {isApplied ? (
                        <CheckCircle2 size={16} strokeWidth={2} style={{ color: EMERALD }} />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          style={{ width: 15, height: 15, cursor: 'pointer' }}
                          aria-label="Seç"
                        />
                      )}
                    </span>

                    {/* Stok kodu */}
                    <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED, minWidth: 0 }}>
                      {row.productCode}
                    </span>

                    {/* Urun adi */}
                    <span
                      style={{
                        fontWeight: 500,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.productName}
                    >
                      {row.productName || '-'}
                    </span>

                    {/* Tedarikci */}
                    <span
                      style={{
                        color: MUTED,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.supplierName || ''}
                    >
                      {row.supplierName || '-'}
                    </span>

                    {/* Desen rozeti */}
                    <span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '2px 9px',
                          borderRadius: 999,
                          border: `1px solid ${meta.border}`,
                          background: meta.bg,
                          color: meta.color,
                          fontSize: 10.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meta.label}
                        {row.recommended && !isApplied && (
                          <span title="Siparişe getir adayı" style={{ fontSize: 10 }}>★</span>
                        )}
                      </span>
                    </span>

                    {/* ADI */}
                    <span style={{ ...cellRight, fontWeight: 500 }} title="Ortalama talep aralığı (hafta)">
                      {formatDecimal(row.adi)}
                    </span>

                    {/* CV2 */}
                    <span style={{ ...cellRight, color: MUTED }} title="Talep büyüklüğü değişkenliği">
                      {row.cv2 === null ? '—' : formatDecimal(row.cv2)}
                    </span>

                    {/* Tek-cari % */}
                    <span
                      style={{
                        ...cellRight,
                        fontWeight: 600,
                        color: row.topCustomerShare >= 0.6 ? RED : MUTED,
                      }}
                    >
                      {formatPercent(row.topCustomerShare)}
                    </span>

                    {/* Tek cari adi */}
                    <span
                      style={{
                        color: MUTED,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.topCustomerName || ''}
                    >
                      {row.topCustomerName || row.topCustomerCode || '-'}
                    </span>

                    {/* Mevcut Min */}
                    <span style={{ ...cellRight, fontWeight: 500 }}>{formatQty(row.currentMin)}</span>

                    {/* Birim maliyet */}
                    <span style={{ ...cellRight, color: MUTED }}>{formatMoney(row.unitCost)}</span>

                    {/* Min-stok TL */}
                    <span style={{ ...cellRight, color: row.recommended ? RED : EMERALD, fontWeight: 600 }}>
                      {formatMoney(row.minStockValueTL)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
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
          <div
            style={{
              ...cardStyle,
              width: 'min(560px, 100%)',
              padding: 20,
              boxShadow: '0 18px 50px rgba(15,23,42,.25)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={17} strokeWidth={2} style={{ color: RED }} />
                Siparişe Getir'e Al
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={applyBusy}
                style={{ ...headBtn, height: 28, padding: '0 8px' }}
                aria-label="Kapat"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            <div
              style={{
                ...cardStyle,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                padding: '12px 14px',
                marginBottom: 12,
                color: RED,
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            >
              <strong>Uyarı:</strong> Seçili {nf.format(applyRows.length)} ürüne Mikro'da{' '}
              <strong>min=0 / max=0</strong> yazılacak ve bu ürünler min-max motoru tarafından artık
              önerilmeyecek (siparişe-getir istisnasına eklenir).
              {selectedRows.length > applyRows.length && (
                <>
                  {' '}
                  <strong>
                    (Bu adımda ilk {nf.format(applyRows.length)} ürün işlenecek; kalan{' '}
                    {nf.format(selectedRows.length - applyRows.length)} ürün için tekrar çalıştırın.)
                  </strong>
                </>
              )}
            </div>

            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              Depo: <strong style={{ color: INK }}>{data?.depot === 'MERKEZ' ? 'Merkez' : 'Topça'}</strong>
              {' · '}Serbest kalan min-stok: <strong style={{ color: EMERALD }}>{formatMoney(applyMinStockTL)}</strong>
            </div>

            <div
              style={{
                ...cardStyle,
                overflow: 'auto',
                marginBottom: 4,
                flex: '1 1 auto',
                minHeight: 0,
              }}
            >
              {applyRows.map((row) => (
                <div
                  key={row.productCode}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 12px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                      {row.productCode}
                    </span>{' '}
                    <span
                      style={{
                        color: INK,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.productName}
                    >
                      {row.productName}
                    </span>
                  </span>
                  <span style={{ color: RED, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatMoney(row.minStockValueTL)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={applyBusy} style={headBtn}>
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmApply}
                disabled={applyBusy || selectedRows.length === 0}
                style={{
                  ...primaryBtn,
                  background: RED,
                  border: `1px solid ${RED}`,
                  opacity: applyBusy ? 0.7 : 1,
                  cursor: applyBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {applyBusy && <RefreshCw size={14} strokeWidth={2} className="animate-spin" />}
                Onayla, Siparişe Getir'e Al
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
