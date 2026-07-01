import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '../utils/prisma';
import mikroService from './mikro.service';

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

const PRICE_HEADERS_GENERIC = [
  'tavsiye birim satis fiyati',
  'tavsiye adet satis fiyati',
  'birim satis fiyati',
  'birim fiyat',
  'fiyat',
];

const PRICE_HEADERS_LIST = ['liste fiyat', 'liste'];
const PRICE_HEADERS_NET = ['net fiyat', 'net'];

const PRICE_HEADERS = [...PRICE_HEADERS_LIST, ...PRICE_HEADERS_NET, ...PRICE_HEADERS_GENERIC];

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
  if (/^[\u20ba$ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬]+$/.test(trimmed)) return false;
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
  // Rakam icermeyen hucre (ornegin "KOLI", "ADET", "-") -> null.
  // (Aksi halde Number('') === 0 olup yanlis kolon secimi fiyati 0 yapardi.)
  if (!/\d/.test(str)) return null;
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

const normalizeDiscountValues = (values: any[]) =>
  values
    .map((value) => (typeof value === 'number' ? value : parseNumber(value)))
    .filter((value): value is number => Boolean(value && value > 0));

// Ana zincir iskonto: once sinirsiz `defaultDiscounts` dizisini kullan,
// yoksa/legacy tedarikcilerde discount1..5 kolonlarina dus (geri-uyum).
const getDiscounts = (supplier: any) => {
  if (Array.isArray(supplier?.defaultDiscounts)) {
    const fromArray = normalizeDiscountValues(supplier.defaultDiscounts);
    if (fromArray.length) return fromArray;
  }

  return normalizeDiscountValues([
    supplier.discount1,
    supplier.discount2,
    supplier.discount3,
    supplier.discount4,
    supplier.discount5,
  ]);
};

type SupplierDiscountRule = {
  keywords?: string[];
  discounts?: number[];
};

const normalizeMatchText = (value: any) => normalizeText(value).replace(/\s+/g, '');

const normalizeKeywordList = (values: string[]) =>
  values.map((value) => normalizeMatchText(value)).filter(Boolean);

const COLOR_BLACK_KEYWORDS = normalizeKeywordList(['siyah', 'black']);
const COLOR_OTHER_KEYWORDS = normalizeKeywordList(['mavi', 'sari', 'yesil', 'kirmizi', 'blue', 'yellow', 'green', 'red']);

const resolveColorGroup = (value?: string | null) => {
  const normalized = normalizeMatchText(value);
  if (!normalized) return null;
  if (COLOR_BLACK_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'black';
  if (COLOR_OTHER_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'color';
  return null;
};

const resolveColorPrice = (
  prices: Array<number | null | undefined>,
  colorGroup: 'black' | 'color' | null
) => {
  const numericPrices = prices.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numericPrices.length) return null;
  if (numericPrices.length === 1) return numericPrices[0];
  const min = Math.min(...numericPrices);
  const max = Math.max(...numericPrices);
  if (colorGroup === 'black') return min;
  if (colorGroup === 'color') return max;
  return max;
};

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

const PRICE_HEADERS_EXACT = new Set(['liste', 'net']);

const matchesPriceHeader = (header: string, candidate: string) => {
  if (!header) return false;
  if (PRICE_HEADERS_EXACT.has(candidate)) {
    return header === candidate;
  }
  return header.includes(candidate);
};

const buildPriceHeaderCandidates = (supplier?: any) => {
  if (supplier?.priceIsNet) {
    return [...PRICE_HEADERS_NET, ...PRICE_HEADERS_LIST, ...PRICE_HEADERS_GENERIC];
  }
  return [...PRICE_HEADERS_LIST, ...PRICE_HEADERS_NET, ...PRICE_HEADERS_GENERIC];
};

const findHeaderRowIndex = (rows: any[][]) => {
  const limit = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map(normalizeHeader).filter(Boolean);
    if (!normalized.length) continue;
    const hasCode = normalized.some((cell) => CODE_HEADERS.some((header) => cell.includes(header)));
    const hasPrice = normalized.some((cell) => PRICE_HEADERS.some((header) => matchesPriceHeader(cell, header)));
    if (hasCode && hasPrice) return i;
  }
  return -1;
};

// Tam-manuel kolon secimi icin sentinel: override "#col:N" verildiyse
// (N = 0 tabanli kolon index'i) basliga/normalize'a bakmadan o kolonu kullan.
// Bu, tedarikci listelerinde kolon duzeni/baslik metni degisse bile kullanicinin
// sectigi kolonun birebir kullanilmasini saglar.
const COLUMN_INDEX_OVERRIDE_REGEX = /^#col:(\d+)$/i;

