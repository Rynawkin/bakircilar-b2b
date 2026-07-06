/**
 * Scheduled Jobs Service
 *
 * Runtime-yonetilebilir cron is kayit defteri. Onceden `index.ts` icinde inline
 * `cron.schedule(...)` ile kayitli olan tum periyodik isleri tek bir registry'de
 * toplar; her isin:
 *   - varsayilan zamanlamasi (config'ten),
 *   - Settings.cronOverrides ile canli olarak degistirilebilir zamanlamasi,
 *   - son calisma zamani / sonucu / hatasi (bellek icinde),
 *   - manuel tetikleme (runNow) ve es-zamanlilik korumasi (per-key guard)
 * ozelliklerini yonetir.
 *
 * ONEMLI:
 *  - `initialize()` yalnizca `config.enableCron === true` iken node-cron
 *    gorevlerini kaydeder. enableCron false olsa bile registry + runNow calisir
 *    (manuel tetikleme ve UI listeleme hala mumkun olur).
 *  - Kayit-disi (settings-driven) siparis-takip / e-posta cron'lari bu registry'de
 *    DEGILDIR; onlar index.ts icinde ayri kalir.
 */

import cron, { ScheduledTask } from 'node-cron';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';

import syncService from './sync.service';
import priceSyncService from './priceSync.service';
import quoteService from './quote.service';
import vadeSyncService from './vadeSync.service';
import vadeNotificationService from './vadeNotification.service';
import reportsService from './reports.service';
import customerRecoveryService from './customer-recovery.service';
import productComplementService from './product-complement.service';
import productPopularityService from './product-popularity.service';
import priceListSuggestionService from './price-list-suggestion.service';
import customerActivityService from './customer-activity.service';
import orderTrackingService from './order-tracking.service';
import eInvoiceService from './einvoice.service';
import emailService from './email.service';

export type JobKey =
  | 'stockSync'
  | 'priceSync'
  | 'quoteSync'
  | 'vadeSync'
  | 'vadeReminders'
  | 'marginReport'
  | 'customerRecoveryCache'
  | 'productComplement'
  | 'productPopularity'
  | 'priceListSuggestion'
  | 'analyticsCleanup'
  | 'kioskPendingSync'
  | 'einvoiceImport';

type LastResult = 'OK' | 'ERROR' | 'SKIPPED' | null;

/**
 * Handler donusu:
 *  - void / undefined  => calisti (OK).
 *  - 'SKIPPED' string  => is icten atlandi (or. baska bir sync surerken). Bu durumda
 *    lastResult='SKIPPED' yazilir ve lastRunAt ILERLETILMEZ ("en son gercek calisma").
 */
type JobHandlerResult = void | 'SKIPPED';

interface JobDefinition {
  key: JobKey;
  /** Kullaniciya gorunen Turkce isim. */
  name: string;
  /** Tek satirlik Turkce aciklama. */
  description: string;
  /** config'ten gelen varsayilan cron ifadesi. */
  defaultSchedule: string;
  /** Isin govdesi. Hata firlatabilir; runtime bunu yakalar. */
  handler: () => Promise<JobHandlerResult>;
  /** Bu round'da tum isler duzenlenebilir. */
  editable: boolean;
  /**
   * Kendi bagimsiz ozellik-bayragi. Doluysa ve true donuyorsa, is enableCron=false
   * olsa BILE periyodik cron olarak kaydedilir (eski top-level davranisla uyumluluk;
   * or. e-fatura otomatik ice aktarim ENABLE_CRON'dan bagimsiz calisirdi).
   */
  independentFlag?: () => boolean;
}

interface JobRuntimeState {
  running: boolean;
  lastRunAt: Date | null;
  lastResult: LastResult;
  lastError: string | null;
}

export interface ScheduledJobItem {
  key: JobKey;
  name: string;
  description: string;
  /** Yururlukteki (efektif) zamanlama: override varsa o, yoksa default. */
  schedule: string;
  defaultSchedule: string;
  /** Settings.cronOverrides icinde bu key icin bir deger var mi? */
  isOverride: boolean;
  editable: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastResult: LastResult;
  lastError: string | null;
}

const getDateInTimeZone = (date: Date, timeZone: string): Date => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const getYesterdayInTimeZone = (timeZone: string): Date => {
  const today = getDateInTimeZone(new Date(), timeZone);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  return yesterday;
};

