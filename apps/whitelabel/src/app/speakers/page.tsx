import { getTenant } from '../../lib/tenant';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

const API_URL = process.env.OWAMBE_API_URL || 'https://api.owambe.com/api';

async function getTenantSpeakers(subdomain: string) {
  try {
    // Fetch the tenant's upcoming/live events and collect speakers
    const res = await axios.get(`${API_URL}/tenants/${subdomain}/events`, {
      params: { limit: 20 },
      timeout: 8000,
    });
    const events = res.data.events || [];
    // Collect all speakers from all events (deduplicated by name)
    const allSpeakers: any[] = [];
    const seen = new Set<string>();
    for (const event of events) {
      if (event.speakers) {
        for (const s of event.speakers) {
          const key = `${s.name}|${s.company || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            allSpeakers.push({ ...s, eventName: event.name, eventSlug: event.slug });
          }
        }
      }
    }
    return allSpeakers;
  } catch {
    return [];
  }
}

export async function generateMetadata() {
  const tenant = await getTenant();
  return {
    title: `Speakers${tenant ? ` | ${tenant.name}` : ''}`,
    description: tenant ? `Meet the speakers at ${tenant.name} events` : 'Event speakers',
  };
}

export default async function SpeakersPage() {
  const tenant = await getTenant();
  if (!tenant) notFound();

  const speakers = await getTenantSpeakers(tenant.subdomain);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--brand-primary)',
        padding: '32px 24px 40px',
        textAlign: 'center',
      }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
          ← Back to events
        </Link>
        <h1 style={{ color: '#fff', fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Speakers</h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}>
          Meet the thought leaders and experts at {tenant.name} events
        </p>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px' }}>
        {speakers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎤</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No speakers announced yet</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Check back soon — speakers will be announced as events are confirmed.
            </p>
            <Link href="/" className="btn-primary">Browse events</Link>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', marginBottom: 32, fontSize: 15 }}>
              {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} across our events
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 24,
            }}>
              {speakers.map((speaker: any) => (
                <div key={speaker.id} className="card" style={{ textAlign: 'center' }}>
                  {/* Avatar */}
                  {speaker.photoUrl ? (
                    <img
                      src={speaker.photoUrl}
                      alt={speaker.name}
                      style={{
                        width: 80, height: 80, borderRadius: '50%',
                        objectFit: 'cover', margin: '0 auto 12px',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: 'var(--brand-primary-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: 28, fontWeight: 800,
                      color: 'var(--brand-primary)',
                    }}>
                      {speaker.name.charAt(0)}
                    </div>
                  )}

                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{speaker.name}</h3>
                  {speaker.title && (
                    <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>{speaker.title}</p>
                  )}
                  {speaker.company && (
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)', marginBottom: 8 }}>
                      {speaker.company}
                    </p>
                  )}
                  {speaker.topic && (
                    <p style={{
                      fontSize: 12, color: 'var(--muted)',
                      background: 'var(--brand-primary-light)',
                      padding: '4px 10px', borderRadius: 20,
                      display: 'inline-block',
                    }}>
                      {speaker.topic}
                    </p>
                  )}
                  {speaker.eventSlug && (
                    <div style={{ marginTop: 12 }}>
                      <Link href={`/events/${speaker.eventSlug}`} style={{
                        fontSize: 12, color: 'var(--brand-primary)',
                        textDecoration: 'none', fontWeight: 600,
                      }}>
                        View event →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
