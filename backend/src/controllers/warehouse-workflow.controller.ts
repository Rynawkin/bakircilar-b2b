import { Request, Response } from 'express';
import warehouseWorkflowService from '../services/warehouse-workflow.service';

class WarehouseWorkflowController {
  async getDispatchCatalog(req: Request, res: Response) {
    try {
      const result = await warehouseWorkflowService.getDispatchCatalog();
      res.json(result);
    } catch (error: any) {
      console.error('Depo dispatch katalog hatasi:', error);
      res.status(500).json({ error: error.message || 'Dispatch katalog alinamadi' });
    }
  }

  async getDispatchCatalogAdmin(req: Request, res: Response) {
    try {
      const result = await warehouseWorkflowService.getDispatchCatalogAdmin();
      res.json(result);
    } catch (error: any) {
      console.error('Depo dispatch admin katalog hatasi:', error);
      res.status(500).json({ error: error.message || 'Dispatch admin katalog alinamadi' });
    }
  }

  async createDispatchDriver(req: Request, res: Response) {
    try {
      const result = await warehouseWorkflowService.createDispatchDriver({
        firstName: req.body?.firstName,
        lastName: req.body?.lastName,
        tcNo: req.body?.tcNo,
        note: req.body?.note,
        active: req.body?.active,
      });
      res.json({ driver: result });
    } catch (error: any) {
      console.error('Sofor olusturma hatasi:', error);
      const status = error.message?.includes('gecersiz') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Sofor olusturulamadi' });
    }
  }

