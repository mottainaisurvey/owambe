'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Loader2, CheckCircle, Sparkles, ArrowLeft } from 'lucide-react';

// ─── Tier 1: Supply / business identities ─────────────────────────────────────
const SUPPLY_ROLES = [
  { value: 'PLANNER', label: '📋 Event Planner', desc: 'I manage events for clients or my company' },
  { value: 'VENDOR', label: '🏢 Vendor / Business', desc: 'I offer services for events (venue, catering, etc.)' },
  { value: 'HOST', label: '🏠 Host / Property Manager', desc: 'I list and manage short-stay properties on Owambe Stays' },
  { value: 'OPERATOR', label: '🌍 Experience Operator', desc: 'I offer cultural tours, food tastings, workshops, and other guest experiences' },
];

// ─── Tier 2: Consumer intents ─────────────────────────────────────────────────
const CONSUMER_INTENTS = [
  { value: 'BOOK_STAY', label: '🏠 Book a Stay', desc: 'Find and book short-stay properties', mode: 'STAYS', dest: '/stays' },
  { value: 'BOOK_EXPERIENCE', label: '🌍 Book an Experience', desc: 'Discover tours, workshops, and cultural experiences', mode: 'EXPERIENCES', dest: '/experiences' },
  { value: 'ATTEND_EVENT', label: '🎟 Attend an Event', desc: 'Browse and register for events', mode: 'EVENTS', dest: '/events' },
  { value: 'PLAN_EVENT', label: '✨ Plan a Personal Event', desc: 'Plan your own event with AI assistance', mode: 'EVENTS', dest: '/plan' },
];

const schema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Minimum 8 characters'),
  role: z.enum(['PLANNER', 'VENDOR', 'CONSUMER', 'HOST', 'OPERATOR']),
  consumerIntent: z.string().optional(),
  companyName: z.string().optional(),
});

type Form = z.infer<typeof schema>;

type Tier = 'chooser' | 'supply' | 'consumer';

