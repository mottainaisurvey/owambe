import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { AppError } from '../utils/AppError';
import { generateSlug } from '../utils/slug';
import { createSubaccount, verifyAccountNumber } from '../services/paystack.service';
import { generateVendorBio } from '../services/ai.service';
import { logger } from '../utils/logger';

// ─── GEO SEARCH VENDORS ──────────────────────────────
export async function searchVendors(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      category, city, date, minBudget, maxBudget,
      page = 1, limit = 20, sortBy = 'rating', featured
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { status: 'VERIFIED' };
    if (category) where.category = category;
    if (city) where.city = { contains: String(city), mode: 'insensitive' };
    if (maxBudget) where.minPrice = { lte: Number(maxBudget) };
    if (minBudget) where.maxPrice = { gte: Number(minBudget) };
    if (featured === 'true') where.isFeatured = true;

    // Filter by date availability
    let unavailableVendorIds: string[] = [];
    if (date) {
      const eventDate = new Date(String(date));
      const blocked = await prisma.vendorAvailability.findMany({
        where: {
          date: eventDate,
          OR: [{ isBlocked: true }, { isAvailable: false }]
        },
        select: { vendorId: true }
      });

      const bookedOnDate = await prisma.booking.findMany({
        where: {
          eventDate: eventDate,
          status: { in: ['CONFIRMED', 'PENDING'] }
        },
        select: { vendorId: true }
      });

      unavailableVendorIds = [
        ...blocked.map(b => b.vendorId),
        ...bookedOnDate.map(b => b.vendorId)
      ];
    }

    if (unavailableVendorIds.length > 0) {
      where.id = { notIn: unavailableVendorIds };
    }

    const orderBy: any = {};
    if (sortBy === 'rating') orderBy.rating = 'desc';
    else if (sortBy === 'price_asc') orderBy.minPrice = 'asc';
    else if (sortBy === 'price_desc') orderBy.minPrice = 'desc';
    else if (sortBy === 'bookings') orderBy.bookingCount = 'desc';

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          portfolioItems: { where: { isMain: true }, take: 1 },
          packages: { where: { isActive: true }, orderBy: { price: 'asc' }, take: 3 },
        },
        orderBy: [{ isFeatured: 'desc' }, orderBy],
        skip,
        take: Number(limit),
      }),
      prisma.vendor.count({ where })
    ]);

    res.json({ success: true, vendors, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// ─── GET VENDOR PROFILE ──────────────────────────────
export async function getVendorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const vendor = await prisma.vendor.findFirst({
      where: { slug, status: 'VERIFIED' },
      include: {
        portfolioItems: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] },
        packages: { where: { isActive: true }, orderBy: { price: 'asc' } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { booking: { select: { eventDate: true } } }
        },
        tags: { select: { id: true, label: true, normalised: true } },
      }
    });
    if (!vendor) throw new AppError('Vendor not found', 404);
    res.json({ success: true, vendor });
  } catch (err) {
    next(err);
  }
}

// ─── CREATE VENDOR PROFILE ───────────────────────────
export async function createVendorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const existing = await prisma.vendor.findFirst({ where: { userId } });
    if (existing) throw new AppError('Vendor profile already exists', 409);

    const {
      businessName, category, description, shortBio,
      address, city, state, latitude, longitude, serviceRadius,
      minPrice, maxPrice, isInstantBook
    } = req.body;

    const slug = await generateSlug(businessName, 'vendors');
    const launchExpiry = new Date();
    launchExpiry.setDate(launchExpiry.getDate() + 90);

    const vendor = await prisma.vendor.create({
      data: {
        userId,
        businessName,
        slug,
        category,
        description,
        shortBio,
        address,
        city,
        state,
        country: 'Nigeria',
        latitude,
        longitude,
        serviceRadius: serviceRadius || 30,
        minPrice,
        maxPrice,
        currency: 'NGN',
        isInstantBook: isInstantBook || false,
        status: 'PENDING',
        launchBonusActive: true,
        launchBonusExpiresAt: launchExpiry,
      }
    });

    logger.info(`Vendor profile created: ${vendor.id}`);
    res.status(201).json({ success: true, vendor });
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE VENDOR PROFILE ───────────────────────────
export async function updateVendorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor profile not found', 404);

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: req.body
    });
    res.json({ success: true, vendor: updated });
  } catch (err) {
    next(err);
  }
}

