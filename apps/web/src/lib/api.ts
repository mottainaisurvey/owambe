import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── REQUEST INTERCEPTOR ─────────────────────────────
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// ─── RESPONSE INTERCEPTOR (auto token refresh) ───────
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await api.post('/auth/refresh');
        const { accessToken } = res.data;

        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;

        // Update zustand store
        const { useAuthStore } = await import('@/store/auth.store');
        const state = useAuthStore.getState();
        if (state.user) {
          state.setAuth(state.user, accessToken);
        }

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        const { useAuthStore } = await import('@/store/auth.store');
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') { window.location.href = '/login'; }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Show error toast for non-401 errors, but suppress for:
    // 1. Silent background auth calls (refresh, me, logout)
    // 2. All errors on auth pages (login, register, forgot-password)
    const silentEndpoints = ['/auth/refresh', '/auth/me', '/auth/logout'];
    const requestUrl = error.config?.url || '';
    const isSilent = silentEndpoints.some(ep => requestUrl.includes(ep));
    const isAuthPage = typeof window !== 'undefined' &&
      ['/login', '/register', '/forgot-password'].includes(window.location.pathname);
    const message = error.response?.data?.error || error.message || 'Something went wrong';
    if (error.response?.status !== 401 && !isSilent && !isAuthPage) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// ─── TYPED API HELPERS ───────────────────────────────
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post(`/auth/reset-password/${token}`, { password }),
};

export const eventsApi = {
  list: (params?: any) => api.get('/events', { params }),
  get: (id: string) => api.get(`/events/${id}`),
  create: (data: any) => api.post('/events', data),
  update: (id: string, data: any) => api.put(`/events/${id}`, data),
  publish: (id: string) => api.post(`/events/${id}/publish`),
  delete: (id: string) => api.delete(`/events/${id}`),
  getPublic: (slug: string) => api.get(`/events/public/${slug}`),
  registerAttendee: (slug: string, data: any) => api.post(`/events/public/${slug}/register`, data),
};

export const vendorsApi = {
  search: (params?: any) => api.get('/vendors/search', { params }),
  getProfile: (slug: string) => api.get(`/vendors/profile/${slug}`),
  getMyProfile: () => api.get('/vendors/me'),
  create: (data: any) => api.post('/vendors/me', data),
  update: (data: any) => api.put('/vendors/me', data),
  updateMyProfile: (data: any) => api.put('/vendors/me', data),
  setupBank: (data: any) => api.post('/vendors/me/bank-account', data),
  getAvailability: (vendorId: string, params: any) => api.get(`/vendors/${vendorId}/availability`, { params }),
  setAvailability: (dates: any[]) => api.put('/vendors/me/availability', { dates }),
  addPackage: (data: any) => api.post('/vendors/me/packages', data),
  updatePackage: (packageId: string, data: any) => api.put(`/vendors/me/packages/${packageId}`, data),
  deletePackage: (packageId: string) => api.delete(`/vendors/me/packages/${packageId}`),
  generateBio: (data: any) => api.post('/vendors/generate-bio', data),
  // AC-2 / VENDOR-MARKETPLACE-EXPANSION-01
  discover: (params?: any) => api.get('/vendors/discover', { params }),
  getCategories: (params?: any) => api.get('/vendors/categories', { params }),
  suggestTags: (q: string) => api.get('/vendors/tags/suggest', { params: { q } }),
};

export const bookingsApi = {
  list: (params?: any) => api.get('/bookings', { params }),
  get: (id: string) => api.get(`/bookings/${id}`),
  createInstant: (data: any) => api.post('/bookings/instant', data),
  createRfq: (data: any) => api.post('/bookings/rfq', data),
  confirm: (id: string) => api.post(`/bookings/${id}/confirm`),
  cancel: (id: string, reason: string) => api.post(`/bookings/${id}/cancel`, { reason }),
  submitQuote: (id: string, data: any) => api.post(`/bookings/${id}/quote`, data),
  getMessages: (id: string) => api.get(`/bookings/${id}/messages`),
  sendMessage: (id: string, body: string) => api.post(`/bookings/${id}/messages`, { body }),
};

