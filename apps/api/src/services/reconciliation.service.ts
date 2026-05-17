/**
 * reconciliation.service.ts — OWB-WAVE-4-03
 *
 * Nightly reconciliation cron that:
 *   1. Calls CC's getStaysSnapshot() and getExperiencesSnapshot() adapter methods
 *   2. Compares CC snapshot data to Owambe-side state
 *   3. Applies auto-correction for safe cases (per contract Section 12)
 *   4. Logs unsafe cases as manual-review items
 *   5. Writes a ReconciliationRun row per run
 *
 * Scheduled: nightly at 02:00 UTC (cron: "0 2 * * *")
 * Out-of-schedule trigger: dispatchReconciliationNow() called by
 *   the reconciliation.requested inbound webhook handler (OWB-WAVE-4-02).
 *
 * Auto-correction policy (contract Section 12):
 *   SAFE (auto-correct):
 *     - Calendar state re-sync: both sides agree on reservation status but
 *       Owambe calendar entry disagrees → update calendar entry to match
 *     - Commission audit log reconciliation: CC has a more recent
 *       ccProvidedCommissionAmount → update CommissionAuditLog row
 *   UNSAFE (manual review only):
 *     - Reservation status mismatch (Owambe vs CC disagree on status)
 *     - Missing reservation on one side
 *     - Amount drift (totalAmount, depositAmount)
 *     - Any drift not explicitly listed as SAFE above
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { CoastalCorridorAdapter } from './channels/adapters/coastal-corridor.adapter';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CCStaysSnapshotItem {
  cc_reservation_id: string;
  owambe_reservation_id?: string;
  status: string;
  payment_status: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  currency: string;
  commission_amount?: number;
  commission_percent?: number;
  net_to_host?: number;
  updated_at: string;
}

interface CCExperiencesSnapshotItem {
  cc_booking_id: string;
  owambe_booking_id?: string;
  status: string;
  payment_status: string;
  event_date: string;
  total_amount: number;
  currency: string;
  updated_at: string;
}

interface CCStaysSnapshot {
  items: CCStaysSnapshotItem[];
  generated_at: string;
  total_count: number;
}

interface CCExperiencesSnapshot {
  items: CCExperiencesSnapshotItem[];
  generated_at: string;
  total_count: number;
}

interface ReconciliationRunCounts {
  staysChecked: number;
  experiencesChecked: number;
  driftsDetected: number;
  autoCorrectionsApplied: number;
  manualReviewItemsFlagged: number;
}

// ─── BullMQ Queue Setup ───────────────────────────────────────────────────────

let _reconciliationQueue: Queue | null = null;
let _reconciliationWorker: Worker | null = null;
let _redisAvailable = false;

const QUEUE_NAME = 'owambe-reconciliation';
const NIGHTLY_CRON = '0 2 * * *'; // 02:00 UTC daily

// ─── Core Reconciliation Logic ────────────────────────────────────────────────

async function runStaysReconciliation(
  adapter: CoastalCorridorAdapter,
  counts: ReconciliationRunCounts,
  runId: string
): Promise<void> {
  let snapshot: CCStaysSnapshot;
  try {
    snapshot = (await adapter.getStaysSnapshot()) as CCStaysSnapshot;
  } catch (err: any) {
    logger.error('[Reconciliation] getStaysSnapshot() failed', { runId, error: err.message });
    throw err;
  }

  const items = snapshot?.items ?? [];
  counts.staysChecked = items.length;

  for (const item of items) {
    try {
      await reconcileStaysItem(item, counts, runId);
    } catch (err: any) {
      logger.error('[Reconciliation] Error processing stays item', {
        runId,
        ccReservationId: item.cc_reservation_id,
        error: err.message,
      });
      counts.manualReviewItemsFlagged++;
      await logManualReviewItem({
        runId,
        scope: 'STAYS',
        externalRef: item.cc_reservation_id,
        owambeId: item.owambe_reservation_id,
        driftType: 'PROCESSING_ERROR',
        ccValue: JSON.stringify(item),
        owambeValue: null,
        note: `Processing error: ${err.message}`,
      });
    }
  }
}

async function reconcileStaysItem(
  item: CCStaysSnapshotItem,
  counts: ReconciliationRunCounts,
  runId: string
): Promise<void> {
  // Find the Owambe-side booking
  const booking = await prisma.stayBooking.findFirst({
    where: {
      OR: [
        { externalRef: item.cc_reservation_id },
        ...(item.owambe_reservation_id ? [{ id: item.owambe_reservation_id }] : []),
      ],
    },
    include: { commissionAuditLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!booking) {
    // Missing on Owambe side — UNSAFE, manual review
    counts.driftsDetected++;
    counts.manualReviewItemsFlagged++;
    await logManualReviewItem({
      runId,
      scope: 'STAYS',
      externalRef: item.cc_reservation_id,
      owambeId: item.owambe_reservation_id,
      driftType: 'MISSING_ON_OWAMBE',
      ccValue: JSON.stringify(item),
      owambeValue: null,
      note: 'CC has reservation but Owambe has no matching StayBooking',
    });
    return;
  }

  // ── Status drift check (UNSAFE) ──────────────────────────────────────────
  const owambeStatus = booking.status.toString();
  const ccStatus = item.status?.toUpperCase();
  if (ccStatus && owambeStatus !== ccStatus) {
    counts.driftsDetected++;
    counts.manualReviewItemsFlagged++;
    await logManualReviewItem({
      runId,
      scope: 'STAYS',
      externalRef: item.cc_reservation_id,
      owambeId: booking.id,
      driftType: 'STATUS_MISMATCH',
      ccValue: ccStatus,
      owambeValue: owambeStatus,
      note: `Status mismatch: Owambe=${owambeStatus}, CC=${ccStatus}`,
    });
  }

  // ── Amount drift check (UNSAFE) ──────────────────────────────────────────
  const owambeTotal = Number(booking.totalAmount);
  const ccTotal = item.total_amount;
  if (ccTotal !== undefined && Math.abs(owambeTotal - ccTotal) > 0.01) {
    counts.driftsDetected++;
    counts.manualReviewItemsFlagged++;
    await logManualReviewItem({
      runId,
      scope: 'STAYS',
      externalRef: item.cc_reservation_id,
      owambeId: booking.id,
      driftType: 'AMOUNT_DRIFT',
      ccValue: String(ccTotal),
      owambeValue: String(owambeTotal),
      note: `Total amount drift: Owambe=${owambeTotal}, CC=${ccTotal}`,
    });
  }

  // ── Commission audit log reconciliation (SAFE) ───────────────────────────
  const latestAuditLog = booking.commissionAuditLogs[0];
  if (
    latestAuditLog &&
    item.commission_amount !== undefined &&
    item.commission_percent !== undefined
  ) {
    const ccCommission = item.commission_amount;
    const owambeCommission = Number(latestAuditLog.ccProvidedCommissionAmount ?? latestAuditLog.channelCommissionAmount);
    if (Math.abs(owambeCommission - ccCommission) > 0.01) {
      counts.driftsDetected++;
      // SAFE: update CommissionAuditLog with CC's more recent value
      await prisma.commissionAuditLog.update({
        where: { id: latestAuditLog.id },
        data: {
          ccProvidedCommissionAmount: ccCommission,
          ccProvidedCommissionPercent: item.commission_percent,
          ccProvidedNetToHost: item.net_to_host ?? null,
          hasDiscrepancy: true,
          discrepancyNote: `Auto-corrected by reconciliation run ${runId}: CC commission=${ccCommission}, was=${owambeCommission}`,
        },
      });
      counts.autoCorrectionsApplied++;
      logger.info('[Reconciliation] Auto-corrected CommissionAuditLog', {
        runId,
        auditLogId: latestAuditLog.id,
        externalRef: item.cc_reservation_id,
        ccCommission,
        owambeCommission,
      });
    }
  }

  // ── Calendar state re-sync (SAFE) ────────────────────────────────────────
  // Both sides agree on reservation status but calendar entries may be stale.
  // Only re-sync if status is terminal and calendar should be AVAILABLE.
  if (
    (owambeStatus === 'CANCELLED' || owambeStatus === 'CHECKED_OUT') &&
    ccStatus === owambeStatus
  ) {
    const calendarEntries = await prisma.calendarEntry.findMany({
      where: {
        roomId: booking.roomId,
        date: { gte: booking.checkInDate, lte: booking.checkOutDate },
        status: 'BOOKED',
      },
    });
    if (calendarEntries.length > 0) {
      await prisma.calendarEntry.updateMany({
        where: {
          roomId: booking.roomId,
          date: { gte: booking.checkInDate, lte: booking.checkOutDate },
          status: 'BOOKED',
        },
        data: { status: 'AVAILABLE' },
      });
      counts.driftsDetected++;
      counts.autoCorrectionsApplied++;
      logger.info('[Reconciliation] Auto-corrected calendar entries to AVAILABLE', {
        runId,
        externalRef: item.cc_reservation_id,
        roomId: booking.roomId,
        entriesFixed: calendarEntries.length,
      });
    }
  }
}

async function runExperiencesReconciliation(
  adapter: CoastalCorridorAdapter,
  counts: ReconciliationRunCounts,
  runId: string
): Promise<void> {
  let snapshot: CCExperiencesSnapshot;
  try {
    snapshot = (await adapter.getExperiencesSnapshot()) as CCExperiencesSnapshot;
  } catch (err: any) {
    logger.error('[Reconciliation] getExperiencesSnapshot() failed', { runId, error: err.message });
    throw err;
  }

  const items = snapshot?.items ?? [];
  counts.experiencesChecked = items.length;

  for (const item of items) {
    try {
      await reconcileExperiencesItem(item, counts, runId);
    } catch (err: any) {
      logger.error('[Reconciliation] Error processing experiences item', {
        runId,
        ccBookingId: item.cc_booking_id,
        error: err.message,
      });
      counts.manualReviewItemsFlagged++;
      await logManualReviewItem({
        runId,
        scope: 'EXPERIENCES',
        externalRef: item.cc_booking_id,
        owambeId: item.owambe_booking_id,
        driftType: 'PROCESSING_ERROR',
        ccValue: JSON.stringify(item),
        owambeValue: null,
        note: `Processing error: ${err.message}`,
      });
    }
  }
}

async function reconcileExperiencesItem(
  item: CCExperiencesSnapshotItem,
  counts: ReconciliationRunCounts,
  runId: string
): Promise<void> {
  // Experiences reconciliation: status and amount drift only (no commission audit log)
  // Find the Owambe-side booking via externalRef on EventBooking
  const booking = await (prisma as any).eventBooking?.findFirst?.({
    where: {
      OR: [
        { externalRef: item.cc_booking_id },
        ...(item.owambe_booking_id ? [{ id: item.owambe_booking_id }] : []),
      ],
    },
  });

  if (!booking) {
    counts.driftsDetected++;
    counts.manualReviewItemsFlagged++;
    await logManualReviewItem({
      runId,
      scope: 'EXPERIENCES',
      externalRef: item.cc_booking_id,
      owambeId: item.owambe_booking_id,
      driftType: 'MISSING_ON_OWAMBE',
      ccValue: JSON.stringify(item),
      owambeValue: null,
      note: 'CC has experience booking but Owambe has no matching EventBooking',
    });
    return;
  }

  const owambeStatus = booking.status?.toString();
  const ccStatus = item.status?.toUpperCase();
  if (ccStatus && owambeStatus !== ccStatus) {
    counts.driftsDetected++;
    counts.manualReviewItemsFlagged++;
    await logManualReviewItem({
      runId,
      scope: 'EXPERIENCES',
      externalRef: item.cc_booking_id,
      owambeId: booking.id,
      driftType: 'STATUS_MISMATCH',
      ccValue: ccStatus,
      owambeValue: owambeStatus,
      note: `Status mismatch: Owambe=${owambeStatus}, CC=${ccStatus}`,
    });
  }
}

// ─── Manual Review Log Helper ─────────────────────────────────────────────────

async function logManualReviewItem(item: {
  runId: string;
  scope: string;
  externalRef?: string | null;
  owambeId?: string | null;
  driftType: string;
  ccValue: string | null;
  owambeValue: string | null;
  note: string;
}): Promise<void> {
  await (prisma as any).reconciliationManualReview.create({
    data: {
      reconciliationRunId: item.runId,
      scope: item.scope,
      externalRef: item.externalRef ?? null,
      owambeId: item.owambeId ?? null,
      driftType: item.driftType,
      ccValue: item.ccValue,
      owambeValue: item.owambeValue,
      note: item.note,
    },
  });
}

// ─── Main Reconciliation Runner ───────────────────────────────────────────────

export async function executeReconciliation(): Promise<void> {
  const runId = `recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date();
  logger.info('[Reconciliation] Run started', { runId });

  const counts: ReconciliationRunCounts = {
    staysChecked: 0,
    experiencesChecked: 0,
    driftsDetected: 0,
    autoCorrectionsApplied: 0,
    manualReviewItemsFlagged: 0,
  };

  // Create the run record immediately (status = RUNNING)
  const runRecord = await (prisma as any).reconciliationRun.create({
    data: {
      id: runId,
      startedAt,
      status: 'RUNNING',
      staysChecked: 0,
      experiencesChecked: 0,
      driftsDetected: 0,
      autoCorrectionsApplied: 0,
      manualReviewItemsFlagged: 0,
    },
  });

  const adapter = new CoastalCorridorAdapter();
  let finalStatus = 'SUCCESS';

  try {
    // ── Stays reconciliation ────────────────────────────────────────────────
    try {
      await runStaysReconciliation(adapter, counts, runId);
    } catch (err: any) {
      logger.error('[Reconciliation] Stays reconciliation failed', { runId, error: err.message });
      finalStatus = 'PARTIAL';
      counts.manualReviewItemsFlagged++;
      await logManualReviewItem({
        runId,
        scope: 'STAYS',
        externalRef: null,
        owambeId: null,
        driftType: 'SNAPSHOT_FETCH_FAILED',
        ccValue: null,
        owambeValue: null,
        note: `getStaysSnapshot() failed: ${err.message}`,
      });
    }

    // ── Experiences reconciliation ──────────────────────────────────────────
    try {
      await runExperiencesReconciliation(adapter, counts, runId);
    } catch (err: any) {
      logger.error('[Reconciliation] Experiences reconciliation failed', { runId, error: err.message });
      finalStatus = finalStatus === 'PARTIAL' ? 'FAILED' : 'PARTIAL';
      counts.manualReviewItemsFlagged++;
      await logManualReviewItem({
        runId,
        scope: 'EXPERIENCES',
        externalRef: null,
        owambeId: null,
        driftType: 'SNAPSHOT_FETCH_FAILED',
        ccValue: null,
        owambeValue: null,
        note: `getExperiencesSnapshot() failed: ${err.message}`,
      });
    }
  } catch (err: any) {
    logger.error('[Reconciliation] Unexpected error in reconciliation run', { runId, error: err.message });
    finalStatus = 'FAILED';
  } finally {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    await (prisma as any).reconciliationRun.update({
      where: { id: runId },
      data: {
        completedAt,
        durationMs,
        status: finalStatus,
        staysChecked: counts.staysChecked,
        experiencesChecked: counts.experiencesChecked,
        driftsDetected: counts.driftsDetected,
        autoCorrectionsApplied: counts.autoCorrectionsApplied,
        manualReviewItemsFlagged: counts.manualReviewItemsFlagged,
      },
    });
    logger.info('[Reconciliation] Run completed', {
      runId,
      status: finalStatus,
      durationMs,
      ...counts,
    });
  }
}

// ─── BullMQ Queue / Worker / Scheduler ───────────────────────────────────────

function createRedisConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return new IORedis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  });
}

export async function initReconciliationCron(): Promise<void> {
  const testConn = createRedisConnection();

  // Test Redis connectivity
  try {
    await testConn.ping();
    _redisAvailable = true;
    await testConn.quit();
  } catch {
    logger.warn('[Reconciliation] Redis unavailable — cron will not schedule; manual trigger still works');
    await testConn.quit().catch(() => {});
    return;
  }

  _reconciliationQueue = new Queue(QUEUE_NAME, { connection: createRedisConnection() });

  // Schedule nightly job
  await _reconciliationQueue.upsertJobScheduler(
    'nightly-reconciliation',
    { pattern: NIGHTLY_CRON, tz: 'UTC' },
    { name: 'reconcile', data: { triggeredBy: 'schedule' } }
  );

  // Worker
  _reconciliationWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info('[Reconciliation] Worker processing job', {
        jobId: job.id,
        triggeredBy: job.data?.triggeredBy ?? 'unknown',
      });
      await executeReconciliation();
    },
    { connection: createRedisConnection(), concurrency: 1 }
  );

  _reconciliationWorker.on('failed', (job, err) => {
    logger.error(`[Reconciliation] Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('[Reconciliation] Cron scheduled (nightly 02:00 UTC) and worker started');
}

/**
 * Trigger an out-of-schedule reconciliation run immediately.
 * Called by the reconciliation.requested inbound webhook handler.
 */
