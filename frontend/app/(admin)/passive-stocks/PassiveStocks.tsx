'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PackageSearch, Search, Sparkles } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Pasif Stoklar — Mikroda pasif olan stok kartlarini arayip aktiflestirme adayi olarak listeler.
 * "Aktiflestir" butonu mevcut kart icin salt aktivasyon on kontrolunu acar.
 * Yeni tema (Bakircilar Yonetim Paneli) gorsel diliyle; mantik minimum tutulur.
 */

type PassiveStockItem = {
  code: string;
  name: string;
  categoryCode?: string;
  supplierCode?: string;
  currentCost?: number;
  guid?: string;
};

const formatCost = (value?: number) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

export default function PassiveStocks() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PassiveStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  // Yetki kapisi — diger admin ekranlariyla ayni desen.
  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:stock-create')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  const canView = useMemo(
    () => user !== null && !permissionsLoading && hasPermission('admin:stock-create'),
    [user, permissionsLoading, hasPermission]
  );

  // Debounce'li arama — en az 2 karakter yazilinca pasif stoklari cek.
  useEffect(() => {
    if (!canView) return;
    const q = search.trim();
    if (q.length < 2) {
      setItems([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await adminApi.listPassiveStocks(q, 50);
        if (reqIdRef.current !== myReq) return; // eskimis istek
        setItems(res.items || []);
        setSearched(true);
      } catch (error: any) {
        if (reqIdRef.current !== myReq) return;
        setItems([]);
        setSearched(true);
        toast.error(error.response?.data?.error || 'Pasif stoklar alinamadi');
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, canView]);

  const goActivate = (code: string) => {
    router.push(`/stock-create?activate=${encodeURIComponent(code)}`);
  };

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#15356b]" />
      </div>
    );
  }

  const trimmed = search.trim();

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#14223b]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        {/* Baslik */}
        <div className="mb-4 mt-1">
          <h1 className="m-0 flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">
            <PackageSearch className="h-6 w-6 text-[#15356b]" />
            Pasif Stoklar
          </h1>
          <div className="mt-1.5 max-w-3xl text-[13px] text-[#8b97ac]">
            Mikro&apos;da pasif stoklari arayip aktiflestirin. Yeni stok acilmaz; mevcut kartin
            yalnizca pasiflik durumu aktif yapilir.
          </div>
        </div>

        {/* Arama */}
        <div className="mb-4 rounded-xl border border-[#e7ebf2] bg-white p-[18px]">
          <label className="mb-1 block text-[11px] font-medium text-[#8b97ac]">Pasif stok ara</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#9aa6b8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kod veya stok adi ara (en az 2 karakter)"
              className="h-[40px] w-full rounded-lg border border-[#e3e8f0] bg-white pl-10 pr-3 text-[13px] text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/10"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[#8b97ac]">
            Yalnizca Mikro&apos;da pasif olan stok kartlari listelenir. Ad, fiyat, maliyet, birim ve barkod bilgileri degistirilmez.
          </p>
        </div>

        {/* Sonuclar */}
        <div className="rounded-xl border border-[#e7ebf2] bg-white p-[18px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="m-0 text-[15px] font-semibold text-[#14223b]">Sonuclar</h2>
            {items.length > 0 && (
              <span className="rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-2.5 py-1 text-[10.5px] font-semibold text-[#15356b]">
                {items.length} kayit
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-4 text-[12.5px] text-[#8b97ac]">
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-[#15356b]" />
              Araniyor...
            </div>
          ) : trimmed.length < 2 ? (
            <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-4 text-[12.5px] text-[#8b97ac]">
              Pasif stoklari listelemek icin en az 2 karakter yazin.
            </div>
          ) : searched && items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d8e0ec] bg-[#fafbfd] p-4 text-[12.5px] text-[#8b97ac]">
              &quot;{trimmed}&quot; icin pasif stok bulunamadi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#eef1f6] text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                    <th className="px-3 py-2">Kod</th>
                    <th className="px-3 py-2">Ad</th>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2">Saglayici</th>
                    <th className="px-3 py-2 text-right">Guncel Maliyet</th>
                    <th className="px-3 py-2 text-right">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.code} className="border-b border-[#f2f4f8] transition hover:bg-[#fafbfd]">
                      <td className="px-3 py-2.5 font-mono font-semibold text-[#14223b]">{item.code}</td>
                      <td className="px-3 py-2.5 text-[#14223b]">
                        <span className="line-clamp-2">{item.name || '-'}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#51607a]">{item.categoryCode || '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-[#51607a]">{item.supplierCode || '-'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#51607a]">{formatCost(item.currentCost)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => goActivate(item.code)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#6d28d9] bg-[#6d28d9] px-[13px] py-[7px] text-[12px] font-semibold text-white transition hover:bg-[#5b21b6]"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Aktiflestir
                        </button>
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
