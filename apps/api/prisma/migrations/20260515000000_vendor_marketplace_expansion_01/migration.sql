-- VENDOR-MARKETPLACE-EXPANSION-01: Two-layer vendor category taxonomy
-- Applied: 2026-05-17
-- Scope:
--   1. Expand VendorCategory enum with 33 new values (total 41)
--   2. Add modeAffinities[] and isPublicVisible to vendor_category_lookup
--   3. Add vendorCategoryId FK to vendors
--   4. Create vendor_tags table (Layer 2)
--   5. Create vendor_tags_to_vendors join table (M2M)
--   6. Create tag_merge_audit_log table
--   7. Seed all 41 categories with mode-affinity flags
--   8. Backfill vendorCategoryId for existing vendors

-- ─── 1. Expand VendorCategory enum ──────────────────────────────────────────
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'WEDDING_CAKES';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BAR_BEVERAGE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'CONFERENCE_AV';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'PRE_WEDDING';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'MC_EMCEE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'ASO_EBI';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BRIDAL_JEWELLERY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'USHERS_HOSTESSES';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'EVENT_SECURITY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'EVENT_COORDINATION';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BRANDING_SIGNAGE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'SOUVENIR_SOURCING';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'SET_DESIGN';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'CHILDRENS_PARTY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'CLEANING_HOUSEKEEPING';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'PROPERTY_MAINTENANCE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'LAUNDRY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'PROPERTY_SECURITY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'INTERIOR_DESIGN';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'LISTING_PHOTOGRAPHY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'LOCAL_TRANSPORT';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'AIRPORT_PICKUP';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'IN_PROPERTY_CATERING';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'CONCIERGE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'TOUR_GUIDES';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BOAT_CHARTER';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'EQUIPMENT_RENTAL';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'TOURISM_TRANSPORT';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'WELLNESS_SPA';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'CULTURAL_WORKSHOPS';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'ADVENTURE_ACTIVITIES';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'SUB_GUIDES';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'TRAVEL_DOCUMENTATION';

-- ─── 2. Alter vendor_category_lookup ────────────────────────────────────────
ALTER TABLE "vendor_category_lookup"
  ADD COLUMN IF NOT EXISTS "modeAffinities" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "isPublicVisible" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "vendor_category_lookup_isPublicVisible_idx"
  ON "vendor_category_lookup"("isPublicVisible");

-- ─── 3. Add vendorCategoryId FK to vendors ──────────────────────────────────
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "vendorCategoryId" UUID REFERENCES "vendor_category_lookup"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "vendors_vendorCategoryId_idx"
  ON "vendors"("vendorCategoryId");

-- ─── 4. Create vendor_tags table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vendor_tags" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "label"       TEXT        NOT NULL,
  "normalised"  TEXT        NOT NULL,
  "usageCount"  INTEGER     NOT NULL DEFAULT 0,
  "isRetired"   BOOLEAN     NOT NULL DEFAULT FALSE,
  "canonicalId" UUID,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vendor_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_tags_normalised_key" UNIQUE ("normalised")
);

CREATE INDEX IF NOT EXISTS "vendor_tags_isRetired_idx"   ON "vendor_tags"("isRetired");
CREATE INDEX IF NOT EXISTS "vendor_tags_usageCount_idx"  ON "vendor_tags"("usageCount");

-- ─── 5. Create M2M join table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_VendorToVendorTag" (
  "A" UUID NOT NULL REFERENCES "vendors"("id")      ON DELETE CASCADE,
  "B" UUID NOT NULL REFERENCES "vendor_tags"("id")  ON DELETE CASCADE,
  CONSTRAINT "_VendorToVendorTag_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX IF NOT EXISTS "_VendorToVendorTag_B_idx" ON "_VendorToVendorTag"("B");

-- ─── 6. Create tag_merge_audit_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tag_merge_audit_log" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "retiredTagId"    UUID        NOT NULL,
  "retiredLabel"    TEXT        NOT NULL,
  "canonicalTagId"  UUID        NOT NULL,
  "canonicalLabel"  TEXT        NOT NULL,
  "vendorsMigrated" INTEGER     NOT NULL DEFAULT 0,
  "performedBy"     UUID        NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "tag_merge_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tag_merge_audit_log_canonicalTagId_idx"
  ON "tag_merge_audit_log"("canonicalTagId");

