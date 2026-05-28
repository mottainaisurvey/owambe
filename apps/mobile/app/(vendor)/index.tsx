// ─── VENDOR HOME ─────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi, bookingsApi, vendorsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Card, StatCard, Badge, Spinner, Button, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

export default function VendorHomeScreen() {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data: revenueData, refetch: refetchRevenue } = useQuery({
    queryKey: ['vendor-revenue'],
    queryFn: () => analyticsApi.vendorRevenue().then(r => r.data),
  });

  const { data: bookingsData, refetch: refetchBookings } = useQuery({
    queryKey: ['vendor-bookings-home'],
    queryFn: () => bookingsApi.list({ limit: 5 }).then(r => r.data),
  });

  const { data: profileData } = useQuery({
    queryKey: ['vendor-profile-mobile'],
    queryFn: () => vendorsApi.getMyProfile().then(r => r.data),
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchRevenue(), refetchBookings()]);
    setRefreshing(false);
  }

  const stats = revenueData?.stats;
  const bookings = bookingsData?.bookings || [];
  const vendor = profileData?.vendor;

  const STATUS_BADGE: Record<string, any> = {
    PENDING: 'pending', CONFIRMED: 'confirmed', COMPLETED: 'live', CANCELLED: 'cancelled',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Dark header */}
        <View style={{ backgroundColor: COLORS.dark, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: 36 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Vendor Portal</Text>
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '800', marginTop: 4 }}>
            {vendor?.businessName || `${user?.firstName}'s Business`}
          </Text>
          {vendor?.status && (
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <View style={{
                backgroundColor: vendor.status === 'VERIFIED' ? '#4A1D96' : '#92400E',
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full,
              }}>
                <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '700' }}>
                  {vendor.status === 'VERIFIED' ? '✓ VERIFIED' : vendor.status}
                </Text>
              </View>
              {vendor.launchBonusActive && (
                <View style={{ backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full }}>
                  <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '700' }}>🎉 0% COMMISSION</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ padding: SPACING.lg, marginTop: -20 }}>
          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            <StatCard label="Total Earned" value={stats ? formatNGN(stats.totalRevenue, true) : '—'} accent={COLORS.primary} />
            <StatCard label="In Escrow" value={stats ? formatNGN(stats.pendingPayout, true) : '—'} accent={COLORS.accent} />
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
            <StatCard label="Rating" value={stats ? `${Number(stats.rating).toFixed(1)} ⭐` : '—'} accent="#D97706" />
            <StatCard label="Bookings" value={stats?.totalBookings ?? '—'} accent="#7B61FF" />
          </View>

          {/* Recent bookings */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
            <Text style={TYPOGRAPHY.h4}>Recent Bookings</Text>
            <TouchableOpacity onPress={() => router.push('/(vendor)/bookings')}>
              <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>View all →</Text>
            </TouchableOpacity>
          </View>

          {bookings.length === 0 ? (
            <Card style={{ alignItems: 'center', padding: SPACING.xl }}>
              <Text style={{ fontSize: 40, marginBottom: SPACING.md }}>📭</Text>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.xs }}>No bookings yet</Text>
              <Text style={{ ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.muted }}>
                Complete your profile to start appearing in search results
              </Text>
              <Button title="Complete Profile →" variant="primary" onPress={() => router.push('/(vendor)/profile')} style={{ marginTop: SPACING.md }} />
            </Card>
          ) : (
            bookings.map((b: any) => (
              <TouchableOpacity key={b.id} onPress={() => router.push(`/booking/${b.id}`)} activeOpacity={0.85}>
                <Card style={{ marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPOGRAPHY.h4, fontSize: 14 }} numberOfLines={1}>
                        {b.eventDescription || 'Event Booking'}
                      </Text>
                      <Text style={{ ...TYPOGRAPHY.caption, marginTop: 2 }}>
                        📅 {b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : 'TBC'}
                        {' · '}{b.bookingType}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge label={b.status} variant={STATUS_BADGE[b.status]} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                        {formatNGN(b.vendorAmount, true)}
                      </Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
