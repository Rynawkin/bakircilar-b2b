import { config } from '../config';
import { prisma } from '../utils/prisma';
import mikroService from '../services/mikro.service';
import { parseTier6Cutover } from '../utils/tier6-cutover';

type MikroDefinitionRow = Record<string, unknown> & {
  sfl_sirano: number;
  sfl_aciklama: string | null;
  sfl_iptal: boolean | number | null;
};

const DEFINITION_BEHAVIOR_FIELDS = [
  'sfl_DBCno',
  'sfl_SpecRECno',
  'sfl_iptal',
  'sfl_fileid',
  'sfl_hidden',
  'sfl_kilitli',
  'sfl_degisti',
  'sfl_checksum',
  'sfl_special1',
  'sfl_special2',
  'sfl_special3',
  'sfl_fiyatuygulama',
  'sfl_fiyatformul',
  'sfl_odepluygulama',
  'sfl_odeplformul',
  'sfl_sabit_odeme_plani',
  'sfl_kdvdahil',
  'sfl_ilktarih',
  'sfl_sontarih',
  'sfl_yerineuygulanacakfiyat',
  'sfl_kurhesaplamasekli',
  'sfl_doviz_uygulama',
  'sfl_sabit_doviz',
  'sfl_iskonto_uygulama',
  'sfl_sabit_iskonto',
  'sfl_sabit_kur',
  'sfl_kampanya_uygulama',
  'sfl_sabit_kampanya',
  'sfl_kampanya_vade_gozardi',
  'sfl_kampanya_iskonto_gozardi',
  'sfl_otvdahil',
  'sfl_oivdahil',
] as const;

const PRICE_ROW_COMPARISON_COLUMNS = [
  'sfiyat_DBCno',
  'sfiyat_SpecRECno',
  'sfiyat_iptal',
  'sfiyat_fileid',
  'sfiyat_hidden',
  'sfiyat_kilitli',
  'sfiyat_degisti',
  'sfiyat_checksum',
  'sfiyat_create_user',
  'sfiyat_lastup_user',
  'sfiyat_special1',
  'sfiyat_special2',
  'sfiyat_special3',
  'sfiyat_stokkod',
  'sfiyat_deposirano',
  'sfiyat_odemeplan',
  'sfiyat_birim_pntr',
  'sfiyat_fiyati',
  'sfiyat_doviz',
  'sfiyat_iskontokod',
  'sfiyat_deg_nedeni',
  'sfiyat_primyuzdesi',
  'sfiyat_kampanyakod',
  'sfiyat_doviz_kuru',
].join(', ');

const fail = (message: string): never => {
  throw new Error(`PRICE_LIST_TIER6_NOT_READY: ${message}`);
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const comparableValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
};

const assertDefinitionParity = (
  definitions: MikroDefinitionRow[],
  sourceListNo: number,
  targetListNo: number
) => {
  const sourceRows = definitions.filter(
    (row) => asNumber(row.sfl_sirano) === sourceListNo
  );
  const targetRows = definitions.filter(
    (row) => asNumber(row.sfl_sirano) === targetListNo
  );
  if (sourceRows.length !== 1 || targetRows.length !== 1) {
    fail(
      `Mikro ${sourceListNo}/${targetListNo} liste tanimlari tekil degil.`
    );
  }

  for (const field of DEFINITION_BEHAVIOR_FIELDS) {
    if (
      comparableValue(sourceRows[0][field]) !==
      comparableValue(targetRows[0][field])
    ) {
      fail(
        `Mikro liste ${targetListNo} davranisi kaynak ${sourceListNo} ile ` +
          `${field} alaninda farkli.`
      );
    }
  }
};

