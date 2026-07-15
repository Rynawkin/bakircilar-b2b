'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  ImageOff,
  Link2,
  Loader2,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { ImageCropUpload } from '@/components/admin/ImageCropUpload';
import { formatCurrency } from '@/lib/utils/format';
import salesCatalogApi, {
  SalesCatalogAdmin,
  SalesCatalogAdminSection,
  SalesCatalogAdjustment,
  SalesCatalogDisplayDensity,
  SalesCatalogGuard,
  SalesCatalogInput,
  SalesCatalogPresentation,
  SalesCatalogPriceBasis,
  SalesCatalogProductFilters,
  SalesCatalogProductOption,
  SalesCatalogProductRef,
  SalesCatalogRounding,
  SalesCatalogStatus,
  SalesCatalogVatMode,
} from '@/lib/api/salesCatalog';
import { generateSalesCatalogPdf } from '@/lib/catalogPdf';

type EditorItem = {
  key: string;
  productId: string;
  sortOrder: number;
  fixedPrice: string;
  product: SalesCatalogProductRef;
};

type EditorSection = {
  key: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  sortOrder: number;
  items: EditorItem[];
};

type EditorState = {
  id?: string;
  name: string;
  title: string;
  subtitle: string;
  coverImageUrl: string;
  accentColor: string;
  status: SalesCatalogStatus;
  priceBasis: SalesCatalogPriceBasis;
  adjustmentType: SalesCatalogAdjustment;
  adjustmentValue: string;
  betweenPercent: string;
  priceListNo: string;
  vatMode: SalesCatalogVatMode;
  roundingMode: SalesCatalogRounding;
  minimumPriceGuardType: SalesCatalogGuard;
  minimumPriceGuardPercent: string;
  excludeStaleCosts: boolean;
  minCurrentCostDate: string;
  hideOutOfStock: boolean;
  hideMissingImage: boolean;
  showStockStatus: boolean;
  showProductCode: boolean;
  showUnit: boolean;
  displayDensity: SalesCatalogDisplayDensity;
  validFrom: string;
  validTo: string;
  shareToken?: string;
  publicPath?: string;
  revision?: number;
  sections: EditorSection[];
};

const key = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const isoDate = (value?: string | null) => (value ? String(value).slice(0, 10) : '');
const EMPTY_PRODUCT_FILTERS: SalesCatalogProductFilters = { categories: [], brands: [], suppliers: [] };

const emptyEditor = (): EditorState => ({
  name: '',
  title: '',
  subtitle: '',
  coverImageUrl: '',
  accentColor: '#15356b',
  status: 'DRAFT',
  priceBasis: 'CURRENT_COST',
  adjustmentType: 'MARKUP',
  adjustmentValue: '20',
  betweenPercent: '50',
  priceListNo: '10',
  vatMode: 'EXCLUDED',
  roundingMode: 'NEAREST_1',
  minimumPriceGuardType: 'CURRENT_COST',
  minimumPriceGuardPercent: '0',
  excludeStaleCosts: false,
  minCurrentCostDate: '',
  hideOutOfStock: false,
  hideMissingImage: false,
  showStockStatus: true,
  showProductCode: true,
  showUnit: true,
  displayDensity: 'STANDARD',
  validFrom: '',
  validTo: '',
  sections: [],
});

const fromCatalog = (catalog: SalesCatalogAdmin): EditorState => ({
  id: catalog.id,
  name: catalog.name || '',
  title: catalog.title || '',
  subtitle: catalog.subtitle || '',
  coverImageUrl: catalog.coverImageUrl || '',
  accentColor: catalog.accentColor || '#15356b',
  status: catalog.status,
  priceBasis: catalog.priceBasis,
  adjustmentType: catalog.adjustmentType,
  adjustmentValue: String(catalog.adjustmentValue ?? 0),
  betweenPercent: String(catalog.betweenPercent ?? 50),
  priceListNo: String(catalog.priceListNo ?? 10),
  vatMode: catalog.vatMode,
  roundingMode: catalog.roundingMode,
  minimumPriceGuardType: catalog.minimumPriceGuardType,
  minimumPriceGuardPercent: String(catalog.minimumPriceGuardPercent ?? 0),
  excludeStaleCosts: catalog.excludeStaleCosts,
  minCurrentCostDate: isoDate(catalog.minCurrentCostDate),
  hideOutOfStock: catalog.hideOutOfStock,
  hideMissingImage: catalog.hideMissingImage,
  showStockStatus: catalog.showStockStatus,
  showProductCode: catalog.showProductCode,
  showUnit: catalog.showUnit,
  displayDensity: catalog.displayDensity || 'STANDARD',
  validFrom: isoDate(catalog.validFrom),
  validTo: isoDate(catalog.validTo),
  shareToken: catalog.shareToken,
  publicPath: catalog.publicPath,
  revision: catalog.revision,
  sections: (catalog.sections || []).map((section: SalesCatalogAdminSection) => ({
    key: section.id || key(),
    title: section.title,
    categoryId: section.categoryId || null,
    categoryName: section.categoryName || null,
    sortOrder: section.sortOrder,
    items: section.items.map((item) => ({
      key: item.id || key(),
      productId: item.productId,
      sortOrder: item.sortOrder,
      fixedPrice: item.fixedPrice ? String(item.fixedPrice) : '',
      product: item.product,
    })),
  })),
});

const PRICE_BASIS: Array<{ value: SalesCatalogPriceBasis; label: string; detail: string }> = [
  { value: 'CURRENT_COST', label: 'Güncel maliyet', detail: 'Ürünün güncel maliyetini baz alır.' },
  { value: 'LAST_ENTRY', label: 'Son giriş maliyeti', detail: 'Son giriş fiyatını baz alır.' },
  { value: 'MAX_COST', label: 'Yüksek olan maliyet', detail: 'Güncel ve son giriş maliyetinden yüksek olanı kullanır.' },
  { value: 'BETWEEN_COSTS', label: 'İki maliyet arası', detail: 'Son giriş ile güncel maliyet arasında ağırlıklı fiyat üretir.' },
  { value: 'PRICE_LIST', label: 'Mikro fiyat listesi', detail: 'Seçilen 1-10 fiyat listesindeki güncel fiyatı baz alır.' },
];

const ADJUSTMENTS: Array<{ value: SalesCatalogAdjustment; label: string }> = [
  { value: 'MARKUP', label: 'Maliyete kâr ekle' },
  { value: 'GROSS_MARGIN', label: 'Brüt marj hedefle' },
  { value: 'LOSS', label: 'Bazın altında listele' },
  { value: 'NONE', label: 'Ek hesaplama yapma' },
];

