import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/email.service';
import {
  initializeTransaction,
  chargeAuthorization,
  createOrFetchCustomer,
  computeInstalmentSchedule,
  verifyWebhookSignature,
} from '../services/paystack.service';
import { generateReference } from '../utils/slug';

export const instalmentsRouter = Router();

// ─── SERVICE FEE CONFIG ───────────────────────────────
const FEES: Record<number, number> = {
  3: 3.5,  // 3.5% for 3 months
  6: 5.0,  // 5.0% for 6 months
};

// ─── HELPER: get current user identity ───────────────
async function getUserContext(userId: string) {
  const [planner, consumer] = await Promise.all([
    prisma.planner.findFirst({ where: { userId }, include: { user: true } }),
    prisma.consumer.findFirst({ where: { userId }, include: { user: true } }),
  ]);
  return { planner, consumer, user: planner?.user || consumer?.user };
}

// ─── 1. PREVIEW: compute schedule before commitment ───
instalmentsRouter.post('/preview',
  authenticate,
  [body('totalAmount').isNumeric(), body('instalmentCount').isIn([3, 6])],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { totalAmount, instalmentCount, startDate } = req.body;
      const count = Number(instalmentCount) as 3 | 6;
      const feeRate = FEES[count];

      const result = computeInstalmentSchedule({
        totalAmount: Number(totalAmount),
        instalmentCount: count,
        serviceFeeRate: feeRate,
        startDate: startDate ? new Date(startDate) : undefined,
      });

      res.json({
        success: true,
        preview: {
          ...result,
          feeRate,
          feeDescription: `${feeRate}% service fee for ${count}-month plan`,
          noInterest: true,
          noCreditCheck: true,
          eligibleAmount: { min: 100000, max: 15000000 },
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── 2. LIST my instalment plans ─────────────────────
instalmentsRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { planner, consumer } = await getUserContext(userId);

    const where: any = planner
      ? { plannerId: planner.id }
      : consumer
        ? { consumerId: consumer.id }
        : { id: '' };

    const plans = await prisma.instalmentPlan.findMany({
      where,
      include: {
        booking: {
          include: { vendor: { select: { businessName: true, category: true } } },
        },
        payments: { orderBy: { instalmentNumber: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, plans });
  } catch (err) { next(err); }
});

// ─── 3. GET single plan ───────────────────────────────
instalmentsRouter.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await prisma.instalmentPlan.findUnique({
      where: { id: req.params.id },
      include: {
        booking: {
          include: {
            vendor: { select: { businessName: true, category: true, city: true } },
          },
        },
        payments: { orderBy: { instalmentNumber: 'asc' } },
      },
    });
    if (!plan) throw new AppError('Plan not found', 404);
    res.json({ success: true, plan });
  } catch (err) { next(err); }
});

// ─── 4. CREATE instalment plan for a booking ─────────
instalmentsRouter.post('/',
  authenticate,
  [
    body('bookingId').isUUID(),
    body('instalmentCount').isIn([3, 6]),
    body('startDate').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { bookingId, instalmentCount, startDate } = req.body;
      const count = Number(instalmentCount) as 3 | 6;

      const { planner, consumer, user } = await getUserContext(userId);
      if (!user) throw new AppError('User not found', 404);

      // ─── PLAN GATE: 6-month plans require Growth+ ──────────────────────
      if (count === 6 && planner && planner.plan === 'STARTER') {
        throw new AppError(
          '6-month instalment plans require the Growth plan (₦150,000/mo). 3-month plans are available on Starter.',
          403
        );
      }

      // Verify booking belongs to this user
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          OR: [
            ...(planner ? [{ plannerId: planner.id }] : []),
            ...(consumer ? [{ consumerId: consumer.id }] : []),
          ],
        },
        include: { vendor: { select: { businessName: true } } },
      });
      if (!booking) throw new AppError('Booking not found', 404);
      if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
        throw new AppError('Cannot create instalment plan for a cancelled or completed booking', 400);
      }

      // Check no existing active plan for this booking
      const existingPlan = await prisma.instalmentPlan.findFirst({
        where: { bookingId, status: { in: ['ACTIVE', 'PAUSED'] } },
      });
      if (existingPlan) throw new AppError('An active instalment plan already exists for this booking', 409);

      // Validate amount limits (₦100K – ₦15M)
      const totalAmount = Number(booking.totalAmount);
      if (totalAmount < 100000) throw new AppError('Minimum instalment amount is ₦100,000', 400);
      if (totalAmount > 15000000) throw new AppError('Maximum instalment amount is ₦15,000,000', 400);

      const feeRate = FEES[count];
      const schedule = computeInstalmentSchedule({
        totalAmount,
        instalmentCount: count,
        serviceFeeRate: feeRate,
        startDate: startDate ? new Date(startDate) : undefined,
      });

      const reference = generateReference('INST');

      // Ensure Paystack customer exists
      const customer = await createOrFetchCustomer(
        user.email,
        user.firstName,
        user.lastName
      );

      // Create the plan and all payment records in a transaction
      const plan = await prisma.$transaction(async (tx) => {
        const newPlan = await tx.instalmentPlan.create({
          data: {
            reference,
            bookingId,
            plannerId: planner?.id,
            consumerId: consumer?.id,
            totalAmount,
            instalmentCount: count,
            instalmentAmount: schedule.instalmentAmount,
            serviceFeeRate: feeRate,
            serviceFeeAmount: schedule.serviceFeeAmount,
            grandTotal: schedule.grandTotal,
            currency: booking.currency,
            paystackCustomerCode: customer.customer_code,
            paystackEmail: user.email,
            nextDueDate: schedule.schedule[0].dueDate,
            status: 'ACTIVE',
          },
        });

        // Create all instalment payment records
        await tx.instalmentPayment.createMany({
          data: schedule.schedule.map(item => ({
            planId: newPlan.id,
            instalmentNumber: item.instalmentNumber,
            amount: item.amount,
            dueDate: item.dueDate,
            status: item.instalmentNumber === 1 ? 'PENDING' : 'SCHEDULED',
          })),
        });

        return newPlan;
      });

      // Initialize first Paystack payment (booker pays instalment 1 now via redirect)
      const firstPayment = schedule.schedule[0];
      const paymentRef = `${reference}-I1`;

      const paymentInit = await initializeTransaction({
        email: user.email,
        amount: firstPayment.amount,
        reference: paymentRef,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback?type=instalment&planId=${plan.id}`,
        metadata: {
          type: 'INSTALMENT_FIRST',
          planId: plan.id,
          planReference: reference,
          instalmentNumber: 1,
          bookingId,
          vendorName: booking.vendor.businessName,
          saveCard: true,  // Flag for webhook to save authorization code
        },
      });

      logger.info(`Instalment plan created: ${reference} — ${count}x instalments for booking ${bookingId}`);

      res.status(201).json({
        success: true,
        plan: {
          ...plan,
          payments: schedule.schedule,
        },
        payment: {
          authorizationUrl: paymentInit.authorization_url,
          reference: paymentRef,
          amount: firstPayment.amount,
          label: firstPayment.label,
        },
        summary: {
          totalAmount,
          serviceFeeAmount: schedule.serviceFeeAmount,
          grandTotal: schedule.grandTotal,
          monthlyAmount: schedule.monthlyAmount,
          instalmentCount: count,
          feeRate,
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── 5. CANCEL plan ──────────────────────────────────
instalmentsRouter.post('/:id/cancel',
  authenticate,
  [body('reason').optional().trim()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { planner, consumer } = await getUserContext(userId);
      const { reason } = req.body;

      const plan = await prisma.instalmentPlan.findUnique({ where: { id: req.params.id } });
      if (!plan) throw new AppError('Plan not found', 404);

      // Verify ownership
      const isOwner = (planner && plan.plannerId === planner.id) ||
                      (consumer && plan.consumerId === consumer.id);
      if (!isOwner) throw new AppError('Access denied', 403);

      if (!['ACTIVE', 'PAUSED'].includes(plan.status)) {
        throw new AppError('Only active or paused plans can be cancelled', 400);
      }

      await prisma.$transaction([
        // Cancel the plan
        prisma.instalmentPlan.update({
          where: { id: plan.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        }),
        // Mark future payments as waived
        prisma.instalmentPayment.updateMany({
          where: { planId: plan.id, status: { in: ['SCHEDULED', 'PENDING'] } },
          data: { status: 'WAIVED' },
        }),
      ]);

      res.json({ success: true, message: 'Instalment plan cancelled' });
    } catch (err) { next(err); }
  }
);

// ─── 6. RETRY failed payment ─────────────────────────
instalmentsRouter.post('/:id/retry/:paymentId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { planner, consumer, user } = await getUserContext(userId);

      const plan = await prisma.instalmentPlan.findUnique({
        where: { id: req.params.id },
        include: { payments: { where: { id: req.params.paymentId } } },
      });
      if (!plan) throw new AppError('Plan not found', 404);

      const isOwner = (planner && plan.plannerId === planner.id) ||
                      (consumer && plan.consumerId === consumer.id);
      if (!isOwner) throw new AppError('Access denied', 403);

      const payment = plan.payments[0];
      if (!payment) throw new AppError('Payment not found', 404);
      if (payment.status !== 'FAILED') throw new AppError('Only failed payments can be retried', 400);

      // If we have auth code, charge directly; otherwise redirect to Paystack
      if (plan.paystackAuthCode) {
        const ref = `${plan.reference}-I${payment.instalmentNumber}-R${payment.retryCount + 1}`;
        const charge = await chargeAuthorization({
          email: plan.paystackEmail!,
          amount: Number(payment.amount),
          authorizationCode: plan.paystackAuthCode,
          reference: ref,
          metadata: {
            type: 'INSTALMENT_RETRY',
            planId: plan.id,
            instalmentNumber: payment.instalmentNumber,
          },
        });

        const success = charge.status === 'success';
        await prisma.instalmentPayment.update({
          where: { id: payment.id },
          data: {
            status: success ? 'PAID' : 'FAILED',
            paidAt: success ? new Date() : undefined,
            paystackReference: ref,
            retryCount: { increment: 1 },
          },
        });

        if (success) {
          await updatePlanAfterPayment(plan.id, Number(payment.amount));
        }

        res.json({ success, message: success ? 'Payment retried successfully' : 'Retry failed' });
      } else {
        // Redirect to Paystack for fresh payment
        const ref = `${plan.reference}-I${payment.instalmentNumber}-R${payment.retryCount + 1}`;
        const paymentInit = await initializeTransaction({
          email: plan.paystackEmail!,
          amount: Number(payment.amount),
          reference: ref,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback?type=instalment&planId=${plan.id}`,
          metadata: {
            type: 'INSTALMENT_RETRY',
            planId: plan.id,
            instalmentNumber: payment.instalmentNumber,
          },
        });
        res.json({ success: true, authorizationUrl: paymentInit.authorization_url });
      }
    } catch (err) { next(err); }
  }
);

