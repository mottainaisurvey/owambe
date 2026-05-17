-- VENDOR-MARKETPLACE-EXPANSION-01 Rollback Migration
-- Reverts all schema changes introduced by vendor_marketplace_expansion_01.sql
-- Safe to run on staging; does NOT delete vendor rows, only removes new columns/tables.
-- Run order: FK constraints first, then columns, then tables, then enum values.

-- Step 1: Remove FK from vendors → vendor_category_lookup
ALTER TABLE vendors DROP COLUMN IF EXISTS "vendorCategoryId";

-- Step 2: Drop M2M join table (vendor ↔ vendor_tags)
DROP TABLE IF EXISTS "_VendorToVendorTag";

-- Step 3: Drop tag_merge_audit_log
DROP TABLE IF EXISTS "tag_merge_audit_log";

-- Step 4: Drop vendor_tags
DROP TABLE IF EXISTS "vendor_tags";

-- Step 5: Remove new columns from vendor_category_lookup
ALTER TABLE vendor_category_lookup DROP COLUMN IF EXISTS "modeAffinities";
ALTER TABLE vendor_category_lookup DROP COLUMN IF EXISTS "isPublicVisible";

-- Step 6: Truncate the 41-category seed rows (restore to pre-expansion empty state)
-- NOTE: This removes ALL vendor_category_lookup rows. If the table had pre-existing rows
-- before the expansion, restore them from a backup before running this step.
TRUNCATE TABLE vendor_category_lookup;

-- Step 7: Remove new VendorCategory enum values (Postgres requires recreating the type)
-- This step is ADVISORY — Postgres does not support DROP VALUE on enums.
-- If the enum rollback is required, use the following approach:
--   1. ALTER TABLE vendors ALTER COLUMN category TYPE TEXT;
--   2. DROP TYPE "VendorCategory";
--   3. CREATE TYPE "VendorCategory" AS ENUM ('VENUE','CATERING','AV_PRODUCTION',
--        'PHOTOGRAPHY_VIDEO','DECOR_FLORALS','ENTERTAINMENT','MAKEUP_ARTIST','SPEAKER');
--   4. ALTER TABLE vendors ALTER COLUMN category TYPE "VendorCategory"
--        USING category::"VendorCategory";
-- This step is not executed automatically to avoid data loss on vendors with new enum values.
-- Uncomment and run manually if full enum rollback is required:

-- ALTER TABLE vendors ALTER COLUMN category TYPE TEXT;
-- DROP TYPE IF EXISTS "VendorCategory";
-- CREATE TYPE "VendorCategory" AS ENUM (
--   'VENUE', 'CATERING', 'AV_PRODUCTION', 'PHOTOGRAPHY_VIDEO',
--   'DECOR_FLORALS', 'ENTERTAINMENT', 'MAKEUP_ARTIST', 'SPEAKER'
-- );
-- ALTER TABLE vendors ALTER COLUMN category TYPE "VendorCategory"
--   USING category::"VendorCategory";
