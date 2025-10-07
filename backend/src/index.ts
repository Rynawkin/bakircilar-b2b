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

// Express app
const app: Application = express();

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
