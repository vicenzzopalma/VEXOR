CREATE TABLE "WhatsAppConnection" (
 "id" TEXT NOT NULL PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "name" TEXT NOT NULL, "provider" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'DISCONNECTED',
 "settings" JSONB NOT NULL, "credentials" TEXT, "lastError" TEXT, "checkedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WhatsAppConnection_id_organization_id_key" ON "WhatsAppConnection"("id", "organization_id");
CREATE INDEX "WhatsAppConnection_organization_id_createdAt_idx" ON "WhatsAppConnection"("organization_id", "createdAt");
CREATE TABLE "WhatsAppEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT,
 "providerEventId" TEXT NOT NULL, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WhatsAppEvent_connectionId_providerEventId_kind_key" ON "WhatsAppEvent"("connectionId", "providerEventId", "kind");
CREATE INDEX "WhatsAppEvent_connectionId_createdAt_idx" ON "WhatsAppEvent"("connectionId", "createdAt");
ALTER TABLE "Notification"
 ADD COLUMN "connectionId" TEXT REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT,
 ADD COLUMN "providerMessageId" TEXT, ADD COLUMN "nodeId" TEXT, ADD COLUMN "payload" JSONB,
 ADD COLUMN "processingAt" TIMESTAMP(3), ADD COLUMN "errorCode" TEXT, ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Notification_executionId_nodeId_key" ON "Notification"("execution_id", "nodeId");
CREATE UNIQUE INDEX "Notification_connectionId_providerMessageId_key" ON "Notification"("connectionId", "providerMessageId");
CREATE INDEX "Notification_outbox_pending_idx" ON "Notification"("createdAt") WHERE "status"='PENDING' AND "channel"='WHATSAPP';
-- Historical records stay intact; old delivery claims have no provider confirmation.
UPDATE "Notification" SET "status"='AVAILABLE' WHERE "channel" IN ('INTERNAL','MANAGER_NOTIFICATION') AND "status"='DELIVERED';
UPDATE "Notification" SET "status"='UNVERIFIED' WHERE "channel"='EMAIL' AND "status"='DELIVERED';
