'use client';

/**
 * ChangePasswordModal
 *
 * Shared modal for changing the authenticated user's own password.
 * Used in admin, vendor, and planner (dashboard) dashboards.
 *
 * Props:
 *   open     — whether the modal is visible
 *   onClose  — called when the modal should be dismissed
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, Lock, X, CheckCircle2 } from 'lucide-react';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ── Password complexity rules (must mirror backend) ────────────────────────
const PASSWORD_MIN = 12;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*()\-_=+[\]{};':",.<>?/\\|`~]/;

function getStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= PASSWORD_MIN) score++;
  if (HAS_UPPER.test(pwd)) score++;
  if (HAS_LOWER.test(pwd)) score++;
  if (HAS_DIGIT.test(pwd)) score++;
  if (HAS_SPECIAL.test(pwd)) score++;
  if (pwd.length >= 20) score++;

  if (score <= 2) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 3) return { score, label: 'Fair', color: '#f97316' };
  if (score <= 4) return { score, label: 'Good', color: '#eab308' };
  return { score, label: 'Strong', color: '#22c55e' };
}

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const newPwd = watch('newPassword', '');
  const strength = getStrength(newPwd);

  async function onSubmit(values: FormValues) {
    try {
      await api.patch('/users/me/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setDone(true);
      toast.success('Password changed successfully.');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Password change failed. Please try again.';
      toast.error(msg);
    }
  }

  function handleClose() {
    reset();
    setDone(false);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative animate-fade-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pwd-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center">
              <Lock size={15} className="text-[var(--accent)]" />
            </div>
            <h2 id="change-pwd-title" className="font-bold text-[15px] text-[var(--dark)]">
              Change Password
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--muted)] hover:text-[var(--dark)] transition-colors p-1 rounded-lg hover:bg-[var(--bg)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {done ? (
            <div className="flex flex-col items-center py-6 text-center gap-3">
              <CheckCircle2 size={40} className="text-green-500" />
              <div className="font-bold text-[var(--dark)]">Password updated</div>
              <p className="text-sm text-[var(--muted)]">
                Your new password is active. Use it next time you sign in.
              </p>
              <button onClick={handleClose} className="btn-primary mt-2 px-6">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {/* Current password */}
              <div>
                <label className="label">Current password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    className={`input pr-10 ${errors.currentPassword ? 'border-red-400' : ''}`}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    {...register('currentPassword', {
                      required: 'Current password is required.',
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--dark)]"
                    tabIndex={-1}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.currentPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.currentPassword.message}</p>
                )}
              </div>

              {/* New password */}
              <div>
                <label className="label">New password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    className={`input pr-10 ${errors.newPassword ? 'border-red-400' : ''}`}
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                    {...register('newPassword', {
                      required: 'New password is required.',
                      minLength: { value: PASSWORD_MIN, message: `Minimum ${PASSWORD_MIN} characters.` },
                      validate: {
                        hasUpper: v => HAS_UPPER.test(v) || 'Must contain an uppercase letter.',
                        hasLower: v => HAS_LOWER.test(v) || 'Must contain a lowercase letter.',
                        hasDigit: v => HAS_DIGIT.test(v) || 'Must contain a digit.',
                        hasSpecial: v => HAS_SPECIAL.test(v) || 'Must contain a special character.',
                        notSame: v =>
                          v !== watch('currentPassword') ||
                          'New password must differ from the current password.',
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--dark)]"
                    tabIndex={-1}
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {/* Strength bar */}
                {newPwd.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-all"
                          style={{
                            background: i <= strength.score ? strength.color : '#e5e7eb',
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-[11px]" style={{ color: strength.color }}>
                      {strength.label}
                    </p>
                  </div>
                )}
                {errors.newPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">Confirm new password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className={`input pr-10 ${errors.confirmPassword ? 'border-red-400' : ''}`}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    {...register('confirmPassword', {
                      required: 'Please confirm your new password.',
                      validate: v => v === newPwd || 'Passwords do not match.',
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--dark)]"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Requirements hint */}
              <div className="bg-[var(--bg)] rounded-lg p-3 text-[11px] text-[var(--muted)] space-y-0.5">
                <div>Password must be at least 12 characters and include:</div>
                <div className="grid grid-cols-2 gap-x-4 mt-1">
                  {[
                    { label: 'Uppercase letter', ok: HAS_UPPER.test(newPwd) },
                    { label: 'Lowercase letter', ok: HAS_LOWER.test(newPwd) },
                    { label: 'Number', ok: HAS_DIGIT.test(newPwd) },
                    { label: 'Special character', ok: HAS_SPECIAL.test(newPwd) },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1">
                      <span style={{ color: r.ok ? '#22c55e' : '#d1d5db' }}>✓</span>
                      <span style={{ color: r.ok ? '#16a34a' : undefined }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={handleClose} className="btn-secondary text-sm px-4">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-sm px-4 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  Update password
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
