'use client';

import { useState } from 'react';
import type { Category } from '@/types';
import { ChevronDown, ChevronRight, LayoutGrid, Package, X } from 'lucide-react';

interface MobileCategoryPanelProps {
  open: boolean;
  onClose: () => void;
  /** Kok (ana) kategoriler — buildCategoryTree'den gelir, Turkce sirali */
  roots: Category[];
  /** Parent id -> cocuk id listesi */
  childrenById: Map<string, string[]>;
  /** id -> kategori */
  nodesById: Map<string, Category>;
  /** Bir kategoriye git (router.push + paneli kapat cagirani ilgilendirir) */
  onNavigateCategory: (categoryId: string) => void;
  /** Tum urunlere git */
  onNavigateAllProducts: () => void;
}

/**
 * Mobil kategori paneli (lg:hidden). Masaustu mega menunun mobil karsiligi:
 * - Ust: kapat + "Tum Urunler" kisayolu
 * - Govde: kok kategori listesi; cocugu olan kok satiri chevron ile inline
 *   akordeon acar. Chevron'a basmak acar/kapatir; satirin adina basmak
 *   dogrudan o kategoriye gider.
 * Kendi scroll'u vardir; alt sekme cubugunu (56px + safe-area) asmaz.
 */
export function MobileCategoryPanel({
  open,
  onClose,
  roots,
  childrenById,
  nodesById,
  onNavigateCategory,
  onNavigateAllProducts,
}: MobileCategoryPanelProps) {
  const [expandedRootId, setExpandedRootId] = useState<string | null>(null);

  if (!open) return null;

  const childrenOf = (id: string): Category[] =>
    (childrenById.get(id) || [])
      .map((childId) => nodesById.get(childId))
      .filter((c): c is Category => Boolean(c));

  return (
    <div
      // Alt sekme cubugunun (56px + safe-area) ustunde biter: cubuk gorunur ve
      // tiklanabilir kalir (Kategoriler sekmesine tekrar basinca panel kapanir).
      className="fixed inset-x-0 top-0 z-40 flex flex-col bg-white lg:hidden"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-modal="true"
      aria-label="Kategoriler"
    >
      {/* Baslik */}
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
        <span className="flex items-center gap-2 text-[15px] font-bold text-[var(--ink-1)]">
          <LayoutGrid className="h-5 w-5 text-primary-600" />
          Kategoriler
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--ink-2)]"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Govde — kendi scroll'u (panel zaten alt sekme cubugunun ustunde biter) */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        {/* Tum Urunler kisayolu */}
        <button
          type="button"
          onClick={onNavigateAllProducts}
          className="flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 text-left text-[14px] font-semibold text-primary-700 hover:bg-primary-50"
        >
          <Package className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">Tüm Ürünler</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary-400" />
        </button>

        {roots.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--ink-3)]">
            Kategori bulunamadı.
          </div>
        ) : (
          <div>
            {roots.map((root) => {
              const children = childrenOf(root.id);
              const hasChildren = children.length > 0;
              const expanded = expandedRootId === root.id;
              return (
                <div key={root.id} className="border-b border-[var(--line)]">
                  <div className="flex items-stretch">
                    {/* Kok kategorinin kendisine git */}
                    <button
                      type="button"
                      onClick={() => onNavigateCategory(root.id)}
                      className="flex min-w-0 flex-1 items-center px-4 py-3.5 text-left text-[14px] font-medium text-[var(--ink-1)] hover:bg-[var(--surface-0)]"
                    >
                      <span className="min-w-0 truncate">{root.name}</span>
                    </button>
                    {/* Cocugu varsa akordeon ac/kapat */}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRootId((prev) => (prev === root.id ? null : root.id))
                        }
                        className="flex w-14 flex-shrink-0 items-center justify-center border-l border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--surface-0)]"
                        aria-label={expanded ? `${root.name} alt kategorilerini gizle` : `${root.name} alt kategorilerini göster`}
                        aria-expanded={expanded}
                      >
                        <ChevronDown
                          className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>

                  {/* Alt kategoriler (inline akordeon) */}
                  {hasChildren && expanded && (
                    <div className="bg-[var(--surface-0)] pb-1">
                      {children.map((child) => {
                        const leaves = childrenOf(child.id);
                        return (
                          <div key={child.id}>
                            <button
                              type="button"
                              onClick={() => onNavigateCategory(child.id)}
                              className="flex w-full items-center gap-2 py-2.5 pl-7 pr-4 text-left text-[13.5px] font-medium text-[var(--ink-1)] hover:bg-white"
                            >
                              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
                              <span className="min-w-0 truncate">{child.name}</span>
                            </button>
                            {leaves.length > 0 && (
                              <div className="flex flex-col">
                                {leaves.map((leaf) => (
                                  <button
                                    key={leaf.id}
                                    type="button"
                                    onClick={() => onNavigateCategory(leaf.id)}
                                    className="w-full truncate py-2 pl-14 pr-4 text-left text-[12.5px] text-[var(--ink-2)] hover:bg-white"
                                  >
                                    {leaf.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
