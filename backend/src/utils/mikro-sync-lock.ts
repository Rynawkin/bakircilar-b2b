import { prisma } from './prisma';

const MIKRO_SYNC_ADVISORY_LOCK_KEY = 'bakircilar-b2b:mikro-sync:v1';
const LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export class MikroSyncBusyError extends Error {
  constructor() {
    super('Baska bir Mikro stok/fiyat senkronu halen calisiyor.');
    this.name = 'MikroSyncBusyError';
  }
}

/**
 * Cross-process lock shared by stock-sync and price-sync.
 *
 * The callback can use the regular Prisma client. This dedicated interactive
 * transaction only keeps the PostgreSQL advisory lock connection alive.
 */
export const withMikroSyncLock = async <T>(
  task: () => Promise<T>
): Promise<T> =>
  prisma.$transaction(
    async (lockTx) => {
      const rows = await lockTx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(
          hashtextextended(${MIKRO_SYNC_ADVISORY_LOCK_KEY}, 0)
        ) AS locked
      `;
      if (!rows[0]?.locked) {
        throw new MikroSyncBusyError();
      }
      return task();
    },
    {
      maxWait: 5_000,
      timeout: LOCK_TIMEOUT_MS,
    }
  );
