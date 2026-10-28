CREATE TABLE "OptOutConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "phoneKey" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "sourceOptOutId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "deliveryToken" TEXT,
  "errorCode" TEXT,
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OptOutConfirmation_status_check" CHECK ("status" IN ('PENDING','HELD','PROCESSING','SENT','FAILED'))
);
CREATE UNIQUE INDEX "OptOutConfirmation_organization_id_phoneKey_key" ON "OptOutConfirmation"("organization_id", "phoneKey");
CREATE INDEX "OptOutConfirmation_status_availableAt_idx" ON "OptOutConfirmation"("status", "availableAt");
-- No historical backfill: migration must not send messages for old requests.
CREATE TABLE "OptOutConfirmationActivation" (
  "id" TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptOutConfirmationActivation_singleton" CHECK ("id"='default')
);
