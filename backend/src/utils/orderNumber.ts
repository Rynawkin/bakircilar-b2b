/**
 * Sipariş numarası üretici
 * Format: ORD-2024-00001
 */
export const generateOrderNumber = (lastOrderNumber?: string): string => {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  if (!lastOrderNumber || !lastOrderNumber.startsWith(prefix)) {
    return `${prefix}00001`;
  }

  // Son sipariş numarasından sıra numarasını çıkar
  const lastNumber = parseInt(lastOrderNumber.split('-')[2], 10);
  const nextNumber = lastNumber + 1;

  // 5 basamaklı formatta döndür (00001, 00002, ...)
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};
