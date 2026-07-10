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
      .filter((listNo: number) => Number.isInteger(listNo) && listNo >= 1 && listNo <= 10)
  );
  const missingLists = Array.from({ length: 10 }, (_, index) => index + 1).filter(
    (listNo) => !verifiedListNos.has(listNo)
  );
  const verificationStatus = String(data?.verificationStatus || '').trim().toUpperCase();
  const statusVerified = verificationStatus === 'VERIFIED' || !verificationStatus;

  if (
    data?.priceListsUpdated !== true ||
    !statusVerified ||
    verifiedListNos.size !== 10 ||
    missingLists.length > 0
  ) {
    const suffix = missingLists.length > 0 ? ` Eksik/dogrulanamayan listeler: ${missingLists.join(', ')}.` : '';
    return `Maliyet kaydi tamamlandi ancak 10 fiyat listesinin tamami dogrulanamadi.${suffix}`;
  }

  return null;
};