async function checkPostgres(cutover: Date) {
  const schemaRows = await prisma.$queryRaw<
    Array<{
      order_item_price_list: boolean;
      normalized_table: boolean;
      source_guid: boolean;
      hot_sale_operation_key: boolean;
      hot_sale_request_hash: boolean;
      order_hot_sale_operation_key: boolean;
      normalized_unique_index: boolean;
      source_guid_unique_index: boolean;
      hot_sale_operation_unique_index: boolean;
      order_hot_sale_operation_unique_index: boolean;
      migration_applied: boolean;
    }>
  >`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'OrderItem'
          AND column_name = 'priceListNo'
      ) AS order_item_price_list,
      to_regclass('public.product_price_list_current') IS NOT NULL AS normalized_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'price_changes'
          AND column_name = 'source_guid'
      ) AS source_guid,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'HotSaleTransaction'
          AND column_name = 'operationKey'
      ) AS hot_sale_operation_key,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'HotSaleTransaction'
          AND column_name = 'requestHash'
      ) AS hot_sale_request_hash,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Order'
          AND column_name = 'hotSaleOperationKey'
      ) AS order_hot_sale_operation_key,
      to_regclass(
        'public.product_price_list_current_product_code_price_list_no_key'
      ) IS NOT NULL AS normalized_unique_index,
      to_regclass('public.price_changes_source_guid_key') IS NOT NULL
        AS source_guid_unique_index,
      to_regclass('public."HotSaleTransaction_operationKey_key"') IS NOT NULL
        AS hot_sale_operation_unique_index,
      to_regclass('public."Order_hotSaleOperationKey_key"') IS NOT NULL
        AS order_hot_sale_operation_unique_index,
      EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE migration_name = '20260723120000_add_normalized_price_lists'
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      ) AS migration_applied
  `;
  const schema = schemaRows[0];
  if (!schema?.order_item_price_list) fail('PostgreSQL OrderItem.priceListNo eksik.');
  if (!schema?.normalized_table) fail('PostgreSQL normalize fiyat tablosu eksik.');
  if (!schema?.source_guid) fail('PostgreSQL price_changes.source_guid eksik.');
  if (!schema?.hot_sale_operation_key) {
    fail('PostgreSQL HotSaleTransaction.operationKey eksik.');
  }
  if (!schema?.hot_sale_request_hash) {
    fail('PostgreSQL HotSaleTransaction.requestHash eksik.');
  }
  if (!schema?.order_hot_sale_operation_key) {
    fail('PostgreSQL Order.hotSaleOperationKey eksik.');
  }
  if (!schema?.normalized_unique_index) {
    fail('PostgreSQL normalize fiyat unique indexi eksik.');
  }
  if (!schema?.source_guid_unique_index) {
    fail('PostgreSQL price_changes source GUID unique indexi eksik.');
  }
  if (!schema?.hot_sale_operation_unique_index) {
    fail('PostgreSQL HotSaleTransaction operation key unique indexi eksik.');
  }
  if (!schema?.order_hot_sale_operation_unique_index) {
    fail('PostgreSQL Order hot-sale operation key unique indexi eksik.');
  }
  if (!schema?.migration_applied) {
    fail('PostgreSQL fiyat listesi tier6 Prisma migration kaydi tamamlanmamis.');
  }

  const historySafetyRows = await prisma.$queryRaw<
    Array<{
      legacy_without_source_guid: bigint;
      has_completed_watermark: boolean;
    }>
  >`
    SELECT
      (
        SELECT COUNT(*)::bigint
        FROM price_changes
        WHERE source_guid IS NULL
      ) AS legacy_without_source_guid,
      EXISTS (
        SELECT 1
        FROM price_sync_log
        WHERE status = 'completed'
          AND last_synced_date IS NOT NULL
      ) AS has_completed_watermark
  `;
  const historySafety = historySafetyRows[0];
  if (
    Number(historySafety?.legacy_without_source_guid || 0) > 0
    && !historySafety?.has_completed_watermark
  ) {
    fail(
      'Legacy source_guid NULL fiyat gecmisi var ancak tamamlanmis price-sync ' +
        'watermark yok; full sync mukerrer gecmis uretebilir.'
    );
  }

  const coverage = await prisma.$queryRaw<
    Array<{ list_no: number; product_code: string; current_price: unknown }>
  >`
    SELECT
      price_list_no AS list_no,
      BTRIM(product_code) AS product_code,
      current_price
    FROM product_price_list_current
    WHERE price_list_no IN (13, 14)
      AND synced_at >= ${cutover}
      AND BTRIM(product_code) <> ''
  `;

  const freshCodesByList = new Map<number, Set<string>>([
    [13, new Set<string>()],
    [14, new Set<string>()],
  ]);
  const freshPricesByList = new Map<number, Map<string, number>>([
    [13, new Map<string, number>()],
    [14, new Map<string, number>()],
  ]);
  for (const row of coverage) {
    const listNo = asNumber(row.list_no);
    const productCode = String(row.product_code || '').trim();
    freshCodesByList.get(listNo)?.add(productCode);
    freshPricesByList.get(listNo)?.set(
      productCode,
      asNumber(row.current_price)
    );
  }

  return {
    freshCodesByList,
    freshPricesByList,
    invoiced6FreshProductCount: freshCodesByList.get(13)?.size || 0,
    retail6FreshProductCount: freshCodesByList.get(14)?.size || 0,
  };
}

