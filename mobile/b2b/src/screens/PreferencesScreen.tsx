import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { savePushToken } from '../storage/push';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { NotificationPreference } from '../types';
import { getApiErrorMessage } from '../utils/errors';
import { inferDeviceName, inferPlatform, registerPushToken } from '../utils/pushNotifications';

type PushStatus = 'checking' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

export function PreferencesScreen() {
  const { user, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [vatPref, setVatPref] = useState<'WITH_VAT' | 'WITHOUT_VAT'>(
    user?.vatDisplayPreference || 'WITH_VAT'
  );
  const [saving, setSaving] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSavingKey, setNotificationSavingKey] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking');
  const [pushSaving, setPushSaving] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const savingRef = useRef(false);
  const notificationSavingKeyRef = useRef<string | null>(null);
  const pushSavingRef = useRef(false);
  const pushTestingRef = useRef(false);
  const notificationSeqRef = useRef(0);
  const pushStatusSeqRef = useRef(0);
  const isTablet = width >= 860;
  const contentWidth = Math.min(width, 1120) - spacing.xl * 2;
  const cardWidth = isTablet ? Math.floor((contentWidth - spacing.md) / 2) : undefined;

  useEffect(() => {
    if (user?.vatDisplayPreference) {
      setVatPref(user.vatDisplayPreference);
    }
  }, [user?.vatDisplayPreference]);

  const loadNotificationPreferences = async () => {
    const requestSeq = ++notificationSeqRef.current;
    setNotificationLoading(true);
    try {
      const response = await customerApi.getNotificationPreferences();
      if (requestSeq !== notificationSeqRef.current) return;
      setNotificationPreferences(response.categories || []);
    } catch (err: any) {
      if (requestSeq !== notificationSeqRef.current) return;
      Alert.alert('Bildirim Tercihleri', getApiErrorMessage(err, 'Bildirim tercihleri yuklenemedi.'));
      setNotificationPreferences([]);
    } finally {
      if (requestSeq === notificationSeqRef.current) setNotificationLoading(false);
    }
  };

  const refreshPushStatus = async () => {
    const requestSeq = ++pushStatusSeqRef.current;
    if (!Device.isDevice) {
      setPushStatus('unavailable');
      return;
    }
    setPushStatus('checking');
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (requestSeq !== pushStatusSeqRef.current) return;
      setPushStatus(permissions.status as PushStatus);
    } catch {
      if (requestSeq !== pushStatusSeqRef.current) return;
      setPushStatus('undetermined');
    }
  };

  useEffect(() => {
    loadNotificationPreferences();
    refreshPushStatus();
  }, []);

  const updatePreference = async (value: 'WITH_VAT' | 'WITHOUT_VAT') => {
    if (savingRef.current) return;
    savingRef.current = true;
    setVatPref(value);
    setSaving(true);
    try {
      await customerApi.updateSettings({ vatDisplayPreference: value });
      await refresh();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleNotificationPreference = async (key: string, enabled: boolean) => {
    if (notificationSavingKeyRef.current) return;
    notificationSavingKeyRef.current = key;
    const previous = notificationPreferences;
    const next = previous.map((item) => (item.key === key ? { ...item, enabled } : item));
    setNotificationPreferences(next);
    setNotificationSavingKey(key);
    try {
      const response = await customerApi.updateNotificationPreferences(
        next.map((item) => ({ category: item.key, enabled: item.enabled }))
      );
      setNotificationPreferences(response.categories || next);
    } catch (err: any) {
      setNotificationPreferences(previous);
      Alert.alert('Bildirim Tercihleri', getApiErrorMessage(err, 'Bildirim tercihi kaydedilemedi.'));
    } finally {
      notificationSavingKeyRef.current = null;
      setNotificationSavingKey(null);
    }
  };

  const enablePushNotifications = async () => {
    if (pushSavingRef.current) return;
    pushSavingRef.current = true;
    setPushSaving(true);
    try {
      const token = await registerPushToken();
      await refreshPushStatus();
      if (!token) {
        Alert.alert('Bildirimler', 'Bildirim izni verilemedi veya cihaz push desteklemiyor.');
        return;
      }
      await customerApi.registerPushToken({
        token,
        platform: inferPlatform(),
        appName: 'b2b',
        deviceName: inferDeviceName() || undefined,
      });
      await savePushToken(token);
      setPushStatus('granted');
      Alert.alert('Bildirimler', 'Bildirimler bu cihaz icin acildi.');
    } catch (err: any) {
      Alert.alert('Bildirimler', getApiErrorMessage(err, 'Bildirim acilamadi.'));
    } finally {
      pushSavingRef.current = false;
      setPushSaving(false);
    }
  };

  const sendTestPush = async () => {
    if (pushTestingRef.current) return;
    pushTestingRef.current = true;
    setPushTesting(true);
    try {
      await customerApi.sendTestPush({
        title: 'Bakircilar B2B',
        body: 'Test bildirimi basariyla ulasti.',
        linkUrl: '/notifications',
      });
      Alert.alert('Test bildirimi', 'Test bildirimi gonderildi.');
    } catch (err: any) {
      Alert.alert('Test bildirimi', getApiErrorMessage(err, 'Test bildirimi gonderilemedi.'));
    } finally {
      pushTestingRef.current = false;
      setPushTesting(false);
    }
  };

  const pushStatusLabel = () => {
    if (pushStatus === 'granted') return 'Acik';
    if (pushStatus === 'denied') return 'Kapali';
    if (pushStatus === 'unavailable') return 'Bu cihazda yok';
    if (pushStatus === 'checking') return 'Kontrol ediliyor';
    return 'Izin bekliyor';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Hesap Ayarlari</Text>
          <Text style={styles.heroTitle}>Tercihler</Text>
          <Text style={styles.heroSubtitle}>Fiyat gorunumu ve bildirim kategorilerini yonetin.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{vatPref === 'WITH_VAT' ? 'KDV Dahil' : 'KDV Haric'}</Text>
              <Text style={styles.heroMetricLabel}>Fiyat</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{pushStatusLabel()}</Text>
              <Text style={styles.heroMetricLabel}>Push</Text>
            </View>
          </View>
        </View>

        <View style={[styles.contentGrid, isTablet && styles.contentGridTablet]}>
        <View style={[styles.card, cardWidth ? { width: cardWidth } : null]}>
          <Text style={styles.label}>KDV Gorunumu</Text>
          <Text style={styles.helperText}>Faturali fiyatlarda KDV dahil/haric gorunumu.</Text>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, vatPref === 'WITH_VAT' && styles.segmentActive]}
              onPress={() => updatePreference('WITH_VAT')}
              disabled={saving}
            >
              <Text
                style={[
                  styles.segmentText,
                  vatPref === 'WITH_VAT' && styles.segmentTextActive,
                ]}
              >
                KDV Dahil
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, vatPref === 'WITHOUT_VAT' && styles.segmentActive]}
              onPress={() => updatePreference('WITHOUT_VAT')}
              disabled={saving}
            >
              <Text
                style={[
                  styles.segmentText,
                  vatPref === 'WITHOUT_VAT' && styles.segmentTextActive,
                ]}
              >
                KDV Haric
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, cardWidth ? { width: cardWidth } : null]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Bildirimler</Text>
              <Text style={styles.helperText}>Kategori bazli tarayici ve uygulama bildirimleri.</Text>
            </View>
            {notificationLoading && <ActivityIndicator color={colors.primary} />}
          </View>

          <View style={styles.pushBox}>
            <View style={styles.pushHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pushTitle}>Bu cihazda push bildirimi</Text>
                <Text style={styles.helperText}>Durum: {pushStatusLabel()}</Text>
              </View>
              {pushStatus === 'checking' ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
            <View style={styles.pushActions}>
              <TouchableOpacity
                style={[styles.pushButton, pushStatus === 'granted' && styles.pushButtonActive]}
                onPress={enablePushNotifications}
                disabled={pushSaving || pushStatus === 'checking'}
              >
                <Text style={[styles.pushButtonText, pushStatus === 'granted' && styles.pushButtonTextActive]}>
                  {pushSaving ? 'Aciliyor...' : pushStatus === 'granted' ? 'Tekrar Kaydet' : 'Bildirimleri Ac'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pushButton, pushStatus !== 'granted' && styles.pushButtonDisabled]}
                onPress={sendTestPush}
                disabled={pushTesting || pushStatus !== 'granted'}
              >
                <Text style={styles.pushButtonText}>{pushTesting ? 'Gonderiliyor...' : 'Test Gonder'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!notificationLoading && notificationPreferences.length === 0 ? (
            <Text style={styles.emptyText}>Bildirim kategorisi bulunamadi.</Text>
          ) : (
            notificationPreferences.map((item) => (
              <View key={item.key} style={styles.preferenceRow}>
                <View style={styles.preferenceTextWrap}>
                  <Text style={styles.preferenceTitle}>{item.label}</Text>
                  <Text style={styles.preferenceKey}>{item.key}</Text>
                </View>
                <Switch
                  value={item.enabled}
                  disabled={notificationSavingKey === item.key}
                  onValueChange={(value) => toggleNotificationPreference(item.key, value)}
                  trackColor={{ false: '#D8E2F5', true: '#9CB8F8' }}
                  thumbColor={item.enabled ? colors.primary : '#FFFFFF'}
                />
              </View>
            ))
          )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  containerTablet: {
    maxWidth: 1120,
    alignSelf: 'center',
    width: '100%',
  },
  contentGrid: {
    gap: spacing.md,
  },
  contentGridTablet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 116,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  helperText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  pushBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pushHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pushTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  pushActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pushButton: {
    flexGrow: 1,
    minWidth: 132,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pushButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pushButtonDisabled: {
    opacity: 0.55,
  },
  pushButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  pushButtonTextActive: {
    color: '#FFFFFF',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  preferenceTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  preferenceTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  preferenceKey: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
