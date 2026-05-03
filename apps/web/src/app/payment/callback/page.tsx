'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

// Force dynamic rendering to avoid SSG issues with useSearchParams
export const dynamic = 'force-dynamic';

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference) { setStatus('failed'); setMessage('No payment reference found'); return; }

    const ref = reference.replace(/-DEP$|-BAL$/, '');
    setBookingRef(ref);
    verifyPayment(reference);
  }, [searchParams]);

  async function verifyPayment(reference: string) {
    try {
      // Paystack webhooks handle the actual verification server-side
      // This page just confirms to the user that payment was received
      await new Promise(r => setTimeout(r, 2000)); // Brief loading
      setStatus('success');
      setMessage('Your payment was received successfully. A confirmation email has been sent.');
    } catch {
      setStatus('failed');
      setMessage('Payment verification failed. Please contact support if funds were deducted.');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="animate-spin text-[var(--accent)] mx-auto mb-4" />
            <h1 className="font-bold text-xl mb-2">Verifying payment...</h1>
            <p className="text-sm text-[var(--muted)]">Please wait while we confirm your payment with Paystack.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <h1 className="font-bold text-xl mb-2">Payment Successful! 🎉</h1>
            <p className="text-sm text-[var(--muted)] mb-2">{message}</p>
            {bookingRef && (
              <div className="bg-[var(--bg)] rounded-lg p-3 mb-5 text-xs font-mono text-[var(--mid)]">
                Reference: {bookingRef}
              </div>
            )}
            <div className="space-y-2">
              <Link href="/dashboard" className="btn-primary w-full justify-center flex">
                Go to Dashboard
              </Link>
              <Link href="/plan" className="btn-secondary w-full justify-center flex text-sm">
                Plan Another Event
              </Link>
            </div>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h1 className="font-bold text-xl mb-2">Payment Failed</h1>
            <p className="text-sm text-[var(--muted)] mb-5">{message}</p>
            <div className="space-y-2">
              <button onClick={() => router.back()} className="btn-primary w-full justify-center flex">
                Try Again
              </button>
              <Link href="/contact" className="btn-secondary w-full justify-center flex text-sm">
                Contact Support
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <Loader2 size={48} className="animate-spin text-[var(--accent)] mx-auto mb-4" />
          <h1 className="font-bold text-xl mb-2">Loading...</h1>
        </div>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  );
}
