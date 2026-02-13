import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { splitSearchTokens } from '../utils/search';
import { EInvoiceMatchStatus, UserRole } from '@prisma/client';
import { ErrorFactory } from '../types/errors';

const STAFF_ROLES: UserRole[] = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'];

const normalizePath = (value: string) => value.split(path.sep).join('/');

const resolveStorageRoot = () => {
  const envRoot = process.env.STORAGE_ROOT;
  if (envRoot) {
    return path.resolve(envRoot);
  }

  let current = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.resolve(current, '..');
    const pkgPath = path.join(candidate, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg?.name === 'mikro-b2b-backend') {
          return candidate;
        }
      } catch {
        // ignore malformed package.json
      }
    }
    current = candidate;
  }

  return process.cwd();
};

const STORAGE_ROOT = resolveStorageRoot();
const EINVOICE_UPLOAD_DIR = process.env.EINVOICE_UPLOAD_DIR
  ? path.resolve(process.env.EINVOICE_UPLOAD_DIR)
  : null;
const STORAGE_ROOTS = Array.from(new Set([
  STORAGE_ROOT,
  process.cwd(),
  ...(EINVOICE_UPLOAD_DIR ? [EINVOICE_UPLOAD_DIR] : []),
]));

const isPathInside = (base: string, target: string) => {
  const relative = path.relative(base, target);
  if (!relative) return true;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

const findRootForPath = (absolutePath: string) =>
  STORAGE_ROOTS.find((root) => isPathInside(root, absolutePath)) || null;

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

const toRelativePath = (absolutePath: string, root?: string) => {
  const base = root || findRootForPath(absolutePath) || STORAGE_ROOT;
  return normalizePath(path.relative(base, absolutePath));
};

const resolveStorageCandidates = (storagePath: string) => {
  if (path.isAbsolute(storagePath)) return [storagePath];
  return STORAGE_ROOTS.map((root) => path.resolve(root, storagePath));
};

const resolveStoragePath = (storagePath: string) => {
  const candidates = resolveStorageCandidates(storagePath);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] || storagePath;
};

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

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeInvoicePrefixes = (values?: string[]) => {
  const normalized = (values || [])
    .map((value) => normalizeInvoiceNo(value || ''))
    .filter(Boolean);

  const expanded = normalized.flatMap((prefix) => {
    if (/^[A-Z]{3}\d{2}$/.test(prefix)) {
      const series = prefix.slice(0, 3);
      const shortYear = prefix.slice(3);
      return [prefix, `${series}20${shortYear}`];
    }
    return [prefix];
  });

  return Array.from(new Set(expanded));
};

const randomSuffix = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_');

type InvoiceUploadFile = Pick<Express.Multer.File, 'path' | 'filename' | 'originalname' | 'mimetype' | 'size'>;

type AutoImportOptions = {
  sourceDir?: string;
  prefixes?: string[];
  recursive?: boolean;
  skipIfExists?: boolean;
  archiveDir?: string | null;
  deleteAfterImport?: boolean;
  maxFiles?: number;
  userId?: string;
};

