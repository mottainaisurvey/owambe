'use client';
import { Star, MessageSquare } from 'lucide-react';

export default function StaysReviewsPage() {
  return (
    <div className="p-6 animate-fade-up">
      <div className="mb-6">
        <h2 className="section-title">Guest Reviews</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">Ratings and feedback from guests who stayed at your properties.</p>
      </div>

      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-yellow-50 flex items-center justify-center mb-4">
          <Star size={24} className="text-yellow-500" />
        </div>
        <h3 className="font-semibold text-[var(--dark)] mb-2">No reviews yet</h3>
        <p className="text-sm text-[var(--muted)] max-w-xs">
          Guest reviews will appear here after completed stays. Encourage guests to leave a review after checkout.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]">
          <MessageSquare size={14} />
          <span>Reviews are automatically collected after each completed reservation.</span>
        </div>
      </div>
    </div>
  );
}
