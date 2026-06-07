/**
 * VENDOR-MARKETPLACE-EXPANSION-01: Vendor Tag Service
 *
 * Implements the two-layer vendor category taxonomy:
 *   Layer 1 — Admin-managed VendorCategoryLookup (41 categories with modeAffinities)
 *   Layer 2 — Vendor-supplied free-form tags (normalised, deduplicated, mergeable)
 *
 * AC coverage:
 *   AC-3  normaliseTag()
 *   AC-4  addTagToVendor(), removeTagFromVendor()
 *   AC-5  mergeTag() + TagMergeAuditLog
 *   AC-6  getVendorsByMode() — supply-density N≥3 filter
 *   AC-7  getVendorsByMode() — mode-affinity grouping
 *   AC-9  getVendorsByMode() — tag-aware filtering
 *   AC-10 toggleCategoryVisibility()
 */

import { prisma } from '../database/client';
import { logger } from '../utils/logger';

// ─── Tag normalisation ────────────────────────────────────────────────────────

/**
 * Normalise a vendor-supplied tag label to its canonical form:
 *   - lowercase
 *   - trim leading/trailing whitespace
 *   - collapse internal whitespace to single space
 *   - remove non-alphanumeric characters except spaces and hyphens
 */
export function normaliseTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 \-]/g, '');
}

// ─── Add tag to vendor ────────────────────────────────────────────────────────

export async function addTagToVendor(
  vendorId: string,
  rawLabel: string,
): Promise<{ tag: any; isNew: boolean }> {
  const normalised = normaliseTag(rawLabel);
  if (!normalised) throw new Error('Tag label is empty after normalisation');

  // Upsert the tag (create if not exists, return existing if it does)
  // Note: usageCount is managed explicitly below, not in the upsert
  const tag = await prisma.vendorTag.upsert({
    where: { normalised },
    create: { label: rawLabel.trim(), normalised, usageCount: 0 },
    update: {},
  });

  // Check if this vendor already has this tag
  const existing = await prisma.vendor.findFirst({
    where: {
      id: vendorId,
      tags: { some: { id: tag.id } },
    },
    select: { id: true },
  });

  if (existing) {
    return { tag, isNew: false };
  }

  // Connect the tag to the vendor and increment usageCount
  const [, updatedTag] = await prisma.$transaction([
    prisma.vendor.update({
      where: { id: vendorId },
      data: { tags: { connect: { id: tag.id } } },
    }),
    prisma.vendorTag.update({
      where: { id: tag.id },
      data: { usageCount: { increment: 1 } },
    }),
  ]);
  Object.assign(tag, updatedTag);

  logger.info(`Tag "${normalised}" added to vendor ${vendorId}`);
  return { tag, isNew: true };
}

// ─── Remove tag from vendor ───────────────────────────────────────────────────

export async function removeTagFromVendor(
  vendorId: string,
  tagId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.vendor.update({
      where: { id: vendorId },
      data: { tags: { disconnect: { id: tagId } } },
    }),
    prisma.vendorTag.update({
      where: { id: tagId },
      data: { usageCount: { decrement: 1 } },
    }),
  ]);
  logger.info(`Tag ${tagId} removed from vendor ${vendorId}`);
}

// ─── Merge tags (admin) ───────────────────────────────────────────────────────

/**
 * Merge retiredTagId into canonicalTagId:
 *   1. Move all vendor associations from retired → canonical
 *   2. Mark retired tag as isRetired=true, canonicalId=canonicalTagId
 *   3. Update usageCount on canonical
 *   4. Write TagMergeAuditLog row
 */
