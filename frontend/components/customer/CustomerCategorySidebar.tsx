'use client';

import { useMemo, useState } from 'react';
import { Category } from '@/types';
import { buildCategoryTree, getCategoryPath } from '@/lib/utils/categoryTree';

interface CustomerCategorySidebarProps {
  categories: Category[];
  selectedCategoryId: string;
  onSelect: (categoryId: string) => void;
  className?: string;
}

export function CustomerCategorySidebar({
  categories,
  selectedCategoryId,
  onSelect,
  className = '',
}: CustomerCategorySidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const { roots: rootCategories, nodesById, childrenById } = categoryTree;
  const selectedCategoryPath = useMemo(
    () => (selectedCategoryId ? getCategoryPath(selectedCategoryId, categories) : []),
    [selectedCategoryId, categories]
  );

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className={className}>
      <div className="sticky top-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Kategoriler</h2>
        </div>
        <nav className="max-h-[calc(100vh-10rem)] overflow-y-auto py-2">
          <button
            onClick={() => onSelect('')}
            className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
              !selectedCategoryId
                ? 'border-r-2 border-primary-600 bg-primary-50 font-semibold text-primary-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              Tum Urunler
            </span>
          </button>

          {rootCategories.map((category) => {
            const childIds = childrenById.get(category.id) || [];
            const children = childIds.map((id) => nodesById.get(id)).filter(Boolean) as typeof rootCategories;
            const isExpanded = expandedCategories[category.id];
            const isSelected = selectedCategoryId === category.id;
            const hasChildSelected =
              selectedCategoryPath.length > 1 && selectedCategoryPath[0]?.id === category.id;

            return (
              <div key={category.id}>
                <div
                  className={`flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
                    isSelected
                      ? 'border-r-2 border-primary-600 bg-primary-50 font-semibold text-primary-700'
                      : hasChildSelected
                      ? 'font-medium text-primary-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() => {
                      onSelect(category.id);
                      if (children.length > 0) toggleCategory(category.id);
                    }}
                  >
                    {category.name}
                  </button>
                  {children.length > 0 && (
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="ml-1 flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        className={`h-3.5 w-3.5 transition-transform ${
                          isExpanded || hasChildSelected ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>

                {children.length > 0 && (isExpanded || hasChildSelected) && (
                  <div className="ml-4 border-l-2 border-gray-200 bg-gray-50">
                    {children.map((child) => {
                      const grandChildIds = childrenById.get(child.id) || [];
                      const grandChildren = grandChildIds
                        .map((id) => nodesById.get(id))
                        .filter(Boolean) as typeof rootCategories;
                      const isChildSelected = selectedCategoryId === child.id;
                      const hasGrandChildSelected =
                        selectedCategoryPath.length > 2 && selectedCategoryPath[1]?.id === child.id;
                      const isChildExpanded = expandedCategories[child.id];

                      return (
                        <div key={child.id}>
                          <div
                            className={`flex items-center justify-between transition-colors ${
                              isChildSelected
                                ? 'border-r-2 border-primary-600 bg-primary-50 font-semibold text-primary-700'
                                : hasGrandChildSelected
                                ? 'font-medium text-primary-600'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            <button
                              onClick={() => {
                                onSelect(child.id);
                                if (grandChildren.length > 0) toggleCategory(child.id);
                              }}
                              className="flex-1 px-3 py-2 text-left text-xs"
                            >
                              {child.name}
                            </button>
                            {grandChildren.length > 0 && (
                              <button
                                onClick={() => toggleCategory(child.id)}
                                className="flex-shrink-0 pr-2 text-gray-400 hover:text-gray-600"
                              >
                                <svg
                                  className={`h-3 w-3 transition-transform ${
                                    isChildExpanded || hasGrandChildSelected ? 'rotate-90' : ''
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {grandChildren.length > 0 && (isChildExpanded || hasGrandChildSelected) && (
                            <div className="ml-3 border-l-2 border-gray-200">
                              {grandChildren.map((leaf) => (
                                <button
                                  key={leaf.id}
                                  onClick={() => onSelect(leaf.id)}
                                  className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                                    selectedCategoryId === leaf.id
                                      ? 'border-r-2 border-primary-600 bg-primary-50 font-semibold text-primary-700'
                                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                  }`}
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
        </nav>
      </div>
    </aside>
  );
}
