import crypto from 'crypto';
import {
  Prisma,
  VadeBalanceSource,
  VadeSyncStatus,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import { hashPassword } from '../utils/password';
import { ErrorFactory } from '../types/errors';
import {
  buildVadeImportNumericPatch,
  getMissingVadeSnapshotNumericFields,
  indexByCanonicalVadeCariCode,
  prepareVadeImportRows,
  resolveVadeImportAmounts,
} from '../utils/vade-import';
import { isExcludedVadeSectorCode } from '../utils/vade-scope';

export type VadeImportMode = 'PATCH' | 'SNAPSHOT';

export type VadeImportRow = {
  mikroCariCode: string;
  customerName?: string | null;
  sectorCode?: string | null;
  groupCode?: string | null;
  regionCode?: string | null;
  pastDueBalance?: number;
  pastDueDate?: string | null;
  notDueBalance?: number;
  notDueDate?: string | null;
  totalBalance?: number;
  valor?: number;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
  sourceRowNumber?: number;
};

export type VadeImportSkipReason =
  | 'CUSTOMER_NOT_FOUND'
  | 'EXCLUDED_SECTOR'
  | 'DUPLICATE_CODE';

export type VadeImportSkippedRow = {
  sourceRowNumber?: number;
  mikroCariCode: string;
  reason: VadeImportSkipReason;
};

export type VadeImportResult = {
  imported: number;
  skipped: number;
  createdCustomers: number;
  staleRemoved: number;
  skipReasons: {
    customerNotFound: number;
    excludedSector: number;
    duplicateCode: number;
  };
  skippedRows: VadeImportSkippedRow[];
};

type ImportOptions = {
  mode?: VadeImportMode;
  createMissingCustomers?: boolean;
};

type ImportUser = {
  id: string;
  mikroCariCode: string | null;
  mikroName: string | null;
  displayName: string | null;
  sectorCode: string | null;
  groupCode: string | null;
  paymentPlanName: string | null;
};

const MAX_SKIPPED_ROWS_IN_RESPONSE = 100;
const MAX_VALIDATION_ROWS_IN_RESPONSE = 100;
const VADE_IMPORT_ADVISORY_LOCK_KEY = 'bakircilar:vade-import';

const cleanOptionalText = (value?: string | null) => {
  const cleaned = String(value || '').trim();
  return cleaned || null;
};

const parseDateOnly = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const finiteNumber = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value) ? Number(value) : fallback;

const rowNumberFor = (
  row: VadeImportRow,
  preparedSourceRowNumber: number,
) => row.sourceRowNumber ?? preparedSourceRowNumber;

const findUsersByCodes = (
  client: Prisma.TransactionClient | typeof prisma,
  canonicalCodes: string[],
) => {
  if (canonicalCodes.length === 0) return Promise.resolve([] as ImportUser[]);
  return client.user.findMany({
    // Cari kodlari Excel/DB tarafinda gorunmez bosluk veya uyumluluk
    // karakteri tasiyabilir. Dar kolon secimiyle tum kodlu kullanicilari
    // alip iki tarafi da ayni canonical fonksiyonla eslestiriyoruz.
    where: {
      role: 'CUSTOMER',
      mikroCariCode: { not: null },
    },
    select: {
      id: true,
      mikroCariCode: true,
      mikroName: true,
      displayName: true,
      sectorCode: true,
      groupCode: true,
      paymentPlanName: true,
    },
  });
};

const indexUsersByCanonicalCode = (
  users: ImportUser[],
  canonicalCodes: readonly string[],
) => {
  const relevantCodes = new Set(canonicalCodes);
  const { uniqueByCode, collisions } = indexByCanonicalVadeCariCode(
    users,
    (user) => user.mikroCariCode,
    relevantCodes,
  );

  if (collisions.size > 0) {
    const collisionDetails = [...collisions.entries()]
      .slice(0, MAX_VALIDATION_ROWS_IN_RESPONSE)
      .map(([canonicalCode, collisionUsers]) => ({
        canonicalCode,
        databaseCodes: collisionUsers.map((user) => user.mikroCariCode),
      }));
    throw ErrorFactory.validation(
      'Vade importu uygulanmadi: ayni canonical cari koduna bagli birden fazla musteri var',
      {
        collisionCount: collisions.size,
        collisions: collisionDetails,
      },
    );
  }

  return uniqueByCode;
};

const buildFullBalanceData = (row: VadeImportRow) => {
  const {
    pastDueBalance,
    notDueBalance,
    totalBalance,
  } = resolveVadeImportAmounts(row);
  return {
    pastDueBalance,
    pastDueDate: parseDateOnly(row.pastDueDate),
    notDueBalance,
    notDueDate: parseDateOnly(row.notDueDate),
    totalBalance,
    valor: Math.trunc(finiteNumber(row.valor)),
    paymentTermLabel: cleanOptionalText(row.paymentTermLabel),
    referenceDate: parseDateOnly(row.referenceDate),
    source: VadeBalanceSource.EXCEL,
  };
};

