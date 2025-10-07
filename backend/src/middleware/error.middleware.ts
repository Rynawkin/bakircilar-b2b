/**
 * Error Handling Middleware
 */

import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('❌ Error:', error);

  // Prisma hataları
  if (error.code === 'P2002') {
    return res.status(400).json({
      error: 'Duplicate entry',
      details: error.meta?.target,
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found',
    });
  }

  // Validation hataları (Zod)
  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: error.errors,
    });
  }

  // Stok yetersizliği hatası
  if (error.message && error.message.includes('INSUFFICIENT_STOCK')) {
    try {
      const parsedError = JSON.parse(error.message);
      return res.status(400).json(parsedError);
    } catch {
      return res.status(400).json({
        error: 'Insufficient stock',
        details: [error.message],
      });
    }
  }

  // Genel hatalar
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
};
