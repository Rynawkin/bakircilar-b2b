import type { Category } from '@/types';

export type CategoryTreeData = {
  roots: Category[];
  nodesById: Map<string, Category>;
  childrenById: Map<string, string[]>;
  parentById: Map<string, string | null>;
};

const DELIMITERS = ['.', '/', '-', '_', '|', '>'];

const resolveDelimiter = (codes: string[]) => {
  for (const delimiter of DELIMITERS) {
    if (codes.some((code) => code.includes(delimiter))) {
      return delimiter;
    }
  }
  return null;
};

const resolvePrefixParent = (code: string, codeSet: Set<string>) => {
  for (let end = code.length - 1; end > 0; end -= 1) {
    const prefix = code.slice(0, end);
    if (codeSet.has(prefix)) {
      return prefix;
    }
  }
  return null;
};

export const buildCategoryTree = (categories: Category[]): CategoryTreeData => {
  const nodesById = new Map<string, Category>();
  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string | null>();
  const codeToId = new Map<string, string>();

  categories.forEach((category) => {
    nodesById.set(category.id, category);
    childrenById.set(category.id, []);
    parentById.set(category.id, null);
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
      parentById.set(category.id, parentId);
    } else {
      roots.push(category);
    }
  });

  const sortByName = (a: string, b: string) => {
    const nameA = nodesById.get(a)?.name || '';
    const nameB = nodesById.get(b)?.name || '';
    return nameA.localeCompare(nameB, 'tr');
  };

  roots.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  Array.from(childrenById.entries()).forEach(([id, childIds]) => {
    childrenById.set(id, [...childIds].sort(sortByName));
  });

  return { roots, nodesById, childrenById, parentById };
};

export const getDescendantCategoryIds = (
  startId: string,
  categories: Category[],
  includeSelf = true
) => {
  const { nodesById, childrenById } = buildCategoryTree(categories);
  if (!nodesById.has(startId)) return [];

  const result: string[] = [];
  const walk = (id: string) => {
    if (includeSelf || id !== startId) {
      result.push(id);
    }
    const children = childrenById.get(id) || [];
    children.forEach(walk);
  };

  walk(startId);
  return result;
};

export const getCategoryPath = (categoryId: string, categories: Category[]) => {
  const { nodesById, parentById } = buildCategoryTree(categories);
  if (!nodesById.has(categoryId)) return [] as Category[];

  const path: Category[] = [];
  let currentId: string | null = categoryId;

  while (currentId) {
    const node = nodesById.get(currentId);
    if (node) {
      path.unshift(node);
    }
    currentId = parentById.get(currentId) || null;
  }

  return path;
};
