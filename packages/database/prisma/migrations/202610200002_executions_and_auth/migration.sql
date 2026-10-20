-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "user_id" TEXT;

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT PRIMARY KEY,
    "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "cpfCiphertext" TEXT NOT NULL,
    "cpfFingerprint" TEXT NOT NULL,
    "cpfLast4" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "User_organization_id_idx" ON "User"("organization_id");
CREATE INDEX "User_cpfFingerprint_idx" ON "User"("cpfFingerprint");

-- AlterTable Membership add FK
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL;
CREATE INDEX "Membership_user_id_idx" ON "Membership"("user_id");

-- CreateTable Session
CREATE TABLE "Session" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Session_user_id_expiresAt_idx" ON "Session"("user_id", "expiresAt");

-- CreateUniqueIndex for WorkflowVersion
CREATE UNIQUE INDEX "WorkflowVersion_id_organization_id_key" ON "WorkflowVersion"("id", "organization_id");

-- CreateTable Lead
CREATE TABLE "Lead" (
    "id" TEXT PRIMARY KEY,
    "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
    "workflow_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_workflow_fkey" FOREIGN KEY ("workflow_id", "organization_id") REFERENCES "Workflow"("id", "organization_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Lead_organization_id_workflow_id_event_key_key" ON "Lead"("organization_id", "workflow_id", "event_key");
CREATE INDEX "Lead_organization_id_createdAt_idx" ON "Lead"("organization_id", "createdAt");

-- CreateTable Execution
CREATE TABLE "Execution" (
    "id" TEXT PRIMARY KEY,
    "organization_id" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
    "workflow_id" TEXT NOT NULL,
    "version_id" TEXT,
    "lead_id" TEXT REFERENCES "Lead"("id") ON DELETE SET NULL,
    "event_key" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "errorCode" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "Execution_workflow_fkey" FOREIGN KEY ("workflow_id", "organization_id") REFERENCES "Workflow"("id", "organization_id") ON DELETE RESTRICT,
    CONSTRAINT "Execution_version_fkey" FOREIGN KEY ("version_id", "organization_id") REFERENCES "WorkflowVersion"("id", "organization_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Execution_organization_id_workflow_id_event_key_key" ON "Execution"("organization_id", "workflow_id", "event_key");
CREATE INDEX "Execution_organization_id_createdAt_idx" ON "Execution"("organization_id", "createdAt");
CREATE INDEX "Execution_workflow_id_status_idx" ON "Execution"("workflow_id", "status");

-- CreateTable ExecutionStep
CREATE TABLE "ExecutionStep" (
    "id" TEXT PRIMARY KEY,
    "execution_id" TEXT NOT NULL REFERENCES "Execution"("id") ON DELETE CASCADE,
    "node_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ExecutionStep_execution_id_createdAt_idx" ON "ExecutionStep"("execution_id", "createdAt");