class ScheduledJobsService {
  private timezone: string = config.cronTimezone;
  private cronEnabled: boolean = false;
  private initialized: boolean = false;

  /** Registry (kayit defteri). Sabit; her zaman doludur. */
  private readonly definitions = new Map<JobKey, JobDefinition>();
  /** Bellek-ici calisma durumu (per-key). */
  private readonly state = new Map<JobKey, JobRuntimeState>();
  /** Aktif node-cron gorev handle'lari (stop/re-register icin). */
  private readonly tasks = new Map<JobKey, ScheduledTask>();
  /** Settings.cronOverrides'in bellek-ici kopyasi (initialize'da bir kez okunur). */
  private overrides: Record<string, string> = {};

  constructor() {
    this.registerDefinitions();
  }

  // ==================== JOB TANIMLARI ====================

  private registerDefinitions() {
    const defs: JobDefinition[] = [
      {
        key: 'stockSync',
        name: 'Stok Senkronizasyonu',
        description: 'Mikro ERP’den stok, fiyat ve maliyet verilerini B2B veritabanina cekerek gunceller.',
        defaultSchedule: config.syncCronSchedule,
        editable: true,
        handler: async () => {
          // startSync hem kilit uygular hem de gercek bir syncLog olusturur.
          await syncService.startSync('AUTO');
        },
      },
      {
        key: 'priceSync',
        name: 'Fiyat Senkronizasyonu',
        description: 'Mikro’daki fiyat/maliyet degisimlerini isler; stok senkronu calisirken atlar.',
        defaultSchedule: config.priceSyncCronSchedule,
        editable: true,
        handler: async () => {
          // Stok senkronu ile ayni Mikro baglantisini paylastiklari icin,
          // stok senkronu devam ederken fiyat senkronu baglantiyi kesmemeli; bu turu atla.
          if (syncService.isBusy()) {
            console.warn('⏳ Stok senkronu calisiyor; fiyat senkronu bu tur atlandi (cakisma onleme).');
            return 'SKIPPED';
          }
          const result = await priceSyncService.syncPriceChanges();
          if (result.success) {
            console.log('Automatic price sync completed:', result.recordsSynced);
          } else {
            console.error('Automatic price sync failed:', result.error);
            throw new Error(result.error || 'Fiyat senkronu basarisiz');
          }
        },
      },
      {
        key: 'quoteSync',
        name: 'Teklif Senkronizasyonu',
        description: 'Mikro’daki teklifleri B2B tarafina senkronize eder.',
        defaultSchedule: config.quoteSyncCronSchedule,
        editable: true,
        handler: async () => {
          const result = await quoteService.syncQuotesFromMikro();
          console.log('Quote sync completed:', result);
        },
      },
      {
        key: 'vadeSync',
        name: 'Vade Senkronizasyonu',
        description: 'Mikro’dan cari bakiye/vade takip verilerini senkronize eder.',
        defaultSchedule: config.vadeSyncCronSchedule,
        editable: true,
        handler: async () => {
          if (config.vadeSyncAutoDisabled) {
            console.log('Vade sync skipped: VADE_SYNC_AUTO_DISABLED is enabled. Excel import remains authoritative.');
            return;
          }
          const result = await vadeSyncService.syncFromMikro('AUTO');
          if (!result.success) {
            console.error('Vade sync failed:', result.error);
            throw new Error(result.error || 'Vade senkronu basarisiz');
          }
          console.log('Vade sync completed:', result);
        },
      },
      {
        key: 'vadeReminders',
        name: 'Vade Hatirlatmalari',
        description: 'Vade notu hatirlatma bildirimlerini gonderir.',
        defaultSchedule: config.vadeReminderCronSchedule,
        editable: true,
        handler: async () => {
          const result = await vadeNotificationService.processNoteReminders();
          if (result.notified > 0) {
            console.log('Vade reminders sent:', result.notified);
          }
        },
      },
      {
        key: 'marginReport',
        name: 'Kar Marji Raporu',
        description: 'Onceki gun icin marj uyum raporunu uretir ve alicilara e-posta gonderir.',
        defaultSchedule: config.marginReportCronSchedule,
        editable: true,
        handler: async () => {
          const reportDate = getYesterdayInTimeZone(this.timezone);
          const syncResult = await reportsService.syncMarginComplianceReportForDate(reportDate);
          if (!syncResult.success) {
            console.error('Margin compliance report sync failed:', syncResult.error);
            throw new Error(syncResult.error || 'Marj raporu senkronu basarisiz');
          }
          console.log(`Margin compliance report synced: ${syncResult.rowCount} rows for ${syncResult.reportDate}`);

          const settings = await prisma.settings.findFirst({
            orderBy: [
              { updatedAt: 'desc' },
              { createdAt: 'desc' },
            ],
          });
          const recipients = settings?.marginReportEmailRecipients || [];
          if (!settings?.marginReportEmailEnabled || recipients.length === 0) {
            console.log('Margin compliance report email disabled or no recipients configured.');
            return;
          }

          const emailPayload = await reportsService.buildMarginComplianceEmailPayload(
            reportDate,
            settings?.marginReportEmailColumns || []
          );

          await emailService.sendMarginComplianceReportSummary({
            recipients,
            reportDate,
            summary: emailPayload.summary,
            subject: settings?.marginReportEmailSubject || undefined,
            attachment: emailPayload.attachment,
          });
        },
      },
      {
        key: 'customerRecoveryCache',
        name: 'Cari Kurtarma Onbellek Isitma',
        description: 'Kaybedilen/pasif cari raporu icin gunluk tarihsel deger onbellegini isitir.',
        defaultSchedule: config.customerRecoveryHistoricalCronSchedule,
        editable: true,
        handler: async () => {
          customerRecoveryService.clearHistoricalValueCache();
          const result = await customerRecoveryService.warmHistoricalValueDailyCache();
          console.log('Customer recovery historical cache warmed:', result);
        },
      },
      {
        key: 'productComplement',
        name: 'Tamamlayici Urun Onerileri',
        description: 'Capraz satis (tamamlayici urun) otomatik onerilerini yeniden hesaplar.',
        defaultSchedule: config.productComplementCronSchedule,
        editable: true,
        handler: async () => {
          const result = await productComplementService.syncAutoRecommendations();
          console.log('Product complement sync completed:', result);
        },
      },
      {
        key: 'productPopularity',
        name: 'Populer Urun Onbellegi',
        description: 'En cok satan urunler onbellegini yeniler.',
        defaultSchedule: config.productPopularityCronSchedule,
        editable: true,
        handler: async () => {
          const result = await productPopularityService.refreshPopularSales();
          console.log('Product popularity refresh completed:', result);
        },
      },
      {
        key: 'priceListSuggestion',
        name: 'Onerilen Fiyat Listesi Motoru',
        description: 'Her cari icin onerilen fiyat listesini yeniden hesaplar.',
        defaultSchedule: config.priceListSuggestionCronSchedule,
        editable: true,
        handler: async () => {
          const result = await priceListSuggestionService.runForAllCustomers();
          console.log('Price list suggestion run completed:', result);
        },
      },
      {
        key: 'analyticsCleanup',
        name: 'Analitik Veri Temizligi',
        description: 'Saklama suresini asan musteri aktivite olaylarini siler.',
        defaultSchedule: config.analyticsCleanupCronSchedule,
        editable: true,
        handler: async () => {
          const result = await customerActivityService.cleanupOldEvents(config.analyticsRetentionDays);
          if (result.deleted > 0) {
            console.log('Customer activity cleanup removed records:', result.deleted);
          }
        },
      },
      {
        key: 'kioskPendingSync',
        name: 'Depo Kiosk Siparis Senkronu',
        description: 'Depo kiosk icin bekleyen siparisleri Mikro’dan senkronize eder.',
        defaultSchedule: config.orderTrackingKioskSyncCronSchedule,
        editable: true,
        handler: async () => {
          return await this.runKioskPendingOrderSync('CRON');
        },
      },
      {
        key: 'einvoiceImport',
        name: 'E-Fatura Otomatik Ice Aktarim',
        description: 'Belirlenen dizinden e-fatura belgelerini otomatik ice aktarir.',
        defaultSchedule: config.einvoiceAutoImportCronSchedule,
        editable: true,
        // Eski davranis: e-fatura ice aktarim cron'u ENABLE_CRON'dan BAGIMSIZ, sadece
        // kendi bayragina bagliydi (index.ts top-level `if (einvoiceAutoImportEnabled)`).
        // enableCron=false + bu bayrak=true iken periyodik calismaya devam etmeli.
        independentFlag: () => config.einvoiceAutoImportEnabled,
        handler: async () => {
          const result = await eInvoiceService.importDocumentsFromDirectory();
          console.log('E-invoice auto import completed:', {
            scanned: result.scanned,
            processed: result.processed,
            uploaded: result.uploaded,
            updated: result.updated,
            skippedExisting: result.skippedExisting,
            failed: result.failed,
          });
        },
      },
    ];

    for (const def of defs) {
      this.definitions.set(def.key, def);
      this.state.set(def.key, {
        running: false,
        lastRunAt: null,
        lastResult: null,
        lastError: null,
      });
    }
  }

