import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyticsApi, eventsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Card, StatCard, Badge, EmptyState, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { user } = useAuthStore();
  const isPlanner = user?.role === 'PLANNER';
  const isConsumer = user?.role === 'CONSUMER';

  const { data: overview, refetch: refetchOverview, isLoading } = useQuery({
    queryKey: ['planner-overview'],
    queryFn: () => analyticsApi.plannerOverview().then(r => r.data),
    enabled: isPlanner,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ['my-events-mobile'],
    queryFn: () => eventsApi.list({ limit: 5 }).then(r => r.data),
    enabled: isPlanner,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchOverview(), refetchEvents()]);
    setRefreshing(false);
  }

  const stats = overview?.stats;
  const events = eventsData?.events || [];
  const firstName = user?.firstName || 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: SPACING.xxl }}
      >
        {/* Hero header */}
        <LinearGradient
          colors={['#1C1528', '#2D1B5E', '#1C1528']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: SPACING.xl,
            paddingTop: SPACING.lg,
            paddingBottom: 40,
            overflow: 'hidden',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800', marginTop: 4 }}>
            Hey, {firstName} 👋
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: 4 }}>
            {isPlanner ? 'Your event command centre' : 'Plan your next event with AI'}
          </Text>

          {/* Quick action pill */}
          <TouchableOpacity
            onPress={() => router.push(isPlanner ? '/(tabs)/plan' : '/(tabs)/plan')}
            activeOpacity={0.85}
            style={{
              marginTop: SPACING.lg,
              backgroundColor: COLORS.accent,
              borderRadius: RADIUS.full,
              paddingVertical: 12,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 16 }}>✨</Text>
            <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>
              {isPlanner ? 'Create Event with AI' : 'Plan My Event Free'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={{ padding: SPACING.lg, marginTop: -20 }}>
          {/* Stats row — planners only */}
          {isPlanner && (
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              <StatCard
                label="Live Events"
                value={stats?.liveEvents ?? '—'}
                sub={`of ${stats?.totalEvents ?? 0} total`}
                accent={COLORS.primary}
              />
              <StatCard
                label="Registrations"
                value={stats?.totalAttendees ?? '—'}
                sub="all time"
                accent={COLORS.accent}
              />
            </View>
          )}

          {isPlanner && (
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              <StatCard
                label="Revenue"
                value={stats ? formatNGN(stats.totalRevenue, true) : '—'}
                sub="total"
                accent="#7B61FF"
              />
              <StatCard
                label="Fill Rate"
                value={stats ? `${stats.fillRate ?? 0}%` : '—'}
                sub="avg across events"
                accent="#059669"
              />
            </View>
          )}

          {/* Consumer: big CTA cards */}
          {isConsumer && (
            <View style={{ gap: SPACING.md, marginBottom: SPACING.lg }}>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/plan')}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: RADIUS.xl,
                  padding: SPACING.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.md,
                }}
              >
                <Text style={{ fontSize: 48 }}>🤖</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>Plan with AI</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
                    Describe your event → get 3 complete vendor packages
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/(tabs)/vendors')}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.white,
                  borderRadius: RADIUS.xl,
                  padding: SPACING.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.md,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 48 }}>🏛</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.dark, fontSize: 18, fontWeight: '800' }}>Browse Vendors</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>
                    200+ verified venues, caterers, photographers in Lagos
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/browse-events')}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.accent + '15',
                  borderRadius: RADIUS.xl,
                  padding: SPACING.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.md,
                  borderWidth: 1,
                  borderColor: COLORS.accent + '40',
                }}
              >
                <Text style={{ fontSize: 48 }}>🎪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.dark, fontSize: 18, fontWeight: '800' }}>Browse Events</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>
                    Discover concerts, conferences, weddings & more
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Recent events — planners */}
          {isPlanner && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                <Text style={TYPOGRAPHY.h4}>Recent Events</Text>
                <TouchableOpacity onPress={() => router.push('/events')}>
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>View all →</Text>
                </TouchableOpacity>
              </View>

              {events.length === 0 ? (
                <EmptyState
                  emoji="🎉"
                  title="No events yet"
                  description="Create your first event in under 2 minutes"
                  action={
                    <TouchableOpacity
                      onPress={() => router.push('/(tabs)/plan')}
                      style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.md }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: '700' }}>Create Event</Text>
                    </TouchableOpacity>
                  }
                />
              ) : (
                events.map((ev: any) => (
                  <TouchableOpacity
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                    activeOpacity={0.85}
                  >
                    <Card style={{ marginBottom: SPACING.sm }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ ...TYPOGRAPHY.h4, marginBottom: 4 }} numberOfLines={1}>{ev.name}</Text>
                          <Text style={TYPOGRAPHY.caption}>
                            📅 {ev.startDate ? new Date(ev.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : 'TBC'}
                            {ev.city ? ` · 📍 ${ev.city}` : ''}
                          </Text>
                        </View>
                        <Badge
                          label={ev.status || 'DRAFT'}
                          variant={(ev.status || 'draft').toLowerCase() as any}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.sm }}>
                        <Text style={TYPOGRAPHY.caption}>
                          👥 {ev.registrationCount || 0} registered
                        </Text>
                        <Text style={TYPOGRAPHY.caption}>
                          💰 {formatNGN(ev.revenue || 0, true)}
                        </Text>
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* Categories grid for consumers */}
          {isConsumer && (
            <>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>Browse by Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                {[
                  { emoji: '🏛', label: 'Venues', cat: 'VENUE' },
                  { emoji: '🍽', label: 'Catering', cat: 'CATERING' },
                  { emoji: '📸', label: 'Photography', cat: 'PHOTOGRAPHY_VIDEO' },
                  { emoji: '🎛', label: 'AV', cat: 'AV_PRODUCTION' },
                  { emoji: '💐', label: 'Décor', cat: 'DECOR_FLORALS' },
                  { emoji: '🎶', label: 'Entertainment', cat: 'ENTERTAINMENT' },
                  { emoji: '💄', label: 'Makeup', cat: 'MAKEUP_ARTIST' },
                  { emoji: '🎤', label: 'Speakers', cat: 'SPEAKER' },
                ].map(c => (
                  <TouchableOpacity
                    key={c.cat}
                    onPress={() => router.push({ pathname: '/(tabs)/vendors', params: { category: c.cat } })}
                    activeOpacity={0.8}
                    style={{
                      width: (width - SPACING.lg * 2 - SPACING.sm * 3) / 4,
                      backgroundColor: COLORS.white,
                      borderRadius: RADIUS.lg,
                      padding: SPACING.sm,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 26, marginBottom: 4 }}>{c.emoji}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.mid, textAlign: 'center' }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
