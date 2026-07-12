/**
 * OWB-C-UIENABLE-01 — AC-4 (web): UI-7 Toast Suppression Tests
 *
 * Coverage:
 *   UI-7  403 "Access restricted" toasts are suppressed by the response interceptor
 *         so consumers do not see "Access restricted to: PLANNER, ADMIN" when the
 *         EVENTS-mode dashboard calls PLANNER-only endpoints.
 *
 *   Regression:
 *         Legitimate 403 errors (non-"access restricted" messages) still surface as toasts.
 *         Other non-401 errors (400, 404, 500) still surface as toasts.
 *
 * Strategy:
 *   - Mocks the axios adapter to return controlled error responses.
 *   - Mocks react-hot-toast to capture toast.error calls.
 *   - Does not render any React components.
 */
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api } from './api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import toast from 'react-hot-toast';

const originalAdapter = api.defaults.adapter;

function makeErrorResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  errorMessage: string
): Promise<never> {
  const response: AxiosResponse = {
    data: { error: errorMessage },
    status,
    statusText: String(status),
    headers: {},
    config,
  };
  return Promise.reject(
    new AxiosError(errorMessage, 'ERR_BAD_REQUEST', config, null, response)
  );
}

describe('UI-7: 403 "Access restricted" toast suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it('suppresses toast for 403 with "Access restricted" message', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 403, 'Access restricted to: PLANNER, ADMIN')
    ) as AxiosAdapter;

    await api.get('/analytics/planner/overview').catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('suppresses toast for 403 with lowercase "access restricted" message', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 403, 'access restricted to: VENDOR')
    ) as AxiosAdapter;

    await api.get('/events').catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still shows toast for 403 with a non-"access restricted" message (legitimate 403)', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 403, 'You do not have permission to update this experience')
    ) as AxiosAdapter;

    await api.put('/experiences/some-id', {}).catch(() => {});

    expect(toast.error).toHaveBeenCalledWith(
      'You do not have permission to update this experience'
    );
  });

  it('still shows toast for 400 errors', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 400, 'startTime is required')
    ) as AxiosAdapter;

    await api.post('/experience-slots/some-id', {}).catch(() => {});

    expect(toast.error).toHaveBeenCalledWith('startTime is required');
  });

  it('still shows toast for 500 errors', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 500, 'Internal server error')
    ) as AxiosAdapter;

    await api.get('/experiences/mine').catch(() => {});

    expect(toast.error).toHaveBeenCalledWith('Internal server error');
  });

  it('still shows toast for 404 errors', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      makeErrorResponse(config, 404, 'Experience not found')
    ) as AxiosAdapter;

    await api.get('/experiences/nonexistent').catch(() => {});

    expect(toast.error).toHaveBeenCalledWith('Experience not found');
  });
});