export const ticketsApi = {
  list: (eventId: string) => api.get(`/tickets/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/tickets/event/${eventId}`, data),
  update: (id: string, data: any) => api.put(`/tickets/${id}`, data),
  delete: (id: string) => api.delete(`/tickets/${id}`),
  setStatus: (id: string, status: string) => api.patch(`/tickets/${id}/status`, { status }),
};

export const promosApi = {
  list: (eventId: string) => api.get(`/promos/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/promos/event/${eventId}`, data),
  validate: (code: string, eventId: string, ticketPrice?: number) =>
    api.post('/promos/validate', { code, eventId, ticketPrice }),
  delete: (id: string) => api.delete(`/promos/${id}`),
  update: (id: string, data: any) => api.put(`/promos/${id}`, data),
};

export const waitlistApi = {
  join: (data: any) => api.post('/waitlist/join', data),
  list: (eventId: string) => api.get(`/waitlist/event/${eventId}`),
  notify: (eventId: string, count?: number) => api.post(`/waitlist/notify/${eventId}`, { count }),
  remove: (id: string) => api.delete(`/waitlist/${id}`),
};

export const attendeesApi = {
  list: (eventId: string, params?: any) => api.get(`/attendees/event/${eventId}`, { params }),
  export: (eventId: string, format: 'csv' | 'xlsx' = 'csv') =>
    api.get(`/attendees/event/${eventId}/export`, { params: { format }, responseType: 'blob' }),
  checkIn: (data: { qrCode: string; eventId: string }) => api.post('/attendees/checkin', data),
  getTicket: (qrCode: string) => api.get(`/attendees/ticket/${qrCode}`),
};

export const speakersApi = {
  list: (eventId: string) => api.get(`/speakers/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/speakers/event/${eventId}`, data),
  update: (id: string, data: any) => api.put(`/speakers/${id}`, data),
  delete: (id: string) => api.delete(`/speakers/${id}`),
  updateChecklist: (id: string, data: any) => api.patch(`/speakers/${id}/checklist`, data),
};

export const sponsorsApi = {
  list: (eventId: string) => api.get(`/sponsors/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/sponsors/event/${eventId}`, data),
  delete: (id: string) => api.delete(`/sponsors/${id}`),
};

export const emailsApi = {
  list: (eventId: string) => api.get(`/emails/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/emails/event/${eventId}`, data),
  send: (eventId: string, campaignId: string) => api.post(`/emails/event/${eventId}/send/${campaignId}`),
  generateCopy: (data: any) => api.post('/emails/ai-generate', data),
};

export const analyticsApi = {
  plannerOverview: () => api.get('/analytics/planner/overview'),
  eventStats: (eventId: string) => api.get(`/analytics/events/${eventId}`),
  checkInLive: (eventId: string) => api.get(`/analytics/events/${eventId}/checkin-live`),
  vendorRevenue: () => api.get('/analytics/vendor/revenue'),
  marketIntelligence: () => api.get('/analytics/vendor/market'),
};

export const aiApi = {
  generateEventCopy: (prompt: string) => api.post('/ai/event-copy', { prompt }),
  planIntake: (message: string, conversationHistory: any[]) =>
    api.post('/ai/plan/intake', { message, conversationHistory }),
  generatePlan: (data: any) => api.post('/ai/plan/generate', data),
  getPlans: () => api.get('/ai/plans'),
};

export const contractsApi = {
  list: (params?: any) => api.get('/contracts', { params }),
  get: (id: string) => api.get(`/contracts/${id}`),
  create: (data: any) => api.post('/contracts', data),
  update: (id: string, data: any) => api.put(`/contracts/${id}`, data),
  send: (id: string) => api.post(`/contracts/${id}/send`),
  void: (id: string, reason: string) => api.post(`/contracts/${id}/void`, { reason }),
  resend: (id: string, role: string) => api.post(`/contracts/${id}/resend/${role}`),
  fromBooking: (bookingId: string, data?: any) => api.post(`/contracts/from-booking/${bookingId}`, data || {}),
  downloadPdfUrl: (id: string) => `/api/contracts/${id}/pdf`,
};


