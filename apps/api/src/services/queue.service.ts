// ─── queue.service.ts ────────────────────────────────
// BullMQ-backed job queue for email sending and other async tasks.
// Replaces the previous in-memory queue implementation.
// Requires Redis (REDIS_URL environment variable).
// Falls back to synchronous email sending if Redis is unavailable.

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

// ─── Redis Connection ─────────────────────────────────
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

function createRedisConnection(): IORedis {
  const url = new URL(redisUrl);
  return new IORedis({
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
    lazyConnect: true,
  });
}

// ─── Queue Names ──────────────────────────────────────
export const EMAIL_QUEUE_NAME = 'owambe:email';
export const NOTIFICATION_QUEUE_NAME = 'owambe:notification';

// ─── Job Types ────────────────────────────────────────
interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
  scheduledAt?: string; // ISO string for delayed jobs
}

interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

// ─── Singleton Queues ─────────────────────────────────
let _emailQueue: Queue<EmailJobData> | null = null;
let _notificationQueue: Queue<NotificationJobData> | null = null;
let _emailWorker: Worker<EmailJobData> | null = null;
let _notificationWorker: Worker<NotificationJobData> | null = null;
let _redisAvailable = false;

// ─── Initialise Queues ────────────────────────────────
export async function initQueues(): Promise<void> {
  try {
    const testConn = createRedisConnection();
    await testConn.connect();
    await testConn.ping();
    await testConn.quit();
    _redisAvailable = true;

    const queueOpts = {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }
    };

    _emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: createRedisConnection(),
      ...queueOpts,
    });

    _notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: createRedisConnection(),
      ...queueOpts,
    });

    logger.info('BullMQ queues initialised (email, notification) — Redis connected');
  } catch (err: any) {
    _redisAvailable = false;
    logger.warn(`Redis unavailable (${err.message}). Email queue degraded to synchronous fallback.`);
  }
}

// ─── Start Workers ────────────────────────────────────
export async function startWorkers(): Promise<void> {
  if (!_redisAvailable) {
    logger.warn('Workers not started — Redis unavailable');
    return;
  }

  _emailWorker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { sendEmail } = await import('./email.service');
      await sendEmail({
        to: job.data.to,
        subject: job.data.subject,
        template: job.data.template,
        data: job.data.data,
      });
      logger.info(`Email sent via worker: ${job.data.template} → ${job.data.to}`);
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );

  _emailWorker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${err.message}`);
  });

  _notificationWorker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      // TODO Phase B: implement FCM/APNs push notification
      logger.info(`Notification processed: ${job.data.type} → ${job.data.userId}`);
    },
    { connection: createRedisConnection(), concurrency: 10 }
  );

  _notificationWorker.on('failed', (job, err) => {
    logger.error(`Notification job ${job?.id} failed: ${err.message}`);
  });

  logger.info('BullMQ workers started (email, notification)');
}

// ─── Graceful Shutdown ────────────────────────────────
export async function closeQueues(): Promise<void> {
  try {
    if (_emailWorker) await _emailWorker.close();
    if (_notificationWorker) await _notificationWorker.close();
    if (_emailQueue) await _emailQueue.close();
    if (_notificationQueue) await _notificationQueue.close();
    logger.info('BullMQ queues and workers closed gracefully');
  } catch (err) {
    logger.error('Error closing BullMQ queues:', err);
  }
}

// ─── Queue Health ─────────────────────────────────────
export async function getQueueHealth() {
  if (!_redisAvailable || !_emailQueue) {
    return { status: 'degraded', message: 'Redis unavailable — synchronous fallback active' };
  }
  const [emailCounts, notifCounts] = await Promise.all([
    _emailQueue.getJobCounts(),
    _notificationQueue?.getJobCounts() ?? Promise.resolve({}),
  ]);
  return { status: 'healthy', queues: { email: emailCounts, notification: notifCounts } };
}

// ─── Core Enqueue Functions ───────────────────────────

/**
 * Enqueue an email job. Falls back to synchronous sending if Redis is unavailable.
 */
export async function enqueueEmail(
  job: { to: string; subject: string; template: string; data: Record<string, any> },
  options?: { delayMs?: number; priority?: number }
): Promise<void> {
  if (!_redisAvailable || !_emailQueue) {
    // Synchronous fallback
    const { sendEmail } = await import('./email.service');
    await sendEmail(job);
    return;
  }

  await _emailQueue.add('send-email', {
    to: job.to,
    subject: job.subject,
    template: job.template,
    data: job.data,
  }, {
    delay: options?.delayMs,
    priority: options?.priority,
  });

  logger.debug(`Email queued: ${job.template} → ${job.to}`);
}

/**
 * Enqueue a notification job.
 */
export async function enqueueNotification(job: NotificationJobData): Promise<void> {
  if (!_redisAvailable || !_notificationQueue) {
    logger.warn('Notification queue unavailable, skipping');
    return;
  }
  await _notificationQueue.add('send-notification', job);
}

// ─── Convenience Methods (preserved from previous implementation) ─────────────

export async function queueRegistrationConfirmation(data: {
  to: string;
  firstName: string;
  eventName: string;
  eventDate: Date;
  venue?: string;
  ticketName: string;
  qrCode: string;
}): Promise<void> {
  await enqueueEmail({
    to: data.to,
    subject: `You're registered for ${data.eventName}! 🎉`,
    template: 'registration-confirmation',
    data,
  });
}