// ─── MY VENDOR PROFILE ───────────────────────────────
export async function getMyVendorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({
      where: { userId },
      include: {
        portfolioItems: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }] },
        packages: { orderBy: { price: 'asc' } },
        tags: { select: { id: true, label: true, normalised: true } },
      }
    });
    if (!vendor) throw new AppError('Vendor profile not found', 404);
    res.json({ success: true, vendor });
  } catch (err) {
    next(err);
  }
}

// ─── SETUP BANK ACCOUNT (Paystack Subaccount) ────────
export async function setupBankAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { bankCode, accountNumber } = req.body;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor not found', 404);

    // Verify account with Paystack
    const accountInfo = await verifyAccountNumber(accountNumber, bankCode);

    // Create Paystack subaccount
    const commissionRate = Number(vendor.commissionRate);
    const subaccount = await createSubaccount({
      businessName: vendor.businessName,
      settlementBank: bankCode,
      accountNumber,
      percentageCharge: commissionRate,
    });

    // Save to vendor record
    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        bankCode,
        bankAccountNumber: accountNumber,
        bankAccountName: accountInfo.account_name,
        paystackSubAccountCode: subaccount.subaccount_code,
        paystackSubAccountId: String(subaccount.id),
      }
    });

    res.json({
      success: true,
      message: 'Bank account verified and connected',
      accountName: accountInfo.account_name,
      subaccountCode: subaccount.subaccount_code,
    });
  } catch (err) {
    next(err);
  }
}

// ─── AVAILABILITY ────────────────────────────────────
export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { vendorId } = req.params;
    const { month, year } = req.query;

    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0);

    const [availability, bookings] = await Promise.all([
      prisma.vendorAvailability.findMany({
        where: { vendorId, date: { gte: startDate, lte: endDate } }
      }),
      prisma.booking.findMany({
        where: {
          vendorId,
          eventDate: { gte: startDate, lte: endDate },
          status: { in: ['CONFIRMED', 'PENDING'] }
        },
        select: { eventDate: true, status: true }
      })
    ]);

    res.json({ success: true, availability, bookings });
  } catch (err) {
    next(err);
  }
}

export async function setAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor not found', 404);

    const { dates } = req.body; // [{ date, isAvailable, isBlocked, note }]

    const upserts = dates.map((d: any) =>
      prisma.vendorAvailability.upsert({
        where: { vendorId_date: { vendorId: vendor.id, date: new Date(d.date) } },
        update: { isAvailable: d.isAvailable, isBlocked: d.isBlocked, note: d.note },
        create: {
          vendorId: vendor.id,
          date: new Date(d.date),
          isAvailable: d.isAvailable ?? true,
          isBlocked: d.isBlocked ?? false,
          note: d.note,
        }
      })
    );

    await prisma.$transaction(upserts);
    res.json({ success: true, message: `Updated availability for ${dates.length} dates` });
  } catch (err) {
    next(err);
  }
}

// ─── AI BIO GENERATION ───────────────────────────────
export async function generateBio(req: Request, res: Response, next: NextFunction) {
  try {
    const { businessName, category, details } = req.body;
    const bio = await generateVendorBio(businessName, category, details);
    res.json({ success: true, ...bio });
  } catch (err) {
    next(err);
  }
}

// ─── ADD PACKAGE ─────────────────────────────────────
export async function addPackage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor not found', 404);

    const { name, description, price, duration, includes } = req.body;
    const pkg = await prisma.vendorPackage.create({
      data: { vendorId: vendor.id, name, description, price, currency: 'NGN', duration, includes: includes || [] }
    });
    res.status(201).json({ success: true, package: pkg });
  } catch (err) {
    next(err);
  }
}