// ─── 7. ADMIN: trigger due charges ───────────────────
// Called by a cron job or Railway scheduled task
instalmentsRouter.post('/cron/charge-due',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Simple shared secret auth for cron
      const secret = req.headers['x-cron-secret'];
      if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Find all active plans with payments due in the next 3 days
      const duePlans = await prisma.instalmentPlan.findMany({
        where: {
          status: 'ACTIVE',
          paystackAuthCode: { not: null },
          payments: {
            some: {
              status: { in: ['SCHEDULED', 'PENDING'] },
              dueDate: { lte: threeDaysFromNow },
            },
          },
        },
        include: {
          payments: {
            where: {
              status: { in: ['SCHEDULED', 'PENDING'] },
              dueDate: { lte: threeDaysFromNow },
            },
            orderBy: { instalmentNumber: 'asc' },
            take: 1,
          },
        },
      });

      const results: any[] = [];

      for (const plan of duePlans) {
        const duePayment = plan.payments[0];
        if (!duePayment) continue;

        // Mark as processing
        await prisma.instalmentPayment.update({
          where: { id: duePayment.id },
          data: { status: 'PROCESSING' },
        });

        const ref = `${plan.reference}-I${duePayment.instalmentNumber}`;

        try {
          const charge = await chargeAuthorization({
            email: plan.paystackEmail!,
            amount: Number(duePayment.amount),
            authorizationCode: plan.paystackAuthCode!,
            reference: ref,
            metadata: {
              type: 'INSTALMENT_AUTO',
              planId: plan.id,
              instalmentNumber: duePayment.instalmentNumber,
            },
          });

          const success = charge.status === 'success';

          await prisma.instalmentPayment.update({
            where: { id: duePayment.id },
            data: {
              status: success ? 'PAID' : 'FAILED',
              paidAt: success ? new Date() : undefined,
              paystackReference: ref,
              failureReason: success ? null : charge.message,
            },
          });

          if (success) {
            await updatePlanAfterPayment(plan.id, Number(duePayment.amount));
            // Send payment receipt email
            void sendInstalmentEmail(plan, duePayment, 'paid');
          } else {
            await prisma.instalmentPlan.update({
              where: { id: plan.id },
              data: { failureCount: { increment: 1 } },
            });
            void sendInstalmentEmail(plan, duePayment, 'failed');
          }

          results.push({ planId: plan.id, ref, success });
        } catch (err: any) {
          await prisma.instalmentPayment.update({
            where: { id: duePayment.id },
            data: { status: 'FAILED', failureReason: err.message, retryCount: { increment: 1 } },
          });
          results.push({ planId: plan.id, ref, success: false, error: err.message });
        }
      }

      logger.info(`Instalment cron: processed ${results.length} charges`);
      res.json({ success: true, processed: results.length, results });
    } catch (err) { next(err); }
  }
);