const ROUNDING: Array<{ value: SalesCatalogRounding; label: string }> = [
  { value: 'NONE', label: 'Kuruşu koru' },
  { value: 'NEAREST_0_50', label: 'En yakın 0,50 TL' },
  { value: 'NEAREST_1', label: 'En yakın 1 TL' },
  { value: 'NEAREST_5', label: 'En yakın 5 TL' },
  { value: 'END_90', label: 'Fiyatı ,90 ile bitir' },
  { value: 'END_99', label: 'Fiyatı ,99 ile bitir' },
];

const statusLabel: Record<SalesCatalogStatus, string> = {
  DRAFT: 'Taslak',
  PUBLISHED: 'Yayında',
  ARCHIVED: 'Arşiv',
};

const statusClass: Record<SalesCatalogStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const field = 'h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] text-[#14223b] outline-none focus:border-[#577fbb] focus:ring-2 focus:ring-[#577fbb]/15';
const label = 'mb-1.5 block text-[12px] font-semibold text-[#51607a]';

function toPayload(editor: EditorState, status: SalesCatalogStatus): SalesCatalogInput {
  return {
    name: editor.name.trim(),
    title: editor.title.trim(),
    subtitle: editor.subtitle.trim() || null,
    coverImageUrl: editor.coverImageUrl || null,
    accentColor: editor.accentColor,
    status,
    priceBasis: editor.priceBasis,
    adjustmentType: editor.adjustmentType,
    adjustmentValue: Number(editor.adjustmentValue) || 0,
    betweenPercent: Number(editor.betweenPercent) || 0,
    priceListNo: editor.priceBasis === 'PRICE_LIST' ? Number(editor.priceListNo) || null : null,
    vatMode: editor.vatMode,
    roundingMode: editor.roundingMode,
    minimumPriceGuardType: editor.minimumPriceGuardType,
    minimumPriceGuardPercent: Number(editor.minimumPriceGuardPercent) || 0,
    excludeStaleCosts: editor.excludeStaleCosts,
    minCurrentCostDate: editor.excludeStaleCosts ? editor.minCurrentCostDate || null : null,
    hideOutOfStock: editor.hideOutOfStock,
    hideMissingImage: editor.hideMissingImage,
    showStockStatus: editor.showStockStatus,
    showProductCode: editor.showProductCode,
    showUnit: editor.showUnit,
    displayDensity: editor.displayDensity,
    validFrom: editor.validFrom || null,
    validTo: editor.validTo || null,
    sections: editor.sections.map((section, sectionIndex) => ({
      title: section.title.trim() || `Bölüm ${sectionIndex + 1}`,
      categoryId: section.categoryId,
      categoryName: section.categoryName,
      sortOrder: sectionIndex,
      items: section.items.map((item, itemIndex) => ({
        productId: item.productId,
        sortOrder: itemIndex,
        fixedPrice: Number(item.fixedPrice) > 0 ? Number(item.fixedPrice) : null,
      })),
    })),
  };
}

const getErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error?.message || error?.response?.data?.error || error?.message || fallback;

