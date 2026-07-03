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

const MAX_GROUPS = 2000;
const MAX_UNMARK_ROWS = 500;

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
