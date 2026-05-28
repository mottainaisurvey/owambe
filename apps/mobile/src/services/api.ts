import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.owambe.com/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── REQUEST INTERCEPTOR ─────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// ─── RESPONSE INTERCEPTOR (auto token refresh) ───────
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
}

api.interceptors.response.use(
  res => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers['Authorization'] = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        const res = await axios.post(`${API_URL}/auth/refresh`, {}, {
          headers: { Cookie: `refreshToken=${refreshToken}` },
        });
        const { accessToken } = res.data;
        await SecureStore.setItemAsync('accessToken', accessToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        original.headers['Authorization'] = `Bearer ${accessToken}`;
        processQueue(null, accessToken);
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ─── TYPED API HELPERS ───────────────────────────────
export const authApi = {
  register: (d: any) => api.post('/auth/register', d),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (d: any) => api.put('/auth/me', d),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const eventsApi = {
  list: (params?: any) => api.get('/events', { params }),
  get: (id: string) => api.get(`/events/${id}`),
  create: (d: any) => api.post('/events', d),
  publish: (id: string) => api.post(`/events/${id}/publish`),
  getPublic: (slug: string) => api.get(`/events/public/${slug}`),
  listPublic: (params?: any) => api.get('/events/public', { params }),
};

export const vendorsApi = {
  search: (params?: any) => api.get('/vendors/search', { params }),
  getProfile: (slug: string) => api.get(`/vendors/profile/${slug}`),
  getMyProfile: () => api.get('/vendors/me'),
  update: (d: any) => api.put('/vendors/me', d),
  setAvailability: (dates: any[]) => api.put('/vendors/me/availability', { dates }),
  setupBank: (d: any) => api.post('/vendors/me/bank-account', d),
  addPackage: (d: any) => api.post('/vendors/me/packages', d),
};

export const bookingsApi = {
  list: (params?: any) => api.get('/bookings', { params }),
  createInstant: (d: any) => api.post('/bookings/instant', d),
  createRfq: (d: any) => api.post('/bookings/rfq', d),
  confirm: (id: string) => api.post(`/bookings/${id}/confirm`),
  cancel: (id: string, reason: string) => api.post(`/bookings/${id}/cancel`, { reason }),
  getMessages: (id: string) => api.get(`/bookings/${id}/messages`),
  sendMessage: (id: string, body: string) => api.post(`/bookings/${id}/messages`, { body }),
};

export const attendeesApi = {
  checkIn: (d: { qrCode: string; eventId: string }) => api.post('/attendees/checkin', d),
  getTicket: (qrCode: string) => api.get(`/attendees/ticket/${qrCode}`),
  list: (eventId: string, params?: any) => api.get(`/attendees/event/${eventId}`, { params }),
};

export const analyticsApi = {
  plannerOverview: () => api.get('/analytics/planner/overview'),
  checkInLive: (eventId: string) => api.get(`/analytics/events/${eventId}/checkin-live`),
  vendorRevenue: () => api.get('/analytics/vendor/revenue'),
};

export const aiApi = {
  planIntake: (message: string, history: any[]) =>
    api.post('/ai/plan/intake', { message, conversationHistory: history }),
  generatePlan: (d: any) => api.post('/ai/plan/generate', d),
  generateEventCopy: (prompt: string) => api.post('/ai/event-copy', { prompt }),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  readAll: () => api.put('/notifications/read-all'),
};

export const ticketsApi = {
  list: (eventId: string) => api.get(`/tickets/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/tickets/event/${eventId}`, data),
  update: (id: string, data: any) => api.put(`/tickets/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/tickets/${id}/status`, { status }),
};

export const promosApi = {
  list: (eventId: string) => api.get(`/promos/event/${eventId}`),
  create: (eventId: string, data: any) => api.post(`/promos/event/${eventId}`, data),
  validate: (code: string, eventId: string, ticketPrice?: number) =>
    api.post('/promos/validate', { code, eventId, ticketPrice }),
  delete: (id: string) => api.delete(`/promos/${id}`),
};

export const uploadApi = {
  image: async (uri: string, fieldName = 'image') => {
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'image.jpg';
    const type = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
    formData.append(fieldName, { uri, name: filename, type } as any);
    return api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const contractsApi = {
  list: (params?: any) => api.get('/contracts', { params }),
  get: (id: string) => api.get(`/contracts/${id}`),
  fromBooking: (bookingId: string, data?: any) => api.post(`/contracts/from-booking/${bookingId}`, data || {}),
  downloadPdfUrl: (id: string) => `${api.defaults.baseURL}/contracts/${id}/pdf`,
};
