'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { speakersApi, eventsApi, aiApi } from '@/lib/api';
import { speakerProgress } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Loader2, Sparkles, Mail, Edit2, Trash2, CheckCircle } from 'lucide-react';

const CHECKLIST_KEYS = ['invited', 'confirmed', 'bio', 'photo', 'session', 'slides'] as const;
const CHECKLIST_LABELS: Record<string, string> = {
  invited: 'Invitation sent', confirmed: 'Confirmed', bio: 'Bio submitted',
  photo: 'Headshot received', session: 'Session details set', slides: 'Slides submitted',
};

const TABS = ['Speakers', 'Schedule', 'Onboarding', 'Comms'];
const TRACKS = ['Keynote', 'Track A — Growth', 'Track B — AI', 'Track C — Operations'];
const TIMES = ['9:00 AM', '10:30 AM', '11:30 AM', '2:00 PM', '3:30 PM', '4:30 PM'];

export default function SpeakersPage() {
  const [activeTab, setActiveTab] = useState('Speakers');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSpeaker, setEditSpeaker] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const queryClient = useQueryClient();

  const { data: eventsData } = useQuery({
    queryKey: ['my-events'],
    queryFn: () => eventsApi.list().then(r => r.data),
  });

  const { data: speakersData, isLoading } = useQuery({
    queryKey: ['speakers', selectedEventId],
    queryFn: () => speakersApi.list(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
  });

  const deleteMutation = useMutation({
    mutationFn: speakersApi.delete,
    onSuccess: () => {
      toast.success('Speaker removed');
      queryClient.invalidateQueries({ queryKey: ['speakers'] });
    },
  });

  const checklistMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      speakersApi.updateChecklist(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['speakers'] }),
  });

  const events = eventsData?.events || [];
  const speakers = (speakersData?.speakers || []).filter((s: any) =>
    !filterStatus || s.status === filterStatus
  );

  function openAdd() { setEditSpeaker(null); setShowModal(true); }
  function openEdit(s: any) { setEditSpeaker(s); setShowModal(true); }

  return (
    <div className="p-6 animate-fade-up">
      {/* Event selector */}
      <div className="flex items-center gap-3 mb-5">
        <select className="input w-64 text-sm" value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}>
          <option value="">Select an event</option>
          {events.map((ev: any) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        {selectedEventId && (
          <button onClick={openAdd} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={13} /> Add Speaker
          </button>
        )}
      </div>

      {/* Stats */}
      {selectedEventId && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total', value: speakers.length, color: '#2D6A4F' },
            { label: 'Confirmed', value: speakers.filter((s: any) => s.status === 'CONFIRMED').length, color: '#059669' },
            { label: 'Invited', value: speakers.filter((s: any) => s.status === 'INVITED').length, color: '#D97706' },
            { label: 'Pending', value: speakers.filter((s: any) => s.status === 'PENDING').length, color: '#E63946' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.color }} />
              <div className="stat-label">{s.label}</div>
              <div className="stat-number">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      {selectedEventId && (
        <div className="flex gap-1 mb-5 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab ? 'bg-[var(--dark)] text-white' : 'text-[var(--muted)] hover:text-[var(--dark)]'
              }`}>{tab}</button>
          ))}
        </div>
      )}

      {!selectedEventId ? (
        <div className="card text-center py-12 text-[var(--muted)]">
          <div className="text-3xl mb-3">🎤</div>
          <div className="font-semibold text-[var(--dark)] mb-1">Select an event</div>
          <div className="text-sm">Choose an event above to manage its speakers</div>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : (
        <>
          {activeTab === 'Speakers' && (
            <div>
              <div className="flex gap-2 mb-4">
                {['', 'CONFIRMED', 'INVITED', 'PENDING', 'DECLINED'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                      filterStatus === s ? 'bg-[var(--dark)] text-white border-[var(--dark)]' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'
                    }`}>{s || 'All'}</button>
                ))}
                <div className="flex-1" />
                <button onClick={() => toast('📧 Bulk email sent!')} className="btn-secondary text-xs">
                  <Mail size={12} className="mr-1" /> Email All
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {speakers.length === 0 ? (
                  <div className="col-span-3 card text-center py-10 text-[var(--muted)]">
                    No speakers yet. Add your first speaker above.
                  </div>
                ) : speakers.map((s: any) => (
                  <SpeakerCard key={s.id} speaker={s}
                    onEdit={() => openEdit(s)}
                    onDelete={() => deleteMutation.mutate(s.id)}
                    onChecklist={(key: string, val: boolean) => checklistMutation.mutate({
                      id: s.id,
                      data: { [`checklist${key.charAt(0).toUpperCase() + key.slice(1)}`]: val }
                    })}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Schedule' && <ScheduleTab speakers={speakers} />}
          {activeTab === 'Onboarding' && <OnboardingTab speakers={speakers}
            onToggle={(id: string, key: string, val: boolean) => checklistMutation.mutate({
              id, data: { [`checklist${key.charAt(0).toUpperCase() + key.slice(1)}`]: val }
            })} />}
          {activeTab === 'Comms' && <CommsTab eventId={selectedEventId} />}
        </>
      )}

      {showModal && (
        <SpeakerModal
          eventId={selectedEventId}
          speaker={editSpeaker}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['speakers'] });
          }}
        />
      )}
    </div>
  );
}

