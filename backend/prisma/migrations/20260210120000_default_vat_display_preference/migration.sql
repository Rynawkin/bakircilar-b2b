ALTER TABLE "User" ALTER COLUMN "vatDisplayPreference" SET DEFAULT 'WITHOUT_VAT';

UPDATE "User"
SET "vatDisplayPreference" = 'WITHOUT_VAT'
WHERE "role" = 'CUSTOMER' AND "vatDisplayPreference" = 'WITH_VAT';
