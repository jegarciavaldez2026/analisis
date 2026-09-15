/**
 * Panel de administración de usuarios: cuentas, roles, estado, contraseñas
 * temporales, sesiones y registro de auditoría.
 *
 * Esconder la entrada del menú a quien no es administrador es comodidad, no
 * protección: todo lo decide `require_admin` en el backend. Si el rol cambia a
 * mitad de sesión, cualquier 403 se enseña como «ya no tienes permiso».
 *
 * Las acciones destructivas piden la contraseña del propio administrador, y
 * borrar exige además escribir el email de la cuenta y enseña cuántos datos se
 * perderían. La acción normal para retirar a alguien es DESACTIVAR.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  adminApi,
  DetalleUsuario,
  EventoAuditoria,
  mensajeDeError,
  PaginaUsuarios,
  PasswordTemporal,
  Rol,
  UsuarioAdmin,
} from '../../lib/admin/api';
import { Button, EmptyState, Field, Legend, Notice, Panel, Rule, SkeletonRows } from '../ui';

type Api = ReturnType<typeof adminApi>;

type Accion =
  | { tipo: 'rol'; usuario: UsuarioAdmin; role: Rol }
  | { tipo: 'estado'; usuario: UsuarioAdmin; activo: boolean }
  | { tipo: 'temporal'; usuario: UsuarioAdmin }
  | { tipo: 'sesiones'; usuario: UsuarioAdmin }
  | { tipo: 'borrar'; usuario: UsuarioAdmin };

type FiltroRol = 'todos' | Rol;
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const ETIQUETA_ACCION: Record<string, string> = {
  usuario_creado: 'Alta de usuario',
  rol_cambiado: 'Cambio de rol',
  usuario_desactivado: 'Cuenta desactivada',
  usuario_reactivado: 'Cuenta reactivada',
  password_temporal_emitida: 'Contraseña temporal',
  sesiones_revocadas: 'Sesiones cerradas',
  usuario_borrado: 'Cuenta borrada',
  password_cambiada: 'Cambio de contraseña',
  login_ok: 'Inicio de sesión',
  login_fallido: 'Inicio de sesión fallido',
  login_bloqueado: 'Inicio de sesión bloqueado',
  admin_creado_cli: 'Administrador creado (consola)',
  admin_promovido_cli: 'Administrador promovido (consola)',
  admin_degradado_cli: 'Administrador degradado (consola)',
};

const NOMBRE_COLECCION: Record<string, string> = {
  portfolio: 'transacciones de cartera',
  cash_movements: 'movimientos de efectivo',
  watchlist: 'favoritos',
  sim_cuentas: 'cuenta de trading simulado',
  sim_decisiones: 'decisiones del robot',
  sim_senales_vistas: 'señales vistas',
  sim_archivo: 'operaciones archivadas',
};

/** Las fechas del backend llegan en UTC sin zona: sin la «Z» se leerían como hora local. */
function fecha(iso?: string | null): string {
  if (!iso) return '—';
  const conZona = /Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(conZona);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ==========================================================================
 * Chip de selección
 * ======================================================================== */

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  const { colors, radius, hairline } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: activo ? colors.accent : colors.rule,
          backgroundColor: activo ? colors.accentWash : 'transparent',
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
      ]}
    >
      <Text style={{ color: activo ? colors.accent : colors.inkMuted, fontSize: 12, fontWeight: '600' }}>{texto}</Text>
    </Pressable>
  );
}

/* ==========================================================================
 * Fila de usuario
 * ======================================================================== */

