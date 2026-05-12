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
  connectionLimit: 10,       // max parallel connections
  queueLimit: 0,             // unlimited queue
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // SSL for production (PlanetScale/Railway require it)
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false }
  })
});

// Test connection on startup
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
