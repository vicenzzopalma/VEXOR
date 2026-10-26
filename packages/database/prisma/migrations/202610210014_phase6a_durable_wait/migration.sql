-- Additive phase 6A. Previously applied migrations remain unchanged.
ALTER TYPE "ExecutionStatus" ADD VALUE 'SUSPENDED';
ALTER TABLE "Execution" ADD COLUMN "segmentAttempt" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Execution_id_organization_id_workflow_id_version_id_key"
  ON "Execution"("id", "organization_id", "workflow_id", "version_id");

CREATE TABLE "ExecutionCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "execution_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "nextNodeId" TEXT,
  "state" JSONB NOT NULL,
  "resumeAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resumedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "recoveryError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutionCheckpoint_execution_id_organization_id_workflow_id_fkey"
    FOREIGN KEY ("execution_id", "organization_id", "workflow_id", "version_id")
    REFERENCES "Execution"("id", "organization_id", "workflow_id", "version_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "checkpoint_status" CHECK ("status" IN ('WAITING','READY','CONSUMED','EXPIRED','FAILED')),
  CONSTRAINT "checkpoint_expiry" CHECK ("expiresAt" IS NULL OR "expiresAt" > "resumeAt")
);
CREATE INDEX "ExecutionCheckpoint_status_resumeAt_idx" ON "ExecutionCheckpoint"("status", "resumeAt");
CREATE INDEX "ExecutionCheckpoint_organization_id_execution_id_suspendedAt_idx"
 ON "ExecutionCheckpoint"("organization_id", "execution_id", "suspendedAt");
CREATE UNIQUE INDEX "ExecutionCheckpoint_one_active" ON "ExecutionCheckpoint"("execution_id") WHERE "status" IN ('WAITING','READY');

CREATE FUNCTION validate_execution_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status::text = 'QUEUED' AND NEW.status::text IN ('RUNNING','FAILED')) OR
    (OLD.status::text = 'RUNNING' AND NEW.status::text IN ('QUEUED','SUSPENDED','COMPLETED','FAILED')) OR
    (OLD.status::text = 'SUSPENDED' AND NEW.status::text IN ('QUEUED','FAILED'))
  ) THEN RAISE EXCEPTION 'INVALID_EXECUTION_TRANSITION'; END IF;
  IF EXISTS (SELECT 1 FROM "ExecutionCheckpoint" WHERE execution_id=OLD.id) AND
    (NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.workflow_id <> OLD.workflow_id OR NEW.organization_id <> OLD.organization_id)
  THEN RAISE EXCEPTION 'CHECKPOINT_VERSION_IS_PINNED'; END IF;
  IF NEW.status::text='SUSPENDED' AND (NEW."leaseToken" IS NOT NULL OR NEW."leaseUntil" IS NOT NULL)
  THEN RAISE EXCEPTION 'SUSPENDED_EXECUTION_CANNOT_HOLD_LEASE'; END IF;
  IF OLD.status::text='SUSPENDED' AND NEW.status::text='QUEUED' AND NOT EXISTS (
    SELECT 1 FROM "ExecutionCheckpoint" WHERE execution_id=NEW.id AND status='READY' AND "resumeAt" <= (NOW() AT TIME ZONE 'UTC')
  ) THEN RAISE EXCEPTION 'CHECKPOINT_NOT_READY'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER execution_transition BEFORE UPDATE ON "Execution" FOR EACH ROW EXECUTE FUNCTION validate_execution_transition();

CREATE FUNCTION validate_suspended_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Execution" e WHERE e.id=NEW.id AND e.status::text='SUSPENDED'
    AND NOT EXISTS (SELECT 1 FROM "ExecutionCheckpoint" c WHERE c.execution_id=e.id AND c.status='WAITING'))
  THEN RAISE EXCEPTION 'SUSPENSION_REQUIRES_CHECKPOINT'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER suspended_checkpoint AFTER INSERT OR UPDATE ON "Execution"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_suspended_checkpoint();
