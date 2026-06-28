import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { JwtPayload } from '../types';

/**
 * 11.2: Sifre hash'inden kisa bir parmak izi uretir. Token icine konur; kullanici
 * sifresini degistirince (veya sifirlayinca) parmak izi degisir ve onceki tum
 * token'lar sunucu tarafinda gecersiz hale gelir.
 */
export const passwordFingerprint = (passwordHash: string): string => {
  return crypto.createHash('sha256').update(passwordHash || '').digest('hex').slice(0, 16);
};

export const generateToken = (payload: JwtPayload): string => {
  const options: jwt.SignOptions = {
    expiresIn: config.jwtExpiresIn as unknown as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};
