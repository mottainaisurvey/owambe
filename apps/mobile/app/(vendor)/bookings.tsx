// ─── VENDOR BOOKINGS ─────────────────────────────────
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '../../src/services/api';
import { Card, Badge, Spinner, Button, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

export default function VendorBookingsScreen() {
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vendor-bookings-all', filter],
    queryFn: () => bookingsApi.list({ status: filter || undefined }).then(r => r.data),
  });

  const confirmMutation = useMutation({
    mutationFn: bookingsApi.confirm,
    onSuccess: () => {
      Alert.alert('✅ Booking Confirmed!', 'The client has been notified.');
      queryClient.invalidateQueries({ queryKey: ['vendor-bookings-all'] });
    },
  });

  const bookings = data?.bookings || [];
  const STATUS_BADGE: Record<string, any> = {
    PENDING: 'pending', CONFIRMED: 'confirmed', COMPLETED: 'live', CANCELLED: 'cancelled',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ backgroundColor: COLORS.white, paddingTop: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <Text style={{ ...TYPOGRAPHY.h3, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>Bookings</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}>
          {['', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map(s => (
            <TouchableOpacity key={s} onPress={() => setFilter(s)} activeOpacity={0.8}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
                backgroundColor: filter === s ? COLORS.dark : COLORS.bg,
                borderWidth: 1, borderColor: filter === s ? COLORS.dark : COLORS.border,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: filter === s ? COLORS.white : COLORS.mid }}>
                {s || 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? <Spinner /> : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} tintColor={COLORS.primary} />}>
          {bookings.map((b: any) => (
            <Card key={b.id} style={{ marginBottom: SPACING.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...TYPOGRAPHY.h4, fontSize: 14 }} numberOfLines={1}>{b.eventDescription || 'Booking'}</Text>
                  <Text style={TYPOGRAPHY.caption}>
                    📅 {b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NG') : 'TBC'} · {b.guestCount || '—'} guests
                  </Text>
                  <Text style={{ ...TYPOGRAPHY.caption, fontFamily: 'Courier', marginTop: 2 }}>{b.reference}</Text>
                </View>
                <Badge label={b.status} variant={STATUS_BADGE[b.status]} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{formatNGN(b.vendorAmount, true)}</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  {b.status === 'PENDING' && b.bookingType === 'INSTANT' && (
                    <Button title="Confirm" size="sm" onPress={() => confirmMutation.mutate(b.id)} loading={confirmMutation.isPending} />
                  )}
                  {b.status === 'PENDING' && b.bookingType === 'RFQ' && (
                    <Button title="Quote" size="sm" variant="accent" onPress={() => router.push(`/booking/${b.id}`)} />
                  )}
                  <Button title="View" size="sm" variant="secondary" onPress={() => router.push(`/booking/${b.id}`)} />
                </View>
              </View>
            </Card>
          ))}
          {bookings.length === 0 && (
            <View style={{ alignItems: 'center', padding: SPACING.xxl }}>
              <Text style={{ fontSize: 40, marginBottom: SPACING.md }}>📋</Text>
              <Text style={TYPOGRAPHY.h4}>No bookings found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
