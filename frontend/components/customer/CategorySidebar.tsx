'use client';

import Link from 'next/link';
import { LayoutGrid, ArrowRight, Percent } from 'lucide-react';
import { Category } from '@/types';

interface CategorySidebarProps {
  categories: Category[];
  selectedCategoryId: string;
  onSelect: (id: string) => void;
  /** Dikey banner hedefi (varsayilan: indirimli urunler) */
  bannerHref?: string;
}

/**
 * Vitrin liste kabugu sol kenar cubugu: kok kategori listesi (aktif vurgulu) + dikey
 * banner. Masaustunde gorunur (lg+); mobilde gizli (kategoriler nav mega menude / filtrede).
 * Salt gorunum + secim; filtreleme mantigi sayfada.
 */
export function CategorySidebar({ categories, selectedCategoryId, onSelect, bannerHref = '/discounted-products' }: CategorySidebarProps) {
  const roots = categories.filter((c) => !String((c as any).mikroCode || '').includes('.'));
  const list = (roots.length > 0 ? roots : categories).slice(0, 14);
  if (list.length === 0) return null;

  const rowClass = (active: boolean) =>
    `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
      active ? 'bg-[#eef2fa] font-semibold text-[#15356b]' : 'text-[#51607a] hover:bg-[#f6f8fc]'
    }`;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-4">
      <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
        <div className="mb-1.5 flex items-center gap-2 border-b border-[var(--line)] px-2 pb-2.5">
          <LayoutGrid className="h-4 w-4 text-[#15356b]" />
          <span className="text-[13.5px] font-bold text-[#14223b]">Kategoriler</span>
        </div>
        <div className="flex flex-col">
          <button type="button" onClick={() => onSelect('')} className={rowClass(!selectedCategoryId)}>
            <span className="truncate">Tümü</span>
          </button>
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={rowClass(selectedCategoryId === c.id)}
              title={c.name}
            >
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <Link href="/products" className="mt-1.5 block rounded-lg bg-[#f6f8fc] px-3 py-2 text-[12.5px] font-semibold text-[#15356b] hover:bg-[#eef2fa]">
          Tüm kategoriler →
        </Link>
      </div>

      {/* Dikey banner */}
      <Link href={bannerHref} className="relative block h-[300px] overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a7a55] to-[#0c8f63]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end gap-1.5 p-5 text-white">
          <Percent className="h-7 w-7 text-white/80" />
          <div className="text-[20px] font-bold leading-tight">Stok eritme fırsatları</div>
          <div className="text-[13px] text-white/85">İndirimli ürünlerde net fiyat avantajı</div>
          <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-[13px] font-bold">
            İncele <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    </aside>
  );
}

export default CategorySidebar;
