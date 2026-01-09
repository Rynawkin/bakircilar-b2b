import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import vadeService from './vade.service';
import { VadeBalanceSource, VadeSyncStatus } from '@prisma/client';

type MikroVadeRow = {
  customerCode: string;
  pastDueBalance: number | null;
  pastDueDate: Date | null;
  notDueBalance: number | null;
  notDueDate: Date | null;
  paymentTermLabel: string | null;
  referenceDate: Date | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeAmount = (value?: number | null) => round2(Number(value || 0));

const normalizeDate = (value?: Date | null) => (value ? new Date(value) : null);

const datesMatch = (a?: Date | null, b?: Date | null) => {
  const aTime = a ? new Date(a).getTime() : null;
  const bTime = b ? new Date(b).getTime() : null;
  return aTime === bTime;
};

const calculateValor = (pastDueDate?: Date | null) => {
  if (!pastDueDate) return 0;
  const today = new Date();
  const start = new Date(pastDueDate);
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - start.getTime();
  return diffMs > 0 ? Math.floor(diffMs / (24 * 60 * 60 * 1000)) : 0;
};

class VadeSyncService {
  private async fetchMikroBalances(): Promise<MikroVadeRow[]> {
    const query = `
      SELECT
        c.cari_kod AS customerCode,
        SUM(CASE
          WHEN vt.vade_tarihi < CAST(GETDATE() AS DATE)
          THEN CASE WHEN h.cha_tip = 0 THEN h.cha_meblag ELSE -h.cha_meblag END
          ELSE 0
        END) AS pastDueBalance,
        MIN(CASE WHEN vt.vade_tarihi < CAST(GETDATE() AS DATE) THEN vt.vade_tarihi END) AS pastDueDate,
        SUM(CASE
          WHEN vt.vade_tarihi >= CAST(GETDATE() AS DATE)
          THEN CASE WHEN h.cha_tip = 0 THEN h.cha_meblag ELSE -h.cha_meblag END
          ELSE 0
        END) AS notDueBalance,
        MIN(CASE WHEN vt.vade_tarihi >= CAST(GETDATE() AS DATE) THEN vt.vade_tarihi END) AS notDueDate,
        odp.odp_adi AS paymentTermLabel,
        MIN(h.cha_tarihi) AS referenceDate
      FROM CARI_HESAPLAR c
      LEFT JOIN CARI_HESAP_HAREKETLERI h
        ON h.cha_kod = c.cari_kod
        AND ISNULL(h.cha_iptal, 0) = 0
        AND h.cha_cari_cins = 0
        AND h.cha_tpoz = 0
        AND ISNULL(h.cha_meblag_ana_doviz_icin_gecersiz_fl, 0) = 0
      OUTER APPLY (
        SELECT dbo.fn_OpVadeTarih(h.cha_vade, h.cha_tarihi) AS vade_tarihi
      ) vt
      LEFT JOIN ODEME_PLANLARI odp ON odp.odp_no = ABS(c.cari_odemeplan_no)
      WHERE c.cari_kod IS NOT NULL
        AND c.cari_kod <> ''
      GROUP BY c.cari_kod, odp.odp_adi
    `;

    const rows = await (mikroService as any).executeQuery(query);
    return rows.map((row: any) => ({
      customerCode: String(row.customerCode || '').trim(),
      pastDueBalance: row.pastDueBalance ?? 0,
      pastDueDate: row.pastDueDate ? new Date(row.pastDueDate) : null,
      notDueBalance: row.notDueBalance ?? 0,
      notDueDate: row.notDueDate ? new Date(row.notDueDate) : null,
      paymentTermLabel: row.paymentTermLabel ? String(row.paymentTermLabel).trim() : null,
      referenceDate: row.referenceDate ? new Date(row.referenceDate) : null,
    }));
  }

  async syncFromMikro(syncType: 'AUTO' | 'MANUAL' = 'AUTO', existingSyncLogId?: string) {
    const existingLog = existingSyncLogId
      ? await prisma.vadeSyncLog.findUnique({ where: { id: existingSyncLogId } })
      : null;
    const syncLog = existingLog ?? await vadeService.createSyncLog(VadeBalanceSource.MIKRO);
    const startedAt = new Date();
    let recordsTotal = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;

    try {
      const rows = await this.fetchMikroBalances();
      recordsTotal = rows.length;

      const codes = rows.map((row) => row.customerCode).filter(Boolean);
      const users = await prisma.user.findMany({
        where: { mikroCariCode: { in: codes } },
        select: { id: true, mikroCariCode: true },
      });
      const userByCode = new Map(users.map((user) => [user.mikroCariCode || '', user]));

      const balances = await prisma.vadeBalance.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      const balanceByUserId = new Map(balances.map((balance) => [balance.userId, balance]));

      for (const row of rows) {
        const customerCode = row.customerCode;
        const user = userByCode.get(customerCode);
        if (!user) {
          recordsSkipped += 1;
          continue;
        }

        const pastDueBalance = normalizeAmount(row.pastDueBalance);
        const notDueBalance = normalizeAmount(row.notDueBalance);
        const totalBalance = round2(pastDueBalance + notDueBalance);
        const pastDueDate = normalizeDate(row.pastDueDate);
        const notDueDate = normalizeDate(row.notDueDate);
        const valor = calculateValor(pastDueDate);
        const referenceDate = normalizeDate(row.referenceDate);

        const existing = balanceByUserId.get(user.id);
        const isSame = existing
          && normalizeAmount(existing.pastDueBalance) === pastDueBalance
          && normalizeAmount(existing.notDueBalance) === notDueBalance
          && normalizeAmount(existing.totalBalance) === totalBalance
          && existing.valor === valor
          && datesMatch(existing.pastDueDate, pastDueDate)
          && datesMatch(existing.notDueDate, notDueDate)
          && datesMatch(existing.referenceDate, referenceDate)
          && (existing.paymentTermLabel || null) === (row.paymentTermLabel || null)
          && existing.source === VadeBalanceSource.MIKRO;

        if (isSame) {
          recordsSkipped += 1;
          continue;
        }

        await vadeService.upsertBalance({
          userId: user.id,
          pastDueBalance,
          pastDueDate,
          notDueBalance,
          notDueDate,
          totalBalance,
          valor,
          paymentTermLabel: row.paymentTermLabel,
          referenceDate,
          source: VadeBalanceSource.MIKRO,
        });
        recordsUpdated += 1;
      }

      const settings = await prisma.settings.findFirst();
      if (settings) {
        await prisma.settings.update({
          where: { id: settings.id },
          data: { lastVadeSyncAt: new Date() },
        });
      }

      await vadeService.updateSyncLog(syncLog.id, {
        status: VadeSyncStatus.SUCCESS,
        recordsTotal,
        recordsUpdated,
        recordsSkipped,
        completedAt: new Date(),
        details: { syncType, startedAt },
      });

      return {
        success: true,
        syncLogId: syncLog.id,
        recordsTotal,
        recordsUpdated,
        recordsSkipped,
      };
    } catch (error: any) {
      await vadeService.updateSyncLog(syncLog.id, {
        status: VadeSyncStatus.FAILED,
        recordsTotal,
        recordsUpdated,
        recordsSkipped,
        completedAt: new Date(),
        errorMessage: error?.message || 'Vade sync failed',
        details: { syncType, startedAt },
      });
      return {
        success: false,
        syncLogId: syncLog.id,
        error: error?.message || 'Vade sync failed',
      };
    }
  }
}

export default new VadeSyncService();
