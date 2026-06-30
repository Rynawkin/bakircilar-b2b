'use client';

/**
 * Arama Yonetimi (Admin)
 * -----------------------------------------------------------------------------
 * Yeni admin tasarim stili (beyaz kart, primary #15356b, ink tonlari, lucide).
 * Iki sekme:
 *   1) Sonuc cikmayan aramalar  -> SearchMiss listesi (musteri neyi bulamiyor)
 *   2) Urun es-anlamlari        -> Product.searchAliases editoru
 *
 * Arama mantigi DEGISMEZ: admin alias girince DB generated searchText bunu da
 * kapsar, dolayisiyla mevcut arama otomatik bulur. Bu ekran sadece veri girisi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Search,
  Tags,
  RotateCcw,
  CheckCircle2,
  Save,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDateShort } from '@/lib/utils/format';

const PAGE_SIZE = 25;

type MissStatus = 'all' | 'open' | 'resolved';

interface SearchMissItem {
  id: string;
  normalizedTerm: string;
  sampleTerm: string | null;
  count: number;
  resolved: boolean;
  lastSearchedAt: string | null;
}

interface ProductAliasItem {
  id: string;
  name: string;
  mikroCode: string;
  categoryName: string | null;
  searchAliases: string | null;
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const EMPTY_PAGINATION: PaginationMeta = { total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 };

// --- ortak kucuk parcalar -----------------------------------------------------

function Pager({
  pagination,
  onChange,
}: {
  pagination: PaginationMeta;
  onChange: (page: number) => void;
}) {
  const { page, totalPages, total } = pagination;
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
      <span className="text-[12.5px] text-[var(--ink-3)]">
        Toplam {total.toLocaleString('tr-TR')} kayit - Sayfa {page}/{Math.max(1, totalPages)}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Onceki
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sonraki
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// --- SEKME 1: Sonuc cikmayan aramalar ----------------------------------------

function SearchMissesTab() {
  const [status, setStatus] = useState<MissStatus>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SearchMissItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // arama kutusu debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getSearchMisses({ status, search, page, pageSize: PAGE_SIZE });
      setItems(res.items || []);
      setPagination(res.pagination || EMPTY_PAGINATION);
    } catch (error) {
      console.error('Aramalar yuklenemedi:', error);
      toast.error('Aramalar yuklenemedi');
      setItems([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleResolved = async (item: SearchMissItem) => {
    setSavingId(item.id);
    try {
      await adminApi.updateSearchMiss(item.id, !item.resolved);
      // status filtresi nedeniyle satir listeden cikabilir -> tekrar yukle
      if (status === 'all') {
        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, resolved: !row.resolved } : row)));
      } else {
        await load();
      }
      toast.success(item.resolved ? 'Geri alindi' : 'Cozuldu olarak isaretlendi');
    } catch (error) {
      console.error('Guncellenemedi:', error);
      toast.error('Guncellenemedi');
    } finally {
      setSavingId(null);
    }
  };

  const statusFilters: { value: MissStatus; label: string }[] = useMemo(
    () => [
      { value: 'open', label: 'Acik' },
      { value: 'resolved', label: 'Cozuldu' },
      { value: 'all', label: 'Tumu' },
    ],
    []
  );

  return (
    <div className="rounded-xl border border-[#e7ebf2] bg-white">
      {/* Filtre satiri */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4">
        <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--surface-0)] p-0.5">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                status === f.value ? 'bg-white text-[#15356b] shadow-sm' : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Arama terimi ara..."
            className="h-10 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-[13px] text-[var(--ink-1)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[#15356b]"
          />
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-0)] text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-4 py-3">Arama terimi</th>
              <th className="px-4 py-3 text-right">Adet</th>
              <th className="px-4 py-3">Son arama</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">Islem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-[var(--ink-3)]">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-[var(--ink-3)]">
                  Kayit bulunamadi.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-0)]">
                  <td className="px-4 py-3">
                    <div className="text-[13.5px] font-semibold text-[var(--ink-1)]">
                      {item.sampleTerm || item.normalizedTerm}
                    </div>
                    {item.sampleTerm && item.sampleTerm !== item.normalizedTerm && (
                      <div className="text-[11.5px] text-[var(--ink-3)]">{item.normalizedTerm}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-[#15356b]/10 px-2 py-0.5 text-[12.5px] font-semibold text-[#15356b]">
                      {item.count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-[var(--ink-2)]">
                    {item.lastSearchedAt ? formatDateShort(item.lastSearchedAt) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {item.resolved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Cozuldu
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700">
                        Acik
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleResolved(item)}
                      disabled={savingId === item.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
                        item.resolved
                          ? 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-0)]'
                          : 'border-[#15356b] bg-[#15356b] text-white hover:bg-[#0f2a57]'
                      }`}
                    >
                      {savingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : item.resolved ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {item.resolved ? 'Geri al' : 'Cozuldu'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager pagination={pagination} onChange={(p) => setPage(Math.max(1, p))} />
    </div>
  );
}

// --- SEKME 2: Urun es-anlamlari ----------------------------------------------

function ProductAliasRow({
  product,
  onSaved,
}: {
  product: ProductAliasItem;
  onSaved: (id: string, value: string) => void;
}) {
  const [value, setValue] = useState(product.searchAliases || '');
  const [saving, setSaving] = useState(false);

  // disaridan veri degisince input'u senkronla (sayfa/ara degisimi)
  useEffect(() => {
    setValue(product.searchAliases || '');
  }, [product.id, product.searchAliases]);

  const dirty = (value.trim() || '') !== (product.searchAliases?.trim() || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateProductAliases(product.id, value);
      onSaved(product.id, value.trim());
      toast.success('Kaydedildi');
    } catch (error) {
      console.error('Kaydedilemedi:', error);
      toast.error('Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-[var(--line)] last:border-0 align-top hover:bg-[var(--surface-0)]">
      <td className="px-4 py-3">
        <div className="text-[13.5px] font-semibold text-[var(--ink-1)]">{product.name}</div>
      </td>
      <td className="px-4 py-3 text-[12.5px] font-medium text-[var(--ink-2)]">{product.mikroCode}</td>
      <td className="px-4 py-3 text-[12.5px] text-[var(--ink-2)]">{product.categoryName || '-'}</td>
      <td className="px-4 py-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty && !saving) handleSave();
          }}
          placeholder="cop torbasi, poset, naylon"
          className="h-9 w-full min-w-[220px] rounded-lg border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink-1)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[#15356b]"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#15356b] bg-[#15356b] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#0f2a57] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--surface-0)] disabled:text-[var(--ink-3)]"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Kaydet
        </button>
      </td>
    </tr>
  );
}

function ProductAliasesTab() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProductAliasItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getProductAliases({ search, page, pageSize: PAGE_SIZE });
      setItems(res.items || []);
      setPagination(res.pagination || EMPTY_PAGINATION);
    } catch (error) {
      console.error('Urunler yuklenemedi:', error);
      toast.error('Urunler yuklenemedi');
      setItems([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = (id: string, value: string) => {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, searchAliases: value || null } : row)));
  };

  return (
    <div className="rounded-xl border border-[#e7ebf2] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] p-4">
        <p className="text-[12.5px] text-[var(--ink-3)]">
          Es-anlam kelimeleri urunun aramada bulunmasini saglar. Virgulle ayirin.
        </p>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Urun ara (ad / kod)..."
            className="h-10 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-[13px] text-[var(--ink-1)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[#15356b]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-0)] text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-4 py-3">Urun adi</th>
              <th className="px-4 py-3">Mikro kod</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 w-[34%]">Es-anlam kelimeleri</th>
              <th className="px-4 py-3 text-right">Islem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-[var(--ink-3)]">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-[var(--ink-3)]">
                  Urun bulunamadi.
                </td>
              </tr>
            ) : (
              items.map((product) => (
                <ProductAliasRow key={product.id} product={product} onSaved={handleSaved} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager pagination={pagination} onChange={(p) => setPage(Math.max(1, p))} />
    </div>
  );
}

// --- Sayfa --------------------------------------------------------------------

type TabKey = 'misses' | 'aliases';

export default function SearchManagementPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [tab, setTab] = useState<TabKey>('misses');

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:search-management')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  // Izin yoksa icerik gostermeden bekle (yonlendirme efektte)
  if (!permissionsLoading && user && !hasPermission('admin:search-management')) {
    return null;
  }

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'misses', label: 'Sonuc cikmayan aramalar', icon: Search },
    { key: 'aliases', label: 'Urun es-anlamlari', icon: Tags },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Baslik */}
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-[var(--ink-1)]">Arama Yonetimi</h1>
        <p className="mt-1 text-[13px] text-[var(--ink-3)]">
          Musterilerin neyi bulamadigini gorun ve urunlere es-anlam kelimeleri ekleyerek aramayi iyilestirin.
        </p>
      </div>

      {/* Sekmeler */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--line)]">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
                active
                  ? 'border-[#15356b] text-[#15356b]'
                  : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'misses' ? <SearchMissesTab /> : <ProductAliasesTab />}
    </div>
  );
}