// ─── WEBHOOK HANDLER (instalment-specific) ────────────
// Handles charge.success for instalment payments
export async function handleInstalmentWebhook(event: string, data: any) {
  const { reference, amount, metadata, authorization } = data;

  if (!metadata?.planId || !metadata?.type?.startsWith('INSTALMENT')) return false;

  const amountNGN = amount / 100;
  const planId = metadata.planId;
  const instalmentNumber = metadata.instalmentNumber;

  logger.info(`Instalment webhook: ${event} — plan ${planId}, instalment ${instalmentNumber}`);

  const plan = await prisma.instalmentPlan.findUnique({
    where: { id: planId },
    include: { payments: { orderBy: { instalmentNumber: 'asc' } } },
  });
  if (!plan) return false;

  if (event === 'charge.success') {
    // Save authorization code from first payment (enables future auto-charges)
    const isFirst = metadata.type === 'INSTALMENT_FIRST' || instalmentNumber === 1;
    const updatePlanData: any = {};

    if (isFirst && authorization?.reusable && authorization?.authorization_code) {
      updatePlanData.paystackAuthCode = authorization.authorization_code;
      logger.info(`Saved reusable auth code for plan ${planId}`);
    }

    // Mark payment as paid
    await prisma.instalmentPayment.updateMany({
      where: {
        planId,
        instalmentNumber: Number(instalmentNumber),
        status: { in: ['PENDING', 'PROCESSING', 'SCHEDULED'] },
      },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paystackReference: reference,
        paystackChargeId: String(data.id),
      },
    });

    await updatePlanAfterPayment(planId, amountNGN, updatePlanData);
    void sendInstalmentEmail(plan, { instalmentNumber, amount: amountNGN }, 'paid');

  } else if (event === 'charge.failed') {
    await prisma.instalmentPayment.updateMany({
      where: { planId, instalmentNumber: Number(instalmentNumber), status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        failureReason: data.gateway_response,
        retryCount: { increment: 1 },
      },
    });

    await prisma.instalmentPlan.update({
      where: { id: planId },
      data: { failureCount: { increment: 1 } },
    });

    void sendInstalmentEmail(plan, { instalmentNumber, amount: amountNGN }, 'failed');
  }

  return true;
}

