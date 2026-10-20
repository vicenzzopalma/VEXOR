
CREATE TABLE "Organization" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Membership" ("id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "Organization"("id"), "displayName" TEXT NOT NULL, "role" TEXT NOT NULL CHECK ("role" IN ('owner','editor','viewer')));
CREATE INDEX "Membership_organization_id_idx" ON "Membership"("organization_id");
CREATE TABLE "DevelopmentSession" ("tokenHash" TEXT PRIMARY KEY, "membershipId" TEXT NOT NULL REFERENCES "Membership"("id") ON DELETE CASCADE);
CREATE TABLE "Workflow" ("id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "Organization"("id"), "draft" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "Workflow_id_organization_id_key" ON "Workflow"("id", "organization_id");
CREATE TABLE "WorkflowVersion" ("id" TEXT PRIMARY KEY, "workflowId" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "number" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("workflowId", "organization_id") REFERENCES "Workflow"("id", "organization_id") ON DELETE CASCADE);
CREATE TABLE "Simulation" ("id" TEXT PRIMARY KEY, "workflowId" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "steps" JSONB NOT NULL, "status" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("workflowId", "organization_id") REFERENCES "Workflow"("id", "organization_id") ON DELETE CASCADE);
CREATE INDEX "Workflow_organization_id_updatedAt_idx" ON "Workflow"("organization_id", "updatedAt");
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_number_key" ON "WorkflowVersion"("workflowId", "number");
CREATE INDEX "Simulation_workflowId_createdAt_idx" ON "Simulation"("workflowId", "createdAt");
CREATE FUNCTION prevent_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published workflow versions are immutable'; END $$;
CREATE TRIGGER immutable_workflow_version BEFORE UPDATE ON "WorkflowVersion" FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
