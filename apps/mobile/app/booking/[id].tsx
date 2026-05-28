import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { bookingsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Card, Badge, Spinner, Button, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, VENDOR_LABELS } from '../../src/utils/theme';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'messages'>('details');
  const scrollRef = useRef<ScrollView>(null);
  const queryClient = useQueryClient();

  const { data: bookingData, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingsApi.list().then(r => ({
      booking: r.data.bookings?.find((b: any) => b.id === id),
    })),
  });

  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => bookingsApi.getMessages(id).then(r => r.data),
    enabled: !!id && activeTab === 'messages',
    refetchInterval: activeTab === 'messages' ? 5000 : false,
  });

  useEffect(() => {
    if (activeTab === 'messages') {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messagesData, activeTab]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => bookingsApi.sendMessage(id, body),
    onSuccess: () => {
      setMessage('');
      refetchMessages();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
      Alert.alert('Booking Cancelled', 'Your booking has been cancelled.');
    },
  });

  if (isLoading) return <Spinner />;

  const b = bookingData?.booking;
  const messages = messagesData?.messages || [];

  const STATUS_BADGE: Record<string, any> = {
    PENDING: 'pending', CONFIRMED: 'confirmed',
    COMPLETED: 'live', CANCELLED: 'cancelled',
  };

  function handleCancel() {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking? This may incur a cancellation fee.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking', style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Cancellation Reason',
              'Please provide a reason for cancellation:',
              (reason) => {
                if (reason) cancelMutation.mutate(reason);
              }
            );
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Stack.Screen options={{ headerTitle: 'Booking Details', headerBackTitle: 'Bookings' }} />

      {/* Tab selector */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
      }}>
        {(['details', 'messages'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1, paddingVertical: 12, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab ? COLORS.primary : 'transparent',
            }}
          >
            <Text style={{
              fontSize: 14, fontWeight: '600',
              color: activeTab === tab ? COLORS.primary : COLORS.muted,
            }}>
              {tab === 'details' ? '📋 Details' : '💬 Messages'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'details' && b ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}>
          {/* Status card */}
          <Card style={{ marginBottom: SPACING.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <Text style={TYPOGRAPHY.h4}>{b.vendor?.businessName}</Text>
              <Badge label={b.status} variant={STATUS_BADGE[b.status]} />
            </View>
            {[
              ['Reference', b.reference],
              ['Category', VENDOR_LABELS[b.vendor?.category] || b.vendor?.category],
              ['Event Date', b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'TBC'],
              ['Guests', b.guestCount ? `${b.guestCount} guests` : '—'],
              ['Booking Type', b.bookingType],
            ].map(([l, v]) => (
              <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <Text style={{ ...TYPOGRAPHY.body, color: COLORS.muted, fontSize: 14 }}>{l}</Text>
                <Text style={{ ...TYPOGRAPHY.body, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </Card>

          {/* Payment card */}
          <Card style={{ marginBottom: SPACING.md }}>
            <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>Payment</Text>
            {[
              ['Total Amount', formatNGN(b.totalAmount)],
              ['Deposit (30%)', formatNGN(b.depositAmount)],
              ['Your Payout', formatNGN(b.vendorAmount)],
              ['Payment Status', b.paymentStatus?.replace(/_/g, ' ')],
            ].map(([l, v]) => (
              <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <Text style={{ ...TYPOGRAPHY.body, color: COLORS.muted, fontSize: 14 }}>{l}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: l === 'Total Amount' ? COLORS.primary : COLORS.dark }}>
                  {v}
                </Text>
              </View>
            ))}
          </Card>

          {/* Escrow notice */}
          {b.status === 'CONFIRMED' && b.paymentStatus === 'DEPOSIT_PAID' && (
            <Card style={{ backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary, marginBottom: SPACING.md }}>
              <Text style={{ ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.primary }}>
                🔒 Your deposit is held securely in escrow. The full balance will be released to the vendor 24 hours after your event completes successfully.
              </Text>
            </Card>
          )}

          {/* Actions */}
          {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && (
            <Button
              title="Cancel Booking"
              variant="secondary"
              fullWidth
              onPress={handleCancel}
              style={{ borderColor: COLORS.danger }}
            />
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={120}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.sm }}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={{ alignItems: 'center', padding: SPACING.xl }}>
                <Text style={{ fontSize: 40, marginBottom: SPACING.md }}>💬</Text>
                <Text style={{ ...TYPOGRAPHY.h4, textAlign: 'center', marginBottom: SPACING.xs }}>No messages yet</Text>
                <Text style={{ ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.muted }}>
                  Start a conversation with {b?.vendor?.businessName || 'the vendor'}
                </Text>
              </View>
            ) : messages.map((m: any) => {
              const isMe = m.senderId === user?.id;
              return (
                <View key={m.id} style={{
                  flexDirection: 'row',
                  justifyContent: isMe ? 'flex-end' : 'flex-start',
                  marginBottom: SPACING.sm,
                }}>
                  <View style={{
                    maxWidth: '78%',
                    backgroundColor: isMe ? COLORS.primary : COLORS.white,
                    borderRadius: RADIUS.lg,
                    borderBottomRightRadius: isMe ? 4 : RADIUS.lg,
                    borderBottomLeftRadius: isMe ? RADIUS.lg : 4,
                    padding: SPACING.md,
                    borderWidth: isMe ? 0 : 1,
                    borderColor: COLORS.border,
                  }}>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: isMe ? COLORS.white : COLORS.dark }}>
                      {m.body}
                    </Text>
                    <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : COLORS.muted, marginTop: 4 }}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Message input */}
          <View style={{
            flexDirection: 'row', gap: SPACING.sm,
            padding: SPACING.md,
            backgroundColor: COLORS.white,
            borderTopWidth: 1, borderTopColor: COLORS.border,
          }}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.muted}
              multiline
              style={{
                flex: 1, fontSize: 14, color: COLORS.dark,
                backgroundColor: COLORS.bg,
                borderRadius: RADIUS.md, padding: SPACING.sm,
                maxHeight: 100, borderWidth: 1, borderColor: COLORS.border,
              }}
            />
            <TouchableOpacity
              onPress={() => { if (message.trim()) sendMutation.mutate(message.trim()); }}
              disabled={!message.trim() || sendMutation.isPending}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: message.trim() ? COLORS.primary : COLORS.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 16 }}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