// ─── HELPERS ─────────────────────────────────────────
async function updatePlanAfterPayment(planId: string, amountPaid: number, extraData?: any) {
  const plan = await prisma.instalmentPlan.findUnique({
    where: { id: planId },
    include: { payments: { orderBy: { instalmentNumber: 'asc' } } },
  });
  if (!plan) return;

  const newAmountPaid = Number(plan.amountPaid) + amountPaid;
  const allPaid = plan.payments.every(p =>
    p.status === 'PAID' || p.status === 'WAIVED' || (p.status === 'SCHEDULED' ? false : true)
  );

  // Find next due payment
  const nextPayment = plan.payments.find(p =>
    p.status === 'SCHEDULED' || p.status === 'PENDING'
  );

  const isComplete = newAmountPaid >= Number(plan.grandTotal) - 1; // -1 for rounding

  await prisma.instalmentPlan.update({
    where: { id: planId },
    data: {
      amountPaid: newAmountPaid,
      nextDueDate: nextPayment?.dueDate || null,
      status: isComplete ? 'COMPLETED' : 'ACTIVE',
      completedAt: isComplete ? new Date() : undefined,
      failureCount: 0, // Reset on successful payment
      ...(extraData || {}),
    },
  });

  // If complete, update booking payment status
  if (isComplete) {
    await prisma.booking.update({
      where: { id: plan.bookingId },
      data: { paymentStatus: 'PAID', balancePaidAt: new Date() },
    });
  }
}

