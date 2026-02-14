import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type Supplier = {
  id: string;
  name: string;
  active: boolean;
  discount1?: number | null;
  discount2?: number | null;
  discount3?: number | null;
  discount4?: number | null;
  discount5?: number | null;
  priceIsNet?: boolean;
  priceIncludesVat?: boolean;
  priceByColor?: boolean;
  defaultVatRate?: number | null;
  excelSheetName?: string | null;
  excelHeaderRow?: number | null;
  excelCodeHeader?: string | null;
  excelNameHeader?: string | null;
  excelPriceHeader?: string | null;
  pdfPriceIndex?: number | null;
  pdfCodePattern?: string | null;
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export function SupplierPriceListSettingsScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '',
    active: true,
    discount1: '',
    discount2: '',
    discount3: '',
    discount4: '',
    discount5: '',
    priceIsNet: false,
    priceIncludesVat: false,
    priceByColor: false,
    defaultVatRate: '',
    excelSheetName: '',
    excelHeaderRow: '',
    excelCodeHeader: '',
    excelNameHeader: '',
    excelPriceHeader: '',
    pdfPriceIndex: '',
    pdfCodePattern: '',
  });

  const loadSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getSupplierPriceListSuppliers();
      setSuppliers(response.suppliers || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Tedarikciler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const resetForm = () => {
    setEditingSupplier(null);
    setForm({
      name: '',
      active: true,
      discount1: '',
      discount2: '',
      discount3: '',
      discount4: '',
      discount5: '',
      priceIsNet: false,
      priceIncludesVat: false,
      priceByColor: false,
      defaultVatRate: '',
      excelSheetName: '',
      excelHeaderRow: '',
      excelCodeHeader: '',
      excelNameHeader: '',
      excelPriceHeader: '',
      pdfPriceIndex: '',
      pdfCodePattern: '',
    });
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name || '',
      active: supplier.active ?? true,
      discount1: supplier.discount1?.toString() || '',
      discount2: supplier.discount2?.toString() || '',
      discount3: supplier.discount3?.toString() || '',
      discount4: supplier.discount4?.toString() || '',
      discount5: supplier.discount5?.toString() || '',
      priceIsNet: supplier.priceIsNet ?? false,
      priceIncludesVat: supplier.priceIncludesVat ?? false,
      priceByColor: supplier.priceByColor ?? false,
      defaultVatRate: supplier.defaultVatRate?.toString() || '',
      excelSheetName: supplier.excelSheetName || '',
      excelHeaderRow: supplier.excelHeaderRow?.toString() || '',
      excelCodeHeader: supplier.excelCodeHeader || '',
      excelNameHeader: supplier.excelNameHeader || '',
      excelPriceHeader: supplier.excelPriceHeader || '',
      pdfPriceIndex: supplier.pdfPriceIndex?.toString() || '',
      pdfCodePattern: supplier.pdfCodePattern || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const discountSummary = useMemo(() => {
    const values = [
      form.discount1,
      form.discount2,
      form.discount3,
      form.discount4,
      form.discount5,
    ]
      .map((value) => parseOptionalNumber(value))
      .filter((value): value is number => typeof value === 'number' && value > 0);
    if (!values.length) return form.priceIsNet ? 'Net' : 'Bos';
    return values.join('+');
  }, [form.discount1, form.discount2, form.discount3, form.discount4, form.discount5, form.priceIsNet]);

  const saveSupplier = async () => {
    if (!form.name.trim()) {
      Alert.alert('Bilgi', 'Tedarikci adi gerekli.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      active: form.active,
      discount1: parseOptionalNumber(form.discount1),
      discount2: parseOptionalNumber(form.discount2),
      discount3: parseOptionalNumber(form.discount3),
      discount4: parseOptionalNumber(form.discount4),
      discount5: parseOptionalNumber(form.discount5),
      priceIsNet: form.priceIsNet,
      priceIncludesVat: form.priceIncludesVat,
      priceByColor: form.priceByColor,
      defaultVatRate: parseOptionalNumber(form.defaultVatRate),
      excelSheetName: form.excelSheetName.trim() || null,
      excelHeaderRow: parseOptionalNumber(form.excelHeaderRow),
      excelCodeHeader: form.excelCodeHeader.trim() || null,
      excelNameHeader: form.excelNameHeader.trim() || null,
      excelPriceHeader: form.excelPriceHeader.trim() || null,
      pdfPriceIndex: parseOptionalNumber(form.pdfPriceIndex),
      pdfCodePattern: form.pdfCodePattern.trim() || null,
    };

    setSaving(true);
    try {
      if (editingSupplier) {
        await adminApi.updateSupplierPriceListSupplier(editingSupplier.id, payload);
      } else {
        await adminApi.createSupplierPriceListSupplier(payload);
      }
      closeModal();
      await loadSuppliers();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const buildSupplierSummary = (supplier: Supplier) => {
    const values = [
      supplier.discount1,
      supplier.discount2,
      supplier.discount3,
      supplier.discount4,
      supplier.discount5,
    ].filter((value): value is number => typeof value === 'number' && value > 0);
    if (!values.length) return supplier.priceIsNet ? 'Net' : 'Bos';
    return values.join('+');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Tedarikci Iskonto Ayarlari</Text>
              <Text style={styles.subtitle}>Tedarikci bazli iskonto ve dosya eslestirme ayarlari.</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={loadSuppliers}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={openCreate}>
                  <Text style={styles.primaryButtonText}>Yeni Tedarikci</Text>
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={item.active ? styles.badgeTextActive : styles.badgeTextInactive}>
                    {item.active ? 'Aktif' : 'Pasif'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>Iskonto: {buildSupplierSummary(item)}</Text>
              <Text style={styles.cardMeta}>Excel Sheet: {item.excelSheetName || '-'}</Text>
              <Text style={styles.cardMeta}>PDF Fiyat Kolonu: {item.pdfPriceIndex ?? '-'}</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openEdit(item)}>
                <Text style={styles.secondaryButtonText}>Duzenle</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Henuz tedarikci yok.</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {editingSupplier ? `Tedarikci Duzenle (${discountSummary})` : 'Yeni Tedarikci'}
            </Text>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <TextInput
                style={styles.input}
                placeholder="Tedarikci adi"
                placeholderTextColor={colors.textMuted}
                value={form.name}
                onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
              />
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleButton, form.active && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, active: true }))}
                >
                  <Text style={form.active ? styles.toggleTextActive : styles.toggleText}>Aktif</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, !form.active && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, active: false }))}
                >
                  <Text style={!form.active ? styles.toggleTextActive : styles.toggleText}>Pasif</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>Iskonto Kurallari</Text>
              <View style={styles.gridRow}>
                <TextInput
                  style={[styles.input, styles.gridInput]}
                  placeholder="Iskonto 1"
                  placeholderTextColor={colors.textMuted}
                  value={form.discount1}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, discount1: value }))}
                />
                <TextInput
                  style={[styles.input, styles.gridInput]}
                  placeholder="Iskonto 2"
                  placeholderTextColor={colors.textMuted}
                  value={form.discount2}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, discount2: value }))}
                />
              </View>
              <View style={styles.gridRow}>
                <TextInput
                  style={[styles.input, styles.gridInput]}
                  placeholder="Iskonto 3"
                  placeholderTextColor={colors.textMuted}
                  value={form.discount3}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, discount3: value }))}
                />
                <TextInput
                  style={[styles.input, styles.gridInput]}
                  placeholder="Iskonto 4"
                  placeholderTextColor={colors.textMuted}
                  value={form.discount4}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, discount4: value }))}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Iskonto 5"
                placeholderTextColor={colors.textMuted}
                value={form.discount5}
                onChangeText={(value) => setForm((prev) => ({ ...prev, discount5: value }))}
              />

              <Text style={styles.sectionTitle}>Fiyat Tipi</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleButton, form.priceIsNet && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, priceIsNet: !prev.priceIsNet }))}
                >
                  <Text style={form.priceIsNet ? styles.toggleTextActive : styles.toggleText}>Net Fiyat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, form.priceIncludesVat && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, priceIncludesVat: !prev.priceIncludesVat }))}
                >
                  <Text style={form.priceIncludesVat ? styles.toggleTextActive : styles.toggleText}>KDV Dahil</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.toggleButton, form.priceByColor && styles.toggleButtonActive]}
                onPress={() => setForm((prev) => ({ ...prev, priceByColor: !prev.priceByColor }))}
              >
                <Text style={form.priceByColor ? styles.toggleTextActive : styles.toggleText}>Renk Bazli Fiyat</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Varsayilan KDV Orani (0.20)"
                placeholderTextColor={colors.textMuted}
                value={form.defaultVatRate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, defaultVatRate: value }))}
              />

              <Text style={styles.sectionTitle}>Excel Eslestirme</Text>
              <TextInput
                style={styles.input}
                placeholder="Sheet adi"
                placeholderTextColor={colors.textMuted}
                value={form.excelSheetName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, excelSheetName: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Baslik satiri"
                placeholderTextColor={colors.textMuted}
                value={form.excelHeaderRow}
                onChangeText={(value) => setForm((prev) => ({ ...prev, excelHeaderRow: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Kod basligi"
                placeholderTextColor={colors.textMuted}
                value={form.excelCodeHeader}
                onChangeText={(value) => setForm((prev) => ({ ...prev, excelCodeHeader: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Urun adi basligi"
                placeholderTextColor={colors.textMuted}
                value={form.excelNameHeader}
                onChangeText={(value) => setForm((prev) => ({ ...prev, excelNameHeader: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Fiyat basligi"
                placeholderTextColor={colors.textMuted}
                value={form.excelPriceHeader}
                onChangeText={(value) => setForm((prev) => ({ ...prev, excelPriceHeader: value }))}
              />

              <Text style={styles.sectionTitle}>PDF Eslestirme</Text>
              <TextInput
                style={styles.input}
                placeholder="Fiyat kolon no"
                placeholderTextColor={colors.textMuted}
                value={form.pdfPriceIndex}
                onChangeText={(value) => setForm((prev) => ({ ...prev, pdfPriceIndex: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Kod regex (opsiyonel)"
                placeholderTextColor={colors.textMuted}
                value={form.pdfCodePattern}
                onChangeText={(value) => setForm((prev) => ({ ...prev, pdfCodePattern: value }))}
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={saveSupplier}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
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
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  badge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeInactive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  badgeTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#166534',
  },
  badgeTextInactive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#991B1B',
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  modalContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  toggleTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  sectionTitle: {
    marginTop: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridInput: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
