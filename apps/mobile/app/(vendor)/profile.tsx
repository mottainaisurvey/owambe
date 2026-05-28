import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { vendorsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Avatar, Card } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

export default function VendorProfileScreen() {
  const { user, logout } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['vendor-profile-settings'],
    queryFn: () => vendorsApi.getMyProfile().then(r => r.data),
  });

  const vendor = data?.vendor;

  const checklist = [
    { label: 'Business name & category', done: !!vendor?.businessName },
    { label: 'Profile description', done: !!vendor?.description },
    { label: 'Portfolio photos (3+)', done: (vendor?.portfolioItems?.length || 0) >= 3 },
    { label: 'Pricing information', done: !!vendor?.minPrice },
    { label: 'Bank account connected', done: !!vendor?.paystackSubAccountCode },
    { label: 'Profile verified', done: vendor?.status === 'VERIFIED' },
  ];

  const progress = checklist.filter(c => c.done).length;

  const MENU = [
    { emoji: '🏢', label: 'Business Details', desc: 'Name, category, description' },
    { emoji: '📸', label: 'Portfolio Photos', desc: 'Showcase your best work' },
    { emoji: '💰', label: 'Packages & Pricing', desc: 'Set your service packages' },
    { emoji: '🏦', label: 'Bank Account', desc: 'Receive your payouts' },
    { emoji: '⭐', label: 'Reviews', desc: 'View and respond to client reviews' },
    { emoji: '🔔', label: 'Notifications', desc: 'Manage booking alerts' },
    { emoji: '❓', label: 'Help & Support', desc: 'FAQ and contact us' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        {/* Dark header */}
        <View style={{
          backgroundColor: COLORS.dark, paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.lg, paddingBottom: 36, alignItems: 'center',
        }}>
          <Avatar name={vendor?.businessName || user?.firstName || 'V'} size={64} />
          <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800', marginTop: SPACING.md }}>
            {vendor?.businessName || 'My Business'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>{user?.email}</Text>
          <View style={{
            marginTop: 8, backgroundColor: vendor?.status === 'VERIFIED' ? '#4A1D96' : '#92400E',
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full,
          }}>
            <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '700' }}>
              {vendor?.status === 'VERIFIED' ? '✓ VERIFIED VENDOR' : (vendor?.status || 'PENDING REVIEW')}
            </Text>
          </View>
        </View>

        <View style={{ padding: SPACING.lg, marginTop: -20 }}>
          {/* Verification checklist */}
          <Card style={{ marginBottom: SPACING.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <Text style={TYPOGRAPHY.h4}>Profile Completion</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                {progress}/{checklist.length}
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: SPACING.md, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${(progress / checklist.length) * 100}%`, backgroundColor: COLORS.primary, borderRadius: 3 }} />
            </View>
            {checklist.map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 6 }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: item.done ? COLORS.primary : COLORS.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.done && <Text style={{ color: COLORS.white, fontSize: 11 }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: item.done ? COLORS.dark : COLORS.muted }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </Card>

          {/* Menu */}
          <Card padding={0} style={{ overflow: 'hidden', marginBottom: SPACING.lg }}>
            {MENU.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => Alert.alert(item.label, 'Coming soon — manage this on owambe.com/vendor/settings')}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                  padding: SPACING.md,
                  borderBottomWidth: idx < MENU.length - 1 ? 1 : 0,
                  borderBottomColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.dark }}>{item.label}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>{item.desc}</Text>
                </View>
                <Text style={{ color: COLORS.muted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          <TouchableOpacity
            onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: logout },
            ])}
            style={{
              borderWidth: 1.5, borderColor: COLORS.border,
              borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center',
            }}
          >
            <Text style={{ color: COLORS.danger, fontWeight: '700' }}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={{ ...TYPOGRAPHY.caption, textAlign: 'center', marginTop: SPACING.lg }}>
            owambe.com · Vendor v1.0 · Lagos 🇳🇬
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
