import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions,
  Alert, Modal, TextInput, Image, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { vendorsApi, bookingsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Button, Card, Badge, Spinner, formatNGN } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, VENDOR_EMOJIS, VENDOR_LABELS } from '../../src/utils/theme';

const { width, height } = Dimensions.get('window');

export default function VendorProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuthStore();
  const [showBookModal, setShowBookModal] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-public', slug],
    queryFn: () => vendorsApi.getProfile(slug).then(r => r.data),
  });

  const vendor = data?.vendor;
  const photos = vendor?.portfolioItems || [];
  const packages = vendor?.packages?.filter((p: any) => p.isActive) || [];
  const reviews = vendor?.reviews || [];

  if (isLoading) return <Spinner />;
  if (!vendor) return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={TYPOGRAPHY.h3}>Vendor not found</Text>
    </SafeAreaView>
  );

  return (
    <>
      <Stack.Screen options={{ headerTitle: vendor.businessName, headerBackTitle: 'Back' }} />
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} showsVerticalScrollIndicator={false}>

        {/* Photo carousel */}
        <View style={{ height: 280, backgroundColor: COLORS.bg }}>
          {photos.length > 0 ? (
            <>
              <ScrollView
                horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onScroll={e => setActivePhoto(Math.round(e.nativeEvent.contentOffset.x / width))}
                scrollEventThrottle={16}
              >
                {photos.map((p: any, i: number) => (
                  <Image key={p.id || i} source={{ uri: p.url }}
                    style={{ width, height: 280 }} resizeMode="cover" />
                ))}
              </ScrollView>
              {/* Dots */}
              <View style={{
                position: 'absolute', bottom: 12, left: 0, right: 0,
                flexDirection: 'row', justifyContent: 'center', gap: 5,
              }}>
                {photos.map((_: any, i: number) => (
                  <View key={i} style={{
                    width: i === activePhoto ? 16 : 5, height: 5, borderRadius: 2.5,
                    backgroundColor: i === activePhoto ? COLORS.white : 'rgba(255,255,255,0.5)',
                  }} />
                ))}
              </View>
            </>
          ) : (
            <View style={{ height: 280, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryLight }}>
              <Text style={{ fontSize: 80 }}>{VENDOR_EMOJIS[vendor.category] || '🏢'}</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
          />
        </View>

        <View style={{ padding: SPACING.lg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {VENDOR_EMOJIS[vendor.category]} {VENDOR_LABELS[vendor.category]}
              </Text>
              <Text style={{ ...TYPOGRAPHY.h2, marginBottom: 4 }}>{vendor.businessName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <Text style={{ fontSize: 14, color: COLORS.muted }}>
                  ⭐ {Number(vendor.rating).toFixed(1)} ({vendor.reviewCount} reviews)
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.muted }}>
                  📍 {vendor.city}
                </Text>
              </View>
            </View>
            {vendor.isInstantBook && (
              <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full }}>
                <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '700' }}>⚡ Instant Book</Text>
              </View>
            )}
          </View>

          {/* Stats strip */}
          <Card style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.lg, padding: SPACING.md }}>
            {[
              { label: 'Bookings', value: `${vendor.bookingCount}+` },
              { label: 'Rating', value: Number(vendor.rating).toFixed(1) },
              { label: 'Radius', value: `${vendor.serviceRadius}km` },
            ].map(s => (
              <View key={s.label} style={{ alignItems: 'center' }}>
                <Text style={{ ...TYPOGRAPHY.h3, color: COLORS.primary }}>{s.value}</Text>
                <Text style={TYPOGRAPHY.caption}>{s.label}</Text>
              </View>
            ))}
          </Card>

          {/* About */}
          {vendor.description && (
            <>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>About</Text>
              <Text style={{ ...TYPOGRAPHY.body, marginBottom: SPACING.lg }} numberOfLines={4}>
                {vendor.description}
              </Text>
            </>
          )}

          {/* Packages */}
          {packages.length > 0 && (
            <>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm }}>Packages</Text>
              {packages.map((pkg: any) => (
                <Card key={pkg.id} style={{ marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.xs }}>
                    <Text style={{ ...TYPOGRAPHY.h4, flex: 1 }}>{pkg.name}</Text>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.primary }}>
                      {formatNGN(pkg.price)}
                    </Text>
                  </View>
                  {pkg.description && (
                    <Text style={{ ...TYPOGRAPHY.body, fontSize: 13, marginBottom: SPACING.sm }}>
                      {pkg.description}
                    </Text>
                  )}
                  {pkg.duration && (
                    <Text style={{ ...TYPOGRAPHY.caption, marginBottom: SPACING.xs }}>⏱ {pkg.duration}</Text>
                  )}
                  {pkg.includes?.length > 0 && (
                    <View style={{ gap: 4 }}>
                      {pkg.includes.map((inc: string, i: number) => (
                        <Text key={i} style={{ fontSize: 12, color: COLORS.mid }}>
                          ✓ {inc}
                        </Text>
                      ))}
                    </View>
                  )}
                </Card>
              ))}
            </>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <>
              <Text style={{ ...TYPOGRAPHY.h4, marginBottom: SPACING.sm, marginTop: SPACING.sm }}>
                Reviews ({vendor.reviewCount})
              </Text>
              {reviews.slice(0, 5).map((r: any) => (
                <Card key={r.id} style={{ marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Text key={i} style={{ fontSize: 12 }}>{i < r.rating ? '⭐' : '☆'}</Text>
                      ))}
                    </View>
                    <View style={{ backgroundColor: '#EDE9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#4A1D96' }}>VERIFIED</Text>
                    </View>
                  </View>
                  {r.title && <Text style={{ ...TYPOGRAPHY.h4, fontSize: 14, marginBottom: 4 }}>{r.title}</Text>}
                  {r.body && <Text style={{ ...TYPOGRAPHY.body, fontSize: 13 }}>{r.body}</Text>}
                  {r.response && (
                    <View style={{ marginTop: SPACING.sm, paddingLeft: SPACING.sm, borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 2 }}>
                        Response from {vendor.businessName}
                      </Text>
                      <Text style={{ ...TYPOGRAPHY.caption, fontSize: 12 }}>{r.response}</Text>
                    </View>
                  )}
                </Card>
              ))}
            </>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: COLORS.white,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        paddingBottom: 30,
        borderTopWidth: 1, borderTopColor: COLORS.border,
        flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={TYPOGRAPHY.caption}>Starting from</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>
            {formatNGN(vendor.minPrice, true)}
          </Text>
        </View>
        <Button
          title={vendor.isInstantBook ? '⚡ Book Instantly' : '📋 Request Quote'}
          variant="accent"
          size="lg"
          onPress={() => {
            if (!isAuthenticated) {
              Alert.alert('Sign In Required', 'Please sign in to book this vendor', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
              ]);
              return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowBookModal(true);
          }}
          style={{ flex: 1 }}
        />
      </View>

      {/* Booking modal */}
      {showBookModal && (
        <BookingModal
          vendor={vendor}
          onClose={() => setShowBookModal(false)}
          onSuccess={() => {
            setShowBookModal(false);
            router.push('/(tabs)/bookings');
          }}
        />
      )}
    </>
  );
}

