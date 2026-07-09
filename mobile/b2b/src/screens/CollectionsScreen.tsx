import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { CollectionCard } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { resolveImageUrl } from '../utils/image';

export function CollectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
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
      setError(getApiErrorMessage(err, 'Koleksiyonlar yuklenemedi.'));
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
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Katalog Secimleri</Text>
          <Text style={styles.heroTitle}>Koleksiyonlar</Text>
          <Text style={styles.heroSubtitle}>Sizin icin hazirlanan urun gruplarini tek dokunusla acin.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{collections.length}</Text>
              <Text style={styles.heroMetricLabel}>Aktif Koleksiyon</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{isWide ? 'Tablet' : 'Mobil'}</Text>
              <Text style={styles.heroMetricLabel}>Gorunum</Text>
            </View>
          </View>
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
          <View style={[styles.collectionGrid, isWide && styles.collectionGridWide]}>
          {collections.map((collection) => {
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
                  <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{collection.title}</Text>
                  {!!collection.subtitle && (
                    <Text style={styles.cardSubtitle} numberOfLines={2} ellipsizeMode="tail">
                      {collection.subtitle}
                    </Text>
                  )}
                  <Text style={styles.cardButton}>Urunleri Gor</Text>
                </View>
              </View>
            );

            return (
              <TouchableOpacity
                key={collection.id}
                activeOpacity={0.9}
                style={isWide ? styles.collectionGridItem : undefined}
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
          })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#173D78',
    shadowColor: '#071B3A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 132,
    minWidth: 118,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  collectionGrid: { gap: spacing.md },
  collectionGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  collectionGridItem: { flexGrow: 1, flexBasis: 320, maxWidth: '48%' },
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
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xl, lineHeight: fontSizes.xl + 6, color: '#FFFFFF' },
  cardSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: '#EAF1FF' },
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
