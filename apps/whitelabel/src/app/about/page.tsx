import { getTenant } from '../../lib/tenant';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

const API_URL = process.env.OWAMBE_API_URL || 'https://api.owambe.com/api';

async function getTenantStats(subdomain: string) {
  try {
    const res = await axios.get(`${API_URL}/tenants/${subdomain}/events`, {
      params: { limit: 100 },
      timeout: 8000,
    });
    const events = res.data.events || [];
    const total = res.data.total || 0;
    const live = events.filter((e: any) => e.status === 'LIVE').length;
    const totalAttendees = events.reduce((sum: number, e: any) => sum + (e._count?.attendees || 0), 0);
    return { totalEvents: total, liveEvents: live, totalAttendees };
  } catch {
    return { totalEvents: 0, liveEvents: 0, totalAttendees: 0 };
  }
}

export async function generateMetadata() {
  const tenant = await getTenant();
  return {
    title: `About${tenant ? ` | ${tenant.name}` : ''}`,
    description: tenant?.tagline || `Learn more about ${tenant?.name}`,
  };
}

export default async function AboutPage() {
  const tenant = await getTenant();
  if (!tenant) notFound();

  const stats = await getTenantStats(tenant.subdomain);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)' }}>
      {/* Hero */}
      <header style={{
        background: 'var(--brand-primary)',
        padding: '48px 24px 56px',
        textAlign: 'center',
      }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>
          ← Back to events
        </Link>
        {tenant.logoUrl && (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            style={{ height: 56, margin: '0 auto 20px', display: 'block', objectFit: 'contain' }}
          />
        )}
        <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 800, marginBottom: 12 }}>{tenant.name}</h1>
        {tenant.tagline && (
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, maxWidth: 560, margin: '0 auto' }}>
            {tenant.tagline}
          </p>
        )}
      </header>

      {/* Stats row */}
      {(stats.totalEvents > 0 || stats.totalAttendees > 0) && (
        <div style={{
          background: '#fff',
          borderBottom: '1px solid var(--border)',
          padding: '24px 16px',
        }}>
          <div style={{
            maxWidth: 700, margin: '0 auto',
            display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap',
          }}>
            {stats.totalEvents > 0 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-primary)' }}>{stats.totalEvents}</p>
                <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Events hosted</p>
              </div>
            )}
            {stats.liveEvents > 0 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-accent)' }}>{stats.liveEvents}</p>
                <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Live now</p>
              </div>
            )}
            {stats.totalAttendees > 0 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-primary)' }}>
                  {stats.totalAttendees.toLocaleString('en-NG')}
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Attendees</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 16px' }}>
        {/* About section */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>About {tenant.name}</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.7, fontSize: 15 }}>
            {tenant.tagline || `${tenant.name} is an event organiser powered by Owambe — Africa's leading event management platform.`}
          </p>
          {tenant.planner?.companyName && tenant.planner.companyName !== tenant.name && (
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, fontSize: 15, marginTop: 12 }}>
              Organised by <strong>{tenant.planner.companyName}</strong>.
            </p>
          )}
        </div>

        {/* Social links */}
        {tenant.socialLinks && Object.keys(tenant.socialLinks).length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Follow us</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(tenant.socialLinks).map(([platform, url]) => (
                url ? (
                  <a
                    key={platform}
                    href={url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      border: '1.5px solid var(--border)',
                      color: 'var(--dark)', textDecoration: 'none',
                      fontSize: 14, fontWeight: 600,
                      background: '#fff',
                    }}
                  >
                    {platform === 'twitter' ? '𝕏' : platform === 'instagram' ? '📸' : platform === 'linkedin' ? 'in' : '🔗'}
                    {' '}{platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </a>
                ) : null
              ))}
            </div>
          </div>
        )}

        {/* Footer text */}
        {tenant.footerText && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {tenant.footerText}
          </p>
        )}

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link href="/" className="btn-primary">
            Browse all events →
          </Link>
        </div>
      </div>
    </div>
  );
}
