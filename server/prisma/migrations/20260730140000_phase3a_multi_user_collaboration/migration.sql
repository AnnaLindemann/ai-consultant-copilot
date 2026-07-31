-- Phase 3A — multi-user collaboration, workspace isolation, and access control
-- (architecture.md §7A; domain-model.md §3A; roadmap Phase 3A).
--
-- One migration carries the whole phase, from the last pre-Phase-3A schema to
-- the schema `prisma/schema.prisma` declares:
--
--   * the Workspace as the isolation boundary, and the consulting-domain User
--     that holds workspace membership and role — and never a password;
--   * the authentication provider's own table group (`AuthUser`, `AuthSession`,
--     `AuthAccount`, `AuthVerification`), created here in the shape Better Auth
--     expects, so no hand-rolled credential table ever exists to be migrated
--     off later;
--   * workspace ownership on the engagement-side tables, backfilled for the
--     rows earlier phases left behind;
--   * Discovery Access, staff invitations, notifications, and the append-only
--     Audit Trail.
--
-- Nothing here is destructive on any database the committed migration chain
-- produced: every statement either creates something new or adds a column to an
-- existing table. Pre-Phase-3A business data — organizations, engagements, and
-- analysis runs — is carried forward in place and adopted by the legacy
-- workspace seeded below.
--
-- The one case that is *not* additive is a database carrying the superseded
-- Phase 3A draft's hand-rolled auth tables. That draft was never released, so no
-- environment a deployment reaches can have them; a developer's own database
-- can. Those tables are refused rather than dropped on faith — see the guard.

-- ---------------------------------------------------------------------------
-- Guard: no superseded hand-rolled auth table is dropped while it holds data
-- ---------------------------------------------------------------------------
--
-- Authentication material belongs to whichever provider sits behind
-- `AuthenticationProvider` (architecture.md §7A.1), so the frozen architecture
-- asks for no migration of credentials, sessions, or verification values into
-- Better Auth: the hashes are of a different scheme and the consulting domain
-- is not allowed to read them. That makes these tables discardable *when they
-- are empty*, and only then. A row in one of them means somebody holds a
-- credential, a live session, or a pending reset, and a silent DROP would
-- destroy it without a trace.
--
-- So the guarantee is encoded rather than asserted in prose: the migration
-- aborts, naming the table and its row count, and Prisma rolls the whole
-- migration back — no table created, no column added, no row touched. The
-- operator then decides what those rows are worth and recovers deliberately:
--
--   1. export or delete the rows the message named;
--   2. `prisma migrate resolve --rolled-back 20260730140000_phase3a_multi_user_collaboration`
--      so Prisma's history records the attempt as rolled back;
--   3. `prisma migrate deploy` again — the now-empty tables are dropped and the
--      phase applies.
--
-- This runs first, before any other statement, so a refusal happens before
-- anything has been built.
DO $phase3a_guard$
DECLARE
  legacy_table TEXT;
  row_count BIGINT;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY[
    'AuthCredential',
    'EmailVerificationToken',
    'PasswordResetToken'
  ]
  LOOP
    IF to_regclass(format('public.%I', legacy_table)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', legacy_table) INTO row_count;

      IF row_count > 0 THEN
        RAISE EXCEPTION
          'Phase 3A refused: superseded auth table "%" still holds % row(s). Nothing has been changed. Export or delete those rows deliberately, then re-run the migration.',
          legacy_table, row_count;
      END IF;

      EXECUTE format('DROP TABLE public.%I', legacy_table);
    END IF;
  END LOOP;

  -- The superseded draft's session table carries the same name as the
  -- provider's, so it is recognized by its shape: the hand-rolled one stored a
  -- `tokenHash`, the provider's stores a `token`.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AuthSession'
      AND column_name = 'tokenHash'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public."AuthSession"' INTO row_count;

    IF row_count > 0 THEN
      RAISE EXCEPTION
        'Phase 3A refused: superseded auth table "AuthSession" still holds % row(s). Nothing has been changed. Export or delete those rows deliberately, then re-run the migration.',
        row_count;
    END IF;

    DROP TABLE public."AuthSession";
  END IF;
END
$phase3a_guard$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'CLIENT');

CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TYPE "DiscoveryAccessStatus" AS ENUM ('pending', 'active', 'revoked', 'expired');

-- ---------------------------------------------------------------------------
-- The isolation boundary and its members
-- ---------------------------------------------------------------------------

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "authUserId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The authentication provider's own table group (architecture.md §7A.1)
--
-- Created directly in the shape Better Auth expects. The consulting domain
-- never reads or writes these tables, and holds no password of its own.
-- ---------------------------------------------------------------------------

CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthVerification_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Collaboration: invitations, Discovery Access, notifications, Audit Trail
-- ---------------------------------------------------------------------------

CREATE TABLE "ClientInvitation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "engagementId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "ClientInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryAccess" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "status" "DiscoveryAccessStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditTrail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "engagementId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Adopting the rows earlier phases left behind
--
-- Engagements, organizations, and analysis runs created before this phase have
-- no workspace and no owner. They are attached to one seeded workspace and to a
-- placeholder administrator, which `POST /auth/bootstrap` then adopts as the
-- first real administrator — so the work carried over from earlier phases ends
-- the phase owned by a signed-in person rather than orphaned.
--
-- The placeholder is deliberately credential-free: it has no authentication
-- identity, so it cannot sign in, and bootstrap is what gives it one.
--
-- `ON CONFLICT DO NOTHING` keeps the seed idempotent on a database where a row
-- with these identifiers somehow already exists.
-- ---------------------------------------------------------------------------

