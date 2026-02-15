import { Request, Response } from 'express';
import operationsIntelligenceService from '../services/operations-intelligence.service';

const parseSeries = (queryValue: unknown): string[] => {
  if (!queryValue) return [];
  if (Array.isArray(queryValue)) {
    return queryValue.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof queryValue === 'string') {
    return queryValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseLimit = (queryValue: unknown, fallback: number) => {
  const parsed = Number(queryValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

class OperationsIntelligenceController {
  async getCommandCenter(req: Request, res: Response) {
    try {
      const series = parseSeries(req.query.series);
      const orderLimit = parseLimit(req.query.orderLimit, 150);
      const customerLimit = parseLimit(req.query.customerLimit, 80);
      const data = await operationsIntelligenceService.getCommandCenterSnapshot({
        series,
        orderLimit,
        customerLimit,
      });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations command center error:', error);
      res.status(500).json({ error: error.message || 'Operations command center alinamadi' });
    }
  }

  async getAtp(req: Request, res: Response) {
    try {
      const series = parseSeries(req.query.series);
      const orderLimit = parseLimit(req.query.orderLimit, 150);
      const data = await operationsIntelligenceService.getAtpSnapshot({ series, orderLimit });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations ATP error:', error);
      res.status(500).json({ error: error.message || 'ATP snapshot alinamadi' });
    }
  }

  async getOrchestration(req: Request, res: Response) {
    try {
      const series = parseSeries(req.query.series);
      const orderLimit = parseLimit(req.query.orderLimit, 150);
      const data = await operationsIntelligenceService.getOrchestrationSnapshot({ series, orderLimit });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations orchestration error:', error);
      res.status(500).json({ error: error.message || 'Depo orkestrasyon snapshot alinamadi' });
    }
  }

  async getCustomerIntent(req: Request, res: Response) {
    try {
      const customerLimit = parseLimit(req.query.customerLimit, 80);
      const data = await operationsIntelligenceService.getCustomerIntentSnapshot({ customerLimit });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations customer intent error:', error);
      res.status(500).json({ error: error.message || 'Musteri intent snapshot alinamadi' });
    }
  }

  async getRisk(req: Request, res: Response) {
    try {
      const orderLimit = parseLimit(req.query.orderLimit, 120);
      const data = await operationsIntelligenceService.getRiskSnapshot({ orderLimit });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations risk error:', error);
      res.status(500).json({ error: error.message || 'Risk snapshot alinamadi' });
    }
  }

  async getSubstitution(req: Request, res: Response) {
    try {
      const series = parseSeries(req.query.series);
      const orderLimit = parseLimit(req.query.orderLimit, 150);
      const data = await operationsIntelligenceService.getSubstitutionSnapshot({ series, orderLimit });
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations substitution error:', error);
      res.status(500).json({ error: error.message || 'Ikame snapshot alinamadi' });
    }
  }

  async getDataQuality(req: Request, res: Response) {
    try {
      const data = await operationsIntelligenceService.getDataQualitySnapshot();
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Operations data quality error:', error);
      res.status(500).json({ error: error.message || 'Data quality snapshot alinamadi' });
    }
  }
}

export default new OperationsIntelligenceController();

