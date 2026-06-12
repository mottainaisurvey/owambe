import { PlatformMode } from '@/store/auth.store';

const MODE_ROOTS: Record<PlatformMode, string[]> = {
  EVENTS: ['/dashboard/events'],
  STAYS: ['/dashboard/stays'],
  EXPERIENCES: ['/dashboard/experiences'],
};

const SHARED_DASHBOARD_ROUTES = new Set([
  '/dashboard',
  '/dashboard/pricing',
]);

export function getDashboardRouteMode(pathname: string | null | undefined): PlatformMode | null {
  if (!pathname) return null;

  for (const [mode, roots] of Object.entries(MODE_ROOTS) as [PlatformMode, string[]][]) {
    if (roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))) {
      return mode;
    }
  }

  return null;
}

export function getDashboardShellMode(pathname: string | null | undefined, activeMode: PlatformMode): PlatformMode {
  return getDashboardRouteMode(pathname) ?? activeMode;
}

export function shouldSyncDashboardMode(pathname: string | null | undefined, activeMode: PlatformMode): boolean {
  const routeMode = getDashboardRouteMode(pathname);
  return Boolean(routeMode && routeMode !== activeMode);
}

export function isSharedDashboardRoute(pathname: string | null | undefined): boolean {
  return Boolean(pathname && SHARED_DASHBOARD_ROUTES.has(pathname));
}
