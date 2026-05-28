'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sponsorsApi, eventsApi } from '@/lib/api';
import { formatNGN } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Trash2, Send, Loader2, Trophy } from 'lucide-react';

const TIERS = ['Gold', 'Silver', 'Bronze'] as const;
type Tier = typeof TIERS[number];

const TIER_CONFIG: Record<Tier, { color: string; border: string; textColor: string; emoji: string }> = {
  Gold: { color: '#FEF3C7', border: '#F59E0B', textColor: '#B45309', emoji: '🏆' },
  Silver: { color: '#F1F5F9', border: '#94A3B8', textColor: '#475569', emoji: '🥈' },
  Bronze: { color: '#FEF0E6', border: '#CD7F32', textColor: '#92400E', emoji: '🥉' },
};

export default function SponsorsPage() {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: eventsData } = useQuery({
    queryKey: ['my-events'],
    queryFn: () => eventsApi.list().then(r => r.data),
  });

  const { data: sponsorsData } = useQuery({
    queryKey: ['sponsors', selectedEventId],
    queryFn: () => sponsorsApi.list(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
  });

  const deleteMutation = useMutation({
    mutationFn: sponsorsApi.delete,
    onSuccess: () => {
      toast.success('Sponsor removed');
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
    },
  });

  const events = eventsData?.events || [];
  const sponsors = sponsorsData?.sponsors || [];
  const totalRaised = sponsors.reduce((s: number, sp: any) => s + Number(sp.amount), 0);
  const [goal, setGoal] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const byTier = (tier: Tier) => sponsors.filter((s: any) => s.tier === tier.toUpperCase());

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
            <Plus size={13} /> Add Sponsor
          </button>
        )}
      </div>

      {!selectedEventId ? (
        <div className="card text-center py-12 text-[var(--muted)]">
          <Trophy size={36} className="mx-auto mb-3 text-[var(--border)]" />
          <div className="font-semibold text-[var(--dark)] mb-1">Select an event</div>
          <div className="text-sm">Choose an event to manage its sponsors</div>
        </div>
      ) : (
        <>
          {/* Goal tracker */}
          <div className="card p-5 mb-5">
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="font-bold text-sm">Sponsorship Goal</div>
                <div className="text-xs text-[var(--muted)]">{sponsors.length} sponsors confirmed</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-xl text-[var(--accent)]">{formatNGN(totalRaised, true)}</div>
                {editingGoal ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      placeholder="Enter goal amount"
                      className="input text-xs w-36 h-7 px-2"
                    />
                    <button
                      onClick={() => { setGoal(Number(goalInput) || 0); setEditingGoal(false); }}
                      className="btn-primary text-xs h-7 px-2">Save</button>
                    <button onClick={() => setEditingGoal(false)} className="btn-secondary text-xs h-7 px-2">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setGoalInput(String(goal || '')); setEditingGoal(true); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--dark)] transition-colors mt-0.5">
                    {goal > 0 ? `of ${formatNGN(goal, true)} goal ✏️` : '+ Set sponsorship goal'}
                  </button>
                )}
              </div>
            </div>
            {goal > 0 && (
              <>
                <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] rounded-full transition-all"
                    style={{ width: `${Math.min(100, (totalRaised / goal) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
                  <span>{Math.round((totalRaised / goal) * 100)}% achieved</span>
                  <span>{formatNGN(Math.max(0, goal - totalRaised), true)} remaining</span>
                </div>
              </>
            )}
          </div>

          {/* Sponsor tiers */}
          <div className="grid grid-cols-3 gap-4">
            {TIERS.map(tier => {
              const cfg = TIER_CONFIG[tier];
              const tierSponsors = byTier(tier);
              return (
                <div key={tier}>
                  <div className="flex items-center gap-2 mb-3">
                    <span>{cfg.emoji}</span>
                    <span className="font-bold text-sm" style={{ color: cfg.textColor }}>{tier} Sponsors</span>
                    <span className="text-xs text-[var(--muted)]">({tierSponsors.length})</span>
                  </div>
                  <div className="space-y-3">
                    {tierSponsors.map((sp: any) => (
                      <div key={sp.id} className="card p-4 hover:shadow-card transition-all"
                        style={{ borderColor: cfg.border, background: cfg.color }}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-sm">{sp.name}</div>
                          <button onClick={() => deleteMutation.mutate(sp.id)}
                            className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="font-bold text-lg text-[var(--accent)] mb-1">{formatNGN(sp.amount)}</div>
                        {sp.perks && <div className="text-xs text-[var(--muted)] leading-relaxed mb-3">{sp.perks}</div>}
                        <button
                          onClick={() => toast(`📧 Invoice sent to ${sp.name}!`)}
                          className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
                          <Send size={11} /> Send Invoice
                        </button>
                      </div>
                    ))}
                    {tierSponsors.length === 0 && (
                      <div className="card p-4 text-center text-xs text-[var(--muted)] border-dashed"
                        style={{ borderColor: cfg.border }}>
                        No {tier.toLowerCase()} sponsors yet
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showModal && (
        <SponsorModal
          eventId={selectedEventId}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['sponsors'] });
          }}
        />
      )}
    </div>
  );
}

function SponsorModal({ eventId, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: '', tier: 'GOLD', amount: '', contactEmail: '', perks: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    setIsSubmitting(true);
    try {
      await sponsorsApi.create(eventId, { ...form, amount: Number(form.amount) });
      toast.success('Sponsor added!');
      onSave();
    } finally { setIsSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg animate-fade-up">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-bold text-base">Add Sponsor</h2>
          <button onClick={onClose} className="text-[var(--muted)] text-lg px-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Company Name *</label>
            <input className="input text-sm" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. TechCorp Nigeria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tier</label>
              <select className="input text-sm" value={form.tier}
                onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="BRONZE">Bronze</option>
              </select>
            </div>
            <div>
              <label className="label">Amount (₦)</label>
              <input type="number" className="input text-sm" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="10000000" />
            </div>
          </div>
          <div>
            <label className="label">Contact Email</label>
            <input type="email" className="input text-sm" value={form.contactEmail}
              onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))}
              placeholder="contact@company.com" />
          </div>
          <div>
            <label className="label">Perks / Benefits</label>
            <textarea className="input text-sm min-h-[70px] resize-none" value={form.perks}
              onChange={e => setForm(p => ({ ...p, perks: e.target.value }))}
              placeholder="Logo on banner, 5 passes, speaking slot..." />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              Add Sponsor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
