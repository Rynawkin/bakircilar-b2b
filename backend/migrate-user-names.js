const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  try {
    // Tüm kullanıcıların name değerini displayName ve mikroName'e kopyala
    const users = await prisma.user.findMany();

    console.log(`Found ${users.length} users to migrate`);

    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          displayName: user.name,
          mikroName: user.name,
        }
      });
      console.log(`✓ Migrated user: ${user.email}`);
    }

    console.log(`✅ Successfully migrated ${users.length} users`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