const parseColumnIndexOverride = (preferredHeader?: string | null): number | null => {
  if (!preferredHeader) return null;
  const match = String(preferredHeader).trim().match(COLUMN_INDEX_OVERRIDE_REGEX);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const resolveHeaderIndex = (
  headers: string[],
  preferredHeader?: string | null,
  candidates: string[] = []
) => {
  const forcedIndex = parseColumnIndexOverride(preferredHeader);
  if (forcedIndex !== null) {
    return forcedIndex < headers.length ? forcedIndex : -1;
  }

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

const resolvePriceHeaderIndexes = (
  headers: string[],
  preferredHeader?: string | null,
  supplier?: any
) => {
  // Tam-manuel secim: "#col:N" verildiyse sadece o kolonu fiyat kolonu kabul et.
  const forcedIndex = parseColumnIndexOverride(preferredHeader);
  if (forcedIndex !== null) {
    return forcedIndex < headers.length ? [forcedIndex] : [];
  }

  const candidates = buildPriceHeaderCandidates(supplier);
  const indices = new Set<number>();
  const addMatches = (needle: string, exact: boolean) => {
    headers.forEach((header, index) => {
      if (!header) return;
      if (exact ? header === needle : matchesPriceHeader(header, needle)) {
        indices.add(index);
      }
    });
  };

  if (preferredHeader) {
    const normalizedPreferred = normalizeHeader(preferredHeader);
    addMatches(normalizedPreferred, true);
    if (!indices.size) {
      addMatches(normalizedPreferred, false);
    }
  }

  if (!indices.size) {
    for (const candidate of candidates) {
      const before = indices.size;
      addMatches(candidate, false);
      if (indices.size > before) break;
    }
  }

  return Array.from(indices.values()).sort((a, b) => a - b);
};

const resolveHeaderIndexes = (
  headers: string[],
  preferredHeader?: string | null,
  candidates: string[] = []
) => {
  const indices = new Set<number>();
  const addMatches = (needle: string, exact: boolean) => {
    headers.forEach((header, index) => {
      if (!header) return;
      if (exact ? header === needle : header.includes(needle)) {
        indices.add(index);
      }
    });
  };

  if (preferredHeader) {
    const normalizedPreferred = normalizeHeader(preferredHeader);
    addMatches(normalizedPreferred, true);
    if (!indices.size) {
      addMatches(normalizedPreferred, false);
    }
  }

  if (!indices.size) {
    for (const candidate of candidates) {
      const before = indices.size;
      addMatches(candidate, false);
      if (indices.size > before) break;
    }
  }

  return Array.from(indices.values()).sort((a, b) => a - b);
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
  return PDF_HEADER_LABELS.some((label) => normalized === label);
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
    const shouldMerge =
      (gap <= PDF_HEADER_TOKEN_GAP && !isPdfHeaderLabel(last.text)) || isPdfHeaderLabel(combinedText);
    if (shouldMerge) {
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

const computePdfColumnStats = (
  rows: PdfRow[],
  columnCount: number,
  codePattern?: string | null
) => {
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

  return stats;
};

const isPdfColumnStatValid = (
  stat: { filled: number; numeric: number; code: number; text: number } | undefined,
  key: 'numeric' | 'code' | 'text',
  minCount: number,
  minRatio: number
) => {
  if (!stat || !stat.filled || stat[key] < minCount) return false;
  const ratio = stat[key] / stat.filled;
  return ratio >= minRatio;
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
  if (/\b(EUR|ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬ÂÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬)\b/i.test(line)) return 'EUR';
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
  const stats = computePdfColumnStats(detectionRows, columnCount, supplier.pdfCodePattern);
  const headerDetected = detectPdfColumnRolesFromHeader(rows);
  const detected = detectPdfColumnRoles(detectionRows, columnCount, supplier.pdfCodePattern);
  const preferred = normalizePdfColumnRoles(supplier.pdfColumnRoles, columnCount);

  const resolveHeaderIndex = (
    index: number | null | undefined,
    key: 'numeric' | 'code' | 'text',
    minCount: number,
    minRatio: number
  ) => {
    if (index === null || index === undefined) return null;
    if (!isPdfColumnStatValid(stats[index], key, minCount, minRatio)) return null;
    return index;
  };

  const resolvedCodeIndex = resolveHeaderIndex(headerDetected?.codeIndex, 'code', 1, 0.2) ?? detected.codeIndex;
  const resolvedPriceIndex = resolveHeaderIndex(headerDetected?.priceIndex, 'numeric', 1, 0.3) ?? detected.priceIndex;
  let resolvedNameIndex = resolveHeaderIndex(headerDetected?.nameIndex, 'text', 1, 0.4) ?? detected.nameIndex;

  if (resolvedNameIndex !== null && (resolvedNameIndex === resolvedCodeIndex || resolvedNameIndex === resolvedPriceIndex)) {
    resolvedNameIndex = detected.nameIndex;
  }

  return {
    codeIndex: preferred?.codeIndex ?? resolvedCodeIndex,
    nameIndex: preferred?.nameIndex ?? resolvedNameIndex,
    priceIndex: preferred?.priceIndex ?? resolvedPriceIndex,
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
  // Isim modu: kod opsiyonel; ad + fiyat olan satirlar kabul edilir.
  const nameMode = Boolean(supplier.nameMode);

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
    if (!code && !nameMode) {
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

    if (nameMode) {
      // Isim modu: ad + fiyat gerekli. Fiyat yoksa (yalniz ad satiri) pendingName tut.
      const candidateName = buildNameCandidate(row);
      if (!rowHasPrice) {
        if (candidateName) pendingName = candidateName;
        continue;
      }
      let supplierName = candidateName;
      if (!supplierName && pendingName) supplierName = pendingName;
      pendingName = null;
      if (!supplierName) continue; // ad yoksa isim modunda kullanilamaz
      const priceCell = mapping.priceIndex !== null ? row.cells[mapping.priceIndex] : null;
      const sourcePrice = extractPriceFromCell(priceCell);
      items.push({
        supplierCode: code || '',
        supplierName,
        sourcePrice: sourcePrice ?? null,
        rawLine: rawLine || undefined,
        currency: rawLine ? extractCurrency(rawLine) : null,
      });
      continue;
    }

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
  const nameMode = Boolean(supplier.nameMode);
  try {
    const { columns, rows } = await buildPdfTable(filePath);
    if (columns.length && rows.length) {
      const mapping = resolvePdfColumnMapping(rows, columns.length, supplier);
      // Isim modu: ad + fiyat yeterli. Kod modu: kod + fiyat gerekli.
      const mappingReady = nameMode
        ? mapping.nameIndex !== null && mapping.priceIndex !== null
        : mapping.codeIndex !== null && mapping.priceIndex !== null;
      if (mappingReady) {
        const items = parsePdfRowsWithMapping(rows, mapping, supplier);
        if (items.length) {
          return items;
        }
      }
    }
  } catch (error) {
    // fallback to legacy parser
  }

  // Isim modunda legacy (kod-tabanli) parser'a dusme; kod'suz liste icin uygun degil.
  if (nameMode) return [];
  return parsePdfFileLegacy(filePath, supplier);
};

const parseExcelFile = (filePath: string, supplier: any) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetNames = supplier.excelSheetName ? [supplier.excelSheetName] : workbook.SheetNames;
  const items: Array<{ supplierCode: string; supplierName?: string; sourcePrice?: number | null; sourcePriceAlt?: number | null; rawLine?: string }> = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
    if (!rows.length) continue;

    const headerRowIndex = supplier.excelHeaderRow ? Math.max(0, supplier.excelHeaderRow - 1) : findHeaderRowIndex(rows);
    if (headerRowIndex < 0) continue;

    // Baslik satiri ile ilk veri satirlarinin en genis hucre sayisini kullan ki
    // "#col:N" (tam-manuel index) secimleri, basligi bos olan kolonlarda da cozulsun.
    let headerWidth = (rows[headerRowIndex] || []).length;
    for (let i = headerRowIndex + 1; i < Math.min(rows.length, headerRowIndex + 1 + EXCEL_SAMPLE_ROW_COUNT); i += 1) {
      headerWidth = Math.max(headerWidth, (rows[i] || []).length);
    }
    const headerRowCells = rows[headerRowIndex] || [];
    const rawHeaderRow = Array.from({ length: headerWidth }, (_, c) => String(headerRowCells[c] ?? '').trim());
    const normalizedHeaderRow = rawHeaderRow.map(normalizeHeader);

    const codeIndex = resolveHeaderIndex(normalizedHeaderRow, supplier.excelCodeHeader, CODE_HEADERS);
    const priceIndexes = resolvePriceHeaderIndexes(normalizedHeaderRow, supplier.excelPriceHeader, supplier);
    const nameIndex = resolveHeaderIndex(normalizedHeaderRow, supplier.excelNameHeader, NAME_HEADERS);

    // Isim modu: kod opsiyonel; ad + fiyat kolonlari yeterli.
    const nameMode = Boolean(supplier.nameMode);
    if (nameMode) {
      if (nameIndex < 0 || priceIndexes.length === 0) continue;
    } else if (codeIndex < 0 || priceIndexes.length === 0) {
      continue;
    }

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const rawCode = codeIndex >= 0 ? row[codeIndex] : null;
      const rawName = nameIndex >= 0 ? row[nameIndex] : null;

      const supplierCode = rawCode === null || rawCode === undefined ? '' : String(rawCode).trim();
      if (nameMode) {
        // Isim modu: ad zorunlu (kod olmayabilir).
        const nameStr = rawName === null || rawName === undefined ? '' : String(rawName).trim();
        if (!nameStr) continue;
      } else {
        if (!supplierCode) continue;
      }

      const priceValues = priceIndexes
        .map((index) => parseNumber(row[index]))
        .filter((value): value is number => value !== null);
      if (!priceValues.length) continue;

      let sourcePrice = priceValues[0];
      let sourcePriceAlt: number | null = null;
      if (supplier.priceByColor && priceValues.length > 1) {
        const maxPrice = Math.max(...priceValues);
        const minPrice = Math.min(...priceValues);
        sourcePrice = maxPrice;
        sourcePriceAlt = minPrice !== maxPrice ? minPrice : null;
      }

      items.push({
        supplierCode,
        supplierName: rawName ? String(rawName).trim() : undefined,
        sourcePrice,
        sourcePriceAlt,
      });
    }
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
      unit2: true,
      unit2Factor: true,
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

// ============================================================================
// ISIM ESLESTIRME (ana saglayici bazli, kod'suz listeler icin)
// ----------------------------------------------------------------------------
// normalize(ad): kucult + Turkce karakter sadeleştir + parantez/olcu gurultusunu
// azalt + token'lara bol. Skor: token-set benzerligi (agirlikli Jaccard/ortusme)
// + trigram destegi. Esik ustu -> eslesme, altinda -> unmatched.
// ============================================================================

// Marka/olcu belirtmeyen, cok sik gecen ama ayirt edici olmayan token'lar.
const NAME_MATCH_STOPWORDS = new Set<string>([
  'adet', 'paket', 'koli', 'kutu', 'kg', 'gr', 'gram', 'lt', 'litre', 'ml',
  'cm', 'mm', 'mt', 'metre', 'm2', 'm3', 'cc', 'no', 'ebat', 'olcu', 'renk',
  've', 'ile', 'icin', 'the', 'and', 'x',
]);

// Ismi normalize edip anlamli token dizisine cevir.
// - Turkce sadelestirme + kucultme (normalizeText)
// - olcu/rakam+birim gurultusunu ayikla
// - stopword ve tek-karakter token'lari at
const tokenizeName = (value: any): string[] => {
  const normalized = normalizeText(value); // kucuk + tr-sadelestirilmis + [^a-z0-9]-> bosluk
  if (!normalized) return [];
  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const token of rawTokens) {
    if (!token) continue;
    if (NAME_MATCH_STOPWORDS.has(token)) continue;
    // Sadece olcu birimi olan token'lari (ornek "500ml", "5kg") sayisallastir:
    // rakam kismini birak, birim ekini at ki "500ml" ~ "500 ml" cakissin.
    const unitMatch = token.match(/^(\d+)([a-z]{1,3})$/);
    if (unitMatch && UNIT_TOKENS.includes(unitMatch[2])) {
      tokens.push(unitMatch[1]);
      continue;
    }
    if (token.length < 2 && !/\d/.test(token)) continue; // tek harf gurultu
    tokens.push(token);
  }
  return tokens;
};

const buildTrigrams = (value: string): Set<string> => {
  const compact = value.replace(/\s+/g, '');
  const grams = new Set<string>();
  if (compact.length < 3) {
    if (compact) grams.add(compact);
    return grams;
  }
  for (let i = 0; i <= compact.length - 3; i += 1) {
    grams.add(compact.slice(i, i + 3));
  }
  return grams;
};

const jaccard = <T>(a: Set<T>, b: Set<T>): number => {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) {
    if (large.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
};

type NameCandidate = {
  code: string;
  name: string | null;
  tokens: Set<string>;
  trigrams: Set<string>;
};

// Aday urun havuzundan bir isim-eslestirici kur.
const buildNameMatcher = (products: Array<{ code: string; name: string | null }>) => {
  const candidates: NameCandidate[] = products.map((product) => {
    const normalized = normalizeText(product.name);
    return {
      code: product.code,
      name: product.name ?? null,
      tokens: new Set(tokenizeName(product.name)),
      trigrams: buildTrigrams(normalized),
    };
  });

  // 0..1 arasi birlesik benzerlik skoru.
  const score = (queryTokens: Set<string>, queryTrigrams: Set<string>, candidate: NameCandidate) => {
    // Token ortusmesi (query'nin ne kadari kapsandi) + Jaccard karisimi.
    const tokenJaccard = jaccard(queryTokens, candidate.tokens);
    let contained = 0;
    if (queryTokens.size && candidate.tokens.size) {
      let hit = 0;
      const [small, large] = queryTokens.size <= candidate.tokens.size
        ? [queryTokens, candidate.tokens]
        : [candidate.tokens, queryTokens];
      for (const token of small) if (large.has(token)) hit += 1;
      contained = hit / queryTokens.size;
    }
    const tokenScore = 0.6 * tokenJaccard + 0.4 * contained;
    const trigramScore = jaccard(queryTrigrams, candidate.trigrams);
    // Token bilgisi daha guvenilir; trigram yazim/ek farklarini yumusatir.
    return 0.7 * tokenScore + 0.3 * trigramScore;
  };

  const findBest = (name: string | null | undefined) => {
    const queryTokens = new Set(tokenizeName(name));
    const queryTrigrams = buildTrigrams(normalizeText(name));
    if (!queryTokens.size && !queryTrigrams.size) return null;

    let best: NameCandidate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const s = score(queryTokens, queryTrigrams, candidate);
      if (s > bestScore) {
        bestScore = s;
        best = candidate;
      }
    }
    if (!best) return null;
    return { code: best.code, name: best.name, score: Number(bestScore.toFixed(4)) };
  };

  return { findBest, candidateCount: candidates.length };
};

// Isim eslesmesi icin minimum guven esigi (altinda unmatched).
// 0.34 -> 0.25: kelepir gibi listelerde daha fazla oto-eslesme yakalansin
// (yanlislar elle Degistir/Kaldir ile duzeltilebilir; guven skoru matched satirda gosterilir).
const NAME_MATCH_THRESHOLD = 0.25;

// Isim modu + elle secim icin urun detaylarini (id/name/currentCost/vatRate/unit2Factor)
// Mikro koduna gore cozer. Once B2B Product (currentCost B2B'de guncel), eksikleri Mikro'dan.
type ResolvedProductDetail = {
  id: string | null;
  code: string;
  name: string | null;
  currentCost: number | null;
  vatRate: number | null;
  unit2Factor: number | null;
};

const resolveProductDetailsByCodes = async (codes: string[]): Promise<Map<string, ResolvedProductDetail>> => {
  const map = new Map<string, ResolvedProductDetail>();
  const uniqueCodes = Array.from(
    new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean)),
  );
  if (!uniqueCodes.length) return map;

  // 1) B2B Product (senkron urunler): id + guncel maliyet/kdv/birim2
  const products = await prisma.product.findMany({
    where: { mikroCode: { in: uniqueCodes } },
    select: { id: true, mikroCode: true, name: true, currentCost: true, vatRate: true, unit2Factor: true },
  });
  for (const product of products) {
    map.set(product.mikroCode, {
      id: product.id,
      code: product.mikroCode,
      name: product.name ?? null,
      currentCost: product.currentCost ?? null,
      vatRate: product.vatRate ?? null,
      unit2Factor: product.unit2Factor ?? null,
    });
  }

  // 2) B2B'de olmayan kodlar icin Mikro fallback (name-mode urunu senkron degilse)
  const missing = uniqueCodes.filter((code) => !map.has(code));
  if (missing.length) {
    try {
      const mikroDetails = await mikroService.getStockCostDetails(missing);
      for (const detail of mikroDetails) {
        if (!detail.code || map.has(detail.code)) continue;
        map.set(detail.code, {
          id: null,
          code: detail.code,
          name: detail.name,
          currentCost: detail.currentCost,
          vatRate: detail.vatRate,
          unit2Factor: detail.unit2Factor,
        });
      }
    } catch {
      // Mikro erisimi yoksa sessizce gec: detay olmadan da eslesme kaydedilir.
    }
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
  sourcePriceAlt?: number | null;
  rawLine?: string;
  currency?: string | null;
};

const resolveMatchSourcePrice = (
  item: ParsedItem,
  supplier: any,
  product?: { name?: string | null; currentCost?: number | null; unit2Factor?: number | null; vatRate?: number | null } | null
) => {
  const colorGroup = resolveColorGroup(product?.name) ?? resolveColorGroup(item.supplierName);
  const basePrice = supplier?.priceByColor
    ? resolveColorPrice([item.sourcePrice ?? null, item.sourcePriceAlt ?? null], colorGroup)
    : item.sourcePrice ?? null;

  if (basePrice === null || basePrice === undefined) return null;

  const currentCost = product?.currentCost ?? null;
  if (!currentCost || !Number.isFinite(currentCost) || currentCost <= 0) return basePrice;

  const unit2Factor = product?.unit2Factor ?? null;
  if (!unit2Factor || !Number.isFinite(unit2Factor)) return basePrice;

  const factor = Math.abs(unit2Factor);
  if (factor <= 1) return basePrice;

  // Birim farki otomatik duzeltme (CIFT YON):
  //  - Bolme (perUnit): tedarikci KOLI fiyati vermis ama biz ADET tanimliyiz.
  //  - Carpma (perPack): tedarikci ADET fiyati vermis ama biz KOLI tanimliyiz (or. 2 TL -> 100 TL).
  // Hangisi guncel maliyete belirgin sekilde daha yakinsa onu sec.
  const perUnit = basePrice / factor;
  const perPack = basePrice * factor;

  const baseNet = computeMatchNetPrice(basePrice, supplier, product?.vatRate ?? null, item.supplierName ?? null);
  if (baseNet === null) return basePrice;
  const baseDiff = Math.abs(baseNet - currentCost) / currentCost;

  const candidates: Array<{ price: number; diff: number }> = [];
  if (Number.isFinite(perUnit) && perUnit > 0) {
    const net = computeMatchNetPrice(perUnit, supplier, product?.vatRate ?? null, item.supplierName ?? null);
    if (net !== null) candidates.push({ price: perUnit, diff: Math.abs(net - currentCost) / currentCost });
  }
  if (Number.isFinite(perPack) && perPack > 0) {
    const net = computeMatchNetPrice(perPack, supplier, product?.vatRate ?? null, item.supplierName ?? null);
    if (net !== null) candidates.push({ price: perPack, diff: Math.abs(net - currentCost) / currentCost });
  }
  if (!candidates.length) return basePrice;

  candidates.sort((a, b) => a.diff - b.diff);
  const best = candidates[0];

  // Yalniz taban fiyat belirgin uzak (>=%80) ve alternatif belirgin yakin (<=%35, +%20 fark) ise duzelt.
  if (baseDiff >= 0.8 && best.diff <= 0.35 && best.diff + 0.2 < baseDiff) {
    return Number(best.price.toFixed(4));
  }

  return basePrice;
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
    sourcePriceAlt: chosen.sourcePriceAlt ?? items.find((item) => typeof item.sourcePriceAlt === 'number')?.sourcePriceAlt ?? null,
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

// Onizlemede kullanici icin ham satir sayisi (baslik satiri secimi dropdown'u)
const EXCEL_RAW_ROW_COUNT = 15;
// Kolon basina gosterilecek ornek deger sayisi
const EXCEL_COLUMN_SAMPLE_COUNT = 4;
// Eslesme ornegi satir sayisi
const EXCEL_SAMPLE_ROW_COUNT = 8;

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
      headerLabels: [],
      columns: [],
      rawRows: [],
      detected: { code: null, name: null, price: null },
      samples: [],
    };
  }

  const headerRowIndex = supplier.excelHeaderRow ? Math.max(0, supplier.excelHeaderRow - 1) : findHeaderRowIndex(rows);

  // Index korunarak TUM kolonlari kapsa: baslik satiri + ilk veri satirlarinin
  // en genis hucre sayisini kullan (baslik bos olsa bile kolon kaybolmasin).
  const widthScanEnd = headerRowIndex >= 0
    ? Math.min(rows.length, headerRowIndex + 1 + EXCEL_SAMPLE_ROW_COUNT)
    : Math.min(rows.length, EXCEL_RAW_ROW_COUNT);
  let columnCount = 0;
  for (let i = 0; i < Math.max(widthScanEnd, Math.min(rows.length, EXCEL_RAW_ROW_COUNT)); i += 1) {
    columnCount = Math.max(columnCount, (rows[i] || []).length);
  }

  const rawHeaderRow: string[] = [];
  for (let c = 0; c < columnCount; c += 1) {
    const value = headerRowIndex >= 0 ? (rows[headerRowIndex] || [])[c] : null;
    rawHeaderRow.push(String(value ?? '').trim());
  }
  const normalizedHeaderRow = rawHeaderRow.map(normalizeHeader);

  // Bos baslik hucrelerini index'i koruyarak etiketle: "(bos kolon N)"
  const headerLabels = rawHeaderRow.map((header, index) => (header ? header : `(bos kolon ${index + 1})`));

  // Her kolon icin ornek degerler (kullanici hangi kolon oldugunu anlasin diye)
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const samplesForColumn: string[] = [];
    const start = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    for (let i = start; i < rows.length && samplesForColumn.length < EXCEL_COLUMN_SAMPLE_COUNT; i += 1) {
      const cell = (rows[i] || [])[index];
      const text = cell === null || cell === undefined ? '' : String(cell).trim();
      if (text) samplesForColumn.push(text);
    }
    return { index, header: rawHeaderRow[index] || '', label: headerLabels[index], samples: samplesForColumn };
  });

  // Ilk ~15 ham satir (baslik satiri secimi dropdown'u icin)
  const rawRows = rows.slice(0, EXCEL_RAW_ROW_COUNT).map((row) => {
    const out: string[] = [];
    for (let c = 0; c < columnCount; c += 1) {
      const cell = (row || [])[c];
      out.push(cell === null || cell === undefined ? '' : String(cell).trim());
    }
    return out;
  });

  const codeIndex = headerRowIndex >= 0 ? resolveHeaderIndex(normalizedHeaderRow, supplier.excelCodeHeader, CODE_HEADERS) : -1;
  const priceIndexes = headerRowIndex >= 0 ? resolvePriceHeaderIndexes(normalizedHeaderRow, supplier.excelPriceHeader, supplier) : [];
  const priceIndex = priceIndexes.length ? priceIndexes[0] : -1;
  const nameIndex = headerRowIndex >= 0 ? resolveHeaderIndex(normalizedHeaderRow, supplier.excelNameHeader, NAME_HEADERS) : -1;

  const samples: Array<{ code?: string | null; name?: string | null; price?: number | null }> = [];
  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < Math.min(rows.length, headerRowIndex + 1 + EXCEL_SAMPLE_ROW_COUNT); i += 1) {
      const row = rows[i] || [];
      const priceValues = priceIndexes
        .map((index) => parseNumber(row[index]))
        .filter((value): value is number => value !== null);
      let price: number | null = null;
      if (priceValues.length) {
        price = supplier.priceByColor && priceValues.length > 1 ? Math.max(...priceValues) : priceValues[0];
      }
      samples.push({
        code: codeIndex >= 0 ? row[codeIndex] : null,
        name: nameIndex >= 0 ? row[nameIndex] : null,
        price,
      });
    }
  }

  // detected: kolon INDEX'i bazli "#col:N" sentinel'i dondur. Boylece frontend
  // dropdown'lari index'e gore on-secer; baslik metni/duzeni degisse de saglam kalir.
  const asColumnToken = (index: number) => (index >= 0 ? `#col:${index}` : null);

  return {
    sheetNames,
    sheetName,
    headerRow: headerRowIndex >= 0 ? headerRowIndex + 1 : null,
    headers: rawHeaderRow,
    headerLabels,
    normalizedHeaders: normalizedHeaderRow,
    columns,
    rawRows,
    detected: {
      code: asColumnToken(codeIndex),
      name: asColumnToken(nameIndex),
      price: asColumnToken(priceIndex),
    },
    samples,
  };
};

