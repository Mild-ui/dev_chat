// src/hooks/useNotifications.js
// Handles:
//   1. Browser tab title badge  → "🔔 (3) DevChat" when unread msgs exist
//   2. Notification sound       → plays a subtle beep on new message
//   3. Browser push notification (if user grants permission)

import { useEffect, useRef, useCallback } from 'react';

// ── Generate a soft notification beep using Web Audio API ────────────────────
// No external audio file needed — synthesized in the browser
function createBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Two-tone "ding" — a short soft chime
    function playTone(freq, startTime, duration, gain = 0.15) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Fade in + out for a soft ding rather than a harsh beep
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const now = ctx.currentTime;
    playTone(880, now, 0.15);         // A5
    playTone(1100, now + 0.12, 0.2);  // C#6 — makes it a gentle two-note chime
  } catch (e) {
    // AudioContext not available (e.g. in tests) — silently ignore
  }
}

export function useNotifications({ unreadCount, isTabActive }) {
  const originalTitle = useRef(document.title);
  const titleIntervalRef = useRef(null);
  const mutedRef = useRef(false); // user can mute from UI

  // ── Tab title badge ──────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(titleIntervalRef.current);

    if (unreadCount > 0 && !isTabActive) {
      // Blink between "🔔 (N) DevChat" and "DevChat"
      let blink = true;
      document.title = `🔔 (${unreadCount}) DevChat`;

      titleIntervalRef.current = setInterval(() => {
        document.title = blink
          ? `🔔 (${unreadCount}) DevChat`
          : 'DevChat';
        blink = !blink;
      }, 1200);
    } else if (unreadCount > 0) {
      // Tab is active — just show count without blinking
      document.title = `(${unreadCount}) DevChat`;
    } else {
      document.title = 'DevChat';
    }

    return () => clearInterval(titleIntervalRef.current);
  }, [unreadCount, isTabActive]);

  // ── Restore title on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(titleIntervalRef.current);
      document.title = 'DevChat';
    };
  }, []);

  // ── Play sound ──────────────────────────────────────────────────────────
  const playSound = useCallback(() => {
    if (!mutedRef.current) createBeep();
  }, []);

  // ── Browser push notification ───────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const showPushNotification = useCallback((title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        silent: true // we play our own sound
      });
    }
  }, []);

  return { playSound, requestPermission, showPushNotification };
}
