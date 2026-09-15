"""
================================================================================
Cuentas, roles y sesiones — lógica pura
================================================================================
Todo lo que decide quién puede qué, sin FastAPI ni Mongo: así se prueba con el
pytest local (`server.py` no se importa bien fuera de Docker) y la regla es la
misma en el backend, en `admin_api.py` y en el comando de consola.

Decisiones del usuario (13 sep 2026):
· Dos roles: `admin` y `usuario`. Sin rol declarado = `usuario` (se deniega).
· El registro público queda CERRADO: las cuentas las da de alta un admin.
· El primer admin se crea desde la consola del servidor, nunca desde la web.
· Borrar un usuario desactiva por defecto; el borrado definitivo pide escribir
  su email y dice cuántos datos se pierden.

Sesiones: el JWT lleva `tv` (versión de token). Subir `token_version` en el
usuario invalida al instante todas sus sesiones. Un token antiguo sin `tv` vale
0 y un usuario sin `token_version` también: las sesiones abiertas antes del
cambio siguen valiendo hasta que algo las revoque.
"""

from __future__ import annotations

import re
import secrets
import string
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

ROLES = ("admin", "usuario")
ROL_POR_DEFECTO = "usuario"

# NIST 800-63B pide 8 como mínimo absoluto; 12 es el término medio acordado.
MIN_PASSWORD = 12
# bcrypt ignora en silencio lo que pasa de 72 BYTES. Se rechaza en vez de
# recortar: una contraseña que «funciona» con sólo sus primeros 72 bytes es una
# sorpresa desagradable. Se cuentan bytes, no caracteres (ñ = 2, emoji = 4).
MAX_PASSWORD_BYTES = 72
HORAS_PASSWORD_TEMPORAL = 72

_COMUNES = {
    "123456789012", "1234567890123", "password1234", "passwordpassword", "contraseña123",
    "contrasena123", "qwertyuiopas", "qwerty123456", "abcdefghijkl", "000000000000",
    "111111111111", "administrador", "administrator", "finanalysis2026", "iloveyou1234",
}


# ══════════════════════════════════════════════════════════════════════════════
# Emails y contraseñas
# ══════════════════════════════════════════════════════════════════════════════

def normalizar_email(email: Optional[str]) -> str:
    """El registro de antes buscaba con `.lower()` y guardaba con `.lower().strip()`."""
    return (email or "").strip().lower()


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def email_valido(email: Optional[str]) -> bool:
    return bool(_EMAIL.match(normalizar_email(email)))


def validar_password(password: Optional[str], email: str = "", nombre: str = "") -> Optional[str]:
    """Mensaje de por qué NO vale, o `None` si vale. Sin reglas de composición."""
    if not password:
        return "Falta la contraseña."
    if len(password) < MIN_PASSWORD:
        return f"La contraseña necesita al menos {MIN_PASSWORD} caracteres."
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return (
            f"La contraseña es demasiado larga: como mucho {MAX_PASSWORD_BYTES} bytes "
            "(las letras con tilde y los emoji ocupan más de uno)."
        )
    base = password.strip().lower()
    if base in _COMUNES or len(set(base)) <= 2:
        return "Esa contraseña es demasiado común o repetitiva."
    local = normalizar_email(email).split("@")[0] if email else ""
    if len(local) >= 4 and local in base:
        return "La contraseña no puede contener tu email."
    if nombre and len(nombre.strip()) >= 4 and nombre.strip().lower() in base:
        return "La contraseña no puede contener tu nombre."
    return None


def generar_password_temporal(longitud: int = 16) -> str:
    """Aleatoria criptográfica, sin símbolos ambiguos de transcribir."""
    alfabeto = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alfabeto) for _ in range(longitud))
        if (validar_password(pw) is None and any(c.isdigit() for c in pw)
                and any(c.islower() for c in pw) and any(c.isupper() for c in pw)):
            return pw


# ══════════════════════════════════════════════════════════════════════════════
# Usuarios y sesiones
# ══════════════════════════════════════════════════════════════════════════════

def rol_de(user: Optional[dict]) -> str:
    rol = (user or {}).get("role")
    return rol if rol in ROLES else ROL_POR_DEFECTO


def esta_activo(user: Optional[dict]) -> bool:
    return (user or {}).get("activo", True) is not False


def usuario_publico(user: dict) -> Dict[str, Any]:
    """
    Lo que puede salir hacia el cliente, por LISTA DE PERMITIDOS: un campo nuevo
    del documento (un hash, un token) no se filtra solo por no estar prohibido.
    """
    return {
        "id": user.get("id"),
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        "role": rol_de(user),
        "activo": esta_activo(user),
        "created_at": user.get("created_at"),
        "ultimo_login": user.get("ultimo_login"),
        "debe_cambiar_password": bool(user.get("debe_cambiar_password", False)),
    }


def motivo_token_invalido(payload: dict, user: Optional[dict]) -> Optional[str]:
    """`None` si el token vale. El motivo va al log, nunca al cliente."""
    if not user:
        return "inexistente"
    if not esta_activo(user):
        return "inactivo"
    if int(payload.get("tv", 0) or 0) != int(user.get("token_version", 0) or 0):
        return "version"
    return None


_OPERACIONES = {
    "degradar": "quitar el rol de administrador a",
    "desactivar": "desactivar",
    "borrar": "borrar",
}


