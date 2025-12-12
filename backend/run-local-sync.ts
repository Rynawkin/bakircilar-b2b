import priceSyncService from './src/services/priceSync.service';

(async () => {
  try {
    console.log('🚀 Starting local price sync...');
    console.log('⏱️  This may take 5-10 minutes for 274,081 records');
    console.log('');

    const startTime = Date.now();
    await priceSyncService.syncPriceChanges();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log(`✅ Sync completed in ${duration} seconds!`);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
