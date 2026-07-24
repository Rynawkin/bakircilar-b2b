import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import stockCreateService from '../services/stock-create.service';

class StockCreateController {
  async getMetadata(req: Request, res: Response) {
    try {
      const data = await stockCreateService.getMetadata();
      res.json(data);
    } catch (error: any) {
      console.error('Stock create metadata failed:', error);
      res.status(500).json({ error: error.message || 'Stok acma bilgileri alinamadi' });
    }
  }

  async searchLookups(req: Request, res: Response) {
    try {
      const type = String(req.params.type || '') as any;
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

      if (!['supplier', 'brand', 'category', 'package', 'template'].includes(type)) {
        res.status(400).json({ error: 'Gecersiz arama tipi' });
        return;
      }

      const items = await stockCreateService.searchLookups(type, search, limit);
      res.json({ items });
    } catch (error: any) {
      console.error('Stock create lookup failed:', error);
      res.status(500).json({ error: error.message || 'Arama yapilamadi' });
    }
  }

  async getTemplate(req: Request, res: Response) {
    try {
      const templateCode = String(req.params.templateCode || '');
      const template = await stockCreateService.getTemplate(templateCode);
      res.json({ template });
    } catch (error: any) {
      console.error('Stock create template failed:', error);
      res.status(404).json({ error: error.message || 'Sablon stok alinamadi' });
    }
  }

  async getStock(req: Request, res: Response) {
    try {
      const stockCode = String(req.params.stockCode || '');
      const stock = await stockCreateService.getStock(stockCode);
      res.json({ stock });
    } catch (error: any) {
      console.error('Stock create stock fetch failed:', error);
      res.status(404).json({ error: error.message || 'Stok bilgisi alinamadi' });
    }
  }

  async updateStock(req: Request, res: Response) {
    try {
      const stockCode = String(req.params.stockCode || '');
      const data = await stockCreateService.updateStock(stockCode, req.body || {}, req.user?.userId);
      res.json(data);
    } catch (error: any) {
      console.error('Stock create stock update failed:', error);
      res.status(400).json({ error: error.message || 'Stok karti guncellenemedi' });
    }
  }

  async preview(req: Request, res: Response) {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      // Aktivasyon acik bir moddur. Tek satirli normal duzenleme on izlemesini
      // stockCode tasidigi icin yanlislikla aktivasyona yonlendirmeyiz.
      if (req.body?.mode === 'activate') {
        const item = req.body?.item;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          res.status(400).json({ error: 'Aktivasyon on kontrolu icin stok formu gerekli' });
          return;
        }
        const stockCode = String(req.body?.stockCode || item.stockCode || item.templateCode || '');
        const data = await stockCreateService.previewActivation(stockCode, item);
        res.json(data);
        return;
      }

      const data = await stockCreateService.preview(items);
      res.json(data);
    } catch (error: any) {
      console.error('Stock create preview failed:', error);
      res.status(400).json({ error: error.message || 'On kontrol yapilamadi' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      // Yeni sozlesme: multipart/form-data.
      //   image   : File (ZORUNLU)
      //   payload : JSON string = { item: <tek stok>, stockFamilyIds: string[], priceFamilyId: string|null }
      if (!req.file) {
        res.status(400).json({ error: 'Gorsel zorunlu - gorsel yuklemeden stok acilamaz' });
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(String(req.body?.payload ?? ''));
      } catch {
        res.status(400).json({ error: 'payload gecerli bir JSON degil' });
        return;
      }

      const item = parsed?.item;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        res.status(400).json({ error: 'payload.item tek bir stok nesnesi olmalidir' });
        return;
      }

      const stockFamilyIds = Array.isArray(parsed?.stockFamilyIds) ? parsed.stockFamilyIds : [];
      const priceFamilyId =
        parsed?.priceFamilyId === null || parsed?.priceFamilyId === undefined || parsed?.priceFamilyId === ''
          ? null
          : String(parsed.priceFamilyId);

      const data = await stockCreateService.createSingleWithImage({
        item,
        imageFile: req.file,
        stockFamilyIds,
        priceFamilyId,
        userId: req.user?.userId,
      });
      res.json(data);
    } catch (error: any) {
      console.error('Stock create failed:', error);
      res.status(400).json({ success: false, error: error.message || 'Stok karti olusturulamadi' });
    }
  }

  async listPassiveStocks(req: Request, res: Response) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const data = await stockCreateService.listPassiveStocks(search, limit);
      res.json(data);
    } catch (error: any) {
      console.error('Stock create passive list failed:', error);
      res.status(500).json({ error: error.message || 'Pasif stoklar alinamadi' });
    }
  }

  async activate(req: Request, res: Response) {
    try {
      // Aktivasyon yeni stok INSERT'i degildir; mevcut kod sabit kalir. Ancak
      // eksik/yanlis kart alanlari create formuyla ayni sozlesmeyle guncellenir.
      let parsed: any;
      try {
        parsed =
          typeof req.body?.payload === 'string'
            ? JSON.parse(req.body.payload)
            : req.body?.payload && typeof req.body.payload === 'object'
              ? req.body.payload
              : req.body;
      } catch {
        res.status(400).json({ error: 'payload gecerli bir JSON degil' });
        return;
      }

      const item = parsed?.item;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        res.status(400).json({ error: 'payload.item tek bir stok nesnesi olmalidir' });
        return;
      }
      const stockCode = String(parsed?.stockCode || item.stockCode || item.templateCode || '');
      const stockFamilyIds = Array.isArray(parsed?.stockFamilyIds) ? parsed.stockFamilyIds : undefined;
      const hasPriceFamilySelection = Object.prototype.hasOwnProperty.call(parsed || {}, 'priceFamilyId');
      const priceFamilyId = !hasPriceFamilySelection
        ? undefined
        : parsed?.priceFamilyId === null || parsed?.priceFamilyId === ''
          ? null
          : String(parsed.priceFamilyId);

      const data = await stockCreateService.activateStock({
        stockCode,
        item,
        imageFile: req.file || null,
        stockFamilyIds,
        priceFamilyId,
        userId: req.user?.userId,
      });
      res.json(data);
    } catch (error: any) {
      console.error('Stock activate failed:', error);
      res.status(400).json({ success: false, error: error.message || 'Stok aktiflestirilemedi' });
    } finally {
      // Service gorseli islerken temp dosyayi siler. Validasyon daha once
      // durursa Multer dosyasini burada temizleyerek artik birakma.
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch((cleanupError: any) => {
          if (cleanupError?.code !== 'ENOENT') {
            console.warn('Stock activation upload cleanup failed:', cleanupError?.message || cleanupError);
          }
        });
      }
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const logs = await stockCreateService.getHistory(limit);
      res.json({ logs });
    } catch (error: any) {
      console.error('Stock create history failed:', error);
      res.status(500).json({ error: error.message || 'Gecmis alinamadi' });
    }
  }
}

export default new StockCreateController();
