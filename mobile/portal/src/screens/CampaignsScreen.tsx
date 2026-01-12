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

import { adminApi } from '../api/admin';
import { Campaign } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const CAMPAIGN_TYPES: Campaign['type'][] = ['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y'];

export function CampaignsScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Campaign['type']>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);

  const fetchCampaigns = async () => {
    try {
      const data = await adminApi.getCampaigns();
      setCampaigns(data || []);
    } catch (err) {
      Alert.alert('Hata', 'Kampanyalar yuklenemedi.');
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
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
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
    try {
      await adminApi.deleteCampaign(id);
      await fetchCampaigns();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Silme basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Kampanyalar</Text>
        <Text style={styles.subtitle}>Indirim kampanyalari listesi.</Text>

        {campaigns.map((campaign) => (
          <View key={campaign.id} style={styles.card}>
            <Text style={styles.cardTitle}>{campaign.name}</Text>
            <Text style={styles.cardMeta}>Tip: {campaign.type}</Text>
            <Text style={styles.cardMeta}>Deger: {campaign.discountValue}</Text>
            <Text style={styles.cardMeta}>Aktif: {campaign.active ? 'Evet' : 'Hayir'}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleEdit(campaign)}>
                <Text style={styles.secondaryButtonText}>Duzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleDelete(campaign.id)}>
                <Text style={styles.secondaryButtonText}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editing ? 'Kampanya Duzenle' : 'Yeni Kampanya'}</Text>
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
                <Text style={type === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
            <Text style={styles.primaryButtonText}>{editing ? 'Guncelle' : 'Kaydet'}</Text>
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
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
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
