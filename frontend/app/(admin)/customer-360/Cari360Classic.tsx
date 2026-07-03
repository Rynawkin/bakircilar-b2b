'use client';

import type { ComponentType, ReactNode } from 'react';
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
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CardRoot as Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  useCari360,
  CUSTOMER_360_MODULES,
  safeDate,
  money,
  statusClass,
  invoicedListLabel,
  retailListLabel,
  type Customer360Module,
} from './useCari360';

export const StatusBadge = ({ value }: { value: unknown }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(value)}`}>
    {String(value || '-')}
  </span>
);

export const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
    {text}
  </div>
);

/**
 * Klasik (mevcut) Cari 360 gorunumu. JSX birebir korunmustur; tum mantik useCari360'tan gelir.
 */
export default function Cari360Classic() {
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

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Cari 360</h1>
            <p className="mt-1 text-sm text-slate-600">
              Cariyi secip satis, teklif, sepet, vade, aksiyon ve aktiviteyi tek ekranda inceleyin.
            </p>
          </div>
          <Link href="/customers">
            <Button variant="outline">Musteri Listesi</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5" />
                Cari Ara
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Kod, unvan, sehir veya sektor"
              />
              <div className="mt-3 max-h-[680px] space-y-2 overflow-auto pr-1">
                {searching && <EmptyState text="Cariler yukleniyor..." />}
                {!searching && customers.length === 0 && <EmptyState text="Cari bulunamadi." />}
                {!searching && customers.map((item) => {
                  const active = String(selectedCustomer?.id || '') === String(item.id || '');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => loadCustomer(item)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.displayTitle || item.mikroName || item.name || '-'}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.mikroCariCode || '-'} / {item.sectorCode || '-'}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {item.active === false ? 'Pasif' : 'Aktif'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <span>{[item.city, item.district].filter(Boolean).join(' / ') || '-'}</span>
                        <span className="font-semibold">{money(item.balance)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {!customer && (
              <Card>
                <CardContent className="pt-6">
                  <EmptyState text="Analiz icin soldan bir cari secin." />
                </CardContent>
              </Card>
            )}

            {customer && (
              <>
                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 p-5 text-white">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-blue-100">{customer.mikroCariCode || '-'}</p>
                        <h2 className="mt-1 text-2xl font-bold">{customer.displayTitle || customer.mikroName || customer.name || '-'}</h2>
                        <p className="mt-2 text-sm text-slate-200">
                          {[customer.city, customer.district].filter(Boolean).join(' / ') || '-'} / Sektor: {customer.sectorCode || '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/10 px-4 py-3 text-right">
                        <p className="text-xs text-blue-100">Cari Bakiye</p>
                        <p className="text-xl font-bold">{money(summary.balance ?? customer.balance)}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {loadingDetail ? (
                  <Card>
                    <CardContent className="pt-6">
                      <EmptyState text="Cari detaylari yukleniyor..." />
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Fiyat listesi onerisi karti */}
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <Tag className="h-4 w-4 text-slate-500" />
                              Önerilen Fiyat Listesi:
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {invoicedListLabel(effectiveInvoicedListNo)} / {retailListLabel(effectiveRetailListNo)}
                            </span>
                            {hasManualListSuggestion ? (
                              <span
                                title={customer.manualListNote || 'Manuel belirlenen öneri'}
                                className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                              >
                                Manuel belirlenen öneri
                              </span>
                            ) : (
                              <span
                                title={customer.suggestedListBasis || 'Sistem tarafından hesaplandı'}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500"
                              >
                                Sistem önerisi{customer.suggestedListComputedAt ? ` · ${safeDate(customer.suggestedListComputedAt)}` : ''}
                              </span>
                            )}
                            {hasManualListSuggestion && customer.manualListNote && (
                              <span className="max-w-[360px] truncate text-xs text-slate-600">{customer.manualListNote}</span>
                            )}
                          </div>
                          {!priceListEditOpen && (
                            <Button size="sm" variant="outline" onClick={openPriceListEdit}>
                              Düzenle
                            </Button>
                          )}
                        </div>

                        {priceListEditOpen && (
                          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Faturalı öneri</label>
                              <select
                                value={manualInvoicedInput}
                                onChange={(e) => setManualInvoicedInput(e.target.value)}
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                              >
                                <option value="">Boş (sistem önerisi)</option>
                                {[6, 7, 8, 9, 10].map((no) => (
                                  <option key={no} value={no}>{`Faturalı ${no - 5} (Liste ${no})`}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Perakende öneri</label>
                              <select
                                value={manualRetailInput}
                                onChange={(e) => setManualRetailInput(e.target.value)}
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                              >
                                <option value="">Boş (sistem önerisi)</option>
                                {[1, 2, 3, 4, 5].map((no) => (
                                  <option key={no} value={no}>{`Perakende ${no} (Liste ${no})`}</option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-[180px] flex-1">
                              <label className="mb-1 block text-xs text-slate-500">Not</label>
                              <Input
                                value={manualNoteInput}
                                onChange={(e) => setManualNoteInput(e.target.value)}
                                placeholder="Örn: patron talimatı, özel anlaşma..."
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={savePriceListSuggestion}
                                isLoading={savingPriceListSuggestion}
                                disabled={savingPriceListSuggestion}
                              >
                                Kaydet
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={closePriceListEdit}
                                disabled={savingPriceListSuggestion}
                              >
                                Vazgeç
                              </Button>
                            </div>
                            <p className="w-full text-[11px] text-slate-500">
                              Boş seçim manuel tanımı temizler; cari sistem önerisine döner.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <Metric icon={ClipboardList} title="Siparis" value={summary.orderCount || 0} sub={`${money(summary.orderAmount)} / Bekleyen ${summary.pendingOrderCount || 0}`} />
                      <Metric icon={FileText} title="Teklif" value={summary.quoteCount || 0} sub={`${money(summary.quoteAmount)} / Bekleyen ${summary.pendingQuoteCount || 0}`} />
                      <Metric icon={ShoppingCart} title="Sepet" value={summary.cartItemCount || 0} sub={money(summary.cartTotal)} />
                      <Metric icon={AlertTriangle} title="Aksiyon" value={summary.openTaskCount || 0} sub={`Geciken ${summary.overdueTaskCount || 0} / Geri kazanma ${summary.openRecoveryActionCount || 0}`} />
                    </div>

                    <ModuleTabs activeModule={activeModule} onChange={setActiveModule} />

                    {activeModule === 'sales' && (
                      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                        <Section title="Son Siparisler" icon={ClipboardList}>
                          <DataTable
                            rows={data?.orders || []}
                            emptyText="Siparis yok."
                            columns={[
                              ['Siparis', (row) => row.orderNumber || row.customerOrderNumber || '-'],
                              ['Durum', (row) => <StatusBadge value={row.status} />],
                              ['Tutar', (row) => money(row.totalAmount)],
                              ['Tarih', (row) => safeDate(row.createdAt)],
                            ]}
                          />
                        </Section>

                        <Section title="Son Teklifler" icon={FileText}>
                          <DataTable
                            rows={data?.quotes || []}
                            emptyText="Teklif yok."
                            columns={[
                              ['Teklif', (row) => row.quoteNumber || row.mikroNumber || '-'],
                              ['Durum', (row) => <StatusBadge value={row.status} />],
                              ['Tutar', (row) => money(row.grandTotal ?? row.totalAmount)],
                              ['Tarih', (row) => safeDate(row.createdAt)],
                              ['Islem', (row) => (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openQuoteDetail(row.id)}
                                  disabled={quoteDetailLoading}
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  Detay
                                </Button>
                              )],
                            ]}
                          />
                        </Section>

                        <Section title="Aktif Sepet" icon={ShoppingCart}>
                          <DataTable
                            rows={data?.cart?.items || []}
                            emptyText="Sepette urun yok."
                            columns={[
                              ['Stok', (row) => row.product?.mikroCode || '-'],
                              ['Urun', (row) => row.product?.name || '-'],
                              ['Miktar', (row) => Number(row.quantity || 0).toLocaleString('tr-TR')],
                              ['Tutar', (row) => money(Number(row.quantity || 0) * Number(row.unitPrice || 0))],
                            ]}
                          />
                        </Section>

                        <Section title="Anlasmalar" icon={Tag}>
                          <MiniStat label="Aktif Anlasma" value={summary.activeAgreementCount || 0} />
                          <DataTable
                            rows={data?.agreements?.recent || []}
                            emptyText="Aktif anlasma yok."
                            columns={[
                              ['Stok', (row) => row.product?.mikroCode || '-'],
                              ['Urun', (row) => row.product?.name || '-'],
                              ['Fiyat', (row) => money(row.priceInvoiced ?? row.priceWhite)],
                            ]}
                          />
                        </Section>
                      </div>
                    )}

                    {activeModule === 'finance' && (
                      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                        <Section title="Vade ve Notlar" icon={Wallet}>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <MiniStat label="Vade Bakiyesi" value={money(data?.vade?.balance?.balance ?? summary.balance)} />
                            <MiniStat label="Sinif" value={data?.vade?.classification?.classCode || '-'} />
                            <MiniStat label="Aktif Atama" value={(data?.vade?.assignments || []).length} />
                          </div>
                          <div className="mt-3 space-y-2">
                            {(data?.vade?.notes || []).slice(0, 6).map((note: any) => (
                              <div key={note.id} className="rounded-lg border bg-slate-50 p-2 text-xs">
                                <p className="font-semibold text-slate-800">{note.author?.name || note.author?.email || '-'}</p>
                                <p className="mt-1 text-slate-600">{note.note || note.content || '-'}</p>
                              </div>
                            ))}
                            {(data?.vade?.notes || []).length === 0 && <EmptyState text="Vade notu yok." />}
                          </div>
                        </Section>

                        <Section title="Faturalar" icon={ReceiptText}>
                          <DataTable
                            rows={data?.invoices?.recent || []}
                            emptyText="Fatura yok."
                            columns={[
                              ['Fatura', (row) => row.invoiceNo || '-'],
                              ['Durum', (row) => <StatusBadge value={row.matchStatus} />],
                              ['Tutar', (row) => row.totalAmount !== undefined ? money(row.totalAmount) : '-'],
                              ['Tarih', (row) => safeDate(row.issueDate || row.createdAt)],
                              ['Islem', (row) => (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadInvoice(row)}
                                  disabled={downloadingInvoiceId === row.id}
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  {downloadingInvoiceId === row.id ? 'Iniyor' : 'Indir'}
                                </Button>
                              )],
                            ]}
                          />
                        </Section>

                        <Section title="Siparis Talepleri" icon={Mail}>
                          <DataTable
                            rows={data?.orderRequests || []}
                            emptyText="Talep yok."
                            columns={[
                              ['Talep', (row) => row.order?.orderNumber || row.id || '-'],
                              ['Durum', (row) => <StatusBadge value={row.status} />],
                              ['Not', (row) => row.note || '-'],
                              ['Tarih', (row) => safeDate(row.createdAt)],
                            ]}
                          />
                        </Section>
                      </div>
                    )}

                    {activeModule === 'actions' && (
                      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                        <Section title="Gorevler" icon={Package}>
                          <DataTable
                            rows={data?.tasks || []}
                            emptyText="Gorev yok."
                            columns={[
                              ['Baslik', (row) => row.title || '-'],
                              ['Durum', (row) => <StatusBadge value={row.status} />],
                              ['Atanan', (row) => row.assignedTo?.name || row.assignedTo?.email || '-'],
                              ['Tarih', (row) => safeDate(row.updatedAt || row.createdAt)],
                            ]}
                          />
                        </Section>

                        <Section title="Geri Kazanma Aksiyonlari" icon={AlertTriangle}>
                          <DataTable
                            rows={data?.recoveryActions || []}
                            emptyText="Geri kazanma aksiyonu yok."
                            columns={[
                              ['Aksiyon', (row) => row.actionType || '-'],
                              ['Durum', (row) => <StatusBadge value={row.status} />],
                              ['Not', (row) => row.note || '-'],
                              ['Takip', (row) => safeDate(row.followUpDate || row.createdAt)],
                            ]}
                          />
                        </Section>
                      </div>
                    )}

                    {activeModule === 'activity' && (
                      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
                        <Section title="Aktivite Ozeti" icon={Activity}>
                          <div className="grid grid-cols-2 gap-2">
                            <MiniStat label="30 Gun Event" value={summary.activityEventCount30d || 0} />
                            <MiniStat label="Son Aktivite" value={safeDate(summary.lastActivityAt)} />
                          </div>
                          <div className="mt-3 space-y-1 text-xs">
                            {activityRows.slice(0, 10).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                                <span>{key}</span>
                                <strong>{Number(value).toLocaleString('tr-TR')}</strong>
                              </div>
                            ))}
                            {activityRows.length === 0 && <EmptyState text="Aktivite yok." />}
                          </div>
                        </Section>

                        <Section title="En Cok Bakilan Sayfalar" icon={FileText}>
                          <DataTable
                            rows={data?.activity?.topPages || []}
                            emptyText="Sayfa aktivitesi yok."
                            columns={[
                              ['Sayfa', (row) => row.pageTitle || row.pagePath || '-'],
                              ['Path', (row) => row.pagePath || '-'],
                              ['Adet', (row) => Number(row.count || 0).toLocaleString('tr-TR')],
                            ]}
                          />
                        </Section>

                        <Section title="Ilgi Goren Urunler" icon={Package}>
                          <DataTable
                            rows={data?.activity?.topProducts || []}
                            emptyText="Urun aktivitesi yok."
                            columns={[
                              ['Stok', (row) => row.productCode || '-'],
                              ['Urun', (row) => row.productName || '-'],
                              ['Adet', (row) => Number(row.count || 0).toLocaleString('tr-TR')],
                            ]}
                          />
                        </Section>
                      </div>
                    )}

                    {activeModule === 'relations' && (
                      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                        <Section title="Kisiler" icon={Users}>
                          <ContactList rows={data?.contacts || []} emptyText="Kisi kaydi yok." />
                        </Section>

                        <Section title="Alt Kullanicilar" icon={Users}>
                          <ContactList rows={data?.subUsers || []} emptyText="Alt kullanici yok." />
                        </Section>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
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

export function ModuleTabs({
  activeModule,
  onChange,
}: {
  activeModule: Customer360Module;
  onChange: (value: Customer360Module) => void;
}) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-5">
        {CUSTOMER_360_MODULES.map((module) => {
          const Icon = module.icon;
          const active = activeModule === module.key;
          return (
            <button
              key={module.key}
              type="button"
              onClick={() => onChange(module.key)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white shadow'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-500'}`} />
                <span className="text-sm font-bold">{module.label}</span>
              </div>
              <p className={`mt-1 text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                {module.description}
              </p>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function Metric({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-2xl bg-slate-900 p-3 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-950">
            {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
          </p>
          <p className="truncate text-xs text-slate-500">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ContactList({ rows, emptyText }: { rows: any[]; emptyText: string }) {
  if (!rows || rows.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="space-y-2">
      {rows.slice(0, 12).map((row) => (
        <div key={row.id || row.email || row.name} className="rounded-lg border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">{row.name || row.displayName || row.email || '-'}</p>
              <p className="mt-1 text-xs text-slate-600">
                {[row.phone, row.email].filter(Boolean).join(' / ') || '-'}
              </p>
            </div>
            {row.active !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {row.active === false ? 'Pasif' : 'Aktif'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuoteDetailModal({
  quote,
  loading,
  isOpen,
  onClose,
}: {
  quote: any;
  loading: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={quote ? `Teklif Detayi: ${quote.quoteNumber}` : 'Teklif Detayi'}
      size="xl"
      footer={
        quote ? (
          <>
            <Link href={`/quotes/new?edit=${quote.id}`}>
              <Button variant="outline">Duzenle</Button>
            </Link>
            <Link href={`/quotes/convert/${quote.id}`}>
              <Button>Aktar / Siparise Cevir</Button>
            </Link>
          </>
        ) : null
      }
    >
      {loading && <EmptyState text="Teklif detayi yukleniyor..." />}
      {!loading && quote && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <MiniStat label="Durum" value={quote.status || '-'} />
            <MiniStat label="Gecerlilik" value={safeDate(quote.validityDate)} />
            <MiniStat label="Kalem" value={(quote.items || []).length} />
            <MiniStat label="Genel Toplam" value={money(quote.grandTotal ?? quote.totalAmount)} />
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cari</p>
                <p className="font-semibold text-slate-900">
                  {quote.customer?.displayName || quote.customer?.mikroName || quote.customer?.name || '-'}
                </p>
                <p className="text-xs text-slate-600">{quote.customer?.mikroCariCode || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Olusturan</p>
                <p className="font-semibold text-slate-900">{quote.createdBy?.name || quote.adminUser?.name || '-'}</p>
                <p className="text-xs text-slate-600">{safeDate(quote.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mikro</p>
                <p className="font-semibold text-slate-900">{quote.mikroNumber || quote.documentNo || '-'}</p>
                <p className="text-xs text-slate-600">{quote.vatZeroed ? 'KDV sifirli' : 'KDV dahil hesap'}</p>
              </div>
            </div>
            {(quote.note || quote.adminNote) && (
              <div className="mt-3 rounded-lg bg-white p-2 text-xs text-slate-700">
                {quote.note && <p><strong>Not:</strong> {quote.note}</p>}
                {quote.adminNote && <p><strong>Admin Not:</strong> {quote.adminNote}</p>}
              </div>
            )}
          </div>

          <DataTable
            rows={quote.items || []}
            emptyText="Teklif kalemi yok."
            columns={[
              ['Stok', (row) => row.productCode || '-'],
              ['Urun', (row) => row.productName || '-'],
              ['Miktar', (row) => `${Number(row.quantity || 0).toLocaleString('tr-TR')} ${row.selectedUnit || row.unit || ''}`],
              ['Birim', (row) => money(row.unitPrice)],
              ['Tutar', (row) => money(row.totalPrice)],
              ['Tip', (row) => row.priceType || '-'],
              ['Durum', (row) => <StatusBadge value={row.status || 'OPEN'} />],
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-slate-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DataTable({
  rows,
  columns,
  emptyText,
}: {
  rows: any[];
  columns: Array<[string, (row: any) => ReactNode]>;
  emptyText: string;
}) {
  if (!rows || rows.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map(([title]) => (
              <th key={title} className="px-3 py-2 text-left font-semibold text-slate-600">{title}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={row.id || `${rowIndex}`} className="hover:bg-slate-50">
              {columns.map(([title, render]) => (
                <td key={title} className="max-w-[260px] truncate px-3 py-2 text-slate-700">
                  {render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