-- ─── 7. Seed all 41 categories with mode-affinity flags ─────────────────────
INSERT INTO "vendor_category_lookup" ("key", "label", "description", "modeAffinities", "sortOrder")
VALUES
  -- Events (21 categories)
  ('VENUE',               'Venue',                    'Event venues and spaces',                    ARRAY['EVENTS'],                       1),
  ('CATERING',            'Catering',                 'Food and catering services',                  ARRAY['EVENTS'],                       2),
  ('WEDDING_CAKES',       'Wedding Cakes',            'Wedding and celebration cakes',               ARRAY['EVENTS'],                       3),
  ('BAR_BEVERAGE',        'Bar & Beverage',           'Bar setup and beverage services',             ARRAY['EVENTS'],                       4),
  ('AV_PRODUCTION',       'AV & Production',          'Audio-visual and stage production',           ARRAY['EVENTS'],                       5),
  ('CONFERENCE_AV',       'Conference AV',            'Conference and corporate AV services',        ARRAY['EVENTS'],                       6),
  ('PHOTOGRAPHY_VIDEO',   'Photography & Video',      'Event photography and videography',           ARRAY['EVENTS', 'STAYS'],              7),
  ('PRE_WEDDING',         'Pre-Wedding',              'Pre-wedding shoots and services',             ARRAY['EVENTS'],                       8),
  ('DECOR_FLORALS',       'Décor & Florals',          'Event decoration and floral arrangements',    ARRAY['EVENTS'],                       9),
  ('ENTERTAINMENT',       'Entertainment',            'Live entertainment and performers',            ARRAY['EVENTS', 'EXPERIENCES'],       10),
  ('MC_EMCEE',            'MC / Emcee',               'Master of ceremonies',                        ARRAY['EVENTS'],                      11),
  ('MAKEUP_ARTIST',       'Makeup Artist',            'Professional makeup and styling',             ARRAY['EVENTS'],                      12),
  ('SPEAKER',             'Speaker',                  'Keynote and event speakers',                  ARRAY['EVENTS'],                      13),
  ('ASO_EBI',             'Aso-Ebi',                  'Fabric and aso-ebi coordination',             ARRAY['EVENTS'],                      14),
  ('BRIDAL_JEWELLERY',    'Bridal Jewellery',         'Bridal jewellery and accessories',            ARRAY['EVENTS'],                      15),
  ('USHERS_HOSTESSES',    'Ushers & Hostesses',       'Event ushers and hostesses',                  ARRAY['EVENTS'],                      16),
  ('EVENT_SECURITY',      'Event Security',           'Security services for events',                ARRAY['EVENTS'],                      17),
  ('EVENT_COORDINATION',  'Event Coordination',       'Full event planning and coordination',        ARRAY['EVENTS'],                      18),
  ('BRANDING_SIGNAGE',    'Branding & Signage',       'Event branding, banners and signage',         ARRAY['EVENTS'],                      19),
  ('SOUVENIR_SOURCING',   'Souvenir Sourcing',        'Event souvenirs and gifts',                   ARRAY['EVENTS'],                      20),
  ('SET_DESIGN',          'Set Design',               'Stage and set design services',               ARRAY['EVENTS'],                      21),
  ('CHILDRENS_PARTY',     'Children''s Party',        'Children''s party entertainment',             ARRAY['EVENTS'],                      22),
  -- Stays (10 categories)
  ('CLEANING_HOUSEKEEPING','Cleaning & Housekeeping', 'Property cleaning and housekeeping',          ARRAY['STAYS'],                       23),
  ('PROPERTY_MAINTENANCE', 'Property Maintenance',   'Property repair and maintenance',             ARRAY['STAYS'],                       24),
  ('LAUNDRY',             'Laundry',                  'Laundry and linen services',                  ARRAY['STAYS'],                       25),
  ('PROPERTY_SECURITY',   'Property Security',        'Security services for properties',            ARRAY['STAYS'],                       26),
  ('INTERIOR_DESIGN',     'Interior Design',          'Interior design and staging',                 ARRAY['STAYS'],                       27),
  ('LISTING_PHOTOGRAPHY', 'Listing Photography',      'Property listing photography',                ARRAY['STAYS'],                       28),
  ('LOCAL_TRANSPORT',     'Local Transport',          'Local transport and driver services',         ARRAY['STAYS', 'EXPERIENCES'],        29),
  ('AIRPORT_PICKUP',      'Airport Pickup',           'Airport transfer services',                   ARRAY['STAYS', 'EXPERIENCES'],        30),
  ('IN_PROPERTY_CATERING','In-Property Catering',    'Private chef and in-property catering',       ARRAY['STAYS'],                       31),
  ('CONCIERGE',           'Concierge',                'Concierge and guest services',                ARRAY['STAYS', 'EXPERIENCES'],        32),
  -- Experiences (9 categories)
  ('TOUR_GUIDES',         'Tour Guides',              'Local tour guides',                           ARRAY['EXPERIENCES'],                 33),
  ('BOAT_CHARTER',        'Boat Charter',             'Boat and yacht charter services',             ARRAY['EXPERIENCES'],                 34),
  ('EQUIPMENT_RENTAL',    'Equipment Rental',         'Activity equipment rental',                   ARRAY['EXPERIENCES'],                 35),
  ('TOURISM_TRANSPORT',   'Tourism Transport',        'Transport for tourism activities',            ARRAY['EXPERIENCES'],                 36),
  ('WELLNESS_SPA',        'Wellness & Spa',           'Wellness, spa and massage services',          ARRAY['EXPERIENCES'],                 37),
  ('CULTURAL_WORKSHOPS',  'Cultural Workshops',       'Cultural and craft workshops',                ARRAY['EXPERIENCES'],                 38),
  ('ADVENTURE_ACTIVITIES','Adventure Activities',     'Adventure and outdoor activities',            ARRAY['EXPERIENCES'],                 39),
  ('SUB_GUIDES',          'Sub-Guides',               'Specialist sub-guides and assistants',        ARRAY['EXPERIENCES'],                 40),
  ('TRAVEL_DOCUMENTATION','Travel Documentation',    'Visa and travel documentation assistance',    ARRAY['EXPERIENCES'],                 41)
ON CONFLICT ("key") DO UPDATE SET
  "label"          = EXCLUDED."label",
  "description"    = EXCLUDED."description",
  "modeAffinities" = EXCLUDED."modeAffinities",
  "sortOrder"      = EXCLUDED."sortOrder";

-- ─── 8. Backfill vendorCategoryId for existing vendors ──────────────────────
UPDATE "vendors" v
SET "vendorCategoryId" = (
  SELECT cl."id"
  FROM "vendor_category_lookup" cl
  WHERE cl."key" = v."category"::TEXT
  LIMIT 1
)
WHERE v."vendorCategoryId" IS NULL;
