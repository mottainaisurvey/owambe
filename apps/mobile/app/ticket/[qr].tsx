import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Rect, Path, G } from 'react-native-svg';
import { attendeesApi } from '../../src/services/api';
import { Spinner, Card } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

const { width } = Dimensions.get('window');

// Simple QR code renderer using react-native-svg
// In production replace with: npm install react-native-qrcode-svg
function QRDisplay({ value }: { value: string }) {
  // Render a stylised placeholder QR with the actual code shown below
  // Real QR generation: import QRCode from 'react-native-qrcode-svg'
  const size = width - SPACING.xl * 2 - 48;
  const cells = 21; // QR version 1
  const cellSize = size / cells;

  // Deterministic pattern from string hash
  function hash(s: string, i: number, j: number): boolean {
    const code = s.charCodeAt((i * cells + j) % s.length);
    return (code + i + j) % 3 !== 0;
  }

  // Fixed finder patterns (top-left, top-right, bottom-left)
  function isFinder(r: number, c: number): boolean {
    const inCorner = (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);
    return inCorner;
  }

  function cellColor(r: number, c: number): string {
    if (isFinder(r, c)) {
      const edgeR = r === 0 || r === 6 || r === cells - 7 || r === cells - 1;
      const edgeC = c === 0 || c === 6 || c === cells - 7 || c === cells - 1;
      const innerR3 = (r >= 2 && r <= 4) || (r >= cells - 5 && r <= cells - 3);
      const innerC3 = (c >= 2 && c <= 4) || (c >= cells - 5 && c <= cells - 3);
      if (edgeR || edgeC || (innerR3 && innerC3)) return COLORS.dark;
      return COLORS.white;
    }
    return hash(value, r, c) ? COLORS.dark : 'transparent';
  }

  return (
    <View style={{ padding: 16, backgroundColor: COLORS.white, borderRadius: RADIUS.lg }}>
      <Svg width={size} height={size}>
        {Array.from({ length: cells }).map((_, r) =>
          Array.from({ length: cells }).map((_, c) => {
            const color = cellColor(r, c);
            if (color === 'transparent') return null;
            return (
              <Rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill={color}
              />
            );
          })
        )}
      </Svg>
    </View>
  );
}

export default function TicketScreen() {
  const { qr } = useLocalSearchParams<{ qr: string }>();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['ticket', qr],
    queryFn: () => attendeesApi.getTicket(qr).then(r => r.data),
  });

  if (isLoading) return <Spinner />;

  const a = data?.attendee;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.primary }}>
      <Stack.Screen options={{
        headerTitle: 'My Ticket',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
      }} />

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, alignItems: 'center' }}>
        {/* Ticket card */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <View style={{
            backgroundColor: COLORS.white,
            borderRadius: RADIUS.xl,
            overflow: 'hidden',
            ...{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 12,
            },
          }}>
            {/* Top: Event info */}
            <View style={{ backgroundColor: COLORS.primary, padding: SPACING.xl, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 1.5 }}>
                OWAMBE EVENT TICKET
              </Text>
              <Text style={{
                color: COLORS.white, fontSize: 22, fontWeight: '900',
                textAlign: 'center', marginTop: 8, lineHeight: 28,
              }}>
                {a?.event?.name || 'Event'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', marginTop: 8, fontSize: 14 }}>
                📅 {a?.event?.startDate
                  ? new Date(a.event.startDate).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Date TBC'}
              </Text>
              {a?.event?.venue && (
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
                  📍 {a.event.venue}, {a.event.city}
                </Text>
              )}
            </View>

            {/* Tear line */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, marginLeft: -10 }} />
              <View style={{ flex: 1, borderTopWidth: 2, borderTopColor: COLORS.border, borderStyle: 'dashed' }} />
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, marginRight: -10 }} />
            </View>

            {/* Middle: Attendee info */}
            <View style={{ padding: SPACING.xl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.lg }}>
                <View>
                  <Text style={TYPOGRAPHY.label}>Name</Text>
                  <Text style={{ ...TYPOGRAPHY.h4, marginTop: 2 }}>
                    {a?.firstName} {a?.lastName}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={TYPOGRAPHY.label}>Ticket Type</Text>
                  <Text style={{ ...TYPOGRAPHY.h4, marginTop: 2, color: COLORS.primary }}>
                    {a?.ticketType?.name || 'General'}
                  </Text>
                </View>
              </View>

              {/* Status */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: a?.status === 'CHECKED_IN' ? '#EDE9FF' : COLORS.primaryLight,
                padding: SPACING.sm, borderRadius: RADIUS.md, marginBottom: SPACING.lg,
              }}>
                <Text style={{ fontSize: 16 }}>{a?.status === 'CHECKED_IN' ? '✅' : '🎫'}</Text>
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: a?.status === 'CHECKED_IN' ? '#4A1D96' : COLORS.primary,
                }}>
                  {a?.status === 'CHECKED_IN' ? 'Checked In ✓' : 'Valid Ticket — Present at Door'}
                </Text>
              </View>

              {/* QR Code */}
              <View style={{ alignItems: 'center' }}>
                <QRDisplay value={qr} />
                <Text style={{
                  marginTop: SPACING.md, fontFamily: 'Courier', fontSize: 13,
                  color: COLORS.muted, letterSpacing: 2,
                }}>
                  {qr?.match(/.{1,4}/g)?.join(' ') || qr}
                </Text>
              </View>
            </View>

            {/* Bottom strip */}
            <View style={{ backgroundColor: COLORS.bg, padding: SPACING.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14 }}>🇳🇬</Text>
              <Text style={{ fontSize: 12, color: COLORS.muted, fontWeight: '600' }}>
                Powered by owambe.com
              </Text>
            </View>
          </View>
        </Animated.View>

        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: SPACING.xl }}>
          Show this QR code at the event entrance for contactless check-in.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
