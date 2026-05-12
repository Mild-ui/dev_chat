// src/contexts/AuthContext.js
// Global auth state — user info + token management

import React, { createContext, useContext, useState, useEffect } from 'react';
import { disconnectSocket } from '../utils/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on page load
  useEffect(() => {
    const savedToken = localStorage.getItem('devchat_token');
    const savedUser = localStorage.getItem('devchat_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  function login(userData, authToken) {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('devchat_token', authToken);
    localStorage.setItem('devchat_user', JSON.stringify(userData));
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('devchat_token');
    localStorage.removeItem('devchat_user');
    disconnectSocket();
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
