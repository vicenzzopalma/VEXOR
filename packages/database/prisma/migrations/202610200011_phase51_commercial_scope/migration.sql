-- Extend the existing single-column FKs with tenant/workflow invariants.
-- Keep their SET NULL/CASCADE semantics; no existing row is rewritten or removed.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Membership", "Lead", "Execution", "Notification", "WorkflowVersion" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Lead" l JOIN "Membership" m ON m.id=l.assigned_membership_id WHERE m.organization_id<>l.organization_id)
    OR EXISTS (SELECT 1 FROM "Execution" e JOIN "Lead" l ON l.id=e.lead_id WHERE l.organization_id<>e.organization_id OR l.workflow_id<>e.workflow_id)
    OR EXISTS (SELECT 1 FROM "Execution" e JOIN "WorkflowVersion" v ON v.id=e.version_id WHERE v."workflowId"<>e.workflow_id OR v.organization_id<>e.organization_id)
    OR EXISTS (SELECT 1 FROM "Notification" n JOIN "Lead" l ON l.id=n.lead_id WHERE l.organization_id<>n.organization_id)
    OR EXISTS (SELECT 1 FROM "Notification" n JOIN "Execution" e ON e.id=n.execution_id WHERE e.organization_id<>n.organization_id)
  THEN RAISE EXCEPTION 'Existing commercial scope mismatch requires review; no data changed'; END IF;
END $$;
CREATE FUNCTION enforce_commercial_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Lead' AND NEW.assigned_membership_id IS NOT NULL THEN
    PERFORM 1 FROM "Membership" WHERE id=NEW.assigned_membership_id AND organization_id=NEW.organization_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commercial tenant link rejected' USING ERRCODE='23503'; END IF;
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
CREATE FUNCTION prevent_commercial_scope_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR (TG_TABLE_NAME IN ('Lead','Execution') AND to_jsonb(NEW)->>'workflow_id' IS DISTINCT FROM to_jsonb(OLD)->>'workflow_id')
  THEN RAISE EXCEPTION 'Commercial scope is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commercial_lead_scope BEFORE INSERT OR UPDATE OF organization_id, workflow_id, assigned_membership_id ON "Lead" FOR EACH ROW EXECUTE FUNCTION enforce_commercial_scope();
CREATE TRIGGER commercial_execution_scope BEFORE INSERT OR UPDATE OF organization_id, workflow_id, lead_id, version_id ON "Execution" FOR EACH ROW EXECUTE FUNCTION enforce_commercial_scope();
CREATE TRIGGER commercial_notification_scope BEFORE INSERT OR UPDATE OF organization_id, lead_id, execution_id ON "Notification" FOR EACH ROW EXECUTE FUNCTION enforce_commercial_scope();
CREATE TRIGGER immutable_lead_scope BEFORE UPDATE OF organization_id, workflow_id ON "Lead" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
CREATE TRIGGER immutable_execution_scope BEFORE UPDATE OF organization_id, workflow_id ON "Execution" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
CREATE TRIGGER immutable_membership_scope BEFORE UPDATE OF organization_id ON "Membership" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
CREATE TRIGGER immutable_notification_scope BEFORE UPDATE OF organization_id ON "Notification" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
CREATE TRIGGER immutable_whatsapp_scope BEFORE UPDATE OF organization_id ON "WhatsAppConnection" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
CREATE TRIGGER immutable_integration_scope BEFORE UPDATE OF organization_id ON "IntegrationConnection" FOR EACH ROW EXECUTE FUNCTION prevent_commercial_scope_move();
COMMIT;
