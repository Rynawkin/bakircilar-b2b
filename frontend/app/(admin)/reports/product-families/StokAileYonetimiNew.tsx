'use client';

import Link from 'next/link';
import { ArrowLeft, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useStokAileYonetimi } from './useStokAileYonetimi';

/**
 * Yeni gorunum: Stok Aile Yonetimi.
 * Tum mantik useStokAileYonetimi hook'undan gelir; hicbir handler/buton/filtre/
 * urun ekle-cikar/oncelik(items.length)/aile olustur-sil/satir-aksiyon dusurulmemistir.
 *
 * Tasarim referansi: design HTML #scr-fam (data-screen-label="Stok Aile Yonetimi") +
 * brief 4.12.3. Genel stil: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * primary #15356b; ink #14223b/#51607a/#8b97ac; amber uyari #b45309;
 * 2 kolon: sol Tanimli Aileler (arama + kartlar) + sag form (Ad/Kod/Not + Urun Havuzu + Secilen Urunler + Kaydet).
 */

const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const FIELD_LINE = '#e3e8f0';
const ACTIVE_BG = '#eef2fa';
const ACTIVE_LINE = '#d6e0f1';
const AMBER = '#b45309';
const RED = '#b91c1c';

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

const primaryBtn: React.CSSProperties = {
  ...headBtn,
  background: PRIMARY,
  color: '#fff',
  border: 'none',
};

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: `1px solid ${FIELD_LINE}`,
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

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: INK,
};

const monoFaint: React.CSSProperties = {
  fontSize: 11,
  color: FAINT,
  fontFamily: "'Roboto Mono', monospace",
};

