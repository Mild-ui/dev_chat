// routes/messages.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { encryptMessage, decryptMessage } = require('../utils/encryption');
const authMiddleware = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/messages/chats ──────────────────────────────────────────────────
router.get('/chats', async (req, res) => {
  try {
    const [chats] = await pool.execute(`
      SELECT
        u.id, u.username, u.email, u.avatar_color, u.last_seen,
        m.encrypted_message   AS last_message,
        m.message_type        AS last_message_type,
        m.file_name           AS last_file_name,
        m.timestamp           AS last_message_time,
        m.sender_id           AS last_sender_id,
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
    `, [req.user.id, req.user.id, req.user.id, req.user.id,
        req.user.id, req.user.id, req.user.id]);

    res.json(chats);
  } catch (err) {
    console.error('CHATS ERROR:', err.message, err.sqlMessage || '');
    res.status(500).json({ error: 'Server error', detail: err.message });
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
    console.error('USERS ERROR:', err.message);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
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
        u.username          AS sender_name,
        u.avatar_color      AS sender_color,
        rm.encrypted_message AS reply_encrypted,
        rm.message_type      AS reply_type,
        rm.file_name         AS reply_file_name,
        ru.username          AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp ASC
    `, [req.user.id, otherId, otherId, req.user.id]);

    // Mark received messages as read
    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [otherId, req.user.id]
    );

    res.json(messages);
  } catch (err) {
    console.error('GET MESSAGES ERROR:', err.message, err.sqlMessage || '');
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// ─── POST /api/messages/send ──────────────────────────────────────────────────
// Encrypts plaintext with AES-256-CBC before storing
router.post('/send', [
  body('receiverId').isInt(),
  body('plaintext').trim().notEmpty().isLength({ max: 5000 }),
  body('replyToId').optional({ nullable: true, checkFalsy: true }).isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { receiverId, plaintext, replyToId } = req.body;

  try {
    // Check receiver exists
    const [receiver] = await pool.execute(
      'SELECT id FROM users WHERE id = ?', [receiverId]
    );
    if (receiver.length === 0) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    // AES-256-CBC encrypt the message
    const { encryptedMessage, iv } = encryptMessage(plaintext);

    const [result] = await pool.execute(
      `INSERT INTO messages
         (sender_id, receiver_id, encrypted_message, encryption_iv, message_type, reply_to_id)
       VALUES (?, ?, ?, ?, 'text', ?)`,
      [req.user.id, receiverId, encryptedMessage, iv, replyToId || null]
    );

    // Fetch the inserted message with sender info for the response
    const [newMsg] = await pool.execute(`
      SELECT
        m.*,
        u.username  AS sender_name,
        u.avatar_color AS sender_color,
        rm.encrypted_message AS reply_encrypted,
        rm.message_type      AS reply_type,
        rm.file_name         AS reply_file_name,
        ru.username          AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE m.id = ?
    `, [result.insertId]);

    res.status(201).json(newMsg[0]);
  } catch (err) {
    console.error('SEND ERROR:', err.message, err.code || '', err.sqlMessage || '');
    res.status(500).json({ error: 'Server error', detail: err.message, code: err.code });
  }
});

// ─── POST /api/messages/upload ────────────────────────────────────────────────
// Uploads file to Cloudinary via multer-storage-cloudinary.
// Cloudinary returns a permanent CDN URL stored in file_url column.
// Images show directly in MessageBubble, files download via forceDownload.
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const { receiverId, replyToId } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

  try {
    const [receiver] = await pool.execute(
      'SELECT id FROM users WHERE id = ?', [receiverId]
    );
    if (receiver.length === 0) return res.status(404).json({ error: 'Receiver not found' });

    const isImage = req.file.mimetype.startsWith('image/');
    const msgType = isImage ? 'image' : 'file';

    // multer-storage-cloudinary sets req.file.path = full Cloudinary HTTPS URL
    // and req.file.filename = cloudinary public_id
    const cloudinaryUrl = req.file.path;

    const [result] = await pool.execute(
      `INSERT INTO messages
         (sender_id, receiver_id, message_type, file_url, file_name, file_size, file_mime_type, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        receiverId,
        msgType,
        cloudinaryUrl,          // full https://res.cloudinary.com/... URL
        req.file.originalname,  // original filename shown in UI
        req.file.size,
        req.file.mimetype,
        replyToId || null
      ]
    );

    const [newMsg] = await pool.execute(`
      SELECT
        m.*,
        u.username     AS sender_name,
        u.avatar_color AS sender_color,
        rm.encrypted_message AS reply_encrypted,
        rm.message_type      AS reply_type,
        rm.file_name         AS reply_file_name,
        ru.username          AS reply_sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE m.id = ?
    `, [result.insertId]);

    res.status(201).json(newMsg[0]);
  } catch (err) {
    console.error('UPLOAD ERROR:', err.message, err.code || '', err.sqlMessage || '');
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// ─── POST /api/messages/decrypt ──────────────────────────────────────────────
// Decrypt AES-256 text — only sender or receiver allowed
router.post('/decrypt', [body('messageId').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM messages WHERE id = ?', [req.body.messageId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const message = rows[0];

    // Security: only sender or receiver can decrypt
    if (message.sender_id !== req.user.id && message.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!message.encrypted_message) {
      return res.status(400).json({ error: 'No encrypted text on this message' });
    }

    const plaintext = decryptMessage(message.encrypted_message, message.encryption_iv);
    res.json({ plaintext, messageId: req.body.messageId });
  } catch (err) {
    console.error('DECRYPT ERROR:', err.message);
    res.status(500).json({ error: 'Decryption failed', detail: err.message });
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

// ─── DELETE /api/messages/:id ─────────────────────────────────────────────────
// Only the original sender can delete their own message
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM messages WHERE id = ?', [req.params.id]
    );
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

module.exports = router;
