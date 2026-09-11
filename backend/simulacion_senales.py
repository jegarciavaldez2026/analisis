"""
================================================================================
Procesador de señales — de la estrategia que YA EXISTE a una intención
================================================================================
Este módulo no inventa ninguna estrategia. Traduce lo que los motores del
proyecto ya calculan —`/pivots`, `/nqe`, `/overton`, `/mtf`— a una `Intencion`
que el motor de simulación pueda validar y ejecutar.

Es PURO: entra el diccionario TAL Y COMO LO DEVUELVE el endpoint, sale una
decisión. Ni red, ni Mongo, ni pandas. Se prueba con fixtures.

--------------------------------------------------------------------------------
POR QUÉ `/pivots` DISPARA Y LOS DEMÁS SÓLO VETAN
--------------------------------------------------------------------------------
Auditado antes de escribir una línea:

  · **`/overton` es LARGO POR CONSTRUCCIÓN.** Sus niveles son
    `stop = precio − ATR·2,2` y `target = precio + ATR·N`. No existe rama
    corta. Un SHORT montado sobre ellos nace con el stop debajo de la entrada y
    el objetivo debajo también — el bug de coherencia direccional que este
    proyecto ya tiene anotado. Por eso `/overton` aquí **sólo suma o resta
    confianza**, y hay una prueba que lo fija.

  · **`/nqe` sí es bidireccional**, pero con el preset «Equilibrado» —el
    recomendado— el embudo da CERO señales sobre 5.082 barras. Está medido, no
    supuesto, y tiene su propia prueba en `test_nqe.py`. Enchufarlo como
    disparador daría un robot que no opera nunca y parece averiado.

  · **`/pivots` es el único que da un veredicto LONG/SHORT con niveles
    coherentes Y la lista de las seis condiciones con su medida.** Esa lista es
    literalmente lo que pide el registro de decisiones: «✓ Precio sobre PP —
    78,05 vs 77,56». No hay que inventar ni un indicador para rellenarla.

--------------------------------------------------------------------------------
JERARQUÍA (es la regla del producto, no una preferencia)
--------------------------------------------------------------------------------
    DATOS → CONTEXTO(/mtf) → SEÑAL(/pivots) → CONFLUENCIA(/overton,/nqe)
          → RIESGO → TAMAÑO → EJECUCIÓN

**Ningún indicador aislado ordena una operación.** `/overton` y `/nqe` pueden
vetar o encoger el tamaño; no pueden abrir nada. Y un conflicto entre marcos no
es «señal débil»: es CONTRA-TENDENCIA, se rotula como tal y reduce el tamaño.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from simulacion import Intencion, tamano_por_riesgo

# ==============================================================================
# Identidad de una señal
# ==============================================================================

def id_senal(
    fuente: str, simbolo: str, marco: str, direccion: str, ts_barra: Any
) -> str:
    """
    La clave de deduplicación.

    Lo importante es que incluye el **timestamp de la BARRA**, no la hora de
    consulta. Así «una entrada por vela» es una propiedad estructural y no un
    temporizador que se pueda desajustar: el robot puede evaluar veinte veces
    dentro de la misma vela horaria y las veinte producen el mismo `signal_id`.

    Se guarda como `_id` en Mongo, de modo que el segundo intento choca contra
    la clave primaria. Dedup atómico sin crear ningún índice — que viene bien,
    porque este backend no crea ninguno.
    """
    crudo = f"{fuente}|{simbolo.upper()}|{marco}|{direccion}|{ts_barra}"
    return hashlib.sha1(crudo.encode("utf-8")).hexdigest()[:24]


# ==============================================================================
# Resultado
# ==============================================================================

@dataclass
class Razon:
    """Una condición con SU MEDIDA. Un ✓ sin cifra detrás no se puede auditar."""

    etiqueta: str
    valor: str
    cumplida: bool

    def a_dict(self) -> Dict[str, Any]:
        return {"etiqueta": self.etiqueta, "valor": self.valor, "cumplida": self.cumplida}


@dataclass
class Decision:
    """
    Lo que el robot ha decidido y por qué. Se guarda SIEMPRE, también cuando la
    decisión es no operar: la pregunta «¿por qué no entró?» es tan legítima
    como «¿por qué entró?», y sin registro no tiene respuesta.
    """

    direccion: str  # "long" | "short" | "ninguna"
    fuente: str
    simbolo: str
    marco: str
    signal_id: Optional[str] = None
    ts_barra: Optional[int] = None

    intencion: Optional[Intencion] = None
    razones: List[Razon] = field(default_factory=list)
    #: Vetos de los filtros de confluencia. Si hay alguno, no se opera.
    vetos: List[str] = field(default_factory=list)
    #: Notas que no impiden operar pero cambian cómo se lee la señal.
    notas: List[str] = field(default_factory=list)
    #: Multiplicador del tamaño, 0,25–1,0. Baja con el conflicto entre marcos.
    factor_tamano: float = 1.0
    motivo_no_operar: Optional[str] = None

    @property
    def opera(self) -> bool:
        return self.intencion is not None and not self.vetos

    def a_dict(self) -> Dict[str, Any]:
        return {
            "direccion": self.direccion,
            "fuente": self.fuente,
            "simbolo": self.simbolo,
            "marco": self.marco,
            "signal_id": self.signal_id,
            "ts_barra": self.ts_barra,
            "razones": [r.a_dict() for r in self.razones],
            "vetos": list(self.vetos),
            "notas": list(self.notas),
            "factor_tamano": self.factor_tamano,
            "motivo_no_operar": self.motivo_no_operar,
            "opera": self.opera,
            "entrada": self.intencion.precio_referencia if self.intencion else None,
            "stop_loss": self.intencion.stop_loss if self.intencion else None,
            "take_profit": self.intencion.take_profit if self.intencion else None,
            "cantidad": self.intencion.cantidad if self.intencion else None,
        }


# ==============================================================================
# Lectura defensiva
# ==============================================================================

def _g(d: Any, *ruta: str, por_defecto: Any = None) -> Any:
    """
    Navega un diccionario anidado sin reventar.

    Las claves de aquí son LAS DEL BACKEND, comprobadas contra el `return` de
    `pivots.calcular()` y de `nqe.calcular()`. Escribir nombres plausibles en
    vez de los reales ya costó cuatro paneles vacíos en este proyecto, y no da
    error: da guiones.
    """
    actual = d
    for clave in ruta:
        if not isinstance(actual, dict):
            return por_defecto
        actual = actual.get(clave)
    return por_defecto if actual is None else actual


def _num(v: Any) -> Optional[float]:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None


# ==============================================================================
# Disparo: /pivots
# ==============================================================================

def decision_desde_pivots(
    pivotes: Dict[str, Any], simbolo: str, marco: str
) -> Decision:
    """
    El veredicto de Woodie, con sus seis condiciones y sus medidas.

    `senal.veredicto` sólo es LONG o SHORT con las SEIS condiciones cumplidas
    EN ORDEN; el resto del tiempo es `None`. Eso no es un fallo del indicador:
    es la distinción entre SESGO y VEREDICTO que el propio módulo mantiene a
    propósito. Tener el precio por encima del PP es sesgo de compra, no una
    orden de compra, y fundirlos convertiría lo primero en lo segundo.
    """
    senal = _g(pivotes, "senal", por_defecto={}) or {}
    veredicto = senal.get("veredicto")
    condiciones = senal.get("condiciones") or []
    cumplidas = senal.get("condiciones_cumplidas", 0)
    ts_barra = _ts_ultima_barra(pivotes)

    razones = [
        Razon(
            etiqueta=str(c.get("texto", "")),
            valor=str(c.get("detalle", "")),
            cumplida=bool(c.get("cumplida")),
        )
        for c in condiciones
    ]

    d = Decision(
        direccion="ninguna",
        fuente="pivots",
        simbolo=simbolo.upper(),
        marco=marco,
        ts_barra=ts_barra,
        razones=razones,
    )

    if veredicto not in ("LONG", "SHORT"):
        d.motivo_no_operar = (
            f"La secuencia de Woodie va por {cumplidas} de {len(condiciones) or 6} "
            f"condiciones. El veredicto sólo aparece con todas cumplidas y en orden."
        )
        return d

    direccion = "long" if veredicto == "LONG" else "short"
    d.direccion = direccion
    d.signal_id = id_senal("pivots", simbolo, marco, direccion, ts_barra)

    entrada = _num(senal.get("entrada"))
    stop = _num(senal.get("stop"))
    objetivo = _num(senal.get("objetivo1"))

    if entrada is None or stop is None or objetivo is None:
        d.motivo_no_operar = (
            "El veredicto llegó sin niveles completos (entrada, stop u objetivo). "
            "Sin los tres no hay tamaño por riesgo ni R/B que auditar."
        )
        d.direccion = "ninguna"
        return d

    if not senal.get("operable", True):
        d.vetos.append(
            f"La propia señal se marca NO OPERABLE: "
            f"{senal.get('motivo_no_operable') or 'sin motivo declarado'}."
        )

    # La cantidad la pone después el gestor de riesgo con el capital real; aquí
    # va a 1 como marcador. Ponerla a cero haría que el validador rechazara por
    # cantidad y escondería el motivo verdadero.
    d.intencion = Intencion(
        simbolo=simbolo.upper(),
        direccion=direccion,
        tipo="MARKET",
        cantidad=1,
        precio_referencia=entrada,
        stop_loss=stop,
        take_profit=objetivo,
        origen="robot",
        signal_id=d.signal_id,
        razones=[r.a_dict() for r in razones],
        fuente="pivots",
        marco=marco,
        ts_barra=ts_barra,
    )

    rb = _num(senal.get("riesgo_beneficio"))
    if rb is not None:
        d.razones.append(Razon("Riesgo / beneficio", f"{rb:.2f}", rb >= 1.0))

    fase = _g(pivotes, "fase", "nombre")
    if fase:
        d.notas.append(f"Fase de la secuencia: {fase}.")

    # Colinealidad PP/VWAP. Por encima del 85 % las dos condiciones son la misma
    # lectura contada dos veces, y la señal tiene menos evidencia de la que
    # aparenta. Es una nota, no un veto: la medida vale en las dos direcciones.
    acuerdo = _num(_g(pivotes, "colinealidad", "acuerdo_pct"))
    if acuerdo is not None and acuerdo > 85.0:
        d.notas.append(
            f"PP y VWAP coinciden en el {acuerdo:.0f} % de las barras: dos de las "
            f"condiciones están contando la misma evidencia, no dos distintas."
        )

    return d


def _ts_ultima_barra(pivotes: Dict[str, Any]) -> Optional[int]:
    """
    Marca temporal de la última barra de la serie, en segundos.

    `serie.barras[].t` viene en MILISEGUNDOS desde `pivots._serie()`. Dividir
    aquí y no repartir la conversión por el módulo evita el clásico factor 1000
    que convierte una vela horaria en una de hace 50 años.
    """
    barras = _g(pivotes, "serie", "barras", por_defecto=[]) or []
    if not barras:
        return None
    t = _num(barras[-1].get("t"))
    return int(t / 1000) if t is not None else None


# ==============================================================================
# Confluencia: /overton, /nqe, /mtf
# ==============================================================================

#: Acciones de `/overton` que contradicen abiertamente cada dirección.
#: `hold` no veta: «esperar» no es «lo contrario».
CONTRARIAS = {
    "long": {"sell", "reduce"},
    "short": {"buy", "accumulate"},
}


def filtro_overton(d: Decision, overton: Optional[Dict[str, Any]]) -> Decision:
    """
    `/overton` como VETO y como matiz. Nunca como disparador.

    Sus niveles no se tocan: son largos por construcción y no sirven para un
    corto. Lo que sí sirve es su veredicto agregado sobre 165 factores, que es
    mucha más evidencia de la que tiene un pivote suelto.
    """
    if not overton:
        d.notas.append("Sin lectura de /overton: la señal va sin filtro de confluencia.")
        return d

    accion = str(overton.get("overton_action") or "").lower()
    score = _num(overton.get("score_100"))
    etiqueta = overton.get("accion") or accion.upper() or "—"

    d.razones.append(Razon(
        "Confluencia Overton",
        f"{etiqueta} · score {score:.1f}/100" if score is not None else str(etiqueta),
        accion not in CONTRARIAS.get(d.direccion, set()),
    ))

    if accion in CONTRARIAS.get(d.direccion, set()):
        d.vetos.append(
            f"Overton dice {etiqueta}"
            + (f" (score {score:.1f}/100)" if score is not None else "")
            + f", que va en contra de un {d.direccion.upper()}."
        )
        return d

    if accion == "hold":
        d.factor_tamano = min(d.factor_tamano, 0.5)
        d.notas.append(
            "Overton está en ESPERAR: no contradice la señal, pero tampoco la "
            "respalda. Tamaño al 50 %."
        )
    return d


def filtro_nqe(d: Decision, nqe: Optional[Dict[str, Any]]) -> Decision:
    """
    `/nqe` como matiz, con su gate estadístico.

    **No veta por ausencia de señal.** Con el preset por defecto el NQE no da
    ninguna en 5.082 barras —medido, y con prueba que lo fija—, así que exigir
    su acuerdo equivaldría a apagar el robot y llamarlo filtro.

    Lo que sí se usa es el gate: si la cota de Wilson de ESTE lado está
    cerrada, la evidencia histórica no respalda la operación y el tamaño baja.
    """
    if not nqe:
        return d

    lado = "largo" if d.direccion == "long" else "corto"
    gate = _g(nqe, "gate", lado, por_defecto={}) or {}
    abierto = bool(gate.get("abierto"))
    wilson = _num(gate.get("wilson"))
    muestra = gate.get("muestra")
    umbral = _num(_g(nqe, "gate", "umbral_wilson"))

    detalle = "sin muestra suficiente"
    if wilson is not None and umbral is not None:
        detalle = f"Wilson {wilson:.2f} vs umbral {umbral:.2f} (n={muestra})"
    d.razones.append(Razon(f"Gate NQE ({lado})", detalle, abierto))

    if not abierto:
        d.factor_tamano = min(d.factor_tamano, 0.5)
        d.notas.append(
            f"El gate del NQE para el lado {lado} está cerrado ({detalle}): el "
            f"histórico no demuestra ventaja. Tamaño al {d.factor_tamano:.0%}."
        )

    # El sesgo del motor del NQE sí puede contradecir.
    sesgo = str(_g(nqe, "senal", "sesgo") or "").lower()
    if sesgo:
        contra = ("bajista" in sesgo and d.direccion == "long") or (
            "alcista" in sesgo and d.direccion == "short"
        )
        d.razones.append(Razon("Sesgo NQE", sesgo, not contra))
        if contra:
            d.factor_tamano = min(d.factor_tamano, 0.5)
            d.notas.append(f"El motor NQE va en sentido contrario ({sesgo}).")
    return d


def filtro_mtf(d: Decision, mtf: Optional[Dict[str, Any]]) -> Decision:
    """
    Conflicto entre marcos ≠ señal débil.

    Un rebote alcista dentro de una estructura semanal bajista no es un
    STRONG BUY con menos fuerza: es otra cosa —CONTRA-TENDENCIA— y lo que
    cambia es el TAMAÑO, entre el 25 y el 75 %. Es una regla que el usuario
    puso por escrito y aquí se cumple literalmente.
    """
    if not mtf:
        return d

    consenso = str(mtf.get("consenso") or "").lower()
    detalle = mtf.get("detalle_consenso") or consenso or "—"
    alineado = (
        (consenso == "alcista" and d.direccion == "long")
        or (consenso == "bajista" and d.direccion == "short")
    )
    contrario = (
        (consenso == "bajista" and d.direccion == "long")
        or (consenso == "alcista" and d.direccion == "short")
    )

    d.razones.append(Razon("Consenso multi-marco", str(detalle), alineado))

    if contrario:
        d.factor_tamano = min(d.factor_tamano, 0.25)
        d.notas.append(
            f"CONTRA-TENDENCIA: el consenso de marcos es {consenso} y la señal es "
            f"{d.direccion.upper()}. No es una señal débil, es una operación "
            f"distinta. Tamaño al 25 %."
        )
    elif consenso == "mixto":
        d.factor_tamano = min(d.factor_tamano, 0.75)
        d.notas.append("Marcos en desacuerdo: tamaño al 75 %.")
    return d


# ==============================================================================
# Tamaño
# ==============================================================================

def dimensionar(
    d: Decision,
    balance: float,
    capital_pct: float,
    riesgo_pct: float,
    max_acciones_liquidez: Optional[int] = None,
) -> Decision:
    """
    La MISMA fórmula que ya usa `PlanPosicion.tsx` en pantalla, más el factor de
    confluencia. Que el número del robot y el que lee el usuario salgan de dos
    cuentas distintas sería una contradicción difícil de detectar.

    El tope por liquidez —1 % del volumen medio— es la regla de participación
    institucional, y es lo que impide que el propio robot sea el mercado y se
    coma su ventaja en deslizamiento. Manda el MENOR de los dos, y se dice cuál.
    """
    if d.intencion is None:
        return d

    capital = balance * (capital_pct / 100.0)
    por_riesgo = tamano_por_riesgo(
        capital, riesgo_pct, d.intencion.precio_referencia, d.intencion.stop_loss or 0.0
    )
    if por_riesgo is None or por_riesgo <= 0:
        d.vetos.append(
            "No se puede calcular el tamaño: falta el stop o la distancia es cero."
        )
        return d

    ajustado = int(por_riesgo * d.factor_tamano)
    manda = f"riesgo {riesgo_pct:.2f} % sobre {capital_pct:.0f} % del balance"

    if max_acciones_liquidez is not None and max_acciones_liquidez < ajustado:
        ajustado = int(max_acciones_liquidez)
        manda = "liquidez · 1 % del volumen medio diario"

    if ajustado <= 0:
        d.vetos.append(
            f"El tamaño calculado es cero ({manda}). Con este capital y este stop "
            f"no cabe ni una acción."
        )
        return d

    d.intencion.cantidad = ajustado
    d.razones.append(Razon(
        "Tamaño",
        f"{ajustado} acciones · limita {manda}"
        + (f" · factor {d.factor_tamano:.0%}" if d.factor_tamano < 1.0 else ""),
        True,
    ))
    return d


# ==============================================================================
# Orquestación
# ==============================================================================

def evaluar(
    simbolo: str,
    marco: str,
    pivotes: Dict[str, Any],
    *,
    overton: Optional[Dict[str, Any]] = None,
    nqe: Optional[Dict[str, Any]] = None,
    mtf: Optional[Dict[str, Any]] = None,
    balance: float = 0.0,
    capital_pct: float = 25.0,
    riesgo_pct: float = 0.5,
    max_acciones_liquidez: Optional[int] = None,
) -> Decision:
    """
    El recorrido completo, en el orden de la jerarquía del producto.

    Los filtros se aplican SIEMPRE, incluso cuando ya hay un veto: así el
    registro de decisiones enseña la fotografía entera y no sólo el primer
    motivo por el que se paró. Un registro que se corta en el primer «no» hace
    creer que lo demás estaba bien.
    """
    d = decision_desde_pivots(pivotes, simbolo, marco)
    if d.intencion is None:
        return d

    d = filtro_mtf(d, mtf)
    d = filtro_overton(d, overton)
    d = filtro_nqe(d, nqe)
    d = dimensionar(d, balance, capital_pct, riesgo_pct, max_acciones_liquidez)

    if d.vetos and not d.motivo_no_operar:
        d.motivo_no_operar = d.vetos[0]
    return d


def resumen_legible(d: Decision) -> str:
    """Una línea para el evento. Lo que se lee en la barra de estado."""
    if d.opera and d.intencion:
        return (
            f"{d.direccion.upper()} {d.intencion.cantidad} {d.simbolo} @ "
            f"{d.intencion.precio_referencia:,.4f} · SL {d.intencion.stop_loss:,.4f} · "
            f"TP {d.intencion.take_profit:,.4f}"
        )
    return d.motivo_no_operar or "NO TRADE"
