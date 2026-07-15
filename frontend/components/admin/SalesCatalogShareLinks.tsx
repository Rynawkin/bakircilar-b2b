'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Ban,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  MonitorSmartphone,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import adminApi, { CustomerWithListSuggestion } from '@/lib/api/admin';
import salesCatalogApi, {
  SalesCatalogAdjustment,
  SalesCatalogAdmin,
  SalesCatalogShareAnalytics,
  SalesCatalogShareLink,
  SalesCatalogShareLinkInput,
  SalesCatalogShareLinkStatus,
} from '@/lib/api/salesCatalog';

type Props = {
  catalog: SalesCatalogAdmin;
  onBack: () => void;
};

type FormState = {
  id?: string;
  name: string;
  recipientName: string;
  linkedCustomerId: string;
  linkedCustomerCode: string;
  linkedCustomerName: string;
  status: SalesCatalogShareLinkStatus;
  expiresAt: string;
  maxDevices: string;
  maxViews: string;
  pin: string;
  clearPin: boolean;
  hasPin: boolean;
  lockToFirstDevice: boolean;
  resetDeviceBinding: boolean;
  useCustomPricing: boolean;
  adjustmentType: SalesCatalogAdjustment;
  adjustmentValue: string;
  isDefault: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  recipientName: '',
  linkedCustomerId: '',
  linkedCustomerCode: '',
  linkedCustomerName: '',
  status: 'ACTIVE',
  expiresAt: '',
  maxDevices: '',
  maxViews: '',
  pin: '',
  clearPin: false,
  hasPin: false,
  lockToFirstDevice: false,
  resetDeviceBinding: false,
  useCustomPricing: false,
  adjustmentType: 'MARKUP',
  adjustmentValue: '20',
  isDefault: false,
});

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const fromLink = (link: SalesCatalogShareLink): FormState => ({
  id: link.id,
  name: link.name,
  recipientName: link.recipientName || '',
  linkedCustomerId: link.linkedCustomerId || '',
  linkedCustomerCode: link.linkedCustomerCode || '',
  linkedCustomerName: link.linkedCustomerName || '',
  status: link.status,
  expiresAt: toDateTimeLocal(link.expiresAt),
  maxDevices: link.maxDevices ? String(link.maxDevices) : '',
  maxViews: link.maxViews ? String(link.maxViews) : '',
  pin: '',
  clearPin: false,
  hasPin: link.hasPin,
  lockToFirstDevice: link.lockToFirstDevice,
  resetDeviceBinding: false,
  useCustomPricing: link.useCustomPricing,
  adjustmentType: link.adjustmentType || 'MARKUP',
  adjustmentValue: String(link.adjustmentValue ?? 20),
  isDefault: link.isDefault,
});

const statusText: Record<string, string> = {
  ACTIVE: 'Aktif',
  PAUSED: 'Duraklatıldı',
  REVOKED: 'İptal edildi',
  EXPIRED: 'Süresi doldu',
  VIEW_LIMIT_REACHED: 'Limit doldu',
};

const statusStyle: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  REVOKED: 'bg-red-50 text-red-700 ring-red-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
  VIEW_LIMIT_REACHED: 'bg-orange-50 text-orange-700 ring-orange-200',
};

const eventText: Record<string, string> = {
  FIRST_OPEN: 'İlk kez açıldı',
  VIEW: 'Görüntülendi',
  PDF_DOWNLOAD: 'PDF indirildi',
  SHARE_CLICK: 'Paylaş butonu kullanıldı',
  MULTI_DEVICE: 'Çoklu cihaz tespit edildi',
};

const adjustmentText: Record<SalesCatalogAdjustment, string> = {
  MARKUP: 'Maliyete kâr ekle',
  GROSS_MARGIN: 'Brüt marj hedefle',
  LOSS: 'Bazın altında listele',
  NONE: 'Ek oran uygulama',
};

const errorText = (error: any, fallback: string) =>
  error?.response?.data?.error?.message || error?.response?.data?.error || error?.message || fallback;

