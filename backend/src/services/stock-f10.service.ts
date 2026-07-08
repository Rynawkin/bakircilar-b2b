import mikroFactory from './mikroFactory.service';
import { prisma } from '../utils/prisma';
import { normalizeSearchText, splitSearchTokens } from '../utils/search';

interface StockF10SearchParams {
  searchTerm?: string;
  productCodes?: string[];
  limit?: number;
  offset?: number;
}

const buildSqlSearchTokens = (value?: string) => {
  if (!value) return [] as string[];
  return value
    .replace(/\*/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
};

class StockF10Service {
  private toNumber(value: any, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'object' && typeof value.toNumber === 'function') {
      const parsed = value.toNumber();
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readWarehouseStock(stocks: any, keys: string[]) {
    if (!stocks || typeof stocks !== 'object') return 0;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(stocks, key)) {
        return this.toNumber(stocks[key]);
      }
    }
    return 0;
  }

  private mapLocalProductToStockRow(product: any) {
    const stocks = product.warehouseStocks || {};
    const merkez = this.readWarehouseStock(stocks, ['1', 'DEPO1', 'MERKEZ', 'Merkez', 'merkez']);
    const eregli = this.readWarehouseStock(stocks, ['2', 'DEPO2', 'EREGLI', 'Eregli', 'eregli']);
    const topca = this.readWarehouseStock(stocks, ['6', 'DEPO6', 'TOPCA', 'Topca', 'topca']);
    const dukkan = this.readWarehouseStock(stocks, ['7', 'DEPO7', 'DUKKAN', 'Dukkan', 'dukkan']);
    const istanbulArac = this.readWarehouseStock(stocks, ['8', 'DEPO8', 'ISTANBUL_ARAC']);
    const istanbulYeni = this.readWarehouseStock(stocks, ['9', 'DEPO9', 'ISTANBUL_YENI']);
    const totalStock = merkez + eregli + topca + dukkan;
    const pendingCustomer = this.toNumber(product.pendingCustomerOrders);
    const pendingPurchase = this.toNumber(product.pendingPurchaseOrders);
    const totalSellable = totalStock - pendingCustomer + pendingPurchase;
    const vatRatePct = this.toNumber(product.vatRate) > 1
      ? this.toNumber(product.vatRate)
      : this.toNumber(product.vatRate) * 100;
    const currentCost = this.toNumber(product.currentCost);
    const currentCostVatIncluded = currentCost * (1 + (vatRatePct / 100));

    return {
      msg_S_0088: product.id,
      msg_S_0870: product.name,
      'Yab.İsim': product.foreignName || null,
      'Kısa İsim': null,
      msg_S_0078: product.mikroCode,
      'KDV Oranı': vatRatePct,
      'BİR AYLIK SATIS MİKTARI': 0,
      '3 Aylık Satış': product.popularSalesQuantity || 0,
      'Güncel Maliyet + Kdv.': currentCost,
      'Güncel Maliyet Kdv Dahil': currentCostVatIncluded,
      'Güncel Maliyet Tarihi': product.currentCostDate || null,
      'Son Giriş Tarihi': product.lastEntryDate || null,
      'Son Giriş Maliyeti + Kdv': product.lastEntryPrice || 0,
      'Son Giriş Maliyeti Kdv Dahil': product.lastEntryPrice
        ? this.toNumber(product.lastEntryPrice) * (1 + (vatRatePct / 100))
        : 0,
      'Merkez Depo': merkez,
      'Merkez Depo Siparişte Bekleyen': pendingCustomer,
      'Merkez Depo Satın Alma Siparişte Bekleyen': pendingPurchase,
      'Merkez Depo Satılabilir': merkez,
      'Ereglı Depo': eregli,
      'Ereglı Depo Siparişte Bekleyen': 0,
      'Ereglı Depo Satın Alma Siparişte Bekleyen': 0,
      'Eregli Depo Satılabilir': eregli,
      'Topca Depo': topca,
      'Topca Depo Siparişte Bekleyen': 0,
      'Topca Depo Satın Alma Siparişte Bekleyen': 0,
      'Topca Depo Satılabilir': topca,
      'Dükkan Depo': dukkan,
      'Dükkan Depo Siparişte Bekleyen': 0,
      'Dükkan Depo Satın Alma Siparişte Bekleyen': 0,
      'Dükkan Depo Satılabilir': dukkan,
      'Toplam Eldeki Miktar': totalStock,
      'Toplam Satılabilir': totalSellable,
      'Fazla Miktar': product.excessStock || 0,
      'İstanbul Araç Depo': istanbulArac,
      'İstanbul Yeni Depo': istanbulYeni,
      Birim: product.unit || 'ADET',
      '2. Birim': product.unit2 || null,
      '2. Birim Katsayısı': product.unit2Factor || null,
      Marka: product.brandCode || null,
      'Kategori kodu': product.category?.mikroCode || null,
      'Kategori Adı': product.category?.name || null,
      __source: 'LOCAL_CACHE',
    };
  }

  async getFallbackStocksByCodes(productCodes: string[]): Promise<any[]> {
    const normalizedCodes = Array.from(
      new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
    );
    if (normalizedCodes.length === 0) return [];

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: normalizedCodes }, active: true },
      include: { category: { select: { mikroCode: true, name: true } } },
    });
    const byCode = new Map(products.map((product) => [String(product.mikroCode || '').trim(), product]));
    return normalizedCodes
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .map((product) => this.mapLocalProductToStockRow(product));
  }

  async searchFallbackStocks(params: StockF10SearchParams = {}): Promise<any[]> {
    const rawTerm = String(params.searchTerm || '').trim();
    if (!rawTerm) return [];

    const tokens = splitSearchTokens(rawTerm).map(normalizeSearchText).filter(Boolean);
    const where: any = {
      active: true,
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { searchText: { contains: token } },
                { mikroCode: { contains: token, mode: 'insensitive' } },
                { name: { contains: token, mode: 'insensitive' } },
                { brandCode: { contains: token, mode: 'insensitive' } },
              ],
            })),
          }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      include: { category: { select: { mikroCode: true, name: true } } },
      orderBy: [{ popularSalesValue: 'desc' }, { name: 'asc' }],
      take: Math.max(1, Math.min(Number(params.limit) || 100, 200)),
    });

    return products.map((product) => this.mapLocalProductToStockRow(product));
  }
  // Stok F10 sorgusunu çalıştırır
  async searchStocks(params: StockF10SearchParams = {}): Promise<any> {
    const { searchTerm, productCodes, limit = 100, offset = 0 } = params;

    // WHERE koşulu - arama terimi varsa ekle
    let whereClause = "sto_isim NOT LIKE '' and sto_pasif_fl='0'";
    if (productCodes && productCodes.length > 0) {
      const safeCodes = productCodes
        .map((code) => code.replace(/'/g, "''"))
        .map((code) => `'${code}'`)
        .join(', ');
      whereClause += ` AND sto_kod IN (${safeCodes})`;
    } else if (searchTerm && searchTerm.trim()) {
      const tokens = buildSqlSearchTokens(searchTerm);
      if (tokens.length > 0) {
        const tokenClauses = tokens.map((token) => {
          const escaped = token.replace(/'/g, "''");
          return `(sto_isim COLLATE Turkish_CI_AI LIKE N'%${escaped}%' OR sto_kod COLLATE Turkish_CI_AI LIKE N'%${escaped}%' OR EXISTS (SELECT 1 FROM BARKOD_TANIMLARI bt WITH (NOLOCK) WHERE bt.bar_stokkodu = sto_kod AND ISNULL(bt.bar_kodu, '') COLLATE Turkish_CI_AI LIKE N'%${escaped}%'))`;
        });
        whereClause += ` AND ${tokenClauses.join(' AND ')}`;
      }
    }

    const query = `
      SELECT TOP ${limit}
        sto_Guid AS [msg_S_0088],
        sto_isim AS [msg_S_0870],
        sto_yabanci_isim as [Yab.İsim],
        sto_kisa_ismi as [Kısa İsim],
        sto_kod AS [msg_S_0078],

        dbo.fn_VergiYuzde(sto_toptan_Vergi) as [KDV Oranı],

        ISNULL((SELECT SUM(sth_miktar)
        FROM STOK_HAREKETLERI WHERE
        sth_stok_kod=sto_kod AND ((sth_tip=1 and sth_evraktip=4) OR (sth_tip=1 and sth_evraktip=1 and sth_fat_uid!='00000000-0000-0000-0000-000000000000'))
        AND(SELECT cari_sektor_kodu FROM CARI_HESAPLAR WHERE cari_kod=sth_cari_kodu) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        and sth_tarih>= DATEADD(DAY, -30, GETDATE() )),0) +
        ISNULL((SELECT SUM(sth_miktar) FROM STOK_HAREKETLERI WHERE
        sth_stok_kod=sto_kod AND sth_tip='1' and sth_evraktip='1'
        AND(SELECT cari_sektor_kodu FROM CARI_HESAPLAR WHERE cari_kod=sth_cari_kodu) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        and sth_fat_uid='00000000-0000-0000-0000-000000000000'  and sth_tarih>= DATEADD(DAY, -30, GETDATE()  ))
        ,0) AS [BİR AYLIK SATIS MİKTARI],

        ISNULL((SELECT SUM(sth_miktar) FROM STOK_HAREKETLERI WHERE
        sth_stok_kod=sto_kod
        AND(SELECT cari_sektor_kodu FROM CARI_HESAPLAR WHERE cari_kod=sth_cari_kodu) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        AND ((sth_tip=1 and sth_evraktip=4) OR (sth_tip=1 and sth_evraktip=1 and sth_fat_uid!='00000000-0000-0000-0000-000000000000'))
        and sth_tarih>= DATEADD(DAY, -90, GETDATE() )),0)+
        ISNULL((SELECT SUM(sth_miktar) FROM STOK_HAREKETLERI
        WHERE sth_stok_kod=sto_kod AND sth_tip='1'
        AND(SELECT cari_sektor_kodu FROM CARI_HESAPLAR WHERE cari_kod=sth_cari_kodu) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        and sth_fat_uid='00000000-0000-0000-0000-000000000000'  and sth_tarih>= DATEADD(DAY, -90, GETDATE()  ))
        ,0) AS [3 Aylık Satış],

        sto_standartmaliyet as [Güncel Maliyet + Kdv.],
        (sto_standartmaliyet/100 * (dbo.fn_VergiYuzde(sto_toptan_Vergi)) )+ sto_standartmaliyet  AS [Güncel Maliyet Kdv Dahil],
        MaliyetTarihi as [Güncel Maliyet Tarihi],
        FiyatDegisimTarihi as [Satış Fiyatı Değişiklik Tarihi],

        (SELECT top 1
        sth_tarih
        FROM dbo.STOK_HAREKETLERI
        WHERE (sth_tip = 0) AND (sth_evraktip in(3,13,13)) and(sth_cins IN (0,1)) AND (sth_stok_kod = sto_kod ) AND (sth_normal_iade = 0)
        ORDER BY sth_tarih DESC) AS [Son Giriş Tarihi],

        dbo.fn_DepodakiMiktar(sto_kod,7,0) as [Dükkan Depo],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='7' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Dükkan Depo Siparişte Bekleyen],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='7' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Dükkan Depo Satın Alma Siparişte Bekleyen],
        ((dbo.fn_DepodakiMiktar(sto_kod,7,0)-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='7'AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0)))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='7' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))) AS [Dükkan Depo Satılabilir],

        dbo.fn_DepolardakiKonsinyeMiktar(sto_kod,1,0) as [Merkez Depo KonsinyeMiktar],
        dbo.fn_DepodakiMiktar(sto_kod,1,0) as [Merkez Depo],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Merkez Depo Siparişte Bekleyen],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Merkez Depo Satın Alma Siparişte Bekleyen],
        ((dbo.fn_DepodakiMiktar(sto_kod,1,0)-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0)))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))) AS [Merkez Depo Satılabilir],

        dbo.fn_DepodakiMiktar(sto_kod,2,0) as [Ereğli Depo],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Ereglı Depo Siparişte Bekleyen],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Ereglı Depo Satın Alma Siparişte Bekleyen],
        ((dbo.fn_DepodakiMiktar(sto_kod,2,0))-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) )+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))) AS [Ereğli Depo Satılabilir],

        dbo.fn_DepodakiMiktar(sto_kod,6,0) as [Topça Depo],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Topca Depo Siparişte Bekleyen],
        ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) as [Topca Depo Satın Alma Siparişte Bekleyen],
        ((dbo.fn_DepodakiMiktar(sto_kod,6,0))-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))) AS [Topça Depo Satılabilir],

        (((dbo.fn_DepodakiMiktar(sto_kod,2,0))-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) ))+((dbo.fn_DepodakiMiktar(sto_kod,1,0)-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))))+((dbo.fn_DepodakiMiktar(sto_kod,6,0))-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0)))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='1' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='2' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0) )+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='6' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))+(((dbo.fn_DepodakiMiktar(sto_kod,7,0)-(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=0 AND sip_depono='7' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0)))+(ISNULL( (SELECT sum(sip_miktar-sip_teslim_miktar) FROM dbo.SIPARISLER WITH (NOLOCK) WHERE sip_tip=1 AND sip_depono='7' AND sip_kapat_fl=0 AND (sip_miktar>sip_teslim_miktar)   AND sip_stok_kod=sto_kod),0))))) AS [Toplam Satılabilir],

        dbo.fn_DepodakiMiktar(sto_kod,1,0)+dbo.fn_DepodakiMiktar(sto_kod,2,0)+dbo.fn_DepodakiMiktar(sto_kod,6,0) AS [Toplam Eldeki Miktar],
        (dbo.fn_DepodakiMiktar(sto_kod,1,0)+dbo.fn_DepodakiMiktar(sto_kod,2,0)+dbo.fn_DepodakiMiktar(sto_kod,6,0)) - ((select sdp_max_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=6 and sto_kod=sdp_depo_kod) + (select sdp_max_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=1 and sto_kod=sdp_depo_kod)) AS [Fazla Miktar],

        dbo.fn_DepodakiMiktar(sto_kod,8,0) as [İstanbul Araç Depo],
        dbo.fn_DepodakiMiktar(sto_kod,9,0) as [İstanbul Yeni Depo],

        sto_birim1_ad as [Birim],
        sto_birim2_ad as [2. Birim],
        sto_birim2_katsayi as [2. Birim Katsayısı],
        dbo.fn_CarininIsminiBul('',sto_sat_cari_kod) AS [Tedarikci],
        sto_marka_kodu as [Marka],
        sto_kategori_kodu as [Kategori kodu],
        sto_create_date as [ilk oluşturma tarihi],
        dbo.fn_KategoriIsmi(sto_kategori_kodu) AS [Kategori Adı],

        (SELECT top 1
        dbo.fn_StokHareketNetDeger(sth_tutar,sth_iskonto1,sth_iskonto2,sth_iskonto3,sth_iskonto4,sth_iskonto5,sth_iskonto6,sth_masraf1,sth_masraf2,sth_masraf3,sth_masraf4,sth_otvtutari,sth_tip,0,0,sth_har_doviz_kuru,sth_alt_doviz_kuru,sth_stok_doviz_kuru) / sth_miktar
        FROM dbo.STOK_HAREKETLERI
        WHERE (sth_tip = 0) AND (sth_evraktip in(3,13,13)) and (sth_cins IN (0,1)) AND (sth_stok_kod = sto_kod ) AND (sth_normal_iade = 0)and sth_fat_uid!='00000000-0000-0000-0000-000000000000'
        ORDER BY sth_tarih DESC) AS [Son Giriş Maliyeti + Kdv],

        (SELECT top 1
        dbo.fn_StokHareketVergiDahilNetDeger(sth_tutar,sth_iskonto1,sth_iskonto2,sth_iskonto3,sth_iskonto4,sth_iskonto5,sth_iskonto6,sth_masraf1,sth_masraf2,sth_masraf3,sth_masraf4,sth_otvtutari,sth_oivtutari,sth_tip,sth_har_doviz_cinsi,sth_har_doviz_kuru,sth_alt_doviz_kuru,sth_stok_doviz_kuru,sth_vergi,sth_masraf_vergi,sth_otv_vergi,sth_oiv_vergi,sth_Tevkifat_turu) /sth_miktar
        FROM dbo.STOK_HAREKETLERI
        WHERE (sth_tip = 0) AND (sth_evraktip in(3,13,13)) and (sth_cins IN (0,1)) AND (sth_stok_kod = sto_kod ) AND (sth_normal_iade = 0)and sth_fat_uid!='00000000-0000-0000-0000-000000000000'
        ORDER BY sth_tarih DESC) AS [Son Giriş Maliyeti Kdv Dahil],

        SU.Marj_1 AS Marj_1,
        SU.Marj_2 AS Marj_2,
        SU.Marj_3 AS Marj_3,
        SU.Marj_4 AS Marj_4,
        SU.Marj_5 AS Marj_5,
        SU.Yatan_Stok AS [Yatan Stok mu?],

        dbo.fn_StokSatisFiyati (sto_kod, 6, 0,1) AS [F-1],
        dbo.fn_StokSatisFiyati (sto_kod, 7, 0,1) AS [F-2],
        dbo.fn_StokSatisFiyati (sto_kod, 8, 0,1) AS [F-3],
        dbo.fn_StokSatisFiyati (sto_kod, 9, 0,1) AS [F-4],
        dbo.fn_StokSatisFiyati (sto_kod, 10, 0,1) AS [F-5],
        dbo.fn_StokSatisFiyati (sto_kod, 11, 0,1) AS [F-6],
        dbo.fn_StokSatisFiyati (sto_kod, 101, 0,1) AS [Deneme],

        dbo.fn_StokSatisFiyati (sto_kod, 1, 0,1) AS [P-1],
        dbo.fn_StokSatisFiyati (sto_kod, 2, 0,1) AS [P-2],
        dbo.fn_StokSatisFiyati (sto_kod, 3, 0,1) AS [P-3],
        dbo.fn_StokSatisFiyati (sto_kod, 4, 0,1) AS [P-4],
        dbo.fn_StokSatisFiyati (sto_kod, 5, 0,1) AS [P-5],
        dbo.fn_StokSatisFiyati (sto_kod, 12, 0,1) AS [P-6],

        (select sdp_min_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=1 and sto_kod=sdp_depo_kod) AS [Merkez Minimum Miktar],
        (select sdp_max_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=1 and sto_kod=sdp_depo_kod) AS [Merkez Maksimum Miktar],
        (select sdp_min_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=6 and sto_kod=sdp_depo_kod) AS [Topça Minimum Miktar],
        (select sdp_max_stok from dbo.STOK_DEPO_DETAYLARI where sdp_depo_no=6 and sto_kod=sdp_depo_kod) AS [Topça Maksimum Miktar],

        ((((dbo.fn_StokSatisFiyati (sto_kod, 5, 0,1))-((sto_standartmaliyet/100 * (dbo.fn_VergiYuzde(sto_toptan_Vergi)) )+ sto_standartmaliyet))*100)/(NULLIF((sto_standartmaliyet/100 * (dbo.fn_VergiYuzde(sto_toptan_Vergi)) )+ sto_standartmaliyet,0))) AS [KAR ZARAR % ORANI GÜNCEL MALİYET KDV DAHIL E GÖRE ],

        dbo.fn_EldekiMiktar(sto_kod)*(SELECT top 1 dbo.fn_StokHareketVergiDahilNetDeger(sth_tutar,sth_iskonto1,sth_iskonto2,sth_iskonto3,sth_iskonto4,sth_iskonto5,sth_iskonto6,sth_masraf1,sth_masraf2,sth_masraf3,sth_masraf4,sth_otvtutari,sth_oivtutari,sth_tip,sth_har_doviz_cinsi,sth_har_doviz_kuru,sth_alt_doviz_kuru,sth_stok_doviz_kuru,sth_vergi,sth_masraf_vergi,sth_otv_vergi,sth_oiv_vergi,sth_Tevkifat_turu) /sth_miktar FROM dbo.STOK_HAREKETLERI WHERE (sth_tip = 0) AND (sth_evraktip in(3,13,13)) and (sth_cins IN (0,1)) AND (sth_stok_kod = sto_kod ) AND (sth_normal_iade = 0) ORDER BY sth_tarih DESC) AS [DEPO TOPLAM MALİYET]

      FROM dbo.STOKLAR WITH (NOLOCK)
      LEFT JOIN STOKLAR_USER SU ON SU.Record_uid=sto_Guid
      WHERE ${whereClause}
      ORDER BY sto_isim
    `;

    const result = await mikroFactory.executeQuery(query);
    return result;
  }

  // Tüm mevcut kolonları döndürür (UI'da kolon seçici için)
  async getStocksByCodes(productCodes: string[]): Promise<any> {
    const safeLimit = Math.max(productCodes.length, 1);
    return this.searchStocks({ productCodes, limit: safeLimit, offset: 0 });
  }

  getAvailableColumns(): string[] {
    return [
      'msg_S_0088', // Guid
      'msg_S_0870', // İsim
      'Yab.İsim',
      'Kısa İsim',
      'msg_S_0078', // Kod
      'KDV Oranı',
      'BİR AYLIK SATIS MİKTARI',
      '3 Aylık Satış',
      'Güncel Maliyet + Kdv.',
      'Güncel Maliyet Kdv Dahil',
      'Güncel Maliyet Tarihi',
      'Satış Fiyatı Değişiklik Tarihi',
      'Son Giriş Tarihi',
      'Dükkan Depo',
      'Dükkan Depo Siparişte Bekleyen',
      'Dükkan Depo Satın Alma Siparişte Bekleyen',
      'Dükkan Depo Satılabilir',
      'Merkez Depo KonsinyeMiktar',
      'Merkez Depo',
      'Merkez Depo Siparişte Bekleyen',
      'Merkez Depo Satın Alma Siparişte Bekleyen',
      'Merkez Depo Satılabilir',
      'Ereğli Depo',
      'Ereglı Depo Siparişte Bekleyen',
      'Ereglı Depo Satın Alma Siparişte Bekleyen',
      'Ereğli Depo Satılabilir',
      'Topça Depo',
      'Topca Depo Siparişte Bekleyen',
      'Topca Depo Satın Alma Siparişte Bekleyen',
      'Topça Depo Satılabilir',
      'Toplam Satılabilir',
      'Toplam Eldeki Miktar',
      'Fazla Miktar',
      'İstanbul Araç Depo',
      'İstanbul Yeni Depo',
      'Birim',
      '2. Birim',
      '2. Birim Katsayısı',
      'Tedarikci',
      'Marka',
      'Kategori kodu',
      'ilk oluşturma tarihi',
      'Kategori Adı',
      'Son Giriş Maliyeti + Kdv',
      'Son Giriş Maliyeti Kdv Dahil',
      'Marj_1',
      'Marj_2',
      'Marj_3',
      'Marj_4',
      'Marj_5',
      'Yatan Stok mu?',
      'F-1',
      'F-2',
      'F-3',
      'F-4',
      'F-5',
      'F-6',
      'Deneme',
      'P-1',
      'P-2',
      'P-3',
      'P-4',
      'P-5',
      'P-6',
      'Merkez Minimum Miktar',
      'Merkez Maksimum Miktar',
      'Topça Minimum Miktar',
      'Topça Maksimum Miktar',
      'KAR ZARAR % ORANI GÜNCEL MALİYET KDV DAHIL E GÖRE ',
      'DEPO TOPLAM MALİYET'
    ];
  }
}

export default new StockF10Service();
