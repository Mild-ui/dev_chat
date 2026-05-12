const multer = require('multer');
const CloudinaryStorage  = require('multer-storage-cloudinary').CloudinaryStorage;
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine type
    const isImage = file.mimetype.startsWith('image/');
    
    return {
      folder: 'devchat',
      resource_type: isImage ? 'image' : 'raw', // Critical for non-images
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`, 
    };
  },
});


const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

module.exports = { upload, ALLOWED_TYPES };
