import React, { useRef } from 'react';
import {
  View, Text, Dimensions, TouchableOpacity,
  ScrollView, Image, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS } from '../../src/utils/theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: null,         // first slide shows the Owambe logo instead of an emoji
    emoji: null,
    title: 'Nigeria\'s smartest\nevent platform',
    body: 'AI plans your entire event in minutes. 200+ verified vendors in Lagos, all in one place.',
    gradient: ['#1C1528', '#2D1B5E', '#1C1528'] as const,
    accent: COLORS.accent,
  },
  {
    emoji: '🤖',
    title: 'Plan any event\nwith AI',
    body: 'Describe your event, budget, and guest count. Our AI builds a full vendor plan in under 2 minutes.',
    gradient: ['#1C1528', '#3B0764', '#1C1528'] as const,
    accent: COLORS.accent,
  },
  {
    emoji: '🏛',
    title: '200+ verified\nLagos vendors',
    body: 'Venues, catering, photography, AV, makeup, décor — all verified, all in one place.',
    gradient: ['#1C1528', '#2D1B5E', '#1C1528'] as const,
    accent: COLORS.accent,
  },
  {
    emoji: '🔒',
    title: 'Pay with\nconfidence',
    body: 'Deposits held in escrow via Paystack. Vendors get paid after your event. You\'re protected.',
    gradient: ['#1C1528', '#1A2E1A', '#1C1528'] as const,
    accent: '#4ADE80',
  },
];

export default function WelcomeScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = React.useState(0);

  function next() {
    if (current < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (current + 1), animated: true });
      setCurrent(current + 1);
    } else {
      router.push('/(auth)/login');
    }
  }

  function skip() {
    router.push('/(auth)/login');
  }

  const slide = SLIDES[current];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Skip button */}
      {current < SLIDES.length - 1 && (
        <TouchableOpacity onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <LinearGradient
            key={i}
            colors={s.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.slide}
          >
            {/* Glow orb */}
            <View style={[styles.glow, { backgroundColor: s.accent }]} />

            {/* Content */}
            <View style={styles.slideContent}>
              {i === 0 ? (
                /* First slide: Owambe logo as hero */
                <View style={styles.logoContainer}>
                  <Image
                    source={require('../../assets/owambe-logo-auth.png')}
                    style={styles.heroLogo}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                /* Other slides: large emoji */
                <View style={styles.emojiContainer}>
                  <Text style={styles.emoji}>{s.emoji}</Text>
                </View>
              )}

              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </LinearGradient>
        ))}
      </ScrollView>

      {/* ── Bottom controls ──────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === current && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity
          onPress={next}
          activeOpacity={0.85}
          style={styles.ctaBtn}
        >
          <LinearGradient
            colors={[COLORS.accent, '#E8B830']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>
              {current === SLIDES.length - 1 ? 'Get Started →' : 'Next →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Sign in link on last slide */}
        {current === SLIDES.length - 1 && (
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.signinLink}>
            <Text style={styles.signinText}>
              Already have an account?{' '}
              <Text style={{ color: COLORS.accent, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1528',
  },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: SPACING.xl,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  slide: {
    width,
    flex: 1,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.08,
  },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 180,  // leave room for bottom controls
  },
  logoContainer: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  heroLogo: {
    height: 92,
    width: 92 * 2.117,
  },
  emojiContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emoji: {
    fontSize: 52,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: SPACING.md,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 48,
    paddingTop: SPACING.lg,
    backgroundColor: 'rgba(28,21,40,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACING.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 24,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  ctaBtn: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  ctaGradient: {
    padding: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#1C1528',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  signinLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signinText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
});
