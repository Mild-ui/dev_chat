// routes/auth.js
// User registration and login endpoints

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');

const router = express.Router();

// Helper to pick a random avatar color for new users
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444'
];
const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

// ─── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', [
  body('username').trim().isLength({ min: 2, max: 30 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  // Validate inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password } = req.body;

  try {
    // Check if email already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?', [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password (salt rounds = 12, takes ~300ms - prevents brute force)
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert new user
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password_hash, avatar_color)
       VALUES (?, ?, ?, ?)`,
      [username, email, passwordHash, randomColor()]
    );

    const userId = result.insertId;

    // Issue JWT
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.status(201).json({
      token,
      user: { id: userId, username, email, avatar_color: randomColor() }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Fetch user by email
    const [rows] = await pool.execute(
      'SELECT id, username, email, password_hash, avatar_color FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      // Generic message to prevent user enumeration
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    // Compare password with bcrypt hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_color: user.avatar_color
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
