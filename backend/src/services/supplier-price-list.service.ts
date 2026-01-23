import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '../utils/prisma';

const pdfParseModule = require('pdf-parse');
let pdfJsPromise: Promise<any> | null = null;

const loadPdfJs = async () => {
  if (pdfJsPromise) return pdfJsPromise;
  const dynamicImport = new Function('modulePath', 'return import(modulePath);') as (
    modulePath: string
  ) => Promise<any>;

  pdfJsPromise = (async () => {
    try {
      const module = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
      return module?.default ?? module;
    } catch (error) {
      try {
        const module = await dynamicImport('pdfjs-dist/build/pdf.mjs');
        return module?.default ?? module;
      } catch (innerError) {
        return null;
      }
    }
  })();

  return pdfJsPromise;
};

const parsePdfBuffer = async (buffer: Buffer) => {
  try {
    const textItems = await extractPdfTextItems(buffer);
    const rows = buildPdfRows(textItems);
    const text = rows.map((row) => row.items.map((item) => item.text).join(' ')).join('\n');
    return { text };
  } catch (error) {
    // fallback to pdf-parse only if pdfjs fails
  }

  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer);
  }

  const parserClass = pdfParseModule?.PDFParse ?? pdfParseModule?.default?.PDFParse;
  if (parserClass) {
    const parser = new parserClass({ data: buffer });
    try {
      return await parser.getText();
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  const fallback = pdfParseModule?.default;
  if (typeof fallback === 'function') {
    return fallback(buffer);
  }

  throw new Error('PDF parser not available');
};

const TURKISH_CHAR_MAP: Record<string, string> = {
  '\u00c7': 'c',
  '\u00e7': 'c',
  '\u011e': 'g',
  '\u011f': 'g',
  '\u0130': 'i',
  'I': 'i',
  '\u0131': 'i',
  '\u00d6': 'o',
  '\u00f6': 'o',
  '\u015e': 's',
  '\u015f': 's',
  '\u00dc': 'u',
  '\u00fc': 'u',
};

const normalizeText = (value: any) => {
  if (!value) return '';
  let output = '';
  for (const char of String(value)) {
    output += TURKISH_CHAR_MAP[char] ?? char;
  }
  return output
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const CODE_HEADERS = [
  'urun kodu',
  'urun kod',
  'stok kodu',
  'stok kod',
  'urun k',
  'kod',
];

const PRICE_HEADERS = [
  'tavsiye birim satis fiyati',
  'tavsiye adet satis fiyati',
  'birim satis fiyati',
  'birim fiyat',
  'liste fiyat',
  'net fiyat',
  'fiyat',
];

const NAME_HEADERS = [
  'urun adi',
  'urun ismi',
  'stok adi',
  'stok ismi',
];

const DEFAULT_VAT_RATE = 0.2;
const MAX_HEADER_SCAN = 40;
const MAX_TOKEN_LOOKAHEAD = 16;
const PDF_ROW_TOLERANCE = 2;
const PDF_COLUMN_TOLERANCE = 12;
const PDF_MIN_COLUMN_HITS = 3;
const PDF_MAX_PREVIEW_ROWS = 12;
const PDF_MAX_SAMPLE_ROWS = 20;
const PDF_MIN_COLUMN_ROWS = 3;
const PDF_MIN_COLUMN_RATIO = 0.2;
const PDF_NAME_ROW_MERGE_DISTANCE = 18;
const PDF_HEADER_TOKEN_GAP = 32;
const PDF_HEADER_LABELS = ["urun kodu", "stok kodu", "kod", "urun adi", "stok adi", "fiyat", "birim fiyat", "liste fiyat", "net fiyat", "kdv", "urun gorseli", "adet", "koli", "koli ici"];

type PdfTextItem = {
  text: string;
  x: number;
  y: number;
  page: number;
};

type PdfColumn = {
  index: number;
  x: number;
  count: number;
};

type PdfRow = {
  page: number;
  y: number;
  cells: string[];
};

const isMeaningfulPdfCell = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^[-\u2013\u2014]+$/.test(trimmed)) return false;
  if (/^[\u20ba$ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬]+$/.test(trimmed)) return false;
  if (/^[.,]+$/.test(trimmed)) return false;
  return /[A-Za-z0-9]/.test(trimmed);
};

const parseNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let str = String(value).trim();
  if (!str) return null;

  str = str.replace(/\s+/g, '');
  str = str.replace(/[^0-9,\.-]/g, '');
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(str)) {
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeHeader = (value: any) => normalizeText(String(value ?? '')).replace(/\s+/g, ' ').trim();

const normalizeCode = (value: string) =>
  normalizeText(value).replace(/\s+/g, '').toUpperCase();

const getDiscounts = (supplier: any) => [
  supplier.discount1,
  supplier.discount2,
  supplier.discount3,
  supplier.discount4,
  supplier.discount5,
]
  .map((value: any) => (typeof value === 'number' ? value : parseNumber(value)))
  .filter((value: number | null): value is number => Boolean(value && value > 0));

type SupplierDiscountRule = {
  keywords?: string[];
  discounts?: number[];
};

const normalizeDiscountValues = (values: any[]) =>
  values
    .map((value) => (typeof value === 'number' ? value : parseNumber(value)))
    .filter((value): value is number => Boolean(value && value > 0));

const normalizeMatchText = (value: any) => normalizeText(value).replace(/\s+/g, '');

const getSupplierDiscountRules = (supplier: any) => {
  if (!supplier?.discountRules || !Array.isArray(supplier.discountRules)) return [];
  return supplier.discountRules.filter((rule: any) => rule && typeof rule === 'object');
};

const resolveDiscountsForItem = (supplier: any, supplierName?: string | null) => {
  const defaultDiscounts = getDiscounts(supplier);
  if (!supplierName) return defaultDiscounts;

  const normalizedName = normalizeMatchText(supplierName);
  if (!normalizedName) return defaultDiscounts;

  const rules = getSupplierDiscountRules(supplier);
  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords) ? (rule.keywords as string[]) : [];
    const normalizedKeywords = keywords
      .map((keyword: string) => normalizeMatchText(keyword))
      .filter(Boolean);
    if (!normalizedKeywords.length) continue;

    const matches = normalizedKeywords.some((keyword) => normalizedName.includes(keyword));
    if (!matches) continue;

    const discounts = normalizeDiscountValues(Array.isArray(rule.discounts) ? rule.discounts : []);
    return discounts.length ? discounts : defaultDiscounts;
  }

  return defaultDiscounts;
};

const applyDiscounts = (price: number, discounts: number[]) =>
  discounts.reduce((acc, discount) => acc * (1 - discount / 100), price);

const findHeaderRowIndex = (rows: any[][]) => {
  const limit = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map(normalizeHeader).filter(Boolean);
    if (!normalized.length) continue;
    const hasCode = normalized.some((cell) => CODE_HEADERS.some((header) => cell.includes(header)));
    const hasPrice = normalized.some((cell) => PRICE_HEADERS.some((header) => cell.includes(header)));
    if (hasCode && hasPrice) return i;
  }
  return -1;
};

