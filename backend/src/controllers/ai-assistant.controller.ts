/**
 * AI Assistant Controller
 *
 * /admin/ai/* endpointleri. Tum endpointler authenticate + requirePermission('admin:ai-assistant').
 */

import { Request, Response } from 'express';
import aiAssistantService, { AiUserContext } from '../services/ai-assistant.service';

function userCtx(req: Request): AiUserContext {
  return {
    userId: req.user!.userId,
    role: req.user!.role,
    assignedSectorCodes: req.user!.assignedSectorCodes || [],
  };
}

class AiAssistantController {
  /**
   * GET /admin/ai/status -> asistan yapilandirildi mi?
   */
  async status(_req: Request, res: Response) {
    res.json({ enabled: aiAssistantService.enabled });
  }

  /**
   * GET /admin/ai/models -> secilebilir modeller + varsayilanlar.
   */
  async models(_req: Request, res: Response) {
    res.json(aiAssistantService.modelInfo);
  }

  /**
   * POST /admin/ai/chat
   * body: { messages: [{ role: 'user'|'assistant', content: string }] }
   */
  async chat(req: Request, res: Response) {
    try {
      if (!aiAssistantService.enabled) {
        res.status(503).json({ error: 'AI asistan yapilandirilmadi (ANTHROPIC_API_KEY eksik).' });
        return;
      }
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      if (messages.length === 0 && typeof req.body?.message === 'string') {
        messages.push({ role: 'user', content: req.body.message });
      }
      const result = await aiAssistantService.chat({
        user: userCtx(req),
        messages,
        model: typeof req.body?.model === 'string' ? req.body.model : undefined,
      });
      res.json(result);
    } catch (error: any) {
      const status = error?.statusCode || 500;
      console.error('AI chat error:', error?.message || error);
      res
        .status(status)
        .json({ error: error?.message || 'AI asistan su an yanit veremiyor.' });
    }
  }

  /**
   * POST /admin/ai/analyze-quote
   * body: { quote: {...}, requestText?: string, requestImageBase64?: string, requestImageMediaType?: string }
   */
  async analyzeQuote(req: Request, res: Response) {
    try {
      if (!aiAssistantService.enabled) {
        res.status(503).json({ error: 'AI asistan yapilandirilmadi (ANTHROPIC_API_KEY eksik).' });
        return;
      }
      const { quote, requestText, requestImageBase64, requestImageMediaType, model } = req.body || {};
      if (!quote || !Array.isArray(quote.items) || quote.items.length === 0) {
        res.status(400).json({ error: 'Analiz icin teklif kalemleri gerekli.' });
        return;
      }
      const result = await aiAssistantService.analyzeQuote({
        user: userCtx(req),
        quote,
        requestText,
        requestImageBase64,
        requestImageMediaType,
        model: typeof model === 'string' ? model : undefined,
      });
      res.json(result);
    } catch (error: any) {
      const status = error?.statusCode || 500;
      console.error('AI analyze-quote error:', error?.message || error);
      res
        .status(status)
        .json({ error: error?.message || 'Teklif analizi yapilamadi.' });
    }
  }
}

export default new AiAssistantController();
