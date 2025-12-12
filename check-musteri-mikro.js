const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndUpdateUser() {
  try {
    // Check current user
    const user = await prisma.user.findUnique({
      where: { email: 'musteri' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        customerType: true,
        mikroCariCode: true
      }
    });

    console.log('Current user:', JSON.stringify(user, null, 2));

    // If mikroCariCode is null, we need to set a test value
    // Let's use a generic BAYI code for testing
    if (!user.mikroCariCode) {
      console.log('\nmikroCariCode is null, updating...');

      // Update with a test Mikro cari code
      const updated = await prisma.user.update({
        where: { email: 'musteri' },
        data: { mikroCariCode: '120.01.001' } // Generic test BAYI code
      });

      console.log('Updated user:', JSON.stringify(updated, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndUpdateUser();