const resolveHeaderIndex = (
  headers: string[],
  preferredHeader?: string | null,
  candidates: string[] = []
) => {
  if (preferredHeader) {
    const normalizedPreferred = normalizeHeader(preferredHeader);
    const exactIndex = headers.findIndex((header) => header === normalizedPreferred);
    if (exactIndex >= 0) return exactIndex;
    const partialIndex = headers.findIndex((header) => header.includes(normalizedPreferred));
    if (partialIndex >= 0) return partialIndex;
  }

  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.includes(candidate));
    if (index >= 0) return index;
  }

  return -1;
};

const selectPriceValue = (values: number[], priceIndex?: number | null) => {
  if (!values.length) return null;
  if (priceIndex && priceIndex > 0 && priceIndex <= values.length) {
    return values[priceIndex - 1];
  }

  if (values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max >= 10 && min < 1) {
      return max;
    }
    if (min > 0 && max / min >= 20) {
      return max;
    }
  }

  return values[values.length - 1];
};

const UNIT_TOKENS = ['m3', 'm2', 'm', 'kg', 'gr', 'g', 'lt', 'l', 'ml', 'cm', 'mm'];

const normalizeUnitToken = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const isUnitToken = (value: string) => UNIT_TOKENS.includes(normalizeUnitToken(value));

const CURRENCY_REGEX = /\b(USD|EUR|TL|TRY)\b|[$\u20ac\u20ba]/i;

const hasUnitNear = (line: string, index: number, length: number) => {
  const after = line.slice(index + length);
  const afterToken = after.trimStart().split(/\s+/)[0] ?? '';
  if (afterToken && isUnitToken(afterToken)) return true;

  const before = line.slice(0, index);
  const beforeToken = before.trimEnd().split(/\s+/).pop() ?? '';
  if (beforeToken && isUnitToken(beforeToken)) return true;

  return false;
};

const hasCurrencyNear = (line: string, index: number, length: number) => {
  const left = line.slice(Math.max(0, index - 6), index);
  const right = line.slice(index + length, index + length + 6);
  return CURRENCY_REGEX.test(`${left}${right}`);
};

const PRICE_REGEX = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g;

const extractPrices = (line: string): number[] => {
  const matches = Array.from(line.matchAll(PRICE_REGEX));
  const candidates = matches
    .map((match) => {
      const value = parseNumber(match[0]);
      if (value === null || !Number.isFinite(value)) return null;
      const index = typeof match.index === 'number' ? match.index : line.indexOf(match[0]);
      const hasUnit = index >= 0 ? hasUnitNear(line, index, match[0].length) : false;
      const hasCurrency = index >= 0 ? hasCurrencyNear(line, index, match[0].length) : false;
      return { value, hasUnit, hasCurrency };
    })
    .filter((item): item is { value: number; hasUnit: boolean; hasCurrency: boolean } => Boolean(item));

  if (!candidates.length) return [];

  const withCurrency = candidates.filter((item) => item.hasCurrency);
  const withoutUnit = candidates.filter((item) => !item.hasUnit);
  const preferred = withCurrency.length ? withCurrency : withoutUnit.length ? withoutUnit : candidates;

  return preferred.map((item) => item.value);
};

const extractPdfTextItems = async (buffer: Buffer, maxPages?: number) => {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    throw new Error('PDFJS not available');
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const pdf = await loadingTask.promise;
  const pdfPages = typeof pdf.numPages === 'number' ? pdf.numPages : 0;
  const limitPages = maxPages ?? pdfPages;
  const totalPages = Math.min(pdfPages, limitPages);
  const items: PdfTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    for (const item of textContent.items as any[]) {
      const text = String(item?.str || '').trim();
      if (!text) continue;
      const transform = item?.transform || [];
      const x = typeof transform[4] === 'number' ? transform[4] : 0;
      const y = typeof transform[5] === 'number' ? transform[5] : 0;
      items.push({ text, x, y, page: pageNumber });
    }
  }

  return items;
};

const buildPdfRows = (items: PdfTextItem[]) => {
  const sorted = items.slice().sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.y !== b.y) return b.y - a.y;
    return a.x - b.x;
  });

  const rows: Array<{ page: number; y: number; items: PdfTextItem[] }> = [];
  let current: { page: number; y: number; items: PdfTextItem[] } | null = null;

  for (const item of sorted) {
    if (
      !current ||
      current.page !== item.page ||
      Math.abs(item.y - current.y) > PDF_ROW_TOLERANCE
    ) {
      current = { page: item.page, y: item.y, items: [] };
      rows.push(current);
    }
    current.items.push(item);
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  return rows;
};

const buildPdfColumns = (rows: Array<{ items: PdfTextItem[] }>) => {
  const xs = rows.flatMap((row) => row.items.map((item) => item.x)).sort((a, b) => a - b);
  const clusters: Array<{ x: number; count: number }> = [];

  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(x - last.x) > PDF_COLUMN_TOLERANCE) {
      clusters.push({ x, count: 1 });
    } else {
      last.x = (last.x * last.count + x) / (last.count + 1);
      last.count += 1;
    }
  }

  let filtered = clusters.filter((cluster) => cluster.count >= PDF_MIN_COLUMN_HITS);
  if (filtered.length < 2) {
    filtered = clusters;
  }

  return filtered
    .sort((a, b) => a.x - b.x)
    .map((cluster, index) => ({
      index,
      x: cluster.x,
      count: cluster.count,
    }));
};

const filterPdfColumns = (columns: PdfColumn[], rows: PdfRow[]) => {
  if (!columns.length || !rows.length) return { columns, rows };
  const counts = columns.map(() => 0);

  for (const row of rows) {
    row.cells.forEach((cell, index) => {
      if (isMeaningfulPdfCell(cell)) {
        counts[index] += 1;
      }
    });
  }

  const minRows = Math.max(PDF_MIN_COLUMN_ROWS, Math.ceil(rows.length * PDF_MIN_COLUMN_RATIO));
  let keepIndices = counts
    .map((count, index) => ({ count, index }))
    .filter((entry) => entry.count >= minRows)
    .map((entry) => entry.index)
    .sort((a, b) => a - b);

  if (keepIndices.length < 2) {
    keepIndices = counts
      .map((count, index) => ({ count, index }))
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.min(columns.length, 6))
      .map((entry) => entry.index)
      .sort((a, b) => a - b);
  }

  if (keepIndices.length === columns.length) {
    return { columns, rows };
  }

  const remappedColumns = keepIndices.map((oldIndex, newIndex) => ({
    ...columns[oldIndex],
    index: newIndex,
  }));

  const remappedRows = rows.map((row) => ({
    ...row,
    cells: keepIndices.map((oldIndex) => row.cells[oldIndex] || ''),
  }));

  return { columns: remappedColumns, rows: remappedRows };
};

const rowItemsHavePrice = (row: { items: PdfTextItem[] }) => {
  const line = row.items.map((item) => item.text).join(' ').trim();
  if (!line) return false;
  const compact = line.replace(/\s+/g, '');
  return extractPrices(compact).length > 0;
};

const isPdfHeaderRowLine = (line: string) => {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  return normalized.includes('urun') && normalized.includes('kod') && (normalized.includes('fiyat') || normalized.includes('net'));
};

const isPdfHeaderLabel = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return PDF_HEADER_LABELS.some((label) => normalized === label || normalized.includes(label));
};

