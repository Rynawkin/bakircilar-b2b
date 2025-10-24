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
      });

      // Email ile bulunamadıysa, cari kodu ile dene
      if (!user) {
        user = await prisma.user.findUnique({
          where: { mikroCariCode: email },
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
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email || user.mikroCariCode || '',
        name: user.name,
        role: user.role,
        customerType: user.customerType || undefined,
        mikroCariCode: user.mikroCariCode || undefined,
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
          role: true,
          customerType: true,
          mikroCariCode: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
