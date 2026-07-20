/**
 * Auth Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken, passwordFingerprint } from '../utils/jwt';
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
              vatDisplayPreference: true,
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
                vatDisplayPreference: true,
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

      // Giris kaydi (cari aktivite raporu: son giris + giris sikligi). Hata login'i BLOKLAMAZ.
      try {
        const now = new Date();
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: now,
            loginCount: { increment: 1 },
            ...(user.firstLoginAt ? {} : { firstLoginAt: now }),
          },
        });
      } catch (e) {
        console.error('login timestamp update failed', e);
      }

      // JWT token üret (11.2: sifre parmak izi ile)
      const token = generateToken({
        userId: user.id,
        email: user.email || user.mikroCariCode || '',
        role: user.role,
        pwfp: passwordFingerprint(user.password),
      });

      // Kullanıcı bilgilerini döndür
      const effectiveMikroCode = user.mikroCariCode || user.parentCustomer?.mikroCariCode || undefined;
      const effectiveCustomerType = user.customerType || user.parentCustomer?.customerType || undefined;
      const effectivePriceVisibility = user.parentCustomer?.priceVisibility || user.priceVisibility;
      const effectiveVatDisplayPreference =
        user.parentCustomer?.vatDisplayPreference || user.vatDisplayPreference;

      const userResponse: UserResponse = {
        id: user.id,
        email: user.email || effectiveMikroCode || '',
        name: user.displayName || user.name,
        role: user.role,
        customerType: effectiveCustomerType,
        mikroCariCode: effectiveMikroCode,
        priceVisibility: effectivePriceVisibility,
        vatDisplayPreference: effectiveVatDisplayPreference,
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
          vatDisplayPreference: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              mikroCariCode: true,
              customerType: true,
              priceVisibility: true,
              vatDisplayPreference: true,
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
      const effectiveVatDisplayPreference =
        user.parentCustomer?.vatDisplayPreference || user.vatDisplayPreference;

      res.json({
        id: user.id,
        email: user.email || effectiveMikroCode || '',
        name: user.displayName || user.name,
        role: user.role,
        customerType: effectiveCustomerType,
        mikroCariCode: effectiveMikroCode,
        priceVisibility: effectivePriceVisibility,
        vatDisplayPreference: effectiveVatDisplayPreference,
        parentCustomerId: user.parentCustomerId || undefined,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/auth/password
   * Yalnız oturum sahibinin kendi B2B şifresini değiştirir. Mikro/cari alanlarına dokunmaz.
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, password: true },
      });

      if (!user) {
        res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        return;
      }

      const currentPasswordMatches = await comparePassword(currentPassword, user.password);
      if (!currentPasswordMatches) {
        res.status(400).json({ error: 'Mevcut şifre doğru değil' });
        return;
      }

      const password = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { password },
      });

      // JWT'lerde şifre parmak izi bulunduğu için mevcut oturumlar bir sonraki istekte
      // otomatik olarak geçersiz hale gelir. İstemci de kullanıcıyı yeniden girişe yönlendirir.
      res.json({ message: 'Şifreniz başarıyla değiştirildi. Lütfen yeniden giriş yapın.' });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
