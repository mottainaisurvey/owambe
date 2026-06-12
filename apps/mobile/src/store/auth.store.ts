import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

type UserRole = 'PLANNER' | 'VENDOR' | 'CONSUMER' | 'ADMIN' | 'HOST';
type UserMode = 'EVENTS' | 'STAYS';

interface HostProfile {
  id: string;
  businessName?: string | null;
  isVerified?: boolean;
  rating?: number | null;
  createdAt?: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  isEmailVerified: boolean;
  activeMode?: UserMode;
  availableModes?: UserMode[];
  host?: HostProfile | null;
  profile?: any;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setAuth: (user: User, token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: false,
  isAuthenticated: false,
  hydrated: false,

  // Rehydrate from SecureStore on app start
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      const userStr = await SecureStore.getItemAsync('user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        set({ user, accessToken: token, isAuthenticated: true });
      }
    } catch {
      // Ignore secure store errors on first launch
    } finally {
      set({ hydrated: true });
    }
  },

  setAuth: async (user, accessToken) => {
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('user', JSON.stringify(user));
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    set({ user, accessToken, isAuthenticated: true });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    delete api.defaults.headers.common['Authorization'];
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, accessToken } = res.data;
      await get().setAuth(user, accessToken);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    await get().clearAuth();
  },

  refreshUser: async () => {
    try {
      const res = await api.get('/auth/me');
      const user = res.data.user;
      await SecureStore.setItemAsync('user', JSON.stringify(user));
      set(state => ({ user: { ...state.user!, ...user } }));
    } catch {
      await get().clearAuth();
    }
  },
}));
