import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { customerApi } from '../api/customer';
import { CustomerAppHeader } from '../components/CustomerAppHeader';
import { CustomerSectionHeader } from '../components/CustomerSectionHeader';
import { HomeProductCard } from '../components/HomeProductCard';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type {
  ActiveGiftCampaign,
  Banner,
  Category,
  CollectionCard,
  CustomerFinancials,
  GiftCampaignGift,
  Product,
} from '../types';
import { colors, fonts, radius, spacing } from '../theme';
import { trackCustomerActivity } from '../utils/activity';
import { getApiErrorMessage } from '../utils/errors';
import { resolveImageUrl } from '../utils/image';
import { getProductMaxQuantity } from '../utils/product';

type Summary = {
  orders: number;
  requests: number;
  cartItems: number;
  discounted: number;
  agreements: number;
};

const emptySummary: Summary = { orders: 0, requests: 0, cartItems: 0, discounted: 0, agreements: 0 };

const formatCurrency = (value?: number | null) =>
  `${Number(value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;

const firstName = (name?: string | null) => String(name || 'Musterimiz').trim().split(/\s+/)[0] || 'Musterimiz';

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [heroIntervalMs, setHeroIntervalMs] = useState(6000);
  const [activeBanner, setActiveBanner] = useState(0);
  const [giftCampaign, setGiftCampaign] = useState<ActiveGiftCampaign | null>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [purchasedProducts, setPurchasedProducts] = useState<Product[]>([]);
  const [homeSearch, setHomeSearch] = useState('');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTablet = width >= 760;
  const productCardWidth = isTablet ? 208 : Math.min(192, Math.max(172, width * 0.47));
  const heroBanners = useMemo(
    () => banners.filter((banner) => banner.position === 'HERO'),
    [banners]
  );
  const stripBanners = useMemo(
    () => banners.filter((banner) => banner.position === 'STRIP'),
    [banners]
  );

  const loadHome = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [orders, requests, cart, collectionResult, bannerResult, campaignResult, financialResult] =
        await Promise.all([
          customerApi.getOrders({ page: 1, pageSize: 1 }).catch(() => ({ orders: [], pagination: undefined })),
          customerApi.getOrderRequests().catch(() => ({ requests: [] })),
          customerApi.getCart().catch(() => ({ id: '', items: [], subtotal: 0, totalVat: 0, total: 0 })),
          customerApi.getActiveCollections().catch(() => ({ collections: [] as CollectionCard[] })),
          customerApi.getBanners().catch(() => ({ banners: [] as Banner[], heroIntervalMs: 6000 })),
          customerApi.getActiveGiftCampaign().catch(() => null),
          customerApi.getFinancials().catch(() => ({ financials: null })),
        ]);

      setSummary((current) => ({
        ...current,
        orders: orders.pagination?.total ?? orders.orders?.length ?? 0,
        requests: requests.requests?.length || 0,
        cartItems: cart.items?.length || 0,
      }));
      setCollections(collectionResult.collections || []);
      setBanners((bannerResult.banners || []).filter((item) => item.active !== false));
      setHeroIntervalMs(Math.max(2500, Number(bannerResult.heroIntervalMs || 6000)));
      setGiftCampaign(campaignResult?.active ? campaignResult : null);
      setFinancials(financialResult.financials || null);
      if (!refresh) setLoading(false);

      const [categoryResult, featuredResult, personalResult, purchasedResult, discountedResult, agreementResult] =
        await Promise.all([
          customerApi.getCategories().catch(() => ({ categories: [] as Category[] })),
          customerApi.getProducts({ featured: true, limit: 10 }).catch(() => ({ products: [] as Product[] })),
          customerApi.getPersonalRecommendations().catch(() => ({ products: [] as Product[], missingCategories: [] })),
          customerApi.getProducts({ mode: 'purchased', sort: 'lastPurchasedDesc', limit: 10 }).catch(() => ({ products: [] as Product[] })),
          customerApi.getProducts({ mode: 'discounted', limit: 1 }).catch(() => ({ products: [] as Product[], total: 0 })),
          customerApi.getProducts({ mode: 'agreements', limit: 1 }).catch(() => ({ products: [] as Product[], total: 0 })),
        ]);

      setCategories((categoryResult.categories || []).slice(0, 14));
      setFeaturedProducts((featuredResult.products || []).slice(0, 10));
      setRecommendedProducts((personalResult.products || []).slice(0, 10));
      setPurchasedProducts((purchasedResult.products || []).slice(0, 10));
      setSummary((current) => ({
        ...current,
        discounted: discountedResult.total ?? discountedResult.products?.length ?? 0,
        agreements: agreementResult.total ?? agreementResult.products?.length ?? 0,
      }));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ana sayfa verileri yuklenemedi.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHome();
  }, []);

  useEffect(() => {
    if (heroBanners.length < 2) return;
    const timer = setInterval(() => {
      setActiveBanner((current) => (current + 1) % heroBanners.length);
    }, heroIntervalMs);
    return () => clearInterval(timer);
  }, [heroBanners.length, heroIntervalMs]);

  useEffect(() => {
    if (activeBanner >= heroBanners.length) setActiveBanner(0);
  }, [activeBanner, heroBanners.length]);

  const navigateProducts = (params?: { categoryId?: string; categoryName?: string; search?: string }) => {
    navigation.navigate('Tabs', { screen: 'Products', params });
  };

  const handleSearch = () => {
    const search = homeSearch.trim();
    if (!search) return;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: 'Home',
      pageTitle: 'Ana Sayfa',
      meta: { query: search, source: 'home' },
    });
    navigateProducts({ search });
  };

  const handleBannerPress = async (banner: Banner) => {
    trackCustomerActivity({
      type: 'CLICK',
      pagePath: 'Home',
      pageTitle: 'Ana Sayfa',
      meta: { bannerId: banner.id, position: banner.position, productCode: banner.productCode || null },
    });

    const code = String(banner.productCode || '').trim();
    if (code) {
      try {
        const result = await customerApi.getProducts({ search: code, limit: 5 });
        const product = (result.products || []).find((item) => item.mikroCode === code) || result.products?.[0];
        if (product?.id) {
          navigation.navigate('ProductDetail', { productId: product.id });
          return;
        }
      } catch (err: any) {
        Alert.alert('Urun Acilamadi', getApiErrorMessage(err, 'Banner urunu acilamadi.'));
        return;
      }
    }

    const link = String(banner.linkUrl || '').trim();
    if (!link) return;
    const normalized = link.toLocaleLowerCase('tr-TR');
    if (/^https?:\/\//.test(link)) {
      Linking.openURL(link).catch(() => Alert.alert('Baglanti Acilamadi', 'Baglanti su anda acilamiyor.'));
    } else if (normalized.includes('discount')) {
      navigation.navigate('Tabs', { screen: 'DiscountedProducts' });
    } else if (normalized.includes('agreement') || normalized.includes('anlas')) {
      navigation.navigate('Agreements');
    } else if (normalized.includes('collection')) {
      navigation.navigate('Collections');
    } else if (normalized.includes('new-categor')) {
      navigation.navigate('NewCategories');
    } else {
      navigateProducts();
    }
  };

  const addProduct = async (product: Product) => {
    if (addingProductId) return;
    const priceType = user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE' : 'INVOICED';
    const maxQuantity = getProductMaxQuantity(product);
    const agreementMinimum = Number(product.agreement?.minQuantity || 1);
    if (product.agreement && maxQuantity < agreementMinimum) {
      Alert.alert(
        'Minimum Miktar Karsilanamiyor',
        `Anlasmali fiyat icin en az ${agreementMinimum} ${product.unit || 'adet'} gerekir; mevcut siparise uygun stok ${maxQuantity}.`
      );
      return;
    }
    const quantity = Math.max(1, Math.min(maxQuantity, agreementMinimum));
    if (maxQuantity <= 0) {
      Alert.alert('Stok Yetersiz', 'Bu urun su anda stokta yok.');
      return;
    }
    setAddingProductId(product.id);
    try {
      await customerApi.addToCart({
        productId: product.id,
        quantity,
        priceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      trackCustomerActivity({
        type: 'CART_ADD',
        productId: product.id,
        productCode: product.mikroCode,
        quantity,
        meta: { source: 'customer-home' },
      });
      const cart = await customerApi.getCart().catch(() => null);
      setSummary((current) => ({ ...current, cartItems: cart?.items?.length ?? current.cartItems + 1 }));
    } catch (err: any) {
      Alert.alert('Sepete Eklenemedi', getApiErrorMessage(err, 'Urun sepete eklenemedi.'));
    } finally {
      setAddingProductId(null);
    }
  };

  const renderProductShelf = (title: string, subtitle: string, products: Product[], onAll: () => void) => {
    if (!products.length) return null;
    return (
      <View style={styles.section}>
        <CustomerSectionHeader title={title} subtitle={subtitle} actionLabel="Tumunu gor" onAction={onAll} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
          {products.map((product) => (
            <HomeProductCard
              key={product.id}
              product={product}
              user={user}
              width={productCardWidth}
              adding={addingProductId === product.id}
              onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
              onAdd={() => addProduct(product)}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderGiftCampaign = () => {
    if (!giftCampaign?.active) return null;
    const imageUrl = resolveImageUrl(giftCampaign.mobileBannerImageUrl || giftCampaign.bannerImageUrl);
    const threshold = Number(giftCampaign.threshold || 0);
    const qualifyingTotal = Number(giftCampaign.qualifyingTotal || 0);
    const progress = threshold > 0 ? Math.min(100, Math.max(0, (qualifyingTotal / threshold) * 100)) : 0;
    const qualified = !!giftCampaign.qualified;
    const gifts = (giftCampaign.gifts || []).slice(0, 5);
    const openCampaign = () => {
      trackCustomerActivity({
        type: 'CLICK',
        pagePath: 'Home',
        pageTitle: 'Ana Sayfa',
        meta: { campaignId: giftCampaign.id || null, position: 'GIFT_CAMPAIGN', qualified },
      });
      navigation.navigate('Tabs', { screen: qualified ? 'Cart' : 'Products' });
    };

    return (
      <View style={styles.section}>
        <CustomerSectionHeader title="Sepete hediye" subtitle="Alisveris tutariniza ozel secilebilir hediyeler" />
        <TouchableOpacity activeOpacity={0.92} style={styles.giftCard} onPress={openCampaign}>
          {imageUrl ? (
            <ImageBackground source={{ uri: imageUrl }} style={styles.giftHero} imageStyle={styles.giftHeroImage}>
              <View style={styles.imageShade} />
              <View style={styles.giftHeroCopy}>
                <Text style={styles.heroEyebrow}>HEDIYE KAMPANYASI</Text>
                <Text style={styles.giftTitle} numberOfLines={2}>{giftCampaign.title || 'Sepetine hediyeni ekle'}</Text>
                {giftCampaign.subtitle ? <Text style={styles.giftSubtitle} numberOfLines={2}>{giftCampaign.subtitle}</Text> : null}
              </View>
            </ImageBackground>
          ) : (
            <View style={[styles.giftHero, styles.giftHeroFallback]}>
              <Text style={styles.heroEyebrow}>HEDIYE KAMPANYASI</Text>
              <Text style={styles.giftTitle}>{giftCampaign.title || 'Sepetine hediyeni ekle'}</Text>
            </View>
          )}
          <View style={styles.giftBody}>
            <View style={styles.progressHeader}>
              <Text style={styles.mutedLabel}>Sepet toplami</Text>
              <Text style={styles.progressValue}>{formatCurrency(qualifyingTotal)}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={[styles.giftStatus, qualified && styles.giftStatusReady]}>
              {qualified
                ? `${giftCampaign.giftPickCount || 1} hediye secimine hazirsiniz.`
                : `${formatCurrency(giftCampaign.remaining)} daha ekleyin.`}
            </Text>
            {gifts.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.giftRow}>
                {gifts.map((gift: GiftCampaignGift) => {
                  const giftImage = resolveImageUrl(gift.imageUrl);
                  return (
                    <TouchableOpacity
                      key={gift.productId}
                      style={styles.giftItem}
                      onPress={(event) => {
                        event.stopPropagation();
                        trackCustomerActivity({
                          type: 'CLICK',
                          pagePath: 'Home',
                          pageTitle: 'Ana Sayfa',
                          meta: {
                            campaignId: giftCampaign.id || null,
                            giftProductId: gift.productId,
                            position: 'GIFT_CAMPAIGN_GIFT',
                          },
                        });
                        navigation.navigate('ProductDetail', { productId: gift.productId });
                      }}
                    >
                      {giftImage ? <Image source={{ uri: giftImage }} style={styles.giftImage} resizeMode="contain" /> : null}
                      <Text style={styles.giftName} numberOfLines={2}>{gift.name}</Text>
                      <Text style={styles.giftMeta} numberOfLines={1}>{gift.giftQuantity} {gift.unit || 'adet'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            <View style={styles.inlineAction}>
              <Text style={styles.inlineActionText}>{qualified ? 'Hediyeni sec' : giftCampaign.buttonText || 'Urunlere git'}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const currentBanner = heroBanners[activeBanner];
  const bannerImage = resolveImageUrl(currentBanner?.mobileImageUrl || currentBanner?.imageUrl);

  return (
    <SafeAreaView style={styles.safeArea}>
      <CustomerAppHeader cartCount={summary.cartItems} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHome(true)} tintColor={colors.primary} />}
        contentContainerStyle={[styles.page, isTablet && styles.pageTablet]}
      >
        <View style={styles.identityBand}>
          <View style={styles.identityTop}>
            <View style={styles.identityCopy}>
              <Text style={styles.identityEyebrow}>BUGUN SIZIN ICIN</Text>
              <Text style={styles.identityTitle}>Merhaba, {firstName(user?.name)}</Text>
              <Text style={styles.identityMeta}>{user?.mikroCariCode || 'Musteri hesabiniz'} icin hazirlanan katalog</Text>
            </View>
            <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('Profile')}>
              <Ionicons name="person-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {financials ? (
            <View style={styles.financeRow}>
              <View style={styles.financeCell}>
                <Text style={styles.financeLabel}>Toplam bakiye</Text>
                <Text style={styles.financeValue} numberOfLines={1}>{formatCurrency(financials.totalBalance)}</Text>
              </View>
              <View style={styles.financeDivider} />
              <View style={styles.financeCell}>
                <Text style={styles.financeLabel}>Vadesi gecen</Text>
                <Text style={[styles.financeValue, Number(financials.pastDueBalance) > 0 && styles.financeDanger]} numberOfLines={1}>
                  {formatCurrency(financials.pastDueBalance)}
                </Text>
              </View>
              <View style={styles.financeDivider} />
              <View style={styles.financeCell}>
                <Text style={styles.financeLabel}>Vade plani</Text>
                <Text style={styles.financeValue} numberOfLines={1}>{financials.paymentTermLabel || '-'}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.searchShell}>
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Urun adi veya kodu ara"
            placeholderTextColor={colors.textMuted}
            value={homeSearch}
            onChangeText={setHomeSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Katalog size ozel hazirlaniyor</Text>
          </View>
        ) : (
          <>
            {error ? (
              <TouchableOpacity style={styles.errorBar} onPress={() => loadHome()}>
                <Ionicons name="refresh" size={17} color={colors.danger} />
                <Text style={styles.errorText}>{error} Tekrar deneyin.</Text>
              </TouchableOpacity>
            ) : null}

            {currentBanner ? (
              <View style={styles.bannerSection}>
                <TouchableOpacity activeOpacity={0.92} style={styles.heroBanner} onPress={() => handleBannerPress(currentBanner)}>
                  {bannerImage ? (
                    <ImageBackground source={{ uri: bannerImage }} style={styles.heroBannerImage} imageStyle={styles.heroBannerRadius}>
                      <View style={styles.imageShade} />
                      <View style={styles.bannerCopy}>
                        <Text style={styles.heroEyebrow}>BAKIRCILAR SECIMI</Text>
                        <Text style={styles.bannerTitle} numberOfLines={2}>{currentBanner.title}</Text>
                        {currentBanner.subtitle ? <Text style={styles.bannerSubtitle} numberOfLines={2}>{currentBanner.subtitle}</Text> : null}
                        <View style={styles.bannerButton}>
                          <Text style={styles.bannerButtonText}>{currentBanner.buttonText || 'Incele'}</Text>
                          <Ionicons name="arrow-forward" size={15} color={colors.primaryDark} />
                        </View>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={[styles.heroBannerImage, styles.heroBannerFallback]}>
                      <View style={styles.bannerCopy}>
                        <Text style={styles.heroEyebrow}>BAKIRCILAR SECIMI</Text>
                        <Text style={styles.bannerTitle}>{currentBanner.title}</Text>
                        {currentBanner.subtitle ? <Text style={styles.bannerSubtitle}>{currentBanner.subtitle}</Text> : null}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                {heroBanners.length > 1 ? (
                  <View style={styles.dots}>
                    {heroBanners.map((banner, index) => (
                      <TouchableOpacity
                        key={banner.id}
                        style={[styles.dot, index === activeBanner && styles.dotActive]}
                        onPress={() => setActiveBanner(index)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <CustomerSectionHeader title="Bugun sizin icin" subtitle="Hesabinizdaki guncel hareketler" />
              <View style={styles.todayGrid}>
                <TouchableOpacity style={styles.todayCard} onPress={() => navigation.navigate('Tabs', { screen: 'Cart' })}>
                  <View style={[styles.todayIcon, styles.todayIconBlue]}><Ionicons name="bag-handle-outline" size={19} color={colors.primary} /></View>
                  <Text style={styles.todayValue}>{summary.cartItems}</Text>
                  <Text style={styles.todayLabel}>Sepette urun</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.todayCard} onPress={() => navigation.navigate('Orders')}>
                  <View style={[styles.todayIcon, styles.todayIconGreen]}><Ionicons name="receipt-outline" size={19} color={colors.accent} /></View>
                  <Text style={styles.todayValue}>{summary.orders}</Text>
                  <Text style={styles.todayLabel}>Siparis</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.todayCard} onPress={() => recommendedProducts.length ? navigation.navigate('ProductDetail', { productId: recommendedProducts[0].id }) : navigateProducts()}>
                  <View style={[styles.todayIcon, styles.todayIconAmber]}><Ionicons name="sparkles-outline" size={19} color={colors.warning} /></View>
                  <Text style={styles.todayValue}>{recommendedProducts.length}</Text>
                  <Text style={styles.todayLabel}>Size ozel urun</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <CustomerSectionHeader title="Avantajli alisveris" subtitle="Size tanimli fiyat ve kampanyalar" />
              <View style={styles.advantageGrid}>
                <TouchableOpacity style={[styles.advantageCard, styles.discountCard]} onPress={() => navigation.navigate('Tabs', { screen: 'DiscountedProducts' })}>
                  <View style={styles.advantageIcon}><Ionicons name="pricetag-outline" size={24} color="#FFFFFF" /></View>
                  <Text style={styles.advantageTitle}>Indirimli urunler</Text>
                  <Text style={styles.advantageBody}>{summary.discounted ? `${summary.discounted} urunde avantajli fiyat` : 'Fazla stok ve kampanya fiyatlari'}</Text>
                  <Text style={styles.advantageLink}>{'Incele  ->'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.advantageCard, styles.agreementCard]} onPress={() => navigation.navigate('Agreements')}>
                  <View style={styles.advantageIcon}><Ionicons name="shield-checkmark-outline" size={24} color="#FFFFFF" /></View>
                  <Text style={styles.advantageTitle}>Anlasmali fiyatlar</Text>
                  <Text style={styles.advantageBody}>{summary.agreements ? `${summary.agreements} urunde size ozel fiyat` : 'Musteriye ozel sabit fiyatlar'}</Text>
                  <Text style={styles.advantageLink}>{'Incele  ->'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {renderProductShelf(
              recommendedProducts.length ? 'Size ozel oneriler' : 'One cikan urunler',
              recommendedProducts.length ? 'Alim gecmisinize gore tamamlayici urunler' : 'Katalogdan secilen urunler',
              recommendedProducts.length ? recommendedProducts : featuredProducts,
              () => navigateProducts()
            )}

            {categories.length ? (
              <View style={styles.section}>
                <CustomerSectionHeader title="Kategoriler" subtitle="Aradiginiz gruba hizla ulasin" actionLabel="Tum urunler" onAction={() => navigateProducts()} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                  {categories.map((category) => {
                    const image = resolveImageUrl(category.imageUrl);
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={styles.categoryCard}
                        onPress={() => navigateProducts({ categoryId: category.id, categoryName: category.name })}
                      >
                        <View style={styles.categoryImageShell}>
                          {image ? <Image source={{ uri: image }} style={styles.categoryImage} resizeMode="contain" /> : <Ionicons name="grid-outline" size={25} color={colors.primary} />}
                        </View>
                        <Text style={styles.categoryName} numberOfLines={2}>{category.name}</Text>
                        {typeof category.count === 'number' ? <Text style={styles.categoryCount}>{category.count} urun</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {stripBanners.map((banner) => {
              const image = resolveImageUrl(banner.mobileImageUrl || banner.imageUrl);
              return (
                <TouchableOpacity key={banner.id} style={styles.stripBanner} onPress={() => handleBannerPress(banner)}>
                  {image ? <Image source={{ uri: image }} style={styles.stripImage} resizeMode="cover" /> : null}
                  <View style={styles.stripCopy}>
                    <Text style={styles.stripTitle} numberOfLines={1}>{banner.title}</Text>
                    {banner.subtitle ? <Text style={styles.stripSubtitle} numberOfLines={2}>{banner.subtitle}</Text> : null}
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              );
            })}

            {collections.length ? (
              <View style={styles.section}>
                <CustomerSectionHeader title="Koleksiyonlar" subtitle="Ihtiyaca gore hazirlanan secimler" actionLabel="Tumunu gor" onAction={() => navigation.navigate('Collections')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                  {collections.slice(0, 8).map((collection) => {
                    const image = resolveImageUrl(collection.imageUrl);
                    return (
                      <TouchableOpacity key={collection.id} style={styles.collectionCard} onPress={() => navigation.navigate('CollectionDetail', { collectionId: collection.id })}>
                        {image ? <Image source={{ uri: image }} style={styles.collectionImage} resizeMode="cover" /> : <View style={[styles.collectionImage, { backgroundColor: collection.color || colors.primary }]} />}
                        <View style={styles.collectionShade} />
                        <View style={styles.collectionCopy}>
                          <Text style={styles.collectionTitle} numberOfLines={2}>{collection.title}</Text>
                          {collection.subtitle ? <Text style={styles.collectionSubtitle} numberOfLines={2}>{collection.subtitle}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {renderGiftCampaign()}

            {renderProductShelf(
              'Yeniden siparis',
              'Daha once aldiginiz urunlere hizli donus',
              purchasedProducts,
              () => navigation.navigate('Tabs', { screen: 'PurchasedProducts' })
            )}

            <View style={styles.section}>
              <CustomerSectionHeader title="Hesabiniz" subtitle="Siparis, teslimat ve belgeler" />
              <View style={styles.accountActions}>
                {[
                  { key: 'pending', label: 'Bekleyen siparisler', icon: 'time-outline' as const, onPress: () => navigation.navigate('PendingOrders') },
                  { key: 'invoice', label: 'Faturalarim', icon: 'document-text-outline' as const, onPress: () => navigation.navigate('Invoices') },
                  { key: 'request', label: `Talepler${summary.requests ? ` (${summary.requests})` : ''}`, icon: 'git-pull-request-outline' as const, onPress: () => navigation.navigate('Requests') },
                  { key: 'new', label: 'Yeni kategoriler', icon: 'compass-outline' as const, onPress: () => navigation.navigate('NewCategories') },
                ].map((action) => (
                  <TouchableOpacity key={action.key} style={styles.accountAction} onPress={action.onPress}>
                    <Ionicons name={action.icon} size={21} color={colors.primary} />
                    <Text style={styles.accountActionText}>{action.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primaryDark },
  page: { backgroundColor: colors.background, paddingBottom: spacing.xxl, gap: spacing.xl },
  pageTablet: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  identityBand: { backgroundColor: colors.primaryDark, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityCopy: { minWidth: 0, flex: 1 },
  identityEyebrow: { fontFamily: fonts.mono, fontSize: 9, color: '#77B8E9' },
  identityTitle: { marginTop: 3, fontFamily: fonts.bold, fontSize: 22, color: '#FFFFFF' },
  identityMeta: { marginTop: 3, fontFamily: fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  profileButton: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  financeRow: { flexDirection: 'row', alignItems: 'stretch', padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.07)' },
  financeCell: { minWidth: 0, flex: 1, paddingHorizontal: spacing.xs },
  financeDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.13)' },
  financeLabel: { fontFamily: fonts.medium, fontSize: 9, color: 'rgba(255,255,255,0.58)' },
  financeValue: { marginTop: 4, fontFamily: fonts.semibold, fontSize: 11, color: '#FFFFFF' },
  financeDanger: { color: '#FFB6AE' },
  searchShell: { marginHorizontal: spacing.lg, marginTop: -10, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, shadowColor: '#071B3A', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  searchInput: { minWidth: 0, flex: 1, height: 50, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  searchButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  loadingArea: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  errorBar: { marginHorizontal: spacing.lg, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: '#F1C6C1', borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { minWidth: 0, flex: 1, fontFamily: fonts.medium, fontSize: 11, color: colors.danger },
  section: { gap: spacing.md, paddingHorizontal: spacing.lg },
  horizontalRow: { gap: spacing.md, paddingRight: spacing.lg },
  bannerSection: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  heroBanner: { overflow: 'hidden', minHeight: 188, borderRadius: radius.lg, backgroundColor: colors.primary },
  heroBannerImage: { minHeight: 188, justifyContent: 'flex-end' },
  heroBannerRadius: { borderRadius: radius.lg },
  heroBannerFallback: { backgroundColor: colors.primary, padding: spacing.xl },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 20, 40, 0.42)' },
  bannerCopy: { maxWidth: 440, padding: spacing.lg, gap: spacing.xs },
  heroEyebrow: { alignSelf: 'flex-start', fontFamily: fonts.mono, fontSize: 8, color: '#BDE3FF' },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 28, color: '#FFFFFF' },
  bannerSubtitle: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.83)' },
  bannerButton: { alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: '#FFFFFF' },
  bannerButtonText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.primaryDark },
  dots: { minHeight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 20, backgroundColor: colors.primary },
  todayGrid: { flexDirection: 'row', gap: spacing.sm },
  todayCard: { minWidth: 0, flex: 1, minHeight: 108, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  todayIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  todayIconBlue: { backgroundColor: colors.primaryMuted },
  todayIconGreen: { backgroundColor: colors.accentSoft },
  todayIconAmber: { backgroundColor: colors.warningSoft },
  todayValue: { marginTop: spacing.sm, fontFamily: fonts.bold, fontSize: 18, color: colors.textStrong },
  todayLabel: { marginTop: 1, fontFamily: fonts.medium, fontSize: 9, lineHeight: 12, color: colors.textMuted },
  advantageGrid: { flexDirection: 'row', gap: spacing.md },
  advantageCard: { minWidth: 0, flex: 1, minHeight: 166, borderRadius: radius.lg, padding: spacing.lg },
  discountCard: { backgroundColor: '#9C3A35' },
  agreementCard: { backgroundColor: '#0C6D65' },
  advantageIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  advantageTitle: { marginTop: spacing.md, fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  advantageBody: { marginTop: 4, minHeight: 32, fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: 'rgba(255,255,255,0.76)' },
  advantageLink: { marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: 10, color: '#FFFFFF' },
  categoryCard: { width: 104, minHeight: 132, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm },
  categoryImageShell: { height: 70, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { marginTop: spacing.sm, minHeight: 30, fontFamily: fonts.semibold, fontSize: 10, lineHeight: 14, color: colors.text },
  categoryCount: { fontFamily: fonts.medium, fontSize: 8, color: colors.textMuted },
  stripBanner: { marginHorizontal: spacing.lg, minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, paddingRight: spacing.md },
  stripImage: { width: 104, alignSelf: 'stretch', backgroundColor: colors.surfaceMuted },
  stripCopy: { minWidth: 0, flex: 1 },
  stripTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  stripSubtitle: { marginTop: 2, fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: colors.textMuted },
  collectionCard: { position: 'relative', overflow: 'hidden', width: 238, height: 146, borderRadius: radius.lg, backgroundColor: colors.primary },
  collectionImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  collectionShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,20,40,0.38)' },
  collectionCopy: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
  collectionTitle: { fontFamily: fonts.bold, fontSize: 17, color: '#FFFFFF' },
  collectionSubtitle: { marginTop: 3, fontFamily: fonts.regular, fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  giftCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  giftHero: { minHeight: 140, justifyContent: 'flex-end' },
  giftHeroImage: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  giftHeroFallback: { backgroundColor: colors.primary, padding: spacing.lg },
  giftHeroCopy: { padding: spacing.lg, gap: spacing.xs },
  giftTitle: { fontFamily: fonts.bold, fontSize: 20, color: '#FFFFFF' },
  giftSubtitle: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.82)' },
  giftBody: { padding: spacing.lg, gap: spacing.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  mutedLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  progressValue: { fontFamily: fonts.bold, fontSize: 11, color: colors.text },
  progressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: colors.backgroundRaised },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  giftStatus: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  giftStatusReady: { color: colors.accent },
  giftRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  giftItem: { width: 106, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  giftImage: { width: '100%', height: 70, backgroundColor: '#FFFFFF' },
  giftName: { marginTop: spacing.xs, minHeight: 28, fontFamily: fonts.medium, fontSize: 9, lineHeight: 13, color: colors.text },
  giftMeta: { marginTop: 2, fontFamily: fonts.mono, fontSize: 8, color: colors.textMuted },
  inlineAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  inlineActionText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.primary },
  accountActions: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  accountAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  accountActionText: { minWidth: 0, flex: 1, fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
});
