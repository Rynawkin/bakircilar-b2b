import { Request, Response, NextFunction } from 'express';
import eInvoiceService from '../services/einvoice.service';
import { UserRole } from '@prisma/client';

class EInvoiceController {
  async uploadDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const files = (req.files || []) as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Files are required' });
      }
      const result = await eInvoiceService.uploadDocuments(files, req.user!.userId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, invoicePrefix, customerId, customerCode, fromDate, toDate, page, limit } = req.query;
      const result = await eInvoiceService.getDocumentsForStaff(
        req.user!.userId,
        req.user!.role as UserRole,
        {
          search: search as string | undefined,
          invoicePrefix: invoicePrefix as string | undefined,
          customerId: customerId as string | undefined,
          customerCode: customerCode as string | undefined,
          fromDate: fromDate as string | undefined,
          toDate: toDate as string | undefined,
          page: page ? parseInt(page as string, 10) : undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined,
        }
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async downloadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { document, absolutePath } = await eInvoiceService.getDocumentForDownload(
        id,
        req.user!.userId,
        req.user!.role as UserRole
      );
      res.setHeader('Content-Type', document.mimeType || 'application/pdf');
      res.download(absolutePath, `${document.invoiceNo}.pdf`);
    } catch (error) {
      next(error);
    }
  }
}

export default new EInvoiceController();
