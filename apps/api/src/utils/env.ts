// ─── ENV VALIDATION ──────────────────────────────────
// Called at startup. Throws if required environment variables are missing.
// This prevents silent failures from misconfigured deployments.

interface EnvConfig {
  required: string[];
  optional: string[];
}

const CONFIG: EnvConfig = {
  required: [
    'DATABASE_URL',
    'JWT_SECRET',
    'NEXT_PUBLIC_APP_URL',
  ],
  optional: [
    'REDIS_URL',
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_WEBHOOK_SECRET',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET',
    'AWS_REGION',
    'SENDGRID_API_KEY',
    'EMAIL_FROM',
    'EMAIL_FROM_NAME',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'API_PORT',
    'NODE_ENV',
  ]
};

export function validateEnv() {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of CONFIG.required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of CONFIG.optional) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:');
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('\nCreate a .env file from .env.example and fill in these values.\n');
    process.exit(1);
  }

  if (warnings.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('\n⚠️  Optional env vars not set (some features may not work):');
    warnings.forEach(k => console.warn(`   • ${k}`));
    console.warn('');
  }

  // Warn if JWT secret is too short
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters. Generate one with:');
    console.error('   openssl rand -base64 32\n');
    process.exit(1);
  }

  // Paystack is required at payment-initialization time. Keep startup non-fatal so
  // non-payment routes can still boot, but make misconfiguration explicit early.
  if (!process.env.PAYSTACK_SECRET_KEY && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  PAYSTACK_SECRET_KEY is not set — payment initialization routes will return a service-unavailable error until configured.\n');
  }

  // Warn about test keys in production (warn only, do not exit — test keys are acceptable during staging)
  if (process.env.NODE_ENV === 'production') {
    if (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')) {
      console.warn('⚠️  PAYSTACK_SECRET_KEY is a TEST key — payments will use Paystack sandbox.\n');
    }
  }

  return true;
}

// ─── TYPED ENV ACCESS ────────────────────────────────
export const env = {
  get databaseUrl() { return process.env.DATABASE_URL!; },
  get redisUrl() { return process.env.REDIS_URL || 'redis://localhost:6379'; },
  get jwtSecret() { return process.env.JWT_SECRET!; },
  get jwtAccessExpires() { return process.env.JWT_ACCESS_EXPIRES || '15m'; },
  get jwtRefreshExpires() { return process.env.JWT_REFRESH_EXPIRES || '30d'; },
  get paystackSecret() { return process.env.PAYSTACK_SECRET_KEY || ''; },
  get paystackWebhookSecret() { return process.env.PAYSTACK_WEBHOOK_SECRET || ''; },
  get openaiApiKey() { return process.env.OPENAI_API_KEY || ''; },
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-4o'; },
  get awsRegion() { return process.env.AWS_REGION || 'af-south-1'; },
  get awsBucket() { return process.env.AWS_S3_BUCKET || 'owambe-media'; },
  get sendgridApiKey() { return process.env.SENDGRID_API_KEY || ''; },
  get emailFrom() { return process.env.EMAIL_FROM || 'noreply@owambe.com'; },
  get appUrl() { return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; },
  get port() { return parseInt(process.env.API_PORT || '4000'); },
  get isProduction() { return process.env.NODE_ENV === 'production'; },
  get isDevelopment() { return process.env.NODE_ENV !== 'production'; },
};
