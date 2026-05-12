// src/components/chat/Sidebar.js

import React, { useState } from 'react';
import { Search, Plus, Terminal, LogOut, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Avatar from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';

export default function Sidebar({ chats, users, selectedChat, onSelectChat, onNewChat, onlineUsers }) {
  const [search, setSearch] = useState('');
  const [showUsers, setShowUsers] = useState(false);
  const { user, logout } = useAuth();

  const filteredChats = chats.filter(c =>
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) &&
    !chats.find(c => c.id === u.id)
  );

  return (
    <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-indigo-400" />
            <span className="font-bold text-white font-mono text-lg">DevChat</span>
            <Shield size={14} className="text-green-400" title="AES-256 encrypted" />
          </div>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-red-400 transition p-1 rounded"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Current user */}
        <div className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-2">
          <Avatar user={user} size="sm" showStatus isOnline />
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate font-mono">{user?.username}</p>
            <p className="text-green-400 text-xs">● Online</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600"
          />
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setShowUsers(false)}
          className={`flex-1 py-2 text-xs font-mono font-medium transition ${
            !showUsers ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          CHATS ({chats.length})
        </button>
        <button
          onClick={() => setShowUsers(true)}
          className={`flex-1 py-2 text-xs font-mono font-medium transition flex items-center justify-center gap-1 ${
            showUsers ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Plus size={12} /> NEW CHAT
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!showUsers ? (
          // Existing chats
          filteredChats.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-600 text-sm font-mono">No chats yet</p>
              <button
                onClick={() => setShowUsers(true)}
                className="mt-2 text-indigo-400 text-xs hover:text-indigo-300"
              >
                Start a conversation →
              </button>
            </div>
          ) : (
            filteredChats.map(chat => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChat?.id === chat.id}
                isOnline={onlineUsers.includes(chat.id)}
                onClick={() => onSelectChat(chat)}
              />
            ))
          )
        ) : (
          // All users (to start new chat)
          <div>
            <p className="px-4 py-2 text-xs font-mono text-gray-600">ALL DEVELOPERS</p>
            {filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => { onNewChat(u); setShowUsers(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition text-left"
              >
                <Avatar user={u} size="md" showStatus isOnline={onlineUsers.includes(u.id)} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium font-mono truncate">{u.username}</p>
                  <p className="text-gray-500 text-xs truncate">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatItem({ chat, isSelected, isOnline, onClick }) {
  const lastMsg = chat.last_message
    ? `🔒 ${chat.last_message.slice(0, 20)}...`
    : 'No messages yet';

  const time = chat.last_message_time
    ? formatDistanceToNow(new Date(chat.last_message_time), { addSuffix: true })
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition text-left ${
        isSelected ? 'bg-indigo-500/10 border-r-2 border-indigo-500' : 'hover:bg-gray-800/30'
      }`}
    >
      <Avatar user={chat} size="md" showStatus isOnline={isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-medium font-mono truncate">{chat.username}</p>
          <span className="text-gray-600 text-xs shrink-0 ml-2">{time}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-gray-500 text-xs truncate font-mono">{lastMsg}</p>
          {chat.unread_count > 0 && (
            <span className="ml-2 bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
