import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../src/services/api';
import { Card, Badge, Spinner, EmptyState, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

const STATUS_TABS = ['All', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

export default function BookingsScreen() {
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-bookings', statusFilter],
    queryFn: () => bookingsApi.list({ status: statusFilter || undefined }).then(r => r.data),
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const bookings = data?.bookings || [];

  const STATUS_BADGE: Record<string, any> = {
    PENDING: 'pending', CONFIRMED: 'confirmed',
    COMPLETED: 'live', CANCELLED: 'cancelled',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
          <Text style={{ ...TYPOGRAPHY.h3, marginBottom: SPACING.sm }}>My Bookings</Text>
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}
        >
          {STATUS_TABS.map(tab => {
            const active = tab === 'All' ? !statusFilter : statusFilter === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setStatusFilter(tab === 'All' ? '' : tab)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: RADIUS.full,
                  backgroundColor: active ? COLORS.dark : COLORS.bg,
                  borderWidth: 1, borderColor: active ? COLORS.dark : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? COLORS.white : COLORS.mid }}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? <Spinner /> : (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {bookings.length === 0 ? (
            <EmptyState
              emoji="📋"
              title="No bookings yet"
              description="Book a vendor or get a quote to see them here"
              action={
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/vendors')}
                  style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.md }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '700' }}>Browse Vendors</Text>
                </TouchableOpacity>
              }
            />
          ) : (
            bookings.map((b: any) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => router.push(`/booking/${b.id}`)}
                activeOpacity={0.85}
              >
                <Card style={{ marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPOGRAPHY.h4, marginBottom: 2 }} numberOfLines={1}>
                        {b.vendor?.businessName || 'Vendor Booking'}
                      </Text>
                      <Text style={{ ...TYPOGRAPHY.caption, marginBottom: 4 }}>
                        {b.vendor?.category} · {b.bookingType}
                      </Text>
                      <Text style={{ ...TYPOGRAPHY.caption }}>
                        📅 {b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Badge label={b.status} variant={STATUS_BADGE[b.status] || 'pending'} />
                      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>
                        {formatNGN(b.totalAmount, true)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                    <Text style={TYPOGRAPHY.caption}>
                      {b.paymentStatus === 'DEPOSIT_PAID' ? '✓ Deposit paid' :
                       b.paymentStatus === 'FULLY_PAID' ? '✓ Fully paid' : 'Awaiting deposit'}
                    </Text>
                    <Text style={{ ...TYPOGRAPHY.caption, fontFamily: 'Courier', fontSize: 11 }}>
                      {b.reference}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
