/**
 * Cari Sync Service
 *
 * Mikro ERP'den cari bilgilerini çekip PostgreSQL'e senkronize eder
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';

class CariSyncService {
  /**
   * Cari senkronizasyonunu başlat ve log ID döndür
   */
  async startCariSync(): Promise<string> {
    // Log oluştur (henüz SyncLog'a eklenmedi, basit console log)
    const syncId = `cari-sync-${Date.now()}`;

    console.log(`🔄 Cari senkronizasyonu başladı: ${syncId}`);

    // Arka planda sync'i çalıştır
    this.runCariSync(syncId).catch((error) => {
      console.error('❌ Cari sync hatası:', error);
    });

    return syncId;
  }

  /**
   * Cari senkronizasyonu çalıştır
   */
  async runCariSync(syncId: string): Promise<{
    success: boolean;
    stats: {
      totalCari: number;
      updatedUsers: number;
      notFoundInB2B: number;
    };
    error?: string;
  }> {
    const startTime = new Date();

    try {
      console.log('🔄 Cari bilgileri Mikro\'dan çekiliyor...');

      // Mikro'dan cari bilgilerini çek
      const mikroCaris = await mikroService.getCariDetails();
      console.log(`✅ ${mikroCaris.length} cari bilgisi çekildi`);

      let updatedUsers = 0;
      let notFoundInB2B = 0;

      // Her cari için B2B sisteminde user var mı kontrol et ve güncelle
      for (const cari of mikroCaris) {
        const user = await prisma.user.findUnique({
          where: { mikroCariCode: cari.code },
        });

        if (user) {
          // Kullanıcı varsa bilgilerini güncelle
          await prisma.user.update({
            where: { id: user.id },
            data: {
              name: cari.name, // İsim güncellenebilir
              city: cari.city,
              district: cari.district,
              phone: cari.phone,
              isLocked: cari.isLocked,
              groupCode: cari.groupCode,
              sectorCode: cari.sectorCode,
              paymentTerm: cari.paymentTerm,
              hasEInvoice: cari.hasEInvoice,
              balance: cari.balance,
            },
          });

          updatedUsers++;

          if (updatedUsers % 10 === 0) {
            console.log(`  📊 İlerleme: ${updatedUsers} kullanıcı güncellendi`);
          }
        } else {
          notFoundInB2B++;
        }
      }

      const duration = (new Date().getTime() - startTime.getTime()) / 1000;

      console.log('🎉 Cari senkronizasyonu tamamlandı!');
      console.log(`  ✅ Toplam cari: ${mikroCaris.length}`);
      console.log(`  ✅ Güncellenen kullanıcı: ${updatedUsers}`);
      console.log(`  ⏭️ B2B'de bulunamayan: ${notFoundInB2B}`);
      console.log(`  ⏱️ Süre: ${duration.toFixed(1)}s`);

      return {
        success: true,
        stats: {
          totalCari: mikroCaris.length,
          updatedUsers,
          notFoundInB2B,
        },
      };
    } catch (error: any) {
      console.error('❌ Cari senkronizasyon hatası:', error);

      return {
        success: false,
        stats: {
          totalCari: 0,
          updatedUsers: 0,
          notFoundInB2B: 0,
        },
        error: error.message,
      };
    }
  }
}

export default new CariSyncService();
