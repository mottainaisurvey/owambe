import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Alert, Vibration, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, attendeesApi, analyticsApi } from '../src/services/api';
import { Card, Spinner, formatNGN } from '../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../src/utils/theme';

const { width } = Dimensions.get('window');
const SCAN_BOX = width * 0.65;

export default function CheckInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [scanResult, setScanResult] = useState<{ success: boolean; name?: string; ticket?: string; error?: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  const { data: eventsData } = useQuery({
    queryKey: ['my-events-live'],
    queryFn: () => eventsApi.list({ limit: 20 }).then(r => r.data),
  });

  const { data: liveStats, refetch: refetchStats } = useQuery({
    queryKey: ['live-checkin', selectedEventId],
    queryFn: () => analyticsApi.checkInLive(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
    refetchInterval: 10000,
  });

  const checkInMutation = useMutation({
    mutationFn: (qrCode: string) => attendeesApi.checkIn({ qrCode, eventId: selectedEventId }),
    onSuccess: (res) => {
      const { attendee } = res.data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanResult({ success: true, name: attendee.name, ticket: attendee.ticket });
      refetchStats();
      setTimeout(() => { setScanResult(null); setIsProcessing(false); }, 3500);
    },
    onError: (err: any) => {
      const error = err.response?.data?.error || 'Check-in failed';
      const alreadyIn = error.includes('Already');
      Haptics.notificationAsync(
        alreadyIn ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error
      );
      setScanResult({ success: false, error });
      setTimeout(() => { setScanResult(null); setIsProcessing(false); }, 3000);
    },
  });

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (isProcessing || !selectedEventId) return;
    setIsProcessing(true);
    checkInMutation.mutate(data);
  }

  const events = eventsData?.events || [];
  const stats = liveStats || { totalRegistered: 0, totalCheckedIn: 0, checkInRate: 0, recentCheckIns: [] };
  const rate = stats.totalRegistered > 0
    ? Math.round((stats.totalCheckedIn / stats.totalRegistered) * 100) : 0;

  if (!permission) return <Spinner />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
        <Text style={{ fontSize: 60, marginBottom: SPACING.lg }}>📷</Text>
        <Text style={{ ...TYPOGRAPHY.h3, textAlign: 'center', marginBottom: SPACING.sm }}>
          Camera Access Required
        </Text>
        <Text style={{ ...TYPOGRAPHY.body, textAlign: 'center', marginBottom: SPACING.xl }}>
          Owambe needs camera access to scan attendee QR codes at check-in.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ backgroundColor: COLORS.primary, padding: SPACING.md, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>Allow Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.dark }}>
      <Stack.Screen options={{ headerTitle: 'Check-in Scanner', headerStyle: { backgroundColor: COLORS.dark }, headerTintColor: COLORS.white }} />

      {/* Event selector */}
      {!selectedEventId ? (
        <View style={{ flex: 1, padding: SPACING.lg }}>
          <Text style={{ color: COLORS.white, ...TYPOGRAPHY.h3, marginBottom: SPACING.md }}>
            Select Event to Check In
          </Text>
          {events.map((ev: any) => (
            <TouchableOpacity
              key={ev.id}
              onPress={() => setSelectedEventId(ev.id)}
              activeOpacity={0.85}
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: RADIUS.lg,
                padding: SPACING.md,
                marginBottom: SPACING.sm,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>{ev.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>
                📅 {ev.startDate ? new Date(ev.startDate).toLocaleDateString('en-NG') : 'TBC'} · {ev._count?.attendees || 0} registered
              </Text>
            </TouchableOpacity>
          ))}
          {events.length === 0 && (
            <Text style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: SPACING.xl }}>
              No events found. Create and publish an event first.
            </Text>
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Stats bar */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-around',
            backgroundColor: 'rgba(255,255,255,0.08)',
            paddingVertical: SPACING.md,
          }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800' }}>{stats.totalCheckedIn}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Checked In</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.accent, fontSize: 24, fontWeight: '800' }}>{rate}%</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Rate</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800' }}>{stats.totalRegistered}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Registered</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedEventId('')}
              style={{ alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '600' }}>Change{'\n'}Event</Text>
            </TouchableOpacity>
          </View>

          {/* Camera */}
          <View style={{ flex: 1, position: 'relative' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={scanResult || isProcessing ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />

            {/* Scan frame overlay */}
            <View style={{
              position: 'absolute', inset: 0,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Dark overlay with hole */}
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />

              {/* Scan box */}
              <View style={{ width: SCAN_BOX, height: SCAN_BOX, position: 'relative' }}>
                {/* Clear the overlay in the center */}
                <View style={{
                  position: 'absolute', inset: 0,
                  backgroundColor: 'transparent',
                }} />

                {/* Corner brackets */}
                {[
                  { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                  { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                  { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                  { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
                ].map((style, i) => (
                  <View key={i} style={{
                    position: 'absolute',
                    width: 28, height: 28,
                    borderColor: COLORS.accent,
                    ...style,
                  }} />
                ))}

                {/* Scan result overlay */}
                {scanResult && (
                  <View style={{
                    position: 'absolute', inset: -20,
                    backgroundColor: scanResult.success ? 'rgba(5,150,105,0.92)' : 'rgba(230,57,70,0.92)',
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: 8,
                  }}>
                    <Text style={{ fontSize: 48, marginBottom: 8 }}>
                      {scanResult.success ? '✅' : '❌'}
                    </Text>
                    {scanResult.success ? (
                      <>
                        <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                          {scanResult.name}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>
                          {scanResult.ticket}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8 }}>
                          Checked in ✓
                        </Text>
                      </>
                    ) : (
                      <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
                        {scanResult.error}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: SPACING.xl, textAlign: 'center' }}>
                {isProcessing ? 'Processing...' : 'Point camera at QR code on ticket'}
              </Text>
            </View>
          </View>

          {/* Recent check-ins */}
          {stats.recentCheckIns?.length > 0 && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: SPACING.md }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginBottom: SPACING.sm }}>
                RECENT CHECK-INS
              </Text>
              {stats.recentCheckIns.slice(0, 3).map((ci: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 }}>
                  <Text style={{ color: '#34D399', fontSize: 16 }}>✓</Text>
                  <Text style={{ color: COLORS.white, fontSize: 13, flex: 1 }}>
                    {ci.attendee?.firstName} {ci.attendee?.lastName}
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                      {' '}· {ci.attendee?.ticketType?.name}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