async function checkMikro() {
  if (config.useMockMikro) {
    fail('Production readiness kontrolu mock Mikro ile calistirilamaz.');
  }

  await mikroService.connect();

  const columnRows = await mikroService.executeQueryOnce(`
    SELECT
      DATA_TYPE AS dataType,
      CHARACTER_MAXIMUM_LENGTH AS maxLength,
      IS_NULLABLE AS isNullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = N'dbo'
      AND TABLE_NAME = N'STOKLAR_USER'
      AND COLUMN_NAME = N'Marj_6'
  `);
  const definitionRows = (await mikroService.executeQueryOnce(`
    SELECT *
    FROM STOK_SATIS_FIYAT_LISTE_TANIMLARI
    WHERE sfl_sirano IN (5, 10, 11, 12, 13, 14)
    ORDER BY sfl_sirano
  `)) as MikroDefinitionRow[];
  const countRows = await mikroService.executeQueryOnce(`
    SELECT
      sfiyat_listesirano AS listNo,
      COUNT(*) AS [rowCount]
    FROM STOK_SATIS_FIYAT_LISTELERI
    WHERE sfiyat_listesirano IN (5, 10, 11, 12, 13, 14)
    GROUP BY sfiyat_listesirano
    ORDER BY sfiyat_listesirano
  `);
  const activeRows = await mikroService.executeQueryOnce(`
    SELECT LTRIM(RTRIM(sto_kod)) AS productCode
    FROM STOKLAR
    WHERE ISNULL(sto_pasif_fl, 0) = 0
      AND LTRIM(RTRIM(ISNULL(sto_kod, N''))) <> N''
  `);
  const activePriceRows = await mikroService.executeQueryOnce(`
    SELECT
      LTRIM(RTRIM(s.sto_kod)) AS productCode,
      target.listNo,
      ISNULL(price.sfiyat_fiyati, 0) AS currentPrice
    FROM STOKLAR s
    CROSS JOIN (VALUES (13), (14)) target(listNo)
    LEFT JOIN STOK_SATIS_FIYAT_LISTELERI price
      ON LTRIM(RTRIM(price.sfiyat_stokkod)) = LTRIM(RTRIM(s.sto_kod))
     AND price.sfiyat_listesirano = target.listNo
     AND ISNULL(price.sfiyat_iptal, 0) = 0
     AND ISNULL(price.sfiyat_hidden, 0) = 0
     AND ISNULL(price.sfiyat_deposirano, 0) = 0
     AND ISNULL(price.sfiyat_odemeplan, 0) = 0
     AND ISNULL(price.sfiyat_doviz, 0) = 0
    WHERE ISNULL(s.sto_pasif_fl, 0) = 0
      AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
    ORDER BY s.sto_kod, target.listNo
  `);
  const marginRows = await mikroService.executeQueryOnce(`
    SELECT
      COUNT(*) AS activeProductCount,
      SUM(CASE WHEN margins.margin5 > 0 THEN 1 ELSE 0 END)
        AS activeValidMargin5Count,
      SUM(CASE WHEN margins.margin6 > 0 THEN 1 ELSE 0 END)
        AS activeValidMargin6Count,
      SUM(CASE
        WHEN margins.margin5 > 0
         AND (margins.margin6 IS NULL OR margins.margin6 <= 0)
        THEN 1 ELSE 0
      END) AS validMargin5MissingInMargin6Count,
      SUM(CASE WHEN NOT (margins.margin6 > 0) OR margins.margin6 IS NULL
        THEN 1 ELSE 0 END) AS activeWithoutValidMargin6Count
    FROM STOKLAR s
    LEFT JOIN STOKLAR_USER u ON u.Record_uid = s.sto_Guid
    OUTER APPLY (
      SELECT
        TRY_CONVERT(
          decimal(19, 6),
          REPLACE(
            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_5))), N''),
            N',',
            N'.'
          )
        ) AS margin5,
        TRY_CONVERT(
          decimal(19, 6),
          REPLACE(
            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_6))), N''),
            N',',
            N'.'
          )
        ) AS margin6
    ) margins
    WHERE ISNULL(s.sto_pasif_fl, 0) = 0
      AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
  `);
  const parityRows = await mikroService.executeQueryOnce(`
    SELECT
      (
        SELECT COUNT(*) FROM (
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 10
          EXCEPT
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13
        ) source_only
      ) AS invoicedSourceOnly,
      (
        SELECT COUNT(*) FROM (
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13
          EXCEPT
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 10
        ) target_only
      ) AS invoicedTargetOnly,
      (
        SELECT COUNT(*) FROM (
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 5
          EXCEPT
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14
        ) source_only
      ) AS retailSourceOnly,
      (
        SELECT COUNT(*) FROM (
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14
          EXCEPT
          SELECT ${PRICE_ROW_COMPARISON_COLUMNS}
          FROM STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 5
        ) target_only
      ) AS retailTargetOnly
  `);
  const canonicalRows = await mikroService.executeQueryOnce(`
    SELECT
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1
        FROM STOK_SATIS_FIYAT_LISTELERI p
        WHERE p.sfiyat_listesirano = 13
          AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
              LTRIM(RTRIM(s.sto_kod))
          AND ISNULL(p.sfiyat_iptal, 0) = 0
          AND ISNULL(p.sfiyat_hidden, 0) = 0
          AND ISNULL(p.sfiyat_deposirano, 0) = 0
          AND ISNULL(p.sfiyat_odemeplan, 0) = 0
          AND ISNULL(p.sfiyat_doviz, 0) = 0
      ) AND EXISTS (
        SELECT 1
        FROM STOK_SATIS_FIYAT_LISTELERI source_price
        WHERE source_price.sfiyat_listesirano = 10
          AND LTRIM(RTRIM(ISNULL(source_price.sfiyat_stokkod, N''))) =
              LTRIM(RTRIM(s.sto_kod))
          AND ISNULL(source_price.sfiyat_iptal, 0) = 0
          AND ISNULL(source_price.sfiyat_hidden, 0) = 0
          AND ISNULL(source_price.sfiyat_deposirano, 0) = 0
          AND ISNULL(source_price.sfiyat_odemeplan, 0) = 0
          AND ISNULL(source_price.sfiyat_doviz, 0) = 0
      ) THEN 1 ELSE 0 END) AS missingInvoiced6CanonicalCount,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1
        FROM STOK_SATIS_FIYAT_LISTELERI p
        WHERE p.sfiyat_listesirano = 14
          AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
              LTRIM(RTRIM(s.sto_kod))
          AND ISNULL(p.sfiyat_iptal, 0) = 0
          AND ISNULL(p.sfiyat_hidden, 0) = 0
          AND ISNULL(p.sfiyat_deposirano, 0) = 0
          AND ISNULL(p.sfiyat_odemeplan, 0) = 0
          AND ISNULL(p.sfiyat_doviz, 0) = 0
      ) AND EXISTS (
        SELECT 1
        FROM STOK_SATIS_FIYAT_LISTELERI source_price
        WHERE source_price.sfiyat_listesirano = 5
          AND LTRIM(RTRIM(ISNULL(source_price.sfiyat_stokkod, N''))) =
              LTRIM(RTRIM(s.sto_kod))
          AND ISNULL(source_price.sfiyat_iptal, 0) = 0
          AND ISNULL(source_price.sfiyat_hidden, 0) = 0
          AND ISNULL(source_price.sfiyat_deposirano, 0) = 0
          AND ISNULL(source_price.sfiyat_odemeplan, 0) = 0
          AND ISNULL(source_price.sfiyat_doviz, 0) = 0
      ) THEN 1 ELSE 0 END) AS missingRetail6CanonicalCount
    FROM STOKLAR s
    WHERE ISNULL(s.sto_pasif_fl, 0) = 0
      AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
  `);
  const sourceCoverageRows = await mikroService.executeQueryOnce(`
    SELECT
      (
        SELECT COUNT(*)
        FROM STOKLAR s
        WHERE ISNULL(s.sto_pasif_fl, 0) = 0
          AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
          AND NOT EXISTS (
            SELECT 1
            FROM STOK_SATIS_FIYAT_LISTELERI p
            WHERE p.sfiyat_listesirano = 10
              AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(p.sfiyat_iptal, 0) = 0
              AND ISNULL(p.sfiyat_hidden, 0) = 0
              AND ISNULL(p.sfiyat_deposirano, 0) = 0
              AND ISNULL(p.sfiyat_odemeplan, 0) = 0
              AND ISNULL(p.sfiyat_doviz, 0) = 0
          )
      ) AS activeWithoutInvoiced5Count,
      (
        SELECT COUNT(*)
        FROM STOKLAR s
        WHERE ISNULL(s.sto_pasif_fl, 0) = 0
          AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
          AND NOT EXISTS (
            SELECT 1
            FROM STOK_SATIS_FIYAT_LISTELERI p
            WHERE p.sfiyat_listesirano = 5
              AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(p.sfiyat_iptal, 0) = 0
              AND ISNULL(p.sfiyat_hidden, 0) = 0
              AND ISNULL(p.sfiyat_deposirano, 0) = 0
              AND ISNULL(p.sfiyat_odemeplan, 0) = 0
              AND ISNULL(p.sfiyat_doviz, 0) = 0
          )
      ) AS activeWithoutRetail5Count
  `);
  const duplicateCanonicalRows = await mikroService.executeQueryOnce(`
    SELECT COUNT(*) AS duplicateActiveListCount
    FROM (
      SELECT
        p.sfiyat_stokkod,
        p.sfiyat_listesirano
      FROM STOK_SATIS_FIYAT_LISTELERI p
      INNER JOIN STOKLAR s
        ON LTRIM(RTRIM(s.sto_kod)) = LTRIM(RTRIM(p.sfiyat_stokkod))
      WHERE p.sfiyat_listesirano IN (13, 14)
        AND ISNULL(s.sto_pasif_fl, 0) = 0
        AND ISNULL(p.sfiyat_iptal, 0) = 0
        AND ISNULL(p.sfiyat_hidden, 0) = 0
        AND ISNULL(p.sfiyat_deposirano, 0) = 0
        AND ISNULL(p.sfiyat_odemeplan, 0) = 0
        AND ISNULL(p.sfiyat_doviz, 0) = 0
      GROUP BY p.sfiyat_stokkod, p.sfiyat_listesirano
      HAVING COUNT(*) <> 1
    ) duplicates
  `);

  const column = columnRows[0];
  if (
    !column ||
    String(column.dataType || '').toLowerCase() !== 'nvarchar' ||
    asNumber(column.maxLength) !== 17 ||
    String(column.isNullable || '').toUpperCase() !== 'YES'
  ) {
    fail('Mikro STOKLAR_USER.Marj_6 tipi nvarchar(17) NULL degil.');
  }

  const expectedDescriptions = new Map<number, string>([
    [11, 'Kampanya Satış Fiyatı Faturalı'],
    [12, 'Kampanya Satış Fiyatı Perakende'],
    [13, 'Faturalı Satış 6'],
    [14, 'Perakende Satış 6'],
  ]);
  expectedDescriptions.forEach((description, listNo) => {
    const rows = definitionRows.filter(
      (row) => asNumber(row.sfl_sirano) === listNo
    );
    if (rows.length !== 1) fail(`Mikro liste ${listNo} tanimi tekil degil.`);
    if (String(rows[0].sfl_aciklama || '').trim() !== description) {
      fail(`Mikro liste ${listNo} anlami beklenenden farkli.`);
    }
    if (Boolean(rows[0].sfl_iptal)) fail(`Mikro liste ${listNo} pasif.`);
  });
  assertDefinitionParity(definitionRows, 10, 13);
  assertDefinitionParity(definitionRows, 5, 14);

  const counts = new Map(
    countRows.map((row: any) => [asNumber(row.listNo), asNumber(row.rowCount)])
  );
  if ((counts.get(13) || 0) !== (counts.get(10) || 0)) {
    fail('Mikro Faturali 6 satir kapsami Faturali 5 ile ayni degil.');
  }
  if ((counts.get(14) || 0) !== (counts.get(5) || 0)) {
    fail('Mikro Perakende 6 satir kapsami Perakende 5 ile ayni degil.');
  }
  const parity = parityRows[0] || {};
  if (
    asNumber(parity.invoicedSourceOnly) !== 0 ||
    asNumber(parity.invoicedTargetOnly) !== 0 ||
    asNumber(parity.retailSourceOnly) !== 0 ||
    asNumber(parity.retailTargetOnly) !== 0
  ) {
    fail('Mikro 13/14 fiyat satirlari kaynak 10/5 ile cift yonlu ayni degil.');
  }

  const canonical = canonicalRows[0] || {};
  if (
    asNumber(canonical.missingInvoiced6CanonicalCount) !== 0 ||
    asNumber(canonical.missingRetail6CanonicalCount) !== 0
  ) {
    fail('Aktif Mikro stoklarinin canonical 13/14 fiyat kapsami eksik.');
  }
  if (asNumber(duplicateCanonicalRows[0]?.duplicateActiveListCount) !== 0) {
    fail('Aktif Mikro stoklarinda canonical 13/14 fiyat satiri tekil degil.');
  }

  const margin = marginRows[0] || {};
  if (asNumber(margin.validMargin5MissingInMargin6Count) !== 0) {
    fail('Gecerli Marj_5 degeri olan aktif stoklarda Marj_6 kopyasi eksik.');
  }

  const activeProductCodes = new Set<string>(
    activeRows.map((row: any) => String(row.productCode || '').trim())
  );
  const activePricesByList = new Map<number, Map<string, number>>([
    [13, new Map<string, number>()],
    [14, new Map<string, number>()],
  ]);
  for (const productCode of activeProductCodes) {
    activePricesByList.get(13)?.set(productCode, 0);
    activePricesByList.get(14)?.set(productCode, 0);
  }
  for (const row of activePriceRows as any[]) {
    const listNo = asNumber(row.listNo);
    const productCode = String(row.productCode || '').trim();
    activePricesByList.get(listNo)?.set(
      productCode,
      asNumber(row.currentPrice)
    );
  }

  return {
    activeProductCodes,
    activePricesByList,
    activeProductCount: asNumber(margin.activeProductCount),
    activeValidMargin5Count: asNumber(margin.activeValidMargin5Count),
    activeValidMargin6Count: asNumber(margin.activeValidMargin6Count),
    activeWithoutValidMargin6Count: asNumber(
      margin.activeWithoutValidMargin6Count
    ),
    activeWithoutInvoiced5Count: asNumber(
      sourceCoverageRows[0]?.activeWithoutInvoiced5Count
    ),
    activeWithoutRetail5Count: asNumber(
      sourceCoverageRows[0]?.activeWithoutRetail5Count
    ),
    invoiced6PriceRowCount: counts.get(13) || 0,
    retail6PriceRowCount: counts.get(14) || 0,
    campaign11PriceRowCount: counts.get(11) || 0,
    campaign12PriceRowCount: counts.get(12) || 0,
  };
}

