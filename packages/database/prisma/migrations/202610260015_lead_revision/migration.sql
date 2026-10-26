BEGIN;
SET LOCAL lock_timeout = '10s';

-- Existing leads start at revision 1; no business data is rewritten or removed.
ALTER TABLE "Lead" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_revision_positive" CHECK ("revision" > 0);

-- The database owns the counter, including worker, raw SQL and no-op updates.
-- Ignore any client-supplied revision value on UPDATE to prevent counter resets.
CREATE FUNCTION increment_lead_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."revision" := OLD."revision" + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lead_revision_before_update
BEFORE UPDATE ON "Lead"
FOR EACH ROW EXECUTE FUNCTION increment_lead_revision();

COMMIT;