function FilaUsuario({
  usuario,
  esYo,
  onAccion,
}: {
  usuario: UsuarioAdmin;
  esYo: boolean;
  onAccion: (a: Accion) => void;
}) {
  const { colors, space, type } = useTheme();
  const esAdmin = usuario.role === 'admin';
  return (
    <View style={{ paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        <View style={{ flexGrow: 1, flexBasis: 240, minWidth: 0 }}>
          <Text style={[type.labelStrong, { color: colors.ink }]} numberOfLines={1}>
            {usuario.name || '(sin nombre)'}
            {esYo ? '  · tú' : ''}
          </Text>
          <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={1}>
            {usuario.email}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: esAdmin ? colors.accent : colors.inkMuted,
              borderWidth: 1,
              borderColor: esAdmin ? colors.accent : colors.rule,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            {esAdmin ? 'ADMIN' : 'USUARIO'}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: usuario.activo ? colors.up : colors.down,
              borderWidth: 1,
              borderColor: usuario.activo ? colors.up : colors.down,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            {usuario.activo ? 'ACTIVA' : 'DESACTIVADA'}
          </Text>
          {usuario.debe_cambiar_password ? (
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.caution, paddingVertical: 2 }}>
              CONTRASEÑA TEMPORAL
            </Text>
          ) : null}
        </View>
        <View style={{ minWidth: 190 }}>
          <Text style={[type.caption, { color: colors.inkFaint }]}>Alta: {fecha(usuario.created_at)}</Text>
          <Text style={[type.caption, { color: colors.inkFaint }]}>Último acceso: {fecha(usuario.ultimo_login)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Button
          size="sm"
          variant="secondary"
          icon={esAdmin ? 'shield-outline' : 'shield-checkmark-outline'}
          label={esAdmin ? 'Quitar admin' : 'Hacer admin'}
          disabled={esYo}
          onPress={() => onAccion({ tipo: 'rol', usuario, role: esAdmin ? 'usuario' : 'admin' })}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={usuario.activo ? 'pause-circle-outline' : 'play-circle-outline'}
          label={usuario.activo ? 'Desactivar' : 'Reactivar'}
          disabled={esYo}
          onPress={() => onAccion({ tipo: 'estado', usuario, activo: !usuario.activo })}
        />
        <Button
          size="sm"
          variant="secondary"
          icon="key-outline"
          label="Contraseña temporal"
          disabled={esYo}
          onPress={() => onAccion({ tipo: 'temporal', usuario })}
        />
        <Button
          size="sm"
          variant="ghost"
          icon="log-out-outline"
          label="Cerrar sesiones"
          disabled={esYo}
          onPress={() => onAccion({ tipo: 'sesiones', usuario })}
        />
        <Button
          size="sm"
          variant="danger"
          icon="trash-outline"
          label="Borrar"
          disabled={esYo}
          onPress={() => onAccion({ tipo: 'borrar', usuario })}
        />
      </View>
      {esYo ? (
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          Es tu cuenta: quitarte el rol, desactivarte o borrarte lo tiene que hacer otro administrador. Tu contraseña se
          cambia desde el menú de la cuenta.
        </Text>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * Diálogo de confirmación
 * ======================================================================== */

function textosDe(accion: Accion): { titulo: string; cuerpo: string; boton: string } {
  const quien = accion.usuario.email;
  switch (accion.tipo) {
    case 'rol':
      return accion.role === 'admin'
        ? { titulo: 'Hacer administrador', cuerpo: `${quien} podrá gestionar todas las cuentas, incluida la tuya.`, boton: 'Hacer admin' }
        : { titulo: 'Quitar administrador', cuerpo: `${quien} pasará a ser un usuario normal. Sus sesiones se cerrarán.`, boton: 'Quitar admin' };
    case 'estado':
      return accion.activo
        ? { titulo: 'Reactivar cuenta', cuerpo: `${quien} podrá volver a entrar con su contraseña.`, boton: 'Reactivar' }
        : { titulo: 'Desactivar cuenta', cuerpo: `${quien} no podrá entrar y sus sesiones abiertas se cerrarán. Sus datos se conservan y se puede reactivar.`, boton: 'Desactivar' };
    case 'temporal':
      return {
        titulo: 'Contraseña temporal',
        cuerpo: `Se genera una contraseña nueva para ${quien}, válida 72 horas. Su contraseña actual deja de valer, sus sesiones se cierran y al entrar tendrá que elegir una propia. Se enseña una sola vez: entrégasela por un canal seguro.`,
        boton: 'Generar',
      };
    case 'sesiones':
      return { titulo: 'Cerrar sesiones', cuerpo: `${quien} tendrá que volver a entrar en todos sus dispositivos.`, boton: 'Cerrar sesiones' };
    case 'borrar':
      return {
        titulo: 'Borrar cuenta definitivamente',
        cuerpo: 'No se puede deshacer. Si sólo quieres que no entre, desactívala: conserva sus datos.',
        boton: 'Borrar definitivamente',
      };
  }
}

function DialogoAccion({
  accion,
  api,
  onCerrar,
  onHecho,
}: {
  accion: Accion;
  api: Api;
  onCerrar: () => void;
  onHecho: (mensaje: string, temporal?: PasswordTemporal) => void;
}) {
  const { colors, space, type, radius } = useTheme();
  const [passwordAdmin, setPasswordAdmin] = useState('');
  const [confirmarEmail, setConfirmarEmail] = useState('');
  const [detalle, setDetalle] = useState<DetalleUsuario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textos = textosDe(accion);
  const pidePassword = accion.tipo !== 'sesiones';

  useEffect(() => {
    if (accion.tipo !== 'borrar') return;
    let vivo = true;
    api
      .detalle(accion.usuario.id)
      .then((d) => { if (vivo) setDetalle(d); })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)); });
    return () => {
      vivo = false;
    };
  }, [accion, api]);

  const confirmar = async () => {
    setError(null);
    if (pidePassword && !passwordAdmin) return setError('Escribe tu contraseña de administrador.');
    if (accion.tipo === 'borrar' && confirmarEmail.trim().toLowerCase() !== accion.usuario.email.toLowerCase()) {
      return setError('Escribe el email de la cuenta exactamente para confirmar el borrado.');
    }
    setEnviando(true);
    try {
      const { usuario } = accion;
      switch (accion.tipo) {
        case 'rol':
          await api.cambiarRol(usuario.id, accion.role, passwordAdmin);
          onHecho(accion.role === 'admin' ? `${usuario.email} ahora es administrador.` : `${usuario.email} ya no es administrador.`);
          break;
        case 'estado':
          await api.cambiarEstado(usuario.id, accion.activo, passwordAdmin);
          onHecho(accion.activo ? `${usuario.email} está reactivada.` : `${usuario.email} está desactivada.`);
          break;
        case 'temporal': {
          const t = await api.passwordTemporal(usuario.id, passwordAdmin);
          onHecho(`Contraseña temporal generada para ${usuario.email}.`, t);
          break;
        }
        case 'sesiones':
          await api.revocarSesiones(usuario.id);
          onHecho(`Se han cerrado las sesiones de ${usuario.email}.`);
          break;
        case 'borrar': {
          const r = await api.borrar(usuario.id, confirmarEmail, passwordAdmin);
          const total = Object.values(r.borrados).reduce((s, n) => s + n, 0);
          onHecho(`${usuario.email} borrada, con ${total} documento(s) de datos.`);
          break;
        }
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const perdidas = detalle ? Object.entries(detalle.datos).filter(([, n]) => n > 0) : [];

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCerrar}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <View style={{ width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.xl, gap: space.md }}>
          <Text style={[type.title2, { color: accion.tipo === 'borrar' ? colors.down : colors.ink }]}>{textos.titulo}</Text>
          <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 19 }]}>{textos.cuerpo}</Text>

          {accion.tipo === 'borrar' ? (
            <View style={{ gap: space.xs }}>
              {detalle === null && !error ? <SkeletonRows rows={2} /> : null}
              {detalle ? (
                <Text style={[type.caption, { color: colors.ink, lineHeight: 19 }]}>
                  {perdidas.length
                    ? `Se borrarán: ${perdidas.map(([c, n]) => `${n} ${NOMBRE_COLECCION[c] ?? c}`).join(', ')}.`
                    : 'Esta cuenta no tiene datos propios guardados.'}
                </Text>
              ) : null}
              <Legend>Escribe {accion.usuario.email} para confirmar</Legend>
              <Field value={confirmarEmail} onChangeText={setConfirmarEmail} autoCapitalize="none" autoCorrect={false} />
            </View>
          ) : null}

          {pidePassword ? (
            <View style={{ gap: space.xs }}>
              <Legend>Tu contraseña de administrador</Legend>
              <Field
                icon="lock-closed-outline"
                value={passwordAdmin}
                onChangeText={setPasswordAdmin}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={confirmar}
              />
            </View>
          ) : null}

          {error ? <Notice tone="down" title="No se pudo completar" body={error} /> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, flexWrap: 'wrap' }}>
            <Button label="Cancelar" variant="ghost" onPress={onCerrar} />
            <Button
              label={textos.boton}
              variant={accion.tipo === 'borrar' || (accion.tipo === 'estado' && !accion.activo) ? 'danger' : 'primary'}
              onPress={confirmar}
              loading={enviando}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ==========================================================================
 * Alta de usuario
 * ======================================================================== */

