// config/database.js
// MySQL connection pool using mysql2
// Connection pooling reuses connections for better performance
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool (max 10 concurrent connections)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'devchat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false }
  })
});

// Auto-migrate missing columns on startup
async function migrateDB() {
  const migrations = [
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type ENUM('text','image','file') NOT NULL DEFAULT 'text'`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url VARCHAR(500) NULL`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) NULL`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INT UNSIGNED NULL`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_mime_type VARCHAR(100) NULL`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INT UNSIGNED NULL`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log('✅ Migration OK:', sql.substring(0, 60));
    } catch (err) {
      console.log('⚠️  Migration skipped:', err.message);
    }
  }
}

// Test connection on startup
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
    await migrateDB(); // run migrations right after connection is confirmed
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
