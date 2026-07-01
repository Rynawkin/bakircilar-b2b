'use client';

import { Plus, Search } from 'lucide-react';
import { formatDateShort, formatCurrency } from '@/lib/utils/format';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { CustomerEditModal } from '@/components/admin/CustomerEditModal';
import { BulkCreateUsersModal } from '@/components/admin/BulkCreateUsersModal';
import { useMusteriler } from './useMusteriler';

/**
 * Yeni gorunum Musteriler ekrani. Mevcut TUM mantik useMusteriler'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kolon/filtre/sekme/modal/durum dusurulmemistir.
 *
 * Tasarim tokenlari (brief 4.6.1 / design HTML):
 *   primary #15356b, hover #1c4585, ink #14223b, muted #51607a / #8b97ac,
 *   line #e7ebf2 / #eef1f6, card #fff, table header bg #fafbfd.
 */

const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const PRIMARY = '#15356b';
const LINE = '#e7ebf2';
const ROW_LINE = '#f1f4f9';

// Tablo kolon sablonu (basliklar ile satirlar ayni grid kullanir)
const GRID =
  '1.6fr 1fr 96px 1.1fr 0.9fr 0.9fr 1.1fr 0.8fr 0.9fr 1fr 70px 1.1fr 90px 0.9fr 96px';

