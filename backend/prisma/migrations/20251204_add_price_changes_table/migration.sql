-- CreateTable: price_changes
-- Mikro ERP fiyat değişikliklerini PostgreSQL'de saklayacak tablo
-- Bu sayede hızlı sorgulama ve geçmiş analizi yapabileceğiz
-- Migration Date: 2025-12-04

CREATE TABLE IF NOT EXISTS "price_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "change_date" TIMESTAMP(3) NOT NULL,
    "price_list_no" INTEGER NOT NULL,
    "old_price" DECIMAL(18,4) NOT NULL,
    "new_price" DECIMAL(18,4) NOT NULL,
    "change_amount" DECIMAL(18,4) NOT NULL,
    "change_percent" DECIMAL(10,4) NOT NULL,

    -- Güncel durum bilgileri (değişiklik anındaki)
    "current_cost" DECIMAL(18,4),
    "current_stock" DECIMAL(18,4),

    -- Tüm liste fiyatları (değişiklik sonrası)
    "price_list_1" DECIMAL(18,4),
    "price_list_2" DECIMAL(18,4),
    "price_list_3" DECIMAL(18,4),
    "price_list_4" DECIMAL(18,4),
    "price_list_5" DECIMAL(18,4),
    "price_list_6" DECIMAL(18,4),
    "price_list_7" DECIMAL(18,4),
    "price_list_8" DECIMAL(18,4),
    "price_list_9" DECIMAL(18,4),
    "price_list_10" DECIMAL(18,4),

    -- Kar marjları (değişiklik sonrası)
    "margin_list_1" DECIMAL(10,4),
    "margin_list_2" DECIMAL(10,4),
    "margin_list_3" DECIMAL(10,4),
    "margin_list_4" DECIMAL(10,4),
    "margin_list_5" DECIMAL(10,4),
    "margin_list_6" DECIMAL(10,4),
    "margin_list_7" DECIMAL(10,4),
    "margin_list_8" DECIMAL(10,4),
    "margin_list_9" DECIMAL(10,4),
    "margin_list_10" DECIMAL(10,4),

    -- Meta
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS "price_changes_product_code_idx" ON "price_changes"("product_code");
CREATE INDEX IF NOT EXISTS "price_changes_change_date_idx" ON "price_changes"("change_date" DESC);
CREATE INDEX IF NOT EXISTS "price_changes_brand_idx" ON "price_changes"("brand");
CREATE INDEX IF NOT EXISTS "price_changes_product_code_change_date_idx" ON "price_changes"("product_code", "change_date" DESC);
CREATE INDEX IF NOT EXISTS "price_changes_synced_at_idx" ON "price_changes"("synced_at");

-- Ürün bazında özet istatistikler için tablo
CREATE TABLE IF NOT EXISTS "product_price_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_code" TEXT NOT NULL UNIQUE,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "total_changes" INTEGER NOT NULL DEFAULT 0,
    "first_change_date" TIMESTAMP(3),
    "last_change_date" TIMESTAMP(3),
    "days_since_last_change" INTEGER,
    "avg_change_frequency_days" DECIMAL(10,2), -- Ortalama kaç günde bir değişiyor

    -- Güncel durum
    "current_cost" DECIMAL(18,4),
    "current_stock" DECIMAL(18,4),

    -- Güncel fiyatlar
    "current_price_list_1" DECIMAL(18,4),
    "current_price_list_2" DECIMAL(18,4),
    "current_price_list_3" DECIMAL(18,4),
    "current_price_list_4" DECIMAL(18,4),
    "current_price_list_5" DECIMAL(18,4),
    "current_price_list_6" DECIMAL(18,4),
    "current_price_list_7" DECIMAL(18,4),
    "current_price_list_8" DECIMAL(18,4),
    "current_price_list_9" DECIMAL(18,4),
    "current_price_list_10" DECIMAL(18,4),

    -- Güncel kar marjları
    "current_margin_list_1" DECIMAL(10,4),
    "current_margin_list_2" DECIMAL(10,4),
    "current_margin_list_3" DECIMAL(10,4),
    "current_margin_list_4" DECIMAL(10,4),
    "current_margin_list_5" DECIMAL(10,4),
    "current_margin_list_6" DECIMAL(10,4),
    "current_margin_list_7" DECIMAL(10,4),
    "current_margin_list_8" DECIMAL(10,4),
    "current_margin_list_9" DECIMAL(10,4),
    "current_margin_list_10" DECIMAL(10,4),

    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "product_price_stats_last_change_date_idx" ON "product_price_stats"("last_change_date" DESC);
CREATE INDEX IF NOT EXISTS "product_price_stats_brand_idx" ON "product_price_stats"("brand");
CREATE INDEX IF NOT EXISTS "product_price_stats_days_since_last_change_idx" ON "product_price_stats"("days_since_last_change" DESC);
CREATE INDEX IF NOT EXISTS "product_price_stats_total_changes_idx" ON "product_price_stats"("total_changes" DESC);

-- Senkronizasyon durumunu takip eden tablo
CREATE TABLE IF NOT EXISTS "price_sync_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sync_type" TEXT NOT NULL, -- 'full' or 'incremental'
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "status" TEXT NOT NULL, -- 'running', 'completed', 'failed'
    "records_synced" INTEGER DEFAULT 0,
    "last_synced_date" TIMESTAMP(3), -- Son çekilen değişiklik tarihi
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "price_sync_log_status_idx" ON "price_sync_log"("status");
CREATE INDEX IF NOT EXISTS "price_sync_log_created_at_idx" ON "price_sync_log"("created_at" DESC);
