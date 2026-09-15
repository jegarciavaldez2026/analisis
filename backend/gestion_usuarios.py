"""
================================================================================
Gestión de cuentas desde la consola del servidor
================================================================================
Lo que no puede hacerse desde la web: preparar la base y crear el PRIMER
administrador. Sólo lo ejecuta quien ya controla el servidor, así que no deja
ninguna puerta abierta en la aplicación.

    docker exec -it analisis_backend python gestion_usuarios.py migrar
    docker exec -it analisis_backend python gestion_usuarios.py crear-admin --email tu@email.com --nombre "Tu nombre"
    docker exec -it analisis_backend python gestion_usuarios.py promover --email alguien@email.com
    docker exec -it analisis_backend python gestion_usuarios.py degradar --email alguien@email.com
    docker exec -it analisis_backend python gestion_usuarios.py listar

`crear-admin` pide la contraseña en la terminal (no se ve al escribir y no
queda en el historial de la consola). Si el email ya tiene cuenta, sólo le da
el rol de administrador.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
import uuid
from datetime import datetime

from passlib.context import CryptContext
from pymongo import ASCENDING, DESCENDING, MongoClient

import usuarios as U

# El mismo esquema que `server.py`: si no, las contraseñas creadas aquí no validarían allí.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def conectar():
    url = os.environ.get("MONGO_URL", "mongodb://mongo:27017")
    nombre = os.environ.get("DB_NAME", "analisis_db")
    return MongoClient(url, serverSelectionTimeoutMS=5000)[nombre]


def auditar(db, accion: str, objetivo: dict, **datos) -> None:
    db.auditoria.insert_one(U.evento_auditoria(accion, actor="cli", objetivo=objetivo, **datos))


def admins_activos(db) -> int:
    return db.users.count_documents({"role": "admin", "activo": {"$ne": False}})


def migrar(db) -> int:
    """Rellena los campos nuevos que falten y crea los índices. Se puede repetir."""
    faltan = {"role": U.ROL_POR_DEFECTO, "activo": True, "token_version": 0, "debe_cambiar_password": False}
    for campo, valor in faltan.items():
        r = db.users.update_many({campo: {"$exists": False}}, {"$set": {campo: valor}})
        print(f"  {campo}: {r.modified_count} cuenta(s) actualizada(s)")

    normalizados = 0
    for u in db.users.find({}, {"_id": 1, "email": 1}):
        normal = U.normalizar_email(u.get("email"))
        if normal != u.get("email"):
            db.users.update_one({"_id": u["_id"]}, {"$set": {"email": normal}})
            normalizados += 1
    print(f"  emails normalizados: {normalizados}")

    repetidos = list(db.users.aggregate([
        {"$group": {"_id": "$email", "n": {"$sum": 1}}}, {"$match": {"n": {"$gt": 1}}},
    ]))
    if repetidos:
        print("  NO se crea el índice único: hay emails repetidos:", [d["_id"] for d in repetidos])
        return 1
    db.users.create_index([("email", ASCENDING)], unique=True, name="email_unico")
    db.users.create_index([("id", ASCENDING)], unique=True, name="id_unico")
    db.auditoria.create_index([("ts", DESCENDING)], name="ts_desc")
    print("  índices creados: email único, id único, auditoría por fecha")
    return 0


def _pedir_password(email: str, nombre: str) -> str:
    while True:
        pw = getpass.getpass(f"Contraseña para {email} (mínimo {U.MIN_PASSWORD} caracteres): ")
        error = U.validar_password(pw, email, nombre)
        if error:
            print(" ", error)
            continue
        if getpass.getpass("Repítela: ") != pw:
            print("  No coinciden. Otra vez.")
            continue
        return pw


def crear_admin(db, email: str, nombre: str) -> int:
    email = U.normalizar_email(email)
    if not U.email_valido(email):
        print(f"  «{email}» no parece un email.")
        return 1
    existente = db.users.find_one({"email": email})
    if existente:
        antes = U.rol_de(existente)
        db.users.update_one({"_id": existente["_id"]},
                            {"$set": {"role": "admin", "activo": True}, "$inc": {"token_version": 1}})
        auditar(db, "admin_promovido_cli", existente, antes={"role": antes}, despues={"role": "admin"})
        print(f"  {email} ya tenía cuenta: ahora es administrador. Sus sesiones abiertas se han cerrado.")
        return 0
    nombre = (nombre or "").strip() or input("Nombre: ").strip() or email.split("@")[0]
    password = _pedir_password(email, nombre)
    ahora = datetime.utcnow()
    user = {
        "id": str(uuid.uuid4()), "email": email, "name": nombre,
        "password": pwd_context.hash(password), "created_at": ahora,
        "role": "admin", "activo": True, "token_version": 0,
        "debe_cambiar_password": False, "password_cambiada": ahora,
    }
    db.users.insert_one(user)
    auditar(db, "admin_creado_cli", user, despues={"role": "admin"})
    print(f"  Cuenta de administrador creada para {email}. Ya puedes entrar en la aplicación.")
    return 0


def promover(db, email: str) -> int:
    user = db.users.find_one({"email": U.normalizar_email(email)})
    if not user:
        print("  No existe ninguna cuenta con ese email.")
        return 1
    antes = U.rol_de(user)
    db.users.update_one({"_id": user["_id"]}, {"$set": {"role": "admin"}, "$inc": {"token_version": 1}})
    auditar(db, "admin_promovido_cli", user, antes={"role": antes}, despues={"role": "admin"})
    print(f"  {user['email']} ahora es administrador.")
    return 0


def degradar(db, email: str) -> int:
    user = db.users.find_one({"email": U.normalizar_email(email)})
    if not user:
        print("  No existe ninguna cuenta con ese email.")
        return 1
    motivo = U.rechazo_por_ultimo_admin("cli", user, "degradar", admins_activos(db))
    if motivo:
        print(" ", motivo)
        return 1
    db.users.update_one({"_id": user["_id"]}, {"$set": {"role": "usuario"}, "$inc": {"token_version": 1}})
    auditar(db, "admin_degradado_cli", user, antes={"role": U.rol_de(user)}, despues={"role": "usuario"})
    print(f"  {user['email']} ya no es administrador.")
    return 0


def listar(db) -> int:
    for u in db.users.find({}, {"_id": 0, "email": 1, "name": 1, "role": 1, "activo": 1}).sort("email", 1):
        estado = "activo" if U.esta_activo(u) else "DESACTIVADO"
        print(f"  {U.rol_de(u):8s} {estado:11s} {u.get('email')}  ({u.get('name', '')})")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Gestión de cuentas de Fundamentor desde la consola del servidor.")
    sub = p.add_subparsers(dest="orden", required=True)
    sub.add_parser("migrar", help="Rellena campos nuevos y crea índices")
    c = sub.add_parser("crear-admin", help="Crea el administrador (o promueve si ya existe)")
    c.add_argument("--email", required=True)
    c.add_argument("--nombre", default="")
    for orden in ("promover", "degradar"):
        s = sub.add_parser(orden)
        s.add_argument("--email", required=True)
    sub.add_parser("listar", help="Cuentas con su rol y estado (sin contraseñas)")
    args = p.parse_args(argv)

    db = conectar()
    if args.orden == "migrar":
        return migrar(db)
    if args.orden == "crear-admin":
        migrar(db)
        return crear_admin(db, args.email, args.nombre)
    if args.orden == "promover":
        return promover(db, args.email)
    if args.orden == "degradar":
        return degradar(db, args.email)
    return listar(db)


if __name__ == "__main__":
    sys.exit(main())
