import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { adminApi } from '../api/admin';
import { EInvoiceDocument } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function EInvoicesScreen() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getEInvoices(search ? { search } : undefined);
      setDocuments(response.documents || []);
    } catch (err) {
      Alert.alert('Hata', 'E-fatura listesi yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const upload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.name || 'einvoices.xlsx',
      type: asset.mimeType || 'application/octet-stream',
    } as any);

    try {
      await adminApi.uploadEInvoices(formData);
      Alert.alert('Basarili', 'Dosya yuklendi.');
      await fetchDocuments();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Yukleme basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>E-Faturalar</Text>
        <Text style={styles.subtitle}>PDF listesi ve yukleme.</Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Fatura ara"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={fetchDocuments}
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={fetchDocuments}>
            <Text style={styles.secondaryButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={upload}>
          <Text style={styles.primaryButtonText}>PDF Yukle</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          documents.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={styles.card}
              onPress={() => doc.documentUrl && Linking.openURL(doc.documentUrl)}
            >
              <Text style={styles.cardTitle}>{doc.invoiceNo}</Text>
              <Text style={styles.cardMeta}>Cari: {doc.customer?.name || doc.customer?.mikroCariCode || '-'}</Text>
              <Text style={styles.cardMeta}>Tarih: {doc.createdAt?.slice?.(0, 10) || '-'}</Text>
            </TouchableOpacity>
          ))
        )}
        {!loading && documents.length === 0 && (
          <Text style={styles.emptyText}>Kayit yok.</Text>
        )}
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
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
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
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
