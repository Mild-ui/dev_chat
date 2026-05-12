// src/components/chat/ChatWindow.js
// The main conversation area

import React, { useEffect, useRef, useState } from 'react';
import { Shield, Wifi, WifiOff } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Avatar from '../ui/Avatar';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function ChatWindow({ chatUser, socket, onlineUsers, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState(false);
  const bottomRef = useRef(null);
  const isOnline = onlineUsers.includes(chatUser?.id);

  // ── Fetch conversation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatUser) return;
    setLoading(true);
    setMessages([]);

    api.get(`/api/messages/${chatUser.id}`)
      .then(({ data }) => setMessages(data))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoading(false));
  }, [chatUser]);

  // ── Socket.IO real-time events ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !chatUser) return;

    function onNewMessage(msg) {
      // Only add if this message is in the current conversation
      if (
        (msg.sender_id === chatUser.id && msg.receiver_id === currentUserId) ||
        (msg.sender_id === currentUserId && msg.receiver_id === chatUser.id)
      ) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    }

    function onTyping({ userId }) {
      if (userId === chatUser.id) setTypingUser(true);
    }

    function onStoppedTyping({ userId }) {
      if (userId === chatUser.id) setTypingUser(false);
    }

    function onSeen({ readBy }) {
      if (readBy === chatUser.id) {
        setMessages(prev => prev.map(m =>
          m.sender_id === currentUserId ? { ...m, is_read: 1 } : m
        ));
      }
    }

    socket.on('new_message', onNewMessage);
    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStoppedTyping);
    socket.on('messages_seen', onSeen);

    // Mark as read
    socket.emit('messages_read', { senderId: chatUser.id });

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStoppedTyping);
      socket.off('messages_seen', onSeen);
    };
  }, [socket, chatUser, currentUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  // ── Send message ────────────────────────────────────────────────────────────
  async function handleSend(plaintext) {
    try {
      const { data: newMsg } = await api.post('/api/messages/send', {
        receiverId: chatUser.id,
        plaintext
      });

      setMessages(prev => [...prev, newMsg]);

      // Notify receiver via Socket.IO for real-time delivery
      socket?.emit('deliver_message', {
        message: newMsg,
        receiverId: chatUser.id
      });
    } catch (err) {
      toast.error('Failed to send message');
    }
  }

  function handleTyping(isTyping) {
    socket?.emit(isTyping ? 'typing_start' : 'typing_stop', {
      receiverId: chatUser.id
    });
  }

  if (!chatUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-gray-400 font-mono text-lg">Select a chat to begin</h2>
          <p className="text-gray-600 text-sm mt-2">All messages are AES-256 encrypted</p>
          <div className="mt-4 flex items-center gap-2 justify-center text-green-400 text-xs font-mono">
            <Shield size={14} />
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950 min-h-0">
      {/* Chat header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900 flex items-center gap-3">
        <Avatar user={chatUser} size="md" showStatus isOnline={isOnline} />
        <div className="flex-1">
          <h2 className="text-white font-bold font-mono">{chatUser.username}</h2>
          <div className="flex items-center gap-2">
            {typingUser ? (
              <span className="text-indigo-400 text-xs font-mono animate-pulse">typing...</span>
            ) : (
              <span className={`text-xs flex items-center gap-1 ${isOnline ? 'text-green-400' : 'text-gray-600'}`}>
                {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
        </div>
        {/* Encryption badge */}
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <Shield size={12} className="text-green-400" />
          <span className="text-green-400 text-xs font-mono">AES-256</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-600 font-mono text-sm animate-pulse">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-gray-600 font-mono text-sm">No messages yet</p>
              <p className="text-gray-700 text-xs mt-1">Say hello! Messages are encrypted automatically.</p>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}

        {/* Typing indicator */}
        {typingUser && (
          <div className="flex items-center gap-2 px-2">
            <Avatar user={chatUser} size="sm" />
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        disabled={false}
      />
    </div>
  );
}