class EInvoiceService {
  private async resolveCustomerScope(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mikroCariCode: true,
        parentCustomerId: true,
        parentCustomer: {
          select: {
            id: true,
            mikroCariCode: true,
          },
        },
      },
    });

    if (!user) {
      throw ErrorFactory.notFound('Kullanici');
    }

    const customer = user.parentCustomer || user;
    const customerId = customer.id;
    const customerCode = customer.mikroCariCode ? String(customer.mikroCariCode).trim() : '';

    return { customerId, customerCode };
  }

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
      if (EINVOICE_UPLOAD_DIR) {
        candidates.add(path.join(EINVOICE_UPLOAD_DIR, fileName));
      }
    }

    for (const candidate of candidates) {
      for (const absolutePath of resolveStorageCandidates(candidate)) {
        if (!fs.existsSync(absolutePath)) continue;
        const root = findRootForPath(absolutePath);
        const relativePath = root ? toRelativePath(absolutePath, root) : document.storagePath;
        if (root && relativePath !== document.storagePath) {
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

  private getManagedUploadDir() {
    return EINVOICE_UPLOAD_DIR || path.resolve(STORAGE_ROOT, 'private-uploads', 'einvoices');
  }

  private ensureDirExists(dirPath: string) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  private collectPdfFilePaths(sourceDir: string, recursive: boolean): string[] {
    if (!fs.existsSync(sourceDir)) {
      return [];
    }

    const queue = [sourceDir];
    const files: string[] = [];

    while (queue.length > 0) {
      const currentDir = queue.shift();
      if (!currentDir) continue;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (recursive) {
            queue.push(absolutePath);
          }
          continue;
        }
        if (!entry.isFile()) continue;
        if (path.extname(entry.name).toLowerCase() !== '.pdf') continue;
        files.push(absolutePath);
      }
    }

    return files;
  }

  private async resolveUploaderUserId(userId?: string) {
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) {
        return user.id;
      }
    }

    const fallback = await prisma.user.findFirst({
      where: {
        active: true,
        role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
      select: { id: true },
    });

    if (!fallback) {
      throw new Error('Auto import icin aktif bir yetkili kullanici bulunamadi');
    }

    return fallback.id;
  }

  private async saveDocumentFromFile(file: InvoiceUploadFile, userId: string) {
    const invoiceNo = extractInvoiceNo(file.originalname);
    const absolutePath = path.isAbsolute(file.path)
      ? file.path
      : path.resolve(process.cwd(), file.path);
    const root = findRootForPath(absolutePath) || process.cwd();
    const storagePath = toRelativePath(absolutePath, root);

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

    return {
      invoiceNo,
      documentId: document.id,
      status: matchStatus,
      message: matchError || undefined,
      isUpdate: Boolean(existing),
      storagePath,
    };
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
      try {
        const result = await this.saveDocumentFromFile(file, userId);
        if (result.isUpdate) {
          updated += 1;
        } else {
          uploaded += 1;
        }
        results.push({
          invoiceNo: result.invoiceNo,
          documentId: result.documentId,
          status: result.status,
          message: result.message,
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

  async importDocumentsFromDirectory(options: AutoImportOptions = {}) {
    const sourceDir = path.resolve(
      options.sourceDir ||
      process.env.EINVOICE_AUTO_IMPORT_SOURCE_DIR ||
      path.join(STORAGE_ROOT, 'auto-import', 'einvoices')
    );
    const recursive = options.recursive ?? parseBoolean(process.env.EINVOICE_AUTO_IMPORT_RECURSIVE, true);
    const skipIfExists = options.skipIfExists ?? parseBoolean(process.env.EINVOICE_AUTO_IMPORT_SKIP_EXISTING, true);
    const deleteAfterImport = options.deleteAfterImport ?? parseBoolean(process.env.EINVOICE_AUTO_IMPORT_DELETE_AFTER_IMPORT, false);
    const maxFilesRaw = Number(options.maxFiles ?? process.env.EINVOICE_AUTO_IMPORT_MAX_FILES ?? 500);
    const maxFiles = Number.isFinite(maxFilesRaw)
      ? Math.max(1, Math.min(5000, Math.trunc(maxFilesRaw)))
      : 500;
    const envPrefixes = (process.env.EINVOICE_AUTO_IMPORT_PREFIXES || 'DEF26,DAR26')
      .split(/[,\s;]+/g)
      .filter(Boolean);
    const prefixes = normalizeInvoicePrefixes(
      options.prefixes && options.prefixes.length > 0 ? options.prefixes : envPrefixes
    );
    const rawArchiveDir = options.archiveDir === undefined
      ? process.env.EINVOICE_AUTO_IMPORT_ARCHIVE_DIR || path.join(sourceDir, '_processed')
      : options.archiveDir;
    const archiveDir = rawArchiveDir ? path.resolve(rawArchiveDir) : null;

    const results: Array<{
      invoiceNo: string;
      sourceFile: string;
      documentId?: string;
      status: EInvoiceMatchStatus;
      message?: string;
    }> = [];

    if (!fs.existsSync(sourceDir)) {
      return {
        sourceDir,
        prefixes,
        scanned: 0,
        uploaded: 0,
        updated: 0,
        skippedPrefix: 0,
        skippedExisting: 0,
        failed: 0,
        results,
        message: 'Source directory not found',
      };
    }

    const uploaderUserId = await this.resolveUploaderUserId(options.userId);
    const allPdfPaths = this.collectPdfFilePaths(sourceDir, recursive);
    const filteredArchivePaths = archiveDir
      ? allPdfPaths.filter((filePath) => !isPathInside(archiveDir, filePath))
      : allPdfPaths;

    filteredArchivePaths.sort((a, b) => {
      try {
        return fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs;
      } catch {
        return 0;
      }
    });

    const prepared = filteredArchivePaths.map((absolutePath) => {
      const originalName = path.basename(absolutePath);
      const invoiceNo = extractInvoiceNo(originalName);
      return { absolutePath, originalName, invoiceNo };
    });

    const prefixCandidates = prepared.filter((item) =>
      prefixes.length === 0 || prefixes.some((prefix) => item.invoiceNo.startsWith(prefix))
    );
    const limitedCandidates = prefixCandidates.slice(0, maxFiles);

    const existingSet = new Set<string>();
    if (skipIfExists && limitedCandidates.length > 0) {
      const existingDocs = await prisma.eInvoiceDocument.findMany({
        where: {
          invoiceNo: {
            in: Array.from(new Set(limitedCandidates.map((item) => item.invoiceNo))),
          },
        },
        select: { invoiceNo: true },
      });
      existingDocs.forEach((doc) => existingSet.add(normalizeInvoiceNo(doc.invoiceNo)));
    }

    let uploaded = 0;
    let updated = 0;
    let failed = 0;
    let skippedExisting = 0;
    const skippedPrefix = prepared.length - prefixCandidates.length;

    const managedUploadDir = this.getManagedUploadDir();
    this.ensureDirExists(managedUploadDir);
    if (!deleteAfterImport && archiveDir) {
      this.ensureDirExists(archiveDir);
    }

    for (const candidate of limitedCandidates) {
      if (skipIfExists && existingSet.has(candidate.invoiceNo)) {
        skippedExisting += 1;
        continue;
      }

      const extension = path.extname(candidate.originalName) || '.pdf';
      const tempFileName = `einvoice-auto-${randomSuffix()}${extension.toLowerCase()}`;
      const tempAbsolutePath = path.join(managedUploadDir, tempFileName);

      try {
        fs.copyFileSync(candidate.absolutePath, tempAbsolutePath);
        const stat = fs.statSync(tempAbsolutePath);

        const result = await this.saveDocumentFromFile({
          path: tempAbsolutePath,
          filename: tempFileName,
          originalname: candidate.originalName,
          mimetype: 'application/pdf',
          size: stat.size,
        }, uploaderUserId);

        if (result.isUpdate) {
          updated += 1;
        } else {
          uploaded += 1;
        }

        if (deleteAfterImport) {
          fs.unlinkSync(candidate.absolutePath);
        } else if (archiveDir) {
          const baseName = sanitizeFileName(candidate.originalName);
          const archiveBasePath = path.join(archiveDir, baseName);
          let archiveTargetPath = archiveBasePath;
          if (fs.existsSync(archiveTargetPath)) {
            const parsed = path.parse(baseName);
            archiveTargetPath = path.join(
              archiveDir,
              `${parsed.name}-${randomSuffix()}${parsed.ext || '.pdf'}`
            );
          }
          try {
            fs.renameSync(candidate.absolutePath, archiveTargetPath);
          } catch {
            fs.copyFileSync(candidate.absolutePath, archiveTargetPath);
            fs.unlinkSync(candidate.absolutePath);
          }
        }

        results.push({
          invoiceNo: result.invoiceNo,
          sourceFile: candidate.absolutePath,
          documentId: result.documentId,
          status: result.status,
          message: result.message,
        });
      } catch (error) {
        failed += 1;
        try {
          if (fs.existsSync(tempAbsolutePath)) {
            fs.unlinkSync(tempAbsolutePath);
          }
        } catch {
          // noop
        }
        results.push({
          invoiceNo: candidate.invoiceNo,
          sourceFile: candidate.absolutePath,
          status: EInvoiceMatchStatus.NOT_FOUND,
          message: error instanceof Error ? error.message : 'Auto import failed',
        });
      }
    }

    return {
      sourceDir,
      archiveDir,
      prefixes,
      recursive,
      maxFiles,
      scanned: prepared.length,
      processed: limitedCandidates.length,
      uploaded,
      updated,
      skippedPrefix,
      skippedExisting,
      failed,
      results,
    };
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

  async getDocumentsForCustomer(userId: string, query: {
    search?: string;
    invoicePrefix?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const scope = await this.resolveCustomerScope(userId);
    const scopedOr: any[] = [];

    if (scope.customerId) scopedOr.push({ customerId: scope.customerId });
    if (scope.customerCode) scopedOr.push({ customerCode: scope.customerCode });

    if (scopedOr.length === 0) {
      return { documents: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } };
    }

    const where: any = {
      AND: [
        { OR: scopedOr },
      ],
    };

    if (query.invoicePrefix) {
      where.AND.push({
        invoiceNo: { startsWith: query.invoicePrefix, mode: 'insensitive' as const },
      });
    }

    if (query.fromDate || query.toDate) {
      const issueDate: Record<string, Date> = {};
      if (query.fromDate) issueDate.gte = new Date(query.fromDate);
      if (query.toDate) issueDate.lte = new Date(query.toDate);
      where.AND.push({ issueDate });
    }

    const searchClauses = buildSearchClauses(query.search);
    if (searchClauses.length > 0) {
      where.AND.push(...searchClauses);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    const [total, documents] = await prisma.$transaction([
      prisma.eInvoiceDocument.count({ where }),
      prisma.eInvoiceDocument.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, name: true } },
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

  async getDocumentForCustomerDownload(documentId: string, userId: string) {
    const scope = await this.resolveCustomerScope(userId);
    const document = await prisma.eInvoiceDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw ErrorFactory.notFound('Fatura');
    }

    const matchesCustomerId = Boolean(scope.customerId && document.customerId === scope.customerId);
    const matchesCustomerCode = Boolean(scope.customerCode && document.customerCode === scope.customerCode);
    if (!matchesCustomerId && !matchesCustomerCode) {
      throw ErrorFactory.forbidden('Bu faturaya erisemezsiniz');
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
