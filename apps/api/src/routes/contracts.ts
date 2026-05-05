import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import crypto from 'crypto';
import { addDays, isPast } from 'date-fns';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/email.service';
import { generateContractHtml, inferTemplate } from '../services/contract-templates';
import type { ContractData } from '../services/contract-templates';
import { generateContractPdf } from '../services/pdf.service';
import { uploadBufferToS3 } from '../services/upload.service';

export const contractsRouter = Router();

function generateRef(prefix = 'CTR'): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${now}-${rand}`;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── LIST contracts (planner or vendor) ──────────────
contractsRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const { status, limit = 20, page = 1 } = req.query;

    let where: any = {};
    if (user?.role === 'ADMIN') {
      // ADMIN sees all contracts — no filter
    } else if (user?.role === 'PLANNER') {
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);
      where.plannerId = planner.id;
    } else if (user?.role === 'VENDOR') {
      const vendor = await prisma.vendor.findFirst({ where: { userId } });
      if (!vendor) throw new AppError('Vendor not found', 404);
      where.vendorId = vendor.id;
    } else {
      throw new AppError('Access denied', 403);
    }

    if (status) where.status = status;

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: {
          signatures: { select: { signerRole: true, signerName: true, isSigned: true, signedAt: true } },
          vendor: { select: { businessName: true, category: true } },
          planner: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
          booking: { select: { reference: true, eventDate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.contract.count({ where }),
    ]);

    res.json({ success: true, contracts, total, page: Number(page) });
  } catch (err) { next(err); }
});

// ─── GET signing page data (public — via token) ───────
contractsRouter.get('/sign/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = await prisma.contractSignature.findUnique({
      where: { signingToken: req.params.token },
      include: {
        contract: {
          include: {
            signatures: { select: { signerRole: true, signerName: true, isSigned: true } },
            vendor: { select: { businessName: true } },
            planner: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    if (!sig) throw new AppError('Invalid signing link', 404);
    if (isPast(sig.tokenExpiry)) throw new AppError('This signing link has expired', 410);
    if (sig.isSigned) throw new AppError('You have already signed this contract', 409);
    if (!['SENT', 'PARTIALLY_SIGNED'].includes(sig.contract.status)) {
      throw new AppError('This contract is not available for signing', 400);
    }

    // Mark as viewed
    if (!sig.viewedAt) {
      await prisma.contractSignature.update({
        where: { id: sig.id },
        data: { viewedAt: new Date() },
      });
    }

    // Return contract data without sensitive tokens
    const { signingToken, ...safeSig } = sig;
    res.json({ success: true, signature: safeSig, contract: sig.contract });
  } catch (err) { next(err); }
});

// ─── SIGN contract ────────────────────────────────────
contractsRouter.post('/sign/:token', [
  body('signatureData').notEmpty().withMessage('Signature is required'),
  body('agreedToTerms').isBoolean().equals('true').withMessage('You must agree to the terms'),
], validate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const sig = await prisma.contractSignature.findUnique({
      where: { signingToken: token },
      include: { contract: { include: { signatures: true } } },
    });

    if (!sig) throw new AppError('Invalid signing link', 404);
    if (isPast(sig.tokenExpiry)) throw new AppError('This signing link has expired', 410);
    if (sig.isSigned) throw new AppError('Already signed', 409);

    // Record the signature
    const now = new Date();
    await prisma.contractSignature.update({
      where: { id: sig.id },
      data: {
        isSigned: true,
        signedAt: now,
        signatureData: req.body.signatureData,
        ipAddress: ipAddress.split(',')[0].trim(),
        userAgent,
      },
    });

    // Check if all required signers have signed
    const allSigs = sig.contract.signatures;
    const sigCount = allSigs.length;
    const signedCount = allSigs.filter(s => s.isSigned || s.id === sig.id).length;
    const allSigned = signedCount >= sigCount;

    const newStatus = allSigned ? 'FULLY_SIGNED' : 'PARTIALLY_SIGNED';

    const updatedContract = await prisma.contract.update({
      where: { id: sig.contractId },
      data: {
        status: newStatus,
        ...(allSigned && { fullySignedAt: now }),
      },
      include: {
        signatures: true,
        planner: { include: { user: true } },
        vendor: { include: { user: true } },
      },
    });

    // Generate PDF on full execution
    if (allSigned) {
      void generateAndStorePdf(updatedContract);
    }

    // Send confirmation email
    await sendEmail({
      to: sig.signerEmail,
      subject: allSigned ? `✅ Contract fully executed: ${sig.contract.title}` : `✅ Signature received: ${sig.contract.title}`,
      template: 'contract-signed-confirmation',
      data: {
        firstName: sig.signerName.split(' ')[0],
        contractTitle: sig.contract.title,
        reference: sig.contract.reference,
        signedAt: now.toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        ipAddress: ipAddress.split(',')[0].trim(),
        allSigned,
        downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com'}/dashboard/contracts/${sig.contractId}`,
      },
    });

    logger.info(`Contract signed: ${sig.contract.reference} by ${sig.signerRole} — ${allSigned ? 'FULLY SIGNED' : 'PARTIALLY SIGNED'}`);
    res.json({ success: true, allSigned, contractStatus: newStatus });
  } catch (err) { next(err); }
});

