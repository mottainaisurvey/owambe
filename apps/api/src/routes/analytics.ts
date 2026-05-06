import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { AppError } from '../utils/AppError';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// ─── PLANNER OVERVIEW STATS ──────────────────────────
analyticsRouter.get('/planner/overview', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const planner = await prisma.planner.findFirst({ where: { userId } });
    if (!planner) throw new AppError('Planner not found', 404);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      totalEvents, liveEvents, totalAttendees, totalRevenue,
      recentAttendees, prevAttendees,
    ] = await Promise.all([
      prisma.event.count({ where: { plannerId: planner.id } }),
      prisma.event.count({ where: { plannerId: planner.id, status: 'LIVE' } }),
      prisma.attendee.count({
        where: { event: { plannerId: planner.id } }
      }),
      prisma.attendee.aggregate({
        where: { event: { plannerId: planner.id } },
        _sum: { amountPaid: true }
      }),
      prisma.attendee.count({
        where: {
          event: { plannerId: planner.id },
          registeredAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.attendee.count({
        where: {
          event: { plannerId: planner.id },
          registeredAt: { gte: prevPeriodStart, lt: thirtyDaysAgo }
        }
      }),
    ]);

    const registrationGrowth = prevAttendees > 0
      ? Math.round(((recentAttendees - prevAttendees) / prevAttendees) * 100)
      : 100;

    // Registrations by day (last 30 days)
    const registrationsByDay = await prisma.$queryRaw<any[]>`
      SELECT DATE(a."registeredAt") as date, COUNT(*) as count
      FROM attendees a
      JOIN events e ON a."eventId" = e.id
      WHERE e."plannerId" = ${planner.id}::uuid
        AND a."registeredAt" >= ${thirtyDaysAgo}
      GROUP BY DATE(a."registeredAt")
      ORDER BY date ASC
    `;

    res.json({
      success: true,
      stats: {
        totalEvents,
        liveEvents,
        totalAttendees,
        totalRevenue: Number(totalRevenue._sum.amountPaid || 0),
        recentAttendees,
        registrationGrowth,
      },
      registrationsByDay,
    });
  } catch (err) {
    next(err);
  }
});

