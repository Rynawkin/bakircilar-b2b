import { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
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

  async autoImportDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const body = (req.body || {}) as {
        sourceDir?: string;
        prefixes?: string[];
        recursive?: boolean;
        skipIfExists?: boolean;
        archiveDir?: string | null;
        deleteAfterImport?: boolean;
        maxFiles?: number;
      };

      const result = await eInvoiceService.importDocumentsFromDirectory({
        sourceDir: body.sourceDir,
        prefixes: Array.isArray(body.prefixes) ? body.prefixes : undefined,
        recursive: typeof body.recursive === 'boolean' ? body.recursive : undefined,
        skipIfExists: typeof body.skipIfExists === 'boolean' ? body.skipIfExists : undefined,
        archiveDir: body.archiveDir,
        deleteAfterImport: typeof body.deleteAfterImport === 'boolean' ? body.deleteAfterImport : undefined,
        maxFiles: Number.isFinite(Number(body.maxFiles)) ? Number(body.maxFiles) : undefined,
        userId: req.user!.userId,
      });

      res.json(result);
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

  async getMyDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, invoicePrefix, fromDate, toDate, page, limit } = req.query;
      const result = await eInvoiceService.getDocumentsForCustomer(
        req.user!.userId,
        {
          search: search as string | undefined,
          invoicePrefix: invoicePrefix as string | undefined,
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

  async bulkDownloadDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { ids } = req.body as { ids?: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Document ids required' });
      }

      const { documents, missing } = await eInvoiceService.getDocumentsForBulkDownload(
        ids,
        req.user!.userId,
        req.user!.role as UserRole
      );

      if (documents.length === 0) {
        return res.status(404).json({
          error: 'No documents available for download',
          missing: missing?.map((item) => item.invoiceNo) || [],
        });
      }

      const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const fileName = `faturalar_${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        res.status(500).end();
      });

      archive.pipe(res);

      for (const entry of documents) {
        const safeName = `${entry.document.invoiceNo}.pdf`;
        archive.file(entry.absolutePath, { name: safeName });
      }

      if (missing && missing.length > 0) {
        const missingLines = [
          'Asagidaki faturalar bulunamadi:',
          ...missing.map((item) => `- ${item.invoiceNo}`),
          '',
          `Toplam eksik: ${missing.length}`,
        ].join('\n');
        archive.append(missingLines, { name: 'eksik_faturalar.txt' });
      }

      await archive.finalize();
    } catch (error) {
      next(error);
    }
  }

  async downloadMyDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { document, absolutePath } = await eInvoiceService.getDocumentForCustomerDownload(
        id,
        req.user!.userId
      );
      res.setHeader('Content-Type', document.mimeType || 'application/pdf');
      res.download(absolutePath, `${document.invoiceNo}.pdf`);
    } catch (error) {
      next(error);
    }
  }
}

export default new EInvoiceController();
