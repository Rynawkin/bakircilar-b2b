import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const ensureDir = (dirPath: string, cb: (error: Error | null, destination: string) => void) => {
  fs.mkdir(dirPath, { recursive: true }, (error) => {
    cb(error, dirPath);
  });
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir('uploads/', cb);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const taskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(path.join('uploads', 'tasks'), cb);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'task-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const invoiceUploadDir = process.env.EINVOICE_UPLOAD_DIR || path.join('private-uploads', 'einvoices');

const invoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(invoiceUploadDir, cb);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'einvoice-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter - only images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları yüklenebilir (jpeg, jpg, png, gif, webp)'));
  }
};

const taskFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = [
    '.jpeg', '.jpg', '.png', '.gif', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  ];
  const extname = path.extname(file.originalname).toLowerCase();
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const isAllowedExt = allowedExtensions.includes(extname);
  const isAllowedMime = allowedMimes.includes(file.mimetype);

  if (isAllowedExt && isAllowedMime) {
    return cb(null, true);
  }

  cb(new Error('Dosya turu desteklenmiyor (resim, pdf, doc/docx, xls/xlsx)'));
};

const invoiceFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extname = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ['application/pdf', 'application/octet-stream'];
  const isAllowedExt = extname === '.pdf';
  const isAllowedMime = allowedMimes.includes(file.mimetype);

  if (isAllowedExt && isAllowedMime) {
    return cb(null, true);
  }

  cb(new Error('Sadece PDF dosyasi yuklenebilir'));
};

// Upload middleware
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter,
});

export const taskUpload = multer({
  storage: taskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: taskFileFilter,
});

export const invoiceUpload = multer({
  storage: invoiceStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: invoiceFileFilter,
});
