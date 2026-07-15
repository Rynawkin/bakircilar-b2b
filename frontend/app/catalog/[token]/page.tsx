'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  ImageOff,
  Loader2,
  PackageCheck,
  PackageX,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import salesCatalogApi, { SalesCatalogPresentation } from '@/lib/api/salesCatalog';
import { generateSalesCatalogPdf } from '@/lib/catalogPdf';
import { formatCurrency } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { Logo } from '@/components/ui/Logo';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
};

const makeClientEventId = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function PublicSalesCatalogPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '');
  const [data, setData] = useState<SalesCatalogPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const viewRecordedRef = useRef(false);

  const accessStorageKey = `catalog-access:${token}`;
  const getAccessToken = () => typeof window === 'undefined' ? null : window.sessionStorage.getItem(accessStorageKey);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await salesCatalogApi.getPublic(token, getAccessToken());
      setData(response);
      setPinRequired(false);
      setActiveSection(response.sections[0]?.id || '');
    } catch (requestError: any) {
      const accessCode = requestError?.response?.data?.details?.catalogAccessCode;
      if (accessCode === 'PIN_REQUIRED') {
        setPinRequired(true);
        setError(null);
      } else {
        const messages: Record<string, string> = {
          LINK_PAUSED: 'Bu katalog bağlantısı geçici olarak duraklatılmış.',
          LINK_REVOKED: 'Bu katalog bağlantısı iptal edilmiş.',
          LINK_EXPIRED: 'Bu katalog bağlantısının süresi dolmuş.',
          DEVICE_LIMIT: 'Bu katalog bağlantısı izin verilen cihaz sınırına ulaşmış.',
          VISITOR_BLOCKED: 'Bu tarayıcının katalog erişimi engellenmiş.',
          VIEW_LIMIT: 'Bu katalog bağlantısının görüntülenme limiti dolmuş.',
          CATALOG_DATE_INACTIVE: 'Katalog henüz yayında değil veya yayın dönemi sona ermiş.',
        };
        setError(messages[accessCode] || (requestError?.response?.status === 404
          ? 'Bu katalog yayında değil, süresi dolmuş veya bağlantısı yenilenmiş olabilir.'
          : 'Katalog şu anda yüklenemiyor. Lütfen tekrar deneyin.'));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  const submitPin = async () => {
    if (!/^\d{4,12}$/.test(pin)) {
      setPinError('PIN 4-12 haneli olmalıdır.');
      return;
    }
    setPinLoading(true);
    setPinError(null);
    try {
      const result = await salesCatalogApi.authorizePin(token, pin);
      if (result.accessToken) window.sessionStorage.setItem(accessStorageKey, result.accessToken);
      setPin('');
      await load();
    } catch (requestError: any) {
      const accessCode = requestError?.response?.data?.details?.catalogAccessCode;
      setPinError(accessCode === 'PIN_RATE_LIMIT'
        ? 'Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.'
        : 'PIN doğru değil. Lütfen kontrol edip yeniden deneyin.');
    } finally {
      setPinLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    viewRecordedRef.current = false;
  }, [token]);

  useEffect(() => {
    if (!data || viewRecordedRef.current) return;
    let timer: number | null = null;
    let active = true;
    const record = () => {
      if (!active || viewRecordedRef.current || document.visibilityState !== 'visible') return;
      viewRecordedRef.current = true;
      const clientEventId = makeClientEventId();
      salesCatalogApi.recordEvent(token, 'VIEW', {
        clientEventId,
        priceSnapshotId: data.catalog.priceSnapshotId,
      }, getAccessToken()).catch(() => undefined);
    };
    const schedule = () => {
      if (document.visibilityState !== 'visible' || timer !== null) return;
      timer = window.setTimeout(record, 2000);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
      else if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [data, token]);

  useEffect(() => {
    if (!data || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id.replace('catalog-section-', ''));
      },
      { rootMargin: '-145px 0px -55% 0px', threshold: [0.05, 0.2, 0.5] }
    );
    Object.values(sectionRefs.current).forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [data]);

  const productCount = useMemo(
    () => data?.sections.reduce((sum, section) => sum + section.products.length, 0) || 0,
    [data]
  );

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const share = async () => {
    if (!data) return;
    const payload = { title: data.catalog.title, text: data.catalog.subtitle || 'Güncel satış kataloğu', url: window.location.href };
    const nativeShareAvailable = typeof navigator.share === 'function';
    try {
      if (nativeShareAvailable) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Katalog bağlantısı kopyalandı.');
      }
      salesCatalogApi.recordEvent(token, 'SHARE_CLICK', {
        clientEventId: makeClientEventId(),
        priceSnapshotId: data.catalog.priceSnapshotId,
        metadata: { channel: nativeShareAvailable ? 'native' : 'clipboard' },
      }, getAccessToken()).catch(() => undefined);
    } catch (shareError: any) {
      if (shareError?.name !== 'AbortError') toast.error('Bağlantı paylaşılamadı.');
    }
  };

  const shareWhatsApp = () => {
    if (!data) return;
    salesCatalogApi.recordEvent(token, 'SHARE_CLICK', {
      clientEventId: makeClientEventId(),
      priceSnapshotId: data.catalog.priceSnapshotId,
      metadata: { channel: 'whatsapp' },
    }, getAccessToken()).catch(() => undefined);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${data.catalog.title}\n${data.catalog.subtitle || ''}\n${window.location.href}`)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const downloadPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateSalesCatalogPdf(data);
      await salesCatalogApi.recordPdfDownload(token, {
        clientEventId: makeClientEventId(),
        priceSnapshotId: data.catalog.priceSnapshotId,
      }, getAccessToken()).catch(() => undefined);
      toast.success('PDF güncel fiyatlarla oluşturuldu.');
    } catch (pdfError) {
      console.error(pdfError);
      toast.error('PDF oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <CatalogLoading />;
  if (pinRequired) return <CatalogPin pin={pin} setPin={setPin} error={pinError} loading={pinLoading} onSubmit={submitPin} />;
  if (error || !data) return <CatalogError message={error || 'Katalog bulunamadı.'} onRetry={load} />;

  const validFrom = formatDate(data.catalog.validFrom);
  const validTo = formatDate(data.catalog.validTo);
  const generatedAt = new Date(data.catalog.generatedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  const accent = data.catalog.accentColor || '#15356b';
  const compact = data.catalog.displayDensity === 'COMPACT';
  const featuredSections = data.sections.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#e9edf3] text-[#0f1c33]">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] bg-[#f4f6f9] shadow-[0_0_60px_rgba(11,29,59,0.08)]">
        <header className="bg-[#0b1d3b] text-white">
          <div className="flex min-h-8 items-center justify-between gap-4 border-b border-white/[0.07] bg-[#081426] px-4 py-2 sm:px-6 lg:px-8">
            <div className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6f8fbf]">
              Bakırcılar B2B <span className="hidden sm:inline">· {data.catalog.name || data.catalog.title}</span>
            </div>
            <div className="flex-none font-mono text-[10px] tracking-[0.04em] text-white/55">
              REV {String(data.catalog.revision).padStart(2, '0')} · {data.catalog.vatMode === 'INCLUDED' ? 'KDV DAHİL' : 'KDV HARİÇ'}
            </div>
          </div>

          <div className="flex min-h-[62px] items-center gap-3 border-b border-white/[0.08] px-4 sm:px-6 lg:px-8">
            <Logo layout="horizontal" tone="white" size="md" />
            <div className="hidden h-6 w-px bg-white/15 sm:block" />
            <div className="hidden min-w-0 flex-1 sm:block">
              <div className="truncate text-[13px] font-semibold text-white">{data.catalog.title}</div>
              <div className="font-mono text-[10.5px] text-white/50">{productCount} ürün · {data.sections.length} kategori</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button onClick={share} title="Paylaş" aria-label="Kataloğu paylaş" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white/85 transition-colors hover:bg-white/10 sm:w-auto sm:gap-1.5 sm:px-3">
                <Share2 className="h-4 w-4" /><span className="hidden text-[12px] font-semibold sm:inline">Paylaş</span>
              </button>
              <button onClick={shareWhatsApp} title="WhatsApp ile paylaş" aria-label="Kataloğu WhatsApp ile paylaş" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/40 text-emerald-200 transition-colors hover:bg-emerald-300/10 sm:w-auto sm:gap-1.5 sm:px-3">
                <Send className="h-4 w-4" /><span className="hidden text-[12px] font-semibold sm:inline">WhatsApp</span>
              </button>
              <button onClick={downloadPdf} disabled={pdfLoading || productCount === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} <span className="hidden sm:inline">PDF indir</span><span className="sm:hidden">PDF</span>
              </button>
            </div>
          </div>

          <section className={`relative isolate flex overflow-hidden ${compact ? 'min-h-[250px] sm:min-h-[285px]' : 'min-h-[330px] sm:min-h-[390px]'}`}>
            {data.catalog.coverImageUrl && (
              <img src={data.catalog.coverImageUrl} alt={`${data.catalog.title} kapak görseli`} className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
            )}
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,#0b1d3b_0%,rgba(11,29,59,0.97)_34%,rgba(11,29,59,0.72)_62%,rgba(11,29,59,0.25)_100%)] max-sm:bg-[linear-gradient(100deg,#0b1d3b_0%,rgba(11,29,59,0.93)_74%,rgba(11,29,59,0.62)_100%)]" />
            <div className={`flex w-full max-w-[720px] flex-col justify-center px-4 sm:px-8 lg:px-10 ${compact ? 'py-8' : 'py-11 sm:py-14'}`}>
              <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9cc3ef] sm:mb-5">
                <span className="h-px w-8 bg-[#7fb0e8]" /> Güncel satış kataloğu
              </div>
              {data.catalog.watermarkText && (
                <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11.5px] font-semibold text-white/95 backdrop-blur-sm">
                  <ShieldCheck className="h-4 w-4 text-[#9cc3ef]" /> {data.catalog.watermarkText}
                </div>
              )}
              <h1 className={`font-bold leading-[1.1] text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.35)] ${compact ? 'text-[28px] sm:text-[36px]' : 'text-[32px] sm:text-[44px]'}`}>{data.catalog.title}</h1>
              {data.catalog.subtitle && <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.35)] sm:text-[16px]">{data.catalog.subtitle}</p>}
              <div className={`${compact ? 'mt-5' : 'mt-7'} flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80`}>
                <span><strong className="text-white">{productCount}</strong> ürün</span>
                <span className="h-3 w-px bg-white/30" />
                <span><strong className="text-white">{data.sections.length}</strong> kategori</span>
                <span className="h-3 w-px bg-white/30" />
                <span>{data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV hariç'}</span>
                {(validFrom || validTo) && <><span className="hidden h-3 w-px bg-white/30 sm:block" /><span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><CalendarDays className="h-3.5 w-3.5" /> {validFrom || '-'} - {validTo || '-'}</span></>}
              </div>
            </div>
          </section>
        </header>

        <nav className="sticky top-0 z-40 border-b border-[#e4e9f1] bg-white shadow-[0_5px_18px_rgba(11,29,59,0.06)]">
          <div className={`flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6 lg:px-8 ${compact ? 'py-1.5' : 'py-2'}`}>
          {data.sections.map((section) => (
            <button key={section.id} onClick={() => scrollToSection(section.id)} className={`h-[34px] flex-none rounded-lg px-3 text-[12px] font-semibold transition-colors ${activeSection === section.id ? 'text-white' : 'text-[#51607a] hover:bg-[#eef2f7] hover:text-[#0f1c33]'}`} style={activeSection === section.id ? { backgroundColor: accent } : undefined}>
              {section.title} <span className={activeSection === section.id ? 'text-white/70' : 'text-[#9aa6b8]'}>{section.products.length}</span>
            </button>
          ))}
          </div>
        </nav>

        <main>
          {data.sections.map((section, sectionIndex) => (
            <section
              key={section.id}
              id={`catalog-section-${section.id}`}
              ref={(element) => { sectionRefs.current[section.id] = element; }}
              className="scroll-mt-14 border-b border-[#dde4ee]"
            >
              <div className={`px-4 sm:px-6 lg:px-8 ${compact ? 'py-5 sm:py-7' : 'py-8 sm:py-10'}`}>
                <div className={`${compact ? 'mb-3 pb-3' : 'mb-5 pb-4'} flex items-center gap-3 border-b border-[#dde4ee]`}>
                  <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#0b1d3b] text-[13px] font-extrabold text-white">{String(sectionIndex + 1).padStart(2, '0')}</span>
                  <h2 className={`min-w-0 flex-1 font-bold text-[#0f1c33] ${compact ? 'text-[20px]' : 'text-[22px] sm:text-[24px]'}`}>{section.title}</h2>
                  <span className="flex-none text-[12px] text-[#8b97ac]">{section.products.length} ürün</span>
                </div>
                <div className={compact ? 'grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-[18px]'}>
                {section.products.map((product) => {
                  const packagingLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                  return (
                  <article key={product.id} className="group flex h-full flex-col overflow-hidden rounded-lg border border-[#e6ebf2] bg-white shadow-[0_1px_2px_rgba(11,29,59,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,29,59,0.12)]">
                    <div className={`relative flex items-center justify-center overflow-hidden border-b border-[#eef2f7] bg-white ${compact ? 'aspect-[5/3] p-2.5' : 'aspect-[4/3] p-3.5'}`}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#f7f9fc] text-[#9aa6b8]"><ImageOff className="h-7 w-7" /><span className="text-[11px]">Görsel hazırlanıyor</span></div>
                      )}
                      {data.catalog.showStockStatus && product.stockStatus && (
                        <span className={`absolute inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${compact ? 'left-2 top-2' : 'left-3 top-3'} ${product.stockStatus === 'IN_STOCK' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                          {product.stockStatus === 'IN_STOCK' ? <CheckCircle2 className="h-3 w-3" /> : <PackageX className="h-3 w-3" />}
                          {product.stockStatus === 'IN_STOCK' ? 'Stokta' : 'Stokta yok'}
                        </span>
                      )}
                    </div>
                    <div className={`flex flex-1 flex-col ${compact ? 'p-3' : 'p-[15px]'}`}>
                      <div
                        className={`font-semibold text-[#0f1c33] [overflow-wrap:anywhere] ${
                          product.name.length > 105
                            ? compact
                              ? 'min-h-[46px] text-[11px] leading-[1.35]'
                              : 'min-h-[48px] text-[12px] leading-[1.38]'
                            : product.name.length > 72
                              ? compact
                                ? 'min-h-[44px] text-[12px] leading-[1.4]'
                                : 'min-h-[46px] text-[13px] leading-[1.4]'
                              : compact
                                ? 'min-h-[40px] text-[13px] leading-5'
                                : 'min-h-[40px] text-[14px] leading-[1.4]'
                        }`}
                        title={product.name}
                      >
                        {product.name}
                      </div>
                      <div className={`${compact ? 'mt-1.5' : 'mt-2'} flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-[#8b97ac]`}>
                        {data.catalog.showProductCode && <span className="font-mono">{product.productCode}</span>}
                        {data.catalog.showUnit && product.unit && <span>{product.unit}</span>}
                        {product.brandCode && <span>{product.brandCode}</span>}
                      </div>
                      {packagingLabel && (
                        <div className={`${compact ? 'mt-1.5' : 'mt-2'} flex`}>
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#d6e0f1] bg-[#eef4fb] px-2 py-1 text-[10.5px] font-semibold leading-4 text-[#15356b]">
                            <PackageCheck className="h-3.5 w-3.5 flex-none" />
                            <span className="min-w-0 [overflow-wrap:anywhere]">{packagingLabel}</span>
                          </span>
                        </div>
                      )}
                      <div className={`${compact ? 'pt-2' : 'pt-3'} mt-auto flex items-end justify-between gap-3 border-t border-[#edf1f6]`}>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#93a2b8]">Satış fiyatı</div>
                          <div className={`mt-0.5 font-extrabold tabular-nums text-[#0b1d3b] ${compact ? 'text-[20px]' : 'text-[24px]'}`}>{formatCurrency(product.salePrice)}</div>
                        </div>
                        <div className="pb-0.5 text-right text-[10px] leading-4 text-[#9aa6b8]">{data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV hariç'}{data.catalog.showUnit && product.unit ? <><br />{product.unit} başına</> : null}</div>
                      </div>
                    </div>
                  </article>
                  );
                })}
                </div>
              </div>
            </section>
          ))}
        </main>

        <footer className="bg-[#0b1d3b] px-4 text-white sm:px-6 lg:px-8">
          <div className={`${compact ? 'py-5' : 'py-8'} grid gap-7 border-b border-white/10 sm:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(160px,0.7fr)]`}>
            <div>
              <Logo layout="horizontal" tone="white" size="md" />
              <p className="mt-3 max-w-md text-[12px] leading-5 text-white/60">Bu katalog dinamik olarak hazırlanmıştır. Ürün bulunabilirliği ve fiyatlar sipariş anında teyit edilir.</p>
            </div>
            {featuredSections.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8fb4e6]">Öne çıkan kategoriler</div>
                <div className="mt-2 text-[12px] leading-6 text-white/70">{featuredSections.map((section) => <div key={section.id}>{section.title}</div>)}</div>
              </div>
            )}
            <div className="text-[11px] leading-5 text-white/65">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8fb4e6]">Katalog</div>
              <div>Revizyon {String(data.catalog.revision).padStart(2, '0')}</div>
              <div>Son hesaplama: {generatedAt}</div>
              {data.catalog.watermarkText && <div>{data.catalog.watermarkText}</div>}
              {data.catalog.priceFingerprint && <div className="font-mono text-[9.5px] text-white/45">Fiyat izi: {data.catalog.priceFingerprint}</div>}
              <div>{data.catalog.vatMode === 'INCLUDED' ? 'Fiyatlara KDV dahildir.' : 'Fiyatlara KDV dahil değildir.'}</div>
            </div>
          </div>
          <div className="bg-[#081426] py-3 font-mono text-[10px] tracking-[0.05em] text-white/40">
            © {new Date().getFullYear()} BAKIRCILAR B2B · SAKARYA
          </div>
        </footer>

        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Yukarı dön" aria-label="Sayfanın başına dön" className="fixed bottom-5 right-5 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d8e0ec] bg-white text-[#51607a] shadow-lg hover:bg-[#f4f6fa]"><ArrowUp className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CatalogLoading() {
  return (
    <div className="min-h-screen bg-[#f3f5f8]">
      <div className="h-16 border-b border-[#e2e7ef] bg-white" />
      <div className="flex h-[420px] items-center justify-center bg-[#0b1d3b] text-white"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Katalog güncel fiyatlarla hazırlanıyor</div>
      <div className="mx-auto grid max-w-[1280px] gap-3 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-lg border border-[#e2e7ef] bg-white" />)}</div>
    </div>
  );
}