export async function mergeTag(
  retiredTagId: string,
  canonicalTagId: string,
  performedByUserId: string,
): Promise<{ vendorsMigrated: number }> {
  if (retiredTagId === canonicalTagId) {
    throw new Error('Cannot merge a tag into itself');
  }

  const [retiredTag, canonicalTag] = await Promise.all([
    prisma.vendorTag.findUniqueOrThrow({ where: { id: retiredTagId }, include: { vendors: { select: { id: true } } } }),
    prisma.vendorTag.findUniqueOrThrow({ where: { id: canonicalTagId } }),
  ]);

  if (retiredTag.isRetired) {
    throw new Error(`Tag "${retiredTag.label}" is already retired`);
  }

  const vendorIds = retiredTag.vendors.map((v) => v.id);
  const vendorsMigrated = vendorIds.length;

  await prisma.$transaction([
    // Move all vendor associations to canonical tag
    ...vendorIds.map((vid) =>
      prisma.vendor.update({
        where: { id: vid },
        data: {
          tags: {
            disconnect: { id: retiredTagId },
            connect: { id: canonicalTagId },
          },
        },
      }),
    ),
    // Mark retired tag
    prisma.vendorTag.update({
      where: { id: retiredTagId },
      data: { isRetired: true, canonicalId: canonicalTagId, usageCount: 0 },
    }),
    // Update canonical usageCount
    prisma.vendorTag.update({
      where: { id: canonicalTagId },
      data: { usageCount: { increment: vendorsMigrated } },
    }),
    // Write audit log
    prisma.tagMergeAuditLog.create({
      data: {
        retiredTagId,
        retiredLabel: retiredTag.label,
        canonicalTagId,
        canonicalLabel: canonicalTag.label,
        vendorsMigrated,
        performedBy: performedByUserId,
      },
    }),
  ]);

  logger.info(
    `Tag merge: "${retiredTag.label}" → "${canonicalTag.label}" (${vendorsMigrated} vendors migrated) by ${performedByUserId}`,
  );

  return { vendorsMigrated };
}

// ─── Toggle category visibility ───────────────────────────────────────────────

export async function toggleCategoryVisibility(
  categoryId: string,
  isPublicVisible: boolean,
): Promise<any> {
  const category = await prisma.vendorCategoryLookup.update({
    where: { id: categoryId },
    data: { isPublicVisible },
  });
  logger.info(`Category ${category.key} visibility set to ${isPublicVisible}`);
  return category;
}

// ─── Consumer discovery: mode-affinity grouping + supply density ──────────────

export interface VendorDiscoveryQuery {
  mode?: string;           // EVENTS | STAYS | EXPERIENCES
  categoryKey?: string;    // filter by specific category key
  tags?: string[];         // filter by tag labels (normalised match)
  city?: string;
  minBudget?: number;
  maxBudget?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
}

const SUPPLY_DENSITY_THRESHOLD = 3; // AC-6: minimum vendors per category to show

export async function getVendorsByMode(query: VendorDiscoveryQuery) {
  const {
    mode,
    categoryKey,
    tags,
    city,
    minBudget,
    maxBudget,
    page = 1,
    limit = 20,
    sortBy = 'rating',
  } = query;

  const skip = (Number(page) - 1) * Number(limit);

  // Build vendor WHERE clause
  const where: any = { status: 'VERIFIED', isActive: true };

  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (maxBudget) where.minPrice = { lte: maxBudget };
  if (minBudget) where.maxPrice = { gte: minBudget };

  // Tag filter
  if (tags && tags.length > 0) {
    const normalisedTags = tags.map(normaliseTag);
    where.tags = {
      some: {
        normalised: { in: normalisedTags },
        isRetired: false,
      },
    };
  }

  // Category filter (by key or mode affinity)
  if (categoryKey) {
    // Filter by specific category key
    const cat = await prisma.vendorCategoryLookup.findFirst({
      where: { key: categoryKey, isActive: true, isPublicVisible: true },
      select: { id: true },
    });
    if (cat) {
      where.vendorCategoryId = cat.id;
    }
  } else if (mode) {
    // Filter by mode affinity — get all category IDs with this mode affinity
    const cats = await prisma.vendorCategoryLookup.findMany({
      where: {
        isActive: true,
        isPublicVisible: true,
        modeAffinities: { has: mode },
      },
      select: { id: true },
    });
    if (cats.length > 0) {
      where.vendorCategoryId = { in: cats.map((c) => c.id) };
    }
  }

  // Build orderBy
  const orderBy: any = {};
  if (sortBy === 'rating') orderBy.rating = 'desc';
  else if (sortBy === 'price_asc') orderBy.minPrice = 'asc';
  else if (sortBy === 'price_desc') orderBy.minPrice = 'desc';
  else if (sortBy === 'bookings') orderBy.bookingCount = 'desc';

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        vendorCategory: {
          select: { key: true, label: true, modeAffinities: true, iconName: true },
        },
        tags: {
          where: { isRetired: false },
          select: { id: true, label: true, normalised: true },
          orderBy: { usageCount: 'desc' },
          take: 10,
        },
        packages: { where: { isActive: true }, orderBy: { price: 'asc' }, take: 3 },
        portfolioItems: { where: { isMain: true }, take: 1 },
      },
      orderBy: [{ isFeatured: 'desc' }, orderBy],
      skip,
      take: Number(limit),
    }),
    prisma.vendor.count({ where }),
  ]);

  return { vendors, total, page: Number(page), limit: Number(limit) };
}

