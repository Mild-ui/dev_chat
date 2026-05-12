const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');


// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Allowed File Types
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif',  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'text/csv': 'csv',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// 3. Set up Storage Engine
// The constructor now correctly identifies CloudinaryStorage from the named export
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith('image/');
    return {
      folder: 'devchat',
      // Cloudinary needs 'raw' for non-image files like PDF/DOCX
      resource_type: isImage ? 'image' : 'raw', 
      public_id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    };
  },
});

// 4. File Filter logic
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// 5. Export Multer Instance
const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter, 
  limits: { fileSize: MAX_FILE_SIZE } 
});


const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

module.exports = { upload, ALLOWED_TYPES };
