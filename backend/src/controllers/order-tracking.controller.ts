/**
 * Order Tracking Controller
 *
 * Admin ve müşteri endpoint'leri
 */

import { Request, Response } from 'express';
import orderTrackingService from '../services/order-tracking.service';
import emailService from '../services/email.service';

class OrderTrackingController {
  /**
   * GET /api/admin/order-tracking/settings
   * Sipariş takip ayarlarını getir
   */
  async getSettings(req: Request, res: Response) {
    try {
      const settings = await orderTrackingService.getSettings();
      res.json(settings);
    } catch (error: any) {
      console.error('Settings getirme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * PUT /api/admin/order-tracking/settings
   * Sipariş takip ayarlarını güncelle
   */
  async updateSettings(req: Request, res: Response) {
    try {
      const settings = await orderTrackingService.updateSettings(req.body);
      res.json(settings);
    } catch (error: any) {
      console.error('Settings güncelleme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/order-tracking/sync
   * Manuel sync (Mikro'dan bekleyen siparişleri çek)
   */
  async syncPendingOrders(req: Request, res: Response) {
    try {
      const result = await orderTrackingService.syncPendingOrders();
      res.json(result);
    } catch (error: any) {
      console.error('Sync hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/order-tracking/send-emails
   * Manuel mail gönder (tüm müşterilere)
   */
  async sendEmails(req: Request, res: Response) {
    try {
      const result = await emailService.sendPendingOrdersToAllCustomers();
      res.json(result);
    } catch (error: any) {
      console.error('Mail gönderme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/order-tracking/sync-and-send
   * Sync + Mail (tek seferde)
   */
  async syncAndSend(req: Request, res: Response) {
    try {
      // 1. Sync
      const syncResult = await orderTrackingService.syncPendingOrders();

      if (!syncResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Sync başarısız: ' + syncResult.message,
        });
      }

      // 2. Mail gönder
      const emailResult = await emailService.sendPendingOrdersToAllCustomers();

      res.json({
        success: true,
        sync: syncResult,
        email: emailResult,
        message: `${syncResult.ordersCount} sipariş sync edildi, ${emailResult.sentCount} mail gönderildi`,
      });
    } catch (error: any) {
      console.error('Sync & Send hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/admin/order-tracking/pending-orders
   * Tüm bekleyen siparişleri getir
   */
  async getAllPendingOrders(req: Request, res: Response) {
    try {
      const orders = await orderTrackingService.getAllPendingOrders();
      res.json(orders);
    } catch (error: any) {
      console.error('Bekleyen siparişler getirme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/admin/order-tracking/summary
   * Müşteri bazında özet
   */
  async getCustomerSummary(req: Request, res: Response) {
    try {
      const summary = await orderTrackingService.getCustomerSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('Özet getirme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/admin/order-tracking/email-logs
   * Mail gönderim geçmişi
   */
  async getEmailLogs(req: Request, res: Response) {
    try {
      const { prisma } = require('../utils/prisma');

      const logs = await prisma.emailLog.findMany({
        orderBy: { sentAt: 'desc' },
        take: 100,
      });

      res.json(logs);
    } catch (error: any) {
      console.error('Email logs getirme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/order-tracking/test-email
   * Test email gönder
   */
  async sendTestEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email adresi gerekli' });
      }

      await emailService.sendTestEmail(email);

      res.json({
        success: true,
        message: `Test email ${email} adresine gönderildi`,
      });
    } catch (error: any) {
      console.error('Test email hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ==================== CUSTOMER ENDPOINTS ====================

  /**
   * GET /api/customer/pending-orders
   * Müşterinin kendi bekleyen siparişleri
   */
  async getMyPendingOrders(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Kullanıcının mikroCariCode'unu al
      const { prisma } = require('../utils/prisma');
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mikroCariCode: true },
      });

      if (!user || !user.mikroCariCode) {
        return res.status(404).json({ error: 'Müşteri kodu bulunamadı' });
      }

      // Bekleyen siparişleri getir
      const orders = await orderTrackingService.getCustomerPendingOrders(user.mikroCariCode);

      res.json(orders);
    } catch (error: any) {
      console.error('Müşteri siparişleri getirme hatası:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default new OrderTrackingController();