def rechazo_por_ultimo_admin(actor_id: str, objetivo: dict, operacion: str, admins_activos: int) -> Optional[str]:
    """
    Motivo para NO permitir la operación, o `None`.

    · Nadie se degrada, desactiva ni borra a sí mismo: tiene que hacerlo otro
      administrador. Evita quedarse fuera por un clic.
    · Nunca se deja la aplicación con cero administradores activos. Uno
      desactivado no cuenta.
    """
    if operacion not in _OPERACIONES:
        raise ValueError(f"operación desconocida: {operacion}")
    if objetivo.get("id") == actor_id:
        return f"No puedes {_OPERACIONES[operacion]} tu propia cuenta: tiene que hacerlo otro administrador."
    if rol_de(objetivo) == "admin" and esta_activo(objetivo) and admins_activos <= 1:
        return "Es el último administrador activo: la aplicación se quedaría sin nadie que pueda gestionarla."
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Auditoría
# ══════════════════════════════════════════════════════════════════════════════

_SENSIBLE = re.compile(r"password|hash|token|secret", re.IGNORECASE)
# Nombres que contienen «password» o «token» pero no son secretos: se conservan.
_PERMITIDOS = {"debe_cambiar_password", "password_cambiada", "password_temporal_expira", "token_version"}


def limpiar_sensible(valor: Any) -> Any:
    """Quita, también en estructuras anidadas, cualquier clave que parezca un secreto."""
    if isinstance(valor, dict):
        return {
            k: limpiar_sensible(v) for k, v in valor.items()
            if str(k) in _PERMITIDOS or not _SENSIBLE.search(str(k))
        }
    if isinstance(valor, (list, tuple)):
        return [limpiar_sensible(v) for v in valor]
    return valor


def ip_de(cabeceras: Dict[str, str], cliente: Optional[str]) -> Optional[str]:
    """Detrás del túnel de Cloudflare la IP real llega en CF-Connecting-IP, no en X-Real-IP."""
    bajas = {str(k).lower(): v for k, v in (cabeceras or {}).items()}
    return bajas.get("cf-connecting-ip") or bajas.get("x-real-ip") or cliente


def evento_auditoria(
    accion: str,
    resultado: str = "ok",
    actor: Any = None,
    objetivo: Optional[dict] = None,
    antes: Optional[dict] = None,
    despues: Optional[dict] = None,
    motivo: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    objetivo_email: Optional[str] = None,
    ahora: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Documento de la colección `auditoria`. Sólo se inserta; nunca se borra desde la web."""
    es_dict = isinstance(actor, dict)
    return limpiar_sensible({
        "id": str(uuid.uuid4()),
        "ts": ahora or datetime.utcnow(),
        "accion": accion,
        "resultado": resultado,
        "actor_id": actor.get("id") if es_dict else None,
        "actor_email": actor.get("email") if es_dict else (actor if isinstance(actor, str) else None),
        "objetivo_id": (objetivo or {}).get("id"),
        "objetivo_email": (objetivo or {}).get("email") or objetivo_email,
        "antes": antes,
        "despues": despues,
        "motivo": motivo,
        "ip": ip,
        "user_agent": (user_agent or "")[:200] or None,
    })


# ══════════════════════════════════════════════════════════════════════════════
# Datos de cada usuario
# ══════════════════════════════════════════════════════════════════════════════

# (colección, campo con el id del usuario). Lo que se borra con la cuenta.
PLAN_BORRADO: List[tuple] = [
    ("portfolio", "user_id"),
    ("cash_movements", "user_id"),
    ("watchlist", "user_id"),
    ("sim_cuentas", "_id"),
    ("sim_decisiones", "user_id"),
    ("sim_senales_vistas", "user_id"),
    ("sim_archivo", "user_id"),
]

# Compartidas por toda la aplicación: no se tocan al borrar una cuenta.
COLECCIONES_GLOBALES = {"analyses", "overton_scores", "traducciones", "sim_contadores", "users", "auditoria"}


# ══════════════════════════════════════════════════════════════════════════════
# Intentos de acceso
# ══════════════════════════════════════════════════════════════════════════════

class LimitadorIntentos:
    """
    `maximo` fallos por clave (el email) en `ventana_s` segundos → espera.

    Es un retraso temporal y no un bloqueo permanente: si no, cualquiera podría
    dejar fuera al administrador a propósito equivocándose cinco veces con su
    email. El reloj se inyecta para poder probarlo sin esperar.
    """

    def __init__(self, maximo: int = 5, ventana_s: float = 900, reloj: Callable[[], float] = time.monotonic):
        self.maximo = maximo
        self.ventana = ventana_s
        self.reloj = reloj
        self._fallos: Dict[str, List[float]] = {}

    def _vigentes(self, clave: str) -> List[float]:
        ahora = self.reloj()
        lista = [t for t in self._fallos.get(clave, []) if ahora - t < self.ventana]
        if lista:
            self._fallos[clave] = lista
        else:
            self._fallos.pop(clave, None)
        return lista

    def registrar_fallo(self, clave: str) -> None:
        self._vigentes(clave)
        self._fallos.setdefault(clave, []).append(self.reloj())

    def segundos_de_espera(self, clave: str) -> int:
        lista = self._vigentes(clave)
        if len(lista) < self.maximo:
            return 0
        return max(1, int(self.ventana - (self.reloj() - lista[-self.maximo])))

    def limpiar(self, clave: str) -> None:
        self._fallos.pop(clave, None)
