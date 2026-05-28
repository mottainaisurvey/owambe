import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  RefreshControl, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../src/services/api';
import { Card, Badge, Spinner, EmptyState, formatNGN } from '../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../src/utils/theme';

const { width } = Dimensions.get('window');

const EVENT_TYPES = ['All', 'CONFERENCE', 'CONCERT', 'WEDDING', 'BIRTHDAY', 'CORPORATE', 'FESTIVAL', 'WORKSHOP'];
const TYPE_EMOJIS: Record<string, string> = {
  CONFERENCE: '🎤', CONCERT: '🎵', WEDDING: '💍', BIRTHDAY: '🎂',
  CORPORATE: '💼', FESTIVAL: '🎉', WORKSHOP: '🛠', All: '✨',
};

export default function BrowseEventsScreen() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['public-events', typeFilter],
    queryFn: () => eventsApi.listPublic({
      type: typeFilter || undefined,
      limit: 50,
    }).then(r => r.data),
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const allEvents: any[] = data?.events || [];
  const events = search
    ? allEvents.filter((e: any) => e.name.toLowerCase().includes(search.toLowerCase()))
    : allEvents;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{
        backgroundColor: COLORS.primary,
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.lg,
        paddingBottom: SPACING.xl,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
            <Text style={{ color: COLORS.white, fontSize: 18 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '800', flex: 1 }}>
            Browse Events
          </Text>
        </View>
        {/* Search bar */}
        <View style={{
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: RADIUS.lg,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.md,
          paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search events..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={{ flex: 1, color: COLORS.white, fontSize: 15 }}
          />
        </View>
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8 }}
        style={{ backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, maxHeight: 56 }}
      >
        {EVENT_TYPES.map(t => {
          const active = (t === 'All' && !typeFilter) || t === typeFilter;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTypeFilter(t === 'All' ? '' : t)}
              style={{
                backgroundColor: active ? COLORS.primary : COLORS.bg,
                borderRadius: RADIUS.full,
                paddingHorizontal: 14,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderWidth: 1,
                borderColor: active ? COLORS.primary : COLORS.border,
              }}
            >
              <Text style={{ fontSize: 13 }}>{TYPE_EMOJIS[t] || '🎪'}</Text>
              <Text style={{
                fontSize: 13,
                fontWeight: active ? '700' : '500',
                color: active ? COLORS.white : COLORS.mid,
              }}>
                {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase().replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Events list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}
      >
        {isLoading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <EmptyState
            emoji="🎪"
            title="No events found"
            description={search ? `No events match "${search}"` : 'No upcoming events right now. Check back soon!'}
          />
        ) : (
          events.map((ev: any) => (
            <TouchableOpacity
              key={ev.id}
              onPress={() => router.push({ pathname: '/vendor/[slug]', params: { slug: ev.slug } })}
              activeOpacity={0.85}
            >
              <Card style={{ marginBottom: SPACING.md, padding: 0, overflow: 'hidden' }}>
                {/* Cover image */}
                {ev.coverImageUrl ? (
                  <Image
                    source={{ uri: ev.coverImageUrl }}
                    style={{ width: '100%', height: 160, backgroundColor: COLORS.border }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{
                    width: '100%', height: 120,
                    backgroundColor: COLORS.primary + '22',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 48 }}>{TYPE_EMOJIS[ev.type] || '🎪'}</Text>
                  </View>
                )}
                <View style={{ padding: SPACING.md }}>
                  {/* Status badge */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Text style={{ ...TYPOGRAPHY.h4, flex: 1, marginRight: 8 }} numberOfLines={2}>
                      {ev.name}
                    </Text>
                    <Badge
                      label={ev.status}
                      variant={ev.status === 'LIVE' ? 'live' : 'primary'}
                    />
                  </View>
                  {/* Date & location */}
                  <Text style={{ ...TYPOGRAPHY.caption, marginBottom: 4 }}>
                    📅 {ev.startDate ? new Date(ev.startDate).toLocaleDateString('en-NG', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    }) : 'Date TBC'}
                  </Text>
                  {ev.venue || ev.city ? (
                    <Text style={{ ...TYPOGRAPHY.caption, marginBottom: 8 }}>
                      📍 {[ev.venue, ev.city].filter(Boolean).join(', ')}
                    </Text>
                  ) : null}
                  {/* Ticket price & attendees */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>
                      {ev.minPrice === 0 ? 'Free' : `From ${formatNGN(ev.minPrice, true)}`}
                    </Text>
                    <Text style={{ ...TYPOGRAPHY.caption }}>
                      👥 {ev.attendeeCount || 0} registered
                    </Text>
                  </View>
                  {ev.isSoldOut && (
                    <View style={{
                      marginTop: 8,
                      backgroundColor: '#FEE2E2',
                      borderRadius: RADIUS.sm,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      alignSelf: 'flex-start',
                    }}>
                      <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>Sold Out</Text>
                    </View>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
