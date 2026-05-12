// src/components/chat/MessageInput.js
// Input bar with Encrypt button + Send button

import React, { useState, useRef, useEffect } from 'react';
import { Send, Lock, ShieldCheck } from 'lucide-react';

export default function MessageInput({ onSend, onTyping, disabled }) {
  const [text, setText] = useState('');
  const [encrypted, setEncrypted] = useState(false); // will always encrypt, this is visual toggle
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  function handleChange(e) {
    setText(e.target.value);

    // Typing indicator — debounced
    onTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 1500);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed); // Parent always encrypts before sending
    setText('');
    onTyping(false);
    clearTimeout(typingTimeoutRef.current);
  }

  return (
    <div className="p-4 border-t border-gray-800 bg-gray-900">
      {/* Encryption status badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck size={12} className="text-green-400" />
        <span className="text-xs font-mono text-green-400">
          End-to-end AES-256 encrypted
        </span>
      </div>

      <div className="flex items-end gap-2">
        {/* Text area */}
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:border-indigo-500 transition">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-white text-sm px-4 py-3 resize-none focus:outline-none placeholder-gray-600 disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Encrypt + Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-mono text-sm font-medium transition-all duration-200 whitespace-nowrap"
        >
          <Lock size={14} />
          <span>Encrypt &amp; Send</span>
          <Send size={14} />
        </button>
      </div>

      <p className="text-gray-700 text-xs mt-1.5 font-mono">
        Shift+Enter for newline
      </p>
    </div>
  );
}