const buildPdfHeaderColumns = (items: PdfTextItem[]) => {
  const sorted = items.slice().sort((a, b) => a.x - b.x);
  const clusters: Array<{ xStart: number; xEnd: number; text: string; count: number }> = [];

  for (const item of sorted) {
    const text = String(item.text || '').trim();
    if (!text) continue;
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push({ xStart: item.x, xEnd: item.x, text, count: 1 });
      continue;
    }

    const gap = item.x - last.xEnd;
    const combinedText = `${last.text} ${text}`.trim();
    if (gap <= PDF_HEADER_TOKEN_GAP || isPdfHeaderLabel(combinedText)) {
      last.text = combinedText;
      last.xEnd = item.x;
      last.count += 1;
    } else {
      clusters.push({ xStart: item.x, xEnd: item.x, text, count: 1 });
    }
  }

  return clusters.map((cluster, index) => ({
    index,
    x: (cluster.xStart + cluster.xEnd) / 2,
    count: cluster.count,
  }));
};

const getPdfHeaderColumns = (rows: Array<{ items: PdfTextItem[] }>) => {
  const headerRow = rows.find((row) => isPdfHeaderRowLine(row.items.map((item) => item.text).join(' ')));
  if (!headerRow) return null;
  const columns = buildPdfHeaderColumns(headerRow.items);
  return columns.length >= 2 ? columns : null;
};

const findNearestPdfColumnIndex = (x: number, columns: PdfColumn[]) => {
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const column of columns) {
    const distance = Math.abs(x - column.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = column.index;
    }
  }

  if (bestIndex === null) return null;
  return bestDistance <= PDF_COLUMN_TOLERANCE * 1.5 ? bestIndex : null;
};

const buildPdfTable = async (filePath: string, options?: { maxPages?: number }) => {
  const buffer = await fs.promises.readFile(filePath);
  const textItems = await extractPdfTextItems(buffer, options?.maxPages);
  const rowsWithItems = buildPdfRows(textItems);
  const headerColumns = getPdfHeaderColumns(rowsWithItems);
  const columnRows = rowsWithItems.filter(rowItemsHavePrice);
  const columns = headerColumns && headerColumns.length >= 2
    ? headerColumns
    : buildPdfColumns(columnRows.length ? columnRows : rowsWithItems);

  const rows: PdfRow[] = rowsWithItems
    .map((row) => {
      const cells = Array(columns.length).fill('');
      for (const item of row.items) {
        const columnIndex = findNearestPdfColumnIndex(item.x, columns);
        if (columnIndex === null) continue;
        cells[columnIndex] = cells[columnIndex]
          ? `${cells[columnIndex]} ${item.text}`
          : item.text;
      }
      return {
        page: row.page,
        y: row.y,
        cells: cells.map((cell) => cell.trim()),
      };
    })
    .filter((row) => row.cells.some((cell) => Boolean(cell)));
  return filterPdfColumns(columns, rows);
};

const defaultCodeToken = (token: string) => {
  const cleaned = token.replace(/[^A-Za-z0-9\-\/]/g, '');
  if (!cleaned) return null;
  if (!/[0-9]/.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) {
    return null;
  }
  return /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/.test(cleaned) ? cleaned : null;
};

const extractCodeFromLine = (line: string, codePattern?: string | null) => {
  if (codePattern) {
    try {
      const regex = new RegExp(codePattern);
      const match = line.match(regex);
      if (match?.[0]) return match[0];
    } catch (error) {
      // ignore invalid regex
    }
  }

  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const firstToken = defaultCodeToken(tokens[0]);
  if (firstToken) return firstToken;

  for (const token of tokens) {
    const code = defaultCodeToken(token);
    if (code) return code;
  }

  const spacedMatch = line.match(/([A-Za-z]{2,})\s*[-/ ]\s*(\d{2,})/);
  if (spacedMatch) {
    return `${spacedMatch[1]}${spacedMatch[2]}`;
  }

  return null;
};

const extractCodeFromCell = (cell: string | null | undefined, codePattern?: string | null) => {
  if (!cell) return null;
  return extractCodeFromLine(String(cell), codePattern);
};

const extractPriceFromCell = (cell: string | null | undefined) => {
  if (!cell) return null;
  const text = String(cell);
  if (/%/.test(text)) return null;
  const compact = text.replace(/\s+/g, '');
  const prices = extractPrices(compact);
  if (prices.length) {
    return selectPriceValue(prices);
  }
  return parseNumber(compact);
};

const getPdfRowLine = (row: PdfRow) => row.cells.filter(Boolean).join(' ').trim();

const pdfRowHasPrice = (row: PdfRow) => {
  if (row.cells.some((cell) => extractPriceFromCell(cell) !== null)) return true;
  const line = getPdfRowLine(row);
  if (!line) return false;
  return extractPrices(line.replace(/\s+/g, '')).length > 0;
};

const pdfRowHasText = (row: PdfRow) =>
  row.cells.some((cell) => /[A-Za-z]/.test(String(cell || '')));

const isPdfMetaLine = (line: string) => {
  if (!line) return true;
  if (isHeaderLine(line)) return true;
  const normalized = normalizeText(line);
  if (!normalized) return true;
  if (normalized.startsWith('tarih')) return true;
  if (normalized.includes('fiyat listesi')) return true;
  if (normalized.includes('urun gorseli')) return true;
  if (normalized.includes('koli') && normalized.includes('adet')) return true;
  if (normalized === 'adet' || normalized === 'koli ici') return true;
  return false;
};

const mergePdfNameRows = (rows: PdfRow[]) => {
  const merged: PdfRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const next = rows[index + 1];
    if (
      next &&
      row.page === next.page &&
      Math.abs(row.y - next.y) <= PDF_NAME_ROW_MERGE_DISTANCE
    ) {
      const rowLine = getPdfRowLine(row);
      const nextLine = getPdfRowLine(next);
      const shouldMerge =
        rowLine &&
        nextLine &&
        !isPdfMetaLine(rowLine) &&
        !isPdfMetaLine(nextLine) &&
        !pdfRowHasPrice(row) &&
        pdfRowHasPrice(next) &&
        pdfRowHasText(row);
      if (shouldMerge) {
        const combinedCells = next.cells.map((cell, cellIndex) => cell || row.cells[cellIndex] || '');
        merged.push({ ...next, cells: combinedCells });
        index += 1;
        continue;
      }
    }
    merged.push(row);
  }
  return merged;
};

