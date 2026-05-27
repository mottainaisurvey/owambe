import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// One-shot: populate VendorCategoryLookup on staging.
// Protected by X-Seed-Secret header. Remove after use.
router.post('/internal/seed-categories', async (req, res, next) => {
  try {
    const secret = req.headers['x-seed-secret'];
    if (secret !== 'owambe-seed-categories-2026') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const cats = [
      { key: 'VENUE',              label: 'Venues',              description: 'Event spaces and halls',          iconName: 'building',  modeAffinities: ['EVENTS', 'STAYS'],        sortOrder: 1 },
      { key: 'CATERING',          label: 'Catering',            description: 'Food and beverage services',      iconName: 'utensils',  modeAffinities: ['EVENTS', 'EXPERIENCES'],  sortOrder: 2 },
      { key: 'PHOTOGRAPHY_VIDEO', label: 'Photography & Video', description: 'Photo and video coverage',        iconName: 'camera',    modeAffinities: ['EVENTS', 'EXPERIENCES'],  sortOrder: 3 },
      { key: 'AV_PRODUCTION',     label: 'AV & Production',     description: 'Audio-visual and staging',        iconName: 'music',     modeAffinities: ['EVENTS'],                 sortOrder: 4 },
      { key: 'DECOR_FLORALS',     label: 'Décor & Florals',     description: 'Decoration and floral design',    iconName: 'flower',    modeAffinities: ['EVENTS', 'STAYS'],        sortOrder: 5 },
      { key: 'ENTERTAINMENT',     label: 'Entertainment',       description: 'Live acts and performers',        iconName: 'star',      modeAffinities: ['EVENTS', 'EXPERIENCES'],  sortOrder: 6 },
      { key: 'MAKEUP_ARTIST',     label: 'Makeup Artists',      description: 'Beauty and grooming services',    iconName: 'sparkles',  modeAffinities: ['EVENTS'],                 sortOrder: 7 },
      { key: 'SPEAKER',           label: 'Speakers',            description: 'Keynote and panel speakers',      iconName: 'mic',       modeAffinities: ['EVENTS'],                 sortOrder: 8 },
    ];
    for (const cat of cats) {
      await (prisma as any).vendorCategoryLookup.upsert({
        where:  { key: cat.key },
        update: { label: cat.label, description: cat.description, iconName: cat.iconName, modeAffinities: cat.modeAffinities, sortOrder: cat.sortOrder },
        create: { key: cat.key, label: cat.label, description: cat.description, iconName: cat.iconName, modeAffinities: cat.modeAffinities, sortOrder: cat.sortOrder },
      });
    }
    res.json({ success: true, seeded: cats.length, message: `${cats.length} categories upserted` });
  } catch (err) {
    next(err);
  }
});

export default router;
