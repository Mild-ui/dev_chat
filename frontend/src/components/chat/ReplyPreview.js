// src/components/chat/ReplyPreview.js
// Shows a small preview of the message being replied to

import React from 'react';
import { Reply, X, FileText, Image } from 'lucide-react';

export default function ReplyPreview({ message, onCancel, compact = false }) {
  if (!message) return null;

  // Determine preview text
  let previewText = '';
  if (message.message_type === 'text') {
    previewText = '🔒 Encrypted message';
  } else if (message.message_type === 'image') {
    previewText = `📷 ${message.file_name || 'Image'}`;
  } else {
    previewText = `📎 ${message.file_name || 'File'}`;
  }

  if (compact) {
    // Inside a message bubble — no cancel button
    return (
      <div className="flex items-start gap-2 mb-2 bg-black/20 rounded-lg px-2 py-1.5 border-l-2 border-white/30">
        <Reply size={10} className="text-white/50 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-white/60 text-xs font-mono font-medium truncate">
            {message.reply_sender_name}
          </p>
          <p className="text-white/40 text-xs truncate">{previewText}</p>
        </div>
      </div>
    );
  }

  // In the input bar — with cancel button
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700">
      <div className="w-0.5 h-8 bg-indigo-500 rounded-full shrink-0" />
      <Reply size={14} className="text-indigo-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-indigo-400 text-xs font-mono font-medium">
          Replying to {message.sender_name || message.reply_sender_name}
        </p>
        <p className="text-gray-400 text-xs truncate">{previewText}</p>
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-300 transition shrink-0"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
