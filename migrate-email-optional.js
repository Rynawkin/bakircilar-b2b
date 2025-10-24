const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Making email column nullable...');

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ALTER COLUMN email DROP NOT NULL;'
    );

    console.log('✅ Email column is now nullable');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