// ─── GET single contract ──────────────────────────────
contractsRouter.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        signatures: true,
        vendor: {
          select: {
            businessName: true, category: true, slug: true,
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        },
        planner: {
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        },
        booking: { select: { reference: true, eventDate: true, totalAmount: true } },
      },
    });
    if (!contract) throw new AppError('Contract not found', 404);
    res.json({ success: true, contract });
  } catch (err) { next(err); }
});

// ─── CREATE contract ──────────────────────────────────
contractsRouter.post('/',
  authenticate, requireRole('PLANNER'),
  [
    body('vendorId').isUUID(),
    body('title').trim().notEmpty().isLength({ max: 200 }),
    body('templateType').optional().isIn(['SERVICE_AGREEMENT', 'VENUE_HIRE', 'PHOTOGRAPHY', 'CATERING', 'CUSTOM']),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({
        where: { userId },
        include: { user: true },
      });
      if (!planner) throw new AppError('Planner not found', 404);

      const vendor = await prisma.vendor.findUnique({
        where: { id: req.body.vendorId },
        include: { user: true },
      });
      if (!vendor) throw new AppError('Vendor not found', 404);

      const reference = generateRef('CTR');
      const templateType = req.body.templateType || inferTemplate(vendor.category);

      // Build contract data for template
      const contractData: ContractData = {
        reference,
        plannerName: `${planner.user.firstName} ${planner.user.lastName}`,
        plannerEmail: planner.user.email,
        vendorName: vendor.businessName,
        vendorEmail: vendor.user.email,
        vendorCategory: vendor.category,
        eventDate: req.body.eventDate ? new Date(req.body.eventDate) : undefined,
        eventVenue: req.body.eventVenue,
        guestCount: req.body.guestCount ? Number(req.body.guestCount) : undefined,
        totalAmount: req.body.totalAmount ? Number(req.body.totalAmount) : undefined,
        depositAmount: req.body.depositAmount ? Number(req.body.depositAmount) : undefined,
        eventDescription: req.body.eventDescription,
        customClauses: req.body.customClauses,
      };

      const bodyHtml = req.body.bodyHtml || generateContractHtml(templateType, contractData);

      const expiresAt = addDays(new Date(), req.body.expiresInDays || 30);

      const contract = await prisma.contract.create({
        data: {
          reference,
          plannerId: planner.id,
          vendorId: vendor.id,
          bookingId: req.body.bookingId || null,
          title: req.body.title,
          templateType,
          bodyHtml,
          totalAmount: req.body.totalAmount ? Number(req.body.totalAmount) : null,
          currency: req.body.currency || 'NGN',
          eventDate: req.body.eventDate ? new Date(req.body.eventDate) : null,
          eventVenue: req.body.eventVenue,
          expiresAt,
          status: 'DRAFT',
          signatures: {
            create: [
              {
                signerRole: 'PLANNER',
                signerName: `${planner.user.firstName} ${planner.user.lastName}`,
                signerEmail: planner.user.email,
                signingToken: generateToken(),
                tokenExpiry: expiresAt,
              },
              {
                signerRole: 'VENDOR',
                signerName: vendor.businessName,
                signerEmail: vendor.user.email,
                signingToken: generateToken(),
                tokenExpiry: expiresAt,
              },
            ],
          },
        },
        include: { signatures: true },
      });

      logger.info(`Contract created: ${reference}`);
      res.status(201).json({ success: true, contract });
    } catch (err) { next(err); }
  }
);

// ─── UPDATE contract (DRAFT only) ────────────────────
contractsRouter.put('/:id', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) throw new AppError('Contract not found', 404);
    if (contract.status !== 'DRAFT') throw new AppError('Only DRAFT contracts can be edited', 400);

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title,
        bodyHtml: req.body.bodyHtml,
        totalAmount: req.body.totalAmount ? Number(req.body.totalAmount) : undefined,
        eventDate: req.body.eventDate ? new Date(req.body.eventDate) : undefined,
        eventVenue: req.body.eventVenue,
      },
    });
    res.json({ success: true, contract: updated });
  } catch (err) { next(err); }
});