function DialogoAlta({
  api,
  onCerrar,
  onHecho,
}: {
  api: Api;
  onCerrar: () => void;
  onHecho: (mensaje: string, temporal?: PasswordTemporal) => void;
}) {
  const { colors, space, type, radius } = useTheme();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [role, setRole] = useState<Rol>('usuario');
  const [passwordAdmin, setPasswordAdmin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setError(null);
    if (!email.trim() || !nombre.trim()) return setError('Faltan el email o el nombre.');
    if (!passwordAdmin) return setError('Escribe tu contraseña de administrador.');
    setEnviando(true);
    try {
      const t = await api.crear(email.trim(), nombre.trim(), role, passwordAdmin);
      onHecho(`Cuenta creada para ${t.usuario.email}.`, t);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCerrar}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <View style={{ width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.xl, gap: space.md }}>
          <Text style={[type.title2, { color: colors.ink }]}>Nuevo usuario</Text>
          <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 19 }]}>
            Se genera una contraseña temporal válida 72 horas. Al entrar por primera vez tendrá que elegir una propia.
          </Text>
          <View style={{ gap: space.xs }}>
            <Legend>Email</Legend>
            <Field icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
          </View>
          <View style={{ gap: space.xs }}>
            <Legend>Nombre</Legend>
            <Field icon="person-outline" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
          </View>
          <View style={{ gap: space.xs }}>
            <Legend>Rol</Legend>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <Chip texto="Usuario" activo={role === 'usuario'} onPress={() => setRole('usuario')} />
              <Chip texto="Administrador" activo={role === 'admin'} onPress={() => setRole('admin')} />
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <Legend>Tu contraseña de administrador</Legend>
            <Field icon="lock-closed-outline" value={passwordAdmin} onChangeText={setPasswordAdmin} secureTextEntry autoCapitalize="none" onSubmitEditing={crear} />
          </View>
          {error ? <Notice tone="down" title="No se pudo crear" body={error} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}>
            <Button label="Cancelar" variant="ghost" onPress={onCerrar} />
            <Button label="Crear cuenta" icon="person-add-outline" onPress={crear} loading={enviando} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ==========================================================================
 * Contraseña temporal: se enseña una vez
 * ======================================================================== */

