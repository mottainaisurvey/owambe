'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { formatNGN, VENDOR_CATEGORY_EMOJIS, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Send, Sparkles, Loader2, ArrowRight, CheckCircle, RefreshCw } from 'lucide-react';
import { v4 as uuid } from 'uuid';

interface Message { role: 'user' | 'assistant'; content: string; }
interface ExtractedData {
  eventType?: string; location?: string; date?: string;
  guestCount?: number; totalBudget?: number; preferences?: any;
}

type PlanTier = 'budget' | 'standard' | 'premium';

export default function PlanPage() {
  const [sessionId] = useState(() => uuid());
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! 👋 I'm your Owambe AI event planner. Tell me about your event — what are you celebrating, where, and when? I'll find you the perfect vendors within your budget."
    }
  ]);
  const [input, setInput] = useState('');
  const [extracted, setExtracted] = useState<ExtractedData>({});
  const [isIntakeComplete, setIsIntakeComplete] = useState(false);
  const [plans, setPlans] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('standard');
  const [step, setStep] = useState<'chat' | 'plans' | 'confirm'>('chat');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const intakeMutation = useMutation({
    mutationFn: ({ message, history }: { message: string; history: Message[] }) =>
      aiApi.planIntake(message, history).then(r => r.data),
    onSuccess: (data) => {
      // Merge extracted data
      setExtracted(prev => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(data.extracted || {}).filter(([, v]) => v !== null)
        )
      }));

      const reply = data.isComplete
        ? "Perfect, I have everything I need! 🎉 Let me find you the best vendors in Lagos and build your event plan..."
        : data.followUpQuestion || "Could you tell me a bit more?";

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      if (data.isComplete) {
        setIsIntakeComplete(true);
        setTimeout(() => generatePlan(data.extracted), 800);
      }
    },
  });

  const planMutation = useMutation({
    mutationFn: (data: any) => aiApi.generatePlan({ ...data, sessionId }).then(r => r.data),
    onSuccess: (data) => {
      setPlans(data);
      setStep('plans');
    },
  });

  function generatePlan(data?: ExtractedData) {
    const d = data || extracted;
    if (!d.eventType || !d.location || !d.totalBudget) return;
    planMutation.mutate({
      eventType: d.eventType,
      location: d.location,
      date: d.date || new Date().toISOString(),
      guestCount: d.guestCount || 100,
      totalBudget: d.totalBudget,
      preferences: d.preferences,
    });
  }

  function sendMessage() {
    if (!input.trim() || intakeMutation.isPending) return;
    const userMsg: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    intakeMutation.mutate({ message: input, history: newMessages });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const QUICK_PROMPTS = [
    "Wedding for 200 guests in Lagos, budget ₦5M",
    "Corporate conference, 100 people, Abuja, ₦2M",
    "Birthday party this December, 50 guests, ₦800K",
    "Product launch event, Victoria Island, ₦3M",
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      {step === 'chat' && (
        <div className="grid grid-cols-[1fr_320px] gap-6">
          {/* Chat */}
          <div>
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
                <Sparkles size={12} /> AI Event Planner
              </div>
              <h1 className="text-2xl font-bold text-[var(--dark)] mb-2">Plan your perfect event</h1>
              <p className="text-sm text-[var(--muted)]">Tell me about your event and I'll find verified vendors within your budget</p>
            </div>

            {/* Messages */}
            <div className="card p-5 mb-4 min-h-[300px] max-h-[400px] overflow-y-auto no-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 mb-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[#4a1d96] flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                      : 'bg-[var(--bg)] text-[var(--dark)] rounded-tl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {(intakeMutation.isPending || planMutation.isPending) && (
                <div className="flex gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[#4a1d96] flex items-center justify-center flex-shrink-0">
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <div className="bg-[var(--bg)] px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {QUICK_PROMPTS.map(p => (
                  <button key={p} onClick={() => { setInput(p); }}
                    className="text-xs bg-white border border-[var(--border)] px-3 py-1.5 rounded-full hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Tell me about your event..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={intakeMutation.isPending || isIntakeComplete}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || intakeMutation.isPending || isIntakeComplete}
                className="btn-primary px-4 flex items-center gap-2">
                {intakeMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Send size={16} />}
              </button>
            </div>
          </div>

          {/* Extracted data panel */}
          <div>
            <div className="card p-5 sticky top-20">
              <div className="text-sm font-bold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Event Brief
              </div>
              <div className="space-y-3">
                {[
                  { key: 'eventType', label: 'Event Type', icon: '🎉' },
                  { key: 'location', label: 'Location', icon: '📍' },
                  { key: 'date', label: 'Date', icon: '📅' },
                  { key: 'guestCount', label: 'Guests', icon: '👥' },
                  { key: 'totalBudget', label: 'Budget', icon: '💰' },
                ].map(field => {
                  const val = extracted[field.key as keyof ExtractedData];
                  return (
                    <div key={field.key} className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all ${val ? 'bg-[var(--pill)]' : 'bg-[var(--bg)]'}`}>
                      <span>{field.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{field.label}</div>
                        <div className={`text-sm font-semibold truncate ${val ? 'text-[var(--dark)]' : 'text-[var(--border)]'}`}>
                          {val
                            ? (field.key === 'totalBudget' ? formatNGN(Number(val)) : String(val))
                            : '—'}
                        </div>
                      </div>
                      {val && <CheckCircle size={14} className="text-[var(--accent)] shrink-0" />}
                    </div>
                  );
                })}
              </div>
              {isIntakeComplete && (
                <div className="mt-4 p-3 bg-[var(--pill)] rounded-lg text-xs text-[var(--accent)] font-semibold flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Finding vendors & building your plan...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'plans' && plans && (
        <PlansView
          plans={plans}
          extracted={extracted}
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          onBook={() => setStep('confirm')}
          onBack={() => { setStep('chat'); setIsIntakeComplete(false); }}
          onRegenerate={() => generatePlan()}
          isRegenerating={planMutation.isPending}
        />
      )}

      {step === 'confirm' && plans && (
        <ConfirmView
          plan={plans.plans[selectedPlan]}
          extracted={extracted}
          onBack={() => setStep('plans')}
        />
      )}
    </div>
  );
}

function PlansView({ plans, extracted, selectedPlan, onSelectPlan, onBook, onBack, onRegenerate, isRegenerating }: any) {
  const TIERS: { key: PlanTier; label: string; color: string }[] = [
    { key: 'budget', label: 'Budget-Smart', color: '#059669' },
    { key: 'standard', label: 'Best Value', color: '#6C2BD9' },
    { key: 'premium', label: 'Premium', color: '#C9A227' },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <Sparkles size={12} /> AI-Generated Plans
        </div>
        <h2 className="text-2xl font-bold text-[var(--dark)] mb-2">
          3 plans for your {extracted.eventType}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          📍 {extracted.location} · 👥 {extracted.guestCount} guests · 💰 Budget: {formatNGN(extracted.totalBudget)}
        </p>
      </div>

      {/* Plan selector */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {TIERS.map(tier => {
          const plan = plans.plans[tier.key];
          if (!plan) return null;
          const isSelected = selectedPlan === tier.key;
          const overBudget = plan.budgetVariance > 0;
          return (
            <button key={tier.key} onClick={() => onSelectPlan(tier.key)}
              className={`card p-5 text-left transition-all hover:shadow-lg ${
                isSelected ? 'border-2 border-[var(--accent)] shadow-card' : ''
              }`}>
              {tier.key === 'standard' && (
                <div className="text-[10px] font-bold uppercase tracking-wide bg-[var(--accent)] text-white px-2 py-0.5 rounded-full w-fit mb-2">
                  Recommended
                </div>
              )}
              <div className="font-bold text-sm mb-1" style={{ color: tier.color }}>{tier.label}</div>
              <div className="font-bold text-2xl text-[var(--dark)] mb-1">{formatNGN(plan.totalCost, true)}</div>
              <div className={`text-xs font-medium mb-3 ${overBudget ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                {overBudget
                  ? `₦${Math.abs(plan.budgetVariance).toLocaleString()} over budget`
                  : `₦${Math.abs(plan.budgetVariance).toLocaleString()} under budget`}
              </div>
              {plans.explanation?.[tier.key] && (
                <p className="text-xs text-[var(--muted)] leading-relaxed">{plans.explanation[tier.key]}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Vendor breakdown */}
      {plans.plans[selectedPlan] && (
        <div className="card p-5 mb-6">
          <div className="text-sm font-bold mb-4">Vendor Breakdown — {TIERS.find(t => t.key === selectedPlan)?.label}</div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(plans.plans[selectedPlan].selections).map(([category, vendor]: any) => (
              <div key={category}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:border-[var(--accent)] cursor-pointer ${
                  vendor.withinBudget ? 'border-[var(--border)] bg-white' : 'border-yellow-200 bg-yellow-50'
                }`}>
                <span className="text-xl shrink-0">{VENDOR_CATEGORY_EMOJIS[category.toUpperCase()] || '🏢'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-0.5">
                    {VENDOR_CATEGORY_LABELS[category.toUpperCase()] || category}
                  </div>
                  <div className="font-semibold text-sm truncate">{vendor.businessName}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--accent)] font-semibold">{formatNGN(vendor.price)}</span>
                    {vendor.rating > 0 && (
                      <span className="text-[10px] text-[var(--muted)]">⭐ {Number(vendor.rating).toFixed(1)}</span>
                    )}
                    {vendor.isInstantBook && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Instant</span>
                    )}
                  </div>
                </div>
                <button className="text-xs text-[var(--muted)] hover:text-[var(--danger)] shrink-0">↺</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">← Edit Brief</button>
          <button onClick={onRegenerate} disabled={isRegenerating}
            className="btn-secondary flex items-center gap-2 text-sm">
            {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Regenerate
          </button>
        </div>
        <button onClick={onBook} className="btn-accent flex items-center gap-2 text-sm px-6 py-2.5">
          Book This Plan <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ConfirmView({ plan, extracted, onBack }: any) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-[var(--pill)] flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-[var(--accent)]" />
        </div>
        <h2 className="text-xl font-bold mb-1">Confirm Your Event Plan</h2>
        <p className="text-sm text-[var(--muted)]">Review and book all vendors in one go</p>
      </div>

      <div className="card p-5 mb-4">
        <div className="text-sm font-bold mb-3">Booking Summary</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--muted)]">Event Type</span><span>{extracted.eventType}</span></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">Location</span><span>{extracted.location}</span></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">Date</span><span>{extracted.date || 'TBD'}</span></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">Guests</span><span>{extracted.guestCount}</span></div>
          <div className="flex justify-between font-bold border-t border-[var(--border)] pt-2 mt-2">
            <span>Total</span>
            <span className="text-[var(--accent)]">{formatNGN(plan?.totalCost || 0)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>Deposit (30% now)</span>
            <span>{formatNGN((plan?.totalCost || 0) * 0.3)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div>
          <label className="label">Your Name</label>
          <input className="input" placeholder="Full name" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" placeholder="your@email.com" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input type="tel" className="input" placeholder="+234..." />
        </div>
      </div>

      <button
        onClick={() => toast.success('🎉 Booking initiated! Redirecting to payment...')}
        className="btn-accent w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold">
        Pay Deposit {formatNGN((plan?.totalCost || 0) * 0.3)} via Paystack →
      </button>
      <button onClick={onBack} className="w-full text-center text-sm text-[var(--muted)] hover:underline mt-3 py-1">
        ← Back to plans
      </button>

      <p className="text-center text-xs text-[var(--muted)] mt-4">
        🔒 Secure payment via Paystack · Balance released after your event
      </p>
    </div>
  );
}
