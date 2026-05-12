// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./config/database');
const { initSocket } = require('./socket/socketHandler');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded files statically ──────────────────────────────────────────
// Files saved by multer in /uploads/ are served at GET /uploads/:filename
// In production replace this with S3/Cloudinary and remove this line
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Multer errors (file size, type)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 20MB)' });
  }
  if (err.message?.includes('not allowed')) {
    return res.status(415).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
initSocket(io);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
async function start() {
  await testConnection();
  server.listen(PORT, () => {
    console.log(`🚀 DevChat running on port ${PORT}`);
    console.log(`📁 File uploads → /uploads/`);
  });
}
start().catch(console.error);
