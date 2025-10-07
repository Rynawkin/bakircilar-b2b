/**
 * İlk Admin Kullanıcı Oluşturma Script'i
 *
 * Kullanım: npx ts-node scripts/createAdmin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

async function createAdmin() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   👤 Admin Kullanıcı Oluşturma            ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  try {
    const email = await question('Email: ');
    const password = await question('Şifre: ');
    const name = await question('Ad Soyad: ');

    if (!email || !password || !name) {
      console.log('❌ Tüm alanları doldurun!');
      process.exit(1);
    }

    // Email kontrolü
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log('❌ Bu email zaten kullanılıyor!');
      process.exit(1);
    }

    // Şifre hash
    const hashedPassword = await bcrypt.hash(password, 10);

    // Admin oluştur
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'ADMIN',
        active: true,
      },
    });

    console.log('');
    console.log('✅ Admin kullanıcı başarıyla oluşturuldu!');
    console.log('');
    console.log('📧 Email:', admin.email);
    console.log('👤 Ad:', admin.name);
    console.log('🆔 ID:', admin.id);
    console.log('');

    // Default settings oluştur
    const existingSettings = await prisma.settings.findFirst();

    if (!existingSettings) {
      await prisma.settings.create({
        data: {
          calculationPeriodMonths: 3,
          includedWarehouses: ['DEPO1', 'MERKEZ'],
          minimumExcessThreshold: 10,
          costCalculationMethod: 'LAST_ENTRY',
          whiteVatFormula: 'cost * (1 + vat/2)',
        },
      });

      console.log('⚙️  Default ayarlar oluşturuldu');
      console.log('');
    }
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

createAdmin();
