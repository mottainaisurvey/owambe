import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';

// ─── DATE HELPERS ─────────────────────────────────────
export function formatEventDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, 'h:mm a')}`;
  return format(d, 'EEE, MMM d · h:mm a');
}

export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatTimeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isYesterday(d)) return 'Yesterday';
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
  return format(d, 'MMM d');
}

export function formatFullDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEEE, MMMM d, yyyy');
}

// ─── CURRENCY ─────────────────────────────────────────
export function formatNGN(amount: number | string, compact = false): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₦0';
  if (compact) {
    if (num >= 1_000_000) return `₦${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `₦${(num / 1_000).toFixed(0)}K`;
  }
  return `₦${num.toLocaleString('en-NG')}`;
}

// ─── PHONE FORMATTING ─────────────────────────────────
export function formatNigerianPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('234')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
  return `+234${cleaned}`;
}

// ─── VALIDATION ───────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase().trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export function isValidNigerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 11 || (cleaned.startsWith('234') && cleaned.length === 13);
}

// ─── STRING HELPERS ───────────────────────────────────
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── BOOKING HELPERS ──────────────────────────────────
export function getBookingStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: '#D97706',
    CONFIRMED: '#059669',
    COMPLETED: '#6C2BD9',
    CANCELLED: '#DC2626',
  };
  return map[status] || '#8B82A0';
}

export function getDepositAmount(totalAmount: number): number {
  return Math.round(totalAmount * 0.3);
}

export function getVendorPayout(totalAmount: number, commissionRate = 0.1): number {
  return Math.round(totalAmount * (1 - commissionRate));
}

// ─── SPEAKERPROGRESS ──────────────────────────────────
export function speakerProgress(checklist: Record<string, boolean>): number {
  const keys = Object.keys(checklist);
  const done = Object.values(checklist).filter(Boolean).length;
  return keys.length > 0 ? Math.round((done / keys.length) * 100) : 0;
}

// ─── AVATAR COLOR ─────────────────────────────────────
const AVATAR_COLORS = ['#6C2BD9', '#C9A227', '#7B61FF', '#059669', '#D97706', '#DC2626', '#0EA5E9'];
export function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ─── DEBOUNCE ─────────────────────────────────────────
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
