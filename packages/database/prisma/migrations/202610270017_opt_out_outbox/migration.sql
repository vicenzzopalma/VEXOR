BEGIN;
SET LOCAL lock_timeout = '10s';

-- Durable outbox of opt-out ("SAIR") requests. Additive only; no existing table is rewritten.
CREATE TABLE "OptOutEvent" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "connectionId" TEXT,
  "sourceEventId" TEXT,
  "eventKey" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL DEFAULT '',
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "deliveryToken" TEXT,
  "errorCode" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "ackStatus" TEXT,
  "resolvedByMembershipId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OptOutEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OptOutEvent_status_check" CHECK ("status" IN ('PENDING','PROCESSING','DELIVERED','FAILED','REVIEW','DISMISSED')),
  CONSTRAINT "OptOutEvent_classification_check" CHECK ("classification" IN ('OPT_OUT','AMBIGUOUS','MANUAL')),
  CONSTRAINT "OptOutEvent_phone_e164_check" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX "OptOutEvent_eventKey_key" ON "OptOutEvent"("eventKey");
CREATE INDEX "OptOutEvent_status_availableAt_idx" ON "OptOutEvent"("status", "availableAt");
CREATE INDEX "OptOutEvent_organization_id_createdAt_idx" ON "OptOutEvent"("organization_id", "createdAt");
CREATE INDEX "OptOutEvent_organization_id_phone_idx" ON "OptOutEvent"("organization_id", "phone");

ALTER TABLE "OptOutEvent" ADD CONSTRAINT "OptOutEvent_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
