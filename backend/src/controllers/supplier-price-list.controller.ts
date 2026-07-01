import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import supplierPriceListService from '../services/supplier-price-list.service';
import reportsService from '../services/reports.service';

interface SupplierApplyItem {
  productCode: string;
  newCostT: number;
}

const parseApplyItems = (body: any): SupplierApplyItem[] => {
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items: SupplierApplyItem[] = [];
  for (const raw of rawItems) {
    const productCode = String(raw?.productCode ?? '').trim();
    const newCostT = Number(raw?.newCostT);
    if (!productCode || !Number.isFinite(newCostT) || newCostT <= 0) continue;
    items.push({ productCode, newCostT });
  }
  return items;
};


const parseOptionalNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseOptionalString = (value: any) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const parseOptionalJson = (value: any) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
};

const parseOverrides = (body: any) => ({
  excelSheetName: parseOptionalString(body?.excelSheetName),
  excelHeaderRow: parseOptionalNumber(body?.excelHeaderRow),
  excelCodeHeader: parseOptionalString(body?.excelCodeHeader),
  excelNameHeader: parseOptionalString(body?.excelNameHeader),
  excelPriceHeader: parseOptionalString(body?.excelPriceHeader),
  pdfPriceIndex: parseOptionalNumber(body?.pdfPriceIndex),
  pdfCodePattern: parseOptionalString(body?.pdfCodePattern),
  pdfColumnRoles: parseOptionalJson(body?.pdfColumnRoles),
});

class SupplierPriceListController {
  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierPriceListService.listSuppliers();
      res.json({ suppliers });
    } catch (error) {
      next(error);
    }
  }

  async createSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierPriceListService.createSupplier(req.body || {});
      res.json({ supplier });
    } catch (error) {
      next(error);
    }
  }

  async updateSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const supplier = await supplierPriceListService.updateSupplier(id, req.body || {});
      res.json({ supplier });
    } catch (error) {
      next(error);
    }
  }

  async listUploads(req: Request, res: Response, next: NextFunction) {
    try {
      const { supplierId, page, limit } = req.query;
      const result = await supplierPriceListService.listUploads({
        supplierId: supplierId as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const upload = await supplierPriceListService.getUpload(id);
      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      res.json({ upload });
    } catch (error) {
      next(error);
    }
  }

  async getUploadItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, page, limit } = req.query;
      const result = await supplierPriceListService.getUploadItems({
        uploadId: id,
        status: status as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Eslesme satiri icin elle girilen "Birim Carpani"ni kaydeder (B2B tarafi; Mikro YAZMA YOK).
  async updateMatchUnitMultiplier(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const raw = (req.body || {}).unitMultiplier;
      let value: number | null = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          return res.status(400).json({ error: 'unitMultiplier gecerli bir sayi olmali' });
        }
        value = parsed;
      }
      const match = await supplierPriceListService.updateMatchUnitMultiplier(matchId, value);
      res.json({ match });
    } catch (error) {
      next(error);
    }
  }

  async exportUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const exportData = await supplierPriceListService.buildExport(id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${exportData.fileName}`);
      res.send(exportData.buffer);
    } catch (error) {
      next(error);
    }
  }

  async previewPriceLists(req: Request, res: Response, next: NextFunction) {
    const files = (req.files || []) as Express.Multer.File[];
    try {
      const supplierId = req.body?.supplierId as string | undefined;
      if (!supplierId) {
        return res.status(400).json({ error: 'supplierId is required' });
      }
      if (!files.length) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      const overrides = parseOverrides(req.body);
      const matchMode = req.body?.matchMode === 'name' ? 'name' : 'code';
      const result = await supplierPriceListService.previewPriceLists({
        supplierId,
        files,
        overrides,
        matchMode,
      });
      res.json(result);
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => null)));
    }
  }

  async uploadPriceLists(req: Request, res: Response, next: NextFunction) {
    try {
      const supplierId = req.body?.supplierId as string | undefined;
      if (!supplierId) {
        return res.status(400).json({ error: 'supplierId is required' });
      }
      const files = (req.files || []) as Express.Multer.File[];
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const overrides = parseOverrides(req.body);
      const matchMode = req.body?.matchMode === 'name' ? 'name' : 'code';
      const mainSupplierCariCode = parseOptionalString(req.body?.mainSupplierCariCode);
      const result = await supplierPriceListService.uploadPriceLists({
        supplierId,
        uploadedById: userId,
        files,
        overrides,
        matchMode,
        mainSupplierCariCode,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Ana saglayici (main supplier) listesi (Mikro). Isim modu secimi icin. (SADECE OKUMA)
  async getMainSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierPriceListService.getMainSuppliers();
      res.json({ suppliers });
    } catch (error) {
      next(error);
    }
  }

  // Bir ana saglayici altindaki urunlerde arama (elle duzeltme picker'i). (SADECE OKUMA)
  async searchMainSupplierProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const cariKod = (req.query?.cariKod as string) || '';
      if (!cariKod) {
        return res.status(400).json({ error: 'cariKod is required' });
      }
      const query = (req.query?.query as string) || '';
      const limit = req.query?.limit ? Number(req.query.limit) : undefined;
      const products = await supplierPriceListService.searchMainSupplierProducts(cariKod, query, limit);
      res.json({ products });
    } catch (error) {
      next(error);
    }
  }

  // GLOBAL urun arama (elle duzeltme picker'i "Tum urunler" modu). (SADECE OKUMA)
  async searchAllProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query?.query as string) || '';
      const limit = req.query?.limit ? Number(req.query.limit) : undefined;
      const products = await supplierPriceListService.searchAllProducts(query, limit);
      res.json({ products });
    } catch (error) {
      next(error);
    }
  }

  // ELLE DUZELTME: mevcut match satirini baska urune tasi. (B2B; Mikro YAZMA YOK)
  async setMatchProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const productCode = String((req.body || {}).productCode || '').trim();
      if (!productCode) {
        return res.status(400).json({ error: 'productCode gerekli' });
      }
      const match = await supplierPriceListService.setMatchProduct(matchId, productCode);
      res.json({ match });
    } catch (error) {
      next(error);
    }
  }

  // ELLE ATAMA / URUN EKLE: item'a YENI match ekle (coklu eslestirme). (B2B; Mikro YAZMA YOK)
  async assignItemProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const productCode = String((req.body || {}).productCode || '').trim();
      if (!productCode) {
        return res.status(400).json({ error: 'productCode gerekli' });
      }
      const match = await supplierPriceListService.assignItemProduct(itemId, productCode);
      res.json({ match });
    } catch (error) {
      next(error);
    }
  }

  // ELLE KALDIR: bir match'i sil (coklu eslestirmede yanlis olani cikar). (B2B; Mikro YAZMA YOK)
  async deleteMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const result = await supplierPriceListService.deleteMatch(matchId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Toplu maliyet uygulamasi - ONIZLEME (SADECE OKUMA, Mikro YAZMA YOK)
  async applyPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const items = parseApplyItems(req.body);
      if (!items.length) {
        return res.status(400).json({ error: 'En az bir gecerli item (productCode + newCostT) gerekli' });
      }
      const result = await reportsService.computeSupplierApplyPreview(items);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Toplu maliyet uygulamasi - UYGULA (MIKRO YAZAR)
  async apply(req: Request, res: Response, next: NextFunction) {
    try {
      const items = parseApplyItems(req.body);
      if (!items.length) {
        return res.status(400).json({ error: 'En az bir gecerli item (productCode + newCostT) gerekli' });
      }
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await reportsService.applySupplierCostBulk(items, userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new SupplierPriceListController();
