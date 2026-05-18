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
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false }
  })
});

async function migrateDB() {
  const migrations = [
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='message_type'`,
      sql: `ALTER TABLE messages ADD COLUMN message_type ENUM('text','image','file') NOT NULL DEFAULT 'text'`
    },
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='file_url'`,
      sql: `ALTER TABLE messages ADD COLUMN file_url VARCHAR(500) NULL`
    },
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='file_name'`,
      sql: `ALTER TABLE messages ADD COLUMN file_name VARCHAR(255) NULL`
    },
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='file_size'`,
      sql: `ALTER TABLE messages ADD COLUMN file_size INT UNSIGNED NULL`
    },
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='file_mime_type'`,
      sql: `ALTER TABLE messages ADD COLUMN file_mime_type VARCHAR(100) NULL`
    },
    {
      check: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='reply_to_id'`,
      sql: `ALTER TABLE messages ADD COLUMN reply_to_id INT UNSIGNED NULL`
    },
  ];

  for (const migration of migrations) {
    try {
      const [rows] = await pool.query(migration.check);
      if (rows.length === 0) {
        await pool.query(migration.sql);
        console.log('✅ Migration applied:', migration.sql.substring(0, 60));
      } else {
        console.log('⏭️  Already exists, skipping:', migration.sql.substring(0, 60));
      }
    } catch (err) {
      console.error('❌ Migration error:', err.message);
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
