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
import priceSyncService from './services/priceSync.service';

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

// Request logging (always enabled to debug issues)
app.use((req, _res, next) => {
  console.log(`📥 ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

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

  console.log("Price sync cron schedule:", config.priceSyncCronSchedule);
  cron.schedule(config.priceSyncCronSchedule, async () => {
    console.log("Automatic price sync started...");
    try {
      const result = await priceSyncService.syncPriceChanges();
      if (result.success) {
        console.log("Automatic price sync completed:", result.recordsSynced);
      } else {
        console.error("Automatic price sync failed:", result.error);
      }
    } catch (error) {
      console.error("Price cron job error:", error);
    }
  });

  // Sipariş Takip Modülü - Otomatik sync + mail
  (async () => {
    try {
      const settings = await orderTrackingService.getSettings();

      if (settings.syncEnabled) {
        // Müşteri mail gönderimi için cron job
        if (settings.customerEmailEnabled) {
          console.log('📋 Müşteri sipariş takip cron job aktif - Plan:', settings.customerSyncSchedule);

          cron.schedule(settings.customerSyncSchedule, async () => {
            console.log('📧 Müşterilere otomatik sipariş takip sync + mail başladı...');
            try {
              // 1. Sync
              const syncResult = await orderTrackingService.syncPendingOrders();
              if (syncResult.success) {
                console.log('✅ Sipariş sync tamamlandı:', syncResult.message);

                // 2. Müşterilere mail gönder
                const emailResult = await emailService.sendPendingOrdersToCustomers();
                if (emailResult.success) {
                  console.log('✅ Müşterilere mail gönderimi tamamlandı:', emailResult.message);
                } else {
                  console.error('❌ Müşterilere mail gönderimi başarısız:', emailResult.message);
                }
              } else {
                console.error('❌ Sipariş sync başarısız:', syncResult.message);
              }
            } catch (error) {
              console.error('❌ Müşteri sipariş takip cron job hatası:', error);
            }
          });
        } else {
          console.log('⏸️  Müşteri sipariş takip cron job devre dışı');
        }

        // Tedarikçi mail gönderimi için cron job
        if (settings.supplierEmailEnabled) {
          console.log('📋 Tedarikçi sipariş takip cron job aktif - Plan:', settings.supplierSyncSchedule);

          cron.schedule(settings.supplierSyncSchedule, async () => {
            console.log('📧 Tedarikçilere otomatik sipariş takip sync + mail başladı...');
            try {
              // 1. Sync
              const syncResult = await orderTrackingService.syncPendingOrders();
              if (syncResult.success) {
                console.log('✅ Sipariş sync tamamlandı:', syncResult.message);

                // 2. Tedarikçilere mail gönder
                const emailResult = await emailService.sendPendingOrdersToSuppliers();
                if (emailResult.success) {
                  console.log('✅ Tedarikçilere mail gönderimi tamamlandı:', emailResult.message);
                } else {
                  console.error('❌ Tedarikçilere mail gönderimi başarısız:', emailResult.message);
                }
              } else {
                console.error('❌ Sipariş sync başarısız:', syncResult.message);
              }
            } catch (error) {
              console.error('❌ Tedarikçi sipariş takip cron job hatası:', error);
            }
          });
        } else {
          console.log('⏸️  Tedarikçi sipariş takip cron job devre dışı');
        }
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
