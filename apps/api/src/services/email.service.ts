import * as postmark from 'postmark';
import { logger } from '../utils/logger';

let _pmClient: postmark.ServerClient | null = null;
function getPmClient(): postmark.ServerClient {
  if (!_pmClient) {
    _pmClient = new postmark.ServerClient(
      process.env.POSTMARK_API_KEY || ''
    );
  }
  return _pmClient;
}

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

// ─── EMAIL TEMPLATES ─────────────────────────────────
const templates: Record<string, (data: any) => string> = {
  'verify-email': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:28px">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Hi ${d.firstName}! 👋</h2>
        <p style="color:#374151;line-height:1.6">Welcome to Owambe — Nigeria's smartest event planning platform. Please verify your email to get started.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${d.verifyUrl}" style="background:#E76F2A;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Verify My Email →</a>
        </div>
        <p style="color:#9CA3AF;font-size:14px">This link expires in 24 hours. If you didn't create an Owambe account, ignore this email.</p>
      </div>
    </div>`,

  'registration-confirmation': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">You're registered, ${d.firstName}! 🎉</h2>
        <div style="background:#EEF7F2;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:4px 0;font-weight:bold;color:#1A1612">📅 ${new Date(d.eventDate).toLocaleDateString('en-NG', { weekday:'long',year:'numeric',month:'long',day:'numeric' })}</p>
          <p style="margin:4px 0;color:#374151">🎟 ${d.ticketName}</p>
          <p style="margin:4px 0;color:#374151">📍 ${d.venue || 'Venue TBC'}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.viewUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View My Ticket →</a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">Your QR code: <strong>${d.qrCode}</strong> — present at the door for entry.</p>
      </div>
    </div>`,

  'booking-confirmed': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Booking Confirmed ✅</h2>
        <p>Hi ${d.firstName}, your booking with <strong>${d.vendorName}</strong> is confirmed!</p>
        <p>📅 Event Date: <strong>${new Date(d.eventDate).toLocaleDateString('en-NG')}</strong></p>
        <p>📋 Reference: <strong>${d.reference}</strong></p>
        <p style="color:#9CA3AF;font-size:13px">Your deposit is held securely in escrow and will be released to the vendor after your event.</p>
      </div>
    </div>`,

  'vendor-booking-confirmed': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#E76F2A;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Vendor Portal</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2>New Booking Confirmed 🎉</h2>
        <p>Hi ${d.vendorFirstName}, you have a new confirmed booking for <strong>${d.vendorName}</strong>!</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:16px;margin:20px 0">
          <p>📅 Event Date: <strong>${new Date(d.eventDate).toLocaleDateString('en-NG')}</strong></p>
          <p>💰 Deposit received: <strong>${d.depositAmount}</strong></p>
          <p>💰 Balance on completion: <strong>${d.balanceAmount}</strong></p>
          <p>📋 Reference: <strong>${d.reference}</strong></p>
        </div>
        <p style="color:#6B7280;font-size:13px">The balance amount will be released to your bank account within 24 hours of the event completion.</p>
      </div>
    </div>`,

  'rfq-received': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#E76F2A;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — New RFQ</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2>New Quote Request for ${d.vendorName}</h2>
        <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin:16px 0">
          <p>📅 Event Date: <strong>${d.eventDate}</strong></p>
          <p>👥 Guest Count: <strong>${d.guestCount}</strong></p>
          <p>💰 Estimated Budget: <strong>${d.estimatedBudget}</strong></p>
          <p>📝 ${d.eventDescription}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.respondUrl}" style="background:#E76F2A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Submit Your Quote →</a>
        </div>
      </div>
    </div>`,

  'reset-password': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2>Reset Your Password</h2>
        <p>Hi ${d.firstName}, click below to reset your password. This link expires in 1 hour.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.resetUrl}" style="background:#E76F2A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Reset Password →</a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">If you didn't request this, ignore this email. Your password won't change.</p>
      </div>
    </div>`,

  'host-new-reservation': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Stays</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">New Reservation at ${d.propertyName} 🏠</h2>
        <p>Hi ${d.firstName}, you have a new reservation from <strong>${d.channelLabel}</strong>.</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:4px 0"><strong>Guest:</strong> ${d.guestName} (${d.guestEmail})</p>
          <p style="margin:4px 0"><strong>Room:</strong> ${d.roomName}</p>
          <p style="margin:4px 0"><strong>Check-in:</strong> ${d.checkIn}</p>
          <p style="margin:4px 0"><strong>Check-out:</strong> ${d.checkOut} (${d.nights} nights)</p>
          <p style="margin:4px 0"><strong>Total:</strong> ${d.totalAmount}</p>
          <p style="margin:4px 0"><strong>Your net:</strong> ${d.netToHost}</p>
          <p style="margin:4px 0;color:#6B7280;font-size:13px">${d.commissionNote}</p>
          <p style="margin:4px 0"><strong>Special requests:</strong> ${d.specialRequests}</p>
          <p style="margin:4px 0"><strong>Reference:</strong> ${d.reference}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.dashboardUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Reservation →</a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">Log in to your Stays dashboard to manage this reservation.</p>
      </div>
    </div>`,

  'guest-stay-reservation-pending': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Stays</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Reservation Created</h2>
        <p>Hi ${d.firstName}, your stay reservation at <strong>${d.propertyName}</strong> has been created and is pending deposit payment.</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:4px 0"><strong>Room:</strong> ${d.roomName}</p>
          <p style="margin:4px 0"><strong>Check-in:</strong> ${d.checkIn}</p>
          <p style="margin:4px 0"><strong>Check-out:</strong> ${d.checkOut} (${d.nights} nights)</p>
          <p style="margin:4px 0"><strong>Total:</strong> ${d.totalAmount}</p>
          <p style="margin:4px 0"><strong>Deposit due:</strong> ${d.depositAmount}</p>
          <p style="margin:4px 0"><strong>Reference:</strong> ${d.reference}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.manageUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Reservation →</a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">Your reservation is not fully confirmed until the deposit payment succeeds.</p>
      </div>
    </div>`,

  'host-reservation-cancelled': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#E76F2A;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Stays</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Reservation Cancelled</h2>
        <p>Hi ${d.firstName}, a reservation at <strong>${d.propertyName}</strong> has been cancelled.</p>
        <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:4px 0"><strong>Guest:</strong> ${d.guestName}</p>
          <p style="margin:4px 0"><strong>Reference:</strong> ${d.reference}</p>
          <p style="margin:4px 0"><strong>Cancelled by:</strong> ${d.cancelledBy}</p>
          <p style="margin:4px 0"><strong>Reason:</strong> ${d.cancellationReason}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.dashboardUrl}" style="background:#E76F2A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Details →</a>
        </div>
      </div>
    </div>`,

  'operator-new-booking': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Experiences</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">New Booking for ${d.experienceName} 🎟</h2>
        <p>Hi ${d.firstName}, you have a new booking from <strong>${d.channelLabel}</strong>.</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:4px 0"><strong>Lead participant:</strong> ${d.leadParticipantName} (${d.leadParticipantEmail})</p>
          <p style="margin:4px 0"><strong>Participants:</strong> ${d.numberOfParticipants}</p>
          <p style="margin:4px 0"><strong>Date:</strong> ${d.slotDate} at ${d.slotTime}</p>
          <p style="margin:4px 0"><strong>Total:</strong> ${d.totalAmount}</p>
          <p style="margin:4px 0"><strong>Your net:</strong> ${d.netToOperator}</p>
          <p style="margin:4px 0"><strong>Pickup requested:</strong> ${d.pickupRequested} ${d.pickupAddress !== 'N/A' ? '— ' + d.pickupAddress : ''}</p>
          <p style="margin:4px 0"><strong>Special requirements:</strong> ${d.specialRequirements}</p>
          <p style="margin:4px 0"><strong>Reference:</strong> ${d.reference}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.dashboardUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Booking →</a>
        </div>
      </div>
    </div>`,

  // C3: Guest confirmation email — pattern-match to guest-stay-reservation-pending
  'guest-experience-booking-confirmed': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com — Experiences</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Booking Created 🎟</h2>
        <p>Hi ${d.firstName}, your booking for <strong>${d.experienceName}</strong> has been created and is pending payment.</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:4px 0"><strong>Date:</strong> ${d.slotDate}</p>
          <p style="margin:4px 0"><strong>Time:</strong> ${d.slotTime}</p>
          <p style="margin:4px 0"><strong>Guests:</strong> ${d.guestCount}</p>
          <p style="margin:4px 0"><strong>Total:</strong> ${d.totalAmount}</p>
          <p style="margin:4px 0"><strong>Reference:</strong> ${d.reference}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.manageUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Complete Payment →</a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">Your booking is not confirmed until payment is completed. Meeting details will be shared after payment.</p>
      </div>
    </div>`,

  // ─── CC-COHORT-OFFER-SURFACES-01 (Amendment 01) ─────
  'cohort-interest-forward': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#6C2BD9;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">Owambe — Coastal Corridor Cohort Interest</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1C1528;margin-top:0">New cohort interest submission</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 12px;background:#F5F0FF;font-weight:bold;width:140px">Email</td><td style="padding:8px 12px;background:#F5F0FF">${d.submittedEmail}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold">Submitted at</td><td style="padding:8px 12px">${d.submittedAt}</td></tr>
          <tr><td style="padding:8px 12px;background:#F5F0FF;font-weight:bold">Source</td><td style="padding:8px 12px;background:#F5F0FF">${d.source || 'unknown'}</td></tr>
        </table>
        <p style="color:#374151;font-size:14px">This lead submitted interest in the Coastal Corridor cohort bundled offer (free Owambe Stays Growth + Experiences Growth for 12 months). Follow up manually until the cohort onboarding brief ships.</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="color:#9CA3AF;font-size:12px">Forwarded automatically by Owambe · /api/cohort/interest</p>
      </div>
    </div>`,

  // ─── OWAMBE-INTEREST-CAPTURE-HARDENING-01 ─────────
  'cohort-interest-ack': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#6C2BD9;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">Owambe</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <p style="color:#374151;font-size:16px">Hi,</p>
        <p style="color:#374151;font-size:15px">Thanks for signing up to hear about Owambe.</p>
        <p style="color:#374151;font-size:15px">We're building Owambe in public — Nigeria's platform for events, stays, experiences, and the vendor marketplace that connects them all. Right now we're heads-down getting each mode to a real shipping state, and we'll reach out when the mode that matches your business is ready for onboarding.</p>
        <p style="color:#374151;font-size:15px">No spam. No pressure. Just a note when there's something real for you.</p>
        <p style="color:#374151;font-size:15px">— The Owambe team</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="color:#9CA3AF;font-size:13px">P.S. Visit <a href="https://owambe.com" style="color:#6C2BD9">owambe.com</a> anytime to see what we're building.</p>
        <p style="color:#9CA3AF;font-size:11px">You're receiving this because you signed up at owambe.com. No further emails unless there's something real for you.</p>
      </div>
    </div>`,

  'custom-campaign': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <p>Hi ${d.firstName},</p>
        <div style="line-height:1.8;color:#374151">${d.body.replace(/\n/g, '<br>')}</div>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
        <p style="color:#9CA3AF;font-size:12px">You're receiving this because you registered for an event on Owambe.</p>
      </div>
    </div>`,

  'vendor-verified': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Your profile is live! ✅</h2>
        <p>Hi ${d.firstName}, congratulations — <strong>${d.businessName}</strong> is now verified and live on Owambe!</p>
        <p style="color:#374151">You'll start appearing in search results immediately. Clients can now book or send you quote requests.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.profileUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Profile →</a>
        </div>
        <p style="color:#6B7280;font-size:13px">💡 Tip: Complete your portfolio with at least 5 photos to rank higher in search results.</p>
      </div>
    </div>`,

  // ─── E2: APPROVAL STATE MODEL EMAIL TEMPLATES ──────
  'host-approved': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Your host profile is approved! ✅</h2>
        <p>Hi ${d.firstName}, congratulations — <strong>${d.businessName}</strong> has been approved as a host on Owambe!</p>
        <p style="color:#374151">You can now list properties and start receiving bookings.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.dashboardUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Go to Host Dashboard →</a>
        </div>
      </div>
    </div>`,

  'property-approved': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Your property listing is live! ✅</h2>
        <p>Hi ${d.firstName}, <strong>${d.propertyName}</strong> has been approved and is now live on Owambe Stays!</p>
        <p style="color:#374151">Guests can now discover and book your property.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.listingUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Listing →</a>
        </div>
      </div>
    </div>`,

  'operator-approved': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Your operator profile is approved! ✅</h2>
        <p>Hi ${d.firstName}, congratulations — <strong>${d.businessName}</strong> has been approved as an experience operator on Owambe!</p>
        <p style="color:#374151">You can now list experiences and start receiving bookings.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.dashboardUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Go to Operator Dashboard →</a>
        </div>
      </div>
    </div>`,

  'experience-approved': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Your experience listing is live! ✅</h2>
        <p>Hi ${d.firstName}, <strong>${d.experienceName}</strong> has been approved and is now live on Owambe Experiences!</p>
        <p style="color:#374151">Guests can now discover and book your experience.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.listingUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Listing →</a>
        </div>
      </div>
    </div>`,

  'vendor-rejected': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#E76F2A;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Profile Review Update</h2>
        <p>Hi ${d.firstName}, we were unable to approve <strong>${d.businessName}</strong> at this time.</p>
        <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#92400E"><strong>Reason:</strong> ${d.reason}</p>
        </div>
        <p style="color:#374151">Please update your profile and resubmit. Most profiles are approved within 24 hours once complete.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.resubmitUrl}" style="background:#E76F2A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Update & Resubmit →</a>
        </div>
      </div>
    </div>`,

  'booker-deposit-confirmed': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#2D6A4F;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0">owambe.com</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
        <h2 style="color:#1A1612">Booking Confirmed ✅ Deposit Paid</h2>
        <p>Hi ${d.firstName}, your deposit payment has been received and your booking with <strong>${d.vendorName}</strong> is now confirmed!</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:4px 0">📅 Event Date: <strong>${new Date(d.eventDate).toLocaleDateString('en-NG')}</strong></p>
          <p style="margin:4px 0">💰 Deposit paid: <strong>${d.depositPaid}</strong></p>
          <p style="margin:4px 0">📋 Reference: <strong>${d.reference}</strong></p>
        </div>
        <p style="color:#6B7280;font-size:13px">Your deposit is held securely in escrow. The vendor receives it 24 hours after your event completes successfully.</p>
      </div>
    </div>`,

  'contract-sign-request': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1A1612;padding:28px 32px;border-radius:12px 12px 0 0">
        <div style="font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">owambe.com · Document Signing</div>
        <h1 style="color:#fff;margin:0;font-size:22px">Signature Required</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p style="color:#1A1612;font-size:15px;margin-bottom:24px">Hi ${d.firstName},</p>
        <p style="color:#3D3730;line-height:1.6;margin-bottom:24px">
          You have been sent a contract to review and sign. Please read it carefully and sign by the deadline below.
        </p>
        <div style="background:#F5F2EB;border-radius:10px;padding:20px;margin-bottom:24px">
          <div style="font-size:11px;color:#9A9080;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Contract Details</div>
          <div style="font-size:18px;font-weight:700;color:#1A1612;margin-bottom:8px">${d.contractTitle}</div>
          <div style="font-size:13px;color:#9A9080;font-family:monospace">${d.reference}</div>
          ${d.eventDate ? `<div style="font-size:13px;color:#3D3730;margin-top:8px">📅 Event: ${d.eventDate}</div>` : ''}
          ${d.totalAmount ? `<div style="font-size:13px;color:#3D3730;margin-top:4px">💰 Amount: ${d.totalAmount}</div>` : ''}
          <div style="font-size:13px;color:#E63946;margin-top:8px;font-weight:600">⏰ Sign by: ${d.expiresAt}</div>
        </div>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${d.signingUrl}" style="background:#E76F2A;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Review &amp; Sign Contract →
          </a>
        </div>
        <div style="background:#EEF7F2;border-radius:8px;padding:14px;font-size:12px;color:#2D6A4F">
          🔐 This link is unique to you. Do not share it. Your signature, IP address, and timestamp will be recorded as legal evidence under Nigerian law.
        </div>
        <p style="color:#9A9080;font-size:11px;margin-top:20px;text-align:center">
          If the button above doesn't work, copy this link into your browser:<br>
          <span style="font-family:monospace;color:#2D6A4F;word-break:break-all">${d.signingUrl}</span>
        </p>
      </div>
    </div>`,

  'contract-signed-confirmation': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#059669;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <div style="font-size:36px;margin-bottom:8px">✅</div>
        <h1 style="color:#fff;margin:0;font-size:20px">${d.allSigned ? 'Contract Fully Executed' : 'Signature Received'}</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hi ${d.firstName},</p>
        ${d.allSigned
          ? `<p style="color:#3D3730;line-height:1.6">All parties have signed <strong>${d.contractTitle}</strong> (${d.reference}). This contract is now fully executed and legally binding.</p>`
          : `<p style="color:#3D3730;line-height:1.6">Your signature on <strong>${d.contractTitle}</strong> (${d.reference}) has been recorded. Waiting for the other party to sign.</p>`}
        <div style="background:#F5F2EB;border-radius:8px;padding:16px;margin:20px 0;font-size:12px;color:#9A9080">
          <div>Signed at: <strong style="color:#1A1612">${d.signedAt}</strong></div>
          <div style="margin-top:4px">IP Address: <strong style="color:#1A1612;font-family:monospace">${d.ipAddress}</strong></div>
          <div style="margin-top:4px">Reference: <strong style="color:#1A1612;font-family:monospace">${d.reference}</strong></div>
        </div>
        ${d.allSigned ? `
        <div style="text-align:center;margin:24px 0">
          <a href="${d.downloadUrl}" style="background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
            Download Executed Contract PDF
          </a>
        </div>` : ''}
        <p style="color:#9A9080;font-size:12px;line-height:1.6">
          Your signature is legally binding under the Nigerian Communications Act. Owambe maintains a tamper-evident audit trail of this contract for 7 years.
        </p>
      </div>
    </div>`,


  'instalment-paid': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#2D6A4F;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <h1 style="color:#fff;margin:0;font-size:20px">Instalment ${d.instalmentNumber} Paid</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Your payment for instalment ${d.instalmentNumber} of ${d.totalInstalments} has been received.</p>
        <div style="background:#EEF7F2;border-radius:8px;padding:16px;margin:16px 0">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="color:#9A9080">Amount paid</span>
            <strong>${d.amountPaid}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="color:#9A9080">Total paid to date</span>
            <strong>${d.totalPaid}</strong>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:#9A9080">Grand total</span>
            <strong>${d.grandTotal}</strong>
          </div>
        </div>
        <p style="color:#9A9080;font-size:13px">
          Next payment: <strong>${d.nextDueDate}</strong>
        </p>
        <p style="color:#9A9080;font-size:12px">Reference: ${d.reference}</p>
      </div>
    </div>`,

  'instalment-failed': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#E63946;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">⚠️</div>
        <h1 style="color:#fff;margin:0;font-size:20px">Payment Failed</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>We were unable to collect instalment ${d.instalmentNumber} of <strong>${d.amount}</strong>.</p>
        <p style="color:#3D3730">Please update your payment method or retry the payment to keep your plan active.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.retryUrl}" style="background:#E76F2A;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
            Retry Payment →
          </a>
        </div>
        <p style="color:#9A9080;font-size:12px">Reference: ${d.reference}</p>
      </div>
    </div>`,

  'instalment-reminder': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#D97706;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">⏰ Payment Due in 3 Days</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Your instalment ${d.instalmentNumber} of <strong>${d.amount}</strong> is due on <strong>${d.dueDate}</strong>.</p>
        <p style="color:#3D3730">Your saved card will be charged automatically. No action needed unless you need to update your card details.</p>
        <p style="color:#9A9080;font-size:12px">Reference: ${d.reference}</p>
      </div>
    </div>`,

  'contract-reminder': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#D97706;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">⏰ Reminder: Signature Required</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hi ${d.firstName},</p>
        <p style="color:#3D3730;line-height:1.6">This is a reminder that <strong>${d.contractTitle}</strong> is still awaiting your signature.</p>
        <div style="background:#FEF3C7;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:#92400E">
          ⚠️ This contract expires on <strong>${d.expiresAt}</strong>. Please sign before then to avoid it expiring.
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.signingUrl}" style="background:#E76F2A;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Sign Now →
          </a>
        </div>
        <p style="color:#9A9080;font-size:11px;text-align:center;font-family:monospace;word-break:break-all">${d.signingUrl}</p>
      </div>
    </div>`,
  // ─── GCO01 G-5: Guest booking claim-account magic link ───
  'guest-booking-claim-account': (d) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#2D6A4F;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">🎉 Your booking is confirmed — create your account</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hi ${d.firstName},</p>
        <p style="color:#3D3730;line-height:1.6">Your booking for <strong>${d.experienceName}</strong> on <strong>${d.slotDate}</strong> is confirmed. Create your Owambe account to manage this booking and future experiences.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${d.claimUrl}" style="background:#E76F2A;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Create My Account →
          </a>
        </div>
        <p style="color:#9CA3AF;font-size:13px">This link expires in ${d.expiryHours} hours. If you did not make this booking, you can safely ignore this email.</p>
        <p style="color:#9A9080;font-size:11px;text-align:center;font-family:monospace;word-break:break-all">${d.claimUrl}</p>
      </div>
    </div>`,
};

// ─── SEND EMAIL ──────────────────────────────────────
export async function sendEmail(options: EmailOptions) {
  const { to, subject, template, data } = options;
  const htmlTemplate = templates[template];

  if (!htmlTemplate) {
    logger.warn(`Unknown email template: ${template}`);
    return;
  }

  const html = htmlTemplate(data);

  try {
    await getPmClient().sendEmail({
      To: to,
      From: `${process.env.EMAIL_FROM_NAME || 'Owambe'} <${process.env.EMAIL_FROM || 'hello@owambe.com'}>`,
      Subject: subject,
      HtmlBody: html,
      MessageStream: 'outbound',
    });
    logger.info(`Email sent: ${template} → ${to}`);
  } catch (err: any) {
    logger.error(`Email failed: ${template} → ${to}`, err?.message || err);
    // Don't throw — email failures should not break the main flow
  }
}
