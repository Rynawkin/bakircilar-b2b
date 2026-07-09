import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getStoredValue, setStoredValue } from '../storage/kv';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

type Depot = 'MERKEZ' | 'TOPCA';
type ViewKey = 'report' | 'families' | 'orders' | 'minmax' | 'excluded' | 'logs';

type SupplierOrderDraftLine = {
  key: string;
  selected: boolean;
  familyId: string | null;
  productCode: string;
  productName: string;
  supplierCode: string;
  supplierName: string;
  quantity: string;
  unitPrice: string;
  persistSupplierOverride: boolean;
};

type SupplierOrderConfig = {
  series: string;
  applyVAT: boolean;
  deliveryType: string;
  deliveryDate: string;
};

type UcarerDepotDraft = {
  orderDraftLines: Record<string, SupplierOrderDraftLine>;
  transferDraftLines: Record<string, TransferDraftLine>;
  supplierConfigs: Record<string, SupplierOrderConfig>;
  updatedAt: string;
};

type UcarerDraftStore = {
  version: 1;
  depots: Partial<Record<Depot, UcarerDepotDraft>>;
};

type TransferDraftLine = {
  key: string;
  productCode: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  restoredLine: SupplierOrderDraftLine;
};

type RecentSupplierSeries = {
  series: string;
  lastOrderNumber?: string | null;
  lastOrderDate?: string | null;
};

type DepotMinMaxEntry = {
  '1': { min: number; max: number };
  '6': { min: number; max: number };
};

type ProductPackMeta = {
  packQty: number;
  rawFactor: number;
  unit2Name?: string | null;
};

type FamilyPanelRow = {
  key: string;
  familyId: string | null;
  familyName: string;
  familyCode: string;
  itemCount: number;
  suggestedRows: number;
  suggestedQty: number;
  stockQty: number;
  minQty: number;
  maxQty: number;
  rows: any[];
};

type CreatedOrderLineSnapshot = {
  supplierCode: string;
  supplierName: string;
  orderNumber?: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type CreatedOrderBatchSnapshot = {
  createdAt: string;
  depot: Depot;
  orders: any[];
  failedOrders: any[];
  lines: CreatedOrderLineSnapshot[];
};

const UCARER_RECENT_SERIES_KEY = 'ucarer_recent_supplier_series_v1';
const UCARER_DRAFT_STORAGE_KEY = 'ucarer_depot_drafts_v1';
const UCARER_DRAFT_FILE_URI = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}${UCARER_DRAFT_STORAGE_KEY}.json`;

const emptyUcarerDraft = (): UcarerDepotDraft => ({
  orderDraftLines: {},
  transferDraftLines: {},
  supplierConfigs: {},
  updatedAt: new Date(0).toISOString(),
});

const asRecord = <T,>(value: unknown): Record<string, T> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {};

const normalizeUcarerDraft = (value: unknown): UcarerDepotDraft => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<UcarerDepotDraft>)
    : {};
  return {
    orderDraftLines: asRecord<SupplierOrderDraftLine>(source.orderDraftLines),
    transferDraftLines: asRecord<TransferDraftLine>(source.transferDraftLines),
    supplierConfigs: asRecord<SupplierOrderConfig>(source.supplierConfigs),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
  };
};

const readUcarerDraftStore = async (): Promise<UcarerDraftStore> => {
  try {
    const raw = Platform.OS === 'web'
      ? (globalThis as any).localStorage?.getItem(UCARER_DRAFT_STORAGE_KEY)
      : UCARER_DRAFT_FILE_URI
        ? await FileSystem.readAsStringAsync(UCARER_DRAFT_FILE_URI)
        : null;
    if (!raw) return { version: 1, depots: {} };
    const parsed = JSON.parse(raw);
    const depots = parsed?.depots && typeof parsed.depots === 'object' ? parsed.depots : {};
    return {
      version: 1,
      depots: {
        MERKEZ: depots.MERKEZ ? normalizeUcarerDraft(depots.MERKEZ) : undefined,
        TOPCA: depots.TOPCA ? normalizeUcarerDraft(depots.TOPCA) : undefined,
      },
    };
  } catch {
    return { version: 1, depots: {} };
  }
};

const writeUcarerDraftStore = async (store: UcarerDraftStore) => {
  try {
    const serialized = JSON.stringify(store);
    if (Platform.OS === 'web') {
      (globalThis as any).localStorage?.setItem(UCARER_DRAFT_STORAGE_KEY, serialized);
      return;
    }
    if (UCARER_DRAFT_FILE_URI) await FileSystem.writeAsStringAsync(UCARER_DRAFT_FILE_URI, serialized);
  } catch {
    // Taslak kolaylik verisidir; depolama hatasi operasyonu durdurmamalidir.
  }
};

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const numberText = (value: unknown) => n(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const money = (value: unknown) => `${numberText(value)} TL`;

const viewTitles: Record<ViewKey, string> = {
  report: 'Ucarer Depo Raporu',
  families: 'Aile Kapsama Paneli',
  orders: 'Tedarikci Siparis Taslagi',
  minmax: 'MinMax Isi',
  excluded: 'MinMax Haricler',
  logs: 'Islem Gecmisi',
};

const cell = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? ''))).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleString('tr-TR');
};

const rowValue = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
};

const productCodeOf = (row: any) =>
  String(rowValue(row, ['productCode', 'stokKodu', 'stockCode', 'Kod', 'Stok Kodu', 'sto_kod']) || '').trim();

const productNameOf = (row: any) =>
  String(rowValue(row, ['productName', 'stokAdi', 'stockName', 'Urun Adi', 'Stok Adi', 'sto_isim']) || productCodeOf(row) || '-').trim();

const suggestedOf = (row: any) =>
  rowValue(row, ['suggested', 'suggestedQty', 'orderQty', 'siparisOnerisi', 'Oneri', 'Aile Oneri', '4.Sorun', '3.Sorun']);

const stockOf = (row: any) =>
  rowValue(row, ['realQty', 'depotQty', 'stockQty', 'stock', 'Reel Miktar', 'Depo Miktari']);

const counterStockOf = (row: any, depot: Depot) =>
  depot === 'MERKEZ'
    ? rowValue(row, ['topcaDepotQty', 'topcaDepot', 'Topca Depo Miktari', 'Topca Depo Miktarı', 'Topca Depo'])
    : rowValue(row, ['merkezDepotQty', 'merkezDepot', 'Merkez Depo Miktari', 'Merkez Depo Miktarı', 'Merkez Depo']);

const counterDepotNo = (depot: Depot): '1' | '6' => (depot === 'MERKEZ' ? '6' : '1');
const counterDepotLabel = (depot: Depot) => (depot === 'MERKEZ' ? 'Topca' : 'Merkez');

const minOf = (row: any) => rowValue(row, ['minQty', 'min', 'Min']);
const maxOf = (row: any) => rowValue(row, ['maxQty', 'max', 'Max']);
const incomingOf = (row: any) => rowValue(row, ['incomingOrders', 'incomingOrderQty', 'Alinan Siparis']);
const outgoingOf = (row: any) => rowValue(row, ['outgoingOrders', 'outgoingOrderQty', 'Verilen Siparis']);
const familyIdOf = (row: any) => String(rowValue(row, ['familyId', 'productFamilyId', 'family_id']) || '').trim() || null;
const supplierCodeOf = (row: any) =>
  String(rowValue(row, ['supplierCode', 'mainSupplierCode', 'anaSaglayiciKodu', 'Saglayici Kodu', 'Ana Saglayici']) || '').trim().toUpperCase();
const supplierNameOf = (row: any) =>
  String(rowValue(row, ['supplierName', 'mainSupplierName', 'anaSaglayiciAdi', 'Saglayici Adi', 'Ana Saglayici Adi']) || supplierCodeOf(row) || '').trim();
const unitPriceOf = (row: any) =>
  rowValue(row, ['costP', 'costIncVat', 'currentCostP', 'unitPrice', 'currentCost', 'costExVat', 'Maliyet']);

const todayInputValue = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const buildUcarerRows = (view: ViewKey, rows: any[], jobStatus: any | null) => {
  if (view === 'report') {
    return [
      ['Depo/Urun Kodu', 'Urun Adi', 'Aile/Model', 'Oneri', 'Stok', 'Min', 'Max', 'Alinan Siparis', 'Verilen Siparis', 'Maliyet', 'Durum'],
      ...rows.map((row) => {
        const suggested = n(suggestedOf(row));
        return [
          cell(productCodeOf(row)),
          cell(productNameOf(row)),
          cell(row.familyName || row.familyCode || row.stoModelKodu),
          cell(suggested),
          cell(stockOf(row)),
          cell(minOf(row)),
          cell(maxOf(row)),
          cell(incomingOf(row)),
          cell(outgoingOf(row)),
          cell(row.costExVat || row.costIncVat),
          suggested > 0 ? 'Oneri' : 'Bekle',
        ];
      }),
    ];
  }
  if (view === 'families') {
    return [
      ['Aile', 'Kod', 'Kalem', 'Onerili Kalem', 'Oneri Miktar', 'Stok', 'Min', 'Max', 'Durum'],
      ...rows.map((family: FamilyPanelRow) => [
        cell(family.familyName),
        cell(family.familyCode),
        cell(family.itemCount),
        cell(family.suggestedRows),
        cell(family.suggestedQty),
        cell(family.stockQty),
        cell(family.minQty),
        cell(family.maxQty),
        family.suggestedQty > 0 ? 'Siparis ihtiyaci' : 'Kapali',
      ]),
    ];
  }
  if (view === 'excluded') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Model', '1 Ay Cari', '2 Ay Cari', '3 Ay Cari', 'Min', 'Max', 'Stok'],
      ...rows.map((row) => [
        cell(row.productCode || productCodeOf(row)),
        cell(row.productName || productNameOf(row)),
        cell(row.stoModelKodu || row.modelCode),
        cell(row.distinctCustomersLast1Month),
        cell(row.distinctCustomersLast2Months),
        cell(row.distinctCustomersLast3Months),
        cell(row.minQty || row.min),
        cell(row.maxQty || row.max),
        cell(row.stockQty || row.stock),
      ]),
    ];
  }
  if (view === 'logs') {
    return [
      ['Tarih', 'Islem', 'Baslik', 'Stok Kodu', 'Aile', 'Kullanici', 'Siparisler', 'Detay'],
      ...rows.map((log) => [
        cell(dateText(log.createdAt)),
        cell(log.operationType),
        cell(log.title),
        cell(log.productCode),
        cell(log.familyName || log.familyId),
        cell(log.userName),
        cell(Array.isArray(log.orderNumbers) ? log.orderNumbers.join(', ') : log.orderNumbers),
        cell(log.details || log.payload || log.note),
      ]),
    ];
  }
  if (view === 'orders') {
    return [
      ['Tip', 'Secili', 'Tedarikci Kodu', 'Tedarikci Adi', 'Urun Kodu', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Tutar', 'Kalici Tedarikci'],
      ...rows.map((line) => [
        line.restoredLine ? 'DSV Transfer' : 'Tedarikci Siparisi',
        line.selected ? 'Evet' : 'Hayir',
        cell(line.supplierCode),
        cell(line.supplierName),
        cell(line.productCode),
        cell(line.productName),
        cell(line.quantity),
        cell(line.unitPrice),
        cell(n(line.quantity) * n(line.unitPrice)),
        line.persistSupplierOverride ? 'Evet' : 'Hayir',
      ]),
    ];
  }

  const job = jobStatus || {};
  const jobRows = Array.isArray(job.data?.rows) ? job.data.rows : [];
  return [
    ['Job ID', 'Durum', 'Baslangic', 'Bitis', 'Satir', 'Hata'],
    [cell(job.id), cell(job.status), cell(dateText(job.startedAt)), cell(dateText(job.finishedAt)), cell(job.data?.total ?? jobRows.length), cell(job.error)],
    [],
    ['Urun Kodu', 'Urun Adi', 'Oneri', 'Min', 'Max', 'Stok', 'Durum'],
    ...jobRows.map((row: any) => [
      cell(productCodeOf(row)),
      cell(productNameOf(row)),
      cell(suggestedOf(row)),
      cell(minOf(row)),
      cell(maxOf(row)),
      cell(stockOf(row)),
      cell(row.status || row.result),
    ]),
  ];
};

const buildUcarerPdfHtml = ({
  title,
  subtitle,
  sheetRows,
}: {
  title: string;
  subtitle: string;
  sheetRows: any[][];
}) => {
  const [headers = [], ...bodyRows] = sheetRows;
  const maxColumns = Math.max(...sheetRows.map((row) => row.length), 1);
  const pdfHeaders = Array.from({ length: maxColumns }, (_, index) => cell(headers[index] ?? ''));
  const colSpan = Math.max(pdfHeaders.length, 1);
  const generatedAt = new Date().toLocaleString('tr-TR');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 18px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #14223b; background: #ffffff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #15356b; padding-bottom: 10px; margin-bottom: 14px; }
    .brand { font-size: 12px; color: #64748b; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 4px 0 6px; font-size: 22px; color: #15356b; }
    .subtitle { font-size: 12px; color: #475569; }
    .meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #15356b; color: #ffffff; font-size: 10px; text-align: left; padding: 7px 6px; border: 1px solid #dbeafe; }
    td { font-size: 9px; padding: 6px; border: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; }
    .spacer td { border: 0; height: 10px; background: #ffffff !important; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Bakircilar B2B</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">${escapeHtml(subtitle)}</div>
    </div>
    <div class="meta">
      <div>Olusturma: ${escapeHtml(generatedAt)}</div>
      <div>Satir: ${Math.max(sheetRows.length - 1, 0)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>${pdfHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${bodyRows
        .map((row) =>
          row.length
            ? `<tr>${pdfHeaders.map((_, index) => `<td>${escapeHtml(cell(row[index]))}</td>`).join('')}</tr>`
            : `<tr class="spacer"><td colspan="${colSpan}"></td></tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
};

