import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── REGISTER DEVICE ─────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Configure Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('owambe-default', {
      name: 'Owambe Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C2BD9',
    });
    await Notifications.setNotificationChannelAsync('owambe-bookings', {
      name: 'Booking Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('Push token:', token);

  // Save token to server
  try {
    await api.post('/notifications/register-device', { token, platform: Platform.OS });
  } catch (err) {
    console.warn('Failed to register push token with server:', err);
  }

  return token;
}

// ─── NOTIFICATION CATEGORIES ─────────────────────────
export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync('booking', [
    { identifier: 'confirm', buttonTitle: 'Confirm', options: { opensAppToForeground: true } },
    { identifier: 'message', buttonTitle: 'Message Client', options: { opensAppToForeground: true } },
    { identifier: 'decline', buttonTitle: 'Decline', options: { isDestructive: true } },
  ]);

  await Notifications.setNotificationCategoryAsync('payment', [
    { identifier: 'view', buttonTitle: 'View Booking', options: { opensAppToForeground: true } },
  ]);
}

// ─── NOTIFICATION HANDLERS ───────────────────────────
export function setupNotificationListeners(
  onNotification: (n: Notifications.Notification) => void,
  onResponse: (r: Notifications.NotificationResponse) => void
) {
  const receiveListener = Notifications.addNotificationReceivedListener(onNotification);
  const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    Notifications.removeNotificationSubscription(receiveListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

// ─── BADGE MANAGEMENT ────────────────────────────────
export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge() {
  await Notifications.setBadgeCountAsync(0);
}

// ─── LOCAL NOTIFICATIONS ─────────────────────────────
export async function scheduleEventReminder(eventName: string, eventDate: Date) {
  const reminderTime = new Date(eventDate);
  reminderTime.setDate(reminderTime.getDate() - 1);
  reminderTime.setHours(9, 0, 0, 0); // 9 AM day before

  if (reminderTime > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Tomorrow: ${eventName}`,
        body: 'Your event is tomorrow! Open Owambe to check your vendor contacts and runsheet.',
        data: { type: 'EVENT_REMINDER' },
      },
      trigger: { date: reminderTime },
    });
  }
}
