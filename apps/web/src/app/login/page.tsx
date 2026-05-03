'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { Loader2, Sparkles } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isLoading } = useAuthStore();
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setLoginError(null);
    try {
      await login(data.email, data.password);
      const user = useAuthStore.getState().user;
      toast.success('Welcome back!');
      if (user?.role === 'ADMIN') router.replace('/admin');
      else if (user?.role === 'VENDOR') router.replace('/vendor');
      else if (user?.role === 'PLANNER') router.replace('/dashboard');
      else router.replace('/');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Login failed. Please check your credentials.';
      setLoginError(message);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left: Brand panel (desktop only) ─────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] flex-shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1C1528 0%, #2D1B5E 60%, #1C1528 100%)' }}>

        {/* Subtle radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #6C2BD9 0%, transparent 70%)' }} />

        {/* Top: Logo */}
        <div className="relative z-10 p-12 pb-0">
          <img src="/owambe-logo-auth.png" alt="Owambe" className="h-[72px] w-auto mb-4" />
          <p className="text-white/40 text-xs uppercase tracking-[2.5px] font-medium">
            Nigeria&apos;s Event Platform
          </p>
        </div>

        {/* Middle: Tagline */}
        <div className="relative z-10 px-12">
          <div className="inline-flex items-center gap-2 bg-white/[0.08] border border-white/[0.1] rounded-full px-3 py-1.5 mb-5">
            <Sparkles size={11} className="text-[#C9A227]" />
            <span className="text-white/60 text-xs">AI-powered event planning</span>
          </div>
          <blockquote className="text-white text-xl font-light leading-relaxed mb-8">
            &ldquo;From Lagos to the world — plan your perfect event in minutes.&rdquo;
          </blockquote>
          <div className="flex gap-8">
            {[['200+', 'Verified Vendors'], ['50+', 'Events Monthly'], ['93%', 'Cheaper than Cvent']].map(([val, label]) => (
              <div key={label}>
                <div className="font-bold text-2xl text-[#C9A227]">{val}</div>
                <div className="text-xs text-white/40 mt-0.5 leading-tight">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 p-12 pt-0">
          <div className="border-t border-white/[0.08] pt-6 text-white/20 text-xs">
            © 2026 Owambe.com · Lagos, Nigeria
          </div>
        </div>
      </div>

      {/* ── Right: Form panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[var(--surface)]">

        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-center py-8 px-6 border-b border-[var(--border)] bg-white">
          <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm">

            <div className="mb-8">
              <h1 className="font-bold text-2xl text-[var(--dark)] mb-1.5">Welcome back</h1>
              <p className="text-sm text-[var(--muted)]">
                Sign in to your Owambe account.{' '}
                <Link href="/register" className="text-[var(--accent)] font-semibold hover:underline">
                  Create one free
                </Link>
              </p>
            </div>

            {loginError && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  {...register('email')}
                />
                {errors.email && <p className="text-xs text-[var(--danger)] mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="label" style={{ marginBottom: 0 }}>Password</label>
                  <Link href="/forgot-password" className="text-xs text-[var(--accent)] hover:underline font-medium">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  className="input"
                  placeholder="Your password"
                  {...register('password')}
                />
                {errors.password && <p className="text-xs text-[var(--danger)] mt-1">{errors.password.message}</p>}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full justify-center flex items-center gap-2 py-3 text-sm font-semibold mt-2"
              >
                {isLoading && <Loader2 size={14} className="animate-spin" />}
                Sign In
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-xs text-[var(--muted)] bg-[var(--surface)] px-3">or</div>
            </div>

            <button className="w-full btn-secondary justify-center flex items-center gap-2.5 py-2.5 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-xs text-[var(--muted)] mt-6">
              By signing in you agree to our{' '}
              <Link href="/terms" className="underline hover:text-[var(--dark)]">Terms</Link>
              {' '}and{' '}
              <Link href="/privacy" className="underline hover:text-[var(--dark)]">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
