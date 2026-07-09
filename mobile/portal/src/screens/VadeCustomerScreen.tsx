import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { VadeAssignment, VadeNote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

export function VadeCustomerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params: { customerId: string } };
  const { customerId } = route.params;

  const [customer, setCustomer] = useState<any>(null);
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [classification, setClassification] = useState('');
  const [riskScore, setRiskScore] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const beginSaving = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const endSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };

  const loadData = async () => {
    try {
      const response = await adminApi.getVadeCustomer(customerId);
      setCustomer(response.customer || null);
      setNotes(response.notes || []);
      setAssignments(response.assignments || []);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Detay yuklenemedi.'));
    }
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  const addNote = async () => {
    if (savingRef.current) return;
    if (!noteContent.trim()) {
      Alert.alert('Eksik Bilgi', 'Not girin.');
      return;
    }
    if (!beginSaving()) return;
    try {
      await adminApi.createVadeNote({
        customerId,
        noteContent: noteContent.trim(),
        promiseDate: promiseDate || null,
      });
      setNoteContent('');
      setPromiseDate('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Not eklenemedi.'));
    } finally {
      endSaving();
    }
  };

  const saveClassification = async () => {
    if (savingRef.current) return;
    if (!classification.trim()) {
      Alert.alert('Eksik Bilgi', 'Sinif girin.');
      return;
    }
    if (!beginSaving()) return;
    try {
      await adminApi.upsertVadeClassification({
        customerId,
        classification: classification.trim(),
        riskScore: riskScore ? Number(riskScore) : undefined,
      });
      Alert.alert('Basarili', 'Sinif kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kayit basarisiz.'));
    } finally {
      endSaving();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.heroBackText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Tahsilat Takibi</Text>
          <Text style={styles.title}>Vade Cari Detayi</Text>
          <Text style={styles.subtitle}>{customer?.name || customer?.displayName || 'Cari kaydi'}</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Toplam</Text>
              <Text style={styles.heroMetricValue}>{customer?.totalBalance?.toFixed?.(0) ?? '-'} TL</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Not</Text>
              <Text style={styles.heroMetricValue}>{notes.length}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Atama</Text>
              <Text style={styles.heroMetricValue}>{assignments.length}</Text>
            </View>
          </View>
        </View>

        {customer && (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>{customer.name || customer.displayName || 'Cari'}</Text>
            <Text style={styles.cardMeta}>Kod: {customer.mikroCariCode || '-'}</Text>
            <Text style={styles.cardMeta}>Toplam: {customer.totalBalance?.toFixed?.(2) ?? '-'}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notlar</Text>
          {notes.map((note) => (
            <View key={note.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{note.noteContent}</Text>
              <Text style={styles.itemMeta}>Tarih: {note.createdAt?.slice?.(0, 10) || '-'}</Text>
              {note.promiseDate && <Text style={styles.itemMeta}>Vade: {note.promiseDate.slice(0, 10)}</Text>}
            </View>
          ))}
          {notes.length === 0 && <Text style={styles.helper}>Not yok.</Text>}
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Not"
            placeholderTextColor={colors.textMuted}
            value={noteContent}
            onChangeText={setNoteContent}
            multiline
          />
          <TextInput
            style={styles.input}
            placeholder="Soz tarihi (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
            value={promiseDate}
            onChangeText={setPromiseDate}
          />
          <TouchableOpacity style={[styles.secondaryButton, saving && styles.buttonDisabled]} onPress={addNote} disabled={saving}>
            <Text style={styles.secondaryButtonText}>{saving ? 'Kaydediliyor...' : 'Not Ekle'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Atamalar</Text>
          {assignments.map((assignment) => (
            <View key={assignment.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{assignment.staff?.name || 'Personel'}</Text>
              <Text style={styles.itemMeta}>{assignment.staff?.email || '-'}</Text>
            </View>
          ))}
          {assignments.length === 0 && <Text style={styles.helper}>Atama yok.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Siniflama</Text>
          <TextInput
            style={styles.input}
            placeholder="Sinif (A/B/C)"
            placeholderTextColor={colors.textMuted}
            value={classification}
            onChangeText={setClassification}
          />
          <TextInput
            style={styles.input}
            placeholder="Risk skoru"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={riskScore}
            onChangeText={setRiskScore}
          />
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={saveClassification} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
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
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  heroBackText: {
    fontFamily: fonts.semibold,
    color: '#BFDBFE',
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DCEAFE',
    lineHeight: 22,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
