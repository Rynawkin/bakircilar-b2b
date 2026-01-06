import mikroFactory from './mikroFactory.service';

interface CariHareketParams {
  cariKod: string;
  startDate?: string; // YYYY-MM-DD format
  endDate?: string;   // YYYY-MM-DD format
}

interface CariSearchParams {
  searchTerm?: string;
  limit?: number;
}

const buildSqlSearchTokens = (value?: string) => {
  if (!value) return [] as string[];
  return value
    .replace(/\*/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
};

class CariHareketService {
  /**
   * Cari Hareket Föyü (041410) - Mikro'daki gibi tam detaylı hareket listesi
   */
  async getCariHareketFoyu(params: CariHareketParams): Promise<any> {
    const { cariKod, startDate, endDate } = params;

    // Eğer tarih verilmemişse, bu yılın ilk ve son günü
    const currentYear = new Date().getFullYear();
    const defaultStartDate = startDate || `${currentYear}-01-01`;
    const defaultEndDate = endDate || `${currentYear}-12-31`;

    // SQL injection'dan korunmak için parametreleri escape et
    const escapedCariKod = cariKod.replace(/'/g, "''");

    // Sadece gerekli kolonları Türkçe başlıklarla getir
    const query = `
      SELECT
        cha_evrakno_seri AS [Seri],
        cha_evrakno_sira AS [Sıra],
        cha_tarihi AS [Tarih],
        cha_belge_no AS [Belge No],
        cha_meblag AS [Tutar]
      FROM dbo.CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      WHERE cha_kod = '${escapedCariKod}'
        AND cha_create_date >= '${defaultStartDate}'
        AND cha_create_date < DATEADD(day, 1, '${defaultEndDate}')
      ORDER BY cha_tarihi
    `;

    const result = await mikroFactory.executeQuery(query);
    return result;
  }

  /**
   * Ekstre için basitleştirilmiş cari arama
   * Sadece gerekli kolonlar: Kod, Ad, Sektör, Grup, Bakiye
   */
  async searchCariForEkstre(params: CariSearchParams = {}): Promise<any> {
    const { searchTerm, limit = 100 } = params;

    let whereClause = "cari_grup_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'DİĞER' and cari_grup_kodu NOT LIKE 'DİĞER'";

    if (searchTerm && searchTerm.trim()) {
      const tokens = buildSqlSearchTokens(searchTerm);
      if (tokens.length > 0) {
        const tokenClauses = tokens.map((token) => {
          const escaped = token.replace(/'/g, "''");
          return `(cari_unvan1 LIKE '%${escaped}%' OR cari_kod LIKE '%${escaped}%' OR cari_unvan2 LIKE '%${escaped}%')`;
        });
        whereClause += ` AND ${tokenClauses.join(' AND ')}`;
      }
    }

    const query = `
      SELECT TOP ${limit}
        cari_kod AS [Cari Kodu],
        cari_unvan1 AS [Cari Adı],
        cari_sektor_kodu AS [Sektör Kodu],
        cari_grup_kodu AS [Grup Kodu],
        CAST(0 AS DECIMAL(18,2)) AS [Bakiye]
      FROM
        dbo.CARI_HESAPLAR WITH (NOLOCK)
      WHERE
        ${whereClause}
      ORDER BY
        cari_unvan1
    `;

    const result = await mikroFactory.executeQuery(query);
    return result;
  }

  /**
   * Cari bilgilerini getir (ekstre başlığı için)
   */
  async getCariInfo(cariKod: string): Promise<any> {
    const escapedCariKod = cariKod.replace(/'/g, "''");

    const query = `
      SELECT
        cari_kod AS [Cari Kodu],
        cari_unvan1 AS [Cari Adı],
        cari_unvan2 AS [Cari Adı 2],
        cari_sektor_kodu AS [Sektör Kodu],
        cari_grup_kodu AS [Grup Kodu],
        cari_vdaire_adi AS [Vergi Dairesi],
        cari_vdaire_no AS [Vergi No],
        dbo.fn_CariRiskFoyu(cari_kod, 0) AS [Bakiye]
      FROM
        dbo.CARI_HESAPLAR WITH (NOLOCK)
      WHERE
        cari_kod = '${escapedCariKod}'
    `;

    const result = await mikroFactory.executeQuery(query);
    return result.length > 0 ? result[0] : null;
  }
}

export const cariHareketService = new CariHareketService();