function PlacaTemporal({ temporal, onCerrar }: { temporal: PasswordTemporal; onCerrar: () => void }) {
  const { colors, space, type, radius, numeric } = useTheme();
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(temporal.password_temporal);
        setCopiada(true);
      }
    } catch {
      setCopiada(false);
    }
  };
  return (
    <Panel level={2} title="Contraseña temporal" legend={`Para ${temporal.usuario.email}`}>
      <View style={{ gap: space.md }}>
        <Text
          selectable
          style={[
            type.title2,
            numeric,
            {
              color: colors.ink,
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              letterSpacing: 1,
              fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
            },
          ]}
        >
          {temporal.password_temporal}
        </Text>
        <Notice
          tone="caution"
          title="Se muestra una sola vez"
          body={`No se guarda en claro y no se puede volver a consultar. Caduca el ${fecha(temporal.expira)}. Entrégala por un canal seguro: al entrar tendrá que cambiarla.`}
        />
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {Platform.OS === 'web' ? (
            <Button label={copiada ? 'Copiada' : 'Copiar'} icon="copy-outline" variant="secondary" onPress={copiar} />
          ) : null}
          <Button label="Ya la he guardado" onPress={onCerrar} />
        </View>
      </View>
    </Panel>
  );
}

/* ==========================================================================
 * Panel
 * ======================================================================== */

