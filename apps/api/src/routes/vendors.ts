import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { prisma } from '../database/client';
import {
  searchVendors, getVendorProfile, createVendorProfile,
  updateVendorProfile, getMyVendorProfile, setupBankAccount,
  getAvailability, setAvailability, generateBio, addPackage,
} from '../controllers/vendors.controller';
import {
  addTagToVendor, removeTagFromVendor,
  getVendorsByMode, getCategoryDiscovery,
  normaliseTag,
} from '../services/vendorTags.service';

export const vendorsRouter = Router();

// ─── PUBLIC ──────────────────────────────────────────────────────────────────
vendorsRouter.get('/search', searchVendors);
vendorsRouter.get('/profile/:slug', getVendorProfile);
vendorsRouter.get('/:vendorId/availability', getAvailability);

// ─── VENDOR-MARKETPLACE-EXPANSION-01: Public discovery endpoints ─────────────

/**
 * GET /api/v1/vendors/discover
 * Consumer discovery: mode-affinity grouping + supply density filter
 * AC-6, AC-7, AC-9
 * Query params: mode, categoryKey, tags (comma-separated), city, minBudget, maxBudget, page, limit, sortBy
 */
vendorsRouter.get('/discover', async (req, res, next) => {
  try {
    const {
      mode, categoryKey, tags, city, minBudget, maxBudget,
      page, limit, sortBy,
    } = req.query;

    const tagList = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : undefined;

    const result = await getVendorsByMode({
      mode: mode ? String(mode) : undefined,
      categoryKey: categoryKey ? String(categoryKey) : undefined,
      tags: tagList,
      city: city ? String(city) : undefined,
      minBudget: minBudget ? Number(minBudget) : undefined,
      maxBudget: maxBudget ? Number(maxBudget) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      sortBy: sortBy ? String(sortBy) : 'rating',
    });

    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/vendors/categories
 * Returns all visible categories grouped by mode affinity, with supply density filtering.
 * AC-6 (supply density gate), AC-7 (mode-affinity grouping), AC-10 (visibility toggle)
 * Query params: mode (optional filter)
 */
vendorsRouter.get('/categories', async (req, res, next) => {
  try {
    const { mode } = req.query;
    const result = await getCategoryDiscovery(mode ? String(mode) : undefined);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/vendors/tags/suggest
 * Returns top non-retired tags for autocomplete, optionally filtered by prefix.
 * AC-3 (normalisation visible in response), AC-8 (tag listing)
 */
vendorsRouter.get('/tags/suggest', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    const where: any = { isRetired: false };
    if (q) {
      const normalised = normaliseTag(String(q));
      where.normalised = { startsWith: normalised };
    }
    const tags = await prisma.vendorTag.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: Number(limit),
      select: { id: true, label: true, normalised: true, usageCount: true },
    });
    res.json({ success: true, tags });
  } catch (err) { next(err); }
});

// ─── AUTHENTICATED VENDOR ROUTES ─────────────────────────────────────────────
vendorsRouter.get('/me', authenticate, requireRole('VENDOR'), getMyVendorProfile);

vendorsRouter.post('/me',
  authenticate, requireRole('VENDOR'),
  [body('businessName').trim().notEmpty(), body('category').notEmpty(), body('city').notEmpty()],
  validate, createVendorProfile
);

vendorsRouter.put('/me', authenticate, requireRole('VENDOR'), updateVendorProfile);

vendorsRouter.post('/me/bank-account',
  authenticate, requireRole('VENDOR'),
  [body('bankCode').notEmpty(), body('accountNumber').isLength({ min: 10, max: 10 })],
  validate, setupBankAccount
);

vendorsRouter.put('/me/availability', authenticate, requireRole('VENDOR'), setAvailability);
vendorsRouter.post('/me/packages', authenticate, requireRole('VENDOR'), addPackage);
vendorsRouter.post('/generate-bio', authenticate, generateBio);

// ─── VENDOR-MARKETPLACE-EXPANSION-01: Vendor tag management ──────────────────

/**
 * POST /api/v1/vendors/me/tags
 * Add a tag to the authenticated vendor's profile.
 * AC-4
 */
vendorsRouter.post('/me/tags',
  authenticate, requireRole('VENDOR'),
  [body('label').trim().notEmpty().isLength({ max: 50 })],
  validate,
  async (req, res, next) => {
    try {
      const userId = (req as any).userId;
      const vendor = await prisma.vendor.findFirst({ where: { userId }, select: { id: true } });
      if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

      const { label } = req.body;
      const { tag, isNew } = await addTagToVendor(vendor.id, label);
      res.status(isNew ? 201 : 200).json({ success: true, tag, isNew });
    } catch (err) { next(err); }
  }
);

/**
 * DELETE /api/v1/vendors/me/tags/:tagId
 * Remove a tag from the authenticated vendor's profile.
 * AC-4
 */
vendorsRouter.delete('/me/tags/:tagId',
  authenticate, requireRole('VENDOR'),
  async (req, res, next) => {
    try {
      const userId = (req as any).userId;
      const vendor = await prisma.vendor.findFirst({ where: { userId }, select: { id: true } });
      if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

      await removeTagFromVendor(vendor.id, req.params.tagId);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

// ─── REVIEW REPLY ─────────────────────────────────────────────────────────────
vendorsRouter.put('/reviews/:reviewId/reply', authenticate, requireRole('VENDOR'), async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    const { response } = req.body;
    if (!response?.trim()) return res.status(400).json({ success: false, error: 'Response is required' });

    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const review = await prisma.review.findFirst({
      where: { id: req.params.reviewId, vendorId: vendor.id },
    });
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    if (review.response) return res.status(409).json({ success: false, error: 'Already replied' });

    const updated = await prisma.review.update({
      where: { id: req.params.reviewId },
      data: { response: response.trim(), respondedAt: new Date() },
    });

    res.json({ success: true, review: updated });
  } catch (err) { next(err); }
});