export default function SalesCatalogsPage() {
  const [catalogs, setCatalogs] = useState<SalesCatalogAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [searchResults, setSearchResults] = useState<SalesCatalogProductOption[]>([]);
  const [productFilters, setProductFilters] = useState<SalesCatalogProductFilters>(EMPTY_PRODUCT_FILTERS);
  const [productFiltersLoaded, setProductFiltersLoaded] = useState(false);
  const [productFiltersLoading, setProductFiltersLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [productResultPage, setProductResultPage] = useState(1);
  const [productPagination, setProductPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 1 });
  const [preview, setPreview] = useState<SalesCatalogPresentation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const editorOpen = editor !== null;

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await salesCatalogApi.list();
      setCatalogs(response.catalogs || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Kataloglar yüklenemedi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    if (!editorOpen || productFiltersLoaded) return;
    let active = true;
    setProductFiltersLoading(true);
    salesCatalogApi.getProductFilters()
      .then((filters) => {
        if (!active) return;
        setProductFilters(filters);
        setProductFiltersLoaded(true);
      })
      .catch((error) => {
        if (active) toast.error(getErrorMessage(error, 'Urun filtreleri alinamadi.'));
      })
      .finally(() => {
        if (active) setProductFiltersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editorOpen, productFiltersLoaded]);

  const hasProductCriteria = search.trim().length >= 2 || Boolean(categoryFilter || brandFilter || supplierFilter);

  useEffect(() => {
    setProductResultPage(1);
  }, [search, categoryFilter, brandFilter, supplierFilter]);

  useEffect(() => {
    if (!editorOpen || !hasProductCriteria) {
      setSearchResults([]);
      setProductPagination({ page: 1, limit: 100, total: 0, totalPages: 1 });
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const append = productResultPage > 1;
      if (append) setLoadingMoreProducts(true);
      else setSearching(true);
      try {
        const response = await salesCatalogApi.searchProducts({
          search: search.trim() || undefined,
          categoryId: categoryFilter || undefined,
          brandCode: brandFilter || undefined,
          supplierCode: supplierFilter || undefined,
          page: productResultPage,
          limit: 100,
        });
        if (!active) return;
        setSearchResults((current) => {
          if (!append) return response.products || [];
          const seen = new Set(current.map((product) => product.id));
          return [...current, ...(response.products || []).filter((product) => !seen.has(product.id))];
        });
        setProductPagination(response.pagination);
      } catch (error) {
        if (!active) return;
        if (!append) setSearchResults([]);
        toast.error(getErrorMessage(error, 'Urunler aranirken hata olustu.'));
      } finally {
        if (active) {
          setSearching(false);
          setLoadingMoreProducts(false);
        }
      }
    }, productResultPage === 1 ? 250 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [editorOpen, hasProductCriteria, search, categoryFilter, brandFilter, supplierFilter, productResultPage]);

  const selectedProductIds = useMemo(
    () => new Set(editor?.sections.flatMap((section) => section.items.map((item) => item.productId)) || []),
    [editor]
  );
  const selectedCount = selectedProductIds.size;

  const openEditor = async (catalog?: SalesCatalogAdmin) => {
    setPreview(null);
    setSearch('');
    setCategoryFilter('');
    setBrandFilter('');
    setSupplierFilter('');
    setProductResultPage(1);
    setSearchResults([]);
    setProductPagination({ page: 1, limit: 100, total: 0, totalPages: 1 });
    if (!catalog) {
      setEditor(emptyEditor());
      return;
    }
    setLoading(true);
    try {
      const response = await salesCatalogApi.get(catalog.id);
      setEditor(fromCatalog(response.catalog));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Katalog yüklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  const addProduct = (product: SalesCatalogProductOption) => {
    if (!editor || selectedProductIds.has(product.id)) return;
    if (selectedProductIds.size >= 500) {
      toast.error('Bir katalog en fazla 500 urun icerebilir.');
      return;
    }
    const categoryId = product.category?.id || null;
    const categoryName = product.category?.name || 'Diğer Ürünler';
    const productRef: SalesCatalogProductRef = {
      id: product.id,
      mikroCode: product.mikroCode,
      name: product.name,
      imageUrl: product.imageUrl,
      currentCost: product.currentCost,
      currentCostDate: product.currentCostDate,
      lastEntryPrice: product.lastEntryPrice,
      category: product.category || null,
    };
    const next = editor.sections.map((section) => ({ ...section, items: [...section.items] }));
    const existing = next.find((section) => (categoryId ? section.categoryId === categoryId : section.categoryName === categoryName));
    const item: EditorItem = {
      key: key(),
      productId: product.id,
      sortOrder: existing?.items.length || 0,
      fixedPrice: '',
      product: productRef,
    };
    if (existing) existing.items.push(item);
    else {
      next.push({
        key: key(),
        title: categoryName,
        categoryId,
        categoryName,
        sortOrder: next.length,
        items: [item],
      });
    }
    setEditor({ ...editor, sections: next });
  };

  const addVisibleResults = () => {
    if (!editor) return;
    const nextSections = editor.sections.map((section) => ({ ...section, items: [...section.items] }));
    const alreadySelected = new Set(selectedProductIds);
    searchResults.forEach((product) => {
      if (alreadySelected.has(product.id)) return;
      if (alreadySelected.size >= 500) return;
      alreadySelected.add(product.id);
      const categoryId = product.category?.id || null;
      const categoryName = product.category?.name || 'Diğer Ürünler';
      let section = nextSections.find((candidate) => categoryId
        ? candidate.categoryId === categoryId
        : candidate.categoryName === categoryName);
      if (!section) {
        section = {
          key: key(),
          title: categoryName,
          categoryId,
          categoryName,
          sortOrder: nextSections.length,
          items: [],
        };
        nextSections.push(section);
      }
      section.items.push({
        key: key(),
        productId: product.id,
        sortOrder: section.items.length,
        fixedPrice: '',
        product: {
          id: product.id,
          mikroCode: product.mikroCode,
          name: product.name,
          imageUrl: product.imageUrl,
          currentCost: product.currentCost,
          currentCostDate: product.currentCostDate,
          lastEntryPrice: product.lastEntryPrice,
          category: product.category || null,
        },
      });
    });
    setEditor({ ...editor, sections: nextSections });
    if (alreadySelected.size >= 500 && searchResults.some((product) => !selectedProductIds.has(product.id))) {
      toast('Katalog 500 urun sinirina ulasti.');
    }
  };

  const updateSection = (sectionKey: string, updater: (section: EditorSection) => EditorSection) => {
    if (!editor) return;
    setEditor({ ...editor, sections: editor.sections.map((section) => (section.key === sectionKey ? updater(section) : section)) });
  };

  const removeProduct = (sectionKey: string, productId: string) => {
    if (!editor) return;
    const next = editor.sections
      .map((section) => section.key === sectionKey
        ? { ...section, items: section.items.filter((item) => item.productId !== productId) }
        : section)
      .filter((section) => section.items.length > 0);
    setEditor({ ...editor, sections: next });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!editor) return;
    const target = index + direction;
    if (target < 0 || target >= editor.sections.length) return;
    const next = [...editor.sections];
    [next[index], next[target]] = [next[target], next[index]];
    setEditor({ ...editor, sections: next });
  };

  const moveProduct = (sectionKey: string, index: number, direction: -1 | 1) => {
    updateSection(sectionKey, (section) => {
      const target = index + direction;
      if (target < 0 || target >= section.items.length) return section;
      const items = [...section.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...section, items };
    });
  };

  const save = async (nextStatus: SalesCatalogStatus) => {
    if (!editor) return;
    if (!editor.name.trim() || !editor.title.trim()) {
      toast.error('İç ad ve katalog başlığı zorunludur.');
      return;
    }
    if (nextStatus === 'PUBLISHED' && selectedCount === 0) {
      toast.error('Yayınlamak için en az bir ürün seçin.');
      return;
    }
    if (editor.excludeStaleCosts && !editor.minCurrentCostDate) {
      toast.error('Eski maliyetleri dışlamak için minimum maliyet tarihini seçin.');
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(editor, nextStatus);
      const response = editor.id
        ? await salesCatalogApi.update(editor.id, payload)
        : await salesCatalogApi.create(payload);
      setEditor(fromCatalog(response.catalog));
      toast.success(nextStatus === 'PUBLISHED' ? 'Katalog yayınlandı ve dinamik link güncellendi.' : 'Katalog taslak olarak kaydedildi.');
      await loadCatalogs();
      const nextPreview = await salesCatalogApi.preview(response.catalog.id);
      setPreview(nextPreview);
      setTimeout(() => document.getElementById('catalog-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Katalog kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    if (!editor?.id) {
      toast.error('Önizleme için önce kataloğu taslak olarak kaydedin.');
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await salesCatalogApi.preview(editor.id));
      setTimeout(() => document.getElementById('catalog-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Önizleme hazırlanamadı.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const copyPublicLink = async (catalog: { publicPath?: string; status?: SalesCatalogStatus }) => {
    if (!catalog.publicPath || catalog.status !== 'PUBLISHED') {
      toast.error('Paylaşım linki için katalog yayında olmalı.');
      return;
    }
    const url = `${window.location.origin}${catalog.publicPath}`;
    await navigator.clipboard.writeText(url);
    toast.success('Dinamik katalog linki kopyalandı.');
  };

  const shareWhatsApp = (catalog: { publicPath?: string; status?: SalesCatalogStatus; title?: string }) => {
    if (!catalog.publicPath || catalog.status !== 'PUBLISHED') {
      toast.error('Paylaşmak için katalog yayında olmalı.');
      return;
    }
    const url = `${window.location.origin}${catalog.publicPath}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${catalog.title || 'Güncel satış kataloğumuz'}\n${url}`)}`, '_blank', 'noopener,noreferrer');
  };

  const rotateToken = async () => {
    if (!editor?.id) return;
    if (!confirm('Eski paylaşım linki hemen geçersiz olacak. Link yenilensin mi?')) return;
    try {
      const result = await salesCatalogApi.rotateToken(editor.id);
      setEditor({ ...editor, shareToken: result.shareToken, publicPath: result.publicPath, revision: (editor.revision || 0) + 1 });
      toast.success('Paylaşım linki yenilendi. Eski link artık çalışmaz.');
      loadCatalogs();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Link yenilenemedi.'));
    }
  };

  const removeCatalog = async (catalog: SalesCatalogAdmin) => {
    if (!confirm(`“${catalog.name}” kalıcı olarak silinsin mi?`)) return;
    try {
      await salesCatalogApi.remove(catalog.id);
      toast.success('Katalog silindi.');
      loadCatalogs();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Katalog silinemedi.'));
    }
  };

  const downloadPdf = async () => {
    if (!preview) return;
    setPdfLoading(true);
    try {
      await generateSalesCatalogPdf(preview);
      toast.success('PDF güncel fiyatlarla oluşturuldu.');
    } catch (error) {
      console.error(error);
      toast.error('PDF oluşturulamadı.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (editor) {
    return (
      <div className="min-h-[calc(100vh-60px)] bg-[#f4f6fa] pb-16">
        <div className="sticky top-[60px] z-30 border-b border-[#dfe5ee] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
            <button onClick={() => { setEditor(null); setPreview(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
              <ArrowLeft className="h-4 w-4" /> Listeye dön
            </button>
            <div className="min-w-[180px] flex-1">
              <div className="truncate text-[15px] font-semibold text-[#14223b]">{editor.name || 'Yeni satış kataloğu'}</div>
              <div className="text-[11.5px] text-[#8b97ac]">{selectedCount} ürün · {editor.sections.length} kategori {editor.revision ? `· Revizyon ${editor.revision}` : ''}</div>
            </div>
            {editor.id && (
              <button onClick={loadPreview} disabled={previewLoading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-50">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Önizle
              </button>
            )}
            <button onClick={() => save('DRAFT')} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#15356b] px-3 text-[13px] font-semibold text-[#15356b] hover:bg-[#eef2fa] disabled:opacity-50">
              <FileText className="h-4 w-4" /> {editor.status === 'PUBLISHED' ? 'Taslağa al' : 'Taslak kaydet'}
            </button>
            {editor.id && editor.status !== 'ARCHIVED' && <button onClick={() => save('ARCHIVED')} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 text-[13px] font-medium text-[#64748b] hover:bg-[#f4f6fa] disabled:opacity-50">Arşivle</button>}
            <button onClick={() => save('PUBLISHED')} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#15356b] px-4 text-[13px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Yayınla
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <section className="rounded-lg border border-[#e2e7ef] bg-white">
            <div className="border-b border-[#edf0f5] px-5 py-4">
              <h1 className="text-[17px] font-semibold text-[#14223b]">Katalog kimliği ve görünümü</h1>
              <p className="mt-1 text-[12.5px] text-[#8b97ac]">İç ad yalnız yönetimde görünür; başlık ve alt başlık müşteriye gösterilir.</p>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_440px]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label}>İç katalog adı *</label>
                  <input className={field} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Temmuz horeca fiyat listesi" />
                </div>
                <div>
                  <label className={label}>Müşteriye görünen başlık *</label>
                  <input className={field} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="Horeca Temmuz Seçkisi" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Alt başlık</label>
                  <input className={field} value={editor.subtitle} onChange={(event) => setEditor({ ...editor, subtitle: event.target.value })} placeholder="İşletmenize özel güncel ürün ve fiyat seçkisi" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Katalog görünüm yoğunluğu</label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#d8e0ec] bg-[#f4f6fa] p-1">
                    {([
                      { value: 'STANDARD', title: 'Standart', detail: 'Daha büyük ürün kartları' },
                      { value: 'COMPACT', title: 'Kompakt', detail: 'Daha çok ürün, daha az boşluk' },
                    ] as Array<{ value: SalesCatalogDisplayDensity; title: string; detail: string }>).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setEditor({ ...editor, displayDensity: option.value })}
                        className={`min-w-0 rounded-md px-3 py-2 text-left transition-colors ${editor.displayDensity === option.value ? 'bg-white text-[#15356b] shadow-sm ring-1 ring-[#cdd8e8]' : 'text-[#64748b] hover:bg-white/60'}`}
                      >
                        <span className="block text-[12.5px] font-semibold">{option.title}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-[#8b97ac]">{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={label}>Vurgu rengi</label>
                  <div className="flex gap-2">
                    <input className="h-10 w-12 rounded-lg border border-[#d8e0ec] p-1" type="color" value={editor.accentColor} onChange={(event) => setEditor({ ...editor, accentColor: event.target.value })} />
                    <input className={field} value={editor.accentColor} onChange={(event) => setEditor({ ...editor, accentColor: event.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={label}>Geçerlilik</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={field} type="date" value={editor.validFrom} onChange={(event) => setEditor({ ...editor, validFrom: event.target.value })} aria-label="Başlangıç tarihi" />
                    <input className={field} type="date" value={editor.validTo} onChange={(event) => setEditor({ ...editor, validTo: event.target.value })} aria-label="Bitiş tarihi" />
                  </div>
                </div>
              </div>
              <ImageCropUpload
                value={editor.coverImageUrl}
                onChange={(url) => setEditor({ ...editor, coverImageUrl: url })}
                aspect={7 / 3}
                targetWidth={2100}
                targetHeight={900}
                label="Katalog kapak görseli"
                hint="7:3 oranında hazırlanır ve web ile PDF'de kırpılmadan gösterilir. Görsel yoksa kurumsal lacivert zemin kullanılır."
              />
            </div>
          </section>

          <section className="rounded-lg border border-[#e2e7ef] bg-white">
            <div className="border-b border-[#edf0f5] px-5 py-4">
              <h2 className="text-[16px] font-semibold text-[#14223b]">Dinamik fiyat kuralı</h2>
              <p className="mt-1 text-[12.5px] text-[#8b97ac]">Link her açıldığında B2B’deki son senkronize maliyet ve fiyat verileriyle yeniden hesaplanır.</p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={label}>Fiyat bazı</label>
                <select className={field} value={editor.priceBasis} onChange={(event) => setEditor({ ...editor, priceBasis: event.target.value as SalesCatalogPriceBasis })}>
                  {PRICE_BASIS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8b97ac]">{PRICE_BASIS.find((option) => option.value === editor.priceBasis)?.detail}</p>
              </div>
              {editor.priceBasis === 'BETWEEN_COSTS' && (
                <div>
                  <label className={label}>Güncel maliyet ağırlığı (%)</label>
                  <input className={field} type="number" min="0" max="100" value={editor.betweenPercent} onChange={(event) => setEditor({ ...editor, betweenPercent: event.target.value })} />
                  <p className="mt-1.5 text-[11px] text-[#8b97ac]">0 = son giriş, 100 = güncel maliyet.</p>
                </div>
              )}
              {editor.priceBasis === 'PRICE_LIST' && (
                <div>
                  <label className={label}>Fiyat listesi</label>
                  <select className={field} value={editor.priceListNo} onChange={(event) => setEditor({ ...editor, priceListNo: event.target.value })}>
                    {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}. fiyat listesi</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={label}>Fiyat işlemi</label>
                <select className={field} value={editor.adjustmentType} onChange={(event) => setEditor({ ...editor, adjustmentType: event.target.value as SalesCatalogAdjustment })}>
                  {ADJUSTMENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {editor.adjustmentType !== 'NONE' && (
                <div>
                  <label className={label}>Oran (%)</label>
                  <input className={field} type="number" min="0" max="99.99" step="0.01" value={editor.adjustmentValue} onChange={(event) => setEditor({ ...editor, adjustmentValue: event.target.value })} />
                </div>
              )}
              <div>
                <label className={label}>KDV gösterimi</label>
                <select className={field} value={editor.vatMode} onChange={(event) => setEditor({ ...editor, vatMode: event.target.value as SalesCatalogVatMode })}>
                  <option value="EXCLUDED">KDV hariç fiyat</option>
                  <option value="INCLUDED">KDV dahil fiyat</option>
                </select>
              </div>
              <div>
                <label className={label}>Yuvarlama</label>
                <select className={field} value={editor.roundingMode} onChange={(event) => setEditor({ ...editor, roundingMode: event.target.value as SalesCatalogRounding })}>
                  {ROUNDING.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Minimum fiyat koruması</label>
                <select className={field} value={editor.minimumPriceGuardType} onChange={(event) => setEditor({ ...editor, minimumPriceGuardType: event.target.value as SalesCatalogGuard })}>
                  <option value="NONE">Koruma yok</option>
                  <option value="CURRENT_COST">Güncel maliyet altına inme</option>
                  <option value="MAX_COST">Yüksek maliyet altına inme</option>
                </select>
              </div>
              {editor.minimumPriceGuardType !== 'NONE' && (
                <div>
                  <label className={label}>Koruma payı (%)</label>
                  <input className={field} type="number" min="0" step="0.01" value={editor.minimumPriceGuardPercent} onChange={(event) => setEditor({ ...editor, minimumPriceGuardPercent: event.target.value })} />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[#e2e7ef] bg-white">
            <div className="border-b border-[#edf0f5] px-5 py-4">
              <h2 className="text-[16px] font-semibold text-[#14223b]">Yayın filtreleri ve güvenlik</h2>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              <Toggle checked={editor.excludeStaleCosts} onChange={(checked) => setEditor({ ...editor, excludeStaleCosts: checked })} title="Eski maliyetli ürünleri dışla" detail="Seçili tarih öncesindeki veya maliyet tarihi boş ürünler katalogda görünmez." icon={<CalendarClock className="h-4 w-4" />} />
              {editor.excludeStaleCosts && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="mb-1 block text-[12px] font-semibold text-amber-900">En eski kabul edilen güncel maliyet tarihi *</label>
                  <input className={field} type="date" value={editor.minCurrentCostDate} onChange={(event) => setEditor({ ...editor, minCurrentCostDate: event.target.value })} />
                  <p className="mt-1 text-[11px] leading-4 text-amber-800">Bu tarihten eski ve tarihi olmayan ürünler PDF/listeden otomatik çıkarılır.</p>
                </div>
              )}
              <Toggle checked={editor.hideOutOfStock} onChange={(checked) => setEditor({ ...editor, hideOutOfStock: checked })} title="Stoksuz ürünleri gizle" detail="Aktif depolardaki kullanılabilir stok sıfırsa ürünü çıkarır." icon={<Package className="h-4 w-4" />} />
              <Toggle checked={editor.hideMissingImage} onChange={(checked) => setEditor({ ...editor, hideMissingImage: checked })} title="Görselsiz ürünleri gizle" detail="Ana görseli bulunmayan ürünleri çıkarır." icon={<ImageOff className="h-4 w-4" />} />
              <Toggle checked={editor.showStockStatus} onChange={(checked) => setEditor({ ...editor, showStockStatus: checked })} title="Stok durumunu göster" detail="Miktar yerine yalnız Stokta / Stokta Yok bilgisini gösterir." icon={<Check className="h-4 w-4" />} />
              <Toggle checked={editor.showProductCode} onChange={(checked) => setEditor({ ...editor, showProductCode: checked })} title="Ürün kodunu göster" detail="Ürün kartında Mikro stok kodunu gösterir." icon={<FileText className="h-4 w-4" />} />
              <Toggle checked={editor.showUnit} onChange={(checked) => setEditor({ ...editor, showUnit: checked })} title="Birimi göster" detail="Ürün kartında ana satış birimini gösterir." icon={<Package className="h-4 w-4" />} />
            </div>
          </section>

          <section className="rounded-lg border border-[#e2e7ef] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[#14223b]">Ürün seçimi ve kategori düzeni</h2>
                <p className="mt-1 text-[12.5px] text-[#8b97ac]">Ürünler mevcut kategorilerine otomatik ayrılır. Başlıkları ve sıraları değiştirebilirsiniz.</p>
              </div>
              <span className="rounded-lg bg-[#eef2fa] px-3 py-1.5 text-[12px] font-semibold text-[#15356b]">{selectedCount} ürün seçili</span>
            </div>
            <div className="grid min-h-[520px] lg:grid-cols-[390px_1fr]">
              <div className="border-b border-[#e7ebf2] p-4 lg:border-b-0 lg:border-r">
                <label className={label}>Ürün ara</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-[#8b97ac]" />
                  <input className={`${field} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kod, ürün adı veya arama kelimesi" />
                  {searching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-[#577fbb]" />}
                </div>
                <div className="mt-3 space-y-2">
                  <select aria-label="Kategoriye gore filtrele" className={field} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} disabled={productFiltersLoading}>
                    <option value="">Tüm kategoriler</option>
                    {productFilters.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name} ({category.mikroCode})</option>
                    ))}
                  </select>
                  <div className="grid gap-2">
                    <select aria-label="Markaya gore filtrele" className={field} value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} disabled={productFiltersLoading}>
                      <option value="">Tüm markalar</option>
                      {productFilters.brands.map((brand) => (
                        <option key={brand.code} value={brand.code}>{brand.name}</option>
                      ))}
                    </select>
                    <select aria-label="Ana saglayiciya gore filtrele" className={field} value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} disabled={productFiltersLoading}>
                      <option value="">Tüm ana sağlayıcılar</option>
                      {productFilters.suppliers.map((supplier) => (
                        <option key={supplier.code} value={supplier.code}>{supplier.name} ({supplier.productCount})</option>
                      ))}
                    </select>
                  </div>
                  {(categoryFilter || brandFilter || supplierFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('');
                        setBrandFilter('');
                        setSupplierFilter('');
                      }}
                      className="text-[11.5px] font-semibold text-[#577fbb] hover:underline"
                    >
                      Kategori, marka ve sağlayıcı filtrelerini temizle
                    </button>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11.5px] text-[#8b97ac]">{searchResults.length} / {productPagination.total} ürün yüklendi</span>
                    <button onClick={addVisibleResults} className="text-[12px] font-semibold text-[#15356b] hover:underline">Yüklenenlerin tümünü ekle</button>
                  </div>
                )}
                <div className="mt-2 max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
                  {!hasProductCriteria ? (
                    <div className="rounded-lg border border-dashed border-[#d8e0ec] p-6 text-center text-[12px] leading-5 text-[#8b97ac]">En az iki karakter yazın veya kategori, marka ya da ana sağlayıcı seçin. Sonuçları tek tek veya topluca ekleyebilirsiniz.</div>
                  ) : !searching && searchResults.length === 0 ? (
                    <div className="p-5 text-center text-[12px] text-[#8b97ac]">Sonuç bulunamadı.</div>
                  ) : (
                    <>
                      {searchResults.map((product) => {
                        const selected = selectedProductIds.has(product.id);
                        return (
                          <button key={product.id} type="button" disabled={selected} onClick={() => addProduct(product)} className="flex w-full items-center gap-3 rounded-lg border border-[#e7ebf2] p-2 text-left hover:border-[#b9caea] hover:bg-[#f8faff] disabled:bg-[#f4f6fa]">
                            <ProductImage src={product.imageUrl} name={product.name} className="h-11 w-11" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold text-[#14223b]">{product.name}</span>
                              <span className="block truncate text-[10.5px] text-[#8b97ac]">{product.mikroCode} · {product.category?.name || 'Kategorisiz'}{product.brandCode ? ` · ${product.brandCode}` : ''}</span>
                              <span className="block text-[10.5px] text-[#51607a]">Maliyet: {formatCurrency(Number(product.currentCost || 0))} · {product.currentCostDate ? new Date(product.currentCostDate).toLocaleDateString('tr-TR') : 'tarih yok'}</span>
                            </span>
                            {selected ? <Check className="h-4 w-4 text-emerald-600" /> : <Plus className="h-4 w-4 text-[#15356b]" />}
                          </button>
                        );
                      })}
                      {productPagination.page < productPagination.totalPages && (
                        <button
                          type="button"
                          disabled={loadingMoreProducts}
                          onClick={() => setProductResultPage((page) => page + 1)}
                          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#b9caea] bg-[#f8faff] text-[12px] font-semibold text-[#15356b] hover:bg-[#eef3fb] disabled:opacity-60"
                        >
                          {loadingMoreProducts && <Loader2 className="h-4 w-4 animate-spin" />}
                          Daha fazla ürün göster
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {editor.sections.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[#cfd8e6] px-6 text-center">
                    <BookOpen className="h-9 w-9 text-[#8ba8d7]" />
                    <div className="mt-3 text-[14px] font-semibold text-[#14223b]">Katalog henüz boş</div>
                    <p className="mt-1 max-w-md text-[12px] leading-5 text-[#8b97ac]">Soldan ürün eklediğinizde ürünler kendi kategorileri altında otomatik gruplanır.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {editor.sections.map((section, sectionIndex) => (
                      <div key={section.key} className="overflow-hidden rounded-lg border border-[#dfe5ee]">
                        <div className="flex flex-wrap items-center gap-2 bg-[#f7f9fc] px-3 py-2.5">
                          <input className="h-8 min-w-[180px] flex-1 rounded-lg border border-[#d8e0ec] bg-white px-2.5 text-[12.5px] font-semibold text-[#14223b]" value={section.title} onChange={(event) => updateSection(section.key, (current) => ({ ...current, title: event.target.value }))} />
                          <span className="text-[11px] text-[#8b97ac]">{section.items.length} ürün</span>
                          <IconButton title="Yukarı taşı" disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)} icon={<ArrowUp className="h-3.5 w-3.5" />} />
                          <IconButton title="Aşağı taşı" disabled={sectionIndex === editor.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)} icon={<ArrowDown className="h-3.5 w-3.5" />} />
                        </div>
                        <div className="divide-y divide-[#edf0f5]">
                          {section.items.map((item, itemIndex) => (
                            <div key={item.key} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[48px_minmax(180px,1fr)_150px_108px]">
                              <ProductImage src={item.product.imageUrl} name={item.product.name} className="h-11 w-11" />
                              <div className="min-w-0">
                                <div className="truncate text-[12.5px] font-semibold text-[#14223b]">{item.product.name}</div>
                                <div className="mt-0.5 text-[10.5px] text-[#8b97ac]">{item.product.mikroCode} · Maliyet {formatCurrency(Number(item.product.currentCost || 0))} · {item.product.currentCostDate ? new Date(item.product.currentCostDate).toLocaleDateString('tr-TR') : 'tarih yok'}</div>
                              </div>
                              <div>
                                <label className="block text-[10.5px] text-[#8b97ac]">Sabit gösterim fiyatı (opsiyonel)</label>
                                <input className="mt-0.5 h-8 w-full rounded-lg border border-[#d8e0ec] px-2 text-[12px]" type="number" min="0" step="0.01" value={item.fixedPrice} onChange={(event) => updateSection(section.key, (current) => ({ ...current, items: current.items.map((currentItem) => currentItem.key === item.key ? { ...currentItem, fixedPrice: event.target.value } : currentItem) }))} placeholder="Kuralı kullan" />
                              </div>
                              <div className="flex justify-end gap-1">
                                <IconButton title="Yukarı taşı" disabled={itemIndex === 0} onClick={() => moveProduct(section.key, itemIndex, -1)} icon={<ArrowUp className="h-3.5 w-3.5" />} />
                                <IconButton title="Aşağı taşı" disabled={itemIndex === section.items.length - 1} onClick={() => moveProduct(section.key, itemIndex, 1)} icon={<ArrowDown className="h-3.5 w-3.5" />} />
                                <IconButton title="Ürünü çıkar" danger onClick={() => removeProduct(section.key, item.productId)} icon={<X className="h-3.5 w-3.5" />} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {editor.id && (
            <section className="rounded-lg border border-[#e2e7ef] bg-white p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <h2 className="text-[15px] font-semibold text-[#14223b]">Paylaşım bağlantısı</h2>
                  <p className="mt-1 break-all text-[12px] text-[#8b97ac]">{editor.status === 'PUBLISHED' ? `${typeof window !== 'undefined' ? window.location.origin : ''}${editor.publicPath}` : 'Katalog yayınlandığında bağlantı müşterilere açılır.'}</p>
                </div>
                <button onClick={() => copyPublicLink(editor)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"><Copy className="h-4 w-4" /> Linki kopyala</button>
                <button onClick={() => shareWhatsApp(editor)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-[12.5px] font-medium text-emerald-700 hover:bg-emerald-50"><Send className="h-4 w-4" /> WhatsApp</button>
                <button onClick={rotateToken} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-[12.5px] font-medium text-amber-700 hover:bg-amber-50"><RotateCcw className="h-4 w-4" /> Linki yenile</button>
              </div>
            </section>
          )}

          {preview && <PreviewPanel preview={preview} onDownload={downloadPdf} pdfLoading={pdfLoading} onClose={() => setPreview(null)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-60px)] bg-[#f4f6fa]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#14223b]"><BookOpen className="h-5 w-5 text-[#15356b]" /> Canlı Satış Katalogları</h1>
            <p className="mt-1 text-[13px] text-[#8b97ac]">Seçili ürünleri güncel maliyetlerden fiyatlandırın, kategori bazlı yayınlayın ve her zaman güncel kalan tek bir link paylaşın.</p>
          </div>
          <button onClick={() => openEditor()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#15356b] px-4 text-[13px] font-semibold text-white hover:bg-[#1c4585]"><Plus className="h-4 w-4" /> Yeni katalog</button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Toplam katalog" value={catalogs.length} icon={<BookOpen className="h-4 w-4" />} />
          <Stat label="Yayındaki katalog" value={catalogs.filter((catalog) => catalog.status === 'PUBLISHED').length} icon={<Link2 className="h-4 w-4" />} />
          <Stat label="Toplam görüntülenme" value={catalogs.reduce((sum, catalog) => sum + Number(catalog.viewCount || 0), 0)} icon={<Eye className="h-4 w-4" />} />
        </div>

        <div className="overflow-hidden rounded-lg border border-[#e2e7ef] bg-white">
          {loading ? (
            <div className="flex h-56 items-center justify-center text-[13px] text-[#8b97ac]"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kataloglar yükleniyor</div>
          ) : catalogs.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <BookOpen className="h-10 w-10 text-[#8ba8d7]" />
              <div className="mt-3 text-[15px] font-semibold text-[#14223b]">İlk canlı kataloğunuzu oluşturun</div>
              <p className="mt-1 max-w-lg text-[12.5px] leading-5 text-[#8b97ac]">Ürünleri seçin, fiyat kuralını ve güncel maliyet tarihini belirleyin. Paylaştığınız link, veriler güncellendikçe aynı adres üzerinde yeni fiyatları gösterir.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full text-left">
                <thead className="bg-[#f7f9fc] text-[11px] uppercase text-[#8b97ac]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Katalog</th>
                    <th className="px-4 py-3 font-semibold">Durum</th>
                    <th className="px-4 py-3 font-semibold">İçerik</th>
                    <th className="px-4 py-3 font-semibold">Fiyat yöntemi</th>
                    <th className="px-4 py-3 font-semibold">Etkileşim</th>
                    <th className="px-4 py-3 font-semibold">Güncelleme</th>
                    <th className="px-4 py-3 text-right font-semibold">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f5]">
                  {catalogs.map((catalog) => (
                    <tr key={catalog.id} className="text-[12.5px] hover:bg-[#fbfcfe]">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#14223b]">{catalog.name}</div>
                        <div className="mt-0.5 max-w-[280px] truncate text-[11px] text-[#8b97ac]">{catalog.title}</div>
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${statusClass[catalog.status]}`}>{statusLabel[catalog.status]}</span></td>
                      <td className="px-4 py-3 text-[#51607a]">{catalog.itemCount || 0} ürün · {catalog.sectionCount || 0} kategori<div className="text-[10.5px] text-[#8b97ac]">{catalog.displayDensity === 'COMPACT' ? 'Kompakt görünüm' : 'Standart görünüm'}</div></td>
                      <td className="px-4 py-3 text-[#51607a]">{PRICE_BASIS.find((option) => option.value === catalog.priceBasis)?.label}<div className="text-[10.5px] text-[#8b97ac]">Revizyon {catalog.revision}</div></td>
                      <td className="px-4 py-3 text-[#51607a]">{catalog.viewCount || 0} görüntüleme<div className="text-[10.5px] text-[#8b97ac]">{catalog.pdfDownloadCount || 0} PDF</div></td>
                      <td className="px-4 py-3 text-[#51607a]">{new Date(catalog.updatedAt).toLocaleDateString('tr-TR')}<div className="text-[10.5px] text-[#8b97ac]">{catalog.updatedByName || catalog.createdByName || '-'}</div></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {catalog.status === 'PUBLISHED' && <IconButton title="Linki kopyala" onClick={() => copyPublicLink(catalog)} icon={<Copy className="h-4 w-4" />} />}
                          {catalog.status === 'PUBLISHED' && <IconButton title="Kataloğu aç" onClick={() => window.open(catalog.publicPath, '_blank', 'noopener,noreferrer')} icon={<ExternalLink className="h-4 w-4" />} />}
                          <IconButton title="Düzenle" onClick={() => openEditor(catalog)} icon={<Pencil className="h-4 w-4" />} />
                          <IconButton title="Sil" danger onClick={() => removeCatalog(catalog)} icon={<Trash2 className="h-4 w-4" />} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, title, detail, icon }: { checked: boolean; onChange: (checked: boolean) => void; title: string; detail: string; icon: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${checked ? 'border-[#b9caea] bg-[#f5f8fd]' : 'border-[#e2e7ef] bg-white hover:bg-[#fafbfd]'}`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md ${checked ? 'bg-[#15356b] text-white' : 'bg-[#eef1f5] text-[#64748b]'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#14223b]">{title}<span className={`h-4 w-7 rounded-full p-0.5 ${checked ? 'bg-[#15356b]' : 'bg-[#cbd5e1]'}`}><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3' : ''}`} /></span></span>
        <span className="mt-0.5 block text-[11px] leading-4 text-[#8b97ac]">{detail}</span>
      </span>
    </label>
  );
}

function ProductImage({ src, name, className }: { src?: string | null; name: string; className: string }) {
  return src ? <img src={src} alt="" className={`${className} flex-none rounded-lg border border-[#e7ebf2] bg-white object-contain p-0.5`} /> : <div className={`${className} flex flex-none items-center justify-center rounded-lg border border-[#e7ebf2] bg-[#f4f6fa]`}><ImageOff className="h-4 w-4 text-[#a4adbc]" /><span className="sr-only">{name} görseli yok</span></div>;
}

function IconButton({ title, icon, onClick, disabled, danger }: { title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-30 ${danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa]'}`}>{icon}</button>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center gap-3 rounded-lg border border-[#e2e7ef] bg-white px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2fa] text-[#15356b]">{icon}</span><span><span className="block text-[18px] font-semibold text-[#14223b]">{value.toLocaleString('tr-TR')}</span><span className="text-[11.5px] text-[#8b97ac]">{label}</span></span></div>;
}

function PreviewPanel({ preview, onDownload, pdfLoading, onClose }: { preview: SalesCatalogPresentation; onDownload: () => void; pdfLoading: boolean; onClose: () => void }) {
  const summary = preview.summary || { selectedProducts: 0, includedProducts: 0, excludedProducts: 0 };
  return (
    <section id="catalog-preview" className="scroll-mt-32 rounded-lg border border-[#b9caea] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebf2] px-5 py-4">
        <Eye className="h-5 w-5 text-[#15356b]" />
        <div className="min-w-[180px] flex-1"><h2 className="text-[16px] font-semibold text-[#14223b]">Canlı önizleme sonucu</h2><p className="text-[11.5px] text-[#8b97ac]">Şu anki maliyet, stok ve görsel verilerine göre hesaplandı.</p></div>
        <button onClick={onDownload} disabled={pdfLoading || summary.includedProducts === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#15356b] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">{pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Güncel PDF indir</button>
        <IconButton title="Önizlemeyi kapat" onClick={onClose} icon={<X className="h-4 w-4" />} />
      </div>
      <div className="grid gap-3 border-b border-[#edf0f5] p-5 sm:grid-cols-3">
        <PreviewStat label="Seçili ürün" value={summary.selectedProducts} />
        <PreviewStat label="Kataloğa giren" value={summary.includedProducts} />
        <PreviewStat label="Dışarıda kalan" value={summary.excludedProducts} />
      </div>
      <div className="border-b border-[#edf0f5] p-5">
        <div className="mb-2 text-[13px] font-semibold text-[#14223b]">Hesaplanan ürün fiyatları</div>
        <div className="max-h-80 overflow-auto rounded-lg border border-[#e2e7ef]">
          <table className="min-w-[920px] w-full text-left text-[11.5px]">
            <thead className="sticky top-0 bg-[#f7f9fc] text-[#64748b]"><tr><th className="px-3 py-2">Kategori</th><th className="px-3 py-2">Kod</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2 text-right">Güncel maliyet</th><th className="px-3 py-2">Maliyet tarihi</th><th className="px-3 py-2 text-right">Katalog fiyatı</th><th className="px-3 py-2">Durum</th></tr></thead>
            <tbody className="divide-y divide-[#edf0f5]">
              {preview.sections.flatMap((section) => section.products.map((product) => (
                <tr key={product.id}>
                  <td className="px-3 py-2 text-[#64748b]">{section.title}</td>
                  <td className="px-3 py-2 font-mono text-[#64748b]">{product.productCode}</td>
                  <td className="px-3 py-2 font-medium text-[#14223b]">{product.name}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(product.currentCost || 0))}</td>
                  <td className="px-3 py-2">{product.currentCostDate ? new Date(product.currentCostDate).toLocaleDateString('tr-TR') : 'Tarih yok'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#15356b]">{formatCurrency(product.salePrice)}</td>
                  <td className="px-3 py-2">{product.pricing?.isBelowCurrentCost ? <span className="text-red-700">Maliyet altı</span> : <span className="text-emerald-700">Uygun</span>}</td>
                </tr>
              ))) }
            </tbody>
          </table>
        </div>
      </div>
      {preview.excluded && preview.excluded.length > 0 && (
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Dışarıda kalan ürünler ve nedenleri</div>
          <div className="max-h-64 overflow-auto rounded-lg border border-amber-200">
            <table className="min-w-[760px] w-full text-left text-[11.5px]">
              <thead className="sticky top-0 bg-amber-50 text-amber-900"><tr><th className="px-3 py-2">Kod</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Maliyet tarihi</th><th className="px-3 py-2">Neden</th></tr></thead>
              <tbody className="divide-y divide-amber-100">{preview.excluded.map((item) => <tr key={item.productId}><td className="px-3 py-2 font-mono">{item.productCode}</td><td className="px-3 py-2 font-medium text-[#14223b]">{item.productName}</td><td className="px-3 py-2">{item.currentCostDate ? new Date(item.currentCostDate).toLocaleDateString('tr-TR') : 'Tarih yok'}</td><td className="px-3 py-2 text-amber-800">{item.reasons.join(' ')}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return <div className="border-l-2 border-[#b9caea] px-3 py-1"><div className="text-[20px] font-semibold text-[#14223b]">{value.toLocaleString('tr-TR')}</div><div className="text-[11.5px] text-[#8b97ac]">{label}</div></div>;
}
