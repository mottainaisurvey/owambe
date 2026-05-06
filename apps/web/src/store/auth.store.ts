import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '@/lib/api';

// ─── Platform Mode ────────────────────────────────────
export type PlatformMode = 'EVENTS' | 'STAYS' | 'EXPERIENCES';

// ─── User Roles (extended for Phase A) ───────────────
export type UserRole = 'PLANNER' | 'VENDOR' | 'CONSUMER' | 'ADMIN' | 'HOST' | 'OPERATOR';

// ─── Plan Tiers ───────────────────────────────────────
export type PlanTier = 'STARTER' | 'GROWTH' | 'SCALE';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  isEmailVerified: boolean;
  profile?: any;
  // Events mode
  planner?: { plan: PlanTier; id: string; companyName?: string };
  vendor?: any;
  consumer?: any;
  // Stays mode (Phase A)
  host?: { id: string; businessName?: string; isVerified: boolean };
  // Experiences mode (Phase A)
  operator?: { id: string; businessName?: string; isVerified: boolean };
  // Mode fields (Phase A)
  activeMode?: PlatformMode;
  availableModes?: PlatformMode[];
}

// ─── Plan Helpers ─────────────────────────────────────
export function getPlanTier(user: User | null): PlanTier {
  return user?.planner?.plan ?? 'STARTER';
}

export function planAtLeast(user: User | null, required: 'GROWTH' | 'SCALE'): boolean {
  const tier = getPlanTier(user);
  const order: Record<PlanTier, number> = { STARTER: 0, GROWTH: 1, SCALE: 2 };
  return order[tier] >= order[required];
}

// ─── Mode Helpers ─────────────────────────────────────
export function getActiveMode(user: User | null): PlatformMode {
  return user?.activeMode ?? 'EVENTS';
}

export function hasMode(user: User | null, mode: PlatformMode): boolean {
  if (!user) return false;
  if (user.availableModes) return user.availableModes.includes(mode);
  // Derive from role if availableModes not set
  if (mode === 'EVENTS') return ['PLANNER', 'VENDOR', 'CONSUMER', 'ADMIN'].includes(user.role);
  if (mode === 'STAYS') return ['HOST', 'CONSUMER', 'ADMIN'].includes(user.role);
  if (mode === 'EXPERIENCES') return ['OPERATOR', 'CONSUMER', 'ADMIN'].includes(user.role);
  return false;
}

export function getModeLabel(mode: PlatformMode): string {
  const labels: Record<PlatformMode, string> = {
    EVENTS: 'Events',
    STAYS: 'Stays',
    EXPERIENCES: 'Experiences',
  };
  return labels[mode];
}

export function getModeIcon(mode: PlatformMode): string {
  const icons: Record<PlatformMode, string> = {
    EVENTS: '🎉',
    STAYS: '🏡',
    EXPERIENCES: '🌍',
  };
  return icons[mode];
}

// ─── Auth State ───────────────────────────────────────
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Mode state (Phase A)
  activeMode: PlatformMode;
  isSwitchingMode: boolean;
  // Hydration tracking — set to true in onRehydrateStorage callback
  _hasHydrated: boolean;

  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Mode actions (Phase A)
  switchMode: (mode: PlatformMode) => Promise<void>;
  setActiveMode: (mode: PlatformMode) => void;
  // Hydration setter
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
      activeMode: 'EVENTS',
      isSwitchingMode: false,
      _hasHydrated: false,

      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),

      setAuth: (user, accessToken) => {
        const activeMode = user.activeMode ?? 'EVENTS';
        set({ user, accessToken, isAuthenticated: true, activeMode });
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      },

      clearAuth: () => {
        set({ user: null, accessToken: null, isAuthenticated: false, activeMode: 'EVENTS' });
        delete api.defaults.headers.common['Authorization'];
      },

      setLoading: (isLoading) => set({ isLoading }),

      setActiveMode: (mode: PlatformMode) => {
        set({ activeMode: mode });
      },

      switchMode: async (mode: PlatformMode) => {
        const { user } = get();
        if (!user) return;

        // Optimistic update
        set({ isSwitchingMode: true, activeMode: mode });

        try {
          const res = await api.post('/mode/switch', { mode });
          const updatedUser = { ...user, activeMode: mode, availableModes: res.data.availableModes };
          set({ user: updatedUser, activeMode: mode });
        } catch (err) {
          // Revert on failure
          const previousMode = user.activeMode ?? 'EVENTS';
          set({ activeMode: previousMode });
          throw err;
        } finally {
          set({ isSwitchingMode: false });
        }
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/auth/login', { email, password });
          const { user, accessToken } = res.data;
          get().setAuth(user, accessToken);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // ignore
        } finally {
          get().clearAuth();
        }
      },

      refreshUser: async () => {
        try {
          const res = await api.get('/auth/me');
          const updatedUser = { ...get().user!, ...res.data.user };
          set({
            user: updatedUser,
            activeMode: updatedUser.activeMode ?? get().activeMode,
          });
        } catch {
          get().clearAuth();
        }
      },
    }),
    {
      name: 'owambe-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        activeMode: state.activeMode,
        // _hasHydrated is NOT persisted — it resets to false on each page load
        // and is set to true only after rehydration completes
      }),
      onRehydrateStorage: () => (state) => {
        // This callback fires after localStorage data has been loaded into the store.
        // Setting _hasHydrated here ensures the layout sees the fully-hydrated state.
        if (state) {
          state._hasHydrated = true;
          if (state.accessToken) {
            api.defaults.headers.common['Authorization'] = `Bearer ${state.accessToken}`;
          }
        }
      },
    }
  )
);