async function sendInstalmentEmail(plan: any, payment: any, type: 'paid' | 'failed' | 'reminder') {
  try {
    const email = plan.paystackEmail;
    if (!email) return;

    const templates = {
      paid: {
        subject: `✅ Instalment ${payment.instalmentNumber} paid — ${plan.reference}`,
        template: 'instalment-paid',
        data: {
          instalmentNumber: payment.instalmentNumber,
          totalInstalments: plan.instalmentCount,
          amountPaid: `₦${Number(payment.amount).toLocaleString('en-NG')}`,
          totalPaid: `₦${(Number(plan.amountPaid) + Number(payment.amount)).toLocaleString('en-NG')}`,
          grandTotal: `₦${Number(plan.grandTotal).toLocaleString('en-NG')}`,
          nextDueDate: plan.nextDueDate ? new Date(plan.nextDueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Plan complete',
          reference: plan.reference,
        },
      },
      failed: {
        subject: `⚠️ Instalment payment failed — ${plan.reference}`,
        template: 'instalment-failed',
        data: {
          instalmentNumber: payment.instalmentNumber,
          amount: `₦${Number(payment.amount).toLocaleString('en-NG')}`,
          reference: plan.reference,
          retryUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/instalments/${plan.id}`,
        },
      },
      reminder: {
        subject: `⏰ Payment due in 3 days — ${plan.reference}`,
        template: 'instalment-reminder',
        data: {
          instalmentNumber: payment.instalmentNumber,
          amount: `₦${Number(payment.amount).toLocaleString('en-NG')}`,
          dueDate: payment.dueDate ? new Date(payment.dueDate).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
          reference: plan.reference,
        },
      },
    };

    const tpl = templates[type];
    await sendEmail({ to: email, subject: tpl.subject, template: 'custom-campaign', data: { body: JSON.stringify(tpl.data), ...tpl.data } });
  } catch (err) {
    logger.error('Failed to send instalment email:', err);
  }
}