const buildBalanceUpdateData = (
  row: VadeImportRow,
  mode: VadeImportMode,
): Prisma.VadeBalanceUpdateInput => {
  if (mode === 'SNAPSHOT') return buildFullBalanceData(row);

  const data: Prisma.VadeBalanceUpdateInput = {
    ...buildVadeImportNumericPatch(row),
    source: VadeBalanceSource.EXCEL,
  };
  if (row.pastDueDate !== undefined) {
    data.pastDueDate = parseDateOnly(row.pastDueDate);
  }
  if (row.notDueDate !== undefined) {
    data.notDueDate = parseDateOnly(row.notDueDate);
  }
  if (row.paymentTermLabel !== undefined) {
    data.paymentTermLabel = cleanOptionalText(row.paymentTermLabel);
  }
  if (row.referenceDate !== undefined) {
    data.referenceDate = parseDateOnly(row.referenceDate);
  }
  return data;
};

class VadeImportService {
  async importRows(
    rows: VadeImportRow[],
    options: ImportOptions = {},
  ): Promise<VadeImportResult> {
    const mode = options.mode ?? 'PATCH';
    const createMissingCustomers = options.createMissingCustomers === true;
    const prepared = prepareVadeImportRows(rows);
    const candidateRows = prepared.uniqueRows.filter((item) => item.canonicalCode);
    const canonicalCodes = candidateRows.map((item) => item.canonicalCode);

    const initiallyExistingUsers = await findUsersByCodes(prisma, canonicalCodes);
    const initiallyExistingByCode = indexUsersByCanonicalCode(
      initiallyExistingUsers,
      canonicalCodes,
    );

    const creatableRows = createMissingCustomers
      ? candidateRows.filter((item) => {
          if (initiallyExistingByCode.has(item.canonicalCode)) return false;
          return !isExcludedVadeSectorCode(item.row.sectorCode);
        })
      : [];

    const disabledPasswordHash = creatableRows.length > 0
      ? await hashPassword(crypto.randomBytes(48).toString('base64url'))
      : null;

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ lock_result: string | null }>>`
        SELECT pg_advisory_xact_lock(
          hashtext(${VADE_IMPORT_ADVISORY_LOCK_KEY})::bigint
        )::text AS lock_result
      `;

      let createdCustomers = 0;

      if (disabledPasswordHash && creatableRows.length > 0) {
        const createResult = await tx.user.createMany({
          data: creatableRows.map((item) => {
            const customerName =
              cleanOptionalText(item.row.customerName) || item.canonicalCode;
            return {
              email: null,
              password: disabledPasswordHash,
              name: customerName,
              mikroName: customerName,
              displayName: customerName,
              role: 'CUSTOMER' as const,
              // Canonical kod yalnizca eslestirme anahtaridir. Mikro ile daha
              // sonraki exact senkronlarin calisabilmesi icin Excel'deki
              // NFKC+trim kimligi veritabaninda degistirmeden saklanir.
              mikroCariCode: item.code,
              sectorCode: cleanOptionalText(item.row.sectorCode),
              groupCode: cleanOptionalText(item.row.groupCode),
              paymentPlanName: cleanOptionalText(item.row.paymentTermLabel),
              // Excel-only vade carileri login hesabi degildir. Bir hesap daha
              // sonra kullanima acilacaksa once gercek bir parola atanmalidir.
              active: false,
            };
          }),
          skipDuplicates: true,
        });
        createdCustomers = createResult.count;
      }

      const users = await findUsersByCodes(tx, canonicalCodes);
      const userByCode = indexUsersByCanonicalCode(users, canonicalCodes);

      const skippedRows: VadeImportSkippedRow[] = [];
      const skipReasons = {
        customerNotFound: 0,
        excludedSector: 0,
        duplicateCode: prepared.duplicateRows.length,
      };

      for (const duplicate of prepared.duplicateRows) {
        if (skippedRows.length >= MAX_SKIPPED_ROWS_IN_RESPONSE) break;
        skippedRows.push({
          sourceRowNumber:
            duplicate.row.sourceRowNumber ?? duplicate.sourceRowNumber,
          mikroCariCode: duplicate.code,
          reason: 'DUPLICATE_CODE',
        });
      }

      const importable: Array<{
        row: VadeImportRow;
        user: ImportUser;
      }> = [];
      const matchedRows: Array<{
        row: VadeImportRow;
        user: ImportUser;
      }> = [];

