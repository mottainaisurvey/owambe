import { describe, expect, it } from 'vitest';
import {
  getDashboardRouteMode,
  getDashboardShellMode,
  isSharedDashboardRoute,
  shouldSyncDashboardMode,
} from '@/lib/dashboardMode';

describe('dashboard route/mode coherence helpers', () => {
  it('classifies stays routes as STAYS even when they are nested', () => {
    expect(getDashboardRouteMode('/dashboard/stays')).toBe('STAYS');
    expect(getDashboardRouteMode('/dashboard/stays/properties')).toBe('STAYS');
    expect(getDashboardRouteMode('/dashboard/stays/properties/new')).toBe('STAYS');
  });

  it('classifies event and experience routes without treating shared routes as mode-specific', () => {
    expect(getDashboardRouteMode('/dashboard/events/new')).toBe('EVENTS');
    expect(getDashboardRouteMode('/dashboard/experiences/bookings')).toBe('EXPERIENCES');
    expect(getDashboardRouteMode('/dashboard')).toBeNull();
    expect(getDashboardRouteMode('/dashboard/pricing')).toBeNull();
  });

  it('uses the route mode for shell navigation and CTA coherence when route and persisted mode diverge', () => {
    expect(getDashboardShellMode('/dashboard/stays/bookings', 'EVENTS')).toBe('STAYS');
    expect(getDashboardShellMode('/dashboard/events', 'STAYS')).toBe('EVENTS');
    expect(getDashboardShellMode('/dashboard/pricing', 'STAYS')).toBe('STAYS');
  });

  it('requests store synchronization only for concrete mode routes with divergent persisted mode', () => {
    expect(shouldSyncDashboardMode('/dashboard/stays', 'EVENTS')).toBe(true);
    expect(shouldSyncDashboardMode('/dashboard/stays', 'STAYS')).toBe(false);
    expect(shouldSyncDashboardMode('/dashboard/pricing', 'STAYS')).toBe(false);
  });

  it('identifies dashboard routes intentionally shared across modes', () => {
    expect(isSharedDashboardRoute('/dashboard')).toBe(true);
    expect(isSharedDashboardRoute('/dashboard/pricing')).toBe(true);
    expect(isSharedDashboardRoute('/dashboard/stays')).toBe(false);
  });
});