const filterPdfRowsForDetection = (rows: PdfRow[]) => {
  const filtered = rows.filter((row) => {
    const line = getPdfRowLine(row);
    if (!line || isPdfMetaLine(line)) return false;
    return pdfRowHasPrice(row);
  });

  if (filtered.length >= PDF_MIN_COLUMN_ROWS) return filtered;

  const fallback = rows.filter((row) => {
    const line = getPdfRowLine(row);
    if (!line || isPdfMetaLine(line)) return false;
    return row.cells.some((cell) => isMeaningfulPdfCell(cell));
  });

  if (fallback.length) return fallback;
  return rows;
};
const detectPdfColumnRoles = (rows: PdfRow[], columnCount: number, codePattern?: string | null) => {
  if (!rows.length || columnCount <= 0) {
    return { codeIndex: null, nameIndex: null, priceIndex: null };
  }

  const stats = Array.from({ length: columnCount }, () => ({
    filled: 0,
    numeric: 0,
    code: 0,
    text: 0,
  }));

  const sampleRows = rows.slice(0, PDF_MAX_SAMPLE_ROWS);
  for (const row of sampleRows) {
    row.cells.forEach((cell, index) => {
      if (!cell) return;
      const trimmed = String(cell).trim();
      if (!trimmed || !isMeaningfulPdfCell(trimmed)) return;
      stats[index].filled += 1;

      const numericValue = extractPriceFromCell(trimmed);
      if (numericValue !== null) {
        stats[index].numeric += 1;
      }

      if (extractCodeFromCell(trimmed, codePattern)) {
        stats[index].code += 1;
      }

      if (/[A-Za-z]/.test(trimmed)) {
        stats[index].text += 1;
      }
    });
  }

  const pickIndex = (key: 'numeric' | 'code' | 'text', minCount: number, minRatio: number) => {
    let bestIndex: number | null = null;
    let bestRatio = minRatio;

    stats.forEach((stat, index) => {
      if (!stat.filled || stat[key] < minCount) return;
      const ratio = stat[key] / stat.filled;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  const priceIndex = pickIndex('numeric', 2, 0.5);
  const codeIndex = pickIndex('code', 2, 0.4);

  let nameIndex: number | null = null;
  stats.forEach((stat, index) => {
    if (index === priceIndex || index === codeIndex) return;
    if (!stat.filled || stat.text < 2) return;
    const ratio = stat.text / stat.filled;
    if (ratio < 0.5) return;
    if (nameIndex === null || ratio > stats[nameIndex].text / stats[nameIndex].filled) {
      nameIndex = index;
    }
  });

  return { codeIndex, nameIndex, priceIndex };
};

const extractCodesWithPositions = (line: string, codePattern?: string | null) => {
  const results: Array<{ code: string; index: number }> = [];

  const normalizeResults = (entries: Array<{ code: string; index: number }>) => {
    const seen = new Set<string>();
    const deduped = entries.filter((entry) => {
      const key = `${entry.code}|${entry.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.sort((a, b) => a.index - b.index);
  };

  if (codePattern) {
    try {
      const regex = new RegExp(codePattern, 'g');
      for (const match of line.matchAll(regex)) {
        if (!match[0]) continue;
        const index = typeof match.index === 'number' ? match.index : line.indexOf(match[0]);
        results.push({ code: match[0], index: index >= 0 ? index : 0 });
      }
      if (results.length) {
        return normalizeResults(results);
      }
    } catch (error) {
      // ignore invalid regex
    }
  }

  for (const match of line.matchAll(/[A-Za-z0-9][A-Za-z0-9\-\/]*/g)) {
    const token = match[0];
    const code = defaultCodeToken(token);
    if (!code) continue;
    const index = typeof match.index === 'number' ? match.index : line.indexOf(token);
    results.push({ code, index: index >= 0 ? index : 0 });
  }

  return normalizeResults(results);
};

const isHeaderLine = (line: string) => {
  const normalized = normalizeText(line);
  if (!normalized) return true;
  return (
    normalized.includes('urun') &&
    normalized.includes('kod') &&
    (normalized.includes('fiyat') || normalized.includes('net'))
  );
};

const detectPdfColumnRolesFromHeader = (rows: PdfRow[]) => {
  const headerRow = rows.find((row) => isHeaderLine(getPdfRowLine(row)));
  if (!headerRow) return null;
  const mapping = { codeIndex: null as number | null, nameIndex: null as number | null, priceIndex: null as number | null };

  headerRow.cells.forEach((cell, index) => {
    const normalized = normalizeText(cell);
    if (!normalized) return;
    if (mapping.codeIndex === null && (normalized.includes('kod') || normalized.includes('stok'))) {
      mapping.codeIndex = index;
      return;
    }
    if (mapping.nameIndex === null && normalized.includes('adi')) {
      mapping.nameIndex = index;
      return;
    }
    if (mapping.priceIndex === null && (normalized.includes('fiyat') || normalized.includes('net'))) {
      mapping.priceIndex = index;
    }
  });

  if (mapping.codeIndex === null && mapping.nameIndex === null && mapping.priceIndex === null) return null;
  return mapping;
};

const extractCurrency = (line: string) => {
  if (/\b(USD|\$)\b/i.test(line)) return 'USD';
  if (/\b(EUR|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬)\b/i.test(line)) return 'EUR';
  if (/\b(TL|TRY|\u20BA)\b/i.test(line)) return 'TRY';
  return null;
};

type PdfColumnRole = 'code' | 'name' | 'price' | 'ignore';

const normalizePdfColumnRoles = (roles: any, columnCount: number) => {
  if (!roles || typeof roles !== 'object') return null;
  const mapping = { codeIndex: null as number | null, nameIndex: null as number | null, priceIndex: null as number | null };

  for (const [key, value] of Object.entries(roles)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= columnCount) continue;
    if (value === 'code' && mapping.codeIndex === null) mapping.codeIndex = index;
    if (value === 'name' && mapping.nameIndex === null) mapping.nameIndex = index;
    if (value === 'price' && mapping.priceIndex === null) mapping.priceIndex = index;
  }

  return mapping;
};

const resolvePdfColumnMapping = (
  rows: PdfRow[],
  columnCount: number,
  supplier: any
) => {
  const detectionRows = filterPdfRowsForDetection(rows);
  const headerDetected = detectPdfColumnRolesFromHeader(rows);
  const detected = headerDetected ?? detectPdfColumnRoles(detectionRows, columnCount, supplier.pdfCodePattern);
  const preferred = normalizePdfColumnRoles(supplier.pdfColumnRoles, columnCount);

  return {
    codeIndex: preferred?.codeIndex ?? detected.codeIndex,
    nameIndex: preferred?.nameIndex ?? detected.nameIndex,
    priceIndex: preferred?.priceIndex ?? detected.priceIndex,
  };
};

const parsePdfRowsWithMapping = (
  rows: PdfRow[],
  mapping: { codeIndex: number | null; nameIndex: number | null; priceIndex: number | null },
  supplier: any
) => {
  const items: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; rawLine?: string; currency?: string | null }> = [];
  const mergedRows = mergePdfNameRows(rows);
  let pendingName: string | null = null;

  const buildNameCandidate = (row: PdfRow) => {
    if (mapping.nameIndex !== null) {
      const nameCell = row.cells[mapping.nameIndex];
      if (nameCell) return String(nameCell).trim();
    }
    return row.cells
      .filter((_, index) => index !== mapping.codeIndex && index !== mapping.priceIndex)
      .filter((cell) => isMeaningfulPdfCell(cell))
      .join(' ')
      .trim();
  };

  for (const row of mergedRows) {
    const rawLine = getPdfRowLine(row);
    if (!rawLine || isPdfMetaLine(rawLine)) continue;

    const codeCell = mapping.codeIndex !== null ? row.cells[mapping.codeIndex] : null;
    let code = extractCodeFromCell(codeCell, supplier.pdfCodePattern);
    if (!code && codeCell) {
      const trimmedCode = String(codeCell).trim();
      if (trimmedCode) {
        code = trimmedCode;
      }
    }
    if (!code) {
      for (let index = 0; index < row.cells.length; index += 1) {
        if (index === mapping.priceIndex) continue;
        const candidate = extractCodeFromCell(row.cells[index], supplier.pdfCodePattern);
        if (candidate) {
          code = candidate;
          break;
        }
      }
    }
    const rowHasPrice = pdfRowHasPrice(row);
    if (!code && !rowHasPrice) {
      const candidateName = buildNameCandidate(row);
      if (candidateName) {
        pendingName = candidateName;
      }
      continue;
    }
    if (!code) continue;

    const priceCell = mapping.priceIndex !== null ? row.cells[mapping.priceIndex] : null;
    const sourcePrice = extractPriceFromCell(priceCell);

    let supplierName = buildNameCandidate(row);
    if (!supplierName && pendingName) {
      supplierName = pendingName;
    }
    if (pendingName) {
      pendingName = null;
    }

    items.push({
      supplierCode: code,
      supplierName: supplierName || undefined,
      sourcePrice: sourcePrice ?? null,
      rawLine: rawLine || undefined,
      currency: rawLine ? extractCurrency(rawLine) : null,
    });
  }

  return items;
};

const parsePdfTokens = (text: string, priceIndex?: number | null) => {
  const tokens = text.split(/\s+/).filter(Boolean);
  const items: Array<{ supplierCode: string; sourcePrice: number; rawLine?: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!/^[A-Za-z]{2,}\d{2,}[A-Za-z0-9-\/]*$/.test(token)) continue;

    let price: number | null = null;
    const prices: number[] = [];
    for (let j = i + 1; j < Math.min(tokens.length, i + MAX_TOKEN_LOOKAHEAD); j += 1) {
      const tokenValue = tokens[j];
      if (!/\d+[,.]\d{2}$/.test(tokenValue)) continue;
      const nextToken = tokens[j + 1] || '';
      if (nextToken && isUnitToken(nextToken)) continue;
      const possible = parseNumber(tokenValue);
      if (possible !== null) {
        prices.push(possible);
      }
    }

    price = selectPriceValue(prices, priceIndex);
    if (price === null) continue;

    const key = `${token}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ supplierCode: token, sourcePrice: price });
  }

  return items;
};

const parsePdfFileLegacy = async (filePath: string, supplier: any) => {
  const buffer = await fs.promises.readFile(filePath);
  const result = await parsePdfBuffer(buffer);
  const text = result?.text || '';
  const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  const items: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; rawLine?: string; currency?: string | null }> = [];
  const seen = new Set<string>();
  const parsedCodes = new Set<string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isHeaderLine(line)) continue;

    const codes = extractCodesWithPositions(line, supplier.pdfCodePattern);
    if (!codes.length) continue;

    for (let codeIndex = 0; codeIndex < codes.length; codeIndex += 1) {
      const codeEntry = codes[codeIndex];
      const nextIndex = codes[codeIndex + 1]?.index ?? line.length;
      let segment = line.slice(codeEntry.index, nextIndex).trim();
      if (!segment) {
        segment = line;
      }

      let prices = extractPrices(segment);
      if (!prices.length) {
        const nextLine = lines[lineIndex + 1];
        if (nextLine) {
          const nextCodes = extractCodesWithPositions(nextLine, supplier.pdfCodePattern);
          if (!nextCodes.length) {
            const combined = `${segment} ${nextLine}`.trim();
            const combinedPrices = extractPrices(combined);
            if (combinedPrices.length) {
              segment = combined;
              prices = combinedPrices;
            }
          }
        }
      }

      if (!prices.length) continue;

      const price = selectPriceValue(prices, supplier.pdfPriceIndex);
      if (price === null) continue;

      const key = `${codeEntry.code}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const supplierName = segment.replace(codeEntry.code, '').replace(PRICE_REGEX, '').trim();
      items.push({
        supplierCode: codeEntry.code,
        supplierName: supplierName || undefined,
        sourcePrice: price,
        rawLine: segment,
        currency: extractCurrency(segment),
      });

      const normalized = normalizeCode(codeEntry.code);
      if (normalized) parsedCodes.add(normalized);
    }
  }

  const tokenItems = parsePdfTokens(text, supplier.pdfPriceIndex);
  for (const item of tokenItems) {
    const normalized = normalizeCode(item.supplierCode);
    if (normalized && parsedCodes.has(normalized)) continue;
    const key = `${item.supplierCode}|${item.sourcePrice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      supplierCode: item.supplierCode,
      sourcePrice: item.sourcePrice,
    });
  }

  return items;
};