async function main() {
  const cutover = (() => {
    try {
      return parseTier6Cutover(
        process.env.PRICE_LIST_TIER6_CUTOVER_DATE
      ).instant;
    } catch (error: any) {
      return fail(String(error?.message || error));
    }
  })();

  try {
    const postgres = await checkPostgres(cutover);
    const mikro = await checkMikro();

    const missingInvoicedCodes = [...mikro.activeProductCodes].filter(
      (code) => !postgres.freshCodesByList.get(13)?.has(code)
    );
    const missingRetailCodes = [...mikro.activeProductCodes].filter(
      (code) => !postgres.freshCodesByList.get(14)?.has(code)
    );
    if (missingInvoicedCodes.length > 0 || missingRetailCodes.length > 0) {
      fail(
        'PostgreSQL 13/14 normalize snapshot cutover sonrasi tum aktif Mikro ' +
          `stoklarini kapsamiyor (13: ${missingInvoicedCodes.length}, ` +
          `14: ${missingRetailCodes.length}).`
      );
    }
    const priceMismatches: Array<{
      listNo: number;
      productCode: string;
      mikroPrice: number;
      postgresPrice: number;
    }> = [];
    for (const listNo of [13, 14]) {
      const mikroPrices = mikro.activePricesByList.get(listNo);
      const postgresPrices = postgres.freshPricesByList.get(listNo);
      for (const productCode of mikro.activeProductCodes) {
        const mikroPrice = asNumber(mikroPrices?.get(productCode));
        const postgresPrice = asNumber(postgresPrices?.get(productCode));
        if (Math.abs(mikroPrice - postgresPrice) > 0.0001) {
          priceMismatches.push({
            listNo,
            productCode,
            mikroPrice,
            postgresPrice,
          });
          if (priceMismatches.length >= 25) break;
        }
      }
      if (priceMismatches.length >= 25) break;
    }
    if (priceMismatches.length > 0) {
      fail(
        'PostgreSQL 13/14 normalize snapshot fiyatlari Mikro ile ayni degil. ' +
          `Ilk uyusmazliklar: ${priceMismatches
            .map(
              (row) =>
                `${row.productCode}/L${row.listNo} ` +
                `${row.mikroPrice}->${row.postgresPrice}`
            )
            .join(', ')}`
      );
    }

    const warnings: string[] = [];
    if (mikro.activeWithoutValidMargin6Count > 0) {
      warnings.push(
        `${mikro.activeWithoutValidMargin6Count} aktif stokta Marj_5 de ` +
          'gecerli olmadigi icin Marj_6 uretilmedi; bu stoklarda otomatik ' +
          'standart fiyat yazimi fail-closed kalir.'
      );
    }
    if (
      mikro.activeWithoutInvoiced5Count > 0 ||
      mikro.activeWithoutRetail5Count > 0
    ) {
      warnings.push(
        'Kaynak 5. kademe canonical fiyati bulunmayan aktif stoklar var ' +
          `(Faturali: ${mikro.activeWithoutInvoiced5Count}, ` +
          `Perakende: ${mikro.activeWithoutRetail5Count}); bu stoklarin ` +
          '6. kademe snapshot degeri sifir kalir ve mevcut fallback zinciri kullanilir.'
      );
    }

    console.log(
      JSON.stringify(
        {
          ready: true,
          cutover: cutover.toISOString(),
          warnings,
          postgres: {
            invoiced6FreshProductCount:
              postgres.invoiced6FreshProductCount,
            retail6FreshProductCount: postgres.retail6FreshProductCount,
            missingActiveInvoiced6Count: missingInvoicedCodes.length,
            missingActiveRetail6Count: missingRetailCodes.length,
          },
          mikro: {
            activeProductCount: mikro.activeProductCount,
            activeValidMargin5Count: mikro.activeValidMargin5Count,
            activeValidMargin6Count: mikro.activeValidMargin6Count,
            activeWithoutValidMargin6Count:
              mikro.activeWithoutValidMargin6Count,
            activeWithoutInvoiced5Count:
              mikro.activeWithoutInvoiced5Count,
            activeWithoutRetail5Count: mikro.activeWithoutRetail5Count,
            invoiced6PriceRowCount: mikro.invoiced6PriceRowCount,
            retail6PriceRowCount: mikro.retail6PriceRowCount,
            campaign11PriceRowCount: mikro.campaign11PriceRowCount,
            campaign12PriceRowCount: mikro.campaign12PriceRowCount,
          },
        },
        null,
        2
      )
    );
  } finally {
    await Promise.allSettled([
      mikroService.disconnect(),
      prisma.$disconnect(),
    ]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
