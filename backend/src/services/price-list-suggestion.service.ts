/**
 * Cari basina onerilen fiyat listesi motoru.
 *
 * Amac: Her cariye, son 12 aydaki gercek satis satirlarina bakarak
 * "bu cariye fiilen hangi fiyat listesinden satiyoruz?" sorusunun cevabini
 * faturali ve perakende (beyaz) duzlemler icin AYRI AYRI onermek.
 *
 * LISTE ESLEMESI (SABIT — Mikro STOK_SATIS_FIYAT_LISTELERI.sfiyat_listesirano):
 *   Dahili liste no 1..5  = "Perakende 1".."Perakende 5"  (beyaz/faturasiz duzlem)
 *   Dahili liste no 6..10 = "Faturali 1".."Faturali 5"    (faturali duzlem)
 *   Yani liste 6 = Faturali 1 (EN YUKSEK fiyat) ... liste 10 = Faturali 5 (EN DUSUK fiyat).
 *   Ayni sekilde liste 1 = Perakende 1 (en yuksek) ... liste 5 = Perakende 5 (en dusuk).
 *
 * KDV DUZLEMI NOTU:
 *   Mikro STOK_HAREKETLERI'nde sth_tutar satirin KDV-HARIC tutaridir; KDV ayri
 *   kolonda (sth_vergi) tutulur. Dolayisiyla:
 *     - Faturali satir (sth_vergi > 0): birim fiyat = sth_tutar/sth_miktar zaten
 *       KDV-haric net fiyattir ve faturali listeler (6-10, net fiyat) ile AYNI
 *       duzlemdedir; ekstra KDV arindirma GEREKMEZ.
 *     - Beyaz satir (sth_vergi = 0): tahsil edilen tutarin tamami sth_tutar'dadir
 *       ve perakende listeleri (1-5) ile ayni duzlemde kiyaslanir.
 *   Satir tipi faturali ise SADECE 6-10, beyaz ise SADECE 1-5 icinden en yakin
 *   liste secilir; iki duzlem asla birbirine kiyaslanmaz.
 *
 * Manuel tanim: manualInvoicedListNo / manualRetailListNo doluysa ekranlarda
 * sistem onerisi yerine manuel deger gosterilir ("manuel belirlenen oneri").
 * Turetme mantigi tek yerde dursun diye getDisplayFor() buradan export edilir.
 *
 * Bu servis Mikro'ya SADECE OKUMA yapar (SELECT); hicbir yazma islemi yoktur.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { AppError, ErrorCode } from '../types/errors';

// ==================== SABITLER ====================

/** Perakende (beyaz) duzlem listeleri: 1-5. */
const RETAIL_LIST_NOS = [1, 2, 3, 4, 5] as const;
/** Faturali duzlem listeleri: 6-10 (liste 6 = Faturali 1 ... liste 10 = Faturali 5). */
const INVOICED_LIST_NOS = [6, 7, 8, 9, 10] as const;

/** Oneri uretmek icin duzlem basina gereken minimum satis satiri. */
const MIN_LINES_PER_PLANE = 5;
/** Analiz penceresi (ay). */
const LOOKBACK_MONTHS = 12;
/** Cari kodu IN(...) chunk boyutu (Mikro sorgusu). */
const CARI_CHUNK_SIZE = 100;
/** Chunk basina cekilecek maksimum satis satiri (guard). */
const MAX_ROWS_PER_CHUNK = 50000;
/** Stok kodu IN(...) chunk boyutu (liste fiyati bulk sorgusu). */
const PRODUCT_CHUNK_SIZE = 500;
/** Prisma update paralellik chunk boyutu. */
const UPDATE_CHUNK_SIZE = 20;
/**
 * Bir satirin en yakin listeye goreli sapmasi bu esigi asarsa satir "hicbir
 * listeye benzemiyor" (ozel anlasma / veri gurultusu) sayilir ve dagilima
 * katilmaz. Medyani tek tuk asiri satirin cekmemesi icin genis bir esik.
 */
