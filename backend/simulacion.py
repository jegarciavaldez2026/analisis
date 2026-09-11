"""
================================================================================
Motor de trading SIMULADO
================================================================================
Simulación. No hay bróker, no hay orden que salga a ninguna red de mercado y no
existe ninguna ruta de código que pueda mandar una. Lo que hay es contabilidad
honesta de operaciones que nunca ocurrieron.

Este módulo es PURO: no importa Mongo, ni yfinance, ni `os`, ni la red. Entra un
estado y una barra, sale un estado y una lista de eventos. Esa pureza es lo que
permite las 30 pruebas de `test_simulacion.py` sin levantar nada, y es la misma
disciplina de `backtest.py`, `pivots.py` y `nqe.py`.

--------------------------------------------------------------------------------
ORDEN Y POSICIÓN SON COSAS DISTINTAS
--------------------------------------------------------------------------------
Es la decisión estructural del módulo y conviene no deshacerla:

    ORDEN  ORD-2026-0001            POSICIÓN  SIM-2026-0001
    LONG · LIMIT · 14,00            (no existe todavía)
    PENDING
       │  el precio toca 14,00
       ▼
    FILLED               ─────►     OPEN   entrada 14,00 · P&L +0,12
    (ya no cambia más)                │  toca TP
                                      ▼
                                    CLOSED salida 14,50 · TAKE_PROFIT

La orden es la INTENCIÓN; la posición es la CONSECUENCIA. Fundirlas parece un
ahorro y no lo es:

  · Una orden cancelada NO es una posición cerrada con resultado cero. Nunca
    hubo posición. Si entrara en el denominador del win rate, el win rate
    mentiría, y un win rate plausible pero falso es justo el fallo silencioso
    contra el que este proyecto ya tiene contrapruebas.
  · CANCELLED es un verbo de la orden. MANUAL_CLOSE es un verbo de la posición.
  · Un MARKET pasa PENDING→FILLED en el mismo instante, pero la orden se
    registra igual: así el historial contesta «¿qué pedí?» además de «¿qué pasó?».

--------------------------------------------------------------------------------
LAS TRES REGLAS DE EJECUCIÓN, HEREDADAS DE `backtest.py`
--------------------------------------------------------------------------------
1. **Stop y objetivo tocados en la misma barra → gana el STOP.** Con barras no
   se conoce el camino de dentro. Suponer el objetivo es la forma más
   silenciosa de inflar una simulación. Hay contraprueba: la versión ingenua da
   un resultado distinto y mejor sobre el mismo dato.

2. **Un LIMIT atravesado por un hueco se rellena en la APERTURA, no en el
   límite.** Comprar limitado a 14,00 en una barra que abre a 13,80 da 13,80.
   Rellenar siempre al límite regala el hueco favorable y es un sesgo optimista
   que no se ve en ninguna pantalla.

3. **Comisión y deslizamiento son parámetros visibles**, nunca constantes
   escondidas. A cero, cualquier estrategia mediocre parece buena.

--------------------------------------------------------------------------------
BALANCE NO ES EQUITY
--------------------------------------------------------------------------------
    BALANCE = capital_inicial + Σ resultado de las posiciones CERRADAS
    EQUITY  = BALANCE + Σ resultado latente de las posiciones ABIERTAS
    LIBRE   = BALANCE − Σ margen retenido

Abrir una posición NO mueve el balance ni un céntimo, y sí mueve el equity. Hay
prueba que lo fija como invariante: si algún día falla, la contabilidad está
rota.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field, replace
from typing import Any, Dict, List, Literal, Optional, Tuple

# ==============================================================================
# Vocabulario
# ==============================================================================

Direccion = Literal["long", "short"]
TipoOrden = Literal["MARKET", "LIMIT"]
EstadoOrden = Literal["PENDING", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"]
EstadoPosicion = Literal["OPEN", "CLOSED"]

#: Por qué se cerró una posición. Los cinco primeros son los del producto;
#: LIQUIDACION sólo puede aparecer con apalancamiento > 1 y se marca aparte
#: porque no es una decisión, es una consecuencia aritmética.
MOTIVOS_CIERRE = (
    "TAKE_PROFIT",
    "STOP_LOSS",
    "MANUAL_CLOSE",
    "STRATEGY_EXIT",
    "END_OF_SESSION",
    "LIQUIDACION",
)

#: Un año de calendario, para prorratear el coste de préstamo del corto.
DIAS_ANO = 365.0


# ==============================================================================
# Parámetros
# ==============================================================================

@dataclass(frozen=True)
class Parametros:
    """
    Todo lo que cambia el resultado, en un sitio y con su valor a la vista.

    Los valores por defecto son deliberadamente conservadores, por la misma
    razón que en `backtest.py`: una comisión de cero y un deslizamiento de cero
    convierten cualquier estrategia mediocre en una buena, y es el ajuste más
    fácil de olvidar.
    """

    #: Comisión por operación, en porcentaje del importe. Se cobra al abrir y
    #: al cerrar, como en cualquier bróker.
    comision_pct: float = 0.05

    #: Deslizamiento: la diferencia entre el precio que ves y el que consigues.
    #: Se aplica SIEMPRE en contra, en las cuatro combinaciones de lado y
    #: sentido. Un deslizamiento que a veces favorece no es deslizamiento.
    deslizamiento_pct: float = 0.05

    #: Multiplicador de nocional. **1,0 = sin apalancamiento**, que es el
    #: comportamiento de la cartera real del producto.
    #:
    #: AVISO: esto es un constructo de SIMULACIÓN. No hay reglas de margen de
    #: ningún bróker detrás, ni coste de financiación diaria, ni aviso de
    #: garantías. Lo único que se modela es el margen retenido y el nivel al
    #: que la pérdida latente se lo come entero.
    apalancamiento: float = 1.0

    #: Coste anual de tomar prestado el papel para vender en corto, en %.
    #:
    #: AVISO: yfinance NO sirve ni disponibilidad ni tasa real de préstamo.
    #: Esto es un SUPUESTO, no una medida, y por eso viaja como parámetro y se
    #: rotula en pantalla. Ponerlo a cero es una opción legítima, pero entonces
    #: los cortos salen sistemáticamente mejor de lo que serían.
    coste_prestamo_anual_pct: float = 0.30

    #: Riesgo máximo admitido por operación, en % del balance. El validador
    #: rechaza por encima de esto.
    riesgo_max_pct: float = 5.0

    #: Máximo de posiciones abiertas a la vez.
    max_posiciones: int = 5

    #: Relación riesgo/beneficio por debajo de la cual la operación se marca
    #: NO RECOMENDADA. **No se bloquea**: es una advertencia, no una norma.
    rb_minimo: float = 1.0

    #: Enfriamiento tras cerrar: barras que el robot espera antes de volver a
    #: abrir en el mismo símbolo y dirección.
    enfriamiento_barras: int = 3

    def validar(self) -> None:
        if self.apalancamiento < 1.0:
            raise ValueError("El apalancamiento no puede ser menor que 1,0.")
        if self.comision_pct < 0 or self.deslizamiento_pct < 0:
            raise ValueError("Comisión y deslizamiento no pueden ser negativos.")


# ==============================================================================
# Entidades
# ==============================================================================

@dataclass
class Barra:
    """Una vela OHLC con su marca temporal en epoch de segundos."""

    ts: int
    apertura: float
    alto: float
    bajo: float
    cierre: float
    volumen: float = 0.0

    def __post_init__(self) -> None:
        if self.alto < self.bajo:
            raise ValueError(f"Barra inválida en {self.ts}: alto {self.alto} < bajo {self.bajo}")


@dataclass
class Orden:
    """La INTENCIÓN. Nace PENDING y muere en un estado terminal."""

    id: str
    simbolo: str
    direccion: Direccion
    tipo: TipoOrden
    cantidad: float
    estado: EstadoOrden = "PENDING"

    #: Sólo para LIMIT. En un MARKET es None: no hay precio pedido, hay prisa.
    precio_limite: Optional[float] = None

    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    apalancamiento: float = 1.0

    creada_ts: int = 0
    #: Instante en que dejó de estar PENDING, sea cual sea el motivo.
    resuelta_ts: Optional[int] = None
    precio_ejecucion: Optional[float] = None
    comision: float = 0.0

    #: El puente hacia la consecuencia. `None` mientras no haya posición.
    posicion_id: Optional[str] = None

    origen: Literal["manual", "robot"] = "manual"
    #: Sólo en órdenes del robot. Es la clave de deduplicación.
    signal_id: Optional[str] = None
    decision_id: Optional[str] = None

    #: Por qué se rechazó, si se rechazó. Un rechazo sin motivo no se audita.
    motivo: Optional[str] = None
    #: Caducidad opcional en epoch de segundos. `None` = válida hasta cancelar.
    caduca_ts: Optional[int] = None

    @property
    def viva(self) -> bool:
        return self.estado == "PENDING"


@dataclass
class Posicion:
    """La CONSECUENCIA. Nace OPEN de una orden ejecutada y muere CLOSED."""

    id: str
    simbolo: str
    direccion: Direccion
    cantidad: float
    entrada: float
    abierta_ts: int
    estado: EstadoPosicion = "OPEN"

    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    apalancamiento: float = 1.0
    #: Capital retenido mientras la posición vive. Con apalancamiento 1 es el
    #: nocional entero.
    margen: float = 0.0

    #: Comisión ya pagada al abrir. La de cerrar se estima mientras está
    #: abierta y se realiza al cerrar.
    comision_entrada: float = 0.0
    comision_salida: float = 0.0
    #: Coste de préstamo acumulado. Sólo en cortos.
    coste_prestamo: float = 0.0

    cerrada_ts: Optional[int] = None
    salida: Optional[float] = None
    motivo_cierre: Optional[str] = None
    resultado: Optional[float] = None

    orden_apertura_id: Optional[str] = None
    orden_cierre_id: Optional[str] = None
    decision_id: Optional[str] = None
    origen: Literal["manual", "robot"] = "manual"

    #: Último precio con el que se marcó a mercado, y cuándo. Es lo que la
    #: tarjeta enseña como «precio actual».
    ultimo_precio: Optional[float] = None
    ultimo_ts: Optional[int] = None

    @property
    def abierta(self) -> bool:
        return self.estado == "OPEN"

    @property
    def nocional(self) -> float:
        return self.entrada * self.cantidad


@dataclass
class Rechazo:
    """Un motivo por el que una intención no puede convertirse en orden."""

    codigo: str
    mensaje: str
    #: `False` cuando es una advertencia que NO impide operar (p. ej. R/B bajo).
    bloquea: bool = True


@dataclass
class Evento:
    """Algo que el motor hizo. Es lo que la interfaz convierte en aviso."""

    tipo: str  # ORDEN_EJECUTADA · ORDEN_CADUCADA · POSICION_CERRADA · ...
    ts: int
    detalle: str
    orden_id: Optional[str] = None
    posicion_id: Optional[str] = None
    datos: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Estado:
    """
    Todo lo que el motor necesita saber, junto. Se serializa entero a Mongo y
    se reconstruye tal cual: hay prueba de ida y vuelta.
    """

    capital_inicial: float
    params: Parametros = field(default_factory=Parametros)
    ordenes: List[Orden] = field(default_factory=list)
    posiciones: List[Posicion] = field(default_factory=list)
    #: Instantáneas de patrimonio. De aquí sale el drawdown, y sólo de aquí.
    curva: List[Dict[str, Any]] = field(default_factory=list)
    ultimo_ts: Optional[int] = None

    # -- accesos cómodos ---------------------------------------------------

    def abiertas(self, simbolo: Optional[str] = None) -> List[Posicion]:
        return [
            p for p in self.posiciones
            if p.abierta and (simbolo is None or p.simbolo == simbolo)
        ]

    def cerradas(self) -> List[Posicion]:
        return [p for p in self.posiciones if p.estado == "CLOSED"]

    def pendientes(self, simbolo: Optional[str] = None) -> List[Orden]:
        return [
            o for o in self.ordenes
            if o.viva and (simbolo is None or o.simbolo == simbolo)
        ]

    def orden(self, oid: str) -> Optional[Orden]:
        return next((o for o in self.ordenes if o.id == oid), None)

    def posicion(self, pid: str) -> Optional[Posicion]:
        return next((p for p in self.posiciones if p.id == pid), None)


# ==============================================================================
# Aritmética — la parte que no puede estar mal
# ==============================================================================

def pnl_bruto(direccion: Direccion, entrada: float, precio: float, cantidad: float) -> float:
    """
    Resultado antes de costes.

    Dos ramas explícitas y no un `signo = 1 if long else -1` multiplicando una
    fórmula única. Con dos ramas hay dos pruebas, y un error en una no se puede
    esconder detrás de la otra.
    """
    if direccion == "long":
        return (precio - entrada) * cantidad
    if direccion == "short":
        return (entrada - precio) * cantidad
    raise ValueError(f"Dirección desconocida: {direccion!r}")


def coste_prestamo(
    posicion: Posicion, hasta_ts: int, tasa_anual_pct: float
) -> float:
    """
    Lo que cuesta mantener un corto, prorrateado por días naturales.

    En un largo es CERO: no se toma nada prestado. Aplicarlo a los dos lados
    sería inventar un coste que no existe.

    AVISO: la tasa es un SUPUESTO. yfinance no publica la real, y el corto sin
    coste de préstamo sale sistemáticamente mejor de lo que sería.
    """
    if posicion.direccion != "short" or tasa_anual_pct <= 0:
        return 0.0
    dias = max(0.0, (hasta_ts - posicion.abierta_ts) / 86400.0)
    return posicion.nocional * (tasa_anual_pct / 100.0) * (dias / DIAS_ANO)


def precio_con_deslizamiento(
    precio: float, direccion: Direccion, abriendo: bool, deslizamiento_pct: float
) -> float:
    """
    El deslizamiento SIEMPRE en contra, en las cuatro combinaciones.

        abrir  long  → pagas más       cerrar long  → cobras menos
        abrir  short → cobras menos    cerrar short → pagas más

    Un deslizamiento que a veces favorece no es deslizamiento, es ruido.
    """
    d = deslizamiento_pct / 100.0
    compra = (direccion == "long") == abriendo
    return precio * (1 + d) if compra else precio * (1 - d)


def comision_de(importe: float, comision_pct: float) -> float:
    return abs(importe) * (comision_pct / 100.0)


def resultado_latente(
    posicion: Posicion, precio: float, params: Parametros, ts: Optional[int] = None
) -> Dict[str, Optional[float]]:
    """
    Lo que vale ahora mismo una posición abierta, con todos sus costes.

    La comisión de salida se ESTIMA y se descuenta ya: una posición cuyo P&L no
    incluye lo que costará cerrarla enseña un beneficio que aún no es tuyo.
    """
    bruto = pnl_bruto(posicion.direccion, posicion.entrada, precio, posicion.cantidad)
    salida_estimada = comision_de(precio * posicion.cantidad, params.comision_pct)
    prestamo = coste_prestamo(
        posicion, ts if ts is not None else (posicion.ultimo_ts or posicion.abierta_ts),
        params.coste_prestamo_anual_pct,
    )
    neto = bruto - posicion.comision_entrada - salida_estimada - prestamo

    nocional = posicion.nocional
    margen = posicion.margen or nocional

    return {
        "bruto": bruto,
        "neto": neto,
        "comision_salida_estimada": salida_estimada,
        "coste_prestamo": prestamo,
        # ── Los DOS porcentajes, y cada uno con su nombre ──────────────────
        # Con apalancamiento difieren por el factor entero, y un «+0,22 %» sin
        # decir sobre qué base es el mismo fallo que un score sin su escala.
        "pct_precio": (bruto / nocional * 100.0) if nocional else None,
        "pct_capital": (neto / margen * 100.0) if margen else None,
    }


# ==============================================================================
# Gestor de riesgo
# ==============================================================================

@dataclass
class Intencion:
    """
    Lo que alguien —persona o robot— quiere hacer, antes de que exista orden.

    Es el único tipo que cruza la frontera entre el procesador de señales y el
    motor, y por eso lleva ya `razones`: una operación automática sin su porqué
    no se puede auditar después.
    """

    simbolo: str
    direccion: Direccion
    tipo: TipoOrden
    cantidad: float
    precio_referencia: float
    precio_limite: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    apalancamiento: float = 1.0
    origen: Literal["manual", "robot"] = "manual"
    signal_id: Optional[str] = None
    razones: List[Dict[str, Any]] = field(default_factory=list)
    fuente: Optional[str] = None
    marco: Optional[str] = None
    ts_barra: Optional[int] = None


def tamano_por_riesgo(
    capital: float, riesgo_pct: float, entrada: float, stop: float
) -> Optional[int]:
    """
    La fórmula estándar, la misma que ya usa `PlanPosicion.tsx` en pantalla.

    Devuelve `None` —no cero— cuando no se puede calcular. Un cero se lee como
    «no compres nada», y lo que pasa es que falta un dato.
    """
    distancia = abs(entrada - stop)
    if distancia <= 0 or capital <= 0 or riesgo_pct <= 0:
        return None
    return int(math.floor(capital * (riesgo_pct / 100.0) / distancia))


def _coherencia_direccional(
    direccion: Direccion,
    entrada: float,
    stop: Optional[float],
    objetivo: Optional[float],
) -> List[Rechazo]:
    """
    Un stop al otro lado o un objetivo que apunta hacia atrás.

    Esto no es paranoia: es el bug que `/overton` provocaría si alguien
    enchufara sus niveles a un corto. Sus `stop_loss` y `target1..3` son LARGOS
    POR CONSTRUCCIÓN (`precio − ATR·2,2` y `precio + ATR·N`), así que un SHORT
    construido con ellos nace con el stop debajo y el objetivo debajo. Hay
    prueba dedicada.
    """
    fallos: List[Rechazo] = []
    arriba = "por encima"
    abajo = "por debajo"

    if stop is not None:
        mal = stop >= entrada if direccion == "long" else stop <= entrada
        if mal:
            fallos.append(Rechazo(
                "STOP_AL_OTRO_LADO",
                f"Un {direccion.upper()} con entrada {entrada:,.4f} necesita el stop "
                f"{abajo if direccion == 'long' else arriba}; llega {stop:,.4f}.",
            ))
    if objetivo is not None:
        mal = objetivo <= entrada if direccion == "long" else objetivo >= entrada
        if mal:
            fallos.append(Rechazo(
                "OBJETIVO_AL_OTRO_LADO",
                f"Un {direccion.upper()} con entrada {entrada:,.4f} necesita el objetivo "
                f"{arriba if direccion == 'long' else abajo}; llega {objetivo:,.4f}.",
            ))
    return fallos


def validar(estado: Estado, intencion: Intencion) -> List[Rechazo]:
    """
    Todo lo que puede impedir —o desaconsejar— que una intención se convierta
    en orden. Devuelve la lista COMPLETA, no el primer fallo: quien rellena un
    formulario quiere ver los tres problemas de una vez, no uno por intento.
    """
    p = estado.params
    fallos: List[Rechazo] = []

    entrada = (
        intencion.precio_limite
        if intencion.tipo == "LIMIT" and intencion.precio_limite is not None
        else intencion.precio_referencia
    )

    if intencion.direccion not in ("long", "short"):
        fallos.append(Rechazo("DIRECCION", f"Dirección desconocida: {intencion.direccion!r}"))
        return fallos
    if intencion.tipo not in ("MARKET", "LIMIT"):
        fallos.append(Rechazo("TIPO", f"Tipo de orden desconocido: {intencion.tipo!r}"))
        return fallos
    if intencion.tipo == "LIMIT" and intencion.precio_limite is None:
        fallos.append(Rechazo("SIN_LIMITE", "Una orden LIMIT necesita precio límite."))
        return fallos
    if not entrada or entrada <= 0:
        fallos.append(Rechazo("SIN_PRECIO", "No hay precio de referencia válido."))
        return fallos
    if intencion.cantidad is None or intencion.cantidad <= 0:
        fallos.append(Rechazo("CANTIDAD", "La cantidad tiene que ser mayor que cero."))
        return fallos

    fallos.extend(_coherencia_direccional(
        intencion.direccion, entrada, intencion.stop_loss, intencion.take_profit
    ))

    apal = intencion.apalancamiento or p.apalancamiento
    if apal < 1.0:
        fallos.append(Rechazo("APALANCAMIENTO", "El apalancamiento no puede ser menor que 1,0."))
        apal = 1.0

    nocional = entrada * intencion.cantidad
    margen = nocional / apal
    libre = capital_libre(estado)
    if margen > libre + 1e-9:
        fallos.append(Rechazo(
            "MARGEN",
            f"Hacen falta {margen:,.2f} y sólo quedan {libre:,.2f} libres "
            f"(balance {balance(estado):,.2f} menos el margen ya retenido).",
        ))

    # Riesgo por operación, en dinero y en porcentaje del balance.
    if intencion.stop_loss is not None:
        riesgo = abs(entrada - intencion.stop_loss) * intencion.cantidad
        bal = balance(estado)
        riesgo_pct = (riesgo / bal * 100.0) if bal > 0 else None
        if riesgo_pct is not None and riesgo_pct > p.riesgo_max_pct:
            fallos.append(Rechazo(
                "RIESGO_EXCESIVO",
                f"Arriesga {riesgo:,.2f} ({riesgo_pct:.2f} % del balance) y el máximo "
                f"configurado es {p.riesgo_max_pct:.2f} %.",
            ))
    else:
        # No bloquea: operar sin stop es legítimo y es decisión de quien opera.
        # Pero se dice, porque sin stop no hay tamaño por riesgo ni R/B.
        fallos.append(Rechazo(
            "SIN_STOP",
            "Sin stop loss no hay riesgo acotado: la pérdida máxima es todo el nocional.",
            bloquea=False,
        ))

    # Relación riesgo/beneficio. Advertencia, no norma.
    rb = riesgo_beneficio(entrada, intencion.stop_loss, intencion.take_profit)
    if rb is not None and rb < p.rb_minimo:
        fallos.append(Rechazo(
            "RB_BAJO",
            f"El objetivo está más cerca que el stop (R/B {rb:.2f}). La operación "
            f"necesita acertar más veces de las que fallará para no perder.",
            bloquea=False,
        ))

    if len(estado.abiertas()) >= p.max_posiciones:
        fallos.append(Rechazo(
            "MAX_POSICIONES",
            f"Ya hay {len(estado.abiertas())} posiciones abiertas y el máximo es "
            f"{p.max_posiciones}.",
        ))

    # Una posición abierta por símbolo y dirección. Dos LONG de PBF a la vez no
    # son una estrategia, son un doble clic.
    ya = [
        pos for pos in estado.abiertas(intencion.simbolo)
        if pos.direccion == intencion.direccion
    ]
    if ya:
        fallos.append(Rechazo(
            "YA_ABIERTA",
            f"Ya hay una posición {intencion.direccion.upper()} abierta en "
            f"{intencion.simbolo} ({ya[0].id}).",
        ))

    return fallos


def riesgo_beneficio(
    entrada: float, stop: Optional[float], objetivo: Optional[float]
) -> Optional[float]:
    """Recorrido al objetivo entre recorrido al stop. `None` si falta alguno."""
    if stop is None or objetivo is None:
        return None
    riesgo = abs(entrada - stop)
    if riesgo <= 0:
        return None
    return abs(objetivo - entrada) / riesgo


def bloquean(fallos: List[Rechazo]) -> List[Rechazo]:
    return [f for f in fallos if f.bloquea]


# ==============================================================================
# Cuenta
# ==============================================================================

def balance(estado: Estado) -> float:
    """
    Capital realizado. **Sólo** posiciones cerradas.

    Abrir una posición no lo mueve. Es la mitad de la distinción balance/equity
    y hay prueba que lo fija.
    """
    return estado.capital_inicial + sum(
        (p.resultado or 0.0) for p in estado.cerradas()
    )


def margen_retenido(estado: Estado) -> float:
    return sum(p.margen for p in estado.abiertas())


def capital_libre(estado: Estado) -> float:
    return balance(estado) - margen_retenido(estado)


def equity(estado: Estado, precios: Dict[str, float], ts: Optional[int] = None) -> float:
    """Balance más el resultado latente de lo que sigue abierto."""
    total = balance(estado)
    for pos in estado.abiertas():
        precio = precios.get(pos.simbolo, pos.ultimo_precio or pos.entrada)
        total += resultado_latente(pos, precio, estado.params, ts)["neto"] or 0.0
    return total


def metricas(estado: Estado, precios: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """
    El resumen de la cuenta. Todo sale de las posiciones cerradas y de la
    curva de patrimonio; nada suelto y nada estimado por otro camino.
    """
    precios = precios or {}
    cerradas = estado.cerradas()
    resultados = [p.resultado or 0.0 for p in cerradas]
    ganadoras = [r for r in resultados if r > 0]
    perdedoras = [r for r in resultados if r < 0]

    bruto_gana = sum(ganadoras)
    bruto_pierde = abs(sum(perdedoras))

    bal = balance(estado)
    eq = equity(estado, precios, estado.ultimo_ts)

    # Drawdown sobre la CURVA DE PATRIMONIO, no sobre operaciones. Promediar
    # caídas ocurridas en fechas distintas no da un drawdown: ese error ya se
    # cometió en /portfolio y tiene su propia contraprueba.
    dd_max = 0.0
    pico = estado.capital_inicial
    for punto in estado.curva:
        patrimonio = punto.get("equity", pico)
        pico = max(pico, patrimonio)
        if pico > 0:
            dd_max = min(dd_max, (patrimonio - pico) / pico * 100.0)

    # P&L del día: lo cerrado desde el último cambio de fecha registrado.
    pnl_dia = 0.0
    if estado.ultimo_ts is not None:
        dia = estado.ultimo_ts - (estado.ultimo_ts % 86400)
        pnl_dia = sum(
            (p.resultado or 0.0) for p in cerradas
            if p.cerrada_ts is not None and p.cerrada_ts >= dia
        )

    n = len(cerradas)
    return {
        "capital_inicial": round(estado.capital_inicial, 2),
        "balance": round(bal, 2),
        "equity": round(eq, 2),
        "libre": round(capital_libre(estado), 2),
        "margen_retenido": round(margen_retenido(estado), 2),
        "pnl_total": round(bal - estado.capital_inicial, 2),
        "pnl_total_pct": round(
            (bal - estado.capital_inicial) / estado.capital_inicial * 100.0, 3
        ) if estado.capital_inicial else None,
        "pnl_abierto": round(eq - bal, 2),
        "pnl_dia": round(pnl_dia, 2),
        "operaciones": n,
        "ganadoras": len(ganadoras),
        "perdedoras": len(perdedoras),
        # Win rate SOLO sobre posiciones cerradas. Las órdenes canceladas no
        # entran: nunca hubo operación que ganar o perder.
        "win_rate": round(len(ganadoras) / n * 100.0, 2) if n else None,
        "profit_factor": (
            round(bruto_gana / bruto_pierde, 3) if bruto_pierde > 0
            else (None if not ganadoras else float("inf"))
        ),
        "expectativa": round(sum(resultados) / n, 2) if n else None,
        "beneficio_bruto": round(bruto_gana, 2),
        "perdida_bruta": round(bruto_pierde, 2),
        "mejor": round(max(resultados), 2) if resultados else None,
        "peor": round(min(resultados), 2) if resultados else None,
        "drawdown_max_pct": round(dd_max, 3),
        "abiertas": len(estado.abiertas()),
        "pendientes": len(estado.pendientes()),
    }


# ==============================================================================
# Gestor de órdenes
# ==============================================================================

def crear_orden(
    estado: Estado,
    intencion: Intencion,
    orden_id: str,
    ts: int,
    decision_id: Optional[str] = None,
) -> Tuple[Orden, List[Rechazo]]:
    """
    Convierte una intención en orden, o en un rechazo con su motivo escrito.

    Una orden rechazada SE GUARDA con estado REJECTED. Es deliberado: un
    rechazo que desaparece no se puede auditar, y la pregunta «¿por qué no
    entró?» es tan legítima como «¿por qué entró?».
    """
    fallos = validar(estado, intencion)
    duros = bloquean(fallos)

    orden = Orden(
        id=orden_id,
        simbolo=intencion.simbolo,
        direccion=intencion.direccion,
        tipo=intencion.tipo,
        cantidad=float(intencion.cantidad),
        precio_limite=intencion.precio_limite,
        stop_loss=intencion.stop_loss,
        take_profit=intencion.take_profit,
        apalancamiento=intencion.apalancamiento or estado.params.apalancamiento,
        creada_ts=ts,
        origen=intencion.origen,
        signal_id=intencion.signal_id,
        decision_id=decision_id,
    )

    if duros:
        orden.estado = "REJECTED"
        orden.resuelta_ts = ts
        orden.motivo = " · ".join(f.mensaje for f in duros)

    estado.ordenes.append(orden)
    return orden, fallos


def enviar(
    estado: Estado,
    intencion: Intencion,
    orden_id: str,
    posicion_id: str,
    ts: int,
    precio_mercado: Optional[float] = None,
    decision_id: Optional[str] = None,
) -> Tuple[Orden, Optional[Posicion], List[Rechazo], List[Evento]]:
    """
    El camino completo de una intención, con la separación orden/posición
    intacta:

      · MARKET aceptado → orden PENDING→FILLED y posición OPEN, en este mismo
        instante. La orden se guarda igual, para que el historial conteste
        «¿qué pedí?» además de «¿qué pasó?».
      · LIMIT aceptado  → orden PENDING. **No hay posición todavía**, y eso es
        lo importante: no existe hasta que el precio la cree.
      · Rechazado       → orden REJECTED con su motivo. Nunca hay posición.
    """
    orden, fallos = crear_orden(estado, intencion, orden_id, ts, decision_id)
    if orden.estado == "REJECTED":
        return orden, None, fallos, [Evento(
            "ORDEN_RECHAZADA", ts, orden.motivo or "Rechazada", orden_id=orden.id,
        )]

    if orden.tipo == "MARKET":
        precio = precio_mercado if precio_mercado is not None else intencion.precio_referencia
        posicion, evento = abrir_posicion(estado, orden, precio, posicion_id, ts)
        return orden, posicion, fallos, [evento]

    return orden, None, fallos, [Evento(
        "ORDEN_CREADA", ts,
        f"{orden.id} {orden.direccion.upper()} LIMIT {orden.precio_limite:,.4f} "
        f"pendiente. No hay posición hasta que el precio la alcance.",
        orden_id=orden.id,
    )]


def cancelar_orden(estado: Estado, orden_id: str, ts: int) -> Optional[Evento]:
    """Cancelar una PENDING. Sobre cualquier otro estado no hace nada."""
    orden = estado.orden(orden_id)
    if orden is None or not orden.viva:
        return None
    orden.estado = "CANCELLED"
    orden.resuelta_ts = ts
    orden.motivo = "Cancelada por el usuario"
    return Evento(
        "ORDEN_CANCELADA", ts,
        f"{orden.id} cancelada antes de ejecutarse. No hubo posición.",
        orden_id=orden.id,
    )


def precio_de_ejecucion_limit(orden: Orden, barra: Barra) -> Optional[float]:
    """
    ¿Esta barra ejecuta el LIMIT? Y si lo hace, ¿a qué precio?

    El detalle que casi siempre está mal: si la barra ABRE atravesando el
    límite, no se rellena al límite — se rellena en la apertura, que es MEJOR
    precio. Comprar limitado a 14,00 en una barra que abre a 13,80 da 13,80.

    Rellenar siempre al límite regala el hueco favorable, y ese sesgo no se ve
    en ninguna pantalla: la operación sale igual de plausible. Hay prueba.
    """
    limite = orden.precio_limite
    if limite is None:
        return None

    if orden.direccion == "long":
        # Compra limitada: se ejecuta si el precio BAJA hasta el límite.
        if barra.apertura <= limite:
            return barra.apertura
        if barra.bajo <= limite:
            return limite
        return None

    # Venta en corto limitada: se ejecuta si el precio SUBE hasta el límite.
    if barra.apertura >= limite:
        return barra.apertura
    if barra.alto >= limite:
        return limite
    return None


# ==============================================================================
# Gestor de posiciones
# ==============================================================================

def abrir_posicion(
    estado: Estado, orden: Orden, precio_bruto: float, posicion_id: str, ts: int
) -> Tuple[Posicion, Evento]:
    """Ejecuta la orden y crea la posición. Aquí es donde nace la consecuencia."""
    p = estado.params
    precio = precio_con_deslizamiento(precio_bruto, orden.direccion, True, p.deslizamiento_pct)
    nocional = precio * orden.cantidad
    comision = comision_de(nocional, p.comision_pct)
    apal = orden.apalancamiento or p.apalancamiento

    posicion = Posicion(
        id=posicion_id,
        simbolo=orden.simbolo,
        direccion=orden.direccion,
        cantidad=orden.cantidad,
        entrada=precio,
        abierta_ts=ts,
        stop_loss=orden.stop_loss,
        take_profit=orden.take_profit,
        apalancamiento=apal,
        margen=nocional / apal,
        comision_entrada=comision,
        orden_apertura_id=orden.id,
        decision_id=orden.decision_id,
        origen=orden.origen,
        ultimo_precio=precio,
        ultimo_ts=ts,
    )

    orden.estado = "FILLED"
    orden.resuelta_ts = ts
    orden.precio_ejecucion = precio
    orden.comision = comision
    orden.posicion_id = posicion.id

    estado.posiciones.append(posicion)
    evento = Evento(
        "ORDEN_EJECUTADA", ts,
        f"{orden.id} ejecutada a {precio:,.4f} → {posicion.id} "
        f"{posicion.direccion.upper()} {posicion.cantidad:g} {posicion.simbolo}",
        orden_id=orden.id, posicion_id=posicion.id,
        datos={"precio": precio, "comision": comision},
    )
    return posicion, evento


def cerrar_posicion(
    estado: Estado, posicion: Posicion, precio_bruto: float, motivo: str, ts: int
) -> Optional[Evento]:
    """
    Cierra y realiza el resultado. Sobre una posición ya cerrada NO hace nada:
    un doble clic con la red lenta no puede contar el beneficio dos veces.
    """
    if not posicion.abierta:
        return None
    if motivo not in MOTIVOS_CIERRE:
        raise ValueError(f"Motivo de cierre desconocido: {motivo!r}")

    p = estado.params
    # Un stop o un objetivo se ejecutan EN SU PRECIO, no con deslizamiento
    # añadido sobre él, porque el nivel es el disparador; el deslizamiento
    # sigue aplicándose sobre lo que se consigue al cruzar.
    precio = precio_con_deslizamiento(precio_bruto, posicion.direccion, False, p.deslizamiento_pct)

    bruto = pnl_bruto(posicion.direccion, posicion.entrada, precio, posicion.cantidad)
    comision_salida = comision_de(precio * posicion.cantidad, p.comision_pct)
    prestamo = coste_prestamo(posicion, ts, p.coste_prestamo_anual_pct)

    posicion.estado = "CLOSED"
    posicion.cerrada_ts = ts
    posicion.salida = precio
    posicion.motivo_cierre = motivo
    posicion.comision_salida = comision_salida
    posicion.coste_prestamo = prestamo
    posicion.resultado = bruto - posicion.comision_entrada - comision_salida - prestamo
    posicion.ultimo_precio = precio
    posicion.ultimo_ts = ts

    return Evento(
        "POSICION_CERRADA", ts,
        f"{posicion.id} cerrada a {precio:,.4f} por {motivo}. "
        f"Resultado {posicion.resultado:+,.2f}.",
        posicion_id=posicion.id,
        datos={"precio": precio, "motivo": motivo, "resultado": posicion.resultado},
    )


def evaluar_salida(posicion: Posicion, barra: Barra) -> Optional[Tuple[str, float]]:
    """
    ¿Esta barra cierra la posición? Devuelve `(motivo, precio)` o `None`.

    **La regla que sostiene la honestidad del motor:** si la barra toca el stop
    Y el objetivo, gana el STOP. Con barras no se conoce el orden de dentro, y
    suponer el objetivo es la forma más silenciosa de inflar una simulación.
    Hay contraprueba: la versión ingenua da un resultado distinto y mejor sobre
    exactamente el mismo dato.
    """
    sl, tp = posicion.stop_loss, posicion.take_profit

    if posicion.direccion == "long":
        toca_stop = sl is not None and barra.bajo <= sl
        toca_obj = tp is not None and barra.alto >= tp
    else:
        toca_stop = sl is not None and barra.alto >= sl
        toca_obj = tp is not None and barra.bajo <= tp

    if toca_stop:
        return ("STOP_LOSS", float(sl))
    if toca_obj:
        return ("TAKE_PROFIT", float(tp))
    return None


def nivel_liquidacion(posicion: Posicion) -> Optional[float]:
    """
    El precio al que la pérdida latente se come el margen entero.

    Con apalancamiento 1,0 un largo sólo se liquidaría en cero, que es
    inalcanzable en la práctica; un corto sí puede (el precio se dobla). Se
    calcula sobre el bruto, sin costes: el nivel que importa es el del
    principal.
    """
    if posicion.cantidad <= 0:
        return None
    margen = posicion.margen or posicion.nocional
    delta = margen / posicion.cantidad
    return posicion.entrada - delta if posicion.direccion == "long" else posicion.entrada + delta


# ==============================================================================
# Motor
# ==============================================================================

def marcar_a_mercado(estado: Estado, precios: Dict[str, float], ts: int) -> None:
    """Fija el último precio conocido en cada posición abierta."""
    for pos in estado.abiertas():
        # Una barra vieja no puede reescribir el «precio actual» de una
        # posición abierta después de ella: la tarjeta enseñaría un P&L de
        # otra época sin avisar.
        if pos.ultimo_ts is not None and ts < pos.ultimo_ts:
            continue
        precio = precios.get(pos.simbolo)
        if precio is not None and precio > 0:
            pos.ultimo_precio = float(precio)
            pos.ultimo_ts = ts


def anotar_curva(estado: Estado, precios: Dict[str, float], ts: int) -> None:
    """
    Una instantánea de patrimonio. De aquí sale el drawdown y sólo de aquí.

    No se anota dos veces el mismo instante: la curva es una serie temporal, y
    dos puntos con la misma marca son una serie rota.
    """
    if estado.curva and estado.curva[-1].get("ts") == ts:
        estado.curva[-1]["equity"] = round(equity(estado, precios, ts), 2)
        return
    estado.curva.append({
        "ts": ts,
        "equity": round(equity(estado, precios, ts), 2),
        "balance": round(balance(estado), 2),
        "abiertas": len(estado.abiertas()),
    })


def aplicar_barra(estado: Estado, simbolo: str, barra: Barra) -> List[Evento]:
    """
    Avanza el motor una barra. Es el corazón del simulador.

    **El orden importa y no es arbitrario:**

      1. Caducar lo caducado.
      2. Ejecutar los LIMIT que esta barra alcanza.
      3. Gestionar las posiciones abiertas con el RANGO de esta barra.
      4. Liquidar lo que se haya quedado sin margen.
      5. Marcar a mercado y anotar patrimonio.

    Una posición abierta EN esta barra se evalúa ya con esta misma barra: es lo
    que hace un mercado de verdad, donde una orden puede entrar y saltar el
    stop en la misma sesión. Lo que NO se hace es decidir una entrada nueva con
    el cierre de la barra y ejecutarla en ella — eso lo impide el flujo del
    robot, que decide con la barra cerrada y ejecuta en la siguiente.
    """
    eventos: List[Evento] = []
    ts = barra.ts
    p = estado.params

    # ── 0. Nada se evalúa contra una barra ANTERIOR a su propio nacimiento ──
    #
    # Lo cazó una prueba de extremo a extremo, no una de escritorio: al abrir
    # una cuenta nueva el relleno traía seis meses de velas y cerraba por
    # objetivo una posición abierta hace treinta segundos, con el precio de
    # hace cuatro meses. El resultado era perfectamente plausible —un
    # +386,29 con su motivo TAKE_PROFIT— y no había nada en pantalla que lo
    # delatara.
    #
    # La guardia va AQUÍ y no en quien rellena porque el motor no puede
    # confiar en que le den las barras correctas: es su propio invariante.
    def _ya_existia(nacimiento: int) -> bool:
        return nacimiento <= ts

    # ── 1. Caducidad ──────────────────────────────────────────────────────
    for orden in estado.pendientes(simbolo):
        if orden.caduca_ts is not None and ts >= orden.caduca_ts:
            orden.estado = "EXPIRED"
            orden.resuelta_ts = ts
            orden.motivo = "Caducada sin alcanzar el precio"
            eventos.append(Evento(
                "ORDEN_CADUCADA", ts,
                f"{orden.id} caducó sin ejecutarse.", orden_id=orden.id,
            ))

    # ── 2. LIMIT alcanzados ───────────────────────────────────────────────
    for orden in list(estado.pendientes(simbolo)):
        if orden.tipo != "LIMIT" or not _ya_existia(orden.creada_ts):
            continue
        precio = precio_de_ejecucion_limit(orden, barra)
        if precio is None:
            continue
        # Se revalida el margen: entre crear la orden y ejecutarla puede haber
        # entrado otra posición. Ejecutar sin margen sería inventar dinero.
        nocional = precio * orden.cantidad
        margen = nocional / (orden.apalancamiento or 1.0)
        if margen > capital_libre(estado) + 1e-9:
            orden.estado = "REJECTED"
            orden.resuelta_ts = ts
            orden.motivo = (
                f"Alcanzó el precio pero ya no había margen: hacían falta "
                f"{margen:,.2f} y quedaban {capital_libre(estado):,.2f}."
            )
            eventos.append(Evento(
                "ORDEN_RECHAZADA", ts, orden.motivo, orden_id=orden.id,
            ))
            continue
        _, evento = abrir_posicion(estado, orden, precio, _id_temporal(estado, "SIM"), ts)
        eventos.append(evento)

    # ── 3. Stops y objetivos con el rango de ESTA barra ───────────────────
    for pos in list(estado.abiertas(simbolo)):
        if not _ya_existia(pos.abierta_ts):
            continue
        salida = evaluar_salida(pos, barra)
        if salida is None:
            continue
        motivo, precio = salida
        evento = cerrar_posicion(estado, pos, precio, motivo, ts)
        if evento:
            if motivo == "STOP_LOSS" and pos.take_profit is not None:
                tp_tocado = (
                    barra.alto >= pos.take_profit if pos.direccion == "long"
                    else barra.bajo <= pos.take_profit
                )
                if tp_tocado:
                    evento.detalle += (
                        " La barra tocó también el objetivo: no se sabe cuál llegó "
                        "primero, así que se asume el stop."
                    )
                    evento.datos["ambos_tocados"] = True
            eventos.append(evento)

    # ── 4. Liquidación por margen ─────────────────────────────────────────
    if p.apalancamiento > 1.0 or any(pos.apalancamiento > 1.0 for pos in estado.abiertas(simbolo)):
        for pos in list(estado.abiertas(simbolo)):
            if not _ya_existia(pos.abierta_ts):
                continue
            nivel = nivel_liquidacion(pos)
            if nivel is None:
                continue
            alcanzado = barra.bajo <= nivel if pos.direccion == "long" else barra.alto >= nivel
            if alcanzado:
                evento = cerrar_posicion(estado, pos, nivel, "LIQUIDACION", ts)
                if evento:
                    evento.detalle += (
                        f" La pérdida latente alcanzó el margen retenido "
                        f"({pos.margen:,.2f}) con apalancamiento {pos.apalancamiento:g}×."
                    )
                    eventos.append(evento)

    # ── 5. Cierre de la barra ─────────────────────────────────────────────
    precios = {simbolo: barra.cierre}
    marcar_a_mercado(estado, precios, ts)
    estado.ultimo_ts = ts
    anotar_curva(estado, _precios_vigentes(estado, precios), ts)
    return eventos


def aplicar_precio(estado: Estado, simbolo: str, precio: float, ts: int) -> List[Evento]:
    """
    Un tick suelto, sin barra: sólo marca a mercado.

    **No dispara stops ni objetivos a propósito.** Un precio suelto no dice por
    dónde ha pasado el mercado entre dos consultas: usarlo para cerrar
    convertiría el resultado en función de cuándo alguien abrió la pestaña. Los
    cierres se deciden recorriendo BARRAS, en `aplicar_barra`.
    """
    marcar_a_mercado(estado, {simbolo: precio}, ts)
    estado.ultimo_ts = ts
    anotar_curva(estado, _precios_vigentes(estado, {simbolo: precio}), ts)
    return []


def cerrar_a_mano(
    estado: Estado, posicion_id: str, precio: float, ts: int,
    motivo: str = "MANUAL_CLOSE",
) -> Optional[Evento]:
    """Cierre pedido por el usuario, o por la estrategia al invertirse."""
    pos = estado.posicion(posicion_id)
    if pos is None:
        return None
    return cerrar_posicion(estado, pos, precio, motivo, ts)


def cerrar_todo(
    estado: Estado, precios: Dict[str, float], ts: int, motivo: str = "END_OF_SESSION"
) -> List[Evento]:
    """
    Cierra todo lo abierto. Se usa al reiniciar la cuenta y para END_OF_SESSION.

    END_OF_SESSION está APAGADO por defecto en el producto: cerrar al cierre no
    es una regla universal, es una elección, y cerrarlo solo cambiaría el
    resultado de toda estrategia de varios días sin que nadie lo haya pedido.
    """
    eventos: List[Evento] = []
    for pos in list(estado.abiertas()):
        precio = precios.get(pos.simbolo, pos.ultimo_precio or pos.entrada)
        evento = cerrar_posicion(estado, pos, precio, motivo, ts)
        if evento:
            eventos.append(evento)
    return eventos


def _precios_vigentes(estado: Estado, nuevos: Dict[str, float]) -> Dict[str, float]:
    """El último precio conocido de cada símbolo abierto, pisado por los nuevos."""
    precios = {
        pos.simbolo: (pos.ultimo_precio or pos.entrada)
        for pos in estado.abiertas()
    }
    precios.update({k: v for k, v in nuevos.items() if v})
    return precios


def _id_temporal(estado: Estado, prefijo: str) -> str:
    """
    Identificador de emergencia para cuando el motor abre una posición por su
    cuenta (un LIMIT alcanzado dentro de `aplicar_barra`) y no hay contador de
    Mongo a mano.

    El formato definitivo —`SIM-2026-0001`— lo pone la capa de persistencia,
    que es la única que puede incrementar un contador de forma atómica. Aquí se
    usa un correlativo sobre lo que ya existe, que basta para que el motor sea
    consistente consigo mismo y para las pruebas.
    """
    n = len(estado.posiciones) + 1
    return f"{prefijo}-{n:06d}"


# ==============================================================================
# Serialización
# ==============================================================================

def a_dict(estado: Estado) -> Dict[str, Any]:
    return {
        "capital_inicial": estado.capital_inicial,
        "params": asdict(estado.params),
        "ordenes": [asdict(o) for o in estado.ordenes],
        "posiciones": [asdict(p) for p in estado.posiciones],
        "curva": list(estado.curva),
        "ultimo_ts": estado.ultimo_ts,
    }


def de_dict(bruto: Dict[str, Any]) -> Estado:
    """
    Reconstruye el estado. Hay prueba de ida y vuelta: el equity antes y
    después de serializar tiene que ser el mismo número.
    """
    campos_params = {f for f in Parametros.__dataclass_fields__}
    params = Parametros(**{
        k: v for k, v in (bruto.get("params") or {}).items() if k in campos_params
    })
    campos_orden = set(Orden.__dataclass_fields__)
    campos_pos = set(Posicion.__dataclass_fields__)
    return Estado(
        capital_inicial=float(bruto.get("capital_inicial", 0.0)),
        params=params,
        ordenes=[
            Orden(**{k: v for k, v in o.items() if k in campos_orden})
            for o in bruto.get("ordenes", [])
        ],
        posiciones=[
            Posicion(**{k: v for k, v in p.items() if k in campos_pos})
            for p in bruto.get("posiciones", [])
        ],
        curva=list(bruto.get("curva") or []),
        ultimo_ts=bruto.get("ultimo_ts"),
    )


def tarjeta(posicion: Posicion, precio: float, params: Parametros,
            ts: Optional[int] = None) -> Dict[str, Any]:
    """
    Lo que la tarjeta de operación enseña, calculado AQUÍ y no en el `.tsx`.

    La regla de arquitectura del producto: la lógica de trading no vive en los
    componentes visuales. El componente pinta cifras; no las deduce.
    """
    r = resultado_latente(posicion, precio, params, ts)
    sl, tp = posicion.stop_loss, posicion.take_profit

    def distancia(nivel: Optional[float]) -> Optional[Dict[str, float]]:
        if nivel is None or not precio:
            return None
        return {
            "precio": nivel,
            "absoluta": abs(precio - nivel),
            "pct": abs(precio - nivel) / precio * 100.0,
        }

    return {
        "id": posicion.id,
        "simbolo": posicion.simbolo,
        "direccion": posicion.direccion,
        "estado": posicion.estado,
        "cantidad": posicion.cantidad,
        "entrada": posicion.entrada,
        "precio_actual": precio,
        "valor_posicion": precio * posicion.cantidad,
        "nocional_entrada": posicion.nocional,
        "margen": posicion.margen,
        "apalancamiento": posicion.apalancamiento,
        "stop_loss": sl,
        "take_profit": tp,
        "distancia_stop": distancia(sl),
        "distancia_objetivo": distancia(tp),
        "pnl": round(r["neto"], 4) if r["neto"] is not None else None,
        "pnl_bruto": round(r["bruto"], 4) if r["bruto"] is not None else None,
        "pnl_pct_precio": round(r["pct_precio"], 4) if r["pct_precio"] is not None else None,
        "pnl_pct_capital": round(r["pct_capital"], 4) if r["pct_capital"] is not None else None,
        "coste_prestamo": round(r["coste_prestamo"], 4),
        "comisiones": round(posicion.comision_entrada + (r["comision_salida_estimada"] or 0.0), 4),
        "riesgo_abierto": (
            abs(posicion.entrada - sl) * posicion.cantidad if sl is not None else None
        ),
        "riesgo_beneficio": riesgo_beneficio(posicion.entrada, sl, tp),
        "nivel_liquidacion": nivel_liquidacion(posicion) if posicion.apalancamiento > 1 else None,
        "abierta_ts": posicion.abierta_ts,
        "cerrada_ts": posicion.cerrada_ts,
        "segundos_abierta": (
            ((ts if ts is not None else posicion.ultimo_ts or posicion.abierta_ts)
             - posicion.abierta_ts)
            if posicion.abierta else
            ((posicion.cerrada_ts or posicion.abierta_ts) - posicion.abierta_ts)
        ),
        "salida": posicion.salida,
        "motivo_cierre": posicion.motivo_cierre,
        "resultado": posicion.resultado,
        "origen": posicion.origen,
        "orden_apertura_id": posicion.orden_apertura_id,
        "decision_id": posicion.decision_id,
    }
