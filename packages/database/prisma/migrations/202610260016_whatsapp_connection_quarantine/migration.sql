BEGIN;
SET LOCAL lock_timeout = '10s';

-- Quarantine is per connection: one restricted number must not block other numbers.
-- Additive only; no existing row is rewritten.
ALTER TABLE "WhatsAppConnection" ADD COLUMN "quarantinedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppConnection" ADD COLUMN "quarantineReason" TEXT;
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_quarantine_pair"
  CHECK (("quarantinedAt" IS NULL) = ("quarantineReason" IS NULL));

COMMIT;
