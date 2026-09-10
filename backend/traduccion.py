"""
================================================================================
Traducción de textos al español con el modelo local
================================================================================
Traduce titulares y resúmenes de noticias usando el Qwen3-1.7B que ya está
cargado en `server.py`. Tres decisiones que hacen que esto sea viable:

1. **Se reutiliza el singleton `get_llm_model()`.** El modelo pesa 1,1 GB; una
   segunda instancia duplicaría la memoria para nada.

2. **Caché en Mongo con el hash del original como clave.** Sin caché esto no
   sale: son 1-2 s por titular y quince titulares por pantalla, así que la
   primera carga tardaría medio minuto. Con caché, sólo se paga una vez por
   texto y todos los usuarios comparten el resultado.

3. **Si algo falla, se devuelve el original.** Nunca un hueco, nunca una
   cadena vacía. Una noticia en inglés se lee; una noticia en blanco no.

Riesgo asumido y declarado: 1,7 B es un modelo pequeño y la jerga financiera
—«beat estimates», «guidance», «downgrade»— puede salir regular. Por eso la
respuesta marca `traducido: true`, para que la interfaz pueda avisar de que es
una traducción automática y nadie la lea como cita literal. Si la calidad no
convence, cambiar a DeepL o Gemini toca sólo el cuerpo de `_traducir_uno()`;
`litellm` ya está instalado.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import threading
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# El contexto de llama.cpp NO admite `create_chat_completion` concurrente: dos
# hilos decodificando a la vez corrompen el KV-cache y abortan el proceso
# entero con un GGML_ASSERT (visto en producción como reinicios en bucle del
# backend, que dejaban toda la pantalla de Estrategia en «sin fuente»). El
# semáforo de abajo limita CUÁNTAS traducciones están en vuelo, pero no obliga
# a que sus llamadas al modelo sean secuenciales entre sí — y tampoco cubre la
# llamada directa que hace `LlmChat.send_message` en `server.py`. Este lock es
# el único punto que de verdad serializa el acceso al modelo compartido, y lo
# usan ambos sitios.
LOCK_LLM = threading.Lock()

# El resumen largo desborda el contexto y además no aporta: la primera parte
# de una noticia financiera lleva el dato. Se recorta antes de traducir.
MAX_CARACTERES = 400

# Un titular corto no necesita modelo si ya está en español.
_PALABRAS_INGLESAS = re.compile(
    r"\b(the|and|for|with|from|after|before|says|said|report|reports|earnings|"
    r"stock|shares|market|price|target|beat|beats|miss|misses|guidance|"
    r"upgrade|downgrade|quarter|revenue|profit|loss|deal|buy|sell|rise|fall)\b",
    re.IGNORECASE,
)

_COLECCION = "traducciones"


def _clave(texto: str, destino: str) -> str:
    """Hash del original. Es la clave de caché y no depende de la fecha."""
    return hashlib.sha256(f"{destino}::{texto}".encode("utf-8")).hexdigest()


def parece_ingles(texto: str) -> bool:
    """
    Heurística barata para no gastar el modelo en textos que ya están en
    español. Prefiere el falso negativo: si duda, traduce.
    """
    if not texto or len(texto.strip()) < 12:
        return False
    return bool(_PALABRAS_INGLESAS.search(texto))


def _limpiar_respuesta(bruto: str, original: str) -> str:
    """
    Qwen tiende a añadir preámbulos («Aquí está la traducción:»), comillas y
    bloques de razonamiento `<think>`. Se recortan aquí en vez de confiar en
    que el prompt baste, porque a 1,7 B no basta siempre.
    """
    if not bruto:
        return original

    texto = bruto.strip()

    # Qwen3 puede emitir razonamiento entre etiquetas. Fuera.
    texto = re.sub(r"<think>.*?</think>", "", texto, flags=re.DOTALL | re.IGNORECASE)

    # Preámbulos típicos, con o sin dos puntos.
    texto = re.sub(
        r"^\s*(aqu[ií] (est[áa]|tienes) la traducci[óo]n|traducci[óo]n|traducido)\s*:?\s*",
        "",
        texto,
        flags=re.IGNORECASE,
    )

    texto = texto.strip().strip('"').strip("'").strip()

    # Si el modelo se ha ido por las ramas y devuelve un párrafo tres veces más
    # largo que el original, es que no ha traducido: ha comentado.
    if not texto or len(texto) > max(120, len(original) * 3):
        return original
    return texto


def _traducir_uno(modelo, texto: str, destino: str = "es") -> str:
    """
    Una llamada al modelo. Temperatura baja porque traducir no es una tarea
    creativa: se quiere la misma salida para la misma entrada.
    """
    recortado = texto.strip()[:MAX_CARACTERES]
    idioma = {"es": "español", "en": "inglés"}.get(destino, destino)

    prompt = (
        f"Traduce al {idioma} el siguiente titular o resumen financiero.\n"
        f"Devuelve ÚNICAMENTE la traducción, sin comillas, sin explicaciones y "
        f"sin repetir el original.\n"
        f"Mantén los nombres propios, los tickers y las cifras tal cual.\n\n"
        f"Texto: {recortado}"
    )

    try:
        import time as _time
        _t0 = _time.monotonic()
        with LOCK_LLM:
            _espera = _time.monotonic() - _t0
            _t1 = _time.monotonic()
            respuesta = modelo.create_chat_completion(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Eres un traductor financiero. Traduces con precisión y "
                            "no añades ningún comentario."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=320,
                temperature=0.1,
                top_p=0.9,
                repeat_penalty=1.05,
            )
        _decode_s = _time.monotonic() - _t1
        logger.warning(
            "TIMING traduccion: espera_lock=%.1fs decode=%.1fs texto=%r",
            _espera, _decode_s, texto[:40],
        )
        bruto = respuesta["choices"][0]["message"]["content"]
        return _limpiar_respuesta(bruto, texto)
    except Exception as e:  # noqa: BLE001 — una traducción no puede tumbar la petición
        logger.warning("Traducción fallida: %s", e)
        return texto


async def traducir(
    db,
    obtener_modelo,
    texto: Optional[str],
    destino: str = "es",
) -> Dict[str, Any]:
    """
    Traduce un texto. Devuelve siempre algo utilizable.

    Returns:
        ``{"texto": str, "traducido": bool, "idioma_original": str|None}``
        `traducido=False` significa que se está devolviendo el original, ya sea
        porque ya estaba en español, porque no hizo falta o porque falló.
    """
    if not texto or not texto.strip():
        return {"texto": texto or "", "traducido": False, "idioma_original": None}

    if not parece_ingles(texto):
        return {"texto": texto, "traducido": False, "idioma_original": None}

    clave = _clave(texto, destino)

    # 1. Caché
    try:
        guardado = await db[_COLECCION].find_one({"_id": clave})
        if guardado and guardado.get("traduccion"):
            return {
                "texto": guardado["traduccion"],
                "traducido": True,
                "idioma_original": guardado.get("idioma_original", "en"),
            }
    except Exception as e:  # noqa: BLE001
        logger.warning("Caché de traducción no disponible: %s", e)

    # 2. Modelo. `create_chat_completion` es síncrono y bloquea: va a un hilo
    #    para no parar el bucle de eventos mientras traduce quince titulares.
    modelo = obtener_modelo()
    if modelo is None:
        return {"texto": texto, "traducido": False, "idioma_original": "en"}

    try:
        traducido = await asyncio.to_thread(_traducir_uno, modelo, texto, destino)
    except Exception as e:  # noqa: BLE001
        logger.warning("Traducción abortada: %s", e)
        return {"texto": texto, "traducido": False, "idioma_original": "en"}

    if not traducido or traducido == texto:
        return {"texto": texto, "traducido": False, "idioma_original": "en"}

    # 3. Guardar
    try:
        await db[_COLECCION].update_one(
            {"_id": clave},
            {
                "$set": {
                    "original": texto[:MAX_CARACTERES],
                    "traduccion": traducido,
                    "idioma_original": "en",
                    "destino": destino,
                }
            },
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo cachear la traducción: %s", e)

    return {"texto": traducido, "traducido": True, "idioma_original": "en"}


async def traducir_noticias(
    db,
    obtener_modelo,
    noticias: List[Dict[str, Any]],
    campos: Iterable[str] = ("title", "summary"),
    destino: str = "es",
) -> List[Dict[str, Any]]:
    """
    Traduce una lista de noticias.

    La estimación original de este comentario era 1-2 s por texto; medido de
    verdad en producción son 15-25 s (CPU, modelo de 1,7 B). Con ese coste real
    un semáforo de 3 no da paralelismo: `LOCK_LLM` serializa igualmente todas
    las llamadas al modelo compartido (ver su docstring — el contexto de
    llama.cpp no admite `create_chat_completion` concurrente), así que tres
    hilos «a la vez» sólo significa tres hilos turnándose por el lock en vez de
    uno. El límite se deja en 1 para no reservar hilos del pool que no aceleran
    nada; lo que de verdad acota el tiempo total es el timeout que pone quien
    llama a esta función (ver `/overton` en `server.py`).

    Los campos que NO se tocan —medio, enlace, fecha, impacto— se quedan
    exactamente como estaban: traducir el nombre de un periódico o una fecha
    sólo introduce errores.
    """
    if not noticias:
        return noticias

    limite = asyncio.Semaphore(1)

    async def una(indice: int, campo: str, valor: str):
        async with limite:
            resultado = await traducir(db, obtener_modelo, valor, destino)
        return indice, campo, resultado

    tareas = []
    for i, n in enumerate(noticias):
        for campo in campos:
            valor = n.get(campo)
            if isinstance(valor, str) and valor.strip():
                tareas.append(una(i, campo, valor))

    if not tareas:
        return noticias

    resultados = await asyncio.gather(*tareas, return_exceptions=True)

    for r in resultados:
        if isinstance(r, Exception):
            continue
        indice, campo, res = r
        noticias[indice][campo] = res["texto"]
        if res["traducido"]:
            noticias[indice]["traducido"] = True
            noticias[indice]["idioma_original"] = res["idioma_original"]

    # Marca explícita también en las que no se tradujeron, para que la
    # interfaz distinga «no hizo falta» de «no se intentó».
    for n in noticias:
        n.setdefault("traducido", False)

    return noticias
