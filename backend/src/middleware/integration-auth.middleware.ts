import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const requireYolpilotIntegrationKey = (req: Request, res: Response, next: NextFunction): void => {
  const configuredKey = config.yolpilotIntegrationApiKey;

  if (!configuredKey) {
    res.status(503).json({ error: 'YolPilot integration is not configured' });
    return;
  }

  const headerKey = req.header('x-api-key');
  const bearerToken = req.header('authorization')?.startsWith('Bearer ')
    ? req.header('authorization')?.slice('Bearer '.length)
    : undefined;

  if (headerKey !== configuredKey && bearerToken !== configuredKey) {
    res.status(401).json({ error: 'Invalid integration key' });
    return;
  }

  next();
};
