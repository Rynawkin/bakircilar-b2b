'use client';

import { useCariArama } from './useCariArama';
import { Search, Columns3, X, AlertTriangle } from 'lucide-react';

/**
 * Cari Arama (F10) — YENI gorunum.
 * Logic useCariArama hook'undan gelir; klasikle BIREBIR ayni veri/handler/kolon/modal.
 * Sadece gorsel katman degisir. Hicbir oge dusurulmedi.
 */
export default function CariAramaNew() {
  const {
    searchTerm,
    setSearchTerm,
    customers,
    loading,
    error,
    availableColumns,
    selectedColumns,
    showColumnSelector,
    setShowColumnSelector,
    savingPreferences,
    selectedCustomer,
    showDetailModal,
    handleSearch,
    handleColumnToggle,
    saveColumnPreferences,
    getColumnDisplayName,
    formatValue,
    handleRowClick,
    closeDetailModal,
  } = useCariArama();

  // İlk 2 kolon sticky offset (Cari Kodu 140px, Ünvan 220px = sticky)
  const stickyLeft = (idx: number): string => (idx === 0 ? '0px' : idx === 1 ? '140px' : '');

  return (
    <div style={{ background: '#f4f6fa', minHeight: '100vh', padding: '0 20px 28px', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            margin: '24px 0 16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: '#14223b' }}>
              Cari Arama
            </h1>
            <div style={{ fontSize: 13, color: '#8b97ac', marginTop: 5 }}>
              Hızlı cari arama (F10) · Mikro ERP · kullanıcı-seçimli kolonlar
            </div>
          </div>
        </div>

        {/* Arama barı */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flexWrap: 'wrap',
            background: '#fff',
            border: '1px solid #e7ebf2',
            borderRadius: 12,
            padding: '11px 14px',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 240,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              height: 42,
              border: '2px solid #15356b',
              borderRadius: 9,
              padding: '0 12px',
            }}
          >
            <Search size={17} color="#15356b" strokeWidth={2} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Cari kodu, ünvan, şehir, telefon… (F10)"
              style={{
                flex: 1,
                border: 'none',
                background: 'none',
                outline: 'none',
                fontSize: 14,
                color: '#14223b',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowColumnSelector(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 42,
              background: '#fff',
              border: '1px solid #d8e0ec',
              borderRadius: 9,
              padding: '0 14px',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#51607a',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Columns3 size={14} strokeWidth={2} />
            Kolonları Seç
          </button>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            style={{
              height: 42,
              background: loading ? '#8b97ac' : '#15356b',
              border: 'none',
              borderRadius: 9,
              padding: '0 16px',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#fff',
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Aranıyor…' : 'Ara'}
          </button>
        </div>

        {/* Hata */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 10,
              padding: '11px 14px',
              color: '#b91c1c',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 14,
            }}
          >
            <AlertTriangle size={16} strokeWidth={2} />
            {error}
          </div>
        )}

        {/* Sonuçlar */}
        {customers.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e7ebf2', borderRadius: 12, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 16px',
                borderBottom: '1px solid #eef1f6',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: '#14223b' }}>
                Sonuçlar
              </span>
              <span style={{ fontSize: 12, color: '#8b97ac' }}>{customers.length} cari</span>
            </div>

            {/* Tablo - yatay kaydırma + ilk 2 kolon sticky + dinamik kolonlar */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfd', borderBottom: '1px solid #eef1f6' }}>
                    {selectedColumns.map((column, idx) => (
                      <th
                        key={column}
                        style={{
                          padding: '11px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#8b97ac',
                          textTransform: 'uppercase',
                          letterSpacing: '.02em',
                          whiteSpace: 'nowrap',
                          ...(idx < 2
                            ? {
                                position: 'sticky',
                                left: stickyLeft(idx),
                                zIndex: 11,
                                background: '#fafbfd',
                                borderRight: idx === 1 ? '1px solid #eef1f6' : undefined,
                              }
                            : {}),
                        }}
                      >
                        {getColumnDisplayName(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer, idx) => (
                    <tr
                      key={idx}
                      onClick={() => handleRowClick(customer)}
                      style={{ borderTop: '1px solid #f1f4f9', cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#fafbfd';
                        e.currentTarget.querySelectorAll<HTMLElement>('td.sticky-cell').forEach((c) => {
                          c.style.background = '#fafbfd';
                        });
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '';
                        e.currentTarget.querySelectorAll<HTMLElement>('td.sticky-cell').forEach((c) => {
                          c.style.background = '#fff';
                        });
                      }}
                    >
                      {selectedColumns.map((column, colIdx) => (
                        <td
                          key={column}
                          className={colIdx < 2 ? 'sticky-cell' : undefined}
                          style={{
                            padding: '11px 12px',
                            fontSize: 12,
                            color: colIdx < 2 ? '#14223b' : '#51607a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            ...(colIdx === 0
                              ? { fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }
                              : colIdx === 1
                              ? { fontWeight: 600 }
                              : {}),
                            ...(colIdx < 2
                              ? {
                                  position: 'sticky',
                                  left: stickyLeft(colIdx),
                                  zIndex: 1,
                                  background: '#fff',
                                  borderRight: colIdx === 1 ? '1px solid #f1f4f9' : undefined,
                                }
                              : {}),
                          }}
                        >
                          {formatValue(customer[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '12px 16px',
                borderTop: '1px solid #eef1f6',
              }}
            >
              <span style={{ fontSize: 12, color: '#8b97ac' }}>{customers.length} cari listeleniyor</span>
            </div>
          </div>
        )}

        {/* Boş durum (arama yapıldı, hata yok, sonuç yok) */}
        {customers.length === 0 && !loading && !error && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #e7ebf2',
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
              color: '#8b97ac',
              fontSize: 13,
            }}
          >
            <Search size={28} color="#c2cbda" strokeWidth={1.6} style={{ marginBottom: 10 }} />
            <div>Cari kodu, ünvan, şehir veya telefon ile arama yapın</div>
          </div>
        )}
      </div>

      {/* Kolon Seçici Modal */}
      {showColumnSelector && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,34,59,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 20px 50px rgba(20,34,59,.25)',
              maxWidth: 640,
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef1f6' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 600, color: '#14223b', margin: 0 }}>
                    Görüntülenecek Kolonları Seçin
                  </h2>
                  <p style={{ fontSize: 12.5, color: '#8b97ac', margin: '4px 0 0' }}>
                    Seçtiğiniz kolonlar otomatik olarak kaydedilecek
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(false)}
                  style={{ background: 'none', border: 'none', color: '#8b97ac', cursor: 'pointer', padding: 2 }}
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                {availableColumns.map((column) => {
                  const checked = selectedColumns.includes(column);
                  return (
                    <label
                      key={column}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 11px',
                        borderRadius: 9,
                        border: `1px solid ${checked ? '#cdd9ee' : '#eef1f6'}`,
                        background: checked ? '#f3f7fd' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleColumnToggle(column)}
                        style={{ width: 16, height: 16, accentColor: '#15356b', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12.5, color: '#14223b' }}>{getColumnDisplayName(column)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                padding: '16px 22px',
                borderTop: '1px solid #eef1f6',
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setShowColumnSelector(false)}
                style={{
                  height: 38,
                  padding: '0 16px',
                  border: '1px solid #d8e0ec',
                  borderRadius: 9,
                  background: '#fff',
                  color: '#51607a',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={saveColumnPreferences}
                disabled={savingPreferences || selectedColumns.length === 0}
                style={{
                  height: 38,
                  padding: '0 16px',
                  border: 'none',
                  borderRadius: 9,
                  background: savingPreferences || selectedColumns.length === 0 ? '#8b97ac' : '#15356b',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: savingPreferences || selectedColumns.length === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {savingPreferences ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cari Detay Modal */}
      {showDetailModal && selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,34,59,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 20px 50px rgba(20,34,59,.25)',
              maxWidth: 880,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #eef1f6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: '#14223b', margin: 0 }}>
                  {formatValue(selectedCustomer['msg_S_1033'])}
                </h2>
                <p
                  style={{
                    fontSize: 12.5,
                    color: '#8b97ac',
                    margin: '4px 0 0',
                    fontFamily: "'Roboto Mono', monospace",
                  }}
                >
                  Cari Kodu: {formatValue(selectedCustomer['msg_S_1032'])}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                style={{ background: 'none', border: 'none', color: '#8b97ac', cursor: 'pointer', padding: 2 }}
              >
                <X size={22} strokeWidth={2} />
              </button>
            </div>

            {/* Body - tüm kolonlar key/value */}
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {availableColumns.map((column) => {
                  const value = selectedCustomer[column];
                  if (column === 'msg_S_0088') return null; // GUID'i göstermeyelim

                  return (
                    <div key={column} style={{ borderBottom: '1px solid #f1f4f9', paddingBottom: 12 }}>
                      <dt style={{ fontSize: 11, fontWeight: 600, color: '#8b97ac', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.02em' }}>
                        {getColumnDisplayName(column)}
                      </dt>
                      <dd style={{ fontSize: 14, color: '#14223b', fontWeight: 600, margin: 0 }}>
                        {formatValue(value)}
                      </dd>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 22px',
                borderTop: '1px solid #eef1f6',
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={closeDetailModal}
                style={{
                  height: 38,
                  padding: '0 18px',
                  border: '1px solid #d8e0ec',
                  borderRadius: 9,
                  background: '#fff',
                  color: '#51607a',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
