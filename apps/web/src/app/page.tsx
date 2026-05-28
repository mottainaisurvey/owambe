// OWAMBE-DOT-COM-PLACEHOLDER-01 — server component wrapper
// Exports noindex metadata (AC-7) and renders the client-side placeholder page.
// The actual page content lives in PlaceholderHomePage.tsx ('use client').
// Next.js 14 App Router: metadata can only be exported from Server Components.
import type { Metadata } from 'next';
import PlaceholderHomePage from './PlaceholderHomePage';

export const metadata: Metadata = {
  title: 'Owambe — Nigeria\'s Platform for Events, Stays & Experiences',
  description: 'Owambe is becoming the operating platform for Nigerian event planners, property hosts, and experience operators — with a shared vendor marketplace.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function Page() {
  return <PlaceholderHomePage />;
}
