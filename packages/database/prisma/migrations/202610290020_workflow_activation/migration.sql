BEGIN;
SET LOCAL lock_timeout = '10s';
-- Additive: workflows that already receive events keep doing so (active defaults to true).
-- Drafts, versions, executions and IDs are not rewritten. The system SAIR flow is not a Workflow row.
ALTER TABLE "Workflow" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workflow" ADD COLUMN "activationError" JSONB;
ALTER TABLE "Workflow" ADD COLUMN "activeChangedAt" TIMESTAMP(3);
-- Optimistic concurrency of the on/off switch, separate from the draft revision (editing in
-- another tab must not conflict with toggling).
ALTER TABLE "Workflow" ADD COLUMN "activationRevision" INTEGER NOT NULL DEFAULT 1;
-- An activation error only exists while the workflow is inactive.
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_activation_error_check" CHECK ("activationError" IS NULL OR NOT "active");
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_activation_revision_check" CHECK ("activationRevision" > 0);
-- "Testar até este bloco": the history keeps which block was the target and whether it was reached.
ALTER TABLE "Simulation" ADD COLUMN "targetNodeId" TEXT;
ALTER TABLE "Simulation" ADD COLUMN "reachedTarget" BOOLEAN;
COMMIT;
