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
  decisionQuestion: string;
  inclusionRule: string;
  firstAction: string;
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
    decisionQuestion: 'Hangi cari, daha önce aldığı hangi kategoriyi artık almıyor?',
    inclusionRule: 'Kategori geçmişte alınmış; seçilen pasif dönem boyunca tekrar alınmamış.',
    firstAction: 'Kategoriye özel kayıp nedenini araştır, uygun ürün/fiyat teklifiyle takip aç.',
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
    decisionQuestion: 'Hangi carinin toplam alımı düştü veya tamamen durdu?',
    inclusionRule: 'Carinin son dönem ortalaması, kendi geçmiş alış düzeninin ve risk eşiğinin altında.',
    firstAction: 'Risk nedenini doğrula; sorumlu, takip tarihi ve geri kazanım aksiyonu belirle.',
    accent: '#b91c1c',
  },
  categoryOpportunity: {
    key: 'categoryOpportunity',
    href: '/reports/category-opportunity',
    title: 'İlk Kategori Satışı Fırsatları',
    shortTitle: 'İlk kategori satışı',
    purpose: 'İLK KATEGORİ SATIŞI',
    description:
      'Seçili kategoriyi geçmişte hiç almamış aktif carilere, mevcut alımlarından kanıtlı ürün önerileri üretir.',
    decisionQuestion: 'Bu kategoriyi hiç almamış hangi aktif cariye ilk kez ne satılabilir?',
    inclusionRule: 'Cari hedef kategoriyi hiç almamış; aldığı ürünlerle hedef kategori arasında birlikte satış kanıtı var.',
    firstAction: 'Kanıtı en güçlü öneri ürünüyle ilk kategori teklifini hazırla.',
    accent: '#1d4ed8',
  },
  complementMissing: {
    key: 'complementMissing',
    href: '/reports/complement-missing',
    title: 'Eksik Tamamlayıcı Ürün Fırsatları',
    shortTitle: 'Alım geçmişini tamamlama',
    purpose: 'MEVCUT ALIMI GENİŞLET',
    description:
      'Carinin seçili dönemdeki gerçekleşmiş ürün alışlarında beklenen, ancak eksik kalan tamamlayıcıları gösterir.',
    decisionQuestion: 'Geçmiş alımın yanında hangi tamamlayıcı ürün veya kapsam eksik kalıyor?',
    inclusionRule: 'Cari baz ürünü almış; tanımlı ya da otomatik ilişkiye rağmen tamamlayıcıyı almamış.',
    firstAction: 'Eksik tamamlayıcıları çapraz satış görüşmesine, göreve veya teklife dönüştür.',
    accent: '#047857',
  },
};

export const SALES_DECISION_REPORT_LIST = Object.values(SALES_DECISION_REPORTS);
