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
} from 'lucide-react';
import toast from 'react-hot-toast';
import salesCatalogApi, { SalesCatalogPresentation } from '@/lib/api/salesCatalog';
import { generateSalesCatalogPdf } from '@/lib/catalogPdf';
import { formatCurrency } from '@/lib/utils/format';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
};

export default function PublicSalesCatalogPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '');
  const [data, setData] = useState<SalesCatalogPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await salesCatalogApi.getPublic(token);
      setData(response);
      setActiveSection(response.sections[0]?.id || '');
    } catch (requestError: any) {
      setError(requestError?.response?.status === 404
        ? 'Bu katalog yayında değil, süresi dolmuş veya bağlantısı yenilenmiş olabilir.'
        : 'Katalog şu anda yüklenemiyor. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Katalog bağlantısı kopyalandı.');
      }
    } catch (shareError: any) {
      if (shareError?.name !== 'AbortError') toast.error('Bağlantı paylaşılamadı.');
    }
  };

  const shareWhatsApp = () => {
    if (!data) return;
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
      await salesCatalogApi.recordPdfDownload(token).catch(() => undefined);
      toast.success('PDF güncel fiyatlarla oluşturuldu.');
    } catch (pdfError) {
      console.error(pdfError);
      toast.error('PDF oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <CatalogLoading />;
  if (error || !data) return <CatalogError message={error || 'Katalog bulunamadı.'} onRetry={load} />;

  const validFrom = formatDate(data.catalog.validFrom);
  const validTo = formatDate(data.catalog.validTo);
  const generatedAt = new Date(data.catalog.generatedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  const accent = data.catalog.accentColor || '#15356b';

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-[#14223b]">
      <header className="sticky top-0 z-50 border-b border-[#e1e6ee] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <img src="/logo.png" alt="Bakırcılar" className="h-8 w-auto object-contain" />
          <div className="hidden h-7 w-px bg-[#e2e7ef] sm:block" />
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="truncate text-[13px] font-semibold text-[#14223b]">{data.catalog.title}</div>
            <div className="text-[10.5px] text-[#8b97ac]">Revizyon {data.catalog.revision} · {productCount} ürün</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={share} title="Paylaş" aria-label="Kataloğu paylaş" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8e0ec] bg-white text-[#51607a] hover:bg-[#f4f6fa]"><Share2 className="h-4 w-4" /></button>
            <button onClick={shareWhatsApp} className="hidden h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 sm:inline-flex"><Send className="h-4 w-4" /> WhatsApp</button>
            <button onClick={downloadPdf} disabled={pdfLoading || productCount === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: accent }}>
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} <span className="hidden sm:inline">PDF indir</span><span className="sm:hidden">PDF</span>
            </button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[360px] overflow-hidden bg-[#0b1d3b] sm:min-h-[430px]">
        {data.catalog.coverImageUrl && (
          <img src={data.catalog.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        )}
        <div className="absolute inset-0 bg-[#0b1d3b]/55" />
        <div className="relative mx-auto flex min-h-[360px] max-w-[1440px] items-end px-4 pb-10 pt-20 sm:min-h-[430px] sm:px-6 sm:pb-14 lg:px-8">
          <div className="max-w-3xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/25 bg-black/15 px-3 py-1.5 text-[11px] font-semibold uppercase">
              <FileText className="h-3.5 w-3.5" /> Güncel satış kataloğu
            </div>
            <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.08] sm:text-[50px]">{data.catalog.title}</h1>
            {data.catalog.subtitle && <p className="mt-4 max-w-2xl text-[15px] leading-6 text-white/85 sm:text-[17px]">{data.catalog.subtitle}</p>}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-white/80">
              <span className="inline-flex items-center gap-1.5"><PackageCheck className="h-4 w-4" /> {productCount} ürün</span>
              <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" /> {data.sections.length} kategori</span>
              {(validFrom || validTo) && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {validFrom || '-'} - {validTo || '-'}</span>}
            </div>
          </div>
        </div>
      </section>

      <nav className="sticky top-16 z-40 border-b border-[#dfe5ed] bg-white shadow-[0_5px_18px_rgba(20,34,59,0.06)]">
        <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          {data.sections.map((section) => (
            <button key={section.id} onClick={() => scrollToSection(section.id)} className={`h-9 flex-none rounded-lg px-3 text-[12px] font-semibold transition-colors ${activeSection === section.id ? 'text-white' : 'text-[#51607a] hover:bg-[#f4f6fa]'}`} style={activeSection === section.id ? { backgroundColor: accent } : undefined}>
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
            className={`scroll-mt-32 border-b border-[#e0e5ed] ${sectionIndex % 2 === 0 ? 'bg-[#f3f5f8]' : 'bg-white'}`}
          >
            <div className="mx-auto max-w-[1440px] px-4 py-9 sm:px-6 sm:py-12 lg:px-8">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <div className="mb-2 h-1 w-10 rounded-full" style={{ backgroundColor: accent }} />
                  <h2 className="text-[24px] font-semibold text-[#14223b] sm:text-[28px]">{section.title}</h2>
                  <p className="mt-1 text-[12px] text-[#8b97ac]">{section.products.length} ürün · fiyatlar katalog açılışında güncellendi</p>
                </div>
                <span className="hidden text-[42px] font-semibold text-[#e3e8ef] sm:block">{String(sectionIndex + 1).padStart(2, '0')}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {section.products.map((product) => (
                  <article key={product.id} className="group overflow-hidden rounded-lg border border-[#dfe5ed] bg-white transition-shadow hover:shadow-[0_12px_28px_rgba(20,34,59,0.09)]">
                    <div className="relative aspect-[4/3] overflow-hidden border-b border-[#edf0f5] bg-white p-4">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#f7f9fc] text-[#9aa6b8]"><ImageOff className="h-7 w-7" /><span className="text-[11px]">Görsel hazırlanıyor</span></div>
                      )}
                      {data.catalog.showStockStatus && product.stockStatus && (
                        <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${product.stockStatus === 'IN_STOCK' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                          {product.stockStatus === 'IN_STOCK' ? <CheckCircle2 className="h-3 w-3" /> : <PackageX className="h-3 w-3" />}
                          {product.stockStatus === 'IN_STOCK' ? 'Stokta' : 'Stokta yok'}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="min-h-[44px] text-[14px] font-semibold leading-[1.45] text-[#14223b]">{product.name}</div>
                      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[#8b97ac]">
                        {data.catalog.showProductCode && <span className="font-mono">{product.productCode}</span>}
                        {data.catalog.showUnit && product.unit && <span>{product.unit}</span>}
                        {product.brandCode && <span>{product.brandCode}</span>}
                      </div>
                      <div className="mt-4 border-t border-[#edf0f5] pt-3">
                        <div className="text-[10.5px] font-medium uppercase text-[#8b97ac]">Satış fiyatı</div>
                        <div className="mt-0.5 text-[24px] font-semibold tabular-nums" style={{ color: accent }}>{formatCurrency(product.salePrice)}</div>
                        <div className="mt-1 text-[10.5px] text-[#8b97ac]">{data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV hariç'}{data.catalog.showUnit && product.unit ? ` · ${product.unit} başına` : ''}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
      </main>

      <footer className="bg-[#0b1d3b] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <img src="/logo.png" alt="Bakırcılar" className="h-8 w-auto object-contain brightness-0 invert" />
            <p className="mt-3 max-w-xl text-[11.5px] leading-5 text-white/65">Bu katalog dinamik olarak hazırlanmıştır. Ürün bulunabilirliği ve fiyatlar sipariş anında teyit edilir.</p>
          </div>
          <div className="text-[11px] leading-5 text-white/65 sm:text-right">
            <div>Revizyon {data.catalog.revision}</div>
            <div>Son hesaplama: {generatedAt}</div>
            <div>{data.catalog.vatMode === 'INCLUDED' ? 'Fiyatlara KDV dahildir.' : 'Fiyatlara KDV dahil değildir.'}</div>
          </div>
        </div>
      </footer>

      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Yukarı dön" aria-label="Sayfanın başına dön" className="fixed bottom-5 right-5 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d8e0ec] bg-white text-[#51607a] shadow-lg hover:bg-[#f4f6fa]"><ArrowUp className="h-4 w-4" /></button>
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

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f8] px-4">
      <div className="w-full max-w-md rounded-lg border border-[#e2e7ef] bg-white p-7 text-center">
        <img src="/logo.png" alt="Bakırcılar" className="mx-auto h-9 w-auto" />
        <AlertCircle className="mx-auto mt-7 h-9 w-9 text-amber-600" />
        <h1 className="mt-3 text-[18px] font-semibold text-[#14223b]">Katalog görüntülenemiyor</h1>
        <p className="mt-2 text-[12.5px] leading-5 text-[#64748b]">{message}</p>
        <button onClick={onRetry} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#15356b] px-4 text-[13px] font-semibold text-white"><RefreshCw className="h-4 w-4" /> Tekrar dene</button>
      </div>
    </div>
  );
}
