// routes/messages.js
// All message REST endpoints — now with file uploads + replies

const express = require('express');
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { encryptMessage, decryptMessage } = require('../utils/encryption');
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
router.get('/chats', async (req, res) => {
  try {
    const [chats] = await pool.execute(`
      SELECT
        u.id, u.username, u.email, u.avatar_color, u.last_seen,
        m.encrypted_message AS last_message,
        m.message_type AS last_message_type,
        m.file_name AS last_file_name,
        m.timestamp AS last_message_time,
        m.sender_id AS last_sender_id,
        COUNT(CASE WHEN m2.is_read = 0 AND m2.receiver_id = ? THEN 1 END) AS unread_count
      FROM users u
      INNER JOIN messages m ON (
        (m.sender_id = ? AND m.receiver_id = u.id) OR
        (m.sender_id = u.id AND m.receiver_id = ?)
      )
      LEFT JOIN messages m2 ON (
        m2.sender_id = u.id AND m2.receiver_id = ? AND m2.is_read = 0
      )
      WHERE u.id != ?
        AND m.timestamp = (
          SELECT MAX(m3.timestamp) FROM messages m3
          WHERE (m3.sender_id = ? AND m3.receiver_id = u.id)
             OR (m3.sender_id = u.id AND m3.receiver_id = ?)
        )
      GROUP BY u.id
      ORDER BY m.timestamp DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);

    res.json(chats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/messages/users ──────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, avatar_color, last_seen FROM users WHERE id != ? ORDER BY username',
      [req.user.id]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/messages/upload ───────────────────────────────────────────────
// Upload a file (image, doc, etc.) as a message
// Uses multer middleware — handles multipart/form-data
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const { receiverId, replyToId } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

  try {
    const [receiver] = await pool.execute('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (receiver.length === 0) return res.status(404).json({ error: 'Receiver not found' });

    // Determine message_type: 'image' for images, 'file' for everything else
    const isImage = req.file.mimetype.startsWith('image/');
    const msgType = isImage ? 'image' : 'file';

    const [result] = await pool.execute(
      `INSERT INTO messages
         (sender_id, receiver_id, message_type, file_url, file_name, file_size, file_mime_type, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, receiverId, msgType,
        req.file.filename,           // stored filename (random)
        req.file.originalname,       // original name shown to user
        req.file.size,
        req.file.mimetype,
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

    // Build absolute URL
    const msg = newMsg[0];
    msg.file_url = `${req.protocol}://${req.get('host')}/uploads/${msg.file_url}`;

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: 'Server error' });
  }
});