import https from 'https';
import { initializeTransaction } from '../services/paystack.service';

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('initializeTransaction — Paystack configuration and upstream failure translation', () => {
  const originalPaystackSecret = process.env.PAYSTACK_SECRET_KEY;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalPaystackSecret;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    jest.restoreAllMocks();
  });

  it('throws a 503 AppError when PAYSTACK_SECRET_KEY is missing', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.owambe.test';

    await expect(initializeTransaction({
      email: 'guest@example.test',
      amount: 30000,
      reference: 'STAY-TEST-001-DEP',
    })).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'PAYSTACK_CONFIGURATION_MISSING',
      message: 'Payment provider is not configured. Please try again later or contact support.',
    });
  });

  it('translates low-level Paystack request failures into a 502 AppError without leaking the upstream message', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_remediation_key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.owambe.test';

    jest.spyOn(https, 'request').mockImplementation((_options: any, _callback: any) => {
      const handlers: Record<string, Function> = {};
      const req: any = {
        on: (event: string, handler: Function) => {
          handlers[event] = handler;
          return req;
        },
        write: jest.fn(),
        end: () => {
          handlers.error?.(new Error('ECONNRESET secret upstream details'));
        },
      };
      return req;
    });

    await expect(initializeTransaction({
      email: 'guest@example.test',
      amount: 30000,
      reference: 'STAY-TEST-001-DEP',
    })).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'PAYSTACK_INITIALIZATION_FAILED',
      message: 'Payment provider could not initialize this booking payment. Please try again later.',
    });
  });
});