export const crmApi = {
  list: () => api.get('/crm'),
  getOAuthUrl: (provider: string) => api.get(`/crm/oauth/${provider}/url`),
  connect: (data: { provider: string; accessToken: string; instanceUrl?: string; portalId?: string; refreshToken?: string }) =>
    api.post('/crm/connect', data),
  update: (id: string, data: any) => api.put(`/crm/${id}`, data),
  disconnect: (id: string) => api.delete(`/crm/${id}`),
  sync: (id: string) => api.post(`/crm/${id}/sync`),
  test: (id: string) => api.post(`/crm/${id}/test`),
  logs: (id: string, params?: any) => api.get(`/crm/${id}/logs`, { params }),
  metadata: (id: string) => api.get(`/crm/${id}/metadata`),
};


export const instalmentApi = {
  preview: (data: { totalAmount: number; instalmentCount: 3 | 6; startDate?: string }) =>
    api.post('/instalments/preview', data),
  list: () => api.get('/instalments'),
  get: (id: string) => api.get(`/instalments/${id}`),
  create: (data: { bookingId: string; instalmentCount: 3 | 6; startDate?: string }) =>
    api.post('/instalments', data),
  cancel: (id: string, reason?: string) =>
    api.post(`/instalments/${id}/cancel`, { reason }),
  retry: (planId: string, paymentId: string) =>
    api.post(`/instalments/${planId}/retry/${paymentId}`),
};


export const distributionApi = {
  list: (eventId: string) => api.get(`/distribution/${eventId}/distributions`),
  push: (eventId: string, channel: string) =>
    api.post(`/distribution/${eventId}/distributions/push`, { channel }),
  unpublish: (eventId: string, distId: string) =>
    api.post(`/distribution/${eventId}/distributions/${distId}/unpublish`),
  getWidgetSnippet: (eventId: string, opts?: { mode?: string; primaryColor?: string; accentColor?: string; width?: string }) =>
    api.post(`/distribution/${eventId}/distributions/widget-snippet`, opts || { mode: 'card' }),
};

export const uploadApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.post('/upload/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  portfolio: (files: File[]) => {
    const form = new FormData();
    files.forEach(f => form.append('images', f));
    return api.post('/upload/portfolio', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

// ─── Stays Guest Booking API ───────────────────────────
export interface StayPropertyRoom {
  id: string;
  name: string;
  roomType: string;
  pricePerNight: string | number;
  currency: string;
  capacity: number;
  isAvailable?: boolean;
}

export interface StayProperty {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  propertyType: string;
  city: string;
  state?: string | null;
  address?: string | null;
  coverImageUrl?: string | null;
  galleryUrls?: string[];
  amenities?: string[];
  rating?: string | number;
  reviewCount?: number;
  rooms: StayPropertyRoom[];
  host?: { id: string; businessName: string; rating?: string | number; isVerified?: boolean };
}

export interface CreateStayBookingInput {
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  specialRequests?: string;
}

export const staysApi = {
  search: (params: Record<string, string | number | undefined>) => api.get('/properties', { params }),
  availability: (propertyId: string, checkIn: string, checkOut: string) =>
    api.get(`/properties/${propertyId}/availability`, { params: { checkIn, checkOut } }),
  createBooking: (payload: CreateStayBookingInput) => api.post('/stay-bookings', payload),
  listBookings: (params?: Record<string, string | number | undefined>) => api.get('/stay-bookings', { params }),
  getBooking: (id: string) => api.get(`/stay-bookings/${id}`),
  cancelBooking: (id: string) => api.post(`/stay-bookings/${id}/cancel`),
};
