// routes/messages.js
// All message REST endpoints — now with file uploads + replies

const express = require('express');
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { encryptMessage, decryptMessage, encryptFile, decryptFile } = require('../utils/encryption');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();
router.use(authMiddleware);

// Helper: build full file URL from stored filename
function fileUrl(req, filename) {
  if (!filename) return null;
  // In production, return your CDN/S3 URL instead
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

// ─── GET /api/messages/chats ──────────────────────────────────────────────────
// ─── GET /api/messages/chats ──────────────────────────────────────────────────
router.get('/chats', async (req, res) => {
  try {
    const [chats] = await pool.execute(`
      WITH latest_messages AS (
        SELECT 
          m.sender_id,
          m.receiver_id,
          m.encrypted_message,
          m.message_type,
          m.file_name,
          m.timestamp,
          m.id as message_id,
          ROW_NUMBER() OVER (
            PARTITION BY 
              LEAST(m.sender_id, m.receiver_id),
              GREATEST(m.sender_id, m.receiver_id)
            ORDER BY m.timestamp DESC
          ) as rn
        FROM messages m
        WHERE m.sender_id = ? OR m.receiver_id = ?
      )
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.avatar_color, 
        u.last_seen,
        lm.encrypted_message AS last_message,
        lm.message_type AS last_message_type,
        lm.file_name AS last_file_name,
        lm.timestamp AS last_message_time,
        lm.sender_id AS last_sender_id,
        (
          SELECT COUNT(*) 
          FROM messages m2
          WHERE m2.sender_id = u.id 
            AND m2.receiver_id = ? 
            AND m2.is_read = 0
        ) AS unread_count
      FROM users u
      INNER JOIN latest_messages lm ON (
        (lm.sender_id = u.id AND lm.receiver_id = ?) OR
        (lm.sender_id = ? AND lm.receiver_id = u.id)
      )
      WHERE u.id != ?
      AND lm.rn = 1
      ORDER BY lm.timestamp DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);

    res.json(chats);
  } catch (err) {
    console.error('CHATS ERROR:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
// Fetches full conversation, including reply context
router.get('/:userId', [param('userId').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const otherId = parseInt(req.params.userId);

  try {
    const [messages] = await pool.execute(`
      SELECT
        m.id, m.sender_id, m.receiver_id,
        m.encrypted_message, m.encryption_iv,
        m.message_type, m.file_url, m.file_name, m.file_size, m.file_mime_type,
        m.reply_to_id, m.timestamp, m.is_read,
        u.username AS sender_name, u.avatar_color AS sender_color,
        -- Inline the replied-to message for display
        rm.encrypted_message AS reply_encrypted,
        rm.message_type AS reply_type,
        rm.file_name AS reply_file_name,
        ru.username AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp ASC
    `, [req.user.id, otherId, otherId, req.user.id]);

    // Build absolute file URLs
    const withUrls = messages.map(msg => ({
      ...msg,
      file_url: msg.file_url ? `${req.protocol}://${req.get('host')}/uploads/${msg.file_url}` : null
    }));

    // Mark received messages as read
    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [otherId, req.user.id]
    );

    res.json(withUrls);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ─── POST /api/messages/send ─────────────────────────────────────────────────
// Send a text message (optionally with a replyToId)
router.post('/send', [
  body('receiverId').isInt(),
  body('plaintext').trim().notEmpty().isLength({ max: 5000 }),
  body('replyToId').optional({ nullable: true, checkFalsy: true }).isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { receiverId, plaintext, replyToId } = req.body;

  try {
    // Verify receiver exists
    const [receiver] = await pool.execute('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (receiver.length === 0) return res.status(404).json({ error: 'Receiver not found' });

    // Verify replyToId belongs to this conversation
    if (replyToId) {
      const [replyMsg] = await pool.execute(
        `SELECT id FROM messages WHERE id = ? AND (
          (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        )`, [replyToId, req.user.id, receiverId, receiverId, req.user.id]
      );
      if (replyMsg.length === 0) return res.status(400).json({ error: 'Invalid reply target' });
    }

    const { encryptedMessage, iv } = encryptMessage(plaintext);

    const [result] = await pool.execute(
      `INSERT INTO messages (sender_id, receiver_id, encrypted_message, encryption_iv, message_type, reply_to_id)
       VALUES (?, ?, ?, ?, 'text', ?)`,
      [req.user.id, receiverId, encryptedMessage, iv, replyToId || null]
    );

    const [newMsg] = await pool.execute(`
      SELECT m.*, u.username AS sender_name, u.avatar_color AS sender_color,
             rm.encrypted_message AS reply_encrypted, rm.message_type AS reply_type,
             rm.file_name AS reply_file_name, ru.username AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE m.id = ?
    `, [result.insertId]);

    res.status(201).json(newMsg[0]);
  } catch (err) {
    // Log the FULL error so it appears in Render logs
    console.error('SEND ERROR:', err.message, err.code, err.sqlMessage || '');
    res.status(500).json({ 
      error: 'Server error', 
      detail: err.message,   // visible in browser console for debugging
      code: err.code 
    });
  }
});

// ─── POST /api/messages/upload ───────────────────────────────────────────────
// Upload a file — AES-256 encrypts the bytes before saving to disk.
// The raw file is NEVER stored. Only the .enc version is kept.
//
// FLOW:
//  1. Multer saves the raw file temporarily to /uploads/
//  2. We read the bytes, encrypt them, overwrite the file with .enc bytes
//  3. DB stores: filename, IV, mime type (so we can decrypt + serve later)
//  4. Receiver sees a locked file bubble
//  5. Receiver clicks "Decrypt & View/Download"
//     → POST /api/messages/decrypt-file → server decrypts → streams file back
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const { receiverId, replyToId } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

  try {
    const [receiver] = await pool.execute('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (receiver.length === 0) return res.status(404).json({ error: 'Receiver not found' });

    // Read the raw uploaded file
    const rawBuffer = fs.readFileSync(req.file.path);

    // Encrypt file bytes with AES-256-CBC
    const { encryptedBuffer, iv } = encryptFile(rawBuffer);

    // Overwrite the saved file with encrypted bytes
    fs.writeFileSync(req.file.path, encryptedBuffer);

    const isImage = req.file.mimetype.startsWith('image/');
    const msgType = isImage ? 'image' : 'file';

    const [result] = await pool.execute(
      `INSERT INTO messages
         (sender_id, receiver_id, message_type, file_url, file_name, file_size, file_mime_type, encryption_iv, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, receiverId, msgType,
        req.file.filename,        // encrypted file stored on disk
        req.file.originalname,    // original name shown to user
        req.file.size,
        req.file.mimetype,
        iv,                       // IV needed to decrypt later
        replyToId || null
      ]
    );

    const [newMsg] = await pool.execute(`
      SELECT m.*, u.username AS sender_name, u.avatar_color AS sender_color,
             rm.encrypted_message AS reply_encrypted, rm.message_type AS reply_type,
             rm.file_name AS reply_file_name, ru.username AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE m.id = ?
    `, [result.insertId]);

    const msg = newMsg[0];
    // Don't expose the raw file URL — access only via /decrypt-file
    msg.file_url = null;
    msg.is_file_encrypted = true;

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ─── POST /api/messages/decrypt-file ─────────────────────────────────────────
// Decrypts an encrypted file and streams it back to the authorised user.
// Only sender or receiver can decrypt.
router.post('/decrypt-file', [body('messageId').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { messageId } = req.body;

  try {
    const [rows] = await pool.execute('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const message = rows[0];

    // Security: only sender or receiver
    if (message.sender_id !== req.user.id && message.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!message.file_url && !message.encryption_iv) {
      return res.status(400).json({ error: 'No encrypted file attached' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', message.file_url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Read encrypted bytes and decrypt
    const encryptedBuffer = fs.readFileSync(filePath);
    const decryptedBuffer = decryptFile(encryptedBuffer, message.encryption_iv);

    // Stream decrypted file back with correct headers
    res.setHeader('Content-Type', message.file_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(message.file_name)}"`);
    res.setHeader('Content-Length', decryptedBuffer.length);
    res.send(decryptedBuffer);

  } catch (err) {
    console.error('decrypt-file error:', err);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

// ─── POST /api/messages/decrypt ──────────────────────────────────────────────
router.post('/decrypt', [body('messageId').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { messageId } = req.body;

  try {
    const [rows] = await pool.execute('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const message = rows[0];

    // Only sender or receiver can decrypt
    if (message.sender_id !== req.user.id && message.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!message.encrypted_message) {
      return res.status(400).json({ error: 'This message has no encrypted text' });
    }

    const plaintext = decryptMessage(message.encrypted_message, message.encryption_iv);
    res.json({ plaintext, messageId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

// ─── PATCH /api/messages/read/:senderId ──────────────────────────────────────
router.patch('/read/:senderId', async (req, res) => {
  try {
    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
      [req.params.senderId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

module.exports = router;

// ─── DELETE /api/messages/:id ─────────────────────────────────────────────────
// Only the original sender can delete their message
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM messages WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (rows[0].sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }
    await pool.execute('DELETE FROM messages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});
