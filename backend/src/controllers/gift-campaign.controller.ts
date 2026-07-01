/**
 * Hediyeli Kampanya (GWP) controller.
 * Customer: GET /gift-campaign/active (cari bazli).
 * Admin: /admin/gift-campaigns CRUD.
 */
import { Request, Response, NextFunction } from 'express';
import giftCampaignService from '../services/gift-campaign.service';

class GiftCampaignController {
  // ---- CUSTOMER ----
  async getActive(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await giftCampaignService.getActiveForCustomer(req.user!.userId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async setCartSelection(req: Request, res: Response, next: NextFunction) {
    try {
      const { campaignId, productIds } = req.body || {};
      const result = await giftCampaignService.setCartGift(
        req.user!.userId,
        campaignId ?? null,
        Array.isArray(productIds) ? productIds : []
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  // ---- ADMIN ----
  async listAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const campaigns = await giftCampaignService.listCampaigns();
      res.json({ campaigns });
    } catch (e) {
      next(e);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const campaign = await giftCampaignService.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Kampanya bulunamadi' });
      }
      res.json({ campaign });
    } catch (e) {
      next(e);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      const campaign = await giftCampaignService.createCampaign(body);
      res.status(201).json({ campaign });
    } catch (e) {
      next(e);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const campaign = await giftCampaignService.updateCampaign(req.params.id, req.body || {});
      res.json({ campaign });
    } catch (e) {
      next(e);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await giftCampaignService.deleteCampaign(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
}

export default new GiftCampaignController();
