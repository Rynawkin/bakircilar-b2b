import { getPriceListFallbackChain } from '../config/price-list-registry';

/**
 * Builds the effective Mikro price expression for a physical standard list.
 *
 * The requested physical list number is preserved for audit/document rows, but
 * a missing/zero price can safely use the registry-defined lower tier. This is
 * especially important during the F6/P6 rollout where list 13 falls back to 10
 * and list 14 falls back to 5.
 */
export const buildMikroEffectivePriceSql = (
  stockCodeExpression: string,
  listNo: number,
  unitPointer = 1
): string => {
  const resolutionChain = [listNo, ...getPriceListFallbackChain(listNo)];
  const candidates = resolutionChain.map(
    (candidateListNo) =>
      `NULLIF(dbo.fn_StokSatisFiyati(${stockCodeExpression}, ${candidateListNo}, 0, ${unitPointer}), 0)`
  );

  return `COALESCE(${candidates.join(', ')}, 0)`;
};
