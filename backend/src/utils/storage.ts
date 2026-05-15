import fs from 'fs';
import path from 'path';

const LEGACY_PRODUCTION_STORAGE_ROOT = '/var/www/b2b/backend';

const resolveStorageRoot = () => {
  const configuredRoot = process.env.STORAGE_ROOT || process.env.B2B_STORAGE_ROOT;
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  // Production releases run from /var/www/b2b-releases/<sha>/backend, while
  // uploads historically live under /var/www/b2b/backend/uploads.
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(LEGACY_PRODUCTION_STORAGE_ROOT, 'uploads'))) {
    return LEGACY_PRODUCTION_STORAGE_ROOT;
  }

  return process.cwd();
};

export const storageRoot = resolveStorageRoot();

export const getStoragePath = (...segments: string[]) => path.resolve(storageRoot, ...segments);

export const getUploadsDir = (...segments: string[]) => getStoragePath('uploads', ...segments);