// ─── SEND contract (locks it, emails signers) ─────────
contractsRouter.post('/:id/send', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        signatures: true,
        planner: { include: { user: true } },
        vendor: { include: { user: true } },
      },
    });
    if (!contract) throw new AppError('Contract not found', 404);
    if (!['DRAFT'].includes(contract.status)) throw new AppError('Contract is not in DRAFT status', 400);

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com';

    // Email all signers
    for (const sig of contract.signatures) {
      const signingUrl = `${baseUrl}/contracts/sign/${sig.signingToken}`;
      await sendEmail({
        to: sig.signerEmail,
        subject: `Action required: Sign "${contract.title}" — ${contract.reference}`,
        template: 'contract-sign-request',
        data: {
          firstName: sig.signerName.split(' ')[0],
          contractTitle: contract.title,
          reference: contract.reference,
          eventDate: contract.eventDate ? contract.eventDate.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null,
          totalAmount: contract.totalAmount ? `₦${Number(contract.totalAmount).toLocaleString('en-NG')}` : null,
          expiresAt: contract.expiresAt ? contract.expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '30 days from today',
          signingUrl,
        },
      });
    }

    logger.info(`Contract sent: ${contract.reference} — ${contract.signatures.length} signers notified`);
    res.json({ success: true, contract: updated });
  } catch (err) { next(err); }
});


// ─── DOWNLOAD PDF ─────────────────────────────────────
contractsRouter.get('/:id/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        signatures: true,
        vendor: { include: { user: true } },
        planner: { include: { user: true } },
      },
    });
    if (!contract) throw new AppError('Contract not found', 404);

    const plannerSig = contract.signatures.find(s => s.signerRole === 'PLANNER');
    const vendorSig = contract.signatures.find(s => s.signerRole === 'VENDOR');

    const pdfBuffer = await generateContractPdf({
      reference: contract.reference,
      title: contract.title,
      bodyHtml: contract.bodyHtml,
      plannerName: plannerSig?.signerName || '',
      plannerEmail: plannerSig?.signerEmail || '',
      vendorName: vendorSig?.signerName || '',
      vendorEmail: vendorSig?.signerEmail || '',
      eventDate: contract.eventDate || undefined,
      eventVenue: contract.eventVenue || undefined,
      totalAmount: contract.totalAmount ? Number(contract.totalAmount) : undefined,
      currency: contract.currency,
      plannerSignedAt: plannerSig?.signedAt || undefined,
      vendorSignedAt: vendorSig?.signedAt || undefined,
      signerIp: plannerSig?.ipAddress || undefined,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract-${contract.reference}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ─── VOID contract ────────────────────────────────────
contractsRouter.post('/:id/void', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) throw new AppError('Contract not found', 404);
    if (contract.status === 'FULLY_SIGNED') throw new AppError('Fully signed contracts cannot be voided', 400);

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: req.body.reason },
    });
    res.json({ success: true, contract: updated });
  } catch (err) { next(err); }
});

// ─── RESEND signing link ──────────────────────────────
contractsRouter.post('/:id/resend/:signerRole', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = await prisma.contractSignature.findFirst({
      where: { contractId: req.params.id, signerRole: req.params.signerRole as any, isSigned: false },
      include: { contract: true },
    });
    if (!sig) throw new AppError('Signer not found or already signed', 404);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com';
    const signingUrl = `${baseUrl}/contracts/sign/${sig.signingToken}`;

    await sendEmail({
      to: sig.signerEmail,
      subject: `⏰ Reminder: Sign "${sig.contract.title}" — ${sig.contract.reference}`,
      template: 'contract-reminder',
      data: {
        firstName: sig.signerName.split(' ')[0],
        contractTitle: sig.contract.title,
        reference: sig.contract.reference,
        expiresAt: sig.tokenExpiry.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }),
        signingUrl,
      },
    });

    await prisma.contractSignature.update({
      where: { id: sig.id },
      data: { reminderSentAt: new Date() },
    });

    res.json({ success: true, message: `Reminder sent to ${sig.signerEmail}` });
  } catch (err) { next(err); }
});

