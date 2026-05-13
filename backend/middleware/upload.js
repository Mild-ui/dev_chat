// middleware/upload.js
// File uploads via Cloudinary (works on Render — no local disk needed)

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Allowed file types
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'video/mp4': 'mp4'
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Storage with optimization
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    
    return {
      folder: 'devchat_messages',
      resource_type: isImage ? 'image' : (isVideo ? 'video' : 'raw'),
      public_id: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      transformation: isImage ? [{ width: 1000, crop: 'limit', quality: 'auto' }] : undefined
    };
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter, 
  limits: { 
    fileSize: MAX_FILE_SIZE,
    files: 1 // Max 1 file per upload
  } 
});

module.exports = { upload, ALLOWED_TYPES };