import React from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, ViewStyle, TextStyle, TouchableOpacityProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/theme';

// ─── BUTTON ──────────────────────────────────────────
interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  title, variant = 'primary', size = 'md', loading, icon,
  fullWidth = false, disabled, style, ...props
}: ButtonProps) {
  const variantStyles: Record<string, { bg: string; text: string; border?: string }> = {
    primary: { bg: COLORS.primary, text: COLORS.white },
    secondary: { bg: 'transparent', text: COLORS.mid, border: COLORS.border },
    accent: { bg: COLORS.accent, text: COLORS.white },
    danger: { bg: COLORS.danger, text: COLORS.white },
    ghost: { bg: 'transparent', text: COLORS.primary },
  };

  const sizeStyles = {
    sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: 13 },
    md: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 15 },
    lg: { paddingVertical: 16, paddingHorizontal: 28, fontSize: 16 },
  };

  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  const isPrimary = variant === 'primary';
  const isAccent = variant === 'accent';

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : icon}
      <Text style={{ fontSize: s.fontSize, fontWeight: '700', color: v.text, letterSpacing: 0.2 }}>
        {title}
      </Text>
    </>
  );

  if (isPrimary) {
    return (
      <TouchableOpacity
        {...props}
        disabled={isDisabled}
        activeOpacity={0.82}
        style={[
          {
            borderRadius: RADIUS.lg,
            overflow: 'hidden',
            opacity: isDisabled ? 0.5 : 1,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
            ...SHADOWS.md,
          },
          style as ViewStyle,
        ]}
      >
        <LinearGradient
          colors={['#7C3AED', '#6C2BD9', '#5B21B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: s.paddingVertical,
            paddingHorizontal: s.paddingHorizontal,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      {...props}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        {
          backgroundColor: v.bg,
          borderWidth: v.border ? 1.5 : 0,
          borderColor: v.border,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          borderRadius: RADIUS.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style as ViewStyle,
      ]}
    >
      {inner}
    </TouchableOpacity>
  );
}

// ─── CARD ─────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: number;
}

export function Card({ children, style, onPress, padding = SPACING.md }: CardProps) {
  const cardStyle = [
    {
      backgroundColor: COLORS.white,
      borderRadius: RADIUS.lg,
      padding,
      borderWidth: 1,
      borderColor: COLORS.border,
      ...SHADOWS.sm,
    },
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

// ─── INPUT ────────────────────────────────────────────
interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: any;
  icon?: React.ReactNode;
  style?: ViewStyle;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
}

export function Input({
  label, placeholder, value, onChangeText, error, secureTextEntry,
  keyboardType = 'default', multiline, numberOfLines, autoCapitalize = 'sentences',
  icon, style, returnKeyType, onSubmitEditing,
}: InputProps) {
  return (
    <View style={[{ marginBottom: SPACING.sm }, style]}>
      {label && (
        <Text style={{
          ...TYPOGRAPHY.label,
          marginBottom: 6,
        }}>
          {label}
        </Text>
      )}
      <View style={{
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
        backgroundColor: COLORS.white,
        borderWidth: 1.5,
        borderColor: error ? COLORS.danger : COLORS.border,
        borderRadius: RADIUS.md,
        paddingHorizontal: SPACING.md,
        paddingVertical: multiline ? SPACING.sm : 0,
        minHeight: multiline ? 80 : 48,
      }}>
        {icon && <View style={{ marginRight: 8, marginTop: multiline ? 2 : 0 }}>{icon}</View>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          style={{
            flex: 1,
            fontSize: 15,
            color: COLORS.dark,
            paddingVertical: multiline ? 4 : 0,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </View>
      {error && (
        <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.danger, marginTop: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

// ─── BADGE ────────────────────────────────────────────
interface BadgeProps {
  label: string;
  variant?: 'confirmed' | 'pending' | 'cancelled' | 'live' | 'draft' | 'primary' | 'published' | 'ended' | string;
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: '#EDE9FF', text: '#4A1D96' },
  pending: { bg: '#FEF3C7', text: '#92400E' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  live: { bg: '#EDE9FF', text: '#4A1D96' },
  draft: { bg: '#F3F4F6', text: '#6B7280' },
  published: { bg: '#DBEAFE', text: '#1E40AF' },
  ended: { bg: '#F3F4F6', text: '#6B7280' },
  primary: { bg: COLORS.primaryLight, text: COLORS.primary },
};

export function Badge({ label, variant = 'primary' }: BadgeProps) {
  const c = BADGE_COLORS[variant] ?? BADGE_COLORS['primary'];
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.text, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── AVATAR ───────────────────────────────────────────
const AVATAR_COLORS = [
  COLORS.primary, COLORS.accent, '#7B61FF', '#059669', '#D97706',
];

export function Avatar({ name, size = 40, uri }: { name: string; size?: number; uri?: string }) {
  const safeName = name || '?';
  const initials = safeName.split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?';
  const colorIdx = safeName.charCodeAt(0) % AVATAR_COLORS.length;

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: AVATAR_COLORS[colorIdx],
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: size * 0.35 }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── SPINNER ──────────────────────────────────────────
export function Spinner({ size = 'large', color = COLORS.primary }: { size?: any; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────
export function EmptyState({ emoji = '📭', title, description, action }: {
  emoji?: string; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: SPACING.xxl }}>
      <Text style={{ fontSize: 48, marginBottom: SPACING.md }}>{emoji}</Text>
      <Text style={{ ...TYPOGRAPHY.h3, marginBottom: SPACING.xs, textAlign: 'center' }}>{title}</Text>
      {description && (
        <Text style={{ ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.muted, marginBottom: SPACING.lg }}>
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}

// ─── SECTION HEADER ───────────────────────────────────
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
      <Text style={TYPOGRAPHY.h4}>{title}</Text>
      {action}
    </View>
  );
}

// ─── STAT CARD ────────────────────────────────────────
export function StatCard({ label, value, sub, accent = COLORS.primary }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <View style={{ height: 3, backgroundColor: accent, borderRadius: 2, marginBottom: SPACING.sm }} />
      <Text style={TYPOGRAPHY.label}>{label}</Text>
      <Text style={{ ...TYPOGRAPHY.h2, marginVertical: 2 }}>{value}</Text>
      {sub && <Text style={TYPOGRAPHY.caption}>{sub}</Text>}
    </Card>
  );
}

// ─── NGN FORMATTER ────────────────────────────────────
export function formatNGN(amount: number | string, compact = false): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₦0';
  if (compact) {
    if (num >= 1_000_000) return `₦${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `₦${(num / 1_000).toFixed(0)}K`;
  }
  return `₦${num.toLocaleString('en-NG')}`;
}
