import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { splitSearchTokens } from '../utils/search';
import { EInvoiceMatchStatus, UserRole } from '@prisma/client';
import { ErrorFactory } from '../types/errors';

const STAFF_ROLES: UserRole[] = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'];

const normalizeInvoiceNo = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

const extractInvoiceNo = (originalName: string) => {
  const baseName = path.basename(originalName, path.extname(originalName));
  const raw = baseName.split('_')[0] || baseName;
  const normalized = normalizeInvoiceNo(raw);
  return normalized || normalizeInvoiceNo(baseName);
};

const toRelativePath = (absolutePath: string) =>
  path.relative(process.cwd(), absolutePath).split(path.sep).join('/');

const resolveStoragePath = (storagePath: string) =>
  path.resolve(process.cwd(), storagePath);

const resolveDocumentFileName = (document: { fileName?: string; storagePath: string }) => {
  if (document.fileName) return document.fileName;
  return path.basename(document.storagePath);
};

const buildSearchClauses = (search?: string) => {
  const tokens = splitSearchTokens(search);
  if (tokens.length === 0) return [];
  return tokens.map((token) => ({
    OR: [
      { invoiceNo: { contains: token, mode: 'insensitive' as const } },
      { customerCode: { contains: token, mode: 'insensitive' as const } },
      { customerName: { contains: token, mode: 'insensitive' as const } },
    ],
  }));
};

const currencyFromCode = (code?: number | null) => {
  if (code === 1) return 'USD';
  if (code === 2) return 'EUR';
  return 'TRY';
};

class EInvoiceService {
  private async resolveExistingDocumentPath(document: {
    id: string;
    storagePath: string;
    fileName?: string;
  }) {
    const candidates = new Set<string>();
    if (document.storagePath) {
      candidates.add(document.storagePath);
    }

    const fileName = resolveDocumentFileName(document);
    if (fileName) {
      candidates.add(path.join('private-uploads', 'einvoices', fileName));
      candidates.add(path.join('uploads', 'einvoices', fileName));
      candidates.add(path.join('uploads', fileName));
    }

    for (const candidate of candidates) {
      const absolutePath = resolveStoragePath(candidate);
      if (fs.existsSync(absolutePath)) {
        const relativePath = toRelativePath(absolutePath);
        if (relativePath !== document.storagePath) {
          try {
            await prisma.eInvoiceDocument.update({
              where: { id: document.id },
              data: { storagePath: relativePath },
            });
          } catch (error) {
            console.warn('Failed to update e-invoice storage path', { id: document.id, error });
          }
        }
        return { absolutePath, storagePath: relativePath };
      }
    }

    return null;
  }

