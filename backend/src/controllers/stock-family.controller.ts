/**
 * Stock Family Controller
 * Teklif/siparis girisinde stok ailesi yonlendirme onerisi (salt-okuma).
 */

import { Request, Response } from 'express';
import stockFamilySuggestionService from '../services/stock-family-suggestion.service';

class StockFamilyController {
  /**
   * POST /admin/stock-family/suggestions
   * body: { productCode: string, quantity: number }  (quantity = ana/base birim)
   */
  async suggestions(req: Request, res: Response) {
    try {
      const productCode = String(req.body?.productCode || '').trim();
      const quantity = Number(req.body?.quantity);
      if (!productCode || !Number.isFinite(quantity) || quantity <= 0) {
        res.json({
          product: null,
          family: null,
          requested: 0,
          enteredAvailable: 0,
          shortfall: 0,
          coversRequested: true,
          alternatives: [],
          warnings: [],
        });
        return;
      }
      const result = await stockFamilySuggestionService.getSuggestions({ productCode, quantity });
      res.json(result);
    } catch (error: any) {
      console.error('Stock family suggestion error:', error?.message || error);
      res.status(500).json({ error: 'Stok ailesi onerisi alinamadi.' });
    }
  }
}

export default new StockFamilyController();
