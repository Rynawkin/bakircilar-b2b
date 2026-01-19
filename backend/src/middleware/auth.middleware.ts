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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
 * HEAD_ADMIN her zaman erişebilir
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};

/**
 * ADMIN veya SALES_REP erisimi
 * HEAD_ADMIN her zaman erisebilir
 */
export const requireAdminOrSalesRep = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'SALES_REP') {
    res.status(403).json({ error: 'Admin or Sales Rep access required' });
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
 * HEAD_ADMIN her zaman erişebilir
 */
export const requireAdminOrManager = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
    res.status(403).json({ error: 'Admin or Manager access required' });
    return;
  }

  next();
};

/**
 * ADMIN, MANAGER veya SALES_REP erişimi
 * Kullanım: Müşteri/sipariş listeleme (sektör filtrelemesi controller'da yapılır)
 * HEAD_ADMIN her zaman erişebilir
 */
export const requireStaff = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && req.user.role !== 'SALES_REP') {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  next();
};

/**
 * Sipariş onaylama yetkisi kontrolü
 * Sadece ADMIN ve SALES_REP onaylayabilir (MANAGER onaylayamaz)
 * HEAD_ADMIN her zaman erişebilir
 */
export const requireOrderApprover = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'SALES_REP') {
    res.status(403).json({ error: 'Order approval permission required (ADMIN or SALES_REP only)' });
    return;
  }

  next();
};

/**
 * ADMIN, MANAGER, DIVERSEY veya SALES_REP erişimi
 * Kullanım: Ürün listesi görüntüleme (DIVERSEY sadece kendi ürünlerini görecek - controller'da filtrelenir)
 * HEAD_ADMIN her zaman erişebilir
 */
export const requireStaffOrDiversey = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'HEAD_ADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && req.user.role !== 'SALES_REP' && req.user.role !== 'DIVERSEY') {
    res.status(403).json({ error: 'Staff or Diversey access required' });
    return;
  }

  next();
};
