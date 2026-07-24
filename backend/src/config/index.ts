import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Nestpay secrets are deliberately kept outside git. Local development reads the
// ignored backend/.env.nestpay.local; production may use the stable shared path
// or an explicit NESTPAY_ENV_FILE without copying secrets into a release.
const nestpayEnvCandidates = [
  process.env.NESTPAY_ENV_FILE,
  path.resolve(process.cwd(), '.env.nestpay.local'),
  '/var/www/b2b-shared/.env.nestpay.local',
].filter(Boolean) as string[];
const nestpayEnvPath = nestpayEnvCandidates.find((candidate) => fs.existsSync(candidate));
if (nestpayEnvPath) {
  dotenv.config({ path: nestpayEnvPath, override: false });
}

const nestpayConfigured = [
  process.env.NESTPAY_MERCHANT_ID,
  process.env.NESTPAY_TERMINAL_ID,
  process.env.NESTPAY_PROD_API_USERNAME,
  process.env.NESTPAY_PROD_API_PASSWORD,
  process.env.NESTPAY_OK_URL,
  process.env.NESTPAY_FAIL_URL,
  process.env.NESTPAY_CALLBACK_URL,
].every((value) => Boolean(String(value || '').trim()));

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
    connectionTimeout: parseInt(process.env.MIKRO_CONNECTION_TIMEOUT_MS || '10000', 10),
    // Baglanti havuzu: varsayilan max 10'du; es zamanli dashboard/rapor yukunde tikaniyordu.
    pool: {
      max: parseInt(process.env.MIKRO_POOL_MAX || '25', 10),
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },
  // Patron satis/karlilik baglantisi icin opsiyonel, salt-okunur Mikro hesabi.
  // Ayrik hesap tanimli degilse mevcut Mikro baglantisi kullanilir; endpoint
  // yine yalniz sabit TVF ve allowlist edilmis SELECT sorgulari calistirir.
  managementProfitReportMikro: {
    usesDedicatedCredentials: Boolean(
      String(process.env.MIKRO_REPORT_USER || '').trim()
      && String(process.env.MIKRO_REPORT_PASSWORD || '').trim()
    ),
    allowSharedCredentials:
      process.env.MIKRO_REPORT_ALLOW_SHARED_CREDENTIALS === 'true',
    server: process.env.MIKRO_REPORT_SERVER || process.env.MIKRO_SERVER || '',
    database: process.env.MIKRO_REPORT_DATABASE || process.env.MIKRO_DATABASE || '',
    user: process.env.MIKRO_REPORT_USER || process.env.MIKRO_USER || '',
    password: process.env.MIKRO_REPORT_PASSWORD || process.env.MIKRO_PASSWORD || '',
    port: parseInt(process.env.MIKRO_REPORT_PORT || process.env.MIKRO_PORT || '1433', 10),
    requestTimeout: parseInt(process.env.MIKRO_REPORT_REQUEST_TIMEOUT_MS || '120000', 10),
    connectionTimeout: parseInt(process.env.MIKRO_REPORT_CONNECTION_TIMEOUT_MS || '10000', 10),
    pool: {
      max: Math.max(1, parseInt(process.env.MIKRO_REPORT_POOL_MAX || '4', 10)),
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Ziraat Nestpay PayByLink. StoreKey/3D form is intentionally unused because
  // card entry and 3D authentication happen on the bank-hosted payment page.
  nestpay: {
    configured: nestpayConfigured,
    enabled: nestpayConfigured && process.env.NESTPAY_ENABLED !== 'false',
    apiUrl: process.env.NESTPAY_PROD_API_URL || 'https://sanalpos2.ziraatbank.com.tr/fim/api',
    merchantId: process.env.NESTPAY_MERCHANT_ID || '',
    terminalId: process.env.NESTPAY_TERMINAL_ID || '',
    apiUsername: process.env.NESTPAY_PROD_API_USERNAME || '',
    apiPassword: process.env.NESTPAY_PROD_API_PASSWORD || '',
    okUrl: process.env.NESTPAY_OK_URL || '',
    failUrl: process.env.NESTPAY_FAIL_URL || '',
    callbackUrl: process.env.NESTPAY_CALLBACK_URL || '',
    origin: process.env.NESTPAY_ORIGIN || '',
    merchantIp: process.env.NESTPAY_MERCHANT_IP || '',
    bankName: process.env.NESTPAY_BANK_NAME || 'Ziraat Bankasi',
    merchantDisplayName: process.env.NESTPAY_MERCHANT_DISPLAY_NAME || 'Bakircilar',
    expiryValue: Math.max(1, parseInt(process.env.NESTPAY_LINK_EXPIRY || '1', 10)),
    expiryUnit: process.env.NESTPAY_LINK_EXPIRY_UNIT || 'D',
    minAmount: Math.max(0.01, Number(process.env.NESTPAY_MIN_TRANSACTION_AMOUNT || '1')),
    maxAmount: Math.max(1, Number(process.env.NESTPAY_MAX_TRANSACTION_AMOUNT || '1000000')),
    maxBalanceAgeHours: Math.max(1, Number(process.env.NESTPAY_MAX_BALANCE_AGE_HOURS || '96')),
    requestTimeoutMs: Math.max(5000, parseInt(process.env.NESTPAY_REQUEST_TIMEOUT_MS || '30000', 10)),
  },

  // Online odeme -> Mikro tahsilat makbuzu. Mikro'ya YAZAR; varsayilan KAPALI.
  // Yalniz admin mutabakati (reconcile) sonrasi ve enabled=true iken calisir.
  mikroReceipt: {
    enabled: process.env.MIKRO_RECEIPT_ENABLED === 'true',
    series: (process.env.MIKRO_RECEIPT_SERIES || 'POS').trim(),
    account: (process.env.MIKRO_RECEIPT_ACCOUNT || '102.01.002').trim(), // cha_kasa_hizkod (POS/banka hesabi)
    kasaHizmet: Math.trunc(Number(process.env.MIKRO_RECEIPT_KASA_HIZMET || '2')), // 2 = banka/kredi karti
    cinsi: Math.trunc(Number(process.env.MIKRO_RECEIPT_CINSI || '19')), // 19 = kredi karti tahsilati
    srmrkKodu: (process.env.MIKRO_RECEIPT_SRMRK || 'HENDEK').trim(), // sorumluluk merkezi (firma default)
    userNo: Math.max(1, Math.trunc(Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || '1'))),
  },

  // Cron
  enableCron: process.env.ENABLE_CRON === 'true',
  cronTimezone: process.env.CRON_TIMEZONE || 'Europe/Istanbul',
  syncCronSchedule: process.env.SYNC_CRON_SCHEDULE || '0 18 * * *', // Daily at 18:00
  // 12.3: Stok senkronu (18:00) ile ayni anda calisip ortak Mikro baglantisini
  // kesmemesi icin fiyat senkronu varsayilani 20:00'a alindi.
  priceSyncCronSchedule: process.env.PRICE_SYNC_CRON_SCHEDULE || '0 20 * * *',
  quoteSyncCronSchedule: process.env.QUOTE_SYNC_CRON_SCHEDULE || '0 18 * * *', // Her gün 18:00
  // Excel dogrulama tamamlanana kadar Mikro vade raporu otomatik cekilmez.
  // Bilerek tekrar acmak icin VADE_SYNC_AUTO_DISABLED=false ve gercek cron schedule verilmeli.
  vadeSyncCronSchedule: process.env.VADE_SYNC_CRON_SCHEDULE || '0 0 31 2 *',
  vadeSyncAutoDisabled: process.env.VADE_SYNC_AUTO_DISABLED !== 'false',
  vadeReminderCronSchedule: process.env.VADE_REMINDER_CRON_SCHEDULE || '0 * * * *',
  marginReportCronSchedule: process.env.MARGIN_REPORT_CRON_SCHEDULE || '0 3 * * *',
  marginViolationEscalationCronSchedule: process.env.MARGIN_VIOLATION_ESCALATION_CRON_SCHEDULE || '0 9 * * *',
  customerRecoveryHistoricalCronSchedule: process.env.CUSTOMER_RECOVERY_HISTORICAL_CRON_SCHEDULE || '0 6 * * *',
  productComplementCronSchedule: process.env.PRODUCT_COMPLEMENT_CRON_SCHEDULE || '30 2 * * *',
  productPopularityCronSchedule: process.env.PRODUCT_POPULARITY_CRON_SCHEDULE || '0 4 * * 1',
  analyticsCleanupCronSchedule: process.env.ANALYTICS_CLEANUP_CRON_SCHEDULE || '45 2 * * *',
  // Cari basina onerilen fiyat listesi motoru (price-list-suggestion.service.ts)
  priceListSuggestionCronSchedule: process.env.PRICE_LIST_SUGGESTION_CRON_SCHEDULE || '30 4 * * *',
  analyticsRetentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '180', 10),
  einvoiceAutoImportEnabled: process.env.EINVOICE_AUTO_IMPORT_ENABLED === 'true',
  einvoiceAutoImportCronSchedule: process.env.EINVOICE_AUTO_IMPORT_CRON_SCHEDULE || '*/20 * * * *',
  orderTrackingKioskSyncEnabled: process.env.ORDER_TRACKING_KIOSK_SYNC_ENABLED !== 'false',
  orderTrackingKioskBootSyncEnabled: process.env.ORDER_TRACKING_KIOSK_BOOT_SYNC_ENABLED === 'true',
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
