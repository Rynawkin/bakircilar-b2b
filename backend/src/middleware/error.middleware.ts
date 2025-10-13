/**
 * Error Handling Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error (production'da logger kullan)
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error:', error);
  }

  // AppError - Custom application errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      errorCode: error.errorCode,
      details: error.details,
    });
  }

  // Prisma unique constraint violation
  if (error.code === 'P2002') {
    return res.status(400).json({
      error: 'Bu kayıt zaten mevcut',
      errorCode: ErrorCode.VALIDATION_ERROR,
      details: {
        field: error.meta?.target,
        type: 'unique_constraint',
      },
    });
  }

  // Prisma record not found
  if (error.code === 'P2025') {
    return res.status(404).json({
      error: 'Kayıt bulunamadı',
      errorCode: ErrorCode.NOT_FOUND,
    });
  }

  // Prisma foreign key constraint
  if (error.code === 'P2003') {
    return res.status(400).json({
      error: 'İlişkili kayıt bulunamadı',
      errorCode: ErrorCode.VALIDATION_ERROR,
      details: {
        field: error.meta?.field_name,
        type: 'foreign_key_constraint',
      },
    });
  }

  // Zod validation errors
  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: 'Geçersiz veri formatı',
      errorCode: ErrorCode.VALIDATION_ERROR,
      details: error.errors.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Geçersiz token',
      errorCode: ErrorCode.TOKEN_INVALID,
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token süresi dolmuş',
      errorCode: ErrorCode.TOKEN_EXPIRED,
    });
  }

  // Legacy INSUFFICIENT_STOCK format (backward compatibility)
  if (error.message && error.message.includes('INSUFFICIENT_STOCK')) {
    try {
      const parsedError = JSON.parse(error.message);
      return res.status(400).json({
        error: parsedError.details?.[0] || 'Yetersiz stok',
        errorCode: ErrorCode.INSUFFICIENT_STOCK,
        details: parsedError.details,
      });
    } catch {
      return res.status(400).json({
        error: 'Yetersiz stok',
        errorCode: ErrorCode.INSUFFICIENT_STOCK,
        details: [error.message],
      });
    }
  }

  // Unknown/Unexpected errors
  console.error('🔥 Unhandled Error:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Bir hata oluştu, lütfen daha sonra tekrar deneyin'
    : error.message || 'Internal server error';

  res.status(500).json({
    error: message,
    errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
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
