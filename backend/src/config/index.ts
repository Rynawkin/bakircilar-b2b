import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL!,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // JWT
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: '30d', // 30 gün - Uzun sync işlemleri için

  // Mikro ERP
  useMockMikro: process.env.USE_MOCK_MIKRO === 'true',
  mikro: {
    server: process.env.MIKRO_SERVER || '',
    database: process.env.MIKRO_DATABASE || '',
    user: process.env.MIKRO_USER || '',
    password: process.env.MIKRO_PASSWORD || '',
    port: parseInt(process.env.MIKRO_PORT || '1433', 10),
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Cron
  enableCron: process.env.ENABLE_CRON === 'true',
  syncCronSchedule: process.env.SYNC_CRON_SCHEDULE || '0 * * * *', // Her saat başı

  // App
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export default config;