const buildCreatedOrderPdfHtml = (batch: CreatedOrderBatchSnapshot, mode: 'supplier' | 'manager') => {
  const generatedAt = new Date().toLocaleString('tr-TR');
  const linesBySupplier = batch.lines.reduce((groups, line) => {
    const supplierCode = String(line.supplierCode || '').trim().toUpperCase();
    if (!supplierCode) return groups;
    const current = groups.get(supplierCode) || [];
    current.push(line);
    groups.set(supplierCode, current);
    return groups;
  }, new Map<string, CreatedOrderLineSnapshot[]>());
  const suppliers = Array.from(linesBySupplier.entries())
    .map(([supplierCode, lines]) => {
      const order = batch.orders.find((item) => String(item.supplierCode || '').trim().toUpperCase() === supplierCode) || {};
      const supplierName = String(order.supplierName || lines[0]?.supplierName || supplierCode).trim();
      const orderNumber = String(order.orderNumber || lines[0]?.orderNumber || '').trim();
      const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);
      return {
        supplierCode,
        supplierName,
        orderNumber,
        lines: lines.sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr')),
        totalAmount,
      };
    })
    .sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr'));
  const grandTotal = suppliers.reduce((sum, item) => sum + item.totalAmount, 0);
  const title = mode === 'manager' ? 'Toplu Siparis Yonetici Onay Ozeti' : 'Tedarikci Siparis Ozetleri';
  const subtitle = `${batch.depot} - ${new Date(batch.createdAt).toLocaleString('tr-TR')} - ${suppliers.length} tedarikci`;
  const summaryTable =
    mode === 'manager'
      ? `
        <table class="summary">
          <thead>
            <tr><th>Cari Kodu</th><th>Cari Unvan</th><th>Siparis No</th><th>Kalem</th><th>Tutar</th></tr>
          </thead>
          <tbody>
            ${suppliers
              .map(
                (supplier) => `
                  <tr>
                    <td>${escapeHtml(supplier.supplierCode)}</td>
                    <td>${escapeHtml(supplier.supplierName)}</td>
                    <td>${escapeHtml(supplier.orderNumber || '-')}</td>
                    <td class="right">${supplier.lines.length.toLocaleString('tr-TR')}</td>
                    <td class="right">${escapeHtml(money(supplier.totalAmount))}</td>
                  </tr>`
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="4" class="right">Genel Toplam</td><td class="right">${escapeHtml(money(grandTotal))}</td></tr>
          </tfoot>
        </table>`
      : '';
  const failedSection = batch.failedOrders.length
    ? `
      <section class="failed">
        <h2>Olusmayan Cariler</h2>
        <ul>
          ${batch.failedOrders
            .map((item) => `<li>${escapeHtml(item.supplierCode || '-')} - ${escapeHtml(item.error || item.message || 'Hata')}</li>`)
            .join('')}
        </ul>
      </section>`
    : '';

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 18px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #14223b; background: #ffffff; }
    .header { border-bottom: 2px solid #15356b; padding-bottom: 10px; margin-bottom: 14px; }
    .brand { font-size: 12px; color: #64748b; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 4px 0 6px; font-size: 21px; color: #15356b; }
    h2 { margin: 0 0 8px; font-size: 13px; color: #15356b; }
    .subtitle { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: #475569; }
    .summary { margin-bottom: 16px; }
    .supplier { page-break-inside: avoid; margin: 0 0 16px; border: 1px solid #dbeafe; border-radius: 8px; overflow: hidden; }
    .supplier-head { background: #eff6ff; padding: 9px 10px; border-bottom: 1px solid #dbeafe; }
    .supplier-meta { font-size: 11px; color: #475569; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #15356b; color: #ffffff; font-size: 10px; text-align: left; padding: 7px 6px; border: 1px solid #dbeafe; }
    td { font-size: 9px; padding: 6px; border: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; }
    tfoot td { background: #f1f5f9; font-weight: 700; }
    .right { text-align: right; }
    .failed { margin-top: 14px; padding: 10px; border: 1px solid #fecaca; border-radius: 8px; background: #fef2f2; color: #7f1d1d; }
    .failed ul { margin: 6px 0 0; padding-left: 18px; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Bakircilar B2B</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">
      <span>${escapeHtml(subtitle)}</span>
      <span>Olusturma: ${escapeHtml(generatedAt)}</span>
    </div>
  </div>
  ${summaryTable}
  ${suppliers
    .map(
      (supplier) => `
        <section class="supplier">
          <div class="supplier-head">
            <h2>${escapeHtml(supplier.supplierCode)} - ${escapeHtml(supplier.supplierName)}</h2>
            <div class="supplier-meta">Siparis No: ${escapeHtml(supplier.orderNumber || '-')} | Kalem: ${supplier.lines.length.toLocaleString('tr-TR')} | Toplam: ${escapeHtml(money(supplier.totalAmount))}</div>
          </div>
          <table>
            <thead>
              <tr><th>Stok Kodu</th><th>Urun</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr>
            </thead>
            <tbody>
              ${supplier.lines
                .map(
                  (line) => `
                    <tr>
                      <td>${escapeHtml(line.productCode)}</td>
                      <td>${escapeHtml(line.productName)}</td>
                      <td class="right">${line.quantity.toLocaleString('tr-TR')}</td>
                      <td class="right">${escapeHtml(money(line.unitPrice))}</td>
                      <td class="right">${escapeHtml(money(line.total))}</td>
                    </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </section>`
    )
    .join('')}
  ${failedSection}
</body>
</html>`;
};

function Chip({ label, active, onPress, danger }: { label: string; active?: boolean; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, danger && styles.chipDanger]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive, danger && styles.chipTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function UcarerDepotScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [view, setView] = useState<ViewKey>('report');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [depot, setDepot] = useState<Depot>('MERKEZ');
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState<any | null>(null);
  const [excludedRows, setExcludedRows] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [orderDraftLines, setOrderDraftLines] = useState<Record<string, SupplierOrderDraftLine>>({});
  const [transferDraftLines, setTransferDraftLines] = useState<Record<string, TransferDraftLine>>({});
  const [supplierConfigs, setSupplierConfigs] = useState<Record<string, SupplierOrderConfig>>({});
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [creatingTransfer, setCreatingTransfer] = useState(false);
  const [lastOrderResult, setLastOrderResult] = useState<any | null>(null);
  const [lastCreatedOrderBatch, setLastCreatedOrderBatch] = useState<CreatedOrderBatchSnapshot | null>(null);
  const [lastTransferResult, setLastTransferResult] = useState<any | null>(null);
  const [editProductCode, setEditProductCode] = useState<string | null>(null);
  const [costPByCode, setCostPByCode] = useState<Record<string, string>>({});
  const [costTByCode, setCostTByCode] = useState<Record<string, string>>({});
  const [supplierByCode, setSupplierByCode] = useState<Record<string, string>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [depotMinMaxByCode, setDepotMinMaxByCode] = useState<Record<string, DepotMinMaxEntry>>({});
  const [depotMinMaxLoading, setDepotMinMaxLoading] = useState(false);
  const [packMetaByCode, setPackMetaByCode] = useState<Record<string, ProductPackMeta>>({});
  const [recentSeriesBySupplier, setRecentSeriesBySupplier] = useState<Record<string, RecentSupplierSeries[]>>({});
  const [activeFamilyKey, setActiveFamilyKey] = useState<string | null>(null);
  const actionLoadingRef = useRef(false);
  const creatingOrdersRef = useRef(false);
  const creatingTransferRef = useRef(false);
  const exportingRef = useRef(false);
  const reportRequestSeqRef = useRef(0);
  const excludedRequestSeqRef = useRef(0);
  const logsRequestSeqRef = useRef(0);
  const jobRequestSeqRef = useRef(0);
  const draftStoreRef = useRef<UcarerDraftStore>({ version: 1, depots: {} });
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsHydratedRef = useRef(false);

  const saveUcarerDraft = (
    targetDepot: Depot = depot,
    draft: UcarerDepotDraft = {
      orderDraftLines,
      transferDraftLines,
      supplierConfigs,
      updatedAt: new Date().toISOString(),
    }
  ) => {
    const nextStore: UcarerDraftStore = {
      version: 1,
      depots: { ...draftStoreRef.current.depots, [targetDepot]: draft },
    };
    draftStoreRef.current = nextStore;
    if (draftPersistTimerRef.current) clearTimeout(draftPersistTimerRef.current);
    draftPersistTimerRef.current = setTimeout(() => {
      draftPersistTimerRef.current = null;
      void writeUcarerDraftStore(nextStore);
    }, 250);
  };

  const selectDepot = (nextDepot: Depot) => {
    if (nextDepot === depot) return;
    if (draftsHydratedRef.current) saveUcarerDraft(depot);
    const nextDraft = draftStoreRef.current.depots[nextDepot] || emptyUcarerDraft();
    setDepot(nextDepot);
    setOrderDraftLines(nextDraft.orderDraftLines);
    setTransferDraftLines(nextDraft.transferDraftLines);
    setSupplierConfigs(nextDraft.supplierConfigs);
  };

  useEffect(() => {
    let active = true;
    const hydrateDrafts = async () => {
      const store = await readUcarerDraftStore();
      if (!active) return;
      draftStoreRef.current = store;
      const initialDraft = store.depots.MERKEZ || emptyUcarerDraft();
      setOrderDraftLines(initialDraft.orderDraftLines);
      setTransferDraftLines(initialDraft.transferDraftLines);
      setSupplierConfigs(initialDraft.supplierConfigs);
      draftsHydratedRef.current = true;
      setDraftsHydrated(true);
    };
    void hydrateDrafts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftsHydrated) return;
    saveUcarerDraft();
  }, [draftsHydrated, depot, orderDraftLines, transferDraftLines, supplierConfigs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && draftsHydratedRef.current) {
        if (draftPersistTimerRef.current) clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
        void writeUcarerDraftStore(draftStoreRef.current);
      }
    });
    return () => {
      subscription.remove();
      if (draftPersistTimerRef.current) clearTimeout(draftPersistTimerRef.current);
      if (draftsHydratedRef.current) void writeUcarerDraftStore(draftStoreRef.current);
    };
  }, []);

  const isOperationBusy = () => actionLoadingRef.current || creatingOrdersRef.current || creatingTransferRef.current;

  const beginAction = () => {
    if (isOperationBusy()) return false;
    actionLoadingRef.current = true;
    setActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLoadingRef.current = false;
    setActionLoading(false);
  };

  const beginOrderCreation = () => {
    if (isOperationBusy()) return false;
    creatingOrdersRef.current = true;
    setCreatingOrders(true);
    return true;
  };

  const endOrderCreation = () => {
    creatingOrdersRef.current = false;
    setCreatingOrders(false);
  };

  const beginTransferCreation = () => {
    if (isOperationBusy()) return false;
    creatingTransferRef.current = true;
    setCreatingTransfer(true);
    return true;
  };

  const endTransferCreation = () => {
    creatingTransferRef.current = false;
    setCreatingTransfer(false);
  };

  const beginExport = () => {
    if (exportingRef.current) return false;
    exportingRef.current = true;
    setExporting(true);
    return true;
  };

  const endExport = () => {
    exportingRef.current = false;
    setExporting(false);
  };

  const filteredRows = useMemo(() => {
    const term = normalizeSearchText(search);
    if (!term) return reportRows;
    return reportRows.filter((row) => {
      return normalizeSearchText(`${productCodeOf(row)} ${productNameOf(row)}`).includes(term);
    });
  }, [reportRows, search]);

  const reportSummary = useMemo(() => {
    const orderRows = reportRows.filter((row) => n(suggestedOf(row)) > 0);
    return {
      totalRows: reportTotal || reportRows.length,
      suggestedRows: orderRows.length,
      suggestedQty: orderRows.reduce((sum, row) => sum + n(suggestedOf(row)), 0),
    };
  }, [reportRows, reportTotal]);

  const familyPanelRows = useMemo<FamilyPanelRow[]>(() => {
    const groups = new Map<string, FamilyPanelRow>();
    reportRows.forEach((row) => {
      const familyId = familyIdOf(row);
      const familyName = String(row.familyName || row.familyCode || row.stoModelKodu || 'Ailesiz').trim();
      const familyCode = String(row.familyCode || row.stoModelKodu || familyId || '').trim();
      const key = familyId || familyCode || familyName;
      const current = groups.get(key) || {
        key,
        familyId,
        familyName,
        familyCode,
        itemCount: 0,
        suggestedRows: 0,
        suggestedQty: 0,
        stockQty: 0,
        minQty: 0,
        maxQty: 0,
        rows: [],
      };
      const suggested = n(suggestedOf(row));
      current.itemCount += 1;
      current.suggestedRows += suggested > 0 ? 1 : 0;
      current.suggestedQty += suggested;
      current.stockQty += n(stockOf(row));
      current.minQty += n(minOf(row));
      current.maxQty += n(maxOf(row));
      current.rows.push(row);
      groups.set(key, current);
    });
    return Array.from(groups.values())
      .filter((family) => family.itemCount > 1 || family.suggestedQty > 0)
      .sort((a, b) => (b.suggestedQty - a.suggestedQty) || (b.suggestedRows - a.suggestedRows) || a.familyName.localeCompare(b.familyName, 'tr'));
  }, [reportRows]);

  const reportRowByCode = useMemo(() => {
    const map = new Map<string, any>();
    reportRows.forEach((row) => {
      const code = productCodeOf(row).toUpperCase();
      if (code) map.set(code, row);
    });
    return map;
  }, [reportRows]);

  const selectedDraftLines = useMemo(
    () =>
      Object.values(orderDraftLines)
        .filter((line) => line.selected && n(line.quantity) > 0 && line.productCode && line.supplierCode)
        .sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr') || a.productCode.localeCompare(b.productCode, 'tr')),
    [orderDraftLines]
  );

  const supplierDraftGroups = useMemo(() => {
    const groups = new Map<string, {
      supplierCode: string;
      supplierName: string;
      itemCount: number;
      totalQuantity: number;
      totalAmount: number;
    }>();
    selectedDraftLines.forEach((line) => {
      const group = groups.get(line.supplierCode) || {
        supplierCode: line.supplierCode,
        supplierName: line.supplierName || line.supplierCode,
        itemCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
      };
      const quantity = n(line.quantity);
      const unitPrice = n(line.unitPrice);
      group.itemCount += 1;
      group.totalQuantity += quantity;
      group.totalAmount += quantity * unitPrice;
      groups.set(line.supplierCode, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr'));
  }, [selectedDraftLines]);

  const orderDraftSummary = useMemo(() => ({
    selectedLines: selectedDraftLines.length,
    suppliers: supplierDraftGroups.length,
    totalQuantity: selectedDraftLines.reduce((sum, line) => sum + n(line.quantity), 0),
    totalAmount: selectedDraftLines.reduce((sum, line) => sum + n(line.quantity) * n(line.unitPrice), 0),
  }), [selectedDraftLines, supplierDraftGroups]);

  const transferDraftList = useMemo(
    () => Object.values(transferDraftLines).sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr')),
    [transferDraftLines]
  );

  const transferDraftSummary = useMemo(() => ({
    lines: transferDraftList.length,
    totalQuantity: transferDraftList.reduce((sum, line) => sum + n(line.quantity), 0),
    totalAmount: transferDraftList.reduce((sum, line) => sum + n(line.quantity) * n(line.unitPrice), 0),
  }), [transferDraftList]);

  const draftProductCodesKey = useMemo(() => {
    const codes = new Set<string>();
    Object.values(orderDraftLines).forEach((line) => {
      const code = String(line.productCode || '').trim().toUpperCase();
      if (code) codes.add(code);
    });
    transferDraftList.forEach((line) => {
      const code = String(line.productCode || '').trim().toUpperCase();
      if (code) codes.add(code);
    });
    return Array.from(codes).sort().join('|');
  }, [orderDraftLines, transferDraftList]);

  useEffect(() => {
    loadReport();
    loadRecentSeries();
  }, [depot]);

  const loadRecentSeries = async () => {
    try {
      const raw = await getStoredValue(UCARER_RECENT_SERIES_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object') {
        setRecentSeriesBySupplier(parsed);
      }
    } catch {
      setRecentSeriesBySupplier({});
    }
  };

  const rememberRecentSeries = async (createdOrders: any[]) => {
    if (!Array.isArray(createdOrders) || createdOrders.length === 0) return;
    const now = new Date().toISOString();
    const next: Record<string, RecentSupplierSeries[]> = { ...recentSeriesBySupplier };
    createdOrders.forEach((order) => {
      const supplierCode = String(order?.supplierCode || '').trim().toUpperCase();
      const series = String(supplierConfigs[supplierCode]?.series || '').trim().toUpperCase();
      if (!supplierCode || !series) return;
      const current = next[supplierCode] || [];
      next[supplierCode] = [
        {
          series,
          lastOrderNumber: order?.orderNumber || null,
          lastOrderDate: now,
        },
        ...current.filter((item) => item.series !== series),
      ].slice(0, 5);
    });
    setRecentSeriesBySupplier(next);
    try {
      await setStoredValue(UCARER_RECENT_SERIES_KEY, JSON.stringify(next));
    } catch {
      // Seri gecmisi kullanici kolayligi icindir; kaydedilemezse is akisini bozma.
    }
  };

  useEffect(() => {
    const codes = draftProductCodesKey.split('|').filter(Boolean);
    const missing = codes.filter((code) => !depotMinMaxByCode[code]);
    if (!missing.length) return;

    let active = true;
    const load = async () => {
      setDepotMinMaxLoading(true);
      try {
        const next: Record<string, DepotMinMaxEntry> = {};
        for (let i = 0; i < missing.length; i += 200) {
          const chunk = missing.slice(i, i + 200);
          const result = await adminApi.getUcarerDepotMinMax(chunk);
          Object.entries(result.data || {}).forEach(([code, value]) => {
            const normalized = String(code || '').trim().toUpperCase();
            if (normalized && value) next[normalized] = value as DepotMinMaxEntry;
          });
        }
        if (!active || Object.keys(next).length === 0) return;
        setDepotMinMaxByCode((current) => ({ ...current, ...next }));
      } catch {
        // Bu veri sadece DSV onerisi icindir; tedarikci taslagini bloke etmez.
      } finally {
        if (active) setDepotMinMaxLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [draftProductCodesKey]);

  useEffect(() => {
    const codes = draftProductCodesKey.split('|').filter(Boolean);
    const missing = codes.filter((code) => !packMetaByCode[code]);
    if (!missing.length) return;

    let active = true;
    const load = async () => {
      try {
        const next: Record<string, ProductPackMeta> = {};
        for (let i = 0; i < missing.length; i += 200) {
          const chunk = missing.slice(i, i + 200);
          const response = await adminApi.getProductsByCodes(chunk);
          (response.products || []).forEach((product: any) => {
            const code = String(product?.mikroCode || product?.code || product?.stockCode || '').trim().toUpperCase();
            const rawFactor = n(product?.unit2Factor);
            const packQty = Math.abs(rawFactor);
            if (!code || packQty <= 0) return;
            next[code] = {
              packQty,
              rawFactor,
              unit2Name: String(product?.unit2Name || '').trim() || null,
            };
          });
        }
        if (!active || Object.keys(next).length === 0) return;
        setPackMetaByCode((current) => ({ ...current, ...next }));
      } catch {
        // Koli bilgisi sadece taslak kolayligidir; siparis akisini bloke etmez.
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [draftProductCodesKey]);

  const loadReport = async () => {
    const requestSeq = ++reportRequestSeqRef.current;
    setLoading(true);
    try {
      const response = await adminApi.getUcarerDepotReport({ depot, limit: 80 });
      if (requestSeq !== reportRequestSeqRef.current) return;
      setReportRows(response.data?.rows || []);
      setReportTotal(response.data?.total || 0);
    } catch (err: any) {
      if (requestSeq !== reportRequestSeqRef.current) return;
      Alert.alert('Ucarer depo', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      if (requestSeq === reportRequestSeqRef.current) setLoading(false);
    }
  };

  const buildDraftLine = (row: any): SupplierOrderDraftLine | null => {
    const code = productCodeOf(row);
    const quantity = n(suggestedOf(row));
    const supplierCode = supplierCodeOf(row);
    if (!code || quantity <= 0 || !supplierCode) return null;
    return {
      key: code,
      selected: true,
      familyId: familyIdOf(row),
      productCode: code,
      productName: productNameOf(row),
      supplierCode,
      supplierName: supplierNameOf(row) || supplierCode,
      quantity: String(quantity),
      unitPrice: String(n(unitPriceOf(row))),
      persistSupplierOverride: false,
    };
  };

  const ensureSupplierConfigs = (lines: SupplierOrderDraftLine[]) => {
    if (!lines.length) return;
    const defaultDate = todayInputValue();
    setSupplierConfigs((current) => {
      const next = { ...current };
      lines.forEach((line) => {
        if (!line.supplierCode || next[line.supplierCode]) return;
        next[line.supplierCode] = {
          series: recentSeriesBySupplier[line.supplierCode]?.[0]?.series || '',
          applyVAT: true,
          deliveryType: 'D',
          deliveryDate: defaultDate,
        };
      });
      return next;
    });
  };

  const addRowsToOrderDraft = (rows: any[]) => {
    const lines = rows.map(buildDraftLine).filter(Boolean) as SupplierOrderDraftLine[];
    if (!lines.length) {
      Alert.alert('Taslak', 'Tedarikci kodu ve onerisi olan satir bulunamadi.');
      return;
    }
    setOrderDraftLines((current) => {
      const next = { ...current };
      lines.forEach((line) => {
        const existing = next[line.key];
        next[line.key] = existing
          ? {
              ...existing,
              selected: true,
              quantity: String(Math.max(n(existing.quantity), n(line.quantity))),
              unitPrice: n(existing.unitPrice) > 0 ? existing.unitPrice : line.unitPrice,
              supplierCode: existing.supplierCode || line.supplierCode,
              supplierName: existing.supplierName || line.supplierName,
            }
          : line;
      });
      return next;
    });
    ensureSupplierConfigs(lines);
    setView('orders');
    hapticSuccess();
  };

  const updateDraftLine = (key: string, patch: Partial<SupplierOrderDraftLine>) => {
    setOrderDraftLines((current) => {
      const existing = current[key];
      if (!existing) return current;
      const nextLine = { ...existing, ...patch };
      if (patch.supplierCode !== undefined) {
        nextLine.supplierCode = String(patch.supplierCode || '').trim().toUpperCase();
        nextLine.supplierName = nextLine.supplierCode;
      }
      return { ...current, [key]: nextLine };
    });
    if (patch.supplierCode) {
      const supplierCode = String(patch.supplierCode || '').trim().toUpperCase();
      if (supplierCode) {
        setSupplierConfigs((current) => ({
          ...current,
          [supplierCode]: current[supplierCode] || {
            series: recentSeriesBySupplier[supplierCode]?.[0]?.series || '',
            applyVAT: true,
            deliveryType: 'D',
            deliveryDate: todayInputValue(),
          },
        }));
      }
    }
  };

  const removeDraftLine = (key: string) => {
    setOrderDraftLines((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const getTransferGateInfo = (line: SupplierOrderDraftLine) => {
    const code = String(line.productCode || '').trim().toUpperCase();
    if (!code) return null;
    const row = reportRowByCode.get(code);
    const minMax = depotMinMaxByCode[code];
    if (!row || !minMax) return null;

    const depotNo = counterDepotNo(depot);
    const counterStock = Math.max(0, n(counterStockOf(row, depot)));
    const counterMin = Math.max(0, n(minMax[depotNo]?.min));
    const alreadyMoved = Math.max(0, n(transferDraftLines[code]?.quantity));
    const counterExcess = Math.max(0, Math.floor(counterStock - counterMin - alreadyMoved));
    const pendingQty = Math.max(0, Math.trunc(n(line.quantity)));
    const transferQty = Math.max(0, Math.min(pendingQty, counterExcess));
    const eligible = transferQty > 0 && counterExcess >= Math.max(1, Math.ceil(pendingQty * 0.5));

    return {
      eligible,
      depotName: counterDepotLabel(depot),
      counterStock,
      counterMin,
      counterExcess,
      pendingQty,
      transferQty,
    };
  };

  const moveDraftLineToTransfer = (line: SupplierOrderDraftLine, quantityOverride?: number) => {
    const currentQuantity = Math.max(0, Math.trunc(n(line.quantity)));
    const quantity = Math.max(0, Math.trunc(quantityOverride ?? currentQuantity));
    if (!line.productCode || quantity <= 0) {
      Alert.alert('DSV', 'Transfere alinacak miktar yok.');
      return;
    }
    const movedQuantity = Math.min(quantity, currentQuantity);
    setTransferDraftLines((current) => {
      const existing = current[line.productCode];
      const nextQuantity = existing ? n(existing.quantity) + movedQuantity : movedQuantity;
      return {
        ...current,
        [line.productCode]: {
          key: line.productCode,
          productCode: line.productCode,
          productName: line.productName,
          quantity: String(nextQuantity),
          unitPrice: line.unitPrice,
          restoredLine: existing
            ? { ...existing.restoredLine, quantity: String(n(existing.restoredLine.quantity) + movedQuantity) }
            : { ...line, quantity: String(movedQuantity) },
        },
      };
    });
    if (movedQuantity >= currentQuantity) {
      removeDraftLine(line.key);
    } else {
      updateDraftLine(line.key, { quantity: String(currentQuantity - movedQuantity) });
    }
    hapticSuccess();
  };

  const updateTransferLine = (key: string, patch: Partial<TransferDraftLine>) => {
    setTransferDraftLines((current) => {
      const existing = current[key];
      if (!existing) return current;
      return { ...current, [key]: { ...existing, ...patch } };
    });
  };

  const getPackRoundingInfo = (line: SupplierOrderDraftLine) => {
    const code = String(line.productCode || '').trim().toUpperCase();
    const meta = packMetaByCode[code];
    const packQty = Math.abs(n(meta?.packQty));
    const quantity = n(line.quantity);
    if (!meta || packQty <= 0 || quantity <= 0) return null;
    const targetQty = Math.ceil(quantity / packQty) * packQty;
    return {
      packQty,
      unitName: meta.unit2Name || '2. birim',
      currentQty: quantity,
      targetQty,
      addQty: Math.max(0, targetQty - quantity),
      rounded: Math.abs(targetQty - quantity) < 0.0001,
    };
  };

  const roundDraftLineToPack = (line: SupplierOrderDraftLine) => {
    const info = getPackRoundingInfo(line);
    if (!info) return;
    if (info.rounded) {
      Alert.alert('Koliye tamamla', 'Bu satir zaten koli katina denk geliyor.');
      return;
    }
    updateDraftLine(line.key, { quantity: String(info.targetQty) });
  };

  const undoTransferLine = (key: string) => {
    const line = transferDraftLines[key];
    if (!line) return;
    setOrderDraftLines((current) => {
      const existing = current[line.restoredLine.key];
      if (!existing) return { ...current, [line.restoredLine.key]: line.restoredLine };
      return {
        ...current,
        [line.restoredLine.key]: {
          ...existing,
          selected: true,
          quantity: String(n(existing.quantity) + n(line.restoredLine.quantity)),
          unitPrice: n(existing.unitPrice) > 0 ? existing.unitPrice : line.restoredLine.unitPrice,
          supplierCode: existing.supplierCode || line.restoredLine.supplierCode,
          supplierName: existing.supplierName || line.restoredLine.supplierName,
        },
      };
    });
    setTransferDraftLines((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    ensureSupplierConfigs([line.restoredLine]);
  };

  const updateSupplierConfig = (supplierCode: string, patch: Partial<SupplierOrderConfig>) => {
    setSupplierConfigs((current) => {
      const base = current[supplierCode] || {
        series: recentSeriesBySupplier[supplierCode]?.[0]?.series || '',
        applyVAT: true,
        deliveryType: 'D',
        deliveryDate: todayInputValue(),
      };
      return {
        ...current,
        [supplierCode]: { ...base, ...patch },
      };
    });
  };

  const submitDepotTransfer = () => {
    if (isOperationBusy()) return;
    const allocations = transferDraftList
      .map((line) => ({
        productCode: line.productCode,
        quantity: Math.max(0, Math.trunc(n(line.quantity))),
      }))
      .filter((line) => line.productCode && line.quantity > 0);
    if (!allocations.length) {
      Alert.alert('DSV transfer', 'Transfer icin secili satir yok.');
      return;
    }
    Alert.alert(
      'DSV transfer olustur',
      `${allocations.length} kalem, ${numberText(allocations.reduce((sum, line) => sum + line.quantity, 0))} miktar icin ${depot === 'MERKEZ' ? 'Topca -> Merkez' : 'Merkez -> Topca'} DSV siparisi olusturulacak. Devam edilsin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Olustur',
          style: 'destructive',
          onPress: async () => {
            if (!beginTransferCreation()) return;
            try {
              const result = await adminApi.createDepotTransferOrder({ depot, series: 'DSV', allocations });
              setLastTransferResult(result.data || null);
              setTransferDraftLines({});
              await loadLogs(true);
              hapticSuccess();
              Alert.alert('DSV transfer', `Transfer siparisi olustu: ${result.data?.orderNumber || '-'}`);
            } catch (err: any) {
              Alert.alert('DSV transfer', getApiErrorMessage(err, 'Transfer siparisi olusturulamadi.'));
            } finally {
              endTransferCreation();
            }
          },
        },
      ]
    );
  };

  const submitSupplierOrders = () => {
    if (isOperationBusy()) return;
    if (!selectedDraftLines.length) {
      Alert.alert('Taslak', 'Siparis olusturmak icin secili satir yok.');
      return;
    }
    const missingSeries = supplierDraftGroups.find((group) => {
      const series = supplierConfigs[group.supplierCode]?.series || recentSeriesBySupplier[group.supplierCode]?.[0]?.series || '';
      return !String(series).trim();
    });
    if (missingSeries) {
      Alert.alert('Seri zorunlu', `${missingSeries.supplierCode} icin siparis serisi girin.`);
      return;
    }
    const missingPrice = selectedDraftLines.filter((line) => n(line.unitPrice) <= 0);
    if (missingPrice.length) {
      Alert.alert('Fiyat eksik', `Birim fiyati olmayan satirlar var: ${missingPrice.slice(0, 5).map((line) => line.productCode).join(', ')}`);
      return;
    }

    Alert.alert(
      'Tedarikci siparisi olustur',
      `${supplierDraftGroups.length} tedarikci, ${selectedDraftLines.length} kalem icin Mikro siparisi olusturulacak. Devam edilsin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Olustur',
          style: 'destructive',
          onPress: async () => {
            if (!beginOrderCreation()) return;
            try {
              const result = await adminApi.createSupplierOrdersFromFamilyAllocations({
                depot,
                supplierConfigs: Object.fromEntries(
                  supplierDraftGroups.map((group) => {
                    const cfg = supplierConfigs[group.supplierCode] || {
                      series: recentSeriesBySupplier[group.supplierCode]?.[0]?.series || '',
                      applyVAT: true,
                      deliveryType: 'D',
                      deliveryDate: todayInputValue(),
                    };
                    return [
                      group.supplierCode,
                      {
                        series: String(cfg.series || '').trim().toUpperCase(),
                        applyVAT: Boolean(cfg.applyVAT),
                        deliveryType: String(cfg.deliveryType || 'D').trim().toUpperCase(),
                        deliveryDate: String(cfg.deliveryDate || '').trim() || null,
                      },
                    ];
                  })
                ),
                allocations: selectedDraftLines.map((line) => ({
                  familyId: line.familyId,
                  productCode: line.productCode,
                  quantity: Math.max(0, Math.trunc(n(line.quantity))),
                  unitPriceOverride: n(line.unitPrice) > 0 ? n(line.unitPrice) : null,
                  supplierCodeOverride: line.supplierCode,
                  persistSupplierOverride: Boolean(line.persistSupplierOverride),
                })),
              });
              const created = result.data?.createdOrders || [];
              const failed = result.data?.failedOrders || [];
              setLastOrderResult(result.data || null);
              await rememberRecentSeries(created);
              const createdSuppliers = new Set(created.map((item: any) => String(item.supplierCode || '').trim().toUpperCase()));
              const createdOrderBySupplier = new Map(
                created.map((item: any) => [String(item.supplierCode || '').trim().toUpperCase(), item])
              );
              const snapshotLines: CreatedOrderLineSnapshot[] = selectedDraftLines
                .filter((line) => createdSuppliers.has(String(line.supplierCode || '').trim().toUpperCase()))
                .map((line) => {
                  const supplierCode = String(line.supplierCode || '').trim().toUpperCase();
                  const order = createdOrderBySupplier.get(supplierCode) || {};
                  const quantity = Math.max(0, n(line.quantity));
                  const unitPrice = Math.max(0, n(line.unitPrice));
                  return {
                    supplierCode,
                    supplierName: String(order.supplierName || line.supplierName || supplierCode).trim(),
                    orderNumber: String(order.orderNumber || '').trim() || null,
                    productCode: String(line.productCode || '').trim().toUpperCase(),
                    productName: String(line.productName || line.productCode || '').trim(),
                    quantity,
                    unitPrice,
                    total: quantity * unitPrice,
                  };
                });
              setLastCreatedOrderBatch({
                createdAt: new Date().toISOString(),
                depot,
                orders: created,
                failedOrders: failed,
                lines: snapshotLines,
              });
              setOrderDraftLines((current) => {
                const next = { ...current };
                Object.keys(next).forEach((key) => {
                  if (createdSuppliers.has(String(next[key].supplierCode || '').trim().toUpperCase())) delete next[key];
                });
                return next;
              });
              await loadLogs(true);
              hapticSuccess();
              Alert.alert(
                'Siparis sonucu',
                created.length
                  ? `${created.length} tedarikci siparisi olustu.${failed.length ? ` ${failed.length} tedarikci hata verdi; taslakta birakildi.` : ''}`
                  : failed.length
                    ? `Siparis olusmadi. ${failed.length} tedarikci hata verdi.`
                    : 'Islem tamamlandi.'
              );
            } catch (err: any) {
              Alert.alert('Siparis olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
            } finally {
              endOrderCreation();
            }
          },
        },
      ]
    );
  };

  const runMinMax = () => {
    if (isOperationBusy()) return;
    Alert.alert('MinMax calistir', 'Mikro MinMax hesap isi baslatilsin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Baslat',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            const response = await adminApi.runUcarerMinMaxReport();
            setJobId(response.data.id);
            setJobStatus(response.data);
            setView('minmax');
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('MinMax', getApiErrorMessage(err, 'Is baslatilamadi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const refreshJob = async () => {
    if (isOperationBusy()) return;
    if (!jobId.trim()) {
      Alert.alert('MinMax', 'Job ID yok.');
      return;
    }
    if (!beginAction()) return;
    const requestSeq = ++jobRequestSeqRef.current;
    try {
      const response = await adminApi.getUcarerMinMaxJobStatus(jobId.trim());
      if (requestSeq !== jobRequestSeqRef.current) return;
      setJobStatus(response.data);
    } catch (err: any) {
      if (requestSeq !== jobRequestSeqRef.current) return;
      Alert.alert('MinMax', getApiErrorMessage(err, 'Durum alinamadi.'));
    } finally {
      endAction();
    }
  };

  const loadExcluded = async (force = false) => {
    const ownsLock = !force;
    if (ownsLock && !beginAction()) return;
    const requestSeq = ++excludedRequestSeqRef.current;
    try {
      const response = await adminApi.getUcarerMinMaxExcludedProductsReport();
      if (requestSeq !== excludedRequestSeqRef.current) return;
      setExcludedRows(response.data?.rows || []);
    } catch (err: any) {
      if (requestSeq !== excludedRequestSeqRef.current) return;
      Alert.alert('Haric urunler', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      if (ownsLock) endAction();
    }
  };

  const setExclusion = (productCode: string, exclude: boolean, resetMinMaxValues = false) => {
    if (isOperationBusy()) return;
    if (!productCode) return;
    Alert.alert(
      exclude ? 'MinMax haric birak' : 'MinMax hesaba al',
      `${productCode} icin islem yapilsin mi?${resetMinMaxValues ? ' Min/max degerleri sifirlanacak.' : ''}`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            if (!beginAction()) return;
            try {
              await adminApi.setUcarerMinMaxExclusion({ productCode, exclude, resetMinMaxValues, depot });
              await loadReport();
              if (view === 'excluded') await loadExcluded(true);
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('MinMax', getApiErrorMessage(err, 'Islem yapilamadi.'));
            } finally {
              endAction();
            }
          },
        },
      ]
    );
  };

  const openRowEdit = (row: any) => {
    const code = productCodeOf(row);
    if (!code) return;
    setEditProductCode((current) => (current === code ? null : code));
    setCostPByCode((current) => ({
      ...current,
      [code]: current[code] ?? String(n(row.costP ?? row.costIncVat ?? row.currentCostP ?? row.currentCost ?? row.costExVat)),
    }));
    setCostTByCode((current) => ({
      ...current,
      [code]: current[code] ?? String(n(row.costT ?? row.costExVat ?? row.currentCostT ?? row.currentCost ?? row.costIncVat)),
    }));
    setSupplierByCode((current) => ({
      ...current,
      [code]: current[code] ?? supplierCodeOf(row),
    }));
  };

  const saveProductCost = (code: string) => {
    if (isOperationBusy()) return;
    const costP = n(costPByCode[code]);
    const costT = n(costTByCode[code]);
    if (costP <= 0 && costT <= 0) {
      Alert.alert('Maliyet', 'En az bir maliyet alani girin.');
      return;
    }
    const updatePriceLists = Boolean(updatePriceListsByCode[code]);
    Alert.alert(
      'Maliyet guncelle',
      `${code} icin Mikro maliyeti guncellenecek.${updatePriceLists ? ' Fiyat listeleri de guncellenecek.' : ''} Devam edilsin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Guncelle',
          style: 'destructive',
          onPress: async () => {
            if (!beginAction()) return;
            try {
              await adminApi.updateUcarerProductCost({
                productCode: code,
                costP: costP > 0 ? costP : undefined,
                costT: costT > 0 ? costT : undefined,
                updatePriceLists,
              });
              await loadReport();
              hapticSuccess();
              Alert.alert('Maliyet', 'Maliyet guncellendi.');
            } catch (err: any) {
              Alert.alert('Maliyet', getApiErrorMessage(err, 'Guncelleme yapilamadi.'));
            } finally {
              endAction();
            }
          },
        },
      ]
    );
  };

  const saveMainSupplier = (code: string) => {
    if (isOperationBusy()) return;
    const supplierCode = String(supplierByCode[code] || '').trim().toUpperCase();
    if (!supplierCode) {
      Alert.alert('Ana saglayici', 'Tedarikci cari kodu girin.');
      return;
    }
    Alert.alert('Ana saglayici guncelle', `${code} icin ana saglayici ${supplierCode} yapilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Guncelle',
        style: 'destructive',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.updateUcarerMainSupplier({ productCode: code, supplierCode });
            await loadReport();
            hapticSuccess();
            Alert.alert('Ana saglayici', 'Ana saglayici guncellendi.');
          } catch (err: any) {
            Alert.alert('Ana saglayici', getApiErrorMessage(err, 'Guncelleme yapilamadi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const loadLogs = async (force = false) => {
    const ownsLock = !force;
    if (ownsLock && !beginAction()) return;
    const requestSeq = ++logsRequestSeqRef.current;
    try {
      const response = await adminApi.getUcarerOperationLogs({ page: 1, limit: 50, search: logSearch.trim() || undefined });
      if (requestSeq !== logsRequestSeqRef.current) return;
      setLogs(response.data?.rows || []);
    } catch (err: any) {
      if (requestSeq !== logsRequestSeqRef.current) return;
      Alert.alert('Islem gecmisi', getApiErrorMessage(err, 'Loglar alinamadi.'));
    } finally {
      if (ownsLock) endAction();
    }
  };

  const openExcluded = async () => {
    setView('excluded');
    await loadExcluded();
  };

  const openLogs = async () => {
    setView('logs');
    await loadLogs();
  };

  const rowsForExport = () => {
    if (view === 'report') return filteredRows;
    if (view === 'families') return familyPanelRows;
    if (view === 'orders') return [...Object.values(orderDraftLines), ...Object.values(transferDraftLines)];
    if (view === 'excluded') return excludedRows;
    if (view === 'logs') return logs;
    return jobStatus ? [jobStatus] : [];
  };

  const exportExcel = async () => {
    if (exportingRef.current) return;
    const sourceRows = rowsForExport();
    if (!sourceRows.length) {
      Alert.alert('Bilgi', 'Disa aktarilacak Ucarer depo verisi yok.');
      return;
    }

    if (!beginExport()) return;
    try {
      const sheetRows = buildUcarerRows(view, sourceRows, jobStatus);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = sheetRows[0].map((title: any) => ({
        wch: Math.min(Math.max(String(title || '').length + 5, 12), 42),
      }));
      XLSX.utils.book_append_sheet(wb, ws, viewTitles[view].slice(0, 31));

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}ucarer-depo-${view}-${depot.toLocaleLowerCase('tr-TR')}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${viewTitles[view]} Excel`,
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endExport();
    }
  };

  const sharePdfHtml = async (html: string, fileStem: string, dialogTitle: string) => {
    const { uri } = await Print.printToFileAsync({ html });
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const dir = `${FileSystem.documentDirectory}reports/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const target = `${dir}${fileStem}-${stamp}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: target });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target, {
        mimeType: 'application/pdf',
        dialogTitle,
      });
    } else {
      Alert.alert('PDF olusturuldu', target);
    }
  };

  const exportPdf = async () => {
    if (exportingRef.current) return;
    const sourceRows = rowsForExport();
    if (!sourceRows.length) {
      Alert.alert('Bilgi', 'PDF icin Ucarer depo verisi yok.');
      return;
    }

    if (!beginExport()) return;
    try {
      const sheetRows = buildUcarerRows(view, sourceRows, jobStatus);
      const subtitle = `Depo: ${depot} - Sekme: ${viewTitles[view]} - Satir: ${sourceRows.length}`;
      const html = buildUcarerPdfHtml({ title: viewTitles[view], subtitle, sheetRows });
      await sharePdfHtml(html, `ucarer-depo-${view}-${depot.toLocaleLowerCase('tr-TR')}`, `${viewTitles[view]} PDF`);
    } catch (err: any) {
      Alert.alert('PDF olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endExport();
    }
  };

  const exportCreatedOrdersPdf = async (mode: 'supplier' | 'manager') => {
    if (exportingRef.current) return;
    if (!lastCreatedOrderBatch || !lastCreatedOrderBatch.orders.length) {
      Alert.alert('Siparis PDF', 'PDF icin son olusan tedarikci siparisi bulunmuyor.');
      return;
    }

    if (!beginExport()) return;
    try {
      const html = buildCreatedOrderPdfHtml(lastCreatedOrderBatch, mode);
      await sharePdfHtml(
        html,
        mode === 'manager' ? 'ucarer-yonetici-onay-ozeti' : 'ucarer-tedarikci-siparis-ozetleri',
        mode === 'manager' ? 'Yonetici Onay PDF' : 'Tedarikci Siparis PDF'
      );
    } catch (err: any) {
      Alert.alert('Siparis PDF', getApiErrorMessage(err, 'PDF olusturulamadi.'));
    } finally {
      endExport();
    }
  };

  const renderReportRow = (row: any, index: number) => {
    const code = productCodeOf(row);
    const suggested = n(suggestedOf(row));
    return (
      <View key={`${code || index}-${index}`} style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} numberOfLines={2}>{productNameOf(row)}</Text>
            <Text style={styles.cardMeta}>{code || '-'} · {row.familyName || row.familyCode || row.stoModelKodu || '-'}</Text>
          </View>
          <View style={[styles.badge, suggested > 0 && styles.badgeWarning]}>
            <Text style={styles.badgeText}>{suggested > 0 ? 'Oneri' : 'Bekle'}</Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <Metric label="Oneri" value={numberText(suggested)} tone={suggested > 0 ? 'amber' : undefined} />
          <Metric label="Reel/Stok" value={numberText(stockOf(row))} />
          <Metric label="Min" value={numberText(minOf(row))} />
          <Metric label="Max" value={numberText(maxOf(row))} />
          <Metric label="Alinan" value={numberText(incomingOf(row))} />
          <Metric label="Verilen" value={numberText(outgoingOf(row))} />
        </View>
        {row.costExVat || row.costIncVat ? (
          <Text style={styles.cardMeta} numberOfLines={1}>Maliyet: {money(row.costExVat || row.costIncVat)}</Text>
        ) : null}
        {supplierCodeOf(row) ? (
          <Text style={styles.cardMeta} numberOfLines={1}>Ana saglayici: {supplierCodeOf(row)} - {supplierNameOf(row) || '-'}</Text>
        ) : null}
        {code ? (
          <View style={styles.actionRow}>
            {suggested > 0 ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => addRowsToOrderDraft([row])}>
                <Text style={styles.primaryButtonText}>Taslaga Al</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openRowEdit(row)}>
              <Text style={styles.secondaryButtonText}>{editProductCode === code ? 'Operasyonu Kapat' : 'Maliyet/Saglayici'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setExclusion(code, true)}>
              <Text style={styles.secondaryButtonText}>MinMax Haric</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warningButton} onPress={() => setExclusion(code, true, true)}>
              <Text style={styles.warningButtonText}>Haric + Sifirla</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {code && editProductCode === code ? (
          <View style={styles.editPanel}>
            <Text style={styles.helper}>Maliyet ve ana saglayici islemleri Mikro'ya yazar. Kontrol ederek kaydedin.</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                keyboardType="numeric"
                value={costPByCode[code] || ''}
                onChangeText={(value) => setCostPByCode((current) => ({ ...current, [code]: value }))}
                placeholder="Maliyet P"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.flex]}
                keyboardType="numeric"
                value={costTByCode[code] || ''}
                onChangeText={(value) => setCostTByCode((current) => ({ ...current, [code]: value }))}
                placeholder="Maliyet T"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, updatePriceListsByCode[code] && styles.toggleActive]}
                onPress={() => setUpdatePriceListsByCode((current) => ({ ...current, [code]: !current[code] }))}
              >
                <Text style={[styles.secondaryButtonText, updatePriceListsByCode[code] && styles.toggleActiveText]}>
                  {updatePriceListsByCode[code] ? 'Fiyat listesi guncellenecek' : 'Sadece maliyet'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => saveProductCost(code)}>
                <Text style={styles.primaryButtonText}>Maliyeti Kaydet</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={supplierByCode[code] || ''}
                onChangeText={(value) => setSupplierByCode((current) => ({ ...current, [code]: value.toUpperCase() }))}
                placeholder="Ana saglayici cari kodu"
                autoCapitalize="characters"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={() => saveMainSupplier(code)}>
                <Text style={styles.primaryButtonText}>Saglayici Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderReport = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ucarer depo karar raporu</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Merkez" active={depot === 'MERKEZ'} onPress={() => selectDepot('MERKEZ')} />
          <Chip label="Topca" active={depot === 'TOPCA'} onPress={() => selectDepot('TOPCA')} />
          <Chip label="Aile Paneli" active={view === 'families'} onPress={() => setView('families')} />
          <Chip label="Siparis Taslagi" active={view === 'orders'} onPress={() => setView('orders')} />
          <Chip label="MinMax Calistir" onPress={runMinMax} danger />
          <Chip label="Haricler" active={view === 'excluded'} onPress={openExcluded} />
          <Chip label="Islem Gecmisi" active={view === 'logs'} onPress={openLogs} />
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} value={search} onChangeText={setSearch} placeholder="Stok kodu veya ad" placeholderTextColor={colors.textMuted} />
          <TouchableOpacity style={styles.secondaryButton} onPress={loadReport}>
            <Text style={styles.secondaryButtonText}>Yenile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => addRowsToOrderDraft(filteredRows.filter((row) => n(suggestedOf(row)) > 0))}
        >
          <Text style={styles.primaryButtonText}>Onerili Satirlari Siparis Taslagina Al</Text>
        </TouchableOpacity>
        <View style={styles.metricRow}>
          <Metric label="Satir" value={reportSummary.totalRows} />
          <Metric label="Onerili" value={reportSummary.suggestedRows} tone="amber" />
          <Metric label="Oneri Miktar" value={numberText(reportSummary.suggestedQty)} />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : filteredRows.length ? (
        <View style={styles.reportGrid}>
          {filteredRows.map((row, index) => (
            <View key={`report-${productCodeOf(row) || index}-${index}`} style={isWide ? styles.reportGridItem : undefined}>
              {renderReportRow(row, index)}
            </View>
          ))}
        </View>
      ) : <Empty text="Rapor satiri bulunamadi." />}
    </>
  );

  const renderFamilies = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Aile kapsama paneli</Text>
        <Text style={styles.helper}>
          Rapor satirlarini aile/model bazinda toplar. Aile acildiginda onerili kalemleri tek dokunusla siparis taslagina alabilirsiniz.
        </Text>
        <View style={styles.inputRow}>
          <TouchableOpacity style={[styles.secondaryButton, styles.flex]} onPress={() => setView('report')}>
            <Text style={styles.secondaryButtonText}>Rapora Don</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.metricRow}>
          <Metric label="Aile" value={familyPanelRows.length} />
          <Metric label="Onerili Aile" value={familyPanelRows.filter((family) => family.suggestedQty > 0).length} tone="amber" />
          <Metric label="Oneri Miktar" value={numberText(familyPanelRows.reduce((sum, family) => sum + family.suggestedQty, 0))} />
        </View>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && !familyPanelRows.length ? <Empty text="Aile/model ozeti bulunamadi." /> : null}
      {familyPanelRows.map((family) => {
        const isActive = activeFamilyKey === family.key;
        const suggestedRows = family.rows.filter((row) => n(suggestedOf(row)) > 0);
        return (
          <View key={family.key} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle} numberOfLines={2}>{family.familyName}</Text>
                <Text style={styles.cardMeta}>{family.familyCode || '-'} - {family.itemCount} urun</Text>
              </View>
              <View style={[styles.badge, family.suggestedQty > 0 && styles.badgeWarning]}>
                <Text style={styles.badgeText}>{family.suggestedQty > 0 ? 'Ihtiyac' : 'Kapali'}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <Metric label="Oneri" value={numberText(family.suggestedQty)} tone={family.suggestedQty > 0 ? 'amber' : undefined} />
              <Metric label="Onerili Kalem" value={family.suggestedRows} />
              <Metric label="Stok" value={numberText(family.stockQty)} />
              <Metric label="Min" value={numberText(family.minQty)} />
              <Metric label="Max" value={numberText(family.maxQty)} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setActiveFamilyKey(isActive ? null : family.key)}>
                <Text style={styles.secondaryButtonText}>{isActive ? 'Detayi Kapat' : 'Detayi Ac'}</Text>
              </TouchableOpacity>
              {suggestedRows.length ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => addRowsToOrderDraft(suggestedRows)}>
                  <Text style={styles.primaryButtonText}>Aile Onerilerini Taslaga Al</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {isActive ? (
              <View style={styles.familyDetailBox}>
                {family.rows.slice(0, 10).map((row, index) => {
                  const code = productCodeOf(row);
                  const suggested = n(suggestedOf(row));
                  return (
                    <View key={`${family.key}-${code || index}`} style={styles.familyDetailRow}>
                      <View style={styles.flex}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{productNameOf(row)}</Text>
                        <Text style={styles.cardMeta}>{code || '-'} - Stok: {numberText(stockOf(row))} - Min/Max: {numberText(minOf(row))}/{numberText(maxOf(row))}</Text>
                      </View>
                      <View style={[styles.badge, suggested > 0 && styles.badgeWarning]}>
                        <Text style={styles.badgeText}>{numberText(suggested)}</Text>
                      </View>
                    </View>
                  );
                })}
                {family.rows.length > 10 ? <Text style={styles.cardMeta}>+{family.rows.length - 10} urun daha var. Tam liste PDF/Excel ile paylasilabilir.</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );

  const renderOrders = () => {
    const allDraftLines = Object.values(orderDraftLines).sort(
      (a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr') || a.productCode.localeCompare(b.productCode, 'tr')
    );
    const visibleGroups = Array.from(
      allDraftLines.reduce((groups, line) => {
        const supplierCode = line.supplierCode || 'TEDARIKCI-YOK';
        const group = groups.get(supplierCode) || {
          supplierCode,
          supplierName: line.supplierName || supplierCode,
          itemCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
        };
        group.itemCount += 1;
        if (line.selected) {
          group.totalQuantity += n(line.quantity);
          group.totalAmount += n(line.quantity) * n(line.unitPrice);
        }
        groups.set(supplierCode, group);
        return groups;
      }, new Map<string, { supplierCode: string; supplierName: string; itemCount: number; totalQuantity: number; totalAmount: number }>())
        .values()
    ).sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr'));
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tedarikci siparis taslagi</Text>
          <Text style={styles.helper}>
            Onerili satirlari burada cari bazinda kontrol edin. Seri zorunlu; olustur butonu Mikro tedarikci siparisi yazar.
          </Text>
          <View style={styles.metricRow}>
            <Metric label="Secili Kalem" value={orderDraftSummary.selectedLines} />
            <Metric label="Tedarikci" value={orderDraftSummary.suppliers} />
            <Metric label="Miktar" value={numberText(orderDraftSummary.totalQuantity)} />
            <Metric label="Tutar" value={money(orderDraftSummary.totalAmount)} tone="amber" />
            <Metric label="DSV Kalem" value={transferDraftSummary.lines} tone={transferDraftSummary.lines ? 'green' : undefined} />
            <Metric label="DSV Miktar" value={numberText(transferDraftSummary.totalQuantity)} />
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => addRowsToOrderDraft(filteredRows.filter((row) => n(suggestedOf(row)) > 0))}
            >
              <Text style={styles.secondaryButtonText}>Onerileri Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, (!selectedDraftLines.length || creatingOrders) && styles.buttonDisabled]}
              onPress={submitSupplierOrders}
              disabled={!selectedDraftLines.length || creatingOrders}
            >
              <Text style={styles.primaryButtonText}>{creatingOrders ? 'Olusturuluyor...' : 'Siparisleri Olustur'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, styles.transferButton, (!transferDraftList.length || creatingTransfer) && styles.buttonDisabled]}
              onPress={submitDepotTransfer}
              disabled={!transferDraftList.length || creatingTransfer}
            >
              <Text style={styles.primaryButtonText}>{creatingTransfer ? 'DSV...' : 'DSV Transfer Olustur'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
              <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting}>
              <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.warningButton}
              onPress={() => {
                setOrderDraftLines({});
                setTransferDraftLines({});
                setLastOrderResult(null);
                setLastCreatedOrderBatch(null);
                setLastTransferResult(null);
              }}
            >
              <Text style={styles.warningButtonText}>Taslagi Temizle</Text>
            </TouchableOpacity>
          </View>
          {lastOrderResult ? (
            <View style={styles.resultBox}>
                  <Text style={styles.cardTitle} numberOfLines={1}>Son islem</Text>
              <Text style={styles.cardMeta}>
                Olusan: {(lastOrderResult.createdOrders || []).map((item: any) => `${item.supplierCode} ${item.orderNumber}`).join(', ') || '-'}
              </Text>
              {(lastOrderResult.failedOrders || []).length ? (
                <Text style={styles.errorText}>
                  Hata: {lastOrderResult.failedOrders.map((item: any) => `${item.supplierCode}: ${item.error}`).join(' | ')}
                </Text>
              ) : null}
              {lastCreatedOrderBatch?.orders?.length ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => exportCreatedOrdersPdf('supplier')} disabled={exporting}>
                    <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Tedarikci PDF'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => exportCreatedOrdersPdf('manager')} disabled={exporting}>
                    <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Yonetici PDF'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
          {lastTransferResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.cardTitle} numberOfLines={1}>Son DSV transfer</Text>
              <Text style={styles.cardMeta}>
                Siparis: {lastTransferResult.orderNumber || '-'} · Kalem: {lastTransferResult.itemCount || 0} · Miktar: {numberText(lastTransferResult.totalQuantity)}
              </Text>
            </View>
          ) : null}
        </View>

        {!allDraftLines.length && !transferDraftList.length ? <Empty text="Siparis taslagi bos. Rapor ekranindan onerili satirlari taslaga alin." /> : null}

        {transferDraftList.length ? (
          <View style={[styles.card, styles.transferPanel]}>
            <Text style={styles.sectionTitle}>DSV depolar arasi transfer seti</Text>
            <Text style={styles.helper}>
              Satin alma yerine {depot === 'MERKEZ' ? 'Topca -> Merkez' : 'Merkez -> Topca'} transfer olusturulacak satirlar. Geri alirsaniz tedarikci taslagina doner.
            </Text>
            <View style={styles.metricRow}>
              <Metric label="Kalem" value={transferDraftSummary.lines} tone="green" />
              <Metric label="Miktar" value={numberText(transferDraftSummary.totalQuantity)} />
              <Metric label="Tahmini Tutar" value={money(transferDraftSummary.totalAmount)} tone="green" />
            </View>
            {transferDraftList.map((line) => (
              <View key={line.key} style={styles.draftLine}>
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{line.productName}</Text>
                    <Text style={styles.cardMeta}>{line.productCode}</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeSuccess]}>
                    <Text style={styles.badgeText}>DSV</Text>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    keyboardType="numeric"
                    value={line.quantity}
                    onChangeText={(value) => updateTransferLine(line.key, { quantity: value })}
                    placeholder="Transfer miktari"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => undoTransferLine(line.key)}>
                    <Text style={styles.secondaryButtonText}>Geri Al</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardMeta}>Tahmini tutar: {money(n(line.quantity) * n(line.unitPrice))}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {visibleGroups.map((group) => {
          const cfg = supplierConfigs[group.supplierCode] || {
            series: recentSeriesBySupplier[group.supplierCode]?.[0]?.series || '',
            applyVAT: true,
            deliveryType: 'D',
            deliveryDate: todayInputValue(),
          };
          const recentSeries = recentSeriesBySupplier[group.supplierCode] || [];
          const groupLines = allDraftLines.filter((line) => line.supplierCode === group.supplierCode);
          return (
            <View key={group.supplierCode} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{group.supplierCode}</Text>
                  <Text style={styles.cardMeta}>{group.supplierName}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{group.itemCount} kalem</Text>
                </View>
              </View>
              <View style={styles.metricRow}>
                <Metric label="Miktar" value={numberText(group.totalQuantity)} />
                <Metric label="Tutar" value={money(group.totalAmount)} tone="amber" />
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  value={cfg.series}
                  onChangeText={(value) => updateSupplierConfig(group.supplierCode, { series: value.toUpperCase() })}
                  placeholder="Seri"
                  autoCapitalize="characters"
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={cfg.deliveryType}
                  onChangeText={(value) => updateSupplierConfig(group.supplierCode, { deliveryType: value.toUpperCase() })}
                  placeholder="Teslim tipi"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              {recentSeries.length ? (
                <View style={styles.recentSeriesRow}>
                  <Text style={styles.cardMeta}>Son seriler</Text>
                  {recentSeries.map((item) => (
                    <TouchableOpacity
                      key={`${group.supplierCode}-${item.series}`}
                      style={[styles.recentSeriesChip, cfg.series === item.series && styles.toggleActive]}
                      onPress={() => updateSupplierConfig(group.supplierCode, { series: item.series })}
                    >
                      <Text style={[styles.recentSeriesText, cfg.series === item.series && styles.toggleActiveText]}>
                        {item.series}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={cfg.deliveryDate}
                  onChangeText={(value) => updateSupplierConfig(group.supplierCode, { deliveryDate: value })}
                  placeholder="YYYY-AA-GG"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.secondaryButton, cfg.applyVAT && styles.toggleActive]}
                  onPress={() => updateSupplierConfig(group.supplierCode, { applyVAT: !cfg.applyVAT })}
                >
                  <Text style={[styles.secondaryButtonText, cfg.applyVAT && styles.toggleActiveText]}>
                    {cfg.applyVAT ? 'Vergili' : 'Vergisiz'}
                  </Text>
                </TouchableOpacity>
              </View>

              {groupLines.map((line) => {
                const transferGate = getTransferGateInfo(line);
                const packInfo = getPackRoundingInfo(line);
                return (
                  <View key={line.key} style={[styles.draftLine, !line.selected && styles.draftLineMuted]}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flex}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{line.productName}</Text>
                        <Text style={styles.cardMeta}>{line.productCode}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.secondaryButton, line.selected && styles.toggleActive]}
                        onPress={() => updateDraftLine(line.key, { selected: !line.selected })}
                      >
                        <Text style={[styles.secondaryButtonText, line.selected && styles.toggleActiveText]}>
                          {line.selected ? 'Secili' : 'Pasif'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={[styles.input, styles.flex]}
                        keyboardType="numeric"
                        value={line.quantity}
                        onChangeText={(value) => updateDraftLine(line.key, { quantity: value })}
                        placeholder="Miktar"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TextInput
                        style={[styles.input, styles.flex]}
                        keyboardType="numeric"
                        value={line.unitPrice}
                        onChangeText={(value) => updateDraftLine(line.key, { unitPrice: value })}
                        placeholder="Birim fiyat"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    {packInfo ? (
                      <View style={styles.packSuggestion}>
                        <View style={styles.flex}>
                          <Text style={styles.packSuggestionTitle}>Koli bilgisi</Text>
                          <Text style={styles.cardMeta}>
                            Koli ici: {numberText(packInfo.packQty)} {packInfo.unitName}
                            {packInfo.rounded
                              ? ' - miktar koli katinda'
                              : ` - ${numberText(packInfo.addQty)} eklenirse ${numberText(packInfo.targetQty)} olur`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.secondaryButton, packInfo.rounded && styles.buttonDisabled]}
                          onPress={() => roundDraftLineToPack(line)}
                          disabled={packInfo.rounded}
                        >
                          <Text style={styles.secondaryButtonText}>{packInfo.rounded ? 'Tam' : 'Koliye Tamamla'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    <View style={styles.inputRow}>
                      <TextInput
                        style={[styles.input, styles.flex]}
                        value={line.supplierCode}
                        onChangeText={(value) => updateDraftLine(line.key, { supplierCode: value })}
                        placeholder="Tedarikci cari kodu"
                        autoCapitalize="characters"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity
                        style={[styles.secondaryButton, line.persistSupplierOverride && styles.toggleActive]}
                        onPress={() => updateDraftLine(line.key, { persistSupplierOverride: !line.persistSupplierOverride })}
                      >
                        <Text style={[styles.secondaryButtonText, line.persistSupplierOverride && styles.toggleActiveText]}>Kalici</Text>
                      </TouchableOpacity>
                    </View>
                    {transferGate?.eligible ? (
                      <View style={styles.dsvSuggestion}>
                        <View style={styles.flex}>
                          <Text style={styles.dsvSuggestionTitle}>Karsi depodan DSV onerisi</Text>
                          <Text style={styles.cardMeta}>
                            {transferGate.depotName} stok: {numberText(transferGate.counterStock)} - min: {numberText(transferGate.counterMin)} - aktarilabilir: {numberText(transferGate.counterExcess)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.primaryButton, styles.transferButton]}
                          onPress={() => moveDraftLineToTransfer(line, transferGate.transferQty)}
                        >
                          <Text style={styles.primaryButtonText}>DSV {numberText(transferGate.transferQty)}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : depotMinMaxLoading ? (
                      <Text style={styles.cardMeta}>Karsi depo min/max kontrol ediliyor...</Text>
                    ) : null}
                    <View style={styles.actionRow}>
                      <Text style={styles.cardMeta}>Satir tutari: {money(n(line.quantity) * n(line.unitPrice))}</Text>
                      <TouchableOpacity style={[styles.secondaryButton, styles.transferSoftButton]} onPress={() => moveDraftLineToTransfer(line)}>
                        <Text style={styles.secondaryButtonText}>{transferGate?.eligible ? 'Manuel DSV' : "DSV'ye Al"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.warningButton} onPress={() => removeDraftLine(line.key)}>
                        <Text style={styles.warningButtonText}>Kaldir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </>
    );
  };

  const renderMinMax = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>MinMax isi</Text>
      <Text style={styles.helper}>Mevcut job ID</Text>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} value={jobId} onChangeText={setJobId} placeholder="Job ID" placeholderTextColor={colors.textMuted} />
        <TouchableOpacity style={styles.secondaryButton} onPress={refreshJob}>
          <Text style={styles.secondaryButtonText}>Durum</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={runMinMax} disabled={actionLoading}>
        <Text style={styles.primaryButtonText}>Yeni MinMax Baslat</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting || !jobStatus}>
        <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel Paylas'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting || !jobStatus}>
        <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF Paylas'}</Text>
      </TouchableOpacity>
      {jobStatus ? (
        <View style={styles.resultBox}>
          <Text style={styles.cardTitle} numberOfLines={1}>{jobStatus.status}</Text>
          <Text style={styles.cardMeta}>Baslangic: {dateText(jobStatus.startedAt)}</Text>
          <Text style={styles.cardMeta}>Bitis: {dateText(jobStatus.finishedAt)}</Text>
          <Text style={styles.cardMeta}>Satir: {jobStatus.data?.total ?? jobStatus.data?.rows?.length ?? '-'}</Text>
          {jobStatus.error ? <Text style={styles.errorText}>{jobStatus.error}</Text> : null}
        </View>
      ) : <Empty text="Henuz job yok." />}
    </View>
  );

  const renderExcluded = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>MinMax haric raporu</Text>
        <View style={styles.inputRow}>
          <TouchableOpacity style={[styles.secondaryButton, styles.flex, actionLoading && styles.buttonDisabled]} onPress={() => loadExcluded()} disabled={actionLoading}>
            <Text style={styles.secondaryButtonText}>Yenile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {excludedRows.length ? excludedRows.map((row) => (
        <View key={row.productCode} style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={2}>{row.productName || row.productCode}</Text>
          <Text style={styles.cardMeta}>{row.productCode} · Model: {row.stoModelKodu || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="1 Ay Cari" value={row.distinctCustomersLast1Month || 0} />
            <Metric label="2 Ay Cari" value={row.distinctCustomersLast2Months || 0} />
            <Metric label="3 Ay Cari" value={row.distinctCustomersLast3Months || 0} />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setExclusion(row.productCode, false)}>
            <Text style={styles.primaryButtonText}>MinMax Hesaplansin</Text>
          </TouchableOpacity>
        </View>
      )) : <Empty text="Haric urun raporu bos." />}
    </>
  );

  const renderLogs = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ucarer islem gecmisi</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} value={logSearch} onChangeText={setLogSearch} placeholder="Stok, aile, belge ara" placeholderTextColor={colors.textMuted} onSubmitEditing={() => loadLogs()} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => loadLogs()}>
            <Text style={styles.secondaryButtonText}>Ara</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={exportPdf} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {logs.length ? logs.map((log) => (
        <View key={log.id} style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={2}>{log.title || log.operationType}</Text>
          <Text style={styles.cardMeta}>{log.operationType} · {dateText(log.createdAt)}</Text>
          <Text style={styles.cardMeta}>Stok: {log.productCode || '-'} · Aile: {log.familyName || log.familyId || '-'}</Text>
          <Text style={styles.cardMeta}>Kullanici: {log.userName || '-'}</Text>
          {Array.isArray(log.orderNumbers) && log.orderNumbers.length ? <Text style={styles.cardMeta}>Siparis: {log.orderNumbers.join(', ')}</Text> : null}
        </View>
      )) : <Empty text="Islem gecmisi yok." />}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Satin Alma Karar Destegi</Text>
          <Text style={styles.title}>Ucarer Depo</Text>
          <Text style={styles.subtitle}>Depo karar raporu, MinMax ve islem gecmisi.</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunum</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{viewTitles[view]}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Rapor Satiri</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{filteredRows.length}/{reportSummary.totalRows}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Onerili</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{reportSummary.suggestedRows}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Taslak</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{selectedDraftLines.length}</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Rapor" active={view === 'report'} onPress={() => setView('report')} />
          <Chip label="Aile" active={view === 'families'} onPress={() => setView('families')} />
          <Chip label={`Siparis (${selectedDraftLines.length})`} active={view === 'orders'} onPress={() => setView('orders')} />
          <Chip label="MinMax" active={view === 'minmax'} onPress={() => setView('minmax')} />
          <Chip label="Haricler" active={view === 'excluded'} onPress={openExcluded} />
          <Chip label="Loglar" active={view === 'logs'} onPress={openLogs} />
        </ScrollView>
        {actionLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {view === 'report' ? renderReport() : null}
        {view === 'families' ? renderFamilies() : null}
        {view === 'orders' ? renderOrders() : null}
        {view === 'minmax' ? renderMinMax() : null}
        {view === 'excluded' ? renderExcluded() : null}
        {view === 'logs' ? renderLogs() : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  kicker: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#93C5FD', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 104, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF', marginTop: 4 },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { borderColor: colors.danger },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  chipTextDanger: { color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  reportGridItem: { flexBasis: '48%', flexGrow: 1, minWidth: 320 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recentSeriesRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  smallInput: { width: 108 },
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  badge: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.text },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  transferButton: { backgroundColor: '#15803D' },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  recentSeriesChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recentSeriesText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  buttonDisabled: { opacity: 0.55 },
  toggleActive: { backgroundColor: colors.primary },
  toggleActiveText: { color: '#FFFFFF' },
  transferPanel: {
    borderColor: '#BBF7D0',
    backgroundColor: colors.successSoft,
  },
  dsvSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#86EFAC',
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  dsvSuggestionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.success },
  packSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  packSuggestionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.warning },
  transferSoftButton: {
    backgroundColor: colors.successSoft,
  },
  familyDetailBox: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  familyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    paddingBottom: spacing.xs,
  },
  draftLine: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  draftLineMuted: {
    opacity: 0.64,
    backgroundColor: colors.surfaceAlt,
  },
  editPanel: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  warningButton: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.warning },
  resultBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  errorText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.danger },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
