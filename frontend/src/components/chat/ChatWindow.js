// src/components/chat/ChatWindow.js
import React, { useEffect, useRef, useState } from 'react';
import { Shield, Wifi, WifiOff, X, Reply as ReplyIcon } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Avatar from '../ui/Avatar';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function ChatWindow({ chatUser, socket, onlineUsers, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // New state for replying
  const bottomRef = useRef(null);
  const isOnline = onlineUsers.includes(chatUser?.id);

  // ── Fetch conversation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatUser) return;
    setLoading(true);
    setMessages([]);
    setReplyTo(null); // Clear reply when switching chats

    api.get(`/api/messages/${chatUser.id}`)
      .then(({ data }) => setMessages(data))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoading(false));
  }, [chatUser]);

  // ── Socket.IO real-time events ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !chatUser) return;

    function onNewMessage(msg) {
      if (
        (msg.sender_id === chatUser.id && msg.receiver_id === currentUserId) ||
        (msg.sender_id === currentUserId && msg.receiver_id === chatUser.id)
      ) {
        setMessages(prev => {
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
    socket.emit('messages_read', { senderId: chatUser.id });

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStoppedTyping);
      socket.off('messages_seen', onSeen);
    };
  }, [socket, chatUser, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  // ── Message Actions ────────────────────────────────────────────────────────
  const handleReply = (message) => {
    setReplyTo(message);
  };

  const handleForward = (message) => {
    // Logic for opening a contact selector could go here
    toast.success('Forwarding feature coming soon');
  };

  const handleDelete = async (messageId) => {
    try {
      await api.delete(`/api/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('Message deleted');
    } catch (err) {
      toast.error('Could not delete message');
    }
  };

  // ── Send message ────────────────────────────────────────────────────────────
  async function handleSend(plaintext) {
    try {
      const { data: newMsg } = await api.post('/api/messages/send', {
        receiverId: chatUser.id,
        plaintext,
        replyToId: replyTo?.id // Send the ID of the message being replied to
      });

      setMessages(prev => [...prev, newMsg]);
      setReplyTo(null); // Clear reply preview after sending

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
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950 min-h-0 relative">
      {/* Header */}
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
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 font-mono text-sm animate-pulse">
            Loading messages...
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              onReply={handleReply}
              onForward={handleForward}
              onDelete={handleDelete}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply Preview Bar */}
      {replyTo && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 border-l-2 border-indigo-500 pl-3">
            <ReplyIcon size={14} className="text-indigo-500" />
            <div className="flex flex-col">
              <span className="text-xs text-indigo-400 font-bold">Replying to message</span>
              <p className="text-xs text-gray-400 truncate max-w-md">
                {replyTo.encrypted_message.slice(0, 50)}...
              </p>
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-gray-800 rounded-full text-gray-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Input Field */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        disabled={false}
      />
    </div>
  );
}