  // ==================== KIOSK SYNC (in-progress flag bu servisin icinde) ====================

  private kioskSyncInProgress = false;

  private async runKioskPendingOrderSync(source: 'CRON' | 'BOOT'): Promise<JobHandlerResult> {
    if (this.kioskSyncInProgress) {
      console.log(`⏭️ Kiosk siparis sync atlandi (${source}) - onceki islem devam ediyor`);
      return 'SKIPPED';
    }

    this.kioskSyncInProgress = true;
    try {
      console.log(`🧭 Kiosk siparis sync basladi (${source})...`);
      const result = await orderTrackingService.syncPendingOrders();
      if (result.success) {
        console.log(
          `✅ Kiosk siparis sync tamamlandi (${source}) - Siparis: ${result.ordersCount}, Musteri: ${result.customersCount}`
        );
      } else {
        console.error(`❌ Kiosk siparis sync basarisiz (${source}):`, result.message);
        throw new Error(result.message || 'Kiosk siparis senkronu basarisiz');
      }
    } finally {
      this.kioskSyncInProgress = false;
    }
  }

  // ==================== INITIALIZE ====================

  /**
   * Registry'yi ayaga kaldirir. cronEnabled true ise node-cron gorevlerini kaydeder.
   * Settings.cronOverrides bir kez okunur; efektif zamanlama = override ?? default.
   *
   * enableCron false olsa bile registry + runNow calisir (gorev kaydedilmez).
   */
  async initialize(options: { timezone: string; enabled: boolean }): Promise<void> {
    this.timezone = options.timezone || config.cronTimezone;
    this.cronEnabled = !!options.enabled;
    this.overrides = await this.loadOverrides();

    if (!this.cronEnabled) {
      console.log('⏸️ Cron devre disi - is kayit defteri yalnizca manuel tetikleme (runNow) icin aktif.');
    }

    for (const [key, def] of this.definitions.entries()) {
      // kiosk sync yalnizca ozel bayrak aciksa periyodik kaydedilir;
      // eski davranisla uyumlu kalmak icin bayrak kapaliysa gorev kaydetme
      // (ama registry + runNow yine calisir).
      if (key === 'kioskPendingSync' && !config.orderTrackingKioskSyncEnabled) {
        if (this.cronEnabled) console.log('⏸️ Kiosk pending-orders sync cron job devre disi');
        continue;
      }
      if (key === 'einvoiceImport' && !config.einvoiceAutoImportEnabled) {
        console.log('⏸️ E-fatura otomatik ice aktarim cron job devre disi');
        continue;
      }

      // Bir is su durumlarda CANLI cron olarak kaydedilir:
      //  - enableCron true ise (normal kapi), VEYA
      //  - kendi bagimsiz bayragi true ise (or. e-fatura ice aktarim: eski top-level
      //    davranista ENABLE_CRON'dan bagimsiz calisirdi).
      const registerAsLiveCron = this.cronEnabled || def.independentFlag?.() === true;
      if (!registerAsLiveCron) continue;

      this.registerTask(key);
    }

    this.initialized = true;
  }

