# Production Deployment Guide

## ⚠️ IMPORTANT: Environment Variables

The `.env` file is **NOT** tracked in Git for security reasons. You must manually create it on the production server.

### Production Server Setup

1. **Create .env file on production server:**

```bash
cd /var/www/b2b/backend
nano .env
```

2. **Use these production settings:**

```env
# Server Configuration
NODE_ENV=production
PORT=5000

# PostgreSQL Database
# IMPORTANT: Use 127.0.0.1 instead of localhost to avoid PostgreSQL peer authentication issues
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/mikrob2b?schema=public"

# JWT Secret
JWT_SECRET=mikro-b2b-super-secret-jwt-key-change-in-production-2024

# Mikro ERP Configuration
USE_MOCK_MIKRO=false
MIKRO_SERVER=185.123.54.61
MIKRO_DATABASE=MikroDB_V16_BKRC2020
MIKRO_USER=BkrcWebL1RgcVc4YexP3LRfWZ6W
MIKRO_PASSWORD="uq0#_iZ0FTlvHwF=sPKL"
MIKRO_PORT=16022

# CORS
FRONTEND_URL=http://localhost:3000

# Cron Job
ENABLE_CRON=false
SYNC_CRON_SCHEDULE="0 * * * *"

# E-Invoice Auto Import (DEF26 + DAR26)
EINVOICE_UPLOAD_DIR=/var/www/b2b/backend/private-uploads/einvoices
EINVOICE_AUTO_IMPORT_ENABLED=true
EINVOICE_AUTO_IMPORT_CRON_SCHEDULE="*/20 * * * *"
EINVOICE_AUTO_IMPORT_SOURCE_DIR=/var/www/b2b/backend/auto-import/einvoices
EINVOICE_AUTO_IMPORT_ARCHIVE_DIR=/var/www/b2b/backend/auto-import/einvoices/_processed
EINVOICE_AUTO_IMPORT_PREFIXES=DEF26,DAR26
EINVOICE_AUTO_IMPORT_SKIP_EXISTING=true
```

3. **Backup your .env file:**

```bash
# Create a backup (not tracked by git)
cp .env .env.production.backup
```

## Database Setup

### Initial Setup

1. **Push schema to database:**

```bash
npx prisma db push
```

2. **Generate Prisma Client:**

```bash
npx prisma generate
```

3. **Create admin and test users:**

```bash
node create-admin.js
```

This will create:
- Admin: `admin@bakircilar.com` / `admin123`
- Test Customer: `test@customer.com` / `test123`

## Deployment Steps

1. **Pull latest code:**

```bash
cd /var/www/b2b/backend
git pull origin main
```

2. **Install dependencies:**

```bash
npm install --production=false
```

3. **Build:**

```bash
npm run build
```

4. **Restart PM2:**

```bash
pm2 restart b2b-backend
# or
pm2 reload b2b-backend --update-env
```

5. **Check logs:**

```bash
pm2 logs b2b-backend --lines 50
```

## Troubleshooting

### Database Connection Issues

If you see "Peer authentication failed":
- Make sure DATABASE_URL uses `127.0.0.1` not `localhost`

### Prisma Client Errors

If you see "Column does not exist":
1. Delete Prisma cache: `rm -rf node_modules/.prisma node_modules/@prisma`
2. Reinstall: `npm install`
3. Generate: `npx prisma generate`
4. Restart PM2

### Environment Not Loading

If changes to .env don't take effect:
```bash
pm2 restart b2b-backend --update-env
```

## Security Notes

- ✅ .env is in .gitignore and NOT tracked by git
- ✅ Always backup .env to .env.production.backup
- ✅ Never commit sensitive credentials to git
- ✅ Keep .env.example updated with structure (but not real values)
