// src/components/ui/Avatar.js

import React from 'react';

export default function Avatar({ user, size = 'md', showStatus = false, isOnline = false }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="relative inline-flex flex-shrink-0">
      <div
        className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white font-mono select-none`}
        style={{ backgroundColor: user?.avatar_color || '#6366f1' }}
      >
        {initials}
      </div>
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
            isOnline ? 'bg-green-400' : 'bg-gray-600'
          }`}
        />
      )}
    </div>
  );
}
