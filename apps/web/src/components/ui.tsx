'use client';

import { cn } from '@/lib/utils';
import { Loader2, X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

// ─── MODAL ───────────────────────────────────────────
interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, width = 'max-w-md', footer }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-2xl w-full ${width} max-h-[90vh] flex flex-col shadow-lg animate-fade-up`}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] flex-shrink-0">
          <h2 className="font-bold text-base text-[var(--dark)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--dark)] transition-colors p-1 rounded-lg hover:bg-[var(--bg)]">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-[var(--border)]">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ─── SPINNER ─────────────────────────────────────────
export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-[var(--muted)]', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner size={28} />
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="card text-center py-12 px-8">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-bold text-[var(--dark)] mb-1">{title}</div>
      {description && <div className="text-sm text-[var(--muted)] mb-5">{description}</div>}
      {action}
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: ReactNode;
  positive?: boolean;
}

export function StatCard({ label, value, sub, color = '#6C2BD9', icon, positive }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: color }} />
      <div className="flex items-start justify-between mb-2">
        <div className="stat-label">{label}</div>
        {icon && <div style={{ color }}>{icon}</div>}
      </div>
      <div className="stat-number">{value}</div>
      {sub && <div className="text-[11px] text-[var(--muted)] mt-1.5">{sub}</div>}
    </div>
  );
}

// ─── BADGE ───────────────────────────────────────────
type BadgeVariant = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'purple';

const BADGE_STYLES: Record<BadgeVariant, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-700',
  gray: 'bg-gray-100 text-gray-600',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ children, variant = 'gray' }: { children: ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full', BADGE_STYLES[variant])}>
      {children}
    </span>
  );
}

// ─── FORM FIELD ──────────────────────────────────────
interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, error, required, children }: FieldProps) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
    </div>
  );
}

// ─── PROGRESS BAR ────────────────────────────────────
export function ProgressBar({ value, max, color = 'var(--accent)', className = '' }: {
  value: number; max: number; color?: string; className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn('h-2 bg-[var(--border)] rounded-full overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─── CONFIRM DIALOG ──────────────────────────────────
interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, isDangerous = false, isLoading = false
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}
      footer={
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn('flex-1 flex items-center justify-center gap-2', isDangerous ? 'btn-danger' : 'btn-primary')}>
            {isLoading && <Spinner size={14} className="text-white" />}
            {confirmLabel}
          </button>
        </div>
      }>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{description}</p>
    </Modal>
  );
}

// ─── AVATAR ──────────────────────────────────────────
export function Avatar({ name, size = 32, src }: { name: string; size?: number; src?: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const COLORS = ['#6C2BD9', '#C9A227', '#7B61FF', '#0EA5E9', '#D97706', '#059669'];
  const colorIndex = name.charCodeAt(0) % COLORS.length;

  if (src) {
    return (
      <img src={src} alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }} />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: COLORS[colorIndex],
        fontSize: size * 0.35,
      }}>
      {initials}
    </div>
  );
}
