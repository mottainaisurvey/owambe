/**
 * Next.js API Route: POST /api/cohort/interest
 *
 * Proxies cohort interest submissions from the placeholder homepage
 * to the Express API at NEXT_PUBLIC_API_URL/cohort/interest.
 *
 * This route exists because PlaceholderHomePage.tsx calls the relative
 * URL /api/cohort/interest (client-side fetch), and there is no rewrite
 * proxy in next.config.js. This server-side route bridges the gap.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') ||
  'http://localhost:4000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${API_BASE}/api/cohort/interest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error('[api/cohort/interest] proxy error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to submit interest. Please try again.' },
      { status: 500 }
    );
  }
}
