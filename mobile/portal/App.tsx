import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from '@expo-google-fonts/hanken-grotesk/useFonts';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';
import { HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk/800ExtraBold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { RoleMismatchScreen } from './src/screens/RoleMismatchScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AuthGate() {
  const { user, bootstrapping, signOut } = useAuth();

  if (bootstrapping) {
    return (
      <SafeAreaView style={styles.loading}>
        <View style={styles.loadingCard}>
          <Image source={require('./assets/icon.png')} style={styles.loadingLogo} />
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Portal hazirlaniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (user && user.role === 'CUSTOMER') {
    return <RoleMismatchScreen onSignOut={signOut} />;
  }

  return user ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 3500);
    return () => clearTimeout(timeout);
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaView style={styles.loading}>
        <View style={styles.loadingCard}>
          <Image source={require('./assets/icon.png')} style={styles.loadingLogo} />
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Portal yukleniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <NotificationProvider>
          <StatusBar style="light" />
          <AuthGate />
        </NotificationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingCard: {
    minWidth: 190,
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.backgroundRaised,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    shadowColor: '#020713',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  loadingLogo: {
    width: 58,
    height: 58,
    resizeMode: 'contain',
  },
  loadingText: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 12,
    color: colors.text,
  },
});