INSERT INTO "Workspace" ("id", "createdAt", "updatedAt", "name")
VALUES ('legacy_workspace', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Legacy Workspace')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "User" (
  "id",
  "createdAt",
  "updatedAt",
  "workspaceId",
  "email",
  "displayName",
  "role",
  "emailVerifiedAt",
  "authUserId"
)
VALUES (
  'legacy_admin_user',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'legacy_workspace',
  'bootstrap@local',
  'Bootstrap Admin',
  'ADMIN',
  NULL,
  NULL
)
ON CONFLICT ("id") DO NOTHING;

-- The new columns are added with a default so existing rows are filled in one
-- pass; the default is then dropped, because every row created from here on
-- names its own workspace and owner.

ALTER TABLE "Organization"
  ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy_workspace';
ALTER TABLE "Organization"
  ALTER COLUMN "workspaceId" DROP DEFAULT;

ALTER TABLE "Engagement"
  ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy_workspace',
  ADD COLUMN "owningManagerId" TEXT NOT NULL DEFAULT 'legacy_admin_user';
ALTER TABLE "Engagement"
  ALTER COLUMN "workspaceId" DROP DEFAULT,
  ALTER COLUMN "owningManagerId" DROP DEFAULT;

ALTER TABLE "AnalysisRun"
  ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy_workspace';
ALTER TABLE "AnalysisRun"
  ALTER COLUMN "workspaceId" DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "Workspace_name_idx" ON "Workspace"("name");

CREATE INDEX "Workspace_createdAt_idx" ON "Workspace"("createdAt");

CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

CREATE INDEX "User_role_idx" ON "User"("role");

-- One account per address per workspace. The access side reads by this key to
-- decide whether an address already belongs to somebody — including whether it
-- belongs to an Administrator or Manager, which is what refuses a Discovery
-- Access grant to staff. A duplicate row would make that lookup answer about an
-- arbitrary one of two accounts.
CREATE UNIQUE INDEX "User_workspaceId_email_key" ON "User"("workspaceId", "email");

CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");

CREATE INDEX "AuthUser_email_idx" ON "AuthUser"("email");

CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");

CREATE INDEX "AuthVerification_expiresAt_idx" ON "AuthVerification"("expiresAt");

CREATE UNIQUE INDEX "ClientInvitation_tokenHash_key" ON "ClientInvitation"("tokenHash");

CREATE INDEX "ClientInvitation_workspaceId_idx" ON "ClientInvitation"("workspaceId");

CREATE INDEX "ClientInvitation_email_idx" ON "ClientInvitation"("email");

CREATE INDEX "ClientInvitation_engagementId_idx" ON "ClientInvitation"("engagementId");

CREATE INDEX "ClientInvitation_status_idx" ON "ClientInvitation"("status");

CREATE INDEX "DiscoveryAccess_workspaceId_idx" ON "DiscoveryAccess"("workspaceId");

CREATE INDEX "DiscoveryAccess_userId_idx" ON "DiscoveryAccess"("userId");

CREATE INDEX "DiscoveryAccess_engagementId_idx" ON "DiscoveryAccess"("engagementId");

CREATE INDEX "DiscoveryAccess_status_idx" ON "DiscoveryAccess"("status");

CREATE UNIQUE INDEX "DiscoveryAccess_engagementId_userId_key" ON "DiscoveryAccess"("engagementId", "userId");

CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");

CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

CREATE INDEX "Notification_engagementId_idx" ON "Notification"("engagementId");

CREATE INDEX "Notification_kind_idx" ON "Notification"("kind");

CREATE INDEX "AuditTrail_workspaceId_idx" ON "AuditTrail"("workspaceId");

CREATE INDEX "AuditTrail_userId_idx" ON "AuditTrail"("userId");

CREATE INDEX "AuditTrail_engagementId_idx" ON "AuditTrail"("engagementId");

CREATE INDEX "AuditTrail_eventType_idx" ON "AuditTrail"("eventType");

CREATE INDEX "AuditTrail_createdAt_idx" ON "AuditTrail"("createdAt");

CREATE INDEX "AnalysisRun_workspaceId_idx" ON "AnalysisRun"("workspaceId");

CREATE INDEX "Engagement_workspaceId_idx" ON "Engagement"("workspaceId");

CREATE INDEX "Engagement_owningManagerId_idx" ON "Engagement"("owningManagerId");

CREATE INDEX "Organization_workspaceId_idx" ON "Organization"("workspaceId");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_owningManagerId_fkey" FOREIGN KEY ("owningManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientInvitation" ADD CONSTRAINT "ClientInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientInvitation" ADD CONSTRAINT "ClientInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientInvitation" ADD CONSTRAINT "ClientInvitation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientInvitation" ADD CONSTRAINT "ClientInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoveryAccess" ADD CONSTRAINT "DiscoveryAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoveryAccess" ADD CONSTRAINT "DiscoveryAccess_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoveryAccess" ADD CONSTRAINT "DiscoveryAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoveryAccess" ADD CONSTRAINT "DiscoveryAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
