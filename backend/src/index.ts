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
// Periyodik islerin govdeleri artik scheduled-jobs registry'sinde. index.ts yalnizca
// registry-disi (settings-driven order-tracking e-postalari) + boot-warm isleri barindirir.
import scheduledJobsService from './services/scheduled-jobs.service';
import orderTrackingService from './services/order-tracking.service';
import emailService from './services/email.service';
import productPopularityService from './services/product-popularity.service';
import { getUploadsDir } from './utils/storage';

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
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve static files from persistent storage so deploy releases do not hide images.
app.use('/uploads', express.static(getUploadsDir()));

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

// Runtime-yonetilebilir is kayit defteri (scheduled-jobs.service).
// 13 periyodik is (stok/fiyat/teklif/vade/... /kiosk/e-fatura) artik burada
// inline degil, registry uzerinden kaydedilir. Registry, Settings.cronOverrides
// ile canli olarak degistirilebilen zamanlamayi ve manuel tetiklemeyi yonetir.
// enableCron false olsa bile registry + manuel tetikleme (runNow) calisir; ancak
// periyodik node-cron gorevleri yalnizca enableCron true iken kaydedilir.
scheduledJobsService
  .initialize({ timezone: config.cronTimezone, enabled: config.enableCron })
  .then(() => {
    console.log('🗂️  Scheduled-jobs registry hazir. Cron:', config.enableCron ? 'ENABLED' : 'DISABLED');
  })
  .catch((error) => {
    console.error('❌ Scheduled-jobs registry initialize hatasi:', error);
  });

// Registry'de OLMAYAN, ayrica korunan startup/settings-driven isler:
if (config.enableCron) {
  const cronOptions = { timezone: config.cronTimezone };

  // Populer urun onbellegi acilis kontrolu (periyodik is registry'de; bu yalnizca boot-warm).
  productPopularityService.ensureFresh().then((result) => {
    console.log('Product popularity cache startup check:', result);
  }).catch((error) => {
    console.error('Product popularity startup check error:', error);
  });

  // Sipariş Takip Modülü - Otomatik sync + mail (settings-driven; registry disi, aynen korunuyor)
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
          }, cronOptions);
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
          }, cronOptions);
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

  // Kiosk siparis verisini process acilisinda bir kez isit (periyodik CRON tigi
  // registry'de; bu yalnizca boot-warm). Kiosk in-progress bayragi registry icinde.
  if (config.orderTrackingKioskSyncEnabled) {
    scheduledJobsService.runKioskBootSync();
  }
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