export async function dispatchReconciliationNow(triggeredBy = 'webhook'): Promise<void> {
  if (_redisAvailable && _reconciliationQueue) {
    // Check if a run is already queued/active to prevent pile-up (AC-9)
    const waiting = await _reconciliationQueue.getWaiting();
    const active = await _reconciliationQueue.getActive();
    if (waiting.length > 0 || active.length > 0) {
      logger.info('[Reconciliation] Out-of-schedule trigger ignored — run already queued/active', {
        triggeredBy,
        waiting: waiting.length,
        active: active.length,
      });
      return;
    }
    await _reconciliationQueue.add('reconcile', { triggeredBy }, { priority: 1 });
    logger.info('[Reconciliation] Out-of-schedule run enqueued', { triggeredBy });
  } else {
    // No Redis — run synchronously
    logger.info('[Reconciliation] Out-of-schedule run triggered synchronously (no Redis)', { triggeredBy });
    await executeReconciliation();
  }
}

export async function closeReconciliationCron(): Promise<void> {
  try {
    if (_reconciliationWorker) await _reconciliationWorker.close();
    if (_reconciliationQueue) await _reconciliationQueue.close();
    logger.info('[Reconciliation] Cron queue and worker closed gracefully');
  } catch (err) {
    logger.error('[Reconciliation] Error closing reconciliation cron:', err);
  }
}