function CatalogPin({ pin, setPin, error, loading, onSubmit }: {
  pin: string;
  setPin: (value: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#dfe5ee] bg-white shadow-[0_24px_70px_rgba(11,29,59,0.16)]">
        <div className="bg-[#0b1d3b] px-7 py-6 text-white">
          <Logo layout="horizontal" tone="white" size="md" />
          <div className="mt-7 flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-white/10"><ShieldCheck className="h-5 w-5 text-[#9cc3ef]" /></div>
          <h1 className="mt-4 text-[20px] font-semibold">Korumalı satış kataloğu</h1>
          <p className="mt-2 text-[12.5px] leading-5 text-white/65">Bu bağlantı yalnız yetkili alıcı için hazırlanmıştır. Görüntülemek için paylaşım PIN'ini girin.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="p-7">
          <label className="text-[11.5px] font-semibold text-[#51607a]">Katalog PIN'i</label>
          <input autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))} className="mt-2 h-12 w-full rounded-lg border border-[#cfd8e6] px-4 text-center font-mono text-[20px] tracking-[0.28em] text-[#14223b] outline-none focus:border-[#577fbb] focus:ring-2 focus:ring-[#577fbb]/15" placeholder="••••" />
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{error}</div>}
          <button type="submit" disabled={loading || pin.length < 4} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#15356b] text-[13px] font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Kataloğu aç</button>
          <p className="mt-4 text-center text-[10.5px] leading-4 text-[#8b97ac]">Tarayıcı, cihaz limiti ve güvenlik için anonim bir kimlikle eşleştirilir. Donanım kimliği toplanmaz.</p>
        </form>
      </div>
    </div>
  );
}

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f8] px-4">
      <div className="w-full max-w-md rounded-lg border border-[#e2e7ef] bg-white p-7 text-center">
        <Logo layout="horizontal" tone="blue" size="lg" className="justify-center" />
        <AlertCircle className="mx-auto mt-7 h-9 w-9 text-amber-600" />
        <h1 className="mt-3 text-[18px] font-semibold text-[#14223b]">Katalog görüntülenemiyor</h1>
        <p className="mt-2 text-[12.5px] leading-5 text-[#64748b]">{message}</p>
        <button onClick={onRetry} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#15356b] px-4 text-[13px] font-semibold text-white"><RefreshCw className="h-4 w-4" /> Tekrar dene</button>
      </div>
    </div>
  );
}
