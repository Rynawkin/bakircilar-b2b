/*
  Mikro V16 - Faturali 6 / Perakende 6 additive migration

  Physical mapping:
    13 = Faturali 6 (initial prices cloned from physical list 10)
    14 = Perakende 6 (initial prices cloned from physical list 5)

  Safety properties:
    - one transaction with XACT_ABORT
    - idempotent inserts
    - existing target collisions fail closed
    - Marj_6 is copied only from a valid, positive Marj_5
    - campaign lists 11/12 are never written and their row counts are checked
    - source/target price rows are compared before commit
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Safe default: a full transactional rehearsal that always rolls back.
-- A production operator must deliberately change this to 0 for the real run.
DECLARE @dryRun bit = 1;
DECLARE @invoiced6DefinitionCount int;
DECLARE @retail6DefinitionCount int;
DECLARE @invoiced6PriceRowCount int;
DECLARE @retail6PriceRowCount int;
DECLARE @validMargin6Count int;
DECLARE @campaign11After int;
DECLARE @campaign12After int;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @campaign11Before int =
    (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 11);
  DECLARE @campaign12Before int =
    (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 12);

  IF OBJECT_ID(N'dbo.STOKLAR_USER', N'U') IS NULL
    THROW 51000, 'STOKLAR_USER tablosu bulunamadi.', 1;

  IF OBJECT_ID(N'dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI', N'U') IS NULL
    THROW 51001, 'Fiyat liste tanim tablosu bulunamadi.', 1;

  IF OBJECT_ID(N'dbo.STOK_SATIS_FIYAT_LISTELERI', N'U') IS NULL
    THROW 51002, 'Fiyat liste satir tablosu bulunamadi.', 1;

  IF COL_LENGTH(N'dbo.STOKLAR_USER', N'Marj_6') IS NULL
    ALTER TABLE dbo.STOKLAR_USER ADD Marj_6 nvarchar(17) NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.STOKLAR_USER')
      AND c.name = N'Marj_6'
      AND t.name = N'nvarchar'
      AND c.max_length = 34
      AND c.is_nullable = 1
  )
    THROW 51003, 'Marj_6 kolonu beklenen nvarchar(17) NULL tipinde degil.', 1;

  IF (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 10) <> 1
    THROW 51004, 'Kaynak Faturali 5 liste tanimi tekil degil.', 1;

  IF (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 5) <> 1
    THROW 51005, 'Kaynak Perakende 5 liste tanimi tekil degil.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
    WHERE sfl_sirano = 13
      AND ISNULL(sfl_aciklama, N'') <> N'Faturalı Satış 6'
  )
    THROW 51006, '13 numarali liste baska bir tanimla zaten kullaniliyor.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
    WHERE sfl_sirano = 14
      AND ISNULL(sfl_aciklama, N'') <> N'Perakende Satış 6'
  )
    THROW 51007, '14 numarali liste baska bir tanimla zaten kullaniliyor.', 1;

  -- An idempotent rerun may encounter the target definitions, but only when
  -- every price-affecting setting still matches the source definition. A
  -- matching display name alone is not enough to prove that list 13/14 is safe.
  IF EXISTS (
    SELECT 1 FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13
  )
  BEGIN
    IF (
      SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13
    ) <> 1
      THROW 51016, 'Faturali 6 liste tanimi tekil degil.', 1;

    IF EXISTS (
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 10
      EXCEPT
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13
    ) OR EXISTS (
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13
      EXCEPT
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 10
    )
      THROW 51017, 'Faturali 6 davranisi kaynak liste 10 ile ayni degil.', 1;
  END;

  IF EXISTS (
    SELECT 1 FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14
  )
  BEGIN
    IF (
      SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14
    ) <> 1
      THROW 51018, 'Perakende 6 liste tanimi tekil degil.', 1;

    IF EXISTS (
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 5
      EXCEPT
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14
    ) OR EXISTS (
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14
      EXCEPT
      SELECT
        sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid, sfl_hidden,
        sfl_kilitli, sfl_degisti, sfl_checksum,
        sfl_special1, sfl_special2, sfl_special3,
        sfl_fiyatuygulama, sfl_fiyatformul,
        sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
        sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
        sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
        sfl_doviz_uygulama, sfl_sabit_doviz,
        sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
        sfl_kampanya_uygulama, sfl_sabit_kampanya,
        sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
        sfl_otvdahil, sfl_oivdahil
      FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 5
    )
      THROW 51019, 'Perakende 6 davranisi kaynak liste 5 ile ayni degil.', 1;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13
  )
  BEGIN
    INSERT INTO dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI (
      sfl_Guid, sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid,
      sfl_hidden, sfl_kilitli, sfl_degisti, sfl_checksum,
      sfl_create_user, sfl_create_date, sfl_lastup_user, sfl_lastup_date,
      sfl_special1, sfl_special2, sfl_special3,
      sfl_sirano, sfl_aciklama, sfl_fiyatuygulama, sfl_fiyatformul,
      sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
      sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
      sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
      sfl_doviz_uygulama, sfl_sabit_doviz,
      sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
      sfl_kampanya_uygulama, sfl_sabit_kampanya,
      sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
      sfl_otvdahil, sfl_oivdahil
    )
    SELECT
      NEWID(), sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid,
      sfl_hidden, sfl_kilitli, sfl_degisti, sfl_checksum,
      sfl_create_user, GETDATE(), sfl_lastup_user, GETDATE(),
      sfl_special1, sfl_special2, sfl_special3,
      13, N'Faturalı Satış 6', sfl_fiyatuygulama, sfl_fiyatformul,
      sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
      sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
      sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
      sfl_doviz_uygulama, sfl_sabit_doviz,
      sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
      sfl_kampanya_uygulama, sfl_sabit_kampanya,
      sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
      sfl_otvdahil, sfl_oivdahil
    FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
    WHERE sfl_sirano = 10;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14
  )
  BEGIN
    INSERT INTO dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI (
      sfl_Guid, sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid,
      sfl_hidden, sfl_kilitli, sfl_degisti, sfl_checksum,
      sfl_create_user, sfl_create_date, sfl_lastup_user, sfl_lastup_date,
      sfl_special1, sfl_special2, sfl_special3,
      sfl_sirano, sfl_aciklama, sfl_fiyatuygulama, sfl_fiyatformul,
      sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
      sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
      sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
      sfl_doviz_uygulama, sfl_sabit_doviz,
      sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
      sfl_kampanya_uygulama, sfl_sabit_kampanya,
      sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
      sfl_otvdahil, sfl_oivdahil
    )
    SELECT
      NEWID(), sfl_DBCno, sfl_SpecRECno, sfl_iptal, sfl_fileid,
      sfl_hidden, sfl_kilitli, sfl_degisti, sfl_checksum,
      sfl_create_user, GETDATE(), sfl_lastup_user, GETDATE(),
      sfl_special1, sfl_special2, sfl_special3,
      14, N'Perakende Satış 6', sfl_fiyatuygulama, sfl_fiyatformul,
      sfl_odepluygulama, sfl_odeplformul, sfl_sabit_odeme_plani,
      sfl_kdvdahil, sfl_ilktarih, sfl_sontarih,
      sfl_yerineuygulanacakfiyat, sfl_kurhesaplamasekli,
      sfl_doviz_uygulama, sfl_sabit_doviz,
      sfl_iskonto_uygulama, sfl_sabit_iskonto, sfl_sabit_kur,
      sfl_kampanya_uygulama, sfl_sabit_kampanya,
      sfl_kampanya_vade_gozardi, sfl_kampanya_iskonto_gozardi,
      sfl_otvdahil, sfl_oivdahil
    FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
    WHERE sfl_sirano = 5;
  END;

  -- Clone an entire list only when its target is completely empty. If a
  -- previous/manual target is partial, skip the insert and let the strict
  -- bidirectional parity checks below fail closed.
  INSERT INTO dbo.STOK_SATIS_FIYAT_LISTELERI (
    sfiyat_Guid, sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal,
    sfiyat_fileid, sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti,
    sfiyat_checksum, sfiyat_create_user, sfiyat_create_date,
    sfiyat_lastup_user, sfiyat_lastup_date,
    sfiyat_special1, sfiyat_special2, sfiyat_special3,
    sfiyat_stokkod, sfiyat_listesirano, sfiyat_deposirano,
    sfiyat_odemeplan, sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
    sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
    sfiyat_kampanyakod, sfiyat_doviz_kuru
  )
  SELECT
    NEWID(), src.sfiyat_DBCno, src.sfiyat_SpecRECno, src.sfiyat_iptal,
    src.sfiyat_fileid, src.sfiyat_hidden, src.sfiyat_kilitli, src.sfiyat_degisti,
    src.sfiyat_checksum, src.sfiyat_create_user, GETDATE(),
    src.sfiyat_lastup_user, GETDATE(),
    src.sfiyat_special1, src.sfiyat_special2, src.sfiyat_special3,
    src.sfiyat_stokkod, target.targetListNo, src.sfiyat_deposirano,
    src.sfiyat_odemeplan, src.sfiyat_birim_pntr, src.sfiyat_fiyati, src.sfiyat_doviz,
    src.sfiyat_iskontokod, src.sfiyat_deg_nedeni, src.sfiyat_primyuzdesi,
    src.sfiyat_kampanyakod, src.sfiyat_doviz_kuru
  FROM dbo.STOK_SATIS_FIYAT_LISTELERI src
  CROSS APPLY (
    SELECT CASE src.sfiyat_listesirano WHEN 10 THEN 13 WHEN 5 THEN 14 END AS targetListNo
  ) target
  WHERE (
      src.sfiyat_listesirano = 10
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI existing
        WHERE existing.sfiyat_listesirano = 13
      )
    )
    OR (
      src.sfiyat_listesirano = 5
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI existing
        WHERE existing.sfiyat_listesirano = 14
      )
    );

  -- Marj_6 is referenced through dynamic SQL because SQL Server compiles the
  -- whole outer batch before the additive ALTER TABLE has taken effect.
  EXEC sys.sp_executesql N'
    UPDATE u
    SET u.Marj_6 = u.Marj_5
    FROM dbo.STOKLAR_USER u
    WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_6))), N'''') IS NULL
      AND TRY_CONVERT(
        decimal(19, 6),
        REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_5))), N''''), N'','', N''.'')
      ) > 0;
  ';

  EXEC sys.sp_executesql N'
    IF EXISTS (
      SELECT 1
      FROM dbo.STOKLAR_USER u
      WHERE TRY_CONVERT(
          decimal(19, 6),
          REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_5))), N''''), N'','', N''.'')
        ) > 0
        AND (
          TRY_CONVERT(
            decimal(19, 6),
            REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_6))), N''''), N'','', N''.'')
          ) IS NULL
          OR TRY_CONVERT(
            decimal(19, 6),
            REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), u.Marj_6))), N''''), N'','', N''.'')
          ) <= 0
        )
    )
      THROW 51023, ''Gecerli Marj_5 degeri olan stoklarda Marj_6 eksik veya gecersiz.'', 1;
  ';

  IF (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13) <> 1
    THROW 51008, 'Faturali 6 liste tanimi dogrulanamadi.', 1;

  IF (SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14) <> 1
    THROW 51009, 'Perakende 6 liste tanimi dogrulanamadi.', 1;

  IF (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13
  ) <> (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 10
  )
    THROW 51010, 'Faturali 6 satir sayisi kaynak listeyle ayni degil.', 1;

  IF (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14
  ) <> (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 5
  )
    THROW 51011, 'Perakende 6 satir sayisi kaynak listeyle ayni degil.', 1;

  IF EXISTS (
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 10
    EXCEPT
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13
  )
    THROW 51012, 'Faturali 6 fiyatlari kaynak listeyle ayni degil.', 1;

  IF EXISTS (
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13
    EXCEPT
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 10
  )
    THROW 51020, 'Faturali 6 listesinde kaynak disi fiyat satiri var.', 1;

  IF EXISTS (
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 5
    EXCEPT
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14
  )
    THROW 51013, 'Perakende 6 fiyatlari kaynak listeyle ayni degil.', 1;

  IF EXISTS (
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14
    EXCEPT
    SELECT
      sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid,
      sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
      sfiyat_create_user, sfiyat_lastup_user,
      sfiyat_special1, sfiyat_special2, sfiyat_special3,
      sfiyat_stokkod, sfiyat_deposirano, sfiyat_odemeplan,
      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
      sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi,
      sfiyat_kampanyakod, sfiyat_doviz_kuru
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 5
  )
    THROW 51021, 'Perakende 6 listesinde kaynak disi fiyat satiri var.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.STOKLAR s
    WHERE ISNULL(s.sto_pasif_fl, 0) = 0
      AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
      AND (
        (
          EXISTS (
            SELECT 1
            FROM dbo.STOK_SATIS_FIYAT_LISTELERI source_price
            WHERE source_price.sfiyat_listesirano = 10
              AND LTRIM(RTRIM(ISNULL(source_price.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(source_price.sfiyat_iptal, 0) = 0
              AND ISNULL(source_price.sfiyat_hidden, 0) = 0
              AND ISNULL(source_price.sfiyat_deposirano, 0) = 0
              AND ISNULL(source_price.sfiyat_odemeplan, 0) = 0
              AND ISNULL(source_price.sfiyat_doviz, 0) = 0
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.STOK_SATIS_FIYAT_LISTELERI p
            WHERE p.sfiyat_listesirano = 13
              AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(p.sfiyat_iptal, 0) = 0
              AND ISNULL(p.sfiyat_hidden, 0) = 0
              AND ISNULL(p.sfiyat_deposirano, 0) = 0
              AND ISNULL(p.sfiyat_odemeplan, 0) = 0
              AND ISNULL(p.sfiyat_doviz, 0) = 0
          )
        )
        OR (
          EXISTS (
            SELECT 1
            FROM dbo.STOK_SATIS_FIYAT_LISTELERI source_price
            WHERE source_price.sfiyat_listesirano = 5
              AND LTRIM(RTRIM(ISNULL(source_price.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(source_price.sfiyat_iptal, 0) = 0
              AND ISNULL(source_price.sfiyat_hidden, 0) = 0
              AND ISNULL(source_price.sfiyat_deposirano, 0) = 0
              AND ISNULL(source_price.sfiyat_odemeplan, 0) = 0
              AND ISNULL(source_price.sfiyat_doviz, 0) = 0
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.STOK_SATIS_FIYAT_LISTELERI p
            WHERE p.sfiyat_listesirano = 14
              AND LTRIM(RTRIM(ISNULL(p.sfiyat_stokkod, N''))) =
                  LTRIM(RTRIM(s.sto_kod))
              AND ISNULL(p.sfiyat_iptal, 0) = 0
              AND ISNULL(p.sfiyat_hidden, 0) = 0
              AND ISNULL(p.sfiyat_deposirano, 0) = 0
              AND ISNULL(p.sfiyat_odemeplan, 0) = 0
              AND ISNULL(p.sfiyat_doviz, 0) = 0
          )
        )
      )
  )
    THROW 51022, 'Kaynak fiyati olan aktif stoklarin 13/14 canonical kapsami eksik.', 1;

  IF EXISTS (
    SELECT
      p.sfiyat_stokkod,
      p.sfiyat_listesirano
    FROM dbo.STOK_SATIS_FIYAT_LISTELERI p
    INNER JOIN dbo.STOKLAR s
      ON LTRIM(RTRIM(s.sto_kod)) = LTRIM(RTRIM(p.sfiyat_stokkod))
    WHERE p.sfiyat_listesirano IN (13, 14)
      AND ISNULL(s.sto_pasif_fl, 0) = 0
      AND ISNULL(p.sfiyat_iptal, 0) = 0
      AND ISNULL(p.sfiyat_hidden, 0) = 0
      AND ISNULL(p.sfiyat_deposirano, 0) = 0
      AND ISNULL(p.sfiyat_odemeplan, 0) = 0
      AND ISNULL(p.sfiyat_doviz, 0) = 0
    GROUP BY p.sfiyat_stokkod, p.sfiyat_listesirano
    HAVING COUNT(*) <> 1
  )
    THROW 51024, 'Aktif stoklarda 13/14 canonical fiyat satiri tekil degil.', 1;

  IF @campaign11Before <> (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 11
  )
    THROW 51014, 'Kampanya 11 satir sayisi beklenmedik sekilde degisti.', 1;

  IF @campaign12Before <> (
    SELECT COUNT(*) FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 12
  )
    THROW 51015, 'Kampanya 12 satir sayisi beklenmedik sekilde degisti.', 1;

  SELECT @invoiced6DefinitionCount = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 13;
  SELECT @retail6DefinitionCount = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI WHERE sfl_sirano = 14;
  SELECT @invoiced6PriceRowCount = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 13;
  SELECT @retail6PriceRowCount = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 14;
  EXEC sys.sp_executesql N'
    SELECT @count = COUNT(*)
    FROM dbo.STOKLAR_USER
    WHERE TRY_CONVERT(
      decimal(19, 6),
      REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_6))), N''''), N'','', N''.'')
    ) > 0;
  ', N'@count int OUTPUT', @count = @validMargin6Count OUTPUT;
  SELECT @campaign11After = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 11;
  SELECT @campaign12After = COUNT(*)
  FROM dbo.STOK_SATIS_FIYAT_LISTELERI WHERE sfiyat_listesirano = 12;

  IF @dryRun = 1
    ROLLBACK TRANSACTION;
  ELSE
    COMMIT TRANSACTION;

  SELECT
    @dryRun AS dryRun,
    @invoiced6DefinitionCount AS invoiced6DefinitionCount,
    @retail6DefinitionCount AS retail6DefinitionCount,
    @invoiced6PriceRowCount AS invoiced6PriceRowCount,
    @retail6PriceRowCount AS retail6PriceRowCount,
    @validMargin6Count AS validMargin6Count,
    @campaign11After AS campaign11PriceRowCount,
    @campaign12After AS campaign12PriceRowCount;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
