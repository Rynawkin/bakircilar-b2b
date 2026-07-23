export type RequiredSyncStageResult = {
  success: boolean;
  error?: string;
};

export type RequiredSyncSequenceResult<
  TFull extends RequiredSyncStageResult,
  TPrice extends RequiredSyncStageResult,
> = {
  success: boolean;
  fullResult: TFull;
  priceResult: TPrice | null;
  error?: string;
};

/**
 * Run the two required stages of a complete Mikro synchronization in order.
 *
 * The caller owns the shared advisory lock for the whole invocation. Keeping
 * this helper lock-agnostic makes the sequencing independently testable while
 * the call site makes the lock boundary explicit.
 */
export const runRequiredMikroSyncStages = async <
  TFull extends RequiredSyncStageResult,
  TPrice extends RequiredSyncStageResult,
>(
  runFullSync: () => Promise<TFull>,
  runPriceSync: () => Promise<TPrice>
): Promise<RequiredSyncSequenceResult<TFull, TPrice>> => {
  const fullResult = await runFullSync();
  if (!fullResult.success) {
    return {
      success: false,
      fullResult,
      priceResult: null,
      error: fullResult.error || 'Tam senkronizasyon basarisiz.',
    };
  }

  const priceResult = await runPriceSync();
  if (!priceResult.success) {
    return {
      success: false,
      fullResult,
      priceResult,
      error: priceResult.error || 'Fiyat senkronizasyonu basarisiz.',
    };
  }

  return {
    success: true,
    fullResult,
    priceResult,
  };
};
