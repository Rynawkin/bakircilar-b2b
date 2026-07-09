import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { Campaign } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const CAMPAIGN_TYPES: Campaign['type'][] = ['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y'];
const typeLabels: Record<Campaign['type'], string> = {
  PERCENTAGE: 'Yuzde',
  FIXED_AMOUNT: 'Sabit',
  BUY_X_GET_Y: 'Al-X Kazan-Y',
};

export function CampaignsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Campaign['type']>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const fetchSeqRef = useRef(0);

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

  const fetchCampaigns = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const data = await adminApi.getCampaigns();
      if (requestSeq === fetchSeqRef.current) {
        setCampaigns(data || []);
      }
    } catch (err: any) {
      if (requestSeq === fetchSeqRef.current) {
        Alert.alert('Hata', getApiErrorMessage(err, 'Kampanyalar yuklenemedi.'));
      }
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setType('PERCENTAGE');
    setDiscountValue('');
    setStartDate('');
    setEndDate('');
    setActive(true);
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!name.trim()) {
      Alert.alert('Eksik Bilgi', 'Kampanya adi gerekli.');
      return;
    }
    if (!discountValue) {
      Alert.alert('Eksik Bilgi', 'Indirim degeri gerekli.');
      return;
    }
    if (!startDate || !endDate) {
      Alert.alert('Eksik Bilgi', 'Baslangic ve bitis tarihi gerekli.');
      return;
    }
    if (!beginSaving()) return;
    try {
      const payload = {
        name: name.trim(),
        type,
        discountValue: Number(discountValue),
        startDate,
        endDate,
        active,
      };
      if (editing) {
        await adminApi.updateCampaign(editing.id, payload);
      } else {
        await adminApi.createCampaign(payload);
      }
      resetForm();
      await fetchCampaigns();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kayit basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const handleEdit = (campaign: Campaign) => {
    setEditing(campaign);
    setName(campaign.name);
    setType(campaign.type);
    setDiscountValue(String(campaign.discountValue));
    setStartDate(campaign.startDate.slice(0, 10));
    setEndDate(campaign.endDate.slice(0, 10));
    setActive(campaign.active);
  };

  const handleDelete = async (id: string) => {
    if (!beginSaving()) return;
    try {
      await adminApi.deleteCampaign(id);
      await fetchCampaigns();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Silme basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const summary = useMemo(() => {
    const activeCount = campaigns.filter((item) => item.active).length;
    const percentCount = campaigns.filter((item) => item.type === 'PERCENTAGE').length;
    const fixedCount = campaigns.filter((item) => item.type === 'FIXED_AMOUNT').length;
    return {
      total: campaigns.length,
      active: activeCount,
      passive: campaigns.length - activeCount,
      percentOrFixed: percentCount + fixedCount,
    };
  }, [campaigns]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Vitrin ve Fiyat</Text>
              <Text style={styles.title}>Kampanyalar</Text>
              <Text style={styles.subtitle}>Indirim kampanyalarini mobilde web panelindeki operasyon diliyle yonetin.</Text>
            </View>
          </View>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Toplam</Text>
              <Text style={styles.heroMetricValue}>{summary.total}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Aktif</Text>
              <Text style={styles.heroMetricValue}>{summary.active}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Pasif</Text>
              <Text style={styles.heroMetricValue}>{summary.passive}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Fiyat Tipi</Text>
              <Text style={styles.heroMetricValue}>{summary.percentOrFixed}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : campaigns.length === 0 ? (
          <Text style={styles.emptyText}>Kampanya yok.</Text>
        ) : (
          <View style={[styles.campaignGrid, isWide && styles.campaignGridWide]}>
            {campaigns.map((campaign) => (
          <View key={campaign.id} style={[styles.card, isWide && styles.campaignCardWide]}>
            <View style={styles.cardTop}>
              <View style={styles.flexText}>
                <Text style={styles.cardTitle} numberOfLines={2}>{campaign.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Tip: {typeLabels[campaign.type] || campaign.type}</Text>
              </View>
              <Text style={[styles.statusPill, campaign.active ? styles.statusActive : styles.statusPassive]}>
                {campaign.active ? 'Aktif' : 'Pasif'}
              </Text>
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>Deger: {campaign.discountValue}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>{campaign.startDate?.slice(0, 10)} - {campaign.endDate?.slice(0, 10)}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.secondaryButton, saving && styles.buttonDisabled]} onPress={() => handleEdit(campaign)} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Duzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dangerButton, saving && styles.buttonDisabled]} onPress={() => handleDelete(campaign.id)} disabled={saving}>
                <Text style={styles.dangerButtonText}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={1}>{editing ? 'Kampanya Duzenle' : 'Yeni Kampanya'}</Text>
          <TextInput
            style={styles.input}
            placeholder="Kampanya adi"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <View style={styles.row}>
            {CAMPAIGN_TYPES.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentButton, type === option && styles.segmentButtonActive]}
                onPress={() => setType(option)}
              >
                <Text style={type === option ? styles.segmentTextActive : styles.segmentText}>{typeLabels[option] || option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Indirim degeri"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={discountValue}
            onChangeText={setDiscountValue}
          />
          <TextInput
            style={styles.input}
            placeholder="Baslangic (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
            value={startDate}
            onChangeText={setStartDate}
          />
          <TextInput
            style={styles.input}
            placeholder="Bitis (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
            value={endDate}
            onChangeText={setEndDate}
          />
          <TouchableOpacity
            style={[styles.segmentButton, active && styles.segmentButtonActive]}
            onPress={() => setActive((prev) => !prev)}
          >
            <Text style={active ? styles.segmentTextActive : styles.segmentText}>{active ? 'Aktif' : 'Pasif'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : editing ? 'Guncelle' : 'Kaydet'}</Text>
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity style={[styles.secondaryButton, saving && styles.buttonDisabled]} onPress={resetForm} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Iptal</Text>
            </TouchableOpacity>
          )}
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start' },
  heroText: { flex: 1, minWidth: 240, gap: spacing.xs },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DDE8FF',
    lineHeight: 22,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMetric: {
    flex: 1,
    minWidth: 118,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  heroMetricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  campaignGrid: { gap: spacing.md },
  campaignGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  campaignCardWide: { width: '48.7%' },
  cardTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flexText: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  loading: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
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
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
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
    flexGrow: 1,
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
  dangerButton: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
  },
  dangerButtonText: {
    fontFamily: fonts.semibold,
    color: colors.danger,
  },
  statusPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
  },
  statusActive: { backgroundColor: colors.successSoft, color: colors.success },
  statusPassive: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  buttonDisabled: {
    opacity: 0.6,
  },
});
