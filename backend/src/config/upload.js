import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isReadOnlyRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const UPLOAD_ROOT = isReadOnlyRuntime
  ? '/tmp/sahayak-uploads'
  : path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const ALLOWED_MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || '';
    const unique = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
    cb(null, unique);
  }
});

function fileFilter(_req, file, cb) {
  const allowedExt = ALLOWED_MIME_TO_EXT[file.mimetype];
  const origExt = path.extname(file.originalname || '').toLowerCase();
  const validExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

  if (!allowedExt || !validExts.includes(origExt)) {
    const err = new Error('Invalid file type. Only PDF, JPG, PNG, and WEBP files are allowed.');
    err.statusCode = 400;
    return cb(err, false);
  }
  cb(null, true);
}

export const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 5
  }
});

export function resolveSafeUploadPath(storageKey) {
  const baseName = path.basename(storageKey);
  const fullPath = path.resolve(UPLOAD_ROOT, baseName);
  if (!fullPath.startsWith(UPLOAD_ROOT)) {
    throw new Error('Invalid storage path.');
  }
  return fullPath;
}