// ─── GENERATE from booking (convenience) ──────────────
contractsRouter.post('/from-booking/:bookingId', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const planner = await prisma.planner.findFirst({
      where: { userId },
      include: { user: true },
    });
    if (!planner) throw new AppError('Planner not found', 404);

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: {
        vendor: { include: { user: true } },
        planner: { include: { user: true } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    if (booking.plannerId !== planner.id) throw new AppError('Access denied', 403);

    const templateType = inferTemplate(booking.vendor.category);
    const reference = generateRef('CTR');

    const contractData: ContractData = {
      reference,
      plannerName: `${planner.user.firstName} ${planner.user.lastName}`,
      plannerEmail: planner.user.email,
      vendorName: booking.vendor.businessName,
      vendorEmail: booking.vendor.user.email,
      vendorCategory: booking.vendor.category,
      eventDate: booking.eventDate,
      guestCount: booking.guestCount || undefined,
      totalAmount: Number(booking.totalAmount),
      depositAmount: Number(booking.depositAmount),
      eventDescription: booking.eventDescription || undefined,
      customClauses: req.body.customClauses,
    };

    const bodyHtml = generateContractHtml(templateType, contractData);
    const expiresAt = addDays(new Date(), 30);

    const contract = await prisma.contract.create({
      data: {
        reference,
        plannerId: planner.id,
        vendorId: booking.vendorId,
        bookingId: booking.id,
        title: req.body.title || `Event Services Agreement — ${booking.reference}`,
        templateType,
        bodyHtml,
        totalAmount: Number(booking.totalAmount),
        currency: booking.currency,
        eventDate: booking.eventDate,
        expiresAt,
        status: 'DRAFT',
        signatures: {
          create: [
            {
              signerRole: 'PLANNER',
              signerName: `${planner.user.firstName} ${planner.user.lastName}`,
              signerEmail: planner.user.email,
              signingToken: generateToken(),
              tokenExpiry: expiresAt,
            },
            {
              signerRole: 'VENDOR',
              signerName: booking.vendor.businessName,
              signerEmail: booking.vendor.user.email,
              signingToken: generateToken(),
              tokenExpiry: expiresAt,
            },
          ],
        },
      },
      include: { signatures: true },
    });

    logger.info(`Contract generated from booking: ${booking.reference} → ${reference}`);
    res.status(201).json({ success: true, contract });
  } catch (err) { next(err); }
});

// ─── HELPER: generate and store PDF in S3 ─────────────
async function generateAndStorePdf(contract: any) {
  try {
    const plannerSig = contract.signatures.find((s: any) => s.signerRole === 'PLANNER');
    const vendorSig = contract.signatures.find((s: any) => s.signerRole === 'VENDOR');

    const pdfBuffer = await generateContractPdf({
      reference: contract.reference,
      title: contract.title,
      bodyHtml: contract.bodyHtml,
      plannerName: `${contract.planner.user.firstName} ${contract.planner.user.lastName}`,
      plannerEmail: contract.planner.user.email,
      vendorName: contract.vendor.businessName,
      vendorEmail: contract.vendor.user.email,
      eventDate: contract.eventDate,
      eventVenue: contract.eventVenue,
      totalAmount: contract.totalAmount ? Number(contract.totalAmount) : undefined,
      currency: contract.currency,
      plannerSignedAt: plannerSig?.signedAt,
      vendorSignedAt: vendorSig?.signedAt,
      signerIp: plannerSig?.ipAddress,
    });

    // Upload PDF to S3 and store URL
    let pdfUrl: string | undefined;
    try {
      pdfUrl = await uploadBufferToS3(
        pdfBuffer,
        `contracts/${contract.reference}.pdf`,
        'application/pdf'
      );
      await prisma.contract.update({
        where: { id: contract.id },
        data: { pdfUrl },
      });
      logger.info(`Contract PDF stored at: ${pdfUrl}`);
    } catch (s3Err) {
      // Non-blocking: PDF emailed even if S3 fails
      logger.warn(`S3 upload failed for contract ${contract.reference}:`, s3Err);
    }

    // Email fully-executed PDF to both parties
    const signers = [
      { name: plannerSig?.signerName, email: plannerSig?.signerEmail, signedAt: plannerSig?.signedAt, ip: plannerSig?.ipAddress },
      { name: vendorSig?.signerName, email: vendorSig?.signerEmail, signedAt: vendorSig?.signedAt, ip: vendorSig?.ipAddress },
    ];
    for (const s of signers) {
      if (!s.email) continue;
      await sendEmail({
        to: s.email,
        subject: `✅ Fully executed: ${contract.title} — ${contract.reference}`,
        template: 'contract-signed-confirmation',
        data: {
          firstName: s.name?.split(' ')[0] || 'there',
          contractTitle: contract.title,
          reference: contract.reference,
          signedAt: s.signedAt?.toLocaleString('en-NG') || new Date().toLocaleString('en-NG'),
          ipAddress: s.ip || 'recorded',
          allSigned: true,
          downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com'}/dashboard/contracts/${contract.id}`,
        },
      });
    }

    logger.info(`Contract PDF generated and distributed: ${contract.reference}`);
  } catch (err) {
    logger.error('Failed to generate contract PDF:', err);
  }
}
