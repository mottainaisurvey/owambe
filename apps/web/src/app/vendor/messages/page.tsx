'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bookingsApi, api } from '@/lib/api';
import { formatTimeAgo, formatNGN } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { Send, MessageSquare, Loader2 } from 'lucide-react';

export default function VendorMessagesPage() {
  const { user } = useAuthStore();
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: bookingsData } = useQuery({
    queryKey: ['vendor-bookings-msgs'],
    queryFn: () => bookingsApi.list({ limit: 30 }).then(r => r.data),
  });

  const { data: messagesData, refetch } = useQuery({
    queryKey: ['messages', selectedBookingId],
    queryFn: () => api.get(`/bookings/${selectedBookingId}/messages`).then(r => r.data),
    enabled: !!selectedBookingId,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/bookings/${selectedBookingId}/messages`, { body }),
    onSuccess: () => { setMessage(''); refetch(); },
    onError: () => toast.error('Failed to send message'),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const bookings = bookingsData?.bookings || [];
  const messages = messagesData?.messages || [];
  const selected = bookings.find((b: any) => b.id === selectedBookingId);

  function handleSend() {
    if (!message.trim() || !selectedBookingId) return;
    sendMutation.mutate(message.trim());
  }

  return (
    <div className="p-6 animate-fade-up">
      <div className="grid grid-cols-[280px_1fr] gap-5 h-[calc(100vh-140px)]">
        {/* Booking list */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-bold flex-shrink-0">
            Conversations
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {bookings.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--muted)]">
                No bookings yet
              </div>
            ) : bookings.map((b: any) => (
              <div key={b.id}
                onClick={() => setSelectedBookingId(b.id)}
                className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg)] transition-colors ${
                  selectedBookingId === b.id ? 'bg-[var(--pill)]' : ''
                }`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[#4a1d96] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {b.reference?.slice(-3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs truncate">
                    {b.eventDescription || 'Event Booking'}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] truncate">
                    {formatNGN(b.totalAmount, true)} · {b.bookingType}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {formatTimeAgo(b.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat window */}
        <div className="card flex flex-col overflow-hidden">
          {!selectedBookingId ? (
            <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
              <div className="text-center">
                <MessageSquare size={36} className="mx-auto mb-3 text-[var(--border)]" />
                <div className="font-semibold text-[var(--dark)] mb-1">Select a booking</div>
                <div className="text-sm">Choose a booking to open the conversation</div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg)]">
                <div>
                  <div className="font-bold text-sm">{selected?.eventDescription || 'Event Booking'}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {selected?.reference} · {formatNGN(selected?.totalAmount, true)}
                  </div>
                </div>
                <span className={selected?.status === 'CONFIRMED' ? 'badge-confirmed' : 'badge-pending'}>
                  {selected?.status}
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-[var(--muted)] py-8">
                    No messages yet. Start the conversation!
                  </div>
                ) : messages.map((m: any) => {
                  const isMe = m.senderId === user?.id;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                          : 'bg-[var(--bg)] text-[var(--dark)] rounded-tl-sm border border-[var(--border)]'
                      }`}>
                        {m.body}
                        <div className={`text-[10px] mt-1 ${isMe ? 'text-white/60' : 'text-[var(--muted)]'}`}>
                          {formatTimeAgo(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Type a message..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sendMutation.isPending}
                  className="btn-primary px-4 flex items-center gap-1.5">
                  {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
