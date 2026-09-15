"""
================================================================================
Traducción de textos al español con el modelo local
================================================================================
Traduce titulares y resúmenes de noticias usando el Qwen3-1.7B que ya está
cargado en `server.py`. Cuatro decisiones que hacen que esto sea viable:

1. **Se reutiliza el singleton `get_llm_model()`.** El modelo pesa 1,1 GB; una
   segunda instancia duplicaría la memoria para nada.

2. **`/no_think` en cada petición.** Qwen3 razona por defecto dentro de
   `<think>` antes de contestar. Medido el 13 sep 2026 con el prompt de antes:
   19,2 s, 320 tokens, cortado por `max_tokens` a mitad del razonamiento y SIN
   traducción. `_limpiar_respuesta` descartaba ese texto —con razón— y devolvía
   el original, que no se cachea: el mismo titular se reintentaba en cada
   visita y las noticias salían siempre en inglés. Con `/no_think`: 1,9 s, 26
   tokens, traducción correcta.

3. **Caché en Mongo con el hash del original como clave, y una COLA en segundo
   plano.** Quien pide noticias recibe al instante lo que ya está traducido;
   lo que falta se encola (sin duplicados, titulares antes que resúmenes) y lo
   traduce un único trabajador. La siguiente visita ya lo encuentra en caché.
   Antes cada petición traducía en línea y en serie: una pantalla de diez
   noticias tardaba minutos, y una pestaña cerrada seguía traduciendo.

4. **Si algo falla, se devuelve el original.** Nunca un hueco, nunca una
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
import difflib
import hashlib
import itertools
import logging
import re
import threading
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# El contexto de llama.cpp NO admite `create_chat_completion` concurrente: dos
# hilos decodificando a la vez corrompen el KV-cache y abortan el proceso
# entero con un GGML_ASSERT (visto en producción como reinicios en bucle del
# backend). La cola de abajo ya traduce de una en una, pero `LlmChat` en
# `server.py` usa el mismo modelo por su cuenta: este lock es el único punto
# que de verdad serializa el acceso, y lo usan ambos sitios.
LOCK_LLM = threading.Lock()

# El resumen largo desborda el contexto y además no aporta: la primera parte
# de una noticia financiera lleva el dato. Se recorta antes de traducir.
MAX_CARACTERES = 400

# Qwen3: interruptor suave del modo de razonamiento. Ver punto 2 del módulo.
SIN_RAZONAMIENTO = " /no_think"

# Palabras que delatan el idioma. Se CUENTAN las de los dos lados: antes sólo
# había una lista inglesa corta y un titular sin ninguna de esas palabras se daba
# por español. Medido el 14 sep 2026 en /news/AMZN: «Tech pulls back on AI
# concerns, cybersecurity takes a step up» o «Sector Update: Consumer Stocks
# Mixed Late Afternoon» no se traducían nunca.
_PALABRAS_INGLESAS = re.compile(
    r"\b(the|an|of|to|in|on|for|with|from|by|at|as|is|are|was|be|will|its|it's|and|or|"
    r"after|before|says|said|could|would|should|how|why|what|new|up|down|over|into|about|"
    r"amid|than|this|that|these|their|stock|stocks|shares|market|markets|price|prices|"
    r"target|report|reports|earnings|beat|beats|miss|misses|guidance|upgrade|downgrade|"
    r"quarter|revenue|profit|loss|deal|buy|sell|rise|rises|fall|falls|update)\b",
    re.IGNORECASE,
)
_PALABRAS_ESPANOLAS = re.compile(
    r"\b(de|del|el|la|los|las|que|por|para|con|una|sus|según|más|tras|sobre|entre|pero|"
    r"este|esta|se|al|y|en|suben|bajan|acciones|bolsa|bolsas|beneficio|resultados)\b",
    re.IGNORECASE,
)
_PALABRA = re.compile(r"[^\W\d_]{2,}")

_COLECCION = "traducciones"

# Frases de las instrucciones del prompt. Si aparecen en la respuesta, el
# modelo ha repetido lo que se le pedía en vez de traducir.
_ECO_PROMPT = re.compile(
    r"devuelve [úu]nicamente|traduce al |mant[ée]n los nombres|sin comillas, sin explicaciones|^texto:"
    # El modelo contestando como asistente en vez de traducir. Visto el 14 sep
    # 2026: «¿Podrías proporcionar el texto que deseas traducir?».
    r"|proporcion(a|ar) el texto|texto que (deseas|quieres) traducir|no (hay|has proporcionado)|please provide",
    re.IGNORECASE,
)


def _normalizar(texto: str) -> str:
    """Sólo letras y cifras en minúscula: para comparar sin puntuación ni espacios."""
    return re.sub(r"[^a-z0-9]", "", texto.lower())


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
    ingles = len(_PALABRAS_INGLESAS.findall(texto))
    espanol = len(_PALABRAS_ESPANOLAS.findall(texto))
    if espanol > ingles:
        return False
    if ingles:
        return True
    # Ni una cosa ni otra («Nvidia Earnings Preview», nombres propios): si tiene
    # tres palabras o más y nada español, se traduce. Lo que diga el comentario
    # de arriba —«si duda, traduce»— ahora lo hace también el código.
    return espanol == 0 and len(_PALABRA.findall(texto)) >= 3


def _limpiar_respuesta(bruto: str, original: str) -> str:
    """
    Qwen tiende a añadir preámbulos («Aquí está la traducción:»), comillas y
    bloques de razonamiento `<think>`. Se recortan aquí en vez de confiar en
    que el prompt baste, porque a 1,7 B no basta siempre.
    """
    if not bruto:
        return original

    texto = bruto.strip()

    # Qwen3 emite razonamiento entre etiquetas (vacías con /no_think). Fuera.
    texto = re.sub(r"<think>.*?</think>", "", texto, flags=re.DOTALL | re.IGNORECASE)
    # Un `<think>` sin cerrar es un razonamiento cortado por max_tokens: ahí no
    # hay traducción ninguna, sólo el principio de un comentario en inglés.
    if re.search(r"<think>", texto, flags=re.IGNORECASE):
        return original

    # Con el prompt de ejemplo el modelo a veces repite el formato entero:
    # «Sector Update: Tech Stocks Fall…\n**Español:** Actualización del sector…».
    # Visto el 14 sep 2026. Vale lo que va detrás de la ÚLTIMA etiqueta.
    partes = re.split(r"\**\s*espa[ñn]ol\s*:\s*\**", texto, flags=re.IGNORECASE)
    if len(partes) > 1:
        texto = partes[-1]
    texto = texto.replace("**", "").strip()

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

    # Eco del propio prompt. Medido el 13 sep 2026: un titular se «tradujo»
    # como «Devuelve ÚNICAMENTE la traducción, sin comillas…». Es texto en
    # español, pasa todas las comprobaciones de arriba y se guardaba en caché.
    if _ECO_PROMPT.search(texto) or "/no_think" in texto:
        return original

    # Traducción CORTADA. Medido el 14 sep 2026: había 11 en caché como «3 Acc»,
    # «Los precios del pet» o «MIND C.T.I. Ltd (NASDAQ:». El español ocupa más
    # que el inglés, así que menos de la mitad del original no es una traducción
    # breve: es una salida interrumpida.
    if len(original) >= 30 and len(texto) < len(original) * 0.55:
        return original
    if re.search(r"[(:,\-–]\s*$", texto) and not re.search(r"[(:,\-–]\s*$", original):
        return original

    # Devolver el original casi intacto no es traducir: se marcaba `traducido`
    # con el titular todavía en inglés.
    if difflib.SequenceMatcher(None, _normalizar(texto), _normalizar(original)).ratio() > 0.9:
        return original
    return texto


def _traducir_uno(modelo, texto: str, destino: str = "es") -> str:
    """
    Una llamada al modelo. Temperatura baja porque traducir no es una tarea
    creativa: se quiere la misma salida para la misma entrada.
    """
    recortado = texto.strip()[:MAX_CARACTERES]
    idioma = {"es": "español", "en": "inglés"}.get(destino, destino)

    directo = (
        f"Traduce al {idioma} el siguiente titular o resumen financiero.\n"
        f"Devuelve ÚNICAMENTE la traducción, sin comillas, sin explicaciones y "
        f"sin repetir el original.\n"
        f"Mantén los nombres propios, los tickers y las cifras tal cual.\n\n"
        f"Texto: {recortado}{SIN_RAZONAMIENTO}"
    )
    # Segundo intento, con un ejemplo. A 1,7 B el modelo a veces devuelve el
    # titular tal cual («Tech pulls back on AI concerns…»); con un ejemplo de
    # entrada y salida lo traduce en parte de esos casos. Medido el 14 sep 2026.
    con_ejemplo = (
        f"Traduce del inglés al {idioma} este texto financiero. Escribe la traducción completa.\n"
        "Ejemplo:\nInglés: Stocks rise after the Fed holds rates steady\n"
        "Español: Las bolsas suben después de que la Fed mantenga los tipos\n\n"
        f"Inglés: {recortado}\nEspañol:{SIN_RAZONAMIENTO}"
    )
    intentos = (
        ("Eres un traductor financiero. Traduces con precisión y no añades ningún comentario.", directo),
        (f"Eres un traductor financiero del inglés al {idioma}.", con_ejemplo),
    )

    try:
        import time as _time
        for n, (sistema, prompt) in enumerate(intentos, start=1):
            _t0 = _time.monotonic()
            with LOCK_LLM:
                _espera = _time.monotonic() - _t0
                _t1 = _time.monotonic()
                respuesta = modelo.create_chat_completion(
                    messages=[{"role": "system", "content": sistema}, {"role": "user", "content": prompt}],
                    # Un token por carácter es holgado (el español ronda 3-4
                    # caracteres por token) y cubre las etiquetas de /no_think.
                    # Con `40 + len/2` los titulares largos se cortaban a media frase.
                    # El reintento lleva margen doble: si repite el original
                    # antes de traducir, no se queda sin tokens a media frase.
                    max_tokens=min(768, (48 + len(recortado)) * n),
                    temperature=0.1,
                    top_p=0.9,
                    repeat_penalty=1.05,
                )
            logger.info(
                "Traducción (intento %d): espera_lock=%.1fs decode=%.1fs texto=%r",
                n, _espera, _time.monotonic() - _t1, texto[:40],
            )
            eleccion = respuesta["choices"][0]
            # Parada por límite de tokens: lo que haya salido está a medias, y
            # repetir con un prompt más largo no lo arregla.
            if eleccion.get("finish_reason") == "length":
                logger.info("Traducción cortada por max_tokens: %r", texto[:40])
                return texto
            # Se compara con lo que se MANDÓ (recortado a MAX_CARACTERES), no con
            # el resumen entero: frente a 2.000 caracteres, cualquier traducción
            # buena de los 400 primeros parecería «cortada». Si se rechaza, se
            # devuelve el texto completo: el recorte se guardaría como traducción.
            limpio = _limpiar_respuesta(eleccion["message"]["content"], recortado)
            if limpio != recortado:
                return limpio
        return texto
    except Exception as e:  # noqa: BLE001 — una traducción no puede tumbar la petición
        logger.warning("Traducción fallida: %s", e)
        return texto


# ══════════════════════════════════════════════════════════════════════════════
# Caché
# ══════════════════════════════════════════════════════════════════════════════

async def _leer_cache(db, claves: List[str]) -> Dict[str, str]:
    """Traducciones ya guardadas, en UNA consulta para toda la pantalla."""
    if not claves:
        return {}
    try:
        docs = await db[_COLECCION].find({"_id": {"$in": list(set(claves))}}).to_list(None)
    except Exception as e:  # noqa: BLE001
        logger.warning("Caché de traducción no disponible: %s", e)
        return {}
    return {d["_id"]: d["traduccion"] for d in docs if d.get("traduccion")}


async def _guardar(db, clave: str, original: str, traduccion: str, destino: str) -> None:
    try:
        await db[_COLECCION].update_one(
            {"_id": clave},
            {
                "$set": {
                    "original": original[:MAX_CARACTERES],
                    "traduccion": traduccion,
                    "idioma_original": "en",
                    "destino": destino,
                }
            },
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo cachear la traducción: %s", e)


# ══════════════════════════════════════════════════════════════════════════════
# Cola en segundo plano
# ══════════════════════════════════════════════════════════════════════════════

class _Cola:
    """
    Un único trabajador que traduce de uno en uno.

    · **Sin duplicados.** Diez visitas a la misma pantalla piden los mismos
      veinte textos; se traducen una vez. Antes cada visita añadía otros veinte
      a la espera del lock, y la CPU se quedaba al 225 % durante minutos.
    · **Por prioridad.** Los titulares (campo 0) antes que los resúmenes: es lo
      que se lee primero.
    · **Las fallidas no se reintentan** en este proceso. Un texto que el modelo
      no sabe traducir no vuelve a ocupar la cola en cada visita.

    Va ligada al bucle de eventos en que se creó: si cambia —pruebas con varios
    `asyncio.run`— se rehace.
    """

    def __init__(self) -> None:
        self.bucle: Optional[asyncio.AbstractEventLoop] = None
        self.cola: Optional[asyncio.PriorityQueue] = None
        self.tarea: Optional[asyncio.Task] = None
        self.pendientes: Dict[str, asyncio.Future] = {}
        self.fallidas: set = set()
        self.secuencia = itertools.count()

    def _preparar(self, db, obtener_modelo) -> None:
        bucle = asyncio.get_running_loop()
        if self.bucle is not bucle:
            self.bucle = bucle
            self.cola = asyncio.PriorityQueue()
            self.tarea = None
            self.pendientes = {}
        if self.tarea is None or self.tarea.done():
            self.tarea = bucle.create_task(self._trabajar(db, obtener_modelo))

    def encolar(self, db, obtener_modelo, clave: str, texto: str, destino: str,
                prioridad: int) -> Optional[asyncio.Future]:
        if clave in self.fallidas:
            return None
        self._preparar(db, obtener_modelo)
        futuro = self.pendientes.get(clave)
        if futuro is not None:
            return futuro
        futuro = self.bucle.create_future()
        self.pendientes[clave] = futuro
        self.cola.put_nowait((prioridad, next(self.secuencia), clave, texto, destino))
        return futuro

    async def _trabajar(self, db, obtener_modelo) -> None:
        while True:
            _, _, clave, texto, destino = await self.cola.get()
            futuro = self.pendientes.get(clave)
            resultado: Optional[str] = None
            try:
                ya = await _leer_cache(db, [clave])
                if clave in ya:
                    resultado = ya[clave]
                else:
                    # Cargar el modelo la primera vez son segundos de disco:
                    # también fuera del bucle de eventos.
                    modelo = await asyncio.to_thread(obtener_modelo)
                    if modelo is not None:
                        traducido = await asyncio.to_thread(_traducir_uno, modelo, texto, destino)
                        if traducido and traducido != texto:
                            resultado = traducido
                            await _guardar(db, clave, texto, traducido, destino)
                    if resultado is None:
                        self.fallidas.add(clave)
            except Exception as e:  # noqa: BLE001 — el trabajador no puede morir
                logger.warning("Cola de traducción: %s", e)
            finally:
                self.pendientes.pop(clave, None)
                if futuro is not None and not futuro.done():
                    futuro.set_result(resultado)
                self.cola.task_done()


_COLA = _Cola()


# ══════════════════════════════════════════════════════════════════════════════
# Entrada pública
# ══════════════════════════════════════════════════════════════════════════════

async def traducir_noticias(
    db,
    obtener_modelo,
    noticias: List[Dict[str, Any]],
    campos: Iterable[str] = ("title", "summary"),
    destino: str = "es",
    espera: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Traduce una lista de noticias con lo que haya en caché y encola el resto.

    `espera` son los segundos que se aguarda a la cola antes de contestar. Con
    0 la respuesta es inmediata: lo no traducido sale en inglés esta vez y
    traducido en la siguiente. `/overton` espera unos segundos porque sus
    titulares son pocos (≈ 2 s cada uno con `/no_think`).

    El orden de `campos` es la prioridad: el primero se traduce antes.

    Los campos que NO se tocan —medio, enlace, fecha, impacto— se quedan
    exactamente como estaban: traducir el nombre de un periódico o una fecha
    sólo introduce errores.
    """
    if not noticias:
        return noticias
    campos = tuple(campos)

    # (índice, campo, clave, texto, prioridad) de lo que necesita traducción
    trabajo = []
    for i, n in enumerate(noticias):
        for prioridad, campo in enumerate(campos):
            valor = n.get(campo)
            if isinstance(valor, str) and valor.strip() and parece_ingles(valor):
                trabajo.append((i, campo, _clave(valor, destino), valor, prioridad))

    hechas = await _leer_cache(db, [t[2] for t in trabajo])

    futuros: Dict[str, asyncio.Future] = {}
    for _, _, clave, valor, prioridad in trabajo:
        if clave not in hechas and clave not in futuros:
            f = _COLA.encolar(db, obtener_modelo, clave, valor, destino, prioridad)
            if f is not None:
                futuros[clave] = f

    if futuros and espera > 0:
        # `asyncio.wait` no cancela nada: lo que no llegue a tiempo se sigue
        # traduciendo y queda en caché para la próxima visita.
        await asyncio.wait(list(futuros.values()), timeout=espera)
        for clave, f in futuros.items():
            if f.done() and f.result():
                hechas[clave] = f.result()

    for i, campo, clave, _, _ in trabajo:
        if clave in hechas:
            noticias[i][campo] = hechas[clave]
            noticias[i]["traducido"] = True
            noticias[i]["idioma_original"] = "en"

    # Marca explícita también en las que no se tradujeron, para que la
    # interfaz distinga «no hizo falta» de «no se intentó».
    for n in noticias:
        n.setdefault("traducido", False)

    return noticias
