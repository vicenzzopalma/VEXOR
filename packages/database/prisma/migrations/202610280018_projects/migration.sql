-- Additive: workflow IDs, drafts, versions and history are never rewritten.
CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "icon" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Project_name_check" CHECK (
    length("name") BETWEEN 1 AND 100 AND "normalizedName" = lower(btrim(regexp_replace(normalize("name", NFKC), '\s+', ' ', 'g')))
  ),
  CONSTRAINT "Project_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "Project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "Project_organization_id_normalizedName_key" ON "Project"("organization_id", "normalizedName");
CREATE UNIQUE INDEX "Project_id_organization_id_key" ON "Project"("id", "organization_id");
CREATE INDEX "Project_organization_id_updatedAt_idx" ON "Project"("organization_id", "updatedAt");

INSERT INTO "Project" ("id", "organization_id", "name", "normalizedName", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Geral', 'geral', CURRENT_TIMESTAMP FROM "Organization";
ALTER TABLE "Workflow" ADD COLUMN "project_id" TEXT;
UPDATE "Workflow" w SET "project_id" = p."id" FROM "Project" p WHERE p."organization_id" = w."organization_id" AND p."normalizedName" = 'geral';

-- Compatibility for existing workers, fixture writers and registration: omitted project
-- resolves inside the same organization. Explicit cross-tenant IDs fail the composite FK.
CREATE FUNCTION workflow_default_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."project_id" IS NULL THEN
    INSERT INTO "Project" ("id", "organization_id", "name", "normalizedName", "updatedAt")
    VALUES (gen_random_uuid()::text, NEW."organization_id", 'Geral', 'geral', CURRENT_TIMESTAMP)
    ON CONFLICT ("organization_id", "normalizedName") DO NOTHING;
    SELECT "id" INTO NEW."project_id" FROM "Project" WHERE "organization_id" = NEW."organization_id" AND "normalizedName" = 'geral';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Workflow_default_project" BEFORE INSERT ON "Workflow" FOR EACH ROW EXECUTE FUNCTION workflow_default_project();
ALTER TABLE "Workflow" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "Project"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX "Workflow_project_id_updatedAt_idx" ON "Workflow"("project_id", "updatedAt");
