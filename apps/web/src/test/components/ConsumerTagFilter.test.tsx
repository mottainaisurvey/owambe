/**
 * AC-4 · Surface 2: Consumer Tag Filter (vendors page — TagFilteredView)
 *
 * Tests:
 *  T1 — renders active filter chip for the tag from URL param
 *  T2 — renders vendor cards when API returns results
 *  T3 — renders empty state when no vendors match
 *  T4 — removes filter chip when × is clicked and updates URL
 *  T5 — unauthenticated user sees the same tag filter UI (no auth gate)
 *
 * Auth coverage (AC-3):
 *  T5 explicitly tests unauthenticated state via mockAuthStore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockAuthStore, AUTHENTICATED_USER, UNAUTHENTICATED_STATE } from '../wrappers';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: mockGet,
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    toString: vi.fn(() => ''),
  })),
  usePathname: vi.fn(() => '/vendors'),
}));

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
      search: vi.fn(),
      discover: vi.fn(),
      getCategories: vi.fn(),
      suggestTags: vi.fn(),
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Import component under test ──────────────────────────────────────────────
import VendorsPage from '@/app/vendors/page';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MOCK_VENDOR = {
  id: 'v1',
  slug: 'lagos-lens-studio',
  businessName: 'Lagos Lens Studio',
  category: 'PHOTOGRAPHY_VIDEO',
  city: 'Lagos',
  rating: '4.8',
  reviewCount: 12,
  minPrice: 150000,
  isFeatured: false,
  isInstantBook: false,
  portfolioItems: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConsumerTagFilter — /vendors?tags=<tag> (AC-4 Surface 2)', () => {
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

  it('T1: renders active filter chip for the tag from URL param', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'tags') return 'outdoor weddings';
      return null;
    });

    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      data: { vendors: [MOCK_VENDOR], total: 1 },
    });

    renderWithProviders(<VendorsPage />);

    await waitFor(() => {
      expect(screen.getByText(/outdoor weddings/i)).toBeInTheDocument();
    });

    // The active filter chip should be present
    const filterList = screen.getByRole('list', { name: /active tag filters/i });
    expect(filterList).toBeInTheDocument();
  });

  it('T2: renders vendor cards when API returns results', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'tags') return 'outdoor weddings';
      return null;
    });
    // vendorsApi.discover closes over the original api instance, so mock it directly
    const { vendorsApi } = await import('@/lib/api');
    vi.mocked(vendorsApi.discover).mockResolvedValue({
      data: { vendors: [MOCK_VENDOR], total: 1 },
    } as any);
    renderWithProviders(<VendorsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lagos Lens Studio')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('T3: renders empty state when no vendors match', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'tags') return 'nonexistent-tag';
      return null;
    });
    const { vendorsApi } = await import('@/lib/api');
    vi.mocked(vendorsApi.discover).mockResolvedValue({
      data: { vendors: [], total: 0 },
    } as any);
    renderWithProviders(<VendorsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no vendors match these tags/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('T4: removes filter chip when × is clicked', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'tags') return 'outdoor weddings';
      return null;
    });
    const { vendorsApi } = await import('@/lib/api');
    vi.mocked(vendorsApi.discover).mockResolvedValue({
      data: { vendors: [MOCK_VENDOR], total: 1 },
    } as any);

    renderWithProviders(<VendorsPage />);

    await waitFor(() => {
      expect(screen.getByText(/outdoor weddings/i)).toBeInTheDocument();
    });

    const removeButton = screen.getByRole('button', { name: /remove filter outdoor weddings/i });
    await userEvent.click(removeButton);

    // After removing, router.replace should be called with empty tags
    expect(mockReplace).toHaveBeenCalled();
  });

  it('T5 (unauthenticated): tag filter UI is accessible without auth', async () => {
    // Override to unauthenticated state
    cleanup();
    cleanup = mockAuthStore(UNAUTHENTICATED_STATE);

    mockGet.mockImplementation((key: string) => {
      if (key === 'tags') return 'outdoor weddings';
      return null;
    });

    const { vendorsApi } = await import('@/lib/api');
    vi.mocked(vendorsApi.discover).mockResolvedValue({
      data: { vendors: [MOCK_VENDOR], total: 1 },
    } as any);
    renderWithProviders(<VendorsPage />);
    // Tag filter UI should render even for unauthenticated users
    await waitFor(() => {
      expect(screen.getByText(/outdoor weddings/i)).toBeInTheDocument();
    });
  });
});
