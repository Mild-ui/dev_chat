// routes/messages.js
// All message-related REST endpoints

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { encryptMessage, decryptMessage } = require('../utils/encryption');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
// All message routes require authentication
router.use(authMiddleware);

// ─── GET /api/messages/chats ─────────────────────────────────────────────────
// Returns list of users the current user has chatted with + last message
router.get('/chats', async (req, res) => {
  try {
    const [chats] = await pool.execute(`
      SELECT
        u.id, u.username, u.email, u.avatar_color, u.last_seen,
        m.encrypted_message AS last_message,
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
    console.error('Fetch chats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/messages/users ──────────────────────────────────────────────────
// Returns all users to start a new chat with
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
// Returns full conversation between current user and :userId
router.get('/:userId', [
  param('userId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const otherId = parseInt(req.params.userId);

  try {
    const [messages] = await pool.execute(`
      SELECT
        m.id, m.sender_id, m.receiver_id,
        m.encrypted_message, m.encryption_iv,
        m.timestamp, m.is_read,
        u.username AS sender_name, u.avatar_color AS sender_color
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp ASC
    `, [req.user.id, otherId, otherId, req.user.id]);

    // Mark messages sent to current user as read
    await pool.execute(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
      [otherId, req.user.id]
    );

    res.json(messages);
  } catch (err) {
    console.error('Fetch messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/messages/send ─────────────────────────────────────────────────
// Send an encrypted message
router.post('/send', [
  body('receiverId').isInt(),
  body('plaintext').trim().notEmpty().isLength({ max: 5000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { receiverId, plaintext } = req.body;

  try {
    // Verify receiver exists
    const [receiver] = await pool.execute(
      'SELECT id FROM users WHERE id = ?', [receiverId]
    );
    if (receiver.length === 0) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    // Encrypt the message with AES-256-CBC
    const { encryptedMessage, iv } = encryptMessage(plaintext);

    // Store encrypted message (plaintext is NEVER stored)
    const [result] = await pool.execute(
      `INSERT INTO messages (sender_id, receiver_id, encrypted_message, encryption_iv)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, receiverId, encryptedMessage, iv]
    );

    const [newMsg] = await pool.execute(
      `SELECT m.*, u.username AS sender_name, u.avatar_color AS sender_color
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?`,
      [result.insertId]
    );

    res.status(201).json(newMsg[0]);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/messages/decrypt ──────────────────────────────────────────────
// Decrypt a specific message (only sender or receiver can decrypt)
router.post('/decrypt', [
  body('messageId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { messageId } = req.body;

  try {
    // Fetch the message and verify access rights
    const [rows] = await pool.execute(
      'SELECT * FROM messages WHERE id = ?', [messageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = rows[0];

    // SECURITY: Only sender or receiver can decrypt
    if (message.sender_id !== req.user.id && message.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Decrypt using stored IV
    const plaintext = decryptMessage(message.encrypted_message, message.encryption_iv);

    res.json({ plaintext, messageId });
  } catch (err) {
    console.error('Decrypt error:', err);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

// ─── PATCH /api/messages/read/:senderId ──────────────────────────────────────
// Mark all messages from a sender as read
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
