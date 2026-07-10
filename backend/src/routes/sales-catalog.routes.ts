import { Router } from 'express';
import salesCatalogController from '../controllers/sales-catalog.controller';

const router = Router();

// Token yeterince yuksek entropili ve yalniz yayinlanmis kataloglara erisir.
// Bu route authentication middleware'inden once mount edilir.
router.get('/public/:token', salesCatalogController.getPublic);
router.post('/public/:token/pdf-download', salesCatalogController.recordPdfDownload);

export default router;
