'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailsApi, eventsApi } from '@/lib/api';
import { formatTimeAgo } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Send, Copy, Sparkles, Loader2, Mail, ToggleLeft, ToggleRight } from 'lucide-react';

const TEMPLATES = [
  { name: 'Confirmation', subject: "You're registered! See you soon 🎉", body: 'Hi {first_name},\n\nThank you for registering for {event_name}. We\'re excited to have you!\n\nDate: {event_date}\nVenue: {venue}\n\nYour QR ticket is attached. See you there!\n\nWarm regards,\nThe Events Team' },
  { name: 'Reminder', subject: "{event_name} is tomorrow — here's what you need", body: 'Hi {first_name},\n\nJust a reminder that {event_name} is happening tomorrow!\n\nDate: {event_date}\nVenue: {venue}\n\nDon\'t forget to bring your QR ticket.\n\nSee you there!' },
  { name: 'Last Chance', subject: '⚡ Last few tickets left for {event_name}', body: 'Hi {first_name},\n\nTickets for {event_name} are almost sold out!\n\nSecure your spot now before it\'s too late.\n\nRegister at: {registration_link}' },
  { name: 'Post-Event', subject: 'Thank you for attending {event_name} 🙏', body: 'Hi {first_name},\n\nThank you so much for joining us at {event_name}. It was an incredible event!\n\nWe\'d love your feedback: {survey_link}\n\nHope to see you at our next event!' },
];

const AUTOMATIONS = [
  { key: 'confirmation', icon: '📧', name: 'Registration Confirmation', timing: 'Instantly on register' },
  { key: 'reminder24h', icon: '⏰', name: '24h Reminder', timing: '24 hours before event' },
  { key: 'dayof', icon: '📍', name: 'Day-of Directions', timing: 'Morning of event (8 AM)' },
  { key: 'postEvent', icon: '⭐', name: 'Post-event Survey', timing: '1 hour after event ends' },
];

