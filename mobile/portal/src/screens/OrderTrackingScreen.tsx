import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type TrackingTab = 'customers' | 'suppliers' | 'logs';
type OrderType = 'customer' | 'supplier';

type QuantityEditorState = {
  order: any;
  item: any;
  orderType: OrderType;
} | null;

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const numberText = (value: unknown) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

const dateText = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

export function OrderTrackingScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TrackingTab>('customers');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const [testEmail, setTestEmail] = useState('');
  const [quantityEditor, setQuantityEditor] = useState<QuantityEditorState>(null);
  const [quantityText, setQuantityText] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const actionBusyRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);

  const beginAction = (key: string) => {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = key;
    setActionBusy(key);
    return true;
  };

  const endAction = () => {
    actionBusyRef.current = null;
    setActionBusy(null);
  };

  const fetchAll = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, supplierRes, pendingRes, logsRes] = await Promise.all([
        adminApi.getOrderTrackingSummary(),
        adminApi.getOrderTrackingSupplierSummary(),
        adminApi.getOrderTrackingPendingOrders(),
        adminApi.getOrderTrackingEmailLogs(),
      ]);
      if (requestSeq !== fetchSeqRef.current) return;
      setSummary(summaryRes || []);
      setSupplierSummary(supplierRes || []);
      setPendingOrders(pendingRes || []);
      setEmailLogs(logsRes || []);
    } catch (err: any) {
      if (requestSeq !== fetchSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Siparis takip verileri yuklenemedi.'));
    } finally {
      if (requestSeq === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const customerAmount = useMemo(
    () => summary.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
    [summary]
  );
  const supplierAmount = useMemo(
    () => supplierSummary.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
    [supplierSummary]
  );

  const runSync = async () => {
    if (!beginAction('sync')) return;
    try {
      await adminApi.syncOrderTracking();
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sync basarisiz.'));
    } finally {
      endAction();
    }
  };

  const runSend = async () => {
    if (!beginAction('send')) return;
    try {
      if (activeTab === 'suppliers') await adminApi.sendOrderTrackingSupplierEmails();
      else if (activeTab === 'customers') await adminApi.sendOrderTrackingCustomerEmails();
      else await adminApi.sendOrderTrackingEmails();
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Mail gonderilemedi.'));
    } finally {
      endAction();
    }
  };

  const runSyncSend = async () => {
    if (!beginAction('syncSend')) return;
    try {
      await adminApi.syncAndSendOrderTracking();
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Islem basarisiz.'));
    } finally {
      endAction();
    }
  };

  const runTestEmail = async () => {
    if (!testEmail.trim()) {
      Alert.alert('Eksik Bilgi', 'Test mail girin.');
      return;
    }
    if (!beginAction('test')) return;
    try {
      await adminApi.sendOrderTrackingTestEmail(testEmail.trim());
      Alert.alert('Basarili', 'Test mail gonderildi.');
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Mail gonderilemedi.'));
    } finally {
      endAction();
    }
  };

  const sendCustomerEmail = async (customerCode: string) => {
    const actionKey = `mail:${customerCode}`;
    if (!beginAction(actionKey)) return;
    try {
      await adminApi.sendOrderTrackingEmailToCustomer(
        customerCode,
        emailOverrides[customerCode]?.trim() || undefined
      );
      Alert.alert('Basarili', 'Mail gonderildi.');
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Mail gonderilemedi.'));
    } finally {
      endAction();
    }
  };

  const markSupplierTransmitted = async (supplier: any) => {
    const actionKey = `transmitted:${supplier.customerCode}`;
    if (!beginAction(actionKey)) return;
    try {
      await adminApi.markOrderTrackingSupplierTransmitted(supplier.customerCode, supplier.customerName);
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Iletim kaydi olusturulamadi.'));
    } finally {
      endAction();
    }
  };

  const closeRemaining = (order: any, orderType: OrderType, item?: any) => {
    const rowNumber = item?.rowNumber;
    if (item && !Number.isFinite(Number(rowNumber))) {
      Alert.alert('Eksik Bilgi', 'Satir numarasi bulunamadi. Once listeyi sync edin.');
      return;
    }
    const targetKey = item
      ? `close:${order.mikroOrderNumber}:${rowNumber}`
      : `close:${order.mikroOrderNumber}:all`;
    Alert.alert(
      item ? 'Satir kalanini kapat' : 'Tum kalanlari kapat',
      item
        ? `${item.productCode || item.productName} satirinin yalniz kalan acik miktari kapatilacak. Teslim edilen miktar degismeyecek.`
        : `${order.mikroOrderNumber} siparisindeki tum acik kalanlar kapatilacak. Teslim miktarlari degismeyecek.`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: async () => {
            if (!beginAction(targetKey)) return;
            try {
              const result = await adminApi.closeOrderTrackingRemaining(order.mikroOrderNumber, {
                orderType,
                ...(item ? { lineNumbers: [Number(rowNumber)] } : {}),
              });
              Alert.alert('Basarili', result.message || 'Kalan siparis kapatildi.');
              await fetchAll();
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('Hata', getApiErrorMessage(err, 'Kalan siparis kapatilamadi.'));
            } finally {
              endAction();
            }
          },
        },
      ]
    );
  };

  const openQuantityEditor = (order: any, orderType: OrderType, item: any) => {
    if (!Number.isFinite(Number(item?.rowNumber))) {
      Alert.alert('Eksik Bilgi', 'Satir numarasi bulunamadi. Once listeyi sync edin.');
      return;
    }
    setQuantityEditor({ order, orderType, item });
    setQuantityText(String(Number(item.quantity || 0)));
  };

  const saveQuantity = async () => {
    if (!quantityEditor) return;
    const quantity = Number(quantityText.replace(',', '.'));
    const delivered = Number(quantityEditor.item.deliveredQty || 0);
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert('Gecersiz Miktar', 'Gecerli bir miktar girin.');
      return;
    }
    if (quantity < delivered) {
      Alert.alert('Gecersiz Miktar', `Yeni miktar teslim edilen ${numberText(delivered)} miktarindan dusuk olamaz.`);
      return;
    }
    const targetKey = `qty:${quantityEditor.order.mikroOrderNumber}:${quantityEditor.item.rowNumber}`;
    if (!beginAction(targetKey)) return;
    try {
      const result = await adminApi.updateOrderTrackingLineQuantity(quantityEditor.order.mikroOrderNumber, {
        orderType: quantityEditor.orderType,
        lineNumber: Number(quantityEditor.item.rowNumber),
        quantity,
      });
      setQuantityEditor(null);
      Alert.alert('Basarili', result.message || 'Satir miktari guncellendi.');
      await fetchAll();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Satir miktari guncellenemedi.'));
    } finally {
      endAction();
    }
  };

  const renderOrder = (order: any, orderType: OrderType) => {
    const lines = Array.isArray(order.items) ? order.items : [];
    const hasOpenLine = lines.some((line: any) => Number(line.remainingQty || 0) > 0);
    return (
      <View key={order.id || order.mikroOrderNumber} style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.flex}>
            <Text style={styles.orderNumber}>{order.mikroOrderNumber}</Text>
            <Text style={styles.listMeta} numberOfLines={2}>
              {dateText(order.orderDate)} · Teslim {dateText(order.deliveryDate)} · {order.itemCount || lines.length} kalem
            </Text>
          </View>
          <Text style={styles.orderTotal}>{money(order.grandTotal)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.closeAllButton, (!hasOpenLine || Boolean(actionBusy)) && styles.buttonDisabled]}
          onPress={() => closeRemaining(order, orderType)}
          disabled={!hasOpenLine || Boolean(actionBusy)}
        >
          <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.closeButtonText}>
            {actionBusy === `close:${order.mikroOrderNumber}:all` ? 'Kapatiliyor' : 'Tum Kalanlari Kapat'}
          </Text>
        </TouchableOpacity>

        {lines.map((item: any, index: number) => {
          const remaining = Number(item.remainingQty || 0);
          const delivered = Number(item.deliveredQty || 0);
          const targetKey = `${order.mikroOrderNumber}:${item.rowNumber}`;
          return (
            <View key={`${item.rowNumber ?? index}:${item.productCode || index}`} style={[styles.lineCard, remaining <= 0 && styles.lineCardDone]}>
              <View style={styles.lineTopRow}>
                <View style={styles.flex}>
                  <Text style={styles.lineTitle} numberOfLines={2}>{item.productName || item.productCode}</Text>
                  <Text style={styles.lineCode}>{item.productCode || '-'} · Depo {item.warehouseCode || '-'}</Text>
                </View>
                <View style={[styles.remainingBadge, remaining <= 0 && styles.remainingBadgeDone]}>
                  <Text style={[styles.remainingBadgeText, remaining <= 0 && styles.remainingBadgeTextDone]}>
                    {remaining <= 0 ? 'Teslim' : `Kalan ${numberText(remaining)}`}
                  </Text>
                </View>
              </View>

              <View style={styles.lineMetrics}>
                <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Siparis</Text><Text style={styles.lineMetricValue}>{numberText(item.quantity)} {item.unit || ''}</Text></View>
                <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Teslim</Text><Text style={styles.lineMetricValue}>{numberText(delivered)}</Text></View>
                <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Birim Fiyat</Text><Text style={styles.lineMetricValue}>{money(item.unitPrice)}</Text></View>
                <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Kalan Tutar</Text><Text style={styles.lineMetricValue}>{money(item.lineTotal)}</Text></View>
              </View>

              {orderType === 'customer' ? (
                <View style={styles.stockRow}>
                  <Text style={styles.stockText}>Merkez {numberText(item.warehouseStocks?.merkez)}</Text>
                  <Text style={styles.stockText}>Topca {numberText(item.warehouseStocks?.topca)}</Text>
                  {item.fulfillment?.hasAggregateRisk ? <Text style={styles.riskText}>Toplam talep riski</Text> : null}
                </View>
              ) : null}

              <View style={styles.lineActions}>
                <TouchableOpacity
                  style={[styles.lineEditButton, Boolean(actionBusy) && styles.buttonDisabled]}
                  onPress={() => openQuantityEditor(order, orderType, item)}
                  disabled={Boolean(actionBusy)}
                >
                  <Ionicons name="create-outline" size={14} color={colors.primarySoft} />
                  <Text style={styles.lineEditText}>{actionBusy === `qty:${targetKey}` ? 'Guncelleniyor' : 'Miktari Duzenle'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lineCloseButton, (remaining <= 0 || Boolean(actionBusy)) && styles.buttonDisabled]}
                  onPress={() => closeRemaining(order, orderType, item)}
                  disabled={remaining <= 0 || Boolean(actionBusy)}
                >
                  <Text style={styles.lineCloseText}>
                    {actionBusy === `close:${targetKey}` ? 'Kapatiliyor' : 'Kalani Kapat'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderParty = (party: any, orderType: OrderType) => {
    const key = `${orderType}:${party.customerCode}`;
    const expanded = expandedKey === key;
    const override = emailOverrides[party.customerCode] || '';
    return (
      <View key={key} style={styles.partyCard}>
        <View style={styles.partyTopRow}>
          <View style={styles.flex}>
            <Text style={styles.partyName} numberOfLines={2}>{party.customerName || party.customerCode}</Text>
            <Text style={styles.partyCode}>{party.customerCode} · {party.ordersCount || 0} siparis</Text>
          </View>
          <View style={styles.partyAmountWrap}>
            <Text style={styles.partyAmount}>{money(party.totalAmount)}</Text>
            {orderType === 'supplier' && party.lastTransmittedAt ? (
              <Text style={styles.transmittedText}>Iletildi {dateText(party.lastTransmittedAt)}</Text>
            ) : null}
          </View>
        </View>

        <TextInput
          style={styles.emailInput}
          placeholder={party.customerEmail || 'Tek seferlik e-posta override'}
          placeholderTextColor={colors.textMuted}
          value={override}
          onChangeText={(value) => setEmailOverrides((prev) => ({ ...prev, [party.customerCode]: value }))}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.partyActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setExpandedKey(expanded ? null : key)}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primarySoft} />
            <Text style={styles.secondaryButtonText}>{expanded ? 'Gizle' : 'Detay'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButtonSmall, Boolean(actionBusy) && styles.buttonDisabled]}
            onPress={() => sendCustomerEmail(party.customerCode)}
            disabled={Boolean(actionBusy)}
          >
            <Ionicons name="mail-outline" size={14} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{actionBusy === `mail:${party.customerCode}` ? 'Gonderiliyor' : 'Mail'}</Text>
          </TouchableOpacity>
          {orderType === 'supplier' ? (
            <TouchableOpacity
              style={[styles.transmittedButton, Boolean(actionBusy) && styles.buttonDisabled]}
              onPress={() => markSupplierTransmitted(party)}
              disabled={Boolean(actionBusy)}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={styles.transmittedButtonText}>{actionBusy === `transmitted:${party.customerCode}` ? 'Kaydediliyor' : 'Iletildi'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {expanded ? <View style={styles.ordersWrap}>{(party.orders || []).map((order: any) => renderOrder(order, orderType))}</View> : null}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}><ActivityIndicator color={colors.primarySoft} /></View>
      </SafeAreaView>
    );
  }

  const visibleRows = activeTab === 'suppliers' ? supplierSummary : summary;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.heroKicker}>Operasyon</Text>
            <Text style={styles.heroTitle}>Siparis Takip</Text>
            <Text style={styles.heroSubtitle}>Acik siparis, teslimat, tedarikci ve mail akisi</Text>
          </View>
          <TouchableOpacity style={styles.refreshIcon} onPress={fetchAll} disabled={Boolean(actionBusy)}>
            <Ionicons name="refresh" size={18} color={colors.textSoft} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroMetricRow}>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{summary.length}</Text><Text style={styles.heroMetricLabel}>Musteri</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{supplierSummary.length}</Text><Text style={styles.heroMetricLabel}>Tedarikci</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{pendingOrders.length}</Text><Text style={styles.heroMetricLabel}>Bekleyen</Text></View>
          <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{emailLogs.length}</Text><Text style={styles.heroMetricLabel}>Mail</Text></View>
        </View>

        <View style={styles.tabs}>
          {([
            ['customers', `Musteriler · ${money(customerAmount)}`],
            ['suppliers', `Tedarikciler · ${money(supplierAmount)}`],
            ['logs', `Mail / Test · ${emailLogs.length}`],
          ] as Array<[TrackingTab, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.tab, activeTab === key && styles.tabActive]} onPress={() => { setActiveTab(key); setExpandedKey(null); hapticLight(); }}>
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.primaryButton, Boolean(actionBusy) && styles.buttonDisabled]} onPress={runSync} disabled={Boolean(actionBusy)}>
            <Ionicons name="sync" size={15} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{actionBusy === 'sync' ? 'Sync...' : 'Sync'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, Boolean(actionBusy) && styles.buttonDisabled]} onPress={runSend} disabled={Boolean(actionBusy)}>
            <Ionicons name="mail-outline" size={15} color={colors.primarySoft} />
            <Text style={styles.secondaryButtonText}>{actionBusy === 'send' ? 'Gonderiliyor' : 'Mail Gonder'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, Boolean(actionBusy) && styles.buttonDisabled]} onPress={runSyncSend} disabled={Boolean(actionBusy)}>
            <Ionicons name="flash-outline" size={15} color={colors.warning} />
            <Text style={styles.secondaryButtonText}>{actionBusy === 'syncSend' ? 'Isleniyor' : 'Sync + Mail'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <View style={styles.errorCard}><Text style={styles.error}>{error}</Text></View> : null}

        {activeTab === 'logs' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Test Mail</Text>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} placeholder="ornek@firma.com" placeholderTextColor={colors.textMuted} value={testEmail} onChangeText={setTestEmail} autoCapitalize="none" keyboardType="email-address" />
                <TouchableOpacity style={[styles.primaryButtonSmall, Boolean(actionBusy) && styles.buttonDisabled]} onPress={runTestEmail} disabled={Boolean(actionBusy)}>
                  <Text style={styles.primaryButtonText}>{actionBusy === 'test' ? 'Gonderiliyor' : 'Test'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mail Gecmisi</Text>
              {emailLogs.map((log: any) => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logIcon}><Ionicons name="mail-open-outline" size={15} color={colors.primarySoft} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.listTitle} numberOfLines={2}>{log.subject || 'Mail'}</Text>
                    <Text style={styles.listMeta}>{log.customerCode || '-'} · {dateText(log.sentAt)}</Text>
                  </View>
                </View>
              ))}
              {emailLogs.length === 0 ? <Text style={styles.helper}>Kayit yok.</Text> : null}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            {visibleRows.map((party) => renderParty(party, activeTab === 'suppliers' ? 'supplier' : 'customer'))}
            {visibleRows.length === 0 ? <View style={styles.emptyCard}><Text style={styles.helper}>Bu kapsamda acik siparis bulunmuyor.</Text></View> : null}
          </View>
        )}
      </ScrollView>

      <Modal visible={Boolean(quantityEditor)} transparent animationType="fade" onRequestClose={() => setQuantityEditor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalKicker}>Siparis Miktari</Text>
                <Text style={styles.modalTitle} numberOfLines={2}>{quantityEditor?.item?.productName || quantityEditor?.item?.productCode}</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setQuantityEditor(null)}><Ionicons name="close" size={18} color={colors.textSoft} /></TouchableOpacity>
            </View>
            <View style={styles.modalMetrics}>
              <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Mevcut</Text><Text style={styles.lineMetricValue}>{numberText(quantityEditor?.item?.quantity)}</Text></View>
              <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Teslim</Text><Text style={styles.lineMetricValue}>{numberText(quantityEditor?.item?.deliveredQty)}</Text></View>
              <View style={styles.lineMetric}><Text style={styles.lineMetricLabel}>Minimum</Text><Text style={styles.lineMetricValue}>{numberText(quantityEditor?.item?.deliveredQty)}</Text></View>
            </View>
            <Text style={styles.inputLabel}>Yeni toplam siparis miktari</Text>
            <TextInput style={styles.quantityInput} value={quantityText} onChangeText={setQuantityText} keyboardType="decimal-pad" selectTextOnFocus autoFocus />
            <Text style={styles.modalHint}>Yeni miktar teslim edilen miktardan dusuk olamaz. Degisiklik toplam tutar ve KDV'yi de gunceller.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setQuantityEditor(null)}><Text style={styles.secondaryButtonText}>Vazgec</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, Boolean(actionBusy) && styles.buttonDisabled]} onPress={saveQuantity} disabled={Boolean(actionBusy)}><Text style={styles.primaryButtonText}>Miktari Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  heroKicker: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { marginTop: 2, fontFamily: fonts.extrabold, fontSize: fontSizes.xl, color: colors.textStrong },
  heroSubtitle: { marginTop: 2, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  refreshIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroMetricRow: { flexDirection: 'row', gap: spacing.sm },
  heroMetric: { flex: 1, minWidth: 0, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  heroMetricValue: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.md, color: colors.textStrong },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  tabs: { flexDirection: 'row', gap: spacing.xs, padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  tabTextActive: { fontFamily: fonts.bold, color: '#0B1F3F' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryButton: { flexGrow: 1, minWidth: 88, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  primaryButtonSmall: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF', fontSize: fontSizes.sm },
  secondaryButton: { flexGrow: 1, minWidth: 84, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.text, fontSize: fontSizes.sm },
  transmittedButton: { flexGrow: 1, minWidth: 84, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(52,211,153,0.30)', backgroundColor: colors.successSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  transmittedButtonText: { fontFamily: fonts.semibold, color: colors.success, fontSize: fontSizes.sm },
  buttonDisabled: { opacity: 0.5 },
  errorCard: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md },
  error: { fontFamily: fonts.medium, color: colors.danger, fontSize: fontSizes.sm },
  section: { gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { minHeight: 42, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  flex: { flex: 1, minWidth: 0 },
  partyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  partyTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  partyName: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  partyCode: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textMuted },
  partyAmountWrap: { alignItems: 'flex-end', flexShrink: 0 },
  partyAmount: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.md, color: colors.textStrong },
  transmittedText: { marginTop: 2, fontFamily: fonts.medium, fontSize: 9, color: colors.success },
  emailInput: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, color: colors.text, fontFamily: fonts.regular, fontSize: fontSizes.sm },
  partyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ordersWrap: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  orderCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.md, gap: spacing.sm },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  orderNumber: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  orderTotal: { flexShrink: 0, fontFamily: fonts.monoSemibold, fontSize: fontSizes.sm, color: colors.textStrong },
  closeAllButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.sm, backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  closeButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  lineCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  lineCardDone: { opacity: 0.6 },
  lineTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  lineCode: { marginTop: 2, fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted },
  remainingBadge: { flexShrink: 0, borderRadius: 999, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  remainingBadgeDone: { backgroundColor: colors.successSoft },
  remainingBadgeText: { fontFamily: fonts.semibold, fontSize: 9, color: colors.warning },
  remainingBadgeTextDone: { color: colors.success },
  lineMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  lineMetric: { flexGrow: 1, minWidth: 74, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm },
  lineMetricLabel: { fontFamily: fonts.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' },
  lineMetricValue: { marginTop: 2, fontFamily: fonts.monoMedium, fontSize: fontSizes.xs, color: colors.text },
  stockRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stockText: { fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textSoft },
  riskText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  lineActions: { flexDirection: 'row', gap: spacing.sm },
  lineEditButton: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.primaryMuted },
  lineEditText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  lineCloseButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', backgroundColor: colors.dangerSoft },
  lineCloseText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  logCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  logIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  listMeta: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: fontSizes.xs },
  helper: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: fontSizes.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.overlay },
  modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundRaised, padding: spacing.lg, gap: spacing.md },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  modalKicker: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.primarySoft, textTransform: 'uppercase' },
  modalTitle: { marginTop: 2, fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.textStrong },
  modalClose: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  modalMetrics: { flexDirection: 'row', gap: spacing.sm },
  inputLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  quantityInput: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, fontFamily: fonts.monoSemibold, fontSize: fontSizes.lg, color: colors.textStrong },
  modalHint: { fontFamily: fonts.regular, fontSize: fontSizes.xs, lineHeight: fontSizes.xs + 5, color: colors.textMuted },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  saveButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#0F9D68', paddingHorizontal: spacing.md },
});
