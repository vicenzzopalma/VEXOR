ALTER TABLE "Execution"
 ADD COLUMN "startedAt" TIMESTAMP(3),
 ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "leaseUntil" TIMESTAMP(3),
 ADD COLUMN "leaseToken" TEXT,
 ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
 ADD COLUMN "durationMs" INTEGER;
CREATE INDEX "Execution_pending_queue_idx" ON "Execution" ("availableAt", "createdAt") WHERE "status" = 'QUEUED';
CREATE INDEX "Execution_expired_lease_idx" ON "Execution" ("leaseUntil") WHERE "status" = 'RUNNING';
ALTER TABLE "Notification" ALTER COLUMN "status" SET DEFAULT 'PENDING';
-- Preserve historical logs: their prior DELIVERED values are not provider evidence.