export default function PanelUsuarios() {
  const { user, token, esAdmin } = useAuth();
  const { colors, space, type } = useTheme();
  const api = useMemo(() => adminApi(token ?? ''), [token]);

  const [datos, setDatos] = useState<PaginaUsuarios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('todos');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [accion, setAccion] = useState<Accion | null>(null);
  const [alta, setAlta] = useState(false);
  const [temporal, setTemporal] = useState<PasswordTemporal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [auditoria, setAuditoria] = useState<EventoAuditoria[] | null>(null);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);

  const cargar = useCallback(async () => {
    if (!esAdmin) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(
        await api.listar({
          q: consulta || undefined,
          role: filtroRol === 'todos' ? undefined : filtroRol,
          activo: filtroEstado === 'todos' ? undefined : filtroEstado === 'activos',
        }),
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, [api, consulta, filtroRol, filtroEstado, esAdmin]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const verAuditoria = async () => {
    setCargandoAuditoria(true);
    try {
      setAuditoria((await api.auditoria(1)).items);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargandoAuditoria(false);
    }
  };

  const alTerminar = (mensaje: string, t?: PasswordTemporal) => {
    setAccion(null);
    setAlta(false);
    setAviso(mensaje);
    if (t) setTemporal(t);
    void cargar();
    if (auditoria) void verAuditoria();
  };

  if (!esAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.xl }}>
        <EmptyState
          icon="lock-closed-outline"
          title="Sin permiso"
          body="Esta sección es sólo para administradores. Si crees que deberías tener acceso, habla con uno."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.lg }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ gap: space.xxs, flexShrink: 1 }}>
          <Text style={[type.title2, { color: colors.ink }]}>Usuarios</Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            Cuentas, roles y contraseñas. El registro público está cerrado: las cuentas se crean aquí.
          </Text>
        </View>
        <Button label="Nuevo usuario" icon="person-add-outline" onPress={() => setAlta(true)} />
      </View>

      {temporal ? <PlacaTemporal temporal={temporal} onCerrar={() => setTemporal(null)} /> : null}
      {aviso ? <Notice tone="up" title="Hecho" body={aviso} action={<Button size="sm" variant="ghost" label="Cerrar" onPress={() => setAviso(null)} />} /> : null}
      {error ? <Notice tone="down" title="No se pudo cargar" body={error} action={<Button size="sm" variant="secondary" label="Reintentar" onPress={cargar} />} /> : null}

      <Panel level={1}>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={{ flexGrow: 1, flexBasis: 260 }}>
              <Field
                icon="search-outline"
                placeholder="Buscar por email o nombre"
                value={busqueda}
                onChangeText={setBusqueda}
                autoCapitalize="none"
                onSubmitEditing={() => setConsulta(busqueda.trim())}
              />
            </View>
            <Button label="Buscar" variant="secondary" onPress={() => setConsulta(busqueda.trim())} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', alignItems: 'center' }}>
            <Legend>Rol</Legend>
            <Chip texto="Todos" activo={filtroRol === 'todos'} onPress={() => setFiltroRol('todos')} />
            <Chip texto="Administradores" activo={filtroRol === 'admin'} onPress={() => setFiltroRol('admin')} />
            <Chip texto="Usuarios" activo={filtroRol === 'usuario'} onPress={() => setFiltroRol('usuario')} />
            <View style={{ width: space.md }} />
            <Legend>Estado</Legend>
            <Chip texto="Todas" activo={filtroEstado === 'todos'} onPress={() => setFiltroEstado('todos')} />
            <Chip texto="Activas" activo={filtroEstado === 'activos'} onPress={() => setFiltroEstado('activos')} />
            <Chip texto="Desactivadas" activo={filtroEstado === 'inactivos'} onPress={() => setFiltroEstado('inactivos')} />
          </View>

          <Rule />

          {cargando && !datos ? (
            <SkeletonRows rows={5} />
          ) : datos && datos.items.length ? (
            <View>
              <Text style={[type.caption, { color: colors.inkFaint }]}>
                {datos.total} cuenta(s) · {datos.admins_activos} administrador(es) activo(s)
              </Text>
              {datos.items.map((u, i) => (
                <View key={u.id}>
                  {i > 0 ? <Rule /> : null}
                  <FilaUsuario usuario={u} esYo={u.id === user?.id} onAccion={setAccion} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState icon="people-outline" title="Ninguna cuenta coincide" body="Cambia la búsqueda o los filtros." />
          )}
        </View>
      </Panel>

      <Panel
        level={1}
        title="Registro de auditoría"
        legend="Altas, cambios de rol, desactivaciones, contraseñas y accesos"
        action={
          <Button
            size="sm"
            variant="secondary"
            icon="refresh-outline"
            label={auditoria ? 'Actualizar' : 'Ver registro'}
            onPress={verAuditoria}
            loading={cargandoAuditoria}
          />
        }
      >
        {auditoria === null ? (
          <Text style={[type.caption, { color: colors.inkFaint }]}>Pulsa «Ver registro» para cargar los últimos eventos.</Text>
        ) : auditoria.length === 0 ? (
          <Text style={[type.caption, { color: colors.inkFaint }]}>Todavía no hay eventos registrados.</Text>
        ) : (
          <View style={{ gap: space.xs }}>
            {auditoria.map((ev, i) => (
              <View key={ev.id ?? `${ev.ts}-${ev.accion}`} style={{ gap: 2 }}>
                {i > 0 ? <Rule /> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: i > 0 ? space.xs : 0 }}>
                  <Ionicons
                    name={ev.resultado === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                    size={15}
                    color={ev.resultado === 'ok' ? colors.up : colors.down}
                  />
                  <Text style={[type.caption, { color: colors.ink, fontWeight: '600' }]}>
                    {ETIQUETA_ACCION[ev.accion] ?? ev.accion}
                  </Text>
                  <Text style={[type.caption, { color: colors.inkFaint }]}>{fecha(ev.ts)}</Text>
                </View>
                <Text style={[type.caption, { color: colors.inkMuted }]}>
                  {ev.actor_email ?? '—'}
                  {ev.objetivo_email ? ` → ${ev.objetivo_email}` : ''}
                  {ev.motivo ? ` · ${ev.motivo}` : ''}
                  {ev.ip ? ` · ${ev.ip}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Panel>

      {accion ? <DialogoAccion accion={accion} api={api} onCerrar={() => setAccion(null)} onHecho={alTerminar} /> : null}
      {alta ? <DialogoAlta api={api} onCerrar={() => setAlta(false)} onHecho={alTerminar} /> : null}
    </ScrollView>
  );
}
