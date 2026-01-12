import { useEffect, useState } from 'react';
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

  const loadData = async () => {
    try {
      const response = await adminApi.getVadeCustomer(customerId);
      setCustomer(response.customer || null);
      setNotes(response.notes || []);
      setAssignments(response.assignments || []);
    } catch (err) {
      Alert.alert('Hata', 'Detay yuklenemedi.');
    }
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  const addNote = async () => {
    if (!noteContent.trim()) {
      Alert.alert('Eksik Bilgi', 'Not girin.');
      return;
    }
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
      Alert.alert('Hata', err?.response?.data?.error || 'Not eklenemedi.');
    }
  };

  const saveClassification = async () => {
    if (!classification.trim()) {
      Alert.alert('Eksik Bilgi', 'Sinif girin.');
      return;
    }
    try {
      await adminApi.upsertVadeClassification({
        customerId,
        classification: classification.trim(),
        riskScore: riskScore ? Number(riskScore) : undefined,
      });
      Alert.alert('Basarili', 'Sinif kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Vade Cari Detayi</Text>

        {customer && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{customer.name || customer.displayName || 'Cari'}</Text>
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
          <TouchableOpacity style={styles.secondaryButton} onPress={addNote}>
            <Text style={styles.secondaryButtonText}>Not Ekle</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={saveClassification}>
            <Text style={styles.primaryButtonText}>Kaydet</Text>
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
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
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
});
