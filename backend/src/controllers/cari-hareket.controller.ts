import { Request, Response } from 'express';
import { cariHareketService } from '../services/cari-hareket.service';

/**
 * Cari Hareket Föyü - 041410 ekranı gibi
 */
export const getCariHareketFoyu = async (req: Request, res: Response) => {
  try {
    const { cariKod, startDate, endDate } = req.query;

    if (!cariKod) {
      return res.status(400).json({ message: 'Cari kodu gereklidir' });
    }

    const result = await cariHareketService.getCariHareketFoyu({
      cariKod: cariKod as string,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined
    });

    res.json({ success: true, data: result.rows, opening: result.opening });
  } catch (error: any) {
    console.error('Cari hareket föyü alınırken hata:', error);
    res.status(500).json({ message: 'Cari hareket föyü alınamadı', error: error.message });
  }
};

/**
 * Ekstre için cari arama
 */
export const searchCariForEkstre = async (req: Request, res: Response) => {
  try {
    const { searchTerm, limit } = req.query;

    const result = await cariHareketService.searchCariForEkstre({
      searchTerm: searchTerm as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 100
    });

    res.json({ success: true, data: result, total: result.length });
  } catch (error: any) {
    console.error('Cari arama hatası:', error);
    res.status(500).json({ message: 'Cari araması yapılamadı', error: error.message });
  }
};

/**
 * Cari bilgilerini getir
 */
export const getCariInfo = async (req: Request, res: Response) => {
  try {
    const { cariKod } = req.params;

    if (!cariKod) {
      return res.status(400).json({ message: 'Cari kodu gereklidir' });
    }

    const result = await cariHareketService.getCariInfo(cariKod);

    if (!result) {
      return res.status(404).json({ message: 'Cari bulunamadı' });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Cari bilgisi alınırken hata:', error);
    res.status(500).json({ message: 'Cari bilgisi alınamadı', error: error.message });
  }
};
