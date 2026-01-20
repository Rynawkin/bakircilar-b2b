import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';

import { adminApi } from '../api/admin';
import { EInvoiceDocument } from '../types';
import { apiClient } from '../api/client';
import { getAuthToken } from '../storage/auth';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function EInvoicesScreen() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingBulk, setDownloadingBulk] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getEInvoices(search ? { search } : undefined);
      setDocuments(response.documents || []);
      setSelectedIds(new Set());
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
      multiple: true,
      type: 'application/pdf',
    });
    if (result.canceled || !result.assets?.length) return;

    const formData = new FormData();
    result.assets.forEach((asset) => {
      formData.append('files', {
        uri: asset.uri,
        name: asset.name || 'einvoice.pdf',
        type: asset.mimeType || 'application/pdf',
      } as any);
    });

    try {
      await adminApi.uploadEInvoices(formData);
      Alert.alert('Basarili', 'Dosya yuklendi.');
      await fetchDocuments();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Yukleme basarisiz.');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const downloadSingle = async (doc: EInvoiceDocument) => {
    if (!doc?.id) return;
    try {
      const token = await getAuthToken();
      const baseUrl = apiClient.defaults.baseURL || '';
      const fileName = `${doc.invoiceNo || doc.id}.pdf`;
      const directory = `${FileSystem.documentDirectory}einvoices/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const target = `${directory}${fileName}`;
      const result = await FileSystem.downloadAsync(
        `${baseUrl}/admin/einvoices/${doc.id}/download`,
        target,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert('Indirildi', `Dosya kaydedildi: ${result.uri}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'PDF indirilemedi.');
    }
  };

  const downloadSelected = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('Secim Yok', 'Once fatura secin.');
      return;
    }
    setDownloadingBulk(true);
    try {
      const token = await getAuthToken();
      const baseUrl = apiClient.defaults.baseURL || '';
      const response = await fetch(`${baseUrl}/admin/einvoices/bulk-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!response.ok) {
        throw new Error('Toplu indirme basarisiz.');
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const directory = `${FileSystem.documentDirectory}einvoices/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const target = `${directory}faturalar_${stamp}.zip`;
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target);
      } else {
        Alert.alert('Indirildi', `Dosya kaydedildi: ${target}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Toplu indirme basarisiz.');
    } finally {
      setDownloadingBulk(false);
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

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={upload}>
            <Text style={styles.primaryButtonText}>PDF Yukle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, selectedIds.size === 0 && styles.buttonDisabled]}
            onPress={downloadSelected}
            disabled={selectedIds.size === 0 || downloadingBulk}
          >
            <Text style={styles.secondaryButtonText}>
              {downloadingBulk ? 'Indiriliyor...' : 'Secilileri Indir'}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          documents.map((doc) => {
            const isSelected = selectedIds.has(doc.id);
            const canDownload = Boolean(doc.fileName);
            return (
              <View key={doc.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxActive,
                      !canDownload && styles.checkboxDisabled,
                    ]}
                    onPress={() => canDownload && toggleSelection(doc.id)}
                    disabled={!canDownload}
                  >
                    {isSelected && <Text style={styles.checkboxMark}>X</Text>}
                  </TouchableOpacity>
                  <View style={styles.cardHeaderInfo}>
                    <Text style={styles.cardTitle}>{doc.invoiceNo}</Text>
                    <Text style={styles.cardMeta}>
                      Cari: {doc.customerName || doc.customer?.name || doc.customer?.mikroCariCode || '-'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Tarih: {doc.issueDate?.slice?.(0, 10) || '-'}</Text>
                {doc.totalAmount !== undefined && (
                  <Text style={styles.cardMeta}>
                    Toplam: {doc.totalAmount.toFixed(2)} {doc.currency || 'TRY'}
                  </Text>
                )}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, !canDownload && styles.buttonDisabled]}
                    onPress={() => canDownload && downloadSingle(doc)}
                    disabled={!canDownload}
                  >
                    <Text style={styles.secondaryButtonText}>PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
  headerActions: {
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
    paddingHorizontal: spacing.md,
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
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
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
