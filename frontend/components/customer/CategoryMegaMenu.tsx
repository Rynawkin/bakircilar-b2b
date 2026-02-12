'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import type { Category } from '@/types';

type TreeData = {
  roots: Category[];
  nodesById: Map<string, Category>;
  childrenById: Map<string, string[]>;
};

const DELIMITERS = ['.', '/', '-', '_', '|', '>'];

const resolveDelimiter = (codes: string[]): string | null => {
  for (const delimiter of DELIMITERS) {
    if (codes.some((code) => code.includes(delimiter))) {
      return delimiter;
    }
  }
  return null;
};

const resolvePrefixParent = (code: string, codeSet: Set<string>): string | null => {
  for (let end = code.length - 1; end > 0; end -= 1) {
    const prefix = code.slice(0, end);
    if (codeSet.has(prefix)) {
      return prefix;
    }
  }
  return null;
};

const buildTree = (categories: Category[]): TreeData => {
  const nodesById = new Map<string, Category>();
  const childrenById = new Map<string, string[]>();
  const codeToId = new Map<string, string>();

  categories.forEach((category) => {
    nodesById.set(category.id, category);
    childrenById.set(category.id, []);
    if (category.mikroCode && !codeToId.has(category.mikroCode)) {
      codeToId.set(category.mikroCode, category.id);
    }
  });

  const codes = Array.from(codeToId.keys());
  const delimiter = resolveDelimiter(codes);
  const codeSet = new Set(codes);
  const roots: Category[] = [];

  categories.forEach((category) => {
    const code = category.mikroCode;
    let parentId: string | null = null;

    if (code) {
      let parentCode: string | null = null;
      if (delimiter) {
        const parts = code.split(delimiter).filter(Boolean);
        if (parts.length > 1) {
          parentCode = parts.slice(0, -1).join(delimiter);
        }
      } else {
        parentCode = resolvePrefixParent(code, codeSet);
      }

      if (parentCode && codeToId.has(parentCode)) {
        parentId = codeToId.get(parentCode) || null;
      }
    }

    if (parentId) {
      childrenById.get(parentId)?.push(category.id);
    } else {
      roots.push(category);
    }
  });

  const sortByName = (a: string, b: string) => {
    const nameA = nodesById.get(a)?.name || '';
    const nameB = nodesById.get(b)?.name || '';
    return nameA.localeCompare(nameB);
  };

  roots.sort((a, b) => a.name.localeCompare(b.name));
  Array.from(childrenById.entries()).forEach(([id, childIds]) => {
    childrenById.set(id, [...childIds].sort(sortByName));
  });

  return { roots, nodesById, childrenById };
};

const collectLeaves = (
  startId: string,
  nodesById: Map<string, Category>,
  childrenById: Map<string, string[]>
): Category[] => {
  const result: Category[] = [];
  const walk = (id: string) => {
    const children = childrenById.get(id) || [];
    if (children.length === 0) {
      const node = nodesById.get(id);
      if (node) {
        result.push(node);
      }
      return;
    }
    children.forEach(walk);
  };

  walk(startId);
  return result;
};

const mapNodes = (ids: string[], nodesById: Map<string, Category>) => {
  return ids.map((id) => nodesById.get(id)).filter(Boolean) as Category[];
};

type CategoryMegaMenuProps = {
  categories: Category[];
  selectedCategoryId?: string;
  onSelect: (categoryId: string) => void;
};

export function CategoryMegaMenu({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryMegaMenuProps) {
  const { roots, nodesById, childrenById } = useMemo(
    () => buildTree(categories),
    [categories]
  );

  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  const selectedLabel = selectedCategoryId
    ? nodesById.get(selectedCategoryId)?.name
    : null;

  const clearActive = useCallback(() => {
    setActiveRootId(null);
    setActiveChildId(null);
  }, []);

  const handleSelect = useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
    },
    [onSelect]
  );

  const handleRootHover = useCallback(
    (rootId: string) => {
      setActiveRootId(rootId);
      const children = childrenById.get(rootId) || [];
      setActiveChildId(children[0] || null);
    },
    [childrenById]
  );

  const handleChildHover = useCallback((childId: string) => {
    setActiveChildId(childId);
  }, []);

  useEffect(() => {
    if (!activeRootId) {
      setActiveChildId(null);
      return;
    }
    const children = childrenById.get(activeRootId) || [];
    if (children.length === 0) {
      setActiveChildId(null);
      return;
    }
    if (!activeChildId || !children.includes(activeChildId)) {
      setActiveChildId(children[0]);
    }
  }, [activeRootId, activeChildId, childrenById]);

  const rootChildren = activeRootId
    ? mapNodes(childrenById.get(activeRootId) || [], nodesById)
    : [];

  const leafNodes = activeChildId
    ? collectLeaves(activeChildId, nodesById, childrenById)
    : activeRootId
      ? collectLeaves(activeRootId, nodesById, childrenById)
      : [];

  return (
    <div className="w-full" onMouseLeave={clearActive}>
      <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Kategoriler</div>
            <div className="text-sm font-semibold text-gray-900">
              {selectedLabel || 'Tumu'}
            </div>
          </div>
          <span className="text-xs text-gray-500">v</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onMouseEnter={clearActive}
            onClick={() => handleSelect('')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors border ${
              !selectedCategoryId
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
            }`}
          >
            Tumu
          </button>
          {roots.map((root) => {
            const isActive = root.id === activeRootId;
            const isSelected = root.id === selectedCategoryId;
            return (
              <button
                key={root.id}
                type="button"
                onMouseEnter={() => handleRootHover(root.id)}
                onClick={() => handleSelect(root.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors border ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600'
                    : isActive
                      ? 'bg-gray-100 text-gray-900 border-gray-200'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                {root.name}
              </button>
            );
          })}
        </div>
      </div>

      {activeRootId && (
        <div className="mt-3 w-full rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="grid grid-cols-[260px_1fr] gap-0">
            <div className="border-r border-gray-100 p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Alt Kategoriler</div>
              {rootChildren.length === 0 ? (
                <div className="text-xs text-gray-400">Alt kategori bulunamadi.</div>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => activeRootId && handleSelect(activeRootId)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      activeRootId && selectedCategoryId === activeRootId
                        ? 'bg-primary-600 text-white'
                        : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                    }`}
                  >
                    Tum {nodesById.get(activeRootId || '')?.name || 'Kategori'}
                  </button>
                  {rootChildren.map((child) => {
                    const isActive = child.id === activeChildId;
                    const isSelected = child.id === selectedCategoryId;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onMouseEnter={() => handleChildHover(child.id)}
                        onClick={() => handleSelect(child.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-primary-600 text-white'
                            : isActive
                              ? 'bg-gray-100 text-gray-900'
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {child.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">En Alt Kategoriler</div>
              {leafNodes.length === 0 ? (
                <div className="text-xs text-gray-400">Kategori bulunamadi.</div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
                  {leafNodes.map((leaf) => {
                    const isSelected = leaf.id === selectedCategoryId;
                    return (
                      <button
                        key={leaf.id}
                        type="button"
                        onClick={() => handleSelect(leaf.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border ${
                          isSelected
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                        }`}
                      >
                        {leaf.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