const dateText = (value?: string | null, withTime = false) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
};

export default function SalesCatalogShareLinks({ catalog, onBack }: Props) {
  const [links, setLinks] = useState<SalesCatalogShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrLink, setQrLink] = useState<SalesCatalogShareLink | null>(null);
  const [analytics, setAnalytics] = useState<SalesCatalogShareAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerWithListSuggestion[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await salesCatalogApi.listShareLinks(catalog.id);
      setLinks(response.links || []);
    } catch (error) {
      toast.error(errorText(error, 'Paylaşım linkleri yüklenemedi.'));
    } finally {
      setLoading(false);
    }
  }, [catalog.id]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    if (!form || customerSearch.trim().length < 2) {
      setCustomers([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const response = await adminApi.getCustomers({ search: customerSearch.trim(), pageSize: 12 });
        if (active) setCustomers(response.customers || []);
      } catch (error) {
        if (active) toast.error(errorText(error, 'Müşteri araması yapılamadı.'));
      } finally {
        if (active) setCustomerLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerSearch, form]);

  const totals = useMemo(() => links.reduce((result, link) => ({
    views: result.views + Number(link.viewCount || 0),
    devices: result.devices + Number(link.uniqueDevices || 0),
    pdf: result.pdf + Number(link.pdfDownloadCount || 0),
  }), { views: 0, devices: 0, pdf: 0 }), [links]);

  const publicUrl = (link: SalesCatalogShareLink) => `${window.location.origin}${link.publicPath}`;

  const copyLink = async (link: SalesCatalogShareLink) => {
    await navigator.clipboard.writeText(publicUrl(link));
    toast.success(`${link.name} bağlantısı kopyalandı.`);
  };

  const whatsapp = (link: SalesCatalogShareLink) => {
    const recipient = link.recipientName || link.linkedCustomerName;
    const prepared = recipient ? `
${recipient} için hazırlanmıştır.` : '';
    const text = `${catalog.title}${prepared}
Güncel kataloğu görüntülemek için:
${publicUrl(link)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const save = async () => {
    if (!form || !form.name.trim()) {
      toast.error('Bağlantı adı zorunludur.');
      return;
    }
    setSaving(true);
    const payload: SalesCatalogShareLinkInput = {
      name: form.name.trim(),
      recipientName: form.recipientName.trim() || null,
      linkedCustomerId: form.linkedCustomerId || null,
      status: form.status,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      maxDevices: form.maxDevices ? Number(form.maxDevices) : null,
      maxViews: form.maxViews ? Number(form.maxViews) : null,
      pin: form.pin || undefined,
      clearPin: form.clearPin,
      lockToFirstDevice: form.lockToFirstDevice,
      resetDeviceBinding: form.resetDeviceBinding,
      useCustomPricing: form.useCustomPricing,
      adjustmentType: form.useCustomPricing ? form.adjustmentType : null,
      adjustmentValue: form.useCustomPricing ? Number(form.adjustmentValue) || 0 : null,
    };
    try {
      if (form.id) await salesCatalogApi.updateShareLink(catalog.id, form.id, payload);
      else await salesCatalogApi.createShareLink(catalog.id, payload);
      toast.success(form.id ? 'Paylaşım bağlantısı güncellendi.' : 'Kişiye özel bağlantı oluşturuldu.');
      setForm(null);
      setCustomerSearch('');
      await loadLinks();
      if (analytics?.link.id === form.id) await openAnalytics(form.id!);
    } catch (error) {
      toast.error(errorText(error, 'Paylaşım bağlantısı kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (link: SalesCatalogShareLink, status: SalesCatalogShareLinkStatus) => {
    if (status === 'REVOKED' && !confirm(`“${link.name}” bağlantısı iptal edilsin mi? Eski adres artık açılmayacak.`)) return;
    try {
      await salesCatalogApi.updateShareLink(catalog.id, link.id, { status });
      toast.success(status === 'ACTIVE' ? 'Bağlantı yeniden açıldı.' : status === 'PAUSED' ? 'Bağlantı duraklatıldı.' : 'Bağlantı iptal edildi.');
      await loadLinks();
    } catch (error) {
      toast.error(errorText(error, 'Bağlantı durumu değiştirilemedi.'));
    }
  };

  const rotate = async (link: SalesCatalogShareLink) => {
    if (!confirm(`“${link.name}” için yeni adres üretilecek ve eski adres hemen kapanacak. Devam edilsin mi?`)) return;
    try {
      await salesCatalogApi.rotateShareLinkToken(catalog.id, link.id);
      toast.success('Yeni paylaşım adresi üretildi.');
      await loadLinks();
    } catch (error) {
      toast.error(errorText(error, 'Bağlantı yenilenemedi.'));
    }
  };

  const openAnalytics = async (linkId: string) => {
    setAnalyticsLoading(true);
    try {
      setAnalytics(await salesCatalogApi.getShareLinkAnalytics(catalog.id, linkId));
    } catch (error) {
      toast.error(errorText(error, 'Bağlantı detayları yüklenemedi.'));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const setBlock = async (visitorId: string, scope: 'CATALOG' | 'GLOBAL', blocked: boolean) => {
    if (!analytics) return;
    const label = scope === 'GLOBAL' ? 'tüm kataloglarda' : 'bu katalogda';
    if (blocked && !confirm(`Bu anonim cihaz ${label} engellensin mi?`)) return;
    try {
      await salesCatalogApi.setVisitorBlock(catalog.id, analytics.link.id, visitorId, { scope, blocked });
      toast.success(blocked ? `Cihaz ${label} engellendi.` : `Cihaz erişimi ${label} yeniden açıldı.`);
      await openAnalytics(analytics.link.id);
    } catch (error) {
      toast.error(errorText(error, 'Cihaz erişimi değiştirilemedi.'));
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-[#f4f6fa] pb-16">
      <div className="sticky top-[60px] z-30 border-b border-[#dfe5ee] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={onBack} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
            <ArrowLeft className="h-4 w-4" /> Kataloglara dön
          </button>
          <div className="min-w-[220px] flex-1">
            <div className="text-[15px] font-semibold text-[#14223b]">{catalog.name} · Paylaşım Linkleri</div>
            <div className="truncate text-[11.5px] text-[#8b97ac]">{catalog.title}</div>
          </div>
          <button onClick={() => setForm(emptyForm())} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#15356b] px-4 text-[13px] font-semibold text-white hover:bg-[#1c4585]">
            <Plus className="h-4 w-4" /> Kişiye özel link
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-3 sm:grid-cols-4">
          <Metric label="Paylaşım linki" value={links.length} icon={<Link2 className="h-4 w-4" />} />
          <Metric label="Toplam açılış" value={totals.views} icon={<BarChart3 className="h-4 w-4" />} />
          <Metric label="Link-cihaz kaydı" value={totals.devices} icon={<MonitorSmartphone className="h-4 w-4" />} />
          <Metric label="PDF indirme" value={totals.pdf} icon={<ExternalLink className="h-4 w-4" />} />
        </section>

        <section className="overflow-hidden rounded-lg border border-[#e2e7ef] bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebf2] px-4 py-3.5">
            <Link2 className="h-4 w-4 text-[#15356b]" />
            <div className="flex-1">
              <h1 className="text-[15px] font-semibold text-[#14223b]">Katalog bağlantıları</h1>
              <p className="mt-0.5 text-[11.5px] text-[#8b97ac]">Genel bağlantı korunur; kişi veya müşteriye göre sınırsız ayrı bağlantı açabilirsiniz.</p>
            </div>
            <button onClick={loadLinks} title="Yenile" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]"><RefreshCw className="h-4 w-4" /></button>
          </div>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-[13px] text-[#8b97ac]"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bağlantılar yükleniyor</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead className="bg-[#f7f9fc] text-[10.5px] uppercase text-[#8b97ac]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Bağlantı / alıcı</th>
                    <th className="px-4 py-3 font-semibold">Fiyat</th>
                    <th className="px-4 py-3 font-semibold">Koruma</th>
                    <th className="px-4 py-3 font-semibold">Açılış / oturum</th>
                    <th className="px-4 py-3 font-semibold">Cihaz / PDF</th>
                    <th className="px-4 py-3 font-semibold">Son kullanım</th>
                    <th className="px-4 py-3 font-semibold">Durum</th>
                    <th className="px-4 py-3 text-right font-semibold">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f5]">
                  {links.map((link) => (
                    <tr key={link.id} className="text-[12px] hover:bg-[#fbfcfe]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-semibold text-[#14223b]">{link.name}{link.isDefault && <span className="rounded bg-[#eef2fa] px-1.5 py-0.5 text-[9.5px] text-[#15356b]">GENEL</span>}</div>
                        <div className="mt-0.5 max-w-[260px] truncate text-[10.5px] text-[#8b97ac]">{link.recipientName || link.linkedCustomerName || 'Kişi belirtilmedi'}{link.linkedCustomerCode ? ` · ${link.linkedCustomerCode}` : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-[#51607a]">{link.useCustomPricing ? <><span className="font-semibold text-[#14223b]">%{Number(link.adjustmentValue || 0).toLocaleString('tr-TR')}</span><div className="text-[10px] text-[#8b97ac]">{adjustmentText[link.adjustmentType || 'MARKUP']}</div></> : <><span>Katalog varsayılanı</span><div className="text-[10px] text-[#8b97ac]">%{catalog.adjustmentValue}</div></>}</td>
                      <td className="px-4 py-3 text-[#51607a]"><div className="flex flex-wrap gap-1">{link.hasPin && <MiniBadge icon={<KeyRound className="h-3 w-3" />} text="PIN" />}{link.lockToFirstDevice && <MiniBadge icon={<LockKeyhole className="h-3 w-3" />} text="İlk cihaz" />}{link.maxDevices && !link.lockToFirstDevice && <MiniBadge icon={<Smartphone className="h-3 w-3" />} text={`${link.maxDevices} cihaz`} />}{!link.hasPin && !link.lockToFirstDevice && !link.maxDevices && <span className="text-[#a0a9b8]">Standart</span>}</div></td>
                      <td className="px-4 py-3 text-[#51607a]"><span className="font-semibold text-[#14223b]">{link.viewCount}</span> açılış<div className="text-[10px] text-[#8b97ac]">{link.sessionCount} oturum{link.maxViews ? ` / ${link.maxViews} limit` : ''}</div></td>
                      <td className="px-4 py-3 text-[#51607a]"><span className="font-semibold text-[#14223b]">{link.uniqueDevices}</span> cihaz<div className="text-[10px] text-[#8b97ac]">{link.pdfDownloadCount} PDF · {link.shareClickCount} paylaşım</div></td>
                      <td className="px-4 py-3 text-[#51607a]">{dateText(link.lastViewedAt, true)}<div className="text-[10px] text-[#8b97ac]">{link.expiresAt ? `Bitiş ${dateText(link.expiresAt, true)}` : 'Süresiz'}</div></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusStyle[link.effectiveStatus] || statusStyle.PAUSED}`}>{statusText[link.effectiveStatus] || link.effectiveStatus}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Action title="Kopyala" onClick={() => copyLink(link)} icon={<Copy className="h-3.5 w-3.5" />} />
                          <Action title="Kataloğu aç" onClick={() => window.open(link.publicPath, '_blank', 'noopener,noreferrer')} icon={<ExternalLink className="h-3.5 w-3.5" />} />
                          <Action title="WhatsApp" onClick={() => whatsapp(link)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
                          <Action title="QR kod" onClick={() => setQrLink(link)} icon={<QrCode className="h-3.5 w-3.5" />} />
                          <Action title="Analiz" onClick={() => openAnalytics(link.id)} icon={<BarChart3 className="h-3.5 w-3.5" />} />
                          <Action title="Düzenle" onClick={() => setForm(fromLink(link))} icon={<Pencil className="h-3.5 w-3.5" />} />
                          {link.status === 'ACTIVE' ? <Action title="Duraklat" onClick={() => quickStatus(link, 'PAUSED')} icon={<Pause className="h-3.5 w-3.5" />} /> : link.status === 'PAUSED' ? <Action title="Yeniden aç" onClick={() => quickStatus(link, 'ACTIVE')} icon={<Play className="h-3.5 w-3.5" />} /> : null}
                          <Action title="Diğer işlemler: adresi yenile" onClick={() => rotate(link)} icon={<MoreHorizontal className="h-3.5 w-3.5" />} />
                          {link.status !== 'REVOKED' && <Action title="İptal et" danger onClick={() => quickStatus(link, 'REVOKED')} icon={<Ban className="h-3.5 w-3.5" />} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(analyticsLoading || analytics) && (
          <AnalyticsPanel
            analytics={analytics}
            loading={analyticsLoading}
            onClose={() => setAnalytics(null)}
            onBlock={setBlock}
          />
        )}
      </main>

      {form && (
        <LinkFormModal
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={save}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          customers={customers}
          customerLoading={customerLoading}
        />
      )}

      {qrLink && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onMouseDown={() => setQrLink(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3"><QrCode className="mt-0.5 h-5 w-5 text-[#15356b]" /><div className="flex-1"><h2 className="text-[15px] font-semibold text-[#14223b]">{qrLink.name}</h2><p className="mt-0.5 text-[11px] text-[#8b97ac]">Bu QR kod doğrudan kişisel katalog bağlantısını açar.</p></div><button onClick={() => setQrLink(null)}><X className="h-4 w-4 text-[#64748b]" /></button></div>
            <div className="mx-auto my-5 w-fit rounded-lg border border-[#e2e7ef] bg-white p-4"><QRCodeSVG value={publicUrl(qrLink)} size={220} level="M" includeMargin /></div>
            <button onClick={() => copyLink(qrLink)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#15356b] text-[13px] font-semibold text-white"><Copy className="h-4 w-4" /> Bağlantıyı kopyala</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkFormModal({ form, setForm, saving, onSave, customerSearch, setCustomerSearch, customers, customerLoading }: {
  form: FormState;
  setForm: (value: FormState | null) => void;
  saving: boolean;
  onSave: () => void;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  customers: CustomerWithListSuggestion[];
  customerLoading: boolean;
}) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-5" onMouseDown={() => setForm(null)}>
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e7ebf2] bg-white px-5 py-4">
          <Link2 className="h-5 w-5 text-[#15356b]" />
          <div className="flex-1"><h2 className="text-[16px] font-semibold text-[#14223b]">{form.id ? 'Paylaşım bağlantısını düzenle' : 'Kişiye özel paylaşım bağlantısı'}</h2><p className="text-[11.5px] text-[#8b97ac]">Alıcı, güvenlik ve fiyat oranını bu linke özel belirleyin.</p></div>
          <button onClick={() => setForm(null)}><X className="h-5 w-5 text-[#64748b]" /></button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <SectionTitle icon={<Users className="h-4 w-4" />} title="Bağlantı ve alıcı" />
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Bağlantı adı" hint="Örn. ABC Market - Ahmet Bey">
                <input value={form.name} disabled={form.isDefault} onChange={(event) => update('name', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Filigranda görünecek kişi / firma" hint="Kayıtlı müşteri seçmeden de yazılabilir">
                <input value={form.recipientName} onChange={(event) => update('recipientName', event.target.value)} className={inputClass} placeholder="ABC Market / Ahmet Bey" />
              </Field>
              <div className="relative md:col-span-2">
                <Field label="Kayıtlı müşteriyle ilişkilendir" hint="İsteğe bağlı; cari kodu ve adı link kaydında saklanır">
                  <div className="relative">
                    <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className={inputClass} placeholder="Cari adı veya kodu ile ara" />
                    {customerLoading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-[#8b97ac]" />}
                  </div>
                </Field>
                {customers.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[#d8e0ec] bg-white p-1 shadow-xl">
                    {customers.map((customer) => (
                      <button key={customer.id} type="button" onClick={() => {
                        setForm({ ...form, linkedCustomerId: customer.id, linkedCustomerCode: customer.mikroCariCode || '', linkedCustomerName: customer.name || '', recipientName: form.recipientName || customer.name || '' });
                        setCustomerSearch('');
                      }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-[#f4f6fa]">
                        <span className="truncate text-[12.5px] font-medium text-[#14223b]">{customer.name}</span><span className="text-[11px] text-[#8b97ac]">{customer.mikroCariCode}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.linkedCustomerId && <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#f5f8fd] px-3 py-2 text-[12px] text-[#15356b]"><Check className="h-4 w-4" /><span className="flex-1">{form.linkedCustomerName} · {form.linkedCustomerCode}</span><button onClick={() => setForm({ ...form, linkedCustomerId: '', linkedCustomerCode: '', linkedCustomerName: '' })} className="text-[#64748b]"><X className="h-4 w-4" /></button></div>}
              </div>
            </div>
          </section>

          <section className="border-t border-[#edf0f5] pt-5">
            <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Erişim ve güvenlik" />
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Durum"><select value={form.status} onChange={(event) => update('status', event.target.value as SalesCatalogShareLinkStatus)} className={inputClass}><option value="ACTIVE">Aktif</option><option value="PAUSED">Duraklatılmış</option><option value="REVOKED">İptal edilmiş</option></select></Field>
              <Field label="Son kullanım zamanı"><input type="datetime-local" value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} className={inputClass} /></Field>
              <Field label="Azami cihaz"><select value={form.maxDevices} disabled={form.lockToFirstDevice} onChange={(event) => update('maxDevices', event.target.value)} className={inputClass}><option value="">Sınırsız</option><option value="1">1 cihaz</option><option value="2">2 cihaz</option><option value="3">3 cihaz</option></select></Field>
              <Field label="Görüntülenme limiti" hint="30 dakikalık oturum sayısıdır"><input type="number" min="1" value={form.maxViews} onChange={(event) => update('maxViews', event.target.value)} className={inputClass} placeholder="Sınırsız" /></Field>
              <Field label="Yeni PIN" hint={form.hasPin ? 'Boş bırakırsanız mevcut PIN korunur' : '4-12 haneli, isteğe bağlı'}><input type="password" inputMode="numeric" value={form.pin} onChange={(event) => update('pin', event.target.value.replace(/\D/g, '').slice(0, 12))} className={inputClass} placeholder={form.hasPin ? 'Mevcut PIN korunacak' : 'PIN yok'} /></Field>
              <div className="space-y-2 pt-5">
                {form.hasPin && <CheckLine checked={form.clearPin} onChange={(value) => update('clearPin', value)} label="Mevcut PIN'i kaldır" />}
                <CheckLine checked={form.lockToFirstDevice} onChange={(value) => setForm({ ...form, lockToFirstDevice: value, maxDevices: value ? '1' : form.maxDevices })} label="İlk açan cihaza kilitle" />
                {form.lockToFirstDevice && form.id && <CheckLine checked={form.resetDeviceBinding} onChange={(value) => update('resetDeviceBinding', value)} label="Mevcut cihaz bağını sıfırla" />}
              </div>
            </div>
          </section>

          <section className="border-t border-[#edf0f5] pt-5">
            <SectionTitle icon={<BarChart3 className="h-4 w-4" />} title="Linke özel fiyat oranı" />
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8e0ec] p-3 hover:bg-[#fafbfd]"><input type="checkbox" checked={form.useCustomPricing} onChange={(event) => update('useCustomPricing', event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#15356b]" /><span><span className="block text-[12.5px] font-semibold text-[#14223b]">Katalog varsayılan oranını bu link için değiştir</span><span className="mt-0.5 block text-[11px] leading-4 text-[#8b97ac]">Maliyet kaynağı, KDV, yuvarlama ve minimum fiyat koruması değişmez. Sabit fiyatlı ürünler etkilenmez.</span></span></label>
            {form.useCustomPricing && <div className="mt-3 grid gap-4 md:grid-cols-2"><Field label="Hesaplama"><select value={form.adjustmentType} onChange={(event) => update('adjustmentType', event.target.value as SalesCatalogAdjustment)} className={inputClass}>{Object.entries(adjustmentText).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field><Field label="Oran (%)"><input type="number" min="0" max="99.99" step="0.01" value={form.adjustmentValue} disabled={form.adjustmentType === 'NONE'} onChange={(event) => update('adjustmentValue', event.target.value)} className={inputClass} /></Field></div>}
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e7ebf2] bg-white px-5 py-4">
          <button onClick={() => setForm(null)} className="h-10 rounded-lg border border-[#d8e0ec] px-4 text-[13px] font-medium text-[#51607a]">İptal</button>
          <button onClick={onSave} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#15356b] px-5 text-[13px] font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{form.id ? 'Değişiklikleri kaydet' : 'Bağlantıyı oluştur'}</button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({ analytics, loading, onClose, onBlock }: { analytics: SalesCatalogShareAnalytics | null; loading: boolean; onClose: () => void; onBlock: (visitorId: string, scope: 'CATALOG' | 'GLOBAL', blocked: boolean) => void }) {
  if (loading && !analytics) return <section className="flex h-48 items-center justify-center rounded-lg border border-[#e2e7ef] bg-white text-[13px] text-[#8b97ac]"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cihaz analizi yükleniyor</section>;
  if (!analytics) return null;
  return (
    <section className="overflow-hidden rounded-lg border border-[#b9caea] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebf2] px-4 py-3.5"><BarChart3 className="h-4 w-4 text-[#15356b]" /><div className="flex-1"><h2 className="text-[15px] font-semibold text-[#14223b]">{analytics.link.name} · cihaz ve olay detayı</h2><p className="mt-0.5 text-[11px] text-[#8b97ac]">Anonim tarayıcı kimlikleri; gerçek IMEI, MAC veya donanım kimliği değildir.</p></div><button onClick={onClose}><X className="h-4 w-4 text-[#64748b]" /></button></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left">
          <thead className="bg-[#f7f9fc] text-[10.5px] uppercase text-[#8b97ac]"><tr><th className="px-4 py-3">Anonim cihaz</th><th className="px-4 py-3">Sistem / tarayıcı</th><th className="px-4 py-3">İlk / son</th><th className="px-4 py-3">Açılış / oturum</th><th className="px-4 py-3">PDF / paylaşım</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">Erişim</th></tr></thead>
          <tbody className="divide-y divide-[#edf0f5]">{analytics.visitors.map((visitor) => <tr key={visitor.id} className="text-[12px]"><td className="px-4 py-3"><div className="flex items-center gap-2 font-semibold text-[#14223b]">{visitor.deviceType === 'mobile' ? <Smartphone className="h-4 w-4 text-[#577fbb]" /> : <MonitorSmartphone className="h-4 w-4 text-[#577fbb]" />}{visitor.anonymousId}</div></td><td className="px-4 py-3 text-[#51607a]">{visitor.operatingSystem || 'Bilinmiyor'}<div className="text-[10px] text-[#8b97ac]">{visitor.browser || 'Bilinmiyor'}</div></td><td className="px-4 py-3 text-[#51607a]">{dateText(visitor.firstSeenAt, true)}<div className="text-[10px] text-[#8b97ac]">{dateText(visitor.lastSeenAt, true)}</div></td><td className="px-4 py-3 text-[#51607a]">{visitor.viewCount} açılış<div className="text-[10px] text-[#8b97ac]">{visitor.sessionCount} oturum</div></td><td className="px-4 py-3 text-[#51607a]">{visitor.pdfDownloadCount} PDF<div className="text-[10px] text-[#8b97ac]">{visitor.shareClickCount} paylaşım</div></td><td className="px-4 py-3">{visitor.globalBlocked ? <span className="text-[10.5px] font-semibold text-red-700">Tümünde engelli</span> : visitor.catalogBlocked ? <span className="text-[10.5px] font-semibold text-amber-700">Bu katalogda engelli</span> : <span className="text-[10.5px] font-semibold text-emerald-700">Erişim açık</span>}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">{visitor.catalogBlocked ? <Action title="Bu katalogda aç" onClick={() => onBlock(visitor.id, 'CATALOG', false)} icon={<Unlock className="h-3.5 w-3.5" />} /> : <Action title="Bu katalogda engelle" onClick={() => onBlock(visitor.id, 'CATALOG', true)} icon={<Ban className="h-3.5 w-3.5" />} />}{visitor.globalBlocked ? <Action title="Tüm kataloglarda aç" onClick={() => onBlock(visitor.id, 'GLOBAL', false)} icon={<ShieldCheck className="h-3.5 w-3.5" />} /> : <Action title="Tüm kataloglarda engelle" danger onClick={() => onBlock(visitor.id, 'GLOBAL', true)} icon={<LockKeyhole className="h-3.5 w-3.5" />} />}</div></td></tr>)}</tbody>
        </table>
        {analytics.visitors.length === 0 && <div className="p-8 text-center text-[12.5px] text-[#8b97ac]">Bu bağlantı henüz gerçek bir ziyaret almadı.</div>}
      </div>
      {analytics.events.length > 0 && <div className="border-t border-[#e7ebf2] p-4"><h3 className="text-[12.5px] font-semibold text-[#14223b]">Son olaylar</h3><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{analytics.events.slice(0, 12).map((event) => <div key={event.id} className="flex items-center gap-2 rounded-lg bg-[#f7f9fc] px-3 py-2 text-[11px]"><span className="h-2 w-2 rounded-full bg-[#577fbb]" /><span className="min-w-0 flex-1 truncate text-[#51607a]">{eventText[event.eventType] || event.eventType}</span><span className="text-[10px] text-[#8b97ac]">{dateText(event.occurredAt, true)}</span></div>)}</div></div>}
    </section>
  );
}

const inputClass = 'h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] text-[#14223b] outline-none focus:border-[#577fbb] focus:ring-2 focus:ring-[#577fbb]/15 disabled:bg-[#f4f6fa] disabled:text-[#8b97ac]';

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-lg border border-[#e2e7ef] bg-white px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2fa] text-[#15356b]">{icon}</span><span><span className="block text-[18px] font-semibold text-[#14223b]">{value.toLocaleString('tr-TR')}</span><span className="text-[11.5px] text-[#8b97ac]">{label}</span></span></div>; }
function MiniBadge({ icon, text }: { icon: React.ReactNode; text: string }) { return <span className="inline-flex items-center gap-1 rounded-md bg-[#eef2fa] px-1.5 py-1 text-[9.5px] font-semibold text-[#15356b]">{icon}{text}</span>; }
function Action({ title, icon, onClick, danger }: { title: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) { return <button type="button" title={title} aria-label={title} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'}`}>{icon}</button>; }
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#14223b]"><span className="text-[#15356b]">{icon}</span>{title}</div>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-[11.5px] font-semibold text-[#51607a]"><span>{label}</span>{hint && <span className="font-normal text-[#9aa4b4]">{hint}</span>}</span>{children}</label>; }
function CheckLine({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="flex cursor-pointer items-center gap-2 text-[11.5px] font-medium text-[#51607a]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#15356b]" />{label}</label>; }
