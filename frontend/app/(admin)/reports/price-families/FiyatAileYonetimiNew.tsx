'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Layers,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useFiyatAileYonetimi } from './useFiyatAileYonetimi';

/**
 * Yeni gorunum: Fiyat Aile Yonetimi ekrani.
 * Tum mantik useFiyatAileYonetimi hook'undan gelir; hicbir handler/buton/filtre/
 * aile-karti/urun-ekle-cikar/oncelik(yok)/ozet/satir-aksiyon dusurulmemistir.
 * Klasik ile birebir ayni veri/akis; sadece gorsel dil degisti.
 *
 * Tasarim referansi: design HTML reportMeta['price-families']
 * (data-screen-label="Fiyat Aile Yönetimi") + brief 4.12.4. Genel rapor stili:
 * beyaz kart #fff / border #e7ebf2 / radius 12px; tablo basligi #fafbfd;
 * primary #15356b; ink #14223b/#51607a/#8b97ac; amber uyari.
 *
 * Not: Ozet metrikler (Aktif/Pasif/Toplam Aile/Toplam Urun) yalnizca mevcut
 * `families` verisinden turetilir; klasikte olmayan/kaynaksiz veri uydurulmamistir.
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

const inputStyle: React.CSSProperties = {
  height: 38,
  width: '100%',
  border: `1px solid #e3e8f0`,
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

const summaryCard: React.CSSProperties = {
  ...cardStyle,
  padding: 15,
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 40,
  padding: '0 16px',
  border: 'none',
  borderRadius: 9,
  background: PRIMARY,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 40,
  padding: '0 16px',
  border: `1px solid #d8e0ec`,
  borderRadius: 9,
  background: '#fff',
  color: MUTED,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const smallBtn = (variant: 'primary' | 'outline' | 'muted'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 32,
  padding: '0 12px',
  borderRadius: 7,
  fontSize: 11.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border:
    variant === 'primary'
      ? 'none'
      : variant === 'outline'
        ? `1px solid #d6e0f1`
        : `1px solid #d8e0ec`,
  background: variant === 'primary' ? PRIMARY : variant === 'outline' ? '#eef2fa' : '#fff',
  color: variant === 'primary' ? '#fff' : variant === 'outline' ? PRIMARY : MUTED,
});

export default function FiyatAileYonetimiNew() {
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
    active,
    setActive,
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
  } = useFiyatAileYonetimi();

  // Ozet metrikler: yalnizca mevcut families verisinden turetilir (kaynaksiz veri yok).
  const activeCount = families.filter((f) => f.active !== false).length;
  const passiveCount = families.filter((f) => f.active === false).length;
  const totalCount = families.length;
  const totalProducts = families.reduce((sum, f) => sum + (f.items?.length || 0), 0);

  const metrics: Array<{ label: string; value: string | number }> = [
    { label: 'Aktif Aile', value: activeCount },
    { label: 'Toplam Stok', value: totalProducts },
    { label: 'Pasif Aile', value: passiveCount },
    { label: 'Toplam Aile', value: totalCount },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 20px 40px' }}>
        {/* Breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            color: FAINT,
            marginBottom: 12,
          }}
        >
          <Link href="/reports/price-family-costs" style={{ color: FAINT, textDecoration: 'none' }}>
            Maliyet Kontrolu
          </Link>
          <ChevronRight size={13} />
          <span style={{ color: MUTED, fontWeight: 500 }}>Fiyat Aile Yonetimi</span>
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
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: INK }}>
              Fiyat Aile Yonetimi
            </h1>
            <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
              Her stok tek bir fiyat ailesinde bulunabilir.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/reports/price-family-costs" style={headBtn}>
              <ArrowLeft size={14} />
              Maliyet Kontrolu
            </Link>
            <Link href="/reports/price-family-costs" style={headBtn}>
              <BarChart3 size={14} />
              Rapor
            </Link>
            <button type="button" onClick={resetForm} style={headBtn}>
              <Plus size={14} />
              Yeni Aile
            </button>
          </div>
        </div>

        {/* Ozet metrikler */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 14,
            marginBottom: 16,
          }}
        >
          {metrics.map((m) => (
            <div key={m.label} style={summaryCard}>
              <div style={{ fontSize: 11.5, color: FAINT }}>{m.label}</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: INK,
                  marginTop: 5,
                  letterSpacing: '-.01em',
                }}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Iki kolon: sol aile listesi / sag form */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* SOL: Tanimli Fiyat Aileleri */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} color={PRIMARY} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>Tanimli Fiyat Aileleri</div>
              </div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>Duzenlemek icin satira tiklayin</div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loadingFamilies && <p style={{ fontSize: 12.5, color: FAINT, margin: 0 }}>Yukleniyor...</p>}
              {!loadingFamilies && families.length === 0 && (
                <p style={{ fontSize: 12.5, color: FAINT, margin: 0 }}>Tanimli fiyat ailesi yok.</p>
              )}
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  color="#9aa6b8"
                  style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  style={{ ...inputStyle, paddingLeft: 34 }}
                  placeholder="Fiyat ailesi ara..."
                  value={familySearch}
                  onChange={(e) => setFamilySearch(e.target.value)}
                />
              </div>
              <div
                style={{
                  maxHeight: '70vh',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  paddingRight: 2,
                }}
              >
                {!loadingFamilies && filteredFamilies.length === 0 && (
                  <p style={{ fontSize: 12.5, color: FAINT, margin: 0 }}>Aramaya uygun aile bulunamadi.</p>
                )}
                {filteredFamilies.map((family) => {
                  const isEditing = editingFamily?.id === family.id;
                  return (
                    <div
                      key={family.id}
                      style={{
                        border: `1px solid ${isEditing ? '#c6d6ef' : SOFT_LINE}`,
                        background: isEditing ? '#f4f7fc' : '#fff',
                        borderRadius: 10,
                        padding: 12,
                        opacity: family.active ? 1 : 0.6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => startEdit(family)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            fontSize: 13,
                            fontWeight: 600,
                            color: INK,
                          }}
                        >
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {family.name} {family.code ? `(${family.code})` : ''}
                          </span>
                          {!family.active && (
                            <span
                              style={{
                                flex: 'none',
                                fontSize: 10,
                                fontWeight: 600,
                                color: AMBER,
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: 5,
                                padding: '1px 6px',
                              }}
                            >
                              Pasif
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
                          {family.items.length} urun {family.active ? '' : ' - pasif'}
                        </div>
                      </button>
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => deleteFamily(family.id)}
                          disabled={deletingId === family.id}
                          style={{
                            ...smallBtn('muted'),
                            color: RED,
                            borderColor: '#fecaca',
                            opacity: deletingId === family.id ? 0.6 : 1,
                          }}
                        >
                          <Trash2 size={13} />
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SAG: Form (Yeni / Duzenle) */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>
                {mode === 'create' ? 'Yeni Fiyat Ailesi' : 'Fiyat Ailesi Duzenle'}
              </div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
                Ayni maliyet tarihiyle takip edilmesi gereken urunleri tek ailede toplayin.
              </div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Aile alanlari */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <input style={inputStyle} placeholder="Aile Adi" value={name} onChange={(e) => setName(e.target.value)} />
                <input
                  style={inputStyle}
                  placeholder="Aile Kodu (ops.)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <input
                  style={inputStyle}
                  placeholder="Not (ops.)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: PRIMARY }}
                />
                Aktif fiyat ailesi
              </label>

              {/* Urun Havuzu */}
              <div
                style={{
                  border: `1px solid ${SOFT_LINE}`,
                  background: '#fafbfd',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Package size={15} color={PRIMARY} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Urun Havuzu</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={15}
                    color="#9aa6b8"
                    style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    style={{ ...inputStyle, paddingLeft: 34 }}
                    placeholder="Urun kodu veya urun adi ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div
                  style={{
                    maxHeight: 256,
                    overflow: 'auto',
                    borderRadius: 8,
                    border: `1px solid ${SOFT_LINE}`,
                    background: '#fff',
                  }}
                >
                  {searchLoading && <p style={{ padding: 12, fontSize: 12.5, color: FAINT, margin: 0 }}>Araniyor...</p>}
                  {!searchLoading && search.trim().length < 2 && (
                    <p style={{ padding: 12, fontSize: 12.5, color: FAINT, margin: 0 }}>
                      Arama icin en az 2 karakter girin.
                    </p>
                  )}
                  {!searchLoading && search.trim().length >= 2 && searchResults.length === 0 && (
                    <p style={{ padding: 12, fontSize: 12.5, color: FAINT, margin: 0 }}>Sonuc bulunamadi.</p>
                  )}
                  {!searchLoading &&
                    searchResults.map((product) => {
                      const selected = selectedCodeSet.has(product.mikroCode);
                      const ownerFamilies = familyNamesByProductCode.get(product.mikroCode) || [];
                      const otherOwnerFamilies = editingFamily
                        ? ownerFamilies.filter((familyName) => familyName !== editingFamily.name)
                        : ownerFamilies;
                      const blockedByOtherFamily = otherOwnerFamilies.length > 0;
                      const disabled = selected || blockedByOtherFamily;
                      return (
                        <div
                          key={product.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '9px 12px',
                            borderBottom: `1px solid ${ROW_LINE}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: INK,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {product.mikroCode}
                            </p>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 11.5,
                                color: MUTED,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {product.name}
                            </p>
                            {blockedByOtherFamily && (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  color: AMBER,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                Baska fiyat ailesinde: {otherOwnerFamilies.join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => addProduct(product)}
                            style={{
                              ...smallBtn(selected || blockedByOtherFamily ? 'muted' : 'primary'),
                              flex: 'none',
                              opacity: disabled ? 0.6 : 1,
                              cursor: disabled ? 'default' : 'pointer',
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
              <div style={{ border: `1px solid ${SOFT_LINE}`, borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                <div
                  style={{
                    borderBottom: `1px solid ${SOFT_LINE}`,
                    background: TABLE_HEAD_BG,
                    padding: '10px 14px',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>
                    Secilen Urunler ({selectedProducts.length})
                  </span>
                </div>
                {selectedProducts.length === 0 ? (
                  <p style={{ padding: 12, fontSize: 12.5, color: FAINT, margin: 0 }}>Henuz urun secilmedi.</p>
                ) : (
                  <div style={{ maxHeight: 256, overflow: 'auto' }}>
                    {selectedProducts.map((product) => (
                      <div
                        key={product.mikroCode}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '9px 14px',
                          borderBottom: `1px solid ${ROW_LINE}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: INK,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {product.mikroCode}
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 11.5,
                              color: MUTED,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {product.name || '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProduct(product.mikroCode)}
                          style={{ ...smallBtn('muted'), flex: 'none' }}
                        >
                          Cikar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Aksiyonlar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={resetForm} style={ghostBtn}>
                  Temizle
                </button>
                <button
                  type="button"
                  onClick={saveFamily}
                  disabled={saving}
                  style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={15} />
                  {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Fiyat Ailesini Kaydet' : 'Degisiklikleri Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
