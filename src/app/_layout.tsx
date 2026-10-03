import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { ServiceProvider } from '@/services/ServiceProvider';
import { JourneyProvider } from '@/hooks/useJourney';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { LoadingState } from '@/components';
import { installGlobalErrorHandlers } from '@/core/errors';
import { logger } from '@/core/logging';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
installGlobalErrorHandlers();
logger.info('app start');

/** Catches render errors anywhere below the root (including service/config failures). */
export { ErrorFallback as ErrorBoundary } from '@/components';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ServiceProvider>
        <JourneyProvider
          signIn={(onSignedIn) => <SignInScreen onSignedIn={onSignedIn} />}
          fallback={
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
              <LoadingState label="Preparing your journey…" />
            </View>
          }
        >
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="+not-found" options={{ presentation: 'modal' }} />
          </Stack>
        </JourneyProvider>
      </ServiceProvider>
    </SafeAreaProvider>
  );
}
