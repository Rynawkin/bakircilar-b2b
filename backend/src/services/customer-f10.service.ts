import mikroFactory from './mikroFactory.service';

interface CustomerF10SearchParams {
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

class CustomerF10Service {
  // Cari F10 sorgusunu çalıştırır
  async searchCustomers(params: CustomerF10SearchParams = {}): Promise<any> {
    const { searchTerm, limit = 100, offset = 0 } = params;

    // WHERE koşulu - arama terimi varsa ekle
    let whereClause = "cari_grup_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'FATURA' and cari_sektor_kodu NOT LIKE 'DİĞER' and cari_grup_kodu NOT LIKE 'DİĞER'";
    if (searchTerm && searchTerm.trim()) {
      const escapedTerm = searchTerm.trim().replace(/'/g, "''");
      whereClause += ` AND (cari_unvan1 LIKE '%${escapedTerm}%' OR cari_kod LIKE '%${escapedTerm}%' OR cari_unvan2 LIKE '%${escapedTerm}%')`;
    }

    const query = `
      SELECT TOP ${limit}
        cari_Guid AS [msg_S_0088],
        cari_unvan1 AS [msg_S_1033],
        cari_unvan2 AS [msg_S_1034],
        cari_kod AS [msg_S_1032],
        cari_kisi_kimlik_bilgisi_diger_aciklama AS [Cari Önemli Bilgiler],
        (SELECT adr_il FROM CARI_HESAP_ADRESLERI  WHERE adr_adres_no='1' and cari_kod=adr_cari_kod) AS IL,
        (SELECT adr_ilce FROM CARI_HESAP_ADRESLERI  WHERE adr_adres_no='1' and cari_kod=adr_cari_kod) AS ILCE,
        (SELECT Data FROM dbo.mye_TextData WHERE Record_uid=cari_Guid AND TableID=31) as AÇIKLAMA,
        cari_odemeplan_no *-1 AS [TANIMLI VADE GÜN],
        (select top 1 cha_tarihi from CARI_HESAP_HAREKETLERI
        where cha_cinsi in(0,1,2,17,18,19) and cha_evrak_tip in (1,2,3,4,34,54)and cha_kod=cari_kod
        ORDER BY cha_tarihi desc) as [SON TAHSİLAT TARİHİ],
        datediff(day,getdate(),(select top 1 cha_tarihi from CARI_HESAP_HAREKETLERI
        where cha_cinsi in(0,1,2,17,18,19) and cha_evrak_tip in (1,2,3,4,34,54)and cha_kod=cari_kod
        ORDER BY cha_tarihi desc))*-1 [SON TAHSİLAT GÜN FARKI],
        (select +'(0'+adr_tel_bolge_kodu+')'+adr_tel_no1 from dbo.CARI_HESAP_ADRESLERI where adr_cari_kod=cari_kod and adr_adres_no=1) as [Telefon],
        (select top 1 mye_isim+' '+mye_soyisim from dbo.CARI_HESAP_YETKILILERI where mye_cari_kod=cari_kod)as [Yetkili],
        cari_grup_kodu AS [GRUP KODU],
        cari_sektor_kodu AS [SEKTOR KODU],
        cari_CepTel AS [MUSTERI TEL],
        cari_KEP_adresi AS [FİYAT TEKLİF ,SİPARİŞ TARİHİ],
        CASE
        WHEN cari_efatura_fl= 1 Then 'EVET'
        WHEN cari_efatura_fl= 0 Then 'HAYIR'
        END AS [E-FATURA VAR MI / YOK MU],
        CASE
        WHEN Cari_F10da_detay = 1 Then dbo.fn_CariHesapAnaDovizBakiye('',0,cari_kod,'','',NULL,NULL,NULL,0,NULL,NULL,NULL,NULL)
        WHEN Cari_F10da_detay = 2 Then dbo.fn_CariHesapAlternatifDovizBakiye('',0,cari_kod,'','',NULL,NULL,NULL,0,NULL,NULL,NULL,NULL)
        WHEN Cari_F10da_detay = 3 Then dbo.fn_CariHesapOrjinalDovizBakiye('',0,cari_kod,'','',0,NULL,NULL,0,NULL,NULL,NULL,NULL)
        WHEN Cari_F10da_detay = 4 Then dbo.fn_CariHareketSayisi(0,cari_kod,'')
        END AS [msg_S_1530],
        CariBaglantiIsim AS [msg_S_3171],
        CariHareketIsim AS [msg_S_0888],
        Isnull((SELECT SUM(msg_S_0111) FROM dbo.fn_CariRiskFoyu(0 ,cari_kod, getDate(), getdate(),getdate(), 0,'',0,0)
        WHERE msg_S_0077='Sipariş Bakiyesi'),0) AS [Sip.Bakiye],
        Isnull((SELECT SUM(msg_S_0111) FROM dbo.fn_CariRiskFoyu(0 ,cari_kod, getDate(), getdate(),getdate(), 0,'',0,0)
        WHERE msg_S_0077='Faturalaşmamış İrsaliye Bakiyesi'),0) AS [Irs.Bakiye]
      FROM dbo.CARI_HESAPLAR WITH (NOLOCK)
      LEFT OUTER JOIN dbo.vw_Cari_Hesap_Baglanti_Tip_Isimleri ON CariBaglantiNo=cari_baglanti_tipi
      LEFT OUTER JOIN dbo.vw_Cari_Hesap_Hareket_Tip_Isimleri ON CariHareketNo=cari_hareket_tipi
      LEFT OUTER JOIN dbo.vw_Gendata ON 1=1
      WHERE ${whereClause}
      ORDER BY cari_unvan1
    `;

    const result = await mikroFactory.executeQuery(query);
    return result;
  }

  // Tüm mevcut kolonları döndürür (UI'da kolon seçici için)
  getAvailableColumns(): string[] {
    return [
      'msg_S_0088', // Guid
      'msg_S_1033', // Unvan 1
      'msg_S_1034', // Unvan 2
      'msg_S_1032', // Kod
      'Cari Önemli Bilgiler',
      'IL',
      'ILCE',
      'AÇIKLAMA',
      'TANIMLI VADE GÜN',
      'SON TAHSİLAT TARİHİ',
      'SON TAHSİLAT GÜN FARKI',
      'Telefon',
      'Yetkili',
      'GRUP KODU',
      'SEKTOR KODU',
      'MUSTERI TEL',
      'FİYAT TEKLİF ,SİPARİŞ TARİHİ',
      'E-FATURA VAR MI / YOK MU',
      'msg_S_1530', // Bakiye
      'msg_S_3171', // Bağlantı tipi
      'msg_S_0888', // Hareket tipi
      'Sip.Bakiye',
      'Irs.Bakiye'
    ];
  }
}

export default new CustomerF10Service();
