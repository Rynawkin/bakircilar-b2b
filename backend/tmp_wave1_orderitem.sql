-- Wave 1 - OrderItem KDV alanlari (vatRate, vatZeroed)
-- Amac: beyaz/KDV-sifir satir bilgisi siparis guncellemelerinde kaybolmasin.
-- Idempotent: birden fazla kez calistirilabilir.
-- Uygulama: psql <DB> --single-transaction -f backend/tmp_wave1_orderitem.sql

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "vatZeroed" BOOLEAN NOT NULL DEFAULT false;
