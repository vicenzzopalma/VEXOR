BEGIN;
SET LOCAL lock_timeout = '10s';
-- Additive: a new table only. No existing table, version or execution is rewritten.
CREATE TABLE "ProvisioningRequest" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "execution_id" TEXT,
  "node_id" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "plan" JSONB NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "secrets" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "processingToken" TEXT,
  "processingAt" TIMESTAMP(3),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProvisioningRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProvisioningRequest_status_check" CHECK ("status" IN
    ('PENDING_APPROVAL','APPROVED','PROCESSING','COMPLETED','PARTIAL','FAILED','REJECTED'))
);
ALTER TABLE "ProvisioningRequest" ADD CONSTRAINT "ProvisioningRequest_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- One request per (execution, block): a retried segment never creates a second plan.
CREATE UNIQUE INDEX "ProvisioningRequest_execution_id_node_id_key" ON "ProvisioningRequest"("execution_id", "node_id");
CREATE INDEX "ProvisioningRequest_organization_id_createdAt_idx" ON "ProvisioningRequest"("organization_id", "createdAt");
CREATE INDEX "ProvisioningRequest_status_decidedAt_idx" ON "ProvisioningRequest"("status", "decidedAt");
COMMIT;
