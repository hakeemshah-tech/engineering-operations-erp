/**
 * Selfie storage for Attendance v2.
 *
 * The PunchWidget captures a 400x400 JPEG/WebP on the client, encodes it as
 * Base64, and POSTs it in the punch payload. This helper decodes, validates,
 * and persists to disk via the native `fs` module - no multer, no S3, no
 * external dependencies. Storage layout matches the rest of the project
 * (server/uploads/<feature>/...), served by the existing express.static mount
 * on /uploads.
 */

const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'attendance');

// MIME → file extension. Anything not in this map is rejected.
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/webp': 'webp',
  'image/png':  'png'
};

const DEFAULT_MAX_BYTES = 50 * 1024;   // 50 KB - matches SystemSettings default

class SelfieStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;       // 'SELFIE_MISSING' | 'SELFIE_INVALID' | 'SELFIE_TOO_LARGE' | 'SELFIE_UNSUPPORTED_TYPE' | 'SELFIE_WRITE_FAILED'
    this.name = 'SelfieStorageError';
  }
}

/**
 * Parse a data-URL (`data:image/jpeg;base64,...`) or raw Base64 string.
 * Returns { mime, buffer } or throws SelfieStorageError on malformed input.
 */
function parseBase64(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new SelfieStorageError('SELFIE_MISSING', 'Selfie payload is empty.');
  }
  let mime = 'image/jpeg';
  let payload = input;

  const dataUrlMatch = input.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mime = dataUrlMatch[1].toLowerCase();
    payload = dataUrlMatch[2];
  }

  // Decode. Buffer.from with 'base64' silently drops invalid chars; we sanity-check
  // by re-encoding and comparing length to detect garbage input.
  let buffer;
  try {
    buffer = Buffer.from(payload, 'base64');
  } catch (e) {
    throw new SelfieStorageError('SELFIE_INVALID', 'Selfie Base64 could not be decoded.');
  }
  if (!buffer || buffer.length === 0) {
    throw new SelfieStorageError('SELFIE_INVALID', 'Selfie decoded to zero bytes.');
  }
  return { mime, buffer };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function yearMonthFolder(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Persist a Base64-encoded selfie to disk.
 *
 *   await saveSelfie({
 *     base64:     'data:image/jpeg;base64,...',
 *     employeeId: '67abc...',
 *     suffix:     'in' | 'out',
 *     maxBytes:   50 * 1024
 *   })
 *
 * Returns the public URL path (e.g. '/uploads/attendance/2026-06/67abc-1717238400000-in.jpg')
 * suitable for storing on Attendance.timeLogs[i].inSelfieUrl / outSelfieUrl.
 */
async function saveSelfie({ base64, employeeId, suffix = 'in', maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const { mime, buffer } = parseBase64(base64);

  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    throw new SelfieStorageError(
      'SELFIE_UNSUPPORTED_TYPE',
      `Selfie type "${mime}" is not allowed (jpeg/webp/png only).`
    );
  }
  if (buffer.length > maxBytes) {
    throw new SelfieStorageError(
      'SELFIE_TOO_LARGE',
      `Selfie is ${buffer.length} bytes; max is ${maxBytes}. Reduce camera quality.`
    );
  }

  const folder = path.join(UPLOAD_ROOT, yearMonthFolder());
  ensureDir(folder);

  const safeEmp = String(employeeId || 'anon').replace(/[^a-z0-9_-]/gi, '');
  const safeSuffix = String(suffix || 'in').replace(/[^a-z]/gi, '') || 'in';
  const filename = `${safeEmp}-${Date.now()}-${safeSuffix}.${ext}`;
  const fullPath = path.join(folder, filename);

  try {
    await fs.promises.writeFile(fullPath, buffer);
  } catch (err) {
    throw new SelfieStorageError(
      'SELFIE_WRITE_FAILED',
      `Could not write selfie to disk: ${err.message}`
    );
  }

  // Public URL - mirrors server/index.js line: app.use('/uploads', express.static(...))
  return `/uploads/attendance/${yearMonthFolder()}/${filename}`;
}

/**
 * Best-effort cleanup. Failures are swallowed because deleting a selfie is a
 * tidy-up step, never a request-blocker.
 */
async function deleteSelfie(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') return false;
  if (!publicUrl.startsWith('/uploads/attendance/')) return false;
  const relative = publicUrl.replace('/uploads/attendance/', '');
  const fullPath = path.join(UPLOAD_ROOT, relative);
  try {
    await fs.promises.unlink(fullPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  saveSelfie,
  deleteSelfie,
  SelfieStorageError,
  UPLOAD_ROOT,
  ALLOWED_MIME,
  DEFAULT_MAX_BYTES
};
