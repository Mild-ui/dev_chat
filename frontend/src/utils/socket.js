// src/utils/socket.js
// Socket.IO client singleton — one connection for the whole app

import { io } from 'socket.io-client';

let socket = null;

export function getSocket(token) {
  if (!socket || !socket.connected) {
    socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },           // JWT sent on handshake
      transports: ['websocket'], // Skip long-polling for speed
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
