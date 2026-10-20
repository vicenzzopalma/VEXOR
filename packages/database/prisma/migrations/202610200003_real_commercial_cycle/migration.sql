-- AlterTable Lead
ALTER TABLE "Lead" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Lead sem nome';
ALTER TABLE "Lead" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "company" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "budget" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE "Lead" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "Lead" ADD COLUMN "assigned_membership_id" TEXT;
ALTER TABLE "Lead" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Lead" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "Membership"("id") ON DELETE SET NULL;
CREATE INDEX "Lead_organization_id_status_idx" ON "Lead"("organization_id", "status");
CREATE INDEX "Lead_assigned_membership_id_idx" ON "Lead"("assigned_membership_id");

-- CreateTable Notification
CREATE TABLE "Notification" (
    "id" TEXT PRIMARY KEY,
    "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "lead_id" TEXT REFERENCES "Lead"("id") ON DELETE SET NULL,
    "execution_id" TEXT REFERENCES "Execution"("id") ON DELETE SET NULL,
    "channel" TEXT NOT NULL DEFAULT 'MANAGER_NOTIFICATION',
    "recipient" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Notification_organization_id_createdAt_idx" ON "Notification"("organization_id", "createdAt");
CREATE INDEX "Notification_lead_id_idx" ON "Notification"("lead_id");