  async uploadDocuments(files: Express.Multer.File[], userId: string) {
    if (!files || files.length === 0) {
      return { uploaded: 0, updated: 0, failed: 0, results: [] as any[] };
    }

    const results: Array<{
      invoiceNo: string;
      documentId?: string;
      status: EInvoiceMatchStatus;
      message?: string;
    }> = [];

    let uploaded = 0;
    let updated = 0;
    let failed = 0;

    for (const file of files) {
      const invoiceNo = extractInvoiceNo(file.originalname);
      const storagePath = toRelativePath(file.path);

      try {
        const existing = await prisma.eInvoiceDocument.findUnique({
          where: { invoiceNo },
          select: { id: true, storagePath: true },
        });

        const metadata = await mikroService.getEInvoiceMetadataByGibNo(invoiceNo);

        let matchStatus: EInvoiceMatchStatus = EInvoiceMatchStatus.MATCHED;
        let matchError: string | null = null;

        if (!metadata) {
          matchStatus = EInvoiceMatchStatus.NOT_FOUND;
          matchError = 'Mikro match not found';
        }

        let totals: { subtotal?: number | null; total?: number | null; currency?: string | null; issueDate?: Date | null } | null = null;
        if (metadata?.evrakSeri && metadata?.evrakSira) {
          totals = await mikroService.getInvoiceTotalsByEvrak(metadata.evrakSeri, metadata.evrakSira);
          if (!totals || totals.total === null || totals.total === undefined) {
            matchStatus = metadata ? EInvoiceMatchStatus.PARTIAL : EInvoiceMatchStatus.NOT_FOUND;
            matchError = matchError || 'Invoice totals not found';
          }
        } else if (metadata) {
          matchStatus = EInvoiceMatchStatus.PARTIAL;
          matchError = matchError || 'Invoice evrak not found';
        }

        let customerId: string | null = null;
        let customerName: string | null = metadata?.cariName || null;

        if (metadata?.cariCode) {
          const customer = await prisma.user.findUnique({
            where: { mikroCariCode: metadata.cariCode },
            select: { id: true, name: true, displayName: true, mikroName: true },
          });
          if (customer) {
            customerId = customer.id;
            customerName = customer.displayName || customer.mikroName || customer.name || customerName;
          }
        }

        const data = {
          invoiceNo,
          evrakSeri: metadata?.evrakSeri || null,
          evrakSira: metadata?.evrakSira ?? null,
          eInvoiceUuid: metadata?.uuid || null,
          customerCode: metadata?.cariCode || null,
          customerName,
          customerId,
          issueDate: metadata?.issueDate || totals?.issueDate || null,
          sentAt: metadata?.sentAt || null,
          subtotalAmount: totals?.subtotal ?? null,
          totalAmount: totals?.total ?? null,
          currency: totals?.currency || currencyFromCode(metadata?.currencyCode),
          fileName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storagePath,
          uploadedById: userId,
          matchStatus,
          matchError,
        };

        const document = await prisma.eInvoiceDocument.upsert({
          where: { invoiceNo },
          create: data,
          update: data,
        });

        if (existing && existing.storagePath && existing.storagePath !== storagePath) {
          const oldPath = resolveStoragePath(existing.storagePath);
          fs.unlink(oldPath, () => undefined);
        }

        if (existing) {
          updated += 1;
        } else {
          uploaded += 1;
        }

        results.push({
          invoiceNo,
          documentId: document.id,
          status: matchStatus,
          message: matchError || undefined,
        });
      } catch (error) {
        failed += 1;
        results.push({
          invoiceNo,
          status: EInvoiceMatchStatus.NOT_FOUND,
          message: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    return { uploaded, updated, failed, results };
  }

  async getDocumentsForStaff(userId: string, role: UserRole, query: {
    search?: string;
    invoicePrefix?: string;
    customerId?: string;
    customerCode?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    if (!STAFF_ROLES.includes(role)) {
      throw new Error('Unauthorized');
    }

    const where: any = {};

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.customerCode) {
      where.customerCode = query.customerCode;
    }

    if (query.invoicePrefix) {
      where.invoiceNo = { startsWith: query.invoicePrefix, mode: 'insensitive' as const };
    }

    if (query.fromDate || query.toDate) {
      where.issueDate = {};
      if (query.fromDate) where.issueDate.gte = new Date(query.fromDate);
      if (query.toDate) where.issueDate.lte = new Date(query.toDate);
    }

    const searchClauses = buildSearchClauses(query.search);
    if (searchClauses.length > 0) {
      where.AND = [...(where.AND || []), ...searchClauses];
    }

    if (role === 'SALES_REP') {
      const staff = await prisma.user.findUnique({
        where: { id: userId },
        select: { assignedSectorCodes: true },
      });
      const sectorCodes = staff?.assignedSectorCodes || [];
      if (sectorCodes.length === 0) {
        return { documents: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } };
      }
      where.customer = { sectorCode: { in: sectorCodes } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, documents] = await prisma.$transaction([
      prisma.eInvoiceDocument.count({ where }),
      prisma.eInvoiceDocument.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, displayName: true, mikroName: true, mikroCariCode: true } },
        },
      }),
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getDocumentForDownload(documentId: string, userId: string, role: UserRole) {
    if (!STAFF_ROLES.includes(role)) {
      throw new Error('Unauthorized');
    }

    const document = await prisma.eInvoiceDocument.findUnique({
      where: { id: documentId },
      include: {
        customer: { select: { sectorCode: true } },
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (role === 'SALES_REP') {
      const staff = await prisma.user.findUnique({
        where: { id: userId },
        select: { assignedSectorCodes: true },
      });
      const sectorCodes = staff?.assignedSectorCodes || [];
      if (!document.customer?.sectorCode || !sectorCodes.includes(document.customer.sectorCode)) {
        throw new Error('Unauthorized');
      }
    }

    const resolved = await this.resolveExistingDocumentPath({
      id: document.id,
      storagePath: document.storagePath,
      fileName: document.fileName,
    });
    if (!resolved) {
      throw ErrorFactory.notFound('PDF dosyasi');
    }

    return {
      document,
      absolutePath: resolved.absolutePath,
    };
  }

  async getDocumentsForBulkDownload(
    documentIds: string[],
    userId: string,
    role: UserRole
  ) {
    if (!STAFF_ROLES.includes(role)) {
      throw new Error('Unauthorized');
    }

    const uniqueIds = Array.from(new Set(documentIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new Error('No documents selected');
    }

    const documents = await prisma.eInvoiceDocument.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        customer: { select: { sectorCode: true } },
      },
    });

    const documentById = new Map(documents.map((doc) => [doc.id, doc]));
    const missing: Array<{ id: string; invoiceNo: string }> = [];
    for (const id of uniqueIds) {
      if (!documentById.has(id)) {
        missing.push({ id, invoiceNo: id });
      }
    }

    if (role === 'SALES_REP') {
      const staff = await prisma.user.findUnique({
        where: { id: userId },
        select: { assignedSectorCodes: true },
      });
      const sectorCodes = staff?.assignedSectorCodes || [];
      if (sectorCodes.length === 0) {
        throw new Error('Unauthorized');
      }

      for (const doc of documents) {
        if (!doc.customer?.sectorCode || !sectorCodes.includes(doc.customer.sectorCode)) {
          throw new Error('Unauthorized');
        }
      }
    }

    const resolved: Array<{ document: (typeof documents)[number]; absolutePath: string }> = [];

    for (const document of documents) {
      const found = await this.resolveExistingDocumentPath({
        id: document.id,
        storagePath: document.storagePath,
        fileName: document.fileName,
      });
      if (!found) {
        missing.push({ id: document.id, invoiceNo: document.invoiceNo });
        continue;
      }
      resolved.push({ document, absolutePath: found.absolutePath });
    }

    return { documents: resolved, missing };
  }
}

export default new EInvoiceService();