/**
 * Get category summary grouped by mode, with supply density filtering.
 * Only returns categories where vendor count >= SUPPLY_DENSITY_THRESHOLD.
 * AC-6: supply density gate
 * AC-7: mode-affinity grouping
 *
 * @param mode     Optional mode affinity filter (e.g. 'EVENTS', 'STAYS', 'EXPERIENCES', 'TRANSPORT')
 * @param context  Optional consumption context. When 'registration', supply-density gate is bypassed
 *                 so all 41 active categories are returned regardless of vendor count.
 *                 Discovery default behaviour is unchanged (gate applies when context is absent).
 *                 Fix for OWB-VENDOR-CATEGORY-DROPDOWN-DISPLAY-GAP-01.
 */
export async function getCategoryDiscovery(mode?: string, context?: string) {
  const isRegistrationContext = context === 'registration';
  // For registration context, omit isPublicVisible filter so vendors see all 41 active categories
  // regardless of admin-controlled public visibility state.
  const categoryWhere: any = isRegistrationContext
    ? { isActive: true }
    : { isActive: true, isPublicVisible: true };
  if (mode) {
    categoryWhere.modeAffinities = { has: mode };
  }

  const categories = await prisma.vendorCategoryLookup.findMany({
    where: categoryWhere,
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { vendors: { where: { status: 'VERIFIED', isActive: true } } } },
    },
  });

  // Apply supply density filter — bypassed when context=registration so vendors see all 41 categories
  const visibleCategories = isRegistrationContext
    ? categories
    : categories.filter((c) => c._count.vendors >= SUPPLY_DENSITY_THRESHOLD);

  // Group by mode affinity
  const grouped: Record<string, any[]> = {};
  for (const cat of visibleCategories) {
    for (const m of cat.modeAffinities) {
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push({
        id: cat.id,
        key: cat.key,
        label: cat.label,
        description: cat.description,
        iconName: cat.iconName,
        vendorCount: cat._count.vendors,
        modeAffinities: cat.modeAffinities,
        isPublicVisible: cat.isPublicVisible,
      });
    }
  }

  // For registration context, also return a flat list of all categories (not grouped)
  const allCategories = isRegistrationContext
    ? visibleCategories.map((cat) => ({
        id: cat.id,
        key: cat.key,
        label: cat.label,
        description: cat.description,
        iconName: cat.iconName,
        vendorCount: cat._count.vendors,
        modeAffinities: cat.modeAffinities,
        isPublicVisible: cat.isPublicVisible,
      }))
    : undefined;

  return {
    grouped,
    ...(allCategories !== undefined && { allCategories }),
    supplyDensityThreshold: SUPPLY_DENSITY_THRESHOLD,
    totalVisible: visibleCategories.length,
    totalCategories: categories.length,
  };
}
