'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronRight,
  Layers,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

/**
 * Aile Yonetimi (/reports/family-management).
 * Uc sekme:
 *  - Aile Onerileri: ailesiz urunlere en benzer aileyi onerir; [Aileye Ekle].
 *  - Yeni Aile Adaylari: adayi olmayan ailesiz urunleri kumeler; [Aile Olustur].
 *  - Supheli Uyeler: mevcut aile uyelerinden zayif eslesenleri isaretler; [Aileden Cikar].
 * Gorsel dil: yeni tema rapor sablonu (TopluDenetim ile ayni).
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

// ---- Sozlesme tipleri ----
interface FamilyCandidate {
  familyId: string;
  familyName: string;
  score: number;
  matchedProductName: string;
}
interface SuggestionRow {
  productCode: string;
  productName: string;
  unit: string;
  categoryName: string;
  candidate: FamilyCandidate | null;
}
interface ClusterProduct {
  productCode: string;
  productName: string;
  unit: string;
  categoryName: string;
}
interface ClusterRow {
  suggestedName: string;
  products: ClusterProduct[];
}
interface OutlierRow {
  familyId: string;
  familyName: string;
  itemId: string;
  productCode: string;
  productName: string;
  score: number;
  reason: string;
}

type FamilyTab = 'SUGGESTIONS' | 'CLUSTERS' | 'OUTLIERS';

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

const cellRight: React.CSSProperties = { textAlign: 'right' };

const scoreBadge = (score: number): React.CSSProperties => {
  const strong = score >= 0.6;
  const mid = score >= 0.45;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 8px',
    borderRadius: 999,
    border: `1px solid ${strong ? '#bbf7d0' : mid ? '#fcd9a8' : '#fecaca'}`,
    background: strong ? '#f0fdf4' : mid ? '#fffaf2' : '#fef2f2',
    color: strong ? EMERALD : mid ? AMBER : RED,
    fontSize: 10.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
};

const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export default function FamilyYonetimi() {
  const [tab, setTab] = useState<FamilyTab>('SUGGESTIONS');

  // ---- Aile Onerileri ----
  const [sugRows, setSugRows] = useState<SuggestionRow[]>([]);
  const [sugTotal, setSugTotal] = useState(0);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugError, setSugError] = useState<string | null>(null);
  const [sugOffset, setSugOffset] = useState(0);
  const [sugSearch, setSugSearch] = useState('');
  const [sugDone, setSugDone] = useState<Set<string>>(new Set());
  const [sugBusy, setSugBusy] = useState<string | null>(null);
  const [sugLoadedOnce, setSugLoadedOnce] = useState(false);
  const SUG_LIMIT = 100;

  // ---- Yeni Aile Adaylari ----
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [cluLoading, setCluLoading] = useState(false);
  const [cluError, setCluError] = useState<string | null>(null);
  const [cluLoadedOnce, setCluLoadedOnce] = useState(false);
  // cluster index -> {name, checked set of productCodes}
  const [cluName, setCluName] = useState<Record<number, string>>({});
  const [cluChecked, setCluChecked] = useState<Record<number, Set<string>>>({});
  const [cluCreatedIdx, setCluCreatedIdx] = useState<Set<number>>(new Set());
  const [cluBusy, setCluBusy] = useState<number | null>(null);

  // ---- Supheli Uyeler ----
  const [outliers, setOutliers] = useState<OutlierRow[]>([]);
  const [outLoading, setOutLoading] = useState(false);
  const [outError, setOutError] = useState<string | null>(null);
  const [outLoadedOnce, setOutLoadedOnce] = useState(false);
  const [outDone, setOutDone] = useState<Set<string>>(new Set());
  const [outBusy, setOutBusy] = useState<string | null>(null);

  // ---------- Aile Onerileri ----------
  const fetchSuggestions = async (offset = sugOffset) => {
    setSugLoading(true);
    setSugError(null);
    try {
      const response = await adminApi.getFamilySuggestionsReport({ limit: SUG_LIMIT, offset });
      setSugRows(response.data.rows || []);
      setSugTotal(response.data.total || 0);
      setSugOffset(offset);
      setSugLoadedOnce(true);
    } catch (err: any) {
      setSugError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setSugLoading(false);
    }
  };

  const handleAddToFamily = async (row: SuggestionRow) => {
    if (!row.candidate) return;
    if (row.candidate.score < 0.6) {
      const confirmed = window.confirm(
        `Bu eslesmenin skoru dusuk (${nf.format(row.candidate.score)}). Gramaj/olcu/spekt farki olabilir. Yine de "${row.productCode}" urununu "${row.candidate.familyName}" ailesine eklemek istiyor musunuz?`
      );
      if (!confirmed) return;
    }
    setSugBusy(row.productCode);
    try {
      await adminApi.addProductToFamily(row.candidate.familyId, {
        productCode: row.productCode,
        productName: row.productName,
      });
      setSugDone((prev) => new Set(prev).add(row.productCode));
      toast.success(`${row.productCode} → ${row.candidate.familyName} ailesine eklendi.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Eklenemedi');
    } finally {
      setSugBusy(null);
    }
  };

  // ---------- Yeni Aile Adaylari ----------
  const fetchClusters = async () => {
    setCluLoading(true);
    setCluError(null);
    try {
      const response = await adminApi.getFamilyClustersReport({ limit: 50 });
      const list = response.data.clusters || [];
      setClusters(list);
      // Varsayilan: tum uyeler secili, ad = suggestedName
      const nameMap: Record<number, string> = {};
      const checkedMap: Record<number, Set<string>> = {};
      list.forEach((cluster: ClusterRow, idx: number) => {
        nameMap[idx] = cluster.suggestedName || '';
        checkedMap[idx] = new Set(cluster.products.map((p) => p.productCode));
      });
      setCluName(nameMap);
      setCluChecked(checkedMap);
      setCluCreatedIdx(new Set());
      setCluLoadedOnce(true);
    } catch (err: any) {
      setCluError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setCluLoading(false);
    }
  };

  const toggleClusterMember = (idx: number, productCode: string) => {
    setCluChecked((prev) => {
      const next = { ...prev };
      const set = new Set(next[idx] || []);
      if (set.has(productCode)) set.delete(productCode);
      else set.add(productCode);
      next[idx] = set;
      return next;
    });
  };

  const handleCreateFamily = async (idx: number) => {
    const name = (cluName[idx] || '').trim();
    const productCodes = Array.from(cluChecked[idx] || []);
    if (!name) {
      toast.error('Aile adı zorunlu');
      return;
    }
    if (productCodes.length < 1) {
      toast.error('En az bir ürün seçilmeli');
      return;
    }
    setCluBusy(idx);
    try {
      await adminApi.createProductFamily({ name, productCodes });
      setCluCreatedIdx((prev) => new Set(prev).add(idx));
      toast.success(`"${name}" ailesi ${productCodes.length} ürünle oluşturuldu.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Aile oluşturulamadı');
    } finally {
      setCluBusy(null);
    }
  };

  // ---------- Supheli Uyeler ----------
  const fetchOutliers = async () => {
    setOutLoading(true);
    setOutError(null);
    try {
      const response = await adminApi.getFamilyOutliersReport();
      setOutliers(response.data.rows || []);
      setOutDone(new Set());
      setOutLoadedOnce(true);
    } catch (err: any) {
      setOutError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setOutLoading(false);
    }
  };

  const handleRemoveOutlier = async (row: OutlierRow) => {
    if (!window.confirm(`"${row.productCode} — ${row.productName}" ürünü "${row.familyName}" ailesinden çıkarılsın mı?`)) {
      return;
    }
    setOutBusy(row.itemId);
    try {
      await adminApi.removeProductFromFamily(row.familyId, row.productCode);
      setOutDone((prev) => new Set(prev).add(row.itemId));
      toast.success(`${row.productCode} aileden çıkarıldı.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Çıkarılamadı');
    } finally {
      setOutBusy(null);
    }
  };

  // Sekme ilk geciste lazy yukleme
  useEffect(() => {
    if (tab === 'SUGGESTIONS' && !sugLoadedOnce && !sugLoading) fetchSuggestions(0);
    if (tab === 'CLUSTERS' && !cluLoadedOnce && !cluLoading) fetchClusters();
    if (tab === 'OUTLIERS' && !outLoadedOnce && !outLoading) fetchOutliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sugTokens = useMemo(() => buildSearchTokens(sugSearch), [sugSearch]);
  const filteredSug = useMemo(() => {
    if (sugTokens.length === 0) return sugRows;
    return sugRows.filter((row) => {
      const haystack = normalizeSearchText(
        `${row.productCode} ${row.productName} ${row.categoryName} ${row.candidate?.familyName || ''}`
      );
      return matchesSearchTokens(haystack, sugTokens);
    });
  }, [sugRows, sugTokens]);

  const SUG_GRID = '1.4fr 2fr 90px 1.2fr 1.6fr 90px 120px';
  const OUT_GRID = '1.4fr 1.6fr 80px 2fr 120px';

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Aile Yönetimi</span>
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
            <Layers size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            Aile Yönetimi
          </h1>
          <div style={{ fontSize: 13, color: '#51607a', marginTop: 5, fontWeight: 600 }}>
            Karar sirasi: guvenli aileye ekle, sonra yeni aile ac, en son supheli uyeleri temizle.
          </div>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Aile önerileri, yeni aile adayları ve şüpheli üyeleri tek ekrandan yönetin.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports/product-families" style={headBtn}>
            Stok Aile Yönetimi
          </Link>
          <Link href="/reports" style={headBtn}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
        {([
          ['SUGGESTIONS', 'Aile Önerileri'],
          ['CLUSTERS', 'Yeni Aile Adayları'],
          ['OUTLIERS', 'Şüpheli Üyeler'],
        ] as Array<[FamilyTab, string]>).map(([key, label]) => {
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

      {/* ---------- Aile Onerileri ---------- */}
      {tab === 'SUGGESTIONS' && (
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
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Ailesiz Ürünler + Önerilen Aile</div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                {sugLoadedOnce
                  ? `Toplam ${nf.format(sugTotal)} öneri — ${nf.format(filteredSug.length)} satır listeleniyor.`
                  : 'Rapor bekleniyor.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 260 }}>
                <Search
                  size={15}
                  strokeWidth={2}
                  style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT }}
                />
                <input
                  placeholder="Ara (ürün, kategori, aile)"
                  value={sugSearch}
                  onChange={(event) => setSugSearch(event.target.value)}
                  style={{ ...inputStyle, padding: '0 10px 0 34px', width: 260 }}
                />
              </div>
              <button
                type="button"
                onClick={() => fetchSuggestions(sugOffset)}
                disabled={sugLoading}
                style={{ ...headBtn, opacity: sugLoading ? 0.7 : 1 }}
              >
                <RefreshCw size={14} strokeWidth={2} className={sugLoading ? 'animate-spin' : undefined} />
                Yenile
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1140 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: SUG_GRID,
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
                <span>Ürün</span>
                <span>Ürün Adı</span>
                <span>Birim</span>
                <span>Kategori</span>
                <span>Önerilen Aile</span>
                <span style={cellRight}>Skor</span>
                <span style={cellRight}>Aksiyon</span>
              </div>

              {sugLoading ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <RefreshCw size={30} strokeWidth={2} className="animate-spin" style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
                </div>
              ) : sugError ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: RED, fontSize: 12.5 }}>
                  <AlertTriangle size={22} strokeWidth={2} style={{ margin: '0 auto 8px', display: 'block' }} />
                  {sugError}
                </div>
              ) : filteredSug.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <Layers size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Öneri bulunamadı.</p>
                </div>
              ) : (
                filteredSug.map((row) => {
                  const done = sugDone.has(row.productCode);
                  return (
                    <div
                      key={row.productCode}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: SUG_GRID,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'center',
                        background: done ? '#f0fdf4' : '#fff',
                      }}
                    >
                      <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, fontWeight: 600 }}>
                        {row.productCode}
                      </span>
                      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.productName}>
                        {row.productName || '-'}
                      </span>
                      <span style={{ color: MUTED }}>{row.unit || '-'}</span>
                      <span style={{ minWidth: 0, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.categoryName}>
                        {row.categoryName || '-'}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.candidate?.familyName || '-'}
                        </span>
                        {row.candidate?.matchedProductName && (
                          <span style={{ fontSize: 10.5, color: FAINT, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.candidate.matchedProductName}>
                            eşleşen: {row.candidate.matchedProductName}
                          </span>
                        )}
                      </span>
                      <span style={cellRight}>
                        {row.candidate ? <span style={scoreBadge(row.candidate.score)}>{nf.format(row.candidate.score)}</span> : '-'}
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        {done ? (
                          <span style={{ fontSize: 11.5, color: EMERALD, fontWeight: 600 }}>Eklendi</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddToFamily(row)}
                            disabled={!row.candidate || sugBusy === row.productCode}
                            style={{
                              ...headBtn,
                              height: 30,
                              padding: '0 10px',
                              fontSize: 11.5,
                              color: PRIMARY,
                              borderColor: '#c7d7f2',
                              opacity: !row.candidate || sugBusy === row.productCode ? 0.5 : 1,
                            }}
                          >
                            Aileye Ekle
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sayfalama (offset tabanli) */}
          {sugLoadedOnce && sugTotal > SUG_LIMIT && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                borderTop: `1px solid ${SOFT_LINE}`,
              }}
            >
              <div style={{ fontSize: 12.5, color: MUTED }}>
                {nf.format(sugOffset + 1)} - {nf.format(Math.min(sugOffset + SUG_LIMIT, sugTotal))} / {nf.format(sugTotal)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fetchSuggestions(Math.max(0, sugOffset - SUG_LIMIT))}
                  disabled={sugOffset === 0 || sugLoading}
                  style={{ ...headBtn, opacity: sugOffset === 0 || sugLoading ? 0.5 : 1 }}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  onClick={() => fetchSuggestions(sugOffset + SUG_LIMIT)}
                  disabled={sugOffset + SUG_LIMIT >= sugTotal || sugLoading}
                  style={{ ...headBtn, opacity: sugOffset + SUG_LIMIT >= sugTotal || sugLoading ? 0.5 : 1 }}
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Yeni Aile Adaylari ---------- */}
      {tab === 'CLUSTERS' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              type="button"
              onClick={fetchClusters}
              disabled={cluLoading}
              style={{ ...headBtn, opacity: cluLoading ? 0.7 : 1 }}
            >
              <RefreshCw size={14} strokeWidth={2} className={cluLoading ? 'animate-spin' : undefined} />
              Yenile
            </button>
          </div>

          {cluLoading ? (
            <div style={{ ...cardStyle, padding: '48px 16px', textAlign: 'center' }}>
              <RefreshCw size={30} strokeWidth={2} className="animate-spin" style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }} />
              <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
            </div>
          ) : cluError ? (
            <div style={{ ...cardStyle, padding: '32px 16px', textAlign: 'center', color: RED, fontSize: 12.5 }}>
              <AlertTriangle size={22} strokeWidth={2} style={{ margin: '0 auto 8px', display: 'block' }} />
              {cluError}
            </div>
          ) : clusters.length === 0 ? (
            <div style={{ ...cardStyle, padding: '48px 16px', textAlign: 'center' }}>
              <Layers size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
              <p style={{ color: MUTED, margin: 0 }}>Aday küme bulunamadı.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
              {clusters.map((cluster, idx) => {
                const created = cluCreatedIdx.has(idx);
                const checked = cluChecked[idx] || new Set<string>();
                return (
                  <div key={idx} style={{ ...cardStyle, overflow: 'hidden', opacity: created ? 0.6 : 1 }}>
                    <div style={{ padding: '13px 14px', borderBottom: `1px solid ${SOFT_LINE}` }}>
                      <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 500 }}>
                        Aile Adı
                      </label>
                      <input
                        value={cluName[idx] ?? ''}
                        disabled={created}
                        onChange={(event) => setCluName((prev) => ({ ...prev, [idx]: event.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {cluster.products.map((product) => (
                        <label
                          key={product.productCode}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 9,
                            padding: '9px 14px',
                            borderTop: `1px solid ${ROW_LINE}`,
                            cursor: created ? 'default' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={created}
                            checked={checked.has(product.productCode)}
                            onChange={() => toggleClusterMember(idx, product.productCode)}
                            style={{ width: 16, height: 16, flex: 'none' }}
                          />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, fontWeight: 600, color: INK, display: 'block' }}>
                              {product.productCode}
                            </span>
                            <span style={{ fontSize: 11.5, color: MUTED, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={product.productName}>
                              {product.productName} · {product.unit} · {product.categoryName}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ padding: 13, borderTop: `1px solid ${SOFT_LINE}` }}>
                      {created ? (
                        <span style={{ fontSize: 12.5, color: EMERALD, fontWeight: 600 }}>Aile oluşturuldu.</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCreateFamily(idx)}
                          disabled={cluBusy === idx || checked.size === 0}
                          style={{
                            ...primaryBtn,
                            width: '100%',
                            justifyContent: 'center',
                            opacity: cluBusy === idx || checked.size === 0 ? 0.6 : 1,
                          }}
                        >
                          {cluBusy === idx ? (
                            <RefreshCw size={14} strokeWidth={2} className="animate-spin" />
                          ) : (
                            <Plus size={14} strokeWidth={2} />
                          )}
                          Aile Oluştur ({checked.size} ürün)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------- Supheli Uyeler ---------- */}
      {tab === 'OUTLIERS' && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
              borderBottom: `1px solid ${SOFT_LINE}`,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Şüpheli Aile Üyeleri</div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                Ailesine zayıf eşleşen (düşük skorlu) üyeler.
              </div>
            </div>
            <button
              type="button"
              onClick={fetchOutliers}
              disabled={outLoading}
              style={{ ...headBtn, opacity: outLoading ? 0.7 : 1 }}
            >
              <RefreshCw size={14} strokeWidth={2} className={outLoading ? 'animate-spin' : undefined} />
              Yenile
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 960 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: OUT_GRID,
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
                <span>Aile</span>
                <span>Ürün</span>
                <span style={cellRight}>Skor</span>
                <span>Neden</span>
                <span style={cellRight}>Aksiyon</span>
              </div>

              {outLoading ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <RefreshCw size={30} strokeWidth={2} className="animate-spin" style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
                </div>
              ) : outError ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: RED, fontSize: 12.5 }}>
                  <AlertTriangle size={22} strokeWidth={2} style={{ margin: '0 auto 8px', display: 'block' }} />
                  {outError}
                </div>
              ) : outliers.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <Layers size={30} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                  <p style={{ color: MUTED, margin: 0 }}>Şüpheli üye bulunamadı.</p>
                </div>
              ) : (
                outliers.map((row) => {
                  const done = outDone.has(row.itemId);
                  return (
                    <div
                      key={row.itemId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: OUT_GRID,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'center',
                        background: done ? '#f0fdf4' : '#fff',
                      }}
                    >
                      <span style={{ minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.familyName}>
                        {row.familyName}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED, display: 'block' }}>
                          {row.productCode}
                        </span>
                        <span style={{ fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.productName}>
                          {row.productName || '-'}
                        </span>
                      </span>
                      <span style={cellRight}>
                        <span style={scoreBadge(row.score)}>{nf.format(row.score)}</span>
                      </span>
                      <span style={{ minWidth: 0, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.reason}>
                        {row.reason || '-'}
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        {done ? (
                          <span style={{ fontSize: 11.5, color: EMERALD, fontWeight: 600 }}>Çıkarıldı</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveOutlier(row)}
                            disabled={outBusy === row.itemId}
                            style={{
                              ...headBtn,
                              height: 30,
                              padding: '0 10px',
                              fontSize: 11.5,
                              color: RED,
                              borderColor: '#fecaca',
                              opacity: outBusy === row.itemId ? 0.5 : 1,
                            }}
                          >
                            Aileden Çıkar
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
      )}
    </div>
  );
}
