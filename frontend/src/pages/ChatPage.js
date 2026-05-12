// src/pages/ChatPage.js

import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/chat/Sidebar';
import ChatWindow from '../components/chat/ChatWindow';
import { useAuth } from '../contexts/AuthContext';
import { getSocket } from '../utils/socket';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { user, token } = useAuth();
  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Total unread across ALL chats — drives the tab badge
  const totalUnread = chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const s = getSocket(token);
    setSocket(s);

    s.on('online_users', ids => setOnlineUsers(ids));
    s.on('user_status_change', ({ userId, status }) => {
      setOnlineUsers(prev =>
        status === 'online'
          ? [...new Set([...prev, userId])]
          : prev.filter(id => id !== userId)
      );
    });

    // Refresh sidebar on new message for unread count + last message preview
    s.on('new_message', () => fetchChats());

    return () => {
      s.off('online_users');
      s.off('user_status_change');
      s.off('new_message');
    };
  }, [token]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchChats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/messages/chats');
      setChats(data);
    } catch {
      toast.error('Failed to load chats');
    }
  }, []);

  useEffect(() => {
    fetchChats();
    api.get('/api/messages/users').then(({ data }) => setAllUsers(data)).catch(() => {});
  }, [fetchChats]);

  function handleSelectChat(chatUser) {
    setSelectedChat(chatUser);
    setMobileShowChat(true);
    // Clear unread count in sidebar immediately
    setChats(prev => prev.map(c => c.id === chatUser.id ? { ...c, unread_count: 0 } : c));
    setTimeout(fetchChats, 1200);
  }

  function handleNewChat(newUser) {
    setSelectedChat(newUser);
    setMobileShowChat(true);
    if (!chats.find(c => c.id === newUser.id)) {
      setChats(prev => [{ ...newUser, unread_count: 0 }, ...prev]);
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0`}>
        <Sidebar
          chats={chats}
          users={allUsers}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onlineUsers={onlineUsers}
        />
      </div>

      {/* Chat window */}
      <div className={`${!mobileShowChat ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col`}>
        {mobileShowChat && (
          <button
            onClick={() => setMobileShowChat(false)}
            className="md:hidden flex items-center gap-2 px-4 py-2.5 bg-gray-900 border-b border-gray-800 text-gray-400 text-sm font-mono"
          >
            ← Back
          </button>
        )}
        <ChatWindow
          chatUser={selectedChat}
          socket={socket}
          onlineUsers={onlineUsers}
          currentUserId={user?.id}
          totalUnread={totalUnread}
        />
      </div>
    </div>
  );
}
