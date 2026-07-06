// Vade not sistemi paylasilan sabitleri (cari detay + liste hizli not ortak kullanir).

export interface VadeNoteTagMeta {
  id: string;
  label: string;
  bg: string;
  border: string;
  text: string;
}

export const NOTE_TAGS: VadeNoteTagMeta[] = [
  { id: 'promise', label: 'Soz Verdi', bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  { id: 'postpone', label: 'Erteleme', bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  { id: 'no_response', label: 'Yanit Yok', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  { id: 'follow_up', label: 'Takip Et', bg: '#eef2fa', border: '#d6e0f1', text: '#1c4585' },
  { id: 'partial', label: 'Kismi Odeme', bg: '#f5f0ff', border: '#e0d4f7', text: '#7c3aed' },
  { id: 'other', label: 'Diger', bg: '#f1f4f9', border: '#e7ebf2', text: '#51607a' },
];

export interface VadeNoteTemplate {
  id: string;
  label: string;
  content: string;
  tag: string;
}

export const NOTE_TEMPLATES: VadeNoteTemplate[] = [
  { id: 'payment_promise', label: 'Odeme Sozu', content: 'Musteri, [TARIH] tarihinde odeme yapacagini soz verdi.', tag: 'promise' },
  { id: 'postpone_request', label: 'Erteleme Talebi', content: 'Musteri, odeme tarihinin [TARIH] tarihine ertelenmesini talep etti.', tag: 'postpone' },
  { id: 'partial_payment', label: 'Kismi Odeme', content: 'Musteri, [TUTAR] TL tutarinda kismi odeme yapacagini belirtti.', tag: 'partial' },
  { id: 'no_response', label: 'Yanit Yok', content: 'Musteri ile iletisime gecildi ancak yanit alinamadi.', tag: 'no_response' },
  { id: 'call_later', label: 'Daha Sonra Ara', content: 'Musteri, [TARIH] tarihinde tekrar aranmak uzere not dusuldu.', tag: 'follow_up' },
];

export const noteTagMeta = (id: string): VadeNoteTagMeta | undefined =>
  NOTE_TAGS.find((t) => t.id === id);

export const noteTagLabel = (id: string): string => noteTagMeta(id)?.label || id;

/**
 * Soz tarihinden bir IS GUNU oncesini dondurur (hafta sonu ise Cuma'ya ceker).
 * Girdi/cikti: 'YYYY-MM-DD'. Yerel tarih olarak isler (TZ kaymasini onlemek icin
 * bilesenlerden Date kurar).
 */
export function businessDayBefore(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const day = dt.getDay(); // 0 Pazar, 6 Cumartesi
  if (day === 0) dt.setDate(dt.getDate() - 2);
  else if (day === 6) dt.setDate(dt.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
