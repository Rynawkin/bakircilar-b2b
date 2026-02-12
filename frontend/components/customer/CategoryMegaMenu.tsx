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
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setActiveRootId(null);
    setActiveChildId(null);
  }, []);

  const handleRootActivate = useCallback(
    (rootId: string) => {
      const children = childrenById.get(rootId) || [];
      if (children.length === 0) {
        setMenuOpen(false);
        setActiveRootId(null);
        setActiveChildId(null);
        return;
      }
      setActiveRootId(rootId);
      setActiveChildId(children[0] || null);
      setMenuOpen(true);
    },
    [childrenById]
  );

  const handleRootClick = useCallback(
    (rootId: string) => {
      const children = childrenById.get(rootId) || [];
      if (children.length === 0) {
        onSelect(rootId);
        closeMenu();
        return;
      }
      setActiveRootId(rootId);
      setActiveChildId(children[0] || null);
      setMenuOpen(true);
    },
    [childrenById, closeMenu, onSelect]
  );

  const handleSelect = useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
      closeMenu();
    },
    [closeMenu, onSelect]
  );

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

  const activeRoot = activeRootId ? nodesById.get(activeRootId) : null;
  const rootChildren = activeRootId
    ? (childrenById.get(activeRootId) || [])
        .map((id) => nodesById.get(id))
        .filter(Boolean) as Category[]
    : [];
  const leafNodes = activeChildId && activeRootId
    ? collectLeaves(activeChildId, nodesById, childrenById)
    : [];

  const showMenu = menuOpen && activeRoot && rootChildren.length > 0;

  return (
    <div className="relative" onMouseLeave={closeMenu}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => handleSelect('')}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all border ${
            !selectedCategoryId
              ? 'bg-primary-600 text-white border-primary-600 shadow'
              : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
          }`}
        >
          Tumu
        </button>
        {roots.map((root) => {
          const isSelected = selectedCategoryId === root.id;
          const isActive = activeRootId === root.id && showMenu;
          return (
            <button
              key={root.id}
              type="button"
              onMouseEnter={() => handleRootActivate(root.id)}
              onClick={() => handleRootClick(root.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all border ${
                isSelected || isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
              }`}
            >
              {root.name}
            </button>
          );
        })}
      </div>

      {showMenu && activeRoot && (
        <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-[320px] max-w-4xl rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-500">
            {activeRoot.name}
          </div>
          <div className="grid grid-cols-2 gap-4 p-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500">Alt Kategoriler</div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleSelect(activeRoot.id)}
                  className={`rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    selectedCategoryId === activeRoot.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  }`}
                >
                  Tum {activeRoot.name}
                </button>
                {rootChildren.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onMouseEnter={() => setActiveChildId(child.id)}
                    onClick={() => handleSelect(child.id)}
                    className={`rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      selectedCategoryId === child.id
                        ? 'bg-primary-600 text-white'
                        : activeChildId === child.id
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-l border-gray-100 pl-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">En Alt Kategoriler</div>
              {leafNodes.length === 0 ? (
                <div className="text-xs text-gray-400">Kategori bulunamadi.</div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                  {leafNodes.map((leaf) => (
                    <button
                      key={leaf.id}
                      type="button"
                      onClick={() => handleSelect(leaf.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border ${
                        selectedCategoryId === leaf.id
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      {leaf.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