export async function queueBookingConfirmation(data: {
  to: string;
  firstName: string;
  vendorName: string;
  eventDate: Date;
  reference: string;
}): Promise<void> {
  await enqueueEmail({
    to: data.to,
    subject: `Booking confirmed — ${data.vendorName}`,
    template: 'booking-confirmed',
    data,
  });
}

export async function queueBulkCampaign(
  recipients: Array<{ email: string; firstName: string }>,
  campaign: { subject: string; body: string }
): Promise<void> {
  if (!_redisAvailable || !_emailQueue) {
    // Synchronous fallback for bulk — send sequentially
    const { sendEmail } = await import('./email.service');
    for (const r of recipients) {
      await sendEmail({
        to: r.email,
        subject: campaign.subject,
        template: 'custom-campaign',
        data: { firstName: r.firstName, body: campaign.body },
      });
    }
    return;
  }

  const jobs = recipients.map((r, i) => ({
    name: 'send-email' as const,
    data: {
      to: r.email,
      subject: campaign.subject,
      template: 'custom-campaign',
      data: { firstName: r.firstName, body: campaign.body },
    },
    opts: { delay: i * 300 }, // 300ms stagger to respect SendGrid rate limits
  }));

  await _emailQueue.addBulk(jobs);
  logger.info(`Bulk campaign queued: ${recipients.length} emails`);
}

// ─── Legacy emailQueue shim ───────────────────────────
// Provides backward compatibility for any code that still uses
// the old `emailQueue.add(...)` pattern.
export const emailQueue = {
  add: async (job: { to: string; subject: string; template: string; data: Record<string, any>; scheduledAt?: Date }) => {
    await enqueueEmail(
      { to: job.to, subject: job.subject, template: job.template, data: job.data },
      { delayMs: job.scheduledAt ? Math.max(0, job.scheduledAt.getTime() - Date.now()) : undefined }
    );
  },
  addBulk: async (jobs: Array<{ to: string; subject: string; template: string; data: Record<string, any> }>, delayMs = 200) => {
    for (let i = 0; i < jobs.length; i++) {
      await enqueueEmail(jobs[i], { delayMs: i * delayMs });
    }
  },
  get size() { return 0; }, // Not meaningful with BullMQ
  stop: () => { /* handled by closeQueues() */ },
};
