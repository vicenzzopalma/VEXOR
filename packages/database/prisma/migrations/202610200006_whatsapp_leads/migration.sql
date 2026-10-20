ALTER TABLE "Lead" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '', ADD COLUMN "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "lastInboundAt" TIMESTAMP(3), ADD COLUMN "externalContactKey" TEXT;
CREATE UNIQUE INDEX "Lead_organization_id_workflow_id_externalContactKey_key" ON "Lead"("organization_id", "workflow_id", "externalContactKey");
ALTER TABLE "WhatsAppConnection" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;
