// src/components/chat/MessageBubble.js
import React, { useState, useRef, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  Eye, 
  Check, 
  CheckCheck, 
  Reply, 
  Forward, 
  Copy, 
  MoreVertical, 
  Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function MessageBubble({ 
  message, 
  onReply = () => {}, 
  onForward = () => {}, 
  onDelete = () => {} 
}) {
  const { user } = useAuth();
  const [decrypted, setDecrypted] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Refs to handle clicking outside the menu
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const isMine = message.sender_id === user.id;
  const cipherPreview = message.encrypted_message 
    ? `${message.encrypted_message.slice(0, 40)}...` 
    : '';

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current && !menuRef.current.contains(event.target) &&
        buttonRef.current && !buttonRef.current.contains(event.target)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleDecrypt() {
    if (decrypted) {
      setDecrypted(null);
      return;
    }
    setDecrypting(true);
    try {
      const { data } = await api.post('/api/messages/decrypt', { messageId: message.id });
      setDecrypted(data.plaintext);
    } catch (err) {
      toast.error('Decryption failed');
    } finally {
      setDecrypting(false);
    }
  }

  const copyToClipboard = () => {
    const textToCopy = decrypted || message.encrypted_message;
    navigator.clipboard.writeText(textToCopy);
    toast.success('Copied to clipboard');
    setShowMenu(false);
  };

  const time = format(new Date(message.timestamp), 'HH:mm');

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-4 group relative w-full px-4`}>
      <div className={`max-w-[80%] md:max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col relative`}>
        
        {/* Reply Reference Header (if this message is a reply) */}
        {message.reply_to_content && (
          <div className="flex items-center gap-2 mb-1 text-xs text-gray-500 bg-gray-900/30 px-2 py-1 rounded-t-lg border-l-2 border-indigo-500">
            <Reply size={12} />
            <span className="truncate max-w-[200px] italic">
              {message.reply_to_content}
            </span>
          </div>
        )}

        <div className={`flex items-center gap-2 ${isMine ? 'flex-row' : 'flex-row-reverse'}`}>
          
          {/* Action Trigger - Three Dots */}
          <button 
            ref={buttonRef}
            onClick={() => setShowMenu(!showMenu)}
            className={`p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-white transition-opacity duration-200 ${
              showMenu ? 'opacity-100 bg-gray-800' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <MoreVertical size={18} />
          </button>

          {/* Main Message Bubble */}
          <div className={`relative rounded-2xl px-4 py-3 shadow-sm ${
            isMine 
              ? 'bg-indigo-600 text-white rounded-br-none' 
              : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-bl-none'
          }`}>
            {/* Header: Encryption Tag */}
            <div className={`flex items-center gap-1.5 mb-1.5 ${isMine ? 'text-indigo-200' : 'text-gray-500'}`}>
              <Lock size={10} />
              <span className="text-[10px] font-mono tracking-wider uppercase">AES-256</span>
            </div>

            {/* Content Area */}
            {decrypted ? (
              <div className="animate-in fade-in duration-300">
                <div className={`flex items-center gap-1 mb-1 ${isMine ? 'text-green-300' : 'text-green-400'}`}>
                  <Unlock size={10} />
                  <span className="text-[10px] font-mono">DECRYPTED</span>
                </div>
                <p className="text-sm leading-relaxed break-words">{decrypted}</p>
              </div>
            ) : (
              <p className={`text-xs font-mono break-all leading-relaxed ${isMine ? 'text-indigo-100/60' : 'text-gray-500'}`}>
                {cipherPreview}
              </p>
            )}
          </div>

          {/* Floating Context Menu */}
          {showMenu && (
            <div 
              ref={menuRef}
              className={`absolute z-50 bottom-full mb-2 bg-[#1a1d21] border border-gray-700 rounded-xl shadow-2xl p-1.5 flex flex-col min-w-[150px] animate-in zoom-in-95 duration-100 ${
                isMine ? 'right-10' : 'left-20'
              }`}
            >
              <button 
                onClick={() => { onReply(message); setShowMenu(false); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-indigo-600 hover:text-white rounded-lg transition-colors"
              >
                <Reply size={16} /> Reply
              </button>
              <button 
                onClick={() => { onForward(message); setShowMenu(false); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Forward size={16} /> Forward
              </button>
              <button 
                onClick={copyToClipboard}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Copy size={16} /> Copy
              </button>
              <div className="h-[1px] bg-gray-700 my-1 mx-1" />
              <button 
                onClick={() => { onDelete(message.id); setShowMenu(false); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>

        {/* Footer: Decrypt Toggle, Time, and Status */}
        <div className={`flex items-center gap-3 mt-1.5 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <button 
            onClick={handleDecrypt} 
            disabled={decrypting}
            className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${
              decrypted 
                ? 'text-green-500 hover:text-green-400' 
                : 'text-gray-500 hover:text-indigo-400'
            }`}
          >
            {decrypting ? '...' : decrypted ? 'Hide' : 'Decrypt'}
          </button>
          
          <span className="text-gray-600 text-[10px] tabular-nums">
            {time}
          </span>

          {isMine && (
            <span className="flex items-center">
              {message.is_read 
                ? <CheckCheck size={13} className="text-indigo-400" /> 
                : <Check size={13} className="text-gray-600" /> 
              }
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
