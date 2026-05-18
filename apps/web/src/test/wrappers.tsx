/**
 * AC-3: Zustand + React Query mocking infrastructure
 *
 * Exports:
 *  - renderWithProviders(ui, options) — wraps component in QueryClientProvider
 *    with a fresh QueryClient per test (no shared cache state between tests).
 *  - mockAuthStore(overrides) — injects partial Zustand auth state without
 *    touching the real store; restores original state after each test via
 *    the returned cleanup function.
 *  - AUTHENTICATED_USER / UNAUTHENTICATED_STATE — canonical test fixtures.
 */

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as useAuthStoreModule from '@/store/auth.store';

// ─── Canonical test fixtures ──────────────────────────────────────────────────

export const AUTHENTICATED_USER = {
  id: 'test-user-id-001',
  email: 'vendor@test.owambe.com',
  role: 'VENDOR' as const,
  firstName: 'Test',
  lastName: 'Vendor',
};

export const UNAUTHENTICATED_STATE = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
};

export const ADMIN_USER = {
  id: 'test-admin-id-001',
  email: 'admin@test.owambe.com',
  role: 'ADMIN' as const,
  firstName: 'Test',
  lastName: 'Admin',
};

// ─── React Query wrapper ──────────────────────────────────────────────────────

function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,          // Never retry in tests — fail fast
        staleTime: Infinity,   // Prevent background refetches during assertions
      },
    },
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  { queryClient, ...renderOptions }: RenderWithProvidersOptions = {}
) {
  const client = queryClient ?? makeTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient: client };
}

// ─── Zustand auth store mock ──────────────────────────────────────────────────

type AuthStoreState = ReturnType<typeof useAuthStoreModule.useAuthStore.getState>;

/**
 * Injects partial auth state into the Zustand store for the duration of a
 * test. Returns a cleanup function that restores the original state.
 *
 * Usage:
 *   const cleanup = mockAuthStore({ user: AUTHENTICATED_USER, isAuthenticated: true });
 *   afterEach(cleanup);
 */
export function mockAuthStore(overrides: Partial<AuthStoreState>): () => void {
  const original = useAuthStoreModule.useAuthStore.getState();
  useAuthStoreModule.useAuthStore.setState({ ...original, ...overrides });
  return () => useAuthStoreModule.useAuthStore.setState(original);
}