function BookingModal({ vendor, onClose, onSuccess }: any) {
  const [eventDate, setEventDate] = useState('');
  const [guestCount, setGuestCount] = useState('100');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(String(vendor.minPrice || ''));

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (vendor.isInstantBook) {
        return bookingsApi.createInstant({
          vendorId: vendor.id,
          eventDate, guestCount: Number(guestCount),
          eventDescription: description,
          totalAmount: Number(amount),
        });
      } else {
        return bookingsApi.createRfq({
          vendorId: vendor.id,
          eventDate, guestCount: Number(guestCount),
          eventDescription: description,
          estimatedBudget: Number(amount),
        });
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        vendor.isInstantBook ? '✅ Booking Created!' : '📋 Quote Request Sent!',
        vendor.isInstantBook
          ? 'Proceeding to payment...'
          : 'The vendor will respond within 24 hours.',
        [{ text: 'OK', onPress: onSuccess }]
      );
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Booking failed'),
  });

  const deposit = Number(amount) * 0.3;

  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: COLORS.white,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: SPACING.xl, paddingBottom: 40,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg }}>
            <Text style={TYPOGRAPHY.h3}>
              {vendor.isInstantBook ? 'Book Now' : 'Request Quote'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 24, color: COLORS.muted }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Event Date *</Text>
          <TextInput
            value={eventDate} onChangeText={setEventDate}
            placeholder="YYYY-MM-DD (e.g. 2026-08-15)"
            placeholderTextColor={COLORS.muted}
            style={{
              borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
              padding: SPACING.md, fontSize: 15, color: COLORS.dark, marginBottom: SPACING.md,
            }}
          />

          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Guests</Text>
              <TextInput
                value={guestCount} onChangeText={setGuestCount}
                keyboardType="numeric" placeholder="100"
                placeholderTextColor={COLORS.muted}
                style={{
                  borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
                  padding: SPACING.md, fontSize: 15, color: COLORS.dark,
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>
                {vendor.isInstantBook ? 'Amount (₦)' : 'Budget (₦)'}
              </Text>
              <TextInput
                value={amount} onChangeText={setAmount}
                keyboardType="numeric" placeholder="500000"
                placeholderTextColor={COLORS.muted}
                style={{
                  borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
                  padding: SPACING.md, fontSize: 15, color: COLORS.dark,
                }}
              />
            </View>
          </View>

          <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Event Description *</Text>
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder="Tell the vendor about your event..."
            placeholderTextColor={COLORS.muted}
            multiline numberOfLines={3}
            style={{
              borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
              padding: SPACING.md, fontSize: 15, color: COLORS.dark,
              textAlignVertical: 'top', minHeight: 80, marginBottom: SPACING.md,
            }}
          />

          {vendor.isInstantBook && Number(amount) > 0 && (
            <View style={{ backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md }}>
              <Text style={{ ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.primary }}>
                💰 Deposit now: <Text style={{ fontWeight: '800' }}>{formatNGN(deposit)}</Text>{'\n'}
                Balance released after your event completes ✓
              </Text>
            </View>
          )}

          <Button
            title={vendor.isInstantBook ? `Pay Deposit ${formatNGN(deposit)} →` : 'Send Quote Request →'}
            variant="accent"
            fullWidth size="lg"
            loading={bookMutation.isPending}
            onPress={() => {
              if (!eventDate || !description) {
                Alert.alert('Missing details', 'Please fill in the event date and description');
                return;
              }
              bookMutation.mutate();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
