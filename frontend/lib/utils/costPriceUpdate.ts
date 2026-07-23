import { STANDARD_PRICE_LIST_NOS } from '@/lib/utils/priceLists';

export const getPriceListVerificationError = (
  data: any,
  updatePriceListsRequested: boolean
): string | null => {
  if (!updatePriceListsRequested) return null;

  const updatedLists = Array.isArray(data?.updatedLists) ? data.updatedLists : [];
  const verifiedListNos = new Set(
    updatedLists
      .filter((row: any) => row?.verified !== false && Number(row?.affected || 0) > 0)
      .map((row: any) => Number(row?.listNo))
      .filter((listNo: number) => STANDARD_PRICE_LIST_NOS.includes(listNo))
  );
  const missingLists = STANDARD_PRICE_LIST_NOS.filter(
    (listNo) => !verifiedListNos.has(listNo)
  );
  const verificationStatus = String(data?.verificationStatus || '').trim().toUpperCase();
  const statusVerified = verificationStatus === 'VERIFIED' || !verificationStatus;

  if (
    data?.priceListsUpdated !== true ||
    !statusVerified ||
    verifiedListNos.size !== STANDARD_PRICE_LIST_NOS.length ||
    missingLists.length > 0
  ) {
    const suffix = missingLists.length > 0 ? ` Eksik/dogrulanamayan listeler: ${missingLists.join(', ')}.` : '';
    return `Maliyet kaydi tamamlandi ancak 12 ana fiyat listesinin tamami dogrulanamadi.${suffix}`;
  }

  return null;
};
