'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Box,
  ChevronRight,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  MapPin,
  PackagePlus,
  RefreshCw,
  SearchCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const ROW = '#f1f4f9';
const RED = '#b91c1c';
const AMBER = '#b45309';
const GREEN = '#047857';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12 };
const btn: React.CSSProperties = {
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
  textDecoration: 'none',
  cursor: 'pointer',
};
const actionBtn: React.CSSProperties = {
  ...btn,
  height: 30,
  padding: '0 10px',
  fontSize: 11.5,
  borderColor: '#c7d2fe',
  color: PRIMARY,
};

const fmtDate = (value?: string | null) => {
  if (!value) return '-';
  try {
    return formatDateShort(value);
  } catch {
    return String(value).slice(0, 10);
  }
};

function Kpi({ label, value, tone = 'default' }: { label: string; value: any; tone?: 'default' | 'red' | 'amber' | 'green' }) {
  const color = tone === 'red' ? RED : tone === 'amber' ? AMBER : tone === 'green' ? GREEN : INK;
  return (
    <div style={{ ...card, padding: 13 }}>
      <div style={{ fontSize: 11, color: FAINT, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 5, color, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${ROW}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, color: INK }}>
        {icon}
        {title}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function SimpleTable({ rows, columns, empty }: { rows: any[]; empty: string; columns: Array<[string, (row: any) => React.ReactNode]> }) {
  if (!rows?.length) return <div style={{ padding: 18, color: FAINT, textAlign: 'center', fontSize: 12.5 }}>{empty}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.2, minWidth: 760 }}>
        <thead>
          <tr style={{ color: FAINT, textAlign: 'left', background: '#fafbfd' }}>
            {columns.map(([name]) => (
              <th key={name} style={{ padding: '8px 10px', fontWeight: 700 }}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.cartId || row.customerId || row.bundleName || row.title || index} style={{ borderTop: `1px solid ${ROW}` }}>
              {columns.map(([name, render]) => (
                <td key={name} style={{ padding: '9px 10px', verticalAlign: 'top' }}>{render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionLink({ href, children = 'Ac' }: { href?: string | null; children?: React.ReactNode }) {
  if (!href) return <span style={{ color: FAINT }}>-</span>;
  return (
    <Link href={href} style={actionBtn}>
      {children}
    </Link>
  );
}

export default function ActionRadarPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getActionRadar();
      setData(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Aksiyon radari yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await action();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Aksiyon tamamlanamadi.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearCart = async (row: any) => {
    if (!row?.cartId) return;
    if (!window.confirm(`${row.customerName || row.customerCode} sepetindeki tum kalemler silinsin mi?`)) return;
    await runAction(`cart:${row.cartId}`, async () => {
      const response = await adminApi.clearCustomerCart(row.cartId);
      toast.success(`${response.data.deletedCount || 0} sepet kalemi temizlendi.`);
      await load();
    });
  };

  const handleImageUpload = async (row: any, file?: File | null) => {
    if (!row?.id || !file) return;
    await runAction(`image:${row.id}`, async () => {
      const formData = new FormData();
      formData.append('image', file);
      await adminApi.addProductImage(row.id, formData);
      toast.success(`${row.mikroCode || row.name} gorseli yuklendi.`);
      await load();
    });
  };

  const handleCreateTask = async (kind: 'quote' | 'cart' | 'image' | 'visit', row: any) => {
    const key = `task:${kind}:${row.id || row.cartId || row.customerId || row.mikroCode}`;
    await runAction(key, async () => {
      const links: any[] = [];
      if (row.customerId || row.customerCode) {
        links.push({
          type: 'CUSTOMER',
          label: row.customerName || row.customerCode,
          referenceId: row.customerId,
          referenceCode: row.customerCode,
        });
      }
      if (row.id && kind === 'quote') {
        links.push({ type: 'QUOTE', label: row.quoteNumber, referenceId: row.id, referenceCode: row.quoteNumber });
      }
      if (row.id && kind === 'image') {
        links.push({ type: 'PRODUCT', label: row.name || row.mikroCode, referenceId: row.id, referenceCode: row.mikroCode });
      }
      if (row.actionUrl) {
        links.push({ type: 'PAGE', label: 'Aksiyon radari kaynagi', referenceUrl: row.actionUrl });
      }

      const titleByKind = {
        quote: `Teklif takibi: ${row.quoteNumber || row.customerName || ''}`.trim(),
        cart: `Terk sepet takibi: ${row.customerName || row.customerCode || ''}`.trim(),
        image: `Urun gorseli yukle: ${row.mikroCode || row.name || ''}`.trim(),
        visit: `Saha ziyareti: ${row.customerName || row.customerCode || ''}`.trim(),
      };
      const description = [
        kind === 'cart' ? `Sepet bekleme: ${row.daysIdle || 0} gun, tutar: ${formatCurrency(row.totalAmount || 0)}` : null,
        kind === 'quote' ? `Teklif sorunu: ${row.issue || '-'}, tutar: ${formatCurrency(row.grandTotal || 0)}` : null,
        kind === 'image' ? `Eksik gorselli urun: ${row.mikroCode || '-'} ${row.name || ''}` : null,
        kind === 'visit' ? `Onerilen aksiyon: ${row.suggestedAction || '-'}` : null,
      ].filter(Boolean).join('\n');

      await adminApi.createTask({
        title: titleByKind[kind],
        description,
        type: 'REPORT',
        status: 'NEW',
        priority: kind === 'image' ? 'MEDIUM' : 'HIGH',
        links,
      });
      toast.success('Gorev olusturuldu.');
    });
  };

  const topMetrics = useMemo(() => {
    if (!data) return [];
    return [
      ['Teklif riski', data.quoteHealth?.summary?.expiringOrExpired || 0, 'amber'],
      ['Terk sepet', data.abandonedCarts?.summary?.total || 0, 'amber'],
      ['Katalog skoru', `${data.catalogScore?.summary?.score || 0}/100`, (data.catalogScore?.summary?.score || 0) >= 75 ? 'green' : 'red'],
      ['Paket satis 90g', data.bundlePerformance?.summary?.orderedBundleLines90d || 0, 'green'],
      ['Tamamlayici kapsama', `%${data.complementHealth?.summary?.coveragePct || 0}`, (data.complementHealth?.summary?.coveragePct || 0) >= 70 ? 'green' : 'amber'],
      ['Anomali', Object.values(data.anomalyRadar?.summary || {}).reduce((s: number, v: any) => s + Number(v || 0), 0), 'red'],
    ] as Array<[string, any, any]>;
  }, [data]);

  return (
    <div style={{ maxWidth: 1460, margin: '0 auto', padding: 24, color: INK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 12 }}>
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 600 }}>Raporlar</Link>
        <ChevronRight size={13} />
        <span style={{ color: MUTED, fontWeight: 600 }}>Aksiyon Radari</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0, fontSize: 24, fontWeight: 800 }}>
            <SearchCheck size={23} color={PRIMARY} />
            Aksiyon Radari
          </h1>
          <p style={{ margin: '6px 0 0', color: FAINT, fontSize: 13 }}>
            Teklif, sepet, tamamlayici urun, paket, katalog, saha ziyareti ve anomali sinyalleri.
            {data?.scope?.mode === 'assigned-sectors' ? ` Satisci kapsami: ${(data.scope.sectorCodes || []).join(', ') || 'atanmis sektor yok'}.` : ''}
          </p>
        </div>
        <button type="button" style={btn} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          Yenile
        </button>
      </div>

      {error && <div style={{ ...card, padding: 14, color: RED, borderColor: '#fecaca', marginBottom: 14 }}>{error}</div>}
      {loading && <div style={{ ...card, padding: 40, textAlign: 'center', color: MUTED }}>Yukleniyor...</div>}

      {!loading && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10 }}>
            {topMetrics.map(([label, value, tone]) => <Kpi key={label} label={label} value={value} tone={tone} />)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 14 }}>
            <Section title="4.1 Teklif Saglik Kontrolu" icon={<FileText size={16} color={PRIMARY} />}>
              <SimpleTable
                rows={data.quoteHealth?.rows || []}
                empty="Riskli teklif yok."
                columns={[
                  ['Teklif', (r) => <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700 }}>{r.quoteNumber}</span>],
                  ['Cari', (r) => <span>{r.customerName}<br /><small style={{ color: FAINT }}>{r.customerCode}</small></span>],
                  ['Durum', (r) => r.issue],
                  ['Tutar', (r) => <b>{formatCurrency(r.grandTotal)}</b>],
                  ['Vade', (r) => fmtDate(r.validityDate)],
                  ['Islem', (r) => (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionLink href={r.actionUrl}>Teklifi ac</ActionLink>
                      <button
                        type="button"
                        style={actionBtn}
                        disabled={busyAction === `task:quote:${r.id}`}
                        onClick={() => handleCreateTask('quote', r)}
                      >
                        <ClipboardList size={12} />
                        Gorev
                      </button>
                    </div>
                  )],
                ]}
              />
            </Section>

            <Section title="5.2 Sepet Terk ve Hatirlatma" icon={<ShoppingCart size={16} color={PRIMARY} />}>
              <SimpleTable
                rows={data.abandonedCarts?.rows || []}
                empty="Bekleyen terk sepet yok."
                columns={[
                  ['Cari', (r) => <span>{r.customerName}<br /><small style={{ color: FAINT }}>{r.customerCode}</small></span>],
                  ['Bekleme', (r) => `${r.daysIdle} gun`],
                  ['Kalem', (r) => r.itemCount],
                  ['Tutar', (r) => <b>{formatCurrency(r.totalAmount)}</b>],
                  ['Ilk urunler', (r) => (r.firstItems || []).map((i: any) => i.productName).join(', ')],
                  ['Islem', (r) => (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionLink href={r.actionUrl}>Sepeti ac</ActionLink>
                      <button
                        type="button"
                        style={{ ...actionBtn, borderColor: '#fecaca', color: RED }}
                        disabled={busyAction === `cart:${r.cartId}`}
                        onClick={() => handleClearCart(r)}
                      >
                        <Trash2 size={12} />
                        Temizle
                      </button>
                      <button
                        type="button"
                        style={actionBtn}
                        disabled={busyAction === `task:cart:${r.cartId}`}
                        onClick={() => handleCreateTask('cart', r)}
                      >
                        <ClipboardList size={12} />
                        Gorev
                      </button>
                    </div>
                  )],
                ]}
              />
            </Section>

            <Section title="5.3 Tamamlayici Urun Motoru" icon={<Sparkles size={16} color={PRIMARY} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <Kpi label="Aktif urun" value={data.complementHealth.summary.activeProducts} />
                <Kpi label="Oto oneri" value={data.complementHealth.summary.autoRecommendations} tone="green" />
                <Kpi label="Manuel" value={data.complementHealth.summary.manualRecommendations} tone="green" />
                <Kpi label="Bos kalan" value={data.complementHealth.summary.productsWithoutComplements} tone="amber" />
              </div>
            </Section>

            <Section title="6.1 Gorsel Kalite Workflow + 6.3 Katalog Skoru" icon={<ImageIcon size={16} color={PRIMARY} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
                <Kpi label="Skor" value={`${data.catalogScore.summary.score}/100`} tone={data.catalogScore.summary.score >= 75 ? 'green' : 'red'} />
                <Kpi label="Eksik gorsel" value={data.catalogScore.summary.missingImageCount} tone="amber" />
                <Kpi label="Kategori eksik" value={data.catalogScore.summary.missingCategoryCount} tone="amber" />
                <Kpi label="Birim/KDV hata" value={data.catalogScore.summary.invalidUnitCount + data.catalogScore.summary.invalidVatCount} tone="red" />
              </div>
              <SimpleTable
                rows={data.imageQuality?.missingImageProducts || []}
                empty="Eksik gorsel yok."
                columns={[
                  ['Kod', (r) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{r.mikroCode}</span>],
                  ['Urun', (r) => r.name],
                  ['Populerlik', (r) => Number(r.popularSalesValue || 0).toLocaleString('tr-TR')],
                  ['Islem', (r) => (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionLink href={r.actionUrl}>Urun</ActionLink>
                      <ActionLink href={r.imageIssueUrl}>Gorsel</ActionLink>
                      <label style={{ ...actionBtn, margin: 0 }}>
                        <Upload size={12} />
                        Yukle
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          disabled={busyAction === `image:${r.id}`}
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            event.currentTarget.value = '';
                            handleImageUpload(r, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        style={actionBtn}
                        disabled={busyAction === `task:image:${r.id}`}
                        onClick={() => handleCreateTask('image', r)}
                      >
                        <ClipboardList size={12} />
                        Gorev
                      </button>
                    </div>
                  )],
                ]}
              />
            </Section>

            <Section title="6.2 Paket Performans Raporu" icon={<Box size={16} color={PRIMARY} />}>
              <SimpleTable
                rows={data.bundlePerformance?.rows || []}
                empty="Son 90 gunde paket satisi yok."
                columns={[
                  ['Paket', (r) => r.bundleName || '-'],
                  ['Satir', (r) => r.lineCount],
                  ['Miktar', (r) => r.quantity],
                  ['Tutar', (r) => <b>{formatCurrency(r.amount)}</b>],
                ]}
              />
            </Section>

            <Section title="6.4 Paket Onerici" icon={<PackagePlus size={16} color={PRIMARY} />}>
              <SimpleTable
                rows={data.bundleSuggestions?.rows || []}
                empty="Paket onerisi yok."
                columns={[
                  ['Oneri', (r) => <b>{r.title}</b>],
                  ['Skor', (r) => r.score],
                  ['Neden', (r) => r.reason],
                ]}
              />
            </Section>

            <Section title="9.1 Saha Ziyaret Planlayici" icon={<MapPin size={16} color={PRIMARY} />}>
              <SimpleTable
                rows={data.fieldVisitPlanner?.rows || []}
                empty="Ziyaret adayi yok."
                columns={[
                  ['Cari', (r) => <span>{r.customerName}<br /><small style={{ color: FAINT }}>{r.customerCode}</small></span>],
                  ['Skor', (r) => <b>{r.priorityScore}</b>],
                  ['Vade', (r) => formatCurrency(r.pastDueBalance)],
                  ['Sepet', (r) => formatCurrency(r.cartAmount)],
                  ['Aksiyon', (r) => r.suggestedAction],
                  ['Islem', (r) => (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionLink href={r.actionUrl}>Saha</ActionLink>
                      <ActionLink href={r.customer360Url}>360</ActionLink>
                      <button
                        type="button"
                        style={actionBtn}
                        disabled={busyAction === `task:visit:${r.customerId}`}
                        onClick={() => handleCreateTask('visit', r)}
                      >
                        <ClipboardList size={12} />
                        Gorev
                      </button>
                    </div>
                  )],
                ]}
              />
            </Section>

            <Section title="10.4 Anomali Radar" icon={<AlertTriangle size={16} color={RED} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <Kpi label="Suresi gecen teklif" value={data.anomalyRadar.summary.expiredOpenQuotes} tone="red" />
                <Kpi label="Bekleyen siparis" value={data.anomalyRadar.summary.stalePendingOrders} tone="amber" />
                <Kpi label="Eski sepet" value={data.anomalyRadar.summary.staleCarts} tone="amber" />
                <Kpi label="Kritik katalog" value={data.anomalyRadar.summary.catalogBlockedChecks} tone="red" />
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
