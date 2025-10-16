/**
 * Mikro B2B Backend - Main Entry Point
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { config } from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import syncService from './services/sync.service';
import orderTrackingService from './services/order-tracking.service';
import emailService from './services/email.service';

// Express app
const app: Application = express();

// Trust proxy - Required for Vercel/Next.js proxy to work correctly
app.set('trust proxy', true);

// ==================== MIDDLEWARE ====================

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploads)
app.use('/uploads', express.static('uploads'));

// Rate limiting - Development'ta daha yüksek limit
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: config.isDevelopment ? 1000 : 100, // Development'ta 1000, production'da 100
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip failed requests to avoid false positives (don't count 401/403/404)
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  // Validate config but suppress warnings about trust proxy
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Production'da rate limiting aktif, development'ta devre dışı
if (!config.isDevelopment) {
  app.use('/api/', limiter);
  console.log('🛡️  Rate limiting enabled: 100 req/min');
} else {
  console.log('⚡ Rate limiting disabled in development mode');
}

// Request logging (development)
if (config.isDevelopment) {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ==================== ROUTES ====================

app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (en sonda olmalı)
app.use(errorHandler);

// ==================== CRON JOBS ====================

if (config.enableCron) {
  console.log('🕐 Cron job aktif - Senkronizasyon planı:', config.syncCronSchedule);

  // B2B Stok Senkronizasyonu
  cron.schedule(config.syncCronSchedule, async () => {
    console.log('🔄 Otomatik senkronizasyon başladı...');
    try {
      const result = await syncService.runFullSync('AUTO');
      if (result.success) {
        console.log('✅ Otomatik senkronizasyon tamamlandı:', result.stats);
      } else {
        console.error('❌ Otomatik senkronizasyon başarısız:', result.error);
      }
    } catch (error) {
      console.error('❌ Cron job hatası:', error);
    }
  });

  // Sipariş Takip Modülü - Otomatik sync + mail
  (async () => {
    try {
      const settings = await orderTrackingService.getSettings();

      if (settings.syncEnabled) {
        console.log('📋 Sipariş takip cron job aktif - Plan:', settings.syncSchedule);

        cron.schedule(settings.syncSchedule, async () => {
          console.log('📧 Otomatik sipariş takip sync + mail başladı...');
          try {
            // 1. Sync
            const syncResult = await orderTrackingService.syncPendingOrders();
            if (syncResult.success) {
              console.log('✅ Sipariş sync tamamlandı:', syncResult.message);

              // 2. Mail gönder (eğer enabled ise)
              if (settings.emailEnabled) {
                const emailResult = await emailService.sendPendingOrdersToAllCustomers();
                if (emailResult.success) {
                  console.log('✅ Mail gönderimi tamamlandı:', emailResult.message);
                } else {
                  console.error('❌ Mail gönderimi başarısız:', emailResult.message);
                }
              }
            } else {
              console.error('❌ Sipariş sync başarısız:', syncResult.message);
            }
          } catch (error) {
            console.error('❌ Sipariş takip cron job hatası:', error);
          }
        });
      } else {
        console.log('⏸️  Sipariş takip cron job devre dışı');
      }
    } catch (error) {
      console.error('❌ Sipariş takip settings yükleme hatası:', error);
    }
  })();
}

// ==================== SERVER START ====================

const PORT = config.port;

app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║                                               ║');
  console.log('║      🚀 Mikro B2B Backend Server              ║');
  console.log('║                                               ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🎭 Mock Mikro: ${config.useMockMikro ? 'ENABLED' : 'DISABLED'}`);
  console.log(`⏰ Cron Jobs: ${config.enableCron ? 'ENABLED' : 'DISABLED'}`);
  console.log('');
  console.log('📚 API Documentation:');
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Auth: http://localhost:${PORT}/api/auth/*`);
  console.log(`   Admin: http://localhost:${PORT}/api/admin/*`);
  console.log(`   Customer: http://localhost:${PORT}/api/*`);
  console.log('');
  console.log('✨ Ready to accept requests!');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔌 SIGTERM signal received: closing server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔌 SIGINT signal received: closing server');
  process.exit(0);
});

export default app;
