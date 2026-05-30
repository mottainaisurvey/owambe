/**
 * CC-COHORT-OFFER-SURFACES-01 (Amendment 01) — Component Test
 *
 * CohortInterestForm — inline email-capture form on /coastal-corridor-cohort
 *
 * Tests:
 *  T1 — renders email input and submit button
 *  T2 — submit with invalid email shows client-side validation error; no fetch called
 *  T3 — submit with valid email calls POST /api/cohort/interest with correct body
 *  T4 — successful API response renders success acknowledgement
 *  T5 — API error response renders error message
 *  T6 — submit button shows loading state while request is in-flight
 *
 * AC-9 coverage:
 *  - Component-level tests for valid/invalid email submission behaviour
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../wrappers';

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Import the page (which contains CohortInterestForm) ─────────────────────
// We import the full page component. The form is defined inline in the page file.
// This tests the form as the user encounters it.
import CoastalCorridorCohortPage from '@/app/coastal-corridor-cohort/page';

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── T1: Renders ─────────────────────────────────────────────────────────────
describe('CohortInterestForm — rendering', () => {
  it('T1: renders email input and submit button', () => {
    renderWithProviders(<CoastalCorridorCohortPage />);

    // There are two form instances on the page (hero + bottom CTA)
    const inputs = screen.getAllByPlaceholderText('your@email.com');
    expect(inputs.length).toBeGreaterThanOrEqual(1);

    const buttons = screen.getAllByRole('button', { name: /register interest/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── T2: Client-side validation ──────────────────────────────────────────────
describe('CohortInterestForm — client-side validation', () => {
  it('T2: submitting with invalid email shows error; fetch is NOT called', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const input = screen.getAllByPlaceholderText('your@email.com')[0];
    const button = screen.getAllByRole('button', { name: /register interest/i })[0];

    await user.type(input, 'not-an-email');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getAllByText(/valid email/i).length).toBeGreaterThan(0);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('T2b: submitting with empty input shows error; fetch is NOT called', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const button = screen.getAllByRole('button', { name: /register interest/i })[0];
    await user.click(button);

    await waitFor(() => {
      expect(screen.getAllByText(/valid email/i).length).toBeGreaterThan(0);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── T3: Successful submission ────────────────────────────────────────────────
describe('CohortInterestForm — successful submission', () => {
  it('T3: valid email calls POST /api/cohort/interest with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: "Thanks — we'll be in touch." }),
    });

    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const input = screen.getAllByPlaceholderText('your@email.com')[0];
    await user.type(input, 'test@owambe.com');

    const button = screen.getAllByRole('button', { name: /register interest/i })[0];
    await user.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/cohort/interest');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.email).toBe('test@owambe.com');
  });

  it('T4: successful API response renders success acknowledgement', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: "Thanks — we'll be in touch." }),
    });

    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const input = screen.getAllByPlaceholderText('your@email.com')[0];
    await user.type(input, 'test@owambe.com');

    const button = screen.getAllByRole('button', { name: /register interest/i })[0];
    await user.click(button);

    await waitFor(() => {
      expect(screen.getAllByText(/you're on the list/i).length).toBeGreaterThan(0);
    });
  });
});

// ─── T5: API error ────────────────────────────────────────────────────────────
describe('CohortInterestForm — API error handling', () => {
  it('T5: API error response renders error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Something went wrong.' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const input = screen.getAllByPlaceholderText('your@email.com')[0];
    await user.type(input, 'test@owambe.com');

    const button = screen.getAllByRole('button', { name: /register interest/i })[0];
    await user.click(button);

    await waitFor(() => {
      expect(screen.getAllByText(/something went wrong/i).length).toBeGreaterThan(0);
    });
  });
});

// ─── T6: Loading state ────────────────────────────────────────────────────────
describe('CohortInterestForm — loading state', () => {
  it('T6: submit button shows loading state while request is in-flight', async () => {
    // Delay the fetch response to observe the loading state
    let resolveRequest!: (value: any) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveRequest = resolve; })
    );

    const user = userEvent.setup();
    renderWithProviders(<CoastalCorridorCohortPage />);

    const input = screen.getAllByPlaceholderText('your@email.com')[0];
    await user.type(input, 'test@owambe.com');

    const button = screen.getAllByRole('button', { name: /register interest/i })[0];
    await user.click(button);

    // While in-flight, button should show "Sending…" and be disabled
    await waitFor(() => {
      expect(screen.getAllByText(/sending/i).length).toBeGreaterThan(0);
    });

    // Resolve the request
    resolveRequest({
      ok: true,
      json: async () => ({ success: true, message: "Thanks." }),
    });

    await waitFor(() => {
      expect(screen.getAllByText(/you're on the list/i).length).toBeGreaterThan(0);
    });
  });
});
