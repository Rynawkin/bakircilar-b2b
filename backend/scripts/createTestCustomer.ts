/**
 * Test müşterisi oluşturma script'i
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function createTestCustomer() {
  try {
    console.log('🔧 Test müşterisi oluşturuluyor...\n');

    const hashedPassword = await hashPassword('123456');

    const customer = await prisma.user.create({
      data: {
        email: 'musteri@test.com',
        password: hashedPassword,
        name: 'Test Müşteri',
        role: 'CUSTOMER',
        customerType: 'BAYI',
        mikroCariCode: 'CARI001',
        active: true,
      },
    });

    console.log('✅ Test müşterisi oluşturuldu!\n');
    console.log('📧 Email: musteri@test.com');
    console.log('🔑 Şifre: 123456');
    console.log('👤 Tip: BAYI');
    console.log('🏢 Mikro Cari Kodu: CARI001\n');

  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log('⚠️  Bu email ile kullanıcı zaten mevcut');
    } else {
      console.error('❌ Hata:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestCustomer();
