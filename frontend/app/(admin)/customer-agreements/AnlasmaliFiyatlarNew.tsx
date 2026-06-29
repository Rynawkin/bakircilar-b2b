'use client';

import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import {
  ArrowLeft,
  Download,
  FileUp,
  Pencil,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { useAnlasmaliFiyatlar } from './useAnlasmaliFiyatlar';

/**
 * Yeni gorunum Anlasmali Fiyatlar. Mevcut TUM mantik useAnlasmaliFiyatlar'tan gelir;
 * sadece gorsel yeni. Hicbir veri/handler/buton/izin/kolon/sekme/rozet/modal/durum
 * dusurulmemistir; Klasik ile birebir ayni data binding'leri ve handler'lar kullanilir.
 */

const CARD: CSSProperties = { background: '#fff', border: '1px solid #e7ebf2', borderRadius: '12px' };
const SEARCH_BOX: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '36px',
  border: '1px solid #e3e8f0',
  borderRadius: '8px',
  padding: '0 11px',
  marginBottom: '9px',
};
const SEARCH_INPUT: CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'none',
  outline: 'none',
  fontSize: '12px',
  color: '#14223b',
  fontFamily: 'inherit',
};
const FIELD_LABEL: CSSProperties = { fontSize: '10.5px', color: '#8b97ac', display: 'block', marginBottom: '4px' };
const FIELD_INPUT: CSSProperties = {
  width: '100%',
  height: '34px',
  border: '1px solid #e3e8f0',
  borderRadius: '7px',
  padding: '0 9px',
  fontSize: '12px',
  color: '#14223b',
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};
const MONO: CSSProperties = { fontFamily: "'Roboto Mono', monospace" };

function PrimaryButton({
  children,
  onClick,
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? '100%' : undefined,
        background: '#15356b',
        border: 'none',
        borderRadius: '8px',
        padding: '9px 14px',
        fontSize: '12.5px',
        fontWeight: 600,
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.55 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  full,
  tone,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  tone?: 'default' | 'primary' | 'danger';
}) {
  const color = tone === 'primary' ? '#15356b' : tone === 'danger' ? '#b91c1c' : '#51607a';
  const border = tone === 'danger' ? '#fecaca' : '#d8e0ec';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? '100%' : undefined,
        background: '#fff',
        border: `1px solid ${border}`,
        borderRadius: '8px',
        padding: '8px 13px',
        fontSize: '12px',
        fontWeight: 600,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.55 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
      }}
    >
      {children}
    </button>
  );
}

