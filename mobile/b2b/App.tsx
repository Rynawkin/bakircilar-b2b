import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  useFonts,
} from '@expo-google-fonts/sora';

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
          <Text style={styles.loadingText}>B2B hazirlaniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (user && user.role !== 'CUSTOMER') {
    return <RoleMismatchScreen onSignOut={signOut} />;
  }

  return user ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
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
          <Text style={styles.loadingText}>B2B yukleniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <NotificationProvider>
          <StatusBar style="dark" />
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.1,
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
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
    color: colors.text,
  },
});
