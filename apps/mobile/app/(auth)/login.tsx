import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Image, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/store/auth.store';
import { Button, Input } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

export default function LoginScreen() {
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!email.includes('@')) e.email = 'Enter a valid email';
    if (password.length < 6) e.password = 'Password too short';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Login failed. Check your email and password.';
      Alert.alert('Sign In Failed', msg);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Premium Header ──────────────────────────────────────────── */}
        <LinearGradient
          colors={['#1C1528', '#2D1B5E', '#1C1528']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {/* Subtle glow orb top-right */}
          <View style={styles.glowOrb} />

          {/* Logo — correct aspect ratio 2.117:1 */}
          <Image
            source={require('../../assets/owambe-logo-auth.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Tagline */}
          <Text style={styles.tagline}>Nigeria&apos;s Event Platform</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { val: '200+', label: 'Vendors' },
              { val: 'Lagos', label: 'Based' },
              { val: 'AI', label: 'Powered' },
            ].map((s, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={styles.statVal}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* ── Form ────────────────────────────────────────────────────── */}
        <View style={styles.form}>
          <Text style={{ ...TYPOGRAPHY.h2, marginBottom: 4 }}>Welcome back</Text>
          <Text style={{ ...TYPOGRAPHY.body, color: COLORS.muted, marginBottom: SPACING.xl }}>
            Sign in to your Owambe account
          </Text>

          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            returnKeyType="next"
          />

          <Input
            label="Password"
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={errors.password}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            onPress={() => {/* forgot password */}}
            style={{ alignSelf: 'flex-end', marginBottom: SPACING.lg, marginTop: -4 }}
          >
            <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>
              Forgot password?
            </Text>
          </TouchableOpacity>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            fullWidth
            size="lg"
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continue with Google"
            variant="secondary"
            fullWidth
            size="lg"
            onPress={() => Alert.alert('Google Sign-In', 'Coming soon')}
          />

          <TouchableOpacity
            style={{ marginTop: SPACING.xl, alignItems: 'center' }}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={{ color: COLORS.muted, fontSize: 14 }}>
              Don&apos;t have an account?{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Create one free</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 72,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primary,
    opacity: 0.18,
  },
  logo: {
    height: 78,
    width: 78 * 2.117,
    marginBottom: SPACING.sm,
  },
  tagline: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statVal: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    marginTop: 1,
  },
  form: {
    flex: 1,
    padding: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
  },
});