      for (const item of prepared.uniqueRows) {
        const sourceRowNumber = rowNumberFor(item.row, item.sourceRowNumber);
        const user = item.canonicalCode
          ? userByCode.get(item.canonicalCode)
          : undefined;
        const effectiveSectorCode =
          cleanOptionalText(user?.sectorCode) ||
          cleanOptionalText(item.row.sectorCode);

        if (user) {
          matchedRows.push({ row: item.row, user });
        }

        // A full accounting export can legitimately contain sectors that are
        // outside the vade module. Classify those rows before customer
        // matching so an intentionally excluded, Excel-only cari does not
        // abort the entire SNAPSHOT as CUSTOMER_NOT_FOUND.
        if (isExcludedVadeSectorCode(effectiveSectorCode)) {
          skipReasons.excludedSector += 1;
          if (skippedRows.length < MAX_SKIPPED_ROWS_IN_RESPONSE) {
            skippedRows.push({
              sourceRowNumber,
              mikroCariCode: item.code,
              reason: 'EXCLUDED_SECTOR',
            });
          }
          continue;
        }

        if (!user) {
          skipReasons.customerNotFound += 1;
          if (skippedRows.length < MAX_SKIPPED_ROWS_IN_RESPONSE) {
            skippedRows.push({
              sourceRowNumber,
              mikroCariCode: item.code,
              reason: 'CUSTOMER_NOT_FOUND',
            });
          }
          continue;
        }

        importable.push({ row: item.row, user });
      }

      if (mode === 'SNAPSHOT' && skipReasons.customerNotFound > 0) {
        throw ErrorFactory.validation(
          'Tam vade snapshotu uygulanmadi: bazi cari kodlari eslestirilemedi',
          { customerNotFound: skipReasons.customerNotFound },
        );
      }
      if (mode === 'SNAPSHOT' && importable.length === 0) {
        throw ErrorFactory.validation(
          'Tam vade snapshotu uygulanmadi: aktarilabilir cari bulunamadi',
        );
      }

      if (mode === 'SNAPSHOT') {
        const invalidRows = importable.flatMap(({ row, user }) => {
          const missingFields = getMissingVadeSnapshotNumericFields(row);
          return missingFields.length > 0
            ? [{
                sourceRowNumber: row.sourceRowNumber,
                mikroCariCode: user.mikroCariCode,
                missingFields,
              }]
            : [];
        });
        if (invalidRows.length > 0) {
          throw ErrorFactory.validation(
            'Tam vade snapshotu uygulanmadi: gerekli sayisal alanlar eksik veya gecersiz',
            {
              invalidRowCount: invalidRows.length,
              invalidRows: invalidRows.slice(0, MAX_VALIDATION_ROWS_IN_RESPONSE),
            },
          );
        }
      }

      const metadataUpdates = matchedRows.flatMap(({ row, user }) => {
        const customerName = cleanOptionalText(row.customerName);
        const sectorCode = cleanOptionalText(row.sectorCode);
        const groupCode = cleanOptionalText(row.groupCode);
        const paymentPlanName = cleanOptionalText(row.paymentTermLabel);
        const data: Prisma.UserUpdateInput = {};
        if (!user.mikroName && customerName) {
          data.mikroName = customerName;
        }
        if (!user.sectorCode && sectorCode) {
          data.sectorCode = sectorCode;
        }
        if (!user.groupCode && groupCode) {
          data.groupCode = groupCode;
        }
        if (!user.paymentPlanName && paymentPlanName) {
          data.paymentPlanName = paymentPlanName;
        }
        return Object.keys(data).length > 0
          ? [tx.user.update({ where: { id: user.id }, data })]
          : [];
      });
      if (metadataUpdates.length > 0) {
        await Promise.all(metadataUpdates);
      }

      const importedUserIds = importable.map((item) => item.user.id);
      for (const { row, user } of importable) {
        await tx.vadeBalance.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            ...buildFullBalanceData(row),
          },
          update: buildBalanceUpdateData(row, mode),
        });
      }

      // A caller-supplied workbook cannot prove that it contains the complete
      // accounting population. Never delete balances absent from this upload.
      const staleRemoved = 0;

      if (importedUserIds.length > 0) {
        const settings = await tx.settings.findFirst({ select: { id: true } });
        if (settings) {
          await tx.settings.update({
            where: { id: settings.id },
            data: { lastVadeSyncAt: new Date() },
          });
        }
      }

      const skipped =
        skipReasons.customerNotFound +
        skipReasons.excludedSector +
        skipReasons.duplicateCode;

      await tx.vadeSyncLog.create({
        data: {
          source: VadeBalanceSource.EXCEL,
          status: skipped > 0
            ? VadeSyncStatus.PARTIAL
            : VadeSyncStatus.SUCCESS,
          recordsTotal: rows.length,
          recordsUpdated: importedUserIds.length,
          recordsSkipped: skipped,
          completedAt: new Date(),
          details: {
            mode,
            createdCustomers,
            staleRemoved,
            skipReasons,
          },
        },
      });

      return {
        imported: importedUserIds.length,
        skipped,
        createdCustomers,
        staleRemoved,
        skipReasons,
        skippedRows,
      };
    }, {
      maxWait: 10_000,
      timeout: 120_000,
    });
  }
}

export default new VadeImportService();
