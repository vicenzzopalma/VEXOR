-- Resolve table-specific trigger fields only inside their table branch.
-- Preserve applied history; metadata-only replacement, no row changes.
BEGIN;
CREATE OR REPLACE FUNCTION enforce_commercial_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Lead' THEN
    IF NEW.assigned_membership_id IS NOT NULL THEN
    PERFORM 1 FROM "Membership" WHERE id=NEW.assigned_membership_id AND organization_id=NEW.organization_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commercial tenant link rejected' USING ERRCODE='23503'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='Execution' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM 1 FROM "Lead" WHERE id=NEW.lead_id AND organization_id=NEW.organization_id AND workflow_id=NEW.workflow_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Execution lead scope rejected' USING ERRCODE='23503'; END IF;
    END IF;
    IF NEW.version_id IS NOT NULL THEN
      PERFORM 1 FROM "WorkflowVersion" WHERE id=NEW.version_id AND organization_id=NEW.organization_id AND "workflowId"=NEW.workflow_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Execution version scope rejected' USING ERRCODE='23503'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='Notification' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM 1 FROM "Lead" WHERE id=NEW.lead_id AND organization_id=NEW.organization_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Notification lead scope rejected' USING ERRCODE='23503'; END IF;
    END IF;
    IF NEW.execution_id IS NOT NULL THEN
      PERFORM 1 FROM "Execution" WHERE id=NEW.execution_id AND organization_id=NEW.organization_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Notification execution scope rejected' USING ERRCODE='23503'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