  /**
   * Process baslar baslamaz kiosk siparis verisini isitir (eski BOOT davranisi).
   * Registry'nin kiosk in-progress bayragini paylasir; hata firlatmaz.
   * index.ts bunu enableCron && orderTrackingKioskSyncEnabled iken bir kez cagirir.
   */
  runKioskBootSync(): void {
    this.runKioskPendingOrderSync('BOOT').catch((error) => {
      console.error('❌ Kiosk siparis boot sync hatasi:', error);
    });
  }

  /** Settings.cronOverrides'i guvenle okur ({ [key]: cronExpr }). */
  private async loadOverrides(): Promise<Record<string, string>> {
    try {
      const settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        select: { cronOverrides: true },
      });
      return this.normalizeOverrides(settings?.cronOverrides);
    } catch (error) {
      console.error('cronOverrides yuklenemedi, varsayilanlarla devam ediliyor:', error);
      return {};
    }
  }

  private normalizeOverrides(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (this.definitions.has(k as JobKey) && typeof v === 'string' && v.trim()) {
          out[k] = v.trim();
        }
      }
    }
    return out;
  }

  /** Bir isin yururlukteki (efektif) cron ifadesi. */
  private effectiveSchedule(key: JobKey): string {
    const def = this.definitions.get(key)!;
    const override = this.overrides[key];
    return override && override.trim() ? override.trim() : def.defaultSchedule;
  }

  /** node-cron gorevini olusturur/yeniden olusturur. Onceki handle varsa durdurur. */
  private registerTask(key: JobKey) {
    const def = this.definitions.get(key);
    if (!def) return;

    // Eski handle'i temizle.
    const existing = this.tasks.get(key);
    if (existing) {
      try {
        existing.stop();
      } catch {
        /* yoksay */
      }
      this.tasks.delete(key);
    }

    const schedule = this.effectiveSchedule(key);
    if (!cron.validate(schedule)) {
      console.error(`❌ Gecersiz cron ifadesi (${key}): "${schedule}" - gorev kaydedilmedi.`);
      return;
    }

    const task = cron.schedule(
      schedule,
      async () => {
        // Zamanlanmis tetikleme de runNow ile ayni es-zamanlilik korumasindan gecer.
        await this.executeJob(key);
      },
      { timezone: this.timezone, name: `job:${key}` }
    );

    this.tasks.set(key, task);
    console.log(`🕐 [cron] ${key} kaydedildi - plan: ${schedule} (TZ: ${this.timezone})`);
  }

  // ==================== CALISTIRMA (ortak) ====================

  /**
   * Isi es-zamanlilik korumasi ile calistirir. Asla caller'a hata firlatmaz;
   * hatayi yakalar ve lastResult/lastError'e yazar.
   * @returns { started, alreadyRunning }
   */
  private async executeJob(key: JobKey): Promise<{ started: boolean; alreadyRunning: boolean }> {
    const def = this.definitions.get(key);
    const st = this.state.get(key);
    if (!def || !st) {
      return { started: false, alreadyRunning: false };
    }

    if (st.running) {
      console.log(`⏭️ [job] ${key} atlandi - onceki calisma devam ediyor.`);
      return { started: false, alreadyRunning: true };
    }

    st.running = true;
    try {
      const result = await def.handler();
      if (result === 'SKIPPED') {
        // Is icten atlandi (or. baska sync surerken). "En son gercek calisma"
        // gostergesini bozmamak icin lastRunAt ILERLETILMEZ.
        st.lastResult = 'SKIPPED';
        st.lastError = null;
      } else {
        st.lastRunAt = new Date();
        st.lastResult = 'OK';
        st.lastError = null;
      }
    } catch (error: any) {
      st.lastRunAt = new Date();
      st.lastResult = 'ERROR';
      st.lastError = error?.message ? String(error.message) : String(error);
      console.error(`❌ [job] ${key} hata:`, error);
    } finally {
      st.running = false;
    }

    return { started: true, alreadyRunning: false };
  }

  // ==================== PUBLIC API ====================

  /** Registry'nin contract sekline serilestirilmis halini dondurur. */
  getJobs(): { jobs: ScheduledJobItem[] } {
    const jobs: ScheduledJobItem[] = [];
    for (const def of this.definitions.values()) {
      jobs.push(this.buildJobItem(def.key));
    }
    return { jobs };
  }

  /** Tek bir isin contract seklindeki item'i. */
  private buildJobItem(key: JobKey): ScheduledJobItem {
    const def = this.definitions.get(key)!;
    const st = this.state.get(key)!;
    const override = this.overrides[key];
    const isOverride = !!(override && override.trim());
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      schedule: this.effectiveSchedule(key),
      defaultSchedule: def.defaultSchedule,
      isOverride,
      editable: def.editable,
      running: st.running,
      lastRunAt: st.lastRunAt ? st.lastRunAt.toISOString() : null,
      lastResult: st.lastResult,
      lastError: st.lastError,
    };
  }

  /**
   * Isi manuel (fire-and-forget) calistirir. Zaten calisiyorsa alreadyRunning:true doner.
   * Caller beklemez; hata icerde yakalanir. Bilinmeyen key => 404 AppError.
   * Route param'i string oldugu icin string kabul edip icerde daraltiyoruz.
   */
  runNow(rawKey: string): { started: boolean; alreadyRunning: boolean } {
    const key = this.assertJobKey(rawKey);
    const st = this.state.get(key)!;

    if (st.running) {
      return { started: false, alreadyRunning: true };
    }

    // Fire-and-forget: executeJob kendi icinde hata yakalar, promise'i beklemeyiz.
    void this.executeJob(key);
    return { started: true, alreadyRunning: false };
  }

  /** Route param string'ini gecerli bir JobKey'e daraltir; degilse 404 firlatir. */
  private assertJobKey(rawKey: string): JobKey {
    if (this.definitions.has(rawKey as JobKey)) {
      return rawKey as JobKey;
    }
    throw new AppError('Bilinmeyen is anahtari', 404, ErrorCode.NOT_FOUND, { key: rawKey });
  }

  /**
   * Bir isin zamanlamasini gunceller.
   *  - scheduleOrNull === null  => override'i kaldir (default'a don).
   *  - gecerli cron ifadesi     => override olarak kaydet.
   * Settings.cronOverrides icine merge/delete eder, canli gorevi durdurup yeniden kaydeder,
   * guncel item'i dondurur. Gecersiz ifade => 400 AppError.
   */
  async setSchedule(rawKey: string, scheduleOrNull: string | null): Promise<{ job: ScheduledJobItem }> {
    const key = this.assertJobKey(rawKey);
    const def = this.definitions.get(key)!;
    if (!def.editable) {
      throw new AppError('Bu is duzenlenemez', 400, ErrorCode.BAD_REQUEST, { key });
    }

    let normalized: string | null = null;
    if (scheduleOrNull !== null && scheduleOrNull !== undefined) {
      normalized = String(scheduleOrNull).trim();
      if (!normalized) {
        // Bos string => default'a don.
        normalized = null;
      } else if (!cron.validate(normalized)) {
        throw new AppError('Gecersiz cron ifadesi', 400, ErrorCode.VALIDATION_ERROR, {
          key,
          schedule: normalized,
        });
      }
    }

    // Persist: Settings.cronOverrides merge/delete.
    await this.persistOverride(key, normalized);

    // Bellek-ici override haritasini guncelle.
    if (normalized) {
      this.overrides[key] = normalized;
    } else {
      delete this.overrides[key];
    }

    // Canli gorevi yeniden kaydet. Kayit sarti initialize() ile ayni: enableCron true
    // VEYA isin kendi bagimsiz bayragi true; ve is kendi bayragiyla kapatilmamis olmali.
    const registerAsLiveCron = this.cronEnabled || def.independentFlag?.() === true;
    if (registerAsLiveCron && this.isPeriodicallyRegisterable(key)) {
      this.registerTask(key);
    }

    return { job: this.buildJobItem(key) };
  }

  /**
   * kiosk/einvoice isleri kendi bayraklariyla kapatilmis olabilir; kapaliysa
   * periyodik gorev kaydedilmez (ama override yine persist edilir ve bayrak
   * acildiginda sonraki initialize'da devreye girer).
   */
  private isPeriodicallyRegisterable(key: JobKey): boolean {
    if (key === 'kioskPendingSync' && !config.orderTrackingKioskSyncEnabled) return false;
    if (key === 'einvoiceImport' && !config.einvoiceAutoImportEnabled) return false;
    return true;
  }

  /** Settings.cronOverrides icine tek bir key'i merge/delete eder. */
  private async persistOverride(key: JobKey, schedule: string | null): Promise<void> {
    let settings = await prisma.settings.findFirst({
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const current = this.normalizeOverrides(settings?.cronOverrides);
    if (schedule) {
      current[key] = schedule;
    } else {
      delete current[key];
    }

    // Bos obje ise Json alanini DB'de null'a set et (temiz kalsin); aksi halde obje yaz.
    // Prisma nullable Json alanini null yapmak icin `Prisma.JsonNull` sentinel'i gerektirir.
    const hasAny = Object.keys(current).length > 0;

    if (!settings) {
      await prisma.settings.create({
        data: {
          cronOverrides: hasAny ? (current as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    } else {
      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          cronOverrides: hasAny ? (current as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    }
  }
}

export default new ScheduledJobsService();