const parsePdfFile = async (filePath: string, supplier: any) => {
  try {
    const { columns, rows } = await buildPdfTable(filePath);
    if (columns.length && rows.length) {
      const mapping = resolvePdfColumnMapping(rows, columns.length, supplier);
      if (mapping.codeIndex !== null && mapping.priceIndex !== null) {
        const items = parsePdfRowsWithMapping(rows, mapping, supplier);
        if (items.length) {
          return items;
        }
      }
    }
  } catch (error) {
    // fallback to legacy parser
  }

  return parsePdfFileLegacy(filePath, supplier);
};

const parseExcelFile = (filePath: string, supplier: any) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = supplier.excelSheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Excel sheet not found: ${sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
  if (!rows.length) return [];

  const headerRowIndex = supplier.excelHeaderRow ? Math.max(0, supplier.excelHeaderRow - 1) : findHeaderRowIndex(rows);
  if (headerRowIndex < 0) return [];

  const rawHeaderRow = (rows[headerRowIndex] || []).map((value) => String(value ?? '').trim());
  const normalizedHeaderRow = rawHeaderRow.map(normalizeHeader);

  const codeIndex = resolveHeaderIndex(normalizedHeaderRow, supplier.excelCodeHeader, CODE_HEADERS);
  const priceIndex = resolveHeaderIndex(normalizedHeaderRow, supplier.excelPriceHeader, PRICE_HEADERS);
  const nameIndex = resolveHeaderIndex(normalizedHeaderRow, supplier.excelNameHeader, NAME_HEADERS);

  if (codeIndex < 0 || priceIndex < 0) return [];

  const items: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; rawLine?: string }> = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rawCode = row[codeIndex];
    const rawPrice = row[priceIndex];
    const rawName = nameIndex >= 0 ? row[nameIndex] : null;

    if (rawCode === null || rawCode === undefined || rawCode === '') continue;

    const supplierCode = String(rawCode).trim();
    if (!supplierCode) continue;

    const sourcePrice = parseNumber(rawPrice);
    if (sourcePrice === null) continue;

    items.push({
      supplierCode,
      supplierName: rawName ? String(rawName).trim() : undefined,
      sourcePrice,
    });
  }

  return items;
};

const buildProductMap = async () => {
  const products = await prisma.product.findMany({
    where: { foreignName: { not: null } },
    select: {
      id: true,
      mikroCode: true,
      name: true,
      foreignName: true,
      currentCost: true,
      vatRate: true,
    },
  });

  const map = new Map<string, typeof products>();
  for (const product of products) {
    const key = normalizeCode(product.foreignName || '');
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(product);
  }

  return map;
};

