import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { CollectionCard } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { resolveImageUrl } from '../utils/image';

export function CollectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCollections = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getActiveCollections();
      setCollections(response.collections || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Koleksiyonlar yuklenemedi.');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Koleksiyonlar</Text>
          <Text style={styles.subtitle}>Sizin icin hazirlanan urun gruplari.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : collections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aktif koleksiyon yok</Text>
            <Text style={styles.emptyText}>Yeni koleksiyonlar burada gorunecek.</Text>
          </View>
        ) : (
          collections.map((collection) => {
            const imageUrl = resolveImageUrl(collection.imageUrl);
            const card = (
              <View
                style={[
                  styles.collectionCard,
                  { backgroundColor: imageUrl ? 'transparent' : collection.color || colors.primary },
                ]}
              >
                <View style={styles.overlay} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{collection.title}</Text>
                  {!!collection.subtitle && <Text style={styles.cardSubtitle}>{collection.subtitle}</Text>}
                  <Text style={styles.cardButton}>Urunleri Gor</Text>
                </View>
              </View>
            );

            return (
              <TouchableOpacity
                key={collection.id}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('CollectionDetail', { collectionId: collection.id })}
              >
                {imageUrl ? (
                  <ImageBackground source={{ uri: imageUrl }} style={styles.imageBg} imageStyle={styles.imageRadius}>
                    {card}
                  </ImageBackground>
                ) : (
                  card
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textMuted },
  collectionCard: {
    minHeight: 160,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  imageBg: { minHeight: 160, borderRadius: radius.xl, overflow: 'hidden' },
  imageRadius: { borderRadius: radius.xl },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 42, 87, 0.58)',
  },
  cardContent: { gap: spacing.xs },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF' },
  cardSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#EAF1FF' },
  cardButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  error: { fontFamily: fonts.medium, color: colors.danger },
});
