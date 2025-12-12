import express from 'express';
import * as cariHareketController from '../controllers/cari-hareket.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Tüm route'lar için authentication gerekli
router.use(authenticate);

// Cari hareket föyü
router.get('/foyu', cariHareketController.getCariHareketFoyu);

// Ekstre için cari arama
router.get('/search', cariHareketController.searchCariForEkstre);

// Cari bilgisi
router.get('/info/:cariKod', cariHareketController.getCariInfo);

export default router;
