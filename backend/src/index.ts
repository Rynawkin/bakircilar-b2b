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
import quoteService from './services/quote.service';
import vadeSyncService from './services/vadeSync.service';
import vadeNotificationService from './services/vadeNotification.service';
import reportsService from './services/reports.service';
import productComplementService from './services/product-complement.service';
import customerActivityService from './services/customer-activity.service';
import eInvoiceService from './services/einvoice.service';
import { prisma } from './utils/prisma';


const getDateInTimeZone = (date: Date, timeZone: string): Date => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const getYesterdayInTimeZone = (timeZone: string): Date => {
  const today = getDateInTimeZone(new Date(), timeZone);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  return yesterday;
};

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
  const cronOptions = { timezone: config.cronTimezone };
  let kioskSyncInProgress = false;
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
  }, cronOptions);

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
  }, cronOptions);

  console.log('Quote sync cron schedule:', config.quoteSyncCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.quoteSyncCronSchedule, async () => {
    console.log('Quote sync started...');
    try {
      const result = await quoteService.syncQuotesFromMikro();
      console.log('Quote sync completed:', result);
    } catch (error) {
      console.error('Quote sync error:', error);
    }
  }, cronOptions);

  console.log('Vade sync cron schedule:', config.vadeSyncCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.vadeSyncCronSchedule, async () => {
    console.log('Vade sync started...');
    try {
      const result = await vadeSyncService.syncFromMikro('AUTO');
      if (result.success) {
        console.log('Vade sync completed:', result);
      } else {
        console.error('Vade sync failed:', result.error);
      }
    } catch (error) {
      console.error('Vade sync error:', error);
    }
  }, cronOptions);

  console.log('Vade reminder cron schedule:', config.vadeReminderCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.vadeReminderCronSchedule, async () => {

    try {
      const result = await vadeNotificationService.processNoteReminders();
      if (result.notified > 0) {
        console.log('Vade reminders sent:', result.notified);
      }
    } catch (error) {
      console.error('Vade reminder error:', error);
    }
  }, cronOptions);

  console.log('Margin compliance report cron schedule:', config.marginReportCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.marginReportCronSchedule, async () => {
    console.log('Margin compliance report sync started...');
    const reportDate = getYesterdayInTimeZone(config.cronTimezone);

    try {
      const syncResult = await reportsService.syncMarginComplianceReportForDate(reportDate);
      if (!syncResult.success) {
        console.error('Margin compliance report sync failed:', syncResult.error);
        return;
      }

      const settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });
      const recipients = settings?.marginReportEmailRecipients || [];
      if (!settings?.marginReportEmailEnabled || recipients.length === 0) {
        console.log('Margin compliance report email disabled or no recipients configured.');
        return;
      }

      const emailPayload = await reportsService.buildMarginComplianceEmailPayload(
        reportDate,
        settings?.marginReportEmailColumns || []
      );

      await emailService.sendMarginComplianceReportSummary({
        recipients,
        reportDate,
        summary: emailPayload.summary,
        subject: settings?.marginReportEmailSubject || undefined,
        attachment: emailPayload.attachment,
      });
    } catch (error) {
      console.error('Margin compliance report cron error:', error);
    }
  }, cronOptions);

  console.log('Product complement cron schedule:', config.productComplementCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.productComplementCronSchedule, async () => {
    console.log('Product complement sync started...');
    try {
      const result = await productComplementService.syncAutoRecommendations();
      console.log('Product complement sync completed:', result);
    } catch (error) {
      console.error('Product complement cron error:', error);
    }
  }, cronOptions);

  console.log('Customer activity cleanup schedule:', config.analyticsCleanupCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.analyticsCleanupCronSchedule, async () => {
    try {
      const result = await customerActivityService.cleanupOldEvents(config.analyticsRetentionDays);
      if (result.deleted > 0) {
        console.log('Customer activity cleanup removed records:', result.deleted);
      }
    } catch (error) {
      console.error('Customer activity cleanup error:', error);
    }
  }, cronOptions);

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

  if (config.orderTrackingKioskSyncEnabled) {
    const runKioskPendingOrderSync = async (source: 'CRON' | 'BOOT') => {
      if (kioskSyncInProgress) {
        console.log(`⏭️ Kiosk siparis sync atlandi (${source}) - onceki islem devam ediyor`);
        return;
      }

      kioskSyncInProgress = true;
      try {
        console.log(`🧭 Kiosk siparis sync basladi (${source})...`);
        const result = await orderTrackingService.syncPendingOrders();
        if (result.success) {
          console.log(
            `✅ Kiosk siparis sync tamamlandi (${source}) - Siparis: ${result.ordersCount}, Musteri: ${result.customersCount}`
          );
        } else {
          console.error(`❌ Kiosk siparis sync basarisiz (${source}):`, result.message);
        }
      } catch (error) {
        console.error(`❌ Kiosk siparis sync hatasi (${source}):`, error);
      } finally {
        kioskSyncInProgress = false;
      }
    };

    console.log(
      'Kiosk pending-orders sync cron schedule:',
      config.orderTrackingKioskSyncCronSchedule,
      'Timezone:',
      config.cronTimezone
    );
    cron.schedule(config.orderTrackingKioskSyncCronSchedule, async () => {
      await runKioskPendingOrderSync('CRON');
    }, cronOptions);

    // Ensure kiosk data is warmed right after process start.
    runKioskPendingOrderSync('BOOT').catch((error) => {
      console.error('❌ Kiosk siparis boot sync hatasi:', error);
    });
  } else {
    console.log('⏸️  Kiosk pending-orders sync cron job devre disi');
  }
}

if (config.einvoiceAutoImportEnabled) {
  const cronOptions = { timezone: config.cronTimezone };
  console.log('E-invoice auto import cron schedule:', config.einvoiceAutoImportCronSchedule, 'Timezone:', config.cronTimezone);
  cron.schedule(config.einvoiceAutoImportCronSchedule, async () => {
    console.log('E-invoice auto import started...');
    try {
      const result = await eInvoiceService.importDocumentsFromDirectory();
      console.log('E-invoice auto import completed:', {
        scanned: result.scanned,
        processed: result.processed,
        uploaded: result.uploaded,
        updated: result.updated,
        skippedExisting: result.skippedExisting,
        failed: result.failed,
      });
    } catch (error) {
      console.error('E-invoice auto import cron error:', error);
    }
  }, cronOptions);
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
