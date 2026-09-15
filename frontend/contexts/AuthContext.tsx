import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: 'admin' | 'usuario';
  /** Entró con una contraseña temporal: tiene que elegir una propia antes de seguir. */
  debe_cambiar_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Cambia la contraseña propia. El backend devuelve un token nuevo: las demás sesiones se cierran. */
  cambiarPassword: (actual: string, nueva: string) => Promise<void>;
  isAuthenticated: boolean;
  esAdmin: boolean;
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

  // Agregar token a todas las peticiones axios
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const guardar = useCallback((nuevoToken: string, datos: User) => {
    setToken(nuevoToken);
    setUser(datos);
    storage.set('auth_token', nuevoToken);
    storage.set('auth_user', JSON.stringify(datos));
    axios.defaults.headers.common['Authorization'] = `Bearer ${nuevoToken}`;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    storage.remove('auth_token');
    storage.remove('auth_user');
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  useEffect(() => {
    /**
     * La sesión guardada se CONFIRMA con el servidor.
     *
     * Antes bastaba con que hubiera algo en `localStorage`: un token caducado,
     * revocado o de una cuenta desactivada seguía «dentro», y el rol se habría
     * leído de un JSON que cualquiera puede editar. Si el servidor no responde
     * (sin red) se usa lo guardado para no echar a nadie; si responde 401, fuera.
     */
    const cargar = async () => {
      const guardado = storage.get('auth_token');
      if (!guardado) {
        setLoading(false);
        return;
      }
      try {
        const r = await axios.get<User>(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${guardado}` },
          timeout: 10000,
        });
        guardar(guardado, r.data);
      } catch (e) {
        const estado = (e as { response?: { status?: number } })?.response?.status;
        if (estado === 401 || estado === 403) {
          logout();
        } else {
          try {
            const previo = storage.get('auth_user');
            if (previo) {
              setToken(guardado);
              setUser(JSON.parse(previo));
            }
          } catch {
            logout();
          }
        }
      } finally {
        setLoading(false);
      }
    };
    void cargar();
  }, [guardar, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await axios.post(`${BACKEND_URL}/api/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      guardar(access_token, userData);
    },
    [guardar],
  );

  const cambiarPassword = useCallback(
    async (actual: string, nueva: string) => {
      const response = await axios.post(
        `${BACKEND_URL}/api/auth/password`,
        { password_actual: actual, password_nueva: nueva },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const { access_token, user: userData } = response.data;
      guardar(access_token, userData);
    },
    [guardar, token],
  );

  // Estable entre renders: un objeto nuevo en cada uno repintaba todas las
  // pantallas que leen la sesión, aunque nada de la sesión hubiera cambiado.
  const valor = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      cambiarPassword,
      isAuthenticated: !!user,
      esAdmin: user?.role === 'admin',
    }),
    [user, token, loading, login, logout, cambiarPassword],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
