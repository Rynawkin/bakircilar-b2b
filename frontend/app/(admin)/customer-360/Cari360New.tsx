'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Mail,
  Package,
  ReceiptText,
  Search,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useCari360,
  CUSTOMER_360_MODULES,
  safeDate,
  money,
  invoicedListLabel,
  retailListLabel,
} from './useCari360';
import { QuoteDetailModal } from './Cari360Classic';
import { INVOICED_PRICE_LISTS, RETAIL_PRICE_LISTS } from '@/lib/utils/priceLists';

/**
 * Yeni gorunum Cari 360. Mevcut TUM mantik useCari360'tan gelir; sadece gorsel yeni.
 * Hicbir veri/handler/kolon/sekme/rozet/modal dusurulmemistir; Klasik ile birebir ayni
 * data bindingleri kullanilir.
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// ---- Yeni gorunum sunum yardimcilari (mevcut mantik degismez) ----

function NewStatusBadge({ value }: { value: unknown }) {
  const status = String(value || '').toUpperCase();
  let style = 'background:#eef2fa;border:1px solid #d6e0f1;color:#1c4585';
  if (status.includes('APPROVED') || status.includes('ACCEPTED') || status.includes('COMPLETED')) {
    style = 'background:#ecfdf5;border:1px solid #a7f3d0;color:#047857';
  } else if (status.includes('REJECTED') || status.includes('CANCEL') || status.includes('OVERDUE')) {
    style = 'background:#fef2f2;border:1px solid #fecaca;color:#b91c1c';
  } else if (status.includes('PENDING') || status.includes('WAITING') || status.includes('OPEN')) {
    style = 'background:#fffbeb;border:1px solid #fde68a;color:#b45309';
  }
  const styleObj = Object.fromEntries(
    style.split(';').filter(Boolean).map((s) => {
      const [k, v] = s.split(':');
      return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.trim()];
    })
  ) as React.CSSProperties;
  return (
    <span
      style={{ ...styleObj, fontSize: '9.5px', fontWeight: 600, padding: '1px 7px', borderRadius: '5px', display: 'inline-block' }}
    >
      {String(value || '-')}
    </span>
  );
}

function NewEmpty({ text }: { text: string }) {
  return (
    <div
      style={{
        border: '1px dashed #e3e8f0',
        background: '#fafbfd',
        borderRadius: '9px',
        padding: '18px 14px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#8b97ac',
      }}
    >
      {text}
    </div>
  );
}

function NewSection({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={CARD} style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 15px',
          borderBottom: '1px solid #eef1f6',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#14223b' }}>
          <Icon width={15} height={15} stroke="#8b97ac" strokeWidth={2} />
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: '15px' }}>{children}</div>
    </div>
  );
}

function NewMini({ label, value, tone }: { label: string; value: string | number; tone?: 'ink' | 'red' | 'blue' | 'amber' | 'green' }) {
  const colorMap: Record<string, string> = { ink: '#14223b', red: '#b91c1c', blue: '#1c4585', amber: '#b45309', green: '#047857' };
  return (
    <div className={CARD} style={{ padding: '13px 14px' }}>
      <div style={{ fontSize: '11px', color: '#8b97ac' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: colorMap[tone || 'ink'], marginTop: '5px' }}>{value}</div>
    </div>
  );
}

function NewTable({
  rows,
  columns,
  emptyText,
}: {
  rows: any[];
  columns: Array<[string, (row: any) => ReactNode]>;
  emptyText: string;
}) {
  if (!rows || rows.length === 0) return <NewEmpty text={emptyText} />;
  const template = columns.map(() => 'minmax(0,1fr)').join(' ');
  return (
    <div className={CARD} style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: template,
          gap: '9px',
          padding: '9px 13px',
          background: '#fafbfd',
          borderBottom: '1px solid #eef1f6',
          fontSize: '10px',
          fontWeight: 600,
          color: '#8b97ac',
          textTransform: 'uppercase',
        }}
      >
        {columns.map(([title]) => (
          <span key={title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          key={row.id || `${rowIndex}`}
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: '9px',
            padding: '11px 13px',
            borderTop: '1px solid #f1f4f9',
            fontSize: '12px',
            color: '#14223b',
            alignItems: 'center',
          }}
        >
          {columns.map(([title, render]) => (
            <span key={title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {render(row)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// Yeni gorunum buton stili (primary açık mavi cip)
const chipBtn: React.CSSProperties = {
  background: '#eef2fa',
  border: '1px solid #d6e0f1',
  borderRadius: '6px',
  padding: '4px 10px',
  fontSize: '10.5px',
  fontWeight: 600,
  color: '#15356b',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};

export default function Cari360New() {
  const {
    search,
    setSearch,
    customers,
    searching,
    selectedCustomer,
    data,
    loadingDetail,
    activeModule,
    setActiveModule,
    quoteDetail,
    quoteDetailLoading,
    setQuoteDetail,
    downloadingInvoiceId,
    priceListEditOpen,
    manualInvoicedInput,
    setManualInvoicedInput,
    manualRetailInput,
    setManualRetailInput,
    manualNoteInput,
    setManualNoteInput,
    savingPriceListSuggestion,
    hasManualListSuggestion,
    effectiveInvoicedListNo,
    effectiveRetailListNo,
    openPriceListEdit,
    closePriceListEdit,
    savePriceListSuggestion,
    loadCustomer,
    openQuoteDetail,
    downloadInvoice,
    customer,
    summary,
    activityRows,
  } = useCari360();

  // Sekme rozet sayilari (mevcut summary verisinden; uydurma yok)
  const tabPill: Record<string, number> = {
    sales: Number(summary.pendingOrderCount || 0),
    finance: 0,
    actions: Number(summary.overdueTaskCount || 0),
    activity: 0,
    relations: 0,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fb' }}>
      <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Baslik */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', margin: '8px 0 18px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: '#14223b' }}>Cari 360</h1>
            <div style={{ fontSize: '13px', color: '#8b97ac', marginTop: '5px' }}>
              Cariyi secip satis, teklif, sepet, vade, aksiyon ve aktiviteyi tek ekranda inceleyin.
            </div>
          </div>
          <Link
            href="/customers"
            style={{
              ...chipBtn,
              padding: '8px 14px',
              fontSize: '12.5px',
              textDecoration: 'none',
            }}
          >
            Musteri Listesi
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,300px) minmax(0,1fr)', gap: '16px', alignItems: 'start' }}>
          {/* Sol: Cari Ara */}
          <div className={CARD} style={{ padding: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#14223b', marginBottom: '10px' }}>
              <Search width={15} height={15} stroke="#15356b" strokeWidth={2} />
              Cari Ara
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '38px',
                border: '1px solid #e3e8f0',
                borderRadius: '8px',
                padding: '0 11px',
                marginBottom: '12px',
              }}
            >
              <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Kod, unvan, sehir veya sektor"
                style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '12.5px', color: '#14223b', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '680px', overflow: 'auto', paddingRight: '2px' }}>
              {searching && <NewEmpty text="Cariler yukleniyor..." />}
              {!searching && customers.length === 0 && <NewEmpty text="Cari bulunamadi." />}
              {!searching && customers.map((item) => {
                const active = String(selectedCustomer?.id || '') === String(item.id || '');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadCustomer(item)}
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      border: active ? '1px solid #d6e0f1' : '1px solid #eef1f6',
                      background: active ? '#eef2fa' : '#fff',
                      borderRadius: '9px',
                      padding: '11px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#14223b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.displayTitle || item.mikroName || item.name || '-'}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#8b97ac', fontFamily: "'Roboto Mono', monospace", marginTop: '2px' }}>
                          {item.mikroCariCode || '-'} · {item.sectorCode || '-'}
                        </div>
                      </div>
                      <span
                        style={
                          item.active === false
                            ? { background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', flex: 'none' }
                            : { background: '#ecfdf5', color: '#047857', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', flex: 'none' }
                        }
                      >
                        {item.active === false ? 'Pasif' : 'Aktif'}
                      </span>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '11px', color: '#51607a' }}>
                      <span>{[item.city, item.district].filter(Boolean).join(' / ') || '-'}</span>
                      <span style={{ fontWeight: 600, color: '#b45309' }}>{money(item.balance)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sag: Detay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!customer && (
              <div className={CARD} style={{ padding: '15px' }}>
                <NewEmpty text="Analiz icin soldan bir cari secin." />
              </div>
            )}

            {customer && (
              <>
                {/* Cari baslik karti (koyu) */}
                <div style={{ background: '#0c2247', borderRadius: '14px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>
                      {customer.displayTitle || customer.mikroName || customer.name || '-'}
                    </span>
                    <span
                      style={
                        customer.active === false
                          ? { background: 'rgba(248,113,113,.18)', color: '#fca5a5', fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px' }
                          : { background: 'rgba(110,231,183,.16)', color: '#6ee7b7', fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px' }
                      }
                    >
                      {customer.active === false ? 'Pasif' : 'Aktif'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '9px', fontSize: '12px', color: '#9bb0d4', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{customer.mikroCariCode || '-'}</span>
                    <span>{[customer.city, customer.district].filter(Boolean).join(' / ') || '-'}</span>
                    <span>Sektor: {customer.sectorCode || '-'}</span>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>Cari Bakiye: {money(summary.balance ?? customer.balance)}</span>
                  </div>
                </div>

                {loadingDetail ? (
                  <div className={CARD} style={{ padding: '15px' }}>
                    <NewEmpty text="Cari detaylari yukleniyor..." />
                  </div>
                ) : (
                  <>
                    {/* Fiyat listesi onerisi karti */}
                    <div className={CARD} style={{ padding: '13px 15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: '#51607a' }}>
                            <Tag width={14} height={14} stroke="#8b97ac" strokeWidth={2} />
                            Önerilen Fiyat Listesi:
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#14223b' }}>
                            {invoicedListLabel(effectiveInvoicedListNo)} / {retailListLabel(effectiveRetailListNo)}
                          </span>
                          {hasManualListSuggestion ? (
                            <span
                              title={customer.manualListNote || 'Manuel belirlenen öneri'}
                              style={{ background: '#eef2fa', border: '1px solid #d6e0f1', color: '#1c4585', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}
                            >
                              Manuel belirlenen öneri
                            </span>
                          ) : (
                            <span
                              title={customer.suggestedListBasis || 'Sistem tarafından hesaplandı'}
                              style={{ background: '#f4f6fa', border: '1px solid #e3e8f0', color: '#64748b', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}
                            >
                              Sistem önerisi{customer.suggestedListComputedAt ? ` · ${safeDate(customer.suggestedListComputedAt)}` : ''}
                            </span>
                          )}
                          {hasManualListSuggestion && customer.manualListNote && (
                            <span style={{ fontSize: '11px', color: '#51607a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px' }}>
                              {customer.manualListNote}
                            </span>
                          )}
                        </div>
                        {!priceListEditOpen && (
                          <button type="button" style={chipBtn} onClick={openPriceListEdit}>
                            Düzenle
                          </button>
                        )}
                      </div>

                      {priceListEditOpen && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eef1f6', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#8b97ac', marginBottom: '4px' }}>Faturalı öneri</label>
                            <select
                              value={manualInvoicedInput}
                              onChange={(e) => setManualInvoicedInput(e.target.value)}
                              style={{ height: '34px', border: '1px solid #e3e8f0', borderRadius: '8px', padding: '0 9px', fontSize: '12px', color: '#14223b', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="">Boş (sistem önerisi)</option>
                              {INVOICED_PRICE_LISTS.map((list) => (
                                <option key={list.listNo} value={list.listNo}>{`Faturalı ${list.tier} (Liste ${list.listNo})`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#8b97ac', marginBottom: '4px' }}>Perakende öneri</label>
                            <select
                              value={manualRetailInput}
                              onChange={(e) => setManualRetailInput(e.target.value)}
                              style={{ height: '34px', border: '1px solid #e3e8f0', borderRadius: '8px', padding: '0 9px', fontSize: '12px', color: '#14223b', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="">Boş (sistem önerisi)</option>
                              {RETAIL_PRICE_LISTS.map((list) => (
                                <option key={list.listNo} value={list.listNo}>{`Perakende ${list.tier} (Liste ${list.listNo})`}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ flex: 1, minWidth: '180px' }}>
                            <label style={{ display: 'block', fontSize: '11px', color: '#8b97ac', marginBottom: '4px' }}>Not</label>
                            <input
                              value={manualNoteInput}
                              onChange={(e) => setManualNoteInput(e.target.value)}
                              placeholder="Örn: patron talimatı, özel anlaşma..."
                              style={{ width: '100%', height: '34px', border: '1px solid #e3e8f0', borderRadius: '8px', padding: '0 10px', fontSize: '12px', color: '#14223b', background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={savePriceListSuggestion}
                              disabled={savingPriceListSuggestion}
                              style={{ background: '#15356b', border: 'none', borderRadius: '8px', padding: '0 14px', height: '34px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: savingPriceListSuggestion ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingPriceListSuggestion ? 0.6 : 1 }}
                            >
                              {savingPriceListSuggestion ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                            <button
                              type="button"
                              onClick={closePriceListEdit}
                              disabled={savingPriceListSuggestion}
                              style={{ ...chipBtn, height: '34px', padding: '0 12px', fontSize: '12px' }}
                            >
                              Vazgeç
                            </button>
                          </div>
                          <div style={{ width: '100%', fontSize: '10.5px', color: '#8b97ac' }}>
                            Boş seçim manuel tanımı temizler; cari sistem önerisine döner.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4 ozet kutu */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '14px' }}>
                      <div className={CARD} style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#8b97ac' }}>
                          <ClipboardList width={14} height={14} stroke="#8b97ac" strokeWidth={2} /> Siparis
                        </div>
                        <div style={{ fontSize: '19px', fontWeight: 600, color: '#14223b', marginTop: '5px' }}>
                          {Number(summary.orderCount || 0).toLocaleString('tr-TR')} · {money(summary.orderAmount)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#b45309', marginTop: '3px' }}>{summary.pendingOrderCount || 0} bekleyen</div>
                      </div>
                      <div className={CARD} style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#8b97ac' }}>
                          <FileText width={14} height={14} stroke="#8b97ac" strokeWidth={2} /> Teklif
                        </div>
                        <div style={{ fontSize: '19px', fontWeight: 600, color: '#14223b', marginTop: '5px' }}>
                          {Number(summary.quoteCount || 0).toLocaleString('tr-TR')} · {money(summary.quoteAmount)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#8b97ac', marginTop: '3px' }}>{summary.pendingQuoteCount || 0} bekleyen</div>
                      </div>
                      <div className={CARD} style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#8b97ac' }}>
                          <ShoppingCart width={14} height={14} stroke="#8b97ac" strokeWidth={2} /> Sepet
                        </div>
                        <div style={{ fontSize: '19px', fontWeight: 600, color: '#14223b', marginTop: '5px' }}>
                          {Number(summary.cartItemCount || 0).toLocaleString('tr-TR')} · {money(summary.cartTotal)}
                        </div>
                      </div>
                      <div className={CARD} style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#8b97ac' }}>
                          <AlertTriangle width={14} height={14} stroke="#8b97ac" strokeWidth={2} /> Aksiyon
                        </div>
                        <div style={{ fontSize: '19px', fontWeight: 600, color: '#14223b', marginTop: '5px' }}>{summary.openTaskCount || 0} acik</div>
                        <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '3px' }}>
                          Geciken {summary.overdueTaskCount || 0} · Geri kazanma {summary.openRecoveryActionCount || 0}
                        </div>
                      </div>
                    </div>

                    {/* 5 modul sekmesi */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      {CUSTOMER_360_MODULES.map((module) => {
                        const Icon = module.icon as unknown as LucideIcon;
                        const active = activeModule === module.key;
                        const pill = tabPill[module.key];
                        return (
                          <button
                            key={module.key}
                            type="button"
                            onClick={() => setActiveModule(module.key)}
                            title={module.description}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              borderRadius: '9px',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              border: active ? '1px solid #15356b' : '1px solid #e3e8f0',
                              background: active ? '#15356b' : '#fff',
                              color: active ? '#fff' : '#51607a',
                            }}
                          >
                            <Icon width={14} height={14} stroke={active ? '#fff' : '#8b97ac'} strokeWidth={2} />
                            {module.label}
                            {pill > 0 && (
                              <span style={{ marginLeft: '2px', background: '#dc2626', color: '#fff', fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px' }}>
                                {pill}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* SATIS AKISI */}
                    {activeModule === 'sales' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px' }}>
                        <NewSection title="Son Siparisler" icon={ClipboardList}>
                          <NewTable
                            rows={data?.orders || []}
                            emptyText="Siparis yok."
                            columns={[
                              ['Siparis', (row) => (
                                <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }}>
                                  {row.orderNumber || row.customerOrderNumber || '-'}
                                </span>
                              )],
                              ['Durum', (row) => <NewStatusBadge value={row.status} />],
                              ['Tutar', (row) => <span style={{ fontWeight: 600 }}>{money(row.totalAmount)}</span>],
                              ['Tarih', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.createdAt)}</span>],
                            ]}
                          />
                        </NewSection>

                        <NewSection title="Son Teklifler" icon={FileText}>
                          <NewTable
                            rows={data?.quotes || []}
                            emptyText="Teklif yok."
                            columns={[
                              ['Teklif', (row) => (
                                <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }}>
                                  {row.quoteNumber || row.mikroNumber || '-'}
                                </span>
                              )],
                              ['Durum', (row) => <NewStatusBadge value={row.status} />],
                              ['Tutar', (row) => <span style={{ fontWeight: 600 }}>{money(row.grandTotal ?? row.totalAmount)}</span>],
                              ['Tarih', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.createdAt)}</span>],
                              ['Islem', (row) => (
                                <button
                                  type="button"
                                  style={chipBtn}
                                  onClick={() => openQuoteDetail(row.id)}
                                  disabled={quoteDetailLoading}
                                >
                                  <Eye width={12} height={12} stroke="#15356b" strokeWidth={2} />
                                  Detay
                                </button>
                              )],
                            ]}
                          />
                        </NewSection>

                        <NewSection title="Aktif Sepet" icon={ShoppingCart}>
                          <NewTable
                            rows={data?.cart?.items || []}
                            emptyText="Sepette urun yok."
                            columns={[
                              ['Stok', (row) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{row.product?.mikroCode || '-'}</span>],
                              ['Urun', (row) => row.product?.name || '-'],
                              ['Miktar', (row) => Number(row.quantity || 0).toLocaleString('tr-TR')],
                              ['Tutar', (row) => <span style={{ fontWeight: 600 }}>{money(Number(row.quantity || 0) * Number(row.unitPrice || 0))}</span>],
                            ]}
                          />
                        </NewSection>

                        <NewSection
                          title="Anlasmalar"
                          icon={Tag}
                          action={
                            <span style={{ fontSize: '11px', color: '#51607a' }}>
                              Aktif Anlasma: <b style={{ color: '#14223b', fontWeight: 600 }}>{summary.activeAgreementCount || 0}</b>
                            </span>
                          }
                        >
                          <NewTable
                            rows={data?.agreements?.recent || []}
                            emptyText="Aktif anlasma yok."
                            columns={[
                              ['Stok', (row) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{row.product?.mikroCode || '-'}</span>],
                              ['Urun', (row) => row.product?.name || '-'],
                              ['Fiyat', (row) => <span style={{ fontWeight: 600 }}>{money(row.priceInvoiced ?? row.priceWhite)}</span>],
                            ]}
                          />
                        </NewSection>
                      </div>
                    )}

                    {/* FINANS & BELGELER */}
                    {activeModule === 'finance' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px' }}>
                        <NewSection title="Vade ve Notlar" icon={Wallet}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '10px' }}>
                            <NewMini label="Vade Bakiyesi" value={money(data?.vade?.balance?.balance ?? summary.balance)} tone="blue" />
                            <NewMini label="Sinif" value={data?.vade?.classification?.classCode || '-'} />
                            <NewMini label="Aktif Atama" value={(data?.vade?.assignments || []).length} />
                          </div>
                          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(data?.vade?.notes || []).slice(0, 6).map((note: any) => (
                              <div key={note.id} style={{ border: '1px solid #eef1f6', background: '#fafbfd', borderRadius: '9px', padding: '10px', fontSize: '12px' }}>
                                <div style={{ fontWeight: 600, color: '#14223b' }}>{note.author?.name || note.author?.email || '-'}</div>
                                <div style={{ marginTop: '4px', color: '#51607a' }}>{note.note || note.content || '-'}</div>
                              </div>
                            ))}
                            {(data?.vade?.notes || []).length === 0 && <NewEmpty text="Vade notu yok." />}
                          </div>
                        </NewSection>

                        <NewSection title="Fiyat Guven Karti" icon={Tag}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '10px' }}>
                            <NewMini label="Guven" value={`${data?.priceTrust?.score ?? 0}/100`} tone={(data?.priceTrust?.score ?? 0) >= 80 ? 'green' : (data?.priceTrust?.score ?? 0) >= 55 ? 'amber' : 'red'} />
                            <NewMini label="Fiyat Gorunum" value={data?.priceTrust?.priceVisibility || '-'} />
                            <NewMini label="Anlasma" value={data?.priceTrust?.activeAgreementCount ?? 0} />
                          </div>
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, fontSize: 12 }}>
                            <div style={{ border: '1px solid #eef1f6', borderRadius: 9, padding: 10, background: '#fafbfd' }}>
                              <div style={{ color: '#8b97ac', fontWeight: 600, fontSize: 10.5 }}>Manuel Liste</div>
                              <div style={{ color: '#14223b', fontWeight: 600 }}>
                                F:{data?.priceTrust?.manualInvoicedListNo || '-'} / B:{data?.priceTrust?.manualRetailListNo || '-'}
                              </div>
                            </div>
                            <div style={{ border: '1px solid #eef1f6', borderRadius: 9, padding: 10, background: '#fafbfd' }}>
                              <div style={{ color: '#8b97ac', fontWeight: 600, fontSize: 10.5 }}>Onerilen Liste</div>
                              <div style={{ color: '#14223b', fontWeight: 600 }}>
                                F:{data?.priceTrust?.suggestedInvoicedListNo || '-'} / B:{data?.priceTrust?.suggestedRetailListNo || '-'}
                              </div>
                            </div>
                          </div>
                          {(data?.priceTrust?.warnings || []).length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {data.priceTrust.warnings.map((warning: string) => (
                                <div key={warning} style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92500a', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, fontWeight: 600 }}>
                                  {warning}
                                </div>
                              ))}
                            </div>
                          )}
                        </NewSection>

                        <NewSection title="Faturalar" icon={ReceiptText}>
                          <NewTable
                            rows={data?.invoices?.recent || []}
                            emptyText="Fatura yok."
                            columns={[
                              ['Fatura', (row) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{row.invoiceNo || '-'}</span>],
                              ['Durum', (row) => <NewStatusBadge value={row.matchStatus} />],
                              ['Tutar', (row) => <span style={{ fontWeight: 600 }}>{row.totalAmount !== undefined ? money(row.totalAmount) : '-'}</span>],
                              ['Tarih', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.issueDate || row.createdAt)}</span>],
                              ['Islem', (row) => (
                                <button
                                  type="button"
                                  style={chipBtn}
                                  onClick={() => downloadInvoice(row)}
                                  disabled={downloadingInvoiceId === row.id}
                                >
                                  <Download width={12} height={12} stroke="#15356b" strokeWidth={2} />
                                  {downloadingInvoiceId === row.id ? 'Iniyor' : 'Indir'}
                                </button>
                              )],
                            ]}
                          />
                        </NewSection>

                        <NewSection title="Siparis Talepleri" icon={Mail}>
                          <NewTable
                            rows={data?.orderRequests || []}
                            emptyText="Talep yok."
                            columns={[
                              ['Talep', (row) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{row.order?.orderNumber || row.id || '-'}</span>],
                              ['Durum', (row) => <NewStatusBadge value={row.status} />],
                              ['Not', (row) => row.note || '-'],
                              ['Tarih', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.createdAt)}</span>],
                            ]}
                          />
                        </NewSection>
                      </div>
                    )}

                    {/* AKSIYONLAR */}
                    {activeModule === 'actions' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px' }}>
                        <NewSection title="Gorevler" icon={Package}>
                          <NewTable
                            rows={data?.tasks || []}
                            emptyText="Gorev yok."
                            columns={[
                              ['Baslik', (row) => row.title || '-'],
                              ['Durum', (row) => <NewStatusBadge value={row.status} />],
                              ['Atanan', (row) => <span style={{ color: '#51607a' }}>{row.assignedTo?.name || row.assignedTo?.email || '-'}</span>],
                              ['Tarih', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.updatedAt || row.createdAt)}</span>],
                            ]}
                          />
                        </NewSection>

                        <NewSection title="Geri Kazanma Aksiyonlari" icon={AlertTriangle}>
                          <NewTable
                            rows={data?.recoveryActions || []}
                            emptyText="Geri kazanma aksiyonu yok."
                            columns={[
                              ['Aksiyon', (row) => row.actionType || '-'],
                              ['Durum', (row) => <NewStatusBadge value={row.status} />],
                              ['Not', (row) => row.note || '-'],
                              ['Takip', (row) => <span style={{ color: '#51607a' }}>{safeDate(row.followUpDate || row.createdAt)}</span>],
                            ]}
                          />
                        </NewSection>
                      </div>
                    )}

                    {/* AKTIVITE */}
                    {activeModule === 'activity' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
                        <NewSection title="Aktivite Ozeti" icon={Activity}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' }}>
                            <NewMini label="30 Gun Event" value={summary.activityEventCount30d || 0} />
                            <NewMini label="Son Aktivite" value={safeDate(summary.lastActivityAt)} />
                          </div>
                          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                            {activityRows.slice(0, 10).map(([key, value]) => (
                              <div
                                key={key}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfd', border: '1px solid #eef1f6', borderRadius: '7px', padding: '7px 10px', color: '#51607a' }}
                              >
                                <span>{key}</span>
                                <strong style={{ color: '#14223b', fontWeight: 600 }}>{Number(value).toLocaleString('tr-TR')}</strong>
                              </div>
                            ))}
                            {activityRows.length === 0 && <NewEmpty text="Aktivite yok." />}
                          </div>
                        </NewSection>

                        <NewSection title="Temas Ozeti" icon={Users}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' }}>
                            <NewMini label="Temas Sayisi" value={data?.engagement?.contactCount ?? 0} />
                            <NewMini label="Son Temas" value={safeDate(data?.engagement?.lastContactAt)} />
                            <NewMini label="Sonuc" value={data?.engagement?.lastOutcome || '-'} />
                            <NewMini label="Sonraki Takip" value={safeDate(data?.engagement?.nextFollowUpDate)} tone={data?.engagement?.nextFollowUpDate ? 'amber' : 'ink'} />
                          </div>
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(data?.engagement?.recentContacts || []).slice(0, 4).map((contact: any) => (
                              <div key={contact.id} style={{ border: '1px solid #eef1f6', background: '#fafbfd', borderRadius: 9, padding: 10, fontSize: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ fontWeight: 600, color: '#14223b' }}>{contact.channel || 'Temas'}</span>
                                  <span style={{ color: '#8b97ac' }}>{safeDate(contact.contactedAt)}</span>
                                </div>
                                <div style={{ marginTop: 4, color: '#51607a' }}>{contact.note || contact.outcome || '-'}</div>
                              </div>
                            ))}
                            {(data?.engagement?.recentContacts || []).length === 0 && <NewEmpty text="Temas kaydi yok." />}
                          </div>
                        </NewSection>

                        <NewSection title="En Cok Bakilan Sayfalar" icon={FileText}>
                          <NewTable
                            rows={data?.activity?.topPages || []}
                            emptyText="Sayfa aktivitesi yok."
                            columns={[
                              ['Sayfa', (row) => row.pageTitle || row.pagePath || '-'],
                              ['Path', (row) => <span style={{ color: '#51607a', fontFamily: "'Roboto Mono', monospace" }}>{row.pagePath || '-'}</span>],
                              ['Adet', (row) => <span style={{ fontWeight: 600 }}>{Number(row.count || 0).toLocaleString('tr-TR')}</span>],
                            ]}
                          />
                        </NewSection>

                        <NewSection title="Ilgi Goren Urunler" icon={Package}>
                          <NewTable
                            rows={data?.activity?.topProducts || []}
                            emptyText="Urun aktivitesi yok."
                            columns={[
                              ['Stok', (row) => <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{row.productCode || '-'}</span>],
                              ['Urun', (row) => row.productName || '-'],
                              ['Adet', (row) => <span style={{ fontWeight: 600 }}>{Number(row.count || 0).toLocaleString('tr-TR')}</span>],
                            ]}
                          />
                        </NewSection>
                      </div>
                    )}

                    {/* KISILER */}
                    {activeModule === 'relations' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '14px' }}>
                        <NewSection title="Kisiler" icon={Users}>
                          <NewContactList rows={data?.contacts || []} emptyText="Kisi kaydi yok." />
                        </NewSection>

                        <NewSection title="Alt Kullanicilar" icon={Users}>
                          <NewContactList rows={data?.subUsers || []} emptyText="Alt kullanici yok." />
                        </NewSection>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Paylasilan teklif detay modali (Klasik ile birebir ayni) */}
      <QuoteDetailModal
        quote={quoteDetail}
        loading={quoteDetailLoading}
        isOpen={quoteDetailLoading || Boolean(quoteDetail)}
        onClose={() => {
          if (quoteDetailLoading) return;
          setQuoteDetail(null);
        }}
      />
    </div>
  );
}

function NewContactList({ rows, emptyText }: { rows: any[]; emptyText: string }) {
  if (!rows || rows.length === 0) return <NewEmpty text={emptyText} />;
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '-';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.slice(0, 12).map((row) => {
        const display = row.name || row.displayName || row.email || '-';
        return (
          <div
            key={row.id || row.email || row.name}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #eef1f6', borderRadius: '9px', padding: '10px' }}
          >
            <span style={{ width: '34px', height: '34px', borderRadius: '999px', background: '#eef2fa', color: '#15356b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flex: 'none' }}>
              {initials(String(display))}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#14223b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</div>
              <div style={{ fontSize: '10.5px', color: '#8b97ac' }}>{[row.phone, row.email].filter(Boolean).join(' · ') || '-'}</div>
            </div>
            {row.active !== undefined && (
              <span
                style={
                  row.active === false
                    ? { background: '#fef2f2', color: '#b91c1c', fontSize: '9.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', flex: 'none' }
                    : { background: '#ecfdf5', color: '#047857', fontSize: '9.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', flex: 'none' }
                }
              >
                {row.active === false ? 'Pasif' : 'Aktif'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