// ─── EVENT-LEVEL ANALYTICS ───────────────────────────
analyticsRouter.get('/events/:eventId', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const userId = (req as any).userId;
    const planner = await prisma.planner.findFirst({ where: { userId } });

    const event = await prisma.event.findFirst({
      where: { id: eventId, plannerId: planner!.id },
      include: {
        ticketTypes: true,
        _count: { select: { attendees: true, checkIns: true } }
      }
    });
    if (!event) throw new AppError('Event not found', 404);

    const revenue = event.ticketTypes.reduce(
      (sum, t) => sum + Number(t.price) * t.soldCount, 0
    );

    const attendeesByTicket = await prisma.attendee.groupBy({
      by: ['ticketTypeId'],
      where: { eventId },
      _count: true,
    });

    const checkInRate = event._count.attendees > 0
      ? Math.round((event._count.checkIns / event._count.attendees) * 100)
      : 0;

    const fillRate = event.maxCapacity
      ? Math.round((event._count.attendees / event.maxCapacity) * 100)
      : null;

    res.json({
      success: true,
      analytics: {
        totalAttendees: event._count.attendees,
        checkedIn: event._count.checkIns,
        checkInRate,
        fillRate,
        revenue,
        attendeesByTicket,
        capacity: event.maxCapacity,
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── CHECK-IN STATS (LIVE) ───────────────────────────
analyticsRouter.get('/events/:eventId/checkin-live', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const [totalRegistered, totalCheckedIn, recentCheckIns] = await Promise.all([
      prisma.attendee.count({ where: { eventId } }),
      prisma.checkIn.count({ where: { eventId } }),
      prisma.checkIn.findMany({
        where: { eventId },
        include: {
          attendee: {
            select: { firstName: true, lastName: true, ticketType: { select: { name: true } } }
          }
        },
        orderBy: { checkedInAt: 'desc' },
        take: 20,
      }),
    ]);

    res.json({
      success: true,
      totalRegistered,
      totalCheckedIn,
      checkInRate: totalRegistered > 0
        ? Math.round((totalCheckedIn / totalRegistered) * 100)
        : 0,
      recentCheckIns,
    });
  } catch (err) {
    next(err);
  }
});

// ─── VENDOR MARKET INTELLIGENCE ─────────────────────
analyticsRouter.get('/vendor/market', requireRole('VENDOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor not found', 404);

    const category = vendor.category;
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // ── 1. Competitor pricing in same category ────────────────
    const competitors = await prisma.vendor.findMany({
      where: { category, status: 'VERIFIED', id: { not: vendor.id }, minPrice: { not: null } },
      select: {
        id: true, businessName: true, minPrice: true, maxPrice: true,
        rating: true, reviewCount: true, bookingCount: true, city: true, isInstantBook: true,
      },
      orderBy: { bookingCount: 'desc' },
    });

    const prices = competitors.map(c => Number(c.minPrice)).filter(p => p > 0).sort((a, b) => a - b);
    const myMin = Number(vendor.minPrice || 0);
    const myMax = Number(vendor.maxPrice || 0);

    const pricingInsight = {
      myMin, myMax,
      categoryMin: prices[0] ?? 0,
      categoryMax: prices[prices.length - 1] ?? 0,
      categoryMedian: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      categoryAvg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      competitorCount: competitors.length,
      myPercentile: prices.length ? Math.round((prices.filter(p => p < myMin).length / prices.length) * 100) : 50,
      topCompetitors: competitors.slice(0, 5).map(c => ({
        name: c.businessName,
        minPrice: Number(c.minPrice),
        maxPrice: Number(c.maxPrice),
        rating: Number(c.rating),
        bookings: c.bookingCount,
        isInstantBook: c.isInstantBook,
      })),
    };

    // ── 2. Lagos demand heatmap ───────────────────────────────
    const lagosZones = [
      { name: 'Victoria Island', lat: 6.4281, lng: 3.4219, radius: 3 },
      { name: 'Lekki', lat: 6.4478, lng: 3.5047, radius: 5 },
      { name: 'Ikeja GRA', lat: 6.6018, lng: 3.3515, radius: 4 },
      { name: 'Ikoyi', lat: 6.4550, lng: 3.4351, radius: 3 },
      { name: 'Surulere', lat: 6.5013, lng: 3.3584, radius: 4 },
      { name: 'Yaba', lat: 6.5054, lng: 3.3779, radius: 3 },
      { name: 'Ajah', lat: 6.4698, lng: 3.5674, radius: 5 },
      { name: 'Oshodi', lat: 6.5569, lng: 3.3508, radius: 4 },
      { name: 'Lagos Island', lat: 6.4541, lng: 3.3947, radius: 3 },
      { name: 'Magodo', lat: 6.6120, lng: 3.3970, radius: 4 },
    ];

    const recentBookings = await prisma.booking.findMany({
      where: {
        vendor: { category },
        createdAt: { gte: ninetyDaysAgo },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
      },
      select: {
        id: true, eventDate: true, totalAmount: true,
        vendor: { select: { city: true, latitude: true, longitude: true } },
      },
    });

    const heatmap = lagosZones.map(zone => {
      const zoneBookings = recentBookings.filter(b => {
        const vLat = Number(b.vendor.latitude);
        const vLng = Number(b.vendor.longitude);
        if (!vLat || !vLng) return false;
        const dist = Math.sqrt(Math.pow(vLat - zone.lat, 2) + Math.pow(vLng - zone.lng, 2)) * 111;
        return dist <= zone.radius;
      });
      const revenue = zoneBookings.reduce((s, b) => s + Number(b.totalAmount), 0);
      return { zone: zone.name, lat: zone.lat, lng: zone.lng, bookings: zoneBookings.length, revenue, avgDeal: zoneBookings.length ? Math.round(revenue / zoneBookings.length) : 0, intensity: 0 };
    });

    const maxBookings = Math.max(...heatmap.map(z => z.bookings), 1);
    heatmap.forEach(z => { z.intensity = Math.round((z.bookings / maxBookings) * 100); });
    heatmap.sort((a, b) => b.bookings - a.bookings);

    // ── 3. Peak season analysis ───────────────────────────────
    const yearBookings = await prisma.booking.findMany({
      where: { vendor: { category }, createdAt: { gte: oneYearAgo } },
      select: { eventDate: true, totalAmount: true, status: true },
    });

    const monthlyDemand = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: new Date(2026, i, 1).toLocaleString('en-NG', { month: 'short' }),
      bookings: 0, revenue: 0, avgDeal: 0, demandIndex: 0,
    }));

    yearBookings.forEach(b => {
      if (!b.eventDate) return;
      const m = new Date(b.eventDate).getMonth();
      monthlyDemand[m].bookings += 1;
      monthlyDemand[m].revenue += Number(b.totalAmount);
    });

    const maxMonthly = Math.max(...monthlyDemand.map(m => m.bookings), 1);
    monthlyDemand.forEach(m => {
      m.avgDeal = m.bookings > 0 ? Math.round(m.revenue / m.bookings) : 0;
      m.demandIndex = Math.round((m.bookings / maxMonthly) * 100);
    });

    const currentMonth = now.getMonth();
    const nextThreeMonths = [0, 1, 2].map(offset => monthlyDemand[(currentMonth + offset) % 12]);

    const peakAlerts = [
      { name: "December Wedding Season", months: [11, 12], boost: 85, type: "HIGH" },
      { name: "Valentine's / Feb Events", months: [2], boost: 45, type: "MEDIUM" },
      { name: "Easter Celebrations", months: [3, 4], boost: 55, type: "MEDIUM" },
      { name: "Children's Day / Long Weekend", months: [5], boost: 35, type: "MEDIUM" },
      { name: "Lagos @ 56 / Independence", months: [10], boost: 60, type: "HIGH" },
      { name: "End-of-Year Corporate Events", months: [11, 12], boost: 70, type: "HIGH" },
      { name: "New Year Hangover (Low)", months: [1], boost: -30, type: "LOW" },
      { name: "Ramadan Period (Variable)", months: [3, 4], boost: -10, type: "CAUTION" },
    ].filter(a => a.months.some(m => [currentMonth + 1, (currentMonth + 1) % 12 + 1, (currentMonth + 2) % 12 + 1].includes(m)));

    // ── 4. Vendor positioning ─────────────────────────────────
    const categoryAvgBookings = competitors.length
      ? Math.round(competitors.reduce((s, c) => s + c.bookingCount, 0) / competitors.length) : 0;

    const myRecentBookings = await prisma.booking.count({
      where: { vendorId: vendor.id, createdAt: { gte: ninetyDaysAgo }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    });

    const avgCompetitorRating = competitors.length
      ? competitors.reduce((s, c) => s + Number(c.rating), 0) / competitors.length : 0;

    const positioning = {
      pricePosition: myMin === 0 ? 'UNSET' : myMin < pricingInsight.categoryMedian * 0.85 ? 'BELOW_MARKET' :
        myMin > pricingInsight.categoryMedian * 1.3 ? 'PREMIUM' : 'AT_MARKET',
      ratingVsMarket: Number(Number(vendor.rating) - avgCompetitorRating).toFixed(2),
      bookingsVsAvg: vendor.bookingCount - categoryAvgBookings,
      recentDemandTrend: myRecentBookings >= 3 ? 'STRONG' : myRecentBookings >= 1 ? 'MODERATE' : 'SLOW',
      recommendedPriceMin: Math.round(pricingInsight.categoryMedian * 0.9),
      recommendedPriceMax: Math.round(pricingInsight.categoryMedian * 1.5),
      myRecentBookings,
    };

    res.json({
      success: true, category,
      pricingInsight, heatmap,
      monthlyDemand, nextThreeMonths, peakAlerts, positioning,
    });
  } catch (err) { next(err); }
});

// ─── VENDOR REVENUE ANALYTICS ────────────────────────
analyticsRouter.get('/vendor/revenue', requireRole('VENDOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const vendor = await prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) throw new AppError('Vendor not found', 404);

    const [
      totalBookings, confirmedBookings,
      totalRevenue, pendingPayout,
    ] = await Promise.all([
      prisma.booking.count({ where: { vendorId: vendor.id } }),
      prisma.booking.count({ where: { vendorId: vendor.id, status: 'CONFIRMED' } }),
      prisma.booking.aggregate({
        where: { vendorId: vendor.id, status: 'COMPLETED' },
        _sum: { vendorAmount: true }
      }),
      prisma.booking.aggregate({
        where: { vendorId: vendor.id, status: 'CONFIRMED', payoutReleasedAt: null },
        _sum: { vendorAmount: true }
      }),
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        confirmedBookings,
        totalRevenue: Number(totalRevenue._sum.vendorAmount || 0),
        pendingPayout: Number(pendingPayout._sum.vendorAmount || 0),
        rating: vendor.rating,
        reviewCount: vendor.reviewCount,
      }
    });
  } catch (err) {
    next(err);
  }
});
