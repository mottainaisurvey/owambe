'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Loader2, CheckCircle, Sparkles } from 'lucide-react';

const schema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Minimum 8 characters'),
  role: z.enum(['PLANNER', 'VENDOR', 'CONSUMER']),
  companyName: z.string().optional(),
});

type Form = z.infer<typeof schema>;

const ROLES = [
  { value: 'PLANNER', label: '📋 Event Planner', desc: 'I manage events for clients or my company' },
  { value: 'VENDOR', label: '🏢 Vendor / Business', desc: 'I offer services for events (venue, catering, etc.)' },
  { value: 'CONSUMER', label: '🎉 Planning My Own Event', desc: 'I want to plan a personal event using AI' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'PLANNER' },
  });

  const selectedRole = watch('role');

  async function onSubmit(data: Form) {
    try {
      await api.post('/auth/register', data);
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface)] p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-[var(--pill)] flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={32} className="text-[var(--accent)]" />
          </div>
          <h1 className="font-bold text-xl mb-2">Check your email!</h1>
          <p className="text-sm text-[var(--muted)] mb-6">
            We sent a verification link to your email. Click it to activate your account.
          </p>
          <Link href="/login" className="btn-primary">Sign In →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      {/* ── Top nav bar ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
        </Link>
        <p className="text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>

      {/* ── Form area ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-center px-5 py-12">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-4 border border-[rgba(108,43,217,0.15)]">
              <Sparkles size={11} /> Free forever for event planners
            </div>
            <h1 className="font-bold text-2xl text-[var(--dark)] mb-1.5">Create your account</h1>
            <p className="text-sm text-[var(--muted)]">
              Join 200+ vendors and planners on Owambe.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="label">I am a...</label>
              <div className="space-y-2">
                {ROLES.map(role => (
                  <label key={role.value}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === role.value
                        ? 'border-[var(--accent)] bg-[var(--pill)] shadow-sm'
                        : 'border-[var(--border)] bg-white hover:border-[rgba(108,43,217,0.3)]'
                    }`}>
                    <input type="radio" className="mt-0.5 accent-[var(--accent)]"
                      value={role.value}
                      checked={selectedRole === role.value}
                      onChange={() => setValue('role', role.value as any)} />
                    <div>
                      <div className="text-sm font-semibold">{role.label}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">{role.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input className="input" placeholder="Adaeze" {...register('firstName')} />
                {errors.firstName && <p className="text-xs text-[var(--danger)] mt-1">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input" placeholder="Okonkwo" {...register('lastName')} />
                {errors.lastName && <p className="text-xs text-[var(--danger)] mt-1">{errors.lastName.message}</p>}
              </div>
            </div>

            {selectedRole === 'PLANNER' && (
              <div>
                <label className="label">Company Name <span className="text-[var(--muted)] font-normal">(optional)</span></label>
                <input className="input" placeholder="AO Events Ltd" {...register('companyName')} />
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="you@company.com" {...register('email')} />
              {errors.email && <p className="text-xs text-[var(--danger)] mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="Minimum 8 characters" {...register('password')} />
              {errors.password && <p className="text-xs text-[var(--danger)] mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting}
              className="btn-primary w-full justify-center flex items-center gap-2 py-3 text-sm font-semibold mt-2">
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Create Account
            </button>
          </form>

          <p className="text-center text-xs text-[var(--muted)] mt-5">
            By signing up you agree to our{' '}
            <Link href="/terms" className="underline hover:text-[var(--dark)]">Terms</Link> and{' '}
            <Link href="/privacy" className="underline hover:text-[var(--dark)]">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
