// src/components/chat/ChatWindow.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Shield, Wifi, WifiOff, X, Reply as ReplyIcon, Bell, BellOff } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Avatar from '../ui/Avatar';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useNotifications } from '../../hooks/useNotifications';
import { useTabVisibility } from '../../hooks/useTabVisibility';

export default function ChatWindow({ chatUser, socket, onlineUsers, currentUserId, totalUnread }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const bottomRef = useRef(null);
  const isOnline = onlineUsers.includes(chatUser?.id);
  const isTabActive = useTabVisibility();

  const { playSound, requestPermission, showPushNotification } = useNotifications({
    unreadCount: totalUnread,
    isTabActive
  });

  // Request notification permission on mount
  useEffect(() => { requestPermission(); }, [requestPermission]);

  // ── Fetch conversation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatUser) return;
    setLoading(true);
    setMessages([]);
    setReplyTo(null);

    api.get(`/api/messages/${chatUser.id}`)
      .then(({ data }) => setMessages(data))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoading(false));
  }, [chatUser]);

  // ── Socket.IO events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !chatUser) return;

    function onNewMessage(msg) {
      const inThisChat =
        (msg.sender_id === chatUser.id && msg.receiver_id === currentUserId) ||
        (msg.sender_id === currentUserId && msg.receiver_id === chatUser.id);

      if (inThisChat) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // Sound + push notification only for incoming messages
        if (msg.sender_id !== currentUserId) {
          if (soundEnabled) playSound();
          if (!isTabActive) {
            showPushNotification(
              `New message from ${chatUser.username}`,
              msg.message_type === 'text' ? '🔒 Encrypted message' : `📎 ${msg.file_name || 'File'}`
            );
          }
        }
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
    socket.emit('messages_read', { senderId: chatUser.id });

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStoppedTyping);
      socket.off('messages_seen', onSeen);
    };
  }, [socket, chatUser, currentUserId, soundEnabled, isTabActive, playSound, showPushNotification]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  // ── Send text message ─────────────────────────────────────────────────────
  async function handleSend(plaintext) {
    try {
      // Only include replyToId if it actually exists — sending null fails isInt() validation
      const payload = { receiverId: chatUser.id, plaintext };
      if (replyTo?.id) payload.replyToId = replyTo.id;

      const { data: newMsg } = await api.post('/api/messages/send', payload);
      setMessages(prev => [...prev, newMsg]);
      setReplyTo(null);
      socket?.emit('deliver_message', { message: newMsg, receiverId: chatUser.id });
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.errors?.[0]?.msg
        || 'Failed to send message';
      toast.error(msg);
      console.error('Send error:', err.response?.data || err.message);
    }
  }

  // ── Upload file / image ───────────────────────────────────────────────────
  async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiverId', chatUser.id);
    if (replyTo?.id) formData.append('replyToId', replyTo.id);

    try {
      const { data: newMsg } = await api.post('/api/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessages(prev => [...prev, newMsg]);
      setReplyTo(null);
      socket?.emit('deliver_message', { message: newMsg, receiverId: chatUser.id });
      toast.success('File sent!');
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed';
      toast.error(msg);
    }
  }

  // ── Delete message ────────────────────────────────────────────────────────
  async function handleDelete(messageId) {
    try {
      await api.delete(`/api/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('Message deleted');
    } catch {
      toast.error('Could not delete message');
    }
  }

  function handleTyping(isTyping) {
    socket?.emit(isTyping ? 'typing_start' : 'typing_stop', { receiverId: chatUser.id });
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!chatUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center select-none">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-gray-400 font-mono text-lg">Select a chat to begin</h2>
          <p className="text-gray-600 text-sm mt-2">All messages are AES-256 encrypted</p>
          <div className="mt-4 flex items-center gap-2 justify-center text-green-400 text-xs font-mono">
            <Shield size={13} /> End-to-end encrypted
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950 min-h-0">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-gray-800 bg-gray-900 flex items-center gap-3 shrink-0">
        <Avatar user={chatUser} size="md" showStatus isOnline={isOnline} />
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold font-mono truncate">{chatUser.username}</h2>
          {typingUser ? (
            <span className="text-indigo-400 text-xs font-mono animate-pulse">typing...</span>
          ) : (
            <span className={`text-xs flex items-center gap-1 ${isOnline ? 'text-green-400' : 'text-gray-600'}`}>
              {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          )}
        </div>

        {/* Encryption badge */}
        <div className="hidden sm:flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <Shield size={11} className="text-green-400" />
          <span className="text-green-400 text-xs font-mono">AES-256</span>
        </div>

        {/* Sound toggle */}
        <button
          onClick={() => {
            setSoundEnabled(v => !v);
            toast(soundEnabled ? '🔇 Sound off' : '🔔 Sound on', { duration: 1500 });
          }}
          className={`p-2 rounded-xl transition ${soundEnabled ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-gray-600 hover:bg-gray-800'}`}
          title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
        >
          {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 font-mono text-sm animate-pulse">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-gray-600 font-mono text-sm">No messages yet</p>
              <p className="text-gray-700 text-xs mt-1">Send an image, file, or encrypted text</p>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onReply={setReplyTo}
              onForward={() => toast('Forward coming soon')}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Typing dots */}
        {typingUser && (
          <div className="flex items-center gap-2 px-5 pb-2">
            <Avatar user={chatUser} size="sm" />
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
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

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <MessageInput
        onSend={handleSend}
        onFileUpload={handleFileUpload}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabled={false}
      />
    </div>
  );
}