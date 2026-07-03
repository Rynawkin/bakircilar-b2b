/**
 * Stock Family Controller
 * Teklif/siparis girisinde stok ailesi yonlendirme onerisi (salt-okuma).
 */

import { Request, Response } from 'express';
import stockFamilySuggestionService from '../services/stock-family-suggestion.service';

class StockFamilyController {
  /**
   * POST /admin/stock-family/suggestions
   * body: { productCode: string, quantity: number, excludeCodes?: string[] }
   * (quantity = ana/base birim; excludeCodes = teklifin diger satirlarindaki urun kodlari)
   */
  async suggestions(req: Request, res: Response) {
    try {
      const productCode = String(req.body?.productCode || '').trim();
      const quantity = Number(req.body?.quantity);

      // excludeCodes dogrulama: string dizisi, max 200 eleman, her biri max 60 karakter
      let excludeCodes: string[] | undefined;
      const rawExclude = req.body?.excludeCodes;
      if (rawExclude !== undefined && rawExclude !== null) {
        const validArray =
          Array.isArray(rawExclude) &&
          rawExclude.length <= 200 &&
          rawExclude.every((c: any) => typeof c === 'string' && c.length <= 60);
        if (!validArray) {
          res.status(400).json({
            error: 'excludeCodes gecersiz: en fazla 200 elemanli, her biri en fazla 60 karakter string dizisi olmali.',
          });
          return;
        }
        excludeCodes = rawExclude as string[];
      }

      if (!productCode || !Number.isFinite(quantity) || quantity <= 0) {
        res.json({
          product: null,
          family: null,
          requested: 0,
          enteredAvailable: 0,
          shortfall: 0,
          coversRequested: true,
          enteredExcess: 0,
          alternatives: [],
          warnings: [],
        });
        return;
      }
      const result = await stockFamilySuggestionService.getSuggestions({ productCode, quantity, excludeCodes });
      res.json(result);
    } catch (error: any) {
      console.error('Stock family suggestion error:', error?.message || error);
      res.status(500).json({ error: 'Stok ailesi onerisi alinamadi.' });
    }
  }
}

export default new StockFamilyController();
