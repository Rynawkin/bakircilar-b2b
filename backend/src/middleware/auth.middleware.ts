/**
 * Authentication Middleware
 *
 * JWT token kontrolü ve kullanıcı doğrulama
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

/**
 * JWT token'ı doğrula ve req.user'a ekle
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7); // "Bearer " kısmını çıkar

    const decoded = verifyToken(token);

    // req.user'a kullanıcı bilgilerini ekle
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Sadece admin'lerin erişebileceği endpoint'ler için
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};

/**
 * Sadece müşterilerin erişebileceği endpoint'ler için
 */
export const requireCustomer = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'CUSTOMER') {
    res.status(403).json({ error: 'Customer access required' });
    return;
  }

  next();
};