const computeItemNetPrice = (sourcePrice: number | null, supplier: any, supplierName?: string | null) => {
  if (!sourcePrice && sourcePrice !== 0) return null;
  let price = sourcePrice;
  if (supplier.priceIncludesVat) {
    const vatRate = supplier.defaultVatRate ?? DEFAULT_VAT_RATE;
    if (vatRate > 0) {
      price = price / (1 + vatRate);
    }
  }
  if (!supplier.priceIsNet) {
    price = applyDiscounts(price, resolveDiscountsForItem(supplier, supplierName));
  }
  return Number(price.toFixed(4));
};

const computeMatchNetPrice = (sourcePrice: number | null, supplier: any, vatRate?: number | null, supplierName?: string | null) => {
  if (!sourcePrice && sourcePrice !== 0) return null;
  let price = sourcePrice;
  if (supplier.priceIncludesVat) {
    const resolvedVat = vatRate ?? supplier.defaultVatRate ?? DEFAULT_VAT_RATE;
    if (resolvedVat > 0) {
      price = price / (1 + resolvedVat);
    }
  }
  if (!supplier.priceIsNet) {
    price = applyDiscounts(price, resolveDiscountsForItem(supplier, supplierName));
  }
  return Number(price.toFixed(4));
};

type ParsedItem = {
  supplierCode: string;
  supplierName?: string;
  sourcePrice?: number | null;
  rawLine?: string;
  currency?: string | null;
};

const selectBestItemForCode = (items: ParsedItem[]) => {
  if (!items.length) return null;

  const withPrice = items.filter((item) => typeof item.sourcePrice === 'number') as Array<
    ParsedItem & { sourcePrice: number }
  >;
  const fallback = items[0];

  if (!withPrice.length) return fallback;

  let candidates = withPrice;
  let prices = candidates.map((item) => item.sourcePrice);
  let min = Math.min(...prices);
  let max = Math.max(...prices);

  if (max >= 10) {
    const filtered = candidates.filter((item) => item.sourcePrice >= 1);
    if (filtered.length) {
      candidates = filtered;
      prices = candidates.map((item) => item.sourcePrice);
      min = Math.min(...prices);
      max = Math.max(...prices);
    }
  }

  if (candidates.length > 1 && min > 0 && max / min >= 20) {
    candidates = candidates.filter((item) => item.sourcePrice === max);
  }

  const sorted = candidates.slice().sort((a, b) => {
    const priceDiff = b.sourcePrice - a.sourcePrice;
    if (priceDiff !== 0) return priceDiff;
    const currencyDiff = Number(Boolean(b.currency)) - Number(Boolean(a.currency));
    if (currencyDiff !== 0) return currencyDiff;
    const rawDiff = Number(Boolean(b.rawLine)) - Number(Boolean(a.rawLine));
    if (rawDiff !== 0) return rawDiff;
    const nameDiff = Number(Boolean(b.supplierName)) - Number(Boolean(a.supplierName));
    if (nameDiff !== 0) return nameDiff;
    return 0;
  });

  const chosen = sorted[0] || fallback;
  return {
    ...chosen,
    supplierName: chosen.supplierName || items.find((item) => item.supplierName)?.supplierName,
    rawLine: chosen.rawLine || items.find((item) => item.rawLine)?.rawLine,
    currency: chosen.currency || items.find((item) => item.currency)?.currency,
  } as ParsedItem;
};

const consolidateParsedItems = (items: ParsedItem[]) => {
  const grouped = new Map<string, ParsedItem[]>();
  const ungrouped: ParsedItem[] = [];

  for (const item of items) {
    const key = normalizeCode(item.supplierCode || '');
    if (!key) {
      ungrouped.push(item);
      continue;
    }
    const bucket = grouped.get(key) || [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  const consolidated: ParsedItem[] = [];
  for (const bucket of grouped.values()) {
    const best = selectBestItemForCode(bucket);
    if (best) consolidated.push(best);
  }

  return consolidated.concat(ungrouped);
};
type SupplierConfigOverrides = {
  excelSheetName?: string | null;
  excelHeaderRow?: number | null;
  excelCodeHeader?: string | null;
  excelNameHeader?: string | null;
  excelPriceHeader?: string | null;
  pdfPriceIndex?: number | null;
  pdfCodePattern?: string | null;
  pdfColumnRoles?: Record<string, string> | null;
};

const resolveSupplierConfig = (supplier: any, overrides?: SupplierConfigOverrides | null) => {
  if (!overrides) return supplier;
  return {
    ...supplier,
    excelSheetName: overrides.excelSheetName ?? supplier.excelSheetName,
    excelHeaderRow: overrides.excelHeaderRow ?? supplier.excelHeaderRow,
    excelCodeHeader: overrides.excelCodeHeader ?? supplier.excelCodeHeader,
    excelNameHeader: overrides.excelNameHeader ?? supplier.excelNameHeader,
    excelPriceHeader: overrides.excelPriceHeader ?? supplier.excelPriceHeader,
    pdfPriceIndex: overrides.pdfPriceIndex ?? supplier.pdfPriceIndex,
    pdfCodePattern: overrides.pdfCodePattern ?? supplier.pdfCodePattern,
    pdfColumnRoles: overrides.pdfColumnRoles ?? supplier.pdfColumnRoles,
  };
};

const buildExcelPreview = (filePath: string, supplier: any) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetNames = workbook.SheetNames;
  const sheetName = supplier.excelSheetName || sheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Excel sheet not found: ${sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
  if (!rows.length) {
    return {
      sheetNames,
      sheetName,
      headerRow: null,
      headers: [],
      detected: { code: null, name: null, price: null },
      samples: [],
    };
  }

  const headerRowIndex = supplier.excelHeaderRow ? Math.max(0, supplier.excelHeaderRow - 1) : findHeaderRowIndex(rows);
  const rawHeaderRow = headerRowIndex >= 0 ? (rows[headerRowIndex] || []).map((value) => String(value ?? '').trim()) : [];
  const normalizedHeaderRow = rawHeaderRow.map(normalizeHeader);

  const codeIndex = headerRowIndex >= 0 ? resolveHeaderIndex(normalizedHeaderRow, supplier.excelCodeHeader, CODE_HEADERS) : -1;
  const priceIndex = headerRowIndex >= 0 ? resolveHeaderIndex(normalizedHeaderRow, supplier.excelPriceHeader, PRICE_HEADERS) : -1;
  const nameIndex = headerRowIndex >= 0 ? resolveHeaderIndex(normalizedHeaderRow, supplier.excelNameHeader, NAME_HEADERS) : -1;

  const samples: Array<{ code?: string | null; name?: string | null; price?: number | null }> = [];
  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < Math.min(rows.length, headerRowIndex + 6); i += 1) {
      const row = rows[i] || [];
      samples.push({
        code: codeIndex >= 0 ? row[codeIndex] : null,
        name: nameIndex >= 0 ? row[nameIndex] : null,
        price: priceIndex >= 0 ? parseNumber(row[priceIndex]) : null,
      });
    }
  }

  return {
    sheetNames,
    sheetName,
    headerRow: headerRowIndex >= 0 ? headerRowIndex + 1 : null,
    headers: rawHeaderRow,
    normalizedHeaders: normalizedHeaderRow,
    detected: {
      code: codeIndex >= 0 ? rawHeaderRow[codeIndex] : null,
      name: nameIndex >= 0 ? rawHeaderRow[nameIndex] : null,
      price: priceIndex >= 0 ? rawHeaderRow[priceIndex] : null,
    },
    samples,
  };
};

