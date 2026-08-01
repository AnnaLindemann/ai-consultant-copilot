-- Phase 5A follow-up: product-level origin metadata on Technology Profiles.
--
-- It answers "which official source does this profile's content come from?"
-- for content the product shipped, **without** fabricating approval history.
--
-- The two records stay strictly separate:
--
--   * "TechnologyUpdateHistory" remains reserved for approved curator changes.
--     Nothing here writes to it, and the seed still appends no entry to it.
--   * "origin" / "originSourceCodes" are the product's own declaration about
--     content it shipped. They claim no approval: a seeded profile's provenance
--     still carries a null proposal and a null applied-at.
--
-- The two are mutually exclusive at any moment. The curator's apply path sets
-- "origin" to 'curator' and clears "originSourceCodes", so from the first
-- approved change the append-only history is the single source of truth.
--
-- Additive and non-destructive: two columns with defaults, nothing dropped,
-- renamed, or rewritten.

CREATE TYPE "TechnologyProfileOrigin" AS ENUM ('product_seed', 'curator');

-- The default is the weaker claim deliberately: 'product_seed' asserts no
-- approval, so a row that somehow arrived without passing the curator can never
-- read as approved. Both writers — the seed and the apply path — set it
-- explicitly regardless.
ALTER TABLE "TechnologyProfile"
  ADD COLUMN "origin" "TechnologyProfileOrigin" NOT NULL DEFAULT 'product_seed';

ALTER TABLE "TechnologyProfile"
  ADD COLUMN "originSourceCodes" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Reading "which profiles has nobody approved yet?" is a governance question a
-- curator will actually ask, so it gets an index rather than a table scan.
CREATE INDEX "TechnologyProfile_origin_idx" ON "TechnologyProfile"("origin");
