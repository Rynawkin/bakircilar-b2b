'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const selectedChildId = selectedPath[1]?.id || null;
  const selectedNode = selectedCategoryId ? nodesById.get(selectedCategoryId) : null;

  const [activeRootId, setActiveRootId] = useState<string | null>(selectedRootId || roots[0]?.id || null);

  useEffect(() => {
    if (selectedRootId) {
      setActiveRootId(selectedRootId);
      return;
    }
    if (!activeRootId && roots[0]?.id) {
      setActiveRootId(roots[0].id);
    }
  }, [selectedRootId, activeRootId, roots]);

  const activeRoot = activeRootId ? nodesById.get(activeRootId) || null : null;
  const activeChildren = activeRootId
    ? mapNodes(childrenById.get(activeRootId) || [], nodesById)
    : [];

  const selectedBranchId =
    selectedPath.length >= 3 ? selectedPath[1]?.id : selectedPath.length === 2 ? selectedPath[1]?.id : null;
  const activeBranchId =
    selectedRootId === activeRootId && selectedBranchId
      ? selectedBranchId
      : activeChildren[0]?.id || null;

  const activeBranch = activeBranchId ? nodesById.get(activeBranchId) || null : null;
  const activeLeafNodes = activeBranchId
    ? mapNodes(childrenById.get(activeBranchId) || [], nodesById)
    : [];

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Kategoriler</div>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Urunleri kategoriye gore gezin</h2>
          <p className="mt-1 text-sm text-gray-600">
            Ana kategoriye tikladiginizda, o bolumdeki tum urunler listelenir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
            !selectedCategoryId
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:text-primary-700'
          }`}
        >
          Tumu
        </button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {roots.map((root) => {
          const isActive = root.id === activeRootId;
          const isSelected = root.id === selectedCategoryId;
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => {
                setActiveRootId(root.id);
                onSelect(root.id);
              }}
              className={`shrink-0 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
                isSelected
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : isActive
                    ? 'border-primary-200 bg-primary-50 text-primary-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:text-primary-700'
              }`}
            >
              {root.name}
            </button>
          );
        })}
      </div>

      {activeRoot && (
        <div className="mt-5 rounded-2xl bg-gray-50 p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Secili Bolum</div>
              <div className="mt-1 text-lg font-bold text-gray-900">{activeRoot.name}</div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(activeRoot.id)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                selectedCategoryId === activeRoot.id
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-primary-200 bg-white text-primary-700 hover:bg-primary-50'
              }`}
            >
              Tum {activeRoot.name}
            </button>
          </div>

          {activeChildren.length > 0 && (
            <div className="mt-4">
              <div className="mb-3 text-sm font-semibold text-gray-700">Alt kategoriler</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {activeChildren.map((child) => {
                  const isSelected = child.id === selectedCategoryId;
                  const isBranchActive = child.id === activeBranchId;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onSelect(child.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : isBranchActive
                            ? 'border-primary-200 bg-white text-primary-800 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-800 hover:border-primary-300 hover:bg-primary-50'
                      }`}
                    >
                      <div className="text-sm font-semibold">{child.name}</div>
                      <div className={`mt-1 text-xs ${isSelected ? 'text-primary-100' : 'text-gray-500'}`}>
                        Altindaki tum urunleri goster
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeBranch && activeLeafNodes.length > 0 && (
            <div className="mt-5 border-t border-gray-200 pt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-700">{activeBranch.name} alt kategorileri</div>
                  <div className="text-xs text-gray-500">Dilerseniz daha spesifik filtre de secebilirsiniz.</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(activeBranch.id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedCategoryId === activeBranch.id
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-primary-200 bg-white text-primary-700 hover:bg-primary-50'
                  }`}
                >
                  Tum {activeBranch.name}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeLeafNodes.map((leaf) => {
                  const isSelected = leaf.id === selectedCategoryId;
                  return (
                    <button
                      key={leaf.id}
                      type="button"
                      onClick={() => onSelect(leaf.id)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      {leaf.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedNode && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Aktif Kategori</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-emerald-900">
            {selectedPath.map((category, index) => (
              <span key={category.id} className="flex items-center gap-2">
                {index > 0 && <span className="text-emerald-400">/</span>}
                <span className={index === selectedPath.length - 1 ? 'font-bold' : 'font-medium'}>
                  {category.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
