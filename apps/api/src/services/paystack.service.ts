import https from 'https';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

const BASE_URL = 'api.paystack.co';

function getPaystackSecret(): string {
  return process.env.PAYSTACK_SECRET_KEY || '';
}

export function isPaystackConfigured(): boolean {
  return getPaystackSecret().trim().length > 0;
}

function requirePaystackSecret(): string {
  const secret = getPaystackSecret().trim();
  if (!secret) {
    throw new AppError(
      'Payment provider is not configured. Please try again later or contact support.',
      503,
      'PAYSTACK_CONFIGURATION_MISSING',
    );
  }
  return secret;
}

function toPaystackInitializationError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  logger.error('[Paystack] Transaction initialization failed', { error: message });
  return new AppError(
    'Payment provider could not initialize this booking payment. Please try again later.',
    502,
    'PAYSTACK_INITIALIZATION_FAILED',
  );
}

// ─── PAYSTACK API WRAPPER ────────────────────────────
function paystackRequest<T>(method: string, path: string, data?: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const options = {
      hostname: BASE_URL,
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${requirePaystackSecret()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.status) resolve(parsed.data);
          else reject(new Error(parsed.message || 'Paystack error'));
        } catch {
          reject(new Error('Failed to parse Paystack response'));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── INITIALIZE TRANSACTION ──────────────────────────
export interface InitTransactionParams {
  email: string;
  amount: number; // in kobo (multiply NGN by 100)
  reference: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
  subaccount?: string;
  transactionCharge?: number;
  bearer?: 'account' | 'subaccount';
}

export interface InitTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeTransaction(params: InitTransactionParams): Promise<InitTransactionResponse> {
  const data = {
    email: params.email,
    amount: Math.round(params.amount * 100), // Convert to kobo
    reference: params.reference,
    callback_url: params.callbackUrl || `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
    metadata: params.metadata || {},
    ...(params.subaccount && { subaccount: params.subaccount }),
    ...(params.transactionCharge && { transaction_charge: Math.round(params.transactionCharge * 100) }),
    ...(params.bearer && { bearer: params.bearer }),
  };

  logger.info(`Initializing Paystack transaction: ${params.reference}`);
  try {
    return await paystackRequest('POST', '/transaction/initialize', data);
  } catch (err) {
    throw toPaystackInitializationError(err);
  }
}

// ─── VERIFY TRANSACTION ──────────────────────────────
export interface VerifyTransactionResponse {
  id: number;
  status: string;
  reference: string;
  amount: number; // in kobo
  paid_at: string;
  customer: { email: string };
  metadata: Record<string, any>;
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
  logger.info(`Verifying Paystack transaction: ${reference}`);
  return paystackRequest('GET', `/transaction/verify/${reference}`);
}

// ─── CREATE SUBACCOUNT (for vendors) ─────────────────
export interface CreateSubaccountParams {
  businessName: string;
  settlementBank: string; // Bank code
  accountNumber: string;
  percentageCharge: number; // Platform commission %
}

export interface SubaccountResponse {
  id: number;
  subaccount_code: string;
  business_name: string;
  account_number: string;
  settlement_bank: string;
}

export async function createSubaccount(params: CreateSubaccountParams): Promise<SubaccountResponse> {
  const data = {
    business_name: params.businessName,
    settlement_bank: params.settlementBank,
    account_number: params.accountNumber,
    percentage_charge: params.percentageCharge,
  };

  logger.info(`Creating Paystack subaccount for: ${params.businessName}`);
  return paystackRequest('POST', '/subaccount', data);
}

// ─── LIST BANKS ──────────────────────────────────────
export interface Bank {
  name: string;
  code: string;
  id: number;
}

export async function listBanks(): Promise<Bank[]> {
  return paystackRequest('GET', '/bank?country=nigeria&use_cursor=false&perPage=100');
}

// ─── VERIFY ACCOUNT NUMBER ───────────────────────────
export interface AccountVerification {
  account_name: string;
  account_number: string;
  bank_id: number;
}

export async function verifyAccountNumber(accountNumber: string, bankCode: string): Promise<AccountVerification> {
  return paystackRequest('GET', `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
}

// ─── INITIATE REFUND ─────────────────────────────────
export async function initiateRefund(reference: string, amount?: number): Promise<any> {
  const data: any = { transaction: reference };
  if (amount) data.amount = Math.round(amount * 100);
  logger.info(`Initiating Paystack refund for: ${reference}`);
  return paystackRequest('POST', '/refund', data);
}

// ─── VERIFY WEBHOOK ──────────────────────────────────
import crypto from 'crypto';

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET || '')
    .update(body)
    .digest('hex');
  return hash === signature;
}

// ─── COMPUTE SPLIT AMOUNTS ───────────────────────────
export function computeSplit(totalAmount: number, commissionRate: number) {
  const commission = totalAmount * (commissionRate / 100);
  const vendorAmount = totalAmount - commission;
  const depositAmount = totalAmount * 0.3; // 30% deposit

  return {
    totalAmount,
    commission: Math.round(commission * 100) / 100,
    vendorAmount: Math.round(vendorAmount * 100) / 100,
    depositAmount: Math.round(depositAmount * 100) / 100,
    balanceAmount: Math.round((totalAmount - depositAmount) * 100) / 100,
  };
}

// ─── CHARGE AUTHORIZATION (for recurring instalments) ─
export interface ChargeAuthorizationParams {
  email: string;
  amount: number;          // NGN amount (converted to kobo internally)
  authorizationCode: string; // Reusable auth code from first charge
  reference: string;
  metadata?: Record<string, any>;
}

export async function chargeAuthorization(params: ChargeAuthorizationParams): Promise<{
  id: number;
  status: string;
  reference: string;
  amount: number;
  message: string;
}> {
  logger.info(`Charging authorization: ${params.reference}`);
  return paystackRequest('POST', '/transaction/charge_authorization', {
    email: params.email,
    amount: Math.round(params.amount * 100),
    authorization_code: params.authorizationCode,
    reference: params.reference,
    metadata: params.metadata || {},
  });
}

// ─── CREATE/FETCH PAYSTACK CUSTOMER ──────────────────
export async function createOrFetchCustomer(email: string, firstName: string, lastName: string): Promise<{
  id: number;
  customer_code: string;
  email: string;
}> {
  // Try to fetch existing customer
  try {
    const existing = await paystackRequest<any>('GET', `/customer/${encodeURIComponent(email)}`);
    if (existing?.customer_code) return existing;
  } catch {
    // Customer doesn't exist — create them
  }

  return paystackRequest('POST', '/customer', {
    email,
    first_name: firstName,
    last_name: lastName,
  });
}

// ─── COMPUTE INSTALMENT SCHEDULE ─────────────────────
export interface InstalmentScheduleItem {
  instalmentNumber: number;
  amount: number;          // NGN
  dueDate: Date;
  label: string;
}

export function computeInstalmentSchedule(params: {
  totalAmount: number;
  instalmentCount: 3 | 6;
  serviceFeeRate?: number;   // % on total (default 3.5%)
  startDate?: Date;          // First payment date (default: today)
}): {
  schedule: InstalmentScheduleItem[];
  instalmentAmount: number;
  serviceFeeAmount: number;
  grandTotal: number;
  monthlyAmount: number;
} {
  const { totalAmount, instalmentCount, serviceFeeRate = 3.5 } = params;
  const startDate = params.startDate || new Date();

  // Service fee — charged flat on the total
  const serviceFeeAmount = Math.ceil(totalAmount * (serviceFeeRate / 100));
  const grandTotal = totalAmount + serviceFeeAmount;

  // Split evenly; first payment gets the remainder from rounding
  const baseInstalment = Math.floor(grandTotal / instalmentCount);
  const firstInstalment = grandTotal - baseInstalment * (instalmentCount - 1);

  const schedule: InstalmentScheduleItem[] = [];

  for (let i = 0; i < instalmentCount; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const amount = i === 0 ? firstInstalment : baseInstalment;
    const monthName = dueDate.toLocaleString('en-NG', { month: 'long', year: 'numeric' });

    schedule.push({
      instalmentNumber: i + 1,
      amount,
      dueDate,
      label: i === 0 ? `First payment — ${monthName}` : `Instalment ${i + 1} — ${monthName}`,
    });
  }

  return {
    schedule,
    instalmentAmount: baseInstalment,
    serviceFeeAmount,
    grandTotal,
    monthlyAmount: Math.round(grandTotal / instalmentCount),
  };
}
