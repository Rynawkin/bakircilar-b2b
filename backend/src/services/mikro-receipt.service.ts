import { randomUUID } from 'crypto';
import { config } from '../config';
import mikroService from './mikro.service';

/**
 * Online odeme (Ziraat PayByLink) -> Mikro tahsilat makbuzu.
 *
 * Guvenlik ilkeleri:
 * - Mikro'ya YAZAR. Yalniz config.mikroReceipt.enabled=true iken calisir; aksi halde no-op.
 * - Template-bazli: bilinen-iyi (iptal/gizli olmayan, dogru yon/cins) son tahsilat makbuzu SELECT
 *   edilir; bilinmeyen tum alanlar ondan kopyalanir. Muhasebe acisindan anlamli alanlar (yon,
 *   cari, tutar, hesap, sorumluluk merkezi, plasiyer, tarih, referans) DETERMINISTIK override edilir.
 * - Tum string override'lari gercek kolon genisligine (sys.columns) kirpar; Mikro surum farkinda
 *   veya uzun deger INSERT'i XACT_ABORT ile patlatamaz.
 * - Idempotent: makbuz cha_belge_no'ya yazilir; ayni orderId ikinci kez yazilmaz (Mikro'da unique
 *   index yok -> koruma hem batch icinde IF EXISTS ile hem uygulama tarafinda PaymentEvent ile yapilir).
 * - Sira no atomik: tek batch icinde UPDLOCK+HOLDLOCK ile seri bazli MAX+1 alinip INSERT edilir
 *   (tum tabloyu kilitleyen TABLOCKX kullanilmaz).
 * - Karsi hesap (banka/POS) cha_kasa_hizkod alanindadir; bu kurulumda BANKA_HAREKETLERI yok, Mikro
 *   kasa/banka ayagini bu tek cari hareket satirindan uretir.
 */

type ReceiptInput = {
  orderId: string;
  customerCode: string | null;
  amount: number;
  description?: string | null;
};

export type ReceiptResult = {
  documentNo: string;
  guid: string | null;
  alreadyExists: boolean;
};

export class MikroReceiptError extends Error {
  constructor(message: string, public readonly code = 'MIKRO_RECEIPT_ERROR') {
    super(message);
    this.name = 'MikroReceiptError';
  }
}

type ColumnMeta = { name: string; charLength: number | null };

