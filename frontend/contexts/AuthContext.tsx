import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const storage = {
  get: (key: string) => {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; } catch { return null; }
  },
  set: (key: string, value: string) => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); } catch {}
  },
  remove: (key: string) => {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); } catch {}
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Agregar token a todas las peticiones axios
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const loadStoredAuth = async () => {
    try {
      const storedToken = storage.get('auth_token');
      const storedUser = storage.get('auth_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch (e) {
      console.log('Error loading auth:', e);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${BACKEND_URL}/api/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    storage.set('auth_token', access_token);
    storage.set('auth_user', JSON.stringify(userData));
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await axios.post(`${BACKEND_URL}/api/auth/register`, { email, password, name });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    storage.set('auth_token', access_token);
    storage.set('auth_user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    storage.remove('auth_token');
    storage.remove('auth_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
