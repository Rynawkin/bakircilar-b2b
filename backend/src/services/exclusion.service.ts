/**
 * Report Exclusion Service
 * Manages products/customers that should be excluded from reports
 */

import { ExclusionType, ReportExclusion } from '@prisma/client';
import { prisma } from '../utils/prisma';

export interface CreateExclusionData {
  type: ExclusionType;
  value: string;
  description?: string;
  createdBy?: string;
}

export interface UpdateExclusionData {
  value?: string;
  description?: string;
  active?: boolean;
}

export interface ExclusionFilters {
  productCode?: string;
  customerCode?: string;
  customerName?: string;
  productName?: string;
  sectorCode?: string;
}

/** getExclusions ciktisi: mevcut ReportExclusion alanlarina ek olarak cozulmus etiket. */
export type ExclusionWithLabel = ReportExclusion & { resolvedLabel: string | null };

const normalizeCode = (value: string | null | undefined): string =>
  String(value || '').trim().toUpperCase();

class ExclusionService {
  private activeProductCodeCache: { expiresAt: number; codes: string[] } | null = null;
  private readonly activeProductCodeCacheTtlMs = 60 * 1000;

  /**
   * Create a new exclusion rule
   */
  async createExclusion(data: CreateExclusionData): Promise<ReportExclusion> {
    return await prisma.reportExclusion.create({
      data: {
        type: data.type,
        value: data.value.trim(),
        description: data.description?.trim(),
        createdBy: data.createdBy,
      },
    });
  }

