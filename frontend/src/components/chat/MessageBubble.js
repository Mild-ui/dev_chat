// src/components/chat/MessageBubble.js
import React, { useState, useRef, useEffect } from 'react';
import {
  Lock, Unlock, Eye, Check, CheckCheck,
  Reply, Forward, Copy, MoreVertical, Trash2,
  FileText, FileSpreadsheet, File,
  Download, Image as ImageIcon
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import ReplyPreview from './ReplyPreview';

// ── Force-download helper ─────────────────────────────────────────────────────
// A plain <a download> won't work cross-origin (e.g. Render backend + Vercel frontend)
// — the browser just opens the file in a new tab.
// This fetches the file as a blob first, then triggers a real download.
async function forceDownload(url, filename) {
  try {
    toast.loading('Preparing download…', { id: 'dl' });
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    toast.success('Downloaded!', { id: 'dl' });
  } catch {
    toast.error('Download failed', { id: 'dl' });
  }
}

// ── File type icon ────────────────────────────────────────────────────────────
function FileIcon({ mime, size = 20 }) {
  if (!mime) return <File size={size} className="text-gray-400" />;
  if (mime.startsWith('image/')) return <ImageIcon size={size} className="text-blue-400" />;
  if (mime.includes('pdf')) return <FileText size={size} className="text-red-400" />;
  if (mime.includes('word') || mime.includes('document')) return <FileText size={size} className="text-blue-500" />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return <FileSpreadsheet size={size} className="text-green-400" />;
  if (mime.includes('presentation') || mime.includes('powerpoint')) return <FileText size={size} className="text-orange-400" />;
  return <File size={size} className="text-gray-400" />;
}

// ── Format bytes ──────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── MenuItem ──────────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors w-full text-left ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-300 hover:bg-gray-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MessageBubble({ message, onReply = () => {}, onForward = () => {}, onDelete = () => {} }) {
  const { user } = useAuth();
  const [decrypted, setDecrypted] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const isMine = message.sender_id === user.id;
  const isText = message.message_type === 'text';
  const isImage = message.message_type === 'image';
  const isFile = message.message_type === 'file';
  const cipherPreview = message.encrypted_message
    ? `${message.encrypted_message.slice(0, 40)}...`
    : '';
  const time = format(new Date(message.timestamp), 'HH:mm');

  // Close context menu on outside click
  useEffect(() => {
    function handler(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) setShowMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleDecrypt() {
    if (decrypted) { setDecrypted(null); return; }
    setDecrypting(true);
    try {
      const { data } = await api.post('/api/messages/decrypt', { messageId: message.id });
      setDecrypted(data.plaintext);
    } catch { toast.error('Decryption failed'); }
    finally { setDecrypting(false); }
  }

  function copyToClipboard() {
    const txt = decrypted || message.encrypted_message || message.file_name || '';
    navigator.clipboard.writeText(txt);
    toast.success('Copied to clipboard');
    setShowMenu(false);
  }

  return (
    <>
      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {imgExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImgExpanded(false)}
        >
          <img
            src={message.file_url}
            alt={message.file_name}
            className="max-w-full max-h-full rounded-xl object-contain"
          />
          {/* Download button inside lightbox */}
          <button
            onClick={e => { e.stopPropagation(); forceDownload(message.file_url, message.file_name); }}
            className="absolute bottom-6 right-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
          >
            <Download size={15} /> Download
          </button>
          <button
            className="absolute top-4 right-4 text-white bg-gray-800 rounded-full p-2 hover:bg-gray-700"
            onClick={() => setImgExpanded(false)}
          >✕</button>
        </div>
      )}

      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-4 group relative w-full px-4`}>
        <div className={`max-w-[80%] md:max-w-[68%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>

          <div className={`flex items-end gap-2 ${isMine ? 'flex-row' : 'flex-row-reverse'}`}>

            {/* ⋮ menu trigger */}
            <button
              ref={buttonRef}
              onClick={() => setShowMenu(v => !v)}
              className={`p-1.5 rounded-full hover:bg-gray-800 text-gray-500 hover:text-white transition-opacity ${
                showMenu ? 'opacity-100 bg-gray-800' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <MoreVertical size={16} />
            </button>

            {/* ── Bubble ──────────────────────────────────────────────────── */}
            <div className={`relative rounded-2xl shadow-sm overflow-hidden ${
              isMine
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-bl-none'
            }`}>

              {/* Reply strip */}
              {message.reply_to_id && (
                <div className="px-3 pt-2 pb-0">
                  <ReplyPreview
                    message={{
                      message_type: message.reply_type,
                      file_name: message.reply_file_name,
                      reply_sender_name: message.reply_sender_name,
                    }}
                    compact
                  />
                </div>
              )}

              {/* ── IMAGE ─────────────────────────────────────────────────── */}
              {isImage && (
                <div className="relative">
                  <img
                    src={message.file_url}
                    alt={message.file_name || 'Image'}
                    onClick={() => setImgExpanded(true)}
                    className="max-w-[260px] max-h-[320px] w-full object-cover cursor-zoom-in block"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  {/* Download button — uses forceDownload, NOT a plain anchor */}
                  <button
                    onClick={e => { e.stopPropagation(); forceDownload(message.file_url, message.file_name); }}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 transition"
                    title="Download image"
                  >
                    <Download size={13} />
                  </button>
                  {message.file_name && (
                    <p className={`px-3 py-1.5 text-xs truncate ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {message.file_name}
                    </p>
                  )}
                </div>
              )}

              {/* ── FILE (pdf, doc, etc.) ──────────────────────────────────── */}
              {isFile && (
                <div className="px-4 py-3 flex items-center gap-3 min-w-[200px] max-w-[280px]">
                  <div className={`p-2.5 rounded-xl shrink-0 ${isMine ? 'bg-white/15' : 'bg-gray-700'}`}>
                    <FileIcon mime={message.file_mime_type} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{message.file_name}</p>
                    <p className={`text-xs mt-0.5 ${isMine ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {formatBytes(message.file_size)} · {message.file_mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                    </p>
                  </div>
                  {/* Download button — uses forceDownload, NOT a plain anchor */}
                  <button
                    onClick={() => forceDownload(message.file_url, message.file_name)}
                    className={`shrink-0 p-2 rounded-lg transition ${isMine ? 'hover:bg-white/20' : 'hover:bg-gray-600'}`}
                    title="Download file"
                  >
                    <Download size={16} />
                  </button>
                </div>
              )}

              {/* ── TEXT ──────────────────────────────────────────────────── */}
              {isText && (
                <div className="px-4 py-3">
                  <div className={`flex items-center gap-1 mb-1.5 ${isMine ? 'text-indigo-200/70' : 'text-gray-600'}`}>
                    <Lock size={9} />
                    <span className="text-[9px] font-mono tracking-widest uppercase">AES-256</span>
                  </div>
                  {decrypted ? (
                    <div>
                      <div className={`flex items-center gap-1 mb-1 ${isMine ? 'text-green-300' : 'text-green-400'}`}>
                        <Unlock size={9} />
                        <span className="text-[9px] font-mono">DECRYPTED</span>
                      </div>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{decrypted}</p>
                    </div>
                  ) : (
                    <p className={`text-xs font-mono break-all leading-relaxed ${isMine ? 'text-indigo-100/55' : 'text-gray-500'}`}>
                      {cipherPreview}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Context menu ────────────────────────────────────────────── */}
            {showMenu && (
              <div
                ref={menuRef}
                className={`absolute z-40 bottom-full mb-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 flex flex-col min-w-[155px] ${
                  isMine ? 'right-10' : 'left-10'
                }`}
              >
                <MenuItem icon={<Reply size={14} />} label="Reply" onClick={() => { onReply(message); setShowMenu(false); }} />
                <MenuItem icon={<Forward size={14} />} label="Forward" onClick={() => { onForward(message); setShowMenu(false); }} />
                <MenuItem icon={<Copy size={14} />} label="Copy" onClick={copyToClipboard} />
                {(isImage || isFile) && (
                  <MenuItem
                    icon={<Download size={14} />}
                    label="Download"
                    onClick={() => { forceDownload(message.file_url, message.file_name); setShowMenu(false); }}
                  />
                )}
                <div className="h-px bg-gray-700 my-1 mx-1" />
                <MenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={() => { onDelete(message.id); setShowMenu(false); }} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center gap-2 mt-1 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            {isText && (
              <button
                onClick={handleDecrypt}
                disabled={decrypting}
                className={`text-[10px] font-bold uppercase tracking-wide transition ${
                  decrypted ? 'text-green-500 hover:text-green-400' : 'text-gray-600 hover:text-indigo-400'
                } disabled:opacity-50`}
              >
                <Eye size={10} className="inline mr-0.5" />
                {decrypting ? '...' : decrypted ? 'Hide' : 'Decrypt'}
              </button>
            )}
            <span className="text-gray-600 text-[10px] tabular-nums">{time}</span>
            {isMine && (
              message.is_read
                ? <CheckCheck size={12} className="text-indigo-400" />
                : <Check size={12} className="text-gray-600" />
            )}
          </div>

        </div>
      </div>
    </>
  );
}