// src/hooks/useTabVisibility.js
// Tracks whether the browser tab is currently active/visible
// Used to decide whether to blink the title or show push notifications

import { useState, useEffect } from 'react';

export function useTabVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    function handleChange() {
      setIsVisible(!document.hidden);
    }
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return isVisible;
}
