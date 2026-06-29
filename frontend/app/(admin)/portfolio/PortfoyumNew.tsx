'use client';

import { Search, MapPin, Phone, CalendarClock, Mail, Tag, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import { usePortfoyum, type Customer, type PortfolioFilter } from './usePortfoyum';

/**
 * Yeni gorunum Musteri Portfoyum. Mevcut TUM mantik usePortfoyum'tan gelir; sadece gorsel yeni.
 * Hicbir veri/handler/kolon/filtre/sayac/rozet dusurulmemistir; Klasik ile birebir ayni data
 * bindingleri kullanilir. Referans tasarim: data-screen-label="Portföyüm".
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Segment (customerType) rozet renkleri — CustomerInfoCard mantigini yeni gorsele tasir.
function segmentBadgeStyle(type?: string): string {
  switch (type) {
    case 'VIP':
      return 'background:#ecfdf5;border:1px solid #a7f3d0;color:#047857';
    case 'OZEL':
      return 'background:#fffbeb;border:1px solid #fde68a;color:#b45309';
    case 'BAYI':
      return 'background:#eef2fa;border:1px solid #d6e0f1;color:#1c4585';
    case 'PERAKENDE':
    default:
      return 'background:#f1f4f9;border:1px solid #e3e8f0;color:#51607a';
  }
}

function styleToObj(style: string): Record<string, string> {
  return Object.fromEntries(
    style
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf(':');
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return [camel, val];
      })
  ) as Record<string, string>;
}

const PILL_BASE: React.CSSProperties = {
  fontSize: '11.5px',
  fontWeight: 600,
  padding: '5px 11px',
  borderRadius: 999,
};

function paymentPlanLabel(customer: Customer): string | null {
  if (customer.paymentPlanName || customer.paymentPlanCode) {
    return [customer.paymentPlanCode, customer.paymentPlanName].filter(Boolean).join(' - ');
  }
  if (customer.paymentTerm !== undefined && customer.paymentTerm !== null) {
    return `${customer.paymentTerm} gun`;
  }
  return null;
}

export default function PortfoyumNew() {
  const {
    isLoading,
    searchTerm,
    setSearchTerm,
    filterActive,
    setFilterActive,
    counts,
    filteredCustomers,
  } = usePortfoyum();

  const pills: Array<{ key: PortfolioFilter; label: string }> = [
    { key: 'all', label: 'Hepsi' },
    { key: 'active', label: 'Aktif' },
    { key: 'inactive', label: 'Pasif' },
  ];

  return (
    <div className="container-custom py-6">
      {/* Baslik */}
      <div style={{ margin: '0 0 18px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: '#14223b' }}>
          Musteri Portfoyum
        </h1>
        <div style={{ fontSize: 13, color: '#8b97ac', marginTop: 5 }}>Atanan musterilerinizi tek ekranda takip edin.</div>
      </div>

      {/* Arama */}
      <div
        className="flex items-center gap-2"
        style={{
          height: 40,
          border: '1px solid #e3e8f0',
          borderRadius: 8,
          padding: '0 12px',
          background: '#fff',
          marginBottom: 14,
        }}
      >
        <Search size={15} color="#9aa6b8" />
        <input
          placeholder="Cari kodu, isim, sehir, telefon..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          style={{
            flex: 1,
            border: 'none',
            background: 'none',
            outline: 'none',
            fontSize: 13,
            color: '#14223b',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Pill filtreler + sayac cipleri */}
      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: '#f1f4f9', borderRadius: 8, padding: 3 }}>
          {pills.map((option) => {
            const activePill = filterActive === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilterActive(option.key)}
                style={{
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  fontWeight: activePill ? 600 : 500,
                  color: activePill ? '#15356b' : '#8b97ac',
                  background: activePill ? '#fff' : 'none',
                  border: activePill ? '1px solid #d3deef' : 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span style={{ ...PILL_BASE, color: '#15356b', background: '#eef2fa', border: '1px solid #d6e0f1' }}>
          Toplam {counts.total}
        </span>
        <span style={{ ...PILL_BASE, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          Aktif {counts.active}
        </span>
        <span style={{ ...PILL_BASE, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' }}>
          Pasif {counts.inactive}
        </span>
      </div>

      {/* Durumlar */}
      {isLoading ? (
        <div className={CARD} style={{ padding: 24, fontSize: 13, color: '#8b97ac' }}>
          Yukleniyor...
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className={CARD} style={{ padding: 24, fontSize: 13, color: '#8b97ac' }}>
          Kayit bulunamadi.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
            gap: 14,
          }}
        >
          {filteredCustomers.map((customer) => {
            const planLabel = paymentPlanLabel(customer);
            const hasBalance = customer.balance !== undefined && customer.balance !== null;
            const balancePositive = (customer.balance ?? 0) >= 0;
            return (
              <div key={customer.id} className={CARD} style={{ padding: 15 }}>
                {/* Ust satir: ad + Aktif/Pasif rozeti */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#14223b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {customer.name}
                  </span>
                  <span
                    style={{
                      ...PILL_BASE,
                      flex: 'none',
                      padding: '3px 10px',
                      fontSize: '10.5px',
                      ...(customer.active
                        ? { color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0' }
                        : { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' }),
                    }}
                  >
                    {customer.active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>

                {/* Mikro cari kodu */}
                <div
                  style={{
                    fontSize: 11,
                    color: '#8b97ac',
                    fontFamily: "'Roboto Mono',monospace",
                    marginTop: 4,
                  }}
                >
                  {customer.mikroCariCode || '-'}
                </div>

                {/* Segment / E-Fatura / Kilitli rozetleri (CustomerInfoCard'taki tum rozetler) */}
                {(customer.customerType || customer.hasEInvoice || customer.isLocked) && (
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                    {customer.customerType && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: 999,
                          ...styleToObj(segmentBadgeStyle(customer.customerType)),
                        }}
                      >
                        {getCustomerTypeName(customer.customerType)}
                      </span>
                    )}
                    {customer.hasEInvoice && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: 999,
                          color: '#047857',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                        }}
                      >
                        E-Fatura
                      </span>
                    )}
                    {customer.isLocked && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: 999,
                          color: '#b91c1c',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                        }}
                      >
                        Kilitli
                      </span>
                    )}
                  </div>
                )}

                {/* Kunye satirlari: sehir/ilce, telefon, vade, grup, sektor, email */}
                <div
                  className="flex flex-wrap"
                  style={{ gap: '8px 14px', marginTop: 10, fontSize: '11.5px', color: '#51607a' }}
                >
                  {customer.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} color="#9aa6b8" />
                      {customer.city}
                      {customer.district ? ` / ${customer.district}` : ''}
                    </span>
                  )}
                  {customer.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} color="#9aa6b8" />
                      {customer.phone}
                    </span>
                  )}
                  {planLabel && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} color="#9aa6b8" />
                      Vade {planLabel}
                    </span>
                  )}
                  {customer.groupCode && (
                    <span className="inline-flex items-center gap-1">
                      <Layers size={12} color="#9aa6b8" />
                      Grup {customer.groupCode}
                    </span>
                  )}
                  {customer.sectorCode && (
                    <span className="inline-flex items-center gap-1">
                      <Tag size={12} color="#9aa6b8" />
                      Sektor {customer.sectorCode}
                    </span>
                  )}
                  {customer.email && (
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
                    >
                      <Mail size={12} color="#9aa6b8" />
                      {customer.email}
                    </span>
                  )}
                </div>

                {/* Bakiye (renkli) */}
                {hasBalance && (
                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f4f9' }}
                  >
                    <span style={{ fontSize: 11, color: '#8b97ac' }}>Bakiye</span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: balancePositive ? '#047857' : '#b91c1c',
                      }}
                    >
                      {formatCurrency(customer.balance as number)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
