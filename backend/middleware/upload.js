// middleware/upload.js
// Multer configuration for handling file uploads
// Files are stored in /uploads/ folder on the server
// For production, swap localStorage for S3/Cloudinary (see comments)

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Allowed file types ────────────────────────────────────────────────────────
const ALLOWED_TYPES = {
  // Images
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  // Documents
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  // Text / Code
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  // Archives
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// ── Storage: local disk ───────────────────────────────────────────────────────
// For production with Render/Railway (ephemeral filesystems), replace this with:
//   const { CloudinaryStorage } = require('multer-storage-cloudinary');
//   or aws-sdk S3 multipart upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Random name to prevent collisions & directory traversal attacks
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${random}${ext}`);
  }
});

// ── File filter ───────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

module.exports = { upload, ALLOWED_TYPES, uploadDir };
