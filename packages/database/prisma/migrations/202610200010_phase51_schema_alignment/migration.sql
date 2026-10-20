-- Metadata-only alignment. No rows are deleted, rewritten or truncated.
-- Keep NO ACTION on PK updates: IDs/tenant IDs must not cascade across existing links.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='"Notification"'::regclass AND conname='Notification_connection_tenant_fkey'
      AND contype='f' AND convalidated
      AND confrelid='"WhatsAppConnection"'::regclass
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='"Notification"'::regclass AND attname='connectionId'),
                       (SELECT attnum FROM pg_attribute WHERE attrelid='"Notification"'::regclass AND attname='organization_id')]::smallint[]
      AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='"WhatsAppConnection"'::regclass AND attname='id'),
                        (SELECT attnum FROM pg_attribute WHERE attrelid='"WhatsAppConnection"'::regclass AND attname='organization_id')]::smallint[]
      AND confdeltype='r' AND confupdtype='a') THEN
    RAISE EXCEPTION 'Validated tenant FK must exist before redundant FK removal';
  END IF;
END $$;
-- The validated composite FK remains and enforces the same connection plus tenant.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_connectionId_fkey";
ALTER TABLE "Lead" RENAME CONSTRAINT "Lead_workflow_fkey" TO "Lead_workflow_id_organization_id_fkey";
ALTER TABLE "Execution" RENAME CONSTRAINT "Execution_workflow_fkey" TO "Execution_workflow_id_organization_id_fkey";
ALTER TABLE "Execution" RENAME CONSTRAINT "Execution_version_fkey" TO "Execution_version_id_organization_id_fkey";
-- Every new notification must explicitly declare its channel. Existing values are preserved.
ALTER TABLE "Notification" ALTER COLUMN "channel" DROP DEFAULT;
COMMIT;
