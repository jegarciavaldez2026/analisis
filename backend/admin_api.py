"""
================================================================================
API de administración de usuarios
================================================================================
Una fábrica de router y no endpoints sueltos en `server.py`: la lógica vive
aquí y en `usuarios.py`, y `server.py` sólo la engancha con dos líneas.
Sin `prefix=` en el `APIRouter`: con el FastAPI local revienta (CLAUDE.md).

Todas las rutas exigen `require_admin`. Las destructivas piden además la
contraseña del propio administrador: un token de admin robado no basta para
borrar cuentas.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo.errors import DuplicateKeyError

import usuarios as U

Rol = Literal["admin", "usuario"]


class UsuarioAdmin(BaseModel):
    id: str
    email: str
    name: str
    role: Rol
    activo: bool
    created_at: Optional[datetime] = None
    ultimo_login: Optional[datetime] = None
    debe_cambiar_password: bool = False


class PaginaUsuarios(BaseModel):
    items: List[UsuarioAdmin]
    total: int
    pagina: int
    por_pagina: int
    admins_activos: int


class DetalleUsuario(BaseModel):
    usuario: UsuarioAdmin
    # Documentos de ese usuario en cada colección: lo que se perdería al borrar.
    datos: Dict[str, int]


class Reautenticacion(BaseModel):
    password_admin: str = Field(min_length=1, max_length=256)


class CrearUsuario(Reautenticacion):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    role: Rol = "usuario"


class CambiarRol(Reautenticacion):
    role: Rol


class CambiarEstado(Reautenticacion):
    activo: bool
    motivo: Optional[str] = Field(None, max_length=200)


class BorrarUsuario(Reautenticacion):
    confirmar_email: str


class PasswordTemporal(BaseModel):
    """Se muestra UNA vez. En la base sólo queda su hash."""
    usuario: UsuarioAdmin
    password_temporal: str
    expira: datetime


class EventoAuditoria(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = None
    ts: Optional[datetime] = None
    accion: str
    resultado: str = "ok"
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    objetivo_id: Optional[str] = None
    objetivo_email: Optional[str] = None
    antes: Optional[Dict[str, Any]] = None
    despues: Optional[Dict[str, Any]] = None
    motivo: Optional[str] = None
    ip: Optional[str] = None


class PaginaAuditoria(BaseModel):
    items: List[EventoAuditoria]
    total: int
    pagina: int
    por_pagina: int


def crear_router(
    db,
    *,
    require_admin: Callable,
    verify_password: Callable[[str, str], bool],
    hash_password: Callable[[str], str],
    al_borrar_usuario: Optional[Callable[[str], None]] = None,
) -> APIRouter:
    router = APIRouter()

    async def auditar(request: Request, accion: str, resultado: str = "ok", **datos) -> None:
        try:
            evento = U.evento_auditoria(
                accion, resultado,
                ip=U.ip_de(dict(request.headers), request.client.host if request.client else None),
                user_agent=request.headers.get("user-agent"),
                **datos,
            )
            await db.auditoria.insert_one(evento)
        except Exception as e:  # noqa: BLE001 — la auditoría no puede tumbar la acción ya hecha
            logging.warning(f"Auditoría no registrada ({accion}): {e}")

    async def reautenticar(request: Request, admin: dict, password_admin: str, accion: str) -> None:
        if not verify_password(password_admin, admin.get("password", "")):
            await auditar(request, accion, "denegado", actor=admin, motivo="contraseña de administrador incorrecta")
            raise HTTPException(status_code=403, detail="La contraseña de administrador no es correcta.")

    async def cargar(user_id: str) -> dict:
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        return user

    async def admins_activos() -> int:
        return await db.users.count_documents({"role": "admin", "activo": {"$ne": False}})

    def publico(user: dict) -> UsuarioAdmin:
        return UsuarioAdmin(**U.usuario_publico(user))

    async def denegar(request: Request, accion: str, admin: dict, objetivo: dict, motivo: str, codigo: int = 409):
        await auditar(request, accion, "denegado", actor=admin, objetivo=objetivo, motivo=motivo)
        raise HTTPException(status_code=codigo, detail=motivo)

    # ── Consulta ──────────────────────────────────────────────────────────────

    @router.get("/admin/users", response_model=PaginaUsuarios)
    async def listar_usuarios(
        q: Optional[str] = None,
        role: Optional[Rol] = None,
        activo: Optional[bool] = None,
        pagina: int = Query(1, ge=1),
        por_pagina: int = Query(50, ge=1, le=200),
        admin: dict = Depends(require_admin),
    ):
        filtro: Dict[str, Any] = {}
        if q and q.strip():
            patron = re.escape(q.strip())
            filtro["$or"] = [{"email": {"$regex": patron, "$options": "i"}},
                             {"name": {"$regex": patron, "$options": "i"}}]
        if role == "admin":
            filtro["role"] = "admin"
        elif role == "usuario":
            filtro["role"] = {"$ne": "admin"}
        if activo is True:
            filtro["activo"] = {"$ne": False}
        elif activo is False:
            filtro["activo"] = False
        total = await db.users.count_documents(filtro)
        cursor = (db.users.find(filtro, {"_id": 0, "password": 0})
                  .sort("created_at", 1).skip((pagina - 1) * por_pagina).limit(por_pagina))
        items = [publico(u) async for u in cursor]
        return PaginaUsuarios(items=items, total=total, pagina=pagina, por_pagina=por_pagina,
                              admins_activos=await admins_activos())

    @router.get("/admin/users/{user_id}", response_model=DetalleUsuario)
    async def detalle_usuario(user_id: str, admin: dict = Depends(require_admin)):
        user = await cargar(user_id)
        datos = {col: await db[col].count_documents({campo: user_id}) for col, campo in U.PLAN_BORRADO}
        return DetalleUsuario(usuario=publico(user), datos=datos)

    # ── Alta ──────────────────────────────────────────────────────────────────

    @router.post("/admin/users", response_model=PasswordTemporal, status_code=201)
    async def crear_usuario(body: CrearUsuario, request: Request, admin: dict = Depends(require_admin)):
        await reautenticar(request, admin, body.password_admin, "usuario_creado")
        email = U.normalizar_email(body.email)
        if await db.users.find_one({"email": email}, {"_id": 1}):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email.")
        temporal = U.generar_password_temporal()
        ahora = datetime.utcnow()
        expira = ahora + timedelta(hours=U.HORAS_PASSWORD_TEMPORAL)
        user = {
            "id": str(uuid.uuid4()), "email": email, "name": body.name.strip(),
            "password": hash_password(temporal), "created_at": ahora,
            "role": body.role, "activo": True, "token_version": 0,
            "debe_cambiar_password": True, "password_temporal_expira": expira,
            "creado_por": admin.get("id"),
        }
        try:
            await db.users.insert_one(user)
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email.")
        user.pop("_id", None)
        await auditar(request, "usuario_creado", actor=admin, objetivo=user, despues={"role": body.role})
        return PasswordTemporal(usuario=publico(user), password_temporal=temporal, expira=expira)

    # ── Rol y estado ──────────────────────────────────────────────────────────

    @router.patch("/admin/users/{user_id}/role", response_model=UsuarioAdmin)
    async def cambiar_rol(user_id: str, body: CambiarRol, request: Request, admin: dict = Depends(require_admin)):
        await reautenticar(request, admin, body.password_admin, "rol_cambiado")
        objetivo = await cargar(user_id)
        antes = U.rol_de(objetivo)
        if antes == body.role:
            return publico(objetivo)
        if body.role == "usuario":
            motivo = U.rechazo_por_ultimo_admin(admin["id"], objetivo, "degradar", await admins_activos())
            if motivo:
                await denegar(request, "rol_cambiado", admin, objetivo, motivo)
        # Condicional sobre el rol leído: si otro admin lo cambió a la vez, no se pisa.
        r = await db.users.update_one({"id": user_id, "role": objetivo.get("role")},
                                      {"$set": {"role": body.role}, "$inc": {"token_version": 1}})
        if r.matched_count == 0:
            raise HTTPException(status_code=409, detail="La cuenta cambió mientras tanto. Recarga y vuelve a intentarlo.")
        if body.role == "usuario" and await admins_activos() == 0:
            # Dos degradaciones simultáneas pueden pasar las dos la comprobación previa.
            await db.users.update_one({"id": user_id}, {"$set": {"role": "admin"}})
            await denegar(request, "rol_cambiado", admin, objetivo,
                          "Es el último administrador activo: la aplicación se quedaría sin nadie que pueda gestionarla.")
        await auditar(request, "rol_cambiado", actor=admin, objetivo=objetivo,
                      antes={"role": antes}, despues={"role": body.role})
        return publico(await cargar(user_id))

    @router.patch("/admin/users/{user_id}/estado", response_model=UsuarioAdmin)
    async def cambiar_estado(user_id: str, body: CambiarEstado, request: Request, admin: dict = Depends(require_admin)):
        accion = "usuario_reactivado" if body.activo else "usuario_desactivado"
        await reautenticar(request, admin, body.password_admin, accion)
        objetivo = await cargar(user_id)
        if not body.activo:
            motivo = U.rechazo_por_ultimo_admin(admin["id"], objetivo, "desactivar", await admins_activos())
            if motivo:
                await denegar(request, accion, admin, objetivo, motivo)
        # Reactivar también sube la versión: los tokens de antes de desactivar no resucitan.
        await db.users.update_one({"id": user_id}, {
            "$set": {"activo": body.activo, "estado_motivo": body.motivo, "estado_cambiado": datetime.utcnow()},
            "$inc": {"token_version": 1},
        })
        if not body.activo and await admins_activos() == 0:
            await db.users.update_one({"id": user_id}, {"$set": {"activo": True}})
            await denegar(request, accion, admin, objetivo,
                          "Es el último administrador activo: la aplicación se quedaría sin nadie que pueda gestionarla.")
        await auditar(request, accion, actor=admin, objetivo=objetivo, motivo=body.motivo,
                      antes={"activo": U.esta_activo(objetivo)}, despues={"activo": body.activo})
        return publico(await cargar(user_id))

    # ── Contraseñas y sesiones ────────────────────────────────────────────────

    @router.post("/admin/users/{user_id}/password-temporal", response_model=PasswordTemporal)
    async def password_temporal(user_id: str, body: Reautenticacion, request: Request, admin: dict = Depends(require_admin)):
        await reautenticar(request, admin, body.password_admin, "password_temporal_emitida")
        objetivo = await cargar(user_id)
        if objetivo.get("id") == admin.get("id"):
            raise HTTPException(status_code=400, detail="Para tu propia cuenta usa «Cambiar contraseña».")
        temporal = U.generar_password_temporal()
        expira = datetime.utcnow() + timedelta(hours=U.HORAS_PASSWORD_TEMPORAL)
        await db.users.update_one({"id": user_id}, {
            "$set": {"password": hash_password(temporal), "debe_cambiar_password": True,
                     "password_temporal_expira": expira},
            "$inc": {"token_version": 1},
        })
        await auditar(request, "password_temporal_emitida", actor=admin, objetivo=objetivo)
        return PasswordTemporal(usuario=publico(await cargar(user_id)), password_temporal=temporal, expira=expira)

    @router.post("/admin/users/{user_id}/revocar-sesiones", response_model=UsuarioAdmin)
    async def revocar_sesiones(user_id: str, request: Request, admin: dict = Depends(require_admin)):
        objetivo = await cargar(user_id)
        if objetivo.get("id") == admin.get("id"):
            raise HTTPException(status_code=400,
                                detail="Para tus propias sesiones usa «Cerrar sesión en todos los dispositivos».")
        await db.users.update_one({"id": user_id}, {"$inc": {"token_version": 1}})
        await auditar(request, "sesiones_revocadas", actor=admin, objetivo=objetivo)
        return publico(await cargar(user_id))

    # ── Borrado definitivo ────────────────────────────────────────────────────

    @router.post("/admin/users/{user_id}/borrar")
    async def borrar_usuario(user_id: str, body: BorrarUsuario, request: Request, admin: dict = Depends(require_admin)):
        await reautenticar(request, admin, body.password_admin, "usuario_borrado")
        objetivo = await cargar(user_id)
        if U.normalizar_email(body.confirmar_email) != U.normalizar_email(objetivo.get("email")):
            raise HTTPException(status_code=400, detail="El email escrito no coincide con el de la cuenta.")
        motivo = U.rechazo_por_ultimo_admin(admin["id"], objetivo, "borrar", await admins_activos())
        if motivo:
            await denegar(request, "usuario_borrado", admin, objetivo, motivo)
        # Mongo va sin réplica: no hay transacciones. Pasos idempotentes, en este
        # orden, para que un reintento termine lo que un fallo dejó a medias.
        await db.users.update_one({"id": user_id},
                                  {"$set": {"activo": False, "borrando": True}, "$inc": {"token_version": 1}})
        borrados: Dict[str, int] = {}
        for coleccion, campo in U.PLAN_BORRADO:
            r = await db[coleccion].delete_many({campo: user_id})
            borrados[coleccion] = r.deleted_count
        await db.users.delete_one({"id": user_id})
        if al_borrar_usuario:
            try:
                al_borrar_usuario(user_id)
            except Exception as e:  # noqa: BLE001
                logging.warning(f"Limpieza en memoria tras borrar {user_id}: {e}")
        await auditar(request, "usuario_borrado", actor=admin, objetivo=objetivo, despues={"borrados": borrados})
        return {"borrados": borrados}

    # ── Auditoría ─────────────────────────────────────────────────────────────

    @router.get("/admin/auditoria", response_model=PaginaAuditoria)
    async def listar_auditoria(
        pagina: int = Query(1, ge=1),
        por_pagina: int = Query(50, ge=1, le=200),
        accion: Optional[str] = None,
        objetivo_id: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        filtro: Dict[str, Any] = {}
        if accion:
            filtro["accion"] = accion
        if objetivo_id:
            filtro["objetivo_id"] = objetivo_id
        total = await db.auditoria.count_documents(filtro)
        cursor = db.auditoria.find(filtro, {"_id": 0}).sort("ts", -1).skip((pagina - 1) * por_pagina).limit(por_pagina)
        items = [EventoAuditoria(**e) async for e in cursor]
        return PaginaAuditoria(items=items, total=total, pagina=pagina, por_pagina=por_pagina)

    return router
