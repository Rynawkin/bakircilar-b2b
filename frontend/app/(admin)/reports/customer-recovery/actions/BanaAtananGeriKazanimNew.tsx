'use client';

import Link from 'next/link';
import {
  ChevronRight,
  ArrowLeft,
  Search,
  RefreshCw,
  Save,
  CheckCircle2,
  Inbox,
} from 'lucide-react';
import { useBanaAtananGeriKazanim, toDateInputValue } from './useBanaAtananGeriKazanim';

/**
 * Yeni gorunum: Bana Atanan Geri Kazanim Aksiyonlari.
 *
 * Tum mantik useBanaAtananGeriKazanim hook'undan gelir; hicbir handler/kolon/
 * filtre/ozet/satir-aksiyon dusurulmemistir:
 *  - Filtreler: Durum select / Cari-not arama (Enter ile listele) / "Sadece takip
 *    tarihi gecenler" checkbox / Listele butonu.
 *  - Ozet: Toplam aksiyon (pagination.totalRecords).
 *  - Tablo: Cari (ad/kod/atayan+tarih) | Aksiyon (status/actionType/priority
 *    rozetleri + not) | Takip (draft Durum select + Takip tarihi) | Durum notu
 *    (outcome textarea) | İşlem (Kaydet + Kapat).
 *  - Sayfalama: Onceki / Sonraki.
 *
 * Tasarim referansi: design HTML #scr-recact (data-screen-label="Bana Atanan Geri
 * Kazanım") + brief 4.11.8. Genel rapor stili: beyaz kart #fff / border #e7ebf2 /
 * radius 12px; tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac.
 */

const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';

// Tablo grid sablonu: basliklar ve satirlar ayni grid'i kullanir.
// Cari | Aksiyon | Takip (Durum + Tarih) | Durum Notu | İşlem
const GRID = '1.5fr 1.4fr 1.1fr 1.6fr 120px';

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

const cellRight: React.CSSProperties = { textAlign: 'right' };
const cellCenter: React.CSSProperties = { textAlign: 'center' };

// Status -> rozet stili (klasik Badge variant mantigi ile uyumlu)
const statusBadgeStyle = (status: string): React.CSSProperties => {
  if (status === 'DONE') {
    return {
      background: '#ecfdf5',
      border: '1px solid #a7f3d0',
      color: EMERALD,
    };
  }
  // OPEN / CANCELLED / diger -> warning (amber)
  return {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: AMBER,
  };
};

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 9.5,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 5,
  whiteSpace: 'nowrap',
};

const outlineBadge: React.CSSProperties = {
  ...badgeBase,
  background: '#fff',
  border: '1px solid #d8e0ec',
  color: MUTED,
};

