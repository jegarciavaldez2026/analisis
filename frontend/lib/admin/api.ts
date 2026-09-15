/**
 * Cliente de la API de administración de usuarios.
 *
 * Cada petición manda la cabecera `Authorization` EXPLÍCITA. Fiarse de
 * `axios.defaults` dejó a Portafolio con 401 al recargar la página: ese valor
 * global depende del orden de los efectos (ver `AccountWorkspace.tsx`).
 */
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

export type Rol = 'admin' | 'usuario';

export interface UsuarioAdmin {
  id: string;
  email: string;
  name: string;
  role: Rol;
  activo: boolean;
  created_at?: string | null;
  ultimo_login?: string | null;
  debe_cambiar_password: boolean;
}

export interface PaginaUsuarios {
  items: UsuarioAdmin[];
  total: number;
  pagina: number;
  por_pagina: number;
  admins_activos: number;
}

export interface DetalleUsuario {
  usuario: UsuarioAdmin;
  /** Documentos del usuario por colección: lo que se perdería al borrar. */
  datos: Record<string, number>;
}

export interface PasswordTemporal {
  usuario: UsuarioAdmin;
  password_temporal: string;
  expira: string;
}

export interface EventoAuditoria {
  id?: string | null;
  ts?: string | null;
  accion: string;
  resultado: string;
  actor_email?: string | null;
  objetivo_email?: string | null;
  motivo?: string | null;
  ip?: string | null;
}

export interface PaginaAuditoria {
  items: EventoAuditoria[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface FiltrosUsuarios {
  q?: string;
  role?: Rol;
  activo?: boolean;
  pagina?: number;
}

/** El texto que se enseña para un error de la API. */
export function mensajeDeError(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } } };
  const estado = err?.response?.status;
  const detalle = err?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  if (estado === 401) return 'Tu sesión ha caducado. Vuelve a entrar.';
  if (estado === 403) return 'Tu cuenta ya no tiene permiso de administración.';
  if (estado === 422) return 'Algún dato no es válido. Revisa el email y los campos obligatorios.';
  if (!err?.response) return 'No se pudo conectar con el servidor.';
  return 'La operación no se pudo completar.';
}

export function adminApi(token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = `${BACKEND_URL}/api/admin`;
  return {
    listar: (f: FiltrosUsuarios) =>
      axios.get<PaginaUsuarios>(`${base}/users`, { headers, params: f }).then((r) => r.data),
    detalle: (id: string) => axios.get<DetalleUsuario>(`${base}/users/${id}`, { headers }).then((r) => r.data),
    crear: (email: string, name: string, role: Rol, password_admin: string) =>
      axios
        .post<PasswordTemporal>(`${base}/users`, { email, name, role, password_admin }, { headers })
        .then((r) => r.data),
    cambiarRol: (id: string, role: Rol, password_admin: string) =>
      axios.patch<UsuarioAdmin>(`${base}/users/${id}/role`, { role, password_admin }, { headers }).then((r) => r.data),
    cambiarEstado: (id: string, activo: boolean, password_admin: string, motivo?: string) =>
      axios
        .patch<UsuarioAdmin>(`${base}/users/${id}/estado`, { activo, password_admin, motivo }, { headers })
        .then((r) => r.data),
    passwordTemporal: (id: string, password_admin: string) =>
      axios
        .post<PasswordTemporal>(`${base}/users/${id}/password-temporal`, { password_admin }, { headers })
        .then((r) => r.data),
    revocarSesiones: (id: string) =>
      axios.post<UsuarioAdmin>(`${base}/users/${id}/revocar-sesiones`, {}, { headers }).then((r) => r.data),
    borrar: (id: string, confirmar_email: string, password_admin: string) =>
      axios
        .post<{ borrados: Record<string, number> }>(`${base}/users/${id}/borrar`, { confirmar_email, password_admin }, { headers })
        .then((r) => r.data),
    auditoria: (pagina = 1) =>
      axios.get<PaginaAuditoria>(`${base}/auditoria`, { headers, params: { pagina, por_pagina: 30 } }).then((r) => r.data),
  };
}
