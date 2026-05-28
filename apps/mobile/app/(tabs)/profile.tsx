import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Switch,
  Modal, TextInput, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../src/store/auth.store';
import { authApi, analyticsApi } from '../../src/services/api';
import { Avatar, Card, Button } from '../../src/components/ui';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../src/utils/theme';

// ─── EDIT PROFILE MODAL ──────────────────────────────
function EditProfileModal({ visible, onClose, user, onSave }: {
  visible: boolean; onClose: () => void;
  user: any; onSave: (d: any) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
      onClose();
    } catch {
      Alert.alert('Error', 'Could not update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: 15, color: COLORS.dark, backgroundColor: COLORS.white,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: COLORS.muted, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.dark }}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={{ color: saving ? COLORS.muted : COLORS.primary, fontSize: 16, fontWeight: '700' }}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
          <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
            <Avatar name={`${firstName} ${lastName}`} size={80} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>First Name</Text>
            <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={COLORS.muted} style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Last Name</Text>
            <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={COLORS.muted} style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Phone Number</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+234 800 000 0000" placeholderTextColor={COLORS.muted} keyboardType="phone-pad" style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Email</Text>
            <TextInput value={user?.email || ''} editable={false} style={{ ...inputStyle, color: COLORS.muted, backgroundColor: COLORS.surface }} />
            <Text style={{ ...TYPOGRAPHY.caption, marginTop: 4 }}>Email cannot be changed here.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── CHANGE PASSWORD MODAL ───────────────────────────
function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: 15, color: COLORS.dark, backgroundColor: COLORS.white,
  };

  async function handleChange() {
    if (!current || !next || !confirm) { Alert.alert('Required', 'All fields are required.'); return; }
    if (next.length < 8) { Alert.alert('Too short', 'New password must be at least 8 characters.'); return; }
    if (next !== confirm) { Alert.alert('Mismatch', 'New passwords do not match.'); return; }
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      Alert.alert('Success', 'Your password has been changed.');
      setCurrent(''); setNext(''); setConfirm('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not change password. Check your current password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: COLORS.muted, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.dark }}>Change Password</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
          <Text style={{ ...TYPOGRAPHY.body, color: COLORS.muted, marginBottom: SPACING.sm }}>
            Choose a strong password of at least 8 characters.
          </Text>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Current Password</Text>
            <TextInput value={current} onChangeText={setCurrent} placeholder="Enter current password" placeholderTextColor={COLORS.muted} secureTextEntry style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>New Password</Text>
            <TextInput value={next} onChangeText={setNext} placeholder="At least 8 characters" placeholderTextColor={COLORS.muted} secureTextEntry style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Confirm New Password</Text>
            <TextInput value={confirm} onChangeText={setConfirm} placeholder="Repeat new password" placeholderTextColor={COLORS.muted} secureTextEntry style={inputStyle} />
          </View>
          <Button title={saving ? 'Changing…' : 'Change Password'} onPress={handleChange} fullWidth disabled={saving} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── HELP & FAQ MODAL ────────────────────────────────
const FAQ_ITEMS = [
  { q: 'How do I create an event?', a: 'Tap the ✨ Plan tab, describe your event to the AI assistant, and it will generate a complete event plan with vendor recommendations. You can then customise and publish.' },
  { q: 'How do I book a vendor?', a: 'Browse vendors in the Browse tab, tap a vendor to view their profile and packages, then tap "Book Now" or "Request Quote" to start the booking process.' },
  { q: 'When will I receive my ticket?', a: 'Your ticket QR code is available immediately after registration in the Bookings tab. You can also find it under the event you registered for.' },
  { q: 'How do I check in attendees?', a: "Go to Profile → Check-in Scanner (Planner Tools). Point the camera at an attendee's QR code to check them in instantly." },
  { q: 'Can I cancel a booking?', a: 'Yes. Open the booking in the Bookings tab and tap "Cancel Booking". Cancellation policies vary by vendor — check the booking terms before cancelling.' },
  { q: 'How are payments processed?', a: 'All payments are processed securely via Paystack. Your card details are never stored on Owambe servers. Instalment payment plans are also available — split vendor costs into 2–4 payments.' },
  {
    q: 'What are the plan differences?',
    a: 'Owambe has three plans:\n\n🟢 STARTER (Free)\n• Events & ticketing\n• Vendor bookings\n• AI event planning\n• Instalment payments\n• Basic analytics\n\n🔵 GROWTH\nEverything in Starter, plus:\n• Email campaigns to attendees\n• Contracts & e-signatures (DocuSign-style)\n• Market intelligence analytics\n• Priority support\n\n🟣 SCALE\nEverything in Growth, plus:\n• White-label event portal (your own branded URL)\n• CRM sync (Salesforce & HubSpot)\n• Dedicated account manager\n• Custom integrations',
  },
  {
    q: 'How do I upgrade my plan?',
    a: 'To upgrade from Starter to Growth or Scale:\n\n1. Email upgrade@owambe.com with your registered email address and the plan you want\n2. Or tap "Contact Support" below and send a message — our team responds within 4 hours\n3. Once confirmed, your new features activate immediately\n\nGrowth unlocks: Email campaigns, Contracts, Market intelligence\nScale unlocks: White-label portal, CRM sync (Salesforce/HubSpot)',
  },
];

function HelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: COLORS.muted, fontSize: 16 }}>Close</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.dark }}>Help & FAQ</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          <View style={{ backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.primary, marginBottom: 4 }}>Need more help?</Text>
            <Text style={{ ...TYPOGRAPHY.body, color: COLORS.primary }}>
              Email us at support@owambe.com or use the Contact Support option in the menu.
            </Text>
          </View>
          {FAQ_ITEMS.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setExpanded(expanded === idx ? null : idx)}
              activeOpacity={0.8}
              style={{
                backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: expanded === idx ? COLORS.primary : COLORS.border,
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.dark, paddingRight: 8 }}>{item.q}</Text>
                <Text style={{ fontSize: 18, color: COLORS.muted }}>{expanded === idx ? '−' : '+'}</Text>
              </View>
              {expanded === idx && (
                <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
                  <Text style={{ ...TYPOGRAPHY.body, color: COLORS.mid, lineHeight: 22 }}>{item.a}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── CONTACT SUPPORT MODAL ───────────────────────────
function ContactSupportModal({ visible, onClose, user }: { visible: boolean; onClose: () => void; user: any }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const inputStyle = {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: 15, color: COLORS.dark, backgroundColor: COLORS.white,
  };

  async function handleSend() {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required', 'Please fill in both subject and message.');
      return;
    }
    setSending(true);
    try {
      const body = `Subject: ${subject}\n\nFrom: ${user?.firstName} ${user?.lastName} (${user?.email})\nRole: ${user?.role}\n\n${message}`;
      const mailto = `mailto:support@owambe.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
        setSubject(''); setMessage('');
        onClose();
      } else {
        Alert.alert('Email Support', 'Please email us at support@owambe.com');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: COLORS.muted, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.dark }}>Contact Support</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm }}>
            <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>
              ⏱ Average response time: under 4 hours (Mon–Fri, 9am–6pm WAT)
            </Text>
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Subject</Text>
            <TextInput value={subject} onChangeText={setSubject} placeholder="e.g. Issue with vendor booking" placeholderTextColor={COLORS.muted} style={inputStyle} />
          </View>
          <View>
            <Text style={{ ...TYPOGRAPHY.label, marginBottom: 6 }}>Message</Text>
            <TextInput
              value={message} onChangeText={setMessage}
              placeholder="Describe your issue in detail…"
              placeholderTextColor={COLORS.muted}
              multiline numberOfLines={6} textAlignVertical="top"
              style={{ ...inputStyle, minHeight: 120 }}
            />
          </View>
          <Button title={sending ? 'Opening email…' : 'Send via Email'} onPress={handleSend} fullWidth disabled={sending} />
          <View style={{ alignItems: 'center', gap: 6, marginTop: SPACING.sm }}>
            <Text style={TYPOGRAPHY.caption}>Or reach us directly</Text>
            <TouchableOpacity onPress={() => Linking.openURL('mailto:support@owambe.com')}>
              <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 14 }}>support@owambe.com</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL('https://wa.me/2348000000000')}>
              <Text style={{ color: '#25D366', fontWeight: '600', fontSize: 14 }}>WhatsApp Support</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── TERMS & PRIVACY MODAL ───────────────────────────
const TERMS_SECTIONS = [
  { title: '1. Acceptance of Terms', body: 'By accessing or using the Owambe platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.' },
  { title: '2. Use of the Service', body: 'Owambe provides a platform connecting event planners, vendors, and attendees in Nigeria. You agree to use the Service only for lawful purposes and in accordance with these Terms.' },
  { title: '3. User Accounts', body: 'You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorised use of your account.' },
  { title: '4. Vendor Bookings', body: 'Bookings made through Owambe are agreements between planners and vendors. Owambe facilitates but is not a party to these agreements. Cancellation policies are set by individual vendors.' },
  { title: '5. Payments', body: 'All payments are processed via Paystack, a licensed payment processor. Owambe does not store card details. Service fees are non-refundable unless stated otherwise.' },
  { title: '6. Prohibited Activities', body: 'You may not use the Service to post false information, impersonate others, engage in fraudulent transactions, or violate any applicable Nigerian or international laws.' },
  { title: '7. Limitation of Liability', body: 'Owambe shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.' },
  { title: '8. Governing Law', body: 'These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Lagos State, Nigeria.' },
];

const PRIVACY_SECTIONS = [
  { title: '1. Information We Collect', body: 'We collect information you provide (name, email, phone), usage data (events created, bookings made), and device information to provide and improve our Service.' },
  { title: '2. How We Use Your Information', body: 'We use your information to operate the platform, process payments, send transactional emails, and improve our services. We do not sell your personal data.' },
  { title: '3. Data Sharing', body: 'We share your information with vendors you book, payment processors (Paystack), and cloud infrastructure providers. All third parties are bound by confidentiality agreements.' },
  { title: '4. Data Security', body: 'We implement industry-standard security measures including TLS encryption, hashed passwords (bcrypt), and secure token storage.' },
  { title: '5. Your Rights (NDPR)', body: 'Under Nigerian data protection law (NDPR), you have the right to access, correct, or delete your personal data. Contact privacy@owambe.com to exercise these rights.' },
  { title: '6. Data Retention', body: 'We retain your data for as long as your account is active. Upon account deletion, personal data is removed within 30 days, except where retention is required by law.' },
  { title: '7. Contact', body: 'For privacy enquiries, contact our Data Protection Officer at privacy@owambe.com or write to Owambe Technologies Ltd, Lagos, Nigeria.' },
];

function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'terms' | 'privacy'>('terms');
  const sections = tab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: COLORS.muted, fontSize: 16 }}>Close</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.dark }}>Legal</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ flexDirection: 'row', margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 4 }}>
          {(['terms', 'privacy'] as const).map(t => (
            <TouchableOpacity
              key={t} onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: tab === t ? COLORS.white : 'transparent' }}
            >
              <Text style={{ fontWeight: '700', fontSize: 14, color: tab === t ? COLORS.dark : COLORS.muted }}>
                {t === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          <Text style={{ ...TYPOGRAPHY.h3, marginBottom: SPACING.sm }}>
            {tab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </Text>
          <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.muted, marginBottom: SPACING.lg }}>Last updated: April 2026</Text>
          {sections.map(s => (
            <View key={s.title} style={{ marginBottom: SPACING.lg }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 6 }}>{s.title}</Text>
              <Text style={{ ...TYPOGRAPHY.body, color: COLORS.mid, lineHeight: 22 }}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── MAIN PROFILE SCREEN ─────────────────────────────
export default function ProfileScreen() {
  const { user, logout, setAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const isPlanner = user?.role === 'PLANNER';

  const { data: overview } = useQuery({
    queryKey: ['planner-overview'],
    queryFn: () => analyticsApi.plannerOverview().then(r => r.data),
    enabled: isPlanner,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => authApi.updateProfile(data),
    onSuccess: async (res) => {
      const updated = res.data.user;
      const SecureStore = await import('expo-secure-store');
      const token = await SecureStore.getItemAsync('accessToken');
      if (token && user) {
        await setAuth({ ...user, ...updated }, token);
      }
      queryClient.invalidateQueries({ queryKey: ['planner-overview'] });
    },
  });

  function handleRateApp() {
    const storeUrl = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/owambe/id0000000000'
      : 'https://play.google.com/store/apps/details?id=com.owambe.app';
    Alert.alert(
      'Rate Owambe ⭐',
      'Enjoying Owambe? Leave us a review — it takes 30 seconds and means a lot to the team!',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Rate Now', onPress: () => Linking.openURL(storeUrl) },
      ]
    );
  }

  const stats = overview?.stats;

  const MENU_ITEMS = [
    {
      section: 'Account',
      items: [
        { emoji: '👤', label: 'Edit Profile', onPress: () => setShowEditProfile(true) },
        {
          emoji: '🔔', label: 'Notifications',
          right: (
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              thumbColor={COLORS.white}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
            />
          ),
        },
        { emoji: '🔐', label: 'Change Password', onPress: () => setShowChangePassword(true) },
      ],
    },
    ...(isPlanner ? [{
      section: 'Planner Tools',
      items: [
        { emoji: '🎫', label: 'Check-in Scanner', onPress: () => router.push('/checkin') },
        { emoji: '📊', label: 'Analytics', onPress: () => router.push('/analytics') },
        { emoji: '📅', label: 'My Events', onPress: () => router.push('/events') },
      ],
    }] : []),
    {
      section: 'Support',
      items: [
        { emoji: '❓', label: 'Help & FAQ', onPress: () => setShowHelp(true) },
        { emoji: '💬', label: 'Contact Support', onPress: () => setShowContact(true) },
        { emoji: '⭐', label: 'Rate Owambe', onPress: handleRateApp },
        { emoji: '📄', label: 'Terms & Privacy', onPress: () => setShowTerms(true) },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={{
          backgroundColor: COLORS.primary,
          paddingTop: SPACING.lg,
          paddingBottom: 40,
          paddingHorizontal: SPACING.xl,
          alignItems: 'center',
        }}>
          <TouchableOpacity onPress={() => setShowEditProfile(true)} activeOpacity={0.8}>
            <Avatar name={`${user?.firstName || ''} ${user?.lastName || ''}`} size={72} />
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              backgroundColor: COLORS.accent, borderRadius: 12, width: 24, height: 24,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 12 }}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: '800', marginTop: SPACING.md }}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: 4 }}>
            {user?.email}
          </Text>
          <View style={{
            marginTop: SPACING.md, backgroundColor: COLORS.accent,
            paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full,
          }}>
            <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '700' }}>
              {user?.role} · {(user as any)?.profile?.plan || 'STARTER'} PLAN
            </Text>
          </View>
        </View>

        <View style={{ padding: SPACING.lg, marginTop: -20 }}>
          {/* Live stats row for planners */}
          {isPlanner && (
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              {[
                { label: 'Events', value: stats?.totalEvents ?? '—' },
                { label: 'Attendees', value: stats?.totalAttendees ?? '—' },
                { label: 'Revenue', value: stats ? `₦${((stats.totalRevenue || 0) / 1000).toFixed(0)}K` : '₦—' },
              ].map(s => (
                <Card key={s.label} style={{ flex: 1, alignItems: 'center', padding: SPACING.md }}>
                  <Text style={{ ...TYPOGRAPHY.h3, color: COLORS.primary }}>{String(s.value)}</Text>
                  <Text style={TYPOGRAPHY.caption}>{s.label}</Text>
                </Card>
              ))}
            </View>
          )}

          {/* Menu sections */}
          {MENU_ITEMS.map(section => (
            <View key={section.section} style={{ marginBottom: SPACING.lg }}>
              <Text style={{ ...TYPOGRAPHY.label, marginBottom: SPACING.sm }}>{section.section}</Text>
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {section.items.map((item, idx) => (
                  <TouchableOpacity
                    key={item.label}
                    onPress={(item as any).onPress}
                    activeOpacity={(item as any).right ? 1 : 0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACING.md,
                      padding: SPACING.md,
                      borderBottomWidth: idx < section.items.length - 1 ? 1 : 0,
                      borderBottomColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.emoji}</Text>
                    <Text style={{ flex: 1, fontSize: 15, color: COLORS.dark }}>{item.label}</Text>
                    {(item as any).right || ((item as any).onPress && (
                      <Text style={{ color: COLORS.muted, fontSize: 18 }}>›</Text>
                    ))}
                  </TouchableOpacity>
                ))}
              </Card>
            </View>
          ))}

          {/* Sign out */}
          <Button
            title="Sign Out"
            variant="secondary"
            fullWidth
            onPress={() => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
              ]);
            }}
          />
          <Text style={{ ...TYPOGRAPHY.caption, textAlign: 'center', marginTop: SPACING.lg }}>
            owambe.com · Version 1.0.8 · Lagos, Nigeria 🇳🇬
          </Text>
        </View>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        user={user}
        onSave={(d) => updateMutation.mutateAsync(d)}
      />
      <ChangePasswordModal visible={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />
      <ContactSupportModal visible={showContact} onClose={() => setShowContact(false)} user={user} />
      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
    </SafeAreaView>
  );
}