export default function AnlasmaliFiyatlarNew() {
  const {
    router,
    isLoading,
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    filteredCustomers,
    productSearch,
    setProductSearch,
    productResults,
    selectedProduct,
    setSelectedProduct,
    agreements,
    agreementSearch,
    setAgreementSearch,
    formData,
    setFormData,
    saving,
    deletingId,
    bulkDeleting,
    selectedAgreementIds,
    allAgreementsSelected,
    importFile,
    setImportFile,
    importing,
    importSummary,
    setImportSummary,
    resetForm,
    handleSelectAgreement,
    handleSave,
    handleDelete,
    toggleAgreementSelection,
    toggleSelectAllAgreements,
    handleBulkDelete,
    handleDownloadTemplate,
    handleImport,
  } = useAnlasmaliFiyatlar();

  if (isLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  const failedImportRows = importSummary?.results?.filter((item) => item.status !== 'IMPORTED') || [];

  // Anlasma listesi tablo sablonu: [sec] urun musteri-kodu min faturali beyaz tarihler islem
  const ROW_TEMPLATE = '44px 2fr 1.2fr 90px 1.1fr 1.1fr 1.4fr 90px';

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fb' }}>
      <div className="container-custom" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Baslik + Musterilere Don */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', margin: '0 0 0' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', margin: 0, color: '#14223b' }}>
              Anlasmali Fiyatlar
            </h1>
            <div style={{ fontSize: '13px', color: '#8b97ac', marginTop: '5px' }}>
              Cari ozel fiyat tanimlari - Excel ile toplu aktarim
            </div>
          </div>
          <GhostButton onClick={() => router.push('/customers')}>
            <ArrowLeft width={14} height={14} strokeWidth={2} />
            Musterilere Don
          </GhostButton>
        </div>

        {/* 3 sutun: Musteri Sec - Urun Sec - Anlasma Bilgileri */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '14px' }}>
          {/* Musteri Sec */}
          <div style={{ ...CARD, padding: '15px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#14223b', marginBottom: '10px' }}>Musteri Sec</div>
            <div style={SEARCH_BOX}>
              <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
              <input
                placeholder="Musteri ara"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={SEARCH_INPUT}
              />
            </div>
            <div style={{ maxHeight: '256px', overflowY: 'auto', border: '1px solid #eef1f6', borderRadius: '8px' }}>
              {filteredCustomers.map((customer) => {
                const active = selectedCustomer?.id === customer.id;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      resetForm();
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 11px',
                      borderBottom: '1px solid #f1f4f9',
                      background: active ? '#eef2fa' : 'transparent',
                      border: active ? '1px solid #d6e0f1' : 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#14223b' }}>{customer.name}</div>
                    <div style={{ fontSize: '10.5px', color: '#8b97ac', ...MONO }}>{customer.mikroCariCode}</div>
                  </button>
                );
              })}
              {filteredCustomers.length === 0 && (
                <div style={{ padding: '16px 11px', fontSize: '11.5px', color: '#8b97ac' }}>Musteri bulunamadi.</div>
              )}
            </div>
          </div>

          {/* Urun Sec */}
          <div style={{ ...CARD, padding: '15px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#14223b', marginBottom: '10px' }}>Urun Sec</div>
            <div style={SEARCH_BOX}>
              <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
              <input
                placeholder="Urun ara"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={SEARCH_INPUT}
              />
            </div>
            <div style={{ maxHeight: '256px', overflowY: 'auto', border: '1px solid #eef1f6', borderRadius: '8px' }}>
              {productResults.map((product) => {
                const active = selectedProduct?.id === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 11px',
                      borderBottom: '1px solid #f1f4f9',
                      background: active ? '#eef2fa' : 'transparent',
                      border: active ? '1px solid #d6e0f1' : 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#14223b' }}>{product.name}</div>
                    <div style={{ fontSize: '10.5px', color: '#8b97ac', ...MONO }}>{product.mikroCode}</div>
                  </button>
                );
              })}
              {productSearch.trim() && productResults.length === 0 && (
                <div style={{ padding: '16px 11px', fontSize: '11.5px', color: '#8b97ac' }}>Urun bulunamadi.</div>
              )}
            </div>
          </div>

          {/* Anlasma Bilgileri form */}
          <div style={{ ...CARD, padding: '15px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#14223b', marginBottom: '10px' }}>Anlasma Bilgileri</div>
            {selectedProduct && (
              <div style={{ border: '1px solid #eef1f6', borderRadius: '8px', padding: '8px 9px', marginBottom: '9px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#14223b' }}>{selectedProduct.name}</div>
                <div style={{ fontSize: '10.5px', color: '#8b97ac', ...MONO }}>{selectedProduct.mikroCode}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px', marginBottom: '9px' }}>
              <div>
                <label style={FIELD_LABEL}>Faturali Fiyat *</label>
                <input
                  type="number"
                  value={formData.priceInvoiced}
                  onChange={(e) => setFormData({ ...formData, priceInvoiced: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Beyaz Fiyat (opsiyonel)</label>
                <input
                  type="number"
                  value={formData.priceWhite}
                  onChange={(e) => setFormData({ ...formData, priceWhite: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Musteri Urun Kodu (opsiyonel)</label>
                <input
                  value={formData.customerProductCode}
                  onChange={(e) => setFormData({ ...formData, customerProductCode: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Min Miktar</label>
                <input
                  type="number"
                  value={formData.minQuantity}
                  onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Baslangic</label>
                <input
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Bitis (opsiyonel)</label>
                <input
                  type="date"
                  value={formData.validTo}
                  onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <PrimaryButton onClick={handleSave} disabled={saving} full>
                {saving ? 'Kaydediliyor...' : 'Anlasma Kaydet'}
              </PrimaryButton>
              <GhostButton onClick={resetForm} disabled={saving} full>
                Temizle
              </GhostButton>
            </div>
          </div>
        </div>

        {/* Excel ile Toplu Aktarim */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            background: '#eef2fa',
            border: '1px dashed #c3cfe0',
            borderRadius: '12px',
            padding: '14px 16px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#fff',
              border: '1px solid #d6e0f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <UploadCloud width={20} height={20} stroke="#15356b" strokeWidth={1.7} />
          </span>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#14223b' }}>Excel ile Toplu Aktarim</div>
            <div style={{ fontSize: '11.5px', color: '#8b97ac', marginTop: '2px' }}>
              Mikro Kod + Faturali Fiyat + Beyaz Fiyat (ops.) + Musteri Urun Kodu (ops.) + Min Miktar + Baslangic + Bitis.
              Aktarim, secili musteri icin uygulanir. Ornek sablonu indirip doldurun.
            </div>
          </div>
          <GhostButton onClick={handleDownloadTemplate}>
            <Download width={14} height={14} strokeWidth={2} />
            Ornek Excel Indir
          </GhostButton>
          <label
            style={{
              background: '#fff',
              border: '1px solid #d8e0ec',
              borderRadius: '8px',
              padding: '8px 13px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#15356b',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <FileUp width={14} height={14} strokeWidth={2} />
            {importFile ? importFile.name : 'Dosya Sec'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setImportFile(event.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
          </label>
          <PrimaryButton onClick={handleImport} disabled={importing || !importFile}>
            <Upload width={14} height={14} strokeWidth={2} />
            {importing ? 'Aktariliyor...' : 'Excel Aktar'}
          </PrimaryButton>
          <GhostButton
            onClick={() => {
              setImportFile(null);
              setImportSummary(null);
            }}
            disabled={importing}
          >
            <X width={14} height={14} strokeWidth={2} />
            Temizle
          </GhostButton>
          {importSummary && (
            <span
              style={{
                fontSize: '11px',
                color: '#047857',
                fontWeight: 600,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                padding: '4px 9px',
                borderRadius: '7px',
              }}
            >
              Son aktarim: {importSummary.imported} satir - {importSummary.failed} hata
            </span>
          )}
        </div>

        {/* Excel aktarim hata detay listesi */}
        {importSummary && failedImportRows.length > 0 && (
          <div style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#14223b', marginBottom: '8px' }}>
              Aktarim Sonucu - Aktarilan: {importSummary.imported} / Basarisiz: {importSummary.failed}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {failedImportRows.slice(0, 8).map((item, idx) => (
                <div key={`${item.mikroCode}-${idx}`} style={{ fontSize: '11.5px', color: '#b91c1c' }}>
                  <span style={MONO}>{item.mikroCode || '-'}</span>: {item.reason || 'Hata'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mevcut Anlasmalar */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '12px 16px',
              borderBottom: '1px solid #eef1f6',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#14223b' }}>Mevcut Anlasmalar</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#51607a' }}>
                <input
                  type="checkbox"
                  style={{ width: '15px', height: '15px', accentColor: '#15356b' }}
                  checked={allAgreementsSelected}
                  onChange={toggleSelectAllAgreements}
                  disabled={!selectedCustomer || agreements.length === 0 || bulkDeleting}
                />
                Tumunu sec
              </label>
              <GhostButton
                tone="danger"
                onClick={() => handleBulkDelete('selected')}
                disabled={!selectedCustomer || selectedAgreementIds.length === 0 || bulkDeleting}
              >
                <Trash2 width={13} height={13} strokeWidth={2} />
                Secilenleri Sil{selectedAgreementIds.length > 0 ? ` (${selectedAgreementIds.length})` : ''}
              </GhostButton>
              <GhostButton
                tone="danger"
                onClick={() => handleBulkDelete('all')}
                disabled={!selectedCustomer || agreements.length === 0 || bulkDeleting}
              >
                <Trash2 width={13} height={13} strokeWidth={2} />
                Tumunu Sil
              </GhostButton>
              <div style={{ ...SEARCH_BOX, marginBottom: 0, width: '220px' }}>
                <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
                <input
                  placeholder="Anlasma ara"
                  value={agreementSearch}
                  onChange={(e) => setAgreementSearch(e.target.value)}
                  style={SEARCH_INPUT}
                />
              </div>
            </div>
          </div>

          {!selectedCustomer ? (
            <div style={{ padding: '18px 16px', fontSize: '12px', color: '#8b97ac' }}>
              Anlasma gormek icin musteri secin.
            </div>
          ) : agreements.length === 0 ? (
            <div style={{ padding: '18px 16px', fontSize: '12px', color: '#8b97ac' }}>Anlasma bulunamadi.</div>
          ) : (
            <>
              {/* Tablo basligi */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: ROW_TEMPLATE,
                  gap: '10px',
                  padding: '11px 16px',
                  background: '#fafbfd',
                  borderBottom: '1px solid #eef1f6',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#8b97ac',
                  textTransform: 'uppercase',
                  alignItems: 'center',
                }}
              >
                <span aria-hidden />
                <span>Urun</span>
                <span>Musteri Kodu</span>
                <span style={{ textAlign: 'right' }}>Min</span>
                <span style={{ textAlign: 'right' }}>Faturali</span>
                <span style={{ textAlign: 'right' }}>Beyaz</span>
                <span>Gecerlilik</span>
                <span style={{ textAlign: 'center' }}>Islem</span>
              </div>

              {/* Satirlar */}
              {agreements.map((agreement) => (
                <div
                  key={agreement.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: ROW_TEMPLATE,
                    gap: '10px',
                    padding: '13px 16px',
                    borderTop: '1px solid #f1f4f9',
                    fontSize: '12px',
                    color: '#14223b',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label="Sec"
                    style={{ width: '15px', height: '15px', accentColor: '#15356b' }}
                    checked={selectedAgreementIds.includes(agreement.id)}
                    onChange={() => toggleAgreementSelection(agreement.id)}
                    disabled={bulkDeleting}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{agreement.product.name}</div>
                    <div style={{ fontSize: '10.5px', color: '#8b97ac', ...MONO }}>{agreement.product.mikroCode}</div>
                  </div>
                  <span style={{ ...MONO, color: '#51607a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agreement.customerProductCode || '-'}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {agreement.minQuantity} {agreement.product.unit || ''}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(agreement.priceInvoiced)}</span>
                  <span style={{ textAlign: 'right' }}>
                    {agreement.priceWhite !== null && agreement.priceWhite !== undefined
                      ? formatCurrency(agreement.priceWhite)
                      : '-'}
                  </span>
                  <div style={{ fontSize: '10.5px', color: '#8b97ac', lineHeight: 1.5 }}>
                    <div>Baslangic: {formatDateShort(agreement.validFrom)}</div>
                    <div>Bitis: {agreement.validTo ? formatDateShort(agreement.validTo) : '-'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectAgreement(agreement)}
                      title="Duzenle"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15356b', padding: '3px' }}
                    >
                      <Pencil width={15} height={15} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(agreement.id)}
                      disabled={deletingId === agreement.id}
                      title="Sil"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: deletingId === agreement.id ? 'not-allowed' : 'pointer',
                        color: '#b91c1c',
                        padding: '3px',
                        opacity: deletingId === agreement.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 width={15} height={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
