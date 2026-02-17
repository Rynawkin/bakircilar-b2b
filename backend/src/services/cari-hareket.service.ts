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
   * Cari Hareket FÃ¶yÃ¼ (041410) - Mikro'daki gibi tam detaylÄ± hareket listesi
   */
  async getCariHareketFoyu(params: CariHareketParams): Promise<any> {
    const { cariKod, startDate, endDate } = params;

    // EÄŸer tarih verilmemiÅŸse, bu yÄ±lÄ±n ilk ve son gÃ¼nÃ¼
    const currentYear = new Date().getFullYear();
    const defaultStartDate = startDate || `${currentYear}-01-01`;
    const defaultEndDate = endDate || `${currentYear}-12-31`;

    // SQL injection'dan korunmak iÃ§in parametreleri escape et
    const escapedCariKod = cariKod.replace(/'/g, "''");

    const openingQuery = `
      SELECT
        SUM(CASE WHEN cha_tip = 0 THEN cha_meblag ELSE 0 END) AS borc,
        SUM(CASE WHEN cha_tip = 1 THEN cha_meblag ELSE 0 END) AS alacak
      FROM dbo.CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      WHERE cha_kod = '${escapedCariKod}'
        AND cha_create_date < '${defaultStartDate}'
    `;

    const openingResult = await mikroFactory.executeQuery(openingQuery);
    const openingBorc = Number(openingResult?.[0]?.borc) || 0;
    const openingAlacak = Number(openingResult?.[0]?.alacak) || 0;

    // Sadece gerekli kolonlarÄ± TÃ¼rkÃ§e baÅŸlÄ±klarla getir
    const query = `
      SELECT
        cha_evrakno_seri AS [Seri],
        cha_evrakno_sira AS [SÄ±ra],
        cha_tarihi AS [Tarih],
        cha_belge_no AS [Belge No],
        COALESCE(evrak.CHEvrUzunIsim, evrak.CHEvrKisaIsim) AS [Evrak Tipi],
        cins.CHCinsIsim AS [Odeme Tipi],
        tip.CHTipIsim AS [Hareket Tipi],
        cha_tip AS [Tip Kodu],
        cha_meblag AS [Tutar]
      FROM dbo.CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      LEFT JOIN dbo.vw_Cari_Hareket_Evrak_Isimleri evrak ON evrak.CHEvrNo = cha_evrak_tip
      LEFT JOIN dbo.vw_Cari_Hareket_Cins_Isimleri cins ON cins.CHCinsNo = cha_cinsi
      LEFT JOIN dbo.vw_Cari_Hareket_Tip_Isimleri tip ON tip.CHTipNo = cha_tip
      WHERE cha_kod = '${escapedCariKod}'
        AND cha_create_date >= '${defaultStartDate}'
        AND cha_create_date < DATEADD(day, 1, '${defaultEndDate}')
      ORDER BY cha_tarihi
    `;

    const result = await mikroFactory.executeQuery(query);
    return {
      rows: result,
      opening: {
        borc: openingBorc,
        alacak: openingAlacak,
        bakiye: openingBorc - openingAlacak,
      },
    };
  }

  /**
   * Ekstre iÃ§in basitleÅŸtirilmiÅŸ cari arama
   * Sadece gerekli kolonlar: Kod, Ad, SektÃ¶r, Grup, Bakiye
   */
  async searchCariForEkstre(params: CariSearchParams = {}): Promise<any> {
    const { searchTerm, limit = 100 } = params;

    let whereClause = "cari_grup_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'DÄ°ÄER' and cari_grup_kodu NOT LIKE 'DÄ°ÄER'";

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
        cari_unvan1 AS [Cari AdÄ±],
        cari_vdaire_no AS [Vergi No],
        cari_sektor_kodu AS [SektÃ¶r Kodu],
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
   * Cari bilgilerini getir (ekstre baÅŸlÄ±ÄŸÄ± iÃ§in)
   */
  async getCariInfo(cariKod: string): Promise<any> {
    const escapedCariKod = cariKod.replace(/'/g, "''");

    const query = `
      SELECT
        cari_kod AS [Cari Kodu],
        cari_unvan1 AS [Cari AdÄ±],
        cari_unvan2 AS [Cari AdÄ± 2],
        cari_sektor_kodu AS [SektÃ¶r Kodu],
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
