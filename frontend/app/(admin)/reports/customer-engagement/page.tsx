'use client';

/**
 * Cari Aktivite / Temas Takibi raporu.
 *
 * Satisci, kendi carilerinin B2B siteye girip girmedigini, ne siklikla
 * girdigini, siparislerini ve temas/hatirlatma gecmisini takip eder.
 * Satiscilar yalnizca kendi carilerini gorur; admin/yonetici hepsini gorur
 * (yetki backend'de uygulanir, burada sadece render edilir).
 *
 * Tasarim referansi: reports/customer-recovery (CariGeriKazanimNew) rapor stili.
 * Beyaz kart #fff / border #e7ebf2 / radius 12px; primary #15356b;
 * ink #14223b/#51607a/#8b97ac; emerald/amber/red rozetler; EMOJI YOK; lucide ikon.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';
import adminApi, {
  type EngagementReport,
  type EngagementRow,
  type EngagementStatus,
  type ContactLogEntry,
  type ContactInput,
} from '@/lib/api/admin';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  MessageSquarePlus,
  PhoneCall,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';

// ==================== tasarim tokenlari ====================
const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';
const RED = '#b91c1c';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
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
  boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

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
};
const primaryBtn: React.CSSProperties = { ...headBtn, background: PRIMARY, color: '#fff', border: 'none' };

// ==================== sabitler ====================
const PAGE_SIZE = 50;

const STATUS_META: Record<EngagementStatus, { label: string; bg: string; color: string; border: string }> = {
  KAYITSIZ: { label: 'Kayıtsız', bg: '#eef1f6', color: MUTED, border: '#e3e8f0' },
  HIC_GIRMEMIS: { label: 'Hiç girmemiş', bg: '#fef2f2', color: RED, border: '#fecaca' },
  AKTIF: { label: 'Aktif', bg: '#ecfdf5', color: EMERALD, border: '#a7f3d0' },
  YAVASLIYOR: { label: 'Yavaşlıyor', bg: '#fffbeb', color: AMBER, border: '#fde68a' },
  KAYIP_RISKI: { label: 'Kayıp riski', bg: '#fef2f2', color: '#7f1d1d', border: '#fca5a5' },
};

const PRIORITY_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CRITICAL: { label: 'Acil', bg: '#fef2f2', color: RED, border: '#fecaca' },
  HIGH: { label: 'Yuksek', bg: '#fff7ed', color: AMBER, border: '#fed7aa' },
  MEDIUM: { label: 'Orta', bg: '#fffbeb', color: AMBER, border: '#fde68a' },
  LOW: { label: 'Dusuk', bg: '#ecfdf5', color: EMERALD, border: '#a7f3d0' },
};

const healthColor = (score?: number | null) => {
  const value = Number(score || 0);
  if (value >= 75) return EMERALD;
  if (value >= 55) return AMBER;
  return RED;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'KAYITSIZ', label: 'Kayıtsız' },
  { value: 'HIC_GIRMEMIS', label: 'Hiç girmemiş' },
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'YAVASLIYOR', label: 'Yavaşlıyor' },
  { value: 'KAYIP_RISKI', label: 'Kayıp riski' },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'urgency', label: 'Öncelik' },
  { value: 'orderTotalDesc', label: 'En çok sipariş' },
  { value: 'lastLoginAsc', label: 'En eski giriş' },
  { value: 'lastLoginDesc', label: 'En yeni giriş' },
  { value: 'lastContactAsc', label: 'En eski temas' },
  { value: 'nameAsc', label: 'İsim' },
];

const CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Genel', label: 'Genel' },
  { value: 'Telefon', label: 'Telefon' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Ziyaret', label: 'Ziyaret' },
  { value: 'SMS', label: 'SMS' },
];

const OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '-' },
  { value: 'Girdi', label: 'Girdi' },
  { value: 'Söz verdi', label: 'Söz verdi' },
  { value: 'İlgilenmiyor', label: 'İlgilenmiyor' },
];

// ==================== yardimcilar ====================
const safeDate = (value?: string | null): string => {
  if (!value) return '-';
  try {
    return formatDateShort(value);
  } catch {
    return value.slice(0, 10);
  }
};

const safeDateTime = (value?: string | null): string => {
  if (!value) return '-';
  try {
    return formatDate(value);
  } catch {
    return value.slice(0, 16);
  }
};

const daysAgoLabel = (days: number | null): string => {
  if (days === null || days === undefined) return '';
  if (days <= 0) return 'bugün';
  return `${days} gün önce`;
};

// ==================== KPI kart ====================
function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'red' | 'primary';
  icon?: React.ReactNode;
}) {
  const toneColor =
    tone === 'emerald' ? EMERALD : tone === 'amber' ? AMBER : tone === 'red' ? RED : tone === 'primary' ? PRIMARY : INK;
  return (
    <div style={{ ...cardStyle, padding: '11px 13px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: FAINT, fontSize: 11, fontWeight: 600 }}>
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 21, fontWeight: 800, color: toneColor, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{sub}</div> : null}
    </div>
  );
}

// ==================== Durum rozeti ====================
function StatusBadge({ status }: { status: EngagementStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

function ScrollText({
  children,
  maxHeight = 38,
  title,
  weight = 500,
  color = INK,
}: {
  children: React.ReactNode;
  maxHeight?: number;
  title?: string;
  weight?: number;
  color?: string;
}) {
  return (
    <div
      title={title}
      style={{
        maxHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        lineHeight: 1.28,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        paddingRight: 3,
        color,
        fontWeight: weight,
        scrollbarWidth: 'thin',
      }}
    >
      {children}
    </div>
  );
}

const tableHeadCell: React.CSSProperties = {
  padding: '9px 12px',
  fontWeight: 600,
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: TABLE_HEAD_BG,
  borderBottom: `1px solid ${LINE}`,
};

const tableCell: React.CSSProperties = {
  padding: '7px 10px',
  verticalAlign: 'top',
  height: 76,
  boxSizing: 'border-box',
};

const compactTextCell: React.CSSProperties = {
  padding: '7px 10px',
  verticalAlign: 'top',
  lineHeight: 1.28,
  height: 76,
  boxSizing: 'border-box',
};

export default function Page() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'HEAD_ADMIN' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // ---- filtre state ----
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('urgency');
  const [followUpDue, setFollowUpDue] = useState(false);
  const [page, setPage] = useState(1);

  // ---- veri state ----
  const [report, setReport] = useState<EngagementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [repOpen, setRepOpen] = useState(false);

  // hatirlatildi butonu icin satir bazli yukleniyor durumu
  const [tickingCode, setTickingCode] = useState<string | null>(null);

  // ---- temas/not modal state ----
  const [modalRow, setModalRow] = useState<EngagementRow | null>(null);
  const [contacts, setContacts] = useState<ContactLogEntry[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [formNote, setFormNote] = useState('');
  const [formChannel, setFormChannel] = useState('Genel');
  const [formOutcome, setFormOutcome] = useState('');
  const [formFollowUp, setFormFollowUp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---- arama debounce ----
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---- rapor cek ----
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getCustomerEngagement({
        search: search || undefined,
        status: status || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
        followUpDue: followUpDue || undefined,
      });
      setReport(data);
      setForbidden(false);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setForbidden(true);
        setReport(null);
      } else {
        setError(err?.response?.data?.error || 'Rapor yüklenemedi');
      }
    } finally {
      setLoading(false);
    }
  }, [search, status, sort, page, followUpDue]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const rows = report?.rows ?? [];
  const kpis = report?.kpis;
  const repBreakdown = report?.repBreakdown ?? [];
  const total = report?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- Hatirlatildi (hizli tik) ----
  const handleQuickReminder = async (row: EngagementRow) => {
    setTickingCode(row.customerCode);
    try {
      await adminApi.addCustomerEngagementContact(row.customerCode, {});
      const nowIso = new Date().toISOString();
      // optimistik: satirin son hatirlatma bilgisini guncelle
      setReport((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.customerCode === row.customerCode
                  ? {
                      ...r,
                      lastContactAt: nowIso,
                      lastContactByName: user?.name || r.lastContactByName,
                      contactCount: r.contactCount + 1,
                    }
                  : r
              ),
            }
          : prev
      );
      toast.success('Hatırlatıldı olarak işaretlendi');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'İşaretlenemedi');
    } finally {
      setTickingCode(null);
    }
  };

  // ---- Modal ac ----
  const openContactModal = async (row: EngagementRow) => {
    setModalRow(row);
    setContacts([]);
    setFormNote('');
    setFormChannel('Genel');
    setFormOutcome('');
    setFormFollowUp('');
    setContactsLoading(true);
    try {
      const data = await adminApi.getCustomerEngagementContacts(row.customerCode);
      setContacts(data.contacts || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Temas geçmişi yüklenemedi');
    } finally {
      setContactsLoading(false);
    }
  };

  const closeModal = () => {
    setModalRow(null);
    setContacts([]);
  };

  const submitContact = async () => {
    if (!modalRow) return;
    setSubmitting(true);
    try {
      const payload: ContactInput = {
        customerName: modalRow.customerName,
        note: formNote.trim() || undefined,
        channel: formChannel || undefined,
        outcome: formOutcome || undefined,
        followUpDate: formFollowUp || null,
      };
      const res = await adminApi.addCustomerEngagementContact(modalRow.customerCode, payload);
      // gecmisi yeniden cek
      const data = await adminApi.getCustomerEngagementContacts(modalRow.customerCode);
      setContacts(data.contacts || []);
      // satiri optimistik guncelle
      const nowIso = res.contact?.contactedAt || new Date().toISOString();
      setReport((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.customerCode === modalRow.customerCode
                  ? {
                      ...r,
                      lastContactAt: nowIso,
                      lastContactByName: user?.name || r.lastContactByName,
                      contactCount: r.contactCount + 1,
                      hasNotes: r.hasNotes || Boolean(formNote.trim()),
                      nextFollowUpDate: formFollowUp || r.nextFollowUpDate,
                    }
                  : r
              ),
            }
          : prev
      );
      setFormNote('');
      setFormOutcome('');
      setFormFollowUp('');
      toast.success('Temas kaydedildi');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Temas kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Excel export (mevcut sayfadaki satirlar) ----
  const handleExport = () => {
    if (!rows.length) {
      toast.error('Dışa aktarılacak satır yok');
      return;
    }
    try {
      const header = [
        'Cari Kod',
        'Cari Ad',
        'Şehir',
        'Telefon',
        'Durum',
        'Saglik Skoru',
        'Aksiyon Onceligi',
        'Onerilen Aksiyon',
        'Aksiyon Nedeni',
        'B2B Kayıtlı',
        'Son Giriş',
        'Giriş Sayısı',
        'Sıklık (gün)',
        'Sipariş Adet',
        'Sipariş Toplam',
        'Sipariş Ort.',
        'Son Sipariş',
        'Bakiye',
        ...(isAdmin ? ['Satış Temsilcisi'] : []),
        'Son Hatırlatma',
        'Son Hatırlatan',
        'Sonraki Takip',
      ];
      const body = rows.map((r) => [
        r.customerCode,
        r.customerName,
        r.city || '',
        r.phone || '',
        STATUS_META[r.status]?.label || r.status,
        r.healthScore ?? 0,
        PRIORITY_META[r.actionPriority]?.label || r.actionPriority || '',
        r.suggestedAction || '',
        r.actionReason || '',
        r.registered ? 'Evet' : 'Hayır',
        r.lastLoginAt ? safeDate(r.lastLoginAt) : 'Hiç',
        r.loginCount,
        r.loginFrequencyDays ?? '',
        r.orderCount,
        r.orderTotal,
        r.orderAvg,
        r.lastOrderAt ? safeDate(r.lastOrderAt) : '',
        r.balance,
        ...(isAdmin ? [r.assignedSalesRepName || ''] : []),
        r.lastContactAt ? safeDate(r.lastContactAt) : '',
        r.lastContactByName || '',
        r.nextFollowUpDate ? safeDate(r.nextFollowUpDate) : '',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cari Aktivite');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `cari-aktivite-${stamp}.xlsx`);
    } catch (err) {
      console.error('Excel export hatasi:', err);
      toast.error('Excel oluşturulamadı');
    }
  };

  const colSpan = isAdmin ? 13 : 12;

  return (
    <div style={{ padding: '20px 22px', maxWidth: 1500, margin: '0 auto', fontFamily: 'inherit', color: INK }}>
      <style jsx global>{`
        .customer-engagement-table tbody tr {
          height: 76px;
        }
        .customer-engagement-table tbody td {
          height: 76px;
          max-height: 76px;
          overflow: hidden;
        }
        .customer-engagement-table tbody td > div {
          max-height: 62px;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
        }
        .customer-engagement-table tbody td:last-child > div {
          max-height: 42px;
          overflow-y: visible;
        }
      `}</style>
      {/* Baslik */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <UserCheck width={22} height={22} stroke={PRIMARY} strokeWidth={2.2} />
            Cari Aktivite / Temas Takibi
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED }}>
            Carilerinizin B2B siteye giriş, sipariş ve temas geçmişini takip edin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={headBtn} onClick={handleExport} disabled={!rows.length}>
            <Download width={14} height={14} strokeWidth={2} />
            Excel
          </button>
          <button type="button" style={headBtn} onClick={() => fetchReport()} disabled={loading}>
            <RefreshCw width={14} height={14} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
            Yenile
          </button>
        </div>
      </div>

      {/* KPI seridi */}
      {kpis && (
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
            gap: 10,
          }}
        >
          <KpiCard label="Toplam cari" value={kpis.total} icon={<Users width={13} height={13} stroke={FAINT} strokeWidth={2} />} tone="primary" />
          <KpiCard
            label="B2B kayıtlı"
            value={kpis.registered}
            sub={`%${kpis.registeredPct} kayıtlı`}
            tone="emerald"
            icon={<UserCheck width={13} height={13} stroke={FAINT} strokeWidth={2} />}
          />
          <KpiCard label="Kayıtsız" value={kpis.unregistered} tone="default" icon={<UserX width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Hiç girmemiş" value={kpis.neverLoggedIn} tone="red" icon={<AlertTriangle width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Son 30g aktif" value={kpis.active30} tone="emerald" icon={<Activity width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Kayıp riski" value={kpis.atRisk} tone="red" icon={<AlertTriangle width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Bugün aranacak" value={kpis.followUpDue} tone="amber" icon={<PhoneCall width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Hiç temas edilmemiş" value={kpis.neverContacted} tone="amber" icon={<MessageSquarePlus width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Aksiyon bekleyen" value={kpis.actionDue ?? 0} tone="red" icon={<AlertTriangle width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
          <KpiCard label="Portfoy sagligi" value={`${kpis.avgHealthScore ?? 0}/100`} tone={(kpis.avgHealthScore ?? 0) >= 75 ? 'emerald' : (kpis.avgHealthScore ?? 0) >= 55 ? 'amber' : 'red'} icon={<Activity width={13} height={13} stroke={FAINT} strokeWidth={2} />} />
        </div>
      )}

      {/* Filtre cubugu */}
      <div style={{ ...cardStyle, marginTop: 14, padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px', minWidth: 200 }}>
          <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Ara (cari kod / ad)</label>
          <div style={{ position: 'relative' }}>
            <Search width={14} height={14} stroke={FAINT} strokeWidth={2} style={{ position: 'absolute', left: 10, top: 11, pointerEvents: 'none' }} />
            <input
              style={{ ...inputStyle, paddingLeft: 30 }}
              placeholder="Cari kodu veya adı..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Durum</label>
          <select
            style={selectStyle}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: '0 0 175px' }}>
          <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Sırala</label>
          <select
            style={selectStyle}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          style={followUpDue ? { ...primaryBtn, background: AMBER } : headBtn}
          onClick={() => {
            setFollowUpDue((v) => !v);
            setPage(1);
          }}
        >
          <PhoneCall width={14} height={14} strokeWidth={2} />
          Bugün aranacaklar
        </button>
      </div>

      {/* Satisci kirilimi (admin) */}
      {isAdmin && repBreakdown.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 12, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setRepOpen((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '11px 14px',
              background: TABLE_HEAD_BG,
              border: 'none',
              borderBottom: repOpen ? `1px solid ${LINE}` : 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              color: INK,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Users width={15} height={15} stroke={PRIMARY} strokeWidth={2} />
              Satış Temsilcisi Kırılımı ({repBreakdown.length})
            </span>
            <span style={{ fontSize: 12, color: MUTED }}>{repOpen ? 'Gizle' : 'Göster'}</span>
          </button>
          {repOpen && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#fff', color: FAINT, textAlign: 'left' }}>
                    <th style={{ padding: '8px 14px', fontWeight: 600 }}>Temsilci</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Toplam</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Kayıtlı</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Kayıtsız</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Hiç girmemiş</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Kayıp riski</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Aksiyon</th>
                    <th style={{ padding: '8px 14px', fontWeight: 600, textAlign: 'right' }}>Saglik</th>
                  </tr>
                </thead>
                <tbody>
                  {repBreakdown.map((rb) => (
                    <tr key={rb.rep} style={{ borderTop: `1px solid ${ROW_LINE}` }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: INK }}>{rb.rep}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>{rb.total}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: EMERALD }}>{rb.registered}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: MUTED }}>{rb.unregistered}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: RED }}>{rb.neverLoggedIn}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: RED }}>{rb.atRisk}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: AMBER }}>{rb.actionDue ?? 0}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: healthColor(rb.avgHealthScore), fontWeight: 700 }}>{rb.avgHealthScore ?? 0}/100</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tablo */}
      <div style={{ ...cardStyle, marginTop: 14, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'min(62vh, 720px)', minHeight: 360 }}>
          <table className="customer-engagement-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, minWidth: isAdmin ? 1730 : 1590, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 245 }} />
              <col style={{ width: 135 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 250 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 115 }} />
              <col style={{ width: 115 }} />
              <col style={{ width: 165 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              {isAdmin && <col style={{ width: 135 }} />}
              <col style={{ width: 205 }} />
              <col style={{ width: 230 }} />
            </colgroup>
            <thead>
              <tr style={{ background: TABLE_HEAD_BG, color: FAINT, textAlign: 'left' }}>
                <th style={tableHeadCell}>Cari</th>
                <th style={tableHeadCell}>Durum</th>
                <th style={tableHeadCell}>Saglik</th>
                <th style={tableHeadCell}>Oneri</th>
                <th style={tableHeadCell}>Kayıt</th>
                <th style={tableHeadCell}>Son giriş</th>
                <th style={tableHeadCell}>Sıklık</th>
                <th style={tableHeadCell}>Sipariş</th>
                <th style={tableHeadCell}>Son sipariş</th>
                <th style={{ ...tableHeadCell, textAlign: 'right' }}>Bakiye</th>
                {isAdmin && <th style={tableHeadCell}>Temsilci</th>}
                <th style={tableHeadCell}>Son hatırlatma</th>
                <th style={{ ...tableHeadCell, textAlign: 'right' }}>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} style={{ padding: 40, textAlign: 'center', color: MUTED }}>
                    <RefreshCw width={18} height={18} className="animate-spin" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                    Yükleniyor...
                  </td>
                </tr>
              ) : forbidden ? (
                <tr>
                  <td colSpan={colSpan} style={{ padding: 40, textAlign: 'center', color: MUTED }}>
                    Size atanmış sektör/cari bulunmuyor. Görüntülenecek kayıt yok.
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={colSpan} style={{ padding: 40, textAlign: 'center', color: RED }}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} style={{ padding: 40, textAlign: 'center', color: MUTED }}>
                    Filtrelere uyan cari bulunamadı.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.customerCode} style={{ borderTop: `1px solid ${ROW_LINE}`, height: 76 }}>
                    {/* Cari */}
                    <td style={tableCell}>
                      <ScrollText maxHeight={34} title={r.customerName} weight={700}>
                        {r.customerName}
                      </ScrollText>
                      <ScrollText maxHeight={30} title={`${r.customerCode}${r.city ? ` - ${r.city}` : ''}${r.phone ? ` - ${r.phone}` : ''}`} color={FAINT} weight={500}>
                        <span style={{ fontSize: 11.5 }}>
                          {r.customerCode}
                          {r.city ? ` · ${r.city}` : ''}
                          {r.phone ? ` · ${r.phone}` : ''}
                        </span>
                      </ScrollText>
                    </td>

                    {/* Durum */}
                    <td style={compactTextCell}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <StatusBadge status={r.status} />
                        {!r.registered && (
                          <span style={{ fontSize: 10.5, color: FAINT, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            B2B hesabı yok
                            <Link href="/customers" style={{ color: PRIMARY, fontWeight: 600, textDecoration: 'underline' }}>
                              Hesap aç
                            </Link>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Saglik */}
                    <td style={compactTextCell}>
                      <div style={{ color: healthColor(r.healthScore), fontWeight: 800 }}>{r.healthScore ?? 0}/100</div>
                      <div style={{ marginTop: 4, width: 72, height: 5, borderRadius: 999, background: '#eef1f6', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, r.healthScore ?? 0))}%`, height: '100%', background: healthColor(r.healthScore) }} />
                      </div>
                    </td>

                    {/* Oneri */}
                    <td style={tableCell}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: PRIORITY_META[r.actionPriority]?.bg || '#eef1f6',
                          color: PRIORITY_META[r.actionPriority]?.color || MUTED,
                          border: `1px solid ${PRIORITY_META[r.actionPriority]?.border || LINE}`,
                        }}
                      >
                        {PRIORITY_META[r.actionPriority]?.label || r.actionPriority || '-'}
                      </span>
                      <div style={{ marginTop: 4 }}>
                        <ScrollText maxHeight={28} title={r.suggestedAction || '-'} weight={600}>
                          <span style={{ fontSize: 11.5 }}>{r.suggestedAction || '-'}</span>
                        </ScrollText>
                      </div>
                      {r.actionReason ? (
                        <div style={{ marginTop: 2 }}>
                          <ScrollText maxHeight={28} title={r.actionReason} color={FAINT} weight={500}>
                            <span style={{ fontSize: 10.5 }}>{r.actionReason}</span>
                          </ScrollText>
                        </div>
                      ) : null}
                    </td>

                    {/* Kayit */}
                    <td style={compactTextCell}>
                      {r.registered ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: EMERALD, fontWeight: 600, fontSize: 11.5 }}>
                          <CheckCircle2 width={13} height={13} strokeWidth={2.2} />
                          Kayıtlı
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: AMBER,
                            fontWeight: 600,
                            fontSize: 11.5,
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: 6,
                            padding: '1px 6px',
                          }}
                        >
                          <AlertTriangle width={12} height={12} strokeWidth={2.2} />
                          Kayıtsız
                        </span>
                      )}
                    </td>

                    {/* Son giris */}
                    <td style={compactTextCell}>
                      {r.lastLoginAt ? (
                        <div>
                          <div style={{ color: INK }}>{safeDate(r.lastLoginAt)}</div>
                          {r.daysSinceLastLogin !== null && (
                            <div style={{ fontSize: 11, color: FAINT }}>{daysAgoLabel(r.daysSinceLastLogin)}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: FAINT }}>Hiç</span>
                      )}
                    </td>

                    {/* Siklik */}
                    <td style={{ ...compactTextCell, color: MUTED }}>
                      {r.loginFrequencyDays ? `~${r.loginFrequencyDays} günde bir` : '-'}
                    </td>

                    {/* Siparis */}
                    <td style={compactTextCell}>
                      {r.orderCount > 0 ? (
                        <div>
                          <div style={{ color: INK, fontWeight: 600 }}>
                            {r.orderCount} adet · {formatCurrency(r.orderTotal)}
                          </div>
                          <div style={{ fontSize: 11, color: FAINT }}>ort {formatCurrency(r.orderAvg)}</div>
                        </div>
                      ) : (
                        <span style={{ color: FAINT }}>-</span>
                      )}
                    </td>

                    {/* Son siparis */}
                    <td style={{ ...compactTextCell, color: MUTED }}>{r.lastOrderAt ? safeDate(r.lastOrderAt) : '-'}</td>

                    {/* Bakiye */}
                    <td style={{ ...compactTextCell, textAlign: 'right', color: r.balance > 0 ? RED : INK, fontWeight: 600 }}>
                      {formatCurrency(r.balance)}
                    </td>

                    {/* Temsilci (admin) */}
                    {isAdmin && (
                      <td style={tableCell}>
                        <ScrollText maxHeight={38} title={r.assignedSalesRepName || '-'} color={MUTED} weight={500}>
                          {r.assignedSalesRepName || '-'}
                        </ScrollText>
                      </td>
                    )}

                    {/* Son hatirlatma */}
                    <td style={tableCell}>
                      {r.lastContactAt ? (
                        <ScrollText
                          maxHeight={42}
                          title={`${safeDate(r.lastContactAt)}${r.lastContactByName ? ` (${r.lastContactByName})` : ''}`}
                          color={EMERALD}
                          weight={600}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                          >
                            {safeDate(r.lastContactAt)}
                            {r.lastContactByName ? ` (${r.lastContactByName})` : ''}
                          </span>
                        </ScrollText>
                      ) : (
                        <span style={{ color: FAINT, fontSize: 11.5 }}>Henüz yok</span>
                      )}
                      {r.hasNotes && (
                        <div style={{ marginTop: 3, fontSize: 10.5, color: PRIMARY, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <MessageSquarePlus width={11} height={11} strokeWidth={2} /> not var
                        </div>
                      )}
                    </td>

                    {/* Aksiyon */}
                    <td style={{ ...tableCell, verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleQuickReminder(r)}
                          disabled={tickingCode === r.customerCode}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#047857',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 11.5,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: tickingCode === r.customerCode ? 'default' : 'pointer',
                            opacity: tickingCode === r.customerCode ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <CheckCircle2 width={13} height={13} strokeWidth={2.3} />
                          Hatırlatıldı
                        </button>
                        <button
                          type="button"
                          onClick={() => openContactModal(r)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#fff',
                            color: MUTED,
                            border: '1px solid #d8e0ec',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 11.5,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <MessageSquarePlus width={13} height={13} strokeWidth={2} />
                          Temas / Not
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sayfalama */}
        {!loading && !forbidden && rows.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderTop: `1px solid ${LINE}`,
              fontSize: 12.5,
              color: MUTED,
            }}
          >
            <span>
              Toplam <b style={{ color: INK }}>{total}</b> cari · Sayfa {page}/{totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                style={{ ...headBtn, height: 32, opacity: page <= 1 ? 0.5 : 1 }}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </button>
              <button
                type="button"
                style={{ ...headBtn, height: 32, opacity: page >= totalPages ? 0.5 : 1 }}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Temas / Not modal */}
      {modalRow && (
        <Modal
          isOpen={Boolean(modalRow)}
          onClose={closeModal}
          title={`Temas / Not — ${modalRow.customerName}`}
          size="lg"
        >
          <div style={{ fontFamily: 'inherit', color: INK }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              {modalRow.customerCode}
              {modalRow.phone ? ` · ${modalRow.phone}` : ''}
              {modalRow.nextFollowUpDate ? ` · Sonraki takip: ${safeDate(modalRow.nextFollowUpDate)}` : ''}
            </div>

            {/* Gecmis */}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Temas Geçmişi</div>
            {contactsLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
                <RefreshCw width={16} height={16} className="animate-spin" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                Yükleniyor...
              </div>
            ) : contacts.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: FAINT, fontSize: 12.5, background: '#fafbfd', border: `1px solid ${LINE}`, borderRadius: 8 }}>
                Henüz temas kaydı yok.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {contacts.map((c) => (
                  <div key={c.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 11px', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{safeDateTime(c.contactedAt)}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {c.channel && (
                          <span style={{ fontSize: 10.5, fontWeight: 600, background: '#eef2fa', color: '#1c4585', border: '1px solid #d6e0f1', borderRadius: 6, padding: '1px 7px' }}>
                            {c.channel}
                          </span>
                        )}
                        {c.outcome && (
                          <span style={{ fontSize: 10.5, fontWeight: 600, background: '#f0fdf4', color: EMERALD, border: '1px solid #bbf7d0', borderRadius: 6, padding: '1px 7px' }}>
                            {c.outcome}
                          </span>
                        )}
                      </div>
                    </div>
                    {c.contactedByName && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{c.contactedByName}</div>}
                    {c.note && <div style={{ fontSize: 12.5, color: INK, marginTop: 5, whiteSpace: 'pre-wrap' }}>{c.note}</div>}
                    {c.followUpDate && (
                      <div style={{ fontSize: 11, color: AMBER, marginTop: 5, fontWeight: 600 }}>
                        Sonraki takip: {safeDate(c.followUpDate)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Ekle formu */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Yeni Temas Ekle</div>
              <textarea
                style={{ ...inputStyle, height: 70, padding: '8px 10px', resize: 'vertical' }}
                placeholder="Not (opsiyonel)..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Kanal</label>
                  <select style={selectStyle} value={formChannel} onChange={(e) => setFormChannel(e.target.value)}>
                    {CHANNEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Sonuç (ops.)</label>
                  <select style={selectStyle} value={formOutcome} onChange={(e) => setFormOutcome(e.target.value)}>
                    {OUTCOME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>Sonraki takip (ops.)</label>
                  <input type="date" style={inputStyle} value={formFollowUp} onChange={(e) => setFormFollowUp(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button type="button" style={headBtn} onClick={closeModal} disabled={submitting}>
                  Kapat
                </button>
                <button type="button" style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1 }} onClick={submitContact} disabled={submitting}>
                  {submitting ? 'Kaydediliyor...' : 'Temas Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