const buildPdfPreview = async (filePath: string, supplier: any) => {
  const { columns, rows } = await buildPdfTable(filePath, { maxPages: 2 });
  const detectionRows = filterPdfRowsForDetection(rows);
  const headerDetected = detectPdfColumnRolesFromHeader(rows);
  const detected = headerDetected ?? detectPdfColumnRoles(detectionRows, columns.length, supplier.pdfCodePattern);

  const previewRows = mergePdfNameRows(rows)
    .filter((row) => {
      const line = getPdfRowLine(row);
      if (!line || isPdfMetaLine(line)) return false;
      return row.cells.some((cell) => isMeaningfulPdfCell(cell));
    })
    .slice(0, PDF_MAX_PREVIEW_ROWS)
    .map((row) => ({
      cells: row.cells,
    }));

  const previewColumns = columns.map((column) => {
    const samples = rows
      .map((row) => row.cells[column.index])
      .filter((value) => Boolean(value))
      .slice(0, 3);
    return {
      index: column.index,
      samples,
    };
  });

  return {
    columns: previewColumns,
    rows: previewRows,
    detected,
    codePattern: supplier.pdfCodePattern ?? null,
  };
};
const computePercentDifference = (currentCost: number | null | undefined, costDifference: number | null | undefined) => {
  if (!currentCost || currentCost === 0 || costDifference === null || costDifference === undefined) return null;
  return Number(((costDifference / currentCost) * 100).toFixed(2));
};

