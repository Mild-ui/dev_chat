// src/components/chat/MessageBubble.js
// Renders a single message with decrypt functionality

import React, { useState } from 'react';
import { Lock, Unlock, Eye, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function MessageBubble({ message }) {
  const { user } = useAuth();
  const [decrypted, setDecrypted] = useState(null);
  const [decrypting, setDecrypting] = useState(false);

  const isMine = message.sender_id === user.id;

  // Truncate cipher for display (first 40 chars + ...)
  const cipherPreview = message.encrypted_message
    ? `${message.encrypted_message.slice(0, 40)}...`
    : '';

  async function handleDecrypt() {
    if (decrypted) {
      setDecrypted(null); // Toggle off
      return;
    }
    setDecrypting(true);
    try {
      const { data } = await api.post('/api/messages/decrypt', {
        messageId: message.id
      });
      setDecrypted(data.plaintext);
    } catch (err) {
      toast.error('Decryption failed');
    } finally {
      setDecrypting(false);
    }
  }

  const time = format(new Date(message.timestamp), 'HH:mm');

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isMine
              ? 'bg-indigo-600 rounded-br-sm'
              : 'bg-gray-800 border border-gray-700 rounded-bl-sm'
          }`}
        >
          {/* Encrypted label */}
          <div className={`flex items-center gap-1.5 mb-2 ${isMine ? 'text-indigo-200' : 'text-gray-500'}`}>
            <Lock size={11} />
            <span className="text-xs font-mono">AES-256 ENCRYPTED</span>
          </div>

          {/* Message content */}
          {decrypted ? (
            // Show decrypted plaintext
            <div>
              <div className={`flex items-center gap-1 mb-1 ${isMine ? 'text-green-300' : 'text-green-400'}`}>
                <Unlock size={11} />
                <span className="text-xs font-mono">DECRYPTED</span>
              </div>
              <p className="text-white text-sm leading-relaxed break-words">{decrypted}</p>
            </div>
          ) : (
            // Show cipher text preview
            <p className={`text-xs font-mono break-all leading-relaxed ${isMine ? 'text-indigo-200/70' : 'text-gray-600'}`}>
              {cipherPreview}
            </p>
          )}
        </div>

        {/* Footer: decrypt button + timestamp + read status */}
        <div className={`flex items-center gap-2 mt-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <button
            onClick={handleDecrypt}
            disabled={decrypting}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition font-mono ${
              decrypted
                ? 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
            } disabled:opacity-50`}
          >
            <Eye size={10} />
            {decrypting ? '...' : decrypted ? 'Hide' : 'Decrypt'}
          </button>

          <span className="text-gray-600 text-xs">{time}</span>

          {isMine && (
            <span className="text-xs">
              {message.is_read
                ? <CheckCheck size={12} className="text-indigo-400" />
                : <Check size={12} className="text-gray-600" />
              }
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
