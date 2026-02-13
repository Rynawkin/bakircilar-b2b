import { Request, Response } from 'express';
import warehouseWorkflowService from '../services/warehouse-workflow.service';

class WarehouseWorkflowController {
  async getOverview(req: Request, res: Response) {
    try {
      const series = typeof req.query.series === 'string' ? req.query.series : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const result = await warehouseWorkflowService.getOverview({
        series,
        search,
        status: (status as any) || undefined,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Depo genel gorunum hatasi:', error);
      res.status(500).json({ error: error.message || 'Depo listesi alinamadi' });
    }
  }

  async getOrderDetail(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      if (!mikroOrderNumber) {
        return res.status(400).json({ error: 'Siparis numarasi gerekli' });
      }

      const result = await warehouseWorkflowService.getOrderDetail(mikroOrderNumber, false);
      res.json(result);
    } catch (error: any) {
      console.error('Depo siparis detay hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Siparis detayi alinamadi' });
    }
  }

  async startPicking(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      const userId = req.user?.userId;

      if (!mikroOrderNumber || !userId) {
        return res.status(400).json({ error: 'Siparis numarasi ve kullanici gerekli' });
      }

      const result = await warehouseWorkflowService.startPicking(mikroOrderNumber, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Toplama baslatma hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Toplama baslatilamadi' });
    }
  }

  async updateItem(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      const lineKey = req.params.lineKey;

      if (!mikroOrderNumber || !lineKey) {
        return res.status(400).json({ error: 'Siparis numarasi ve satir anahtari gerekli' });
      }

      const payload = {
        pickedQty: req.body?.pickedQty,
        extraQty: req.body?.extraQty,
        shelfCode: req.body?.shelfCode,
        userId: req.user?.userId,
      };

      const result = await warehouseWorkflowService.updateItem(mikroOrderNumber, lineKey, payload);
      res.json(result);
    } catch (error: any) {
      console.error('Depo satir guncelleme hatasi:', error);
      const status =
        error.message?.includes('bulunamadi')
          ? 404
          : error.message?.includes('baslatilmadan') || error.message?.includes('degistirilemez')
          ? 400
          : 500;
      res.status(status).json({ error: error.message || 'Satir guncellenemedi' });
    }
  }

  async markLoaded(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      if (!mikroOrderNumber) {
        return res.status(400).json({ error: 'Siparis numarasi gerekli' });
      }

      const result = await warehouseWorkflowService.markLoaded(mikroOrderNumber);
      res.json(result);
    } catch (error: any) {
      console.error('Yuklendi isaretleme hatasi:', error);
      const status = error.message?.includes('manuel') ? 400 : error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Siparis yukleme durumu guncellenemedi' });
    }
  }

  async markDispatched(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      if (!mikroOrderNumber) {
        return res.status(400).json({ error: 'Siparis numarasi gerekli' });
      }

      const result = await warehouseWorkflowService.markDispatched(mikroOrderNumber);
      res.json(result);
    } catch (error: any) {
      console.error('Sevk edildi isaretleme hatasi:', error);
      const status = error.message?.includes('manuel') ? 400 : error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Siparis sevk durumu guncellenemedi' });
    }
  }
}

export default new WarehouseWorkflowController();
