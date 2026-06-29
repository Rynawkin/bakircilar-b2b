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
  // 11.2: Oturum suresi 30 gunden makul bir sureye indirildi (env ile ayarlanabilir).
  // Calinan/eski token'in gecerlilik penceresini kisaltir.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // Mikro ERP
  useMockMikro: process.env.USE_MOCK_MIKRO === 'true',
  mikro: {
    server: process.env.MIKRO_SERVER || '',
    database: process.env.MIKRO_DATABASE || '',
    user: process.env.MIKRO_USER || '',
    password: process.env.MIKRO_PASSWORD || '',
    port: parseInt(process.env.MIKRO_PORT || '1433', 10),
    requestTimeout: parseInt(process.env.MIKRO_REQUEST_TIMEOUT_MS || '120000', 10),
    connectionTimeout: parseInt(process.env.MIKRO_CONNECTION_TIMEOUT_MS || '30000', 10),
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Cron
  enableCron: process.env.ENABLE_CRON === 'true',
  cronTimezone: process.env.CRON_TIMEZONE || 'Europe/Istanbul',
  syncCronSchedule: process.env.SYNC_CRON_SCHEDULE || '0 18 * * *', // Daily at 18:00
  // 12.3: Stok senkronu (18:00) ile ayni anda calisip ortak Mikro baglantisini
  // kesmemesi icin fiyat senkronu varsayilani 20:00'a alindi.
  priceSyncCronSchedule: process.env.PRICE_SYNC_CRON_SCHEDULE || '0 20 * * *',
  quoteSyncCronSchedule: process.env.QUOTE_SYNC_CRON_SCHEDULE || '0 18 * * *', // Her gün 18:00
  vadeSyncCronSchedule: process.env.VADE_SYNC_CRON_SCHEDULE || '0 * * * *',
  vadeReminderCronSchedule: process.env.VADE_REMINDER_CRON_SCHEDULE || '0 * * * *',
  marginReportCronSchedule: process.env.MARGIN_REPORT_CRON_SCHEDULE || '0 3 * * *',
  customerRecoveryHistoricalCronSchedule: process.env.CUSTOMER_RECOVERY_HISTORICAL_CRON_SCHEDULE || '0 6 * * *',
  productComplementCronSchedule: process.env.PRODUCT_COMPLEMENT_CRON_SCHEDULE || '30 2 * * *',
  productPopularityCronSchedule: process.env.PRODUCT_POPULARITY_CRON_SCHEDULE || '0 4 * * 1',
  analyticsCleanupCronSchedule: process.env.ANALYTICS_CLEANUP_CRON_SCHEDULE || '45 2 * * *',
  analyticsRetentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '180', 10),
  einvoiceAutoImportEnabled: process.env.EINVOICE_AUTO_IMPORT_ENABLED === 'true',
  einvoiceAutoImportCronSchedule: process.env.EINVOICE_AUTO_IMPORT_CRON_SCHEDULE || '*/20 * * * *',
  orderTrackingKioskSyncEnabled: process.env.ORDER_TRACKING_KIOSK_SYNC_ENABLED !== 'false',
  orderTrackingKioskSyncCronSchedule: process.env.ORDER_TRACKING_KIOSK_SYNC_CRON_SCHEDULE || '*/10 * * * *',
  yolpilotIntegrationApiKey: process.env.YOLPILOT_INTEGRATION_API_KEY || '',

  // AI Assistant (Anthropic)
  // ANTHROPIC_API_KEY tanimli degilse asistan endpointleri "AI yapilandirilmadi" doner;
  // backend yine de calisir (zorunlu env degil).
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    // Soru-cevap (sohbet) modeli. Maliyet icin varsayilan Sonnet; env ile degistirilebilir.
    model: process.env.AI_MODEL || 'claude-sonnet-4-6',
    // Teklif analizi modeli (derin analiz icin ayri override imkani).
    analysisModel: process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-6',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048', 10),
    analysisMaxTokens: parseInt(process.env.AI_ANALYSIS_MAX_TOKENS || '3072', 10),
    // Ajan dongusunde izin verilen maksimum arac-cagri turu (maliyet/sonsuz dongu korumasi).
    maxSteps: parseInt(process.env.AI_MAX_STEPS || '8', 10),
    get enabled() {
      return (process.env.ANTHROPIC_API_KEY || '').length > 0;
    },
  },

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