export default function StokAileYonetimiNew() {
  const {
    loadingFamilies,
    saving,
    deletingId,
    mode,
    name,
    setName,
    code,
    setCode,
    note,
    setNote,
    selectedProducts,
    search,
    setSearch,
    familySearch,
    setFamilySearch,
    searchLoading,
    searchResults,
    selectedCodeSet,
    editingFamily,
    familyNamesByProductCode,
    filteredFamilies,
    families,
    resetForm,
    startEdit,
    addProduct,
    removeProduct,
    saveFamily,
    deleteFamily,
  } = useStokAileYonetimi();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      {/* Header: Geri (Ucarer Depo) + baslik + Yeni Aile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/reports/ucarer-depo" style={{ textDecoration: 'none' }}>
            <button type="button" style={headBtn}>
              <ArrowLeft size={15} strokeWidth={2} />
              Ucarer Depo
            </button>
          </Link>
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
              Stok Aile Yonetimi
            </h1>
            <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
              Aileleri ayri ekranda urun havuzundan secerek yonetin
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={resetForm}
          style={primaryBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = PRIMARY_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.background = PRIMARY)}
        >
          <Plus size={15} strokeWidth={2.2} />
          Yeni Aile
        </button>
      </div>

      {/* 2 kolon: sol Tanimli Aileler / sag Form */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* SOL: Tanimli Aileler */}
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ ...sectionTitle, marginBottom: 11 }}>Tanimli Aileler</div>
          <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 11 }}>
            Duzenlemek icin satira tiklayin
          </div>

          {loadingFamilies && (
            <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 10px' }}>Yukleniyor...</p>
          )}
          {!loadingFamilies && families.length === 0 && (
            <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 10px' }}>Tanimli aile yok.</p>
          )}

          {/* Aile ara */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              border: `1px solid ${FIELD_LINE}`,
              borderRadius: 8,
              padding: '0 11px',
              marginBottom: 11,
            }}
          >
            <Search size={14} strokeWidth={2} style={{ color: '#9aa6b8', flex: 'none' }} />
            <input
              placeholder="Aile ara..."
              value={familySearch}
              onChange={(e) => setFamilySearch(e.target.value)}
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

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              maxHeight: '70vh',
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {!loadingFamilies && filteredFamilies.length === 0 && (
              <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>
                Aramaya uygun aile bulunamadi.
              </p>
            )}
            {filteredFamilies.map((family) => {
              const isActive = editingFamily?.id === family.id;
              return (
                <div
                  key={family.id}
                  style={{
                    border: `1px solid ${isActive ? ACTIVE_LINE : SOFT_LINE}`,
                    background: isActive ? ACTIVE_BG : '#fff',
                    borderRadius: 9,
                    padding: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => startEdit(family)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                      {family.name} {family.code ? `(${family.code})` : ''}
                    </div>
                    <div style={{ ...monoFaint, marginTop: 3 }}>
                      {family.items.length} urun
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFamily(family.id)}
                    disabled={deletingId === family.id}
                    title="Aileyi sil"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: deletingId === family.id ? 'not-allowed' : 'pointer',
                      color: RED,
                      opacity: deletingId === family.id ? 0.5 : 1,
                      flex: 'none',
                      padding: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* SAG: Form (Yeni Aile / Aile Duzenle) */}
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ ...sectionTitle, marginBottom: 4 }}>
            {mode === 'create' ? 'Yeni Aile' : 'Aile Duzenle'}
          </div>
          <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 14 }}>
            Urunleri kod yazarak degil, urun havuzundan secerek ekleyin
          </div>

          {/* Aile Adi / Kod / Not */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Aile Adi *</label>
              <input
                placeholder="Aile Adi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Aile Kodu (ops.)</label>
              <input
                placeholder="Aile Kodu (ops.)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Not (ops.)</label>
              <input
                placeholder="Not (ops.)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Urun Havuzu */}
          <div
            style={{
              border: `1px solid ${SOFT_LINE}`,
              background: '#fafbfd',
              borderRadius: 10,
              padding: 13,
              marginBottom: 14,
            }}
          >
            <div style={{ ...sectionTitle, marginBottom: 9 }}>Urun Havuzu</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 36,
                border: `1px solid ${FIELD_LINE}`,
                borderRadius: 8,
                padding: '0 11px',
                background: '#fff',
                marginBottom: 10,
              }}
            >
              <Search size={14} strokeWidth={2} style={{ color: '#9aa6b8', flex: 'none' }} />
              <input
                placeholder="Urun kodu veya urun adi ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

            <div
              style={{
                maxHeight: 256,
                overflowY: 'auto',
                border: `1px solid ${SOFT_LINE}`,
                borderRadius: 8,
                background: '#fff',
              }}
            >
              {searchLoading && (
                <p style={{ padding: 12, fontSize: 12.5, color: MUTED, margin: 0 }}>
                  Araniyor...
                </p>
              )}
              {!searchLoading && search.trim().length < 2 && (
                <p style={{ padding: 12, fontSize: 12.5, color: MUTED, margin: 0 }}>
                  Arama icin en az 2 karakter girin.
                </p>
              )}
              {!searchLoading && search.trim().length >= 2 && searchResults.length === 0 && (
                <p style={{ padding: 12, fontSize: 12.5, color: MUTED, margin: 0 }}>
                  Sonuc bulunamadi.
                </p>
              )}
              {!searchLoading &&
                searchResults.map((product) => {
                  const selected = selectedCodeSet.has(product.mikroCode);
                  const ownerFamilies =
                    familyNamesByProductCode.get(product.mikroCode) || [];
                  const otherOwnerFamilies = editingFamily
                    ? ownerFamilies.filter((familyName) => familyName !== editingFamily.name)
                    : ownerFamilies;
                  const blockedByOtherFamily = otherOwnerFamilies.length > 0;
                  const ownerText = blockedByOtherFamily
                    ? `Baska ailede tanimli: ${otherOwnerFamilies.join(', ')}`
                    : '';
                  const disabled = selected || blockedByOtherFamily;
                  return (
                    <div
                      key={product.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        borderBottom: `1px solid ${SOFT_LINE}`,
                        padding: '8px 11px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: INK,
                            fontFamily: "'Roboto Mono', monospace",
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {product.mikroCode}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: MUTED,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {product.name}
                        </div>
                        {ownerText && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: AMBER,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {ownerText}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={disabled}
                        style={{
                          flex: 'none',
                          height: 30,
                          padding: '0 12px',
                          borderRadius: 7,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          ...(disabled
                            ? {
                                background: '#fff',
                                border: `1px solid ${FIELD_LINE}`,
                                color: FAINT,
                              }
                            : {
                                background: PRIMARY,
                                border: 'none',
                                color: '#fff',
                              }),
                        }}
                      >
                        {selected ? 'Eklendi' : blockedByOtherFamily ? 'Baska Ailede' : 'Ekle'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Secilen Urunler */}
          <div
            style={{
              border: `1px solid ${SOFT_LINE}`,
              borderRadius: 10,
              background: '#fff',
              marginBottom: 14,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                borderBottom: `1px solid ${SOFT_LINE}`,
                padding: '10px 13px',
                fontSize: 12.5,
                fontWeight: 600,
                color: INK,
              }}
            >
              Secilen Urunler ({selectedProducts.length})
            </div>
            {selectedProducts.length === 0 ? (
              <p style={{ padding: 12, fontSize: 12.5, color: MUTED, margin: 0 }}>
                Henuz urun secilmedi.
              </p>
            ) : (
              <div style={{ maxHeight: 256, overflowY: 'auto' }}>
                {selectedProducts.map((product) => (
                  <div
                    key={product.mikroCode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      borderBottom: `1px solid ${SOFT_LINE}`,
                      padding: '8px 11px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: INK,
                          fontFamily: "'Roboto Mono', monospace",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {product.mikroCode}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: MUTED,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {product.name || '-'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProduct(product.mikroCode)}
                      title="Cikar"
                      style={{
                        flex: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 30,
                        padding: '0 11px',
                        border: `1px solid ${FIELD_LINE}`,
                        borderRadius: 7,
                        background: '#fff',
                        color: MUTED,
                        fontSize: 11.5,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={13} strokeWidth={2} />
                      Cikar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aksiyonlar: Temizle / Kaydet */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
            <button
              type="button"
              onClick={resetForm}
              style={{ ...headBtn, height: 38 }}
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={saveFamily}
              disabled={saving}
              style={{
                ...primaryBtn,
                height: 38,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = PRIMARY_HOVER;
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = PRIMARY;
              }}
            >
              <Save size={15} strokeWidth={2} />
              {saving
                ? 'Kaydediliyor...'
                : mode === 'create'
                ? 'Aileyi Kaydet'
                : 'Degisiklikleri Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