export default function MusterilerNew() {
  const {
    filteredCustomers,
    cariList,
    isLoading,
    isFetching,
    showForm,
    toggleForm,
    formData,
    setFormData,
    selectedCari,
    handleSubmit,
    showCariModal,
    setShowCariModal,
    handleCariSelect,
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    page,
    total,
    totalPages,
    goPrev,
    goNext,
    showEditModal,
    setShowEditModal,
    customerToEdit,
    openEditModal,
    handleEditCustomer,
    showBulkCreateModal,
    setShowBulkCreateModal,
    canOpenCustomer,
    canEditCustomer,
    canBulkCreate,
    fetchCustomers,
    getPaymentPlanLabel,
    getCustomerTypeName,
    CUSTOMER_TYPES,
  } = useMusteriler();

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: PRIMARY }}
        />
      </div>
    );
  }

  // Segment rozeti renkleri
  const segBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    background: '#eef2fa',
    border: '1px solid #d6e0f1',
    color: PRIMARY,
    fontSize: '10.5px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  };

  const inputBox: React.CSSProperties = {
    flex: 1,
    border: 'none',
    background: 'none',
    outline: 'none',
    fontSize: '13px',
    color: INK,
    fontFamily: 'inherit',
  };

  const tabBase: React.CSSProperties = {
    padding: '7px 14px',
    fontSize: '12.5px',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
  };

  const tabActive: React.CSSProperties = {
    ...tabBase,
    fontWeight: 600,
    color: PRIMARY,
    background: '#fff',
    border: '1px solid #d3deef',
  };

  const tabIdle: React.CSSProperties = {
    ...tabBase,
    fontWeight: 500,
    color: FAINT,
    background: 'transparent',
    border: '1px solid transparent',
  };

  // Form alani: salt-okunur Mikro bilgi kutusu (readonly input gorunumu)
  const roField = (label: string, value: string, valueStyle?: React.CSSProperties) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: MUTED }}>{label}</span>
      <input
        value={value}
        readOnly
        disabled={!selectedCari}
        placeholder="Cari seçilince dolar"
        style={{
          height: 38,
          border: `1px solid #e3e8f0`,
          borderRadius: 8,
          padding: '0 11px',
          fontSize: '12.5px',
          color: INK,
          background: selectedCari ? '#fff' : '#f7f9fc',
          fontFamily: 'inherit',
          outline: 'none',
          ...valueStyle,
        }}
      />
    </label>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="container-custom" style={{ paddingTop: 8, paddingBottom: 32, color: INK }}>
        {/* Ust bar: baslik + Toplu Kullanici Olustur + Yeni Musteri/Iptal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            margin: '24px 0 18px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>
              Müşteri Yönetimi
            </h1>
            <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
              Müşteriler ({total} toplam) · segment, fiyat görünürlüğü, alt kullanıcılar
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {canBulkCreate && (
              <button
                type="button"
                onClick={() => setShowBulkCreateModal(true)}
                style={{
                  background: '#fff',
                  border: '1px solid #d8e0ec',
                  borderRadius: 9,
                  padding: '10px 15px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: MUTED,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Toplu Kullanıcı Oluştur
              </button>
            )}
            <button
              type="button"
              onClick={toggleForm}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: showForm ? '#fff' : PRIMARY,
                color: showForm ? MUTED : '#fff',
                border: showForm ? '1px solid #d8e0ec' : 'none',
                borderRadius: 9,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {showForm ? (
                'İptal'
              ) : (
                <>
                  <Plus width={15} height={15} strokeWidth={2.2} />
                  Yeni Müşteri
                </>
              )}
            </button>
          </div>
        </div>

        {/* Yeni Musteri formu (inline) */}
        {showForm && (
          <div
            style={{
              background: '#fff',
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              padding: 18,
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Yeni Müşteri Ekle</div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Mikro Cari Sec */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
                  Mikro Cari Seç *
                </label>
                <button
                  type="button"
                  onClick={() => setShowCariModal(true)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: '#fff',
                    border: '1px solid #d8e0ec',
                    borderRadius: 9,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: formData.mikroCariCode ? INK : MUTED,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {formData.mikroCariCode
                    ? `${formData.mikroCariCode} - ${formData.name}`
                    : "Mikro'dan Seç"}
                </button>
                <p style={{ fontSize: 11, color: FAINT, marginTop: 5 }}>
                  Mikro ERP&apos;den cari seçmek için tıklayın
                </p>
              </div>

              {/* Ad Soyad + Segment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Ad Soyad</span>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Cari seçince otomatik dolar"
                    style={{
                      height: 38,
                      border: '1px solid #e3e8f0',
                      borderRadius: 8,
                      padding: '0 11px',
                      fontSize: '12.5px',
                      color: INK,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                </label>
              </div>

              {/* Fiyat Gorunurlugu */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 420 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Fiyat Görünürlüğü</span>
                <select
                  value={formData.priceVisibility || 'INVOICED_ONLY'}
                  onChange={(e) => setFormData({ ...formData, priceVisibility: e.target.value as any })}
                  style={{
                    height: 38,
                    border: '1px solid #e3e8f0',
                    borderRadius: 8,
                    padding: '0 10px',
                    fontSize: '12.5px',
                    color: INK,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="INVOICED_ONLY">Sadece faturali</option>
                  <option value="WHITE_ONLY">Sadece beyaz</option>
                  <option value="BOTH">Faturali + beyaz</option>
                </select>
                <span style={{ fontSize: 11, color: FAINT }}>
                  Müşterinin görebileceği fiyat tiplerini belirler.
                </span>
              </label>

              {/* Mikro ERP Bilgileri (readonly) */}
              <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 12 }}>
                  Mikro ERP Bilgileri (Otomatik Doldurulur)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                  {roField('Şehir', selectedCari?.city || '')}
                  {roField('İlçe', selectedCari?.district || '')}
                  {roField('Telefon', selectedCari?.phone || '')}
                  {roField('Grup Kodu', selectedCari?.groupCode || '')}
                  {roField('Sektör Kodu', selectedCari?.sectorCode || '')}
                  {roField('Vade Planı', selectedCari ? getPaymentPlanLabel(selectedCari) : '')}
                  {roField(
                    'Bakiye',
                    selectedCari ? formatCurrency(selectedCari.balance) : '',
                    selectedCari
                      ? {
                          color: selectedCari.balance >= 0 ? '#047857' : '#b91c1c',
                          fontWeight: 600,
                        }
                      : undefined
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Durum</span>
                    <div style={{ display: 'flex', gap: 6, height: 38, alignItems: 'center' }}>
                      {selectedCari ? (
                        <>
                          {selectedCari.hasEInvoice && (
                            <span
                              style={{
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                color: '#047857',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 999,
                              }}
                            >
                              E-Fatura
                            </span>
                          )}
                          {selectedCari.isLocked && (
                            <span
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#b91c1c',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 999,
                              }}
                            >
                              Kilitli
                            </span>
                          )}
                          {!selectedCari.hasEInvoice && !selectedCari.isLocked && (
                            <span
                              style={{
                                background: '#eef2fa',
                                border: '1px solid #d6e0f1',
                                color: PRIMARY,
                                fontSize: '10.5px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 999,
                              }}
                            >
                              Normal
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: FAINT, fontSize: 12 }}>Cari seçilince görünür</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hesap Bilgileri */}
              <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 12 }}>
                  Hesap Bilgileri
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Kullanıcı Adı / E-posta</span>
                    <input
                      type="text"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="ornek@firma.com veya 120.01.0001"
                      style={{
                        height: 38,
                        border: '1px solid #e3e8f0',
                        borderRadius: 8,
                        padding: '0 11px',
                        fontSize: '12.5px',
                        color: INK,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>Şifre</span>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      placeholder="En az 6 karakter"
                      style={{
                        height: 38,
                        border: '1px solid #e3e8f0',
                        borderRadius: 8,
                        padding: '0 11px',
                        fontSize: '12.5px',
                        color: INK,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedCari}
                style={{
                  width: '100%',
                  background: selectedCari ? PRIMARY : '#aab6cc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 9,
                  padding: '11px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: selectedCari ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {selectedCari ? 'Müşteri Oluştur' : 'Önce Mikro Cari Seçin'}
              </button>
            </form>
          </div>
        )}

        {/* Filtre bari: 3 sekme (Tumu/Aktif/Pasif) + arama */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'inline-flex', background: '#f1f4f9', borderRadius: 8, padding: 3 }}>
            <span
              style={filterActive === 'all' ? tabActive : tabIdle}
              onClick={() => setFilterActive('all')}
            >
              Tümü
            </span>
            <span
              style={filterActive === 'active' ? tabActive : tabIdle}
              onClick={() => setFilterActive('active')}
            >
              Aktif
            </span>
            <span
              style={filterActive === 'inactive' ? tabActive : tabIdle}
              onClick={() => setFilterActive('inactive')}
            >
              Pasif
            </span>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 220,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              border: '1px solid #e3e8f0',
              borderRadius: 8,
              padding: '0 12px',
              background: '#fff',
            }}
          >
            <Search width={15} height={15} stroke="#9aa6b8" strokeWidth={2} />
            <input
              placeholder="Ad, kullanıcı adı, cari kodu, şehir, ilçe veya telefon ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={inputBox}
            />
          </div>
        </div>

        {/* Tablo karti */}
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1400 }}>
              {/* Baslik satiri (15 kolon) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  gap: 10,
                  padding: '11px 16px',
                  background: '#fafbfd',
                  borderBottom: `1px solid ${LINE}`,
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '.02em',
                  color: FAINT,
                  textTransform: 'uppercase',
                  alignItems: 'center',
                }}
              >
                <span>Ad</span>
                <span>Kullanıcı</span>
                <span>Tip</span>
                <span>Mikro Cari</span>
                <span>Şehir</span>
                <span>İlçe</span>
                <span>Telefon</span>
                <span>Grup</span>
                <span>Sektör</span>
                <span>Vade Planı</span>
                <span style={{ textAlign: 'center' }}>E-Fat.</span>
                <span style={{ textAlign: 'right' }}>Bakiye</span>
                <span style={{ textAlign: 'center' }}>Durum</span>
                <span>Kayıt</span>
                <span style={{ textAlign: 'center' }}>İşlem</span>
              </div>

              {/* Satirlar / bos durum */}
              {filteredCustomers.length === 0 ? (
                <div
                  style={{
                    padding: '40px 16px',
                    textAlign: 'center',
                    color: FAINT,
                    fontSize: 13,
                    borderTop: `1px solid ${ROW_LINE}`,
                  }}
                >
                  {isFetching ? 'Yükleniyor…' : 'Müşteri bulunamadı'}
                </div>
              ) : (
                filteredCustomers.map((customer) => {
                  const balanceValue = customer.balance;
                  const balanceStyle: React.CSSProperties =
                    balanceValue !== undefined
                      ? {
                          color: balanceValue >= 0 ? '#047857' : '#b91c1c',
                          fontWeight: 600,
                          textAlign: 'right',
                        }
                      : { color: MUTED, textAlign: 'right' };
                  return (
                    <div
                      key={customer.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID,
                        gap: 10,
                        padding: '13px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'center',
                      }}
                    >
                      {/* Ad */}
                      <span
                        style={{
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {customer.name}
                      </span>
                      {/* Kullanici */}
                      <span
                        style={{
                          color: MUTED,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {customer.email}
                      </span>
                      {/* Mikro Cari */}
                      <span style={{ fontFamily: "'Roboto Mono',monospace", fontSize: 11, color: MUTED }}>
                        {customer.mikroCariCode}
                      </span>
                      {/* Sehir */}
                      <span style={{ color: MUTED }}>{customer.city || '-'}</span>
                      {/* Ilce */}
                      <span style={{ color: MUTED }}>{customer.district || '-'}</span>
                      {/* Telefon */}
                      <span style={{ fontFamily: "'Roboto Mono',monospace", fontSize: 11, color: MUTED }}>
                        {customer.phone || '-'}
                      </span>
                      {/* Grup Kodu */}
                      <span style={{ color: MUTED }}>{customer.groupCode || '-'}</span>
                      {/* Sektor Kodu */}
                      <span style={{ color: MUTED }}>{customer.sectorCode || '-'}</span>
                      {/* Vade Plani */}
                      <span style={{ color: MUTED }}>{getPaymentPlanLabel(customer)}</span>
                      {/* E-Fatura */}
                      <span style={{ textAlign: 'center' }}>
                        <span
                          style={
                            customer.hasEInvoice
                              ? {
                                  background: '#ecfdf5',
                                  border: '1px solid #a7f3d0',
                                  color: '#047857',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                }
                              : {
                                  background: '#f4f6fa',
                                  border: '1px solid #e3e8f0',
                                  color: MUTED,
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                }
                          }
                        >
                          {customer.hasEInvoice ? 'Evet' : 'Hayır'}
                        </span>
                      </span>
                      {/* Bakiye */}
                      <span style={balanceStyle}>
                        {balanceValue !== undefined ? formatCurrency(balanceValue) : '-'}
                      </span>
                      {/* Durum (Kilitli/Aktif/Pasif) */}
                      <span style={{ textAlign: 'center' }}>
                        {customer.isLocked ? (
                          <span
                            style={{
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              color: '#b91c1c',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                            }}
                          >
                            Kilitli
                          </span>
                        ) : customer.active ? (
                          <span
                            style={{
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#047857',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                            }}
                          >
                            Aktif
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#f4f6fa',
                              border: '1px solid #e3e8f0',
                              color: MUTED,
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                            }}
                          >
                            Pasif
                          </span>
                        )}
                      </span>
                      {/* Kayit */}
                      <span style={{ color: FAINT, whiteSpace: 'nowrap' }}>
                        {formatDateShort(customer.createdAt)}
                      </span>
                      {/* Islem */}
                      <span style={{ textAlign: 'center' }}>
                        {canOpenCustomer ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(customer)}
                            style={{
                              background: '#fff',
                              border: '1px solid #d8e0ec',
                              borderRadius: 7,
                              padding: '5px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              color: PRIMARY,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {canEditCustomer ? 'Düzenle' : 'Kişiler'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#a4afc1' }}>Yetki yok</span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sunucu-tarafli sayfalama kontrolu */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 14,
          }}
        >
          <div style={{ fontSize: 12.5, color: MUTED }}>
            Sayfa {page} / {totalPages} · Toplam {total}
            {isFetching && (
              <span style={{ marginLeft: 8, color: FAINT }}>· güncelleniyor…</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={goPrev}
              disabled={page <= 1 || isFetching}
              style={{
                background: '#fff',
                border: `1px solid ${page <= 1 || isFetching ? '#eef1f6' : '#e7ebf2'}`,
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                color: page <= 1 || isFetching ? '#a4afc1' : PRIMARY,
                cursor: page <= 1 || isFetching ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={page >= totalPages || isFetching}
              style={{
                background: '#fff',
                border: `1px solid ${page >= totalPages || isFetching ? '#eef1f6' : '#e7ebf2'}`,
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                color: page >= totalPages || isFetching ? '#a4afc1' : PRIMARY,
                cursor: page >= totalPages || isFetching ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>

      {/* Modallar — mevcut paylasilan komponentler, handler'lar birebir korunur */}
      <CariSelectModal
        isOpen={showCariModal}
        onClose={() => setShowCariModal(false)}
        onSelect={handleCariSelect}
        cariList={cariList}
      />

      <CustomerEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        customer={customerToEdit}
        onSave={handleEditCustomer}
        canEditFields={canEditCustomer}
      />

      <BulkCreateUsersModal
        isOpen={showBulkCreateModal}
        onClose={() => setShowBulkCreateModal(false)}
        onSuccess={() => {
          fetchCustomers();
          setShowBulkCreateModal(false);
        }}
      />
    </div>
  );
}
