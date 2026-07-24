export type SalesDecisionReportKey =
  | 'categoryChurn'
  | 'customerRecovery'
  | 'categoryOpportunity'
  | 'complementMissing';

export interface SalesDecisionReportDefinition {
  key: SalesDecisionReportKey;
  href: string;
  title: string;
  shortTitle: string;
  purpose: string;
  description: string;
  accent: string;
}

export const SALES_DECISION_REPORTS: Record<SalesDecisionReportKey, SalesDecisionReportDefinition> = {
  categoryChurn: {
    key: 'categoryChurn',
    href: '/reports/category-churn',
    title: 'Kategori-Cari Alım Kesintileri',
    shortTitle: 'Duran kategori alımı',
    purpose: 'KATEGORİ GERİ KAZANIMI',
    description:
      'Daha önce alınmış, ancak seçilen süredir tekrarlanmamış kategori-cari ilişkilerini bulur.',
    accent: '#b45309',
  },
  customerRecovery: {
    key: 'customerRecovery',
    href: '/reports/customer-recovery',
    title: 'Satışı Düşen veya Duran Cariler',
    shortTitle: 'Cari geri kazanımı',
    purpose: 'CARİ GERİ KAZANIMI',
    description:
      'Carinin toplam satışındaki düşüşü veya duruşu bulur; sorumlu, takip tarihi ve sonucu yönetir.',
    accent: '#b91c1c',
  },
  categoryOpportunity: {
    key: 'categoryOpportunity',
    href: '/reports/category-opportunity',
    title: 'Yeni Kategori Kazandırma Fırsatları',
    shortTitle: 'Yeni kategori satışı',
    purpose: 'YENİ KATEGORİ KAZANIMI',
    description:
      'Seçili kategoriyi geçmişte hiç almamış aktif carilere, mevcut alımlarından kanıtlı ürün önerileri üretir.',
    accent: '#1d4ed8',
  },
  complementMissing: {
    key: 'complementMissing',
    href: '/reports/complement-missing',
    title: 'Eksik Tamamlayıcı Ürün Fırsatları',
    shortTitle: 'Sepet tamamlama',
    purpose: 'ÇAPRAZ SATIŞ',
    description:
      'Mevcut alışlarda birlikte satılması beklenen, fakat sepette eksik kalan tamamlayıcı ürünleri gösterir.',
    accent: '#047857',
  },
};

export const SALES_DECISION_REPORT_LIST = Object.values(SALES_DECISION_REPORTS);
