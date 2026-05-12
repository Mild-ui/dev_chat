// socket/socketHandler.js
// Real-time messaging, typing indicators, and online/offline status

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Map of userId → socketId for tracking online users
const onlineUsers = new Map();

function initSocket(io) {
  // ── Authentication middleware for Socket.IO ──────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🔌 User ${userId} connected (socket: ${socket.id})`);

    // ── Mark user online ─────────────────────────────────────────────────
    onlineUsers.set(userId, socket.id);
    await pool.execute(
      'UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = ?', [userId]
    );

    // Broadcast online status to everyone
    io.emit('user_status_change', { userId, status: 'online' });

    // Send current online users to newly connected user
    socket.emit('online_users', Array.from(onlineUsers.keys()));

    // ── Real-time message delivery ────────────────────────────────────────
    // The client calls this AFTER posting to REST API (so message is saved)
    socket.on('deliver_message', ({ message, receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        // Receiver is online — deliver instantly
        io.to(receiverSocketId).emit('new_message', message);
        // Acknowledge delivery to sender
        socket.emit('message_delivered', { messageId: message.id });
      }
    });

    // ── Typing indicators ─────────────────────────────────────────────────
    socket.on('typing_start', ({ receiverId }) => {
      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('user_typing', { userId });
      }
    });

    socket.on('typing_stop', ({ receiverId }) => {
      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('user_stopped_typing', { userId });
      }
    });

    // ── Read receipts ─────────────────────────────────────────────────────
    socket.on('messages_read', ({ senderId }) => {
      const senderSocket = onlineUsers.get(senderId);
      if (senderSocket) {
        io.to(senderSocket).emit('messages_seen', { readBy: userId });
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await pool.execute(
        'UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = ?', [userId]
      );
      io.emit('user_status_change', { userId, status: 'offline' });
      console.log(`🔴 User ${userId} disconnected`);
    });
  });
}

module.exports = { initSocket, onlineUsers };