export default function RegisterPage() {
  const router = useRouter();
  const [success, setSuccess] = useState(false);
  const [successDest, setSuccessDest] = useState('/login');
  const [tier, setTier] = useState<Tier>('chooser');
  const [selectedIntent, setSelectedIntent] = useState<typeof CONSUMER_INTENTS[0] | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'PLANNER' },
  });

  const selectedRole = watch('role');

  async function onSubmit(data: Form) {
    try {
      await api.post('/auth/register', data);
      // Determine post-registration destination
      if (tier === 'consumer' && selectedIntent) {
        setSuccessDest(selectedIntent.dest);
      } else {
        setSuccessDest('/login');
      }
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    }
  }

  // ─── Success screen ─────────────────────────────────────────────────────────
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

  // ─── Tier chooser ───────────────────────────────────────────────────────────
  if (tier === 'chooser') {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <div className="bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
          <p className="text-sm text-[var(--muted)]">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">Sign in</Link>
          </p>
        </div>

        <div className="flex items-start justify-center px-5 py-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-4 border border-[rgba(108,43,217,0.15)]">
                <Sparkles size={11} /> Nigeria&apos;s event platform
              </div>
              <h1 className="font-bold text-2xl text-[var(--dark)] mb-1.5">Create your account</h1>
              <p className="text-sm text-[var(--muted)]">What brings you to Owambe?</p>
            </div>

            <div className="space-y-3">
              {/* Consumer path */}
              <button
                onClick={() => {
                  setValue('role', 'CONSUMER');
                  setTier('consumer');
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-white hover:border-[var(--accent)] hover:bg-[var(--pill)] transition-all text-left"
              >
                <span className="text-2xl mt-0.5">🎉</span>
                <div>
                  <div className="text-sm font-semibold text-[var(--dark)]">I&apos;m a guest / attendee</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">Book stays, experiences, or plan your own event</div>
                </div>
              </button>

              {/* Supply / business path */}
              <button
                onClick={() => setTier('supply')}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-white hover:border-[var(--accent)] hover:bg-[var(--pill)] transition-all text-left"
              >
                <span className="text-2xl mt-0.5">🏢</span>
                <div>
                  <div className="text-sm font-semibold text-[var(--dark)]">I&apos;m a professional / business</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">Event planner, vendor, host, or experience operator</div>
                </div>
              </button>
            </div>

            <p className="text-center text-xs text-[var(--muted)] mt-8">
              By signing up you agree to our{' '}
              <Link href="/terms" className="underline hover:text-[var(--dark)]">Terms</Link> and{' '}
              <Link href="/privacy" className="underline hover:text-[var(--dark)]">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Consumer intent chooser → form ────────────────────────────────────────
  if (tier === 'consumer') {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <div className="bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
          <p className="text-sm text-[var(--muted)]">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">Sign in</Link>
          </p>
        </div>

        <div className="flex items-start justify-center px-5 py-12">
          <div className="w-full max-w-md">
            <button
              onClick={() => setTier('chooser')}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--dark)] mb-6 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>

            <div className="mb-6">
              <h1 className="font-bold text-2xl text-[var(--dark)] mb-1.5">What are you here to do?</h1>
              <p className="text-sm text-[var(--muted)]">Choose your primary interest — you can always explore everything later.</p>
            </div>

            {/* Intent selector */}
            {!selectedIntent ? (
              <div className="space-y-2 mb-6">
                {CONSUMER_INTENTS.map(intent => (
                  <button
                    key={intent.value}
                    onClick={() => {
                      setSelectedIntent(intent);
                      setValue('consumerIntent', intent.value);
                    }}
                    className="w-full flex items-start gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-white hover:border-[var(--accent)] hover:bg-[var(--pill)] transition-all text-left"
                  >
                    <span className="text-xl mt-0.5">{intent.label.split(' ')[0]}</span>
                    <div>
                      <div className="text-sm font-semibold text-[var(--dark)]">{intent.label.split(' ').slice(1).join(' ')}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">{intent.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Selected intent badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full border border-[rgba(108,43,217,0.15)]">
                    {selectedIntent.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSelectedIntent(null); setValue('consumerIntent', undefined); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--dark)] underline"
                  >
                    Change
                  </button>
                </div>

                <input type="hidden" value="CONSUMER" {...register('role')} />
                <input type="hidden" value={selectedIntent.value} {...register('consumerIntent')} />

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

                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" placeholder="you@example.com" {...register('email')} />
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

                <p className="text-center text-xs text-[var(--muted)] mt-2">
                  By signing up you agree to our{' '}
                  <Link href="/terms" className="underline hover:text-[var(--dark)]">Terms</Link> and{' '}
                  <Link href="/privacy" className="underline hover:text-[var(--dark)]">Privacy Policy</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Supply / business form ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <div className="bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
        </Link>
        <p className="text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>

      <div className="flex items-start justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <button
            onClick={() => setTier('chooser')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--dark)] mb-6 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-4 border border-[rgba(108,43,217,0.15)]">
              <Sparkles size={11} /> Free to start for event and stay professionals
            </div>
            <h1 className="font-bold text-2xl text-[var(--dark)] mb-1.5">Create your account</h1>
            <p className="text-sm text-[var(--muted)]">
              Join vendors, planners, hosts, and property managers growing on Owambe.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="label">I am a...</label>
              <div className="space-y-2">
                {SUPPLY_ROLES.map(role => (
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

            {(selectedRole === 'PLANNER' || selectedRole === 'HOST' || selectedRole === 'OPERATOR') && (
              <div>
                <label className="label">
                  {selectedRole === 'HOST' ? 'Host Business Name' : selectedRole === 'OPERATOR' ? 'Experience Business Name' : 'Company Name'}{' '}
                  <span className="text-[var(--muted)] font-normal">(optional)</span>
                </label>
                <input
                  className="input"
                  placeholder={selectedRole === 'HOST' ? 'Lagos Short Stays Ltd' : selectedRole === 'OPERATOR' ? 'Lagos Experience Co' : 'AO Events Ltd'}
                  {...register('companyName')}
                />
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
