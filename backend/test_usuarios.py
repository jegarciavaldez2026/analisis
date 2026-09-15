"""
Pruebas de usuarios.py — sin FastAPI ni Mongo.

    cd backend && python -m pytest test_usuarios.py -q
"""
from __future__ import annotations

import os
import re

import usuarios as U


# ── Contraseñas ───────────────────────────────────────────────────────────────

def test_longitud_minima():
    assert U.validar_password("Abcdefghij1") is not None      # 11
    assert U.validar_password("Abcdefghij12") is None         # 12


def test_se_cuentan_bytes_y_no_caracteres():
    """Contraprueba: una política que contara caracteres aceptaría los emoji."""
    frase = "canción-ñandú-pingüino-acción-sueño"                        # 35 caracteres, 43 bytes
    assert len(frase.encode("utf-8")) > len(frase) and U.validar_password(frase) is None
    emoji = "🔒" * 25                                                   # 100 bytes, 25 caracteres
    assert len(emoji) < 72 and U.validar_password(emoji) is not None


def test_comunes_repetitivas_email_y_nombre():
    assert U.validar_password("password1234") is not None
    assert U.validar_password("aaaaaaaaaaaaaa") is not None
    assert U.validar_password("mariagarcia2026", email="MariaGarcia@x.com") is not None
    assert U.validar_password("soyroberto-bolsa", nombre="Roberto") is not None
    assert U.validar_password("cafe-lento-azul-9", email="ana@x.com", nombre="Ana") is None


def test_password_temporal_cumple_y_no_se_repite():
    a, b = U.generar_password_temporal(), U.generar_password_temporal()
    assert U.validar_password(a) is None and a != b and len(a) == 16


def test_normalizar_email():
    assert U.normalizar_email("  A@B.com ") == "a@b.com"
    # Contraprueba del registro de antes: buscaba sólo con .lower()
    assert "  A@B.com ".lower() != U.normalizar_email("  A@B.com ")
    assert U.email_valido("ana@x.com") and not U.email_valido("ana@x")


# ── Sesiones y roles ──────────────────────────────────────────────────────────

def test_tokens_anteriores_siguen_valiendo_hasta_revocar():
    assert U.motivo_token_invalido({"sub": "1"}, {"id": "1"}) is None
    assert U.motivo_token_invalido({"sub": "1", "tv": 0}, {"id": "1", "token_version": 1}) == "version"
    assert U.motivo_token_invalido({"sub": "1", "tv": 2}, {"id": "1", "token_version": 2}) is None


def test_inactivo_e_inexistente():
    assert U.motivo_token_invalido({"sub": "1"}, {"id": "1", "activo": False}) == "inactivo"
    assert U.motivo_token_invalido({"sub": "1"}, None) == "inexistente"


def test_sin_rol_no_es_admin():
    assert U.rol_de({"id": "1"}) == "usuario"
    assert U.rol_de({"role": "superusuario"}) == "usuario"
    assert U.rol_de({"role": "admin"}) == "admin"


def test_usuario_publico_por_lista_de_permitidos():
    doc = {"id": "1", "email": "a@b.c", "name": "A", "password": "$2b$hash", "password_temporal_hash": "x",
           "token_version": 3, "role": "admin"}
    publico = U.usuario_publico(doc)
    assert "password" not in publico and "password_temporal_hash" not in publico and "token_version" not in publico
    # Contraprueba: prohibir sólo «password» dejaría pasar el campo nuevo
    assert "password_temporal_hash" in {k: v for k, v in doc.items() if k != "password"}


# ── Último administrador ─────────────────────────────────────────────────────

def test_nadie_se_degrada_ni_se_borra_a_si_mismo():
    yo = {"id": "a", "role": "admin"}
    for op in ("degradar", "desactivar", "borrar"):
        assert "propia cuenta" in U.rechazo_por_ultimo_admin("a", yo, op, admins_activos=3)


def test_con_dos_admins_se_puede_degradar_a_otro():
    assert U.rechazo_por_ultimo_admin("a", {"id": "b", "role": "admin"}, "degradar", admins_activos=2) is None


def test_el_desactivado_no_cuenta_como_admin():
    """Hay otro admin, pero desactivado: el recuento de activos es 1."""
    assert "último administrador" in U.rechazo_por_ultimo_admin(
        "cli", {"id": "b", "role": "admin"}, "desactivar", admins_activos=1)


def test_un_usuario_normal_se_borra_sin_restriccion():
    assert U.rechazo_por_ultimo_admin("a", {"id": "c", "role": "usuario"}, "borrar", admins_activos=1) is None


# ── Auditoría ─────────────────────────────────────────────────────────────────

def test_la_auditoria_no_guarda_secretos_ni_anidados():
    ev = U.evento_auditoria(
        "usuario_creado", actor={"id": "a", "email": "admin@x.com", "password": "h"},
        objetivo={"id": "b", "email": "b@x.com"},
        despues={"role": "usuario", "password_temporal": "Abc123", "extra": {"token": "t", "hash": "h", "ok": 1}},
    )
    texto = repr(ev)
    assert "Abc123" not in texto and "'token'" not in texto and "'hash'" not in texto
    assert ev["despues"]["extra"] == {"ok": 1}
    assert ev["actor_email"] == "admin@x.com" and ev["objetivo_email"] == "b@x.com"
    assert U.limpiar_sensible({"debe_cambiar_password": True}) == {"debe_cambiar_password": True}


def test_ip_detras_del_tunel():
    assert U.ip_de({"CF-Connecting-IP": "1.2.3.4", "X-Real-IP": "172.18.0.5"}, "172.18.0.5") == "1.2.3.4"
    assert U.ip_de({"x-real-ip": "10.0.0.2"}, "172.18.0.5") == "10.0.0.2"


# ── Intentos ──────────────────────────────────────────────────────────────────

def test_limitador_de_intentos():
    reloj = [1000.0]
    lim = U.LimitadorIntentos(maximo=5, ventana_s=900, reloj=lambda: reloj[0])
    for _ in range(4):
        lim.registrar_fallo("a@x.com")
    assert lim.segundos_de_espera("a@x.com") == 0
    lim.registrar_fallo("a@x.com")
    assert lim.segundos_de_espera("a@x.com") > 0
    assert lim.segundos_de_espera("otro@x.com") == 0
    reloj[0] += 901
    assert lim.segundos_de_espera("a@x.com") == 0


# ── Inventario de colecciones ────────────────────────────────────────────────

def test_toda_coleccion_de_server_esta_clasificada():
    """
    La próxima colección con datos de un usuario no puede quedar huérfana al
    borrar una cuenta sin que nadie lo decida: si aparece una sin clasificar,
    esta prueba falla.
    """
    ruta = os.path.join(os.path.dirname(__file__), "server.py")
    texto = open(ruta, encoding="utf-8").read()
    usadas = set(re.findall(r"\bdb\.([a-z_][a-z0-9_]*)\.", texto)) | set(re.findall(r"\bdb\[\"([a-z_]+)\"\]", texto))
    clasificadas = {c for c, _ in U.PLAN_BORRADO} | U.COLECCIONES_GLOBALES
    sin_clasificar = sorted(usadas - clasificadas)
    assert not sin_clasificar, f"Colecciones sin clasificar en usuarios.py: {sin_clasificar}"