const escapeSql = (value: unknown) => String(value ?? '').replace(/'/g, "''");
const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const normalizeCode = (value: unknown) => String(value ?? '').trim();
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Template satirindan tasinmamasi gereken/yeniden uretilecek alanlar.
const OVERRIDDEN_COLUMNS = new Set([
  'cha_Guid', 'cha_evrakno_seri', 'cha_evrakno_sira', 'cha_satir_no', 'cha_belge_no',
  'cha_tarihi', 'cha_belge_tarih', 'cha_vade', 'cha_kod', 'cha_meblag', 'cha_aratoplam',
  'cha_kasa_hizkod', 'cha_kasa_hizmet', 'cha_cinsi', 'cha_tip', 'cha_evrak_tip', 'cha_aciklama',
  'cha_satici_kodu', 'cha_srmrkkodu', 'cha_karsisrmrkkodu', 'cha_altmeblag', 'cha_trefno',
  'cha_create_user', 'cha_lastup_user', 'cha_create_date', 'cha_lastup_date',
  'cha_iptal', 'cha_hidden', 'cha_kilitli', 'cha_degisti', 'cha_fileid',
]);

class MikroReceiptService {
  private columnMetaCache: Map<string, ColumnMeta> | null = null;

  isEnabled() {
    return config.mikroReceipt.enabled;
  }

  private async getColumnMeta(): Promise<Map<string, ColumnMeta>> {
    if (this.columnMetaCache) return this.columnMetaCache;
    const rows = await mikroService.executeQuery(`
      SELECT c.name AS name,
        CASE
          WHEN c.max_length < 0 THEN NULL
          WHEN t.name IN ('nvarchar','nchar') THEN c.max_length / 2
          WHEN t.name IN ('varchar','char') THEN c.max_length
          ELSE NULL
        END AS charLength
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.CARI_HESAP_HAREKETLERI')
        AND c.is_identity = 0 AND c.is_computed = 0
        AND t.name NOT IN ('timestamp','rowversion')
    `);
    const map = new Map<string, ColumnMeta>();
    for (const r of rows as any[]) {
      const name = String(r.name || '').trim();
      if (!name) continue;
      map.set(name, { name, charLength: r.charLength === null || r.charLength === undefined ? null : Number(r.charLength) });
    }
    if (!map.size) throw new MikroReceiptError('Kolon meta okunamadi.', 'COLUMN_META_FAILED');
    this.columnMetaCache = map;
    return map;
  }

  private fit(meta: Map<string, ColumnMeta>, column: string, value: string): string {
    const len = meta.get(column)?.charLength;
    return len && len > 0 ? value.slice(0, len) : value;
  }

  private sqlLiteral(value: unknown): string {
    if (value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>)) {
      return String((value as { raw: string }).raw);
    }
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) {
      const p = (n: number, s = 2) => String(n).padStart(s, '0');
      return `'${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())} ${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}.${p(value.getMilliseconds(), 3)}'`;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /** Idempotency belge anahtari; kolon genisligine (nvarchar 50) sigar, benzersiz kuyruk (hex) korunur. */
  private belgeNo(meta: Map<string, ColumnMeta>, orderId: string) {
    return this.fit(meta, 'cha_belge_no', `B2B-${normalizeCode(orderId)}`);
  }

  /** Bu orderId icin Mikro'da makbuz zaten var mi? (idempotency, dirty-read yok) */
  async findExisting(orderId: string): Promise<ReceiptResult | null> {
    const meta = await this.getColumnMeta();
    const belgeNo = this.belgeNo(meta, orderId);
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1 cha_evrakno_seri AS seri, cha_evrakno_sira AS sira
      FROM CARI_HESAP_HAREKETLERI
      WHERE cha_belge_no = '${escapeSql(belgeNo)}'
    `);
    if (!rows.length) return null;
    return { documentNo: `${rows[0].seri}-${rows[0].sira}`, guid: null, alreadyExists: true };
  }

  private async loadTemplate(): Promise<Record<string, unknown>> {
    const cinsi = config.mikroReceipt.cinsi;
    const base = `cha_cinsi = ${cinsi} AND cha_evrak_tip = 1 AND cha_tip = 1 AND cha_meblag > 0 AND cha_iptal = 0 AND cha_hidden = 0`;
    let rows = await mikroService.executeQuery(`
      SELECT TOP 1 * FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      WHERE ${base} ORDER BY cha_create_date DESC
    `);
    if (!rows.length) {
      rows = await mikroService.executeQuery(`
        SELECT TOP 1 * FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK)
        WHERE cha_cinsi = ${cinsi} AND cha_evrak_tip = 1 AND cha_tip = 1 AND cha_iptal = 0 AND cha_hidden = 0
        ORDER BY cha_create_date DESC
      `);
    }
    if (!rows.length) {
      throw new MikroReceiptError('Tahsilat makbuzu sablonu bulunamadi (cinsi=' + cinsi + ').', 'TEMPLATE_NOT_FOUND');
    }
    return rows[0];
  }

  private async assertCustomerExists(customerCode: string) {
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1 cari_kod FROM CARI_HESAPLAR WITH (NOLOCK)
      WHERE cari_kod = '${escapeSql(customerCode)}'
    `);
    if (!rows.length) {
      throw new MikroReceiptError('Mikro cari kodu bulunamadi: ' + customerCode, 'CUSTOMER_NOT_FOUND');
    }
  }

  /**
   * Tahsilat makbuzunu Mikro'ya yazar. enabled=false ise no-op (null doner).
   * Idempotent: ayni orderId ikinci cagrida mevcut makbuzu doner, yeni yazmaz.
   */
  async writeCollectionReceipt(input: ReceiptInput): Promise<ReceiptResult | null> {
    if (!config.mikroReceipt.enabled) return null;

    const customerCode = normalizeCode(input.customerCode);
    const amount = round2(toNumber(input.amount));
    if (!customerCode) throw new MikroReceiptError('Makbuz icin cari kodu yok.', 'CUSTOMER_CODE_MISSING');
    if (!(amount > 0)) throw new MikroReceiptError('Makbuz tutari gecersiz.', 'AMOUNT_INVALID');

    const meta = await this.getColumnMeta();
    const has = (c: string) => meta.has(c);

    const existing = await this.findExisting(input.orderId);
    if (existing) return existing;

    await this.assertCustomerExists(customerCode);
    const template = await this.loadTemplate();

    const guid = randomUUID();
    const series = this.fit(meta, 'cha_evrakno_seri', config.mikroReceipt.series);
    const belgeNo = this.belgeNo(meta, input.orderId);
    const aciklama = this.fit(meta, 'cha_aciklama', String(input.description || `B2B ${input.orderId}`));
    const templateUser = Math.trunc(toNumber((template as any).cha_create_user));
    const userNo = Math.max(templateUser, config.mikroReceipt.userNo);
    const srmrk = config.mikroReceipt.srmrkKodu
      ? this.fit(meta, 'cha_srmrkkodu', config.mikroReceipt.srmrkKodu)
      : normalizeCode((template as any).cha_srmrkkodu);

    // Template'i temel al; override alanlarini disla.
    const values: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(template)) {
      if (!has(col) || OVERRIDDEN_COLUMNS.has(col)) continue;
      // Template'ten gelen string degerleri de kolon genisligine kirp (guvenlik).
      values[col] = typeof val === 'string' ? this.fit(meta, col, val) : val;
    }
    Object.assign(values, {
      cha_Guid: { raw: `CAST('${guid}' as uniqueidentifier)` },
      cha_evrakno_seri: series,
      // cha_evrakno_sira: asagida @sira ile atomik atanir
      cha_satir_no: 0,
      cha_belge_no: belgeNo,
      cha_tarihi: { raw: 'GETDATE()' },
      cha_belge_tarih: { raw: 'GETDATE()' },
      // cha_vade INT (YYYYMMDD) - datetime DEGIL.
      cha_vade: { raw: 'CONVERT(int, CONVERT(varchar(8), GETDATE(), 112))' },
      cha_kod: this.fit(meta, 'cha_kod', customerCode),
      cha_meblag: amount,
      cha_aratoplam: amount,
      cha_kasa_hizkod: this.fit(meta, 'cha_kasa_hizkod', config.mikroReceipt.account),
      cha_kasa_hizmet: config.mikroReceipt.kasaHizmet,
      cha_cinsi: config.mikroReceipt.cinsi,
      // Yon/evrak tipini template'ten bagimsiz sabitle (tahsilat makbuzu).
      cha_tip: 1,
      cha_evrak_tip: 1,
      cha_aciklama: aciklama,
      // Online odeme belirli bir plasiyere atfedilmez; template'in plasiyerini miras alma.
      cha_satici_kodu: '',
      cha_trefno: '',
      cha_iptal: 0,
      cha_hidden: 0,
      cha_kilitli: 0,
      cha_degisti: 0,
      cha_create_user: userNo,
      cha_lastup_user: userNo,
      cha_create_date: { raw: 'GETDATE()' },
      cha_lastup_date: { raw: 'GETDATE()' },
    });
    if (has('cha_srmrkkodu')) values.cha_srmrkkodu = srmrk;
    if (has('cha_karsisrmrkkodu')) values.cha_karsisrmrkkodu = this.fit(meta, 'cha_karsisrmrkkodu', srmrk);
    // Raporlama dovizi tutarini yeni tutara gore tutarli tut (TL islemde altd_kur=1 -> altmeblag=amount).
    if (has('cha_altmeblag')) {
      const altKur = toNumber((template as any).cha_d_kur) === 1 ? toNumber((template as any).cha_altd_kur) : 0;
      values.cha_altmeblag = altKur > 0 ? round2(amount / altKur) : 0;
    }

    // Atomik: seri bazli MAX(sira)+1 al ve ayni transaction'da INSERT et. Mukerrer korumasi IF EXISTS.
    const insertColumns = Object.keys(values).filter((c) => has(c));
    const columnList = ['cha_evrakno_sira', ...insertColumns].map((c) => `[${c}]`).join(', ');
    const valueList = ['@sira', ...insertColumns.map((c) => this.sqlLiteral(values[c]))].join(', ');

    const batch = `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM CARI_HESAP_HAREKETLERI WITH (UPDLOCK, HOLDLOCK) WHERE cha_belge_no = '${escapeSql(belgeNo)}')
BEGIN
  ROLLBACK TRANSACTION;
  SELECT CAST(-1 AS INT) AS sira, CAST(1 AS INT) AS duplicate;
END
ELSE
BEGIN
  DECLARE @sira INT;
  -- Unique index NDX_..._04 = (cha_evrak_tip, cha_evrakno_seri, cha_evrakno_sira, cha_satir_no).
  -- Sira sayaci bu index prefix'iyle (evrak_tip=1 + seri) hesaplanmali.
  SELECT @sira = ISNULL(MAX(cha_evrakno_sira), 0) + 1
    FROM CARI_HESAP_HAREKETLERI WITH (UPDLOCK, HOLDLOCK)
    WHERE cha_evrak_tip = 1 AND cha_evrakno_seri = '${escapeSql(series)}';
  INSERT INTO CARI_HESAP_HAREKETLERI (${columnList}) VALUES (${valueList});
  COMMIT TRANSACTION;
  SELECT @sira AS sira, CAST(0 AS INT) AS duplicate;
END`;

    const rows = await mikroService.executeQuery(batch);
    const row = rows[0] || {};
    if (Number(row.duplicate) === 1) {
      const again = await this.findExisting(input.orderId);
      if (again) return again;
      throw new MikroReceiptError('Makbuz mukerrer tespit edildi ama bulunamadi.', 'DUPLICATE_RACE');
    }
    const sira = Math.trunc(toNumber(row.sira));
    if (!sira || sira <= 0) {
      throw new MikroReceiptError('Makbuz sira numarasi alinamadi.', 'SEQUENCE_FAILED');
    }
    return { documentNo: `${series}-${sira}`, guid, alreadyExists: false };
  }
}

export default new MikroReceiptService();