  /**
   * Get all exclusions (optionally filter by active status)
   *
   * Her satira `resolvedLabel` eklenir:
   * - PRODUCT_CODE -> Product.name (mikroCode ile, trim/upper normalize eslesme)
   * - CUSTOMER_CODE -> User (role CUSTOMER) displayName/mikroName/name (mikroCariCode ile)
   * - Diger tipler -> null
   * Mevcut ReportExclusion alanlari degismez (additive).
   */
  async getExclusions(activeOnly: boolean = false): Promise<ExclusionWithLabel[]> {
    const where = activeOnly ? { active: true } : {};

    const rows = await prisma.reportExclusion.findMany({
      where,
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return await this.attachResolvedLabels(rows);
  }

  /**
   * ReportExclusion satirlarina cozulmus etiket ekler (toplu lookup; N+1 yok).
   */
  private async attachResolvedLabels(rows: ReportExclusion[]): Promise<ExclusionWithLabel[]> {
    if (rows.length === 0) return [];

    // Cozulecek kod kumeleri (normalize edilmis)
    const productCodeKeys = new Set<string>();
    const customerCodeKeys = new Set<string>();
    for (const row of rows) {
      const key = normalizeCode(row.value);
      if (!key) continue;
      if (row.type === 'PRODUCT_CODE') productCodeKeys.add(key);
      else if (row.type === 'CUSTOMER_CODE') customerCodeKeys.add(key);
    }

    // PRODUCT_CODE -> Product.name
    const productNameByCode = new Map<string, string>();
    if (productCodeKeys.size > 0) {
      // Prisma trim/upper yapamadigi icin adaylari cekip JS'te normalize eslestiririz.
      // mikroCode @unique; kod kumesi kucuk oldugu icin ham degerlerle IN sorgusu yeterli.
      const rawValues = Array.from(
        new Set(
          rows
            .filter((r) => r.type === 'PRODUCT_CODE')
            .map((r) => String(r.value || '').trim())
            .filter(Boolean)
        )
      );
      if (rawValues.length > 0) {
        const products = await prisma.product.findMany({
          where: { mikroCode: { in: rawValues } },
          select: { mikroCode: true, name: true },
        });
        for (const product of products) {
          const key = normalizeCode(product.mikroCode);
          if (key && !productNameByCode.has(key)) {
            productNameByCode.set(key, product.name);
          }
        }
      }
    }

    // CUSTOMER_CODE -> User (CUSTOMER) etiketi
    const customerLabelByCode = new Map<string, string>();
    if (customerCodeKeys.size > 0) {
      const rawValues = Array.from(
        new Set(
          rows
            .filter((r) => r.type === 'CUSTOMER_CODE')
            .map((r) => String(r.value || '').trim())
            .filter(Boolean)
        )
      );
      if (rawValues.length > 0) {
        const users = await prisma.user.findMany({
          where: { role: 'CUSTOMER', mikroCariCode: { in: rawValues } },
          select: { mikroCariCode: true, displayName: true, mikroName: true, name: true },
        });
        for (const user of users) {
          const key = normalizeCode(user.mikroCariCode);
          if (!key || customerLabelByCode.has(key)) continue;
          const label =
            (user.displayName && user.displayName.trim()) ||
            (user.mikroName && user.mikroName.trim()) ||
            (user.name && user.name.trim()) ||
            '';
          if (label) customerLabelByCode.set(key, label);
        }
      }
    }

    return rows.map((row) => {
      let resolvedLabel: string | null = null;
      const key = normalizeCode(row.value);
      if (row.type === 'PRODUCT_CODE') {
        resolvedLabel = productNameByCode.get(key) ?? null;
      } else if (row.type === 'CUSTOMER_CODE') {
        resolvedLabel = customerLabelByCode.get(key) ?? null;
      }
      return { ...row, resolvedLabel };
    });
  }

  /**
   * Get exclusion by ID
   */
  async getExclusionById(id: string): Promise<ReportExclusion | null> {
    return await prisma.reportExclusion.findUnique({
      where: { id },
    });
  }

  /**
   * Update an exclusion
   */
  async updateExclusion(id: string, data: UpdateExclusionData): Promise<ReportExclusion> {
    return await prisma.reportExclusion.update({
      where: { id },
      data: {
        ...(data.value !== undefined && { value: data.value.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  /**
   * Delete an exclusion
   */
  async deleteExclusion(id: string): Promise<ReportExclusion> {
    return await prisma.reportExclusion.delete({
      where: { id },
    });
  }

  /**
   * Get active exclusions grouped by type
   */
  async getActiveExclusions(): Promise<{
    productCodes: string[];
    customerCodes: string[];
    customerNames: string[];
    productNames: string[];
    sectorCodes: string[];
  }> {
    const exclusions = await this.getExclusions(true);

    return {
      productCodes: exclusions
        .filter(e => e.type === 'PRODUCT_CODE')
        .map(e => e.value),
      customerCodes: exclusions
        .filter(e => e.type === 'CUSTOMER_CODE')
        .map(e => e.value),
      customerNames: exclusions
        .filter(e => e.type === 'CUSTOMER_NAME')
        .map(e => e.value),
      productNames: exclusions
        .filter(e => e.type === 'PRODUCT_NAME')
        .map(e => e.value),
      sectorCodes: exclusions
        .filter(e => e.type === 'SECTOR_CODE')
        .map(e => e.value),
    };
  }

  /**
   * Get active product code exclusions as normalized unique list
   */
  async getActiveProductCodeExclusions(): Promise<string[]> {
    if (this.activeProductCodeCache && this.activeProductCodeCache.expiresAt > Date.now()) {
      return this.activeProductCodeCache.codes;
    }

    const { productCodes } = await this.getActiveExclusions();
    const codes = Array.from(
      new Set(
        productCodes
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    this.activeProductCodeCache = {
      expiresAt: Date.now() + this.activeProductCodeCacheTtlMs,
      codes,
    };
    return codes;
  }

  /**
   * Build SQL WHERE clause conditions for excluding items from reports
   * Returns array of SQL conditions to be added to WHERE clause
   */
  async buildExclusionConditions(): Promise<string[]> {
    const exclusions = await this.getActiveExclusions();
    const conditions: string[] = [];

    // Exclude specific product codes
    if (exclusions.productCodes.length > 0) {
      const codes = exclusions.productCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`sto_kod NOT IN (${codes})`);
    }

    // Exclude specific customer codes
    if (exclusions.customerCodes.length > 0) {
      const codes = exclusions.customerCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`cari_kod NOT IN (${codes})`);
    }

    // Exclude customer names (partial match)
    if (exclusions.customerNames.length > 0) {
      const nameConditions = exclusions.customerNames.map(name =>
        `cari_unvan1 NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude product names (partial match)
    if (exclusions.productNames.length > 0) {
      const nameConditions = exclusions.productNames.map(name =>
        `sto_isim NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude sector codes
    if (exclusions.sectorCodes.length > 0) {
      const codes = exclusions.sectorCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`cari_sektor_kodu NOT IN (${codes})`);
    }

    return conditions;
  }

  /**
   * Build exclusion WHERE clause for STOK_HAREKETLERI queries
   * Aliases: sth = STOK_HAREKETLERI, st = STOKLAR, c = CARI_HESAPLAR
   */
  async buildStokHareketleriExclusionConditions(): Promise<string[]> {
    const exclusions = await this.getActiveExclusions();
    const conditions: string[] = [];

    // Exclude specific product codes
    if (exclusions.productCodes.length > 0) {
      const codes = exclusions.productCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`RTRIM(sth.sth_stok_kod) NOT IN (${codes})`);
    }

    // Exclude specific customer codes
    if (exclusions.customerCodes.length > 0) {
      const codes = exclusions.customerCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`RTRIM(sth.sth_cari_kodu) NOT IN (${codes})`);
    }

    // Exclude customer names (partial match) - requires CARI_HESAPLAR join
    if (exclusions.customerNames.length > 0) {
      const nameConditions = exclusions.customerNames.map(name =>
        `c.cari_unvan1 NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude product names (partial match) - requires STOKLAR join
    if (exclusions.productNames.length > 0) {
      const nameConditions = exclusions.productNames.map(name =>
        `st.sto_isim NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude sector codes - requires CARI_HESAPLAR join
    if (exclusions.sectorCodes.length > 0) {
      const codes = exclusions.sectorCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`c.cari_sektor_kodu NOT IN (${codes})`);
    }

    return conditions;
  }

  /**
   * Build exclusion WHERE clause for SIPARISLER queries
   * Aliases: sip = SIPARISLER, st = STOKLAR, c2 = CARI_HESAPLAR
   * (c2 kasitli: ayni sorguda STOK_HAREKETLERI varyantinin 'c' aliasiyla cakismasin).
   * Isim/sektor kosullari icin cagiran taraf kosullu LEFT JOIN eklemelidir
   * (buildStokHareketleriExclusionConditions ile ayni needsJoin kalibi).
   */
  async buildSiparislerExclusionConditions(): Promise<string[]> {
    const exclusions = await this.getActiveExclusions();
    const conditions: string[] = [];

    // Exclude specific product codes
    if (exclusions.productCodes.length > 0) {
      const codes = exclusions.productCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`RTRIM(sip.sip_stok_kod) NOT IN (${codes})`);
    }

    // Exclude specific customer codes
    if (exclusions.customerCodes.length > 0) {
      const codes = exclusions.customerCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`RTRIM(sip.sip_musteri_kod) NOT IN (${codes})`);
    }

    // Exclude customer names (partial match) - requires CARI_HESAPLAR (c2) join
    if (exclusions.customerNames.length > 0) {
      const nameConditions = exclusions.customerNames.map(name =>
        `c2.cari_unvan1 NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude product names (partial match) - requires STOKLAR (st) join
    if (exclusions.productNames.length > 0) {
      const nameConditions = exclusions.productNames.map(name =>
        `st.sto_isim NOT LIKE '%${name.replace(/'/g, "''")}%'`
      );
      conditions.push(`(${nameConditions.join(' AND ')})`);
    }

    // Exclude sector codes - requires CARI_HESAPLAR (c2) join
    if (exclusions.sectorCodes.length > 0) {
      const codes = exclusions.sectorCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`c2.cari_sektor_kodu NOT IN (${codes})`);
    }

    return conditions;
  }
}

export default new ExclusionService();
