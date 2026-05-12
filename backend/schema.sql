-- ============================================================
-- DevChat Database Schema
-- MySQL 8.0+ compatible
-- Run this file to set up your database
-- ============================================================

CREATE DATABASE IF NOT EXISTS devchat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE devchat;

-- ─── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username      VARCHAR(30)     NOT NULL,
  email         VARCHAR(255)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,       -- bcrypt hash, NEVER plaintext
  avatar_color  VARCHAR(7)      NOT NULL DEFAULT '#6366f1',
  is_online     TINYINT(1)      NOT NULL DEFAULT 0,
  last_seen     DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  INDEX idx_users_username (username),
  INDEX idx_users_online (is_online)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── chats ────────────────────────────────────────────────────────────────────
-- Tracks unique 1-to-1 chat pairs (optional meta table for future group chats)
CREATE TABLE IF NOT EXISTS chats (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user1_id      INT UNSIGNED    NOT NULL,
  user2_id      INT UNSIGNED    NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_chat_pair (user1_id, user2_id),
  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── messages ────────────────────────────────────────────────────────────────
-- Core message table. Plaintext is NEVER stored here.
-- encrypted_message = AES-256-CBC ciphertext (hex)
-- encryption_iv     = random 16-byte IV used during encryption (hex)
-- The IV must accompany the ciphertext for decryption to work.
CREATE TABLE IF NOT EXISTS messages (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  sender_id         INT UNSIGNED    NOT NULL,
  receiver_id       INT UNSIGNED    NOT NULL,
  encrypted_message TEXT            NOT NULL,   -- AES-256-CBC hex ciphertext
  encryption_iv     VARCHAR(32)     NOT NULL,   -- 16-byte IV as 32-char hex
  timestamp         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read           TINYINT(1)      NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,

  -- Speeds up fetching conversation between two users
  INDEX idx_msg_conversation (sender_id, receiver_id, timestamp),
  INDEX idx_msg_receiver     (receiver_id, is_read),
  INDEX idx_msg_timestamp    (timestamp DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Seed demo users (optional, remove in production) ────────────────────────
-- Passwords are both "password123" (bcrypt hash)
INSERT IGNORE INTO users (username, email, password_hash, avatar_color) VALUES
('alice_dev',  'alice@demo.com',  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewohFvqBDpVGbLuS', '#6366f1'),
('bob_dev',    'bob@demo.com',    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewohFvqBDpVGbLuS', '#14b8a6');
