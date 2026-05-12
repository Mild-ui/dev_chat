// src/components/chat/MessageInput.js
// Input bar: text + Encrypt&Send + file/image attachment picker

import React, { useState, useRef, useEffect } from 'react';
import { Send, Lock, Paperclip, Image, FileText, X, Loader } from 'lucide-react';
import ReplyPreview from './ReplyPreview';

// Accepted MIME groups for the file picker
const ACCEPT_IMAGES = 'image/jpeg,image/png,image/gif,image/webp';
const ACCEPT_DOCS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','application/json',
  'application/zip','application/x-zip-compressed',
].join(',');

export default function MessageInput({ onSend, onFileUpload, onTyping, replyTo, onCancelReply, disabled }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [filePreview, setFilePreview] = useState(null); // { file, url, type }

  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef(null);
  const attachMenuRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 130)}px`;
    }
  }, [text]);

  // Close attach menu on outside click
  useEffect(() => {
    function handler(e) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleTextChange(e) {
    setText(e.target.value);
    onTyping(true);
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => onTyping(false), 1500);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  }

  function handleSendText() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    onTyping(false);
    clearTimeout(typingRef.current);
  }

  // ── File selected from disk ───────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);

    const isImage = file.type.startsWith('image/');
    const preview = {
      file,
      type: isImage ? 'image' : 'file',
      url: isImage ? URL.createObjectURL(file) : null
    };
    setFilePreview(preview);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function cancelFilePreview() {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    setFilePreview(null);
  }

  async function handleSendFile() {
    if (!filePreview || uploading || disabled) return;
    setUploading(true);
    try {
      await onFileUpload(filePreview.file);
      cancelFilePreview();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900">

      {/* Reply preview strip */}
      {replyTo && (
        <ReplyPreview
          message={{ ...replyTo, sender_name: replyTo.sender_name }}
          onCancel={onCancelReply}
        />
      )}

      {/* File preview strip */}
      {filePreview && (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-t border-gray-700">
          {filePreview.type === 'image' ? (
            <img src={filePreview.url} alt="preview" className="h-14 w-14 object-cover rounded-lg" />
          ) : (
            <div className="h-14 w-14 bg-gray-700 rounded-lg flex items-center justify-center">
              <FileText size={24} className="text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{filePreview.file.name}</p>
            <p className="text-gray-500 text-xs">
              {(filePreview.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button onClick={cancelFilePreview} className="text-gray-500 hover:text-red-400 transition p-1">
            <X size={16} />
          </button>
          <button
            onClick={handleSendFile}
            disabled={uploading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-mono font-medium transition"
          >
            {uploading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            {uploading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}

      {/* Main input row */}
      {!filePreview && (
        <div className="flex items-end gap-2 p-3">

          {/* Attachment button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={() => setShowAttachMenu(v => !v)}
              disabled={disabled}
              className="p-2.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded-xl transition disabled:opacity-40"
              title="Attach file"
            >
              <Paperclip size={18} />
            </button>

            {/* Attach dropdown */}
            {showAttachMenu && (
              <div className="absolute bottom-full mb-2 left-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 flex flex-col min-w-[160px] z-30">
                <button
                  onClick={() => { imageInputRef.current.click(); }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition"
                >
                  <Image size={16} className="text-blue-400" /> Photo / Image
                </button>
                <button
                  onClick={() => { fileInputRef.current.click(); }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition"
                >
                  <FileText size={16} className="text-indigo-400" /> Document / File
                </button>
              </div>
            )}

            {/* Hidden file inputs */}
            <input ref={imageInputRef} type="file" accept={ACCEPT_IMAGES} className="hidden" onChange={handleFileChange} />
            <input ref={fileInputRef} type="file" accept={ACCEPT_DOCS} className="hidden" onChange={handleFileChange} />
          </div>

          {/* Textarea */}
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl focus-within:border-indigo-500 transition overflow-hidden">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              disabled={disabled}
              rows={1}
              className="w-full bg-transparent text-white text-sm px-4 py-3 resize-none focus:outline-none placeholder-gray-600 disabled:opacity-50"
              style={{ maxHeight: '130px' }}
            />
          </div>

          {/* Encrypt & Send */}
          <button
            onClick={handleSendText}
            disabled={!text.trim() || disabled}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-mono text-sm font-medium transition whitespace-nowrap"
          >
            <Lock size={13} />
            <span className="hidden sm:inline">Encrypt &amp; Send</span>
            <Send size={13} />
          </button>
        </div>
      )}

      <p className="text-gray-700 text-[10px] px-4 pb-2 font-mono">
        Shift+Enter for newline · Max file size 20 MB
      </p>
    </div>
  );
}
