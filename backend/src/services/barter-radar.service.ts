/**
 * Borc-Mal Takasi Radari (SALT OKUMA)
 *
 * Vadesi gecmis bakiyesi olan carileri, bizim satin alma ihtiyacimizla kesistirir:
 * "nakit yerine su mali getir, mahsuplasalim".
 *
 * Kaynaklar:
 * - PG VadeBalance: pastDueBalance >= minPastDue olan cariler (User.mikroCariCode).
 * - Mikro: cari ana tedarikci olarak geciyor mu (STOKLAR.sto_sat_cari_kod) VEYA
 *   gecmiste kendisine verilen siparis kesilmis mi (SIPARISLER sip_tip=1, son 24 ay).
 * - Ihtiyac: STOK_DEPO_DETAYLARI sdp_min_stok (depo 1=Merkez, 6=Topca) +
 *   dbo.fn_DepodakiMiktar guncel stok; depo basina EFEKTIF stok =
 *   stok - acik musteri siparisi (sip_tip=0) + acik satin alma siparisi (sip_tip=1)
 *   (stock-f10.service.ts "Satilabilir" kalibi); min > 0 ve efektif < min ise ihtiyac var.
 *   (DEPO_MERKEZ_DURUM/DEPO_TOPCA_DURUM view'larinin hafif alternatifi; ayni
 *   min/stok mantigi, reports.service.ts getUcarerDepotReport ile uyumlu.)
 *
 * Bu servis Mikro'ya HICBIR yazma yapmaz.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikro.service';

const MAX_CUSTOMERS = 50;
const MAX_PRODUCTS_PER_CUSTOMER = 50;
const MAX_PRODUCT_ROWS = 2500;
const PAST_ORDER_LOOKBACK_MONTHS = 24;

export interface BarterDepotNeed {
  min: number;
  stock: number;
  openCustomer: number;   // acik (alinan) musteri siparisi kalani — rezerve stok
  openPurchase: number;   // acik (verilen) satin alma siparisi kalani — yolda gelen
  effectiveStock: number; // stock - openCustomer + openPurchase
  need: number;           // min > 0 ? max(0, min - effectiveStock) : 0
}

export interface BarterProductRow {
  productCode: string;
  productName: string;
  isMainSupplier: boolean;
  hasPastOrders: boolean;
  merkez: BarterDepotNeed;
  topca: BarterDepotNeed;
  needQuantity: number;
  unitCost: number;
  amount: number;
}

export interface BarterCustomerRow {
  cariCode: string;
  cariName: string;
  pastDueBalance: number;
  pastDueDate: string | null;
  products: BarterProductRow[];
  productCount: number;
  barterPotential: number; // urun ihtiyaclarinin toplam tutari
  cappedPotential: number; // min(vadesi gecmis bakiye, barterPotential)
}

export interface BarterRadarReport {
  minPastDue: number;
  rows: BarterCustomerRow[];
  summary: {
    matchedCustomerCount: number;
    totalPotential: number; // capped toplami
    totalPastDue: number;
  };
  generatedAt: string;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

class BarterRadarService {
  async getBarterRadar(options: { minPastDue?: number } = {}): Promise<BarterRadarReport> {
    const minPastDueRaw = Number(options.minPastDue);
    const minPastDue = Number.isFinite(minPastDueRaw) && minPastDueRaw > 0 ? minPastDueRaw : 50000;

    // a) Vadesi gecmis bakiyesi esigin uzerinde olan cariler (PG)
    const balances = await prisma.vadeBalance.findMany({
      where: {
        pastDueBalance: { gte: minPastDue },
        user: { mikroCariCode: { not: null } },
      },
      orderBy: { pastDueBalance: 'desc' },
      take: MAX_CUSTOMERS,
      select: {
        pastDueBalance: true,
        pastDueDate: true,
        user: {
          select: {
            mikroCariCode: true,
            name: true,
            mikroName: true,
            displayName: true,
          },
        },
      },
    });

    const customers = balances
      .map((row) => ({
        cariCode: String(row.user?.mikroCariCode || '').trim().toUpperCase(),
        cariName:
          String(row.user?.displayName || row.user?.mikroName || row.user?.name || '').trim() ||
          String(row.user?.mikroCariCode || '').trim().toUpperCase(),
        pastDueBalance: Number(row.pastDueBalance) || 0,
        pastDueDate: row.pastDueDate ? new Date(row.pastDueDate).toISOString() : null,
      }))
      .filter((row) => Boolean(row.cariCode));

    if (customers.length === 0) {
      return {
        minPastDue,
        rows: [],
        summary: { matchedCustomerCount: 0, totalPotential: 0, totalPastDue: 0 },
        generatedAt: new Date().toISOString(),
      };
    }

    const inClause = customers
      .map((customer) => `'${escapeSqlLiteral(customer.cariCode)}'`)
      .join(', ');

    // b+d) Ana tedarikci urunleri + gecmiste verilen siparis kesilen urunler (birlesim),
    //      ihtiyac = min > 0 iken stok < min olan depo satirlari (SALT OKUMA)
    const rawRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      WITH SupplierProducts AS (
        SELECT
          cariCode,
          productCode,
          MAX(isMain) AS isMainSupplier,
          MAX(isOrder) AS hasPastOrders
        FROM (
          SELECT
            UPPER(LTRIM(RTRIM(s.sto_sat_cari_kod))) AS cariCode,
            UPPER(LTRIM(RTRIM(s.sto_kod))) AS productCode,
            1 AS isMain,
            0 AS isOrder
          FROM STOKLAR s WITH (NOLOCK)
          WHERE ISNULL(s.sto_pasif_fl, 0) = 0
            AND UPPER(LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))) IN (${inClause})
          UNION ALL
          SELECT
            UPPER(LTRIM(RTRIM(sip.sip_musteri_kod))) AS cariCode,
            UPPER(LTRIM(RTRIM(sip.sip_stok_kod))) AS productCode,
            0 AS isMain,
            1 AS isOrder
          FROM SIPARISLER sip WITH (NOLOCK)
          WHERE sip.sip_tip = 1
            AND ISNULL(sip.sip_iptal, 0) = 0
            AND UPPER(LTRIM(RTRIM(ISNULL(sip.sip_musteri_kod, '')))) IN (${inClause})
            AND LTRIM(RTRIM(ISNULL(sip.sip_stok_kod, ''))) <> ''
            AND ISNULL(sip.sip_tarih, sip.sip_create_date) >= DATEADD(MONTH, -${PAST_ORDER_LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
        ) u
        GROUP BY cariCode, productCode
      )
      SELECT TOP ${MAX_PRODUCT_ROWS}
        sp.cariCode,
        sp.productCode,
        LTRIM(RTRIM(ISNULL(st.sto_isim, ''))) AS productName,
        CAST(sp.isMainSupplier AS int) AS isMainSupplier,
        CAST(sp.hasPastOrders AS int) AS hasPastOrders,
        CAST(ISNULL(st.sto_standartmaliyet, 0) AS float) AS unitCost,
        CAST(ISNULL(mMin.sdp_min_stok, 0) AS float) AS merkezMin,
        CAST(ISNULL(tMin.sdp_min_stok, 0) AS float) AS topcaMin,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sp.productCode, 1, 0), 0) AS float) AS merkezStock,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sp.productCode, 6, 0), 0) AS float) AS topcaStock,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 0 AND o.sip_depono = 1 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS merkezOpenCustomer,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 1 AND o.sip_depono = 1 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS merkezOpenPurchase,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 0 AND o.sip_depono = 6 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS topcaOpenCustomer,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 1 AND o.sip_depono = 6 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS topcaOpenPurchase
      FROM SupplierProducts sp
      INNER JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sp.productCode
      LEFT JOIN STOK_DEPO_DETAYLARI mMin WITH (NOLOCK)
        ON LTRIM(RTRIM(mMin.sdp_depo_kod)) = sp.productCode AND mMin.sdp_depo_no = 1
      LEFT JOIN STOK_DEPO_DETAYLARI tMin WITH (NOLOCK)
        ON LTRIM(RTRIM(tMin.sdp_depo_kod)) = sp.productCode AND tMin.sdp_depo_no = 6
      WHERE ISNULL(st.sto_pasif_fl, 0) = 0
        AND (ISNULL(mMin.sdp_min_stok, 0) > 0 OR ISNULL(tMin.sdp_min_stok, 0) > 0)
      ORDER BY sp.cariCode, sp.productCode;
    `);

    // c) Eslesme satirlari: ihtiyac = max(0, min - efektifStok), sadece min > 0 depolar.
    //    efektifStok = stok - acik musteri siparisi + acik satin alma siparisi
    //    (rezerve stok ihtiyaci gizlemesin, yolda gelen mal cifte siparise yol acmasin).
    const productsByCari = new Map<string, BarterProductRow[]>();
    (Array.isArray(rawRows) ? rawRows : []).forEach((row: any) => {
      const cariCode = String(row?.cariCode || '').trim().toUpperCase();
      const productCode = String(row?.productCode || '').trim().toUpperCase();
      if (!cariCode || !productCode) return;

      const merkezMin = Math.max(0, Number(row?.merkezMin) || 0);
      const topcaMin = Math.max(0, Number(row?.topcaMin) || 0);
      const merkezStock = Number(row?.merkezStock) || 0;
      const topcaStock = Number(row?.topcaStock) || 0;
      const merkezOpenCustomer = Math.max(0, Number(row?.merkezOpenCustomer) || 0);
      const merkezOpenPurchase = Math.max(0, Number(row?.merkezOpenPurchase) || 0);
      const topcaOpenCustomer = Math.max(0, Number(row?.topcaOpenCustomer) || 0);
      const topcaOpenPurchase = Math.max(0, Number(row?.topcaOpenPurchase) || 0);
      const merkezEffective = merkezStock - merkezOpenCustomer + merkezOpenPurchase;
      const topcaEffective = topcaStock - topcaOpenCustomer + topcaOpenPurchase;
      const merkezNeed = merkezMin > 0 ? Math.max(0, merkezMin - merkezEffective) : 0;
      const topcaNeed = topcaMin > 0 ? Math.max(0, topcaMin - topcaEffective) : 0;
      const needQuantity = merkezNeed + topcaNeed;
      if (needQuantity <= 0) return;

      const unitCost = Math.max(0, Number(row?.unitCost) || 0);
      const list = productsByCari.get(cariCode) || [];
      list.push({
        productCode,
        productName: String(row?.productName || '').trim() || productCode,
        isMainSupplier: Number(row?.isMainSupplier) === 1,
        hasPastOrders: Number(row?.hasPastOrders) === 1,
        merkez: {
          min: merkezMin,
          stock: merkezStock,
          openCustomer: merkezOpenCustomer,
          openPurchase: merkezOpenPurchase,
          effectiveStock: merkezEffective,
          need: merkezNeed,
        },
        topca: {
          min: topcaMin,
          stock: topcaStock,
          openCustomer: topcaOpenCustomer,
          openPurchase: topcaOpenPurchase,
          effectiveStock: topcaEffective,
          need: topcaNeed,
        },
        needQuantity,
        unitCost,
        amount: needQuantity * unitCost,
      });
      productsByCari.set(cariCode, list);
    });

    const rows: BarterCustomerRow[] = customers
      .map((customer) => {
        const products = (productsByCari.get(customer.cariCode) || [])
          .sort((a, b) => b.amount - a.amount)
          .slice(0, MAX_PRODUCTS_PER_CUSTOMER);
        const barterPotential = products.reduce((sum, product) => sum + product.amount, 0);
        return {
          ...customer,
          products,
          productCount: products.length,
          barterPotential,
          cappedPotential: Math.min(customer.pastDueBalance, barterPotential),
        };
      })
      .filter((row) => row.productCount > 0)
      .sort((a, b) => b.cappedPotential - a.cappedPotential);

    return {
      minPastDue,
      rows,
      summary: {
        matchedCustomerCount: rows.length,
        totalPotential: rows.reduce((sum, row) => sum + row.cappedPotential, 0),
        totalPastDue: rows.reduce((sum, row) => sum + row.pastDueBalance, 0),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

export default new BarterRadarService();