export default function EmailsPage() {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(TEMPLATES[0]);
  const [automations, setAutomations] = useState({ confirmation: true, reminder24h: true, dayof: true, postEvent: false });
  const queryClient = useQueryClient();

  const { data: eventsData } = useQuery({
    queryKey: ['my-events'],
    queryFn: () => eventsApi.list().then(r => r.data),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', selectedEventId],
    queryFn: () => emailsApi.list(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
  });

  const sendMutation = useMutation({
    mutationFn: ({ eventId, campaignId }: any) => emailsApi.send(eventId, campaignId),
    onSuccess: () => {
      toast.success('Campaign sent!');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const events = eventsData?.events || [];
  const campaigns = campaignsData?.campaigns || [];

  return (
    <div className="p-6 animate-fade-up">
      <div className="flex items-center gap-3 mb-5">
        <select className="input w-64 text-sm" value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}>
          <option value="">Select an event</option>
          {events.map((ev: any) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        {selectedEventId && (
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={13} /> New Campaign
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left: Campaigns + Automations */}
        <div className="space-y-5">
          {/* Campaign history */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-bold">Campaign History</div>
            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--muted)]">
                <Mail size={24} className="mx-auto mb-2 text-[var(--border)]" />
                No campaigns yet{!selectedEventId ? ' — select an event' : ''}
              </div>
            ) : (
              campaigns.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {c.audience} · {c.sentAt ? formatTimeAgo(c.sentAt) : 'Not sent'}
                      {c.openCount > 0 && ` · ${c.openCount} opens`}
                    </div>
                  </div>
                  <span className={c.status === 'SENT' ? 'badge-live' : 'badge-upcoming'}>
                    {c.status}
                  </span>
                  {c.status !== 'SENT' && selectedEventId && (
                    <button
                      onClick={() => sendMutation.mutate({ eventId: selectedEventId, campaignId: c.id })}
                      disabled={sendMutation.isPending}
                      className="btn-primary text-xs px-2.5 flex items-center gap-1">
                      {sendMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                      Send
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Automations */}
          <div className="card p-4">
            <div className="text-sm font-bold mb-3">Automated Sequences</div>
            <div className="space-y-2">
              {AUTOMATIONS.map(a => (
                <div key={a.key} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                  <span className="text-base">{a.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="text-xs text-[var(--muted)]">{a.timing}</div>
                  </div>
                  <button
                    onClick={() => setAutomations(prev => ({ ...prev, [a.key]: !prev[a.key as keyof typeof prev] }))}
                    className="transition-colors">
                    {automations[a.key as keyof typeof automations]
                      ? <ToggleRight size={24} className="text-[var(--accent)]" />
                      : <ToggleLeft size={24} className="text-[var(--border)]" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Email preview */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="text-sm font-bold">Email Preview</div>
            <select className="input w-auto text-xs py-1"
              onChange={e => setPreviewTemplate(TEMPLATES[Number(e.target.value)])}>
              {TEMPLATES.map((t, i) => (
                <option key={t.name} value={i}>{t.name}</option>
              ))}
            </select>
          </div>
          {/* Email client chrome */}
          <div className="bg-[var(--dark)] px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 text-center text-[10px] text-white/30">
              Preview · {previewTemplate.name}
            </div>
          </div>
          <div className="p-5 bg-white">
            <div style={{ background: 'linear-gradient(135deg, #6C2BD9, #4a1d96)', padding: '20px', textAlign: 'center', margin: '-20px -20px 16px', color: '#fff', borderRadius: '0 0 8px 8px' }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>owambe.com</div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>{previewTemplate.subject}</div>
            </div>
            <div className="text-sm leading-relaxed text-[var(--mid)] whitespace-pre-line">
              {previewTemplate.body}
            </div>
            <div className="text-center mt-5">
              <div style={{ display: 'inline-block', background: '#C9A227', color: '#fff', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                View My Ticket →
              </div>
            </div>
            <div className="border-t border-[var(--border)] mt-5 pt-3 text-center text-[11px] text-[var(--muted)]">
              owambe.com · Unsubscribe · View in browser
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <CampaignModal
          eventId={selectedEventId}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            toast.success('Campaign created!');
          }}
        />
      )}
    </div>
  );
}

function CampaignModal({ eventId, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: '', subject: '', body: '', audience: 'ALL', scheduledAt: '' });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function generateAI() {
    if (!form.name) { toast.error('Enter campaign name first'); return; }
    setIsAiLoading(true);
    try {
      const res = await emailsApi.generateCopy({ eventName: 'Your Event', purpose: form.name });
      setForm(p => ({ ...p, subject: res.data.subject || '', body: res.data.body || '' }));
      toast.success('✨ AI wrote your email!');
    } finally { setIsAiLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await emailsApi.create(eventId, form);
      onSave();
    } finally { setIsSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-lg animate-fade-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] sticky top-0 bg-white">
          <h2 className="font-bold text-base">New Email Campaign</h2>
          <button onClick={onClose} className="text-[var(--muted)] text-lg px-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Campaign Name</label>
            <input className="input text-sm" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Early Bird Reminder" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Audience</label>
              <select className="input text-sm" value={form.audience}
                onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                <option value="ALL">All Registrants</option>
                <option value="VIP">VIP Only</option>
                <option value="NOT_REGISTERED">Not Yet Registered</option>
                <option value="WAITLIST">Waitlist</option>
              </select>
            </div>
            <div>
              <label className="label">Schedule (optional)</label>
              <input type="datetime-local" className="input text-sm" value={form.scheduledAt}
                onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Subject Line</label>
            <input className="input text-sm" value={form.subject}
              onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
              placeholder="Catchy subject line..." />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="label" style={{ marginBottom: 0 }}>Email Body</label>
              <button type="button" onClick={generateAI} disabled={isAiLoading}
                className="flex items-center gap-1 text-xs text-[var(--accent)] font-semibold hover:underline">
                {isAiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Write with AI
              </button>
            </div>
            <textarea className="input text-sm min-h-[120px] resize-none" value={form.body}
              onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              placeholder="Your email content..." />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              Create Campaign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
