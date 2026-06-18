import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api, staysApi } from './api';
import { useAuthStore } from '@/store/auth.store';

const originalAdapter = api.defaults.adapter;
const originalAuthorization = api.defaults.headers.common['Authorization'];

function readAuthorizationHeader(headers: any): string | undefined {
  if (typeof headers?.get === 'function') {
    return headers.get('Authorization') ?? headers.get('authorization') ?? undefined;
  }

  return headers?.Authorization ?? headers?.authorization;
}

function unauthorized(config: InternalAxiosRequestConfig): Promise<never> {
  const response: AxiosResponse = {
    data: { message: 'Unauthorized' },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
  };

  return Promise.reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response));
}

describe('api request authorization interceptor', () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    if (originalAuthorization) {
      api.defaults.headers.common['Authorization'] = originalAuthorization;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
    useAuthStore.getState().clearAuth();
  });

  it('attaches the current store access token to Stays booking requests at request time', async () => {
    let observedAuthorization: string | undefined;
    delete api.defaults.headers.common['Authorization'];
    useAuthStore.setState({
      accessToken: 'fresh-store-token',
      isAuthenticated: true,
    });

    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      observedAuthorization = readAuthorizationHeader(config.headers);
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }) as AxiosAdapter;

    await staysApi.createBooking({
      roomId: 'room-owambe-seeded-deluxe',
      checkInDate: '2026-07-17',
      checkOutDate: '2026-07-20',
      guestCount: 2,
    });

    expect(observedAuthorization).toBe('Bearer fresh-store-token');
  });

  it('does not synthesize an Authorization header when no access token or default header exists', async () => {
    let observedAuthorization: string | undefined;
    delete api.defaults.headers.common['Authorization'];
    useAuthStore.setState({
      accessToken: null,
      isAuthenticated: false,
    });

    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      observedAuthorization = readAuthorizationHeader(config.headers);
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }) as AxiosAdapter;

    await staysApi.createBooking({
      roomId: 'room-owambe-seeded-deluxe',
      checkInDate: '2026-07-17',
      checkOutDate: '2026-07-20',
      guestCount: 2,
    });

    expect(observedAuthorization).toBeUndefined();
  });
});

describe('api refresh interceptor', () => {
  beforeEach(() => {
    api.defaults.headers.common['Authorization'] = 'Bearer expired-token';
    useAuthStore.setState({
      user: {
        id: 'consumer-test-user',
        email: 'consumer@test.owambe.com',
        firstName: 'Consumer',
        lastName: 'Tester',
        role: 'CONSUMER',
        isEmailVerified: true,
        activeMode: 'STAYS',
        availableModes: ['STAYS'],
      },
      accessToken: 'expired-token',
      isAuthenticated: true,
      activeMode: 'STAYS',
    });
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    if (originalAuthorization) {
      api.defaults.headers.common['Authorization'] = originalAuthorization;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
    useAuthStore.getState().clearAuth();
  });

  it('rejects and clears auth instead of deadlocking when a stay booking 401 is followed by refresh 401', async () => {
    const calls: string[] = [];
    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls.push(config.url ?? '');
      if (config.url === '/stay-bookings' || config.url === '/auth/refresh') {
        return unauthorized(config);
      }
      throw new Error(`Unexpected API request: ${config.url}`);
    }) as AxiosAdapter;

    const settled = api
      .post('/stay-bookings', {
        roomId: 'room-owambe-seeded-deluxe',
        checkInDate: '2026-07-17',
        checkOutDate: '2026-07-20',
        guestCount: 2,
      })
      .then(() => ({ status: 'resolved' as const }))
      .catch((error) => ({
        status: 'rejected' as const,
        responseStatus: error?.response?.status,
        requestUrl: error?.config?.url,
      }));

    const result = await Promise.race([
      settled,
      new Promise((resolve) => setTimeout(() => resolve({ status: 'timed-out' }), 250)),
    ]);

    expect(result).toEqual({ status: 'rejected', responseStatus: 401, requestUrl: '/auth/refresh' });
    expect(calls).toEqual(['/stay-bookings', '/auth/refresh']);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(api.defaults.headers.common['Authorization']).toBeUndefined();
  });
});