const MAX_REL_DIFF = 0.5;

// ==================== TIPLER ====================

export type PriceListSource = 'MANUAL' | 'AUTO';

export interface PriceListDisplaySide {
  /** Dahili liste no (perakende 1-5, faturali 6-10) veya null (oneri yok). */
  listNo: number | null;
  /** Kullaniciya gosterilecek ad: "Faturali 3" / "Perakende 2". */
  label: string | null;
  /** MANUAL = manuel belirlenen oneri, AUTO = sistem onerisi. */
  source: PriceListSource | null;
  /** Hazir ekran metni: "Manuel belirlenen oneri" / "Sistem onerisi". */
  sourceLabel: string | null;
}

export interface PriceListDisplay {
  invoiced: PriceListDisplaySide;
  retail: PriceListDisplaySide;
  /** Sistem onerisinin dayanagi (sadece AUTO taraflar icin anlamli). */
  basis: string | null;
  /** Sistem onerisinin hesaplanma zamani. */
  computedAt: Date | string | null;
  /** Manuel tanim meta bilgisi (manuel tanim yoksa null). */
  manual: {
    note: string | null;
    setAt: Date | string | null;
    setByName: string | null;
  } | null;
}

/** getDisplayFor'un ihtiyac duydugu minimal user alanlari. */
export interface PriceListSuggestionUserFields {
  suggestedInvoicedListNo?: number | null;
  suggestedRetailListNo?: number | null;
  suggestedListBasis?: string | null;
  suggestedListComputedAt?: Date | string | null;
  manualInvoicedListNo?: number | null;
  manualRetailListNo?: number | null;
  manualListNote?: string | null;
  manualListSetAt?: Date | string | null;
  manualListSetByName?: string | null;
}

export interface SetManualPayload {
  manualInvoicedListNo?: number | null;
  manualRetailListNo?: number | null;
  manualListNote?: string | null;
}

/** Duzlem basina satir dagilimi birikimi. */
interface PlaneAggregate {
  /** Bir listeye atanabilen satir sayisi. */
  lines: number;
  /** Toplam agirlik (satir tutari toplami). */
  totalWeight: number;
  /** listNo -> toplam agirlik (tutar-agirlikli dagilim). */
  weightByList: Map<number, number>;
  /** sum(agirlik * goreli sapma) — agirlikli ortalama sapma icin. */
  weightedDiffSum: number;
}

interface CustomerAggregate {
  invoiced: PlaneAggregate;
  retail: PlaneAggregate;
}

// ==================== YARDIMCILAR ====================

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const createPlaneAggregate = (): PlaneAggregate => ({
  lines: 0,
  totalWeight: 0,
  weightByList: new Map<number, number>(),
  weightedDiffSum: 0,
});

/**
 * Dahili liste no -> gosterim adi.
 *   1..5  -> "Perakende 1".."Perakende 5"
 *   6..10 -> "Faturali 1".."Faturali 5"   (6 = Faturali 1 ... 10 = Faturali 5)
 */
export const getListLabel = (listNo: number | null | undefined): string | null => {
  if (listNo === null || listNo === undefined || !Number.isInteger(listNo)) return null;
  if (listNo >= 1 && listNo <= 5) return `Perakende ${listNo}`;
  if (listNo >= 6 && listNo <= 10) return `Faturalı ${listNo - 5}`;
  return null;
};

/**
 * Adaylar icinden birim fiyata GORELI olarak en yakin listeyi bul.
 * Yakinlik olcusu: |fiyat - listeFiyati| / listeFiyati (minimal olan kazanir).
 * Fiyati 0/null olan listeler aday degildir.
 */