  async updateDispatchDriver(req: Request, res: Response) {
    try {
      const id = req.params.driverId;
      if (!id) return res.status(400).json({ error: 'Sofor kimligi gerekli' });
      const result = await warehouseWorkflowService.updateDispatchDriver(id, {
        firstName: req.body?.firstName,
        lastName: req.body?.lastName,
        tcNo: req.body?.tcNo,
        note: req.body?.note,
        active: req.body?.active,
      });
      res.json({ driver: result });
    } catch (error: any) {
      console.error('Sofor guncelleme hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : error.message?.includes('gecersiz') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Sofor guncellenemedi' });
    }
  }

  async deleteDispatchDriver(req: Request, res: Response) {
    try {
      const id = req.params.driverId;
      if (!id) return res.status(400).json({ error: 'Sofor kimligi gerekli' });
      const result = await warehouseWorkflowService.deleteDispatchDriver(id);
      res.json(result);
    } catch (error: any) {
      console.error('Sofor silme hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Sofor silinemedi' });
    }
  }

  async createDispatchVehicle(req: Request, res: Response) {
    try {
      const result = await warehouseWorkflowService.createDispatchVehicle({
        name: req.body?.name,
        plate: req.body?.plate,
        note: req.body?.note,
        active: req.body?.active,
      });
      res.json({ vehicle: result });
    } catch (error: any) {
      console.error('Arac olusturma hatasi:', error);
      const status = error.message?.includes('gecersiz') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Arac olusturulamadi' });
    }
  }

  async updateDispatchVehicle(req: Request, res: Response) {
    try {
      const id = req.params.vehicleId;
      if (!id) return res.status(400).json({ error: 'Arac kimligi gerekli' });
      const result = await warehouseWorkflowService.updateDispatchVehicle(id, {
        name: req.body?.name,
        plate: req.body?.plate,
        note: req.body?.note,
        active: req.body?.active,
      });
      res.json({ vehicle: result });
    } catch (error: any) {
      console.error('Arac guncelleme hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : error.message?.includes('gecersiz') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Arac guncellenemedi' });
    }
  }

  async deleteDispatchVehicle(req: Request, res: Response) {
    try {
      const id = req.params.vehicleId;
      if (!id) return res.status(400).json({ error: 'Arac kimligi gerekli' });
      const result = await warehouseWorkflowService.deleteDispatchVehicle(id);
      res.json(result);
    } catch (error: any) {
      console.error('Arac silme hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Arac silinemedi' });
    }
  }

  async getOverview(req: Request, res: Response) {
    try {
      let series: string | string[] | undefined;
      if (typeof req.query.series === 'string') {
        series = req.query.series;
      } else if (Array.isArray(req.query.series)) {
        series = req.query.series.filter((value): value is string => typeof value === 'string');
      }
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

  async reportImageIssue(req: Request, res: Response) {
    try {
      const mikroOrderNumber = req.params.mikroOrderNumber;
      const lineKey = req.params.lineKey;

      if (!mikroOrderNumber || !lineKey) {
        return res.status(400).json({ error: 'Siparis numarasi ve satir anahtari gerekli' });
      }

      const result = await warehouseWorkflowService.reportImageIssue(mikroOrderNumber, lineKey, {
        userId: req.user?.userId,
        note: req.body?.note,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Resim hatasi bildirim hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : 500;
      res.status(status).json({ error: error.message || 'Resim hatasi bildirilemedi' });
    }
  }

  async getImageIssueReports(req: Request, res: Response) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

      const result = await warehouseWorkflowService.getImageIssueReports({
        status: (status as any) || 'ALL',
        search,
        page,
        limit,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Resim hata listesi hatasi:', error);
      res.status(500).json({ error: error.message || 'Resim hata listesi alinamadi' });
    }
  }

  async updateImageIssueReport(req: Request, res: Response) {
    try {
      const reportId = req.params.reportId;
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const userId = req.user?.userId;

      if (!reportId) {
        return res.status(400).json({ error: 'Talep kimligi gerekli' });
      }
      if (!status) {
        return res.status(400).json({ error: 'Durum gerekli' });
      }

      const result = await warehouseWorkflowService.updateImageIssueReportStatus(reportId, {
        status: status as any,
        note,
        userId,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Resim hata durum guncelleme hatasi:', error);
      const status = error.message?.includes('bulunamadi') ? 404 : error.message?.includes('Gecersiz') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Resim hata durumu guncellenemedi' });
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
      const deliverySeries =
        typeof req.body?.deliverySeries === 'string' ? req.body.deliverySeries : '';
      const transport = req.body?.transport || {};
      if (!mikroOrderNumber) {
        return res.status(400).json({ error: 'Siparis numarasi gerekli' });
      }
      if (!deliverySeries.trim()) {
        return res.status(400).json({ error: 'Irsaliye serisi gerekli' });
      }
      if (
        typeof transport.driverFirstName !== 'string' ||
        typeof transport.driverLastName !== 'string' ||
        typeof transport.driverTcNo !== 'string' ||
        typeof transport.vehicleName !== 'string' ||
        typeof transport.vehiclePlate !== 'string' ||
        !transport.driverFirstName.trim() ||
        !transport.driverLastName.trim() ||
        !transport.driverTcNo.trim() ||
        !transport.vehicleName.trim() ||
        !transport.vehiclePlate.trim()
      ) {
        return res.status(400).json({ error: 'Sofor ve arac bilgileri gerekli' });
      }

      const result = await warehouseWorkflowService.dispatchOrderWithDeliveryNote(mikroOrderNumber, {
        deliverySeries,
        transport: {
          driverFirstName: transport.driverFirstName,
          driverLastName: transport.driverLastName,
          driverTcNo: transport.driverTcNo,
          vehicleName: transport.vehicleName,
          vehiclePlate: transport.vehiclePlate,
        },
        userId: req.user?.userId,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Irsaliyelestirme hatasi:', error);
      const status =
        error.message?.includes('gerekli') ||
        error.message?.includes('baslatilmadan') ||
        error.message?.includes('zaten') ||
        error.message?.includes('ornek kayit') ||
        error.message?.includes('uygun ornek')
          ? 400
          : error.message?.includes('bulunamadi')
          ? 404
          : 500;
      res.status(status).json({ error: error.message || 'Siparis irsaliyelestirilemedi' });
    }
  }
}

export default new WarehouseWorkflowController();