const isSuspiciousItem = (item: { sourcePrice?: number | null; rawLine?: string | null }) => {
  const price = item.sourcePrice;
  if (price === null || price === undefined || !Number.isFinite(price)) return true;
  if (price <= 0) return true;
  if (price < 1) return true;
  if (price >= 100000) return true;

  if (item.rawLine) {
    const prices = extractPrices(item.rawLine);
    if (prices.length >= 2) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (max >= 10 && min > 0 && max / min >= 20 && price === min) return true;
      if (min < 1 && max >= 10 && price === min) return true;
    }
  }

  return false;
};
class SupplierPriceListService {
  async listSuppliers() {
    return prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async createSupplier(data: any) {
    return prisma.supplier.create({ data });
  }

  async updateSupplier(id: string, data: any) {
    return prisma.supplier.update({ where: { id }, data });
  }

  async listUploads(params: { supplierId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.supplierId) {
      where.supplierId = params.supplierId;
    }

    const [total, uploads] = await Promise.all([
      prisma.supplierPriceListUpload.count({ where }),
      prisma.supplierPriceListUpload.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      uploads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUpload(id: string) {
    return prisma.supplierPriceListUpload.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
        files: true,
      },
    });
  }

  async getUploadItems(params: { uploadId: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(params.limit) || 50));
    const skip = (page - 1) * limit;
    const status = (params.status || 'matched').toLowerCase();

    if (status === 'unmatched') {
      const where = { uploadId: params.uploadId, matchCount: 0 };
      const [total, items] = await Promise.all([
        prisma.supplierPriceListItem.count({ where }),
        prisma.supplierPriceListItem.findMany({
          where,
          orderBy: { supplierCode: 'asc' },
          skip,
          take: limit,
        }),
      ]);

      return {
        items: items.map((item: any) => ({
          supplierCode: item.supplierCode,
          supplierName: item.supplierName,
          sourcePrice: item.sourcePrice,
          netPrice: item.netPrice,
          priceCurrency: item.priceCurrency,
          priceIncludesVat: item.priceIncludesVat,
          matchCount: item.matchCount,
          matchedProductCodes: [],
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }

    if (status === 'multiple') {
      const where = { uploadId: params.uploadId, matchCount: { gt: 1 } };
      const [total, items] = await Promise.all([
        prisma.supplierPriceListItem.count({ where }),
        prisma.supplierPriceListItem.findMany({
          where,
          include: { matches: { select: { productCode: true } } },
          orderBy: { supplierCode: 'asc' },
          skip,
          take: limit,
        }),
      ]);

      return {
        items: items.map((item: any) => ({
          supplierCode: item.supplierCode,
          supplierName: item.supplierName,
          sourcePrice: item.sourcePrice,
          netPrice: item.netPrice,
          priceCurrency: item.priceCurrency,
          priceIncludesVat: item.priceIncludesVat,
          matchCount: item.matchCount,
          matchedProductCodes: item.matches.map((match: any) => match.productCode),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }

    if (status === 'suspicious') {
      const items = await prisma.supplierPriceListItem.findMany({
        where: { uploadId: params.uploadId },
        include: { matches: { select: { productCode: true } } },
        orderBy: { supplierCode: 'asc' },
      });

      const suspiciousItems = items.filter((item: any) => isSuspiciousItem(item));
      const total = suspiciousItems.length;
      const pagedItems = suspiciousItems.slice(skip, skip + limit);

      return {
        items: pagedItems.map((item: any) => ({
          supplierCode: item.supplierCode,
          supplierName: item.supplierName,
          sourcePrice: item.sourcePrice,
          netPrice: item.netPrice,
          priceCurrency: item.priceCurrency,
          priceIncludesVat: item.priceIncludesVat,
          matchCount: item.matchCount,
          matchedProductCodes: item.matches.map((match: any) => match.productCode),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }

    const where = { item: { uploadId: params.uploadId } };
    const [total, matches] = await Promise.all([
      prisma.supplierPriceListMatch.count({ where }),
      prisma.supplierPriceListMatch.findMany({
        where,
        include: {
          item: {
            select: {
              supplierCode: true,
              supplierName: true,
              sourcePrice: true,
              netPrice: true,
              priceCurrency: true,
              priceIncludesVat: true,
              matchCount: true,
            },
          },
        },
        orderBy: { productCode: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: matches.map((match: any) => ({
        supplierCode: match.item.supplierCode,
        supplierName: match.item.supplierName,
        sourcePrice: match.item.sourcePrice,
        netPrice: match.item.netPrice,
        priceCurrency: match.item.priceCurrency,
        priceIncludesVat: match.item.priceIncludesVat,
        matchCount: match.item.matchCount,
        productCode: match.productCode,
        productName: match.productName,
        currentCost: match.currentCost,
        newCost: match.netPrice,
        costDifference: match.costDifference,
        percentDifference: computePercentDifference(match.currentCost, match.costDifference),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async buildExport(uploadId: string) {
    const items = await prisma.supplierPriceListItem.findMany({
      where: { uploadId },
      include: { matches: true },
      orderBy: { supplierCode: 'asc' },
    });

    const matchedRows: any[] = [];
    const unmatchedRows: any[] = [];
    const multipleRows: any[] = [];

    for (const item of items) {
      if (!item.matches.length) {
        unmatchedRows.push({
          'Tedarikci Kod': item.supplierCode,
          'Tedarikci Ad': item.supplierName || '',
          'Liste Fiyat': item.sourcePrice ?? '',
          'Net Fiyat': item.netPrice ?? '',
          'Para Birimi': item.priceCurrency || 'TRY',
          'KDV Dahil': item.priceIncludesVat ? 'Evet' : 'Hayir',
          'Eslesme Sayisi': item.matchCount,
        });
        continue;
      }

      if (item.matchCount > 1) {
        multipleRows.push({
          'Tedarikci Kod': item.supplierCode,
          'Tedarikci Ad': item.supplierName || '',
          'Liste Fiyat': item.sourcePrice ?? '',
          'Net Fiyat': item.netPrice ?? '',
          'Para Birimi': item.priceCurrency || 'TRY',
          'KDV Dahil': item.priceIncludesVat ? 'Evet' : 'Hayir',
          'Eslesme Sayisi': item.matchCount,
          'Urunler': item.matches.map((match: any) => match.productCode).join(', '),
        });
      }

      for (const match of item.matches) {
        matchedRows.push({
          'Tedarikci Kod': item.supplierCode,
          'Tedarikci Ad': item.supplierName || '',
          'Liste Fiyat': item.sourcePrice ?? '',
          'Net Fiyat': item.netPrice ?? '',
          'Para Birimi': item.priceCurrency || 'TRY',
          'KDV Dahil': item.priceIncludesVat ? 'Evet' : 'Hayir',
          'Urun Kodu': match.productCode,
          'Urun Adi': match.productName,
          'Guncel Maliyet': match.currentCost ?? '',
          'Yeni Maliyet': match.netPrice ?? '',
          'Fark': match.costDifference ?? '',
          'Fark %': computePercentDifference(match.currentCost, match.costDifference) ?? '',
          'Eslesme Sayisi': item.matchCount,
        });
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matchedRows), 'Eslesenler');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unmatchedRows), 'Esmeyenler');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(multipleRows), 'Coklu');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return {
      buffer,
      fileName: `supplier-price-list-${uploadId}.xlsx`,
    };
  }

  async previewPriceLists(params: { supplierId: string; files: Express.Multer.File[]; overrides?: SupplierConfigOverrides | null }) {
    const { supplierId, files, overrides } = params;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    const previewSupplier = resolveSupplierConfig(supplier, overrides);
    let excelPreview: any = null;
    let pdfPreview: any = null;

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if ((ext === '.xls' || ext === '.xlsx') && !excelPreview) {
        excelPreview = buildExcelPreview(file.path, previewSupplier);
      } else if (ext === '.pdf') {
        const pdfData = await buildPdfPreview(file.path, previewSupplier);
        if (!pdfPreview) {
          pdfPreview = pdfData;
        } else {
          pdfPreview.rows = (pdfPreview.rows || []).concat(pdfData.rows || []).slice(0, PDF_MAX_PREVIEW_ROWS);
          if (!pdfPreview.columns?.length && pdfData.columns?.length) {
            pdfPreview.columns = pdfData.columns;
          }
          if (!pdfPreview.detected && pdfData.detected) {
            pdfPreview.detected = pdfData.detected;
          }
          if (!pdfPreview.codePattern && pdfData.codePattern) {
            pdfPreview.codePattern = pdfData.codePattern;
          }
        }
      }
    }

    if (!excelPreview && !pdfPreview) {
      throw new Error('No preview data');
    }

    return { excel: excelPreview, pdf: pdfPreview };
  }
  async uploadPriceLists(params: { supplierId: string; uploadedById: string; files: Express.Multer.File[]; overrides?: SupplierConfigOverrides | null }) {
    const { supplierId, uploadedById, files } = params;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    const uploadSupplier = resolveSupplierConfig(supplier, params.overrides);

    const upload = await prisma.supplierPriceListUpload.create({
      data: {
        supplierId,
        uploadedById,
        fileCount: files.length,
        status: 'PENDING',
      },
    });

    try {
      const fileRows = files.map((file) => ({
        id: randomUUID(),
        uploadId: upload.id,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: file.path,
      }));

      const parsedItems: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; rawLine?: string; currency?: string | null }> = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf') {
          const items = await parsePdfFile(file.path, uploadSupplier);
          parsedItems.push(...items);
        } else if (ext === '.xls' || ext === '.xlsx') {
          const items = parseExcelFile(file.path, uploadSupplier);
          parsedItems.push(...items);
        }
      }

      const consolidatedItems = consolidateParsedItems(parsedItems);

      if (consolidatedItems.length === 0) {
        throw new Error('No rows parsed from uploaded files');
      }

      const productMap = await buildProductMap();
      const itemsWithIds = [] as any[];
      const matchRows = [] as any[];

      for (const item of consolidatedItems) {
        const itemId = randomUUID();
        const normalized = normalizeCode(item.supplierCode);
        const matches = normalized ? productMap.get(normalized) || [] : [];
        const matchIds = matches.map((product) => product.id);
        const itemNetPrice = computeItemNetPrice(item.sourcePrice ?? null, uploadSupplier, item.supplierName ?? null);

        itemsWithIds.push({
          id: itemId,
          uploadId: upload.id,
          supplierCode: item.supplierCode,
          supplierName: item.supplierName,
          sourcePrice: item.sourcePrice ?? null,
          netPrice: itemNetPrice,
          priceCurrency: item.currency || 'TRY',
          priceIncludesVat: uploadSupplier.priceIncludesVat,
          rawLine: item.rawLine,
          matchCount: matches.length,
          matchedProductIds: matchIds,
        });

        for (const product of matches) {
          const netPrice = computeMatchNetPrice(
            item.sourcePrice ?? null,
            uploadSupplier,
            product.vatRate ?? null,
            item.supplierName ?? null
          );
          const difference = netPrice !== null && product.currentCost !== null && product.currentCost !== undefined
            ? Number((netPrice - product.currentCost).toFixed(4))
            : null;

          matchRows.push({
            id: randomUUID(),
            itemId,
            productId: product.id,
            productCode: product.mikroCode,
            productName: product.name,
            currentCost: product.currentCost ?? null,
            vatRate: product.vatRate ?? null,
            netPrice,
            costDifference: difference,
          });
        }
      }

      const totalItems = itemsWithIds.length;
      const matchedItems = itemsWithIds.filter((item: any) => item.matchCount > 0).length;
      const unmatchedItems = itemsWithIds.filter((item: any) => item.matchCount === 0).length;
      const multiMatchItems = itemsWithIds.filter((item: any) => item.matchCount > 1).length;

      const transactions: any[] = [
        prisma.supplierPriceListFile.createMany({ data: fileRows }),
        prisma.supplierPriceListItem.createMany({ data: itemsWithIds }),
        prisma.supplierPriceListUpload.update({
          where: { id: upload.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            totalItems,
            matchedItems,
            unmatchedItems,
            multiMatchItems,
          },
        }),
      ];

      if (matchRows.length) {
        transactions.splice(2, 0, prisma.supplierPriceListMatch.createMany({ data: matchRows }));
      }

      await prisma.$transaction(transactions);

      return {
        uploadId: upload.id,
        summary: {
          totalItems,
          matchedItems,
          unmatchedItems,
          multiMatchItems,
        },
      };
    } catch (error: any) {
      await prisma.supplierPriceListUpload.update({
        where: { id: upload.id },
        data: {
          status: 'FAILED',
          errorMessage: error?.message || 'Upload failed',
        },
      });
      throw error;
    }
  }
}

export default new SupplierPriceListService();


