const assignNearestList = (
  unitPrice: number,
  candidateListNos: readonly number[],
  pricesByList: Map<number, number> | undefined
): { listNo: number; relDiff: number } | null => {
  if (!pricesByList || !Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  let best: { listNo: number; relDiff: number } | null = null;
  for (const listNo of candidateListNos) {
    const listPrice = pricesByList.get(listNo);
    if (typeof listPrice !== 'number' || !Number.isFinite(listPrice) || listPrice <= 0) continue;
    const relDiff = Math.abs(unitPrice - listPrice) / listPrice;
    if (!best || relDiff < best.relDiff) {
      best = { listNo, relDiff };
    }
  }
  if (best && best.relDiff > MAX_REL_DIFF) return null;
  return best;
};

/**
 * Tutar-agirlikli medyan liste: listeler no'ya gore siralanir, kumulatif
 * agirlik toplam agirligin yarisina ulastigi listedeki deger secilir.
 */
const weightedMedianList = (weightByList: Map<number, number>): number | null => {
  const entries = Array.from(weightByList.entries())
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  const half = total / 2;
  let cumulative = 0;
  for (const [listNo, weight] of entries) {
    cumulative += weight;
    if (cumulative >= half) return listNo;
  }
  return entries[entries.length - 1][0];
};

const formatPercent = (ratio: number): string => `%${(ratio * 100).toFixed(1)}`;

/** Duzlem sonucunu (oneri + basis parcasi) uret. */
const resolvePlane = (
  agg: PlaneAggregate,
  planeName: 'faturalı' | 'beyaz'
): { suggestion: number | null; basisPart: string } => {
  if (agg.lines === 0) {
    return { suggestion: null, basisPart: `${planeName} satır yok` };
  }
  if (agg.lines < MIN_LINES_PER_PLANE) {
    return {
      suggestion: null,
      basisPart: `${agg.lines} ${planeName} satır (yetersiz veri, min ${MIN_LINES_PER_PLANE})`,
    };
  }
  const median = weightedMedianList(agg.weightByList);
  if (median === null) {
    return { suggestion: null, basisPart: `${agg.lines} ${planeName} satır (liste eşleşmesi yok)` };
  }
  const avgDiff = agg.totalWeight > 0 ? agg.weightedDiffSum / agg.totalWeight : 0;
  return {
    suggestion: median,
    basisPart: `${agg.lines} ${planeName} satır (medyan ${getListLabel(median)}, ort sapma ${formatPercent(avgDiff)})`,
  };
};

// ==================== SERVIS ====================

class PriceListSuggestionService {
  /**
   * Tum aktif CUSTOMER kullanicilar icin onerilen faturali/perakende listeyi
   * hesaplar ve User.suggested* alanlarina yazar (PostgreSQL; Mikro'ya yazma YOK).
   *
   * Strateji:
   *  1) Aktif, mikroCariCode dolu CUSTOMER kullanicilari cek.
   *  2) Cari kodlarini 100'erli chunk'larla Mikro'dan son 12 ay satis satirlarini
   *     oku (chunk basina TOP 50000 guard, en yeni satirlar oncelikli).
   *  3) Gecen distinct stok kodlarinin 10 liste fiyatini bulk cek (500'erli IN).
   *  4) Her satiri kendi KDV duzlemindeki (faturali: 6-10, beyaz: 1-5) en yakin
   *     listeye ata; cari basina tutar-agirlikli dagilimdan agirlikli medyan al.
   *  5) Duzlem basina < MIN_LINES_PER_PLANE satir varsa o duzlemin onerisi null.
   *  6) Sonuclari 20'serli paralel chunk'larla User tablosuna yaz.
   */
  async runForAllCustomers(): Promise<{ processed: number; suggested: number }> {
    const startedAt = Date.now();

    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        active: true,
        mikroCariCode: { not: null },
      },
      select: { id: true, mikroCariCode: true },
    });

    // Cari kodu bos string olanlari ele; anahtar normalize (trim + upper).
    const customerList = customers
      .map((c) => ({ id: c.id, cariCode: String(c.mikroCariCode || '').trim() }))
      .filter((c) => c.cariCode.length > 0);

    if (customerList.length === 0) {
      console.log('Price list suggestion: kapsamda musteri yok.');
      return { processed: 0, suggested: 0 };
    }

    const aggregateByCari = new Map<string, CustomerAggregate>();
    const getAggregate = (cariKey: string): CustomerAggregate => {
      let agg = aggregateByCari.get(cariKey);
      if (!agg) {
        agg = { invoiced: createPlaneAggregate(), retail: createPlaneAggregate() };
        aggregateByCari.set(cariKey, agg);
      }
      return agg;
    };

    // ---- 1. adim: satis satirlarini chunk chunk topla (once ham satirlar) ----
    type SaleLine = {
      cariKey: string;
      productCode: string;
      unitPrice: number;
      lineTotal: number;
      vatAmount: number;
    };
    const saleLines: SaleLine[] = [];
    const productCodes = new Set<string>();

    // Chunk hatasi korumasi: sorgusu basarisiz olan chunk'lardaki carilerin
    // MEVCUT suggested*/basis degerleri korunur (yanlislikla "satis yok" diye
    // silinmesin). Tum chunk'lar basarisizsa hic yazmadan erken donulur.
    const failedCariKeys = new Set<string>();
    let cariChunkTotal = 0;
    let cariChunkFailures = 0;

    const cariCodes = Array.from(new Set(customerList.map((c) => c.cariCode)));
    for (const chunk of chunkArray(cariCodes, CARI_CHUNK_SIZE)) {
      cariChunkTotal += 1;
      const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      try {
        // Satis satirlari: sth_tip=1 (normal hareket), evraktip 1/4 (irsaliye/fatura),
        // iade haric, iptal haric, miktar > 0, son 12 ay.
        // TOP guard: en yeni satirlar oncelikli (ORDER BY tarih DESC) — limit asildiginda
        // eski satirlar dusurulur, guncel fiyat davranisi korunur.
        const rows = await mikroService.executeQuery(`
          SELECT TOP ${MAX_ROWS_PER_CHUNK}
            RTRIM(sth.sth_cari_kodu) AS cariCode,
            UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
            CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) AS quantity,
            CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT) AS lineTotal,
            CAST(ISNULL(sth.sth_vergi, 0) AS FLOAT) AS vatAmount
          FROM STOK_HAREKETLERI sth WITH (NOLOCK)
          WHERE sth.sth_cins = 0
            AND sth.sth_tip = 1
            AND sth.sth_evraktip IN (1, 4)
            AND ISNULL(sth.sth_normal_iade, 0) = 0
            AND (sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)
            AND ISNULL(sth.sth_miktar, 0) > 0
            AND sth.sth_tarih >= DATEADD(MONTH, -${LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
            AND sth.sth_stok_kod IS NOT NULL
            AND LTRIM(RTRIM(sth.sth_stok_kod)) <> ''
            AND RTRIM(sth.sth_cari_kodu) IN (${inClause})
          ORDER BY sth.sth_tarih DESC
        `);

        for (const row of Array.isArray(rows) ? rows : []) {
          const cariKey = String(row?.cariCode || '').trim().toUpperCase();
          const productCode = String(row?.productCode || '').trim().toUpperCase();
          const quantity = Number(row?.quantity) || 0;
          const lineTotal = Number(row?.lineTotal) || 0;
          const vatAmount = Number(row?.vatAmount) || 0;
          if (!cariKey || !productCode || quantity <= 0 || lineTotal <= 0) continue;
          const unitPrice = lineTotal / quantity;
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
          saleLines.push({ cariKey, productCode, unitPrice, lineTotal, vatAmount });
          productCodes.add(productCode);
        }
      } catch (error) {
        // Tek chunk hatasi tum calismayi durdurmasin; o chunk'taki carilerin
        // MEVCUT onerileri korunur (asagida update'ten atlanir) ve sonraki
        // gece tekrar denenir.
        cariChunkFailures += 1;
        chunk.forEach((code) => failedCariKeys.add(code.toUpperCase()));
        console.error(
          `Price list suggestion: cari chunk sorgusu basarisiz (${chunk.length} cari):`,
          (error as any)?.message || error
        );
      }
    }

    if (cariChunkTotal > 0 && cariChunkFailures === cariChunkTotal) {
      console.error(
        `Price list suggestion: TUM cari chunk sorgulari basarisiz (${cariChunkFailures}/${cariChunkTotal}); mevcut oneriler korunuyor, yazma yapilmadi.`
      );
      return { processed: 0, suggested: 0 };
    }

    // ---- 2. adim: gecen urunlerin 10 liste fiyatini bulk cek ----
    // listPriceMap: stok kodu -> (listesirano -> fiyat)
    const listPriceMap = new Map<string, Map<number, number>>();
    let priceChunkTotal = 0;
    let priceChunkFailures = 0;
    for (const chunk of chunkArray(Array.from(productCodes), PRODUCT_CHUNK_SIZE)) {
      if (chunk.length === 0) continue;
      priceChunkTotal += 1;
      const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      try {
        const priceRows = await mikroService.executeQuery(`
          SELECT
            UPPER(LTRIM(RTRIM(sfiyat_stokkod))) AS productCode,
            sfiyat_listesirano AS listNo,
            CAST(ISNULL(sfiyat_fiyati, 0) AS FLOAT) AS price
          FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
          WHERE sfiyat_listesirano BETWEEN 1 AND 10
            AND sfiyat_deposirano = 0
            AND sfiyat_doviz = 0
            AND sfiyat_odemeplan = 0
            AND sfiyat_iptal = 0
            AND UPPER(LTRIM(RTRIM(sfiyat_stokkod))) IN (${inClause})
        `);
        for (const row of Array.isArray(priceRows) ? priceRows : []) {
          const code = String(row?.productCode || '').trim().toUpperCase();
          const listNo = Number(row?.listNo);
          const price = Number(row?.price);
          if (!code || !Number.isInteger(listNo) || listNo < 1 || listNo > 10) continue;
          if (!Number.isFinite(price) || price <= 0) continue; // 0/null liste fiyati atlanir
          if (!listPriceMap.has(code)) listPriceMap.set(code, new Map<number, number>());
          listPriceMap.get(code)!.set(listNo, price);
        }
      } catch (error) {
        priceChunkFailures += 1;
        console.error(
          `Price list suggestion: liste fiyati chunk sorgusu basarisiz (${chunk.length} urun):`,
          (error as any)?.message || error
        );
      }
    }

    // Liste fiyatlari TAMAMEN cekilemediyse hicbir satir listeye atanamaz ve tum
    // cariler yanlislikla "liste eslesmesi yok" olarak yazilir; erken don.
    if (priceChunkTotal > 0 && priceChunkFailures === priceChunkTotal) {
      console.error(
        `Price list suggestion: TUM liste fiyati chunk sorgulari basarisiz (${priceChunkFailures}/${priceChunkTotal}); mevcut oneriler korunuyor, yazma yapilmadi.`
      );
      return { processed: 0, suggested: 0 };
    }

    // ---- 3. adim: satirlari duzlemine gore en yakin listeye ata ----
    for (const line of saleLines) {
      // KDV duzlemi: satirda KDV varsa faturali (listeler 6-10), yoksa beyaz (1-5).
      // sth_tutar KDV-haric oldugu icin iki durumda da birim fiyat liste ile ayni
      // duzlemdedir (dosya basindaki KDV DUZLEMI NOTU'na bak).
      const isInvoiced = line.vatAmount > 0;
      const candidates = isInvoiced ? INVOICED_LIST_NOS : RETAIL_LIST_NOS;
      const assigned = assignNearestList(line.unitPrice, candidates, listPriceMap.get(line.productCode));
      if (!assigned) continue;

      const agg = getAggregate(line.cariKey);
      const plane = isInvoiced ? agg.invoiced : agg.retail;
      const weight = line.lineTotal; // tutar-agirlikli dagilim
      plane.lines += 1;
      plane.totalWeight += weight;
      plane.weightByList.set(assigned.listNo, (plane.weightByList.get(assigned.listNo) || 0) + weight);
      plane.weightedDiffSum += weight * assigned.relDiff;
    }

    // ---- 4. adim: cari basina oneri + basis uret, User tablosuna yaz ----
    const computedAt = new Date();
    let suggestedCount = 0;

    // Sorgusu basarisiz olan chunk'lardaki cariler update'ten atlanir:
    // onceki suggested*/basis degerleri aynen korunur.
    const updateCandidates = customerList.filter(
      (customer) => !failedCariKeys.has(customer.cariCode.toUpperCase())
    );
    const skippedCount = customerList.length - updateCandidates.length;
    if (skippedCount > 0) {
      console.warn(
        `Price list suggestion: ${skippedCount} cari basarisiz chunk nedeniyle atlandi (mevcut onerileri korundu).`
      );
    }

    const updates = updateCandidates.map((customer) => {
      const cariKey = customer.cariCode.toUpperCase();
      const agg = aggregateByCari.get(cariKey);

      let suggestedInvoicedListNo: number | null = null;
      let suggestedRetailListNo: number | null = null;
      let basis: string;

      if (!agg) {
        basis = `Son ${LOOKBACK_MONTHS} ay: satış hareketi bulunamadı`;
      } else {
        const invoiced = resolvePlane(agg.invoiced, 'faturalı');
        const retail = resolvePlane(agg.retail, 'beyaz');
        suggestedInvoicedListNo = invoiced.suggestion;
        suggestedRetailListNo = retail.suggestion;
        basis = `Son ${LOOKBACK_MONTHS} ay: ${invoiced.basisPart}; ${retail.basisPart}`;
      }

      if (suggestedInvoicedListNo !== null || suggestedRetailListNo !== null) {
        suggestedCount += 1;
      }

      return {
        id: customer.id,
        data: {
          suggestedInvoicedListNo,
          suggestedRetailListNo,
          suggestedListBasis: basis,
          suggestedListComputedAt: computedAt,
        },
      };
    });

    for (const batch of chunkArray(updates, UPDATE_CHUNK_SIZE)) {
      await Promise.all(
        batch.map((update) =>
          prisma.user
            .update({ where: { id: update.id }, data: update.data })
            .catch((error) => {
              console.error(
                `Price list suggestion: user update basarisiz (${update.id}):`,
                (error as any)?.message || error
              );
            })
        )
      );
    }

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `Price list suggestion: ${updates.length} cari islendi (${skippedCount} atlandi), ${suggestedCount} cari icin oneri uretildi (${saleLines.length} satir, ${durationSec}s).`
    );

    return { processed: updates.length, suggested: suggestedCount };
  }

  /**
   * Manuel liste tanimi. Manuel deger doluysa ekranlarda sistem onerisi yerine
   * manuel deger "manuel belirlenen oneri" olarak gosterilir.
   *
   * Kurallar:
   *  - manualInvoicedListNo: 6-10 arasi tamsayi (Faturali 1-5) veya null.
   *  - manualRetailListNo: 1-5 arasi tamsayi (Perakende 1-5) veya null.
   *  - Tum alanlar null ise manuel tanim TEMIZLENIR (setAt/setByName da null olur).
   */
  async setManual(
    customerId: string,
    payload: SetManualPayload,
    userName: string
  ): Promise<PriceListDisplay> {
    const manualInvoicedListNo = payload.manualInvoicedListNo ?? null;
    const manualRetailListNo = payload.manualRetailListNo ?? null;
    const manualListNote =
      typeof payload.manualListNote === 'string' && payload.manualListNote.trim().length > 0
        ? payload.manualListNote.trim().slice(0, 500)
        : null;

    if (
      manualInvoicedListNo !== null &&
      (!Number.isInteger(manualInvoicedListNo) || manualInvoicedListNo < 6 || manualInvoicedListNo > 10)
    ) {
      throw new AppError(
        'Manuel faturalı liste 6-10 arası olmalıdır (6 = Faturalı 1 ... 10 = Faturalı 5).',
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    if (
      manualRetailListNo !== null &&
      (!Number.isInteger(manualRetailListNo) || manualRetailListNo < 1 || manualRetailListNo > 5)
    ) {
      throw new AppError(
        'Manuel perakende liste 1-5 arası olmalıdır (Perakende 1-5).',
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, role: true },
    });
    if (!customer || customer.role !== 'CUSTOMER') {
      throw new AppError('Müşteri bulunamadı.', 404, ErrorCode.USER_NOT_FOUND);
    }

    // Hepsi null ise manuel tanim temizlenmis sayilir.
    const isClear = manualInvoicedListNo === null && manualRetailListNo === null && manualListNote === null;

    const updated = await prisma.user.update({
      where: { id: customerId },
      data: {
        manualInvoicedListNo,
        manualRetailListNo,
        manualListNote,
        manualListSetAt: isClear ? null : new Date(),
        manualListSetByName: isClear ? null : String(userName || '').trim() || null,
      },
      select: {
        suggestedInvoicedListNo: true,
        suggestedRetailListNo: true,
        suggestedListBasis: true,
        suggestedListComputedAt: true,
        manualInvoicedListNo: true,
        manualRetailListNo: true,
        manualListNote: true,
        manualListSetAt: true,
        manualListSetByName: true,
      },
    });

    return this.getDisplayFor(updated);
  }

  /**
   * Frontend'in gosterecegi nihai oneriyi turetir (PURE — DB erisimi yok).
   * Manuel alan doluysa manuel deger + source=MANUAL ("manuel belirlenen oneri"),
   * degilse sistem onerisi + source=AUTO. Ikisi de yoksa null.
   * Route katmani (baska ajan) bu fonksiyonu kullanmalidir ki turetme mantigi
   * tek yerde dursun.
   */
  getDisplayFor(user: PriceListSuggestionUserFields): PriceListDisplay {
    const buildSide = (
      manualListNo: number | null | undefined,
      suggestedListNo: number | null | undefined
    ): PriceListDisplaySide => {
      if (manualListNo !== null && manualListNo !== undefined) {
        return {
          listNo: manualListNo,
          label: getListLabel(manualListNo),
          source: 'MANUAL',
          sourceLabel: 'Manuel belirlenen öneri',
        };
      }
      if (suggestedListNo !== null && suggestedListNo !== undefined) {
        return {
          listNo: suggestedListNo,
          label: getListLabel(suggestedListNo),
          source: 'AUTO',
          sourceLabel: 'Sistem önerisi',
        };
      }
      return { listNo: null, label: null, source: null, sourceLabel: null };
    };

    const hasManual =
      (user.manualInvoicedListNo !== null && user.manualInvoicedListNo !== undefined) ||
      (user.manualRetailListNo !== null && user.manualRetailListNo !== undefined);

    return {
      invoiced: buildSide(user.manualInvoicedListNo, user.suggestedInvoicedListNo),
      retail: buildSide(user.manualRetailListNo, user.suggestedRetailListNo),
      basis: user.suggestedListBasis ?? null,
      computedAt: user.suggestedListComputedAt ?? null,
      manual: hasManual
        ? {
            note: user.manualListNote ?? null,
            setAt: user.manualListSetAt ?? null,
            setByName: user.manualListSetByName ?? null,
          }
        : null,
    };
  }
}

const priceListSuggestionService = new PriceListSuggestionService();
export default priceListSuggestionService;
