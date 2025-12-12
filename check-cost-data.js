const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    // Check products with cost data
    const products = await prisma.product.findMany({
      where: {
        active: true,
        lastEntryPrice: { not: null },
        currentCost: { not: null },
      },
      select: {
        mikroCode: true,
        name: true,
        currentCost: true,
        currentCostDate: true,
        lastEntryPrice: true,
        lastEntryDate: true,
      },
      take: 5,
    });

    console.log('\nProducts with cost data:');
    console.log(JSON.stringify(products, null, 2));

    // Count total products with cost data
    const totalWithCostData = await prisma.product.count({
      where: {
        active: true,
        lastEntryPrice: { not: null },
        currentCost: { not: null },
      },
    });

    console.log(`\nTotal products with cost data: ${totalWithCostData}`);

    // Count products where lastEntryPrice > currentCost
    const alertProducts = await prisma.product.count({
      where: {
        active: true,
        lastEntryPrice: { not: null },
        currentCost: { not: null },
        lastEntryDate: { not: null },
        currentCostDate: { not: null },
      },
    });

    console.log(`Products with all required fields: ${alertProducts}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
