'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Grid2X2, Layers, X } from 'lucide-react';
import type { Category } from '@/types';
import { buildCategoryTree, getCategoryPath } from '@/lib/utils/categoryTree';

type CategoryMegaMenuProps = {
  categories: Category[];
  selectedCategoryId?: string;
  onSelect: (categoryId: string) => void;
};

const mapNodes = (ids: string[], nodesById: Map<string, Category>) =>
  ids.map((id) => nodesById.get(id)).filter(Boolean) as Category[];

export function CategoryMegaMenu({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryMegaMenuProps) {
  const { roots, nodesById, childrenById } = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  );

  const selectedPath = useMemo(
    () => (selectedCategoryId ? getCategoryPath(selectedCategoryId, categories) : []),
    [selectedCategoryId, categories]
  );

  const selectedRootId = selectedPath[0]?.id || null;
  const selectedNode = selectedCategoryId ? nodesById.get(selectedCategoryId) : null;

  const [activeRootId, setActiveRootId] = useState<string | null>(selectedRootId || roots[0]?.id || null);
  const [previewBranchId, setPreviewBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRootId) {
      setActiveRootId(selectedRootId);
      setPreviewBranchId(selectedPath[1]?.id || null);
      return;
    }
    if (!activeRootId && roots[0]?.id) {
      setActiveRootId(roots[0].id);
    }
  }, [selectedRootId, selectedPath, activeRootId, roots]);

  const activeRoot = activeRootId ? nodesById.get(activeRootId) || null : null;
  const activeChildren = activeRootId
    ? mapNodes(childrenById.get(activeRootId) || [], nodesById)
    : [];

  const selectedBranchId =
    selectedPath.length >= 3 ? selectedPath[1]?.id : selectedPath.length === 2 ? selectedPath[1]?.id : null;
  const activeBranchId =
    previewBranchId && activeChildren.some((child) => child.id === previewBranchId)
      ? previewBranchId
      : selectedRootId === activeRootId && selectedBranchId
        ? selectedBranchId
        : activeChildren[0]?.id || null;

  const activeBranch = activeBranchId ? nodesById.get(activeBranchId) || null : null;
  const activeLeafNodes = activeBranchId
    ? mapNodes(childrenById.get(activeBranchId) || [], nodesById)
    : [];

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">Kategoriler</div>
            {selectedPath.length > 0 && (
              <div className="mt-0.5 hidden items-center gap-1 text-xs text-gray-500 sm:flex">
                {selectedPath.map((category, index) => (
                  <span key={category.id} className="flex min-w-0 items-center gap-1">
                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" />}
                    <span className="max-w-[140px] truncate">{category.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedCategoryId ? (
          <button
            type="button"
            onClick={() => onSelect('')}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <X className="h-4 w-4" />
            Temizle
          </button>
        ) : (
          <span className="hidden rounded-md bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 sm:inline-flex">
            Tum urunler
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
            !selectedCategoryId
              ? 'bg-gray-900 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Grid2X2 className="h-4 w-4" />
          Tumu
        </button>
        {roots.map((root) => {
          const isActive = root.id === activeRootId;
          const isSelected = root.id === selectedCategoryId;
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => {
                setActiveRootId(root.id);
                setPreviewBranchId(null);
                onSelect(root.id);
              }}
              title={root.name}
              className={`h-10 max-w-[180px] shrink-0 truncate rounded-md px-3 text-sm font-semibold transition-colors ${
                isSelected
                  ? 'bg-gray-900 text-white'
                  : isActive
                    ? 'bg-primary-50 text-primary-800'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {root.name}
            </button>
          );
        })}
      </div>

      {activeRoot && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-gray-200 bg-gray-50 md:border-b-0 md:border-r">
            <button
              type="button"
              onClick={() => onSelect(activeRoot.id)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold transition-colors ${
                selectedCategoryId === activeRoot.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-900 hover:bg-primary-50 hover:text-primary-800'
              }`}
            >
              <span className="min-w-0 truncate">Tum {activeRoot.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>

            <div className="max-h-80 overflow-y-auto p-2">
              {activeChildren.length === 0 ? (
                <div className="px-2 py-6 text-sm text-gray-500">Alt kategori yok</div>
              ) : (
                <div className="space-y-1">
                  {activeChildren.map((child) => {
                    const isSelected = child.id === selectedCategoryId;
                    const isBranchActive = child.id === activeBranchId;
                    const childCount = childrenById.get(child.id)?.length || 0;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onMouseEnter={() => setPreviewBranchId(child.id)}
                        onFocus={() => setPreviewBranchId(child.id)}
                        onClick={() => {
                          setPreviewBranchId(child.id);
                          onSelect(child.id);
                        }}
                        title={child.name}
                        className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-primary-600 font-semibold text-white'
                            : isBranchActive
                              ? 'bg-white font-semibold text-primary-800 shadow-sm'
                              : 'text-gray-700 hover:bg-white hover:text-gray-950'
                        }`}
                      >
                        <span className="min-w-0 truncate">{child.name}</span>
                        <span className={`shrink-0 text-xs ${isSelected ? 'text-primary-100' : 'text-gray-400'}`}>
                          {childCount > 0 ? childCount : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 p-4">
            {activeBranch ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-900">{activeBranch.name}</div>
                    <div className="text-xs text-gray-500">{activeLeafNodes.length} alt kategori</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(activeBranch.id)}
                    className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors ${
                      selectedCategoryId === activeBranch.id
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-200 bg-white text-primary-700 hover:border-primary-200 hover:bg-primary-50'
                    }`}
                  >
                    Tumunu goster
                  </button>
                </div>

                {activeLeafNodes.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {activeLeafNodes.map((leaf) => {
                      const isSelected = leaf.id === selectedCategoryId;
                      return (
                        <button
                          key={leaf.id}
                          type="button"
                          onClick={() => onSelect(leaf.id)}
                          title={leaf.name}
                          className={`flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm transition-colors ${
                            isSelected
                              ? 'border-primary-600 bg-primary-600 font-semibold text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800'
                          }`}
                        >
                          <span className="min-w-0 truncate">{leaf.name}</span>
                          <ChevronRight className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary-100' : 'text-gray-300'}`} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                    Bu kategoride alt kirilim yok.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                Alt kategori secin.
              </div>
            )}
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="flex items-center gap-2 border-t border-gray-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <span className="shrink-0 text-xs font-bold uppercase text-emerald-700">Aktif</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {selectedPath.map((category, index) => (
              <span key={category.id} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-emerald-500" />}
                <span className={`max-w-[180px] truncate ${index === selectedPath.length - 1 ? 'font-bold' : 'font-medium'}`}>
                  {category.name}
                </span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onSelect('')}
            className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-800 hover:bg-emerald-100"
            aria-label="Kategori filtresini temizle"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
