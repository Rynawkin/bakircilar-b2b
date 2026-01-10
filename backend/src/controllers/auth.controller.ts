/**
 * Auth Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { LoginRequest, UserResponse } from '../types';

export class AuthController {
  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as LoginRequest;

      // Kullanıcıyı bul - email veya cari kodu ile
      let user = await prisma.user.findUnique({
        where: { email },
        include: {
          parentCustomer: {
            select: {
              id: true,
              mikroCariCode: true,
              customerType: true,
              priceVisibility: true,
            },
          },
        },
      });

      // Email ile bulunamadıysa, cari kodu ile dene
      if (!user) {
        user = await prisma.user.findUnique({
          where: { mikroCariCode: email },
          include: {
            parentCustomer: {
              select: {
                id: true,
                mikroCariCode: true,
                customerType: true,
                priceVisibility: true,
              },
            },
          },
        });
      }

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      if (!user.active) {
        res.status(403).json({ error: 'Account is inactive' });
        return;
      }

      // Şifre kontrolü
      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // JWT token üret
      const token = generateToken({
        userId: user.id,
        email: user.email || user.mikroCariCode || '',
        role: user.role,
      });

      // Kullanıcı bilgilerini döndür
      const effectiveMikroCode = user.mikroCariCode || user.parentCustomer?.mikroCariCode || undefined;
      const effectiveCustomerType = user.customerType || user.parentCustomer?.customerType || undefined;
      const effectivePriceVisibility = user.parentCustomer?.priceVisibility || user.priceVisibility;

      const userResponse: UserResponse = {
        id: user.id,
        email: user.email || effectiveMikroCode || '',
        name: user.displayName || user.name,
        role: user.role,
        customerType: effectiveCustomerType,
        mikroCariCode: effectiveMikroCode,
        priceVisibility: effectivePriceVisibility,
        parentCustomerId: user.parentCustomerId || undefined,
      };

      res.json({
        token,
        user: userResponse,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          role: true,
          customerType: true,
          mikroCariCode: true,
          priceVisibility: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              mikroCariCode: true,
              customerType: true,
              priceVisibility: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const effectiveMikroCode = user.mikroCariCode || user.parentCustomer?.mikroCariCode || undefined;
      const effectiveCustomerType = user.customerType || user.parentCustomer?.customerType || undefined;
      const effectivePriceVisibility = user.parentCustomer?.priceVisibility || user.priceVisibility;

      res.json({
        id: user.id,
        email: user.email || effectiveMikroCode || '',
        name: user.displayName || user.name,
        role: user.role,
        customerType: effectiveCustomerType,
        mikroCariCode: effectiveMikroCode,
        priceVisibility: effectivePriceVisibility,
        parentCustomerId: user.parentCustomerId || undefined,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
