import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '../utils/prisma';

const pdfParseModule = require('pdf-parse');

const parsePdfBuffer = async (buffer: Buffer) => {
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

const extractPrices = (line: string): number[] => {
  const matches = Array.from(line.matchAll(/\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\d+,\d{2}/g));
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

const defaultCodeToken = (token: string) => {
  const cleaned = token.replace(/[^A-Za-z0-9\-\/]/g, '');
  if (!cleaned) return null;
  if (!/[0-9]/.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) {
    return cleaned.length >= 3 ? cleaned : null;
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

  return null;
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

const extractCurrency = (line: string) => {
  if (/\b(USD|\$)\b/i.test(line)) return 'USD';
  if (/\b(EUR|€)\b/i.test(line)) return 'EUR';
  if (/\b(TL|TRY|\u20BA)\b/i.test(line)) return 'TRY';
  return null;
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

const parsePdfFile = async (filePath: string, supplier: any) => {
  const buffer = await fs.promises.readFile(filePath);
  const result = await parsePdfBuffer(buffer);
  const text = result?.text || '';
  const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  const items: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; rawLine?: string; currency?: string | null }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (isHeaderLine(line)) continue;

    const prices = extractPrices(line);
    if (!prices.length) continue;

    const code = extractCodeFromLine(line, supplier.pdfCodePattern);
    if (!code) continue;

    const price = selectPriceValue(prices, supplier.pdfPriceIndex);
    if (price === null) continue;

    const key = `${code}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const supplierName = line.replace(code, '').replace(/\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\d+,\d{2}/g, '').trim();
    items.push({
      supplierCode: code,
      supplierName: supplierName || undefined,
      sourcePrice: price,
      rawLine: line,
      currency: extractCurrency(line),
    });
  }

  const tokenItems = parsePdfTokens(text, supplier.pdfPriceIndex);
  for (const item of tokenItems) {
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

  const headerRow = (rows[headerRowIndex] || []).map(normalizeHeader);

  const codeIndex = resolveHeaderIndex(headerRow, supplier.excelCodeHeader, CODE_HEADERS);
  const priceIndex = resolveHeaderIndex(headerRow, supplier.excelPriceHeader, PRICE_HEADERS);
  const nameIndex = resolveHeaderIndex(headerRow, supplier.excelNameHeader, NAME_HEADERS);

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

const computeItemNetPrice = (sourcePrice: number | null, supplier: any) => {
  if (!sourcePrice && sourcePrice !== 0) return null;
  let price = sourcePrice;
  if (supplier.priceIncludesVat) {
    const vatRate = supplier.defaultVatRate ?? DEFAULT_VAT_RATE;
    if (vatRate > 0) {
      price = price / (1 + vatRate);
    }
  }
  if (!supplier.priceIsNet) {
    price = applyDiscounts(price, getDiscounts(supplier));
  }
  return Number(price.toFixed(4));
};

const computeMatchNetPrice = (sourcePrice: number | null, supplier: any, vatRate?: number | null) => {
  if (!sourcePrice && sourcePrice !== 0) return null;
  let price = sourcePrice;
  if (supplier.priceIncludesVat) {
    const resolvedVat = vatRate ?? supplier.defaultVatRate ?? DEFAULT_VAT_RATE;
    if (resolvedVat > 0) {
      price = price / (1 + resolvedVat);
    }
  }
  if (!supplier.priceIsNet) {
    price = applyDiscounts(price, getDiscounts(supplier));
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

  async uploadPriceLists(params: { supplierId: string; uploadedById: string; files: Express.Multer.File[] }) {
    const { supplierId, uploadedById, files } = params;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found');
    }

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
          const items = await parsePdfFile(file.path, supplier);
          parsedItems.push(...items);
        } else if (ext === '.xls' || ext === '.xlsx') {
          const items = parseExcelFile(file.path, supplier);
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
        const itemNetPrice = computeItemNetPrice(item.sourcePrice ?? null, supplier);

        itemsWithIds.push({
          id: itemId,
          uploadId: upload.id,
          supplierCode: item.supplierCode,
          supplierName: item.supplierName,
          sourcePrice: item.sourcePrice ?? null,
          netPrice: itemNetPrice,
          priceCurrency: item.currency || 'TRY',
          priceIncludesVat: supplier.priceIncludesVat,
          rawLine: item.rawLine,
          matchCount: matches.length,
          matchedProductIds: matchIds,
        });

        for (const product of matches) {
          const netPrice = computeMatchNetPrice(item.sourcePrice ?? null, supplier, product.vatRate ?? null);
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











