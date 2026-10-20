-- Add a tenant constraint without dropping the historical foreign key or deleting any records.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_connection_tenant_fkey"
 FOREIGN KEY ("connectionId", "organization_id") REFERENCES "WhatsAppConnection"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