function SpeakerCard({ speaker: s, onEdit, onDelete, onChecklist }: any) {
  const pct = speakerProgress({
    invited: s.checklistInvited, confirmed: s.checklistConfirmed,
    bio: s.checklistBio, photo: s.checklistPhoto,
    session: s.checklistSession, slides: s.checklistSlides,
  });
  const initials = `${s.name?.split(' ')[0]?.[0] || ''}${s.name?.split(' ')[1]?.[0] || ''}`.toUpperCase();
  const COLORS = ['#2D6A4F','#E76F2A','#7B61FF','#0EA5E9','#D97706','#059669','#E63946'];
  const color = COLORS[s.name?.charCodeAt(0) % COLORS.length];

  const statusColor: Record<string, string> = {
    CONFIRMED: 'badge-confirmed', INVITED: 'badge-upcoming',
    PENDING: 'badge-draft', DECLINED: 'badge-ended',
  };

  return (
    <div className="card overflow-hidden hover:shadow-card transition-all">
      <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}>
        <div className="absolute bottom-[-20px] left-4 w-12 h-12 rounded-full border-3 border-white flex items-center justify-center font-bold text-white text-base"
          style={{ background: color, borderWidth: 3 }}>
          {initials}
        </div>
        <div className="absolute top-2 right-2">
          <span className={statusColor[s.status] || 'badge-draft'}>{s.status}</span>
        </div>
      </div>
      <div className="pt-8 px-4 pb-4">
        <div className="font-bold text-sm mb-0.5">{s.name}</div>
        <div className="text-xs text-[var(--muted)] mb-2">{s.title}{s.company ? ` · ${s.company}` : ''}</div>
        {s.topic && <div className="text-[10px] bg-[var(--pill)] text-[var(--pill-t)] px-2 py-0.5 rounded-full inline-block mb-3">{s.topic}</div>}
        {(s.sessionTime || s.room) && (
          <div className="text-[11px] text-[var(--muted)] mb-3">
            {s.track && <span className="mr-2">{s.track}</span>}
            {s.room && <span>📍 {s.room}</span>}
          </div>
        )}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[var(--muted)]">Onboarding</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct === 100 ? 'var(--accent)' : pct > 50 ? 'var(--accent2)' : 'var(--danger)' }} />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => toast(`✉️ Emailing ${s.name}`)} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1">
            <Mail size={11} /> Email
          </button>
          <button onClick={onEdit} className="btn-secondary text-xs px-2.5">
            <Edit2 size={11} />
          </button>
          <button onClick={onDelete} className="btn-secondary text-xs px-2.5 hover:border-[var(--danger)] hover:text-[var(--danger)]">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleTab({ speakers }: { speakers: any[] }) {
  const sorted = [...speakers].sort((a, b) => {
    if (!a.sessionTime) return 1;
    if (!b.sessionTime) return -1;
    return a.sessionTime.localeCompare(b.sessionTime);
  });
  const trackColors: Record<string, string> = {
    'Keynote': '#1A1612', 'Track A — Growth': '#2D6A4F',
    'Track B — AI': '#7B61FF', 'Track C — Operations': '#D97706',
  };
  return (
    <div className="space-y-3">
      {sorted.map(s => {
        const color = trackColors[s.track] || '#9A9080';
        return (
          <div key={s.id} className="card px-5 py-4 relative overflow-hidden hover:shadow-card transition-all">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">
                  {s.sessionTime || '—'} {s.room && `· ${s.room}`}
                </div>
                <div className="font-bold text-sm mb-1">{s.topic || 'Session TBD'}</div>
                <div className="text-xs text-[var(--muted)] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: '#2D6A4F' }}>
                    {s.name?.split(' ').map((n: string) => n[0]).join('')}
                  </span>
                  {s.name}
                </div>
              </div>
              {s.track && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: color }}>
                  {s.track}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {sorted.length === 0 && (
        <div className="card text-center py-10 text-[var(--muted)] text-sm">No sessions scheduled yet</div>
      )}
    </div>
  );
}

function OnboardingTab({ speakers, onToggle }: any) {
  return (
    <div className="grid gap-3">
      {speakers.map((s: any) => {
        const checklist: Record<string, boolean> = {
          invited: s.checklistInvited, confirmed: s.checklistConfirmed,
          bio: s.checklistBio, photo: s.checklistPhoto,
          session: s.checklistSession, slides: s.checklistSlides,
        };
        const pct = speakerProgress(checklist);
        return (
          <div key={s.id} className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                style={{ background: '#2D6A4F' }}>
                {s.name?.split(' ').map((n: string) => n[0]).join('')}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">{s.title}</div>
              </div>
              <div className="font-bold text-lg" style={{ color: pct === 100 ? 'var(--accent)' : pct > 50 ? 'var(--accent2)' : 'var(--danger)' }}>
                {pct}%
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {CHECKLIST_KEYS.map(key => {
                const done = checklist[key];
                return (
                  <button key={key}
                    onClick={() => onToggle(s.id, key, !done)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                      done ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--muted)]'
                    }`}>
                    {done ? '✓ ' : ''}{CHECKLIST_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommsTab({ eventId }: { eventId: string }) {
  const TEMPLATES = [
    { icon: '📩', name: 'Speaker Invitation', desc: 'Initial outreach with event details', body: 'Hi [Name],\n\nWe\'d love to invite you to speak at our upcoming event. It\'s a great opportunity to share your expertise with our audience.\n\nPlease let us know if you\'re available.\n\nBest regards' },
    { icon: '✅', name: 'Confirmation + Details', desc: 'Logistics, schedule, AV requirements', body: 'Hi [Name],\n\nThank you for confirming your session! Here are your details:\n\nPlease submit your bio, headshot, and slides by the deadline.\n\nLooking forward to having you!' },
    { icon: '📊', name: 'Slides Reminder', desc: '2 weeks before — deadline + format', body: 'Hi [Name],\n\nFriendly reminder that speaker slides are due soon.\n\nFormat: 16:9 PDF or PPTX, max 50MB.\n\nThank you!' },
    { icon: '🗺', name: 'Day-of Logistics', desc: 'Venue, parking, green room', body: 'Hi [Name],\n\nHere are your event day details:\n\n📍 Venue address\n🎙 Speaker check-in: 8:00 AM\n🟢 Green room opens 7:30 AM\n\nSee you soon!' },
  ];

  const [selected, setSelected] = useState(TEMPLATES[0]);
  const [body, setBody] = useState(TEMPLATES[0].body);

  return (
    <div className="grid grid-cols-2 gap-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-3">Message Templates</div>
        <div className="space-y-2">
          {TEMPLATES.map(t => (
            <div key={t.name}
              onClick={() => { setSelected(t); setBody(t.body); }}
              className={`card p-4 flex items-center gap-3 cursor-pointer hover:shadow-card transition-all ${selected.name === t.name ? 'border-[var(--accent)]' : ''}`}>
              <span className="text-xl">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-xs text-[var(--muted)]">{t.desc}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); setSelected(t); setBody(t.body); }}
                className="btn-primary text-xs px-2.5 shrink-0">Use →</button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-3">Compose Message</div>
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">To</label>
            <select className="input text-sm">
              <option>All Confirmed Speakers</option>
              <option>All Speakers</option>
              <option>Missing Bio</option>
              <option>Missing Slides</option>
            </select>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input text-sm" defaultValue={selected.name} />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input text-sm min-h-[140px] resize-none"
              value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <button onClick={() => toast('📧 Message sent to speakers!')} className="btn-primary w-full text-sm">
            Send Message
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeakerModal({ eventId, speaker, onClose, onSave }: any) {
  const [isAiLoading, setIsAiLoading] = useState(false);
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: speaker ? {
      name: speaker.name, title: speaker.title, company: speaker.company,
      email: speaker.email, topic: speaker.topic, track: speaker.track,
      room: speaker.room, status: speaker.status, bio: speaker.bio,
      sessionTime: speaker.sessionTime,
    } : { status: 'INVITED', sessionTime: '' }
  });

  async function onSubmit(data: any) {
    try {
      if (speaker) {
        await speakersApi.update(speaker.id, data);
        toast.success('Speaker updated!');
      } else {
        await speakersApi.create(eventId, data);
        toast.success('Speaker added!');
      }
      onSave();
    } catch { /* handled */ }
  }

  async function generateBio() {
    const name = (document.getElementById('s-name') as HTMLInputElement)?.value;
    const company = (document.getElementById('s-company') as HTMLInputElement)?.value;
    if (!name) { toast.error('Enter name first'); return; }
    setIsAiLoading(true);
    try {
      const res = await aiApi.generateEventCopy(`Speaker bio for ${name}${company ? ` from ${company}` : ''}`);
      setValue('bio', res.data.description || '');
      toast.success('✨ AI bio generated!');
    } finally { setIsAiLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg animate-fade-up">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] sticky top-0 bg-white z-10">
          <h2 className="font-bold text-base">{speaker ? 'Edit Speaker' : 'Add Speaker'}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--dark)] text-lg px-2">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input id="s-name" className="input text-sm" {...register('name', { required: true })} placeholder="e.g. Amaka Osei" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input text-sm" {...register('status')}>
                <option value="INVITED">Invited</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending</option>
                <option value="DECLINED">Declined</option>
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input text-sm" {...register('title')} placeholder="CEO / Head of AI" />
            </div>
            <div>
              <label className="label">Company</label>
              <input id="s-company" className="input text-sm" {...register('company')} placeholder="Company name" />
            </div>
            <div className="col-span-2">
              <label className="label">Email</label>
              <input type="email" className="input text-sm" {...register('email')} placeholder="speaker@company.com" />
            </div>
            <div className="col-span-2">
              <label className="label">Session Topic</label>
              <input className="input text-sm" {...register('topic')} placeholder="e.g. AI in Nigerian Business" />
            </div>
            <div>
              <label className="label">Track</label>
              <select className="input text-sm" {...register('track')}>
                <option value="">Select track</option>
                {TRACKS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Time Slot</label>
              <select className="input text-sm" {...register('sessionTime')}>
                <option value="">Select time</option>
                {TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Room</label>
              <input className="input text-sm" {...register('room')} placeholder="Main Stage / Room A" />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="label" style={{ marginBottom: 0 }}>Bio</label>
              <button type="button" onClick={generateBio} disabled={isAiLoading}
                className="flex items-center gap-1 text-xs text-[var(--accent)] font-semibold hover:underline">
                {isAiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                AI Generate
              </button>
            </div>
            <textarea className="input text-sm min-h-[80px] resize-none" {...register('bio')} placeholder="Speaker bio..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              {speaker ? 'Save Changes' : 'Add Speaker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
