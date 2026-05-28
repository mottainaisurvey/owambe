import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../../src/services/api';
import { Card, Badge, Spinner, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['event-detail', id],
    queryFn: () => eventsApi.get(id as string).then(r => r.data),
    enabled: !!id,
  });

  const event = data?.event;

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={TYPOGRAPHY.body}>Event not found</Text>
      </SafeAreaView>
    );
  }

  const startDate = event.startDate ? new Date(event.startDate) : null;
  const endDate = event.endDate ? new Date(event.endDate) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: SPACING.xxl }}
      >
        {/* Hero */}
        <View style={{
          backgroundColor: COLORS.primary,
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.lg,
          paddingBottom: 32,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, marginRight: SPACING.md }}>
              <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '800', marginBottom: 6 }}>
                {event.name}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                {event.type?.replace(/_/g, ' ')}
              </Text>
            </View>
            <Badge label={event.status} variant={event.status?.toLowerCase() as any} />
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
          {/* Key stats */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
            <Card style={{ flex: 1, alignItems: 'center', padding: SPACING.md }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.primary }}>
                {event.registrationCount || 0}
              </Text>
              <Text style={{ ...TYPOGRAPHY.caption, marginTop: 2 }}>Registered</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center', padding: SPACING.md }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.primary }}>
                {event.capacity || '∞'}
              </Text>
              <Text style={{ ...TYPOGRAPHY.caption, marginTop: 2 }}>Capacity</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center', padding: SPACING.md }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                {formatNGN(event.revenue || 0, true)}
              </Text>
              <Text style={{ ...TYPOGRAPHY.caption, marginTop: 2 }}>Revenue</Text>
            </Card>
          </View>

          {/* Details */}
          <Card style={{ marginBottom: SPACING.md }}>
            <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>Event Details</Text>
            <View style={{ gap: SPACING.sm }}>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <Text style={{ width: 24 }}>📅</Text>
                <Text style={TYPOGRAPHY.body}>
                  {startDate ? startDate.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'TBC'}
                  {startDate && endDate && endDate.toDateString() !== startDate.toDateString()
                    ? ` – ${endDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}`
                    : ''}
                </Text>
              </View>
              {event.startTime && (
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <Text style={{ width: 24 }}>🕐</Text>
                  <Text style={TYPOGRAPHY.body}>{event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}</Text>
                </View>
              )}
              {(event.venue || event.city) && (
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <Text style={{ width: 24 }}>📍</Text>
                  <Text style={TYPOGRAPHY.body}>{[event.venue, event.city].filter(Boolean).join(', ')}</Text>
                </View>
              )}
              {event.description && (
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <Text style={{ width: 24 }}>📝</Text>
                  <Text style={{ ...TYPOGRAPHY.body, flex: 1 }}>{event.description}</Text>
                </View>
              )}
            </View>
          </Card>

          {/* Ticket tiers */}
          {event.ticketTiers?.length > 0 && (
            <Card style={{ marginBottom: SPACING.md }}>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>Ticket Tiers</Text>
              {event.ticketTiers.map((tier: any) => (
                <View key={tier.id} style={{
                  flexDirection: 'row', justifyContent: 'space-between',
                  paddingVertical: SPACING.sm,
                  borderBottomWidth: 1, borderBottomColor: COLORS.border,
                }}>
                  <View>
                    <Text style={{ fontWeight: '600', color: COLORS.dark }}>{tier.name}</Text>
                    <Text style={TYPOGRAPHY.caption}>{tier.sold || 0} / {tier.quantity} sold</Text>
                  </View>
                  <Text style={{ fontWeight: '700', color: COLORS.primary }}>
                    {tier.price === 0 ? 'Free' : formatNGN(tier.price)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {/* Quick actions */}
          <View style={{ gap: SPACING.sm }}>
            <TouchableOpacity
              onPress={() => router.push(`/checkin?eventId=${event.id}`)}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACING.sm,
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>🎫 Open Check-in Scanner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/dayof?eventId=${event.id}`)}
              style={{
                backgroundColor: COLORS.white,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACING.sm,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.dark, fontWeight: '700', fontSize: 15 }}>📋 Day-of Tools</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
