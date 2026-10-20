-- Phase 5.2: Historical integrity for published workflow versions and workflows.
-- 1. Upgrade WorkflowVersion -> Workflow foreign key from CASCADE to RESTRICT to prevent accidental cascade deletion.
-- 2. Add archivedAt column to Workflow to allow logical archiving instead of physical deletion.
-- 3. Trigger protection: prevent UPDATE and DELETE on WorkflowVersion rows.
-- 4. Trigger protection: prevent TRUNCATE on WorkflowVersion table.
-- 5. Trigger protection: prevent DELETE on Workflow rows when published versions exist.
-- 6. Trigger protection: prevent TRUNCATE on Workflow table when published versions exist.

-- Alter foreign key constraint on WorkflowVersion
ALTER TABLE "WorkflowVersion" DROP CONSTRAINT "WorkflowVersion_workflowId_organization_id_fkey";
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_organization_id_fkey" 
  FOREIGN KEY ("workflowId", "organization_id") 
  REFERENCES "Workflow"("id", "organization_id") 
  ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Add archivedAt to Workflow for logical archiving
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Workflow_organization_id_archivedAt_idx" ON "Workflow"("organization_id", "archivedAt");

-- Enhance prevent_version_mutation() to block both UPDATE and DELETE on WorkflowVersion
CREATE OR REPLACE FUNCTION prevent_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Published workflow versions are immutable and cannot be updated';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Published workflow versions are immutable and cannot be deleted';
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS immutable_workflow_version ON "WorkflowVersion";
CREATE TRIGGER immutable_workflow_version
  BEFORE UPDATE OR DELETE ON "WorkflowVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_version_mutation();

-- Prevent TRUNCATE on WorkflowVersion
CREATE OR REPLACE FUNCTION prevent_version_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Published workflow versions cannot be truncated';
END;
$$;

DROP TRIGGER IF EXISTS immutable_workflow_version_truncate ON "WorkflowVersion";
CREATE TRIGGER immutable_workflow_version_truncate
  BEFORE TRUNCATE ON "WorkflowVersion"
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_version_truncate();

-- Prevent physical deletion of Workflow when published versions exist
CREATE OR REPLACE FUNCTION prevent_published_workflow_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "WorkflowVersion" 
        WHERE "workflowId" = OLD.id AND "organization_id" = OLD.organization_id
    ) THEN
        RAISE EXCEPTION 'Workflows with published versions cannot be deleted. Archive the workflow instead.';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_published_workflow_deletion ON "Workflow";
CREATE TRIGGER protect_published_workflow_deletion
  BEFORE DELETE ON "Workflow"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_workflow_deletion();

-- Prevent TRUNCATE on Workflow when published versions exist
CREATE OR REPLACE FUNCTION prevent_workflow_truncate_with_versions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "WorkflowVersion") THEN
        RAISE EXCEPTION 'Workflows table cannot be truncated while published versions exist';
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS protect_workflow_truncate ON "Workflow";
CREATE TRIGGER protect_workflow_truncate
  BEFORE TRUNCATE ON "Workflow"
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_workflow_truncate_with_versions();
