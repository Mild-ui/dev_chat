// utils/encryption.js
// AES-256-CBC encryption for chat messages
//
// FLOW:
// 1. SENDER clicks "Encrypt" → encrypt(plaintext) → { ciphertext, iv }
// 2. { ciphertext, iv } stored in MySQL messages table
// 3. RECEIVER sees ciphertext in UI
// 4. RECEIVER clicks "Decrypt" → POST /api/messages/decrypt → plaintext
//    (server verifies receiver_id matches JWT, then decrypts)
//
// WHY AES-256-CBC?
// - AES-256 = 256-bit key, extremely secure
// - CBC mode = each block XOR'd with previous, so identical inputs → different outputs
// - IV (Initialization Vector) = random 16 bytes per message, prevents pattern attacks

const crypto = require('crypto');

// The key must be exactly 32 bytes (256 bits)
// Store ENCRYPTION_KEY as 64-char hex in .env
const ALGORITHM = 'aes-256-cbc';

function getKey() {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt a plaintext message
 * @param {string} plaintext - The message to encrypt
 * @returns {{ encryptedMessage: string, iv: string }}
 */
function encryptMessage(plaintext) {
  const key = getKey();
  // Generate a fresh random IV for every message (CRITICAL for security)
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedMessage: encrypted,
    iv: iv.toString('hex') // Store IV alongside ciphertext in DB
  };
}

/**
 * Decrypt an encrypted message
 * @param {string} encryptedMessage - Hex-encoded ciphertext
 * @param {string} ivHex - Hex-encoded IV used during encryption
 * @returns {string} - Original plaintext
 */
function decryptMessage(encryptedMessage, ivHex) {
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedMessage, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encryptMessage, decryptMessage };
