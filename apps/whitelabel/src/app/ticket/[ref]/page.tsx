import { getTenant } from '../../../lib/tenant';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { Calendar, MapPin, CheckCircle, Download, Share2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.OWAMBE_API_URL || 'https://api.owambe.com/api';

async function getTicket(ref: string) {
  try {
    const res = await axios.get(`${API_URL}/attendees/ticket/${ref}`, { timeout: 8000 });
    return res.data.attendee;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { ref: string } }) {
  const ticket = await getTicket(params.ref);
  return {
    title: ticket ? `Your Ticket — ${ticket.event?.name}` : 'Ticket',
    description: ticket ? `Your registration confirmation for ${ticket.event?.name}` : 'Event ticket',
  };
}

export default async function TicketPage({ params }: { params: { ref: string } }) {
  const [tenant, ticket] = await Promise.all([getTenant(), getTicket(params.ref)]);

  if (!tenant) notFound();
  if (!ticket) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎫</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Ticket not found</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          We couldn&apos;t find a ticket with that reference. Please check your confirmation email.
        </p>
        <Link href="/" className="btn-primary">← Back to events</Link>
      </div>
    );
  }

  const event = ticket.event;
  const startDate = event?.startDate ? new Date(event.startDate) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Success header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--brand-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <CheckCircle size={36} color="var(--brand-primary)" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>You&apos;re registered!</h1>
          <p style={{ color: 'var(--muted)', fontSize: 15 }}>
            A confirmation email with your QR code has been sent to <strong>{ticket.email}</strong>
          </p>
        </div>

        {/* Ticket card */}
        <div className="card" style={{ marginBottom: 24 }}>
          {/* Event info */}
          <div style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{event?.name}</h2>
            {startDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
                <Calendar size={15} />
                <span>{format(startDate, 'EEEE, MMMM d, yyyy · h:mm a')}</span>
              </div>
            )}
            {event?.venue && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 14 }}>
                <MapPin size={15} />
                <span>{event.venue}{event.city ? `, ${event.city}` : ''}</span>
              </div>
            )}
          </div>

          {/* Attendee info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Attendee</p>
              <p style={{ fontWeight: 700 }}>{ticket.firstName} {ticket.lastName}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Ticket Type</p>
              <p style={{ fontWeight: 700 }}>{ticket.ticketType?.name || 'General Admission'}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reference</p>
              <p style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{ticket.qrCode}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Status</p>
              <span style={{
                display: 'inline-block',
                background: 'var(--brand-primary-light)',
                color: 'var(--brand-primary)',
                padding: '2px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
              }}>
                {ticket.checkInStatus === 'CHECKED_IN' ? '✅ Checked In' : '🎫 Confirmed'}
              </span>
            </div>
          </div>

          {/* QR placeholder */}
          <div style={{
            background: '#f5f5f5',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            border: '1px dashed var(--border)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              Your QR code has been emailed to you. Present it at the entrance.
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--brand-primary)' }}>
              {ticket.qrCode}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Back to events
          </Link>
          {event?.slug && (
            <Link href={`/events/${event.slug}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14,
              border: '1.5px solid var(--border)', color: 'var(--dark)', background: '#fff',
            }}>
              <Share2 size={14} /> View event
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