export default function BanaAtananGeriKazanimNew() {
  const {
    actions,
    status,
    setStatus,
    search,
    setSearch,
    dueOnly,
    setDueOnly,
    page,
    setPage,
    pagination,
    loading,
    savingId,
    drafts,
    runSearch,
    updateDraft,
    saveAction,
    safeDate,
  } = useBanaAtananGeriKazanim();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb + geri linki */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          color: FAINT,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/reports/customer-recovery"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: PRIMARY,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Cari Geri Kazanım
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Bana Atanan Geri Kazanım</span>
      </div>

      {/* Header: baslik + Toplam aksiyon ozet kart */}
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
            }}
          >
            Bana Atanan Geri Kazanım
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Size atanan cari takiplerini kapatın, takip tarihini ve görüşme sonucunu güncelleyin
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            padding: '12px 16px',
            minWidth: 150,
          }}
        >
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam aksiyon</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 4 }}>
            {pagination.totalRecords}
          </div>
        </div>
      </div>

      {/* Filtreler: Durum / Cari-not arama / Sadece geciken / Listele */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: INK,
            marginBottom: 12,
          }}
        >
          Filtreler
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr auto auto',
            gap: 12,
            alignItems: 'end',
            flexWrap: 'wrap',
          }}
          className="recact-filter-grid"
        >
          <div>
            <label style={labelStyle}>Durum</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="OPEN">Acik</option>
              <option value="DONE">Tamamlanan</option>
              <option value="CANCELLED">Iptal</option>
              <option value="ALL">Tumu</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Cari / not ara</label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 36,
                border: '1px solid #e3e8f0',
                borderRadius: 8,
                padding: '0 10px',
                background: '#fff',
              }}
            >
              <Search size={14} strokeWidth={2} style={{ color: '#9aa6b8', flex: 'none' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch();
                }}
                placeholder="Cari kodu, cari adi veya not..."
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'none',
                  outline: 'none',
                  fontSize: 12.5,
                  color: INK,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              border: '1px solid #e3e8f0',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 12.5,
              color: MUTED,
              background: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => setDueOnly(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: PRIMARY }}
            />
            Sadece takip tarihi gecenler
          </label>

          <button
            type="button"
            onClick={runSearch}
            disabled={loading}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={loading ? 'animate-spin' : undefined}
            />
            Listele
          </button>
        </div>
      </div>

      {/* Tablo */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Aksiyonlarım</span>
          <span style={{ fontSize: 12, color: FAINT }}>
            Sayfa {pagination.page || page} / {pagination.totalPages || 0}, {pagination.totalRecords} kayit
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 980 }}>
            {/* Baslik satiri */}
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
              <span>Aksiyon</span>
              <span>Takip (Durum + Tarih)</span>
              <span>Durum Notu</span>
              <span style={cellCenter}>İşlem</span>
            </div>

            {/* Satirlar */}
            {loading ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <RefreshCw
                  size={30}
                  strokeWidth={2}
                  className="animate-spin"
                  style={{ margin: '0 auto 14px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Aksiyonlar yukleniyor...</p>
              </div>
            ) : actions.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <Inbox
                  size={30}
                  strokeWidth={2}
                  style={{ margin: '0 auto 10px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Filtrelere uygun aksiyon bulunamadi.</p>
              </div>
            ) : (
              actions.map((action) => {
                const draft = drafts[action.id] || {
                  status: action.status || 'OPEN',
                  outcome: action.outcome || '',
                  followUpDate: toDateInputValue(action.followUpDate),
                };
                const isSaving = savingId === action.id;
                return (
                  <div
                    key={action.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      gap: 10,
                      padding: '13px 16px',
                      borderTop: `1px solid ${ROW_LINE}`,
                      fontSize: 12,
                      color: INK,
                      alignItems: 'start',
                    }}
                  >
                    {/* Cari */}
                    <div>
                      <div style={{ fontWeight: 600, color: INK }}>{action.customerName || '-'}</div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: FAINT,
                          fontFamily: "'Roboto Mono', monospace",
                          marginTop: 2,
                        }}
                      >
                        {action.customerCode}
                      </div>
                      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 7 }}>
                        Atayan: {action.author?.name || '-'} / {safeDate(action.createdAt)}
                      </div>
                    </div>

                    {/* Aksiyon: rozetler + not */}
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
                        <span style={{ ...badgeBase, ...statusBadgeStyle(action.status) }}>
                          {action.status}
                        </span>
                        <span style={outlineBadge}>{action.actionType}</span>
                        <span style={outlineBadge}>{action.priority}</span>
                      </div>
                      <p
                        style={{
                          whiteSpace: 'pre-wrap',
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: MUTED,
                          margin: 0,
                        }}
                      >
                        {action.note}
                      </p>
                    </div>

                    {/* Takip: Durum select + takip tarihi */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div>
                        <label style={labelStyle}>Durum</label>
                        <select
                          value={draft.status}
                          onChange={(e) => updateDraft(action.id, { status: e.target.value })}
                          style={{ ...inputStyle, height: 34, fontSize: 12, cursor: 'pointer' }}
                        >
                          <option value="OPEN">Acik</option>
                          <option value="DONE">Tamamlandi</option>
                          <option value="CANCELLED">Iptal</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Takip tarihi</label>
                        <input
                          type="date"
                          value={draft.followUpDate}
                          onChange={(e) => updateDraft(action.id, { followUpDate: e.target.value })}
                          style={{ ...inputStyle, height: 34, fontSize: 12 }}
                        />
                      </div>
                    </div>

                    {/* Durum notu: outcome textarea */}
                    <div>
                      <textarea
                        value={draft.outcome}
                        onChange={(e) => updateDraft(action.id, { outcome: e.target.value })}
                        placeholder="Gorusme sonucu, musteri cevabi veya sonraki adim..."
                        style={{
                          minHeight: 96,
                          width: '100%',
                          border: '1px solid #e3e8f0',
                          borderRadius: 8,
                          padding: '8px 10px',
                          fontSize: 12,
                          color: INK,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          outline: 'none',
                          background: '#fff',
                        }}
                      />
                    </div>

                    {/* İşlem: Kaydet + Kapat */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 7,
                      }}
                    >
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => saveAction(action)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          height: 32,
                          padding: '0 10px',
                          border: `1px solid ${LINE}`,
                          borderRadius: 7,
                          background: '#fff',
                          color: INK,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          opacity: isSaving ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isSaving ? (
                          <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <Save size={13} strokeWidth={2} />
                        )}
                        Kaydet
                      </button>
                      {action.status !== 'DONE' && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveAction(action, true)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            height: 32,
                            padding: '0 10px',
                            border: 'none',
                            borderRadius: 7,
                            background: PRIMARY,
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            opacity: isSaving ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSaving ? (
                            <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} strokeWidth={2} />
                          )}
                          Kapat
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sayfalama: Onceki / Sonraki */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: `1px solid ${SOFT_LINE}`,
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            style={{
              ...headBtn,
              height: 32,
              fontSize: 12,
              color: MUTED,
              borderColor: '#d8e0ec',
              opacity: page <= 1 || loading ? 0.5 : 1,
              cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Onceki
          </button>
          <button
            type="button"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
            style={{
              ...headBtn,
              height: 32,
              fontSize: 12,
              color: MUTED,
              borderColor: '#d8e0ec',
              opacity: page >= pagination.totalPages || loading ? 0.5 : 1,
              cursor: page >= pagination.totalPages || loading ? 'not-allowed' : 'pointer',
            }}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