const buildPdfPreview = async (filePath: string, supplier: any) => {
  const { columns, rows } = await buildPdfTable(filePath, { maxPages: 2 });
  const detected = resolvePdfColumnMapping(rows, columns.length, supplier);

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

    let sampleRows = mergePdfNameRows(rows).filter((row) => {
    const line = getPdfRowLine(row);
    if (!line || isPdfMetaLine(line)) return false;
    return pdfRowHasPrice(row);
  });

  if (!sampleRows.length) {
    sampleRows = mergePdfNameRows(rows).filter((row) => {
      const line = getPdfRowLine(row);
      if (!line || isPdfMetaLine(line)) return false;
      return row.cells.some((cell) => isMeaningfulPdfCell(cell));
    });
  }

  const previewColumns = columns.map((column) => {
    const samples = sampleRows
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

// Kayit payload'unu normalize et: `defaultDiscounts` sinirsiz sayi dizisi olarak
// temizlenir (bos/gecersiz ise null). discount1..5 kabulu geri-uyum icin korunur.
const normalizeSupplierPayload = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  const payload: any = { ...data };

  if ('defaultDiscounts' in payload) {
    const raw = payload.defaultDiscounts;
    if (Array.isArray(raw)) {
      const cleaned = normalizeDiscountValues(raw);
      payload.defaultDiscounts = cleaned.length ? cleaned : null;
    } else if (raw === null || raw === undefined || raw === '') {
      payload.defaultDiscounts = null;
    } else {
      // Beklenmeyen tip gelirse Prisma Json kolonunu bozmamak icin null'a cevir.
      payload.defaultDiscounts = null;
    }
  }

  return payload;
};

class SupplierPriceListService {
  async listSuppliers() {
    return prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async createSupplier(data: any) {
    return prisma.supplier.create({ data: normalizeSupplierPayload(data) });
  }

  async updateSupplier(id: string, data: any) {
    return prisma.supplier.update({ where: { id }, data: normalizeSupplierPayload(data) });
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
          itemId: item.id,
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

    // Eslesen urunlerin B2B birim bilgisi (KOLI/ADET vb.) ipucu icin cekilir.
    // Boylece kullanici birim carpanini (1 koli=50 adet gibi) dogru ayarlayabilir.
    const productCodes = Array.from(
      new Set(matches.map((match: any) => match.productCode).filter(Boolean)),
    );
    const products = productCodes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: productCodes as string[] } },
          select: { mikroCode: true, unit: true, unit2: true, unit2Factor: true },
        })
      : [];
    const productByCode = new Map<string, { unit: string | null; unit2: string | null; unit2Factor: number | null }>();
    for (const product of products) {
      productByCode.set(product.mikroCode, {
        unit: product.unit ?? null,
        unit2: product.unit2 ?? null,
        unit2Factor: product.unit2Factor ?? null,
      });
    }

    return {
      items: matches.map((match: any) => {
        const matchSourcePrice = typeof match.sourcePrice === 'number' ? match.sourcePrice : match.item.sourcePrice;
        const matchNetPrice = typeof match.netPrice === 'number' ? match.netPrice : match.item.netPrice;
        // Birim carpani: null / <=0 -> 1 (davranis degismez). newCost buna gore hesaplanir
        // ki hem tablo hem toplu uygulama (row.newCost'tan) tutarli olsun.
        const multiplier = typeof match.unitMultiplier === 'number' && match.unitMultiplier > 0 ? match.unitMultiplier : 1;
        const newCost = typeof matchNetPrice === 'number' ? matchNetPrice * multiplier : matchNetPrice;
        const costDifference =
          typeof newCost === 'number' && typeof match.currentCost === 'number'
            ? newCost - match.currentCost
            : match.costDifference;
        const productInfo = productByCode.get(match.productCode) || null;
        return {
          matchId: match.id,
          itemId: match.itemId,
          supplierCode: match.item.supplierCode,
          supplierName: match.item.supplierName,
          sourcePrice: matchSourcePrice,
          netPrice: matchNetPrice,
          priceCurrency: match.item.priceCurrency,
          priceIncludesVat: match.item.priceIncludesVat,
          matchCount: match.item.matchCount,
          productCode: match.productCode,
          productName: match.productName,
          currentCost: match.currentCost,
          newCost,
          costDifference,
          percentDifference: computePercentDifference(match.currentCost, costDifference),
          unitMultiplier: typeof match.unitMultiplier === 'number' ? match.unitMultiplier : null,
          matchScore: typeof match.matchScore === 'number' ? match.matchScore : null,
          manualMatch: Boolean(match.manualMatch),
          productUnit: productInfo?.unit ?? null,
          productUnit2: productInfo?.unit2 ?? null,
          productUnit2Factor: productInfo?.unit2Factor ?? null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // Elle girilen birim carpanini kaydeder. value <= 0 veya null -> null (=1 davranisi).
  async updateMatchUnitMultiplier(matchId: string, value: number | null) {
    const normalized =
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
    return prisma.supplierPriceListMatch.update({
      where: { id: matchId },
      data: { unitMultiplier: normalized },
    });
  }

  // Ana saglayici (main supplier) listesi (Mikro). Isim modu upload'unda secim icin. (SADECE OKUMA)
  async getMainSuppliers() {
    const suppliers = await mikroService.getMainSupplierList();
    return suppliers.map((s) => ({
      cariKod: s.cariKod,
      cariName: s.cariName,
      productCount: s.productCount,
    }));
  }

  // Bir ana saglayici altindaki urunler icinde ada/koda gore arama (elle duzeltme picker'i). (SADECE OKUMA)
  // Cikti sekli searchAllProducts ile uyumlu: { code, name, currentCost, unit }
  // (currentCost/unit best-effort B2B Product'tan doldurulur; picker'da gosterilir).
  async searchMainSupplierProducts(cariKod: string, query?: string, limit = 30) {
    const normalizedCari = String(cariKod || '').trim();
    if (!normalizedCari) return [];
    const products = await mikroService.getProductsByMainSupplier(normalizedCari);
    const q = normalizeText(query || '');
    let filtered = products;
    if (q) {
      const qTokens = q.split(/\s+/).filter(Boolean);
      filtered = products.filter((p) => {
        const hay = `${normalizeText(p.name)} ${normalizeText(p.code)}`;
        return qTokens.every((token) => hay.includes(token));
      });
    }
    const sliced = filtered.slice(0, Math.max(1, Math.min(200, limit)));

    // B2B'de karsiligi olan urunler icin guncel maliyet + birim ipucu (opsiyonel).
    const codes = sliced.map((p) => p.code).filter(Boolean);
    const b2bByCode = new Map<string, { currentCost: number | null; unit: string | null }>();
    if (codes.length) {
      const b2bProducts = await prisma.product.findMany({
        where: { mikroCode: { in: codes } },
        select: { mikroCode: true, currentCost: true, unit: true },
      });
      for (const bp of b2bProducts) {
        b2bByCode.set(bp.mikroCode, { currentCost: bp.currentCost ?? null, unit: bp.unit ?? null });
      }
    }

    return sliced.map((p) => {
      const b2b = b2bByCode.get(p.code) || null;
      return {
        code: p.code,
        name: p.name,
        currentCost: b2b?.currentCost ?? null,
        unit: b2b?.unit ?? null,
      };
    });
  }

  // GLOBAL urun arama (elle duzeltme picker'i "Tum urunler" modu). Ana saglayici
  // kisitina bakmadan TUM aktif B2B urunlerinde ada/koda gore arar. Kelepir gibi
  // listelerde dogru urun baska saglayicida olabildigi icin gerekli. (SADECE OKUMA)
  // Cikti sekli searchMainSupplierProducts ile uyumlu: { code, name, currentCost, unit }.
  async searchAllProducts(query?: string, limit = 30) {
    const search = String(query || '').trim();
    if (!search) return [];
    const safeLimit = Math.max(1, Math.min(60, limit));

    const products = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { mikroCode: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { foreignName: { contains: search, mode: 'insensitive' } },
          { brandCode: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { mikroCode: true, name: true, currentCost: true, unit: true },
      orderBy: [{ mikroCode: 'asc' }],
      take: safeLimit,
    });

    return products.map((p) => ({
      code: p.mikroCode,
      name: p.name ?? null,
      currentCost: p.currentCost ?? null,
      unit: p.unit ?? null,
    }));
  }

  // Bir item icin (elle secilen) urunu match'e uygula: netPrice/costDifference yeniden hesaplanir.
  // Carpan (unitMultiplier) korunur; sonuc tablosu + apply DEGISMEDEN calisir.
  private async buildMatchDataForProduct(params: {
    item: { sourcePrice: number | null; sourcePriceAlt?: number | null; supplierName: string | null; rawLine?: string | null; priceCurrency?: string | null };
    supplierConfig: any;
    productCode: string;
  }) {
    const detailMap = await resolveProductDetailsByCodes([params.productCode]);
    const detail = detailMap.get(String(params.productCode).trim());
    if (!detail) {
      throw new Error('Urun bulunamadi (Mikro/B2B)');
    }

    const parsedItem: ParsedItem = {
      supplierCode: '',
      supplierName: params.item.supplierName ?? undefined,
      sourcePrice: params.item.sourcePrice ?? null,
      sourcePriceAlt: params.item.sourcePriceAlt ?? null,
      rawLine: params.item.rawLine ?? undefined,
      currency: params.item.priceCurrency ?? null,
    };

    const matchSourcePrice = resolveMatchSourcePrice(parsedItem, params.supplierConfig, {
      name: detail.name,
      currentCost: detail.currentCost,
      unit2Factor: detail.unit2Factor,
      vatRate: detail.vatRate,
    });
    const netPrice = computeMatchNetPrice(
      matchSourcePrice,
      params.supplierConfig,
      detail.vatRate ?? null,
      params.item.supplierName ?? null,
    );
    const difference =
      netPrice !== null && detail.currentCost !== null && detail.currentCost !== undefined
        ? Number((netPrice - detail.currentCost).toFixed(4))
        : null;

    return {
      productId: detail.id,
      productCode: detail.code,
      productName: detail.name || detail.code,
      currentCost: detail.currentCost ?? null,
      sourcePrice: matchSourcePrice ?? null,
      vatRate: detail.vatRate ?? null,
      netPrice,
      costDifference: difference,
    };
  }

  // Upload'un tedarikci config'ini (parse/net-fiyat kurallari icin) yeniden kur.
  private async resolveUploadSupplierConfig(uploadId: string) {
    const upload = await prisma.supplierPriceListUpload.findUnique({
      where: { id: uploadId },
      select: { supplierId: true, details: true },
    });
    if (!upload) throw new Error('Upload not found');
    const supplier = await prisma.supplier.findUnique({ where: { id: upload.supplierId } });
    if (!supplier) throw new Error('Supplier not found');
    return supplier;
  }

  // ELLE DUZELTME: mevcut bir match satirini baska bir urune (productCode) tasi.
  // netPrice/costDifference/newCost yeniden hesaplanir; unitMultiplier korunur.
  async setMatchProduct(matchId: string, productCode: string) {
    const code = String(productCode || '').trim();
    if (!code) throw new Error('productCode gerekli');

    const match = await prisma.supplierPriceListMatch.findUnique({
      where: { id: matchId },
      include: {
        item: {
          select: {
            id: true,
            uploadId: true,
            sourcePrice: true,
            supplierName: true,
            rawLine: true,
            priceCurrency: true,
          },
        },
      },
    });
    if (!match) throw new Error('Match not found');

    const supplierConfig = await this.resolveUploadSupplierConfig(match.item.uploadId);
    const data = await this.buildMatchDataForProduct({
      item: {
        sourcePrice: match.item.sourcePrice ?? null,
        supplierName: match.item.supplierName ?? null,
        rawLine: match.item.rawLine ?? null,
        priceCurrency: match.item.priceCurrency ?? null,
      },
      supplierConfig,
      productCode: code,
    });

    const updated = await prisma.supplierPriceListMatch.update({
      where: { id: matchId },
      data: {
        productId: data.productId,
        productCode: data.productCode,
        productName: data.productName,
        currentCost: data.currentCost,
        sourcePrice: data.sourcePrice,
        vatRate: data.vatRate,
        netPrice: data.netPrice,
        costDifference: data.costDifference,
        manualMatch: true,
      },
    });

    // matchedProductIds tutarliligini koru (item -> match).
    await this.syncItemMatchState(match.item.id);
    return updated;
  }

  // ELLE ATAMA / URUN EKLE: bir item'a YENI bir match ekler (coklu eslestirme).
  // Ayni tedarikci satiri bizdeki BIRDEN FAZLA urunle eslesebilir (ayni urun
  // birden fazla stok karti). Zaten ayni productCode ile bir match varsa tekrar
  // eklemez; mevcut match'i doner (idempotent). Mevcut match'i DEGISTIRMEZ
  // (degistirme setMatchProduct'tir).
  async assignItemProduct(itemId: string, productCode: string) {
    const code = String(productCode || '').trim();
    if (!code) throw new Error('productCode gerekli');

    const item = await prisma.supplierPriceListItem.findUnique({
      where: { id: itemId },
      include: { matches: { select: { id: true, productCode: true } } },
    });
    if (!item) throw new Error('Item not found');

    // Ayni urun zaten eslesmisse tekrar ekleme (dublikasyon apply'i bozardi).
    const existing = item.matches.find(
      (m) => String(m.productCode || '').trim().toUpperCase() === code.toUpperCase(),
    );
    if (existing) {
      return prisma.supplierPriceListMatch.findUnique({ where: { id: existing.id } });
    }

    const supplierConfig = await this.resolveUploadSupplierConfig(item.uploadId);
    const data = await this.buildMatchDataForProduct({
      item: {
        sourcePrice: item.sourcePrice ?? null,
        supplierName: item.supplierName ?? null,
        rawLine: item.rawLine ?? null,
        priceCurrency: item.priceCurrency ?? null,
      },
      supplierConfig,
      productCode: code,
    });

    const created = await prisma.supplierPriceListMatch.create({
      data: {
        itemId: item.id,
        productId: data.productId,
        productCode: data.productCode,
        productName: data.productName,
        currentCost: data.currentCost,
        sourcePrice: data.sourcePrice,
        vatRate: data.vatRate,
        netPrice: data.netPrice,
        costDifference: data.costDifference,
        manualMatch: true,
      },
    });

    await this.syncItemMatchState(item.id);
    return created;
  }

  // ELLE KALDIR: bir match'i siler (coklu eslestirmede yanlis/gereksiz olani cikar).
  // Item'in matchCount/matchedProductIds durumu yeniden senkronlanir.
  async deleteMatch(matchId: string) {
    const id = String(matchId || '').trim();
    if (!id) throw new Error('matchId gerekli');

    const match = await prisma.supplierPriceListMatch.findUnique({
      where: { id },
      select: { id: true, itemId: true },
    });
    if (!match) throw new Error('Match not found');

    await prisma.supplierPriceListMatch.delete({ where: { id } });
    await this.syncItemMatchState(match.itemId);
    return { deleted: true, itemId: match.itemId };
  }

  // item.matchCount + matchedProductIds alanlarini match sayisina gore senkronla.
  private async syncItemMatchState(itemId: string) {
    const matches = await prisma.supplierPriceListMatch.findMany({
      where: { itemId },
      select: { productId: true },
    });
    const matchedProductIds = matches
      .map((m) => m.productId)
      .filter((id): id is string => Boolean(id));
    await prisma.supplierPriceListItem.update({
      where: { id: itemId },
      data: {
        matchCount: matches.length,
        matchedProductIds,
      },
    });
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
        const matchSourcePrice = typeof match.sourcePrice === 'number' ? match.sourcePrice : item.sourcePrice;
        const matchNetPrice = typeof match.netPrice === 'number' ? match.netPrice : item.netPrice;
        matchedRows.push({
          'Tedarikci Kod': item.supplierCode,
          'Tedarikci Ad': item.supplierName || '',
          'Liste Fiyat': matchSourcePrice ?? '',
          'Net Fiyat': matchNetPrice ?? '',
          'Para Birimi': item.priceCurrency || 'TRY',
          'KDV Dahil': item.priceIncludesVat ? 'Evet' : 'Hayir',
          'Urun Kodu': match.productCode,
          'Urun Adi': match.productName,
          'Guncel Maliyet': match.currentCost ?? '',
          'Yeni Maliyet': matchNetPrice ?? '',
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

  async previewPriceLists(params: {
    supplierId: string;
    files: Express.Multer.File[];
    overrides?: SupplierConfigOverrides | null;
    matchMode?: 'code' | 'name';
  }) {
    const { supplierId, files, overrides } = params;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    const nameMode = params.matchMode === 'name';
    const previewSupplier = { ...resolveSupplierConfig(supplier, overrides), nameMode };
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
  async uploadPriceLists(params: {
    supplierId: string;
    uploadedById: string;
    files: Express.Multer.File[];
    overrides?: SupplierConfigOverrides | null;
    matchMode?: 'code' | 'name';
    mainSupplierCariCode?: string | null;
  }) {
    const { supplierId, uploadedById, files } = params;
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // Eslesme modu: 'name' ise ana saglayici bazli ISIM eslesmesi yapilir.
    const matchMode: 'code' | 'name' = params.matchMode === 'name' ? 'name' : 'code';

    // Parse config: name modunda parserlara "nameMode" bayragi gecilir (kod opsiyonel).
    const uploadSupplier = { ...resolveSupplierConfig(supplier, params.overrides), nameMode: matchMode === 'name' };
    const mainSupplierCariCode =
      matchMode === 'name' ? String(params.mainSupplierCariCode || '').trim() : '';
    if (matchMode === 'name' && !mainSupplierCariCode) {
      throw new Error('Isim eslesmesi icin ana saglayici (cari) secilmelidir');
    }

    // Ana saglayici adi (rapor detayinda gostermek icin).
    let mainSupplierName: string | null = null;
    if (matchMode === 'name') {
      try {
        const suppliers = await mikroService.getMainSupplierList();
        mainSupplierName =
          suppliers.find((s) => s.cariKod === mainSupplierCariCode)?.cariName ?? null;
      } catch {
        mainSupplierName = null;
      }
    }

    const upload = await prisma.supplierPriceListUpload.create({
      data: {
        supplierId,
        uploadedById,
        fileCount: files.length,
        status: 'PENDING',
        matchMode,
        mainSupplierCode: mainSupplierCariCode || null,
        mainSupplierName,
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

      // Isim modunda kod'a gore birlestirme YAPMA (ayni koda sahip farkli
      // adlar yanlis birleserdi); her satir ada gore ayri eslesir.
      const consolidatedItems = matchMode === 'name'
        ? parsedItems
        : consolidateParsedItems(parsedItems);

      if (consolidatedItems.length === 0) {
        throw new Error('No rows parsed from uploaded files');
      }

      const itemsWithIds = [] as any[];
      const matchRows = [] as any[];

      if (matchMode === 'name') {
        // === ISIM MODU: ana saglayici urunleri arasinda ada gore eslestir ===
        const supplierProducts = await mikroService.getProductsByMainSupplier(mainSupplierCariCode);
        if (!supplierProducts.length) {
          throw new Error('Secilen ana saglayici altinda aktif urun bulunamadi');
        }
        const nameMatcher = buildNameMatcher(supplierProducts);

        // Eslesen Mikro kodlari icin urun detaylarini (maliyet/kdv/birim2/isim)
        // TEK seferde cozeriz: once B2B Product, eksikleri Mikro'dan.
        const bestByItem = consolidatedItems.map((item) => nameMatcher.findBest(item.supplierName));
        const matchedCodes = Array.from(
          new Set(
            bestByItem
              .filter((m) => m && m.score >= NAME_MATCH_THRESHOLD)
              .map((m) => (m as any).code as string),
          ),
        );
        const detailByCode = await resolveProductDetailsByCodes(matchedCodes);

        for (let i = 0; i < consolidatedItems.length; i += 1) {
          const item = consolidatedItems[i];
          const itemId = randomUUID();
          const best = bestByItem[i];
          const itemNetPrice = computeItemNetPrice(item.sourcePrice ?? null, uploadSupplier, item.supplierName ?? null);
          const matched = best && best.score >= NAME_MATCH_THRESHOLD ? best : null;
          const detail = matched ? detailByCode.get(matched.code) || null : null;

          itemsWithIds.push({
            id: itemId,
            uploadId: upload.id,
            supplierCode: item.supplierCode || '',
            supplierName: item.supplierName,
            sourcePrice: item.sourcePrice ?? null,
            netPrice: itemNetPrice,
            priceCurrency: item.currency || 'TRY',
            priceIncludesVat: uploadSupplier.priceIncludesVat,
            rawLine: item.rawLine,
            matchCount: matched ? 1 : 0,
            matchedProductIds: matched && detail?.id ? [detail.id] : [],
          });

          if (matched && detail) {
            const matchSourcePrice = resolveMatchSourcePrice(item, uploadSupplier, {
              name: detail.name,
              currentCost: detail.currentCost,
              unit2Factor: detail.unit2Factor,
              vatRate: detail.vatRate,
            });
            const netPrice = computeMatchNetPrice(
              matchSourcePrice,
              uploadSupplier,
              detail.vatRate ?? null,
              item.supplierName ?? null,
            );
            const difference =
              netPrice !== null && detail.currentCost !== null && detail.currentCost !== undefined
                ? Number((netPrice - detail.currentCost).toFixed(4))
                : null;

            matchRows.push({
              id: randomUUID(),
              itemId,
              productId: detail.id,
              productCode: matched.code,
              productName: detail.name || matched.name || matched.code,
              currentCost: detail.currentCost ?? null,
              sourcePrice: matchSourcePrice ?? null,
              vatRate: detail.vatRate ?? null,
              netPrice,
              costDifference: difference,
              matchScore: matched.score,
              manualMatch: false,
            });
          }
        }
      } else {
        // === KOD MODU (varsayilan, mevcut davranis birebir korunur) ===
        const productMap = await buildProductMap();

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
            const matchSourcePrice = resolveMatchSourcePrice(item, uploadSupplier, product);
            const netPrice = computeMatchNetPrice(
              matchSourcePrice,
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
              sourcePrice: matchSourcePrice ?? null,
              vatRate: product.vatRate ?? null,
              netPrice,
              costDifference: difference,
            });
          }
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


















