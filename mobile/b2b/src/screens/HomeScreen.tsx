import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ActiveGiftCampaign, Banner, CollectionCard, GiftCampaignGift } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { trackCustomerActivity } from '../utils/activity';
import { getApiErrorMessage } from '../utils/errors';
import { resolveImageUrl } from '../utils/image';

const formatCurrency = (value?: number | null) =>
  `${Number(value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ orders: 0, requests: 0, cartItems: 0 });
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [giftCampaign, setGiftCampaign] = useState<ActiveGiftCampaign | null>(null);

  const horizontalPadding = spacing.xl * 2;
  const availableWidth = Math.max(320, width - horizontalPadding);
  const isTablet = width >= 820;
  const statColumns = width >= 760 ? 3 : width >= 540 ? 2 : 1;
  const actionColumns = width >= 960 ? 3 : width >= 620 ? 2 : 1;
  const statCardWidth =
    statColumns > 1 ? Math.floor((availableWidth - spacing.md * (statColumns - 1)) / statColumns) : undefined;
  const actionCardWidth =
    actionColumns > 1 ? Math.floor((availableWidth - spacing.md * (actionColumns - 1)) / actionColumns) : undefined;
  const bannerCardWidth = Math.min(Math.max(width - horizontalPadding - spacing.md, 286), isTablet ? 430 : 330);
  const giftItemWidth = isTablet ? 132 : 112;

  const loadSummary = async () => {
    setLoading(true);
    try {
      const [orders, requests, cart, collectionResult, bannerResult, campaignResult] = await Promise.all([
        customerApi.getOrders({ page: 1, pageSize: 20 }),
        customerApi.getOrderRequests(),
        customerApi.getCart(),
        customerApi.getActiveCollections().catch(() => ({ collections: [] as CollectionCard[] })),
        customerApi.getBanners().catch(() => ({ banners: [] as Banner[] })),
        customerApi.getActiveGiftCampaign().catch(() => null),
      ]);
      setSummary({
        orders: orders.pagination?.total ?? orders.orders?.length ?? 0,
        requests: requests.requests?.length || 0,
        cartItems: cart.items?.length || 0,
      });
      setCollections((collectionResult.collections || []).slice(0, 3));
      setBanners((bannerResult.banners || []).filter((item) => item.position === 'HERO' || item.position === 'STRIP').slice(0, 5));
      setGiftCampaign(campaignResult?.active ? campaignResult : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleBannerPress = async (banner: Banner) => {
    trackCustomerActivity({
      type: 'CLICK',
      pagePath: 'Home',
      pageTitle: 'Ana Sayfa',
      meta: { bannerId: banner.id, position: banner.position, productCode: banner.productCode || null },
    });

    const code = String(banner.productCode || '').trim();
    if (!code) return;

    try {
      const result = await customerApi.getProducts({ search: code, limit: 1 });
      const product = (result.products || []).find((item) => item.mikroCode === code) || result.products?.[0];
      if (product?.id) {
        navigation.navigate('ProductDetail', { productId: product.id });
      } else {
        Alert.alert('Urun Bulunamadi', 'Banner urunu su anda katalogda gorunmuyor.');
      }
    } catch (err: any) {
      Alert.alert('Urun Acilamadi', getApiErrorMessage(err, 'Urun detayi acilamadi.'));
    }
  };

  const handleGiftCampaignPress = () => {
    const qualified = !!giftCampaign?.qualified;
    trackCustomerActivity({
      type: 'CLICK',
      pagePath: 'Home',
      pageTitle: 'Ana Sayfa',
      meta: { campaignId: giftCampaign?.id || null, position: 'GIFT_CAMPAIGN', qualified },
    });
    navigation.navigate('Tabs', { screen: qualified ? 'Cart' : 'Products' });
  };

  const handleGiftPress = (gift: GiftCampaignGift) => {
    trackCustomerActivity({
      type: 'CLICK',
      pagePath: 'Home',
      pageTitle: 'Ana Sayfa',
      meta: { campaignId: giftCampaign?.id || null, giftProductId: gift.productId, position: 'GIFT_CAMPAIGN_GIFT' },
    });
    navigation.navigate('ProductDetail', { productId: gift.productId });
  };

  const renderGiftCampaign = () => {
    if (!giftCampaign?.active) return null;

    const imageUrl = resolveImageUrl(giftCampaign.mobileBannerImageUrl || giftCampaign.bannerImageUrl || undefined);
    const threshold = Number(giftCampaign.threshold || 0);
    const qualifyingTotal = Number(giftCampaign.qualifyingTotal || 0);
    const progress = threshold > 0 ? Math.min(100, Math.max(0, (qualifyingTotal / threshold) * 100)) : 0;
    const remaining = Number(giftCampaign.remaining || 0);
    const gifts = (giftCampaign.gifts || []).slice(0, 4);
    const qualified = !!giftCampaign.qualified;

    return (
      <TouchableOpacity activeOpacity={0.92} style={styles.giftCard} onPress={handleGiftCampaignPress}>
        {imageUrl ? (
          <ImageBackground source={{ uri: imageUrl }} style={styles.giftHero} imageStyle={styles.giftHeroImage}>
            <View style={styles.giftOverlay} />
            <View style={styles.giftHeroContent}>
              <Text style={styles.giftEyebrow}>Hediye Kampanyasi</Text>
              <Text style={styles.giftTitle} numberOfLines={2}>{giftCampaign.title || 'Sepete hediye firsati'}</Text>
              {!!giftCampaign.subtitle && <Text style={styles.giftSubtitle} numberOfLines={2}>{giftCampaign.subtitle}</Text>}
            </View>
          </ImageBackground>
        ) : (
          <View style={[styles.giftHero, styles.giftHeroPlain]}>
            <Text style={styles.giftEyebrow}>Hediye Kampanyasi</Text>
            <Text style={styles.giftTitle} numberOfLines={2}>{giftCampaign.title || 'Sepete hediye firsati'}</Text>
            {!!giftCampaign.subtitle && <Text style={styles.giftSubtitle} numberOfLines={2}>{giftCampaign.subtitle}</Text>}
          </View>
        )}

        <View style={styles.giftBody}>
          <View style={styles.giftProgressHeader}>
            <Text style={styles.giftProgressLabel}>Sepet toplami</Text>
            <Text style={styles.giftProgressValue}>{formatCurrency(qualifyingTotal)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={[styles.giftStatus, qualified ? styles.giftStatusQualified : null]}>
            {qualified
              ? `Hediye secimine hazir. ${giftCampaign.giftPickCount || 1} urun secilebilir.`
              : `${formatCurrency(remaining)} daha ekle, hediyeni sec.`}
          </Text>

          {gifts.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.giftRow}>
              {gifts.map((gift) => {
                const giftImage = resolveImageUrl(gift.imageUrl || undefined);
                return (
                  <TouchableOpacity
                    key={gift.productId}
                    activeOpacity={0.9}
                    style={[styles.giftItem, { width: giftItemWidth }]}
                    onPress={() => handleGiftPress(gift)}
                  >
                    {giftImage ? (
                      <Image source={{ uri: giftImage }} style={styles.giftImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.giftImage, styles.giftImageFallback]}>
                        <Text style={styles.giftImageFallbackText}>H</Text>
                      </View>
                    )}
                    <Text style={styles.giftName} numberOfLines={2}>{gift.name}</Text>
                    <Text style={styles.giftMeta}>{gift.giftQuantity} {gift.unit || 'adet'}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <Text style={styles.giftButton}>{qualified ? 'Sepette hediyeni sec' : (giftCampaign.buttonText || 'Urunlere git')}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.kicker}>Hos geldin</Text>
              <Text style={styles.title} numberOfLines={2}>{user?.name || 'B2B Musterisi'}</Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="storefront-outline" size={22} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>Size ozel fiyatlar, kampanyalar ve siparisler tek panelde.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{summary.cartItems}</Text>
              <Text style={styles.heroMetricLabel}>Sepet</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{summary.orders}</Text>
              <Text style={styles.heroMetricLabel}>Siparis</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{collections.length}</Text>
              <Text style={styles.heroMetricLabel}>Vitrin</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={[styles.statGrid, statColumns > 1 && styles.cardGrid]}>
            <View style={[styles.card, statCardWidth ? { width: statCardWidth } : null]}>
              <Text style={styles.cardLabel}>Siparisler</Text>
              <Text style={styles.cardValue}>{summary.orders}</Text>
            </View>
            <View style={[styles.card, styles.cardTintBlue, statCardWidth ? { width: statCardWidth } : null]}>
              <Text style={styles.cardLabel}>Talepler</Text>
              <Text style={styles.cardValue}>{summary.requests}</Text>
            </View>
            <View style={[styles.card, styles.cardTintAmber, statCardWidth ? { width: statCardWidth } : null]}>
              <Text style={styles.cardLabel}>Sepette</Text>
              <Text style={styles.cardValue}>{summary.cartItems}</Text>
            </View>
          </View>
        )}

        {banners.length > 0 && (
          <View style={styles.bannerSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Vitrin</Text>
              <Text style={styles.sectionSubtitle}>Guncel duyuru ve kampanyalar</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bannerRow}>
              {banners.map((banner) => {
                const imageUrl = resolveImageUrl(banner.mobileImageUrl || banner.imageUrl);
                const content = (
                  <View style={styles.bannerCardInner}>
                    <View style={styles.bannerOverlay} />
                    <View style={styles.bannerContent}>
                      <Text style={styles.bannerTitle} numberOfLines={2}>{banner.title}</Text>
                      {!!banner.subtitle && <Text style={styles.bannerSubtitle} numberOfLines={2}>{banner.subtitle}</Text>}
                      <Text style={styles.bannerButton}>{banner.buttonText || 'Incele'}</Text>
                    </View>
                  </View>
                );

                return (
                  <TouchableOpacity
                    key={banner.id}
                    activeOpacity={0.9}
                    style={[styles.bannerCard, { width: bannerCardWidth }]}
                    onPress={() => handleBannerPress(banner)}
                  >
                    {imageUrl ? (
                      <ImageBackground source={{ uri: imageUrl }} style={styles.bannerImage} imageStyle={styles.bannerImageRadius}>
                        {content}
                      </ImageBackground>
                    ) : (
                      <View style={[styles.bannerImage, { backgroundColor: colors.primary }]}>
                        {content}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {renderGiftCampaign()}

        <View style={[styles.actionRow, actionColumns > 1 && styles.actionRowGrid]}>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Tabs', { screen: 'Products' })}>
            <Text style={styles.actionTitle} numberOfLines={1}>Tum Urunler</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Urun, stok ve fiyat ara.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Tabs', { screen: 'DiscountedProducts' })}>
            <Text style={styles.actionTitle} numberOfLines={1}>Indirimli Urunler</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Kampanyali ve uygun fiyatli urunler.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Tabs', { screen: 'PurchasedProducts' })}>
            <Text style={styles.actionTitle} numberOfLines={1}>Daha Once Aldiklarim</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Tekrar siparis icin satin alma gecmisi.</Text>
          </TouchableOpacity>
          {collections.length > 0 && (
            <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Collections')}>
              <Text style={styles.actionTitle} numberOfLines={1}>Koleksiyonlar</Text>
              <Text style={styles.actionBody} numberOfLines={2} ellipsizeMode="tail">{collections.map((item) => item.title).join(', ')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('NewCategories')}>
            <Text style={styles.actionTitle} numberOfLines={1}>Yeni Kategoriler</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Hic almadigin kategori ve urunleri kesfet.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Agreements')}>
            <Text style={styles.actionTitle} numberOfLines={1}>Anlasmali Fiyatlar</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Sabit fiyatlari gor.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('PendingOrders')}>
            <Text style={styles.actionTitle} numberOfLines={1}>Bekleyen Siparisler</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Acik teslimatlarini takip et.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Invoices')}>
            <Text style={styles.actionTitle} numberOfLines={1}>Faturalarim</Text>
            <Text style={styles.actionBody} numberOfLines={2}>E-fatura PDF ve tutar bilgileri.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, actionCardWidth ? { width: actionCardWidth } : null]} onPress={() => navigation.navigate('Requests')}>
            <Text style={styles.actionTitle} numberOfLines={1}>Talepler</Text>
            <Text style={styles.actionBody} numberOfLines={2}>Alt kullanici talepleri.</Text>
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
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  containerTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#173D78',
    gap: spacing.md,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  heroTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: '#DDE8FF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DDE8FF',
    lineHeight: fontSizes.md + 6,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flex: 1,
    minWidth: 96,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.11)',
    padding: spacing.sm,
    gap: 2,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  statGrid: {
    gap: spacing.md,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bannerSection: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  bannerRow: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  bannerCard: {
    minHeight: 150,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerImage: {
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  bannerImageRadius: {
    borderRadius: radius.xl,
  },
  bannerCardInner: {
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 32, 76, 0.48)',
  },
  bannerContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
  },
  bannerSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#EAF1FF',
  },
  bannerButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0A2A57',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTintBlue: {
    backgroundColor: '#ECF3FF',
  },
  cardTintAmber: {
    backgroundColor: '#FFF4DF',
  },
  cardLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  cardValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
    marginTop: spacing.xs,
  },
  giftCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#BFD2FF',
    overflow: 'hidden',
    shadowColor: '#0A2A57',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  giftHero: {
    minHeight: 136,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  giftHeroImage: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  giftHeroPlain: {
    backgroundColor: '#123A78',
  },
  giftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 28, 69, 0.45)',
  },
  giftHeroContent: {
    gap: spacing.xs,
  },
  giftEyebrow: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
    overflow: 'hidden',
  },
  giftTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  giftSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#EAF1FF',
  },
  giftBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  giftProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  giftProgressLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  giftProgressValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E6ECF8',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  giftStatus: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  giftStatusQualified: {
    color: '#16A34A',
  },
  giftRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  giftItem: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  giftImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: '#EEF3FF',
  },
  giftImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftImageFallbackText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.primary,
  },
  giftName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
    minHeight: 34,
  },
  giftMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  giftButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
    overflow: 'hidden',
  },
  actionRow: {
    gap: spacing.md,
  },
  actionRowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#BFD2FF',
    minHeight: 112,
  },
  actionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.text,
  },
  actionBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
