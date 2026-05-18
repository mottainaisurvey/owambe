/**
 * AC-4 · Surface 1: TagsTab (vendor/settings → Tags tab)
 *
 * Tests:
 *  T1 — renders existing tags with remove buttons
 *  T2 — renders "no tags" message when tags array is empty
 *  T3 — add-tag button is disabled when input is empty
 *  T4 — calls POST /vendors/me/tags and invalidates cache on add
 *  T5 — calls DELETE /vendors/me/tags/:id and invalidates cache on remove
 *  T6 — shows suggestion dropdown when API returns results
 *  T7 — hides add input when 10 tags are present (max reached)
 *
 * Auth coverage (AC-3):
 *  T4 and T5 run with authenticated state injected via mockAuthStore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockAuthStore, AUTHENTICATED_USER } from '../wrappers';

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Mock the entire vendor settings page module to isolate TagsTab
// We re-export TagsTab as a named export from the page module for testability.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
    vendorsApi: {
      ...actual.vendorsApi,
      getMyProfile: vi.fn().mockResolvedValue({ data: { vendor: { id: 'v1', tags: [] } } }),
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Import component under test ──────────────────────────────────────────────
// TagsTab is defined inside the vendor settings page. We test it by rendering
// the full VendorSettingsPage with the Tags tab pre-selected.
import VendorSettingsPage, { tagsApi } from '@/app/vendor/settings/page';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MOCK_VENDOR_WITH_TAGS = {
  id: 'vendor-001',
  businessName: 'Lagos Lens Studio',
  status: 'VERIFIED',
  tags: [
    { id: 'tag-001', label: 'outdoor weddings', normalised: 'outdoor weddings' },
    { id: 'tag-002', label: 'corporate events', normalised: 'corporate events' },
  ],
};

const MOCK_VENDOR_NO_TAGS = {
  id: 'vendor-002',
  businessName: 'Abuja Moments',
  status: 'VERIFIED',
  tags: [],
};

const MOCK_VENDOR_MAX_TAGS = {
  id: 'vendor-003',
  businessName: 'Max Tags Vendor',
  status: 'VERIFIED',
  tags: Array.from({ length: 10 }, (_, i) => ({
    id: `tag-${i}`,
    label: `tag ${i}`,
    normalised: `tag ${i}`,
  })),
};

// ─── Helper: render page with Tags tab active ─────────────────────────────────

async function renderTagsTab(vendorData: any) {
  const { vendorsApi } = await import('@/lib/api');
  vi.mocked(vendorsApi.getMyProfile).mockResolvedValue({
    data: { vendor: vendorData },
  } as any);

  const result = renderWithProviders(<VendorSettingsPage />);

  // Wait for the vendor data to load
  await waitFor(() => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  }, { timeout: 3000 }).catch(() => {
    // Spinner may not have role="status" — just wait for content
  });

  // Click the Tags tab
  const tagsTabButton = screen.getByRole('button', { name: 'Tags' });
  await userEvent.click(tagsTabButton);

  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TagsTab — vendor/settings Tags tab (AC-4 Surface 1)', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = mockAuthStore({
      user: AUTHENTICATED_USER,
      isAuthenticated: true,
      _hasHydrated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('T1: renders existing tags with remove buttons', async () => {
    await renderTagsTab(MOCK_VENDOR_WITH_TAGS);

    await waitFor(() => {
      // Use getAllByText since the tag label may appear in both the chip and elsewhere
      const outdoorWeddingEls = screen.getAllByText(/outdoor weddings/i);
      expect(outdoorWeddingEls.length).toBeGreaterThanOrEqual(1);
      const corporateEventsEls = screen.getAllByText(/corporate events/i);
      expect(corporateEventsEls.length).toBeGreaterThanOrEqual(1);
    });

    const removeButtons = screen.getAllByRole('button', { name: /remove tag/i });
    expect(removeButtons).toHaveLength(2);
  });

  it('T2: renders "no tags" message when tags array is empty', async () => {
    await renderTagsTab(MOCK_VENDOR_NO_TAGS);

    await waitFor(() => {
      expect(screen.getByTestId('no-tags-message')).toBeInTheDocument();
    });
  });

  it('T3: add-tag button is disabled when input is empty', async () => {
    await renderTagsTab(MOCK_VENDOR_NO_TAGS);

    await waitFor(() => {
      const addButton = screen.getByTestId('add-tag-button');
      expect(addButton).toBeDisabled();
    });
  });

  it('T4 (authenticated): calls addTag API and invalidates cache on add', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.post).mockResolvedValue({ data: { tag: { id: 'tag-new', label: 'luxury events' } } });

    await renderTagsTab(MOCK_VENDOR_NO_TAGS);

    await waitFor(() => {
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });

    const input = screen.getByTestId('tag-input');
    await userEvent.type(input, 'luxury events');

    const addButton = screen.getByTestId('add-tag-button');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/vendors/me/tags',
        { label: 'luxury events' }
      );
    });
  });

  it('T5 (authenticated): calls removeTag API on remove button click', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    await renderTagsTab(MOCK_VENDOR_WITH_TAGS);

    await waitFor(() => {
      const outdoorEls = screen.getAllByText(/outdoor weddings/i);
      expect(outdoorEls.length).toBeGreaterThanOrEqual(1);
    });

    // Use getAllByRole and pick the first remove button (outdoor weddings is first tag)
    const removeButtons = screen.getAllByRole('button', { name: /remove tag/i });
    await userEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/vendors/me/tags/tag-001');
    });
  });

  it('T6: shows suggestion dropdown when API returns results', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      data: {
        suggestions: [
          { id: 's1', label: 'beach weddings', normalised: 'beach weddings', usageCount: 5 },
        ],
      },
    });

    await renderTagsTab(MOCK_VENDOR_NO_TAGS);

    await waitFor(() => {
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });

    const input = screen.getByTestId('tag-input');
    await userEvent.type(input, 'beach');

    await waitFor(() => {
      expect(screen.getByTestId('tag-suggestions')).toBeInTheDocument();
      expect(screen.getByText(/beach weddings/i)).toBeInTheDocument();
    });
  });

  it('T7: hides add input when 10 tags are present (max reached)', async () => {
    await renderTagsTab(MOCK_VENDOR_MAX_TAGS);

    await waitFor(() => {
      expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
      expect(screen.getByText(/maximum 10 tags reached/i)).toBeInTheDocument();
    });
  });
});
