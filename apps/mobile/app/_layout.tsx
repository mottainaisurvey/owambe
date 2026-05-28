import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/store/auth.store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const { hydrate, hydrated } = useAuthStore();

  useEffect(() => {
    hydrate().then(() => SplashScreen.hideAsync());
  }, []);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(vendor)" options={{ headerShown: false }} />
          <Stack.Screen name="vendor/[slug]" options={{
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="ticket/[qr]" options={{
            headerShown: true,
            headerTitle: 'My Ticket',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="booking/[id]" options={{
            headerShown: true,
            headerTitle: 'Booking',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="browse-events" options={{ headerShown: false }} />
          <Stack.Screen name="events" options={{
            headerShown: true,
            headerTitle: 'My Events',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="event/[id]" options={{
            headerShown: true,
            headerTitle: 'Event Details',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="analytics" options={{
            headerShown: true,
            headerTitle: 'Analytics',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="checkin" options={{
            headerShown: true,
            headerTitle: 'Check-in Scanner',
            headerBackTitle: 'Back',
          }} />
          <Stack.Screen name="dayof" options={{
            headerShown: true,
            headerTitle: 'Day-of Tools',
            headerBackTitle: 'Back',
          }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
