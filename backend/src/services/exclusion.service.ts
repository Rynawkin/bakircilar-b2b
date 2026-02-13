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

class ExclusionService {
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
   */
  async getExclusions(activeOnly: boolean = false): Promise<ReportExclusion[]> {
    const where = activeOnly ? { active: true } : {};

    return await prisma.reportExclusion.findMany({
      where,
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
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
    const { productCodes } = await this.getActiveExclusions();
    return Array.from(
      new Set(
        productCodes
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
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
}

export default new ExclusionService();
