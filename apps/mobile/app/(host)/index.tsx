import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../src/components/ui';
import { useAuthStore } from '../../src/store/auth.store';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../../src/utils/theme';

export default function HostHomeScreen() {
  const { user, logout } = useAuthStore();
  const businessName = user?.host?.businessName || `${user?.firstName ?? 'Host'}'s stays`;
  const activeMode = user?.activeMode ?? 'STAYS';
  const availableModes = user?.availableModes?.join(', ') || 'STAYS';

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/welcome');
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={['#1C1528', '#2D1B5E', '#1C1528']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.kicker}>Owambe Stays</Text>
          <Text style={styles.title}>Welcome, {user?.firstName ?? 'Host'}</Text>
          <Text style={styles.subtitle}>{businessName}</Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Host profile</Text>
            <Text style={styles.cardTitle}>{businessName}</Text>
            <Text style={styles.cardBody}>
              Your mobile account is registered as a host and is ready for the Stays portal workflow.
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Role: HOST</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Mode: {activeMode}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Session hydration</Text>
            <Text style={styles.cardBody}>Available modes: {availableModes}</Text>
            <Text style={styles.cardBody}>Host ID: {user?.host?.id ?? 'Pending profile sync'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Portal status</Text>
            <Text style={styles.cardTitle}>Mobile host shell enabled</Text>
            <Text style={styles.cardBody}>
              Property inventory, availability management, and booking analytics remain owned by follow-on host portal cycles.
            </Text>
          </View>

          <TouchableOpacity style={styles.linkButton} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.linkText}>Switch account</Text>
          </TouchableOpacity>
          <Button title="Sign out" variant="secondary" onPress={handleLogout} fullWidth />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  hero: {
    paddingTop: 72,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  title: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginTop: SPACING.sm,
  },
  content: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  cardLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
    marginBottom: SPACING.sm,
  },
  cardBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.mid,
    marginTop: SPACING.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  badge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  badgeText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
