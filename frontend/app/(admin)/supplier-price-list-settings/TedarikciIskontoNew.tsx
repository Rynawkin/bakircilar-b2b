'use client';

import { Plus, Pencil, RefreshCw, Trash2, Percent, FileSpreadsheet, FileText, Tag } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useTedarikciIskonto } from './useTedarikciIskonto';

/**
 * Yeni gorunum — Tedarikci Iskonto Ayarlari. Mevcut TUM mantik useTedarikciIskonto'tan gelir;
 * sadece gorsel yeni. Hicbir alan/handler/buton/durum/modal dusurulmemistir.
 * Renk paleti: kart #fff / border #e7ebf2 / radius 12px, primary #15356b,
 * ink #14223b/#51607a/#8b97ac, emerald/amber/red rozet. Emoji yok.
 */

const INK = '#14223b';
const SUB = '#51607a';
const MUTE = '#8b97ac';
const PRIMARY = '#15356b';
const BORDER = '#e7ebf2';
const FIELD_BORDER = '#e3e8f0';

const labelStyle: React.CSSProperties = { fontSize: 11, color: MUTE, fontWeight: 500 };
const inputStyle: React.CSSProperties = {
  height: 38,
  border: `1px solid ${FIELD_BORDER}`,
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  background: '#fff',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const tierInputStyle: React.CSSProperties = {
  ...inputStyle,
  height: 34,
  borderRadius: 7,
  textAlign: 'center',
  fontSize: 12,
  padding: '0 6px',
};
const ruleInputStyle: React.CSSProperties = {
  ...inputStyle,
  height: 32,
  borderRadius: 7,
  fontSize: 11.5,
};
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: INK, marginBottom: 8 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export default function TedarikciIskontoNew() {
  const {
    suppliers,
    loading,
    saving,
    modalOpen,
    editingSupplier,
    form,
    setForm,
    discountSummary,
    loadSuppliers,
    openModal,
    closeModal,
    addMainDiscount,
    removeMainDiscount,
    updateMainDiscount,
    addDiscountRule,
    removeDiscountRule,
    updateDiscountRuleKeywords,
    updateRuleDiscount,
    addRuleDiscount,
    removeRuleDiscount,
    handleSave,
    buildDiscountSummary,
  } = useTedarikciIskonto();

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 40px' }}>
      {/* Baslik + aksiyonlar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          margin: '4px 0 18px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: INK }}>
            Tedarikci Iskonto Ayarlari
          </h1>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 5 }}>
            Tedarikci bazli iskonto kademeleri ve dosya eslestirme ayarlarini yonetin.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            type="button"
            onClick={loadSuppliers}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: '#fff',
              color: PRIMARY,
              border: `1px solid #d8e0ec`,
              borderRadius: 9,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={15} />
            Yenile
          </button>
          <button
            type="button"
            onClick={() => openModal()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={15} />
            Yeni Tedarikci
          </button>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div
          style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '40px 20px',
            textAlign: 'center',
            fontSize: 13,
            color: MUTE,
          }}
        >
          Yukleniyor...
        </div>
      ) : suppliers.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '40px 20px',
            textAlign: 'center',
            fontSize: 13,
            color: MUTE,
          }}
        >
          Henuz tedarikci yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suppliers.map((supplier) => {
            const ruleCount = Array.isArray(supplier.discountRules) ? supplier.discountRules.length : 0;
            return (
              <div
                key={supplier.id}
                style={{
                  background: '#fff',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '15px 17px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{supplier.name}</div>
                  <div style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>
                    Iskonto: {buildDiscountSummary(supplier)}
                    {ruleCount > 0 ? ` · Ozel Kural: ${ruleCount}` : ''}
                  </div>
                </div>
                {supplier.active ? (
                  <span
                    style={{
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      color: '#047857',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    Aktif
                  </span>
                ) : (
                  <span
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      color: SUB,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 999,
                    }}
                  >
                    Pasif
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openModal(supplier)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#fff',
                    border: '1px solid #d8e0ec',
                    borderRadius: 8,
                    padding: '7px 13px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: PRIMARY,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Pencil size={13} />
                  Duzenle
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal — yeni gorunum, mevcut tum alanlar/handlerlar korunur */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingSupplier ? `Tedarikci Duzenle (${discountSummary || 'Iskonto'})` : 'Yeni Tedarikci'}
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Iptal
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              Kaydet
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ad + Durum */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Tedarikci Adi *">
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Durum">
              <select
                value={form.active ? 'active' : 'inactive'}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === 'active' }))}
                style={selectStyle}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
              </select>
            </Field>
          </div>

          {/* Iskonto Kademeleri (dinamik, sinirsiz) */}
          <div
            style={{
              background: '#fafbfd',
              border: `1px solid #eef1f6`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Percent size={15} color={PRIMARY} />
                <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Iskonto Kademeleri</div>
              </div>
              <button
                type="button"
                onClick={addMainDiscount}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#eef2fa',
                  border: '1px solid #d6e0f1',
                  borderRadius: 7,
                  padding: '5px 11px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: PRIMARY,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={13} />
                Kademe Ekle
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {form.discounts.map((value, index) => (
                <div key={`disc-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 96 }}>
                  <span style={labelStyle}>Iskonto {index + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      value={value}
                      onChange={(e) => updateMainDiscount(index, e.target.value)}
                      style={{ ...tierInputStyle, flex: 1 }}
                    />
                    {form.discounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMainDiscount(index)}
                        aria-label="Kademeyi sil"
                        title="Kademeyi sil"
                        style={{
                          width: 26,
                          height: 26,
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          background: '#fff',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: MUTE, margin: '8px 0 0' }}>
              Zincirleme uygulanir (orn: 10+10+5+5+5+5). Bos birakilirsa net liste kabul edilir.
            </p>
          </div>

          {/* Ozel Iskonto Kurallari */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Tag size={15} color={PRIMARY} />
                <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>Ozel Iskonto Kurallari</span>
              </div>
              <button
                type="button"
                onClick={addDiscountRule}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#eef2fa',
                  border: '1px solid #d6e0f1',
                  borderRadius: 7,
                  padding: '5px 11px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: PRIMARY,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={13} />
                Kural Ekle
              </button>
            </div>
            <p style={{ fontSize: 11, color: MUTE, margin: '0 0 10px' }}>
              Urun adinda gecen kelimelere gore iskonto uygular. Orn: eko, ekonomik = %15.
            </p>
            {form.discountRules.length === 0 ? (
              <div style={{ fontSize: 11.5, color: MUTE }}>Ozel kural yok.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {form.discountRules.map((rule, index) => (
                  <div
                    key={`rule-${index}`}
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 9,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Field label="Anahtar Kelimeler">
                          <input
                            value={rule.keywords}
                            onChange={(e) => updateDiscountRuleKeywords(index, e.target.value)}
                            placeholder="eko, ekonomik"
                            style={ruleInputStyle}
                          />
                        </Field>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDiscountRule(index)}
                        aria-label="Kurali sil"
                        title="Kurali sil"
                        style={{
                          width: 32,
                          height: 32,
                          border: '1px solid #fecaca',
                          borderRadius: 7,
                          background: '#fff',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={labelStyle}>Iskonto Kademeleri</span>
                        <button
                          type="button"
                          onClick={() => addRuleDiscount(index)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#eef2fa',
                            border: '1px solid #d6e0f1',
                            borderRadius: 6,
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: PRIMARY,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <Plus size={11} />
                          Kademe Ekle
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {rule.discounts.map((value, discIdx) => (
                          <div key={`rule-${index}-disc-${discIdx}`} style={{ display: 'flex', alignItems: 'center', gap: 4, width: 92 }}>
                            <input
                              value={value}
                              onChange={(e) => updateRuleDiscount(index, discIdx, e.target.value)}
                              placeholder={`Isk ${discIdx + 1}`}
                              style={{ ...ruleInputStyle, textAlign: 'center', flex: 1 }}
                            />
                            {rule.discounts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRuleDiscount(index, discIdx)}
                                aria-label="Kademeyi sil"
                                title="Kademeyi sil"
                                style={{
                                  width: 24,
                                  height: 24,
                                  border: '1px solid #fecaca',
                                  borderRadius: 6,
                                  background: '#fff',
                                  color: '#b91c1c',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  fontSize: 13,
                                  lineHeight: 1,
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fiyat Tipi */}
          <div>
            <div style={sectionTitle}>Fiyat Tipi</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Field label="Fiyat Kaynagi">
                <select
                  value={form.priceIsNet ? 'net' : 'list'}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceIsNet: e.target.value === 'net' }))}
                  style={selectStyle}
                >
                  <option value="list">Liste fiyat (iskonto uygulanir)</option>
                  <option value="net">Net fiyat (iskonto yok)</option>
                </select>
              </Field>
              <Field label="KDV Durumu">
                <select
                  value={form.priceIncludesVat ? 'with' : 'without'}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceIncludesVat: e.target.value === 'with' }))}
                  style={selectStyle}
                >
                  <option value="without">KDV haric</option>
                  <option value="with">KDV dahil</option>
                </select>
              </Field>
              <Field label="Renkli/Siyah Ayrimi">
                <select
                  value={form.priceByColor ? 'on' : 'off'}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceByColor: e.target.value === 'on' }))}
                  style={selectStyle}
                >
                  <option value="off">Tek fiyat</option>
                  <option value="on">Siyah urunlerde dusuk fiyat</option>
                </select>
              </Field>
              <Field label="Varsayilan KDV Orani">
                <input
                  value={form.defaultVatRate}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultVatRate: e.target.value }))}
                  placeholder="0.20"
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>

          {/* Excel + PDF Eslestirme */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              style={{
                background: '#fafbfd',
                border: `1px solid #eef1f6`,
                borderRadius: 9,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <FileSpreadsheet size={14} color={PRIMARY} />
                <div style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>Excel Eslestirme</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Field label="Sheet Adi">
                  <input
                    value={form.excelSheetName}
                    onChange={(e) => setForm((prev) => ({ ...prev, excelSheetName: e.target.value }))}
                    placeholder="Orn: Subat'26"
                    style={ruleInputStyle}
                  />
                </Field>
                <Field label="Baslik Satiri">
                  <input
                    value={form.excelHeaderRow}
                    onChange={(e) => setForm((prev) => ({ ...prev, excelHeaderRow: e.target.value }))}
                    placeholder="Orn: 3"
                    style={ruleInputStyle}
                  />
                </Field>
                <Field label="Urun Kodu Basligi">
                  <input
                    value={form.excelCodeHeader}
                    onChange={(e) => setForm((prev) => ({ ...prev, excelCodeHeader: e.target.value }))}
                    placeholder="Orn: Urun Kodu"
                    style={ruleInputStyle}
                  />
                </Field>
                <Field label="Urun Adi Basligi">
                  <input
                    value={form.excelNameHeader}
                    onChange={(e) => setForm((prev) => ({ ...prev, excelNameHeader: e.target.value }))}
                    placeholder="Orn: Urun Adi"
                    style={ruleInputStyle}
                  />
                </Field>
                <Field label="Fiyat Basligi">
                  <input
                    value={form.excelPriceHeader}
                    onChange={(e) => setForm((prev) => ({ ...prev, excelPriceHeader: e.target.value }))}
                    placeholder="Orn: Tavsiye Birim Satis Fiyati"
                    style={ruleInputStyle}
                  />
                </Field>
              </div>
            </div>

            <div
              style={{
                background: '#fafbfd',
                border: `1px solid #eef1f6`,
                borderRadius: 9,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <FileText size={14} color={PRIMARY} />
                <div style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>PDF Eslestirme</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Field label="Fiyat Sira No">
                  <input
                    value={form.pdfPriceIndex}
                    onChange={(e) => setForm((prev) => ({ ...prev, pdfPriceIndex: e.target.value }))}
                    placeholder="Orn: 1 (ilk fiyat)"
                    style={ruleInputStyle}
                  />
                </Field>
                <Field label="Kod Regex (opsiyonel)">
                  <input
                    value={form.pdfCodePattern}
                    onChange={(e) => setForm((prev) => ({ ...prev, pdfCodePattern: e.target.value }))}
                    placeholder="Orn: [A-Z]{2,}\\d+"
                    style={{ ...ruleInputStyle, fontFamily: 'monospace' }}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
