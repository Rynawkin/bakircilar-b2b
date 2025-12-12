import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createCustomer() {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash('pass', 10);

    // Create the customer user
    const user = await prisma.user.create({
      data: {
        email: 'musteri@example.com',
        password: hashedPassword,
        name: 'Müşteri',
        mikroName: 'Müşteri',
        displayName: 'Müşteri',
        role: 'CUSTOMER',
        customerType: 'BAYI',
        active: true,
      },
    });

    console.log('✅ Müşteri hesabı başarıyla oluşturuldu:');
    console.log('Email/Username: musteri@example.com');
    console.log('Password: pass');
    console.log('Role:', user.role);
    console.log('ID:', user.id);

  } catch (error: any) {
    console.error('❌ Hata:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createCustomer();
