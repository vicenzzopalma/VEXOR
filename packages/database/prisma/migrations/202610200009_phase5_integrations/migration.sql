ALTER TABLE "Execution" ADD COLUMN "eventData" JSONB;
ALTER TABLE "WhatsAppEvent" ADD COLUMN "routing" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED',
 ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "errorCode" TEXT, ADD COLUMN "processedAt" TIMESTAMP(3);
CREATE INDEX "WhatsAppEvent_inbox_pending_idx" ON "WhatsAppEvent"("availableAt", "createdAt") WHERE "status"='PENDING';
CREATE TABLE "IntegrationConnection" (
 "id" TEXT NOT NULL PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "name" TEXT NOT NULL, "provider" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'DISCONNECTED', "settings" JSONB NOT NULL,
 "credentials" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false, "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "IntegrationConnection_id_organization_id_key" ON "IntegrationConnection"("id", "organization_id");
CREATE INDEX "IntegrationConnection_organization_id_createdAt_idx" ON "IntegrationConnection"("organization_id", "createdAt");
ALTER TABLE "Notification" ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "deliveryToken" TEXT, ADD COLUMN "integrationId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_integrationId_organization_id_fkey" FOREIGN KEY ("integrationId", "organization_id") REFERENCES "IntegrationConnection"("id", "organization_id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "Notification_integrationId_providerMessageId_key" ON "Notification"("integrationId", "providerMessageId");
CREATE TABLE "IntegrationOAuthAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY, "integrationId" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
 "stateHash" TEXT NOT NULL, "verifier" TEXT NOT NULL, "redirectUri" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "IntegrationOAuthAttempt_integrationId_organization_id_fkey" FOREIGN KEY ("integrationId", "organization_id") REFERENCES "IntegrationConnection"("id", "organization_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "IntegrationOAuthAttempt_stateHash_key" ON "IntegrationOAuthAttempt"("stateHash");
CREATE TABLE "WebhookRateBucket" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "WebhookIngressLog" (
 "id" TEXT NOT NULL PRIMARY KEY, "organization_id" TEXT REFERENCES "Organization"("id") ON DELETE SET NULL,
 "source" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "outcome" TEXT NOT NULL, "code" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WebhookIngressLog_organization_id_createdAt_idx" ON "WebhookIngressLog"("organization_id", "createdAt");
CREATE TABLE "IntegrationEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "integrationId" TEXT NOT NULL REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT,
 "providerEventId" TEXT NOT NULL, "providerMessageId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IntegrationEvent_integrationId_providerEventId_key" ON "IntegrationEvent"("integrationId", "providerEventId");
CREATE INDEX "IntegrationEvent_integrationId_providerMessageId_idx" ON "IntegrationEvent"("integrationId", "providerMessageId");
