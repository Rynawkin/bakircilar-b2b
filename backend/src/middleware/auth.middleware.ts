/**
 * Authentication Middleware
 *
 * JWT token kontrolü ve kullanıcı doğrulama
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../utils/prisma';

/**
 * JWT token'ı doğrula ve req.user'a ekle
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔐 Auth check - Path:', req.path, 'Header:', authHeader ? 'EXISTS' : 'MISSING');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid token provided');
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7); // "Bearer " kısmını çıkar

    const decoded = verifyToken(token);

    // SALES_REP için sektör bilgilerini al
    let assignedSectorCodes: string[] = [];
    if (decoded.role === 'SALES_REP') {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { assignedSectorCodes: true },
      });
      assignedSectorCodes = user?.assignedSectorCodes || [];
    }

    // req.user'a kullanıcı bilgilerini ekle
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      assignedSectorCodes,
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

/**
 * ADMIN veya MANAGER erişimi
 * Kullanım: Kategori/fiyat ayarları, kullanıcı yönetimi (SALES_REP oluşturma)
 */
export const requireAdminOrManager = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
    res.status(403).json({ error: 'Admin or Manager access required' });
    return;
  }

  next();
};

/**
 * ADMIN, MANAGER veya SALES_REP erişimi
 * Kullanım: Müşteri/sipariş listeleme (sektör filtrelemesi controller'da yapılır)
 */
export const requireStaff = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && req.user.role !== 'SALES_REP') {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  next();
};

/**
 * Sipariş onaylama yetkisi kontrolü
 * Sadece ADMIN ve SALES_REP onaylayabilir (MANAGER onaylayamaz)
 */
export const requireOrderApprover = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'SALES_REP') {
    res.status(403).json({ error: 'Order approval permission required (ADMIN or SALES_REP only)' });
    return;
  }

  next();
};
