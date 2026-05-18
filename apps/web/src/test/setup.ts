import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ─── AC-2: Next.js App Router mocks ──────────────────────────────────────────
// next/navigation must be mocked before any component imports it.
// The factory returns controllable vi.fn() instances so individual tests
// can override return values via vi.mocked(...).mockReturnValue(...).

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    toString: vi.fn(() => ''),
  })),
  usePathname: vi.fn(() => '/'),
}));

// ─── AC-2: next/image mock ────────────────────────────────────────────────────
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return null; // Replaced by img in tests via jsdom
  },
}));

// ─── AC-2: next/link mock ─────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    return children;
  },
}));
