/**
 * TOPLU Denetim Raporu Servisi
 *
 * MARK_TOPLU ile talep hesabindan cikarilan satis satirlarini (STOK_HAREKETLERI
 * sth_stok_srm_merkezi = 'TOPLU') cari x urun x ay bazinda geriye dogru tarar.
 * Ayni cari ayni urunu minRepeatMonths (varsayilan 3) farkli ayda TOPLU almissa
 * bu "ritmik talep"tir ve sistemin topludan cikarilmasini onerdigi gruptur.
 *
 * unmarkTopluGroup: onerilen grubu tek tusla topludan cikarir (sth_stok_srm_merkezi
 * bosaltilir). MIKRO YAZMASIDIR — dar filtreli, parametreli, OUTPUT'lu ve
 * UcarerOperationLog kayitlidir. Satir sart kumesi markUcarerSalesLineAsToplu
 * (reports.service.ts) ile birebir ayni satis-satiri tanimini kullanir:
 * sth_tip=1, sth_cins=0, sth_normal_iade=0, sth_evraktip IN (1,4), sth_iptal=0.
 */

import * as sql from 'mssql';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import reportsService from './reports.service';

const MAX_GROUPS = 2000;
const MAX_UNMARK_ROWS = 500;

// TOPLU aday tarama guvenlik tavanlari
const MAX_CANDIDATE_LINES = 40000; // Mikro'dan cekilecek toplam NON-TOPLU satis satiri
const MAX_CANDIDATE_GROUPS = 500; // frontend'e donen cari x urun grup sayisi
const MAX_MARK_LINES = 100; // tek istekte isaretlenebilecek satir

export interface TopluAuditMonthRow {
  month: string; // 'YYYY-MM'
  quantity: number;
  amount: number;
}

export interface TopluAuditGroupRow {
  cariCode: string;
  cariName: string;
  productCode: string;
  productName: string;
  months: TopluAuditMonthRow[];
  monthsCount: number;
  totalQuantity: number;
  totalAmount: number;
  lastSaleDate: string | null;
  isRhythmic: boolean;
}

export interface TopluAuditReport {
  months: number;
  minRepeatMonths: number;
  windowFrom: string; // 'YYYY-MM-DD' — SQL'in taradigi pencere basi (Mikro sunucu saatiyle)
  windowTo: string;   // 'YYYY-MM-DD' — pencere sonu (Mikro sunucu bugunu)
  rows: TopluAuditGroupRow[];
  total: number;
  truncated: boolean;
  summary: {
    totalGroups: number;
    rhythmicGroups: number;
    rhythmicTotalAmount: number;
  };
  generatedAt: string;
}

export interface UnmarkTopluResult {
  affected: number;
  cariCode: string;
  productCode: string;
  fromDate: string;
  toDate: string;
}

// ==================== TOPLU ADAY TARAMA ====================

export interface TopluCandidateSpikeLine {
  documentNo: string;       // "SERI-SIRA" gosterim
  documentDate: string;     // ISO tarih
  quantity: number;         // bu SATIRIN miktari
  amount: number;           // bu SATIRIN tutari (sth_tutar)
  lineGuid: string;         // sth_Guid — markUcarerSalesLineAsToplu icin
  documentSeries: string;   // sth_evrakno_seri
  documentSequence: number; // sth_evrakno_sira
  documentLineNo: number;   // sth_satirno
}

export interface TopluCandidateGroupRow {
  cariCode: string;
  cariName: string;
  productCode: string;
  productName: string;
  docCount: number;         // bu urunun penceredeki toplam evrak sayisi (tum cariler)
  spikeDocs: TopluCandidateSpikeLine[]; // spike evraklarin TUM satirlari (isaretlenebilir)
  typicalDocQty: number;    // urunun tipik (medyan) evrak miktari
  totalSpikeQty: number;    // spike satirlarin toplam miktari
  totalSpikeAmount: number; // spike satirlarin toplam tutari
}

export interface TopluCandidatesReport {
  months: number;
  spikeFactor: number;
  minQty: number;
  windowFrom: string; // 'YYYY-MM-DD'
  windowTo: string;   // 'YYYY-MM-DD'
  rows: TopluCandidateGroupRow[];
  truncated: boolean;
  summary: {
    groupCount: number;
    totalSpikeAmount: number;
  };
  generatedAt: string;
}

