import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Image, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/services/api';
import { Button, Input } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

const ROLES = [
  { value: 'PLANNER', emoji: '📋', label: 'Event Planner', desc: 'I manage events for clients' },
  { value: 'VENDOR', emoji: '🏢', label: 'Vendor / Business', desc: 'I offer services for events' },
  { value: 'CONSUMER', emoji: '🎉', label: 'Planning My Event', desc: 'I want to plan with AI' },
];

export default function RegisterScreen() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('PLANNER');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!firstName || !lastName || !email || password.length < 8) {
      Alert.alert('Missing details', 'Please fill in all fields. Password must be 8+ characters.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', { firstName, lastName, email: email.toLowerCase(), password, role });
      Alert.alert(
        '✅ Account Created!',
        'Check your email to verify your account, then sign in.',
        [{ text: 'Sign In', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (err: any) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

        {/* ── Premium Header ──────────────────────────────────────────── */}
        <LinearGradient
          colors={['#1C1528', '#2D1B5E', '#1C1528']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {/* Glow orb */}
          <View style={styles.glowOrb} />

          {/* Back button */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Logo — correct aspect ratio 2.117:1 */}
          <Image
            source={require('../../assets/owambe-logo-auth.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Headline */}
          <Text style={styles.headline}>Create account</Text>
          <Text style={styles.subline}>
            Join 1,000+ event professionals on Owambe
          </Text>

          {/* Step indicator */}
          <View style={styles.stepRow}>
            <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
          </View>
        </LinearGradient>

        {/* ── Form ────────────────────────────────────────────────────── */}
        <View style={styles.form}>
          {step === 1 ? (
            <>
              <Text style={{ ...TYPOGRAPHY.h3, marginBottom: SPACING.sm }}>I am a...</Text>
              <View style={{ gap: SPACING.sm, marginBottom: SPACING.xl }}>
                {ROLES.map(r => (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => setRole(r.value)}
                    activeOpacity={0.85}
                    style={[
                      styles.roleCard,
                      role === r.value && styles.roleCardActive,
                    ]}
                  >
                    <Text style={{ fontSize: 28 }}>{r.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.dark }}>{r.label}</Text>
                      <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{r.desc}</Text>
                    </View>
                    <View style={[
                      styles.radioOuter,
                      role === r.value && styles.radioOuterActive,
                    ]}>
                      {role === r.value && <View style={styles.radioInner} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Button title="Continue →" onPress={() => setStep(2)} fullWidth size="lg" />
            </>
          ) : (
            <>
              <Text style={{ ...TYPOGRAPHY.h3, marginBottom: SPACING.sm }}>Your details</Text>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <View style={{ flex: 1 }}>
                  <Input label="First name" placeholder="Adaeze" value={firstName} onChangeText={setFirstName} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Last name" placeholder="Okonkwo" value={lastName} onChangeText={setLastName} />
                </View>
              </View>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Password"
                placeholder="Minimum 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                <Button title="← Back" variant="secondary" onPress={() => setStep(1)} />
                <Button title="Create Account" onPress={handleRegister} loading={loading} style={{ flex: 1 }} />
              </View>
              <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: SPACING.md }}>
                By signing up you agree to our Terms and Privacy Policy
              </Text>
            </>
          )}

          <TouchableOpacity
            style={{ marginTop: SPACING.lg, alignItems: 'center' }}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={{ color: COLORS.muted, fontSize: 14 }}>
              Already have an account?{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Sign in</Text>
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
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.primary,
    opacity: 0.15,
  },
  backBtn: {
    marginBottom: SPACING.md,
  },
  backText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
  logo: {
    height: 69,
    width: 69 * 2.117,
    marginBottom: SPACING.md,
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: SPACING.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
    width: 20,
    borderRadius: 4,
  },
  stepLine: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  form: {
    flex: 1,
    padding: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  roleCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
});
