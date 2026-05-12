import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { verifyWebhookSignature, initiateRefund } from '../services/paystack.service';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/authenticate';
import { handleInstalmentWebhook } from './instalments';

export const paymentsRouter = Router();

// ─── PAYSTACK WEBHOOK ────────────────────────────────
// CRITICAL: Must use raw body for signature verification
paymentsRouter.post('/webhook/paystack',
  async (req: Request, res: Response) => {
    const signature = req.headers['x-paystack-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    // Always respond 200 immediately to acknowledge receipt
    res.sendStatus(200);

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid Paystack webhook signature');
      return;
    }

    const { event, data } = req.body;
    logger.info(`Paystack webhook received: ${event}`);

    try {
      switch (event) {
        case 'charge.success':
          // Check if this is an instalment payment first
          if (!(await handleInstalmentWebhook(event, data))) {
            await handleChargeSuccess(data);
          }
          break;
        case 'charge.failed':
          await handleInstalmentWebhook(event, data);
          break;
        case 'transfer.success':
          await handleTransferSuccess(data);
          break;
        case 'refund.processed':
          await handleRefundProcessed(data);
          break;
        default:
          logger.info(`Unhandled Paystack event: ${event}`);
      }
    } catch (err) {
      logger.error('Webhook processing error:', err);
    }
  }
);

// ─── HANDLE SUCCESSFUL CHARGE ────────────────────────
async function handleChargeSuccess(data: any) {
  const { reference, amount, metadata, customer } = data;
  const amountNGN = amount / 100; // Convert from kobo

  logger.info(`Payment success: ${reference} — ₦${amountNGN}`);

  // Extract booking reference from payment reference
  // Format: OWB-XXXXX-DEP (deposit) or OWB-XXXXX-BAL (balance)
  const isDeposit = reference.endsWith('-DEP');
  const isBalance = reference.endsWith('-BAL');
  const bookingRef = reference.replace(/-DEP$|-BAL$/, '');

  const booking = await prisma.booking.findFirst({
    where: { reference: bookingRef },
    include: {
      vendor: {
        include: { user: { select: { email: true, firstName: true } } }
      },
      planner: { include: { user: true } },
      consumer: { include: { user: true } },
    }
  });

  if (!booking) {
    logger.warn(`No booking found for reference: ${bookingRef}`);
    return;
  }

  if (isDeposit) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'DEPOSIT_PAID',
        paystackDepositRef: reference,
        depositPaidAt: new Date(),
        status: 'CONFIRMED',
      }
    });

    // Notify vendor of confirmed booking
    await sendEmail({
      to: booking.vendor.user.email,
      subject: `New Booking Confirmed — Deposit Received`,
      template: 'vendor-booking-confirmed',
      data: {
        vendorFirstName: booking.vendor.user.firstName,
        vendorName: booking.vendor.businessName,
        eventDate: booking.eventDate,
        depositAmount: `₦${amountNGN.toLocaleString()}`,
        balanceAmount: `₦${Number(booking.vendorAmount).toLocaleString()}`,
        reference: booking.reference,
      }
    });

    // Notify booker
    const bookerUser = booking.planner?.user || booking.consumer?.user;
    if (bookerUser) {
      await sendEmail({
        to: bookerUser.email,
        subject: `Booking Confirmed! Deposit paid ✓`,
        template: 'booker-deposit-confirmed',
        data: {
          firstName: bookerUser.firstName,
          vendorName: booking.vendor.businessName,
          eventDate: booking.eventDate,
          depositPaid: `₦${amountNGN.toLocaleString()}`,
          reference: booking.reference,
        }
      });
    }

    logger.info(`Booking ${booking.id} confirmed after deposit payment`);
  }

  if (isBalance) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paystackBalanceRef: reference,
        balancePaidAt: new Date(),
      }
    });

    logger.info(`Balance paid for booking ${booking.id}`);
  }
}

// ─── HANDLE TRANSFER SUCCESS (Vendor payout) ─────────
async function handleTransferSuccess(data: any) {
  const { reference, amount } = data;
  logger.info(`Vendor payout successful: ${reference} — ₦${amount / 100}`);
  // Update booking payout status
}

// ─── HANDLE REFUND ───────────────────────────────────
async function handleRefundProcessed(data: any) {
  const { transaction_reference, amount } = data;
  logger.info(`Refund processed: ${transaction_reference} — ₦${amount / 100}`);

  const bookingRef = transaction_reference.replace(/-DEP$|-BAL$/, '');
  await prisma.booking.updateMany({
    where: { reference: bookingRef },
    data: { paymentStatus: 'REFUNDED' }
  });
}

// ─── INITIALIZE BALANCE PAYMENT ──────────────────────
paymentsRouter.post('/balance/:bookingId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId } = req.params;
    const { initializeTransaction } = await import('../services/paystack.service');

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        vendor: true,
        planner: { include: { user: true } },
        consumer: { include: { user: true } },
      }
    });

    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.paymentStatus !== 'DEPOSIT_PAID') {
      return res.status(400).json({ success: false, error: 'Deposit must be paid first' });
    }

    const bookerUser = booking.planner?.user || booking.consumer?.user;
    const balanceAmount = Number(booking.totalAmount) - Number(booking.depositAmount);

    const paymentInit = await initializeTransaction({
      email: bookerUser!.email,
      amount: balanceAmount,
      reference: `${booking.reference}-BAL`,
      metadata: {
        bookingId: booking.id,
        type: 'BALANCE',
        vendorName: booking.vendor.businessName,
      },
    });

    res.json({
      success: true,
      payment: {
        authorizationUrl: paymentInit.authorization_url,
        reference: paymentInit.reference,
        balanceAmount,
      }
    });
  } catch (err) {
    next(err);
  }
});