export interface MarkCandidateLinesResult {
  marked: number;
  failed: Array<{ lineGuid: string; reason: string }>;
}

// Mikro'dan cekilen ham satis satiri (aday tarama)
type CandidateSalesLine = {
  cariCode: string;
  cariName: string;
  productCode: string;
  productName: string;
  documentSeries: string;
  documentSequence: number;
  documentLineNo: number;
  lineGuid: string;
  quantity: number;
  amount: number;
  saleDate: Date | null;
};

// Bir evraga (cari x urun x seri x sira) ait toplanmis birim
type CandidateDoc = {
  cariCode: string;
  cariName: string;
  productCode: string;
  productName: string;
  documentSeries: string;
  documentSequence: number;
  docQty: number;
  lines: CandidateSalesLine[];
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const parseIsoDate = (value: unknown, label: string): Date => {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new AppError(`${label} zorunludur (ISO tarih).`, 400, ErrorCode.BAD_REQUEST);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${label} gecerli bir tarih degil.`, 400, ErrorCode.BAD_REQUEST);
  }
  return parsed;
};

class TopluAuditService {
  /**
   * TOPLU isaretli satislari cari x urun x ay bazinda gruplar.
   * Salt okuma; WITH (NOLOCK) + TOP guvenligi (en fazla MAX_GROUPS grup).
   */
  async getTopluAuditReport(options: { months?: number; minRepeatMonths?: number } = {}): Promise<TopluAuditReport> {
    const months = clampInt(options.months, 6, 1, 24);
    const minRepeatMonths = clampInt(options.minRepeatMonths, 3, 2, 12);

    // Rapor penceresi (frontend'e sozlesme): asagidaki ana sorgunun kullandigi
    // DATEADD(MONTH, -months, GETDATE) araliginin birebir kendisi, Mikro sunucu saatiyle.
    const windowRows = await mikroService.executeQuery(`
      SELECT
        CONVERT(varchar(10), DATEADD(MONTH, -${months}, CAST(GETDATE() AS date)), 126) AS windowFrom,
        CONVERT(varchar(10), CAST(GETDATE() AS date), 126) AS windowTo
    `);
    const windowFrom = String(windowRows?.[0]?.windowFrom || '').trim();
    const windowTo = String(windowRows?.[0]?.windowTo || '').trim();

    const rawRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      WITH TopluRows AS (
        SELECT
          UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))) AS cariCode,
          UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
          CONVERT(varchar(7), sth.sth_tarih, 126) AS monthKey,
          CAST(SUM(ISNULL(sth.sth_miktar, 0)) AS float) AS quantity,
          CAST(SUM(ISNULL(sth.sth_tutar, 0)) AS float) AS amount,
          MAX(sth.sth_tarih) AS lastDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) = 'TOPLU'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_cins, 0) = 0
          AND ISNULL(sth.sth_normal_iade, 0) = 0
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND ISNULL(sth.sth_iptal, 0) = 0
          AND sth.sth_tarih >= DATEADD(MONTH, -${months}, CAST(GETDATE() AS date))
          AND sth.sth_cari_kodu IS NOT NULL AND LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''
          AND sth.sth_stok_kod IS NOT NULL AND LTRIM(RTRIM(sth.sth_stok_kod)) <> ''
        GROUP BY
          UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))),
          UPPER(LTRIM(RTRIM(sth.sth_stok_kod))),
          CONVERT(varchar(7), sth.sth_tarih, 126)
      ),
      GroupRank AS (
        SELECT
          cariCode,
          productCode,
          COUNT(DISTINCT monthKey) AS monthsCount,
          CAST(SUM(quantity) AS float) AS totalQuantity,
          CAST(SUM(amount) AS float) AS totalAmount,
          MAX(lastDate) AS lastDate,
          ROW_NUMBER() OVER (ORDER BY SUM(amount) DESC, cariCode, productCode) AS rn
        FROM TopluRows
        GROUP BY cariCode, productCode
      )
      SELECT
        tr.cariCode,
        LTRIM(RTRIM(ISNULL(ch.cari_unvan1, ''))) AS cariName,
        tr.productCode,
        LTRIM(RTRIM(ISNULL(st.sto_isim, ''))) AS productName,
        tr.monthKey,
        tr.quantity,
        tr.amount,
        gr.monthsCount,
        gr.totalQuantity,
        gr.totalAmount,
        gr.lastDate AS groupLastDate,
        gr.rn
      FROM TopluRows tr
      INNER JOIN GroupRank gr
        ON gr.cariCode = tr.cariCode AND gr.productCode = tr.productCode
      LEFT JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = tr.cariCode
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = tr.productCode
      WHERE gr.rn <= ${MAX_GROUPS}
      ORDER BY gr.rn, tr.monthKey;
    `);

    const groups = new Map<string, TopluAuditGroupRow>();
    let maxRank = 0;
    (Array.isArray(rawRows) ? rawRows : []).forEach((row: any) => {
      const cariCode = String(row?.cariCode || '').trim().toUpperCase();
      const productCode = String(row?.productCode || '').trim().toUpperCase();
      if (!cariCode || !productCode) return;
      maxRank = Math.max(maxRank, Number(row?.rn) || 0);
      const key = `${cariCode}||${productCode}`;
      let group = groups.get(key);
      if (!group) {
        const lastDateRaw = row?.groupLastDate ? new Date(row.groupLastDate) : null;
        const monthsCount = Math.max(0, Math.trunc(Number(row?.monthsCount) || 0));
        group = {
          cariCode,
          cariName: String(row?.cariName || '').trim() || cariCode,
          productCode,
          productName: String(row?.productName || '').trim() || productCode,
          months: [],
          monthsCount,
          totalQuantity: Number(row?.totalQuantity) || 0,
          totalAmount: Number(row?.totalAmount) || 0,
          lastSaleDate:
            lastDateRaw && !Number.isNaN(lastDateRaw.getTime()) ? lastDateRaw.toISOString() : null,
          isRhythmic: monthsCount >= minRepeatMonths,
        };
        groups.set(key, group);
      }
      group.months.push({
        month: String(row?.monthKey || '').trim(),
        quantity: Number(row?.quantity) || 0,
        amount: Number(row?.amount) || 0,
      });
    });

    const rows = Array.from(groups.values());
    const rhythmicRows = rows.filter((row) => row.isRhythmic);

    return {
      months,
      minRepeatMonths,
      windowFrom,
      windowTo,
      rows,
      total: rows.length,
      truncated: maxRank >= MAX_GROUPS,
      summary: {
        totalGroups: rows.length,
        rhythmicGroups: rhythmicRows.length,
        rhythmicTotalAmount: rhythmicRows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Bir cari x urun grubunu verilen tarih araliginda topludan cikarir
   * (sth_stok_srm_merkezi = '').
   *
   * MIKRO YAZMASI:
   * - Parametreli sorgu (mssql request.input) + OUTPUT ile etkilenen satirlar.
   * - Yazmadan once SELECT COUNT dogrulamasi; MAX_UNMARK_ROWS uzeri beklenmedik
   *   sayilarda islem yapilmaz (AppError 400).
   * - 0 satir eslesirse hata degil { affected: 0 } doner.
   * - UcarerOperationLog: UNMARK_TOPLU.
   */
  async unmarkTopluGroup(
    input: { cariCode?: string; productCode?: string; fromDate?: string; toDate?: string },
    userId?: string | null
  ): Promise<UnmarkTopluResult> {
    const cariCode = String(input.cariCode || '').trim().toUpperCase();
    const productCode = String(input.productCode || '').trim().toUpperCase();
    if (!cariCode || !productCode) {
      throw new AppError('Cari kodu ve stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const fromDate = parseIsoDate(input.fromDate, 'Baslangic tarihi');
    const toDate = parseIsoDate(input.toDate, 'Bitis tarihi');
    if (fromDate.getTime() > toDate.getTime()) {
      throw new AppError('Baslangic tarihi bitis tarihinden buyuk olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    await mikroService.connect();

    // Ayni satis-satiri tanimi: markUcarerSalesLineAsToplu ile birebir ayni sartlar.
    const whereSql = `
      UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) = 'TOPLU'
      AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, '')))) = @cariCode
      AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_kod, '')))) = @productCode
      AND sth.sth_tarih >= @fromDate
      AND sth.sth_tarih < DATEADD(DAY, 1, @toDate)
      AND ISNULL(sth.sth_tip, 0) = 1
      AND ISNULL(sth.sth_cins, 0) = 0
      AND ISNULL(sth.sth_normal_iade, 0) = 0
      AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
      AND ISNULL(sth.sth_iptal, 0) = 0
    `;

    // 1) Yazmadan once dar filtreli sayim dogrulamasi
    const countRequest = mikroService.pool!.request();
    countRequest.input('cariCode', sql.NVarChar(50), cariCode);
    countRequest.input('productCode', sql.NVarChar(50), productCode);
    countRequest.input('fromDate', sql.DateTime, fromDate);
    countRequest.input('toDate', sql.DateTime, toDate);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS cnt
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      WHERE ${whereSql}
    `);
    const expectedCount = Math.max(0, Math.trunc(Number(countResult.recordset?.[0]?.cnt) || 0));

    if (expectedCount === 0) {
      return {
        affected: 0,
        cariCode,
        productCode,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
      };
    }
    if (expectedCount > MAX_UNMARK_ROWS) {
      throw new AppError(
        `Beklenenden fazla satir etkilenecek (${expectedCount} > ${MAX_UNMARK_ROWS}). Tarih araligini daraltin.`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    // 2) Orijinal sorumluluk merkezini geri yukleyebilmek icin eslesen satirlarin
    //    guid listesi (expectedCount <= MAX_UNMARK_ROWS oldugu icin liste kucuktur).
    const guidRequest = mikroService.pool!.request();
    guidRequest.input('cariCode', sql.NVarChar(50), cariCode);
    guidRequest.input('productCode', sql.NVarChar(50), productCode);
    guidRequest.input('fromDate', sql.DateTime, fromDate);
    guidRequest.input('toDate', sql.DateTime, toDate);
    const guidResult = await guidRequest.query(`
      SELECT TOP (${MAX_UNMARK_ROWS}) CONVERT(varchar(36), sth.sth_Guid) AS lineGuid
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      WHERE ${whereSql}
    `);
    const lineGuids = Array.from(
      new Set(
        (Array.isArray(guidResult.recordset) ? guidResult.recordset : [])
          .map((row: any) => String(row?.lineGuid || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    // 3) MARK_TOPLU loglarindan guid -> onceki sorumluluk merkezi haritasi
    //    (markUcarerSalesLineAsToplu logu: metadata.lineGuid +
    //    previousValues.stockResponsibilityCenter; reports.service.ts:7113-7131).
    //    Guid basina en yeni GECERLI kayit alinir; onceki degeri 'TOPLU' olan kayitlar
    //    (alreadyToplu no-op loglari) atlanip daha eski loga bakilir. Log'da guid
    //    bulunamazsa mevcut davranis korunur: N'' yazilir (fallback).
    const restoreByGuid = new Map<string, string>();
    if (lineGuids.length > 0) {
      try {
        const guidSet = new Set(lineGuids);
        const markLogs = await prisma.ucarerOperationLog.findMany({
          where: { operationType: 'MARK_TOPLU', productCode },
          orderBy: { createdAt: 'desc' },
          take: 5000,
          select: { previousValues: true, metadata: true },
        });
        for (const log of markLogs) {
          const metadata = log.metadata as any;
          const guid = String(metadata?.lineGuid || '').trim().toUpperCase();
          if (!guid || !guidSet.has(guid) || restoreByGuid.has(guid)) continue;
          const previous = log.previousValues as any;
          const previousValue = String(previous?.stockResponsibilityCenter ?? '').trim();
          if (previousValue.toUpperCase() === 'TOPLU') continue;
          restoreByGuid.set(guid, previousValue.slice(0, 25));
        }
      } catch (error) {
        console.warn('UNMARK_TOPLU: MARK_TOPLU loglari okunamadi, bos degere donulecek:', error);
      }
    }
    // Bos deger zaten fallback (N''); haritaya sadece geri yuklenecek dolu degerler girer.
    const restoreEntries = Array.from(restoreByGuid.entries()).filter(([, value]) => value !== '');

    // 4) Parametreli + OUTPUT'lu guncelleme (guid -> orijinal deger eslesmesi
    //    @map tablo degiskeniyle; eslesmeyen satirlar N'' — mevcut davranis).
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;

    const updateRequest = mikroService.pool!.request();
    (updateRequest as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);
    updateRequest.input('cariCode', sql.NVarChar(50), cariCode);
    updateRequest.input('productCode', sql.NVarChar(50), productCode);
    updateRequest.input('fromDate', sql.DateTime, fromDate);
    updateRequest.input('toDate', sql.DateTime, toDate);
    const mapValueRows = restoreEntries.map(([guid, value], index) => {
      updateRequest.input(`mg${index}`, sql.VarChar(36), guid);
      updateRequest.input(`mv${index}`, sql.NVarChar(25), value);
      return `(CAST(@mg${index} AS uniqueidentifier), @mv${index})`;
    });
    const mapInsertSql = mapValueRows.length > 0
      ? `INSERT INTO @map (lineGuid, restoreValue) VALUES ${mapValueRows.join(', ')};`
      : '';
    const updateResult = await updateRequest.query(`
      SET NOCOUNT ON;
      DECLARE @res TABLE (
        lineGuid varchar(36),
        documentSeries nvarchar(25),
        documentSequence int,
        documentLineNo int,
        saleDate datetime,
        restoredValue nvarchar(25)
      );
      DECLARE @map TABLE (lineGuid uniqueidentifier PRIMARY KEY, restoreValue nvarchar(25));
      ${mapInsertSql}

      UPDATE sth
      SET
        sth_stok_srm_merkezi = ISNULL(m.restoreValue, N''),
        sth_lastup_date = GETDATE(),
        sth_lastup_user = CASE WHEN ISNULL(sth_lastup_user, 0) = 0 THEN ${mikroUserNo} ELSE sth_lastup_user END
      OUTPUT
        CONVERT(varchar(36), inserted.sth_Guid),
        RTRIM(ISNULL(inserted.sth_evrakno_seri, '')),
        CAST(ISNULL(inserted.sth_evrakno_sira, 0) AS int),
        CAST(ISNULL(inserted.sth_satirno, 0) AS int),
        inserted.sth_tarih,
        LTRIM(RTRIM(ISNULL(inserted.sth_stok_srm_merkezi, '')))
      INTO @res
      FROM STOK_HAREKETLERI sth
      LEFT JOIN @map m ON m.lineGuid = sth.sth_Guid
      WHERE ${whereSql};

      SELECT lineGuid, documentSeries, documentSequence, documentLineNo, saleDate, restoredValue FROM @res;
    `);

    const updatedRows = Array.isArray(updateResult.recordset) ? updateResult.recordset : [];
    const affected = updatedRows.length;

    // Geri yuklenen degerlerin dagilimi (log icin): deger -> satir sayisi
    const restoredDistribution: Record<string, number> = {};
    updatedRows.forEach((row: any) => {
      const value = String(row?.restoredValue || '').trim();
      const key = value || '(bos)';
      restoredDistribution[key] = (restoredDistribution[key] || 0) + 1;
    });

    await this.logOperation({
      operationType: 'UNMARK_TOPLU',
      title: `TOPLU grubu talebe geri alindi: ${cariCode} x ${productCode} (${affected} satir)`,
      productCode,
      supplierCode: null,
      previousValues: { stockResponsibilityCenter: 'TOPLU' },
      newValues: { stockResponsibilityCenter: '', restoredValues: restoredDistribution },
      metadata: {
        cariCode,
        productCode,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        affected,
        expectedCount,
        restoredFromLogCount: restoreEntries.length,
        lines: updatedRows.slice(0, 50).map((row: any) => ({
          lineGuid: String(row?.lineGuid || '').trim(),
          documentNo: `${String(row?.documentSeries || '').trim()}-${Math.trunc(Number(row?.documentSequence) || 0)}`,
          documentLineNo: Math.trunc(Number(row?.documentLineNo) || 0),
          restoredValue: String(row?.restoredValue || '').trim(),
        })),
      },
      userId: userId || null,
    });

    return {
      affected,
      cariCode,
      productCode,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
    };
  }

  /**
   * TOPLU ADAY TARAMA (SALT OKUMA)
   *
   * TOPLU olarak isaretlenmemis (srm <> TOPLU) satis satirlarindan, urunun tipik
   * evrak miktarina gore "tek seferlik buyuk" gorunen (spike) evraklari bulur.
   * Ayni satis-satiri filtreleri: sth_tip=1, sth_cins=0, sth_evraktip IN (1,4),
   * sth_iptal=0, sth_normal_iade=0.
   *
   * Spike mantigi (evrak = cari x urun x seri x sira, docQty = satirlarin toplami):
   * - Urunun >= 3 evraki varsa: typicalDocQty = test edilen evrak HARIC medyan;
   *   docQty >= spikeFactor * max(typicalDocQty, 1) VE docQty >= minQty ise spike.
   * - Urunun < 3 evraki varsa: docQty >= max(minQty * 4, 200) ise spike
   *   (sakin bir urunde tek seferlik buyuk satis).
   *
   * Spike'lar cari x urun bazinda gruplanir; her spike evragin TUM satirlari
   * spikeDocs'a eklenir (frontend bunlari isaretler).
   */
  async getTopluCandidates(options: {
    months?: number;
    spikeFactor?: number;
    minQty?: number;
  } = {}): Promise<TopluCandidatesReport> {
    const months = clampInt(options.months, 6, 1, 24);
    const spikeFactorRaw = Number(options.spikeFactor);
    const spikeFactor =
      Number.isFinite(spikeFactorRaw) && spikeFactorRaw >= 2 ? spikeFactorRaw : 5;
    const minQtyRaw = Number(options.minQty);
    const minQty = Number.isFinite(minQtyRaw) && minQtyRaw > 0 ? minQtyRaw : 50;

    // Rapor penceresi (frontend sozlesmesi): ana sorgunun kullandigi araligin kendisi.
    const windowRows = await mikroService.executeQuery(`
      SELECT
        CONVERT(varchar(10), DATEADD(MONTH, -${months}, CAST(GETDATE() AS date)), 126) AS windowFrom,
        CONVERT(varchar(10), CAST(GETDATE() AS date), 126) AS windowTo
    `);
    const windowFrom = String(windowRows?.[0]?.windowFrom || '').trim();
    const windowTo = String(windowRows?.[0]?.windowTo || '').trim();

    // NON-TOPLU satis satirlari (satir bazinda; guvenlik tavani MAX_CANDIDATE_LINES).
    // Sadece isaretlenebilir/gecerli GUID + evrak seri/sira olan satirlar cekilir.
    const rawRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      SELECT TOP ${MAX_CANDIDATE_LINES}
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))) AS cariCode,
        LTRIM(RTRIM(ISNULL(ch.cari_unvan1, ''))) AS cariName,
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
        LTRIM(RTRIM(ISNULL(st.sto_isim, ''))) AS productName,
        UPPER(LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, '')))) AS documentSeries,
        CAST(ISNULL(sth.sth_evrakno_sira, 0) AS int) AS documentSequence,
        CAST(ISNULL(sth.sth_satirno, 0) AS int) AS documentLineNo,
        CONVERT(varchar(36), sth.sth_Guid) AS lineGuid,
        CAST(ISNULL(sth.sth_miktar, 0) AS float) AS quantity,
        CAST(ISNULL(sth.sth_tutar, 0) AS float) AS amount,
        sth.sth_tarih AS saleDate
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = sth.sth_cari_kodu
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
      WHERE UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) <> 'TOPLU'
        AND ISNULL(sth.sth_tip, 0) = 1
        AND ISNULL(sth.sth_cins, 0) = 0
        AND ISNULL(sth.sth_normal_iade, 0) = 0
        AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
        AND ISNULL(sth.sth_iptal, 0) = 0
        AND sth.sth_tarih >= DATEADD(MONTH, -${months}, CAST(GETDATE() AS date))
        AND sth.sth_cari_kodu IS NOT NULL AND LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''
        AND sth.sth_stok_kod IS NOT NULL AND LTRIM(RTRIM(sth.sth_stok_kod)) <> ''
        AND sth.sth_evrakno_seri IS NOT NULL
        AND ISNULL(sth.sth_evrakno_sira, 0) > 0
        AND ISNULL(sth.sth_miktar, 0) > 0
      ORDER BY sth.sth_tarih DESC;
    `);

    const lines: CandidateSalesLine[] = (Array.isArray(rawRows) ? rawRows : [])
      .map((row: any) => {
        const cariCode = String(row?.cariCode || '').trim().toUpperCase();
        const productCode = String(row?.productCode || '').trim().toUpperCase();
        const lineGuid = String(row?.lineGuid || '').trim();
        const documentSeries = String(row?.documentSeries || '').trim().toUpperCase();
        const documentSequence = Math.trunc(Number(row?.documentSequence) || 0);
        const documentLineNo = Math.trunc(Number(row?.documentLineNo) || 0);
        const saleDateRaw = row?.saleDate ? new Date(row.saleDate) : null;
        return {
          cariCode,
          cariName: String(row?.cariName || '').trim() || cariCode,
          productCode,
          productName: String(row?.productName || '').trim() || productCode,
          documentSeries,
          documentSequence,
          documentLineNo,
          lineGuid,
          quantity: Math.max(0, Number(row?.quantity) || 0),
          amount: Number(row?.amount) || 0,
          saleDate: saleDateRaw && !Number.isNaN(saleDateRaw.getTime()) ? saleDateRaw : null,
        } as CandidateSalesLine;
      })
      .filter(
        (line) =>
          line.cariCode &&
          line.productCode &&
          line.lineGuid &&
          line.documentSeries &&
          line.documentSequence > 0 &&
          line.quantity > 0
      );

    const truncated = lines.length >= MAX_CANDIDATE_LINES;

    // 1) Satirlari evraklara topla (cari x urun x seri x sira). docQty = satirlarin toplami.
    const docMap = new Map<string, CandidateDoc>();
    for (const line of lines) {
      const key = `${line.cariCode}||${line.productCode}||${line.documentSeries}||${line.documentSequence}`;
      let doc = docMap.get(key);
      if (!doc) {
        doc = {
          cariCode: line.cariCode,
          cariName: line.cariName,
          productCode: line.productCode,
          productName: line.productName,
          documentSeries: line.documentSeries,
          documentSequence: line.documentSequence,
          docQty: 0,
          lines: [],
        };
        docMap.set(key, doc);
      }
      doc.docQty += line.quantity;
      doc.lines.push(line);
    }

    // 2) Urun bazinda evraklari topla (medyan + toplam evrak sayisi icin).
    const docsByProduct = new Map<string, CandidateDoc[]>();
    for (const doc of docMap.values()) {
      const list = docsByProduct.get(doc.productCode) || [];
      list.push(doc);
      docsByProduct.set(doc.productCode, list);
    }

    // 3) Spike tespiti (leave-one-out medyan) + cari x urun gruplama.
    const groupMap = new Map<string, TopluCandidateGroupRow>();
    for (const [productCode, docs] of docsByProduct.entries()) {
      const docCount = docs.length;
      const qtyList = docs.map((d) => d.docQty);
      const productHasHistory = docCount >= 3;

      for (const doc of docs) {
        let isSpike = false;
        let typicalDocQty = 0;

        if (productHasHistory) {
          // Test edilen evragi haric tutarak medyan.
          const others = qtyList.filter((_, idx) => docs[idx] !== doc);
          typicalDocQty = median(others.length > 0 ? others : qtyList);
          const threshold = spikeFactor * Math.max(typicalDocQty, 1);
          isSpike = doc.docQty >= threshold && doc.docQty >= minQty;
        } else {
          // Sakin urun: tek seferlik buyuk satis.
          typicalDocQty = median(qtyList);
          isSpike = doc.docQty >= Math.max(minQty * 4, 200);
        }

        if (!isSpike) continue;

        const groupKey = `${doc.cariCode}||${productCode}`;
        let group = groupMap.get(groupKey);
        if (!group) {
          group = {
            cariCode: doc.cariCode,
            cariName: doc.cariName,
            productCode,
            productName: doc.productName,
            docCount,
            spikeDocs: [],
            typicalDocQty: Math.round(typicalDocQty * 100) / 100,
            totalSpikeQty: 0,
            totalSpikeAmount: 0,
          };
          groupMap.set(groupKey, group);
        }
        // Bu spike evragin TUM satirlarini ekle (hepsi isaretlenebilir).
        for (const line of doc.lines) {
          group.spikeDocs.push({
            documentNo: `${line.documentSeries}-${line.documentSequence}`,
            documentDate: line.saleDate ? line.saleDate.toISOString() : '',
            quantity: line.quantity,
            amount: line.amount,
            lineGuid: line.lineGuid,
            documentSeries: line.documentSeries,
            documentSequence: line.documentSequence,
            documentLineNo: line.documentLineNo,
          });
          group.totalSpikeQty += line.quantity;
          group.totalSpikeAmount += line.amount;
        }
      }
    }

    let rows = Array.from(groupMap.values())
      .map((row) => ({
        ...row,
        totalSpikeQty: Math.round(row.totalSpikeQty * 100) / 100,
        totalSpikeAmount: Math.round(row.totalSpikeAmount * 100) / 100,
      }))
      .sort((a, b) => b.totalSpikeAmount - a.totalSpikeAmount);

    const groupTruncated = rows.length > MAX_CANDIDATE_GROUPS;
    if (groupTruncated) {
      rows = rows.slice(0, MAX_CANDIDATE_GROUPS);
    }

    return {
      months,
      spikeFactor,
      minQty,
      windowFrom,
      windowTo,
      rows,
      truncated: truncated || groupTruncated,
      summary: {
        groupCount: rows.length,
        totalSpikeAmount: rows.reduce((sum, row) => sum + row.totalSpikeAmount, 0),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Secilen aday satirlari TOPLU olarak isaretler (reports.service
   * markUcarerSalesLineAsToplu'yu satir satir cagirir). Her satir kendi
   * MIKRO yazma + UcarerOperationLog akisiyla gider; hatalar toplanir.
   */
  async markCandidateLines(
    lines: Array<{
      productCode?: string;
      lineGuid?: string;
      documentSeries?: string;
      documentSequence?: number;
      documentLineNo?: number;
    }>,
    userId?: string | null
  ): Promise<MarkCandidateLinesResult> {
    const input = Array.isArray(lines) ? lines : [];
    if (input.length === 0) {
      throw new AppError('Isaretlenecek satir bulunamadi.', 400, ErrorCode.BAD_REQUEST);
    }
    if (input.length > MAX_MARK_LINES) {
      throw new AppError(
        `Tek seferde en fazla ${MAX_MARK_LINES} satir isaretlenebilir (${input.length} gonderildi).`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    let marked = 0;
    const failed: Array<{ lineGuid: string; reason: string }> = [];

    for (const line of input) {
      const lineGuid = String(line?.lineGuid || '').trim();
      try {
        const result = await reportsService.markUcarerSalesLineAsToplu({
          productCode: line?.productCode,
          lineGuid: line?.lineGuid,
          documentSeries: line?.documentSeries,
          documentSequence: line?.documentSequence,
          documentLineNo: line?.documentLineNo,
          userId: userId || null,
        });
        // updated || alreadyToplu => sonuc olarak TOPLU. Ikisi de basari sayilir.
        if (result.updated || result.alreadyToplu) {
          marked += 1;
        } else {
          failed.push({ lineGuid, reason: 'Satir guncellenemedi.' });
        }
      } catch (error: any) {
        failed.push({
          lineGuid,
          reason: String(error?.message || 'Bilinmeyen hata').slice(0, 300),
        });
      }
    }

    return { marked, failed };
  }

  /**
   * UcarerOperationLog kaydi (reports.service.ts logUcarerOperation kalibi;
   * metod orada private oldugu icin burada tekrarlanir).
   */
  private async logOperation(input: {
    operationType: string;
    title: string;
    productCode?: string | null;
    productName?: string | null;
    supplierCode?: string | null;
    previousValues?: Record<string, any> | any[] | null;
    newValues?: Record<string, any> | any[] | null;
    metadata?: Record<string, any> | any[] | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      const normalizedUserId = String(input.userId || '').trim();
      let userId: string | null = null;
      let userName: string | null = null;
      if (normalizedUserId) {
        const user = await prisma.user.findUnique({
          where: { id: normalizedUserId },
          select: { id: true, name: true, email: true },
        });
        userId = user?.id || normalizedUserId;
        userName = user?.name || user?.email || null;
      }
      const jsonOrUndefined = (value: unknown): Prisma.InputJsonValue | undefined => {
        if (value === undefined || value === null) return undefined;
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      };
      await prisma.ucarerOperationLog.create({
        data: {
          operationType: String(input.operationType || 'UNKNOWN').trim() || 'UNKNOWN',
          title: String(input.title || '').trim() || 'Ucarer islemi',
          productCode: input.productCode ? String(input.productCode).trim().toUpperCase() : null,
          productName: input.productName ? String(input.productName).trim() : null,
          supplierCode: input.supplierCode ? String(input.supplierCode).trim().toUpperCase() : null,
          orderNumbers: [],
          previousValues: jsonOrUndefined(input.previousValues),
          newValues: jsonOrUndefined(input.newValues),
          metadata: jsonOrUndefined(input.metadata),
          userId,
          userName,
        },
      });
    } catch (error) {
      console.warn('TOPLU denetim islem logu yazilamadi:', error);
    }
  }
}

export default new TopluAuditService();
