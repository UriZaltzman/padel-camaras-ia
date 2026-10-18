import '../i18n';

import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { theme } from '@app/ui/tokens';

import { SessionProvider, useSession } from '../auth/session';
import { fontAssets } from '../theme/fonts';

void SplashScreen.preventAutoHideAsync();

/** Sends signed-out users to sign-in and signed-in users away from it. */
function AuthGate() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const onSignIn = segments[0] === 'sign-in';
    if (status === 'signedOut' && !onSignIn) router.replace('/sign-in');
    if (status === 'signedIn' && onSignIn) router.replace('/');
  }, [status, segments, router]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <AuthGate />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.light.background },
        }}
      />
    </SessionProvider>
  );
}
